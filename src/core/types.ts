// ============================================================
// OPEN_GRID 핵심 타입 정의 / OPEN_GRID core type definitions
// ============================================================

/**
 * 컬럼이 담는 값의 종류. 이 값 하나로 그리드가 "어떻게 정렬하고, 기본 렌더러로 무엇을 쓰고,
 * 편집기를 무엇으로 열지"를 결정합니다. 지정하지 않으면 문자열처럼 다룹니다.
 *
 *  - `'string'`  : 일반 텍스트.
 *  - `'number'`  : 숫자(오른쪽 정렬·숫자 비교·천단위 포맷).
 *  - `'date'`    : 날짜(달력 편집기·날짜 비교).
 *  - `'boolean'` : 참/거짓(체크박스 표시).
 *  - `'select'`  : 목록에서 하나 선택(드롭다운 편집기).
 *  - `'radio'`   : 같은 그룹 안에서 하나 선택.
 *  - `'img'`     : 셀 값을 이미지 주소로 보고 그림 표시.
 *  - `'html'`    : HTML 문자열을 그대로 렌더(기본 sanitize).
 *  - `'barcode'` : 값을 바코드 그래픽으로 표시.
 *
 * What kind of value a column holds. This single choice drives how the grid sorts, which
 * default renderer it uses, and which editor it opens. Unset behaves like a string.
 *
 *  - `'string'`  : Plain text.
 *  - `'number'`  : Number (right-aligned, numeric compare, thousand separators).
 *  - `'date'`    : Date (calendar editor, date compare).
 *  - `'boolean'` : True/false (rendered as a checkbox).
 *  - `'select'`  : Single choice from a list (dropdown editor).
 *  - `'radio'`   : Single choice within a radio group.
 *  - `'img'`     : Treat the value as an image URL and show it.
 *  - `'html'`    : Render an HTML string (sanitized by default).
 *  - `'barcode'` : Show the value as a barcode graphic.
 *
 * 列が保持する値の種類。この一つの値で、グリッドが「どのようにソートし、既定のレンダラーに何を使い、
 * どのエディターを開くか」を決めます。指定しない場合は文字列のように扱います。
 *
 *  - `'string'`  : 通常のテキスト。
 *  - `'number'`  : 数値（右揃え・数値比較・桁区切り）。
 *  - `'date'`    : 日付（カレンダーエディター・日付比較）。
 *  - `'boolean'` : 真偽（チェックボックスで表示）。
 *  - `'select'`  : 一覧から一つ選択（ドロップダウンエディター）。
 *  - `'radio'`   : 同じグループ内で一つ選択。
 *  - `'img'`     : セルの値を画像アドレスとみなして画像を表示。
 *  - `'html'`    : HTML文字列をそのままレンダー（既定でsanitize）。
 *  - `'barcode'` : 値をバーコード画像として表示。
 *
 * 列所保存的值的种类。这一个设置决定表格如何排序、使用哪个默认渲染器、打开哪个编辑器。
 * 不指定时按字符串处理。
 *
 *  - `'string'`  : 普通文本。
 *  - `'number'`  : 数值（右对齐、按数值比较、千位分隔）。
 *  - `'date'`    : 日期（日历编辑器、按日期比较）。
 *  - `'boolean'` : 真/假（显示为复选框）。
 *  - `'select'`  : 从列表中单选（下拉编辑器）。
 *  - `'radio'`   : 在同一组内单选。
 *  - `'img'`     : 把单元格的值视为图片地址并显示图片。
 *  - `'html'`    : 直接渲染 HTML 字符串（默认 sanitize）。
 *  - `'barcode'` : 把值显示为条形码图形。
 */
export type DataType = 'string' | 'number' | 'date' | 'boolean' | 'select' | 'radio' | 'img' | 'html' | 'barcode';

// ─── F5: 마스킹 타입 (MaskingEngine.ts에 구현) / F5: masking types (implemented in MaskingEngine.ts) ─────────────
export type { MaskType, MaskDef } from './MaskingEngine.js';
// i18n: 인스턴스 메시지 오버라이드 타입(GridOptions.messages) / i18n: instance message override type (GridOptions.messages)
import type { PartialLocaleMessages, LocaleMessageKey, MessageValue } from './i18n/types.js';
/**
 * 사용자가 클릭·드래그로 무엇을 선택할 수 있는지 정하는 모드.
 *
 *  - `'single'`   : 한 번에 한 행만.
 *  - `'row'`      : 행 단위 선택(다중 가능은 UI에 따름).
 *  - `'multiple'` : 여러 행을 함께(Ctrl/Shift).
 *  - `'cells'`    : 스프레드시트처럼 셀 사각형 범위를 선택(채우기 핸들 포함).
 *
 * What the user can select by clicking or dragging.
 *
 *  - `'single'`   : One row at a time.
 *  - `'row'`      : Row-level selection (whether multiple is allowed depends on the UI).
 *  - `'multiple'` : Multiple rows together (Ctrl/Shift).
 *  - `'cells'`    : Spreadsheet-style rectangular cell range (with fill handle).
 *
 * ユーザーがクリック・ドラッグで何を選択できるかを決めるモード。
 *
 *  - `'single'`   : 一度に一行のみ。
 *  - `'row'`      : 行単位の選択（複数可否はUIに従う）。
 *  - `'multiple'` : 複数行をまとめて（Ctrl/Shift）。
 *  - `'cells'`    : スプレッドシートのようにセルの矩形範囲を選択（フィルハンドルを含む）。
 *
 * 决定用户通过点击或拖动能选择什么。
 *
 *  - `'single'`   : 一次只选一行。
 *  - `'row'`      : 按行选择（能否多选取决于 UI）。
 *  - `'multiple'` : 同时选择多行（Ctrl/Shift）。
 *  - `'cells'`    : 像电子表格那样选择单元格的矩形区域（含填充手柄）。
 */
export type SelectionMode = 'single' | 'row' | 'multiple' | 'cells'; // 'cells' = F1 범위 선택
/**
 * 정렬 방향. `'asc'` 오름차순(작은 값 먼저), `'desc'` 내림차순(큰 값 먼저).
 *
 * Sort direction: 'asc' ascending (smallest first), 'desc' descending (largest first).
 *
 * ソート方向。`'asc'` は昇順（小さい値が先）、`'desc'` は降順（大きい値が先）。
 *
 * 排序方向。`'asc'` 升序（小的值在前），`'desc'` 降序（大的值在前）。
 */
export type SortDir = 'asc' | 'desc';
/**
 * 새 항목을 어디에 끼워 넣을지. 키워드로 상대 위치를 주거나, 숫자로 정확한 인덱스를 줍니다.
 *
 *  - `'first'`  : 맨 앞.
 *  - `'last'`   : 맨 뒤.
 *  - `'before'` : 기준 위치 바로 앞.
 *  - `'after'`  : 기준 위치 바로 뒤.
 *  - `number`   : 해당 인덱스 자리.
 *
 * Where to insert a new item — a keyword for a relative spot, or a number for an exact index.
 *
 *  - `'first'`  : At the very front.
 *  - `'last'`   : At the very end.
 *  - `'before'` : Just before the reference position.
 *  - `'after'`  : Just after the reference position.
 *  - `number`   : At that exact index.
 *
 * 新しい項目をどこに挿入するか。キーワードで相対位置を与えるか、数値で正確なインデックスを与えます。
 *
 *  - `'first'`  : 先頭。
 *  - `'last'`   : 末尾。
 *  - `'before'` : 基準位置のすぐ前。
 *  - `'after'`  : 基準位置のすぐ後ろ。
 *  - `number`   : そのインデックスの位置。
 *
 * 新项目插入到哪里 —— 用关键字给出相对位置，或用数字给出精确的索引。
 *
 *  - `'first'`  : 最前面。
 *  - `'last'`   : 最后面。
 *  - `'before'` : 基准位置的正前方。
 *  - `'after'`  : 基准位置的正后方。
 *  - `number`   : 该索引所在的位置。
 */
export type Position = 'first' | 'last' | 'before' | 'after' | number;
/**
 * 내장 셀 렌더러 타입 이름.
 *
 * Built-in cell renderer type name.
 *
 * 組み込みセルレンダラーのタイプ名。
 *
 * 内置单元格渲染器的类型名。
 */
export type RendererType = 'text' | 'number' | 'date' | 'checkbox' | 'button' | 'link' | 'image' | 'icon' | 'switch' | 'sparkline' | 'template' | 'custom' | 'badge' | 'progress' | 'rating' | 'radio' | 'img' | 'html' | 'barcode';
/**
 * 내장 셀 에디터 타입 이름.
 *
 * Built-in cell editor type name.
 *
 * 組み込みセルエディターのタイプ名。
 *
 * 内置单元格编辑器的类型名。
 */
export type EditorType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'custom';

// ─── 이벤트 타입 / event types ───────────────────────────────────────────
/**
 * 사용자가 셀을 마우스로 조작할 때(클릭·더블클릭·마우스 올림 등) 그 핸들러로 전달되는 정보 묶음입니다.
 * "어느 행·어느 컬럼의 어떤 값이, 어떤 DOM 요소에서, 원래 어떤 브라우저 이벤트로" 일어났는지를
 * 한 번에 담아 주므로 핸들러 안에서 좌표를 다시 계산할 필요가 없습니다.
 *
 * The payload handed to your handler when the user manipulates a cell with the mouse
 * (click / dbl-click / mouse-over …). It bundles which row & column, what value, which DOM
 * element, and the original browser event — so your handler never has to recompute coordinates.
 *
 * ユーザーがセルをマウスで操作したとき（クリック・ダブルクリック・マウスオーバーなど）に、そのハンドラーへ
 * 渡される情報のまとまりです。「どの行・どの列のどの値が、どのDOM要素で、もともとどのブラウザイベントで」
 * 起きたのかを一度に収めているので、ハンドラーの中で座標を計算し直す必要はありません。
 *
 * 관련 옵션: onCellClick, onCellDblClick, onCellMouseOver …
 *
 * Related options: onCellClick, onCellDblClick, onCellMouseOver …
 *
 * 関連オプション: onCellClick, onCellDblClick, onCellMouseOver …
 *
 * 用户用鼠标操作单元格时（点击、双击、鼠标移入等），传给处理函数的一组信息。它一次性打包了
 * 哪一行哪一列、什么值、哪个 DOM 元素，以及原始的浏览器事件 —— 处理函数内无需重新计算坐标。
 *
 * 相关选项: onCellClick, onCellDblClick, onCellMouseOver …
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据的类型
 */
export interface CellEvent<T = any> {
  /**
   * 이벤트 이름('cellClick' 등).
   *
   * The event name (e.g. 'cellClick').
   *
   * イベント名（'cellClick' など）。
   *
   * 事件名（如 'cellClick'）。
   */
  type: string;
  /**
   * 대상 행의 화면 표시 순서 인덱스.
   *
   * Screen-order index of the target row.
   *
   * 対象行の画面表示順のインデックス。
   *
   * 目标行按屏幕显示顺序的索引。
   */
  rowIndex: number;
  /**
   * 대상 컬럼의 인덱스.
   *
   * Index of the target column.
   *
   * 対象列のインデックス。
   *
   * 目标列的索引。
   */
  columnIndex: number;
  /**
   * 대상 컬럼의 field 이름.
   *
   * field name of the target column.
   *
   * 対象列の field 名。
   *
   * 目标列的 field 名。
   */
  field: string;
  /**
   * 그 셀의 원시 값.
   *
   * Raw value of that cell.
   *
   * そのセルの生の値。
   *
   * 该单元格的原始值。
   */
  value: any;
  /**
   * 그 행의 데이터 객체 전체.
   *
   * The full row-data object.
   *
   * その行のデータオブジェクト全体。
   *
   * 该行完整的数据对象。
   */
  row: T;
  /**
   * 그 컬럼의 정의.
   *
   * The column's definition.
   *
   * その列の定義。
   *
   * 该列的定义。
   */
  column: ColumnDef<T>;
  /**
   * 실제 클릭된 셀 DOM 요소.
   *
   * The actual clicked cell DOM element.
   *
   * 実際にクリックされたセルのDOM要素。
   *
   * 实际被点击的单元格 DOM 元素。
   */
  target: HTMLElement;
  /**
   * 브라우저 원본 마우스 이벤트(좌표·수식어 키 등).
   *
   * The underlying browser mouse event (coords, modifier keys …).
   *
   * ブラウザ本来のマウスイベント（座標・修飾キーなど）。
   *
   * 浏览器原始的鼠标事件（坐标、修饰键等）。
   */
  originalEvent: MouseEvent;
}

/**
 * 셀 값 편집의 흐름(편집 시작 → 커밋 직전 → 편집 끝) 각 지점에서 핸들러로 오는 정보입니다.
 * 편집 전 값(oldValue)과 편집 후 값(newValue)을 함께 주므로, 값이 실제로 바뀌었는지 비교하거나
 * 커밋 직전 훅에서 검증 후 되돌릴 수 있습니다.
 *
 * Delivered at each point in a cell edit (start → just-before-commit → end). It carries both the
 * value before (oldValue) and after (newValue) so you can compare, or validate and veto the commit.
 *
 * セル値の編集の流れ（編集開始 → コミット直前 → 編集終了）の各地点でハンドラーに届く情報です。
 * 編集前の値（oldValue）と編集後の値（newValue）を一緒に渡すので、値が実際に変わったかを比較したり、
 * コミット直前のフックで検証してから元に戻したりできます。
 *
 * 관련 옵션: onEditStart, onEditBefore, onEditEnd
 *
 * Related options: onEditStart, onEditBefore, onEditEnd
 *
 * 関連オプション: onEditStart, onEditBefore, onEditEnd
 *
 * 在单元格编辑的各个节点（编辑开始 → 提交之前 → 编辑结束）送到处理函数的信息。它同时带上编辑前的值
 * （oldValue）和编辑后的值（newValue），因此可以比较值是否真的变了，也可以在提交前的钩子里校验并撤回。
 *
 * 相关选项: onEditStart, onEditBefore, onEditEnd
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据的类型
 */
export interface EditEvent<T = any> {
  /**
   * 이벤트 이름('editStart'/'editEnd'/'editBefore').
   *
   * The event name.
   *
   * イベント名（'editStart'/'editEnd'/'editBefore'）。
   *
   * 事件名（'editStart'/'editEnd'/'editBefore'）。
   */
  type: string;
  /**
   * 편집 중인 행의 화면 표시 순서 인덱스.
   *
   * Screen-order index of the row being edited.
   *
   * 編集中の行の画面表示順のインデックス。
   *
   * 正在编辑的行按屏幕显示顺序的索引。
   */
  rowIndex: number;
  /**
   * 편집 중인 컬럼의 인덱스.
   *
   * Index of the column being edited.
   *
   * 編集中の列のインデックス。
   *
   * 正在编辑的列的索引。
   */
  columnIndex: number;
  /**
   * 편집 중인 컬럼의 field 이름.
   *
   * field name of the column being edited.
   *
   * 編集中の列の field 名。
   *
   * 正在编辑的列的 field 名。
   */
  field: string;
  /**
   * 편집 전 값.
   *
   * Value before the edit.
   *
   * 編集前の値。
   *
   * 编辑前的值。
   */
  oldValue: any;
  /**
   * 편집 후 들어온 값.
   *
   * Value after the edit.
   *
   * 編集後に入ってきた値。
   *
   * 编辑后传入的值。
   */
  newValue: any;
  /**
   * 편집 중인 행의 데이터 객체.
   *
   * The row-data object being edited.
   *
   * 編集中の行のデータオブジェクト。
   *
   * 正在编辑的行的数据对象。
   */
  row: T;
  /**
   * 편집 중인 컬럼의 정의.
   *
   * The column's definition.
   *
   * 編集中の列の定義。
   *
   * 正在编辑的列的定义。
   */
  column: ColumnDef<T>;
  /**
   * 편집 커밋 직전(onEditBefore)에 true 로 바꾸면 그 편집을 무효화합니다.
   *
   * In the pre-commit hook (onEditBefore), set true to reject the edit.
   *
   * 編集コミット直前（onEditBefore）で true にすると、その編集を無効にします。
   *
   * 在提交编辑之前（onEditBefore）改为 true，即可作废这次编辑。
   */
  cancel?: boolean;
}

/**
 * 셀이 아니라 "행 전체"를 마우스로 조작했을 때(행 클릭·더블클릭·마우스 올림 등) 오는 정보입니다.
 * 컬럼 정보 없이 어느 행인지와 그 행 데이터만 필요할 때 CellEvent 보다 가볍게 씁니다.
 *
 * Delivered when the user manipulates a whole row (row click / dbl-click / mouse-over …). Lighter
 * than CellEvent for when you only need which row and its data, not the column.
 *
 * セルではなく「行全体」をマウスで操作したとき（行のクリック・ダブルクリック・マウスオーバーなど）に届く
 * 情報です。列の情報なしに、どの行かとその行データだけが必要なときに、CellEvent より軽く使えます。
 *
 * 관련 옵션: onRowClick, onRowDblClick, onRowMouseOver …
 *
 * Related options: onRowClick, onRowDblClick, onRowMouseOver …
 *
 * 関連オプション: onRowClick, onRowDblClick, onRowMouseOver …
 *
 * 用户用鼠标操作的不是单元格而是「整行」时（行点击、双击、鼠标移入等）送达的信息。当只需要知道是哪一行
 * 及其行数据、不需要列信息时，它比 CellEvent 更轻。
 *
 * 相关选项: onRowClick, onRowDblClick, onRowMouseOver …
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据的类型
 */
export interface RowEvent<T = any> {
  /**
   * 이벤트 이름('rowClick' 등).
   *
   * The event name (e.g. 'rowClick').
   *
   * イベント名（'rowClick' など）。
   *
   * 事件名（如 'rowClick'）。
   */
  type: string;
  /**
   * 대상 행의 화면 표시 순서 인덱스.
   *
   * Screen-order index of the target row.
   *
   * 対象行の画面表示順のインデックス。
   *
   * 目标行按屏幕显示顺序的索引。
   */
  rowIndex: number;
  /**
   * 그 행의 데이터 객체 전체.
   *
   * The full row-data object.
   *
   * その行のデータオブジェクト全体。
   *
   * 该行完整的数据对象。
   */
  row: T;
  /**
   * 이벤트가 일어난 행 DOM 요소.
   *
   * The row DOM element where the event occurred.
   *
   * イベントが起きた行のDOM要素。
   *
   * 事件发生所在的行 DOM 元素。
   */
  target: HTMLElement;
  /**
   * 브라우저 원본 마우스 이벤트.
   *
   * The underlying browser mouse event.
   *
   * ブラウザ本来のマウスイベント。
   *
   * 浏览器原始的鼠标事件。
   */
  originalEvent: MouseEvent;
}

/**
 * 셀에 포커스가 있는 상태에서 키를 눌렀을 때(키 다운·업·프레스) 오는 정보입니다. CellEvent 가 담는
 * 행·컬럼·값에 더해, 눌린 키 이름(key)을 함께 주므로 Enter 이동·Delete 지우기 같은 단축키를 직접 구현할 수 있습니다.
 *
 * Delivered when a key is pressed while a cell has focus (keydown/keyup/keypress). On top of the
 * row/column/value that CellEvent carries, it adds the pressed `key` name so you can build
 * shortcuts like Enter-to-move or Delete-to-clear.
 *
 * セルにフォーカスがある状態でキーを押したとき（キーダウン・アップ・プレス）に届く情報です。CellEvent が
 * 収める行・列・値に加えて、押されたキー名（key）も一緒に渡すので、Enterで移動・Deleteで消去といった
 * ショートカットを自分で実装できます。
 *
 * 관련 옵션: onCellKeyDown, onCellKeyUp, onCellKeyPress
 *
 * Related options: onCellKeyDown, onCellKeyUp, onCellKeyPress
 *
 * 関連オプション: onCellKeyDown, onCellKeyUp, onCellKeyPress
 *
 * 单元格处于聚焦状态时按下按键（keydown/keyup/keypress）送达的信息。除了 CellEvent 带的行、列、值之外，
 * 它还给出按下的键名（key），因此可以自行实现 Enter 移动、Delete 清除这类快捷键。
 *
 * 相关选项: onCellKeyDown, onCellKeyUp, onCellKeyPress
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据的类型
 */
export interface CellKeyEvent<T = any> {
  /**
   * 이벤트 이름('cellKeyDown' 등).
   *
   * The event name.
   *
   * イベント名（'cellKeyDown' など）。
   *
   * 事件名（如 'cellKeyDown'）。
   */
  type: string;
  /**
   * 대상 행의 화면 표시 순서 인덱스.
   *
   * Screen-order index of the target row.
   *
   * 対象行の画面表示順のインデックス。
   *
   * 目标行按屏幕显示顺序的索引。
   */
  rowIndex: number;
  /**
   * 대상 컬럼의 인덱스.
   *
   * Index of the target column.
   *
   * 対象列のインデックス。
   *
   * 目标列的索引。
   */
  columnIndex: number;
  /**
   * 대상 컬럼의 field 이름.
   *
   * field name of the target column.
   *
   * 対象列の field 名。
   *
   * 目标列的 field 名。
   */
  field: string;
  /**
   * 그 셀의 원시 값.
   *
   * Raw value of that cell.
   *
   * そのセルの生の値。
   *
   * 该单元格的原始值。
   */
  value: any;
  /**
   * 그 행의 데이터 객체 전체.
   *
   * The full row-data object.
   *
   * その行のデータオブジェクト全体。
   *
   * 该行完整的数据对象。
   */
  row: T;
  /**
   * 그 컬럼의 정의.
   *
   * The column's definition.
   *
   * その列の定義。
   *
   * 该列的定义。
   */
  column: ColumnDef<T>;
  /**
   * 눌린 키 이름(KeyboardEvent.key: 'Enter','ArrowDown','a' …).
   *
   * The pressed key name (KeyboardEvent.key).
   *
   * 押されたキー名（KeyboardEvent.key: 'Enter'、'ArrowDown'、'a' など）。
   *
   * 按下的键名（KeyboardEvent.key: 'Enter'、'ArrowDown'、'a' 等）。
   */
  key: string;
  /**
   * 이벤트가 일어난 셀 DOM 요소.
   *
   * The cell DOM element where the event occurred.
   *
   * イベントが起きたセルのDOM要素。
   *
   * 事件发生所在的单元格 DOM 元素。
   */
  target: HTMLElement;
  /**
   * 브라우저 원본 키보드 이벤트(수식어 키 등).
   *
   * The underlying browser keyboard event (modifier keys …).
   *
   * ブラウザ本来のキーボードイベント（修飾キーなど）。
   *
   * 浏览器原始的键盘事件（修饰键等）。
   */
  originalEvent: KeyboardEvent;
}

/**
 * 정렬 변경 이벤트(sortChange).
 *
 * Sort change event (sortChange).
 *
 * ソート変更イベント（sortChange）。
 *
 * 排序变更事件（sortChange）。
 */
