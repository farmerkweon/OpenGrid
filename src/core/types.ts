// ============================================================
// OPEN_GRID 핵심 타입 정의 / OPEN_GRID core type definitions
// ============================================================

/** 컬럼 데이터 타입. / Column data type. */
export type DataType = 'string' | 'number' | 'date' | 'boolean' | 'select' | 'radio' | 'img' | 'html' | 'barcode';

// ─── F5: 마스킹 타입 (MaskingEngine.ts에 구현) / F5: masking types (implemented in MaskingEngine.ts) ─────────────
export type { MaskType, MaskDef } from './MaskingEngine.js';
// i18n: 인스턴스 메시지 오버라이드 타입(GridOptions.messages) / i18n: instance message override type (GridOptions.messages)
import type { PartialLocaleMessages, LocaleMessageKey, MessageValue } from './i18n/types.js';
/** 선택 모드('cells' = F1 범위 선택). / Selection mode ('cells' = F1 range selection). */
export type SelectionMode = 'single' | 'row' | 'multiple' | 'cells';
/** 정렬 방향. / Sort direction. */
export type SortDir = 'asc' | 'desc';
/** 삽입 위치(키워드 또는 인덱스). / Insertion position (keyword or index). */
export type Position = 'first' | 'last' | 'before' | 'after' | number;
/** 내장 셀 렌더러 타입 이름. / Built-in cell renderer type name. */
export type RendererType = 'text' | 'number' | 'date' | 'checkbox' | 'button' | 'link' | 'image' | 'icon' | 'switch' | 'sparkline' | 'template' | 'custom' | 'badge' | 'progress' | 'rating' | 'radio' | 'img' | 'html' | 'barcode';
/** 내장 셀 에디터 타입 이름. / Built-in cell editor type name. */
export type EditorType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'custom';

// ─── 이벤트 타입 / event types ───────────────────────────────────────────
/**
 * 셀 마우스 이벤트 페이로드(cellClick/cellDblClick/cellMouseOver …).
 * / Cell mouse event payload (cellClick/cellDblClick/cellMouseOver …).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface CellEvent<T = any> {
  type: string;
  rowIndex: number;
  columnIndex: number;
  field: string;
  value: any;
  row: T;
  column: ColumnDef<T>;
  target: HTMLElement;
  originalEvent: MouseEvent;
}

/**
 * 셀 편집 이벤트 페이로드(editStart/editEnd/editBefore).
 * / Cell edit event payload (editStart/editEnd/editBefore).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface EditEvent<T = any> {
  type: string;
  rowIndex: number;
  columnIndex: number;
  field: string;
  oldValue: any;
  newValue: any;
  row: T;
  column: ColumnDef<T>;
  /** true 로 바꾸면 편집 커밋 취소. / Set true to cancel the edit commit. */
  cancel?: boolean;
}

/**
 * 행 마우스 이벤트 페이로드(rowClick/rowDblClick/rowMouseOver …).
 * / Row mouse event payload (rowClick/rowDblClick/rowMouseOver …).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface RowEvent<T = any> {
  type: string;
  rowIndex: number;
  row: T;
  target: HTMLElement;
  originalEvent: MouseEvent;
}

/**
 * 셀 키보드 이벤트 페이로드(cellKeyDown/cellKeyUp/cellKeyPress).
 * / Cell keyboard event payload (cellKeyDown/cellKeyUp/cellKeyPress).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface CellKeyEvent<T = any> {
  type: string;
  rowIndex: number;
  columnIndex: number;
  field: string;
  value: any;
  row: T;
  column: ColumnDef<T>;
  key: string;
  target: HTMLElement;
  originalEvent: KeyboardEvent;
}

/** 정렬 변경 이벤트(sortChange). / Sort change event (sortChange). */
export interface SortEvent {
  field: string;
  dir: SortDir;
  /** 멀티정렬 전체 상태. / Full multi-sort state. */
  sortList: SortItem[];
}

/** 필터 변경 이벤트(filterChange). / Filter change event (filterChange). */
export interface FilterEvent {
  field: string;
  filterItems: FilterItem[];
  /** 전체 컬럼의 활성 필터 맵. / Active filters for all columns. */
  allFilters: Record<string, FilterItem[]>;
}

/** 스크롤 이벤트(scroll). / Scroll event (scroll). */
export interface ScrollEvent {
  scrollLeft: number;
  scrollTop: number;
  isAtTop: boolean;
  isAtBottom: boolean;
}

/** 행 드래그&드롭 이벤트(onDrop). / Row drag & drop event (onDrop). */
export interface DragDropEvent<T = any> {
  sourceRows: T[];
  sourceIndexes: number[];
  targetIndex: number;
  targetGridId?: string;
}

/**
 * 그리드↔그리드 행 이동 이벤트. / Grid-to-grid row move event.
 *
 * crossGrid:true 인 두 그리드 사이에서 행을 드래그·드롭할 때 3단계로 발생한다.
 * / Fires in three phases when rows are dragged between two grids with crossGrid:true.
 *  - onGridDropBefore  : 변경 직전(이동 전). false 반환 시 이동 취소. / just before the move; return false to cancel.
 *  - onGridDropAfter   : 양쪽 데이터 모델 이동 완료 후. / after both data models have moved.
 *  - onGridDropComplete: 양쪽 재렌더까지 끝난 후. / after both grids finished re-rendering.
 */
export interface GridDropEvent<T = any> {
  /** 행을 보낸(드래그 시작) 그리드 / Grid the rows were dragged from */
  sourceGrid: OpenGridInstance<T>;
  /** 행을 받은(드롭 대상) 그리드 / Grid the rows were dropped onto */
  targetGrid: OpenGridInstance<T>;
  /** 이동된 행 데이터 (내부 id 제외 복사본) / Moved row data (copies without internal ids) */
  rows: T[];
  /** 소스 그리드에서의 원래 행 인덱스들 / Original row indexes in the source grid */
  sourceIndexes: number[];
  /** 타깃 그리드에서 삽입된 시작 인덱스 / Insertion start index in the target grid */
  targetIndex: number;
  /** before 단계에서 true 로 바꾸면 이동 취소 (onGridDropBefore가 false 반환한 것과 동일) / Set true in the before phase to cancel (same as returning false from onGridDropBefore) */
  cancel?: boolean;
}

/**
 * 그리드↔그리드 필드 매핑 확정 이벤트 (interactive 모드에서 매핑 모달 확인 시).
 * / Grid-to-grid field-mapping confirmation event (when the mapping modal is confirmed in interactive mode).
 */
export interface GridMappingEvent<T = any> {
  sourceGrid: OpenGridInstance<T>;
  targetGrid: OpenGridInstance<T>;
  /** 타깃필드 → 소스필드 매핑 / target-field → source-field mapping */
  mapping: Record<string, string>;
  /** crossGridMapping 에 baking 할 수 있는 변환 함수 소스 / Transform-function source that can be baked into crossGridMapping */
  script: string;
}

/** 선택 변경 이벤트(selectionChange). / Selection change event (selectionChange). */
export interface SelectionEvent<T = any> {
  rows: T[];
  rowIndexes: number[];
  cells?: CellRange[];
}

/**
 * 셀 범위(사각형) 좌표. / Cell range (rectangle) coordinates.
 *
 * CellRangeSemantics — CellRange 의미 규범(C0.4, 15_cross_contracts.md). 소유자 = F1(범위 선택).
 * / CellRange semantic contract (C0.4, 15_cross_contracts.md). Owner = F1 (range selection).
 * F3(수식 ref)·F4(차트 소스)는 이 의미로만 CellRange 를 소비한다.
 *  - startRow/endRow : flat/visual index (C0.2 — FlatRowModel 이 다루는 화면 표시 순서).
 *    group/tree pseudo-row, (F2 도입 후) detail head/filler 도 포함한 인덱스 공간이며,
 *    display index(정렬/필터만 반영, group/tree 제외)와 다르다.
 *  - startCol/endCol : `ColumnLayout.visibleLeaves` 인덱스(숨김 컬럼 제외). 숨김 컬럼은
 *    좌표를 흔들지 않되, 언하이드 시 재렌더로 좌표 표시(A1 등)가 갱신된다.
 *  - 선택 자체의 영속 정체성은 이 인덱스가 아니라 stable (rowId × field) 앵커로 저장한다
 *    (C0.5) — CellRange 는 어디까지나 "현재 화면에 투영된" 사각형 표현이다.
 */
export interface CellRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

// ─── F1: 범위 선택 + 채우기 핸들 옵션/이벤트(11_design_F1_v2.md §6, C5) ────
// ─── F1: range selection + fill handle options/events ────
/** F1 범위 선택 옵션. / F1 range-selection options. */
export interface RangeSelectionOptions {
  /** 기본 selection==='cells' 와 동치 / Equivalent to selection==='cells'. Default follows selection. */
  enabled?: boolean;
  /** 기본 true — 핸들 표시/드래그 / Default true — show/drag the fill handle */
  fillHandle?: boolean;
  /** 기본 false — Ctrl 멀티 rect(Full, 미구현) / Default false — Ctrl multi-rect (Full tier, not implemented) */
  multiRange?: boolean;
  /** 기본 24(px) — autoscroll 밴드 폭 / Default 24(px) — autoscroll edge band width */
  autoScrollEdge?: number;
  /** 기본 true — false 면 항상 copy(시리즈 감지 비활성) / Default true — false forces copy (disables series detection) */
  seriesFill?: boolean;
  /** 기본 false — 그룹/트리 모드 범위선택(MVP 비활성) / Default false — range selection in group/tree mode (off in MVP) */
  enabledInTreeGroup?: boolean;
  /** 기본 false — 수식 대상 덮어쓰기(C3.2 opt-in) / Default false — overwrite formula cells on fill (C3.2 opt-in) */
  fillOverwriteFormula?: boolean;
}

