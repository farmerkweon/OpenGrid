/**
 * DD-06 — 장면 모델(원시 드로우명령 리스트, 타깃 무관 SSOT) + 타깃 통일 진입점. §2.2/§2.4.
 * / DD-06 — scene model (ordered primitive draw-command list, target-agnostic SSOT) + the unified
 * render entry. §2.2/§2.4.
 *
 * `buildChartScene` 이 유일한 "그림 결정" 지점이다(색·패턴·형태 확정). 세 타깃(canvas/svg/server)은
 * 이후 판단하지 않고 scene 을 그대로 래스터화만 한다(humble) — 이것이 파리티의 물리적 근거다.
 * 좌표계 = 장치독립 CSS px(원점 좌상단). DPR·SVG viewBox·서버 스케일은 각 surface 가 곱한다.
 * / `buildChartScene` is the sole "drawing decision" point (colors/patterns/shapes finalized).
 * The three targets never judge afterward — they only rasterize the scene (humble). That is the
 * physical basis of parity. Coordinates = device-independent CSS px (origin top-left); each
 * surface multiplies DPR / SVG viewBox / server scale.
 *
 * 불변식(§1): window/document/canvas 미참조(순수). 결정론(Date/Math.random 미사용). 결측(null)은
 * 0 으로 침묵 치환 금지 — bar 는 빈 슬롯, line 은 선 끊김(gap)(§9.3.3).
 * / Invariants: no window/document/canvas; deterministic; missing (null) is never silently
 * replaced by 0 — bars get an empty slot, lines get a gap (§9.3.3).
 */

import type { ChartDataModel, ChartRenderSpec, ChartDataModelMeta, ChartSeries } from './types.js';
import { computeChartGeometry, MARKER_R, PLOT_PAD, type ChartGeometry } from './geometry.js';
import { resolveSeriesStyles } from './palette.js';
import { patternOverlay, dashFor } from './surfaces/pattern-overlay.js';

/** 색 외 구분 패턴(§9.2). / Redundant (non-color) pattern (§9.2). */
export type SeriesPattern = NonNullable<ChartSeries['pattern']>;

/** 텍스트 정렬. / Text alignment. */
export type TextAlign = 'start' | 'center' | 'end';
/** 텍스트 기준선. / Text baseline. */
export type TextBaseline = 'top' | 'middle' | 'bottom';

