/**
 * OPEN_GRID 공개 API 배럴(진입점). / OPEN_GRID public API barrel (entry point).
 *
 * npm 패키지 `open-grid` 의 루트 export 표면. 여기서 export 되지 않은 심볼은 공개 계약이 아니다.
 * / Root export surface of the npm package `open-grid`. Anything not exported here is not a
 * public contract.
 *
 * @packageDocumentation
 */
import './styles/base.css';
/** 그리드 코어 클래스. / The core grid class. */
export { OpenGrid } from './core/OpenGrid.js';
/** 두 그리드 사이 행 이동 셔틀(화살표 버튼 UI). / Row shuttle between two grids (arrow-button UI). */
export { GridShuttle, createGridShuttle } from './core/GridShuttle.js';
/** GridShuttle 생성 옵션. / Construction options for GridShuttle. */
export type { GridShuttleOptions } from './core/GridShuttle.js';
/** 조직도(트리) 차트 위젯. / Organization (tree) chart widget. */
export { OrgChart } from './core/OrgChart.js';
/** XML ↔ 행 데이터 변환기(SAP 계열 응답 포함). / XML ↔ row-data converter (incl. SAP-style payloads). */
export { XmlConverter } from './core/XmlConverter.js';
// item3(R12): 외관 스킨(FORM 축) + 아이콘 공개 API
// / item3(R12): appearance skin (FORM axis) + icon public API
/** 시맨틱 아이콘 role 레지스트리·렌더 헬퍼. / Semantic icon role registry & render helpers. */
export { IconRegistry, iconRegistry, renderIcon, DEFAULT_ICON_ROLES } from './core/IconRegistry.js';
/** renderIcon 옵션(size/title/element 반환 여부). / Options for renderIcon (size/title/element output). */
export type { IconRenderOptions } from './core/IconRegistry.js';
/** 스킨(FORM 축) 정의 레지스트리. / Skin (FORM-axis) definition registry. */
export { SkinRegistry, skinRegistry } from './core/SkinRegistry.js';
/** FORM 전용 스킨 토큰 델타(색 리터럴 금지). / FORM-only skin token delta (color literals rejected). */
export type { SkinTokenDelta } from './core/types.js';
// i18n: 다국어 로케일 메시지 카탈로그 + 레지스트리(IconRegistry 동형)
// / i18n: multilingual locale message catalog + registry (isomorphic to IconRegistry)
/** 로케일 메시지 레지스트리·전역 싱글턴·편의 t(). / Locale message registry, global singleton & convenience t(). */
export { LocaleRegistry, localeRegistry, t } from './core/i18n/LocaleRegistry.js';
/** 로케일 메시지 카탈로그·부분 오버라이드·dot-key·값·등록결과·메타 타입. / Locale catalog, partial override, dot-key, value, register-result & meta types. */
export type {
  LocaleMessages, PartialLocaleMessages, LocaleMessageKey,
  MessageValue, LocaleRegisterResult, LocaleMeta,
} from './core/i18n/types.js';
/** OrgChart 옵션·컬럼 정의. / OrgChart options & column definition. */
export type { OrgChartOptions, OrgChartColumnDef } from './core/OrgChart.js';
/** 트리 노드 아이콘 정의. / Tree node icon definition. */
export type { TreeNodeIconDef } from './core/types.js';
/** 캐스케이딩 필터 셀렉트 설정. / Cascading filter-select configuration. */
export type { FilterSelectConfig, FilterSelectColumn } from './core/FilterSelect.js';
/**
 * 그리드 코어 공개 타입 모음(옵션·컬럼·이벤트·트리거·Phase 0 인프라).
 * / Core public types (options, columns, events, triggers, Phase 0 infrastructure).
 */
export type {
  GridOptions,
  ColumnDef,
  OpenGridInstance,
  CellEvent,
  CellKeyEvent,
  EditEvent,
  RowEvent,
  SortItem,
  FilterItem,
  ExportOptions,
  FooterDef,
  SummaryOptions,
  RendererDef,
  EditorDef,
  DataType,
  SelectionMode,
  SortDir,
  Position,
  // 트리거 시스템 / trigger system
  TriggerContext,
  TriggerHandler,
  TriggerEvent,
  // Phase 0 인프라(C0.3/C0.4) / Phase 0 infrastructure (C0.3/C0.4)
  CellRange,
  FlatRowRef,
} from './core/types.js';
/** XmlConverter 파싱/직렬화 옵션·결과. / XmlConverter parse/stringify options & results. */
export type {
  XmlParseOptions,
  XmlStringifyOptions,
  SapParseResult,
} from './core/XmlConverter.js';
// F4: 그리드 데이터 통합 차트(11_design_F4_v2.md §6)
// / F4: grid-data integrated chart (11_design_F4_v2.md §6)
/** F4 통합 차트 공개 타입. / Public types of the F4 integrated chart. */
export type {
  ChartType,
  ChartSource,
  ChartSeriesSpec,
  ChartSeries,
  ChartDataModel,
  ChartConfig,
  ChartInstance,
  ChartGlobalOptions,
  ChartPoint,
  ChartAdapter,
  ChartRenderSpec,
  ChartTheme,
  A11yTableModel,
} from './core/chart/types.js';
