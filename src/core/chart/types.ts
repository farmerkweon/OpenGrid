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
/** 시리즈(컬럼) 명세. / Series (column) spec. */
export interface ChartSeriesSpec {
  /** 값 컬럼 field 명. / Value column field name. */
  field: string;
  /** 범례 라벨(기본 = 컬럼 header/field). / Legend label (default = column header/field). */
  name?: string;
  /** 시리즈 색. / Series color. */
  color?: string;
  /** 색 외 구분 패턴. / Non-color distinction pattern. */
  pattern?: ChartSeries['pattern'];
  /** 시리즈별 렌더 타입(혼합 차트). / Per-series render type (mixed charts). */
  type?: 'bar' | 'line' | 'area';
}

/** 차트 데이터 소스(범위/선택/체크/전체/컬럼 지정). / Chart data source (range/selection/checked/all/explicit columns). */
export type ChartSource =
  | { kind: 'range'; range?: CellRange }
  | { kind: 'selection' }
  | { kind: 'checked' }
  | { kind: 'all' }
  | { kind: 'columns'; category?: string; series: Array<string | ChartSeriesSpec> };

/** 카테고리 집계 연산. / Category aggregation operation. */
export type ChartAggregateOp = 'sum' | 'avg' | 'count' | 'min' | 'max';
/** 집계 연산 또는 커스텀 리듀서. / An aggregation op or a custom reducer. */
export type ChartAggregate = ChartAggregateOp | ((values: number[], category: string) => number);

// ── §2.4 중간형 (lib 중립) ───────────────────────────────────────────────
/** 접근성(SR) 테이블 모델 — 스크린리더 폴백. / Accessibility (SR) table model — screen-reader fallback. */
export interface A11yTableModel {
  /** aria-label 요약 캡션. / aria-label summary caption. */
  caption: string;
  /** ['category', ...series names] */
  colHeaders: string[];
  /** [category, v1, v2, ...] — locale 포맷 문자열. / [category, v1, v2, ...] — locale-formatted strings. */
  rows: string[][];
}

/** 차트 시리즈(정규화된 값 배열). / Chart series (normalized value array). */
export interface ChartSeries {
  /** 범례 라벨(기본값 = 원본 컬럼 header/field). / Legend label (default = source column header/field). */
  name: string;
  /** categories 와 동일 순서로 정렬. 결측=null. / Aligned to categories order; missing = null. */
  data: Array<number | null>;
  /** 시리즈 색. / Series color. */
  color?: string;
  /** 색 외 구분(HANMS-19). / Non-color distinction (HANMS-19). */
  pattern?: 'solid' | 'hatch' | 'dot' | 'cross';
}

/** 차트 데이터 모델 메타(출처·샘플링·집계 배지 정보). / Chart data model meta (source, sampling, aggregation badge info). */
export interface ChartDataModelMeta {
  /** 소스 종류. / Source kind. */
  sourceKind: ChartSource['kind'];
  /** 원본 포인트(행) 수. / Original point (row) count. */
  total: number;
  /** LTTB 다운샘플 또는 category 집계로 축약됐는가 → 배지(§C). / Whether reduced by LTTB downsample or category aggregation → badge (§C). */
  sampled: boolean;
  /** 다운샘플 전 포인트 수. / Point count before downsampling. */
  sampledFrom?: number;
  /** 다운샘플 후 포인트 수. / Point count after downsampling. */
  sampledTo?: number;
  /** 적용된 집계 연산. / Applied aggregation op. */
  aggregatedOp?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'custom';
  /** pie 에서 첫 시리즈만 사용됐는가. / Whether pie used only the first series. */
  pieReducedToFirst?: boolean;
  /** pie 에서 음수를 절댓값 처리했는가. / Whether pie used absolute values for negatives. */
  negativesAbsInPie?: boolean;
  /** SR 폴백 — extractor 가 렌더러와 무관하게 항상 채운다(§B 하드 게이트). / SR fallback — always filled by the extractor regardless of renderer (§B hard gate). */
  a11yTable: A11yTableModel;
}

/** 헤드리스 차트 데이터 모델(추출 산출물). / Headless chart data model (extraction output). */
export interface ChartDataModel {
  /** 카테고리(x축) 라벨. / Category (x-axis) labels. */
  categories: string[];
  /** 시리즈 배열. / Series array. */
  series: ChartSeries[];
  /** 모델 메타. / Model meta. */
  meta: ChartDataModelMeta;
}

