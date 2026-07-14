/**
 * F4 — 색약 안전 팔레트 + 색 외 구분 (§D / NFR-A11Y-3). 순수 함수, DOM 비의존.
 * / F4 — colorblind-safe palette + redundant (non-color) encoding (§D / NFR-A11Y-3). Pure
 * functions, DOM-agnostic.
 *
 * 계약 근거: 11_design_F4_v2.md §D(Okabe-Ito 파생 기본 팔레트·인접 대비≥3:1·deuteranopia 구별·
 * 패턴 병행), §10 palette.spec(자동검증: 인접쌍 대비비·ΔE·패턴 유일성).
 * / Contract basis: §D (Okabe-Ito-derived default palette · adjacent contrast ≥ 3:1 ·
 * deuteranopia distinguishability · parallel patterns) and the palette spec (auto-verifies
 * adjacent-pair contrast ratio, ΔE, and pattern uniqueness).
 *
 * 대비비는 WCAG 2.x relative luminance 공식, 색약 시뮬레이션은 Viénot/Brettel 계열
 * 선형 RGB 행렬 근사(deuteranopia/protanopia)를 사용한다.
 * / Contrast ratio uses the WCAG 2.x relative-luminance formula; colorblind simulation uses a
 * Viénot/Brettel-family linear-RGB matrix approximation (deuteranopia/protanopia).
 */

import type { ChartSeries } from './types.js';

/**
 * Okabe-Ito 8색(색약 안전 세트) — 배치 순서는 인접 대비를 키우도록 §D에 맞춰 조정.
 * / Okabe-Ito 8-color colorblind-safe set — ordering tuned per §D to raise adjacent contrast.
 */
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

/**
 * 색 외 구분(§D): series 인덱스 순환 배정. bar=텍스처, line=대시+마커에 대응.
 * / Redundant (non-color) encoding (§D): assigned by series index cycling. Maps to texture for
 * bars, dash + marker for lines.
 */
export const PATTERN_CYCLE: ReadonlyArray<NonNullable<ChartSeries['pattern']>> =
  ['solid', 'hatch', 'dot', 'cross'];

// ── 색 파싱/변환 ─────────────────────────────────────────────────────────

/** RGB 색(각 채널 0..255). / An RGB color (each channel 0..255). */
export interface Rgb {
  /** 빨강 0..255. / Red 0..255. */
  r: number;
  /** 초록 0..255. / Green 0..255. */
  g: number;
  /** 파랑 0..255. / Blue 0..255. */
  b: number;
}

/** 0..255 범위로 클램프(rgb() 입력이 상한/하한을 벗어나는 방어). / Clamp to 0..255 (guards out-of-range rgb() input). */
function clamp255(n: number): number {
  return Math.min(255, Math.max(0, n));
}

/**
 * '#rgb'/'#rrggbb'/'rgb(a)()' → RGB(0-255). 실패 시 null.
 * / Parse '#rgb'/'#rrggbb'/'rgb(a)()' → RGB (0-255). null on failure.
 *
 * @param input - 색 문자열 / Color string
 * @returns RGB 객체, 파싱 실패 시 null / An RGB object, or null on parse failure
 */
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

/**
 * 'rgba(r, g, b, 1)' 정규화 문자열 — 테마 바인딩 비교용(§1).
 * / Normalized 'rgba(r, g, b, 1)' string — for theme-binding comparison (§1).
 *
 * @param input - 색 문자열 / Color string
 * @returns 정규화 문자열, 실패 시 null / Normalized string, or null on failure
 */