/** F1 채우기 커밋 이벤트(onRangeFill). / F1 fill commit event (onRangeFill). */
export interface RangeFillEvent {
  source: CellRange;
  target: CellRange;
  mode: 'copy' | 'series';
  written: Array<{ rowIndex: number; field: string; oldValue: any; newValue: any }>;
  skippedFormula?: number;
  /** before 훅에서 true 로 바꾸면 채우기 취소(현재 배선은 이벤트 emit 뒤 즉시 확인) */
  cancel?: boolean;
}

/** F1 범위 복사 이벤트(onRangeCopy). / F1 range copy event (onRangeCopy). */
export interface RangeCopyEvent {
  range: CellRange;
  /** 클립보드 TSV 텍스트. / Clipboard TSV text. */
  text: string;
}

/** F1 활성 범위 변경 이벤트(onRangeChange). / F1 active-range change event (onRangeChange). */
export interface RangeChangeEvent {
  range: CellRange | null;
}

// ─── F3: 셀 수식 옵션/이벤트(11_design_F3_v2.md §8, 15_cross_contracts.md C5) ─────
import type { FormulaErrorCode } from './formula/types.js';
export type { FormulaErrorCode } from './formula/types.js';

/** F3 셀 수식 옵션(C5.1 단일 중첩 — 최상위 flat 키 금지). / F3 cell-formula options (C5.1 single nesting — no top-level flat keys). */
export interface FormulaOptions {
  /** 셀 수식 인-셀 '=' 편집 자동 인식 on(기본 false — 회귀 0). setCellFormula API 는 이 값과 무관하게 항상 동작. / Auto-recognize in-cell '=' edits (default false — zero regression). setCellFormula always works regardless. */
  enabled?: boolean;
  /** 참조 정규화 정책(기본 'stable', §3.2). / Reference normalization policy (default 'stable', §3.2). */
  refMode?: 'stable' | 'relative';
  /** 나눗셈 소수 자리(기본 30, FormulaEngine 계승). / Division decimal precision (default 30, inherited from FormulaEngine). */
  divisionPrecision?: number;
  /** 수식 바 표시(P1, 기본 false — 미구현). / Formula bar (P1, default false — not implemented). */
  formulaBar?: boolean;
  /** 수식 셀 마커(기본 true — HANMS-09/R-FORMULA-MARKER). / Formula cell marker (default true). */
  cellMarker?: boolean;
  /** 편집 시 자동 재계산(기본 true). / Auto recalc on edit (default true). */
  autoRecalc?: boolean;
  onFormulaChange?: (e: FormulaChangeEvent) => void;
  onFormulaRecalc?: (e: FormulaRecalcEvent) => void;
  onFormulaError?: (e: FormulaErrorEvent) => void;
}

/** F3 수식 변경 이벤트(onFormulaChange). / F3 formula change event (onFormulaChange). */
export interface FormulaChangeEvent {
  rowIndex: number;
  field: string;
  formula: string;
  oldFormula: string | null;
}

/** F3 재계산 완료 이벤트(onFormulaRecalc). / F3 recalc-finished event (onFormulaRecalc). */
export interface FormulaRecalcEvent {
  /** 값이 바뀐 셀 키 목록. / Keys of cells whose values changed. */
  changed: string[];
  cycles: number;
  ms: number;
  /** Spike-A §8 교훈: 폐포가 임계(500) 초과 시 true(가이드 문서화/모니터링용). / true when the dirty closure exceeded the threshold (500) — for docs/monitoring. */
  large: boolean;
}

/** F3 수식 오류 이벤트(onFormulaError). / F3 formula error event (onFormulaError). */
export interface FormulaErrorEvent {
  rowIndex: number;
  field: string;
  error: FormulaErrorCode;
}

export type { RangeStats } from './range/RangeQuery.js';
import type { RangeStats as _RangeStats } from './range/RangeQuery.js';

// ─── F2: 마스터/디테일 옵션/이벤트(11_design_F2_v2.md §6, 15_cross_contracts.md C5) ─────
/** masterDetail.renderer 3번째 인자(§6.1). / Third argument of masterDetail.renderer (§6.1). */
export interface DetailRenderApi<T = any> {
  grid: OpenGridInstance<T>;
  rowId: string;
  /** 현재 그리드의 중첩 깊이(CON-4). 0 = 최상위. / Nesting depth of this grid (CON-4). 0 = top level. */
  depth: number;
  /** 이 패널을 접는다. / Collapse this panel. */
  collapse: () => void;
  /** 패널 재측정(Phase2 auto 대비 자리 — MVP 는 no-op 에 가까움). / Re-measure the panel (placeholder for Phase 2 auto; near no-op in MVP). */
  refresh: () => void;
}

/** F2 마스터/디테일 옵션(C5.1 단일 중첩 — 구 flat `detail*`/`masterDetail:boolean` 은 이 안으로 접힘). / F2 master/detail options (C5.1 single nesting — legacy flat `detail*`/`masterDetail:boolean` folded in here). */
export interface MasterDetailOptions<T = any> {
  /** 기능 on/off. 기본 false. / Feature on/off. Default false. */
  enabled?: boolean;
  /** 임의 HTML/컴포넌트를 host 에 주입(§5). subgridOptions 와 동시 지정 시 이 쪽이 우선. / Inject arbitrary HTML/components into the host (§5). Takes precedence over subgridOptions. */
  renderer?: (row: T, host: HTMLElement, api: DetailRenderApi<T>) => void | HTMLElement;
  /** 패널 높이(px). 기본 200. MVP 는 rowHeight 배수로 양자화(EC-10). / Panel height (px). Default 200. Quantized to rowHeight multiples in MVP (EC-10). */
  height?: number;
  /**
   * 'fixed'(기본)만 MVP 에서 동작. 'auto' 는 Spike-B(C12.2) 통과 전 미공개 — 지정해도
   * DetailManager 가 'fixed' 로 무시 처리하고 1회 console.warn 한다.
   * / Only 'fixed' (default) works in MVP. 'auto' is unreleased until Spike-B (C12.2) passes —
   * if specified, DetailManager treats it as 'fixed' and warns once.
   */
  heightMode?: 'fixed' | 'auto';
  /** 기본 true. false = 아코디언(펼침 1개만 허용). / Default true. false = accordion (only one panel open). */
  expandMultiple?: boolean;
  /** 기본 false. true 면 collapse 해도 host/instance 캐시를 유지(재펼침 시 재생성 생략). / Default false. true keeps host/instance cache across collapse (skips re-creation on re-expand). */
  cache?: boolean;
  /** 어포던스 위치. 기본 'expander-col'(전용 컬럼). / Toggle affordance position. Default 'expander-col' (dedicated column). */
  toggle?: 'expander-col' | 'first-cell';
  /** 패널 role=region 의 aria-label. 기본 '상세 내용'. / aria-label of the panel region. Default '상세 내용'. */
  ariaLabel?: string;
  /** 중첩 깊이 한계(CON-4/FR-10). 기본 2. / Nesting depth limit (CON-4/FR-10). Default 2. */
  maxDepth?: number;
  /** 지정 시 height 대신 이 값을 슬롯수(정수, 최소 1)로 직접 사용. / When set, used directly as slot count (integer, min 1) instead of height. */
  detailRowCount?: number;
  /** renderer 미지정 시: 자식 OpenGrid 를 이 옵션으로 자동 생성(§5 ②). / When renderer is absent: auto-create a child OpenGrid with these options (§5 ②). */
  subgridOptions?: GridOptions<any>;
}

/** rowExpand/rowCollapse 페이로드(C5.2, §6.3). / rowExpand/rowCollapse payload (C5.2, §6.3). */
export interface RowExpandEvent<T = any> {
  /** flat/visual index(C0.2). */
  rowIndex: number;
  rowId: string;
  row: T;
  host: HTMLElement | null;
}

// ─── 컬럼 정의 / column definition ────────────────────────────────────────────
/** 셀 렌더러 상세 지정(type + 렌더러별 부가 옵션). / Detailed cell renderer spec (type + renderer-specific extras). */
export interface RendererDef {
  type: RendererType;
  [key: string]: any;
}

/** 셀 에디터 상세 지정(type + 에디터별 부가 옵션). / Detailed cell editor spec (type + editor-specific extras). */
export interface EditorDef {
  type: EditorType;
  options?: Array<string | { label: string; value: any }>;
  multiple?: boolean;
  min?: number;
  max?: number;
  step?: number;
  format?: string;
  placeholder?: string;
  [key: string]: any;
}

/**
 * 컬럼 정의. / Column definition.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * const col: ColumnDef = { field: 'price', header: '가격', type: 'number', format: '#,##0' };
 */
