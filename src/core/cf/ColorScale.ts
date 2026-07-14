// ============================================================
// DD-05 §9.3 색상스케일(히트맵) — 단색 명도 램프(무지개 금지)·이산 기본·연속 옵트인·발산 중립
// / DD-05 §9.3 color scale (heatmap) — single-hue luminance ramp (no rainbow), discrete default,
// continuous opt-in, neutral diverging midpoint. REQ: T5-010 · T5-012 · T5-013 · T5-015.
// ------------------------------------------------------------
// 순서 지각을 명도 단조로 보장한다(무지개는 순서 없음 → 판독 불가). 색은 CF 가 만들지 않고 시드를
// AppearanceView.rampFrom 으로 받는다(§9.1). 발산은 중앙값 흰/회색 중립·고채도 노랑 금지. 순수·헤드리스.
// 연속(OKLCH 지각균등)은 스펙상 옵트인 — 본 코어는 경량 sRGB 선형보간 램프로 근사(번들 방어, §7·스파이크2).
// ============================================================

import { parseColor, type Rgb } from '../chart/palette.js';

/** 발산 스케일의 중립 중앙색(흰/회색, 고채도 금지). / Neutral diverging midpoint (white/gray). */
export const NEUTRAL_MIDPOINT = '#f4f5f6';

function toHex(c: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** sRGB 선형 채널 보간(t: 0→a, 1→b). / Linear sRGB channel interpolation. */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return { r: a.r + (b.r - a.r) * u, g: a.g + (b.g - a.g) * u, b: a.b + (b.b - a.b) * u };
}

/** 안전 파싱(실패 시 graphite 폴백). / Safe parse (falls back to graphite). */
function rgb(color: string): Rgb {
  return parseColor(color) ?? { r: 58, g: 63, b: 69 };
}

/** 라이트 앵커(near-white) — 램프의 밝은 끝. 시드에 살짝 물들여 단색 유지. / Light anchor for the ramp. */
function lightAnchorOf(seed: Rgb): Rgb {
  // 흰색에 시드를 8% 섞어 색상(hue)을 유지하되 최명도를 확보(명도 단조 보장).
  return mix({ r: 255, g: 255, b: 255 }, seed, 0.08);
}

/**
 * 순차 단색 명도 램프 색(연속) — ratio 0(밝음)→1(시드, 어두움). 명도 단조.
 * / Sequential single-hue luminance color (continuous) — ratio 0 (light) → 1 (seed, dark).
 *
 * @param seed - AppearanceView.rampFrom 시드색 / The seed color from AppearanceView.rampFrom
 * @param ratio - 정규화 위치 0..1 / Normalized position 0..1
 * @returns hex 색 / A hex color
 */
export function sequentialColor(seed: string, ratio: number): string {
  const s = rgb(seed);
  return toHex(mix(lightAnchorOf(s), s, ratio));
}

/**
 * 순차 단색 이산 램프(3~5단 기본, REQ-T5-012) — 각 밴드 대표색. 밴드 중앙 위치로 샘플.
 * / Sequential discrete ramp (3–5 bands default). Samples the mid-position of each band.
 *
 * @param seed - 시드색 / Seed color
 * @param bands - 밴드 수(2..5 클램프) / Band count (clamped 2..5)
 * @returns 밴드별 hex 색 배열 / A per-band array of hex colors
 */
export function sequentialBands(seed: string, bands: number): string[] {
  const n = Math.max(2, Math.min(5, Math.floor(bands)));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(sequentialColor(seed, n === 1 ? 0 : i / (n - 1)));
  return out;
}

/**
 * 발산 램프 색(연속) — lo(어두움)→중립(흰/회색)→hi(어두움). 중앙값 중립(REQ-T5-013).
 * / Diverging color (continuous) — lo (dark) → neutral → hi (dark). Neutral midpoint.
 *
 * @param lo - 저(低)측 시드색 / Low-side seed color
 * @param hi - 고(高)측 시드색 / High-side seed color
 * @param ratio - 0..1(0.5=중립) / 0..1 (0.5 = neutral)
 * @param neutral - 중앙 중립색(기본 NEUTRAL_MIDPOINT) / Center neutral color
 * @returns hex 색 / A hex color
 */
export function divergingColor(lo: string, hi: string, ratio: number, neutral: string = NEUTRAL_MIDPOINT): string {
  const mid = rgb(neutral);
  if (ratio <= 0.5) {
    // 0 → lo(어두움), 0.5 → 중립
    return toHex(mix(rgb(lo), mid, ratio / 0.5));
  }
  return toHex(mix(mid, rgb(hi), (ratio - 0.5) / 0.5));
}

/**
 * 발산 이산 램프(밴드 중앙 샘플). 중앙 밴드는 중립. / Diverging discrete ramp; center band neutral.
 *
 * @param lo - 저측 시드색 / Low-side seed
 * @param hi - 고측 시드색 / High-side seed
 * @param bands - 밴드 수(3..5 클램프) / Band count (clamped 3..5)
 * @param neutral - 중앙 중립색 / Center neutral color
 * @returns 밴드별 hex 색 배열 / A per-band array of hex colors
 */
export function divergingBands(lo: string, hi: string, bands: number, neutral: string = NEUTRAL_MIDPOINT): string[] {
  const n = Math.max(3, Math.min(5, Math.floor(bands)));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(divergingColor(lo, hi, n === 1 ? 0.5 : i / (n - 1), neutral));
  return out;
}

/** 스케일 도메인(컬러바 공유용, REQ-T5-015). CF 는 도메인만 제공·물질화는 DD-11/06. / Scale domain for shared colorbar. */
export interface ScaleDomain {
  readonly min: number;
  readonly mid?: number;
  readonly max: number;
  /** 이산 밴드 경계 틱(연속이면 [min,mid,max]). / Discrete band-boundary ticks. */
  readonly ticks: readonly number[];
}
