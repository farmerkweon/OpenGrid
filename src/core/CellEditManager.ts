import { DataLayer } from './DataLayer.js';
import { ColumnLayout } from './ColumnLayout.js';
import { GridRenderer } from './GridRenderer.js';
import { createEditor } from './editors/CellEditor.js';
import type { CellEditor } from './editors/CellEditor.js';
import type { ColumnDef, EditEvent } from './types.js';
import { isToggleCol } from './CellTypeRegistry.js';

/**
 * {@link CellEditManager} 의존성 주입 계약. / Dependency-injection contract for {@link CellEditManager}.
 *
 * 셀 편집기의 마운트/커밋에 필요한 데이터·렌더·i18n·수식 접근을 호스트 그리드가 제공한다.
 * / The host grid supplies the data/render/i18n/formula access needed to mount and
 * commit the cell editor.
 */
export interface CellEditDeps<T extends Record<string, any>> {
  /** 데이터 레이어. / The data layer. */
  data: DataLayer<T>;
  /** 컬럼 레이아웃. / The column layout. */
  colLayout: ColumnLayout<T>;
  /** 현재 렌더러 조회(없으면 `null`). / Look up the current renderer (or `null`). */
  getRenderer: () => GridRenderer | null;
  /** 그리드 컨테이너 엘리먼트 조회. / Look up the grid container element. */
  getContainer: () => HTMLElement;
  /** 현재 그리드 옵션 조회. / Look up the current grid options. */
  getOptions: () => any;
  /** 그리드 이벤트를 발행한다. / Emit a grid event. */
  emit: (event: string, ...args: any[]) => void;
  /** 바디를 다시 그린다. / Re-render the body. */
  doRender: () => void;
  /** 스크린리더용 상태 안내. / Announce a status message for screen readers. */
  announce: (msg: string) => void;
  /** i18n: 편집 셀 위치 announce 해석 + 에디터 ctx 로케일 주입. / i18n: resolve edit-cell announce + inject locale into editor ctx. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 셀 값을 기록한다(트리거/이벤트 발화 경로). / Write a cell value (goes through the trigger/event path). */
  writeCell: (ri: number, field: string, value: any) => void;
  /** 지정 행이 보이도록 스크롤한다. / Scroll so the given row is visible. */
  scrollToRow: (ri: number) => void;
  /** 현재 보이는(펼쳐진) 리프 컬럼 목록 조회. / Look up the currently visible leaf columns. */
  getVisibleLeaves: () => ColumnDef<T>[];
  // F3(11_design_F3_v2.md §7.1/§4.3): 인-셀 '=' 편집 인식 + 재편집 시 원문 표시.
  /** F3: 해당 셀이 수식을 갖는지 조회. / F3: check whether the cell currently holds a formula. */
  hasCellFormula?: (ri: number, field: string) => boolean;
  /** F3: 셀의 수식 원문을 조회(없으면 `null`). / F3: get the cell's raw formula source (or `null`). */
  getCellFormula?: (ri: number, field: string) => string | null;
  /** F3: 셀에 수식을 설정한다. / F3: set a formula on the cell. */
  setCellFormula?: (ri: number, field: string, formula: string) => void;
  /** F3: 셀의 수식을 제거한다. / F3: clear the cell's formula. */
  clearCellFormula?: (ri: number, field: string) => void;
}

/**
 * 셀 편집 생명주기(포커스·시작·커밋·취소)를 관리하는 매니저. / Manages the cell edit lifecycle (focus, start, commit, cancel).
 *
 * 활성 에디터 인스턴스와 편집/포커스 대상 셀 좌표를 소유하며, 키보드/마우스 두 진입
 * 경로 모두에서 동일한 편집기 마운트·커밋 흐름을 재사용한다.
 * / Owns the active editor instance and the edit/focus target cell coordinates, and
 * reuses the same editor mount/commit flow for both the keyboard and mouse entry paths.
 */
