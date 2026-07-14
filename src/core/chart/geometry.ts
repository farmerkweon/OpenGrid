/**
 * DD-06 — 순수 계산 이음새(Humble Object 출력, DOM 무관). §2.1.
 * / DD-06 — pure computation seam (Humble Object output, DOM-agnostic). §2.1.
 *
 * 현 `CanvasAdapter._computeGeometry`/`_plotRect`/`_valueExtent` 의 좌표 수학을 canvas 밖으로
 * 추출한 **단일 진실원**이다. canvas/svg/server 세 타깃이 이 함수 하나를 공유하므로, 파리티는
 * "세 코드가 비슷하게 그린다"가 아니라 "세 타깃이 동일 기하를 소비한다"에서 구조적으로 나온다.
 * / The single source of truth for chart coordinate math, extracted out of `CanvasAdapter` so the
 * canvas/svg/server targets all consume one function — parity comes structurally from a shared
 * geometry, not from "three code paths drawing similarly".
 *
 * 불변식(§1 경계 불변식1): 이 모듈은 window/document/canvas 를 심볼조차 참조하지 않는다.
 * 라벨 폭은 `measureText` 금지 — 문자수×em 결정론 근사(파리티 핵심, §2.1 주석).
 * / Invariant: this module never references window/document/canvas — even as a symbol. Label width
 * uses NO `measureText`; it is a deterministic char-count × em approximation (the crux of parity).
 */

import type { ChartDataModel, ChartRenderSpec, ChartType } from './types.js';
import { niceScale, type NiceScale } from './scales.js';
import type { PointGeom } from './hittest.js';

/** 플롯 영역(축 안쪽 그리기 사각형). / Plot rectangle (inside axes). */
export interface PlotRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number; }

/** 축 틱 배치(값 + 픽셀 좌표 + 라벨). / Axis tick placement (value + pixel coord + label). */
export interface AxisTick { readonly value: number; readonly label: string; readonly px: number; }

/** x축 카테고리 라벨 배치. / x-axis category label placement. */
export interface XLabel { readonly index: number; readonly label: string; readonly px: number; }

/** 범례 항목 배치 박스(hit·포커스 대상, 세 타깃 공유). / Legend item box (shared hit/focus target). */
export interface LegendBox {
  readonly seriesIndex: number;
  readonly label: string;
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
}

/**
 * pie/doughnut 슬라이스 기하 — 값→각도 **선형 사상만**(반지름 인코딩 금지, §9.3.2 정직성).
 * / pie/doughnut slice geometry — value → angle **linear mapping only** (radius encoding banned).
 */
export interface PieSliceGeom {
  readonly index: number;
  /** 시작 각(라디안, 12시=-PI/2 기준 시계방향). / Start angle (rad, 12 o'clock = -PI/2, clockwise). */
  readonly a0: number;
  /** 끝 각. / End angle. */
  readonly a1: number;
  /** 원본 값(음수 절댓값 처리 전이 아니라, 각도 산정에 쓰인 절댓값). / Absolute value used for angle. */
  readonly value: number;
  /** 라벨 배치용 중앙 반경 지점. / Centroid point for label placement. */
  readonly cx: number; readonly cy: number;
}

/**
 * 차트 하나의 완전한 기하 — 세 타깃이 공유하는 좌표 진실원(§2.1).
 * PointGeom(hittest.ts) 을 그대로 재사용해 hit-test 정합을 보장한다.
 * / The complete geometry of one chart — the shared coordinate SSOT. Reuses PointGeom (hittest.ts)
 * verbatim to keep hit-test coherent.
 */
export interface ChartGeometry {
  readonly plot: PlotRect;
  readonly scale: NiceScale;
  readonly points: readonly PointGeom[];
  readonly yTicks: readonly AxisTick[];
  readonly xLabels: readonly XLabel[];
  readonly legend: readonly LegendBox[];
  /** 0 기준선 픽셀 y(정직성 §9.3.1 — 막대 축 절단 방지). / Baseline (value 0) pixel y. */
  readonly baselineY: number;
  /** pie/doughnut 슬라이스(해당 타입에서만). / pie/doughnut slices (only for those types). */
  readonly pie?: readonly PieSliceGeom[];
}