export interface SortEvent {
  field: string;
  dir: SortDir;
  /**
   * 멀티정렬 전체 상태.
   *
   * Full multi-sort state.
   *
   * マルチソートの全体状態。
   *
   * 多重排序的整体状态。
   */
  sortList: SortItem[];
}

/**
 * 필터 변경 이벤트(filterChange).
 *
 * Filter change event (filterChange).
 *
 * フィルター変更イベント（filterChange）。
 *
 * 筛选变更事件（filterChange）。
 */
export interface FilterEvent {
  field: string;
  filterItems: FilterItem[];
  /**
   * 전체 컬럼의 활성 필터 맵.
   *
   * Active filters for all columns.
   *
   * 全列のアクティブなフィルターのマップ。
   *
   * 全部列的生效筛选映射。
   */
  allFilters: Record<string, FilterItem[]>;
}

/**
 * 스크롤 이벤트(scroll).
 *
 * Scroll event (scroll).
 *
 * スクロールイベント（scroll）。
 *
 * 滚动事件（scroll）。
 */
export interface ScrollEvent {
  scrollLeft: number;
  scrollTop: number;
  isAtTop: boolean;
  isAtBottom: boolean;
}

/**
 * 행 드래그&드롭 이벤트(onDrop).
 *
 * Row drag & drop event (onDrop).
 *
 * 行のドラッグ＆ドロップイベント（onDrop）。
 *
 * 行的拖放事件（onDrop）。
 */
export interface DragDropEvent<T = any> {
  sourceRows: T[];
  sourceIndexes: number[];
  targetIndex: number;
  targetGridId?: string;
}

/**
 * 그리드↔그리드 행 이동 이벤트.
 *
 * Grid-to-grid row move event.
 *
 * グリッド↔グリッドの行移動イベント。
 *
 * crossGrid:true 인 두 그리드 사이에서 행을 드래그·드롭할 때 3단계로 발생한다.
 *
 * Fires in three phases when rows are dragged between two grids with crossGrid:true.
 *
 * crossGrid:true の二つのグリッドの間で行をドラッグ・ドロップするとき、3段階で発生する。
 *
 *  - onGridDropBefore  : 변경 직전(이동 전). false 반환 시 이동 취소. / just before the move; return false to cancel. / 変更直前（移動前）。false を返すと移動を取り消し。
 *  - onGridDropAfter   : 양쪽 데이터 모델 이동 완료 후. / after both data models have moved. / 両側のデータモデルの移動が完了した後。
 *  - onGridDropComplete: 양쪽 재렌더까지 끝난 후. / after both grids finished re-rendering. / 両側の再レンダーまで終わった後。
 *
 * 表格↔表格的行移动事件。
 *
 * 在 crossGrid:true 的两个表格之间拖放行时，分三个阶段触发。
 *
 *  - onGridDropBefore  : 移动之前。返回 false 则取消移动。
 *  - onGridDropAfter   : 两侧数据模型移动完成之后。
 *  - onGridDropComplete: 两侧重新渲染也结束之后。
 */
export interface GridDropEvent<T = any> {
  /**
   * 행을 보낸(드래그 시작) 그리드
   *
   * Grid the rows were dragged from
   *
   * 行を送り出した（ドラッグを開始した）グリッド
   *
   * 送出行的（发起拖动的）表格
   */
  sourceGrid: OpenGridInstance<T>;
  /**
   * 행을 받은(드롭 대상) 그리드
   *
   * Grid the rows were dropped onto
   *
   * 行を受け取った（ドロップ先の）グリッド
   *
   * 接收行的（放置目标）表格
   */
  targetGrid: OpenGridInstance<T>;
  /**
   * 이동된 행 데이터 (내부 id 제외 복사본)
   *
   * Moved row data (copies without internal ids)
   *
   * 移動した行データ（内部idを除いたコピー）
   *
   * 移动的行数据（不含内部 id 的副本）
   */
  rows: T[];
  /**
   * 소스 그리드에서의 원래 행 인덱스들
   *
   * Original row indexes in the source grid
   *
   * ソースグリッドでの元の行インデックス
   *
   * 在来源表格中原本的行索引
   */
  sourceIndexes: number[];
  /**
   * 타깃 그리드에서 삽입된 시작 인덱스
   *
   * Insertion start index in the target grid
   *
   * ターゲットグリッドで挿入された開始インデックス
   *
   * 在目标表格中插入的起始索引
   */
  targetIndex: number;
  /**
   * before 단계에서 true 로 바꾸면 이동 취소 (onGridDropBefore가 false 반환한 것과 동일)
   *
   * Set true in the before phase to cancel (same as returning false from onGridDropBefore)
   *
   * before 段階で true にすると移動を取り消し（onGridDropBefore が false を返したのと同じ）
   *
   * 在 before 阶段改为 true 则取消移动（与 onGridDropBefore 返回 false 相同）
   */
  cancel?: boolean;
}

/**
 * 그리드↔그리드 필드 매핑 확정 이벤트 (interactive 모드에서 매핑 모달 확인 시).
 *
 * Grid-to-grid field-mapping confirmation event (when the mapping modal is confirmed in interactive mode).
 *
 * グリッド↔グリッドのフィールドマッピング確定イベント（interactive モードでマッピングモーダルを確認したとき）。
 *
 * 表格↔表格的字段映射确定事件（在 interactive 模式下确认映射弹窗时）。
 */
export interface GridMappingEvent<T = any> {
  sourceGrid: OpenGridInstance<T>;
  targetGrid: OpenGridInstance<T>;
  /**
   * 타깃필드 → 소스필드 매핑
   *
   * target-field → source-field mapping
   *
   * ターゲットフィールド → ソースフィールドのマッピング
   *
   * 目标字段 → 来源字段的映射
   */
  mapping: Record<string, string>;
  /**
   * crossGridMapping 에 baking 할 수 있는 변환 함수 소스
   *
   * Transform-function source that can be baked into crossGridMapping
   *
   * crossGridMapping に baking できる変換関数のソース
   *
   * 可以 baking 到 crossGridMapping 的转换函数源码
   */
  script: string;
}

/**
 * 선택 변경 이벤트(selectionChange).
 *
 * Selection change event (selectionChange).
 *
 * 選択変更イベント（selectionChange）。
 *
 * 选择变更事件（selectionChange）。
 */
export interface SelectionEvent<T = any> {
  rows: T[];
  rowIndexes: number[];
  cells?: CellRange[];
}

/**
 * 선택된 셀들의 사각형 범위를 네 모서리 인덱스로 나타냅니다(엑셀의 A1:C5 같은 개념).
 * 범위 선택 기능이 이 값을 만들어 내고, 수식의 참조 대상과 차트의 데이터 소스가 이 좌표를 그대로 읽어 씁니다.
 *
 * A rectangular block of selected cells, given as its four corner indexes (think of a spreadsheet's
 * A1:C5). Range selection produces it; cell formulas and chart sources consume the same coordinates.
 *
 * 選択されたセルの矩形範囲を、四隅のインデックスで表します（スプレッドシートの A1:C5 のような考え方）。
 * 範囲選択の機能がこの値を作り出し、数式の参照先とチャートのデータソースがこの座標をそのまま読んで使います。
 *
 * 좌표가 가리키는 것:
 *  - 행 인덱스(startRow/endRow)는 "화면에 보이는 순서"입니다. 그룹·트리의 가상 행이나 펼쳐진 상세 행까지
 *    포함한 순서라서, 정렬·필터만 반영한 순수 데이터 순서와는 다를 수 있습니다.
 *  - 컬럼 인덱스(startCol/endCol)는 "지금 보이는 컬럼들" 기준입니다(숨긴 컬럼 제외). 컬럼을 다시 보이게 하면
 *    재렌더 때 좌표 표시가 갱신됩니다.
 *
 * What the coordinates mean:
 *  - Row indexes are in on-screen order — they include group/tree pseudo-rows and expanded detail
 *    rows, so they can differ from the pure data order that reflects only sort/filter.
 *  - Column indexes count only currently visible columns (hidden ones excluded); un-hiding a column
 *    refreshes the displayed coordinates on the next render.
 *
 * 座標が指すもの:
 *  - 行インデックス（startRow/endRow）は「画面に見えている順序」です。グループ・ツリーの仮想行や展開された
 *    詳細行まで含んだ順序なので、ソート・フィルターだけを反映した純粋なデータ順序とは異なることがあります。
 *  - 列インデックス（startCol/endCol）は「今見えている列」が基準です（隠した列は除く）。列を再び表示すると、
 *    再レンダーのときに座標の表示が更新されます。
 *
 * 주의: 선택의 "영구 신원"은 이 인덱스가 아니라 안정적인 (행 id × field) 앵커로 저장됩니다.
 * CellRange 는 어디까지나 "지금 화면에 투영된" 사각형 표현입니다.
 *
 * Note: The persistent identity of a selection is stored as a stable (rowId × field) anchor, not as
 * these indexes — CellRange is only the "currently projected onto screen" rectangle.
 *
 * 注意: 選択の「永続的な同一性」は、このインデックスではなく安定した（行 id × field）アンカーとして保存されます。
 * CellRange はあくまで「今、画面に投影された」矩形の表現です。
 *
 * 一块被选中的矩形单元格区域，用四角的索引表示（可类比电子表格的 A1:C5）。范围选择产出它，
 * 单元格公式的引用对象和图表的数据源直接读取同一组坐标。
 *
 * 坐标的含义:
 *  - 行索引（startRow/endRow）按「屏幕上看到的顺序」计算 —— 其中包含分组/树的虚拟行和展开的详情行，
 *    因此可能与只反映排序、筛选的纯数据顺序不同。
 *  - 列索引（startCol/endCol）只计当前可见的列（隐藏列除外）；重新显示某列后，下一次渲染会刷新显示的坐标。
 *
 * 注意: 选择的「持久身份」保存为稳定的（行 id × field）锚点，而非这些索引。CellRange 始终只是
 * 「当前投影到屏幕上」的矩形表示。
 */
// CellRangeSemantics(C0.4, 15_cross_contracts.md). 소유자 = F1(범위 선택). F3(수식 ref)·F4(차트 소스)가 소비.
// 행=flat/visual index(C0.2, FlatRowModel), 컬=ColumnLayout.visibleLeaves, 영속 신원=stable rowId×field 앵커(C0.5).
export interface CellRange {
  /**
   * 위쪽 경계 행(화면 표시 순서).
   *
   * Top boundary row (on-screen order).
   *
   * 上側の境界行（画面表示順）。
   *
   * 上边界行（按屏幕显示顺序）。
   */
  startRow: number;
  /**
   * 아래쪽 경계 행(화면 표시 순서).
   *
   * Bottom boundary row (on-screen order).
   *
   * 下側の境界行（画面表示順）。
   *
   * 下边界行（按屏幕显示顺序）。
   */
  endRow: number;
  /**
   * 왼쪽 경계 컬럼(보이는 컬럼 기준).
   *
   * Left boundary column (among visible columns).
   *
   * 左側の境界列（見えている列が基準）。
   *
   * 左边界列（以可见的列为准）。
   */
  startCol: number;
  /**
   * 오른쪽 경계 컬럼(보이는 컬럼 기준).
   *
   * Right boundary column (among visible columns).
   *
   * 右側の境界列（見えている列が基準）。
   *
   * 右边界列（以可见的列为准）。
   */
  endCol: number;
}

// ─── F1: 범위 선택 + 채우기 핸들 옵션/이벤트(11_design_F1_v2.md §6, C5) ────
// ─── F1: range selection + fill handle options/events ────
/**
 * 스프레드시트식 범위 선택과 채우기 핸들의 세부 동작을 조절합니다. selection: 'cells' 로 켠 뒤,
 * 채우기 핸들을 보일지·자동 스크롤 폭·시리즈 자동 감지 여부 등을 여기서 미세 조정합니다.
 *
 * Fine-tunes spreadsheet-style range selection and the fill handle. After enabling selection:
 * 'cells', tweak whether the handle shows, the autoscroll band, series auto-detection, and so on.
 *
 * スプレッドシート式の範囲選択とフィルハンドルの細かい動作を調節します。selection: 'cells' で有効にした後、
 * フィルハンドルを見せるか・自動スクロールの幅・連続データの自動検出の有無などを、ここで微調整します。
 *
 * 微调电子表格式的范围选择和填充手柄。用 selection: 'cells' 启用后，在这里调整是否显示手柄、
 * 自动滚动的边缘宽度、是否自动识别序列等。
 */
export interface RangeSelectionOptions {
  /**
   * 범위 선택 켜기. 생략 시 selection==='cells' 여부를 따릅니다.
   *
   * Enable range selection. Unset follows whether selection==='cells'.
   *
   * 範囲選択を有効にする。省略した場合は selection==='cells' かどうかに従います。
   *
   * 启用范围选择。省略时按 selection==='cells' 与否决定。
   */
  enabled?: boolean;
  /**
   * 선택 영역 모서리의 채우기 핸들(작은 사각형)을 보이고 드래그할 수 있게 할지. 기본 true.
   *
   * Show and allow dragging the fill handle (the small corner square). Default true.
   *
   * 選択領域の角にあるフィルハンドル（小さな四角）を表示し、ドラッグできるようにするか。既定 true。
   *
   * 是否显示选中区域角上的填充手柄（小方块）并允许拖动。默认 true。
   */
  fillHandle?: boolean;
  /**
   * Ctrl 로 사각형 여러 개를 동시에 선택하게 할지. 기본 false(아직 미구현).
   *
   * Whether Ctrl selects several rectangles at once. Default false (not implemented yet).
   *
   * Ctrl で矩形を複数同時に選択できるようにするか。既定 false（まだ未実装）。
   *
   * 是否允许用 Ctrl 同时选择多个矩形。默认 false（尚未实现）。
   */
  multiRange?: boolean;
  /**
   * 드래그가 이 가장자리 폭(px) 안에 들어오면 화면이 자동으로 스크롤됩니다. 기본 24.
   *
   * When the drag enters this edge band (px), the view auto-scrolls. Default 24.
   *
   * ドラッグがこの縁の幅（px）の中に入ると、画面が自動でスクロールします。既定 24。
   *
   * 拖动进入这一边缘宽度（px）内时，画面自动滚动。默认 24。
   */
  autoScrollEdge?: number;
  /**
   * 1,2,3… 같은 규칙을 자동 감지해 이어 채울지. 기본 true. false 면 항상 단순 복사만 합니다.
   *
   * Whether to auto-detect series (1,2,3…) and extend them. Default true; false always plain-copies.
   *
   * 1,2,3… のような規則を自動検出して続けて埋めるか。既定 true。false なら常に単純コピーだけを行います。
   *
   * 是否自动识别 1,2,3… 这类规律并顺延填充。默认 true；false 时始终只做简单复制。
   */
  seriesFill?: boolean;
  /**
   * 그룹·트리 모드에서도 범위 선택을 허용할지. 기본 false(현재 비활성).
   *
   * Whether range selection also works in group/tree mode. Default false (off for now).
   *
   * グループ・ツリーモードでも範囲選択を許可するか。既定 false（現在は無効）。
   *
   * 在分组、树模式下是否也允许范围选择。默认 false（目前未启用）。
   */
  enabledInTreeGroup?: boolean;
  /**
   * 채우기가 수식이 들어 있는 셀을 덮어쓰도록 허용할지. 기본 false(수식 보호).
   *
   * Whether filling may overwrite cells that contain formulas. Default false (formulas protected).
   *
   * フィルが数式の入っているセルを上書きすることを許可するか。既定 false（数式を保護）。
   *
   * 是否允许填充覆盖含有公式的单元格。默认 false（保护公式）。
   */
  fillOverwriteFormula?: boolean; // C3.2 opt-in
}

/**
 * F1 채우기 커밋 이벤트(onRangeFill).
 *
 * F1 fill commit event (onRangeFill).
 *
 * F1 フィルのコミットイベント（onRangeFill）。
 *
 * F1 填充提交事件（onRangeFill）。
 */
export interface RangeFillEvent {
  source: CellRange;
  target: CellRange;
  mode: 'copy' | 'series';
  written: Array<{ rowIndex: number; field: string; oldValue: any; newValue: any }>;
  skippedFormula?: number;
  /**
   * before 훅에서 true 로 바꾸면 채우기 취소(현재 배선은 이벤트 emit 뒤 즉시 확인)
   *
   * before フックで true にするとフィルを取り消し（現在の配線ではイベントの emit 直後に確認）
   *
   * 在 before 钩子里改为 true 则取消填充（当前的接线在事件 emit 之后立即检查）
   */
  cancel?: boolean;
}

/**
 * F1 범위 복사 이벤트(onRangeCopy).
 *
 * F1 range copy event (onRangeCopy).
 *
 * F1 範囲コピーイベント（onRangeCopy）。
 *
 * F1 范围复制事件（onRangeCopy）。
 */
export interface RangeCopyEvent {
  range: CellRange;
  /**
   * 클립보드 TSV 텍스트.
   *
   * Clipboard TSV text.
   *
   * クリップボードのTSVテキスト。
   *
   * 剪贴板的 TSV 文本。
   */
  text: string;
}

/**
 * F1 활성 범위 변경 이벤트(onRangeChange).
 *
 * F1 active-range change event (onRangeChange).
 *
 * F1 アクティブ範囲の変更イベント（onRangeChange）。
 *
 * F1 活动范围变更事件（onRangeChange）。
 */
export interface RangeChangeEvent {
  range: CellRange | null;
}

// ─── F3: 셀 수식 옵션/이벤트(11_design_F3_v2.md §8, 15_cross_contracts.md C5) ─────
import type { FormulaErrorCode } from './formula/types.js';
export type { FormulaErrorCode } from './formula/types.js';

/**
 * 셀에 '=' 로 시작하는 수식을 넣어 다른 셀을 참조·계산하게 하는 기능의 세부 설정입니다. 엑셀처럼
 * 셀에 직접 '=A1+B2' 를 입력해 쓰게 할지, 참조를 어떻게 해석할지, 변경 시 자동으로 다시 계산할지 등을 정합니다.
 *
 * Settings for cell formulas — cells that start with '=' and reference/compute other cells. Decide
 * whether users can type '=A1+B2' directly, how references are interpreted, and whether edits
 * trigger a recompute.
 *
 * セルに '=' で始まる数式を入れて、他のセルを参照・計算させる機能の細かい設定です。スプレッドシートのように
 * セルへ直接 '=A1+B2' を入力して使わせるか、参照をどう解釈するか、変更時に自動で再計算するかなどを決めます。
 *
 * 单元格公式的设置 —— 以 '=' 开头、引用并计算其他单元格的单元格。决定用户能否直接输入 '=A1+B2'、
 * 引用如何解释、编辑后是否触发重算。
 */
export interface FormulaOptions {
  /**
   * 셀에 '=' 를 직접 입력하면 수식으로 자동 인식할지. 기본 false(끄면 기존 편집과 동일). setCellFormula API 로는 이 값과 상관없이 언제나 수식을 넣을 수 있습니다.
   *
   * Whether typing '=' in a cell is auto-recognized as a formula. Default false; the setCellFormula API works regardless.
   *
   * セルに '=' を直接入力したら数式として自動認識するか。既定 false（切ると従来の編集と同じ）。setCellFormula API なら、この値に関係なくいつでも数式を入れられます。
   *
   * 在单元格里直接输入 '=' 是否自动识别为公式。默认 false（关闭时与原有编辑相同）。用 setCellFormula API 则不受此值影响，随时都能写入公式。
   */
  enabled?: boolean;
  /**
   * 참조를 어떻게 기억할지. 'stable'(기본)은 행을 정렬·이동해도 같은 셀을 계속 가리키고,
   * 'relative'는 위치 기준(엑셀 A1 상대참조처럼)입니다.
   *
   * How references are anchored. 'stable' (default) keeps pointing at the same cell even after
   * sorting/moving rows; 'relative' is position-based (like a spreadsheet's relative A1 ref).
   *
   * 参照をどのように覚えておくか。'stable'（既定）は行をソート・移動しても同じセルを指し続け、
   * 'relative' は位置が基準（スプレッドシートの A1 相対参照のように）です。
   *
   * 引用如何锚定。'stable'（默认）即使排序、移动行也继续指向同一个单元格；
   * 'relative' 以位置为准（像电子表格的 A1 相对引用）。
   */
  refMode?: 'stable' | 'relative'; // §3.2
  /**
   * 나눗셈 결과의 소수점 자리수. 기본 30.
   *
   * Decimal precision for division results. Default 30.
   *
   * 除算結果の小数点以下の桁数。既定 30。
   *
   * 除法结果的小数位数。默认 30。
   */
  divisionPrecision?: number;
  /**
   * 상단 수식 입력 바를 보일지. 기본 false(아직 미구현).
   *
   * Whether to show a top formula bar. Default false (not implemented yet).
   *
   * 上部に数式入力バーを表示するか。既定 false（まだ未実装）。
   *
   * 是否显示顶部的公式输入栏。默认 false（尚未实现）。
   */
  formulaBar?: boolean;
  /**
   * 수식이 든 셀에 표식(마커)을 달아 구분해 줄지. 기본 true.
   *
   * Whether to mark formula-bearing cells so they stand out. Default true.
   *
   * 数式の入ったセルに目印（マーカー）を付けて区別するか。既定 true。
   *
   * 是否给含公式的单元格加标记以示区分。默认 true。
   */
  cellMarker?: boolean;
  /**
   * 참조된 셀이 바뀌면 수식을 자동으로 다시 계산할지. 기본 true.
   *
   * Whether editing a referenced cell auto-recomputes the formula. Default true.
   *
   * 参照されたセルが変わったら数式を自動で再計算するか。既定 true。
   *
   * 被引用的单元格变化后，是否自动重算公式。默认 true。
   */
  autoRecalc?: boolean;
  /**
   * 어떤 셀의 수식 자체가 바뀌었을 때 호출.
   *
   * Fired when a cell's formula text itself changes.
   *
   * あるセルの数式そのものが変わったときに呼ばれる。
   *
   * 某个单元格的公式本身发生变化时调用。
   */
  onFormulaChange?: (e: FormulaChangeEvent) => void;
  /**
   * 재계산이 끝났을 때 호출(무엇이 바뀌었고 얼마나 걸렸는지).
   *
   * Fired after a recompute finishes (what changed, how long it took).
   *
   * 再計算が終わったときに呼ばれる（何が変わり、どれくらいかかったか）。
   *
   * 重算结束时调用（哪些变了、耗时多久）。
   */
  onFormulaRecalc?: (e: FormulaRecalcEvent) => void;
  /**
   * 수식 계산 중 오류(순환 참조·0 나눗셈 등)가 났을 때 호출.
   *
   * Fired on a formula error (circular ref, divide-by-zero …).
   *
   * 数式の計算中にエラー（循環参照・ゼロ除算など）が出たときに呼ばれる。
   *
   * 公式计算中出错（循环引用、除以零等）时调用。
   */
  onFormulaError?: (e: FormulaErrorEvent) => void;
}

