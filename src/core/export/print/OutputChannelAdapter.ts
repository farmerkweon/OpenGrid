// ============================================================
// DD-15 §2.6 인쇄 출력 채널 어댑터 — 색→흑백·솔리드선·말줄임확장·색+형태 이중부호화(REQ-T9-845)
// / DD-15 §2.6 print output-channel adapter — color→mono, solid lines, truncation expand, dual encoding.
// ------------------------------------------------------------
// @media print 산발 규칙이 아니라 '어댑터가 소유'. 다크테마 화면이어도 인쇄 채널은 라이트 잉크·솔리드선·
// 흑백 이중부호를 강제. cf(DD-05 VisualSpec)는 소비만: screen 은 상류 cf.inkColor 통과, grayscale/
// forced-colors 는 palette.ts 대비 커널(contrastRatio) 재사용해 잉크 산정(대비 수식 재구현 0, §R.2·2.k).
// 순수·헤드리스.
// ============================================================

import { contrastRatio, parseColor, relativeLuminance } from '../../chart/palette.js';
import type { VisualSpec } from '../../cf/encoders.js';
import type { CellArtifact } from '../types.js';
import type { Sign } from '../../format/types.js';

/** 색+형태 이중부호화 결과 — 흑백에서도 의미 생존(§2.6). / Color+shape dual-encoding result. */
export interface InkDecision {
  /** 흑백=명도 그레이 또는 해치 패턴 색. / Mono grey (or hatch fill). */
  readonly fill: string;
  /** 색 상실 시 형태로 부호. / Shape-encode when color is lost. */
  readonly pattern?: 'solid' | 'hatch-up' | 'hatch-down' | 'dots';
  /** ▲▼ 등 부호 픽토(색 단독 금지 가드). / Sign glyph guard. */
  readonly glyph?: string;
  /** AA 대비 보증 텍스트색. / AA-guaranteed text color. */
  readonly textColor: string;
}

/** 테두리/구분선 지정. / Border spec. */
export interface BorderSpec {
  readonly color: string;
  readonly widthPx: number;
  readonly style: 'solid';
}

/** 출력 채널 어댑터 계약(§2.6). / Output-channel adapter contract. */
export interface IOutputChannelAdapter {
  readonly channel: 'screen' | 'print' | 'grayscale' | 'forced-colors';
  /** CF 채움색 → 이 채널의 잉크. / CF fill color → this channel's ink. */
  ink(cf: VisualSpec | undefined, text: { sign?: Sign; colorHint?: string }): InkDecision;
  /** 말줄임 텍스트를 지면에서 전개(화면 생략 → 인쇄 전체값). / Expand truncated text for print. */
  expandTruncation(cell: CellArtifact): string;
  /** 테두리를 솔리드 강제(반투명·헤어라인 소실 방지). / Force solid borders. */
  borderStyle(): BorderSpec;
}

const BLACK = '#111111';
const WHITE = '#ffffff';

/** 부호 → 픽토(색 단독 금지). / Sign → glyph. */
function signGlyph(sign?: Sign): string | undefined {
  if (sign === 'pos') return '▲';
  if (sign === 'neg') return '▼';
  return undefined;
}

/** 채움색 명도 → 해치 패턴(색 상실 대비 형태 부호). / Fill luminance → hatch pattern. */
function patternFor(fillColor: string | undefined): 'solid' | 'hatch-up' | 'hatch-down' | 'dots' {
  if (!fillColor) return 'solid';
  const rgb = parseColor(fillColor);
  if (!rgb) return 'solid';
  const lum = relativeLuminance(rgb);
  if (lum >= 0.66) return 'dots';
  if (lum >= 0.33) return 'hatch-up';
  return 'hatch-down';
}

/** 채움색 → 흑백 명도 그레이. / Fill color → monochrome grey. */
function toGrey(fillColor: string | undefined): string {
  if (!fillColor) return WHITE;
  const rgb = parseColor(fillColor);
  if (!rgb) return WHITE;
  const lum = relativeLuminance(rgb);
  const v = Math.round(lum * 255);
  const hex = v.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

/** 흑/백 중 대비 큰 잉크 선택(palette 커널 재사용). / Pick higher-contrast ink using the palette kernel. */
function pickInk(fillColor: string): string {
  return contrastRatio(WHITE, fillColor) >= contrastRatio(BLACK, fillColor) ? WHITE : BLACK;
}

/**
 * screen — 상류 확정 cf.inkColor 를 그대로 통과(재계산 금지). / Passes upstream cf.inkColor as-is.
 */
export class ScreenAdapter implements IOutputChannelAdapter {
  readonly channel = 'screen' as const;
  ink(cf: VisualSpec | undefined, text: { sign?: Sign; colorHint?: string }): InkDecision {
    const out: { fill: string; textColor: string; pattern?: 'solid' | 'hatch-up' | 'hatch-down' | 'dots'; glyph?: string } = {
      fill: cf?.fill?.color ?? WHITE,
      textColor: cf?.inkColor ?? BLACK, // 상류 AA 보증 — 통과만.
    };
    const g = signGlyph(text.sign);
    if (g !== undefined) out.glyph = g;
    return out;
  }
  expandTruncation(cell: CellArtifact): string { return cell.rawText ?? cell.text; }
  borderStyle(): BorderSpec { return { color: '#e5e7eb', widthPx: 1, style: 'solid' }; }
}

/**
 * print/grayscale — 채움을 명도 그레이 + 해치 패턴으로 강등, 잉크는 palette 대비 커널로 산정.
 * / Degrades fills to grey + hatch; ink computed via the palette contrast kernel.
 */
export class GrayscaleAdapter implements IOutputChannelAdapter {
  constructor(readonly channel: 'print' | 'grayscale' | 'forced-colors' = 'grayscale') {}

  ink(cf: VisualSpec | undefined, text: { sign?: Sign; colorHint?: string }): InkDecision {
    const grey = toGrey(cf?.fill?.color);
    const out: { fill: string; textColor: string; pattern?: 'solid' | 'hatch-up' | 'hatch-down' | 'dots'; glyph?: string } = {
      fill: grey,
      // 대비 수식 재구현 0 — palette contrastRatio 로 흑/백 중 큰 쪽. / reuse palette kernel.
      textColor: pickInk(grey),
    };
    // 채움이 의미를 담으면 형태(패턴) 병기 — 색 상실 시 생존. / hatch when fill carries meaning.
    if (cf?.fill) out.pattern = patternFor(cf.fill.color);
    else out.pattern = 'solid';
    const g = signGlyph(text.sign);
    if (g !== undefined) out.glyph = g;
    return out;
  }
  expandTruncation(cell: CellArtifact): string { return cell.rawText ?? cell.text; }
  borderStyle(): BorderSpec { return { color: BLACK, widthPx: 1, style: 'solid' }; }
}

/** 채널명 → 기본 어댑터. / Channel name → default adapter. */
export function createOutputAdapter(
  channel: IOutputChannelAdapter['channel'],
): IOutputChannelAdapter {
  if (channel === 'screen') return new ScreenAdapter();
  return new GrayscaleAdapter(channel);
}