// ── §3.1 어댑터 인터페이스(교체 seam) ────────────────────────────────────
/** 차트 테마(색·글꼴·팔레트). / Chart theme (colors, fonts, palette). */
export interface ChartTheme {
  /** 주 색. / Primary color. */
  primary: string;
  /** 축·테두리 색. / Axis/border color. */
  border: string;
  /** 텍스트 색. / Text color. */
  text: string;
  /** 배경 색. / Background color. */
  bg: string;
  /** 그리드 선 색. / Grid line color. */
  gridLine: string;
  /** 글꼴 패밀리. / Font family. */
  fontFamily: string;
  /** 기본 글꼴 크기(px). / Base font size in px. */
  fontSize: number;
  /** 시리즈 순환 팔레트. / Series-cycling palette. */
  palette: string[];
}

/** 렌더 스펙(어댑터에 전달되는 스냅샷). / Render spec (snapshot passed to adapters). */
export interface ChartRenderSpec {
  /** 차트 타입. / Chart type. */
  type: ChartType;
  /** 차트 제목. / Chart title. */
  title?: string;
  /** 범례 표시/위치. / Legend visibility/position. */
  legend?: boolean | { position: 'top' | 'bottom' | 'left' | 'right' };
  /** 툴팁 사용 여부. / Whether tooltips are enabled. */
  tooltip?: boolean;
  /** 축 설정(라벨·min/max·스택). / Axis config (labels, min/max, stacked). */
  axis?: { xLabel?: string; yLabel?: string; yMin?: number; yMax?: number; stacked?: boolean };
  /** 시리즈 팔레트(테마 팔레트 오버라이드). / Series palette (overrides theme palette). */
  palette?: string[];
  /** 렌더 테마. / Render theme. */
  theme: ChartTheme;
  /** 숫자 포맷터(축/툴팁/범례 컨텍스트). / Number formatter (axis/tooltip/legend context). */
  numberFormat?: (v: number, ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }) => string;
  /** 접근성 테이블 모델. / Accessibility table model. */
  a11y: A11yTableModel;
}

/** 차트 포인트(히트테스트/클릭 대상). / Chart point (hit-test/click target). */
export interface ChartPoint {
  /** 시리즈 이름. / Series name. */
  seriesName: string;
  /** 카테고리 라벨. / Category label. */
  category: string;
  /** 값(결측 null). / Value (null if missing). */
  value: number | null;
  /** 카테고리 인덱스. / Category index. */
  index: number;
  /** 원본 행 stable id(있으면). / Source row stable id (if any). */
  rowId?: string;
}

/**
 * 차트 렌더 어댑터(교체 seam) — 내장 canvas / 외부 lib 백엔드를 통일된 인터페이스로 감싼다.
 * / Chart render adapter (swap seam) — wraps the built-in canvas / external-lib backends behind one interface.
 */
export interface ChartAdapter {
  /** 어댑터 식별자. / Adapter identifier. */
  readonly id: string;
  /** 호스트에 초기화. / Initialize into the host. */
  init(host: HTMLElement, spec: ChartRenderSpec): Promise<void>;
  /** 모델을 렌더. / Render the model. */
  render(model: ChartDataModel, spec: ChartRenderSpec): void;
  /** 렌더 영역 크기 변경. / Resize the render area. */
  resize(width: number, height: number): void;
  /** 현재 렌더를 이미지 Blob 으로(선택). / Export current render as an image Blob (optional). */
  toBlob?(mime?: string): Promise<Blob | null>;
  /** 포인트 클릭 콜백 등록(선택). / Register a point-click callback (optional). */
  onPointClick?(cb: (p: ChartPoint) => void): void;
  /** 어댑터 정리. / Tear down the adapter. */
  destroy(): void;
}

