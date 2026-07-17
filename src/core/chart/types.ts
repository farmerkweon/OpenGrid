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
 * 그리드 데이터를 어떤 모양의 차트로 그릴지 고르는 값.
 *
 * Picks which shape of chart to draw the grid data as.
 *
 * グリッドのデータをどの形のチャートで描くかを選ぶ値。
 *
 * 用于选择把表格数据绘制成哪种形态的图表。
 *
 * 현재(Phase1 MVP) 실제로 렌더되는 값은 'bar'|'line' 뿐이다. 나머지는 Phase2/3 를 위해 타입만
 * 미리 선언해 둔 예약값이며 아직 구현되지 않았다.
 *
 * Right now (Phase1 MVP) only 'bar' and 'line' actually render. The rest are reserved values —
 * the type exists for Phase2/3 but nothing implements them yet.
 *
 * 現在(Phase1 MVP)実際にレンダリングされる値は 'bar'|'line' だけです。残りは Phase2/3 のために
 * 型だけをあらかじめ宣言しておいた予約値であり、まだ実装されていません。
 *
 * 目前(Phase1 MVP)真正渲染的值只有 'bar'|'line'。其余是为 Phase2/3 预先声明类型的保留值,
 * 尚未实现。
 *
 * ⚠️ 'bar-stacked': 공개 타입으로는 노출돼 있지만, 내장(builtin-canvas) 렌더러는 아직 누적
 * 스택을 그리지 못한다 — 지정해도 'bar-grouped'와 똑같이 그룹형(막대를 나란히)으로 대신
 * 그려진다. 하위 호환을 위해(이미 이 값을 쓰는 코드가 깨지지 않도록) 타입 자체는 남겨 둔다.
 *
 * ⚠️ 'bar-stacked': exposed as a public type, but the built-in canvas renderer can't draw a
 * stacked bar yet — specifying it falls back to the same grouped (side-by-side) rendering as
 * 'bar-grouped'. The type itself is kept for backward compatibility, so existing code using this
 * value doesn't break.
 *
 * ⚠️ 'bar-stacked': 公開型としては露出していますが、内蔵(builtin-canvas)レンダラーはまだ積み上げ
 * スタックを描けません — 指定しても 'bar-grouped' と同じくグループ型(棒を横に並べる)で代わりに
 * 描かれます。下位互換のため(すでにこの値を使っているコードが壊れないように)型自体は残して
 * あります。
 *
 * ⚠️ 'bar-stacked':虽然作为公开类型对外暴露,但内置(builtin-canvas)渲染器还画不出堆叠 —
 * 即使指定它,也会像 'bar-grouped' 一样以分组形态(柱子并排)代为绘制。为了向后兼容
 * (不让已经使用该值的代码出错),类型本身予以保留。
 */
export type ChartType =
  | 'bar' | 'line'
  | 'area' | 'pie' | 'doughnut' | 'bar-stacked' | 'bar-grouped';

// ── §2.1 소스 계약 (C0.4/C0.5 반영) ─────────────────────────────────────
/**
 * 시리즈(컬럼) 명세.
 *
 * Series (column) spec.
 *
 * シリーズ(列)の仕様。
 *
 * 系列(列)的规格。
 */
export interface ChartSeriesSpec {
  /**
   * 값 컬럼 field 명.
   *
   * Value column field name.
   *
   * 値の列の field 名。
   *
   * 值列的 field 名。
   */
  field: string;
  /**
   * 범례 라벨(기본 = 컬럼 header/field).
   *
   * Legend label (default = column header/field).
   *
   * 凡例のラベル(既定 = 列の header/field)。
   *
   * 图例标签(默认 = 列的 header/field)。
   */
  name?: string;
  /**
   * 시리즈 색.
   *
   * Series color.
   *
   * シリーズの色。
   *
   * 系列的颜色。
   */
  color?: string;
  /**
   * 색 외 구분 패턴.
   *
   * Non-color distinction pattern.
   *
   * 色以外の区別パターン。
   *
   * 颜色之外的区分图案。
   */
  pattern?: ChartSeries['pattern'];
  /**
   * 시리즈별 렌더 타입(혼합 차트).
   *
   * Per-series render type (mixed charts).
   *
   * シリーズごとのレンダータイプ(混合チャート)。
   *
   * 每个系列的渲染类型(混合图表)。
   */
  type?: 'bar' | 'line' | 'area';
}