export interface ColumnDef<T = any> {
  /** 행 객체의 속성 키(고유). / Property key on the row object (unique). */
  field: string;
  /** 헤더 표시 텍스트('\n' 은 줄바꿈). / Header caption ('\n' breaks lines). */
  header: string;
  /** 고정 폭(px). / Fixed width (px). */
  width?: number;
  /** 최소 폭(px). / Minimum width (px). */
  minWidth?: number;
  /** 최대 폭(px). / Maximum width (px). */
  maxWidth?: number;
  /** 잔여 폭 배분 가중치. / Flex weight for remaining width distribution. */
  flex?: number;

  /** 데이터 타입(정렬·기본 렌더러 결정). / Data type (drives sorting & default renderer). */
  type?: DataType;
  /**
   * 숫자/날짜 포맷 문자열. 숫자는 통화 기호 접두·접미와 음수 패턴 지원:
   *  '#,##0' · '#,##0.00' · '₩#,##0' · '$#,##0.00' · '#,##0원' · '$#,##0;($#,##0)'(음수 괄호)
   * / Number/date format string. Numbers support currency prefixes/suffixes and negative
   * patterns, e.g. '$#,##0;($#,##0)' (parentheses for negatives).
   */
  format?: string;
  /** ISO 통화코드('KRW'|'USD'|'EUR'…). 지정 시 Intl.NumberFormat 로케일 통화 포맷 (format 보다 우선) / ISO currency code; uses Intl.NumberFormat locale currency formatting (takes precedence over format) */
  currency?: string;
  /** 값 → 표시 텍스트 매핑. / Raw value → display text map. */
  valueMap?: Record<string, string>;

  /** 셀 렌더러(내장 타입명 또는 상세 정의). / Cell renderer (built-in type name or detailed def). */
  renderer?: RendererType | RendererDef;
  /** 편집 가능 여부(불리언 또는 행별 함수). / Editable flag (boolean or per-row function). */
  editable?: boolean | ((row: T, rowIndex: number) => boolean);
  /** 셀 에디터(내장 타입명 또는 상세 정의). / Cell editor (built-in type name or detailed def). */
  editor?: EditorType | EditorDef;

  /** 셀 정렬. / Cell text alignment. */
  align?: 'left' | 'center' | 'right';
  /** 헤더 정렬. / Header text alignment. */
  headerAlign?: 'left' | 'center' | 'right';
  /** 셀 인라인 스타일(정적 또는 값·행 함수). / Cell inline style (static or value/row function). */
  cellStyle?: CSSProperties | ((value: any, row: T, rowIndex: number) => CSSProperties);
  /** 헤더 인라인 스타일. / Header inline style. */
  headerStyle?: CSSProperties;

  /** 헤더 클릭 정렬 허용. / Allow sort on header click. */
  sortable?: boolean;
  /** 필터 아이콘/패널 허용. / Allow the filter icon/panel. */
  filterable?: boolean;
  /** 헤더 드래그 폭 조절 허용. / Allow header drag resize. */
  resizable?: boolean;
  /** 컬럼 숨김. / Hide the column. */
  hidden?: boolean;
  /** 왼쪽 고정(frozen) 여부. / Freeze the column to the left. */
  frozen?: boolean;
  /** 셀 줄바꿈: true 면 nowrap+ellipsis 대신 여러 줄로 표시(rowHeight 확대와 함께 사용) / Cell wrapping: true renders multiple lines instead of nowrap+ellipsis (use with a larger rowHeight) */
  wrap?: boolean;
  /**
   * 헤더(컬럼 머리글) 줄바꿈: true 면 헤더 텍스트가 잘리지 않고 여러 줄로 줄바꿈된다.
   * (셀 본문용 wrap 과 별개로 헤더에만 적용. header 문자열의 '\n' 은 headerWrap 여부와 무관하게 항상 줄바꿈됨)
   * 줄바꿈된 헤더에 맞춰 헤더 행 높이가 자동으로 늘어난다.
   * / Header wrapping: true wraps header text to multiple lines instead of truncating
   * (header-only, independent of the body `wrap`; '\n' in `header` always breaks regardless).
   * The header row height grows automatically to fit.
   */
  headerWrap?: boolean;

  /** 가로 병합 허용(불리언 또는 행별 함수). / Allow column span (boolean or per-row function). */
  colSpan?: boolean | ((row: T, rowIndex: number) => boolean);
  /** 세로 병합 허용. / Allow row span. */
  rowSpan?: boolean;

  /** 다단 헤더용 자식 컬럼. / Child columns for multi-level headers. */
  children?: ColumnDef<T>[];

  /** 셀 title 툴팁(정적 또는 값·행 함수). / Cell title tooltip (static or value/row function). */
  tooltip?: string | ((value: any, row: T) => string);

  // Sprint 36: select 타입 컬럼 — 정적 옵션 배열 또는 동적 옵션 함수
  // / Sprint 36: select-type column — static option array or dynamic option function
  /** select 정적 옵션. / Static options for select. */
  options?: Array<string | { label: string; value: any }>;
  /** select 동적 옵션 함수. / Dynamic option function for select. */
  optionsFn?: (row: T, rowIndex: number) => Array<string | { label: string; value: any }>;

  // Sprint 37: 신규 셀 타입 옵션 / Sprint 37: new cell-type options
  /** radio — 같은 group 내 단일 선택 / radio — single choice within the same group */
  group?: string;
  /** img — 이미지 대체 텍스트 (웹접근성 필수) / img — alt text (required for accessibility) */
  alt?: string;
  /** html — XSS 방지 sanitize (기본 true) / html — XSS sanitize (default true) */
  sanitize?: boolean;
  /** barcode — 바코드 높이(px), 기본 28 / barcode — bar height in px, default 28 */
  barcodeHeight?: number;

  /** F4: 표시 소수점 자리수 (display + kahanSum) / F4: display decimal places (display + kahanSum) */
  precision?: number;

  // F4: 임의정밀도 수식 (OGDecimal 기반) / F4: arbitrary-precision column formula (OGDecimal-based)
  // 함수식: (row, D) => D.from(row.price).mul('0.035')
  // 문자열식: '[revenue] * [rate] / 100'
  /** 컬럼 수식(함수식 또는 '[field]' 문자열식). / Column formula (function form or '[field]' string form). */
  formula?: string | ((row: T, D: any) => any);
  /** 나눗셈 소수점 자리수 (기본 30) / Division decimal precision (default 30) */
  formulaPrecision?: number;

  // F5: 컬럼 마스킹 / F5: column masking
  /** 마스킹 타입 또는 상세 정의. / Mask type or detailed mask definition. */
  mask?: import('./MaskingEngine.js').MaskType | import('./MaskingEngine.js').MaskDef;

  // 트리 노드 아이콘 커스터마이징 (첫 번째 컬럼에만 적용)
  // / Tree node icon customization (applies to the first column only)
  // 정적: { branch:'bi-building', branchOpen:'bi-building-check', leaf:'bi-person' }
  // 동적: (row, hasChildren, expanded) => hasChildren ? 'bi-folder2' : 'bi-file-earmark'
  /** 트리 노드 아이콘(정적 정의 또는 행별 함수). / Tree node icon (static def or per-row function). */
  treeNodeIcon?: TreeNodeIconDef | ((row: T, hasChildren: boolean, expanded: boolean) => string);

  // 내부 사용 / internal use
  /** @internal */
  _colIndex?: number;
  /** @internal */
  _depth?: number;
  /** @internal */
  _leaf?: boolean;
  /** @internal setMaskEnabled(field, false) 시 true (컬럼 전체 해제) / true after setMaskEnabled(field, false) (whole-column reveal) */
  _maskRevealed?: boolean;
  /** @internal 눈 아이콘 클릭으로 해제된 행 rowIndex 집합 / Set of rowIndexes revealed via the eye icon */
  _maskRevealedRows?: Set<number>;
}

/** 트리 노드 아이콘 정의. / Tree node icon definition. */
export interface TreeNodeIconDef {
  /** 접힌 branch 노드 아이콘 (Bootstrap Icons 클래스, 기본: 'bi-folder2') / Collapsed branch icon (Bootstrap Icons class, default 'bi-folder2') */
  branch?: string;
  /** 펼친 branch 노드 아이콘 (기본: 'bi-folder2-open') / Expanded branch icon (default 'bi-folder2-open') */
  branchOpen?: string;
  /** 리프 노드 아이콘 (기본: 'bi-file-earmark') / Leaf icon (default 'bi-file-earmark') */
  leaf?: string;
}

type CSSProperties = Partial<Record<keyof CSSStyleDeclaration, string>>;

// ─── 정렬/필터 / sort & filter ────────────────────────────────────────────
/** 정렬 항목(멀티정렬 배열 원소). / Sort entry (element of a multi-sort list). */
export interface SortItem {
  field: string;
  dir: SortDir;
}

/** 필터 조건 1건. / A single filter condition. */
export interface FilterItem {
  /** 비교 연산자. / Comparison operator. */
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'startsWith' | 'endsWith';
  /** 비교 값. / Comparison value. */
  value: any;
}

// ─── 소계(Summary) / summary rows ────────────────────────────────────────
/** 집계 연산자. / Aggregate operator. */
export type SummaryOp = 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';

/** 필드별 집계 정의. / Per-field aggregate definition. */
export interface SummaryFieldDef {
  field: string;
  op: SummaryOp;
  label?: string;
}

