// ============================================================
// OPEN_GRID 핵심 타입 정의 / OPEN_GRID core type definitions
// ============================================================

/**
 * 컬럼이 담는 값의 종류. 이 값 하나로 그리드가 "어떻게 정렬하고, 기본 렌더러로 무엇을 쓰고,
 * 편집기를 무엇으로 열지"를 결정합니다. 지정하지 않으면 문자열처럼 다룹니다.
 * / What kind of value a column holds. This single choice drives how the grid sorts, which
 * default renderer it uses, and which editor it opens. Unset behaves like a string.
 *
 *  - `'string'`  : 일반 텍스트. / Plain text.
 *  - `'number'`  : 숫자(오른쪽 정렬·숫자 비교·천단위 포맷). / Number (right-aligned, numeric compare, thousand separators).
 *  - `'date'`    : 날짜(달력 편집기·날짜 비교). / Date (calendar editor, date compare).
 *  - `'boolean'` : 참/거짓(체크박스 표시). / True/false (rendered as a checkbox).
 *  - `'select'`  : 목록에서 하나 선택(드롭다운 편집기). / Single choice from a list (dropdown editor).
 *  - `'radio'`   : 같은 그룹 안에서 하나 선택. / Single choice within a radio group.
 *  - `'img'`     : 셀 값을 이미지 주소로 보고 그림 표시. / Treat the value as an image URL and show it.
 *  - `'html'`    : HTML 문자열을 그대로 렌더(기본 sanitize). / Render an HTML string (sanitized by default).
 *  - `'barcode'` : 값을 바코드 그래픽으로 표시. / Show the value as a barcode graphic.
 */
export type DataType = 'string' | 'number' | 'date' | 'boolean' | 'select' | 'radio' | 'img' | 'html' | 'barcode';

// ─── F5: 마스킹 타입 (MaskingEngine.ts에 구현) / F5: masking types (implemented in MaskingEngine.ts) ─────────────
export type { MaskType, MaskDef } from './MaskingEngine.js';
// i18n: 인스턴스 메시지 오버라이드 타입(GridOptions.messages) / i18n: instance message override type (GridOptions.messages)
import type { PartialLocaleMessages, LocaleMessageKey, MessageValue } from './i18n/types.js';
/**
 * 사용자가 클릭·드래그로 무엇을 선택할 수 있는지 정하는 모드.
 * / What the user can select by clicking or dragging.
 *
 *  - `'single'`   : 한 번에 한 행만. / One row at a time.
 *  - `'row'`      : 행 단위 선택(다중 가능은 UI에 따름). / Row-level selection.
 *  - `'multiple'` : 여러 행을 함께(Ctrl/Shift). / Multiple rows together (Ctrl/Shift).
 *  - `'cells'`    : 스프레드시트처럼 셀 사각형 범위를 선택(채우기 핸들 포함). / Spreadsheet-style rectangular cell range (with fill handle).
 */
export type SelectionMode = 'single' | 'row' | 'multiple' | 'cells'; // 'cells' = F1 범위 선택
/** 정렬 방향. `'asc'` 오름차순(작은 값 먼저), `'desc'` 내림차순(큰 값 먼저). / Sort direction: 'asc' ascending (smallest first), 'desc' descending (largest first). */
export type SortDir = 'asc' | 'desc';
/**
 * 새 항목을 어디에 끼워 넣을지. 키워드로 상대 위치를 주거나, 숫자로 정확한 인덱스를 줍니다.
 * / Where to insert a new item — a keyword for a relative spot, or a number for an exact index.
 *
 *  - `'first'`  : 맨 앞. / At the very front.
 *  - `'last'`   : 맨 뒤. / At the very end.
 *  - `'before'` : 기준 위치 바로 앞. / Just before the reference position.
 *  - `'after'`  : 기준 위치 바로 뒤. / Just after the reference position.
 *  - `number`   : 해당 인덱스 자리. / At that exact index.
 */
export type Position = 'first' | 'last' | 'before' | 'after' | number;
/** 내장 셀 렌더러 타입 이름. / Built-in cell renderer type name. */
export type RendererType = 'text' | 'number' | 'date' | 'checkbox' | 'button' | 'link' | 'image' | 'icon' | 'switch' | 'sparkline' | 'template' | 'custom' | 'badge' | 'progress' | 'rating' | 'radio' | 'img' | 'html' | 'barcode';
/** 내장 셀 에디터 타입 이름. / Built-in cell editor type name. */
export type EditorType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'custom';

// ─── 이벤트 타입 / event types ───────────────────────────────────────────
/**
 * 사용자가 셀을 마우스로 조작할 때(클릭·더블클릭·마우스 올림 등) 그 핸들러로 전달되는 정보 묶음입니다.
 * "어느 행·어느 컬럼의 어떤 값이, 어떤 DOM 요소에서, 원래 어떤 브라우저 이벤트로" 일어났는지를
 * 한 번에 담아 주므로 핸들러 안에서 좌표를 다시 계산할 필요가 없습니다.
 * / The payload handed to your handler when the user manipulates a cell with the mouse
 * (click / dbl-click / mouse-over …). It bundles which row & column, what value, which DOM
 * element, and the original browser event — so your handler never has to recompute coordinates.
 * 관련 옵션 / Related options: onCellClick, onCellDblClick, onCellMouseOver …
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface CellEvent<T = any> {
  /** 이벤트 이름('cellClick' 등). / The event name (e.g. 'cellClick'). */
  type: string;
  /** 대상 행의 화면 표시 순서 인덱스. / Screen-order index of the target row. */
  rowIndex: number;
  /** 대상 컬럼의 인덱스. / Index of the target column. */
  columnIndex: number;
  /** 대상 컬럼의 field 이름. / field name of the target column. */
  field: string;
  /** 그 셀의 원시 값. / Raw value of that cell. */
  value: any;
  /** 그 행의 데이터 객체 전체. / The full row-data object. */
  row: T;
  /** 그 컬럼의 정의. / The column's definition. */
  column: ColumnDef<T>;
  /** 실제 클릭된 셀 DOM 요소. / The actual clicked cell DOM element. */
  target: HTMLElement;
  /** 브라우저 원본 마우스 이벤트(좌표·수식어 키 등). / The underlying browser mouse event (coords, modifier keys …). */
  originalEvent: MouseEvent;
}

/**
 * 셀 값 편집의 흐름(편집 시작 → 커밋 직전 → 편집 끝) 각 지점에서 핸들러로 오는 정보입니다.
 * 편집 전 값(oldValue)과 편집 후 값(newValue)을 함께 주므로, 값이 실제로 바뀌었는지 비교하거나
 * 커밋 직전 훅에서 검증 후 되돌릴 수 있습니다.
 * / Delivered at each point in a cell edit (start → just-before-commit → end). It carries both the
 * value before (oldValue) and after (newValue) so you can compare, or validate and veto the commit.
 * 관련 옵션 / Related options: onEditStart, onEditBefore, onEditEnd
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface EditEvent<T = any> {
  /** 이벤트 이름('editStart'/'editEnd'/'editBefore'). / The event name. */
  type: string;
  /** 편집 중인 행의 화면 표시 순서 인덱스. / Screen-order index of the row being edited. */
  rowIndex: number;
  /** 편집 중인 컬럼의 인덱스. / Index of the column being edited. */
  columnIndex: number;
  /** 편집 중인 컬럼의 field 이름. / field name of the column being edited. */
  field: string;
  /** 편집 전 값. / Value before the edit. */
  oldValue: any;
  /** 편집 후 들어온 값. / Value after the edit. */
  newValue: any;
  /** 편집 중인 행의 데이터 객체. / The row-data object being edited. */
  row: T;
  /** 편집 중인 컬럼의 정의. / The column's definition. */
  column: ColumnDef<T>;
  /** 편집 커밋 직전(onEditBefore)에 true 로 바꾸면 그 편집을 무효화합니다. / In the pre-commit hook (onEditBefore), set true to reject the edit. */
  cancel?: boolean;
}

/**
 * 셀이 아니라 "행 전체"를 마우스로 조작했을 때(행 클릭·더블클릭·마우스 올림 등) 오는 정보입니다.
 * 컬럼 정보 없이 어느 행인지와 그 행 데이터만 필요할 때 CellEvent 보다 가볍게 씁니다.
 * / Delivered when the user manipulates a whole row (row click / dbl-click / mouse-over …). Lighter
 * than CellEvent for when you only need which row and its data, not the column.
 * 관련 옵션 / Related options: onRowClick, onRowDblClick, onRowMouseOver …
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface RowEvent<T = any> {
  /** 이벤트 이름('rowClick' 등). / The event name (e.g. 'rowClick'). */
  type: string;
  /** 대상 행의 화면 표시 순서 인덱스. / Screen-order index of the target row. */
  rowIndex: number;
  /** 그 행의 데이터 객체 전체. / The full row-data object. */
  row: T;
  /** 이벤트가 일어난 행 DOM 요소. / The row DOM element where the event occurred. */
  target: HTMLElement;
  /** 브라우저 원본 마우스 이벤트. / The underlying browser mouse event. */
  originalEvent: MouseEvent;
}