export class CellEditManager<T extends Record<string, any> = any> {
  private _activeEditor: CellEditor | null = null;
  private _editCell: { ri: number; ci: number } | null = null;
  private _focusCell: { ri: number; ci: number } | null = null;
  private _dragColIdx: number | null = null;

  private _d: CellEditDeps<T>;

  constructor(deps: CellEditDeps<T>) {
    this._d = deps;
  }

  // ─── 상태 접근자 ─────────────────────────────────────────
  /** 현재 마운트된 에디터 인스턴스(없으면 `null`). / The currently mounted editor instance (or `null`). */
  get activeEditor(): CellEditor | null { return this._activeEditor; }
  /** 현재 편집 중인 셀 좌표(없으면 `null`). / Coordinates of the cell currently being edited (or `null`). */
  get editCell(): { ri: number; ci: number } | null { return this._editCell; }
  /** 현재 키보드 포커스 셀 좌표(없으면 `null`). / Coordinates of the currently keyboard-focused cell (or `null`). */
  get focusCell(): { ri: number; ci: number } | null { return this._focusCell; }
  /** 컬럼 드래그 중인 컬럼 인덱스(없으면 `null`). / Column index currently being column-dragged (or `null`). */
  get dragColIdx(): number | null { return this._dragColIdx; }
  set dragColIdx(v: number | null) { this._dragColIdx = v; }

  // ─── 포커스 셀 ───────────────────────────────────────────
  /**
   * 키보드 포커스 셀을 설정하고, 스크롤·재렌더·상태 announce 를 처리한다. / Set the keyboard-focused cell; handles scroll, re-render, and status announce.
   *
   * @param ri - 포커스할 행의 flat index / Flat index of the row to focus
   * @param ci - 포커스할 컬럼 인덱스(보이는 리프 컬럼 기준) / Column index to focus, among visible leaf columns
   */
  setFocusCell(ri: number, ci: number): void {
    this._focusCell = { ri, ci };
    this._d.scrollToRow(ri);
    this._d.doRender();
    const col = this._d.getVisibleLeaves()[ci];
    const row = this._d.data.getRowByIndex(ri);
    if (col && row) {
      const val = (row as any)[col.field];
      this._d.announce(
        this._d.t('editor.cellPositionAnnounce', {
          row: ri + 1, col: ci + 1, header: col.header as any,
          value: val == null ? this._d.t('cell.emptyValue') : String(val),
        })
      );
    }
  }

  /** 키보드 포커스 셀을 해제한다. / Clear the keyboard-focused cell. */
  clearFocusCell(): void { this._focusCell = null; }

  // ─── 편집 시작 (키보드) ──────────────────────────────────
  /**
   * 키보드 진입(F2/Enter 등)으로 셀 편집을 시작한다. / Start cell editing via a keyboard entry point (F2/Enter, etc.).
   *
   * 토글형 컬럼(checkbox 등)은 에디터를 마운트하지 않고 값을 즉시 반전한다.
   * / For toggle-type columns (checkbox, etc.), this flips the value immediately
   * instead of mounting an editor.
   *
   * @param rowIndex - 편집할 행의 flat index / Flat index of the row to edit
   * @param colIndex - 편집할 컬럼 인덱스(보이는 리프 컬럼 기준) / Column index to edit, among visible leaf columns
   */
  startEditByKey(rowIndex: number, colIndex: number): void {
    const col = this._d.getVisibleLeaves()[colIndex];
    if (!col) return;

    if (isToggleCol(col)) {
      const opts = this._d.getOptions();
      const colEditable = col.editable !== false && (col.editable !== undefined || opts.editable);
      if (colEditable) {
        const row = this._d.data.getRowByIndex(rowIndex);
        if (row) this._d.writeCell(rowIndex, col.field as unknown as string, !(row as any)[col.field]);
      }
      return;
    }

    const row = this._d.data.getRowByIndex(rowIndex);
    if (col.editable === false) return;
    if (typeof col.editable === 'function' && !col.editable(row as T, rowIndex)) return;

    this.commitEdit();
    const cellEl = this._d.getRenderer()?.getCellEl(rowIndex, colIndex);
    if (!cellEl) return;
    cellEl.innerHTML = '';

    const editor = createEditor(col);
    this._activeEditor = editor;
    this._editCell = { ri: rowIndex, ci: colIndex };

    const startEvt: EditEvent<T> = {
      type: 'editStart', rowIndex, columnIndex: colIndex,
      field: col.field, oldValue: row?.[col.field], newValue: row?.[col.field],
      row: row as T, column: col as any
    };
    this._d.emit('editStart', startEvt);
    this._d.getOptions().onEditStart?.(startEvt);

    cellEl.classList.add('og-editing');
    // F3(§4.3): 수식 셀 재편집 시 계산값이 아니라 원문("=A1+B2")을 에디터에 채운다.
    const formulaSrc = this._d.hasCellFormula?.(rowIndex, col.field) ? this._d.getCellFormula?.(rowIndex, col.field) : null;
    const ctx = {
      value: formulaSrc ?? row?.[col.field], row: row as any, rowIndex,
      column: col as any, colIndex, isSelected: true, rowState: 'none' as any,
      t: (key: string, params?: Record<string, string | number>) => this._d.t(key, params),
    };
    editor.mount(cellEl, ctx,
      (value) => this.commitEditWithValue(rowIndex, colIndex, value),
      () => this.cancelEdit()
    );
    requestAnimationFrame(() => editor.focus());
  }