/**
 * F3 수식 변경 이벤트(onFormulaChange).
 *
 * F3 formula change event (onFormulaChange).
 *
 * F3 数式変更イベント（onFormulaChange）。
 *
 * F3 公式变更事件（onFormulaChange）。
 */
export interface FormulaChangeEvent {
  rowIndex: number;
  field: string;
  formula: string;
  oldFormula: string | null;
}

/**
 * F3 재계산 완료 이벤트(onFormulaRecalc).
 *
 * F3 recalc-finished event (onFormulaRecalc).
 *
 * F3 再計算完了イベント（onFormulaRecalc）。
 *
 * F3 重算完成事件（onFormulaRecalc）。
 */
export interface FormulaRecalcEvent {
  /**
   * 값이 바뀐 셀 키 목록.
   *
   * Keys of cells whose values changed.
   *
   * 値が変わったセルキーの一覧。
   *
   * 值发生变化的单元格键列表。
   */
  changed: string[];
  cycles: number;
  ms: number;
  /**
   * 이번에 다시 계산해야 했던 셀 무리가 임계값(500)을 넘었으면 true. 성능 모니터링·경고용 신호입니다.
   *
   * true when the recalculated cell set exceeded the threshold (500) — a signal for perf monitoring/warnings.
   *
   * 今回再計算する必要があったセルの集まりがしきい値（500）を超えていれば true。性能モニタリング・警告のための信号です。
   *
   * 本次需要重算的单元格集合超过阈值（500）时为 true。这是用于性能监控、告警的信号。
   */
  large: boolean;
}

/**
 * F3 수식 오류 이벤트(onFormulaError).
 *
 * F3 formula error event (onFormulaError).
 *
 * F3 数式エラーイベント（onFormulaError）。
 *
 * F3 公式错误事件（onFormulaError）。
 */
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
 *
 * The helper bundle passed as the 3rd argument when you draw a detail panel yourself (renderer). It
 * carries the just-expanded row's info plus actions to collapse or re-measure the panel, so your
 * custom panel can reach back into the grid.
 *
 * 詳細パネルを自分で描くとき（renderer）に3番目の引数として受け取るヘルパーのまとまりです。今しがた展開された
 * 行の情報と、そのパネルを折りたたむ・測り直す操作を収めているので、カスタムパネルの中からグリッドへ
 * たどり返せます。
 *
 * 自行绘制详情面板（renderer）时，作为第三个参数收到的一组辅助工具。它带着刚展开的那一行的信息，
 * 以及折叠、重新测量该面板的操作，因此在自定义面板内也能反向操作表格。
 */
export interface DetailRenderApi<T = any> {
  /**
   * 이 패널을 소유한 그리드 인스턴스.
   *
   * The grid instance owning this panel.
   *
   * このパネルを所有するグリッドインスタンス。
   *
   * 拥有此面板的表格实例。
   */
  grid: OpenGridInstance<T>;
  /**
   * 펼쳐진 행의 안정적 id.
   *
   * Stable id of the expanded row.
   *
   * 展開された行の安定した id。
   *
   * 已展开行的稳定 id。
   */
  rowId: string;
  /**
   * 이 그리드가 몇 겹째 중첩인지. 0 = 최상위.
   *
   * How deeply nested this grid is. 0 = top level.
   *
   * このグリッドが何重目の入れ子か。0 = 最上位。
   *
   * 此表格嵌套到第几层。0 = 最顶层。
   */
  depth: number; // CON-4
  /**
   * 이 패널을 접습니다.
   *
   * Collapse this panel.
   *
   * このパネルを折りたたみます。
   *
   * 折叠此面板。
   */
  collapse: () => void;
  /**
   * 패널 크기를 다시 잽니다.
   *
   * Re-measure the panel.
   *
   * パネルの大きさを測り直します。
   *
   * 重新测量面板的尺寸。
   */
  refresh: () => void; // Phase2 auto 대비 자리 — MVP 는 no-op 에 가까움
}

/**
 * 각 행을 펼치면 그 아래에 딸린 상세 패널이 열리는 마스터/디테일 기능의 설정입니다. 주문 목록에서 한 줄을
 * 열면 주문 상세가, 부서 목록에서 한 줄을 열면 소속 직원 표가 펼쳐지는 식입니다. 패널 내용은 두 가지 방법으로
 * 채웁니다 — 직접 HTML 을 그리는 renderer 를 주거나, 자식 그리드를 자동 생성하는 subgridOptions 를 줍니다.
 *
 * Master/detail: expanding a row opens an attached detail panel beneath it — open an order to see
 * its lines, open a department to see its staff. Fill the panel either by drawing HTML yourself
 * (renderer) or by auto-creating a child grid (subgridOptions).
 *
 * 各行を展開すると、その下に付随する詳細パネルが開くマスター/ディテール機能の設定です。注文一覧で一行を
 * 開けば注文の明細が、部署一覧で一行を開けば所属社員の表が展開される、といった具合です。パネルの中身は
 * 二つの方法で埋めます — 直接HTMLを描く renderer を渡すか、子グリッドを自動生成する subgridOptions を渡します。
 *
 * 主从（Master/detail）: 展开一行，其下方就打开一个附属的详情面板 —— 展开一张订单看它的明细，
 * 展开一个部门看它的员工。面板内容用两种方式填充 —— 传入自行绘制 HTML 的 renderer，
 * 或传入自动生成子表格的 subgridOptions。
 */
// C5.1 단일 중첩 — 구 flat `detail*`/`masterDetail:boolean` 은 이 안으로 접힘.
export interface MasterDetailOptions<T = any> {
  /**
   * 기능 켜기/끄기. 기본 false(꺼짐).
   *
   * Turn the feature on/off. Default false (off).
   *
   * 機能のオン/オフ。既定 false（オフ）。
   *
   * 功能开/关。默认 false（关闭）。
   */
  enabled?: boolean;
  /**
   * 패널 안을 직접 그리는 함수(host 요소에 HTML/컴포넌트 주입). subgridOptions 와 같이 주면 이쪽이 우선.
   *
   * A function that draws the panel yourself (inject HTML/components into host). Wins over subgridOptions if both given.
   *
   * パネルの中を自分で描く関数（host 要素にHTML/コンポーネントを注入）。subgridOptions と一緒に渡した場合はこちらが優先。
   *
   * 自行绘制面板内容的函数（向 host 元素注入 HTML/组件）。与 subgridOptions 同时给出时，以此为优先。
   */
  renderer?: (row: T, host: HTMLElement, api: DetailRenderApi<T>) => void | HTMLElement;
  /**
   * 패널의 세로 높이(px). 기본 200. 현재는 행 높이의 배수로 맞춰집니다.
   *
   * Panel height (px). Default 200. Currently snapped to a multiple of the row height.
   *
   * パネルの縦の高さ（px）。既定 200。現在は行の高さの倍数に合わせられます。
   *
   * 面板的高度（px）。默认 200。目前会对齐到行高的整数倍。
   */
  height?: number; // MVP: rowHeight 배수로 양자화(EC-10)
  /**
   * 패널 높이를 어떻게 정할지. 'fixed'(기본)만 지금 동작합니다. 'auto'(내용에 맞춰 자동)는 아직 미공개라,
   * 지정해도 'fixed' 로 처리되고 한 번 경고를 남깁니다.
   *
   * How the panel height is decided. Only 'fixed' (default) works today. 'auto' (fit-to-content) is
   * not released yet — if set, it's treated as 'fixed' and warns once.
   *
   * パネルの高さをどう決めるか。今は 'fixed'（既定）だけが動作します。'auto'（内容に合わせて自動）はまだ未公開なので、
   * 指定しても 'fixed' として扱われ、警告を一度だけ残します。
   *
   * 面板高度如何决定。目前只有 'fixed'（默认）可用。'auto'（随内容自适应）尚未公开 ——
   * 即使指定也按 'fixed' 处理，并只警告一次。
   */
  heightMode?: 'fixed' | 'auto'; // 'auto' 는 Spike-B(C12.2) 통과 전 미공개
  /**
   * 여러 행을 동시에 펼쳐 둘지. 기본 true. false 로 하면 아코디언처럼 한 번에 하나만 열립니다.
   *
   * Whether several rows can stay open at once. Default true; false = accordion (one open at a time).
   *
   * 複数の行を同時に展開しておくか。既定 true。false にするとアコーディオンのように一度に一つだけ開きます。
   *
   * 是否允许多行同时保持展开。默认 true；false 则像手风琴那样一次只开一个。
   */
  expandMultiple?: boolean;
  /**
   * true 면 접어도 패널 내용을 캐시로 남겨 다시 펼칠 때 재생성을 건너뜁니다. 기본 false.
   *
   * true keeps the panel cached when collapsed, skipping rebuild on re-expand. Default false.
   *
   * true なら折りたたんでもパネルの中身をキャッシュに残し、再び展開するときの作り直しを省きます。既定 false。
   *
   * true 时折叠后仍把面板内容留在缓存里，再次展开时省去重建。默认 false。
   */
  cache?: boolean;
  /**
   * 펼침/접힘 버튼을 어디에 둘지. 기본 'expander-col'(전용 컬럼). 'first-cell'=첫 셀 안.
   *
   * Where the expand toggle sits. Default 'expander-col' (a dedicated column); 'first-cell' = inside the first cell.
   *
   * 展開/折りたたみボタンをどこに置くか。既定 'expander-col'（専用の列）。'first-cell' = 最初のセルの中。
   *
   * 展开/折叠按钮放在哪里。默认 'expander-col'（专用列）；'first-cell' = 第一个单元格内。
   */
  toggle?: 'expander-col' | 'first-cell';
  /**
   * 스크린리더가 읽을 패널 영역 이름. 기본 '상세 내용'.
   *
   * The panel region's screen-reader label. Default '상세 내용' (Details).
   *
   * スクリーンリーダーが読むパネル領域の名前。既定 '상세 내용'（詳細内容）。
   *
   * 屏幕阅读器朗读的面板区域名称。默认 '상세 내용'（详情内容）。
   */
  ariaLabel?: string;
  /**
   * 패널 안에 또 패널을 열 수 있는 최대 겹수. 기본 2.
   *
   * How many levels of nested panels are allowed. Default 2.
   *
   * パネルの中にさらにパネルを開ける最大の重なり数。既定 2。
   *
   * 面板内再开面板的最大层数。默认 2。
   */
  maxDepth?: number; // CON-4/FR-10
  /**
   * 지정하면 height(px) 대신 "행 몇 개 높이"(정수, 최소 1)로 패널 높이를 정합니다.
   *
   * When set, sizes the panel by row-count (integer, min 1) instead of height(px).
   *
   * 指定すると、height（px）の代わりに「行いくつ分の高さ」（整数、最小 1）でパネルの高さを決めます。
   *
   * 指定后，用「几行的高度」（整数，最小 1）代替 height（px）来决定面板高度。
   */
  detailRowCount?: number;
  /**
   * renderer 를 안 줬을 때, 이 옵션으로 자식 그리드를 자동 생성해 패널을 채웁니다.
   *
   * When no renderer is given, auto-create a child grid from these options to fill the panel.
   *
   * renderer を渡さなかったとき、このオプションで子グリッドを自動生成してパネルを埋めます。
   *
   * 未传入 renderer 时，用这个选项自动生成子表格来填充面板。
   */
  subgridOptions?: GridOptions<any>;
}

/**
 * 행 상세 패널이 펼쳐지거나(rowExpand) 접힐 때(rowCollapse) 핸들러로 오는 정보입니다.
 * 어느 행인지와, 그 상세 패널이 붙은 DOM 요소(host)를 함께 줍니다.
 *
 * Delivered when a row's detail panel expands (rowExpand) or collapses (rowCollapse). It tells you
 * which row it was and the DOM element (host) the detail panel is attached to.
 *
 * 行の詳細パネルが展開されたとき（rowExpand）、または折りたたまれたとき（rowCollapse）にハンドラーへ届く情報です。
 * どの行かと、その詳細パネルが付いているDOM要素（host）を一緒に渡します。
 *
 * 行的详情面板展开（rowExpand）或折叠（rowCollapse）时送到处理函数的信息。它告诉你是哪一行，
 * 以及详情面板挂在哪个 DOM 元素（host）上。
 */
export interface RowExpandEvent<T = any> {
  /**
   * 대상 행의 화면 표시 순서 인덱스.
   *
   * Screen-order index of the target row.
   *
   * 対象行の画面表示順のインデックス。
   *
   * 目标行按屏幕显示顺序的索引。
   */
  rowIndex: number;
  /**
   * 대상 행의 안정적 id.
   *
   * Stable id of the target row.
   *
   * 対象行の安定した id。
   *
   * 目标行的稳定 id。
   */
  rowId: string;
  /**
   * 그 행의 데이터 객체.
   *
   * The row-data object.
   *
   * その行のデータオブジェクト。
   *
   * 该行的数据对象。
   */
  row: T;
  /**
   * 상세 패널이 붙은 DOM 요소(접힘 이벤트에서는 null 일 수 있음).
   *
   * The DOM element the detail panel is attached to (may be null on collapse).
   *
   * 詳細パネルが付いているDOM要素（折りたたみイベントでは null のことがある）。
   *
   * 详情面板挂载的 DOM 元素（折叠事件中可能为 null）。
   */
  host: HTMLElement | null;
}

// ─── 컬럼 정의 / column definition ────────────────────────────────────────────
/**
 * 셀을 어떻게 그릴지 자세히 지정합니다. 렌더러 타입 이름만으로 부족해 부가 설정까지 주고 싶을 때
 * 씁니다(`column.renderer` 에 문자열 대신 이 객체를 넘김). `type` 이외의 키는 렌더러마다 다르게 해석됩니다.
 *
 * Detailed spec for how a cell is drawn. Use it (instead of a bare renderer-type string in
 * `column.renderer`) when the renderer needs extra settings. Keys beyond `type` are
 * renderer-specific.
 *
 * セルをどう描くかを詳しく指定します。レンダラーのタイプ名だけでは足りず、付加設定まで渡したいときに
 * 使います（`column.renderer` に文字列ではなくこのオブジェクトを渡す）。`type` 以外のキーはレンダラーごとに
 * 異なる解釈をされます。
 *
 * 单元格如何绘制的详细规格。当渲染器需要额外设置时，用它代替 `column.renderer` 里裸的渲染器类型字符串。
 * `type` 以外的键由各渲染器分别解释。
 */
export interface RendererDef {
  /**
   * 사용할 내장 렌더러 이름.
   *
   * Which built-in renderer to use.
   *
   * 使用する組み込みレンダラーの名前。
   *
   * 使用哪个内置渲染器。
   */
  type: RendererType;
  /**
   * 렌더러별 추가 옵션(자유 키).
   *
   * Renderer-specific extra options (free-form keys).
   *
   * レンダラーごとの追加オプション（自由なキー）。
   *
   * 各渲染器专有的额外选项（自由键）。
   */
  [key: string]: any;
}

/**
 * 편집기를 어떻게 열지 자세히 지정합니다. 예를 들어 `select` 편집기에 선택지 목록을,
 * `number` 편집기에 최소·최대·증가폭을 함께 줄 때 씁니다(`column.editor` 에 이 객체를 넘김).
 *
 * Detailed spec for how the editor opens — e.g. a `select` editor's choices, or a `number`
 * editor's min/max/step (passed to `column.editor`).
 *
 * エディターをどう開くかを詳しく指定します。たとえば `select` エディターに選択肢の一覧を、
 * `number` エディターに最小・最大・増減幅を一緒に渡すときに使います（`column.editor` にこのオブジェクトを渡す）。
 *
 * 详细指定编辑器如何打开。例如给 `select` 编辑器传选项列表，或给 `number` 编辑器传最小值、
 * 最大值和步长（把该对象传给 `column.editor`）。
 */
export interface EditorDef {
  /**
   * 사용할 내장 편집기 이름.
   *
   * Which built-in editor to use.
   *
   * 使用する組み込みエディターの名前。
   *
   * 使用的内置编辑器名称。
   */
  type: EditorType;
  /**
   * select 편집기의 선택지(문자열 또는 {label,value}).
   *
   * Choices for a select editor.
   *
   * select エディターの選択肢（文字列または {label,value}）。
   *
   * select 编辑器的选项（字符串或 {label,value}）。
   */
  options?: Array<string | { label: string; value: any }>;
  /**
   * select 에서 다중 선택 허용.
   *
   * Allow multiple selection in select.
   *
   * select での複数選択を許可。
   *
   * 允许 select 多选。
   */
  multiple?: boolean;
  /**
   * number 편집기의 최솟값.
   *
   * Minimum for a number editor.
   *
   * number エディターの最小値。
   *
   * number 编辑器的最小值。
   */
  min?: number;
  /**
   * number 편집기의 최댓값.
   *
   * Maximum for a number editor.
   *
   * number エディターの最大値。
   *
   * number 编辑器的最大值。
   */
  max?: number;
  /**
   * number 편집기의 증가 단위.
   *
   * Step increment for a number editor.
   *
   * number エディターの増減の単位。
   *
   * number 编辑器的步长。
   */
  step?: number;
  /**
   * 입력값 포맷 문자열.
   *
   * Format string for the input value.
   *
   * 入力値のフォーマット文字列。
   *
   * 输入值的格式字符串。
   */
  format?: string;
  /**
   * 빈 편집기에 보일 안내 문구.
   *
   * Placeholder shown in an empty editor.
   *
   * 空のエディターに表示する案内文。
   *
   * 编辑器为空时显示的提示文字。
   */
  placeholder?: string;
  /**
   * 편집기별 추가 옵션(자유 키).
   *
   * Editor-specific extra options (free-form keys).
   *
   * エディターごとの追加オプション（自由なキー）。
   *
   * 各编辑器的额外选项（自由键）。
   */
  [key: string]: any;
}

/**
 * 컬럼 한 개를 어떻게 보이고 동작하게 할지 담는 설정 뭉치입니다. 그리드는 `columns` 배열에 담긴 이
 * 정의들을 왼쪽부터 순서대로 그립니다. 최소한 `field`(어떤 데이터를 보여줄지)와 `header`(머리글 글자)만
 * 있으면 되고, 나머지는 필요할 때만 켜는 선택 항목입니다.
 *
 * The settings bundle for a single column — what it shows and how it behaves. The grid draws the
 * definitions in the `columns` array left to right. Only `field` (which data to show) and `header`
 * (the caption) are required; everything else is opt-in.
 *
 * 列一つをどう見せ、どう動かすかを収めた設定のまとまりです。グリッドは `columns` 配列に入ったこれらの
 * 定義を、左から順に描きます。最低限 `field`（どのデータを見せるか）と `header`（ヘッダーの文字）だけあればよく、
 * 残りは必要なときだけ有効にする任意の項目です。
 *
 * 单个列的设置集合——它显示什么、如何工作。表格按 `columns` 数组中的定义从左到右绘制。
 * 只有 `field`（显示哪个数据）和 `header`（表头文字）是必需的，其余都按需启用。
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据类型
 *
 * @example
 * const col: ColumnDef = { field: 'price', header: '가격', type: 'number', format: '#,##0' };
 */
export interface ColumnDef<T = any> {
  /**
   * 이 컬럼이 읽어 올 행 객체의 속성 이름(예: 행이 `{price: 1000}` 이면 `'price'`). 컬럼마다 고유.
   *
   * The row-object property this column reads (e.g. `'price'` for a row `{price: 1000}`). Unique per column.
   *
   * この列が読み取る行オブジェクトのプロパティ名（例: 行が `{price: 1000}` なら `'price'`）。列ごとに一意。
   *
   * 该列读取的行对象属性名（例如行为 `{price: 1000}` 时为 `'price'`）。每列唯一。
   */
  field: string;
  /**
   * 머리글에 보일 글자. 문자열 안의 '\n' 은 두 줄로 나뉩니다.
   *
   * The caption shown in the header. A '\n' inside splits into two lines.
   *
   * ヘッダーに表示する文字。文字列の中の '\n' は二行に分かれます。
   *
   * 表头显示的文字。字符串中的 '\n' 会分成两行。
   */
  header: string;
  /**
   * 이 폭(px)으로 고정. 지정하면 flex 를 무시하고 정확히 이 값이 됩니다.
   *
   * Pin this width (px). When set it overrides flex and stays exactly this.
   *
   * この幅（px）で固定。指定すると flex を無視して、正確にこの値になります。
   *
   * 固定为该宽度（px）。指定后忽略 flex，精确保持此值。
   */
  width?: number;
  /**
   * 줄어들 때 넘지 않을 최소 폭(px).
   *
   * Lower bound (px) the column won't shrink past.
   *
   * 縮むときにこれ以上は超えない最小の幅（px）。
   *
   * 收缩时不低于的最小宽度（px）。
   */
  minWidth?: number;
  /**
   * 늘어날 때 넘지 않을 최대 폭(px).
   *
   * Upper bound (px) the column won't grow past.
   *
   * 広がるときにこれ以上は超えない最大の幅（px）。
   *
   * 扩展时不超过的最大宽度（px）。
   */
  maxWidth?: number;
  /**
   * 남는 가로 공간을 컬럼끼리 나눌 때의 비율. 값이 클수록 더 많이 차지합니다(width 미지정 컬럼끼리).
   *
   * Weight for sharing leftover horizontal space — higher takes more (among columns without width).
   *
   * 余った横方向のスペースを列どうしで分けるときの比率。値が大きいほど多く占めます（width を指定していない列どうしで）。
   *
   * 分配剩余横向空间的比例。值越大占得越多（在未指定 width 的列之间）。
   */
  flex?: number;