/** 기본 플롯 여백(현 CanvasAdapter 상수와 동일 — 기하 파리티). / Default plot padding (matches CanvasAdapter). */
export const PLOT_PAD = { top: 26, right: 14, bottom: 34, left: 52 } as const;
/** line/area 마커 반경(현 CanvasAdapter 와 동일). / line/area marker radius (matches CanvasAdapter). */
export const MARKER_R = 3.5;
/** 라벨 폭 근사 계수(em 당 문자폭, measureText 금지). / Label-width em coefficient (no measureText). */
export const EM_WIDTH_FACTOR = 0.6;

/** bar 계열 판정. / Whether the type is a bar family. */
function isBar(type: ChartType): boolean {
  return type === 'bar' || type === 'bar-stacked' || type === 'bar-grouped';
}
/** line 계열 판정(area 포함). / Whether the type is line-like (incl. area). */
function isLineLike(type: ChartType): boolean {
  return type === 'line' || type === 'area';
}
/** pie 계열 판정. / Whether the type is pie-like. */
function isPieLike(type: ChartType): boolean {
  return type === 'pie' || type === 'doughnut';
}

/**
 * 결정론적 텍스트 폭 근사(문자수×fontSize×em 계수). measureText 를 금지해 세 타깃 파리티를 지킨다.
 * / Deterministic text-width approximation (char-count × fontSize × em). Bans measureText to keep
 * the three targets in parity.
 */
export function estimateTextWidth(s: string, fontSize: number): number {
  return s.length * fontSize * EM_WIDTH_FACTOR;
}

/** 값 라벨 포맷(spec.numberFormat 소비, DD-04 위임). / Value label format (delegates to spec.numberFormat, DD-04). */
function fmtValue(v: number, spec: ChartRenderSpec, axis: 'x' | 'y' | 'tooltip' | 'legend'): string {
  return spec.numberFormat ? spec.numberFormat(v, { axis }) : String(v);
}