/**
 * 차트 파이프라인의 첫 단계 — "그리드의 어느 데이터를 그릴 것인가"를 고른다.
 *
 * The first stage of the chart pipeline — picks which grid data to draw.
 *
 * チャートパイプラインの最初の段階 — 「グリッドのどのデータを描くか」を選びます。
 *
 * 图表流水线的第一个阶段 — 选择「绘制表格的哪些数据」。
 *
 * `'range'`(지정 범위)·`'selection'`(현재 드래그 선택)·`'checked'`(체크된 행)·`'all'`(전체
 * 데이터) 는 "사용자가 화면에서 고른 것을 그대로 차트로" 만들 때 쓰고, `'columns'` 는 화면 선택과
 * 무관하게 카테고리/시리즈 컬럼을 코드로 직접 지정하고 싶을 때 쓴다.
 *
 * `'range'` (a given cell range), `'selection'` (the current drag selection), `'checked'`
 * (checked rows), and `'all'` (the whole dataset) turn whatever the user picked on screen
 * straight into a chart. `'columns'` is for when you want to specify the category/series columns
 * in code, independent of any on-screen selection.
 *
 * `'range'`(指定した範囲)・`'selection'`(現在のドラッグ選択)・`'checked'`(チェックされた行)・
 * `'all'`(全データ)は「ユーザーが画面で選んだものをそのままチャートに」するときに使い、
 * `'columns'` は画面の選択とは無関係にカテゴリー/シリーズの列をコードで直接指定したいときに
 * 使います。
 *
 * `'range'`(指定范围)、`'selection'`(当前拖拽选择)、`'checked'`(勾选的行)、`'all'`
 * (全部数据)用于把「用户在界面上选中的内容」原样做成图表;`'columns'` 用于不依赖界面选择、
 * 在代码中直接指定类别/系列列的场景。
 */
export type ChartSource =
  | { kind: 'range'; range?: CellRange }
  | { kind: 'selection' }
  | { kind: 'checked' }
  | { kind: 'all' }
  | { kind: 'columns'; category?: string; series: Array<string | ChartSeriesSpec> };

/**
 * 카테고리 집계 연산.
 *
 * Category aggregation operation.
 *
 * カテゴリーの集計演算。
 *
 * 类别的聚合运算。
 */
export type ChartAggregateOp = 'sum' | 'avg' | 'count' | 'min' | 'max';
/**
 * 집계 연산 또는 커스텀 리듀서.
 *
 * An aggregation op or a custom reducer.
 *
 * 集計演算、またはカスタムリデューサー。
 *
 * 聚合运算,或自定义归约器。
 */
export type ChartAggregate = ChartAggregateOp | ((values: number[], category: string) => number);

// ── §2.4 중간형 (lib 중립) ───────────────────────────────────────────────
/**
 * 접근성(SR) 테이블 모델 — 스크린리더 폴백.
 *
 * Accessibility (SR) table model — screen-reader fallback.
 *
 * アクセシビリティ(SR)のテーブルモデル — スクリーンリーダー向けフォールバック。
 *
 * 无障碍(SR)表格模型 — 面向屏幕阅读器的回退。
 */
export interface A11yTableModel {
  /**
   * aria-label 요약 캡션.
   *
   * aria-label summary caption.
   *
   * aria-label の要約キャプション。
   *
   * aria-label 的摘要标题。
   */
  caption: string;
  /** ['category', ...series names] */
  colHeaders: string[];
  /**
   * [category, v1, v2, ...] — locale 포맷 문자열.
   *
   * [category, v1, v2, ...] — locale-formatted strings.
   *
   * [category, v1, v2, ...] — locale 書式の文字列。
   *
   * [category, v1, v2, ...] — 按 locale 格式化的字符串。
   */
  rows: string[][];
}

/**
 * 차트 시리즈(정규화된 값 배열).
 *
 * Chart series (normalized value array).
 *
 * チャートのシリーズ(正規化された値の配列)。
 *
 * 图表系列(规范化后的值数组)。
 */
export interface ChartSeries {
  /**
   * 범례 라벨(기본값 = 원본 컬럼 header/field).
   *
   * Legend label (default = source column header/field).
   *
   * 凡例のラベル(既定値 = 元の列の header/field)。
   *
   * 图例标签(默认值 = 源列的 header/field)。
   */
  name: string;
  /**
   * categories 와 동일 순서로 정렬. 결측=null.
   *
   * Aligned to categories order; missing = null.
   *
   * categories と同じ順序に整列。欠測 = null。
   *
   * 与 categories 的顺序对齐;缺失 = null。
   */
  data: Array<number | null>;
  /**
   * 시리즈 색.
   *
   * Series color.
   *
   * シリーズの色。
   *
   * 系列的颜色。
   */
  color?: string;
  // 색약 사용자를 위한 이중 부호화 지침(설계 근거 HANMS-19)에 따른 색 외 구분 무늬.
  /**
   * 색만으로 시리즈를 구분하기 어려운 사용자(색약 등)를 위해, 색과 함께(또는 색 대신) 채움
   * 무늬로도 시리즈를 구분한다. 'solid'=무늬 없음(기본), 'hatch'=사선, 'dot'=점, 'cross'=십자.
   *
   * A fill pattern that distinguishes series alongside color — or in place of it — for viewers
   * who can't rely on color alone (color-vision deficiency, etc.). 'solid' = no pattern
   * (default), 'hatch' = diagonal lines, 'dot' = dots, 'cross' = crosshatch.
   *
   * 色だけではシリーズを区別しにくいユーザー(色覚特性など)のために、色とともに(または色の
   * 代わりに)塗りの模様でもシリーズを区別します。'solid'=模様なし(既定)、'hatch'=斜線、
   * 'dot'=点、'cross'=十字。
   *
   * 为仅凭颜色难以区分系列的用户(色觉障碍等),在颜色之外(或代替颜色)再用填充图案来区分
   * 系列。'solid' = 无图案(默认),'hatch' = 斜线,'dot' = 点,'cross' = 十字。
   */
  pattern?: 'solid' | 'hatch' | 'dot' | 'cross';
}

