// ============================================================
// 칸 글자 상한 — 칸에 넣을 글자 수와 그 글자가 말줄임을 지켜 주는 폭 / Cell text limit
// 한 줄 말줄임 칸에 아주 긴 글을 통째로 넣으면, 화면에는 앞부분만 보여도 브라우저는 보이지 않는 글자까지
// 끝까지 폭을 잰다. 그래서 「칸 폭에 보일 수 있는 최대 글자 수 + 여유」만 넣는다.
// 이 객체는 글자 폭을 재지 않는다. 글꼴 크기·줄 높이·여백·칸 폭 같은 숫자만 받아,
// 「가장 좁은 글자(최소 글자 폭 = 글꼴 크기 × 비율)로 채워도 칸을 넘치는 글자 수」를 상한으로 낸다.
// 그러면 실제 글자가 그보다 넓은 한, 잘린 글도 칸을 넘쳐 말줄임 자리와 보이는 글자가 전문을 넣었을 때와 같다.
// 넓힐 때마다 다시 채우지 않도록 덮는 폭에 여유(기본 2배)를 둔다.
//
// Caps how many characters go into a cell. The browser measures every character of an
// ellipsized one-line cell, visible or not, so only enough text to overflow the cell is inserted.
// No measuring here: from font size, line height, padding and widths it computes how many
// characters of the narrowest plausible glyph (font size × ratio) still overflow the covered width.
// As long as real glyphs are wider, the cut text overflows too and looks identical. Headroom
// (2× by default) keeps widening from refilling on every step.
// ============================================================
import type { ICellTextPolicy, TextSpec } from './geometryPorts.js';

export interface CellTextPolicyOptions {
  /** 최소 글자 폭을 글꼴 크기의 몇 배로 볼지(기본 0.2). / Narrowest glyph as a fraction of font size. */
  minGlyphEm?: number;
  /** 덮는 폭을 컬럼 안쪽 폭의 몇 배로 잡을지(기본 2). / Covered width as a multiple of the inner width. */
  headroom?: number;
  /** 한 줄 몫에 더하는 글자 수(기본 16). / Extra characters per line. */
  slack?: number;
}

/**
 * 폭이 없거나 아주 좁게 그려질 수 있는 글자: 결합 부호, 서식 문자(영폭 공백·ZWJ·방향 제어·태그·BOM 등),
 * 조합형 한글의 채움·중성·종성, 이모지 피부색 수식. 이런 글자가 자를 자리 앞에 있으면 「최소 글자 폭」 가정이
 * 깨지므로 자르지 않는다. 변이 선택자는 결합 부호(Mn)에 들어 있다.
 *
 * Characters that may render with no width: combining marks, format characters (zero-width
 * space, joiners, bidi controls, tags, BOM), conjoining Hangul filler/vowel/final jamo, emoji
 * skin-tone modifiers. Variation selectors are combining marks (Mn).
 */
const ZERO_WIDTH_RE = /[\p{M}\p{Cf}ᅟ-ᇿힰ-퟿\u{1F3FB}-\u{1F3FF}]/u;

/**
 * 칸에 넣을 글자 수 상한과 그 상한이 덮는 폭을 정하고 안전하게 자르는 유일한 곳. 상태가 없다.
 * 불변: 결과는 원문의 앞부분 · 서로게이트 쌍·결합 문자를 가르지 않음 · 폭 없는 글자가 자를 자리 앞에 있으면 전문.
 *
 * Sole owner of the per-cell character limit, the width it covers, and safe truncation. Stateless.
 */
export class CellTextPolicy implements ICellTextPolicy {
  private readonly _em: number;
  private readonly _headroom: number;
  private readonly _slack: number;

  constructor(opts?: CellTextPolicyOptions) {
    this._em = opts?.minGlyphEm ?? 0.2;
    this._headroom = opts?.headroom ?? 2;
    this._slack = opts?.slack ?? 16;
  }

