/**
 * F4 — 그리드 데이터 통합 차트: 헤드리스 코어 타입.
 *
 * 계약 근거: docs/design/grid-features-2026-07/11_design_F4_v2.md §2.1(소스)·§2.4(중간형)·
 * §3.1(어댑터 인터페이스)·§6(공개 API 타입), 15_cross_contracts.md C0.4/C0.5(CellRange 의미).
 *
 * 이 파일은 "추출≠렌더" 3단 분리(§2)의 lib-중립 중간형만 정의한다. 실제 추출은
 * DataExtractor.ts, 렌더는 CanvasAdapter.ts(및 향후 lazy 어댑터)가 담당한다.
 */

import type { CellRange } from '../types.js';

// ── §4 지원 타입(MVP 축소, §3.0) ────────────────────────────────────────
/**
 * Phase1 MVP = 'bar'|'line'. 나머지는 Phase2/3 예약(타입만 선언, 미구현).
 *
 * ⚠️ 'bar-stacked': 공개 타입으로 노출되어 있으나 내장(builtin-canvas) 렌더러는 현재 스택
 * 누적을 구현하지 않는다 — 지정해도 'bar-grouped'와 동일하게 그룹형(side-by-side)으로
 * 폴백 렌더된다(CanvasAdapter._computeGeometry). 하위호환을 위해 타입 자체는 유지한다.
 */
export type ChartType =
  | 'bar' | 'line'
  | 'area' | 'pie' | 'doughnut' | 'bar-stacked' | 'bar-grouped';

// ── §2.1 소스 계약 (C0.4/C0.5 반영) ─────────────────────────────────────
export interface ChartSeriesSpec {
  field: string;
  name?: string;
  color?: string;
  pattern?: ChartSeries['pattern'];
  type?: 'bar' | 'line' | 'area';
}

export type ChartSource =
  | { kind: 'range'; range?: CellRange }
  | { kind: 'selection' }
  | { kind: 'checked' }
  | { kind: 'all' }
  | { kind: 'columns'; category?: string; series: Array<string | ChartSeriesSpec> };

export type ChartAggregateOp = 'sum' | 'avg' | 'count' | 'min' | 'max';
export type ChartAggregate = ChartAggregateOp | ((values: number[], category: string) => number);

// ── §2.4 중간형 (lib 중립) ───────────────────────────────────────────────
export interface A11yTableModel {
  /** aria-label 요약 캡션 */
  caption: string;
  /** ['category', ...series names] */
  colHeaders: string[];
  /** [category, v1, v2, ...] — locale 포맷 문자열 */
  rows: string[][];
}

export interface ChartSeries {
  /** 범례 라벨(기본값 = 원본 컬럼 header/field) */
  name: string;
  /** categories 와 동일 순서로 정렬. 결측=null */
  data: Array<number | null>;
  color?: string;
  /** 색 외 구분(HANMS-19) */
  pattern?: 'solid' | 'hatch' | 'dot' | 'cross';
}

export interface ChartDataModelMeta {
  sourceKind: ChartSource['kind'];
  /** 원본 포인트(행) 수 */
  total: number;
  /** LTTB 다운샘플 또는 category 집계로 축약됐는가 → 배지(§C) */
  sampled: boolean;
  sampledFrom?: number;
  sampledTo?: number;
  aggregatedOp?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'custom';
  pieReducedToFirst?: boolean;
  negativesAbsInPie?: boolean;
  /** SR 폴백 — extractor 가 렌더러와 무관하게 항상 채운다(§B 하드 게이트) */
  a11yTable: A11yTableModel;
}

export interface ChartDataModel {
  categories: string[];
  series: ChartSeries[];
  meta: ChartDataModelMeta;
}

// ── §3.1 어댑터 인터페이스(교체 seam) ────────────────────────────────────
export interface ChartTheme {
  primary: string;
  border: string;
  text: string;
  bg: string;
  gridLine: string;
  fontFamily: string;
  fontSize: number;
  palette: string[];
}

export interface ChartRenderSpec {
  type: ChartType;
  title?: string;
  legend?: boolean | { position: 'top' | 'bottom' | 'left' | 'right' };
  tooltip?: boolean;
  axis?: { xLabel?: string; yLabel?: string; yMin?: number; yMax?: number; stacked?: boolean };
  palette?: string[];
  theme: ChartTheme;
  numberFormat?: (v: number, ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }) => string;
  a11y: A11yTableModel;
}

export interface ChartPoint {
  seriesName: string;
  category: string;
  value: number | null;
  index: number;
  rowId?: string;
}

export interface ChartAdapter {
  readonly id: string;
  init(host: HTMLElement, spec: ChartRenderSpec): Promise<void>;
  render(model: ChartDataModel, spec: ChartRenderSpec): void;
  resize(width: number, height: number): void;
  toBlob?(mime?: string): Promise<Blob | null>;
  onPointClick?(cb: (p: ChartPoint) => void): void;
  destroy(): void;
}

// ── §6 인스턴스 핸들 + 전역 옵션(C5) ────────────────────────────────────
/** createChart 반환 핸들(§6). 구현은 ChartManager. */
export interface ChartInstance {
  readonly id: string;
  update(patch?: Partial<ChartConfig>): void;
  /**
   * 모델을 재추출하고 렌더 스펙(테마 포함)을 재스냅샷해 재렌더한다(§5.3). 그리드는 테마 변경
   * 이벤트를 발행하지 않으므로(`setTheme`/`setThemeVar`는 CSS 만 갱신) 다크모드 토글처럼 데이터
   * 변화 없는 순수 테마 전환 후에는, 열려 있는 각 차트에 대해 이 메서드를 호출해야 새 테마
   * (색·글꼴·팔레트)가 재적용된다. `update()`/`setType()`도 내부적으로 동일 경로를 탄다.
   */
  refresh(): void;
  setType(type: ChartType): void;
  destroy(): void;
  toBlob(mime?: string): Promise<Blob | null>;
  getModel(): ChartDataModel;
  on(ev: 'chartRender' | 'chartPointClick', cb: (...a: any[]) => void): void;
}

/** GridOptions.chart 로 중첩되는 전역 옵션(C5.1, 최상위 flat 키 금지). */
export interface ChartGlobalOptions {
  enabled?: boolean;
  defaultEngine?: 'builtin' | 'chartjs' | 'echarts';
  defaultType?: ChartType;
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  maxPoints?: number;
  debounceMs?: number;
  palette?: string[];
  numberFormat?: (v: number, ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }) => string;
  onChartCreate?: (i: ChartInstance) => void;
  onChartRender?: (e: { id: string; model: ChartDataModel }) => void;
  onChartPointClick?: (e: { id: string; point: ChartPoint }) => void;
  onChartDestroy?: (e: { id: string }) => void;
}

// ── §6 공개 설정 ─────────────────────────────────────────────────────────
export interface ChartConfig {
  source: ChartSource;
  type: ChartType;
  engine?: 'builtin' | 'chartjs' | 'echarts' | ChartAdapter;
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  mount?: HTMLElement;
  category?: string;
  series?: Array<string | ChartSeriesSpec>;
  aggregate?: ChartAggregate;
  maxPoints?: number;
  live?: boolean;
  title?: string;
  legend?: ChartRenderSpec['legend'];
  tooltip?: boolean;
  axis?: ChartRenderSpec['axis'];
  palette?: string[];
  numberFormat?: ChartRenderSpec['numberFormat'];
  size?: { width: number; height: number };
}