/**
 * 차트 데이터 모델 메타(출처·샘플링·집계 배지 정보).
 *
 * Chart data model meta (source, sampling, aggregation badge info).
 *
 * チャートデータモデルのメタ(出所・サンプリング・集計バッジの情報)。
 *
 * 图表数据模型的元信息(来源、采样、聚合徽章的信息)。
 */
export interface ChartDataModelMeta {
  /**
   * 소스 종류.
   *
   * Source kind.
   *
   * ソースの種類。
   *
   * 数据源的种类。
   */
  sourceKind: ChartSource['kind'];
  /**
   * 원본 포인트(행) 수.
   *
   * Original point (row) count.
   *
   * 元のポイント(行)の数。
   *
   * 原始点(行)的数量。
   */
  total: number;
  // 배지 표시 근거(설계 근거 §C) — true 일 때 UI가 "값이 줄여서 표현됐다"는 사실을 사용자에게
  // 숨기지 않고 배지로 고지한다.
  /**
   * 원본 데이터가 LTTB 다운샘플링이나 카테고리 집계로 축약됐는가. true 면 화면에 그려진 값이
   * 원본 그대로가 아니라는 뜻이므로, 이 값을 보고 UI에서 축약 사실을 배지로 고지해야 한다.
   *
   * Whether the original data was reduced via LTTB downsampling or category aggregation. When
   * true, what's drawn on screen isn't the raw data verbatim, so the UI should read this flag
   * and disclose the reduction with a badge.
   *
   * 元のデータが LTTB ダウンサンプリングやカテゴリー集計で縮約されたか。true なら画面に描かれた
   * 値が元のままではないという意味なので、この値を見て UI で縮約の事実をバッジとして知らせる
   * 必要があります。
   *
   * 原始数据是否经 LTTB 降采样或类别聚合而缩减。为 true 时,表示画面上绘制的值并非原始数据
   * 本身,因此应根据该值在 UI 中以徽章告知缩减的事实。
   */
  sampled: boolean;
  /**
   * 다운샘플링 전 포인트 수.
   *
   * Point count before downsampling.
   *
   * ダウンサンプリング前のポイント数。
   *
   * 降采样前的点数。
   */
  sampledFrom?: number;
  /**
   * 다운샘플링 후 포인트 수.
   *
   * Point count after downsampling.
   *
   * ダウンサンプリング後のポイント数。
   *
   * 降采样后的点数。
   */
  sampledTo?: number;
  /**
   * 적용된 집계 연산.
   *
   * Applied aggregation op.
   *
   * 適用された集計演算。
   *
   * 已应用的聚合运算。
   */
  aggregatedOp?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'custom';
  /**
   * pie 에서 첫 시리즈만 사용됐는가.
   *
   * Whether pie used only the first series.
   *
   * pie で最初のシリーズだけが使われたか。
   *
   * pie 是否只使用了第一个系列。
   */
  pieReducedToFirst?: boolean;
  /**
   * pie 에서 음수를 절댓값 처리했는가.
   *
   * Whether pie used absolute values for negatives.
   *
   * pie で負の数を絶対値として扱ったか。
   *
   * pie 是否把负数按绝对值处理。
   */
  negativesAbsInPie?: boolean;
  // 접근성 하드 게이트(설계 근거 §B) — extractor 단계에서 무조건 채워, 렌더러가 접근성을 놓쳐도
  // 스크린리더 대체 텍스트가 항상 존재하도록 보장한다.
  /**
   * 스크린리더 사용자를 위한 표 형태의 텍스트 등가물. 어떤 렌더 엔진(내장 canvas·외부 lib)을
   * 쓰든 추출(extractor) 단계에서 항상 채워지므로, 렌더러가 접근성을 신경 쓰지 않아도 이 값은
   * 항상 존재한다.
   *
   * A table-shaped text alternative for screen-reader users. It's always filled
   * during extraction regardless of which render engine (built-in canvas or an external lib) is
   * used, so it's guaranteed to exist even if the renderer itself doesn't handle accessibility.
   *
   * スクリーンリーダー利用者のための表形式のテキスト等価物。どのレンダーエンジン(内蔵 canvas・
   * 外部 lib)を使っても抽出(extractor)の段階で必ず埋められるので、レンダラーがアクセシビリティ
   * に気を配らなくてもこの値は常に存在します。
   *
   * 面向屏幕阅读器用户的表格形式文本等价物。无论使用哪种渲染引擎(内置 canvas、外部 lib),
   * 抽取(extractor)阶段总会填充该值,因此即使渲染器不关心无障碍,它也始终存在。
   */
  a11yTable: A11yTableModel;
}