  /**
   * 이 컬럼 값의 종류. 이걸 정하면 그에 맞는 정렬 방식과 기본 렌더러가 자동으로 붙습니다
   * (예: 'number' 는 오른쪽 정렬 + 숫자 비교). 지정하지 않으면 문자열처럼 다룹니다.
   *
   * The kind of value here. Setting it auto-wires the matching sort behavior and default renderer
   * (e.g. 'number' → right-aligned + numeric compare). Unset behaves like a string.
   *
   * この列の値の種類。これを決めると、それに合ったソート方式と既定のレンダラーが自動で付きます
   * （例: 'number' は右揃え + 数値比較）。指定しない場合は文字列のように扱います。
   *
   * 该列的值的种类。设定后会自动接上相应的排序方式和默认渲染器
   * （例如 'number' 为右对齐 + 按数值比较）。不指定时按字符串处理。
   */
  type?: DataType;
  /**
   * 숫자/날짜 포맷 문자열. 숫자는 통화 기호 접두·접미와 음수 패턴 지원:
   *  '#,##0' · '#,##0.00' · '₩#,##0' · '$#,##0.00' · '#,##0원' · '$#,##0;($#,##0)'(음수 괄호)
   *
   * Number/date format string. Numbers support currency prefixes/suffixes and negative
   * patterns, e.g. '$#,##0;($#,##0)' (parentheses for negatives).
   *
   * 数値/日付のフォーマット文字列。数値は通貨記号の前置・後置と、負数パターンに対応:
   *  '#,##0' · '#,##0.00' · '₩#,##0' · '$#,##0.00' · '#,##0원' · '$#,##0;($#,##0)'（負数は括弧）
   *
   * 数值/日期的格式字符串。数值支持货币符号前置、后置和负数模式：
   *  '#,##0' · '#,##0.00' · '₩#,##0' · '$#,##0.00' · '#,##0원' · '$#,##0;($#,##0)'（负数加括号）
   */
  format?: string;
  /**
   * ISO 통화코드('KRW'|'USD'|'EUR'…). 지정 시 Intl.NumberFormat 로케일 통화 포맷 (format 보다 우선)
   *
   * ISO currency code; uses Intl.NumberFormat locale currency formatting (takes precedence over format)
   *
   * ISO通貨コード（'KRW'|'USD'|'EUR' など）。指定すると Intl.NumberFormat のロケール通貨フォーマット（format より優先）
   *
   * ISO 货币代码（'KRW'|'USD'|'EUR' 等）。指定后使用 Intl.NumberFormat 的区域货币格式（优先于 format）
   */
  currency?: string;
  /**
   * 저장된 코드값을 사람이 읽는 말로 바꿔 보여줄 때(예: `{ 'M': '남', 'F': '여' }`).
   *
   * Show human-readable text for stored codes (e.g. `{ 'M':'Male', 'F':'Female' }`).
   *
   * 保存されたコード値を、人が読める言葉に変えて見せるとき（例: `{ 'M': '남', 'F': '여' }`）。
   *
   * 把保存的代码值换成人能读懂的文字显示（例如 `{ 'M': '남', 'F': '여' }`）。
   */
  valueMap?: Record<string, string>;

  /**
   * 셀을 그리는 방식. 내장 렌더러 이름 한 줄로 주거나, 부가 옵션이 필요하면 RendererDef 객체로 줍니다.
   *
   * How the cell is drawn — a built-in renderer name, or a RendererDef object when extras are needed.
   *
   * セルを描く方式。組み込みレンダラーの名前を一行で渡すか、付加オプションが必要なら RendererDef オブジェクトで渡します。
   *
   * 单元格的绘制方式。用一行传内置渲染器名称，需要附加选项时传 RendererDef 对象。
   */
  renderer?: RendererType | RendererDef;
  /**
   * 이 컬럼을 편집할 수 있는지. true 면 항상 편집 가능, 함수로 주면 행마다 다르게 결정합니다
   * (예: 상태가 '확정'인 행만 잠그기). GridOptions.editable 과 둘 다 참일 때만 실제로 열립니다.
   *
   * Whether this column is editable. true = always; a function decides per row (e.g. lock only
   * 'finalized' rows). Editing opens only when this AND GridOptions.editable are true.
   *
   * この列を編集できるかどうか。true なら常に編集可能、関数で渡せば行ごとに違う判断をします
   * （例: 状態が「確定」の行だけロックする）。GridOptions.editable と両方が真のときにだけ実際に開きます。
   *
   * 该列能否编辑。true 表示始终可编辑，传函数则按行判断（例如只锁定状态为「确定」的行）。
   * 只有它与 GridOptions.editable 同时为真时才会真正打开。
   */
  editable?: boolean | ((row: T, rowIndex: number) => boolean);
  /**
   * 편집기 종류. 내장 편집기 이름 한 줄로 주거나, 선택지·최소/최대 등이 필요하면 EditorDef 객체로 줍니다.
   *
   * The editor — a built-in editor name, or an EditorDef object for choices/min/max, etc.
   *
   * エディターの種類。組み込みエディターの名前を一行で渡すか、選択肢・最小/最大などが必要なら EditorDef オブジェクトで渡します。
   *
   * 编辑器种类。用一行传内置编辑器名称，需要选项、最小/最大等时传 EditorDef 对象。
   */
  editor?: EditorType | EditorDef;

  /**
   * 셀 정렬.
   *
   * Cell text alignment.
   *
   * セルの文字揃え。
   *
   * 单元格的文字对齐。
   */
  align?: 'left' | 'center' | 'right';
  /**
   * 헤더 정렬.
   *
   * Header text alignment.
   *
   * ヘッダーの文字揃え。
   *
   * 表头的文字对齐。
   */
  headerAlign?: 'left' | 'center' | 'right';
  /**
   * 셀 인라인 스타일(정적 또는 값·행 함수).
   *
   * Cell inline style (static or value/row function).
   *
   * セルのインラインスタイル（静的、または値・行の関数）。
   *
   * 单元格的内联样式（静态，或按值、行的函数）。
   */
  cellStyle?: CSSProperties | ((value: any, row: T, rowIndex: number) => CSSProperties);
  /**
   * 헤더 인라인 스타일.
   *
   * Header inline style.
   *
   * ヘッダーのインラインスタイル。
   *
   * 表头的内联样式。
   */
  headerStyle?: CSSProperties;

  /**
   * 이 컬럼 머리글을 클릭하면 정렬되게 할지. 특정 컬럼만 정렬을 막거나 허용할 때 씁니다.
   *
   * Whether clicking this header sorts. Use it to allow/deny sorting per column.
   *
   * この列のヘッダーをクリックしたらソートされるようにするか。特定の列だけソートを禁じたり許したりするときに使います。
   *
   * 点击该列表头是否排序。用于按列禁止或允许排序。
   */
  sortable?: boolean;
  /**
   * 이 컬럼에 필터 아이콘·패널을 띄울지.
   *
   * Whether to show the filter icon/panel on this column.
   *
   * この列にフィルターのアイコン・パネルを出すか。
   *
   * 是否在该列显示筛选图标和面板。
   */
  filterable?: boolean;
  /**
   * 머리글 경계를 드래그해 폭을 조절하게 할지.
   *
   * Whether the user can drag the header edge to resize.
   *
   * ヘッダーの境界をドラッグして幅を調節できるようにするか。
   *
   * 是否允许拖动表头边界调节宽度。
   */
  resizable?: boolean;
  /**
   * true 면 이 컬럼을 화면에서 감춥니다(데이터는 남고 showColumn 으로 다시 보임).
   *
   * true hides the column (data stays; showColumn brings it back).
   *
   * true ならこの列を画面から隠します（データは残り、showColumn で再び表示）。
   *
   * true 时把该列从画面隐藏（数据保留，用 showColumn 可再次显示）。
   */
  hidden?: boolean;
  /**
   * true 면 가로 스크롤과 무관하게 왼쪽에 붙박아 둡니다(핵심 식별 컬럼 고정용).
   *
   * true pins the column to the left regardless of horizontal scroll (for key identifier columns).
   *
   * true なら横スクロールに関係なく左に固定しておきます（重要な識別列の固定用）。
   *
   * true 时无论横向滚动都固定在左侧（用于固定关键标识列）。
   */
  frozen?: boolean;
  /**
   * 셀 줄바꿈: true 면 nowrap+ellipsis 대신 여러 줄로 표시(rowHeight 확대와 함께 사용)
   *
   * Cell wrapping: true renders multiple lines instead of nowrap+ellipsis (use with a larger rowHeight)
   *
   * セルの折り返し: true なら nowrap+ellipsis の代わりに複数行で表示（rowHeight を大きくして併用）
   *
   * 单元格换行：true 时不用 nowrap+ellipsis，改为多行显示（配合放大 rowHeight 使用）
   */
  wrap?: boolean;
  /**
   * 헤더(컬럼 머리글) 줄바꿈: true 면 헤더 텍스트가 잘리지 않고 여러 줄로 줄바꿈된다.
   * (셀 본문용 wrap 과 별개로 헤더에만 적용. header 문자열의 '\n' 은 headerWrap 여부와 무관하게 항상 줄바꿈됨)
   * 줄바꿈된 헤더에 맞춰 헤더 행 높이가 자동으로 늘어난다.
   *
   * Header wrapping: true wraps header text to multiple lines instead of truncating
   * (header-only, independent of the body `wrap`; '\n' in `header` always breaks regardless).
   * The header row height grows automatically to fit.
   *
   * ヘッダー（列の見出し）の折り返し: true ならヘッダーのテキストが切れずに複数行へ折り返される。
   * （セル本文用の wrap とは別に、ヘッダーだけに適用。header 文字列の '\n' は headerWrap の有無に関係なく常に改行される）
   * 折り返されたヘッダーに合わせて、ヘッダー行の高さが自動で伸びる。
   *
   * 表头（列标题）换行：true 时表头文字不截断，而是换行成多行。
   * （与单元格正文的 wrap 无关，只作用于表头。header 字符串中的 '\n' 无论 headerWrap 与否都始终换行）
   * 表头行高会随换行后的表头自动增高。
   */
  headerWrap?: boolean;

  /**
   * 가로 병합 허용(불리언 또는 행별 함수).
   *
   * Allow column span (boolean or per-row function).
   *
   * 横方向の結合を許可（真偽値、または行ごとの関数）。
   *
   * 允许横向合并（布尔值，或按行的函数）。
   */
  colSpan?: boolean | ((row: T, rowIndex: number) => boolean);
  /**
   * 세로 병합 허용.
   *
   * Allow row span.
   *
   * 縦方向の結合を許可。
   *
   * 允许纵向合并。
   */
  rowSpan?: boolean;

  /**
   * 다단 헤더용 자식 컬럼.
   *
   * Child columns for multi-level headers.
   *
   * 多段ヘッダー用の子列。
   *
   * 多级表头用的子列。
   */
  children?: ColumnDef<T>[];

  /**
   * 셀 title 툴팁(정적 또는 값·행 함수).
   *
   * Cell title tooltip (static or value/row function).
   *
   * セルの title ツールチップ（静的、または値・行の関数）。
   *
   * 单元格的 title 提示（静态，或按值、行的函数）。
   */
  tooltip?: string | ((value: any, row: T) => string);

  // Sprint 36: select 타입 컬럼 — 정적 옵션 배열 또는 동적 옵션 함수
  // / Sprint 36: select-type column — static option array or dynamic option function
  /**
   * select 정적 옵션.
   *
   * Static options for select.
   *
   * select の静的オプション。
   *
   * select 的静态选项。
   */
  options?: Array<string | { label: string; value: any }>;
  /**
   * select 동적 옵션 함수.
   *
   * Dynamic option function for select.
   *
   * select の動的オプション関数。
   *
   * select 的动态选项函数。
   */
  optionsFn?: (row: T, rowIndex: number) => Array<string | { label: string; value: any }>;

  // Sprint 37: 신규 셀 타입 옵션 / Sprint 37: new cell-type options
  /**
   * radio — 같은 group 내 단일 선택
   *
   * radio — single choice within the same group
   *
   * radio — 同じ group 内での単一選択
   *
   * radio — 同一 group 内的单选
   */
  group?: string;
  /**
   * img — 이미지 대체 텍스트 (웹접근성 필수)
   *
   * img — alt text (required for accessibility)
   *
   * img — 画像の代替テキスト（ウェブアクセシビリティに必須）
   *
   * img — 图片的替代文字（无障碍访问必需）
   */
  alt?: string;
  /**
   * html — XSS 방지 sanitize (기본 true)
   *
   * html — XSS sanitize (default true)
   *
   * html — XSS を防ぐ sanitize（既定 true）
   *
   * html — 防 XSS 的 sanitize（默认 true）
   */
  sanitize?: boolean;
  /**
   * barcode — 바코드 높이(px), 기본 28
   *
   * barcode — bar height in px, default 28
   *
   * barcode — バーコードの高さ（px）、既定 28
   *
   * barcode — 条形码高度（px），默认 28
   */
  barcodeHeight?: number;

  /**
   * 표시할 때 반올림해서 보여줄 소수점 자리수(합계 계산에도 반영).
   *
   * Decimal places to show (also applied to summing).
   *
   * 表示するときに丸めて見せる小数点以下の桁数（合計の計算にも反映）。
   *
   * 显示时四舍五入到的小数位数（也反映到合计计算）。
   */
  precision?: number; // F4: display + kahanSum

  // 임의정밀도 컬럼 수식(OGDecimal 기반) — 다른 컬럼 값으로 이 컬럼 값을 계산.
  // / Arbitrary-precision column formula (OGDecimal-based) — compute this column from others.
  // 함수식 / function form: (row, D) => D.from(row.price).mul('0.035')
  // 문자열식 / string form: '[revenue] * [rate] / 100'
  /**
   * 이 컬럼 값을 다른 컬럼으로 자동 계산. 함수식 또는 '[field]' 를 쓰는 문자열식.
   *
   * Auto-compute this column from others — a function, or a string using '[field]' refs.
   *
   * この列の値を他の列から自動計算。関数式、または '[field]' を使う文字列式。
   *
   * 用其他列自动计算该列的值。函数式，或使用 '[field]' 的字符串式。
   */
  formula?: string | ((row: T, D: any) => any);
  /**
   * 수식 나눗셈의 소수점 자리수. 기본 30.
   *
   * Decimal precision for division inside the formula. Default 30.
   *
   * 数式の除算の小数点以下の桁数。既定 30。
   *
   * 公式除法的小数位数。默认 30。
   */
  formulaPrecision?: number;

  // 컬럼 마스킹 — 민감 값(주민번호·카드번호 등)을 가려 표시.
  // / Column masking — hide sensitive values (IDs, card numbers …).
  /**
   * 이 컬럼 값을 가려 표시할 마스킹 타입 또는 상세 정의.
   *
   * Mask type or detailed definition to obscure this column's values.
   *
   * この列の値を伏せて表示するマスキングのタイプ、または詳細な定義。
   *
   * 遮蔽显示该列值的掩码类型，或详细定义。
   */
  mask?: import('./MaskingEngine.js').MaskType | import('./MaskingEngine.js').MaskDef;

  // 트리 노드 아이콘 커스터마이징 (첫 번째 컬럼에만 적용)
  // / Tree node icon customization (applies to the first column only)
  // 정적: { branch:'bi-building', branchOpen:'bi-building-check', leaf:'bi-person' }
  // 동적: (row, hasChildren, expanded) => hasChildren ? 'bi-folder2' : 'bi-file-earmark'
  /**
   * 트리 노드 아이콘(정적 정의 또는 행별 함수).
   *
   * Tree node icon (static def or per-row function).
   *
   * ツリーノードのアイコン（静的な定義、または行ごとの関数）。
   *
   * 树节点图标（静态定义，或按行的函数）。
   */
  treeNodeIcon?: TreeNodeIconDef | ((row: T, hasChildren: boolean, expanded: boolean) => string);

  // 내부 사용 / internal use
  /** @internal */
  _colIndex?: number;
  /** @internal */
  _depth?: number;
  /** @internal */
  _leaf?: boolean;
  /**
   * @internal
   * setMaskEnabled(field, false) 시 true (컬럼 전체 해제)
   *
   * true after setMaskEnabled(field, false) (whole-column reveal)
   *
   * setMaskEnabled(field, false) のとき true（列全体の解除）
   */
  _maskRevealed?: boolean;
  /**
   * @internal
   * 눈 아이콘 클릭으로 해제된 행 rowIndex 집합
   *
   * Set of rowIndexes revealed via the eye icon
   *
   * 目のアイコンのクリックで解除された行 rowIndex の集合
   */
  _maskRevealedRows?: Set<number>;
}

/**
 * 트리 노드 아이콘 정의.
 *
 * Tree node icon definition.
 *
 * ツリーノードのアイコン定義。
 *
 * 树节点图标定义。
 */
export interface TreeNodeIconDef {
  /**
   * 접힌 branch 노드 아이콘 (Bootstrap Icons 클래스, 기본: 'bi-folder2')
   *
   * Collapsed branch icon (Bootstrap Icons class, default 'bi-folder2')
   *
   * 折りたたまれた branch ノードのアイコン（Bootstrap Icons のクラス、既定: 'bi-folder2'）
   *
   * 折叠的 branch 节点图标（Bootstrap Icons 类名，默认：'bi-folder2'）
   */
  branch?: string;
  /**
   * 펼친 branch 노드 아이콘 (기본: 'bi-folder2-open')
   *
   * Expanded branch icon (default 'bi-folder2-open')
   *
   * 展開された branch ノードのアイコン（既定: 'bi-folder2-open'）
   *
   * 展开的 branch 节点图标（默认：'bi-folder2-open'）
   */
  branchOpen?: string;
  /**
   * 리프 노드 아이콘 (기본: 'bi-file-earmark')
   *
   * Leaf icon (default 'bi-file-earmark')
   *
   * リーフノードのアイコン（既定: 'bi-file-earmark'）
   *
   * 叶子节点图标（默认：'bi-file-earmark'）
   */
  leaf?: string;
}

type CSSProperties = Partial<Record<keyof CSSStyleDeclaration, string>>;

// ─── 정렬/필터 / sort & filter ────────────────────────────────────────────
/**
 * "이 컬럼을 이 방향으로 정렬" 한 건을 나타냅니다. 여러 개를 배열로 넘기면 앞에 있는 것이 1차 기준,
 * 그 값이 같을 때 다음 것이 2차 기준이 되는 다중 정렬이 됩니다(예: 부서 오름차순 → 급여 내림차순).
 *
 * One "sort this column this way" entry. Passed as an array, the first is the primary key and later
 * entries break ties — i.e. multi-column sort (e.g. dept asc, then salary desc).
 *
 * 「この列をこの方向でソート」の一件を表します。複数を配列で渡すと、前にあるものが第一基準、その値が
 * 同じときに次のものが第二基準となる、多重ソートになります（例: 部署の昇順 → 給与の降順）。
 *
 * 表示「按此方向排序该列」的一条设置。以数组传入多条时，靠前的为第一基准，其值相同时下一条作为
 * 第二基准，构成多重排序（例如部门升序 → 薪资降序）。
 */
export interface SortItem {
  /**
   * 정렬 기준 컬럼의 field.
   *
   * field of the column to sort by.
   *
   * ソートの基準となる列の field。
   *
   * 排序基准列的 field。
   */
  field: string;
  /**
   * 정렬 방향.
   *
   * Sort direction.
   *
   * ソート方向。
   *
   * 排序方向。
   */
  dir: SortDir;
}

/**
 * 필터 한 줄 = "연산자 + 비교값". 예: `{ operator: '>=', value: 1000 }` 는 값이 1000 이상인 행만 남깁니다.
 * 한 컬럼에 여러 조건을 배열로 걸 수 있습니다(모두 만족하는 행만 통과).
 *
 * One filter clause = "operator + value". e.g. `{ operator: '>=', value: 1000 }` keeps rows whose
 * value is at least 1000. Multiple clauses per column combine (a row must satisfy all).
 *
 * フィルター一行 = 「演算子 + 比較値」。例: `{ operator: '>=', value: 1000 }` は値が 1000 以上の行だけを残します。
 * 一つの列に複数の条件を配列で掛けられます（すべてを満たす行だけが通過）。
 *
 * 一条筛选 =「运算符 + 比较值」。例如 `{ operator: '>=', value: 1000 }` 只保留值不小于 1000 的行。
 * 一个列可以用数组挂多个条件（只有全部满足的行才通过）。
 */
export interface FilterItem {
  /**
   * 비교 방식. `'='`·`'!='`·`'>'`·`'>='`·`'<'`·`'<='` 는 값 비교, `'contains'`·`'startsWith'`·`'endsWith'`
   * 는 텍스트 부분 일치입니다.
   *
   * How to compare — the six symbols are value comparisons; the three word operators are text
   * substring matches.
   *
   * 比較の方式。`'='`·`'!='`·`'>'`·`'>='`·`'<'`·`'<='` は値の比較、`'contains'`·`'startsWith'`·`'endsWith'`
   * はテキストの部分一致です。
   *
   * 比较方式。`'='`·`'!='`·`'>'`·`'>='`·`'<'`·`'<='` 是值比较，`'contains'`·`'startsWith'`·`'endsWith'`
   * 是文本的部分匹配。
   */
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'startsWith' | 'endsWith';
  /**
   * 비교 기준 값.
   *
   * The value to compare against.
   *
   * 比較の基準となる値。
   *
   * 用于比较的基准值。
   */
  value: any;
}

// ─── 소계(Summary) / summary rows ────────────────────────────────────────
/**
 * 집계 연산자.
 *
 * Aggregate operator.
 *
 * 集計の演算子。
 *
 * 聚合运算符。
 */
export type SummaryOp = 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';

/**
 * 필드별 집계 정의.
 *
 * Per-field aggregate definition.
 *
 * フィールドごとの集計定義。
 *
 * 按字段的聚合定义。
 */
export interface SummaryFieldDef {
  field: string;
  op: SummaryOp;
  label?: string;
}

/**
 * 그룹마다 소계/합계 행을 자동으로 끼워 넣는 설정입니다. groupBy 로 묶은 각 그룹의 지정 필드를
 * 합·평균 등으로 집계해 그룹 위나 아래에 요약 행으로 보여 줍니다.
 *
 * Auto-inserts a subtotal/summary row per group. For each group made by groupBy it aggregates the
 * chosen fields (sum, average …) and shows the result as a summary row above or below the group.
 *
 * グループごとに小計/合計の行を自動で挿入する設定です。groupBy でまとめた各グループの指定フィールドを、
 * 合計・平均などで集計し、グループの上または下に要約行として見せます。
 *
 * 按分组自动插入小计/合计行的设置。对 groupBy 分出的每个组的指定字段做合计、平均等聚合，
 * 并作为汇总行显示在组的上方或下方。
 */