/** 그룹 소계/합계 행 옵션. / Group summary row options. */
export interface SummaryOptions {
  /** 집계 대상 필드. / Fields to aggregate. */
  fields: string[];
  /** 적용 연산(단일 또는 배열). / Operator(s) to apply. */
  ops?: SummaryOp | SummaryOp[];
  /** 소계 행 위치. / Summary row position. */
  position?: 'top' | 'bottom';
  /** 다중 소계 행 정의(커스텀 함수 지원). / Multiple summary rows (custom function supported). */
  rows?: Array<{
    op: SummaryOp;
    label?: string;
    customFn?: (items: any[]) => number;
  }>;
}

// ─── 푸터 / footer ─────────────────────────────────────────────────
/** 푸터 셀 정의. / Footer cell definition. */
export interface FooterDef {
  /** 집계 대상 필드. / Field to aggregate. */
  field?: string;
  /** 집계 연산. / Aggregate operator. */
  op?: SummaryOp;
  /** 라벨 텍스트(집계 대신 표시). / Label text (shown instead of an aggregate). */
  label?: string;
  /**
   * 숫자 포맷 문자열
   *  '#,##0'      → 천 단위 콤마, 정수
   *  '#,##0.00'   → 천 단위 콤마, 소수 2자리
   *  '0'          → 정수 (콤마 없음)
   *  '0.00'       → 소수 2자리 (콤마 없음)
   *  '2'          → 소수 2자리 (하위 호환)
   */
  format?: string;
  align?: 'left' | 'center' | 'right';
  /** 이 셀이 오른쪽으로 몇 컬럼을 병합할지 (기본: 1) / How many columns to span rightward (default 1) */
  colspan?: number;
  renderer?: RendererType | RendererDef;
}

// ─── 인쇄 / print ────────────────────────────────────────────────
/** 인쇄 옵션. / Print options. */
export interface PrintOptions {
  title?: string;
  excludeFields?: string[];
  showFooter?: boolean;
}

// ─── 내보내기 / export ─────────────────────────────────────────────
/** 내보내기 스타일 모드. / Export style mode. */
export type ExportStyleMode = 'theme' | 'none' | 'custom';

/** Excel/CSV/JSON 내보내기 옵션. / Excel/CSV/JSON export options. */
export interface ExportOptions {
  /** 저장 파일명. / Output filename. */
  filename?: string;
  /** 엑셀 시트명. / Excel sheet name. */
  sheetName?: string;
  /** 헤더 행 포함(기본 true). / Include the header row (default true). */
  includeHeader?: boolean;
  /** 제외할 필드 목록. / Fields to exclude. */
  exceptFields?: string[];
  /** 데이터 위에 추가할 제목 행들. / Extra title rows above the data. */
  headers?: ExportHeaderRow[];
  /** 데이터 아래에 추가할 행들. / Extra rows below the data. */
  footers?: ExportHeaderRow[];
  /** F1: CSS 테마 적용 방식 (기본: 'theme') / F1: theme styling mode (default 'theme') */
  styleMode?: ExportStyleMode;
  /** true 시 마스킹 활성 컬럼의 값을 마스킹된 형태로 내보냄 (기본: false = 원본 값) / true exports masked values for masked columns (default false = raw values) */
  maskOnExport?: boolean;
  /** 내보내기 직전 훅. / Hook just before export. */
  onBefore?: () => void | Promise<void>;
  /** 내보내기 완료 훅(blob 수신). / Hook after export (receives the blob). */
  onAfter?: (blob: Blob) => void;
}

/** 내보내기 제목/푸터 행. / Export title/footer row. */
export interface ExportHeaderRow {
  text: string;
  height?: number;
  style?: {
    fontSize?: number;
    textAlign?: 'left' | 'center' | 'right';
    bold?: boolean;
    color?: string;
    background?: string;
  };
}

// ─── 그리드 옵션 / grid options ──────────────────────────────────────────
/**
 * 그리드 생성 옵션. / Grid construction options.
 *
 * `new OpenGrid(container, options)` 의 두 번째 인자. `columns` 만 필수.
 * / Second argument of `new OpenGrid(container, options)`. Only `columns` is required.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * const grid = new OpenGrid('#host', {
 *   columns: [{ field: 'name', header: '이름' }, { field: 'qty', header: '수량', type: 'number' }],
 *   height: 400,
 *   editable: true,
 * });
 */
export interface GridOptions<T = any> {
  /** 컬럼 정의 배열(필수). / Column definitions (required). */
  columns: ColumnDef<T>[];

  // 레이아웃 / layout
  /** 그리드 높이(px 숫자 또는 CSS 문자열). / Grid height (px number or CSS string). */
  height?: number | string;
  /** 그리드 폭(px 숫자 또는 CSS 문자열). / Grid width (px number or CSS string). */
  width?: number | string;
  /** 행 높이(px). / Row height (px). */
  rowHeight?: number;
  /** 헤더 행 높이(px). / Header row height (px). */
  headerHeight?: number;
  /** 푸터 행 높이(px). / Footer row height (px). */
  footerHeight?: number;
  /** 행 내용에 맞춰 행 높이 자동 확장(wrap 컬럼과 사용). / Auto-grow row height to content (use with wrap columns). */
  autoHeight?: boolean;
  /** 컬럼 폭 합을 컨테이너 폭에 맞춤. / Stretch column widths to fill the container. */
  fillWidth?: boolean;
  /** width/flex 미지정 컬럼의 기본 폭(px). / Default width (px) for columns without width/flex. */
  defaultColumnWidth?: number;
  /**
   * 뷰포트 안전장치(옵트인, 기본 undefined = OFF = 기존 동작 완전 불변).
   * / Viewport safety net (opt-in; default undefined = OFF = behavior fully unchanged).
   * 호스트가 그리드 컨테이너 조상 체인에 확정 높이(definite height)를 주지 않으면
   * 내부 스페이서(totalRows×rowHeight)가 컨테이너를 전체 콘텐츠 크기로 부풀리고,
   * ResizeObserver 되먹임으로 windowing 이 무력화되어 전 행이 DOM 렌더되는 폭주가 발생한다
   * (대량 데이터일수록 재앙적). 이 값을 지정하면, 컨테이너가 전 콘텐츠를 다 담는 "언바운드"
   * 상태로 감지될 때에 한해 윈도잉 뷰포트 높이를 이 값(px)으로 클램프해 폭주를 차단한다.
   * 정상적으로 확정 높이가 있는 바운드 컨테이너에는 영향이 없다.
   * 1순위 권장은 컨테이너/그리드에 확정 height 를 주는 것이며, 이 옵션은 안전망이다.
   * / When the container ancestor chain has no definite height, the internal spacer
   * (totalRows×rowHeight) inflates the container and a ResizeObserver feedback loop defeats
   * windowing, DOM-rendering every row (catastrophic on large data). If set, and only when the
   * container is detected as "unbounded", the windowing viewport height is clamped to this px
   * value. Bounded containers are unaffected. Prefer giving the container a definite height;
   * this option is a safety net.
   */
  fallbackViewportHeight?: number;

  // 편집 / editing
  /** 전역 편집 허용(컬럼별 editable 과 AND). / Global edit switch (ANDed with per-column editable). */
  editable?: boolean;
  /** 편집 진입 방식. / How editing is entered. */
  editMode?: 'click' | 'dblclick' | 'none';
  /** (예약) 편집 히스토리. / (Reserved) edit history. */
  history?: boolean;
  /** (예약) 히스토리 크기. / (Reserved) history size. */
  historySize?: number;

  // 선택 / selection
  /** 선택 모드('cells' = F1 범위 선택). / Selection mode ('cells' = F1 range selection). */
  selection?: SelectionMode;
  /** 클립보드 복사/붙여넣기 허용. / Enable clipboard copy/paste. */
  clipboard?: boolean;
  /** F1: 범위 선택 + 채우기 핸들(C5.1 단일 중첩 — 최상위 flat 키 금지). / F1: range selection + fill handle (C5.1 single nesting — no top-level flat keys). */
  rangeSelection?: RangeSelectionOptions;
  /** F3: 셀 수식(C5.1 단일 중첩). / F3: cell formulas (C5.1 single nesting). */
  formula?: FormulaOptions;
  /** F2: 마스터/디테일(C5.1 단일 중첩). / F2: master/detail (C5.1 single nesting). */
  masterDetail?: MasterDetailOptions<T>;
  /** F4: 그리드 데이터 통합 차트(C5.1 단일 중첩). 타입은 chart/types 순환-안전 type-only import. / F4: grid-data integrated chart (C5.1 single nesting). Type is a cycle-safe type-only import from chart/types. */
  chart?: import('./chart/types.js').ChartGlobalOptions;

  // 정렬/필터 / sort & filter
  /** 전역 정렬 허용. / Global sort switch. */
  sortable?: boolean;
  /** Shift+클릭 멀티정렬 허용. / Allow Shift+click multi-sort. */
  multiSort?: boolean;
  /** 전역 필터 허용. / Global filter switch. */
  filterable?: boolean;
  /** 초기 정렬 상태. / Initial sort state. */
  defaultSort?: SortItem[];

  // 고정 / freezing
  /** 왼쪽 고정 컬럼 수. / Number of left-frozen columns. */
  frozenColumns?: number;
  /** (예약) 고정 행 수 — 미구현. / (Reserved) frozen row count — not implemented. */
  frozenRows?: number;