/**
 * 헤드리스 차트 데이터 모델(추출 산출물).
 *
 * Headless chart data model (extraction output).
 *
 * ヘッドレスなチャートデータモデル(抽出の成果物)。
 *
 * 无头图表数据模型(抽取的产物)。
 */
export interface ChartDataModel {
  /**
   * 카테고리(x축) 라벨.
   *
   * Category (x-axis) labels.
   *
   * カテゴリー(x軸)のラベル。
   *
   * 类别(x轴)的标签。
   */
  categories: string[];
  /**
   * 시리즈 배열.
   *
   * Series array.
   *
   * シリーズの配列。
   *
   * 系列的数组。
   */
  series: ChartSeries[];
  /**
   * 모델 메타.
   *
   * Model meta.
   *
   * モデルのメタ。
   *
   * 模型的元信息。
   */
  meta: ChartDataModelMeta;
}

// ── §3.1 어댑터 인터페이스(교체 seam) ────────────────────────────────────
/**
 * 차트 테마(색·글꼴·팔레트).
 *
 * Chart theme (colors, fonts, palette).
 *
 * チャートのテーマ(色・フォント・パレット)。
 *
 * 图表主题(颜色、字体、调色板)。
 */
export interface ChartTheme {
  /**
   * 주 색.
   *
   * Primary color.
   *
   * 主要な色。
   *
   * 主色。
   */
  primary: string;
  /**
   * 축·테두리 색.
   *
   * Axis/border color.
   *
   * 軸・枠線の色。
   *
   * 轴/边框的颜色。
   */
  border: string;
  /**
   * 텍스트 색.
   *
   * Text color.
   *
   * テキストの色。
   *
   * 文本的颜色。
   */
  text: string;
  /**
   * 배경 색.
   *
   * Background color.
   *
   * 背景の色。
   *
   * 背景的颜色。
   */
  bg: string;
  /**
   * 그리드 선 색.
   *
   * Grid line color.
   *
   * グリッド線の色。
   *
   * 网格线的颜色。
   */
  gridLine: string;
  /**
   * 글꼴 패밀리.
   *
   * Font family.
   *
   * フォントファミリー。
   *
   * 字体族。
   */
  fontFamily: string;
  /**
   * 기본 글꼴 크기(px).
   *
   * Base font size in px.
   *
   * 基本のフォントサイズ(px)。
   *
   * 基础字号(px)。
   */
  fontSize: number;
  /**
   * 시리즈 순환 팔레트.
   *
   * Series-cycling palette.
   *
   * シリーズを循環させるパレット。
   *
   * 供系列循环使用的调色板。
   */
  palette: string[];
}

/**
 * 렌더 스펙(어댑터에 전달되는 스냅샷).
 *
 * Render spec (snapshot passed to adapters).
 *
 * レンダー仕様(アダプターに渡されるスナップショット)。
 *
 * 渲染规格(传给适配器的快照)。
 */
export interface ChartRenderSpec {
  /**
   * 차트 타입.
   *
   * Chart type.
   *
   * チャートのタイプ。
   *
   * 图表的类型。
   */
  type: ChartType;
  /**
   * 차트 제목.
   *
   * Chart title.
   *
   * チャートのタイトル。
   *
   * 图表的标题。
   */
  title?: string;
  /**
   * 범례 표시/위치.
   *
   * Legend visibility/position.
   *
   * 凡例の表示/位置。
   *
   * 图例的显示/位置。
   */
  legend?: boolean | { position: 'top' | 'bottom' | 'left' | 'right' };
  /**
   * 툴팁 사용 여부.
   *
   * Whether tooltips are enabled.
   *
   * ツールチップを使うかどうか。
   *
   * 是否启用提示框。
   */
  tooltip?: boolean;
  /**
   * 축 설정(라벨·min/max·스택).
   *
   * Axis config (labels, min/max, stacked).
   *
   * 軸の設定(ラベル・min/max・スタック)。
   *
   * 轴的配置(标签、min/max、堆叠)。
   */
  axis?: { xLabel?: string; yLabel?: string; yMin?: number; yMax?: number; stacked?: boolean };
  /**
   * 시리즈 팔레트(테마 팔레트 오버라이드).
   *
   * Series palette (overrides theme palette).
   *
   * シリーズのパレット(テーマのパレットを上書き)。
   *
   * 系列的调色板(覆盖主题的调色板)。
   */
  palette?: string[];
  /**
   * 렌더 테마.
   *
   * Render theme.
   *
   * レンダーのテーマ。
   *
   * 渲染的主题。
   */
  theme: ChartTheme;
  /**
   * 숫자 포맷터(축/툴팁/범례 컨텍스트).
   *
   * Number formatter (axis/tooltip/legend context).
   *
   * 数値のフォーマッター(軸/ツールチップ/凡例のコンテキスト)。
   *
   * 数值格式化函数(轴/提示框/图例的上下文)。
   */
  numberFormat?: (v: number, ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }) => string;
  /**
   * 접근성 테이블 모델.
   *
   * Accessibility table model.
   *
   * アクセシビリティのテーブルモデル。
   *
   * 无障碍表格模型。
   */
  a11y: A11yTableModel;
}