// ── §6 인스턴스 핸들 + 전역 옵션(C5) ────────────────────────────────────
/** createChart 반환 핸들(§6). 구현은 ChartManager. / Handle returned by createChart (§6); implemented by ChartManager. */
export interface ChartInstance {
  /** 차트 인스턴스 id. / Chart instance id. */
  readonly id: string;
  /** 설정 패치 후 갱신. / Patch config and update. */
  update(patch?: Partial<ChartConfig>): void;
  /**
   * 모델을 재추출하고 렌더 스펙(테마 포함)을 재스냅샷해 재렌더한다(§5.3). 그리드는 테마 변경
   * 이벤트를 발행하지 않으므로(`setTheme`/`setThemeVar`는 CSS 만 갱신) 다크모드 토글처럼 데이터
   * 변화 없는 순수 테마 전환 후에는, 열려 있는 각 차트에 대해 이 메서드를 호출해야 새 테마
   * (색·글꼴·팔레트)가 재적용된다. `update()`/`setType()`도 내부적으로 동일 경로를 탄다.
   */
  /** 모델을 재추출하고 렌더 스펙(테마 포함)을 재스냅샷해 재렌더. / Re-extract the model and re-snapshot the render spec (incl. theme), then re-render. */
  refresh(): void;
  /** 차트 타입 변경. / Change the chart type. */
  setType(type: ChartType): void;
  /** 차트 인스턴스 파기. / Destroy the chart instance. */
  destroy(): void;
  /** 현재 렌더를 이미지 Blob 으로. / Export current render as an image Blob. */
  toBlob(mime?: string): Promise<Blob | null>;
  /** 현재 데이터 모델 반환. / Return the current data model. */
  getModel(): ChartDataModel;
  /** 차트 이벤트 리스너 등록. / Register a chart event listener. */
  on(ev: 'chartRender' | 'chartPointClick', cb: (...a: any[]) => void): void;
}

/** GridOptions.chart 로 중첩되는 전역 옵션(C5.1, 최상위 flat 키 금지). / Global options nested under GridOptions.chart (C5.1; no top-level flat keys). */
export interface ChartGlobalOptions {
  /** 차트 기능 활성화. / Enable the chart feature. */
  enabled?: boolean;
  /** 기본 렌더 엔진. / Default render engine. */
  defaultEngine?: 'builtin' | 'chartjs' | 'echarts';
  /** 기본 차트 타입. / Default chart type. */
  defaultType?: ChartType;
  /** 기본 배치 방식. / Default placement. */
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  /** 렌더 포인트 상한(초과 시 다운샘플). / Max render points (downsample above this). */
  maxPoints?: number;
  /** live 갱신 디바운스(ms). / Debounce for live updates (ms). */
  debounceMs?: number;
  /** 기본 팔레트. / Default palette. */
  palette?: string[];
  /** 기본 숫자 포맷터. / Default number formatter. */
  numberFormat?: (v: number, ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }) => string;
  /** 차트 생성 콜백. / Chart-create callback. */
  onChartCreate?: (i: ChartInstance) => void;
  /** 차트 렌더 콜백. / Chart-render callback. */
  onChartRender?: (e: { id: string; model: ChartDataModel }) => void;
  /** 포인트 클릭 콜백. / Point-click callback. */
  onChartPointClick?: (e: { id: string; point: ChartPoint }) => void;
  /** 차트 파기 콜백. / Chart-destroy callback. */
  onChartDestroy?: (e: { id: string }) => void;
}

// ── §6 공개 설정 ─────────────────────────────────────────────────────────
/** createChart() 공개 설정(§6). / Public config for createChart() (§6). */
export interface ChartConfig {
  /** 데이터 소스. / Data source. */
  source: ChartSource;
  /** 차트 타입. / Chart type. */
  type: ChartType;
  /** 렌더 엔진 또는 커스텀 어댑터. / Render engine or custom adapter. */
  engine?: 'builtin' | 'chartjs' | 'echarts' | ChartAdapter;
  /** 배치 방식. / Placement. */
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  /** inline/floating 시 마운트 대상. / Mount target for inline/floating. */
  mount?: HTMLElement;
  /** 카테고리(x축) 컬럼 field. / Category (x-axis) column field. */
  category?: string;
  /** 시리즈 명세 목록. / Series specs. */
  series?: Array<string | ChartSeriesSpec>;
  /** 카테고리 집계 연산. / Category aggregation op. */
  aggregate?: ChartAggregate;
  /** 렌더 포인트 상한. / Max render points. */
  maxPoints?: number;
  /** 데이터 변경 시 자동 갱신. / Auto-refresh on data changes. */
  live?: boolean;
  /** 차트 제목. / Chart title. */
  title?: string;
  /** 범례 설정. / Legend config. */
  legend?: ChartRenderSpec['legend'];
  /** 툴팁 사용 여부. / Whether tooltips are enabled. */
  tooltip?: boolean;
  /** 축 설정. / Axis config. */
  axis?: ChartRenderSpec['axis'];
  /** 시리즈 팔레트. / Series palette. */
  palette?: string[];
  /** 숫자 포맷터. / Number formatter. */
  numberFormat?: ChartRenderSpec['numberFormat'];
  /** 렌더 크기(px). / Render size (px). */
  size?: { width: number; height: number };
}