export function normalizeColor(input: string): string | null {
  const c = parseColor(input);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, 1)` : null;
}

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1). / WCAG relative luminance (0..1). */
export function relativeLuminance(c: Rgb): number {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

/**
 * WCAG 대비비 (1..21). 파싱 실패 색은 1로 취급.
 * / WCAG contrast ratio (1..21). Unparseable colors are treated as 1.
 *
 * @param a - 색 문자열 A / Color string A
 * @param b - 색 문자열 B / Color string B
 * @returns 대비비 1..21 / Contrast ratio 1..21
 */
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

/** 이색각(색약) 종류. / Dichromacy (colorblindness) kind. */
export type Dichromacy = 'deuteranopia' | 'protanopia';

/**
 * 색약 변환 시뮬레이션 — RGB in/out(0-255).
 * / Simulate a dichromatic color transform — RGB in/out (0-255).
 *
 * @param c - 원본 RGB / Source RGB
 * @param kind - 색약 종류 / Dichromacy kind
 * @returns 시뮬레이션된 RGB / The simulated RGB
 */
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

/**
 * 단순 유클리드 RGB 거리(ΔE 근사, 0..441). 팔레트 임계 비교용.
 * / Simple Euclidean RGB distance (ΔE approximation, 0..441). For palette threshold comparisons.
 *
 * @param a - RGB A / RGB A
 * @param b - RGB B / RGB B
 * @returns 거리 0..441 / Distance 0..441
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * 인접 대비를 **최대화**하도록 팔레트를 그리디 재배치한다(§D "미달 시 팔레트 재배치").
 * 첫 색에서 시작해 매번 직전 색과 대비가 가장 큰 색을 이어붙인다(O(n²), 결정론적).
 * / Greedily reorder the palette to **maximize** adjacent contrast (§D "reorder when below
 * target"). Starting from the first color, each step appends the color with the greatest
 * contrast against the previous one (O(n²), deterministic).
 *
 * ⚠️ 정직한 한계(설계 갱신 필요): 8색 색약안전 팔레트는 **어떤 순열로도** 인접 luminance
 * 대비 ≥3:1 을 전부 만족할 수 없다(수학적 상한 ≈1.52, 브루트포스 확인). WCAG 3:1 은 본디
 * 전경-배경(텍스트/UI) 기준이지 인접 카테고리 기준이 아니다. 색약 구별의 실보증은 (1) 색약
 * 시뮬 ΔE 분리(인접 최소 ≈78)와 (2) 색 외 중복 부호화(패턴/대시/마커, PATTERN_CYCLE)에 있다.
 * 본 함수는 대비를 "가능한 만큼" 키우는 best-effort 재배치다.
 * / ⚠️ Honest limitation: the 8-color colorblind-safe palette cannot satisfy adjacent luminance
 * contrast ≥ 3:1 for all pairs under **any** permutation (mathematical upper bound ≈ 1.52,
 * brute-force confirmed). WCAG 3:1 is originally a foreground-background (text/UI) criterion, not
 * an adjacent-category one. The real guarantee of colorblind distinguishability rests on (1) the
 * dichromacy-simulated ΔE separation (adjacent minimum ≈ 78) and (2) redundant non-color encoding
 * (pattern/dash/marker, PATTERN_CYCLE). This function is a best-effort reordering that raises
 * contrast "as much as possible".
 *
 * @param colors - 재배치할 색 배열 / Colors to reorder
 * @returns 인접 대비를 키운 새 순열(원순서보다 나빠지지 않음) / A new permutation with raised adjacent contrast (never worse than the original)
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

/**
 * 인접 색쌍의 최소 대비비(테스트/재배치 판정용).
 * / Minimum contrast ratio across adjacent color pairs (for test/reorder decisions).
 *
 * @param colors - 색 배열 / Color array
 * @returns 인접쌍 최소 대비비 / The minimum adjacent-pair contrast ratio
 */
export function minAdjacentContrast(colors: readonly string[]): number {
  let m = Infinity;
  for (let i = 0; i < colors.length - 1; i++) m = Math.min(m, contrastRatio(colors[i]!, colors[i + 1]!));
  return Number.isFinite(m) ? m : 0;
}

/**
 * 인접 색쌍의 색약 시뮬 ΔE 최소값(deuteranopia/protanopia 중 나쁜 쪽). 색약 구별 실보증.
 * / Minimum dichromacy-simulated ΔE across adjacent color pairs (the worse of
 * deuteranopia/protanopia). The real guarantee of colorblind distinguishability.
 *
 * @param colors - 색 배열 / Color array
 * @returns 인접쌍 색약 ΔE 최소값 / The minimum adjacent-pair dichromatic ΔE
 */
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

/** 결정된 series 표시 스타일(색 + 패턴). / A resolved series display style (color + pattern). */
export interface ResolvedSeriesStyle {
  /** 시리즈 색. / Series color. */
  color: string;
  /** 색 외 구분 패턴. / Redundant (non-color) pattern. */
  pattern: NonNullable<ChartSeries['pattern']>;
}

/**
 * series 별 색/패턴을 결정한다(§D).
 * - series.color 명시가 최우선.
 * - primary(테마 --og-primary)가 주어지면 첫 팔레트 색으로 유도하되, 다음 색과의
 *   대비가 3:1 미달이면 안전 팔레트 원본을 그대로 쓴다(§D "fallback으로만").
 * - 패턴은 인덱스 순환(유일성은 series≤4에서 보장, 초과 시 색+패턴 조합으로 구분).
 * / Resolve per-series color/pattern (§D).
 * - An explicit series.color wins.
 * - A given primary (theme --og-primary) is steered into the first palette slot, but if its
 *   contrast against the next color is below 3:1 the original safe palette is kept (§D "fallback only").
 * - Patterns cycle by index (uniqueness is guaranteed for series ≤ 4; beyond that, the color +
 *   pattern combination distinguishes them).
 *
 * @param series - 각 series 의 색/패턴 힌트(선택) / Per-series color/pattern hints (optional)
 * @param opts - 팔레트 override·테마 primary(선택) / Palette override and theme primary (optional)
 * @returns series 순서에 맞춘 색+패턴 배열 / An array of color+pattern aligned to series order
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