/** 원시 드로우명령(타깃 무관). / Primitive draw command (target-agnostic). */
export type DrawPrim =
  | { readonly k: 'rect'; x: number; y: number; w: number; h: number; fill: string; pattern?: SeriesPattern }
  | { readonly k: 'polyline'; pts: ReadonlyArray<readonly [number, number]>; stroke: string; width: number; dash?: readonly number[] }
  | { readonly k: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { readonly k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { readonly k: 'text'; x: number; y: number; s: string; fill: string; align: TextAlign; baseline: TextBaseline; font: string }
  | { readonly k: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; fill: string; pattern?: SeriesPattern };

/** 장면 = 배경→축→데이터→마커 순서의 원시명령 + 자기고지 메타. / Scene = ordered prims + self-declaring meta. */
export interface ChartScene {
  readonly width: number;
  readonly height: number;
  readonly bg: string;
  readonly prims: readonly DrawPrim[];
  readonly geometry: ChartGeometry;
  readonly meta: ChartDataModelMeta;
}

/** 렌더 타깃 종류. / Render target kind. */
export type RenderTargetKind = 'canvas' | 'svg' | 'server';

/** 장면을 백엔드 원시연산으로 번역하는 humble 어댑터. 로직·판단 없음(§2.3). / Humble scene→backend translator. */
export interface RenderSurface {
  readonly kind: RenderTargetKind;
  paint(scene: ChartScene): void;
}

function isLineLike(type: string): boolean { return type === 'line' || type === 'area'; }
function isPieLike(type: string): boolean { return type === 'pie' || type === 'doughnut'; }

function fontOf(spec: ChartRenderSpec): string {
  const fs = spec.theme?.fontSize || 12;
  const ff = spec.theme?.fontFamily || 'sans-serif';
  return `${fs}px ${ff}`;
}

/** series 색/패턴 확정(palette 재사용, 재구현 0). / Resolve series color/pattern (reuses palette). */
function stylesOf(model: ChartDataModel, spec: ChartRenderSpec) {
  return resolveSeriesStyles(
    model.series.map(s => ({ color: s.color, pattern: s.pattern })),
    { palette: spec.palette ?? spec.theme?.palette, primary: spec.theme?.primary },
  );
}

/**
 * 순수: 완전 기하 → 드로우리스트(§2.2). 색/패턴은 palette 로 확정. **유일한 그림 결정 지점**.
 * / Pure: complete geometry → draw list. Colors/patterns finalized via palette. The sole drawing-decision point.
 *
 * @param model - 차트 데이터 모델 / Chart data model
 * @param spec - 렌더 스펙 / Render spec
 * @param geometry - 공유 기하(computeChartGeometry 산출) / Shared geometry
 * @param hidden - 숨긴 series 인덱스 / Hidden series indices
 * @returns 타깃 무관 장면 / Target-agnostic scene
 */
export function buildChartScene(
  model: ChartDataModel,
  spec: ChartRenderSpec,
  geometry: ChartGeometry,
  hidden: ReadonlySet<number> = new Set(),
): ChartScene {
  const theme = spec.theme;
  const bg = theme?.bg || '#ffffff';
  const gridColor = theme?.gridLine || theme?.border || '#e0e0e0';
  const textColor = theme?.text || '#212121';
  const font = fontOf(spec);
  const styles = stylesOf(model, spec);
  const prims: DrawPrim[] = [];
  const { plot } = geometry;
  const type = spec.type;

  if (isPieLike(type)) {
    buildPiePrims(prims, model, spec, geometry, styles, textColor, font);
  } else {
    // 축·그리드선·y틱 라벨(§8.1).
    for (const t of geometry.yTicks) {
      prims.push({ k: 'line', x1: plot.x, y1: t.px, x2: plot.x + plot.w, y2: t.px, stroke: gridColor, width: 1 });
      prims.push({ k: 'text', x: plot.x - 6, y: t.px, s: t.label, fill: textColor, align: 'end', baseline: 'middle', font });
    }
    // x축 카테고리 라벨.
    for (const xl of geometry.xLabels) {
      prims.push({ k: 'text', x: xl.px, y: plot.y + plot.h + 6, s: xl.label, fill: textColor, align: 'center', baseline: 'top', font });
    }
    // 데이터.
    if (isLineLike(type)) buildLinePrims(prims, model, spec, geometry, styles, hidden);
    else buildBarPrims(prims, geometry, styles);
  }

  // 범례(색 스와치 + 패턴명 병기, §9.2).
  for (const box of geometry.legend) {
    const st = styles[box.seriesIndex];
    if (!st) continue;
    prims.push({ k: 'rect', x: box.x, y: box.y, w: 12, h: 12, fill: st.color, pattern: st.pattern });
    prims.push({ k: 'text', x: box.x + 18, y: box.y + 6, s: `${box.label} (${st.pattern})`, fill: textColor, align: 'start', baseline: 'middle', font });
  }

  // scene 크기 = 기하가 유도된 원 크기(plot + PLOT_PAD 로 정확 복원).
  const width = geometry.plot.x + geometry.plot.w + PLOT_PAD.right;
  const height = geometry.plot.y + geometry.plot.h + PLOT_PAD.bottom;
  return { width, height, bg, prims, geometry, meta: model.meta };
}

function buildBarPrims(prims: DrawPrim[], geometry: ChartGeometry, styles: ReturnType<typeof stylesOf>): void {
  for (const g of geometry.points) {
    const st = styles[g.seriesIndex];
    if (!st) continue;
    prims.push({ k: 'rect', x: g.x, y: g.y, w: g.w, h: g.h, fill: st.color, pattern: st.pattern });
  }
}

function buildLinePrims(
  prims: DrawPrim[], model: ChartDataModel, spec: ChartRenderSpec, geometry: ChartGeometry,
  styles: ReturnType<typeof stylesOf>, hidden: ReadonlySet<number>,
): void {
  const visible = model.series.map((s, si) => ({ s, si })).filter(({ si }) => !hidden.has(si));
  const bySeries = new Map<number, typeof geometry.points[number][]>();
  for (const g of geometry.points) {
    let arr = bySeries.get(g.seriesIndex);
    if (!arr) { arr = []; bySeries.set(g.seriesIndex, arr); }
    arr.push(g);
  }
  for (const { s, si } of visible) {
    const st = styles[si];
    if (!st) continue;
    const gs = (bySeries.get(si) ?? []).slice().sort((a, b) => a.categoryIndex - b.categoryIndex);
    // 결측(null)에서 선을 끊는다(§9.3.3): 연속 categoryIndex 구간별 polyline 세그먼트.
    let seg: Array<readonly [number, number]> = [];
    let prevCat = -2;
    const flush = (): void => {
      if (seg.length >= 2) prims.push({ k: 'polyline', pts: seg, stroke: st.color, width: 2, dash: dashFor(st.pattern) });
      seg = [];
    };
    for (const g of gs) {
      if (g.categoryIndex !== prevCat + 1) flush();
      seg.push([g.cx, g.cy]);
      prevCat = g.categoryIndex;
    }
    flush();
    // 마커(모든 실 데이터포인트).
    for (const g of gs) prims.push({ k: 'circle', cx: g.cx, cy: g.cy, r: MARKER_R, fill: st.color });
  }
  void model; void spec;
}

function buildPiePrims(
  prims: DrawPrim[], model: ChartDataModel, spec: ChartRenderSpec, geometry: ChartGeometry,
  styles: ReturnType<typeof stylesOf>, textColor: string, font: string,
): void {
  const slices = geometry.pie ?? [];
  const plot = geometry.plot;
  const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2;
  const r = Math.max(1, Math.min(plot.w, plot.h) / 2);
  // 슬라이스 색은 series 가 아니라 category 순환(pie 는 카테고리별 조각).
  const styleAt = (i: number) => styles[i % Math.max(1, styles.length)] ?? styles[0];
  slices.forEach(sl => {
    const st = styleAt(sl.index);
    prims.push({ k: 'arc', cx, cy, r, a0: sl.a0, a1: sl.a1, fill: st?.color ?? '#0072B2', pattern: st?.pattern });
    const label = model.categories[sl.index];
    if (label != null) prims.push({ k: 'text', x: sl.cx, y: sl.cy, s: String(label), fill: textColor, align: 'center', baseline: 'middle', font });
  });
  void spec;
}

/**
 * 타깃 통일 진입점 — 계산은 공유(geometry+scene), surface 만 분기(§2.4). scene 반환(파리티 골든·hit-test).
 * / Unified render entry — computation shared (geometry+scene), only the surface branches. Returns
 * the scene (parity golden / hit-test).
 *
 * @param model - 차트 데이터 모델 / Chart data model
 * @param spec - 렌더 스펙 / Render spec
 * @param size - 렌더 크기 / Render size
 * @param surface - 타깃 surface(humble) / Target surface (humble)
 * @param hidden - 숨긴 series 인덱스 / Hidden series indices
 * @returns 소비된 장면 / The consumed scene
 */
export function renderChart(
  model: ChartDataModel,
  spec: ChartRenderSpec,
  size: { width: number; height: number },
  surface: RenderSurface,
  hidden: ReadonlySet<number> = new Set(),
): ChartScene {
  const geo = computeChartGeometry(model, spec, size, hidden);
  const scene = buildChartScene(model, spec, geo, hidden);
  surface.paint(scene);
  return scene;
}

/** scene 텍스처 오버레이 재노출(surface 공유). / Re-export texture overlay for surfaces. */
export { patternOverlay, dashFor };