/**
 * 셀에 포커스가 있는 상태에서 키를 눌렀을 때(키 다운·업·프레스) 오는 정보입니다. CellEvent 가 담는
 * 행·컬럼·값에 더해, 눌린 키 이름(key)을 함께 주므로 Enter 이동·Delete 지우기 같은 단축키를 직접 구현할 수 있습니다.
 * / Delivered when a key is pressed while a cell has focus (keydown/keyup/keypress). On top of the
 * row/column/value that CellEvent carries, it adds the pressed `key` name so you can build
 * shortcuts like Enter-to-move or Delete-to-clear.
 * 관련 옵션 / Related options: onCellKeyDown, onCellKeyUp, onCellKeyPress
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface CellKeyEvent<T = any> {
  /** 이벤트 이름('cellKeyDown' 등). / The event name. */
  type: string;
  /** 대상 행의 화면 표시 순서 인덱스. / Screen-order index of the target row. */
  rowIndex: number;
  /** 대상 컬럼의 인덱스. / Index of the target column. */
  columnIndex: number;
  /** 대상 컬럼의 field 이름. / field name of the target column. */
  field: string;
  /** 그 셀의 원시 값. / Raw value of that cell. */
  value: any;
  /** 그 행의 데이터 객체 전체. / The full row-data object. */
  row: T;
  /** 그 컬럼의 정의. / The column's definition. */
  column: ColumnDef<T>;
  /** 눌린 키 이름(KeyboardEvent.key: 'Enter','ArrowDown','a' …). / The pressed key name (KeyboardEvent.key). */
  key: string;
  /** 이벤트가 일어난 셀 DOM 요소. / The cell DOM element where the event occurred. */
  target: HTMLElement;
  /** 브라우저 원본 키보드 이벤트(수식어 키 등). / The underlying browser keyboard event (modifier keys …). */
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
 * 선택된 셀들의 사각형 범위를 네 모서리 인덱스로 나타냅니다(엑셀의 A1:C5 같은 개념).
 * 범위 선택 기능이 이 값을 만들어 내고, 수식의 참조 대상과 차트의 데이터 소스가 이 좌표를 그대로 읽어 씁니다.
 * / A rectangular block of selected cells, given as its four corner indexes (think of a spreadsheet's
 * A1:C5). Range selection produces it; cell formulas and chart sources consume the same coordinates.
 *
 * 좌표가 가리키는 것 / What the coordinates mean:
 *  - 행 인덱스(startRow/endRow)는 "화면에 보이는 순서"입니다. 그룹·트리의 가상 행이나 펼쳐진 상세 행까지
 *    포함한 순서라서, 정렬·필터만 반영한 순수 데이터 순서와는 다를 수 있습니다.
 *    / Row indexes are in on-screen order — they include group/tree pseudo-rows and expanded detail
 *    rows, so they can differ from the pure data order that reflects only sort/filter.
 *  - 컬럼 인덱스(startCol/endCol)는 "지금 보이는 컬럼들" 기준입니다(숨긴 컬럼 제외). 컬럼을 다시 보이게 하면
 *    재렌더 때 좌표 표시가 갱신됩니다.
 *    / Column indexes count only currently visible columns (hidden ones excluded); un-hiding a column
 *    refreshes the displayed coordinates on the next render.
 *
 * 주의 / Note: 선택의 "영구 신원"은 이 인덱스가 아니라 안정적인 (행 id × field) 앵커로 저장됩니다.
 * CellRange 는 어디까지나 "지금 화면에 투영된" 사각형 표현입니다.
 * / The persistent identity of a selection is stored as a stable (rowId × field) anchor, not as these
 * indexes — CellRange is only the "currently projected onto screen" rectangle.
 */
// CellRangeSemantics(C0.4, 15_cross_contracts.md). 소유자 = F1(범위 선택). F3(수식 ref)·F4(차트 소스)가 소비.
// 행=flat/visual index(C0.2, FlatRowModel), 컬=ColumnLayout.visibleLeaves, 영속 신원=stable rowId×field 앵커(C0.5).
export interface CellRange {
  /** 위쪽 경계 행(화면 표시 순서). / Top boundary row (on-screen order). */
  startRow: number;
  /** 아래쪽 경계 행(화면 표시 순서). / Bottom boundary row (on-screen order). */
  endRow: number;
  /** 왼쪽 경계 컬럼(보이는 컬럼 기준). / Left boundary column (among visible columns). */
  startCol: number;
  /** 오른쪽 경계 컬럼(보이는 컬럼 기준). / Right boundary column (among visible columns). */
  endCol: number;
}

// ─── F1: 범위 선택 + 채우기 핸들 옵션/이벤트(11_design_F1_v2.md §6, C5) ────
// ─── F1: range selection + fill handle options/events ────
/**
 * 스프레드시트식 범위 선택과 채우기 핸들의 세부 동작을 조절합니다. selection: 'cells' 로 켠 뒤,
 * 채우기 핸들을 보일지·자동 스크롤 폭·시리즈 자동 감지 여부 등을 여기서 미세 조정합니다.
 * / Fine-tunes spreadsheet-style range selection and the fill handle. After enabling selection:
 * 'cells', tweak whether the handle shows, the autoscroll band, series auto-detection, and so on.
 */