  // 엑스트라 컬럼 / extra columns
  /** 행 번호 컬럼 표시. / Show the row-number column. */
  rowNumber?: boolean;
  /** 행 상태(추가/수정) 컬럼 표시. / Show the row-state (added/edited) column. */
  stateColumn?: boolean;
  /** 체크박스 컬럼 표시. / Show the checkbox column. */
  checkColumn?: boolean;
  /** 행 드래그 이동 허용. / Enable row drag & drop. */
  draggable?: boolean;
  /** 그리드↔그리드 행 드래그 이동 허용 (draggable:true 와 함께 사용, 양쪽 그리드 모두 true 여야 이동) / Enable grid-to-grid row drag (use with draggable:true; both grids must be true) */
  crossGrid?: boolean;
  /**
   * 크로스그리드 이동 시 소스→타깃 행 변환 방식. / How source rows are transformed on cross-grid moves.
   *  - 'auto'(기본): 필드명 그대로 복사 / 'auto' (default): copy by matching field names
   *  - 'interactive': 소스/타깃 스키마가 다르면 매핑 모달을 띄워 개발자가 매칭 + 변환 스크립트 출력 / 'interactive': show a mapping modal when schemas differ, emitting a transform script
   *  - 함수: (srcRow) => targetRow 로 직접 변환 (모달 없이 baking) / function: transform directly without the modal
   */
  crossGridMapping?: 'auto' | 'interactive' | ((srcRow: T) => Partial<T>);

  // 셀 병합 / cell merge
  /** 셀 병합 기능 사용. / Enable cell merging. */
  mergeCells?: boolean;

  // 그룹핑 / grouping
  /** 초기 그룹핑 필드. / Initial grouping fields. */
  groupBy?: string[];
  /** 그룹 소계/합계 옵션. / Group summary options. */
  summary?: SummaryOptions;

  // 트리 / tree
  /** 트리 구성 방식('auto' = children 중첩, 'flat' = id/parentId 평면). / Tree build mode ('auto' = nested children, 'flat' = id/parentId pairs). */
  treeMode?: 'auto' | 'flat';
  /** flat 트리의 id 필드명. / id field name for flat tree mode. */
  treeId?: string;
  /** flat 트리의 부모 id 필드명. / parent-id field name for flat tree mode. */
  treeParentId?: string;
  /** 로드 시 전체 펼침. / Expand all nodes on load. */
  expandOnLoad?: boolean;

  // 페이징 / pagination
  /** 페이징 바 사용. / Enable the pagination bar. */
  pagination?: boolean;
  /** 페이지당 행 수. / Rows per page. */
  pageSize?: number;

  // 푸터 / footer
  /** 푸터 셀 정의 배열. / Footer cell definitions. */
  footer?: FooterDef[];
  /** 푸터 위치. / Footer position. */
  footerPosition?: 'top' | 'bottom';

  /** 툴팁: true 면 모든 셀에 native title(값) 자동 노출. 컬럼별 col.tooltip 이 우선. / true auto-exposes native title (cell value) on every cell; per-column col.tooltip wins. */
  tooltips?: boolean;

  // 접근성 / accessibility
  /** 그리드 컨테이너 aria-label. / aria-label of the grid container. */
  ariaLabel?: string;

  // 테마 (COLOR 축) / theme (COLOR axis)
  /** 색 테마 id(data-og-theme). / Color theme id (data-og-theme). */
  theme?: string;
  /** 스킨 (FORM 축, R12b) — data-og-skin. 미지정 시 'default'(오늘과 byte-identical). / Skin (FORM axis, R12b) — data-og-skin. Default 'default' (byte-identical to stock look). */
  skin?: string;
  /** 컨테이너에 주입할 CSS 변수 맵. / CSS custom properties injected on the container. */
  cssVars?: Record<string, string>;

  // i18n (다국어 UI 문자열) / i18n (multilingual UI strings)
  /**
   * UI 문자열 로케일 id. 미지정 시 전역 활성 로케일(기본 'ko') 상속 — 기존 사용자 무변화.
   * / UI-string locale id. Falls back to the global active locale ('ko') — existing users unaffected.
   * @defaultValue 전역 활성 로케일('ko') / the global active locale ('ko')
   */
  locale?: string;
  /**
   * 이 인스턴스 한정 메시지 부분 오버라이드(2단 딥머지, 카탈로그 위). 개별 라벨 옵션 > messages > 카탈로그.
   * / Per-instance partial message override (2-level deep-merge over the catalog). Per-label option > messages > catalog.
   */
  messages?: PartialLocaleMessages;

  /** F3: 우클릭 컨텍스트 메뉴(false=끔, 배열=커스텀 항목). / F3: right-click context menu (false = off, array = custom items). */
  contextMenu?: boolean | ContextMenuItem[];

  /** F2: 워크시트(다중시트). / F2: worksheets (multi-sheet tabs). */
  worksheets?: WorksheetDef[];

  /** F4: 전체 기본 소수점 정밀도 (기본 10) / F4: global default decimal precision (default 10) */
  calcPrecision?: number;

  /** 컬럼 드래그 리오더 허용. / Enable column drag reorder. */
  columnReorder?: boolean;

  /** override 커널: 레이어 예외를 기본 전파(strict). false → fallback 옵트인 동작 허용 / Override kernel: propagate layer exceptions by default (strict). false allows the fallback opt-in behavior. */
  overrideStrict?: boolean;

  // 이벤트 / events
  /** 첫 렌더 완료 콜백. / Fired after the first render. */
  onReady?: (grid: OpenGridInstance<T>) => void;
  onCellClick?: (e: CellEvent<T>) => void;
  onCellDblClick?: (e: CellEvent<T>) => void;
  onEditStart?: (e: EditEvent<T>) => void;
  onEditEnd?: (e: EditEvent<T>) => void;
  onEditBefore?: (e: EditEvent<T>) => boolean;
  onRowClick?: (e: RowEvent<T>) => void;
  onSelectionChange?: (e: SelectionEvent<T>) => void;
  /** F1: 범위 rects 변경 시(C4, F4 라이브 소비) / F1: fired when range rects change (C4; consumed live by F4) */
  onRangeChange?: (e: RangeChangeEvent) => void;
  /** F1: 채우기 커밋 결과(§6.3) / F1: fill commit result (§6.3) */
  onRangeFill?: (e: RangeFillEvent) => void;
  /** F1: 범위 복사 시(§6.3) / F1: fired on range copy (§6.3) */
  onRangeCopy?: (e: RangeCopyEvent) => void;
  /** F2: 행 상세 패널 펼침/접힘 시(C5.1 on* 버킷). / F2: fired when a detail panel expands/collapses (C5.1 on* bucket). */
  onRowExpand?: (e: RowExpandEvent<T>) => void;
  onRowCollapse?: (e: RowExpandEvent<T>) => void;
  onSortChange?: (e: SortEvent) => void;
  onFilterChange?: (e: FilterEvent) => void;
  onScroll?: (e: ScrollEvent) => void;
  onDrop?: (e: DragDropEvent<T>) => void;
  onRowDrop?: (e: { fromIndex: number; toIndex: number }) => void;

  // 그리드↔그리드 행 이동 3단계 이벤트 / grid-to-grid move: three-phase events
  /** 변경전 — 이동 직전. false 반환 시 이동 취소 / before phase — just before the move; return false to cancel */
  onGridDropBefore?: (e: GridDropEvent<T>) => boolean | void;
  /** 변경후 — 양쪽 데이터 모델 이동 완료 / after phase — both data models updated */
  onGridDropAfter?: (e: GridDropEvent<T>) => void;
  /** 완료시 — 양쪽 재렌더까지 끝남 / complete phase — both grids re-rendered */
  onGridDropComplete?: (e: GridDropEvent<T>) => void;
  /** interactive 매핑 모달에서 매핑 확정 시 — 생성된 매핑/스크립트 수신 / fired when the interactive mapping modal is confirmed — receives the mapping/script */
  onGridDropMapping?: (e: GridMappingEvent<T>) => void;
  onColumnReorder?: (e: { fromIndex: number; toIndex: number; field: string }) => void;
  onDataChange?: (data: T[]) => void;

  // Sprint 35: Row 이벤트 확장 (7종 중 신규 6종) / Sprint 35: extended row events (6 new of 7)
  onRowDblClick?: (e: RowEvent<T>) => void;
  onRowMouseOver?: (e: RowEvent<T>) => void;
  onRowMouseOut?: (e: RowEvent<T>) => void;
  onRowMouseDown?: (e: RowEvent<T>) => void;
  onRowMouseUp?: (e: RowEvent<T>) => void;
  onRowMouseMove?: (e: RowEvent<T>) => void;

  // Sprint 35: Cell 이벤트 확장 (10종 중 신규 8종) / Sprint 35: extended cell events (8 new of 10)
  onCellMouseOver?: (e: CellEvent<T>) => void;
  onCellMouseOut?: (e: CellEvent<T>) => void;
  onCellMouseDown?: (e: CellEvent<T>) => void;
  onCellMouseUp?: (e: CellEvent<T>) => void;
  onCellMouseMove?: (e: CellEvent<T>) => void;
  onCellKeyDown?: (e: CellKeyEvent<T>) => void;
  onCellKeyUp?: (e: CellKeyEvent<T>) => void;
  onCellKeyPress?: (e: CellKeyEvent<T>) => void;
}