/**
 * 차트 포인트(히트테스트/클릭 대상).
 *
 * Chart point (hit-test/click target).
 *
 * チャートのポイント(ヒットテスト/クリックの対象)。
 *
 * 图表的点(命中测试/点击的目标)。
 */
export interface ChartPoint {
  /**
   * 시리즈 이름.
   *
   * Series name.
   *
   * シリーズの名前。
   *
   * 系列的名称。
   */
  seriesName: string;
  /**
   * 카테고리 라벨.
   *
   * Category label.
   *
   * カテゴリーのラベル。
   *
   * 类别的标签。
   */
  category: string;
  /**
   * 값(결측 null).
   *
   * Value (null if missing).
   *
   * 値(欠測は null)。
   *
   * 值(缺失为 null)。
   */
  value: number | null;
  /**
   * 카테고리 인덱스.
   *
   * Category index.
   *
   * カテゴリーのインデックス。
   *
   * 类别的索引。
   */
  index: number;
  /**
   * 원본 행 stable id(있으면).
   *
   * Source row stable id (if any).
   *
   * 元の行の stable id(あれば)。
   *
   * 源行的 stable id(如果有)。
   */
  rowId?: string;
}

/**
 * 차트 렌더 어댑터(교체 seam) — 내장 canvas 렌더러와 외부 차트 라이브러리(ECharts 등) 백엔드를
 * 하나의 공통 인터페이스로 감싼다. 내장 렌더러로는 부족해서 다른 차트 라이브러리로 실제 그리는
 * 부분만 바꿔치기하고 싶을 때, 이 인터페이스를 구현해 `ChartConfig.engine`에 넘긴다.
 *
 * Chart render adapter (swap seam) — wraps the built-in canvas renderer and external chart
 * library backends (e.g. ECharts) behind one common interface. Implement this when the built-in
 * renderer isn't enough and you want to swap in a different charting library for the actual
 * drawing, then pass it via `ChartConfig.engine`.
 *
 * チャートのレンダーアダプター(差し替えの seam) — 内蔵 canvas レンダラーと外部チャート
 * ライブラリ(ECharts など)のバックエンドを、一つの共通インターフェースで包みます。内蔵
 * レンダラーでは足りず、別のチャートライブラリで実際に描く部分だけを差し替えたいときに、この
 * インターフェースを実装して `ChartConfig.engine` に渡します。
 *
 * 图表渲染适配器(替换用的 seam) — 用一个共同的接口包裹内置 canvas 渲染器和外部图表库
 * (如 ECharts)后端。当内置渲染器不够用、只想把实际绘制的部分换成别的图表库时,实现该接口
 * 并传给 `ChartConfig.engine`。
 *
 * @example
 * const myAdapter: ChartAdapter = {
 *   id: 'my-echarts-adapter',
 *   // create the chart-lib instance
 *   async init(host, spec) { echartsInstance = echarts.init(host); },
 *   // map the model into the lib's format and draw
 *   render(model, spec) { echartsInstance.setOption(toEchartsOption(model, spec)); },
 *   // call the lib's resize
 *   resize(w, h) { echartsInstance.resize({ width: w, height: h }); },
 *   // tear down the lib instance
 *   destroy() { echartsInstance.dispose(); },
 * };
 */