export interface RangeSelectionOptions {
  /** 범위 선택 켜기. 생략 시 selection==='cells' 여부를 따릅니다. / Enable range selection. Unset follows whether selection==='cells'. */
  enabled?: boolean;
  /** 선택 영역 모서리의 채우기 핸들(작은 사각형)을 보이고 드래그할 수 있게 할지. 기본 true. / Show and allow dragging the fill handle (the small corner square). Default true. */
  fillHandle?: boolean;
  /** Ctrl 로 사각형 여러 개를 동시에 선택하게 할지. 기본 false(아직 미구현). / Whether Ctrl selects several rectangles at once. Default false (not implemented yet). */
  multiRange?: boolean;
  /** 드래그가 이 가장자리 폭(px) 안에 들어오면 화면이 자동으로 스크롤됩니다. 기본 24. / When the drag enters this edge band (px), the view auto-scrolls. Default 24. */
  autoScrollEdge?: number;
  /** 1,2,3… 같은 규칙을 자동 감지해 이어 채울지. 기본 true. false 면 항상 단순 복사만 합니다. / Whether to auto-detect series (1,2,3…) and extend them. Default true; false always plain-copies. */
  seriesFill?: boolean;
  /** 그룹·트리 모드에서도 범위 선택을 허용할지. 기본 false(현재 비활성). / Whether range selection also works in group/tree mode. Default false (off for now). */
  enabledInTreeGroup?: boolean;
  /** 채우기가 수식이 들어 있는 셀을 덮어쓰도록 허용할지. 기본 false(수식 보호). / Whether filling may overwrite cells that contain formulas. Default false (formulas protected). */
  fillOverwriteFormula?: boolean; // C3.2 opt-in
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

/**
 * 셀에 '=' 로 시작하는 수식을 넣어 다른 셀을 참조·계산하게 하는 기능의 세부 설정입니다. 엑셀처럼
 * 셀에 직접 '=A1+B2' 를 입력해 쓰게 할지, 참조를 어떻게 해석할지, 변경 시 자동으로 다시 계산할지 등을 정합니다.
 * / Settings for cell formulas — cells that start with '=' and reference/compute other cells. Decide
 * whether users can type '=A1+B2' directly, how references are interpreted, and whether edits
 * trigger a recompute.
 */
export interface FormulaOptions {
  /** 셀에 '=' 를 직접 입력하면 수식으로 자동 인식할지. 기본 false(끄면 기존 편집과 동일). setCellFormula API 로는 이 값과 상관없이 언제나 수식을 넣을 수 있습니다. / Whether typing '=' in a cell is auto-recognized as a formula. Default false; the setCellFormula API works regardless. */
  enabled?: boolean;
  /**
   * 참조를 어떻게 기억할지. 'stable'(기본)은 행을 정렬·이동해도 같은 셀을 계속 가리키고,
   * 'relative'는 위치 기준(엑셀 A1 상대참조처럼)입니다.
   * / How references are anchored. 'stable' (default) keeps pointing at the same cell even after
   * sorting/moving rows; 'relative' is position-based (like a spreadsheet's relative A1 ref).
   */
  refMode?: 'stable' | 'relative'; // §3.2
  /** 나눗셈 결과의 소수점 자리수. 기본 30. / Decimal precision for division results. Default 30. */
  divisionPrecision?: number;
  /** 상단 수식 입력 바를 보일지. 기본 false(아직 미구현). / Whether to show a top formula bar. Default false (not implemented yet). */
  formulaBar?: boolean;
  /** 수식이 든 셀에 표식(마커)을 달아 구분해 줄지. 기본 true. / Whether to mark formula-bearing cells so they stand out. Default true. */
  cellMarker?: boolean;
  /** 참조된 셀이 바뀌면 수식을 자동으로 다시 계산할지. 기본 true. / Whether editing a referenced cell auto-recomputes the formula. Default true. */
  autoRecalc?: boolean;
  /** 어떤 셀의 수식 자체가 바뀌었을 때 호출. / Fired when a cell's formula text itself changes. */
  onFormulaChange?: (e: FormulaChangeEvent) => void;
  /** 재계산이 끝났을 때 호출(무엇이 바뀌었고 얼마나 걸렸는지). / Fired after a recompute finishes (what changed, how long it took). */
  onFormulaRecalc?: (e: FormulaRecalcEvent) => void;
  /** 수식 계산 중 오류(순환 참조·0 나눗셈 등)가 났을 때 호출. / Fired on a formula error (circular ref, divide-by-zero …). */
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
  /** 이번에 다시 계산해야 했던 셀 무리가 임계값(500)을 넘었으면 true. 성능 모니터링·경고용 신호입니다. / true when the recalculated cell set exceeded the threshold (500) — a signal for perf monitoring/warnings. */
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
/**
 * 상세 패널을 직접 그릴 때(renderer) 세 번째 인자로 받는 도우미 묶음입니다. 방금 펼쳐진 행의 정보와,
 * 그 패널을 접거나 다시 재는 조작을 담고 있어 커스텀 패널 안에서 그리드를 되짚을 수 있습니다.
 * / The helper bundle passed as the 3rd argument when you draw a detail panel yourself (renderer). It
 * carries the just-expanded row's info plus actions to collapse or re-measure the panel, so your
 * custom panel can reach back into the grid.
 */
export interface DetailRenderApi<T = any> {
  /** 이 패널을 소유한 그리드 인스턴스. / The grid instance owning this panel. */
  grid: OpenGridInstance<T>;
  /** 펼쳐진 행의 안정적 id. / Stable id of the expanded row. */
  rowId: string;
  /** 이 그리드가 몇 겹째 중첩인지. 0 = 최상위. / How deeply nested this grid is. 0 = top level. */
  depth: number; // CON-4
  /** 이 패널을 접습니다. / Collapse this panel. */
  collapse: () => void;
  /** 패널 크기를 다시 잽니다. / Re-measure the panel. */
  refresh: () => void; // Phase2 auto 대비 자리 — MVP 는 no-op 에 가까움
}

/**
 * 각 행을 펼치면 그 아래에 딸린 상세 패널이 열리는 마스터/디테일 기능의 설정입니다. 주문 목록에서 한 줄을
 * 열면 주문 상세가, 부서 목록에서 한 줄을 열면 소속 직원 표가 펼쳐지는 식입니다. 패널 내용은 두 가지 방법으로
 * 채웁니다 — 직접 HTML 을 그리는 renderer 를 주거나, 자식 그리드를 자동 생성하는 subgridOptions 를 줍니다.
 * / Master/detail: expanding a row opens an attached detail panel beneath it — open an order to see
 * its lines, open a department to see its staff. Fill the panel either by drawing HTML yourself
 * (renderer) or by auto-creating a child grid (subgridOptions).
 */
// C5.1 단일 중첩 — 구 flat `detail*`/`masterDetail:boolean` 은 이 안으로 접힘.
export interface MasterDetailOptions<T = any> {
  /** 기능 켜기/끄기. 기본 false(꺼짐). / Turn the feature on/off. Default false (off). */
  enabled?: boolean;
  /** 패널 안을 직접 그리는 함수(host 요소에 HTML/컴포넌트 주입). subgridOptions 와 같이 주면 이쪽이 우선. / A function that draws the panel yourself (inject HTML/components into host). Wins over subgridOptions if both given. */
  renderer?: (row: T, host: HTMLElement, api: DetailRenderApi<T>) => void | HTMLElement;
  /** 패널의 세로 높이(px). 기본 200. 현재는 행 높이의 배수로 맞춰집니다. / Panel height (px). Default 200. Currently snapped to a multiple of the row height. */
  height?: number; // MVP: rowHeight 배수로 양자화(EC-10)
  /**
   * 패널 높이를 어떻게 정할지. 'fixed'(기본)만 지금 동작합니다. 'auto'(내용에 맞춰 자동)는 아직 미공개라,
   * 지정해도 'fixed' 로 처리되고 한 번 경고를 남깁니다.
   * / How the panel height is decided. Only 'fixed' (default) works today. 'auto' (fit-to-content) is
   * not released yet — if set, it's treated as 'fixed' and warns once.
   */
  heightMode?: 'fixed' | 'auto'; // 'auto' 는 Spike-B(C12.2) 통과 전 미공개
  /** 여러 행을 동시에 펼쳐 둘지. 기본 true. false 로 하면 아코디언처럼 한 번에 하나만 열립니다. / Whether several rows can stay open at once. Default true; false = accordion (one open at a time). */
  expandMultiple?: boolean;
  /** true 면 접어도 패널 내용을 캐시로 남겨 다시 펼칠 때 재생성을 건너뜁니다. 기본 false. / true keeps the panel cached when collapsed, skipping rebuild on re-expand. Default false. */
  cache?: boolean;
  /** 펼침/접힘 버튼을 어디에 둘지. 기본 'expander-col'(전용 컬럼). 'first-cell'=첫 셀 안. / Where the expand toggle sits. Default 'expander-col' (a dedicated column); 'first-cell' = inside the first cell. */
  toggle?: 'expander-col' | 'first-cell';
  /** 스크린리더가 읽을 패널 영역 이름. 기본 '상세 내용'. / The panel region's screen-reader label. Default '상세 내용' (Details). */
  ariaLabel?: string;
  /** 패널 안에 또 패널을 열 수 있는 최대 겹수. 기본 2. / How many levels of nested panels are allowed. Default 2. */
  maxDepth?: number; // CON-4/FR-10
  /** 지정하면 height(px) 대신 "행 몇 개 높이"(정수, 최소 1)로 패널 높이를 정합니다. / When set, sizes the panel by row-count (integer, min 1) instead of height(px). */
  detailRowCount?: number;
  /** renderer 를 안 줬을 때, 이 옵션으로 자식 그리드를 자동 생성해 패널을 채웁니다. / When no renderer is given, auto-create a child grid from these options to fill the panel. */
  subgridOptions?: GridOptions<any>;
}

/**
 * 행 상세 패널이 펼쳐지거나(rowExpand) 접힐 때(rowCollapse) 핸들러로 오는 정보입니다.
 * 어느 행인지와, 그 상세 패널이 붙은 DOM 요소(host)를 함께 줍니다.
 * / Delivered when a row's detail panel expands (rowExpand) or collapses (rowCollapse). It tells you
 * which row it was and the DOM element (host) the detail panel is attached to.
 */
export interface RowExpandEvent<T = any> {
  /** 대상 행의 화면 표시 순서 인덱스. / Screen-order index of the target row. */
  rowIndex: number;
  /** 대상 행의 안정적 id. / Stable id of the target row. */
  rowId: string;
  /** 그 행의 데이터 객체. / The row-data object. */
  row: T;
  /** 상세 패널이 붙은 DOM 요소(접힘 이벤트에서는 null 일 수 있음). / The DOM element the detail panel is attached to (may be null on collapse). */
  host: HTMLElement | null;
}

// ─── 컬럼 정의 / column definition ────────────────────────────────────────────
/**
 * 셀을 어떻게 그릴지 자세히 지정합니다. 렌더러 타입 이름만으로 부족해 부가 설정까지 주고 싶을 때
 * 씁니다(`column.renderer` 에 문자열 대신 이 객체를 넘김). `type` 이외의 키는 렌더러마다 다르게 해석됩니다.
 * / Detailed spec for how a cell is drawn. Use it (instead of a bare renderer-type string in
 * `column.renderer`) when the renderer needs extra settings. Keys beyond `type` are
 * renderer-specific.
 */
export interface RendererDef {
  /** 사용할 내장 렌더러 이름. / Which built-in renderer to use. */
  type: RendererType;
  /** 렌더러별 추가 옵션(자유 키). / Renderer-specific extra options (free-form keys). */
  [key: string]: any;
}

/**
 * 편집기를 어떻게 열지 자세히 지정합니다. 예를 들어 `select` 편집기에 선택지 목록을,
 * `number` 편집기에 최소·최대·증가폭을 함께 줄 때 씁니다(`column.editor` 에 이 객체를 넘김).
 * / Detailed spec for how the editor opens — e.g. a `select` editor's choices, or a `number`
 * editor's min/max/step (passed to `column.editor`).
 */
export interface EditorDef {
  /** 사용할 내장 편집기 이름. / Which built-in editor to use. */
  type: EditorType;
  /** select 편집기의 선택지(문자열 또는 {label,value}). / Choices for a select editor. */
  options?: Array<string | { label: string; value: any }>;
  /** select 에서 다중 선택 허용. / Allow multiple selection in select. */
  multiple?: boolean;
  /** number 편집기의 최솟값. / Minimum for a number editor. */
  min?: number;
  /** number 편집기의 최댓값. / Maximum for a number editor. */
  max?: number;
  /** number 편집기의 증가 단위. / Step increment for a number editor. */
  step?: number;
  /** 입력값 포맷 문자열. / Format string for the input value. */
  format?: string;
  /** 빈 편집기에 보일 안내 문구. / Placeholder shown in an empty editor. */
  placeholder?: string;
  /** 편집기별 추가 옵션(자유 키). / Editor-specific extra options (free-form keys). */
  [key: string]: any;
}

/**
 * 컬럼 한 개를 어떻게 보이고 동작하게 할지 담는 설정 뭉치입니다. 그리드는 `columns` 배열에 담긴 이
 * 정의들을 왼쪽부터 순서대로 그립니다. 최소한 `field`(어떤 데이터를 보여줄지)와 `header`(머리글 글자)만
 * 있으면 되고, 나머지는 필요할 때만 켜는 선택 항목입니다.
 * / The settings bundle for a single column — what it shows and how it behaves. The grid draws the
 * definitions in the `columns` array left to right. Only `field` (which data to show) and `header`
 * (the caption) are required; everything else is opt-in.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * const col: ColumnDef = { field: 'price', header: '가격', type: 'number', format: '#,##0' };
 */
export interface ColumnDef<T = any> {
  /** 이 컬럼이 읽어 올 행 객체의 속성 이름(예: 행이 `{price: 1000}` 이면 `'price'`). 컬럼마다 고유. / The row-object property this column reads (e.g. `'price'` for a row `{price: 1000}`). Unique per column. */
  field: string;
  /** 머리글에 보일 글자. 문자열 안의 '\n' 은 두 줄로 나뉩니다. / The caption shown in the header. A '\n' inside splits into two lines. */
  header: string;
  /** 이 폭(px)으로 고정. 지정하면 flex 를 무시하고 정확히 이 값이 됩니다. / Pin this width (px). When set it overrides flex and stays exactly this. */
  width?: number;
  /** 줄어들 때 넘지 않을 최소 폭(px). / Lower bound (px) the column won't shrink past. */
  minWidth?: number;
  /** 늘어날 때 넘지 않을 최대 폭(px). / Upper bound (px) the column won't grow past. */
  maxWidth?: number;
  /** 남는 가로 공간을 컬럼끼리 나눌 때의 비율. 값이 클수록 더 많이 차지합니다(width 미지정 컬럼끼리). / Weight for sharing leftover horizontal space — higher takes more (among columns without width). */
  flex?: number;