  // ─── 편집 시작 (마우스) ──────────────────────────────────
  /**
   * 마우스 진입(클릭/더블클릭)으로 셀 편집을 시작한다. / Start cell editing via a mouse entry point (click/double-click).
   *
   * `editable` 옵션·컬럼별 editable 함수·토글형 컬럼 여부를 모두 확인한 뒤
   * 에디터를 마운트한다.
   * / Checks the `editable` option, any per-column editable function, and whether
   * the column is toggle-type before mounting the editor.
   *
   * @param rowIndex - 편집할 행의 flat index / Flat index of the row to edit
   * @param colIndex - 편집할 컬럼 인덱스(보이는 리프 컬럼 기준) / Column index to edit, among visible leaf columns
   * @param _e - 트리거한 마우스 이벤트(현재 미사용) / The triggering mouse event (currently unused)
   */
  startEdit(rowIndex: number, colIndex: number, _e: MouseEvent): void {
    const opts = this._d.getOptions();
    if (!opts.editable) return;
    const col = this._d.getVisibleLeaves()[colIndex];
    if (!col) return;

    if (isToggleCol(col)) return;

    const row = this._d.data.getRowByIndex(rowIndex);
    if (col.editable === false) return;
    if (typeof col.editable === 'function' && !col.editable(row as T, rowIndex)) return;
    if (!col.editable && !opts.editable) return;

    this.commitEdit();

    const cellEl = this._d.getRenderer()?.getCellEl(rowIndex, colIndex);
    if (!cellEl) return;
    cellEl.innerHTML = '';

    const editor = createEditor(col);
    this._activeEditor = editor;
    this._editCell = { ri: rowIndex, ci: colIndex };

    const startEvt: EditEvent<T> = {
      type: 'editStart', rowIndex, columnIndex: colIndex,
      field: col.field, oldValue: row?.[col.field], newValue: row?.[col.field],
      row: row as T, column: col as any
    };
    this._d.emit('editStart', startEvt);
    opts.onEditStart?.(startEvt);

    cellEl.classList.add('og-editing');
    // F3(§4.3): 수식 셀 재편집 시 계산값이 아니라 원문("=A1+B2")을 에디터에 채운다.
    const formulaSrc = this._d.hasCellFormula?.(rowIndex, col.field) ? this._d.getCellFormula?.(rowIndex, col.field) : null;
    const ctx = {
      value: formulaSrc ?? row?.[col.field], row: row as any, rowIndex,
      column: col as any, colIndex, isSelected: true, rowState: 'none' as any,
      t: (key: string, params?: Record<string, string | number>) => this._d.t(key, params),
    };
    editor.mount(cellEl, ctx,
      (value) => this.commitEditWithValue(rowIndex, colIndex, value),
      () => this.cancelEdit()
    );
    requestAnimationFrame(() => editor.focus());
  }