export interface ChartAdapter {
  /**
   * 어댑터 식별자.
   *
   * Adapter identifier.
   *
   * アダプターの識別子。
   *
   * 适配器的标识符。
   */
  readonly id: string;
  /**
   * 호스트에 초기화.
   *
   * Initialize into the host.
   *
   * ホストへ初期化。
   *
   * 在宿主元素中初始化。
   */
  init(host: HTMLElement, spec: ChartRenderSpec): Promise<void>;
  /**
   * 모델을 렌더.
   *
   * Render the model.
   *
   * モデルをレンダー。
   *
   * 渲染模型。
   */
  render(model: ChartDataModel, spec: ChartRenderSpec): void;
  /**
   * 렌더 영역 크기 변경.
   *
   * Resize the render area.
   *
   * レンダー領域のサイズ変更。
   *
   * 调整渲染区域的大小。
   */
  resize(width: number, height: number): void;
  /**
   * 현재 렌더를 이미지 Blob 으로(선택).
   *
   * Export current render as an image Blob (optional).
   *
   * 現在のレンダーを画像 Blob として(任意)。
   *
   * 把当前渲染结果导出为图片 Blob(可选)。
   */
  toBlob?(mime?: string): Promise<Blob | null>;
  /**
   * 포인트 클릭 콜백 등록(선택).
   *
   * Register a point-click callback (optional).
   *
   * ポイントクリックのコールバック登録(任意)。
   *
   * 注册点位点击的回调(可选)。
   */
  onPointClick?(cb: (p: ChartPoint) => void): void;
  /**
   * 어댑터 정리.
   *
   * Tear down the adapter.
   *
   * アダプターの後始末。
   *
   * 清理适配器。
   */
  destroy(): void;
}

// ── §6 인스턴스 핸들 + 전역 옵션(C5) ────────────────────────────────────
/**
 * `grid.createChart()`가 반환하는, 살아있는 차트를 다루는 핸들. 실제 구현체는 ChartManager.
 * 이 핸들로 타입 전환·갱신·이미지 추출·파기까지 차트의 생애주기 전체를 조작한다.
 *
 * The handle returned by `grid.createChart()` for controlling a live chart; implemented by
 * ChartManager. Use it to change type, refresh, export an image, and destroy — the chart's
 * whole lifecycle.
 *
 * `grid.createChart()` が返す、生きているチャートを扱うハンドル。実際の実装は ChartManager。
 * このハンドルでタイプの切り替え・更新・画像の取り出し・破棄まで、チャートのライフサイクル
 * 全体を操作します。
 *
 * `grid.createChart()` 返回的句柄,用于操作活动中的图表;实际实现是 ChartManager。用它切换类型、
 * 更新、导出图片、销毁 — 操作图表的整个生命周期。
 */
export interface ChartInstance {
  /**
   * 차트 인스턴스 id.
   *
   * Chart instance id.
   *
   * チャートインスタンスの id。
   *
   * 图表实例的 id。
   */
  readonly id: string;
  /**
   * 설정 패치 후 갱신.
   *
   * Patch config and update.
   *
   * 設定をパッチしてから更新。
   *
   * 修补配置后更新。
   */
  update(patch?: Partial<ChartConfig>): void;
  // 설계 근거 §5.3 — 테마 전환은 이벤트를 발행하지 않으므로 refresh() 수동 재호출이 필요한 이유.
  /**
   * 모델을 재추출하고 렌더 스펙(테마 포함)을 다시 계산해 재렌더한다.
   *
   * Re-extract the model and recompute the render spec (incl. theme), then re-render.
   *
   * モデルを再抽出し、レンダー仕様(テーマを含む)を計算し直して再レンダーします。
   *
   * 重新抽取模型,重新计算渲染规格(含主题),然后重新渲染。
   *
   * 그리드는 테마가 바뀌어도 별도 이벤트를 발행하지 않는다(`setTheme`/`setThemeVar`는 CSS만
   * 갱신). 그래서 다크모드 토글처럼 데이터는 그대로고 테마만 바뀐 경우, 열려 있는 각 차트에
   * 대해 이 메서드를 직접 호출해야 새 테마(색·글꼴·팔레트)가 반영된다. `update()`/`setType()`도
   * 내부적으로 이 경로를 그대로 탄다.
   *
   * The grid doesn't emit a dedicated event when only the theme changes (`setTheme`/
   * `setThemeVar` update CSS only). So after a pure theme switch with no data change — e.g. a
   * dark-mode toggle — call this on each open chart to apply the new theme (colors, fonts,
   * palette). `update()` and `setType()` internally follow the same path.
   *
   * グリッドはテーマが変わっても別途イベントを発行しません(`setTheme`/`setThemeVar` は CSS
   * だけを更新)。そのため、ダークモードの切り替えのようにデータはそのままでテーマだけが
   * 変わった場合は、開いている各チャートに対してこのメソッドを直接呼ばないと新しいテーマ
   * (色・フォント・パレット)が反映されません。`update()`/`setType()` も内部的にこの経路を
   * そのまま通ります。
   *
   * 主题变化时表格不会发出专门的事件(`setTheme`/`setThemeVar` 只更新 CSS)。因此,像切换暗色
   * 模式那样数据不变、只有主题变化的情况下,必须对每个已打开的图表直接调用该方法,新主题
   * (颜色、字体、调色板)才会生效。`update()`/`setType()` 内部也走同一条路径。
   */
  refresh(): void;
  /**
   * 차트 타입 변경.
   *
   * Change the chart type.
   *
   * チャートタイプの変更。
   *
   * 变更图表的类型。
   */
  setType(type: ChartType): void;
  /**
   * 차트 인스턴스 파기.
   *
   * Destroy the chart instance.
   *
   * チャートインスタンスの破棄。
   *
   * 销毁图表实例。
   */
  destroy(): void;
  /**
   * 현재 렌더를 이미지 Blob 으로.
   *
   * Export current render as an image Blob.
   *
   * 現在のレンダーを画像 Blob として。
   *
   * 把当前渲染结果导出为图片 Blob。
   */
  toBlob(mime?: string): Promise<Blob | null>;
  /**
   * 현재 데이터 모델 반환.
   *
   * Return the current data model.
   *
   * 現在のデータモデルを返します。
   *
   * 返回当前的数据模型。
   */
  getModel(): ChartDataModel;
  /**
   * 차트 이벤트 리스너 등록.
   *
   * Register a chart event listener.
   *
   * チャートイベントのリスナー登録。
   *
   * 注册图表事件的监听器。
   */
  on(ev: 'chartRender' | 'chartPointClick', cb: (...a: any[]) => void): void;
}