/** 가시 series 의 값 범위. bar 는 0 기준선을 강제 포함(§9.3.1). / Visible-series extent; bars force 0 (§9.3.1). */
function valueExtent(model: ChartDataModel, type: ChartType, hidden: ReadonlySet<number>): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  model.series.forEach((s, si) => {
    if (hidden.has(si)) return;
    for (const v of s.data) {
      if (v == null || Number.isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (isBar(type)) { min = Math.min(0, min); max = Math.max(0, max); }
  return { min, max };
}

/** 범례 박스 레이아웃(플롯 하단, 좌→우 흐름 후 줄바꿈). 형태는 결정론적. */
function layoutLegend(model: ChartDataModel, spec: ChartRenderSpec, plot: PlotRect, size: { width: number; height: number }): LegendBox[] {
  if (spec.legend === false) return [];
  const fs = spec.theme?.fontSize || 12;
  const swatch = 12, gap = 6, itemGap = 12, rowH = Math.max(16, fs + 6);
  const y0 = size.height - PLOT_PAD.bottom + rowH + 2;
  let cx = plot.x, cy = y0;
  const out: LegendBox[] = [];
  model.series.forEach((s, si) => {
    // 색 외 구분(§9.2): 범례 라벨에 패턴명이 병기되나, 패턴은 팔레트 해소(scene) 단계 소관이라
    // 기하 단계에서는 이름 기준 폭에 패턴명 여유(약 8자)를 더해 예약한다(결정론적 근사).
    const label = s.name;
    const w = swatch + gap + estimateTextWidth(label, fs) + 8 * fs * EM_WIDTH_FACTOR;
    if (cx + w > plot.x + plot.w && cx > plot.x) { cx = plot.x; cy += rowH; }
    out.push({ seriesIndex: si, label, x: cx, y: cy, w, h: rowH });
    cx += w + itemGap;
  });
  return out;
}

/**
 * 순수: (모델·스펙·크기·숨김집합) → 완전 기하. canvas/svg/server 공통 진입점(§2.1).
 * / Pure: (model, spec, size, hidden) → complete geometry. The common entry for canvas/svg/server.
 *
 * @param model - 차트 데이터 모델 / Chart data model
 * @param spec - 렌더 스펙(타입·테마·포맷) / Render spec (type, theme, format)
 * @param size - 렌더 크기(CSS px) / Render size (CSS px)
 * @param hidden - 숨긴 series 인덱스 집합(범례 토글) / Hidden series indices (legend toggle)
 * @returns 완전 기하(세 타깃 공유) / Complete geometry (shared by three targets)
 */
export function computeChartGeometry(
  model: ChartDataModel,
  spec: ChartRenderSpec,
  size: { width: number; height: number },
  hidden: ReadonlySet<number> = new Set(),
): ChartGeometry {
  const type = spec.type;
  const w = Math.max(80, Math.floor(size.width));
  const h = Math.max(60, Math.floor(size.height));
  const plot: PlotRect = {
    x: PLOT_PAD.left,
    y: PLOT_PAD.top,
    w: Math.max(1, w - PLOT_PAD.left - PLOT_PAD.right),
    h: Math.max(1, h - PLOT_PAD.top - PLOT_PAD.bottom),
  };

  // pie/doughnut — 축 없는 각도 기하(§9.3.2 선형 각도만).
  if (isPieLike(type)) {
    return computePieGeometry(model, spec, { w, h }, plot);
  }

  const { min, max } = valueExtent(model, type, hidden);
  const scale = niceScale(min, max, 6);
  const span = scale.max - scale.min || 1;
  const yOf = (v: number): number => plot.y + plot.h - ((v - scale.min) / span) * plot.h;
  const baselineY = yOf(0 < scale.min ? scale.min : 0 > scale.max ? scale.max : 0);

  const cats = model.categories;
  const n = cats.length || 1;
  const slot = plot.w / n;

  const yTicks: AxisTick[] = scale.ticks.map(v => ({ value: v, label: fmtValue(v, spec, 'y'), px: yOf(v) }));
  const xLabels: XLabel[] = cats.map((label, index) => ({ index, label: String(label), px: plot.x + slot * index + slot / 2 }));

  const points: PointGeom[] = [];
  const visible = model.series.map((s, si) => ({ s, si })).filter(({ si }) => !hidden.has(si));

  if (isLineLike(type)) {
    for (const { s, si } of visible) {
      s.data.forEach((v, ci) => {
        if (v == null || Number.isNaN(v)) return;
        const cx = plot.x + slot * ci + slot / 2;
        const cy = yOf(v);
        points.push({ seriesIndex: si, categoryIndex: ci, x: cx - MARKER_R, y: cy - MARKER_R, w: MARKER_R * 2, h: MARKER_R * 2, cx, cy });
      });
    }
  } else {
    // bar/bar-grouped/bar-stacked → side-by-side(현 코어 동작 보존). stacked 누적은 Phase2.
    const groupCount = visible.length || 1;
    const bandW = slot * 0.72;
    const barW = bandW / groupCount;
    visible.forEach(({ s, si }, gi) => {
      s.data.forEach((v, ci) => {
        if (v == null || Number.isNaN(v)) return;
        const bandX = plot.x + slot * ci + (slot - bandW) / 2;
        const x = bandX + barW * gi;
        const vy = yOf(v);
        const y = Math.min(vy, baselineY);
        const barH = Math.abs(baselineY - vy);
        points.push({ seriesIndex: si, categoryIndex: ci, x, y, w: barW, h: barH, cx: x + barW / 2, cy: y + barH / 2 });
      });
    });
  }

  return { plot, scale, points, yTicks, xLabels, legend: layoutLegend(model, spec, plot, { width: w, height: h }), baselineY };
}

/** pie/doughnut 각도 기하 — 첫 series·절댓값 각도(§9.3.2). */
function computePieGeometry(model: ChartDataModel, spec: ChartRenderSpec, size: { w: number; h: number }, plot: PlotRect): ChartGeometry {
  const series = model.series[0];
  const raw = series ? series.data : [];
  const vals = raw.map(v => (v == null || Number.isNaN(v) ? 0 : Math.abs(v)));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const r = Math.max(1, Math.min(plot.w, plot.h) / 2);
  const labelR = r * 0.6;
  let a = -Math.PI / 2; // 12시 시작
  const pie: PieSliceGeom[] = [];
  vals.forEach((value, index) => {
    const frac = value / total;
    const a0 = a;
    const a1 = a + frac * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    pie.push({ index, a0, a1, value, cx: cx + Math.cos(mid) * labelR, cy: cy + Math.sin(mid) * labelR });
    a = a1;
  });
  const scale = niceScale(0, total, 6);
  return {
    plot, scale, points: [], yTicks: [], xLabels: [],
    legend: layoutLegend(model, spec, plot, { width: size.w, height: size.h }),
    baselineY: cy, pie,
  };
}