  /**
   * 이 컬럼 값의 종류. 이걸 정하면 그에 맞는 정렬 방식과 기본 렌더러가 자동으로 붙습니다
   * (예: 'number' 는 오른쪽 정렬 + 숫자 비교). 지정하지 않으면 문자열처럼 다룹니다.
   * / The kind of value here. Setting it auto-wires the matching sort behavior and default renderer
   * (e.g. 'number' → right-aligned + numeric compare). Unset behaves like a string.
   */
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
  /** 저장된 코드값을 사람이 읽는 말로 바꿔 보여줄 때(예: `{ 'M': '남', 'F': '여' }`). / Show human-readable text for stored codes (e.g. `{ 'M':'Male', 'F':'Female' }`). */
  valueMap?: Record<string, string>;

  /** 셀을 그리는 방식. 내장 렌더러 이름 한 줄로 주거나, 부가 옵션이 필요하면 RendererDef 객체로 줍니다. / How the cell is drawn — a built-in renderer name, or a RendererDef object when extras are needed. */
  renderer?: RendererType | RendererDef;
  /**
   * 이 컬럼을 편집할 수 있는지. true 면 항상 편집 가능, 함수로 주면 행마다 다르게 결정합니다
   * (예: 상태가 '확정'인 행만 잠그기). GridOptions.editable 과 둘 다 참일 때만 실제로 열립니다.
   * / Whether this column is editable. true = always; a function decides per row (e.g. lock only
   * 'finalized' rows). Editing opens only when this AND GridOptions.editable are true.
   */
  editable?: boolean | ((row: T, rowIndex: number) => boolean);
  /** 편집기 종류. 내장 편집기 이름 한 줄로 주거나, 선택지·최소/최대 등이 필요하면 EditorDef 객체로 줍니다. / The editor — a built-in editor name, or an EditorDef object for choices/min/max, etc. */
  editor?: EditorType | EditorDef;

  /** 셀 정렬. / Cell text alignment. */
  align?: 'left' | 'center' | 'right';
  /** 헤더 정렬. / Header text alignment. */
  headerAlign?: 'left' | 'center' | 'right';
  /** 셀 인라인 스타일(정적 또는 값·행 함수). / Cell inline style (static or value/row function). */
  cellStyle?: CSSProperties | ((value: any, row: T, rowIndex: number) => CSSProperties);
  /** 헤더 인라인 스타일. / Header inline style. */
  headerStyle?: CSSProperties;

  /** 이 컬럼 머리글을 클릭하면 정렬되게 할지. 특정 컬럼만 정렬을 막거나 허용할 때 씁니다. / Whether clicking this header sorts. Use it to allow/deny sorting per column. */
  sortable?: boolean;
  /** 이 컬럼에 필터 아이콘·패널을 띄울지. / Whether to show the filter icon/panel on this column. */
  filterable?: boolean;
  /** 머리글 경계를 드래그해 폭을 조절하게 할지. / Whether the user can drag the header edge to resize. */
  resizable?: boolean;
  /** true 면 이 컬럼을 화면에서 감춥니다(데이터는 남고 showColumn 으로 다시 보임). / true hides the column (data stays; showColumn brings it back). */
  hidden?: boolean;
  /** true 면 가로 스크롤과 무관하게 왼쪽에 붙박아 둡니다(핵심 식별 컬럼 고정용). / true pins the column to the left regardless of horizontal scroll (for key identifier columns). */
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

  /** 표시할 때 반올림해서 보여줄 소수점 자리수(합계 계산에도 반영). / Decimal places to show (also applied to summing). */
  precision?: number; // F4: display + kahanSum

  // 임의정밀도 컬럼 수식(OGDecimal 기반) — 다른 컬럼 값으로 이 컬럼 값을 계산.
  // / Arbitrary-precision column formula (OGDecimal-based) — compute this column from others.
  // 함수식 / function form: (row, D) => D.from(row.price).mul('0.035')
  // 문자열식 / string form: '[revenue] * [rate] / 100'
  /** 이 컬럼 값을 다른 컬럼으로 자동 계산. 함수식 또는 '[field]' 를 쓰는 문자열식. / Auto-compute this column from others — a function, or a string using '[field]' refs. */
  formula?: string | ((row: T, D: any) => any);
  /** 수식 나눗셈의 소수점 자리수. 기본 30. / Decimal precision for division inside the formula. Default 30. */
  formulaPrecision?: number;