  /**
   * 상한(글자 수). 자르지 않아야 할 때(상한 끔·자동 높이·템플릿, 보이는 폭 모름, 글꼴 지표가 이상함)는 Infinity.
   * 한 줄: ceil(max(안쪽 폭 × 여유, 보이는 폭) / g) + slack.
   * 여러 줄(행 높이 고정 + 줄바꿈): 줄 수 × (ceil(안쪽 폭 × 여유 / g) + slack).
   *
   * Infinity when the text must not be cut (unlimited, unknown viewport width, bad metrics).
   */
  limit(spec: TextSpec): number {
    if (spec.unlimited || !(spec.viewportWidth > 0)) return Infinity;
    const g = this._glyph(spec);
    if (!(g > 0)) return Infinity;
    const wrapH = spec.wrapRowHeight;
    if (wrapH === null) {
      const covered = Math.max(this._inner(spec) * this._headroom, spec.viewportWidth);
      return Math.ceil(covered / g) + this._slack;
    }
    const lines = this._lines(spec, wrapH);
    if (!Number.isFinite(lines)) return Infinity;
    return lines * this._perLine(spec, g);
  }

  /**
   * 이 상한으로 채운 칸이 말줄임을 지키는 최대 컬럼 폭 — 컬럼이 이보다 넓어지면 다시 채운다.
   * 한 줄: (limit − slack) × g + 좌우 여백. 여러 줄: 줄당 글자 수(limit ÷ 줄 수)로 같은 식.
   *
   * Widest column for which this limit still overflows; widen past it and the cell is refilled.
   */
  coverWidth(limit: number, spec: TextSpec): number {
    if (!Number.isFinite(limit)) return Infinity;
    const g = this._glyph(spec);
    if (!(g > 0)) return Infinity;
    const wrapH = spec.wrapRowHeight;
    const perLine = wrapH === null ? limit : limit / this._lines(spec, wrapH);
    return (perLine - this._slack) * g + spec.metrics.padX;
  }

  /**
   * 앞부분 limit 자로 자른다. 자를 자리가 서로게이트 쌍 가운데면 한 자 더 넣는다(길이 ≤ limit + 1).
   * 자를 자리까지(그 바로 뒤 한 자 포함)에 폭 없는 글자가 있으면 전문을 돌려준다 — 결합 문자를 가르지 않는 것도 이 규칙이 맡는다.
   * 짧은 글·Infinity 는 그대로라 새 문자열을 만들지 않는다.
   *
   * Keeps the first `limit` code units, extending by one to keep a surrogate pair whole. Returns the
   * whole text when a zero-width character sits at or before the cut (this also keeps combining sequences intact).
   */
  fit(text: string, limit: number): string {
    if (!(text.length > limit)) return text;
    let cut = Math.max(1, Math.floor(limit));
    if (cut >= text.length) return text;
    const c = text.charCodeAt(cut - 1);
    if (c >= 0xd800 && c <= 0xdbff) cut++;
    // [0, cut + 1) 을 본다 — 자른 뒤 첫 글자가 결합 부호면 그 앞 글자와 갈라지기 때문.
    if (ZERO_WIDTH_RE.test(text.slice(0, cut + 1))) return text;
    return cut >= text.length ? text : text.slice(0, cut);
  }

  /** 최소 글자 폭 px. / Narrowest glyph width in px. */
  private _glyph(spec: TextSpec): number {
    return this._em * spec.metrics.fontPx;
  }

  /** 컬럼 안쪽 폭(여백을 뺀 값, 0 아래로 안 감). / Inner column width, never negative. */
  private _inner(spec: TextSpec): number {
    return Math.max(0, spec.columnWidth - spec.metrics.padX);
  }

  /** 여러 줄 칸 한 줄 몫 글자 수. / Characters per line of a wrapped cell. */
  private _perLine(spec: TextSpec, g: number): number {
    return Math.ceil((this._inner(spec) * this._headroom) / g) + this._slack;
  }

  /**
   * 넣을 줄 수 = 보이는 줄 수(올림) + 1. 행이 한 줄보다 낮아도 2 줄 아래로 안 내린다(첫 줄을 늘 채움).
   * 줄 높이가 이상하면(0·NaN) Infinity.
   *
   * Visible lines rounded up plus one, never below two. Infinity for a bad line height.
   */
  private _lines(spec: TextSpec, wrapH: number): number {
    const lh = spec.metrics.lineHeightPx;
    if (!(lh > 0)) return Infinity;
    return Math.max(1, Math.ceil((wrapH - spec.metrics.padY) / lh)) + 1;
  }
}