// ─── 그리드 인스턴스 인터페이스 / grid instance interface ──────────────────────────
// ─── grid.override() 확장 API / grid.override() extension API ─────────────────────────────
/** override 레이어 함수: 첫 인자는 안쪽(원본 근접) 함수. orig(...) 호출이 super 처럼 동작. / Override layer function: the first argument is the inner (closer-to-original) function; calling orig(...) behaves like super. */
export type OverrideLayerFn = (orig: (...args: any[]) => any, ...args: any[]) => any;

/** override 등록 옵션. / Options for registering an override. */
export interface OverrideCallOptions {
  /** 동일 메서드 재진입 허용(정당한 재귀). 기본 false. / Allow re-entry into the same method (legit recursion). Default false. */
  reentrant?: boolean;
  /** 'fallback' → 레이어 예외 시 경고 후 원본 실행(멱등 가정, 롤백 불가). 미지정 시 strict. / 'fallback' runs the original after warning on a layer exception (assumes idempotency, no rollback). Strict when unset. */
  onError?: 'fallback';
}

// ─── Phase 2: strategy 슬롯 / Phase 2: strategy slots ───────────────────────────
/** 등록 가능한 알고리즘 슬롯 이름. / Registerable algorithm slot names. */
export type StrategySlot =
  | 'sortComparator'
  | 'filterPredicate'
  | 'displayFormatter'
  | 'cellSerializer'
  | 'groupKeyFn'
  | 'summaryOp'
  | 'cellClassResolver'
  | 'ariaLabelResolver'
  | 'skinResolver';

// ─── R12b: 스킨(FORM) 축 타입 계약 (item3 §1.2 / §6.2, item2 C14) ───
/**
 * SKIN 토큰 이름 집합 — **형태(FORM)만** 소유(색 0). COLOR 토큰과 disjoint name set 이라
 * 색⊥형태 직교성이 이름 충돌 부재로 물리적으로 보장된다(item3 §1.1~1.2, HANMS §4).
 * / SKIN token name set — owns **FORM only** (zero colors). Being name-disjoint from COLOR
 * tokens physically guarantees color⊥form orthogonality.
 */
export type SkinTokenName =
  // radius
  | '--og-radius-none' | '--og-radius-sm' | '--og-radius-md' | '--og-radius-lg' | '--og-radius-pill'
  | '--og-radius-container' | '--og-radius-control' | '--og-radius-widget' | '--og-container-radius'
  // border
  | '--og-border-width' | '--og-border-width-strong' | '--og-border-style'
  | '--og-divider-style' | '--og-divider-repeat'
  // elevation
  | '--og-elevation-sm' | '--og-elevation-md' | '--og-elevation-lg'
  | '--og-elevation-alpha-sm' | '--og-elevation-alpha-md' | '--og-elevation-alpha-lg' | '--og-elevation-inset'
  // spacing / density(권장 밀도 힌트 — relayout 은 data-og-density 소유, item4 C1)
  | '--og-cell-padding-x' | '--og-cell-padding-y'
  | '--og-density-row-height' | '--og-density-header-height' | '--og-density-footer-height'
  | '--og-scrollbar-size'
  // texture
  | '--og-texture-bg' | '--og-texture-size' | '--og-texture-opacity'
  // focus ring
  | '--og-focus-width' | '--og-focus-style' | '--og-focus-offset' | '--og-focus-radius'
  // icon
  | '--og-icon-size' | '--og-icon-fill' | '--og-icon-stroke-width' | '--og-icon-corner'
  // motion(form-adjacent)
  | '--og-transition-fast' | '--og-transition-base'
  // accent
  | '--og-row-accent-width';

/** FORM-only 스킨 델타. 값에 색 리터럴이 있으면 SkinRegistry 가 런타임 거부(Rule 2, 직교성). / FORM-only skin delta. Color literals in values are rejected at runtime by SkinRegistry (Rule 2, orthogonality). */
export type SkinTokenDelta = Partial<Record<SkinTokenName, string>>;

/** 단일키 정렬 비교자. dir 부호는 호출자(DataLayer)가 적용 — 슬롯은 비교만 반환. / Single-key sort comparator. The dir sign is applied by the caller (DataLayer) — the slot only compares. */
export type SortComparatorFn = (a: any, b: any, field: string, dir: 'asc' | 'desc') => number;
/** 필터 술어. true → 행 포함. / Filter predicate. true includes the row. */
export type FilterPredicateFn = (value: any, fi: FilterItem, field: string) => boolean;
/** 표시값 포맷. getDisplayValue(인스턴스 안전) + 렌더러(formatNumber/formatDate) 공유. / Display-value formatter. Shared by getDisplayValue (instance-safe) and renderers (formatNumber/formatDate). */
export type DisplayFormatterFn = (value: any, field: string, row: any) => string;
/** export 셀 직렬화. / Export cell serializer. */
export type CellSerializerFn = (value: any, col: any, row: any) => any;
/** 그룹 키 산출. remainingFields = 현재 깊이부터의 잔여 필드. / Group key producer. remainingFields = remaining fields from the current depth. */
export type GroupKeyFn = (row: any, remainingFields: string[]) => any;
/** 집계 연산. null 반환 시 기본 SUM/AVG/COUNT/MAX/MIN 분기로 폴백. / Aggregate operator. Returning null falls back to the built-in SUM/AVG/COUNT/MAX/MIN branch. */
export type SummaryOpFn = (op: string, nums: any[], field: string) => number | null;
/** R11(§4.2): 셀 클래스 렌더훅 리졸버. 렌더층이 셀 element 에 추가할 className(null=미참여). / R11 (§4.2): cell-class render-hook resolver. className the render layer adds to the cell element (null = not participating). */
export type CellClassResolverFn = (value: any, field: string, row: any) => string | null;
/** R11(§4.2): 셀 aria-label 렌더훅 리졸버. 렌더층이 셀 aria-label 을 대체(null=기본 유지). / R11 (§4.2): cell aria-label render-hook resolver. Replaces the cell aria-label (null = keep default). */
export type AriaLabelResolverFn = (value: any, field: string, row: any) => string | null;
/**
 * F1 채우기 시리즈 커스텀 리졸버 슬롯(C5.3, 예약). 사용자가 날짜/커스텀 시리즈를 주입할 수 있다.
 * ⚠️ 슬롯 등록 경로만 확보되어 있으며, RangeSelectionManager/FillEngine 소비 배선은 F1-b(Full) 대상.
 * / F1 custom fill-series resolver slot (C5.3, reserved). Lets users inject date/custom series.
 * ⚠️ Only the registration path exists; consumption wiring is scheduled for F1-b (Full).
 */
export type FillSeriesResolverFn = (sourceLine: any[], k: number, axisSign: 1 | -1) => any;

/** 슬롯명 → 시그니처 매핑. / Slot name → signature map. */
export interface StrategyMap {
  sortComparator: SortComparatorFn;
  filterPredicate: FilterPredicateFn;
  displayFormatter: DisplayFormatterFn;
  cellSerializer: CellSerializerFn;
  groupKeyFn: GroupKeyFn;
  summaryOp: SummaryOpFn;
  fillSeriesResolver: FillSeriesResolverFn;
  cellClassResolver: CellClassResolverFn;
  ariaLabelResolver: AriaLabelResolverFn;
  skinResolver: SkinResolverFn;
}

/**
 * R12b(item3 §6.1): 스킨 FORM 해석 인터셉트 슬롯. AppearanceResolver 가 fallback 과 함께 읽어(제로코스트)
 * 오버라이드가 form 토큰 델타를 통째로 가로챌 수 있다. 미설정 시 내장 스킨 카탈로그가 그대로 적용.
 * / R12b (item3 §6.1): skin FORM resolution intercept slot. AppearanceResolver reads it with a
 * fallback (zero-cost) so an override can hijack the whole form-token delta. When unset, the
 * built-in skin catalog applies as-is.
 */
export type SkinResolverFn = (skinId: string) => SkinTokenDelta | null;

/**
 * R11(§4.3, T-ζ): SemVer 보증되는 **타입드 override 카탈로그**(좁은 "지원됨" 문).
 * `override("anyMethod", fn)` 문자열 탈출구(UC-11, best-effort)는 그대로 열려 있고 —
 * 이 인터페이스는 축복된(blessed) 확장점 이름을 IDE 발견가능하게 좁게 표시할 뿐, 넓은 문을 닫지 않는다.
 * 각 항목은 소비 테스트를 동반한다(유령 확장점 금지, DeMarco M9b).
 * / R11 (§4.3, T-ζ): SemVer-guaranteed **typed override catalog** (the narrow "supported"
 * statement). The `override("anyMethod", fn)` string escape hatch (UC-11, best-effort) stays
 * open — this interface only surfaces blessed extension-point names for IDE discovery.
 */
export interface OverridePoints<T = any> {
  /** 셀 표시 텍스트 해석(렌더훅 displayText 의 근원). / Cell display-text resolution (source of the displayText render hook). */
  getDisplayValue(rowIndex: number, field: string): string;
  /** 원시 셀 값 접근. / Raw cell value access. */
  readCell(rowIndex: number, field: string): any;
}