export interface SummaryOptions {
  /**
   * 집계할 컬럼들의 field 목록.
   *
   * field names of the columns to aggregate.
   *
   * 集計する列の field の一覧。
   *
   * 需要聚合的列的 field 列表。
   */
  fields: string[];
  /**
   * 어떤 집계를 적용할지(하나 또는 여러 개). 생략 시 기본 동작.
   *
   * Which aggregate(s) to apply (one or several).
   *
   * どの集計を適用するか（一つまたは複数）。省略時は既定の動作。
   *
   * 应用哪种聚合（一个或多个）。省略时按默认行为。
   */
  ops?: SummaryOp | SummaryOp[];
  /**
   * 요약 행을 그룹 위('top')에 둘지 아래('bottom')에 둘지.
   *
   * Put the summary row above ('top') or below ('bottom') the group.
   *
   * 要約行をグループの上（'top'）に置くか、下（'bottom'）に置くか。
   *
   * 汇总行放在组的上方（'top'）还是下方（'bottom'）。
   */
  position?: 'top' | 'bottom';
  /**
   * 한 그룹에 요약 행을 여러 줄 만들 때(예: 합계 줄 + 평균 줄). customFn 으로 직접 집계도 가능.
   *
   * Multiple summary rows per group (e.g. a sum row + an average row); customFn allows your own aggregation.
   *
   * 一つのグループに要約行を複数作るとき（例: 合計の行 + 平均の行）。customFn で自前の集計もできます。
   *
   * 在一个组内生成多行汇总时（例如合计行 + 平均行）。也可用 customFn 自行聚合。
   */
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
 *
 * Defines one cell of the pinned footer (bottom or top) — an always-visible totals row that stays
 * put while the body scrolls. Give `field`+`op` to aggregate a column, or `label` for fixed text.
 *
 * グリッドの一番下（または上）に固定するフッターのセル一つを定義します。スクロールに関係なく常に見えている
 * 合計の行を作るときに使います。`field`+`op` を渡すとその列を集計して表示し、`label` だけを渡すと固定の文言を表示します。
 *
 * 定义表格底部（或顶部）固定页脚的一个单元格。用于做一条与滚动无关、始终可见的合计行。
 * 传 `field`+`op` 会聚合该列并显示，只传 `label` 则显示固定文字。
 */
export interface FooterDef {
  /**
   * 집계할 컬럼의 field(집계 셀일 때).
   *
   * field of the column to aggregate (for an aggregate cell).
   *
   * 集計する列の field（集計セルのとき）。
   *
   * 需要聚合的列的 field（聚合单元格时）。
   */
  field?: string;
  /**
   * 어떤 집계를 낼지(SUM/AVG/…).
   *
   * Which aggregate to compute (SUM/AVG/…).
   *
   * どの集計を出すか（SUM/AVG/…）。
   *
   * 计算哪种聚合（SUM/AVG/…）。
   */
  op?: SummaryOp;
  /**
   * 집계 대신 그대로 보여줄 고정 문구(예: '합계').
   *
   * Fixed text shown instead of an aggregate (e.g. 'Total').
   *
   * 集計の代わりにそのまま見せる固定の文言（例: '합계'）。
   *
   * 代替聚合直接显示的固定文字（例如 '합계'）。
   */
  label?: string;
  /**
   * 숫자 포맷 문자열
   *  '#,##0'      → 천 단위 콤마, 정수
   *  '#,##0.00'   → 천 단위 콤마, 소수 2자리
   *  '0'          → 정수 (콤마 없음)
   *  '0.00'       → 소수 2자리 (콤마 없음)
   *  '2'          → 소수 2자리 (하위 호환)
   *
   * 数値のフォーマット文字列
   *  '#,##0'      → 桁区切りのコンマ、整数
   *  '#,##0.00'   → 桁区切りのコンマ、小数2桁
   *  '0'          → 整数（コンマなし）
   *  '0.00'       → 小数2桁（コンマなし）
   *  '2'          → 小数2桁（下位互換）
   *
   * 数字格式字符串
   *  '#,##0'      → 千位分隔符，整数
   *  '#,##0.00'   → 千位分隔符，小数 2 位
   *  '0'          → 整数（无千位分隔符）
   *  '0.00'       → 小数 2 位（无千位分隔符）
   *  '2'          → 小数 2 位（向后兼容）
   */
  format?: string;
  align?: 'left' | 'center' | 'right';
  /**
   * 이 셀이 오른쪽으로 몇 컬럼을 병합할지 (기본: 1)
   *
   * How many columns to span rightward (default 1)
   *
   * このセルが右方向へ何列を結合するか（既定: 1）
   *
   * 此单元格向右合并多少列（默认 1）
   */
  colspan?: number;
  renderer?: RendererType | RendererDef;
}

// ─── 인쇄 / print ────────────────────────────────────────────────
/**
 * 인쇄 옵션.
 *
 * Print options.
 *
 * 印刷オプション。
 *
 * 打印选项。
 */
export interface PrintOptions {
  title?: string;
  excludeFields?: string[];
  showFooter?: boolean;
}

// ─── 내보내기 / export ─────────────────────────────────────────────
/**
 * 내보내기 스타일 모드.
 *
 * Export style mode.
 *
 * エクスポートのスタイルモード。
 *
 * 导出样式模式。
 */
export type ExportStyleMode = 'theme' | 'none' | 'custom';

/**
 * 그리드 내용을 Excel·CSV·JSON 파일로 내보낼 때의 세부 설정입니다. 아무것도 안 주면 기본값으로 곧장
 * 내보내지고, 파일명·시트명·제외 컬럼·제목 행 등을 필요할 때만 얹습니다. 문자열 하나만 넘기면 파일명으로 해석됩니다.
 *
 * Settings for exporting the grid to Excel/CSV/JSON. With nothing set it exports with defaults;
 * add filename, sheet name, excluded columns, title rows, etc. only as needed. A lone string is
 * treated as the filename.
 *
 * グリッドの内容を Excel・CSV・JSON ファイルへエクスポートするときの細かい設定です。何も渡さなければ既定値で
 * そのままエクスポートされ、ファイル名・シート名・除外する列・タイトル行などを必要なときだけ加えます。
 * 文字列を一つだけ渡すと、ファイル名として解釈されます。
 *
 * 把表格内容导出为 Excel／CSV／JSON 文件时的细节设置。什么都不传就按默认值直接导出，只在需要时再加上
 * 文件名、工作表名、排除的列、标题行等。只传一个字符串时，视为文件名。
 */
export interface ExportOptions {
  /**
   * 저장될 파일 이름.
   *
   * The saved file's name.
   *
   * 保存されるファイルの名前。
   *
   * 保存的文件名。
   */
  filename?: string;
  /**
   * 엑셀 시트 탭 이름.
   *
   * Excel sheet tab name.
   *
   * Excel のシートタブの名前。
   *
   * Excel 工作表标签名。
   */
  sheetName?: string;
  /**
   * 머리글 행을 포함할지. 기본 true.
   *
   * Whether to include the header row. Default true.
   *
   * ヘッダー行を含めるか。既定 true。
   *
   * 是否包含表头行。默认 true。
   */
  includeHeader?: boolean;
  /**
   * 내보내기에서 뺄 컬럼들의 field.
   *
   * field names of columns to leave out.
   *
   * エクスポートから外す列の field。
   *
   * 导出时排除的列的 field。
   */
  exceptFields?: string[];
  /**
   * 데이터 위에 얹을 제목 행들(보고서 머리말 등).
   *
   * Extra title rows placed above the data (report headings, etc.).
   *
   * データの上に載せるタイトル行（レポートの前書きなど）。
   *
   * 置于数据上方的标题行（报表前言等）。
   */
  headers?: ExportHeaderRow[];
  /**
   * 데이터 아래에 붙일 행들(비고·서명란 등).
   *
   * Extra rows appended below the data (notes, sign-off …).
   *
   * データの下に付ける行（備考・署名欄など）。
   *
   * 附于数据下方的行（备注、签字栏等）。
   */
  footers?: ExportHeaderRow[];
  /**
   * 내보낸 파일에 그리드 테마 색을 입힐지 방식. 기본 'theme'(현재 테마 반영).
   *
   * How to style the exported file — default 'theme' (carry the current theme).
   *
   * エクスポートしたファイルにグリッドのテーマ色を付けるかの方式。既定 'theme'（現在のテーマを反映）。
   *
   * 导出文件的样式方式。默认 'theme'（沿用当前主题）。
   */
  styleMode?: ExportStyleMode;
  /**
   * true 면 마스킹된 컬럼을 가려진 상태 그대로 내보냅니다. 기본 false = 원본 값 내보냄.
   *
   * true exports masked columns still obscured. Default false = raw values.
   *
   * true ならマスキングされた列を、伏せられた状態のままエクスポートします。既定 false = 元の値をエクスポート。
   *
   * true 时按遮蔽状态导出被掩码的列。默认 false = 导出原始值。
   */
  maskOnExport?: boolean;
  /**
   * 내보내기 시작 직전에 부를 훅(로딩 표시 등).
   *
   * A hook called just before export starts (show a spinner …).
   *
   * エクスポートの開始直前に呼ぶフック（ローディング表示など）。
   *
   * 导出开始前调用的钩子（显示加载提示等）。
   */
  onBefore?: () => void | Promise<void>;
  /**
   * 내보내기 완료 후 부를 훅. 만들어진 파일 blob 을 받습니다.
   *
   * A hook called after export, receiving the produced file blob.
   *
   * エクスポート完了後に呼ぶフック。作られたファイルの blob を受け取ります。
   *
   * 导出完成后调用的钩子。接收生成的文件 blob。
   */
  onAfter?: (blob: Blob) => void;
}

/**
 * 내보내기 제목/푸터 행.
 *
 * Export title/footer row.
 *
 * エクスポートのタイトル/フッター行。
 *
 * 导出的标题/页脚行。
 */
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
 * 그리드 생성 옵션.
 *
 * Grid construction options.
 *
 * グリッドの生成オプション。
 *
 * 表格的生成选项。
 *
 * `new OpenGrid(container, options)` 의 두 번째 인자. `columns` 만 필수.
 *
 * Second argument of `new OpenGrid(container, options)`. Only `columns` is required.
 *
 * `new OpenGrid(container, options)` の第 2 引数。`columns` のみ必須。
 *
 * `new OpenGrid(container, options)` 的第二个参数。仅 `columns` 必填。
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据类型
 *
 * @example
 * const grid = new OpenGrid('#host', {
 *   columns: [{ field: 'name', header: '이름' }, { field: 'qty', header: '수량', type: 'number' }],
 *   height: 400,
 *   editable: true,
 * });
 */
export interface GridOptions<T = any> {
  /**
   * 컬럼 정의 배열(필수).
   *
   * Column definitions (required).
   *
   * 列定義の配列（必須）。
   *
   * 列定义数组（必填）。
   */
  columns: ColumnDef<T>[];

  // 레이아웃 / layout
  /**
   * 그리드의 세로 크기. 숫자면 px, 문자열이면 CSS 값('60vh' 등)입니다. 가상 스크롤이 제대로 돌려면
   * 확정된 높이가 필요하므로, 큰 데이터에서는 이 값(또는 조상 요소의 높이)을 꼭 주는 걸 권합니다.
   *
   * The grid's vertical size — a number is px, a string is a CSS value ('60vh' …). Virtual scroll
   * needs a definite height, so on large data set this (or an ancestor's height).
   *
   * グリッドの縦のサイズ。数値なら px、文字列なら CSS 値（'60vh' など）です。仮想スクロールがきちんと
   * 動くには確定した高さが必要なので、大きなデータではこの値（または祖先要素の高さ）を必ず指定する
   * ことをおすすめします。
   *
   * 表格的纵向尺寸。数字为 px，字符串为 CSS 值（'60vh' 等）。虚拟滚动需要确定的高度才能正常工作，
   * 因此数据量大时务必指定此值（或祖先元素的高度）。
   */
  height?: number | string;
  /**
   * 그리드의 가로 크기. 숫자면 px, 문자열이면 CSS 값. 생략 시 부모 폭을 채웁니다.
   *
   * The grid's horizontal size — number = px, string = CSS. Unset fills the parent width.
   *
   * グリッドの横のサイズ。数値なら px、文字列なら CSS 値。省略時は親の幅を埋めます。
   *
   * 表格的横向尺寸。数字为 px，字符串为 CSS 值。省略时填满父元素的宽度。
   */
  width?: number | string;
  /**
   * 데이터 행 한 줄의 세로 픽셀 높이. 촘촘하게 많이 보이려면 줄이고, 터치·가독성 위주면 키웁니다.
   * 가상 스크롤이 이 값으로 "화면에 몇 행이 들어갈지"를 계산합니다. 기본 32.
   *
   * Height in px of one data row. Lower it to pack more rows in; raise it for touch/readability.
   * Virtual scroll uses this to compute how many rows fit on screen. Default 32.
   *
   * データ行 1 行の縦のピクセル高さ。詰めて多く見せたいなら小さく、タッチ・可読性重視なら大きくします。
   * 仮想スクロールはこの値で「画面に何行入るか」を計算します。既定値は 32。
   *
   * 一行数据的纵向像素高度。想紧凑地多显示就调小，重视触摸和可读性就调大。
   * 虚拟滚动用这个值计算「屏幕能容纳多少行」。默认 32。
   */
  rowHeight?: number;
  /**
   * 머리글(헤더) 행의 높이(px). 여러 줄 헤더면 자동으로 늘어나므로 보통은 생략.
   *
   * Header row height (px). Grows automatically for multi-line headers, so usually omitted.
   *
   * 見出し（ヘッダー）行の高さ（px）。複数行ヘッダーなら自動で伸びるので、通常は省略。
   *
   * 表头行的高度（px）。多行表头会自动增高，通常省略。
   */
  headerHeight?: number;
  /**
   * 푸터(합계) 행의 높이(px).
   *
   * Footer (totals) row height (px).
   *
   * フッター（合計）行の高さ（px）。
   *
   * 页脚（合计）行的高度（px）。
   */
  footerHeight?: number;
  /**
   * 셀 내용이 길어 줄바꿈될 때 행 높이를 내용에 맞춰 자동으로 늘립니다. 컬럼의 wrap 과 함께 씁니다.
   *
   * Auto-grow a row's height to fit wrapped content. Use together with a column's wrap.
   *
   * セルの内容が長くて折り返されるとき、行の高さを内容に合わせて自動的に伸ばします。列の wrap と
   * 一緒に使います。
   *
   * 单元格内容过长而换行时，让行高随内容自动增高。与列的 wrap 配合使用。
   */
  autoHeight?: boolean;
  /**
   * 컬럼 폭의 합이 컨테이너를 꽉 채우도록 늘립니다. 오른쪽에 빈 공간을 남기고 싶지 않을 때.
   *
   * Stretch column widths so their sum fills the container — when you don't want empty space on the right.
   *
   * 列幅の合計がコンテナーいっぱいになるように伸ばします。右側に空きを残したくないときに。
   *
   * 拉伸列宽，使其总和填满容器。适用于不想在右侧留白的场景。
   */
  fillWidth?: boolean;
  /**
   * width 도 flex 도 안 준 컬럼에 적용할 기본 폭(px).
   *
   * Fallback width (px) for columns given neither width nor flex.
   *
   * width も flex も指定していない列に適用する既定の幅（px）。
   *
   * 对既未指定 width 也未指定 flex 的列所应用的默认宽度（px）。
   */
  defaultColumnWidth?: number;
  /**
   * 뷰포트 안전장치(옵트인, 기본 undefined = OFF = 기존 동작 완전 불변).
   *
   * 호스트가 그리드 컨테이너 조상 체인에 확정 높이(definite height)를 주지 않으면
   * 내부 스페이서(totalRows×rowHeight)가 컨테이너를 전체 콘텐츠 크기로 늘리고,
   * ResizeObserver 되먹임으로 windowing 이 무력화되어 전 행이 DOM 렌더되는 폭주가 발생한다
   * (대량 데이터일수록 재앙적). 이 값을 지정하면, 컨테이너가 전 콘텐츠를 다 담는 "언바운드"
   * 상태로 감지될 때에 한해 윈도잉 뷰포트 높이를 이 값(px)으로 클램프해 폭주를 차단한다.
   * 정상적으로 확정 높이가 있는 바운드 컨테이너에는 영향이 없다.
   * 1순위 권장은 컨테이너/그리드에 확정 height 를 주는 것이며, 이 옵션은 안전망이다.
   *
   * Viewport safety net (opt-in; default undefined = OFF = behavior fully unchanged).
   *
   * When the container ancestor chain has no definite height, the internal spacer
   * (totalRows×rowHeight) inflates the container and a ResizeObserver feedback loop defeats
   * windowing, DOM-rendering every row (catastrophic on large data). If set, and only when the
   * container is detected as "unbounded", the windowing viewport height is clamped to this px
   * value. Bounded containers are unaffected. Prefer giving the container a definite height;
   * this option is a safety net.
   *
   * ビューポートの安全装置（オプトイン、既定 undefined = OFF = 既存動作は完全に不変）。
   *
   * ホストがグリッドコンテナーの祖先チェーンに確定高さ（definite height）を与えないと、
   * 内部スペーサー（totalRows×rowHeight）がコンテナーを全コンテンツのサイズまで伸ばし、
   * ResizeObserver のフィードバックで windowing が無効化されて全行が DOM レンダリングされる暴走が
   * 発生する（大量データほど破滅的）。この値を指定すると、コンテナーが全コンテンツを収める
   * 「アンバウンド」状態として検出されたときに限り、ウィンドウイングのビューポート高さをこの値（px）に
   * クランプして暴走を遮断する。正常に確定高さがあるバウンドコンテナーには影響がない。
   * 第 1 に推奨するのはコンテナー／グリッドに確定 height を与えることであり、このオプションは安全網である。
   *
   * 视口安全装置（选择性启用，默认 undefined = OFF = 现有行为完全不变）。
   *
   * 宿主若未在表格容器的祖先链上给出确定高度（definite height），内部占位元素（totalRows×rowHeight）
   * 会把容器撑到全部内容的大小，ResizeObserver 的反馈又会令 windowing 失效，导致所有行都渲染进 DOM 的
   * 失控（数据量越大越是灾难）。指定此值后，仅当容器被检测为装下全部内容的「无界」状态时，才把 windowing
   * 的视口高度钳制到该值（px），以阻断失控。对正常具有确定高度的有界容器没有影响。
   * 首选做法是给容器／表格一个确定的 height，此选项只是安全网。
   */
  fallbackViewportHeight?: number;

  // 편집 / editing
  /**
   * 그리드 전체의 편집 스위치. 켜져 있고 컬럼의 editable 도 참일 때만 실제로 편집이 열립니다(둘 다 참 조건).
   *
   * The grid-wide edit switch. Editing opens only when this AND a column's editable are true.
   *
   * グリッド全体の編集スイッチ。オンで、かつ列の editable も真のときだけ実際に編集が開きます
   * （両方が真という条件）。
   *
   * 表格全局的编辑开关。只有该开关打开、且列的 editable 也为真时，编辑才真正开启（两者皆真的条件）。
   */
  editable?: boolean;
  /**
   * 편집을 어떻게 시작할지. 'click'=한 번 클릭, 'dblclick'=더블클릭, 'none'=마우스로는 진입 불가(API 로만).
   *
   * How editing starts — 'click' single click, 'dblclick' double click, 'none' no mouse entry (API only).
   *
   * 編集をどう開始するか。'click'=一度クリック、'dblclick'=ダブルクリック、'none'=マウスでは入れない
   * （API のみ）。
   *
   * 如何开始编辑。'click'=单击一次，'dblclick'=双击，'none'=无法用鼠标进入（仅 API）。
   */
  editMode?: 'click' | 'dblclick' | 'none';
  /**
   * (예약) 편집 실행취소 히스토리 — 아직 미구현.
   *
   * (Reserved) undo history for edits — not implemented yet.
   *
   * （予約）編集の取り消し履歴 — まだ未実装。
   *
   * （保留）编辑的撤销历史 — 尚未实现。
   */
  history?: boolean;
  /**
   * (예약) 히스토리에 담을 최대 단계 수 — 아직 미구현.
   *
   * (Reserved) max steps kept in history — not implemented yet.
   *
   * （予約）履歴に保持する最大ステップ数 — まだ未実装。
   *
   * （保留）历史中保留的最大步数 — 尚未实现。
   */
  historySize?: number;

  // 선택 / selection
  /**
   * 사용자가 무엇을 선택할 수 있는지. 'cells' 로 하면 스프레드시트식 범위 선택이 됩니다.
   *
   * What the user can select. 'cells' enables spreadsheet-style range selection.
   *
   * ユーザーが何を選択できるか。'cells' にするとスプレッドシート式の範囲選択になります。
   *
   * 用户能选择什么。设为 'cells' 即为电子表格式的区域选择。
   */
  selection?: SelectionMode;
  /**
   * Ctrl+C / Ctrl+V 로 셀 값을 복사·붙여넣기하게 할지.
   *
   * Whether Ctrl+C / Ctrl+V copy-paste of cell values is enabled.
   *
   * Ctrl+C / Ctrl+V でセルの値をコピー・貼り付けできるようにするか。
   *
   * 是否允许用 Ctrl+C / Ctrl+V 复制、粘贴单元格的值。
   */
  clipboard?: boolean;
  /**
   * 범위 선택 + 채우기 핸들(엑셀식 드래그 채우기) 세부 설정.
   *
   * Range selection + fill handle (Excel-style drag-fill) detailed options.
   *
   * 範囲選択＋フィルハンドル（Excel 式のドラッグ入力）の詳細設定。
   *
   * 区域选择 + 填充柄（Excel 式拖拽填充）的详细设置。
   */
  rangeSelection?: RangeSelectionOptions; // C5.1 단일 중첩
  /**
   * 셀 수식('=A1+B2' 같은 식) 기능 세부 설정.
   *
   * Cell-formula ('=A1+B2'-style) detailed options.
   *
   * セル数式（'=A1+B2' のような式）機能の詳細設定。
   *
   * 单元格公式（'=A1+B2' 这类算式）功能的详细设置。
   */
  formula?: FormulaOptions; // C5.1 단일 중첩
  /**
   * 마스터/디테일(행을 펼쳐 상세 패널 표시) 세부 설정.
   *
   * Master/detail (expand a row into a detail panel) detailed options.
   *
   * マスター／ディテール（行を展開して詳細パネルを表示）の詳細設定。
   *
   * 主从（展开行显示详情面板）的详细设置。
   */
  masterDetail?: MasterDetailOptions<T>; // C5.1 단일 중첩
  /**
   * 그리드 데이터를 그대로 쓰는 통합 차트 세부 설정.
   *
   * Detailed options for the chart integrated on the grid's own data.
   *
   * グリッドのデータをそのまま使う統合チャートの詳細設定。
   *
   * 直接使用表格数据的集成图表的详细设置。
   */
  chart?: import('./chart/types.js').ChartGlobalOptions; // C5.1 단일 중첩. 타입은 chart/types 순환-안전 type-only import.
  /**
   * 조건부 서식 규칙 목록(값에 따라 셀을 데이터바·색조·아이콘으로 강조). 지정하지 않으면 아무 것도 바뀌지 않습니다.
   *
   * Conditional-format rules — highlight cells by value with data-bars, color scales, or icon sets.
   * Unset changes nothing.
   *
   * 条件付き書式のルール一覧（値に応じてセルをデータバー・カラースケール・アイコンで強調）。
   * 指定しなければ何も変わりません。
   *
   * 条件格式规则列表（按值用数据条、色阶、图标强调单元格）。不指定则不改变任何内容。
   */
  conditionalFormat?: import('./cf/CFRule.js').CFRule[]; // DD-05: opt-in, 기본 undefined=byte-identical. 타입은 cf 순환-안전 type-only import.

