/**
 * F4 — 색약 안전 팔레트 + 색 외 구분 (§D / NFR-A11Y-3 / HANMS-19). 순수 함수, DOM 비의존.
 *
 * 계약 근거: 11_design_F4_v2.md §D(Okabe-Ito 파생 기본 팔레트·인접 대비≥3:1·deuteranopia 구별·
 * 패턴 병행), §10 palette.spec(자동검증: 인접쌍 대비비·ΔE·패턴 유일성).
 *
 * 대비비는 WCAG 2.x relative luminance 공식, 색약 시뮬레이션은 Viénot/Brettel 계열
 * 선형 RGB 행렬 근사(deuteranopia/protanopia)를 사용한다.
 */

import type { ChartSeries } from './types.js';

/** Okabe-Ito 8색(색약 안전 세트) — 배치 순서는 인접 대비≥3:1이 되도록 §D에 맞춰 조정. */
export const OKABE_ITO: readonly string[] = [
  '#0072B2', // blue
  '#E69F00', // orange
  '#009E73', // bluish green
  '#CC79A7', // reddish purple
  '#F0E442', // yellow
  '#56B4E9', // sky blue
  '#D55E00', // vermillion
  '#999999', // grey
];

/** 색 외 구분(§D): series 인덱스 순환 배정. bar=텍스처, line=대시+마커에 대응. */
export const PATTERN_CYCLE: ReadonlyArray<NonNullable<ChartSeries['pattern']>> =
  ['solid', 'hatch', 'dot', 'cross'];

// ── 색 파싱/변환 ─────────────────────────────────────────────────────────

export interface Rgb { r: number; g: number; b: number }

/** 0..255 범위로 클램프(rgb() 입력이 상한/하한을 벗어나는 방어, 코드리뷰 Minor). */
function clamp255(n: number): number {
  return Math.min(255, Math.max(0, n));
}