  // ─── 편집 종료 ───────────────────────────────────────────
  /** 활성 에디터의 현재 값으로 편집을 커밋한다(활성 에디터가 없으면 무시). / Commit editing using the active editor's current value (no-op if none is active). */
  commitEdit(): void {
    if (!this._activeEditor || !this._editCell) return;
    const val = this._activeEditor.getValue();
    const { ri, ci } = this._editCell;
    this._finishEdit(ri, ci, val, false);
  }

  /**
   * 지정 값으로 편집을 커밋한다(에디터의 onCommit 콜백 경로). / Commit editing with an explicit value (the editor's onCommit callback path).
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param ci - 대상 컬럼 인덱스 / Target column index
   * @param value - 커밋할 값 / Value to commit
   */
  commitEditWithValue(ri: number, ci: number, value: any): void {
    this._finishEdit(ri, ci, value, false);
  }

  /** 편집을 취소한다(값 변경 없이 에디터만 해제). / Cancel editing (releases the editor without applying a value change). */
  cancelEdit(): void {
    if (!this._editCell) return;
    const { ri, ci } = this._editCell;
    this._finishEdit(ri, ci, undefined, true);
  }

  /** @internal */
  private _finishEdit(ri: number, ci: number, value: any, cancel: boolean): void {
    if (!this._activeEditor) return;
    const col = this._d.getVisibleLeaves()[ci];
    const cellEl = this._d.getRenderer()?.getCellEl(ri, ci);
    if (cellEl) {
      this._activeEditor.destroy();
      cellEl.classList.remove('og-editing');
    }
    this._activeEditor = null;
    this._editCell = null;

    if (!cancel && col) {
      const old = this._d.data.getCellValue(ri, col.field);
      const hadFormula = this._d.hasCellFormula?.(ri, col.field) ?? false;
      // F3(§7.1 P0 MVP): 커밋된 문자열이 '='로 시작하면 수식으로 인식. 기존 값 편집 경로는
      // (autoRecalc 옵션과 무관하게) 사용자가 명시적으로 '='를 입력한 경우에만 갈라진다 —
      // '=' 로 시작하지 않는 일반 편집은 회귀 0 유지.
      const isFormulaInput = typeof value === 'string' && value.trimStart().startsWith('=');
      if (isFormulaInput) {
        this._d.setCellFormula?.(ri, col.field, value);
        const row = this._d.data.getRowByIndex(ri);
        const opts = this._d.getOptions();
        const evt: EditEvent<T> = {
          type: 'editEnd', rowIndex: ri, columnIndex: ci,
          field: col.field, oldValue: old, newValue: value,
          row: row as T, column: col as any
        };
        this._d.emit('editEnd', evt);
        opts.onEditEnd?.(evt);
        this._d.emit('dataChange', this._d.data.getData());
        opts.onDataChange?.(this._d.data.getData());
      } else if (value !== old || hadFormula) {
        if (hadFormula) this._d.clearCellFormula?.(ri, col.field);
        this._d.data.updateCell(ri, col.field, value);
        const row = this._d.data.getRowByIndex(ri);
        const opts = this._d.getOptions();
        const evt: EditEvent<T> = {
          type: 'editEnd', rowIndex: ri, columnIndex: ci,
          field: col.field, oldValue: old, newValue: value,
          row: row as T, column: col as any
        };
        this._d.emit('editEnd', evt);
        opts.onEditEnd?.(evt);
        this._d.emit('dataChange', this._d.data.getData());
        opts.onDataChange?.(this._d.data.getData());
      }
    }
    this._d.doRender();
    requestAnimationFrame(() => this._d.getContainer().focus({ preventScroll: true }));
  }
}