// 설계 근거 C5.1 — 옵션을 GridOptions 최상위에 낱개로 흩어놓지 않고 chart 하나로 묶어
// GridOptions 네임스페이스 충돌과 옵션 나열을 막는다.
/**
 * `GridOptions.chart`에 중첩해서 넣는, 그리드 전체에 적용되는 차트 기본값. 그리드 인스턴스를
 * 만들 때 한 번 설정해 두면 이후 `createChart()` 호출마다 반복하지 않아도 되는 공통값(기본
 * 엔진·팔레트·포인트 상한 등)이다.
 *
 * Chart defaults applied grid-wide, nested under
 * `GridOptions.chart`. Set once when constructing the grid, and every later `createChart()` call
 * inherits the shared defaults (default engine, palette, point cap, etc.) without repeating them.
 *
 * `GridOptions.chart` に入れ子にして入れる、グリッド全体に適用されるチャートの既定値。グリッド
 * インスタンスを作るときに一度設定しておけば、以後の `createChart()` の呼び出しごとに繰り返さ
 * なくてよい共通の値(既定のエンジン・パレット・ポイント上限など)です。
 *
 * 嵌套在 `GridOptions.chart` 下、作用于整个表格的图表默认值。构建表格实例时设置一次,之后每次
 * 调用 `createChart()` 都无需重复填写这些共同的值(默认引擎、调色板、点数上限等)。
 */
export interface ChartGlobalOptions {
  /**
   * 차트 기능 활성화.
   *
   * Enable the chart feature.
   *
   * チャート機能の有効化。
   *
   * 启用图表功能。
   */
  enabled?: boolean;
  /**
   * 기본 렌더 엔진.
   *
   * Default render engine.
   *
   * 既定のレンダーエンジン。
   *
   * 默认的渲染引擎。
   */
  defaultEngine?: 'builtin' | 'chartjs' | 'echarts';
  /**
   * 기본 차트 타입.
   *
   * Default chart type.
   *
   * 既定のチャートタイプ。
   *
   * 默认的图表类型。
   */
  defaultType?: ChartType;
  /**
   * 기본 배치 방식.
   *
   * Default placement.
   *
   * 既定の配置方法。
   *
   * 默认的放置方式。
   */
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  /**
   * 렌더 포인트 상한(초과 시 다운샘플링).
   *
   * Max render points (downsample above this).
   *
   * レンダーするポイントの上限(超えたらダウンサンプリング)。
   *
   * 渲染点数的上限(超出则降采样)。
   */
  maxPoints?: number;
  /**
   * live 갱신 디바운스(ms).
   *
   * Debounce for live updates (ms).
   *
   * live 更新のデバウンス(ms)。
   *
   * live 更新的防抖(ms)。
   */
  debounceMs?: number;
  /**
   * 기본 팔레트.
   *
   * Default palette.
   *
   * 既定のパレット。
   *
   * 默认的调色板。
   */
  palette?: string[];
  /**
   * 기본 숫자 포맷터.
   *
   * Default number formatter.
   *
   * 既定の数値フォーマッター。
   *
   * 默认的数值格式化函数。
   */
  numberFormat?: (v: number, ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }) => string;
  /**
   * 차트 생성 콜백.
   *
   * Chart-create callback.
   *
   * チャート生成のコールバック。
   *
   * 图表创建的回调。
   */
  onChartCreate?: (i: ChartInstance) => void;
  /**
   * 차트 렌더 콜백.
   *
   * Chart-render callback.
   *
   * チャートレンダーのコールバック。
   *
   * 图表渲染的回调。
   */
  onChartRender?: (e: { id: string; model: ChartDataModel }) => void;
  /**
   * 포인트 클릭 콜백.
   *
   * Point-click callback.
   *
   * ポイントクリックのコールバック。
   *
   * 点位点击的回调。
   */
  onChartPointClick?: (e: { id: string; point: ChartPoint }) => void;
  /**
   * 차트 파기 콜백.
   *
   * Chart-destroy callback.
   *
   * チャート破棄のコールバック。
   *
   * 图表销毁的回调。
   */
  onChartDestroy?: (e: { id: string }) => void;
}

