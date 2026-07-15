// ============================================================
// F4(통합 차트) — 그리드 데이터를 화면 렌더러와 무관하게(헤드리스) 다루기 위한 타입 계약.
// / F4 (integrated chart) — headless (renderer-agnostic) type contract for charting grid data.
//
// 데이터 흐름(니시다 스타일) / Data-flow overview:
//   그리드의 범위·선택·체크·전체 데이터(ChartSource)
//     → 추출·정규화(DataExtractor.ts, 이 파일 밖)로 카테고리/시리즈 배열(ChartDataModel)을 만들고
//     → 렌더 어댑터(ChartAdapter — 내장 canvas 또는 외부 라이브러리)가 화면에 그린다.
//   / Grid range/selection/checked/all data (ChartSource)
//     → extracted & normalized by DataExtractor.ts (outside this file) into categories/series
//       (ChartDataModel)
//     → drawn on screen by a render adapter (ChartAdapter — built-in canvas or an external lib).
//
// 이 파일은 "추출과 렌더는 분리된 단계"라는 원칙 아래, 그 사이를 잇는 lib-중립 중간형과 어댑터
// 인터페이스만 정의한다(추출·렌더 로직 자체는 다른 파일에 있다).
// / Under the principle that extraction and rendering are separate stages, this file only
// defines the lib-neutral intermediate shape and adapter interface that connect them (the
// extraction/render logic itself lives elsewhere).
//
// 설계 근거(구현 참고용): docs/design/grid-features-2026-07/11_design_F4_v2.md §2.1(소스)·
// §2.4(중간형)·§3.1(어댑터 인터페이스)·§6(공개 API 타입), 15_cross_contracts.md C0.4/C0.5
// (CellRange 의미).
// ============================================================

import type { CellRange } from '../types.js';

// ── §4 지원 타입(MVP 축소, §3.0) ────────────────────────────────────────
/**
 * 그리드 데이터를 어떤 모양의 차트로 그릴지 고르는 값. / Picks which shape of chart to draw the
 * grid data as.
 *
 * 현재(Phase1 MVP) 실제로 렌더되는 값은 'bar'|'line' 뿐이다. 나머지는 Phase2/3 를 위해 타입만
 * 미리 선언해 둔 예약값이며 아직 구현되지 않았다.
 * / Right now (Phase1 MVP) only 'bar' and 'line' actually render. The rest are reserved values —
 * the type exists for Phase2/3 but nothing implements them yet.
 *
 * ⚠️ 'bar-stacked': 공개 타입으로는 노출돼 있지만, 내장(builtin-canvas) 렌더러는 아직 누적
 * 스택을 그리지 못한다 — 지정해도 'bar-grouped'와 똑같이 그룹형(막대를 나란히)으로 대신
 * 그려진다. 하위 호환을 위해(이미 이 값을 쓰는 코드가 깨지지 않도록) 타입 자체는 남겨 둔다.
 * / ⚠️ 'bar-stacked': exposed as a public type, but the built-in canvas renderer can't draw a
 * stacked bar yet — specifying it falls back to the same grouped (side-by-side) rendering as
 * 'bar-grouped'. The type itself is kept for backward compatibility, so existing code using this
 * value doesn't break.
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

/**
 * 차트 파이프라인의 첫 단계 — "그리드의 어느 데이터를 그릴 것인가"를 고른다.
 * / The first stage of the chart pipeline — picks which grid data to draw.
 *
 * `'range'`(지정 범위)·`'selection'`(현재 드래그 선택)·`'checked'`(체크된 행)·`'all'`(전체
 * 데이터) 는 "사용자가 화면에서 고른 것을 그대로 차트로" 만들 때 쓰고, `'columns'` 는 화면 선택과
 * 무관하게 카테고리/시리즈 컬럼을 코드로 직접 지정하고 싶을 때 쓴다.
 * / `'range'` (a given cell range), `'selection'` (the current drag selection), `'checked'`
 * (checked rows), and `'all'` (the whole dataset) turn whatever the user picked on screen
 * straight into a chart. `'columns'` is for when you want to specify the category/series columns
 * in code, independent of any on-screen selection.
 */
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
  // 색약 사용자를 위한 이중 부호화 지침(설계 근거 HANMS-19)에 따른 색 외 구분 무늬.
  /** 색만으로 시리즈를 구분하기 어려운 사용자(색약 등)를 위해, 색과 함께(또는 색 대신) 채움
   * 무늬로도 시리즈를 구분한다. 'solid'=무늬 없음(기본), 'hatch'=사선, 'dot'=점, 'cross'=십자.
   * / A fill pattern that distinguishes series by shape, not just color — for viewers who can't
   * rely on color alone (color-vision deficiency, etc.). 'solid' = no pattern (default),
   * 'hatch' = diagonal lines, 'dot' = dots, 'cross' = crosshatch. */
  pattern?: 'solid' | 'hatch' | 'dot' | 'cross';
}