  // 컬럼 마스킹 — 민감 값(주민번호·카드번호 등)을 가려 표시.
  // / Column masking — hide sensitive values (IDs, card numbers …).
  /** 이 컬럼 값을 가려 표시할 마스킹 타입 또는 상세 정의. / Mask type or detailed definition to obscure this column's values. */
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
/**
 * "이 컬럼을 이 방향으로 정렬" 한 건을 나타냅니다. 여러 개를 배열로 넘기면 앞에 있는 것이 1차 기준,
 * 그 값이 같을 때 다음 것이 2차 기준이 되는 다중 정렬이 됩니다(예: 부서 오름차순 → 급여 내림차순).
 * / One "sort this column this way" entry. Passed as an array, the first is the primary key and later
 * entries break ties — i.e. multi-column sort (e.g. dept asc, then salary desc).
 */
export interface SortItem {
  /** 정렬 기준 컬럼의 field. / field of the column to sort by. */
  field: string;
  /** 정렬 방향. / Sort direction. */
  dir: SortDir;
}

/**
 * 필터 한 줄 = "연산자 + 비교값". 예: `{ operator: '>=', value: 1000 }` 는 값이 1000 이상인 행만 남깁니다.
 * 한 컬럼에 여러 조건을 배열로 걸 수 있습니다(모두 만족하는 행만 통과).
 * / One filter clause = "operator + value". e.g. `{ operator: '>=', value: 1000 }` keeps rows whose
 * value is at least 1000. Multiple clauses per column combine (a row must satisfy all).
 */
export interface FilterItem {
  /**
   * 비교 방식. `'='`·`'!='`·`'>'`·`'>='`·`'<'`·`'<='` 는 값 비교, `'contains'`·`'startsWith'`·`'endsWith'`
   * 는 텍스트 부분 일치입니다. / How to compare — the six symbols are value comparisons; the three
   * word operators are text substring matches.
   */
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'startsWith' | 'endsWith';
  /** 비교 기준 값. / The value to compare against. */
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

/**
 * 그룹마다 소계/합계 행을 자동으로 끼워 넣는 설정입니다. groupBy 로 묶은 각 그룹의 지정 필드를
 * 합·평균 등으로 집계해 그룹 위나 아래에 요약 행으로 보여 줍니다.
 * / Auto-inserts a subtotal/summary row per group. For each group made by groupBy it aggregates the
 * chosen fields (sum, average …) and shows the result as a summary row above or below the group.
 */
export interface SummaryOptions {
  /** 집계할 컬럼들의 field 목록. / field names of the columns to aggregate. */
  fields: string[];
  /** 어떤 집계를 적용할지(하나 또는 여러 개). 생략 시 기본 동작. / Which aggregate(s) to apply (one or several). */
  ops?: SummaryOp | SummaryOp[];
  /** 요약 행을 그룹 위('top')에 둘지 아래('bottom')에 둘지. / Put the summary row above ('top') or below ('bottom') the group. */
  position?: 'top' | 'bottom';
  /** 한 그룹에 요약 행을 여러 줄 만들 때(예: 합계 줄 + 평균 줄). customFn 으로 직접 집계도 가능. / Multiple summary rows per group (e.g. a sum row + an average row); customFn allows your own aggregation. */
  rows?: Array<{
    op: SummaryOp;
    label?: string;
    customFn?: (items: any[]) => number;
  }>;
}

// ─── 푸터 / footer ─────────────────────────────────────────────────
/**
 * 그리드 맨 아래(또는 위) 고정 푸터의 셀 한 칸을 정의합니다. 스크롤과 무관하게 늘 보이는 합계 줄을
 * 만들 때 씁니다. `field`+`op` 를 주면 그 컬럼을 집계해 표시하고, `label` 만 주면 고정 문구를 표시합니다.
 * / Defines one cell of the pinned footer (bottom or top) — an always-visible totals row that stays
 * put while the body scrolls. Give `field`+`op` to aggregate a column, or `label` for fixed text.
 */
export interface FooterDef {
  /** 집계할 컬럼의 field(집계 셀일 때). / field of the column to aggregate (for an aggregate cell). */
  field?: string;
  /** 어떤 집계를 낼지(SUM/AVG/…). / Which aggregate to compute (SUM/AVG/…). */
  op?: SummaryOp;
  /** 집계 대신 그대로 보여줄 고정 문구(예: '합계'). / Fixed text shown instead of an aggregate (e.g. 'Total'). */
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

/**
 * 그리드 내용을 Excel·CSV·JSON 파일로 내보낼 때의 세부 설정입니다. 아무것도 안 주면 기본값으로 곧장
 * 내보내지고, 파일명·시트명·제외 컬럼·제목 행 등을 필요할 때만 얹습니다. 문자열 하나만 넘기면 파일명으로 해석됩니다.
 * / Settings for exporting the grid to Excel/CSV/JSON. With nothing set it exports with defaults;
 * add filename, sheet name, excluded columns, title rows, etc. only as needed. A lone string is
 * treated as the filename.
 */
export interface ExportOptions {
  /** 저장될 파일 이름. / The saved file's name. */
  filename?: string;
  /** 엑셀 시트 탭 이름. / Excel sheet tab name. */
  sheetName?: string;
  /** 머리글 행을 포함할지. 기본 true. / Whether to include the header row. Default true. */
  includeHeader?: boolean;
  /** 내보내기에서 뺄 컬럼들의 field. / field names of columns to leave out. */
  exceptFields?: string[];
  /** 데이터 위에 얹을 제목 행들(보고서 머리말 등). / Extra title rows placed above the data (report headings, etc.). */
  headers?: ExportHeaderRow[];
  /** 데이터 아래에 붙일 행들(비고·서명란 등). / Extra rows appended below the data (notes, sign-off …). */
  footers?: ExportHeaderRow[];
  /** 내보낸 파일에 그리드 테마 색을 입힐지 방식. 기본 'theme'(현재 테마 반영). / How to style the exported file — default 'theme' (carry the current theme). */
  styleMode?: ExportStyleMode;
  /** true 면 마스킹된 컬럼을 가려진 상태 그대로 내보냅니다. 기본 false = 원본 값 내보냄. / true exports masked columns still obscured. Default false = raw values. */
  maskOnExport?: boolean;
  /** 내보내기 시작 직전에 부를 훅(로딩 표시 등). / A hook called just before export starts (show a spinner …). */
  onBefore?: () => void | Promise<void>;
  /** 내보내기 완료 후 부를 훅. 만들어진 파일 blob 을 받습니다. / A hook called after export, receiving the produced file blob. */
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
  /**
   * 그리드의 세로 크기. 숫자면 px, 문자열이면 CSS 값('60vh' 등)입니다. 가상 스크롤이 제대로 돌려면
   * 확정된 높이가 필요하므로, 큰 데이터에서는 이 값(또는 조상 요소의 높이)을 꼭 주는 걸 권합니다.
   * / The grid's vertical size — a number is px, a string is a CSS value ('60vh' …). Virtual scroll
   * needs a definite height, so on large data set this (or an ancestor's height).
   */
  height?: number | string;
  /** 그리드의 가로 크기. 숫자면 px, 문자열이면 CSS 값. 생략 시 부모 폭을 채웁니다. / The grid's horizontal size — number = px, string = CSS. Unset fills the parent width. */
  width?: number | string;
  /**
   * 데이터 행 한 줄의 세로 픽셀 높이. 촘촘하게 많이 보이려면 줄이고, 터치·가독성 위주면 키웁니다.
   * 가상 스크롤이 이 값으로 "화면에 몇 행이 들어갈지"를 계산합니다. 기본 32.
   * / Height in px of one data row. Lower it to pack more rows in; raise it for touch/readability.
   * Virtual scroll uses this to compute how many rows fit on screen. Default 32.
   */
  rowHeight?: number;
  /** 머리글(헤더) 행의 높이(px). 여러 줄 헤더면 자동으로 늘어나므로 보통은 생략. / Header row height (px). Grows automatically for multi-line headers, so usually omitted. */
  headerHeight?: number;
  /** 푸터(합계) 행의 높이(px). / Footer (totals) row height (px). */
  footerHeight?: number;
  /** 셀 내용이 길어 줄바꿈될 때 행 높이를 내용에 맞춰 자동으로 늘립니다. 컬럼의 wrap 과 함께 씁니다. / Auto-grow a row's height to fit wrapped content. Use together with a column's wrap. */
  autoHeight?: boolean;
  /** 컬럼 폭의 합이 컨테이너를 꽉 채우도록 늘립니다. 오른쪽에 빈 공간을 남기고 싶지 않을 때. / Stretch column widths so their sum fills the container — when you don't want empty space on the right. */
  fillWidth?: boolean;
  /** width 도 flex 도 안 준 컬럼에 적용할 기본 폭(px). / Fallback width (px) for columns given neither width nor flex. */
  defaultColumnWidth?: number;
  /**
   * 뷰포트 안전장치(옵트인, 기본 undefined = OFF = 기존 동작 완전 불변).
   * / Viewport safety net (opt-in; default undefined = OFF = behavior fully unchanged).
   * 호스트가 그리드 컨테이너 조상 체인에 확정 높이(definite height)를 주지 않으면
   * 내부 스페이서(totalRows×rowHeight)가 컨테이너를 전체 콘텐츠 크기로 늘리고,
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
  /** 그리드 전체의 편집 스위치. 켜져 있고 컬럼의 editable 도 참일 때만 실제로 편집이 열립니다(둘 다 참 조건). / The grid-wide edit switch. Editing opens only when this AND a column's editable are true. */
  editable?: boolean;
  /** 편집을 어떻게 시작할지. 'click'=한 번 클릭, 'dblclick'=더블클릭, 'none'=마우스로는 진입 불가(API 로만). / How editing starts — 'click' single click, 'dblclick' double click, 'none' no mouse entry (API only). */
  editMode?: 'click' | 'dblclick' | 'none';
  /** (예약) 편집 실행취소 히스토리 — 아직 미구현. / (Reserved) undo history for edits — not implemented yet. */
  history?: boolean;
  /** (예약) 히스토리에 담을 최대 단계 수 — 아직 미구현. / (Reserved) max steps kept in history — not implemented yet. */
  historySize?: number;

  // 선택 / selection
  /** 사용자가 무엇을 선택할 수 있는지. 'cells' 로 하면 스프레드시트식 범위 선택이 됩니다. / What the user can select. 'cells' enables spreadsheet-style range selection. */
  selection?: SelectionMode;
  /** Ctrl+C / Ctrl+V 로 셀 값을 복사·붙여넣기하게 할지. / Whether Ctrl+C / Ctrl+V copy-paste of cell values is enabled. */
  clipboard?: boolean;
  /** 범위 선택 + 채우기 핸들(엑셀식 드래그 채우기) 세부 설정. / Range selection + fill handle (Excel-style drag-fill) detailed options. */
  rangeSelection?: RangeSelectionOptions; // C5.1 단일 중첩
  /** 셀 수식('=A1+B2' 같은 식) 기능 세부 설정. / Cell-formula ('=A1+B2'-style) detailed options. */
  formula?: FormulaOptions; // C5.1 단일 중첩
  /** 마스터/디테일(행을 펼쳐 상세 패널 표시) 세부 설정. / Master/detail (expand a row into a detail panel) detailed options. */
  masterDetail?: MasterDetailOptions<T>; // C5.1 단일 중첩
  /** 그리드 데이터를 그대로 쓰는 통합 차트 세부 설정. / Detailed options for the chart integrated on the grid's own data. */
  chart?: import('./chart/types.js').ChartGlobalOptions; // C5.1 단일 중첩. 타입은 chart/types 순환-안전 type-only import.
  /**
   * 조건부 서식 규칙 목록(값에 따라 셀을 데이터바·색조·아이콘으로 강조). 지정하지 않으면 아무 것도 바뀌지 않습니다.
   * / Conditional-format rules — highlight cells by value with data-bars, color scales, or icon sets.
   * Unset changes nothing.
   */
  conditionalFormat?: import('./cf/CFRule.js').CFRule[]; // DD-05: opt-in, 기본 undefined=byte-identical. 타입은 cf 순환-안전 type-only import.

  // 정렬/필터 / sort & filter
  /** 머리글 클릭 정렬을 그리드 전체에서 켤지. 컬럼별 sortable 로 예외를 둘 수 있습니다. / Turn header-click sorting on grid-wide. Per-column sortable can override. */
  sortable?: boolean;
  /** Shift+클릭으로 여러 컬럼을 겹쳐 정렬(2차·3차 기준)하게 할지. / Whether Shift+click stacks multiple sort keys (secondary, tertiary …). */
  multiSort?: boolean;
  /** 필터 기능을 그리드 전체에서 켤지. 컬럼별 filterable 로 예외를 둘 수 있습니다. / Turn filtering on grid-wide. Per-column filterable can override. */
  filterable?: boolean;
  /** 처음 로드될 때 미리 적용해 둘 정렬 상태. / The sort state to apply up front on first load. */
  defaultSort?: SortItem[];