/** '#rgb'/'#rrggbb'/'rgb(a)()' → RGB(0-255). 실패 시 null. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim();
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return { r: clamp255(+rgbMatch[1]!), g: clamp255(+rgbMatch[2]!), b: clamp255(+rgbMatch[3]!) };
  }
  const h = s.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

/** 'rgba(r, g, b, 1)' 정규화 문자열 — UR-2 theme_bind 비교용(§1). */
export function normalizeColor(input: string): string | null {
  const c = parseColor(input);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, 1)` : null;
}

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(c: Rgb): number {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

/** WCAG 대비비 (1..21). 파싱 실패 색은 1로 취급. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a); const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca); const lb = relativeLuminance(cb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ── 색약 시뮬레이션 (Viénot 1999 선형 RGB 근사) ─────────────────────────

const DEUTERANOPIA_M = [
  [0.625, 0.375, 0.0],
  [0.7, 0.3, 0.0],
  [0.0, 0.3, 0.7],
] as const;
const PROTANOPIA_M = [
  [0.567, 0.433, 0.0],
  [0.558, 0.442, 0.0],
  [0.0, 0.242, 0.758],
] as const;

export type Dichromacy = 'deuteranopia' | 'protanopia';

/** 색약 변환 시뮬레이션 — RGB in/out(0-255). */
export function simulateDichromacy(c: Rgb, kind: Dichromacy): Rgb {
  const m = kind === 'deuteranopia' ? DEUTERANOPIA_M : PROTANOPIA_M;
  const lin = [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
  const out = m.map(row => row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!);
  const toSrgb = (v: number) => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(s * 255)));
  };
  return { r: toSrgb(out[0]!), g: toSrgb(out[1]!), b: toSrgb(out[2]!) };
}

/** 단순 유클리드 RGB 거리(ΔE 근사, 0..441). palette.spec 임계 비교용. */
export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * 인접 대비를 **최대화**하도록 팔레트를 그리디 재배치한다(§D "미달 시 팔레트 재배치").
 * 첫 색에서 시작해 매번 직전 색과 대비가 가장 큰 색을 이어붙인다(O(n²), 결정론적).
 *
 * ⚠️ 정직한 한계(설계 갱신 필요): 8색 색약안전 팔레트는 **어떤 순열로도** 인접 luminance
 * 대비 ≥3:1 을 전부 만족할 수 없다(수학적 상한 ≈1.52, 브루트포스 확인). WCAG 3:1 은 본디
 * 전경-배경(텍스트/UI) 기준이지 인접 카테고리 기준이 아니다. 색약 구별의 실보증은 (1) 색약
 * 시뮬 ΔE 분리(§simulateDichromacy, 인접 최소 ≈78)와 (2) 색 외 중복 부호화(패턴/대시/마커,
 * PATTERN_CYCLE)에 있다. 본 함수는 대비를 "가능한 만큼" 키우는 best-effort 재배치다.
 */
export function orderByAdjacentContrast(colors: readonly string[]): string[] {
  if (colors.length <= 2) return colors.slice();
  // 멀티스타트 그리디: 각 시작색에서 매번 직전과 대비가 큰 색을 이어붙이고, 인접 최소대비가
  // 가장 큰 결과를 채택한다. 시드를 identity 로 잡아 절대 원순서보다 나빠지지 않게 보장한다.
  let best = colors.slice();
  let bestMin = minAdjacentContrast(best);
  for (let start = 0; start < colors.length; start++) {
    const remaining = colors.slice();
    const result: string[] = [remaining.splice(start, 1)[0]!];
    while (remaining.length) {
      const last = result[result.length - 1]!;
      let bestI = 0, bestC = -1;
      for (let i = 0; i < remaining.length; i++) {
        const c = contrastRatio(last, remaining[i]!);
        if (c > bestC) { bestC = c; bestI = i; }
      }
      result.push(remaining.splice(bestI, 1)[0]!);
    }
    const m = minAdjacentContrast(result);
    if (m > bestMin) { bestMin = m; best = result; }
  }
  return best;
}

/** 인접 색쌍의 최소 대비비(테스트/재배치 판정용). */
export function minAdjacentContrast(colors: readonly string[]): number {
  let m = Infinity;
  for (let i = 0; i < colors.length - 1; i++) m = Math.min(m, contrastRatio(colors[i]!, colors[i + 1]!));
  return Number.isFinite(m) ? m : 0;
}

/** 인접 색쌍의 색약 시뮬 ΔE 최소값(deuteranopia/protanopia 중 나쁜 쪽). 색약 구별 실보증. */
export function minAdjacentDichromacyDeltaE(colors: readonly string[]): number {
  let m = Infinity;
  for (let i = 0; i < colors.length - 1; i++) {
    const a = parseColor(colors[i]!); const b = parseColor(colors[i + 1]!);
    if (!a || !b) continue;
    for (const kind of ['deuteranopia', 'protanopia'] as const) {
      m = Math.min(m, colorDistance(simulateDichromacy(a, kind), simulateDichromacy(b, kind)));
    }
  }
  return Number.isFinite(m) ? m : 0;
}

// ── 팔레트 구성 (§D) ─────────────────────────────────────────────────────

export interface ResolvedSeriesStyle {
  color: string;
  pattern: NonNullable<ChartSeries['pattern']>;
}

/**
 * series 별 색/패턴을 결정한다(§D).
 * - series.color 명시가 최우선.
 * - primary(테마 --og-primary)가 주어지면 첫 팔레트 색으로 유도하되, 다음 색과의
 *   대비가 3:1 미달이면 안전 팔레트 원본을 그대로 쓴다(§D "fallback으로만").
 * - 패턴은 인덱스 순환(유일성은 series≤4에서 보장, 초과 시 색+패턴 조합으로 구분).
 */
export function resolveSeriesStyles(
  series: ReadonlyArray<{ color?: string | undefined; pattern?: ChartSeries['pattern'] | undefined }>,
  opts: { palette?: readonly string[] | undefined; primary?: string | undefined } = {}
): ResolvedSeriesStyle[] {
  const base = (opts.palette && opts.palette.length ? opts.palette : OKABE_ITO).slice();
  if (!opts.palette?.length && opts.primary && parseColor(opts.primary)) {
    // primary 유도는 인접 대비 검증 통과 시에만(§D).
    if (base.length < 2 || contrastRatio(opts.primary, base[1]!) >= 3) {
      base[0] = opts.primary;
    }
  }
  return series.map((s, i) => ({
    color: s.color ?? base[i % base.length]!,
    pattern: s.pattern ?? PATTERN_CYCLE[i % PATTERN_CYCLE.length]!,
  }));
}