  // 정렬/필터 / sort & filter
  /**
   * 머리글 클릭 정렬을 그리드 전체에서 켤지. 컬럼별 sortable 로 예외를 둘 수 있습니다.
   *
   * Turn header-click sorting on grid-wide. Per-column sortable can override.
   *
   * 見出しクリックでの並べ替えをグリッド全体で有効にするか。列ごとの sortable で例外を設けられます。
   *
   * 是否在表格全局启用点击表头排序。可用各列的 sortable 设置例外。
   */
  sortable?: boolean;
  /**
   * Shift+클릭으로 여러 컬럼을 겹쳐 정렬(2차·3차 기준)하게 할지.
   *
   * Whether Shift+click stacks multiple sort keys (secondary, tertiary …).
   *
   * Shift+クリックで複数の列を重ねて並べ替える（第 2・第 3 基準）ようにするか。
   *
   * 是否允许 Shift+单击叠加多列排序（第二、第三基准）。
   */
  multiSort?: boolean;
  /**
   * 필터 기능을 그리드 전체에서 켤지. 컬럼별 filterable 로 예외를 둘 수 있습니다.
   *
   * Turn filtering on grid-wide. Per-column filterable can override.
   *
   * フィルター機能をグリッド全体で有効にするか。列ごとの filterable で例外を設けられます。
   *
   * 是否在表格全局启用过滤功能。可用各列的 filterable 设置例外。
   */
  filterable?: boolean;
  /**
   * 처음 로드될 때 미리 적용해 둘 정렬 상태.
   *
   * The sort state to apply up front on first load.
   *
   * 最初に読み込まれるときにあらかじめ適用しておく並べ替えの状態。
   *
   * 首次加载时预先应用的排序状态。
   */
  defaultSort?: SortItem[];

  // 고정 / freezing
  /**
   * 왼쪽부터 몇 개 컬럼을 가로 스크롤과 무관하게 고정할지.
   *
   * How many leftmost columns stay pinned while scrolling horizontally.
   *
   * 左から何列を横スクロールと無関係に固定するか。
   *
   * 从左侧起固定多少列，使其不随横向滚动移动。
   */
  frozenColumns?: number;
  /**
   * (예약) 위쪽 고정 행 수 — 아직 미구현.
   *
   * (Reserved) number of top-frozen rows — not implemented yet.
   *
   * （予約）上部固定行の数 — まだ未実装。
   *
   * （保留）顶部固定行的数量 — 尚未实现。
   */
  frozenRows?: number;

  // 엑스트라 컬럼 / extra columns
  /**
   * 맨 왼쪽에 1,2,3… 행 번호 컬럼을 붙일지.
   *
   * Whether to add a leftmost 1,2,3… row-number column.
   *
   * 左端に 1,2,3… の行番号列を付けるか。
   *
   * 是否在最左侧添加 1,2,3… 的行号列。
   */
  rowNumber?: boolean;
  /**
   * 각 행이 추가/수정/삭제 중 어떤 상태인지 표시하는 컬럼을 붙일지(편집 추적용).
   *
   * Whether to add a column showing each row's added/edited/removed state (for change tracking).
   *
   * 各行が追加／修正／削除のどの状態かを表示する列を付けるか（編集追跡用）。
   *
   * 是否添加一列显示各行处于新增／修改／删除中的哪种状态（用于编辑追踪）。
   */
  stateColumn?: boolean;
  /**
   * 행 선택용 체크박스 컬럼을 붙일지.
   *
   * Whether to add a checkbox column for selecting rows.
   *
   * 行選択用のチェックボックス列を付けるか。
   *
   * 是否添加用于选择行的复选框列。
   */
  checkColumn?: boolean;
  /**
   * 행을 드래그해 순서를 바꾸게 할지.
   *
   * Whether rows can be dragged to reorder.
   *
   * 行をドラッグして順序を変えられるようにするか。
   *
   * 是否允许拖拽行来改变顺序。
   */
  draggable?: boolean;
  /**
   * 그리드↔그리드 행 드래그 이동 허용 (draggable:true 와 함께 사용, 양쪽 그리드 모두 true 여야 이동)
   *
   * Enable grid-to-grid row drag (use with draggable:true; both grids must be true)
   *
   * グリッド↔グリッドの行ドラッグ移動を許可（draggable:true と併用、両方のグリッドが true でないと移動しない）
   *
   * 允许表格↔表格的行拖拽移动（与 draggable:true 配合使用，两侧表格都为 true 才能移动）
   */
  crossGrid?: boolean;
  /**
   * 크로스그리드 이동 시 소스→타깃 행 변환 방식.
   *  - 'auto'(기본): 필드명 그대로 복사
   *  - 'interactive': 소스/타깃 스키마가 다르면 매핑 모달을 띄워 개발자가 매칭 + 변환 스크립트 출력
   *  - 함수: (srcRow) => targetRow 로 직접 변환 (모달 없이 baking)
   *
   * How source rows are transformed on cross-grid moves.
   *  - 'auto' (default): copy by matching field names
   *  - 'interactive': show a mapping modal when schemas differ, emitting a transform script
   *  - function: transform directly without the modal
   *
   * クロスグリッド移動時のソース→ターゲット行の変換方式。
   *  - 'auto'（既定）: フィールド名そのままコピー
   *  - 'interactive': ソース／ターゲットのスキーマが異なればマッピングモーダルを表示して開発者がマッチング＋変換スクリプトを出力
   *  - 関数: (srcRow) => targetRow で直接変換（モーダルなしで baking）
   *
   * 跨表格移动时源行→目标行的转换方式。
   *  - 'auto'（默认）: 按字段名原样复制
   *  - 'interactive': 源／目标结构不同时弹出映射对话框，由开发者匹配并输出转换脚本
   *  - 函数: 以 (srcRow) => targetRow 直接转换（不弹对话框，直接 baking）
   */
  crossGridMapping?: 'auto' | 'interactive' | ((srcRow: T) => Partial<T>);

  // 셀 병합 / cell merge
  /**
   * 셀 병합 기능 사용.
   *
   * Enable cell merging.
   *
   * セル結合機能を使用。
   *
   * 启用单元格合并功能。
   */
  mergeCells?: boolean;

  // 그룹핑 / grouping
  /**
   * 처음부터 이 필드들로 행을 묶어 보여 줄지. 여러 개면 다단계 그룹이 됩니다(예: 지역 → 부서).
   *
   * Which fields to group rows by from the start. Several means nested groups (e.g. region → dept).
   *
   * 最初からこれらのフィールドで行をまとめて見せるか。複数なら多段グループになります（例: 地域 → 部署）。
   *
   * 一开始就按这些字段把行分组显示。多个字段则形成多级分组（例: 地区 → 部门）。
   */
  groupBy?: string[];
  /**
   * 각 그룹에 소계/합계 요약 행을 붙이는 설정.
   *
   * Options for attaching subtotal/summary rows to each group.
   *
   * 各グループに小計／合計の要約行を付ける設定。
   *
   * 为各分组添加小计／合计汇总行的设置。
   */
  summary?: SummaryOptions;

  // 트리 / tree
  /**
   * 트리(계층) 데이터를 어떤 모양으로 받을지. 'auto'=각 행이 children 배열로 자식을 품은 중첩 구조,
   * 'flat'=모든 행이 한 줄이고 id/부모id 로 관계를 표현하는 평면 구조.
   *
   * How hierarchical data is shaped. 'auto' = each row nests its children in a children array;
   * 'flat' = every row is a flat entry linked by id / parent-id.
   *
   * ツリー（階層）データをどんな形で受け取るか。'auto'=各行が children 配列で子を抱える入れ子構造、
   * 'flat'=すべての行が 1 行で id／親 id により関係を表す平面構造。
   *
   * 以何种形态接收树（层级）数据。'auto'=每行用 children 数组容纳子级的嵌套结构，
   * 'flat'=所有行都是一条记录、以 id／父 id 表达关系的扁平结构。
   */
  treeMode?: 'auto' | 'flat';
  /**
   * flat 트리에서 각 행의 고유 id 가 담긴 필드 이름.
   *
   * In flat tree mode, the field holding each row's unique id.
   *
   * flat ツリーで、各行の固有 id が入っているフィールド名。
   *
   * flat 树中存放各行唯一 id 的字段名。
   */
  treeId?: string;
  /**
   * flat 트리에서 부모 행의 id 가 담긴 필드 이름.
   *
   * In flat tree mode, the field holding the parent row's id.
   *
   * flat ツリーで、親行の id が入っているフィールド名。
   *
   * flat 树中存放父行 id 的字段名。
   */
  treeParentId?: string;
  /**
   * 로드하자마자 모든 노드를 펼쳐 둘지.
   *
   * Whether to expand every node right after loading.
   *
   * 読み込んだ直後にすべてのノードを展開しておくか。
   *
   * 是否在加载后立即展开所有节点。
   */
  expandOnLoad?: boolean;

  // 페이징 / pagination
  /**
   * 아래쪽 페이지 이동 바를 띄울지.
   *
   * Whether to show the pagination bar at the bottom.
   *
   * 下部のページ移動バーを表示するか。
   *
   * 是否显示底部的分页栏。
   */
  pagination?: boolean;
  /**
   * 한 페이지에 몇 행을 보일지.
   *
   * How many rows show per page.
   *
   * 1 ページに何行を表示するか。
   *
   * 每页显示多少行。
   */
  pageSize?: number;

  // 푸터 / footer
  /**
   * 아래(또는 위) 고정 푸터에 넣을 셀 정의들(합계 줄 등).
   *
   * Cell definitions for the pinned footer (e.g. a totals row).
   *
   * 下（または上）の固定フッターに入れるセル定義（合計行など）。
   *
   * 放入底部（或顶部）固定页脚的单元格定义（合计行等）。
   */
  footer?: FooterDef[];
  /**
   * 푸터를 아래('bottom')에 둘지 위('top')에 둘지.
   *
   * Put the footer at the bottom ('bottom') or top ('top').
   *
   * フッターを下（'bottom'）に置くか上（'top'）に置くか。
   *
   * 把页脚放在下方（'bottom'）还是上方（'top'）。
   */
  footerPosition?: 'top' | 'bottom';

  /**
   * true 면 모든 셀에 마우스를 올렸을 때 그 값이 브라우저 기본 툴팁으로 뜹니다. 컬럼의 tooltip 설정이 있으면 그쪽이 우선.
   *
   * true shows every cell's value as a native browser tooltip on hover; a column's own tooltip wins.
   *
   * true にすると、すべてのセルにマウスを乗せたときその値がブラウザー標準のツールチップで表示されます。
   * 列の tooltip 設定があればそちらが優先。
   *
   * true 时，鼠标悬停在任意单元格上都会以浏览器原生提示显示该值。若列自身有 tooltip 设置，则以列的为准。
   */
  tooltips?: boolean;

  // 접근성 / accessibility
  /**
   * 그리드 컨테이너 aria-label.
   *
   * aria-label of the grid container.
   *
   * グリッドコンテナーの aria-label。
   *
   * 表格容器的 aria-label。
   */
  ariaLabel?: string;

  // 테마 (COLOR 축) / theme (COLOR axis)
  /**
   * 색 테마 id(data-og-theme).
   *
   * Color theme id (data-og-theme).
   *
   * 色テーマの id（data-og-theme）。
   *
   * 颜色主题 id（data-og-theme）。
   */
  theme?: string;
  /**
   * 스킨 (FORM 축, R12b) — data-og-skin. 미지정 시 'default'(오늘과 byte-identical).
   *
   * Skin (FORM axis, R12b) — data-og-skin. Default 'default' (byte-identical to stock look).
   *
   * スキン（FORM 軸、R12b） — data-og-skin。未指定時は 'default'（現状と byte-identical）。
   *
   * 皮肤（FORM 轴、R12b） — data-og-skin。未指定时为 'default'（与现状 byte-identical）。
   */
  skin?: string;
  /**
   * 행 간격(밀도) 이름. 촘촘·보통·여유처럼 행 높이와 여백을 통째로 바꿉니다. 지정하지 않으면 아무 것도 바뀌지 않습니다.
   *
   * The row-spacing (density) name — compact/normal/roomy row heights and paddings. Unset changes nothing.
   *
   * 行間隔（密度）の名前。詰め・普通・ゆとりのように行の高さと余白をまとめて変えます。
   * 指定しなければ何も変わりません。
   *
   * 行间距（密度）的名称。像紧凑、普通、宽松那样，把行高和内边距整体改变。不指定则不改变任何内容。
   */
  density?: string; // DENSITY 축 — data-og-density
  /**
   * 배경 질감(패턴) 이름. 셀 배경에 무늬만 입힙니다. 지정하지 않으면 아무 것도 바뀌지 않습니다.
   *
   * The background texture (pattern) name — paints a pattern on cell backgrounds. Unset changes nothing.
   *
   * 背景の質感（パターン）の名前。セルの背景に模様だけを付けます。指定しなければ何も変わりません。
   *
   * 背景质感（图案）的名称。只在单元格背景上加花纹。不指定则不改变任何内容。
   */
  texture?: string; // TEXTURE 축 — data-og-texture
  /**
   * 컨테이너에 주입할 CSS 변수 맵.
   *
   * CSS custom properties injected on the container.
   *
   * コンテナーに注入する CSS 変数のマップ。
   *
   * 注入到容器的 CSS 变量映射。
   */
  cssVars?: Record<string, string>;

  // i18n (다국어 UI 문자열) / i18n (multilingual UI strings)
  /**
   * UI 문자열 로케일 id. 미지정 시 전역 활성 로케일(기본 'ko') 상속 — 기존 사용자 무변화.
   *
   * UI-string locale id. Falls back to the global active locale ('ko') — existing users unaffected.
   *
   * UI 文字列のロケール id。未指定時はグローバルの有効ロケール（既定 'ko'）を継承 — 既存ユーザーに変化なし。
   *
   * UI 文本的区域设置 id。未指定时继承全局生效的区域设置（默认 'ko'） — 现有用户不受影响。
   *
   * @defaultValue 전역 활성 로케일('ko')
   *
   * the global active locale ('ko')
   *
   * グローバルの有効ロケール（'ko'）
   *
   * 全局生效的区域设置（'ko'）
   */
  locale?: string;
  /**
   * 이 인스턴스 한정 메시지 부분 오버라이드(2단 딥머지, 카탈로그 위). 개별 라벨 옵션 > messages > 카탈로그.
   *
   * Per-instance partial message override (2-level deep-merge over the catalog). Per-label option > messages > catalog.
   *
   * このインスタンス限定のメッセージ部分オーバーライド（2 段ディープマージ、カタログの上）。
   * 個別ラベルオプション > messages > カタログ。
   *
   * 仅限本实例的消息部分覆盖（两级深合并，叠加在目录之上）。单独标签选项 > messages > 目录。
   */
  messages?: PartialLocaleMessages;

  /**
   * 우클릭 컨텍스트 메뉴. true=기본 메뉴, false=끔, 배열=직접 정한 항목들.
   *
   * Right-click context menu — true = default menu, false = off, array = your own items.
   *
   * 右クリックのコンテキストメニュー。true=既定メニュー、false=オフ、配列=自分で決めた項目。
   *
   * 右键上下文菜单。true=默认菜单，false=关闭，数组=自行指定的项目。
   */
  contextMenu?: boolean | ContextMenuItem[];

  /**
   * 엑셀처럼 하단 탭으로 여러 시트를 전환하는 워크시트 정의들.
   *
   * Worksheet definitions — Excel-like bottom tabs switching between multiple sheets.
   *
   * Excel のように下部タブで複数シートを切り替えるワークシート定義。
   *
   * 像 Excel 那样用底部标签在多个工作表间切换的工作表定义。
   */
  worksheets?: WorksheetDef[];

  /**
   * 수식·집계 계산에 쓸 기본 소수점 정밀도. 기본 10.
   *
   * Default decimal precision for formulas/aggregation. Default 10.
   *
   * 数式・集計の計算に使う既定の小数点精度。既定値は 10。
   *
   * 公式、汇总计算所用的默认小数精度。默认 10。
   */
  calcPrecision?: number;

  /**
   * 머리글을 드래그해 컬럼 순서를 바꾸게 할지.
   *
   * Whether headers can be dragged to reorder columns.
   *
   * 見出しをドラッグして列の順序を変えられるようにするか。
   *
   * 是否允许拖拽表头来改变列的顺序。
   */
  columnReorder?: boolean;

  /**
   * override 로 감싼 함수에서 예외가 나면 어떻게 할지. 기본(true, strict)은 예외를 그대로 전파합니다.
   * false 로 하면 경고 후 원본 함수를 실행하는 완화(fallback) 동작을 허용합니다.
   *
   * What happens when an overridden layer throws. Default (true, strict) propagates the error;
   * false permits the softer fallback that warns then runs the original.
   *
   * override で包んだ関数で例外が出たときどうするか。既定（true、strict）は例外をそのまま伝播します。
   * false にすると、警告のうえ元の関数を実行する緩和（fallback）動作を許可します。
   *
   * 用 override 包裹的函数抛出异常时如何处理。默认（true、strict）原样向上传播异常。
   * 设为 false 则允许先告警再执行原函数的宽松（fallback）行为。
   */
  overrideStrict?: boolean;

  // 이벤트 / events
  /**
   * 첫 렌더 완료 콜백.
   *
   * Fired after the first render.
   *
   * 初回レンダリング完了のコールバック。
   *
   * 首次渲染完成的回调。
   */
  onReady?: (grid: OpenGridInstance<T>) => void;
  onCellClick?: (e: CellEvent<T>) => void;
  onCellDblClick?: (e: CellEvent<T>) => void;
  onEditStart?: (e: EditEvent<T>) => void;
  onEditEnd?: (e: EditEvent<T>) => void;
  onEditBefore?: (e: EditEvent<T>) => boolean;
  onRowClick?: (e: RowEvent<T>) => void;
  onSelectionChange?: (e: SelectionEvent<T>) => void;
  /**
   * 선택된 셀 범위가 바뀔 때마다 호출(차트가 이걸 실시간으로 구독하기도 함).
   *
   * Fired whenever the selected cell range changes (the chart can subscribe to it live).
   *
   * 選択されたセル範囲が変わるたびに呼び出し（チャートがこれをリアルタイムで購読することもある）。
   *
   * 每当选中的单元格区域变化时调用（图表也可能实时订阅它）。
   */
  onRangeChange?: (e: RangeChangeEvent) => void;
  /**
   * 채우기 핸들로 값 채우기가 확정된 뒤, 무엇이 어떻게 채워졌는지 결과를 전달.
   *
   * After a fill-handle fill commits, delivers what was filled and how.
   *
   * フィルハンドルでの値の入力が確定した後、何がどう入力されたかの結果を伝達。
   *
   * 填充柄填值确定后，传递填了什么、如何填的结果。
   */
  onRangeFill?: (e: RangeFillEvent) => void;
  /**
   * 선택 범위를 복사(Ctrl+C)했을 때 호출.
   *
   * Fired when the selected range is copied (Ctrl+C).
   *
   * 選択範囲をコピー（Ctrl+C）したときに呼び出し。
   *
   * 复制选中区域（Ctrl+C）时调用。
   */
  onRangeCopy?: (e: RangeCopyEvent) => void;
  /**
   * 행 상세 패널이 펼쳐질 때 호출.
   *
   * Fired when a row's detail panel expands.
   *
   * 行の詳細パネルが展開されるときに呼び出し。
   *
   * 行的详情面板展开时调用。
   */
  onRowExpand?: (e: RowExpandEvent<T>) => void;
  /**
   * 행 상세 패널이 접힐 때 호출.
   *
   * Fired when a row's detail panel collapses.
   *
   * 行の詳細パネルが折りたたまれるときに呼び出し。
   *
   * 行的详情面板折叠时调用。
   */
  onRowCollapse?: (e: RowExpandEvent<T>) => void;
  onSortChange?: (e: SortEvent) => void;
  onFilterChange?: (e: FilterEvent) => void;
  onScroll?: (e: ScrollEvent) => void;
  onDrop?: (e: DragDropEvent<T>) => void;
  onRowDrop?: (e: { fromIndex: number; toIndex: number }) => void;