  // 고정 / freezing
  /** 왼쪽부터 몇 개 컬럼을 가로 스크롤과 무관하게 고정할지. / How many leftmost columns stay pinned while scrolling horizontally. */
  frozenColumns?: number;
  /** (예약) 위쪽 고정 행 수 — 아직 미구현. / (Reserved) number of top-frozen rows — not implemented yet. */
  frozenRows?: number;

  // 엑스트라 컬럼 / extra columns
  /** 맨 왼쪽에 1,2,3… 행 번호 컬럼을 붙일지. / Whether to add a leftmost 1,2,3… row-number column. */
  rowNumber?: boolean;
  /** 각 행이 추가/수정/삭제 중 어떤 상태인지 표시하는 컬럼을 붙일지(편집 추적용). / Whether to add a column showing each row's added/edited/removed state (for change tracking). */
  stateColumn?: boolean;
  /** 행 선택용 체크박스 컬럼을 붙일지. / Whether to add a checkbox column for selecting rows. */
  checkColumn?: boolean;
  /** 행을 드래그해 순서를 바꾸게 할지. / Whether rows can be dragged to reorder. */
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
  /** 처음부터 이 필드들로 행을 묶어 보여 줄지. 여러 개면 다단계 그룹이 됩니다(예: 지역 → 부서). / Which fields to group rows by from the start. Several means nested groups (e.g. region → dept). */
  groupBy?: string[];
  /** 각 그룹에 소계/합계 요약 행을 붙이는 설정. / Options for attaching subtotal/summary rows to each group. */
  summary?: SummaryOptions;

  // 트리 / tree
  /**
   * 트리(계층) 데이터를 어떤 모양으로 받을지. 'auto'=각 행이 children 배열로 자식을 품은 중첩 구조,
   * 'flat'=모든 행이 한 줄이고 id/부모id 로 관계를 표현하는 평면 구조.
   * / How hierarchical data is shaped. 'auto' = each row nests its children in a children array;
   * 'flat' = every row is a flat entry linked by id / parent-id.
   */
  treeMode?: 'auto' | 'flat';
  /** flat 트리에서 각 행의 고유 id 가 담긴 필드 이름. / In flat tree mode, the field holding each row's unique id. */
  treeId?: string;
  /** flat 트리에서 부모 행의 id 가 담긴 필드 이름. / In flat tree mode, the field holding the parent row's id. */
  treeParentId?: string;
  /** 로드하자마자 모든 노드를 펼쳐 둘지. / Whether to expand every node right after loading. */
  expandOnLoad?: boolean;

  // 페이징 / pagination
  /** 아래쪽 페이지 이동 바를 띄울지. / Whether to show the pagination bar at the bottom. */
  pagination?: boolean;
  /** 한 페이지에 몇 행을 보일지. / How many rows show per page. */
  pageSize?: number;

  // 푸터 / footer
  /** 아래(또는 위) 고정 푸터에 넣을 셀 정의들(합계 줄 등). / Cell definitions for the pinned footer (e.g. a totals row). */
  footer?: FooterDef[];
  /** 푸터를 아래('bottom')에 둘지 위('top')에 둘지. / Put the footer at the bottom ('bottom') or top ('top'). */
  footerPosition?: 'top' | 'bottom';

  /** true 면 모든 셀에 마우스를 올렸을 때 그 값이 브라우저 기본 툴팁으로 뜹니다. 컬럼의 tooltip 설정이 있으면 그쪽이 우선. / true shows every cell's value as a native browser tooltip on hover; a column's own tooltip wins. */
  tooltips?: boolean;

  // 접근성 / accessibility
  /** 그리드 컨테이너 aria-label. / aria-label of the grid container. */
  ariaLabel?: string;

  // 테마 (COLOR 축) / theme (COLOR axis)
  /** 색 테마 id(data-og-theme). / Color theme id (data-og-theme). */
  theme?: string;
  /** 스킨 (FORM 축, R12b) — data-og-skin. 미지정 시 'default'(오늘과 byte-identical). / Skin (FORM axis, R12b) — data-og-skin. Default 'default' (byte-identical to stock look). */
  skin?: string;
  /** 행 간격(밀도) 이름. 촘촘·보통·여유처럼 행 높이와 여백을 통째로 바꿉니다. 지정하지 않으면 아무 것도 바뀌지 않습니다. / The row-spacing (density) name — compact/normal/roomy row heights and paddings. Unset changes nothing. */
  density?: string; // DENSITY 축 — data-og-density
  /** 배경 질감(패턴) 이름. 셀 배경에 무늬만 입힙니다. 지정하지 않으면 아무 것도 바뀌지 않습니다. / The background texture (pattern) name — paints a pattern on cell backgrounds. Unset changes nothing. */
  texture?: string; // TEXTURE 축 — data-og-texture
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

  /** 우클릭 컨텍스트 메뉴. true=기본 메뉴, false=끔, 배열=직접 정한 항목들. / Right-click context menu — true = default menu, false = off, array = your own items. */
  contextMenu?: boolean | ContextMenuItem[];

  /** 엑셀처럼 하단 탭으로 여러 시트를 전환하는 워크시트 정의들. / Worksheet definitions — Excel-like bottom tabs switching between multiple sheets. */
  worksheets?: WorksheetDef[];

  /** 수식·집계 계산에 쓸 기본 소수점 정밀도. 기본 10. / Default decimal precision for formulas/aggregation. Default 10. */
  calcPrecision?: number;

  /** 머리글을 드래그해 컬럼 순서를 바꾸게 할지. / Whether headers can be dragged to reorder columns. */
  columnReorder?: boolean;

