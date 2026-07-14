// ============================================================
// DD-05 §2.5 적용층 — 인코더(판정→VisualSpec, 순수) + CFEncoderRegistry(OCP SPI)
// / DD-05 §2.5 application layer — encoders (verdict → VisualSpec, pure) + encoder registry.
// REQ: T5-001 · T5-007 · T5-010 · T5-019 · T5-020 · T5-024 · T5-807 · T5-011
// ------------------------------------------------------------
// 판정 → 페인트 지시(DOM 아님). px·hex 변환은 여기서만(AppearanceView 협력). 모든 VisualSpec 은
// ariaSummary(원시 수치 요약) 필수(§1-inv5, T5-024) — 텍스트 등가물 없는 인코딩은 수용기준 위반.
// 채움 위 텍스트는 InkResolver 로 AA 보증. 아이콘은 tint⟂shape 이중부호화(§9.2). 헤드리스·순수.
// ============================================================

import type { CellRect } from '../coordinate/index.js';
import { TypedRegistry, type IRegistry } from '../extension/Registry.js';
import type { CFEncodeSpec } from './CFRule.js';
import type { RuleVerdict } from './eval-types.js';
import type { AppearanceView } from './appearance.js';
import { DefaultInkResolver, type InkResolver } from './InkResolver.js';
import { sequentialColor, sequentialBands, divergingColor, divergingBands } from './ColorScale.js';

/** 채움/글리프의 시각 스펙. ariaSummary 필수(텍스트 쌍둥이). / Visual spec; ariaSummary is mandatory. */
export interface VisualSpec {
  readonly layer: 'background' | 'decorator';
  /** 데이터바/히트맵 채움. / Data-bar/heatmap fill. */
  readonly fill?: { readonly color: string; readonly from?: 'zero' | 'left' | 'right'; readonly ratio: number };
  /** 아이콘 이중부호화(색+형태). / Icon dual encoding (color + shape). */
  readonly glyph?: { readonly role: string; readonly tint: string; readonly shape: 'circle' | 'triangleUp' | 'triangleDown' };
  /** 채움 위 텍스트 색(AA 보증 결과). / Fill-above text color (AA-guaranteed). */
  readonly inkColor: string;
  /** 중간명도 폴백 외곽선(halo) 지시. / Mid-luminance outline (halo) fallback. */
  readonly inkOutline?: boolean;
  /** 극단값 클램프 발동 표식(범위 초과 고지, T5-007). / Clamp-fired marker (out-of-range notice). */
  readonly clamped?: boolean;
  /** 텍스트 쌍둥이(원시 수치 요약, 필수). / Text twin (raw numeric summary, required). */
  readonly ariaSummary: string;
}

/** 인코더 계약(Strategy) — 판정→VisualSpec(순수). / Encoder contract (Strategy). */
export interface CFEncoder {
  readonly kind: CFEncodeSpec['kind'];
  encode(verdict: RuleVerdict, appearance: AppearanceView, cellRect: CellRect): VisualSpec;
}

const ink: InkResolver = new DefaultInkResolver();

/** 결측·비수치 잉크(중립 텍스트색). / Missing/non-numeric neutral ink. */
const MISSING_INK = '#111111';