  // 그리드↔그리드 행 이동 3단계 이벤트 / grid-to-grid move: three-phase events
  /**
   * 변경전 — 이동 직전. false 반환 시 이동 취소
   *
   * before phase — just before the move; return false to cancel
   *
   * 変更前 — 移動の直前。false を返すと移動をキャンセル
   *
   * 变更前 — 移动的紧前。返回 false 则取消移动
   */
  onGridDropBefore?: (e: GridDropEvent<T>) => boolean | void;
  /**
   * 변경후 — 양쪽 데이터 모델 이동 완료
   *
   * after phase — both data models updated
   *
   * 変更後 — 両側のデータモデルの移動が完了
   *
   * 变更后 — 两侧数据模型的移动已完成
   */
  onGridDropAfter?: (e: GridDropEvent<T>) => void;
  /**
   * 완료시 — 양쪽 재렌더까지 끝남
   *
   * complete phase — both grids re-rendered
   *
   * 完了時 — 両側の再レンダリングまで終了
   *
   * 完成时 — 两侧的重新渲染也已结束
   */
  onGridDropComplete?: (e: GridDropEvent<T>) => void;
  /**
   * interactive 매핑 모달에서 매핑 확정 시 — 생성된 매핑/스크립트 수신
   *
   * fired when the interactive mapping modal is confirmed — receives the mapping/script
   *
   * interactive マッピングモーダルでマッピングが確定したとき — 生成されたマッピング／スクリプトを受信
   *
   * 在 interactive 映射对话框中确定映射时 — 接收生成的映射／脚本
   */
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
/**
 * override 레이어 함수: 첫 인자는 안쪽(원본 근접) 함수. orig(...) 호출이 super 처럼 동작.
 *
 * Override layer function: the first argument is the inner (closer-to-original) function; calling orig(...) behaves like super.
 *
 * override レイヤー関数: 第 1 引数は内側（元の関数に近い）関数。orig(...) の呼び出しが super のように動作。
 *
 * override 层函数: 第一个参数是内层（更靠近原函数）的函数。调用 orig(...) 的行为如同 super。
 */
export type OverrideLayerFn = (orig: (...args: any[]) => any, ...args: any[]) => any;

/**
 * override 등록 옵션.
 *
 * Options for registering an override.
 *
 * override の登録オプション。
 *
 * override 的注册选项。
 */
export interface OverrideCallOptions {
  /**
   * 동일 메서드 재진입 허용(정당한 재귀). 기본 false.
   *
   * Allow re-entry into the same method (legit recursion). Default false.
   *
   * 同一メソッドへの再入を許可（正当な再帰）。既定値は false。
   *
   * 允许重入同一方法（正当的递归）。默认 false。
   */
  reentrant?: boolean;
  /**
   * 'fallback' → 레이어 예외 시 경고 후 원본 실행(멱등 가정, 롤백 불가). 미지정 시 strict.
   *
   * 'fallback' runs the original after warning on a layer exception (assumes idempotency, no rollback). Strict when unset.
   *
   * 'fallback' → レイヤー例外時に警告のうえ元の関数を実行（冪等性を仮定、ロールバック不可）。未指定時は strict。
   *
   * 'fallback' → 层抛出异常时先告警再执行原函数（假定幂等，无法回滚）。未指定时为 strict。
   */
  onError?: 'fallback';
}

// ─── Phase 2: strategy 슬롯 / Phase 2: strategy slots ───────────────────────────
/**
 * 등록 가능한 알고리즘 슬롯 이름.
 *
 * Registerable algorithm slot names.
 *
 * 登録できるアルゴリズムスロットの名前。
 *
 * 可注册的算法插槽名称。
 */
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
 *
 * The set of CSS-variable names a skin may adjust. Every one of these is about *form* (corner
 * radius, border width, elevation, spacing, texture …) and none are colors — color is owned by the
 * separate theme (COLOR) axis. Keeping the names disjoint guarantees a skin change never touches color.
 *
 * スキンが調節できる CSS 変数名の一覧です。ここに含まれるのはすべて「形」に関する値（角の丸み、
 * 枠線の太さ、影、余白、質感など）だけで、色は一つもありません。色は別のテーマ（COLOR）軸が担います。
 * このように名前自体を色と重ならないように分けておくことで、スキンを変えても色は影響を受けないことを
 * 保証します。
 *
 * 皮肤可以调节的 CSS 变量名清单。这里列出的全部是关于「形」的值（圆角、边框粗细、阴影、间距、质感等），
 * 没有一个是颜色 — 颜色由独立的主题（COLOR）轴负责。像这样把名称本身与颜色划分开，就保证了换皮肤绝不
 * 影响颜色。
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
 *
 * A skin's bundle of "form variable → value" overrides (partial — include only what you change).
 * It is form-only: putting a color literal (e.g. '#fff') in a value is rejected at registration,
 * because color belongs to the theme axis.
 *
 * スキン一つが変える「形の変数 → 値」の束です（変えたいものだけを選んで入れる部分指定）。形専用なので、
 * 値に色（例: '#fff'）を入れると登録時点で拒否されます — 色はテーマ軸の担当だからです。
 *
 * 一个皮肤所改变的「形的变量 → 值」的集合（部分指定 — 只挑要改的放进去）。它只管形，所以在值里放颜色
 * （例: '#fff'）会在注册时被拒绝 — 因为颜色归主题轴管。
 */
export type SkinTokenDelta = Partial<Record<SkinTokenName, string>>;

/**
 * 단일키 정렬 비교자. dir 부호는 호출자(DataLayer)가 적용 — 슬롯은 비교만 반환.
 *
 * Single-key sort comparator. The dir sign is applied by the caller (DataLayer) — the slot only compares.
 *
 * 単一キーの並べ替え比較子。dir の符号は呼び出し側（DataLayer）が適用 — スロットは比較のみを返す。
 *
 * 单键排序比较器。dir 的符号由调用方（DataLayer）应用 — 插槽只返回比较结果。
 */
export type SortComparatorFn = (a: any, b: any, field: string, dir: 'asc' | 'desc') => number;
/**
 * 필터 술어. true → 행 포함.
 *
 * Filter predicate. true includes the row.
 *
 * フィルター述語。true → 行を含める。
 *
 * 过滤谓词。true → 包含该行。
 */
export type FilterPredicateFn = (value: any, fi: FilterItem, field: string) => boolean;
/**
 * 표시값 포맷. getDisplayValue(인스턴스 안전) + 렌더러(formatNumber/formatDate) 공유.
 *
 * Display-value formatter. Shared by getDisplayValue (instance-safe) and renderers (formatNumber/formatDate).
 *
 * 表示値のフォーマット。getDisplayValue（インスタンス安全）＋レンダラー（formatNumber/formatDate）で共有。
 *
 * 显示值的格式化。由 getDisplayValue（实例安全）与渲染器（formatNumber/formatDate）共用。
 */
export type DisplayFormatterFn = (value: any, field: string, row: any) => string;
/**
 * export 셀 직렬화.
 *
 * Export cell serializer.
 *
 * export セルのシリアライズ。
 *
 * export 单元格的序列化。
 */
export type CellSerializerFn = (value: any, col: any, row: any) => any;
/**
 * 그룹 키 산출. remainingFields = 현재 깊이부터의 잔여 필드.
 *
 * Group key producer. remainingFields = remaining fields from the current depth.
 *
 * グループキーの算出。remainingFields = 現在の深さからの残りフィールド。
 *
 * 分组键的计算。remainingFields = 从当前深度起剩余的字段。
 */
export type GroupKeyFn = (row: any, remainingFields: string[]) => any;
/**
 * 집계 연산. null 반환 시 기본 SUM/AVG/COUNT/MAX/MIN 분기로 폴백.
 *
 * Aggregate operator. Returning null falls back to the built-in SUM/AVG/COUNT/MAX/MIN branch.
 *
 * 集計演算。null を返すと既定の SUM/AVG/COUNT/MAX/MIN 分岐にフォールバック。
 *
 * 汇总运算。返回 null 则回退到内置的 SUM/AVG/COUNT/MAX/MIN 分支。
 */
export type SummaryOpFn = (op: string, nums: any[], field: string) => number | null;
/**
 * 셀마다 CSS 클래스 이름을 붙여 주는 함수 슬롯. 값·행에 따라 셀에 추가할 className 을 돌려줍니다(null 이면 아무 것도 안 붙임).
 *
 * A slot that assigns a CSS class per cell — return the className to add based on value/row (null adds nothing).
 *
 * セルごとに CSS クラス名を付けてくれる関数スロット。値・行に応じてセルに追加する className を
 * 返します（null なら何も付けません）。
 *
 * 为每个单元格加上 CSS 类名的函数插槽。根据值、行返回要给单元格追加的 className（null 则什么都不加）。
 */
export type CellClassResolverFn = (value: any, field: string, row: any) => string | null;
/**
 * 셀의 스크린리더용 라벨(aria-label)을 바꿔 주는 함수 슬롯. 대체 라벨을 돌려줍니다(null 이면 기본값 유지).
 *
 * A slot that overrides a cell's screen-reader label (aria-label) — return a replacement (null keeps the default).
 *
 * セルのスクリーンリーダー用ラベル（aria-label）を変えてくれる関数スロット。代替ラベルを返します
 * （null なら既定値を維持）。
 *
 * 替换单元格屏幕阅读器标签（aria-label）的函数插槽。返回替代标签（null 则保持默认值）。
 */
export type AriaLabelResolverFn = (value: any, field: string, row: any) => string | null;
/**
 * 채우기 핸들의 "이어 채우기" 규칙을 직접 정의하는 함수 슬롯입니다(예: 날짜·요일·사용자 정의 수열).
 * ⚠️ 지금은 등록 통로만 열려 있고 실제 채우기에 연결되는 배선은 향후 버전에서 제공됩니다.
 *
 * A slot to define your own fill-series rule for the fill handle (dates, weekdays, custom sequences).
 * ⚠️ Only the registration path exists today; the wiring that actually consumes it ships in a later version.
 *
 * フィルハンドルの「連続入力」ルールを自分で定義する関数スロットです（例: 日付・曜日・ユーザー定義の数列）。
 * ⚠️ 今は登録の通路だけが開いており、実際の入力につながる配線は今後のバージョンで提供されます。
 *
 * 自行定义填充柄「序列填充」规则的函数插槽（例: 日期、星期、自定义数列）。
 * ⚠️ 目前只开放了注册通道，真正接入填充的连线将在后续版本提供。
 */
export type FillSeriesResolverFn = (sourceLine: any[], k: number, axisSign: 1 | -1) => any;

/**
 * 슬롯명 → 시그니처 매핑.
 *
 * Slot name → signature map.
 *
 * スロット名 → シグネチャのマッピング。
 *
 * 插槽名 → 签名的映射。
 */
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
 *
 * A slot that takes a skin name and returns that skin's form-variable bundle — plug in your own
 * skin-resolution rule in place of the built-ins (return null to fall back to the built-in catalog).
 *
 * スキン名を受け取って、そのスキンの形の変数の束を自分で作って返す関数スロットです。組み込みスキンの
 * 代わりに自分だけのスキン解釈ルールをまるごと差し込むときに使います（null を返すと組み込みスキンの
 * カタログをそのまま使用）。
 *
 * 接收皮肤名、自行生成并返回该皮肤的形变量集合的函数插槽。用于整体替换内置皮肤、插入自己的皮肤解析
 * 规则（返回 null 则照常使用内置皮肤目录）。
 */
export type SkinResolverFn = (skinId: string) => SkinTokenDelta | null;

/**
 * override 로 감싸는 것이 **공식적으로 보장되는** 확장점 이름들의 목록입니다. 이 이름들은 버전이 올라가도
 * 유지되며 IDE 자동완성에 뜹니다. 목록에 없는 임의 메서드 이름도 override("이름", fn) 문자열 방식으로 감쌀 수
 * 있지만(최선 노력), 그건 보장 밖입니다.
 *
 * The list of extension points whose override is **officially guaranteed** — these names survive
 * version bumps and show up in IDE autocomplete. Any other method name can still be wrapped via the
 * string form override("name", fn) on a best-effort basis, but without that guarantee.
 *
 * override で包むことが**公式に保証される**拡張点の名前の一覧です。これらの名前はバージョンが上がっても
 * 維持され、IDE の自動補完に出ます。一覧にない任意のメソッド名も override("名前", fn) の文字列方式で
 * 包めますが（ベストエフォート）、それは保証の外です。
 *
 * 用 override 包裹**受官方保证**的扩展点名称清单。这些名称在版本升级后依然保留，并出现在 IDE 自动补全中。
 * 不在清单里的任意方法名也能用 override("名称", fn) 的字符串方式包裹（尽力而为），但不在保证范围内。
 */
export interface OverridePoints<T = any> {
  /**
   * 셀에 실제로 보이는 텍스트를 계산하는 지점.
   *
   * Where a cell's visible display text is computed.
   *
   * セルに実際に見えるテキストを計算する地点。
   *
   * 计算单元格实际可见文本的位置。
   */
  getDisplayValue(rowIndex: number, field: string): string;
  /**
   * 셀의 원시 값을 읽는 지점.
   *
   * Where a cell's raw value is read.
   *
   * セルの生の値を読む地点。
   *
   * 读取单元格原始值的位置。
   */
  readCell(rowIndex: number, field: string): any;
}

/**
 * grid.override 의 두 얼굴입니다 — 그 자체를 함수처럼 불러 메서드를 감쌀 수도 있고(override(...)),
 * .strategy(...) 로 정렬·포맷 같은 알고리즘 슬롯을 갈아 끼울 수도 있습니다. 모든 호출은 체이닝을 위해
 * 그리드 인스턴스를 다시 돌려줍니다.
 *
 * The two faces of grid.override — call it like a function to wrap a method (override(...)), or use
 * .strategy(...) to swap an algorithm slot like sorting/formatting. Every call returns the grid
 * instance for chaining.
 *
 * grid.override の二つの顔です — それ自体を関数のように呼んでメソッドを包むこともでき（override(...)）、
 * .strategy(...) で並べ替え・フォーマットのようなアルゴリズムスロットを差し替えることもできます。
 * すべての呼び出しはチェーンのためにグリッドインスタンスを返します。
 *
 * grid.override 的两副面孔 — 既可以把它当函数调用来包裹方法（override(...)），也可以用 .strategy(...)
 * 替换排序、格式化这类算法插槽。所有调用都返回表格实例以便链式调用。
 */
export interface OverrideApi<T = any> {
  /**
   * 보장된 확장점 이름을 감싸는 타입드 오버로드(IDE 자동완성).
   *
   * Typed overload for the guaranteed extension-point names (IDE autocomplete).
   *
   * 保証された拡張点の名前を包む型付きオーバーロード（IDE 自動補完）。
   *
   * 包裹受保证的扩展点名称的类型化重载（IDE 自动补全）。
   */
  <K extends keyof OverridePoints<T>>(name: K, fn: OverrideLayerFn, opts?: OverrideCallOptions): OpenGridInstance<T>;
  /**
   * 임의 메서드를 본문 수정 없이 런타임에 감쌉니다(문자열 이름 방식). 체이닝을 위해 그리드를 반환.
   *
   * Wrap any method at runtime without touching its body (string-name form). Returns the grid for chaining.
   *
   * 任意のメソッドを本体の修正なしにランタイムで包みます（文字列名方式）。チェーンのためにグリッドを返す。
   *
   * 在运行时包裹任意方法，不改动其本体（字符串名方式）。返回表格以便链式调用。
   */
  (name: string, fn: OverrideLayerFn, opts?: OverrideCallOptions): OpenGridInstance<T>;
  /**
   * 알고리즘 슬롯 하나를 내 함수로 등록합니다. 체이닝을 위해 그리드를 반환.
   *
   * Register one algorithm slot with your function. Returns the grid for chaining.
   *
   * アルゴリズムスロット一つを自分の関数で登録します。チェーンのためにグリッドを返す。
   *
   * 用自己的函数注册一个算法插槽。返回表格以便链式调用。
   */
  strategy<K extends StrategySlot>(slot: K, fn: StrategyMap[K]): OpenGridInstance<T>;
  strategy(slot: string, fn: Function): OpenGridInstance<T>;
}

/**
 * `new OpenGrid(...)` 로 만든 그리드가 밖에 내어 주는 조작 창구(메서드 모음)입니다. 데이터 넣기·읽기,
 * 행·컬럼 편집, 정렬·필터, 선택, 내보내기, 테마 전환 등 그리드에게 시킬 수 있는 모든 일이 여기 모여 있습니다.
 * 각 메서드의 자세한 설명은 이 계약을 구현하는 OpenGrid 클래스 쪽에 있습니다.
 *
 * The set of methods a grid built with `new OpenGrid(...)` exposes — everything you can ask the
 * grid to do: load/read data, edit rows & columns, sort/filter, select, export, switch themes, and
 * more. Per-method detail lives on the OpenGrid class that implements this contract.
 *
 * `new OpenGrid(...)` で作ったグリッドが外に差し出す操作の窓口（メソッド群）です。データの投入・読み取り、
 * 行・列の編集、並べ替え・フィルター、選択、エクスポート、テーマ切り替えなど、グリッドに頼めるすべてのことが
 * ここに集まっています。各メソッドの詳しい説明は、この契約を実装する OpenGrid クラス側にあります。
 *
 * 用 `new OpenGrid(...)` 创建的表格对外提供的操作窗口（方法集合）。载入／读取数据、编辑行与列、
 * 排序／过滤、选择、导出、切换主题等一切能让表格做的事都汇集在这里。各方法的详细说明在实现本契约的
 * OpenGrid 类那一侧。
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据类型
 */
export interface OpenGridInstance<T = any> {
  // ── grid.override() 확장 ──────────────────────────────
  /**
   * 공개 메서드를 런타임에 감싸 동작을 바꾸거나(.override), 정렬·포맷 같은 알고리즘 슬롯을 갈아 끼웁니다(.strategy).
   *
   * Wrap a public method at runtime to change its behavior (.override), or swap an algorithm slot like sorting/formatting (.strategy).
   *
   * 公開メソッドをランタイムで包んで動作を変えたり（.override）、並べ替え・フォーマットのような
   * アルゴリズムスロットを差し替えたりします（.strategy）。
   *
   * 在运行时包裹公开方法以改变其行为（.override），或替换排序、格式化这类算法插槽（.strategy）。
   */
  override: OverrideApi<T>;
  /**
   * 이름을 지정한 메서드 하나를 원래 동작으로 되돌립니다.
   *
   * Restore one named method to its original behavior.
   *
   * 名前を指定したメソッド一つを元の動作に戻します。
   *
   * 把指定名称的一个方法恢复为原本的行为。
   */
  restore(name: string): OpenGridInstance<T>;
  /**
   * 걸어 둔 모든 override 와 strategy 를 한 번에 되돌립니다(그리드 파기 시 자동 호출).
   *
   * Undo all overrides and strategies at once (called automatically on destroy).
   *
   * 掛けておいたすべての override と strategy を一度に戻します（グリッド破棄時に自動で呼び出し）。
   *
   * 一次性还原所有已挂上的 override 与 strategy（表格销毁时自动调用）。
   */
  restoreAll(): OpenGridInstance<T>;
  /**
   * 그 메서드가 지금 override 로 감싸져 있는지 확인합니다.
   *
   * Check whether that method is currently overridden.
   *
   * そのメソッドが今 override で包まれているかを確認します。
   *
   * 确认该方法当前是否被 override 包裹。
   */
  hasOverride(name: string): boolean;
  /**
   * override 로 감싼 메서드 이름들의 목록을 돌려줍니다.
   *
   * Return the list of overridden method names.
   *
   * override で包んだメソッド名の一覧を返します。
   *
   * 返回被 override 包裹的方法名列表。
   */
  getOverrideNames(): string[];
  /**
   * 등록된 알고리즘 슬롯 함수를 가져옵니다(없으면 넘긴 fallback 을 그대로 반환).
   *
   * Fetch a registered algorithm-slot function (returns the given fallback if none).
   *
   * 登録されたアルゴリズムスロット関数を取得します（なければ渡した fallback をそのまま返します）。
   *
   * 取得已注册的算法插槽函数（没有则原样返回传入的 fallback）。
   */
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
   *
   * Set conditional-format rules — highlight cells by value with data-bars, color scales (heatmaps),
   * or icon sets. It precomputes the rule-bearing columns' stats (min/max …) and re-renders. Pass an
   * empty array to clear all conditional formatting.
   *
   * 条件付き書式のルールを指定します — 値に応じてセルにデータバー・カラースケール（ヒートマップ）・
   * アイコンセットを付けて強調します。ルールが掛かった列の統計（最小・最大など）をあらかじめ計算しておき、
   * 再描画します。空の配列を渡すと条件付き書式をすべて解除します。
   *
   * 指定条件格式规则 — 按值给单元格加上数据条、色阶（热力图）或图标集以示强调。它会预先算好带规则的列的
   * 统计（最小、最大等）并重新渲染。传入空数组即清除全部条件格式。
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
  /**
   * 화면에 보이는 행 순서와 실제 데이터를 이어 주는 내부 모델을 돌려줍니다(고급 배선용).
   *
   * Return the internal model mapping on-screen row order to actual data (for advanced wiring).
   *
   * 画面に見える行の順序と実際のデータをつないでくれる内部モデルを返します（高度な配線用）。
   *
   * 返回把屏幕上可见的行顺序与实际数据连接起来的内部模型（供高级接线使用）。
   */
  getFlatRowModel(): import('./FlatRowModel.js').FlatRowModel; // C0.3/C2.1
  /**
   * 여러 셀을 한꺼번에 쓸 때, 이 호출 이후의 writeCell 들이 즉시 다시 그리지 않도록 렌더를 잠시 미룹니다.
   *
   * Start a batch — subsequent writeCell calls defer their render/change events instead of firing each time.
   *
   * 複数のセルをまとめて書くとき、この呼び出し以降の writeCell が即座に再描画しないようにレンダリングを
   * しばらく先送りします。
   *
   * 批量写入多个单元格时，让此调用之后的各次 writeCell 不立即重绘，而是暂缓渲染。
   */
  beginBatch(): void;
  /**
   * 배치를 끝내고, 그 사이 변경이 있었으면 단 한 번만 다시 그리고 변경 이벤트도 한 번만 냅니다.
   *
   * End the batch — if anything changed, render once and emit one coalesced change event.
   *
   * バッチを終えて、その間に変更があれば一度だけ再描画し、変更イベントも一度だけ出します。
   *
   * 结束批处理；期间若有变更，只重绘一次，变更事件也只发出一次。
   */
  endBatch(): void;
  /**
   * 여러 셀 쓰기를 한 번에 처리하는 간편 래퍼(beginBatch → 반복 쓰기 → endBatch). rowIndex 는 화면
   * 표시 순서이며, 그룹·트리·상세 같은 실제 데이터가 아닌 가상 행은 안전하게 건너뜁니다. 반환값은 건너뛴 셀 수입니다.
   *
   * A convenience wrapper that writes many cells at once (beginBatch → loop → endBatch). rowIndex is
   * screen-order; non-data pseudo-rows (group/tree/detail) are safely skipped. Returns how many were skipped.
   *
   * 複数のセル書き込みを一度に処理する簡便ラッパー（beginBatch → 繰り返し書き込み → endBatch）。
   * rowIndex は画面の表示順であり、グループ・ツリー・詳細のような実データではない仮想行は安全に
   * スキップします。戻り値はスキップしたセル数です。
   *
   * 一次处理多个单元格写入的简便包装（beginBatch → 循环写入 → endBatch）。rowIndex 为屏幕显示顺序，
   * 分组、树、详情这类并非实际数据的虚拟行会被安全跳过。返回值是被跳过的单元格数。
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
  /**
   * 현재 선택된 셀 범위들(없으면 빈 배열). 지금은 한 번에 하나까지 담깁니다.
   *
   * Currently selected cell ranges (empty if none). At most one for now.
   *
   * 現在選択されているセル範囲（なければ空の配列）。今は一度に一つまで入ります。
   *
   * 当前选中的单元格区域（没有则为空数组）。目前一次最多容纳一个。
   */
  getRangeSelection(): CellRange[]; // C4
  /**
   * 지금 활성인 범위 하나(없으면 null). 차트가 이 값을 읽어 씁니다.
   *
   * The single active range (null if none). The chart reads this.
   *
   * 今アクティブな範囲一つ（なければ null）。チャートがこの値を読んで使います。
   *
   * 当前活动的那一个区域（没有则为 null）。图表会读取此值使用。
   */
  getActiveRange(): CellRange | null; // C4
  /**
   * 셀 범위를 프로그램에서 직접 선택합니다.
   *
   * Select a cell range programmatically.
   *
   * セル範囲をプログラムから直接選択します。
   *
   * 由程序直接选择单元格区域。
   */
  setRangeSelection(range: CellRange | CellRange[]): void;
  /**
   * 현재 범위 선택을 모두 해제합니다.
   *
   * Clear the current range selection.
   *
   * 現在の範囲選択をすべて解除します。
   *
   * 清除当前全部区域选择。
   */
  clearRangeSelection(): void;
  /**
   * 현재 활성 범위 안 셀 값들을 행×열 2차원 배열로 돌려줍니다(차트가 소비).
   *
   * Return the active range's cell values as a 2-D (rows×cols) array (consumed by the chart).
   *
   * 現在アクティブな範囲内のセルの値を行×列の 2 次元配列で返します（チャートが消費）。
   *
   * 把当前活动区域内的单元格值以行×列的二维数组返回（供图表消费）。
   */
  getRangeValues(): any[][]; // FR-6
  /**
   * 현재 활성 범위의 숫자 셀 통계(합·평균·최소·최대 등, 고정밀 계산). 숫자가 없으면 null.
   *
   * High-precision stats (sum/avg/min/max …) over the active range's numeric cells; null if none.
   *
   * 現在アクティブな範囲の数値セルの統計（合計・平均・最小・最大など、高精度計算）。数値がなければ null。
   *
   * 当前活动区域内数值单元格的统计（合计、平均、最小、最大等，高精度计算）。没有数值则为 null。
   */
  getRangeStats(): _RangeStats | null; // FR-6
  /**
   * 원본 범위의 값을 대상 범위로 채웁니다. 'copy'=그대로 복사, 'series'=규칙 감지해 이어 채우기.
   *
   * Fill the target range from the source — 'copy' duplicates, 'series' detects a pattern and extends.
   *
   * 元の範囲の値を対象の範囲に入力します。'copy'=そのままコピー、'series'=規則を検知して連続入力。
   *
   * 把源区域的值填入目标区域。'copy'=原样复制，'series'=识别规律后序列填充。
   */
  fillRange(source: CellRange, target: CellRange, mode?: 'copy' | 'series'): void; // C2, 배치 경유