  /**
   * override 로 감싼 함수에서 예외가 나면 어떻게 할지. 기본(true, strict)은 예외를 그대로 전파합니다.
   * false 로 하면 경고 후 원본 함수를 실행하는 완화(fallback) 동작을 허용합니다.
   * / What happens when an overridden layer throws. Default (true, strict) propagates the error;
   * false permits the softer fallback that warns then runs the original.
   */
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
  /** 선택된 셀 범위가 바뀔 때마다 호출(차트가 이걸 실시간으로 구독하기도 함). / Fired whenever the selected cell range changes (the chart can subscribe to it live). */
  onRangeChange?: (e: RangeChangeEvent) => void;
  /** 채우기 핸들로 값 채우기가 확정된 뒤, 무엇이 어떻게 채워졌는지 결과를 전달. / After a fill-handle fill commits, delivers what was filled and how. */
  onRangeFill?: (e: RangeFillEvent) => void;
  /** 선택 범위를 복사(Ctrl+C)했을 때 호출. / Fired when the selected range is copied (Ctrl+C). */
  onRangeCopy?: (e: RangeCopyEvent) => void;
  /** 행 상세 패널이 펼쳐질 때 호출. / Fired when a row's detail panel expands. */
  onRowExpand?: (e: RowExpandEvent<T>) => void;
  /** 행 상세 패널이 접힐 때 호출. / Fired when a row's detail panel collapses. */
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
 * 스킨이 조절할 수 있는 CSS 변수 이름들의 목록입니다. 여기 담긴 것은 모두 "형태"에 관한 값(모서리 둥글기,
 * 테두리 두께, 그림자, 여백, 질감 등)뿐이고 색은 하나도 없습니다. 색은 별도의 테마(COLOR) 축이 맡습니다.
 * 이렇게 이름 자체를 색과 겹치지 않게 나눠 두어, 스킨을 바꿔도 색은 영향받지 않도록 보장합니다.
 * / The set of CSS-variable names a skin may adjust. Every one of these is about *form* (corner
 * radius, border width, elevation, spacing, texture …) and none are colors — color is owned by the
 * separate theme (COLOR) axis. Keeping the names disjoint guarantees a skin change never touches color.
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

/**
 * 스킨 하나가 바꾸는 "형태 변수 → 값" 묶음입니다(바꾸고 싶은 것만 골라 담는 부분 지정). 형태 전용이라,
 * 값에 색(예: '#fff')을 넣으면 등록 시점에 거부됩니다 — 색은 테마 축의 몫이기 때문입니다.
 * / A skin's bundle of "form variable → value" overrides (partial — include only what you change).
 * It is form-only: putting a color literal (e.g. '#fff') in a value is rejected at registration,
 * because color belongs to the theme axis.
 */
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
/** 셀마다 CSS 클래스 이름을 붙여 주는 함수 슬롯. 값·행에 따라 셀에 추가할 className 을 돌려줍니다(null 이면 아무 것도 안 붙임). / A slot that assigns a CSS class per cell — return the className to add based on value/row (null adds nothing). */
export type CellClassResolverFn = (value: any, field: string, row: any) => string | null;
/** 셀의 스크린리더용 라벨(aria-label)을 바꿔 주는 함수 슬롯. 대체 라벨을 돌려줍니다(null 이면 기본값 유지). / A slot that overrides a cell's screen-reader label (aria-label) — return a replacement (null keeps the default). */
export type AriaLabelResolverFn = (value: any, field: string, row: any) => string | null;
/**
 * 채우기 핸들의 "이어 채우기" 규칙을 직접 정의하는 함수 슬롯입니다(예: 날짜·요일·사용자 정의 수열).
 * ⚠️ 지금은 등록 통로만 열려 있고 실제 채우기에 연결되는 배선은 향후 버전에서 제공됩니다.
 * / A slot to define your own fill-series rule for the fill handle (dates, weekdays, custom sequences).
 * ⚠️ Only the registration path exists today; the wiring that actually consumes it ships in a later version.
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
 * 스킨 이름을 받아 그 스킨의 형태 변수 묶음을 직접 만들어 돌려주는 함수 슬롯입니다. 내장 스킨 대신 나만의
 * 스킨 해석 규칙을 통째로 끼워 넣을 때 씁니다(null 을 돌려주면 내장 스킨 카탈로그를 그대로 사용).
 * / A slot that takes a skin name and returns that skin's form-variable bundle — plug in your own
 * skin-resolution rule in place of the built-ins (return null to fall back to the built-in catalog).
 */
export type SkinResolverFn = (skinId: string) => SkinTokenDelta | null;

/**
 * override 로 감싸는 것이 **공식적으로 보장되는** 확장점 이름들의 목록입니다. 이 이름들은 버전이 올라가도
 * 유지되며 IDE 자동완성에 뜹니다. 목록에 없는 임의 메서드 이름도 override("이름", fn) 문자열 방식으로 감쌀 수
 * 있지만(최선 노력), 그건 보장 밖입니다.
 * / The list of extension points whose override is **officially guaranteed** — these names survive
 * version bumps and show up in IDE autocomplete. Any other method name can still be wrapped via the
 * string form override("name", fn) on a best-effort basis, but without that guarantee.
 */
export interface OverridePoints<T = any> {
  /** 셀에 실제로 보이는 텍스트를 계산하는 지점. / Where a cell's visible display text is computed. */
  getDisplayValue(rowIndex: number, field: string): string;
  /** 셀의 원시 값을 읽는 지점. / Where a cell's raw value is read. */
  readCell(rowIndex: number, field: string): any;
}

/**
 * grid.override 의 두 얼굴입니다 — 그 자체를 함수처럼 불러 메서드를 감쌀 수도 있고(override(...)),
 * .strategy(...) 로 정렬·포맷 같은 알고리즘 슬롯을 갈아 끼울 수도 있습니다. 모든 호출은 체이닝을 위해
 * 그리드 인스턴스를 다시 돌려줍니다.
 * / The two faces of grid.override — call it like a function to wrap a method (override(...)), or use
 * .strategy(...) to swap an algorithm slot like sorting/formatting. Every call returns the grid
 * instance for chaining.
 */
export interface OverrideApi<T = any> {
  /** 보장된 확장점 이름을 감싸는 타입드 오버로드(IDE 자동완성). / Typed overload for the guaranteed extension-point names (IDE autocomplete). */
  <K extends keyof OverridePoints<T>>(name: K, fn: OverrideLayerFn, opts?: OverrideCallOptions): OpenGridInstance<T>;
  /** 임의 메서드를 본문 수정 없이 런타임에 감쌉니다(문자열 이름 방식). 체이닝을 위해 그리드를 반환. / Wrap any method at runtime without touching its body (string-name form). Returns the grid for chaining. */
  (name: string, fn: OverrideLayerFn, opts?: OverrideCallOptions): OpenGridInstance<T>;
  /** 알고리즘 슬롯 하나를 내 함수로 등록합니다. 체이닝을 위해 그리드를 반환. / Register one algorithm slot with your function. Returns the grid for chaining. */
  strategy<K extends StrategySlot>(slot: K, fn: StrategyMap[K]): OpenGridInstance<T>;
  strategy(slot: string, fn: Function): OpenGridInstance<T>;
}

/**
 * `new OpenGrid(...)` 로 만든 그리드가 밖에 내어 주는 조작 창구(메서드 모음)입니다. 데이터 넣기·읽기,
 * 행·컬럼 편집, 정렬·필터, 선택, 내보내기, 테마 전환 등 그리드에게 시킬 수 있는 모든 일이 여기 모여 있습니다.
 * 각 메서드의 자세한 설명은 이 계약을 구현하는 OpenGrid 클래스 쪽에 있습니다.
 * / The set of methods a grid built with `new OpenGrid(...)` exposes — everything you can ask the
 * grid to do: load/read data, edit rows & columns, sort/filter, select, export, switch themes, and
 * more. Per-method detail lives on the OpenGrid class that implements this contract.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface OpenGridInstance<T = any> {
  // ── grid.override() 확장 ──────────────────────────────
  /** 공개 메서드를 런타임에 감싸 동작을 바꾸거나(.override), 정렬·포맷 같은 알고리즘 슬롯을 갈아 끼웁니다(.strategy). / Wrap a public method at runtime to change its behavior (.override), or swap an algorithm slot like sorting/formatting (.strategy). */
  override: OverrideApi<T>;
  /** 이름을 지정한 메서드 하나를 원래 동작으로 되돌립니다. / Restore one named method to its original behavior. */
  restore(name: string): OpenGridInstance<T>;
  /** 걸어 둔 모든 override 와 strategy 를 한 번에 되돌립니다(그리드 파기 시 자동 호출). / Undo all overrides and strategies at once (called automatically on destroy). */
  restoreAll(): OpenGridInstance<T>;
  /** 그 메서드가 지금 override 로 감싸져 있는지 확인합니다. / Check whether that method is currently overridden. */
  hasOverride(name: string): boolean;
  /** override 로 감싼 메서드 이름들의 목록을 돌려줍니다. / Return the list of overridden method names. */
  getOverrideNames(): string[];
  /** 등록된 알고리즘 슬롯 함수를 가져옵니다(없으면 넘긴 fallback 을 그대로 반환). / Fetch a registered algorithm-slot function (returns the given fallback if none). */
  getStrategy<F extends Function>(slot: string, fallback: F): F;

  // 데이터
  setData(data: T[]): void;
  getData(): T[];
  getSourceRows(): T[];
  pushData(data: T[]): void;
  prefixData(data: T[]): void;
  clearData(): void;
  /**
   * 조건부 서식 규칙을 지정합니다 — 값에 따라 셀에 데이터바·색조(히트맵)·아이콘셋을 입혀 강조합니다.
   * 규칙이 걸린 컬럼의 통계(최소·최대 등)를 미리 계산해 두고 다시 그립니다. 빈 배열을 주면 조건부 서식을 모두 해제합니다.
   * / Set conditional-format rules — highlight cells by value with data-bars, color scales (heatmaps),
   * or icon sets. It precomputes the rule-bearing columns' stats (min/max …) and re-renders. Pass an
   * empty array to clear all conditional formatting.
   */
  setConditionalFormat(rules: import('./cf/CFRule.js').CFRule[]): Promise<void>;

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

  // ── 배치 쓰기 인프라 / batch-write infrastructure ────────────────────────────
  /** 화면에 보이는 행 순서와 실제 데이터를 이어 주는 내부 모델을 돌려줍니다(고급 배선용). / Return the internal model mapping on-screen row order to actual data (for advanced wiring). */
  getFlatRowModel(): import('./FlatRowModel.js').FlatRowModel; // C0.3/C2.1
  /** 여러 셀을 한꺼번에 쓸 때, 이 호출 이후의 writeCell 들이 즉시 다시 그리지 않도록 렌더를 잠시 미룹니다. / Start a batch — subsequent writeCell calls defer their render/change events instead of firing each time. */
  beginBatch(): void;
  /** 배치를 끝내고, 그 사이 변경이 있었으면 단 한 번만 다시 그리고 변경 이벤트도 한 번만 냅니다. / End the batch — if anything changed, render once and emit one coalesced change event. */
  endBatch(): void;
  /**
   * 여러 셀 쓰기를 한 번에 처리하는 간편 래퍼(beginBatch → 반복 쓰기 → endBatch). rowIndex 는 화면
   * 표시 순서이며, 그룹·트리·상세 같은 실제 데이터가 아닌 가상 행은 안전하게 건너뜁니다. 반환값은 건너뛴 셀 수입니다.
   * / A convenience wrapper that writes many cells at once (beginBatch → loop → endBatch). rowIndex is
   * screen-order; non-data pseudo-rows (group/tree/detail) are safely skipped. Returns how many were skipped.
   */
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number; // C0.3 쓰기 안전

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

  // ── 범위 선택 + 채우기 핸들 / range selection + fill handle ────────────
  /** 현재 선택된 셀 범위들(없으면 빈 배열). 지금은 한 번에 하나까지 담깁니다. / Currently selected cell ranges (empty if none). At most one for now. */
  getRangeSelection(): CellRange[]; // C4
  /** 지금 활성인 범위 하나(없으면 null). 차트가 이 값을 읽어 씁니다. / The single active range (null if none). The chart reads this. */
  getActiveRange(): CellRange | null; // C4
  /** 셀 범위를 프로그램에서 직접 선택합니다. / Select a cell range programmatically. */
  setRangeSelection(range: CellRange | CellRange[]): void;
  /** 현재 범위 선택을 모두 해제합니다. / Clear the current range selection. */
  clearRangeSelection(): void;
  /** 현재 활성 범위 안 셀 값들을 행×열 2차원 배열로 돌려줍니다(차트가 소비). / Return the active range's cell values as a 2-D (rows×cols) array (consumed by the chart). */
  getRangeValues(): any[][]; // FR-6
  /** 현재 활성 범위의 숫자 셀 통계(합·평균·최소·최대 등, 고정밀 계산). 숫자가 없으면 null. / High-precision stats (sum/avg/min/max …) over the active range's numeric cells; null if none. */
  getRangeStats(): _RangeStats | null; // FR-6
  /** 원본 범위의 값을 대상 범위로 채웁니다. 'copy'=그대로 복사, 'series'=규칙 감지해 이어 채우기. / Fill the target range from the source — 'copy' duplicates, 'series' detects a pattern and extends. */
  fillRange(source: CellRange, target: CellRange, mode?: 'copy' | 'series'): void; // C2, 배치 경유