/** 차트 데이터 모델 메타(출처·샘플링·집계 배지 정보). / Chart data model meta (source, sampling, aggregation badge info). */
export interface ChartDataModelMeta {
  /** 소스 종류. / Source kind. */
  sourceKind: ChartSource['kind'];
  /** 원본 포인트(행) 수. / Original point (row) count. */
  total: number;
  // 배지 표시 근거(설계 근거 §C) — true 일 때 UI가 "값이 줄여서 표현됐다"는 사실을 사용자에게
  // 숨기지 않고 배지로 고지한다.
  /** 원본 데이터가 LTTB 다운샘플링이나 카테고리 집계로 축약됐는가. true 면 화면에 그려진 값이
   * 원본 그대로가 아니라는 뜻이므로, 이 값을 보고 UI에서 축약 사실을 배지로 고지해야 한다.
   * / Whether the original data was reduced via LTTB downsampling or category aggregation. When
   * true, what's drawn on screen isn't the raw data verbatim — the UI should surface a badge
   * using this flag so the reduction isn't hidden from the viewer. */
  sampled: boolean;
  /** 다운샘플링 전 포인트 수. / Point count before downsampling. */
  sampledFrom?: number;
  /** 다운샘플링 후 포인트 수. / Point count after downsampling. */
  sampledTo?: number;
  /** 적용된 집계 연산. / Applied aggregation op. */
  aggregatedOp?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'custom';
  /** pie 에서 첫 시리즈만 사용됐는가. / Whether pie used only the first series. */
  pieReducedToFirst?: boolean;
  /** pie 에서 음수를 절댓값 처리했는가. / Whether pie used absolute values for negatives. */
  negativesAbsInPie?: boolean;
  // 접근성 하드 게이트(설계 근거 §B) — extractor 단계에서 무조건 채워, 렌더러가 접근성을 놓쳐도
  // 스크린리더 대체 텍스트가 항상 존재하도록 보장한다.
  /** 스크린리더 사용자를 위한 표 형태의 텍스트 등가물. 어떤 렌더 엔진(내장 canvas·외부 lib)을
   * 쓰든 추출(extractor) 단계에서 항상 채워지므로, 렌더러가 접근성을 신경 쓰지 않아도 이 값은
   * 항상 존재한다. / A table-shaped text alternative for screen-reader users. It's always filled
   * during extraction regardless of which render engine (built-in canvas or an external lib) is
   * used, so it's guaranteed to exist even if the renderer itself doesn't handle accessibility. */
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
 * 차트 렌더 어댑터(교체 seam) — 내장 canvas 렌더러와 외부 차트 라이브러리(ECharts 등) 백엔드를
 * 하나의 공통 인터페이스로 감싼다. 내장 렌더러로는 부족해서 다른 차트 라이브러리로 실제 그리는
 * 부분만 바꿔치기하고 싶을 때, 이 인터페이스를 구현해 `ChartConfig.engine`에 넘긴다.
 * / Chart render adapter (swap seam) — wraps the built-in canvas renderer and external chart
 * library backends (e.g. ECharts) behind one common interface. Implement this when the built-in
 * renderer isn't enough and you want to swap in a different charting library for the actual
 * drawing, then pass it via `ChartConfig.engine`.
 *
 * @example
 * const myAdapter: ChartAdapter = {
 *   id: 'my-echarts-adapter',
 *   // 차트 라이브러리 인스턴스 생성 / create the chart-lib instance
 *   async init(host, spec) { echartsInstance = echarts.init(host); },
 *   // model.categories/series 를 라이브러리 포맷으로 변환해 그리기 / map the model into the lib's format and draw
 *   render(model, spec) { echartsInstance.setOption(toEchartsOption(model, spec)); },
 *   // 라이브러리 resize 호출 / call the lib's resize
 *   resize(w, h) { echartsInstance.resize({ width: w, height: h }); },
 *   // 라이브러리 인스턴스 정리 / tear down the lib instance
 *   destroy() { echartsInstance.dispose(); },
 * };
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
/** `grid.createChart()`가 반환하는, 살아있는 차트를 다루는 핸들. 실제 구현체는 ChartManager.
 * 이 핸들로 타입 전환·갱신·이미지 추출·파기까지 차트의 생애주기 전체를 조작한다.
 * / The handle returned by `grid.createChart()` for controlling a live chart; implemented by
 * ChartManager. Use it to change type, refresh, export an image, and destroy — the chart's
 * whole lifecycle. */
export interface ChartInstance {
  /** 차트 인스턴스 id. / Chart instance id. */
  readonly id: string;
  /** 설정 패치 후 갱신. / Patch config and update. */
  update(patch?: Partial<ChartConfig>): void;
  // 설계 근거 §5.3 — 테마 전환은 이벤트를 발행하지 않으므로 refresh() 수동 재호출이 필요한 이유.
  /**
   * 모델을 재추출하고 렌더 스펙(테마 포함)을 다시 계산해 재렌더한다.
   * / Re-extract the model and recompute the render spec (incl. theme), then re-render.
   *
   * 그리드는 테마가 바뀌어도 별도 이벤트를 발행하지 않는다(`setTheme`/`setThemeVar`는 CSS만
   * 갱신). 그래서 다크모드 토글처럼 데이터는 그대로고 테마만 바뀐 경우, 열려 있는 각 차트에
   * 대해 이 메서드를 직접 호출해야 새 테마(색·글꼴·팔레트)가 반영된다. `update()`/`setType()`도
   * 내부적으로 이 경로를 그대로 탄다.
   * / The grid doesn't emit a dedicated event when only the theme changes (`setTheme`/
   * `setThemeVar` update CSS only). So after a pure theme switch with no data change — e.g. a
   * dark-mode toggle — call this on each open chart to apply the new theme (colors, fonts,
   * palette). `update()` and `setType()` internally follow the same path.
   */
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

// 설계 근거 C5.1 — 옵션을 GridOptions 최상위에 낱개로 흩어놓지 않고 chart 하나로 묶어
// GridOptions 네임스페이스 충돌과 옵션 나열을 막는다.
/** `GridOptions.chart`에 중첩해서 넣는, 그리드 전체에 적용되는 차트 기본값. 그리드 인스턴스를
 * 만들 때 한 번 설정해 두면 이후 `createChart()` 호출마다 반복하지 않아도 되는 공통값(기본
 * 엔진·팔레트·포인트 상한 등)이다. / Chart defaults applied grid-wide, nested under
 * `GridOptions.chart`. Set once when constructing the grid, and every later `createChart()` call
 * inherits the shared defaults (default engine, palette, point cap, etc.) without repeating them. */
export interface ChartGlobalOptions {
  /** 차트 기능 활성화. / Enable the chart feature. */
  enabled?: boolean;
  /** 기본 렌더 엔진. / Default render engine. */
  defaultEngine?: 'builtin' | 'chartjs' | 'echarts';
  /** 기본 차트 타입. / Default chart type. */
  defaultType?: ChartType;
  /** 기본 배치 방식. / Default placement. */
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  /** 렌더 포인트 상한(초과 시 다운샘플링). / Max render points (downsample above this). */
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
/**
 * `grid.createChart(config)`에 넘기는 공개 설정. 어떤 데이터를(source) 어떤 모양으로(type)
 * 그릴지가 필수고, 나머지는 배치·엔진·꾸밈(제목/범례/축 등)을 위한 선택 옵션이다.
 * / The public config passed to `grid.createChart(config)`. Only which data (source) and what
 * shape (type) to draw are required; the rest are optional placement/engine/decoration
 * (title, legend, axis, etc.) settings.
 *
 * @example
 * const chart = grid.createChart({
 *   source: { kind: 'all' },
 *   type: 'bar',
 *   category: 'region',
 *   series: ['sales'],
 *   placement: 'inline',
 *   mount: document.querySelector('#chart-host')!,
 * });
 */
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