// ── §6 공개 설정 ─────────────────────────────────────────────────────────
/**
 * `grid.createChart(config)`에 넘기는 공개 설정. 어떤 데이터를(source) 어떤 모양으로(type)
 * 그릴지가 필수고, 나머지는 배치·엔진·꾸밈(제목/범례/축 등)을 위한 선택 옵션이다.
 *
 * The public config passed to `grid.createChart(config)`. Only which data (source) and what
 * shape (type) to draw are required; the rest are optional placement/engine/decoration
 * (title, legend, axis, etc.) settings.
 *
 * `grid.createChart(config)` に渡す公開設定。どのデータを(source)どの形で(type)描くかが必須で、
 * 残りは配置・エンジン・装飾(タイトル/凡例/軸など)のための任意オプションです。
 *
 * 传给 `grid.createChart(config)` 的公开配置。绘制哪些数据(source)、绘制成什么形态(type)是
 * 必填项;其余是用于放置、引擎、装饰(标题/图例/轴等)的可选项。
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
  /**
   * 데이터 소스.
   *
   * Data source.
   *
   * データソース。
   *
   * 数据源。
   */
  source: ChartSource;
  /**
   * 차트 타입.
   *
   * Chart type.
   *
   * チャートのタイプ。
   *
   * 图表的类型。
   */
  type: ChartType;
  /**
   * 렌더 엔진 또는 커스텀 어댑터.
   *
   * Render engine or custom adapter.
   *
   * レンダーエンジン、またはカスタムアダプター。
   *
   * 渲染引擎,或自定义适配器。
   */
  engine?: 'builtin' | 'chartjs' | 'echarts' | ChartAdapter;
  /**
   * 배치 방식.
   *
   * Placement.
   *
   * 配置方法。
   *
   * 放置方式。
   */
  placement?: 'docked' | 'modal' | 'inline' | 'floating';
  /**
   * inline/floating 시 마운트 대상.
   *
   * Mount target for inline/floating.
   *
   * inline/floating のときのマウント先。
   *
   * inline/floating 时的挂载目标。
   */
  mount?: HTMLElement;
  /**
   * 카테고리(x축) 컬럼 field.
   *
   * Category (x-axis) column field.
   *
   * カテゴリー(x軸)の列の field。
   *
   * 类别(x轴)列的 field。
   */
  category?: string;
  /**
   * 시리즈 명세 목록.
   *
   * Series specs.
   *
   * シリーズ仕様の一覧。
   *
   * 系列规格的列表。
   */
  series?: Array<string | ChartSeriesSpec>;
  /**
   * 카테고리 집계 연산.
   *
   * Category aggregation op.
   *
   * カテゴリーの集計演算。
   *
   * 类别的聚合运算。
   */
  aggregate?: ChartAggregate;
  /**
   * 렌더 포인트 상한.
   *
   * Max render points.
   *
   * レンダーするポイントの上限。
   *
   * 渲染点数的上限。
   */
  maxPoints?: number;
  /**
   * 데이터 변경 시 자동 갱신.
   *
   * Auto-refresh on data changes.
   *
   * データ変更時の自動更新。
   *
   * 数据变化时自动更新。
   */
  live?: boolean;
  /**
   * 차트 제목.
   *
   * Chart title.
   *
   * チャートのタイトル。
   *
   * 图表的标题。
   */
  title?: string;
  /**
   * 범례 설정.
   *
   * Legend config.
   *
   * 凡例の設定。
   *
   * 图例的配置。
   */
  legend?: ChartRenderSpec['legend'];
  /**
   * 툴팁 사용 여부.
   *
   * Whether tooltips are enabled.
   *
   * ツールチップを使うかどうか。
   *
   * 是否启用提示框。
   */
  tooltip?: boolean;
  /**
   * 축 설정.
   *
   * Axis config.
   *
   * 軸の設定。
   *
   * 轴的配置。
   */
  axis?: ChartRenderSpec['axis'];
  /**
   * 시리즈 팔레트.
   *
   * Series palette.
   *
   * シリーズのパレット。
   *
   * 系列的调色板。
   */
  palette?: string[];
  /**
   * 숫자 포맷터.
   *
   * Number formatter.
   *
   * 数値のフォーマッター。
   *
   * 数值的格式化函数。
   */
  numberFormat?: ChartRenderSpec['numberFormat'];
  /**
   * 렌더 크기(px).
   *
   * Render size (px).
   *
   * レンダーのサイズ(px)。
   *
   * 渲染的尺寸(px)。
   */
  size?: { width: number; height: number };
}