  // ── 통합 차트 / integrated chart ────────────
  /**
   * 그리드 데이터로 차트를 만들어 인스턴스를 돌려줍니다.
   *
   * Create a chart from grid data and return its instance.
   *
   * グリッドのデータでチャートを作ってインスタンスを返します。
   *
   * 用表格数据创建图表并返回其实例。
   */
  createChart(config: import('./chart/types.js').ChartConfig): import('./chart/types.js').ChartInstance;
  /**
   * 이 그리드에 붙어 있는 차트 인스턴스들.
   *
   * The chart instances attached to this grid.
   *
   * このグリッドに付いているチャートインスタンス。
   *
   * 附着在此表格上的图表实例。
   */
  getCharts(): import('./chart/types.js').ChartInstance[];
  /**
   * 이 그리드의 차트를 모두 정리(해제)합니다.
   *
   * Dispose all charts on this grid.
   *
   * このグリッドのチャートをすべて片付け（解放）します。
   *
   * 清理（释放）此表格的所有图表。
   */
  destroyCharts(): void;

  // ── 셀 수식 / cell formulas ────────────────────
  /**
   * 셀에 수식을 넣습니다(예: "=A1+B2"). rowIndex 는 화면 순서로 주면 내부에서 안정적 참조로 바꿉니다.
   *
   * Set a cell's formula (e.g. "=A1+B2"). Pass rowIndex in screen order; it's normalized to a stable ref inside.
   *
   * セルに数式を入れます（例: "=A1+B2"）。rowIndex は画面の順序で渡せば内部で安定した参照に変えます。
   *
   * 给单元格设置公式（例: "=A1+B2"）。rowIndex 按屏幕顺序传入即可，内部会转换为稳定引用。
   */
  setCellFormula(rowIndex: number, field: string, formula: string): void; // C0: flat→stable rowId
  /**
   * 그 셀의 수식 원문(없으면 null).
   *
   * The cell's formula text (null if none).
   *
   * そのセルの数式の原文（なければ null）。
   *
   * 该单元格的公式原文（没有则为 null）。
   */
  getCellFormula(rowIndex: number, field: string): string | null;
  /**
   * 그 셀에 수식이 들어 있는지.
   *
   * Whether that cell holds a formula.
   *
   * そのセルに数式が入っているか。
   *
   * 该单元格中是否含有公式。
   */
  hasCellFormula(rowIndex: number, field: string): boolean;
  /**
   * 셀의 수식만 지웁니다(마지막 계산 값은 남습니다).
   *
   * Remove the cell's formula (keeps the last computed value).
   *
   * セルの数式だけを消します（最後に計算した値は残ります）。
   *
   * 只清除单元格的公式（最后一次计算的值保留）。
   */
  clearCellFormula(rowIndex: number, field: string): void;
  /**
   * 그 셀의 수식 오류 코드(오류가 없으면 null).
   *
   * The cell's formula error code (null if none).
   *
   * そのセルの数式エラーコード（エラーがなければ null）。
   *
   * 该单元格的公式错误码（没有错误时为 null）。
   */
  getCellError(rowIndex: number, field: string): FormulaErrorCode | null;
  /**
   * 디버깅용 — 이 셀을 참조하는(이 셀이 바뀌면 다시 계산되는) 셀들.
   *
   * Debug — cells that reference this one (recomputed when it changes).
   *
   * デバッグ用 — このセルを参照する（このセルが変わると再計算される）セル。
   *
   * 调试用 — 引用该单元格的（该单元格变化时会重算的）单元格。
   */
  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }>;
  /**
   * 디버깅용 — 이 셀의 수식이 참조하는(이 셀보다 먼저 계산돼야 하는) 셀들.
   *
   * Debug — cells this one's formula references (computed before it).
   *
   * デバッグ用 — このセルの数式が参照する（このセルより先に計算されなければならない）セル。
   *
   * 调试用 — 该单元格的公式所引用的（必须先于该单元格计算的）单元格。
   */
  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }>;
  /**
   * 모든 수식을 처음부터 다시 계산합니다(데이터 교체·컬럼 변경 후 등).
   *
   * Recompute every formula from scratch (after replacing data, changing columns, …).
   *
   * すべての数式を最初から計算し直します（データの入れ替え・列の変更の後など）。
   *
   * 从头重算所有公式（替换数据、变更列之后等）。
   */
  recalculate(): void;
  /**
   * 이 셀과, 이 셀에 딸린(종속) 셀들만 다시 계산합니다.
   *
   * Recompute only this cell and the cells depending on it.
   *
   * このセルと、このセルにぶら下がる（従属）セルだけを計算し直します。
   *
   * 只重算该单元格和依赖它的单元格。
   */
  recalculateCell(rowIndex: number, field: string): void;
  /**
   * 채우기 기능 전용 — 어떤 셀의 수식을 dRow/dCol 만큼 이동한 자리에 맞게 참조를 옮긴 새 수식 원문을 돌려줍니다.
   *
   * Fill-only — return a copy of a cell's formula with its relative refs shifted by dRow/dCol.
   *
   * 入力機能専用 — あるセルの数式を dRow/dCol だけ移動した位置に合わせて参照を移した新しい数式の原文を
   * 返します。
   *
   * 填充功能专用 — 返回某单元格公式的新原文，其中的引用按 dRow/dCol 移动后的位置作相应偏移。
   */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string; // C3

  // ── 마스터/디테일 / master-detail ──────────────────
  /**
   * 행을 펼쳐 상세 패널을 엽니다. rowRef 는 화면 순서 인덱스 또는 안정적 id. 허용 겹수를 넘으면 거부됩니다.
   *
   * Expand a row's detail panel. rowRef is a screen-order index or a stable id; rejected past the nesting limit.
   *
   * 行を展開して詳細パネルを開きます。rowRef は画面順のインデックスまたは安定した id。許容する
   * 重なりの数を超えると拒否されます。
   *
   * 展开行以打开详情面板。rowRef 是画面顺序的索引或稳定 id。超过允许的嵌套层数会被拒绝。
   */
  expandRow(rowRef: number | { id: string }): void; // C0.2, FR-10
  /**
   * 열려 있는 상세 패널을 접습니다.
   *
   * Collapse an open detail panel.
   *
   * 開いている詳細パネルを折りたたみます。
   *
   * 折叠已打开的详情面板。
   */
  collapseRow(rowRef: number | { id: string }): void;
  /**
   * 상세 패널을 펼쳐져 있으면 접고, 접혀 있으면 폅니다.
   *
   * Toggle a detail panel open/closed.
   *
   * 詳細パネルを、開いていれば折りたたみ、折りたたまれていれば開きます。
   *
   * 详情面板已展开则折叠，已折叠则展开。
   */
  toggleRow(rowRef: number | { id: string }): void;
  /**
   * 그 행의 상세 패널이 지금 펼쳐져 있는지.
   *
   * Whether that row's detail panel is currently expanded.
   *
   * その行の詳細パネルが今展開されているか。
   *
   * 该行的详情面板当前是否展开。
   */
  isRowExpanded(rowRef: number | { id: string }): boolean;
  /**
   * 열려 있는 모든 상세 패널을 한 번에 접습니다.
   *
   * Collapse every open detail panel at once.
   *
   * 開いているすべての詳細パネルを一度に折りたたみます。
   *
   * 一次折叠所有已打开的详情面板。
   */
  collapseAllDetails(): void;
  /**
   * 그 행의 상세 패널 내용물(직접 그린 결과 또는 자동 생성된 자식 그리드). 한 번도 펼치지 않았으면 undefined.
   *
   * The row's detail content (your rendered result or the auto-created child grid); undefined if never expanded.
   *
   * その行の詳細パネルの中身（自分で描画した結果、または自動生成された子グリッド）。一度も展開して
   * いなければ undefined。
   *
   * 该行详情面板的内容（自行绘制的结果，或自动生成的子表格）。从未展开过时为 undefined。
   */
  getDetailInstance<D = any>(rowRef: number | { id: string }): D | undefined;
  /**
   * 컬럼·컨테이너 크기를 바꾼 뒤 열린 패널의 폭을 다시 맞춥니다(보통은 재렌더가 알아서 처리).
   *
   * Re-sync open panel widths after a column/container resize (usually the re-render handles it).
   *
   * 列・コンテナーのサイズを変えた後、開いているパネルの幅を合わせ直します（通常は再レンダリングが
   * 自動で処理）。
   *
   * 改变列或容器尺寸后，重新对齐已打开面板的宽度（通常重新渲染会自动处理）。
   */
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
  /**
   * 지정한 행들을 다른 그리드로 옮깁니다(드래그·셔틀과 같은 경로). 옮기는 전·후·완료 3단계 이벤트가 나고 필드 매핑 규칙이 적용됩니다.
   *
   * Move the given rows into another grid (same path as drag/shuttle). Fires the three-phase events and applies the field-mapping rule.
   *
   * 指定した行を別のグリッドに移します（ドラッグ・シャトルと同じ経路）。移す前・後・完了の 3 段階の
   * イベントが出て、フィールドマッピングのルールが適用されます。
   *
   * 把指定的行移到另一个表格（与拖动、穿梭同一路径）。会触发移动前、移动后、完成三个阶段的事件，
   * 并应用字段映射规则。
   */
  moveRowsTo(target: OpenGridInstance<T>, sourceIndexes: number[], targetIndex?: number): Promise<boolean>;
  /**
   * 체크박스로 고른 행들을 다른 그리드로 옮깁니다(화살표 셔틀 버튼용).
   *
   * Move the checkbox-selected rows into another grid (for the arrow-shuttle buttons).
   *
   * チェックボックスで選んだ行を別のグリッドに移します（矢印シャトルボタン用）。
   *
   * 把用复选框选中的行移到另一个表格（用于箭头穿梭按钮）。
   */
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
  /**
   * 스킨(형태 축)을 바꿉니다 — 모서리·테두리·여백 같은 "생김새"만 갈아 끼우고, 색 테마는 그대로 둡니다.
   *
   * Switch the skin (form axis) — swaps the "shape" (corners, borders, spacing …) only, leaving the color theme untouched.
   *
   * スキン（形の軸）を変えます — 角・枠線・余白のような「見た目」だけを差し替え、色テーマはそのままに
   * します。
   *
   * 更换皮肤（形态轴）— 只替换圆角、边框、间距这类「外形」，色彩主题保持不变。
   */
  setSkin(skin: string): void;
  /**
   * 지금 적용된 스킨 id('default' = 기본 생김새).
   *
   * The currently applied skin id ('default' = stock look).
   *
   * 今適用されているスキンの id（'default' = 既定の見た目）。
   *
   * 当前应用的皮肤 id（'default' = 默认外形）。
   */
  getSkin(): string;
  /**
   * 형태 축의 CSS 변수 하나만 즉석에서 바꿉니다(setThemeVar 의 형태 버전). 색 값을 넣으면 거부됩니다.
   *
   * Override a single form-axis CSS variable at runtime (the form-axis sibling of setThemeVar). Color values are rejected.
   *
   * 形の軸の CSS 変数一つだけをその場で変えます（setThemeVar の形バージョン）。色の値を入れると
   * 拒否されます。
   *
   * 即时更改形态轴的单个 CSS 变量（setThemeVar 的形态版本）。传入色彩值会被拒绝。
   */
  setSkinVar(varName: string, value: string): void;
  /**
   * 밀도(행 간격)를 바꿉니다 — 촘촘/보통/여유처럼 행 높이와 여백을 통째로 조절합니다. 색·스킨과 따로 노는 별개 축이며, 없는 이름을 줘도 오류를 내지 않습니다.
   *
   * Switch the density (row spacing) — compact/normal/roomy row heights and paddings. An independent axis from color/skin; never throws on an unknown name.
   *
   * 密度（行間隔）を変えます — 詰め／普通／ゆとりのように行の高さと余白をまとめて調節します。
   * 色・スキンとは別に動く独立した軸であり、ない名前を渡してもエラーになりません。
   *
   * 更改密度（行间距）— 像紧凑／普通／宽松那样，整体调节行高和留白。它是与色彩、皮肤各自独立的轴，
   * 传入不存在的名称也不会报错。
   */
  setDensity(name: string): void;
  /**
   * 질감(배경 패턴)을 바꿉니다 — 배경 페인트만 입히고 크기 재계산은 하지 않습니다. 없는 이름을 줘도 오류를 내지 않습니다.
   *
   * Switch the texture (background pattern) — paints the background only, no relayout. Never throws on an unknown name.
   *
   * 質感（背景パターン）を変えます — 背景のペイントだけを付け、サイズの再計算はしません。
   * ない名前を渡してもエラーになりません。
   *
   * 更改质感（背景图案）— 只上背景漆，不重算尺寸。传入不存在的名称也不会报错。
   */
  setTexture(name: string): void;

  // i18n: 로케일 전환·조회·메시지 오버라이드·해석 / i18n: locale switch/read/override/resolve
  /**
   * UI 문구의 언어(로케일)를 바꾸고 화면을 다시 그립니다. 등록되지 않은 로케일을 줘도 오류를 내지 않습니다.
   *
   * Switch the UI language (locale) and re-render. Never throws on an unregistered locale.
   *
   * UI 文言の言語（ロケール）を変えて画面を再描画します。登録されていないロケールを渡しても
   * エラーになりません。
   *
   * 更改 UI 文字的语言（区域），并重绘画面。传入未注册的区域也不会报错。
   */
  setLocale(locale: string): void;
  /**
   * 이 그리드에 지금 적용된 로케일 id.
   *
   * The locale id currently applied to this grid.
   *
   * このグリッドに今適用されているロケールの id。
   *
   * 该表格当前应用的区域 id。
   */
  getLocale(): string;
  /**
   * 이 그리드에서만 특정 문구 하나를 다른 말로 바꿉니다.
   *
   * Override a single UI message for this grid only.
   *
   * このグリッドでだけ特定の文言一つを別の言葉に変えます。
   *
   * 只在该表格内把某一条文字换成别的说法。
   */
  setMessage(key: LocaleMessageKey | string, value: MessageValue): OpenGridInstance<T>;
  /**
   * 키에 해당하는 문구를 찾아 돌려줍니다(개별 오버라이드 → 활성 로케일 → 한국어 → 키 순). 오류를 내지 않습니다.
   *
   * Resolve a message by key (per-message override → active locale → Korean → the key itself). Never throws.
   *
   * キーに当たる文言を探して返します（個別オーバーライド → 有効ロケール → 韓国語 → キーの順）。
   * エラーになりません。
   *
   * 按键查找并返回对应文字（单条覆盖 → 生效区域 → 韩语 → 键本身，依此顺序）。不会报错。
   */
  t(key: LocaleMessageKey | string, params?: Record<string, string | number>): string;

  destroy(): void;

  // 런타임 옵션 갱신
  setOptions(opts: Partial<GridOptions<T>>): void;

  // F5: 마스킹 API
  /**
   * 컬럼 마스킹 ON/OFF. enabled=true → 마스킹 적용, enabled=false → 전체 해제
   *
   * 列マスキングの ON/OFF。enabled=true → マスキング適用、enabled=false → 全解除
   *
   * 列掩码的开关。enabled=true → 应用掩码，enabled=false → 全部解除
   */
  setMaskEnabled(field: string, enabled: boolean): void;
  /**
   * 현재 마스킹 활성 여부 반환 (true=마스킹 중)
   *
   * 現在マスキングが有効かどうかを返す（true=マスキング中）
   *
   * 返回当前掩码是否启用（true=正在掩码）
   */
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
   * トリガーの登録。
   * - 'before:{op}' : 作業の実行前に呼び出し。ctx.cancel() で該当作業を中断。
   * - 'after:{op}'  : 作業の完了後に呼び出し。ctx.result に結果を含む。
   * - 'complete'    : すべての作業の完了後の共通ハンドラー。
   *
   * 触发器的注册。
   * - 'before:{op}' : 在操作执行前调用。ctx.cancel() 可中断该操作。
   * - 'after:{op}'  : 在操作完成后调用。ctx.result 中包含结果。
   * - 'complete'    : 所有操作完成后的公共处理器。
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
  /**
   * 트리거 제거
   *
   * トリガーの削除
   *
   * 移除触发器
   */
  removeTrigger(event: TriggerEvent | string, handler: TriggerHandler): this;
  /**
   * 트리거 전체 또는 특정 이벤트 클리어
   *
   * トリガー全体または特定イベントのクリア
   *
   * 清除全部触发器或特定事件的触发器
   */
  clearTriggers(event?: TriggerEvent | string): this;
}

// ─── F3: 컨텍스트 메뉴 / context menu ───────────────────────────────────
/**
 * 컨텍스트 메뉴 항목.
 *
 * Context menu item.
 *
 * コンテキストメニューの項目。
 *
 * 右键菜单项。
 */
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
/**
 * 워크시트(탭) 정의.
 *
 * Worksheet (tab) definition.
 *
 * ワークシート（タブ）の定義。
 *
 * 工作表（标签页）定义。
 */
export interface WorksheetDef<T = any> {
  name: string;
  /**
   * 시트 전용 컬럼(미지정 시 그리드 columns 공유).
   *
   * Sheet-specific columns (falls back to grid columns).
   *
   * シート専用の列（未指定時はグリッドの columns を共有）。
   *
   * 工作表专用的列（未指定时共用表格的 columns）。
   */
  columns?: ColumnDef<T>[];
  data?: T[];
}

/**
 * 워크시트 현재 상태 스냅샷.
 *
 * Snapshot of a worksheet's current state.
 *
 * ワークシートの現在の状態のスナップショット。
 *
 * 工作表当前状态的快照。
 */
export interface WorksheetState<T = any> {
  name: string;
  columns: ColumnDef<T>[];
  data: T[];
}

// ─── 트리거 시스템 / trigger system ────────────────────────────────────────────
/**
 * 트리거 컨텍스트.
 *
 * Trigger context.
 *
 * トリガーのコンテキスト。
 *
 * 触发器上下文。
 *
 * before:{op} 핸들러에서 ctx.cancel() 호출 → 해당 작업이 실행되지 않음.
 * after:{op} / complete 핸들러에서는 ctx.result로 결과 확인 가능.
 *
 * Calling ctx.cancel() in a before:{op} handler prevents the operation from running.
 * In after:{op} / complete handlers the result is available via ctx.result.
 *
 * before:{op} ハンドラーで ctx.cancel() を呼び出す → 該当作業が実行されない。
 * after:{op} / complete ハンドラーでは ctx.result で結果を確認できる。
 *
 * 在 before:{op} 处理器中调用 ctx.cancel() → 该操作不会执行。
 * 在 after:{op} / complete 处理器中可通过 ctx.result 查看结果。
 */
export interface TriggerContext<TResult = any> {
  /**
   * 작업 이름 (setData, insertRow, deleteRow, writeCell, ...)
   *
   * Operation name (setData, insertRow, deleteRow, writeCell, ...)
   *
   * 作業名（setData, insertRow, deleteRow, writeCell, ...）
   *
   * 操作名（setData, insertRow, deleteRow, writeCell, ...）
   */
  readonly operation: string;
  /**
   * 작업에 전달된 인수 배열
   *
   * Arguments passed to the operation
   *
   * 作業に渡された引数の配列
   *
   * 传给操作的参数数组
   */
  readonly args: any[];
  /**
   * 작업 결과 (after:* / complete 에서만 채워짐)
   *
   * Operation result (populated only in after:* and complete)
   *
   * 作業の結果（after:* / complete でのみ埋まる）
   *
   * 操作结果（仅在 after:* / complete 中填充）
   */
  result?: TResult;
  /**
   * 취소 여부 — cancel() 호출 후 true가 됨
   *
   * Cancellation flag — becomes true after cancel()
   *
   * キャンセルの有無 — cancel() 呼び出し後に true になる
   *
   * 是否取消 — 调用 cancel() 后变为 true
   */
  readonly cancelled: boolean;
  /**
   * 추가 정보 (트리거 간 데이터 공유 등)
   *
   * Extra info (data sharing between triggers, etc.)
   *
   * 追加情報（トリガー間のデータ共有など）
   *
   * 附加信息（触发器之间共享数据等）
   */
  extra?: Record<string, any>;
  /**
   * 작업 시작 타임스탬프 (ms)
   *
   * Operation start timestamp (ms)
   *
   * 作業開始のタイムスタンプ（ms）
   *
   * 操作开始的时间戳（ms）
   */
  readonly timestamp: number;
  /**
   * 작업 취소 — before:{op} 핸들러에서만 유효.
   * 이후 핸들러도 실행되지 않으며 실제 작업도 중단된다.
   *
   * Cancel the operation — valid only in before:{op} handlers.
   * Subsequent handlers are skipped and the operation itself is aborted.
   *
   * 作業のキャンセル — before:{op} ハンドラーでのみ有効。
   * 以降のハンドラーも実行されず、実際の作業も中断される。
   *
   * 取消操作 — 仅在 before:{op} 处理器中有效。
   * 后续处理器不再执行，实际操作也会中断。
   */
  cancel(): void;
}

/**
 * 트리거로 등록하는 핸들러 함수의 형태입니다. 작업의 맥락(TriggerContext)을 인자로 받아,
 * 작업 전이라면 검증·취소하고 작업 후라면 결과를 확인하는 등의 일을 합니다.
 *
 * The shape of a handler you register as a trigger. It receives the operation's context
 * (TriggerContext) — validate/cancel before, or inspect the result after.
 *
 * トリガーとして登録するハンドラー関数の形です。作業のコンテキスト（TriggerContext）を引数に受け取り、
 * 作業の前なら検証・キャンセルし、作業の後なら結果を確認するなどのことをします。
 *
 * 注册为触发器的处理函数的形态。它以操作的上下文（TriggerContext）为参数，
 * 在操作前做校验、取消，在操作后查看结果等。
 */
export type TriggerHandler<TResult = any> = (ctx: TriggerContext<TResult>) => void;

/**
 * 트리거를 걸 수 있는 이벤트 이름들. 형식은 '시점:작업' 입니다 — 'before:작업'은 그 작업이 실행되기
 * 직전(여기서 취소 가능), 'after:작업'은 끝난 직후, 'complete'는 어떤 작업이든 끝난 뒤 공통으로 호출됩니다.
 *
 * The event names you can attach triggers to, in 'phase:operation' form — 'before:*' fires just
 * before the operation (cancelable there), 'after:*' just after, and 'complete' after any operation.
 *
 * トリガーを掛けられるイベント名。形式は '時点:作業' です — 'before:作業' はその作業が実行される
 * 直前（ここでキャンセル可能）、'after:作業' は終わった直後、'complete' はどの作業でも終わった後に
 * 共通で呼び出されます。
 *
 * 可挂载触发器的事件名。格式为 '时点:操作' — 'before:操作' 在该操作执行前一刻调用（可在此取消），
 * 'after:操作' 在结束后立即调用，'complete' 在任何操作结束后统一调用。
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