  // ── 통합 차트 / integrated chart ────────────
  /** 그리드 데이터로 차트를 만들어 인스턴스를 돌려줍니다. / Create a chart from grid data and return its instance. */
  createChart(config: import('./chart/types.js').ChartConfig): import('./chart/types.js').ChartInstance;
  /** 이 그리드에 붙어 있는 차트 인스턴스들. / The chart instances attached to this grid. */
  getCharts(): import('./chart/types.js').ChartInstance[];
  /** 이 그리드의 차트를 모두 정리(해제)합니다. / Dispose all charts on this grid. */
  destroyCharts(): void;

  // ── 셀 수식 / cell formulas ────────────────────
  /** 셀에 수식을 넣습니다(예: "=A1+B2"). rowIndex 는 화면 순서로 주면 내부에서 안정적 참조로 바꿉니다. / Set a cell's formula (e.g. "=A1+B2"). Pass rowIndex in screen order; it's normalized to a stable ref inside. */
  setCellFormula(rowIndex: number, field: string, formula: string): void; // C0: flat→stable rowId
  /** 그 셀의 수식 원문(없으면 null). / The cell's formula text (null if none). */
  getCellFormula(rowIndex: number, field: string): string | null;
  /** 그 셀에 수식이 들어 있는지. / Whether that cell holds a formula. */
  hasCellFormula(rowIndex: number, field: string): boolean;
  /** 셀의 수식만 지웁니다(마지막 계산 값은 남습니다). / Remove the cell's formula (keeps the last computed value). */
  clearCellFormula(rowIndex: number, field: string): void;
  /** 그 셀의 수식 오류 코드(오류가 없으면 null). / The cell's formula error code (null if none). */
  getCellError(rowIndex: number, field: string): FormulaErrorCode | null;
  /** 디버깅용 — 이 셀을 참조하는(이 셀이 바뀌면 다시 계산되는) 셀들. / Debug — cells that reference this one (recomputed when it changes). */
  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }>;
  /** 디버깅용 — 이 셀의 수식이 참조하는(이 셀보다 먼저 계산돼야 하는) 셀들. / Debug — cells this one's formula references (computed before it). */
  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }>;
  /** 모든 수식을 처음부터 다시 계산합니다(데이터 교체·컬럼 변경 후 등). / Recompute every formula from scratch (after replacing data, changing columns, …). */
  recalculate(): void;
  /** 이 셀과, 이 셀에 딸린(종속) 셀들만 다시 계산합니다. / Recompute only this cell and the cells depending on it. */
  recalculateCell(rowIndex: number, field: string): void;
  /** 채우기 기능 전용 — 어떤 셀의 수식을 dRow/dCol 만큼 이동한 자리에 맞게 참조를 옮긴 새 수식 원문을 돌려줍니다. / Fill-only — return a copy of a cell's formula with its relative refs shifted by dRow/dCol. */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string; // C3

  // ── 마스터/디테일 / master-detail ──────────────────
  /** 행을 펼쳐 상세 패널을 엽니다. rowRef 는 화면 순서 인덱스 또는 안정적 id. 허용 겹수를 넘으면 거부됩니다. / Expand a row's detail panel. rowRef is a screen-order index or a stable id; rejected past the nesting limit. */
  expandRow(rowRef: number | { id: string }): void; // C0.2, FR-10
  /** 열려 있는 상세 패널을 접습니다. / Collapse an open detail panel. */
  collapseRow(rowRef: number | { id: string }): void;
  /** 상세 패널을 펼쳐져 있으면 접고, 접혀 있으면 폅니다. / Toggle a detail panel open/closed. */
  toggleRow(rowRef: number | { id: string }): void;
  /** 그 행의 상세 패널이 지금 펼쳐져 있는지. / Whether that row's detail panel is currently expanded. */
  isRowExpanded(rowRef: number | { id: string }): boolean;
  /** 열려 있는 모든 상세 패널을 한 번에 접습니다. / Collapse every open detail panel at once. */
  collapseAllDetails(): void;
  /** 그 행의 상세 패널 내용물(직접 그린 결과 또는 자동 생성된 자식 그리드). 한 번도 펼치지 않았으면 undefined. / The row's detail content (your rendered result or the auto-created child grid); undefined if never expanded. */
  getDetailInstance<D = any>(rowRef: number | { id: string }): D | undefined;
  /** 컬럼·컨테이너 크기를 바꾼 뒤 열린 패널의 폭을 다시 맞춥니다(보통은 재렌더가 알아서 처리). / Re-sync open panel widths after a column/container resize (usually the re-render handles it). */
  resyncPanelWidths(): void; // FR-11

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
  /** 지정한 행들을 다른 그리드로 옮깁니다(드래그·셔틀과 같은 경로). 옮기는 전·후·완료 3단계 이벤트가 나고 필드 매핑 규칙이 적용됩니다. / Move the given rows into another grid (same path as drag/shuttle). Fires the three-phase events and applies the field-mapping rule. */
  moveRowsTo(target: OpenGridInstance<T>, sourceIndexes: number[], targetIndex?: number): Promise<boolean>;
  /** 체크박스로 고른 행들을 다른 그리드로 옮깁니다(화살표 셔틀 버튼용). / Move the checkbox-selected rows into another grid (for the arrow-shuttle buttons). */
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
  /** 스킨(형태 축)을 바꿉니다 — 모서리·테두리·여백 같은 "생김새"만 갈아 끼우고, 색 테마는 그대로 둡니다. / Switch the skin (form axis) — swaps the "shape" (corners, borders, spacing …) only, leaving the color theme untouched. */
  setSkin(skin: string): void;
  /** 지금 적용된 스킨 id('default' = 기본 생김새). / The currently applied skin id ('default' = stock look). */
  getSkin(): string;
  /** 형태 축의 CSS 변수 하나만 즉석에서 바꿉니다(setThemeVar 의 형태 버전). 색 값을 넣으면 거부됩니다. / Override a single form-axis CSS variable at runtime (the form-axis sibling of setThemeVar). Color values are rejected. */
  setSkinVar(varName: string, value: string): void;
  /** 밀도(행 간격)를 바꿉니다 — 촘촘/보통/여유처럼 행 높이와 여백을 통째로 조절합니다. 색·스킨과 따로 노는 별개 축이며, 없는 이름을 줘도 오류를 내지 않습니다. / Switch the density (row spacing) — compact/normal/roomy row heights and paddings. An independent axis from color/skin; never throws on an unknown name. */
  setDensity(name: string): void;
  /** 질감(배경 패턴)을 바꿉니다 — 배경 페인트만 입히고 크기 재계산은 하지 않습니다. 없는 이름을 줘도 오류를 내지 않습니다. / Switch the texture (background pattern) — paints the background only, no relayout. Never throws on an unknown name. */
  setTexture(name: string): void;

  // i18n: 로케일 전환·조회·메시지 오버라이드·해석 / i18n: locale switch/read/override/resolve
  /** UI 문구의 언어(로케일)를 바꾸고 화면을 다시 그립니다. 등록되지 않은 로케일을 줘도 오류를 내지 않습니다. / Switch the UI language (locale) and re-render. Never throws on an unregistered locale. */
  setLocale(locale: string): void;
  /** 이 그리드에 지금 적용된 로케일 id. / The locale id currently applied to this grid. */
  getLocale(): string;
  /** 이 그리드에서만 특정 문구 하나를 다른 말로 바꿉니다. / Override a single UI message for this grid only. */
  setMessage(key: LocaleMessageKey | string, value: MessageValue): OpenGridInstance<T>;
  /** 키에 해당하는 문구를 찾아 돌려줍니다(개별 오버라이드 → 활성 로케일 → 한국어 → 키 순). 오류를 내지 않습니다. / Resolve a message by key (per-message override → active locale → Korean → the key itself). Never throws. */
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

/**
 * 트리거로 등록하는 핸들러 함수의 형태입니다. 작업의 맥락(TriggerContext)을 인자로 받아,
 * 작업 전이라면 검증·취소하고 작업 후라면 결과를 확인하는 등의 일을 합니다.
 * / The shape of a handler you register as a trigger. It receives the operation's context
 * (TriggerContext) — validate/cancel before, or inspect the result after.
 */
export type TriggerHandler<TResult = any> = (ctx: TriggerContext<TResult>) => void;

/**
 * 트리거를 걸 수 있는 이벤트 이름들. 형식은 '시점:작업' 입니다 — 'before:작업'은 그 작업이 실행되기
 * 직전(여기서 취소 가능), 'after:작업'은 끝난 직후, 'complete'는 어떤 작업이든 끝난 뒤 공통으로 호출됩니다.
 * / The event names you can attach triggers to, in 'phase:operation' form — 'before:*' fires just
 * before the operation (cancelable there), 'after:*' just after, and 'complete' after any operation.
 */
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