/** 숫자 요약(로케일 포맷은 DD-04 IFormatter 위임 대상 — 통합 시 배선; 여기선 헤드리스 원시 요약). / Numeric summary. */
function fmt(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function pct(ratio: number | undefined): string {
  return ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`;
}

// ── bar(데이터바) — 0기준·음수 양방향·클램프 고지(§9.5) ──────────────────
class BarEncoder implements CFEncoder {
  readonly kind = 'bar' as const;
  encode(verdict: RuleVerdict, appearance: AppearanceView, _rect: CellRect): VisualSpec {
    const spec = verdict.encode as Extract<CFEncodeSpec, { kind: 'bar' }>;
    const d = verdict.datum;
    // 결측·비수치 — 0(값 없음)을 길이 0 막대로 위장하지 않는다. 채움 없음 + 텍스트 쌍둥이만(§9.5 결측).
    // / Missing/non-numeric: emit no bar (do not fake absence as a zero-length bar). Text twin only.
    if (d.value === undefined) {
      return { layer: 'background', inkColor: MISSING_INK, ariaSummary: '값 없음' };
    }
    // 음수는 색+방향 이중부호가 성립하도록 양수와 다른 무채색 데이터색(graphite) 기본 사용
    // (danger 재사용 아님). 명시 seed 가 있으면 그대로 존중.
    const seed = spec.seed ?? (d.sign === -1 ? 'graphite' : 'primary');
    const color = appearance.rampFrom(seed);
    const axis = spec.axis ?? 'zero';
    const from: 'zero' | 'left' | 'right' =
      axis === 'zero' ? (d.sign === -1 ? 'right' : 'left') : 'left';
    const inkD = ink.pickInk(color);
    const ratio = d.ratio ?? 0;
    const clampNote = d.clamped ? ' (범위 초과·클램프)' : '';
    const logNote = spec.log ? ' (log)' : '';
    const summary = `값 ${fmt(d.value)}, 막대 ${pct(ratio)}${d.sign === -1 ? ' 음수' : ''}${clampNote}${logNote}`;
    return {
      layer: 'background',
      fill: { color, from, ratio },
      inkColor: inkD.color,
      ...(inkD.outline ? { inkOutline: true } : {}),
      ...(d.clamped ? { clamped: true } : {}),
      ariaSummary: summary,
    };
  }
}

// ── scale(히트맵) — 단색 명도 램프·이산 기본·연속 옵트인·발산 중립(§9.3) ──
class ScaleEncoder implements CFEncoder {
  readonly kind = 'scale' as const;
  encode(verdict: RuleVerdict, appearance: AppearanceView, _rect: CellRect): VisualSpec {
    const spec = verdict.encode as Extract<CFEncodeSpec, { kind: 'scale' }>;
    const d = verdict.datum;
    // 결측·비수치 — 최소 밴드색(band[0])으로 왜곡하지 않는다. 채움 없음 + 텍스트 쌍둥이만(§9.5 결측).
    // / Missing/non-numeric: do NOT paint the minimum band color; emit no fill + text twin only.
    if (d.value === undefined) {
      return { layer: 'background', inkColor: MISSING_INK, ariaSummary: '값 없음' };
    }
    const mode = spec.mode ?? 'discrete';
    let color: string;
    let bandNote = '';
    if (spec.diverging) {
      const lo = appearance.rampFrom('graphite');
      const hi = appearance.rampFrom('primary');
      if (mode === 'continuous') {
        color = divergingColor(lo, hi, d.ratio ?? 0.5);
      } else {
        const bands = divergingBands(lo, hi, d.bandCount ?? 3);
        color = bands[d.bandIndex ?? 0] ?? bands[0]!;
        bandNote = ` (구간 ${(d.bandIndex ?? 0) + 1}/${d.bandCount ?? bands.length})`;
      }
    } else {
      const seed = spec.seed ?? 'graphite';
      const base = appearance.rampFrom(seed);
      if (mode === 'continuous') {
        color = sequentialColor(base, d.ratio ?? 0);
      } else {
        const bands = sequentialBands(base, d.bandCount ?? 3);
        color = bands[d.bandIndex ?? 0] ?? bands[0]!;
        bandNote = ` (구간 ${(d.bandIndex ?? 0) + 1}/${d.bandCount ?? bands.length})`;
      }
    }
    const inkD = ink.pickInk(color);
    const summary = `값 ${fmt(d.value)}, 히트맵 ${pct(d.ratio)}${bandNote}`;
    return {
      layer: 'background',
      fill: { color, ratio: d.ratio ?? 0 },
      inkColor: inkD.color,
      ...(inkD.outline ? { inkOutline: true } : {}),
      ariaSummary: summary,
    };
  }
}

// ── icon(아이콘셋) — 색+형태 이중부호화(§9.2, T5-019) ────────────────────
// 형태만으로 판독 가능(색약·forced-colors): 하위=역삼각(▽)·중간=원(○)·상위=삼각(△).
function shapeFor(bandIndex: number, bandCount: number): 'circle' | 'triangleUp' | 'triangleDown' {
  if (bandCount <= 1) return 'circle';
  if (bandIndex <= 0) return 'triangleDown';
  if (bandIndex >= bandCount - 1) return 'triangleUp';
  return 'circle';
}

class IconEncoder implements CFEncoder {
  readonly kind = 'icon' as const;
  encode(verdict: RuleVerdict, appearance: AppearanceView, _rect: CellRect): VisualSpec {
    const spec = verdict.encode as Extract<CFEncodeSpec, { kind: 'icon' }>;
    const d = verdict.datum;
    // 결측·비수치 — 최하위 아이콘(▽ 하위)으로 왜곡하지 않는다. 글리프 없음 + 텍스트 쌍둥이만(§9.5 결측).
    // / Missing/non-numeric: do NOT render the lowest-band icon; emit no glyph + text twin only.
    if (d.value === undefined) {
      return { layer: 'decorator', inkColor: MISSING_INK, ariaSummary: '값 없음' };
    }
    const bandCount = d.bandCount ?? spec.steps ?? 3;
    const bandIndex = d.bandIndex ?? 0;
    const shape = shapeFor(bandIndex, bandCount);
    // tint 는 명도 램프에서 파생(색은 형태를 '백업'만; 형태만으로 판독 가능해야 함, §9.2).
    const tintBands = sequentialBands(appearance.rampFrom('graphite'), Math.max(2, bandCount));
    const tint = tintBands[Math.min(tintBands.length - 1, bandIndex)] ?? tintBands[0]!;
    const role = `cf-icon-${bandIndex}-of-${bandCount}`;
    const meaning = bandIndex <= 0 ? '하위' : bandIndex >= bandCount - 1 ? '상위' : '중간';
    const summary = `값 ${fmt(d.value)}, ${meaning} 구간 ${bandIndex + 1}/${bandCount} (${shape})`;
    return {
      layer: 'decorator',
      glyph: { role, tint, shape },
      inkColor: tint,
      ariaSummary: summary,
    };
  }
}

// ── sparkline(인셀 스파크) — 값은 DD-06 헤드리스 차트가 그림; CF 는 스펙+텍스트 쌍둥이만 ──
class SparklineEncoder implements CFEncoder {
  readonly kind = 'sparkline' as const;
  encode(verdict: RuleVerdict, _appearance: AppearanceView, _rect: CellRect): VisualSpec {
    const spec = verdict.encode as Extract<CFEncodeSpec, { kind: 'sparkline' }>;
    const d = verdict.datum;
    const summary = `인셀 ${spec.chart ?? 'line'} 스파크, 값 ${fmt(d.value)}`;
    return {
      layer: 'decorator',
      inkColor: '#111111',
      ariaSummary: summary,
    };
  }
}

/** CF 인코더 레지스트리(DD-10 IRegistry 동형). / CF encoder registry (IRegistry-homomorphic). */
export type CFEncoderRegistry = IRegistry<CFEncoder>;

/**
 * 인코더 레지스트리 생성 — bar/scale/icon/sparkline 을 builtin 으로 등록(코어 보호). 동일 kind 재등록으로
 * 기본 인코더 교체(예: gradient bar→커스텀 불릿), 신규 kind 로 확장(§4.7). 미지 kind = get→undefined skip.
 * / Create the encoder registry with the 4 built-ins registered as protected; replace/extend via SPI.
 *
 * @returns 4종 내장 인코더가 채워진 IRegistry / An IRegistry pre-populated with the 4 built-in encoders
 */
export function createEncoderRegistry(): CFEncoderRegistry {
  const reg = new TypedRegistry<CFEncoder>({ spi: { name: 'CFEncoder', version: '1' } });
  reg.register('bar', new BarEncoder(), { origin: 'builtin' });
  reg.register('scale', new ScaleEncoder(), { origin: 'builtin' });
  reg.register('icon', new IconEncoder(), { origin: 'builtin' });
  reg.register('sparkline', new SparklineEncoder(), { origin: 'builtin' });
  return reg;
}

export { BarEncoder, ScaleEncoder, IconEncoder, SparklineEncoder };