/** 호출가능 + .strategy 멤버를 가진 하이브리드 override API. / Hybrid override API: callable plus a .strategy member. */
export interface OverrideApi<T = any> {
  /** R11(§4.3): 타입드 오버로드 — 축복된 확장점 이름(IDE 발견). SemVer 보증 카탈로그. / R11 (§4.3): typed overload — blessed extension-point names (IDE discovery). SemVer-guaranteed catalog. */
  <K extends keyof OverridePoints<T>>(name: K, fn: OverrideLayerFn, opts?: OverrideCallOptions): OpenGridInstance<T>;
  /** 메서드 본문 무수정 런타임 래핑(C1-clean, 탈출구 UC-11). 체이닝 위해 grid 인스턴스 반환. / Runtime wrapping without touching method bodies (C1-clean, escape hatch UC-11). Returns the grid instance for chaining. */
  (name: string, fn: OverrideLayerFn, opts?: OverrideCallOptions): OpenGridInstance<T>;
  /** 알고리즘 슬롯 등록(Phase 2 매니저 훅포인트). 체이닝 위해 grid 인스턴스 반환. / Register an algorithm slot (Phase 2 manager hook point). Returns the grid instance for chaining. */
  strategy<K extends StrategySlot>(slot: K, fn: StrategyMap[K]): OpenGridInstance<T>;
  strategy(slot: string, fn: Function): OpenGridInstance<T>;
}

/**
 * 그리드 공개 인스턴스 계약(OpenGrid 가 구현). 세부 문서는 OpenGrid 클래스 참조.
 * / Public grid instance contract (implemented by OpenGrid). See the OpenGrid class for
 * per-method documentation.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface OpenGridInstance<T = any> {
  // ── grid.override() 확장 ──────────────────────────────
  /** 공개 메서드를 런타임 래핑하거나(.override) 알고리즘 슬롯을 등록(.strategy). */
  override: OverrideApi<T>;
  /** 단일 메서드 원본 복구. */
  restore(name: string): OpenGridInstance<T>;
  /** 전체 override + strategy 복구(destroy 시 자동). */
  restoreAll(): OpenGridInstance<T>;
  /** 해당 메서드가 override 되어 있는지. */
  hasOverride(name: string): boolean;
  /** override 등록된 메서드 이름 목록. */
  getOverrideNames(): string[];
  /** strategy 슬롯 조회(미등록 시 fallback 반환). 매니저 read API. */
  getStrategy<F extends Function>(slot: string, fallback: F): F;

  // 데이터
  setData(data: T[]): void;
  getData(): T[];
  getSourceRows(): T[];
  pushData(data: T[]): void;
  prefixData(data: T[]): void;
  clearData(): void;

  // 행 CRUD
  insertRow(item: Partial<T>, position?: Position): void;
  pushRow(items: Partial<T> | Partial<T>[]): void;
  unshiftRow(items: Partial<T> | Partial<T>[]): void;
  deleteRow(rowIndex: number | number[]): void;
  deleteById(ids: string[]): void;

  // 셀 값
  readCell<K extends keyof T>(rowIndex: number, field: K): T[K];
  readCell(rowIndex: number, field: string): any;
  getDisplayValue(rowIndex: number, field: string): string;
  writeCell(rowIndex: number, field: string, value: any): void;
  getRowAt(rowIndex: number): T;

  // ── Phase 0 인프라(C0.3/C2.1) ────────────────────────────
  /** flat/visual index ↔ data 리졸버. F1/F3/F4 는 이 모델을 경유해 대상을 해소한다. */
  getFlatRowModel(): import('./FlatRowModel.js').FlatRowModel;
  /** 배치 쓰기 시작 — 이후 writeCell 들의 render/dataChange 를 지연·coalesce(reentrant). */
  beginBatch(): void;
  /** 배치 종료 — 배치 중 쓰기가 있었으면 1회 render + 1회 coalesced dataChange. */
  endBatch(): void;
  /**
   * beginBatch+루프+endBatch 래퍼. rowIndex 는 flat index — kind!=='data' 대상(group/tree/
   * detail 의사행)은 쓰기 전에 skip 한다(C0.3 쓰기 안전). 반환값 = 건너뛴 셀 수.
   */
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number;

  // 변경 추적
  getChanges(): { added: T[]; edited: T[]; removed: T[] };
  getEditedRows(): T[];
  getChangedRows(): T[];   // 하위 호환 — getEditedRows() 권장
  getChangedColumns(): Array<{ row: T; fields: string[]; diff: Array<{ field: string; oldValue: any; newValue: any }> }>;
  getAddedRows(): T[];
  getRemovedRows(): T[];
  getOriginalRow(rowIndex: number): T | undefined;
  getRowsWithState(stateField: string): T[];
  undo(): void;
  redo(): void;
  clearHistory(): void;

  // 컬럼
  getColumnDefs(): ColumnDef<T>[];
  getAllColumnDefs(): ColumnDef<T>[];
  getColumnCount(): number;
  applyColumns(columns: ColumnDef<T>[]): void;
  insertColumn(colDef: ColumnDef<T>, position?: Position): void;
  deleteColumn(field: string): void;
  hideColumn(field: string | string[]): void;
  showColumn(field: string | string[]): void;
  getColumnIndex(field: string): number;
  getFieldAt(index: number): string;
  getColValues(field: string, all?: boolean): any[];
  getUniqueValues(field: string, all?: boolean): any[];
  setColWidths(widths: number[]): void;
  calcColWidths(fitToGrid?: boolean): number[];

  // 선택
  getSelections(): T[];
  getActiveRow(): number;
  activate(index: number): void;
  deselect(): void;

  // ── F1: 범위 선택 + 채우기 핸들(11_design_F1_v2.md §6.2, C4) ────────────
  /** 정규화 rects(없으면 []). MVP 는 길이 ≤1. */
  getRangeSelection(): CellRange[];
  /** = getRangeSelection()[0] ?? null(C4, F4 소비). */
  getActiveRange(): CellRange | null;
  setRangeSelection(range: CellRange | CellRange[]): void;
  clearRangeSelection(): void;
  /** 현재 활성 범위의 값 2D 배열(FR-6, F4 필수 계약). */
  getRangeValues(): any[][];
  /** 현재 활성 범위 숫자 셀의 OGDecimal 기반 통계(FR-6, F4 필수 계약). */
  getRangeStats(): _RangeStats | null;
  /** source→target 채우기(배치 경유, C2). axis 는 두 rect 상대 위치로 추론. */
  fillRange(source: CellRange, target: CellRange, mode?: 'copy' | 'series'): void;

  // ── F4: 그리드 데이터 통합 차트(11_design_F4_v2.md §6, C5) ────────────
  createChart(config: import('./chart/types.js').ChartConfig): import('./chart/types.js').ChartInstance;
  getCharts(): import('./chart/types.js').ChartInstance[];
  destroyCharts(): void;

  // ── F3: 셀 수식(11_design_F3_v2.md §8.2, C0/C2/C3) ────────────────────
  /** "=A1+B2" 형태. rowIndex 는 flat(C0), 내부 즉시 stable rowId 로 정규화. */
  setCellFormula(rowIndex: number, field: string, formula: string): void;
  getCellFormula(rowIndex: number, field: string): string | null;
  hasCellFormula(rowIndex: number, field: string): boolean;
  /** 수식 제거(값은 유지). */
  clearCellFormula(rowIndex: number, field: string): void;
  getCellError(rowIndex: number, field: string): FormulaErrorCode | null;
  /** 디버깅용 — 이 셀을 참조하는(종속) 셀들. */
  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }>;
  /** 디버깅용 — 이 셀이 참조하는(선행) 셀들. */
  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }>;
  /** 전체 수식 위상 재계산(setData/컬럼 변경 등). */
  recalculate(): void;
  /** 단일 셀 + 종속 폐포만 재계산. */
  recalculateCell(rowIndex: number, field: string): void;
  /** C3(F1 fill 전용): srcRowId/srcField 수식의 상대축만 dRow/dCol 오프셋한 새 수식 원문. */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string;

  // ── F2: 마스터/디테일(11_design_F2_v2.md §6.2, C5.4) ──────────────────
  /** rowRef 는 flat/visual index(C0.2) 또는 stable id. maxDepth 초과 시 거부(announce, FR-10). */
  expandRow(rowRef: number | { id: string }): void;
  collapseRow(rowRef: number | { id: string }): void;
  toggleRow(rowRef: number | { id: string }): void;
  isRowExpanded(rowRef: number | { id: string }): boolean;
  collapseAllDetails(): void;
  /** 펼쳐진 적 없으면 undefined. renderer 반환값 또는 자동 생성 서브그리드 인스턴스. */
  getDetailInstance<D = any>(rowRef: number | { id: string }): D | undefined;
  /** FR-11: 컬럼/호스트 리사이즈 후 열린 패널 폭을 강제 재동기(보통은 재렌더가 자동 처리). */
  resyncPanelWidths(): void;

  // 체크박스
  getChecked(): Array<{ row: T; rowIndex: number }>;
  getAllChecked(): T[];
  checkById(ids: string[]): void;
  addCheckById(ids: string[]): void;
  checkByValue(field: string, values: any[]): void;
  uncheckById(ids: string[]): void;
  uncheckAll(): void;

  // 정렬
  orderBy(field: string, dir?: SortDir): void;
  orderBy(sortList: SortItem[]): void;
  resetOrder(): void;

  // 필터
  setFilter(field: string, filterItems: FilterItem[]): void;
  resetFilter(field?: string): void;
  getFilterState(): Record<string, FilterItem[]>;
  restoreFilter(state: Record<string, FilterItem[]>): void;

  // 그리드↔그리드 행 이동 (드래그 또는 화살표 셔틀과 공통 경로)
  /** 지정 행들을 다른 그리드로 이동. 3단계 이벤트 + crossGridMapping 적용. */
  moveRowsTo(target: OpenGridInstance<T>, sourceIndexes: number[], targetIndex?: number): Promise<boolean>;
  /** 체크된 행을 다른 그리드로 이동 (화살표 셔틀용) */
  moveCheckedTo(target: OpenGridInstance<T>): Promise<boolean>;

  // 고정
  freeze(columnCount: number): void;
  freezeRows(rowCount: number): void;

  // 그룹
  groupBy(fields: string[]): void;
  clearGroup(): void;

  // 트리
  addTreeRow(item: Partial<T>, parentId: string, position?: Position): void;
  expandAll(): void;
  collapseAll(): void;
  expandNodes(ids: string | string[], open?: boolean): void;

  // 내보내기 / 인쇄
  exportExcel(options?: ExportOptions | string): void;
  exportCsv(options?: ExportOptions | string): void;
  exportJson(options?: ExportOptions | string): void;
  toArray(keyValue?: boolean): any[];
  print(options?: PrintOptions): void;

  // 스크롤
  jumpToRow(rowIndex: number): void;
  jumpToCol(field: string): void;
  getScrollPos(): { x: number; y: number };

  // 푸터
  setFooter(footerDef: FooterDef[]): void;
  getFooterData(): any[];
  getFooterValue(field: string): any;

  // UI
  resize(width?: number, height?: number): void;
  setTheme(theme: string): void;
  setThemeVar(varName: string, value: string): void;
  /** R12b: 스킨(FORM 축) 전환 — data-og-skin 설정 + 인라인 form 사이트 재해석. 색 테마와 직교. */
  setSkin(skin: string): void;
  /** R12b: 현재 스킨 id('default' = 오늘). */
  getSkin(): string;
  /** R12b: FORM 축 단일 토큰 런타임 오버라이드(setThemeVar 의 형태-축 형제). 색 값은 거부. */
  setSkinVar(varName: string, value: string): void;

  // i18n: 로케일 전환·조회·메시지 오버라이드·해석 / i18n: locale switch/read/override/resolve
  /** UI 로케일 전환 — 크롬+가시창 재렌더 + emit('localeChange'). 미등록 로케일은 never-throw. */
  setLocale(locale: string): void;
  /** 현재 인스턴스 로케일 id. */
  getLocale(): string;
  /** 이 인스턴스만 단일 메시지 오버라이드(setIcon 동형, 첫 호출 시 child 지연생성). */
  setMessage(key: LocaleMessageKey | string, value: MessageValue): OpenGridInstance<T>;
  /** 메시지 해석(오버라이드 우선 → 활성 로케일 → ko → 키). 절대 throw 안 함. */
  t(key: LocaleMessageKey | string, params?: Record<string, string | number>): string;

  destroy(): void;

  // 런타임 옵션 갱신
  setOptions(opts: Partial<GridOptions<T>>): void;

  // F5: 마스킹 API
  /** 컬럼 마스킹 ON/OFF. enabled=true → 마스킹 적용, enabled=false → 전체 해제 */
  setMaskEnabled(field: string, enabled: boolean): void;
  /** 현재 마스킹 활성 여부 반환 (true=마스킹 중) */
  getMaskEnabled(field: string): boolean;

  // F3: 컨텍스트 메뉴
  openContextMenu(e: MouseEvent, items?: ContextMenuItem[]): void;
  closeContextMenu(): void;

  // Sprint 38: 캐스케이딩 필터 셀렉트
  setFilterSelect(config: import('./FilterSelect.js').FilterSelectConfig | null): void;

  // F2: 워크시트
  addWorksheet(name: string, columns?: ColumnDef<T>[], data?: T[]): void;
  removeWorksheet(name: string): void;
  switchWorksheet(name: string): void;
  renameWorksheet(oldName: string, newName: string): void;
  getWorksheet(name: string): WorksheetState<T> | undefined;
  getWorksheetNames(): string[];
  exportSheetsExcel(filename?: string): void;

  // 이벤트
  on(event: string, handler: Function): OpenGridInstance<T>;
  once(event: string, handler: Function): OpenGridInstance<T>;
  off(event: string, handler?: Function): OpenGridInstance<T>;
  emit(event: string, data?: any): void;

  // ── 트리거 (before / after / complete) ──────────────────
  /**
   * 트리거 등록.
   * - 'before:{op}' : 작업 실행 전 호출. ctx.cancel() 시 해당 작업 중단.
   * - 'after:{op}'  : 작업 완료 후 호출. ctx.result에 결과 포함.
   * - 'complete'    : 모든 작업 완료 후 공통 핸들러.
   *
   * @example
   * grid.addTrigger('before:insertRow', ctx => {
   *   if (!ctx.args[0]?.name) ctx.cancel(); // 이름 없으면 삽입 중단
   * });
   * grid.addTrigger('after:setData', ctx => {
   *   console.log('로드 완료:', ctx.result, '건');
   * });
   */
  addTrigger(event: TriggerEvent | string, handler: TriggerHandler): this;
  /** 트리거 제거 */
  removeTrigger(event: TriggerEvent | string, handler: TriggerHandler): this;
  /** 트리거 전체 또는 특정 이벤트 클리어 */
  clearTriggers(event?: TriggerEvent | string): this;
}

// ─── F3: 컨텍스트 메뉴 / context menu ───────────────────────────────────
/** 컨텍스트 메뉴 항목. / Context menu item. */
export interface ContextMenuItem {
  id?: string;
  label?: string;
  icon?: string;
  action?: string | (() => void);
  disabled?: boolean;
  type?: 'divider';
}

// ─── Sprint 38: 캐스케이딩 필터 셀렉트 ─────────────────────
export type { FilterSelectColumn, FilterSelectConfig } from './FilterSelect.js';
// Phase 0(C0.3): FlatRowModel 리졸버 참조 타입 공개.
export type { FlatRowRef } from './FlatRowModel.js';

// ─── F2: 워크시트 / worksheets ─────────────────────────────────────────
/** 워크시트(탭) 정의. / Worksheet (tab) definition. */
export interface WorksheetDef<T = any> {
  name: string;
  /** 시트 전용 컬럼(미지정 시 그리드 columns 공유). / Sheet-specific columns (falls back to grid columns). */
  columns?: ColumnDef<T>[];
  data?: T[];
}

/** 워크시트 현재 상태 스냅샷. / Snapshot of a worksheet's current state. */
export interface WorksheetState<T = any> {
  name: string;
  columns: ColumnDef<T>[];
  data: T[];
}

// ─── 트리거 시스템 / trigger system ────────────────────────────────────────────
/**
 * 트리거 컨텍스트. / Trigger context.
 *
 * before:{op} 핸들러에서 ctx.cancel() 호출 → 해당 작업이 실행되지 않음.
 * after:{op} / complete 핸들러에서는 ctx.result로 결과 확인 가능.
 * / Calling ctx.cancel() in a before:{op} handler prevents the operation from running.
 * In after:{op} / complete handlers the result is available via ctx.result.
 */
export interface TriggerContext<TResult = any> {
  /** 작업 이름 (setData, insertRow, deleteRow, writeCell, ...) / Operation name (setData, insertRow, deleteRow, writeCell, ...) */
  readonly operation: string;
  /** 작업에 전달된 인수 배열 / Arguments passed to the operation */
  readonly args: any[];
  /** 작업 결과 (after:* / complete 에서만 채워짐) / Operation result (populated only in after:* and complete) */
  result?: TResult;
  /** 취소 여부 — cancel() 호출 후 true가 됨 / Cancellation flag — becomes true after cancel() */
  readonly cancelled: boolean;
  /** 추가 정보 (트리거 간 데이터 공유 등) / Extra info (data sharing between triggers, etc.) */
  extra?: Record<string, any>;
  /** 작업 시작 타임스탬프 (ms) / Operation start timestamp (ms) */
  readonly timestamp: number;
  /**
   * 작업 취소 — before:{op} 핸들러에서만 유효.
   * 이후 핸들러도 실행되지 않으며 실제 작업도 중단된다.
   * / Cancel the operation — valid only in before:{op} handlers.
   * Subsequent handlers are skipped and the operation itself is aborted.
   */
  cancel(): void;
}

/** 트리거 핸들러 함수 타입 / Trigger handler function type */
export type TriggerHandler<TResult = any> = (ctx: TriggerContext<TResult>) => void;

/** 지원되는 트리거 이벤트명 / Supported trigger event names */
export type TriggerEvent =
  | 'before:setData'     | 'after:setData'
  | 'before:insertRow'   | 'after:insertRow'
  | 'before:deleteRow'   | 'after:deleteRow'
  | 'before:writeCell'   | 'after:writeCell'
  | 'before:applyColumns'| 'after:applyColumns'
  | 'before:orderBy'     | 'after:orderBy'
  | 'before:setFilter'   | 'after:setFilter'
  | 'before:groupBy'     | 'after:groupBy'
  | 'complete';          // 모든 작업 완료 후 공통 호출
