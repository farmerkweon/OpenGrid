import { DataLayer } from './DataLayer.js';
import { ColumnLayout } from './ColumnLayout.js';
import { GridRenderer } from './GridRenderer.js';
import { createEditor } from './editors/CellEditor.js';
import type { CellEditor } from './editors/CellEditor.js';
import type { ColumnDef, EditEvent } from './types.js';
import { isToggleCol } from './CellTypeRegistry.js';

export interface CellEditDeps<T extends Record<string, any>> {
  data: DataLayer<T>;
  colLayout: ColumnLayout<T>;
  getRenderer: () => GridRenderer | null;
  getContainer: () => HTMLElement;
  getOptions: () => any;
  emit: (event: string, ...args: any[]) => void;
  doRender: () => void;
  announce: (msg: string) => void;
  writeCell: (ri: number, field: string, value: any) => void;
  scrollToRow: (ri: number) => void;
  getVisibleLeaves: () => ColumnDef<T>[];
}

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
  get activeEditor(): CellEditor | null { return this._activeEditor; }
  get editCell(): { ri: number; ci: number } | null { return this._editCell; }
  get focusCell(): { ri: number; ci: number } | null { return this._focusCell; }
  get dragColIdx(): number | null { return this._dragColIdx; }
  set dragColIdx(v: number | null) { this._dragColIdx = v; }

  // ─── 포커스 셀 ───────────────────────────────────────────
  setFocusCell(ri: number, ci: number): void {
    this._focusCell = { ri, ci };
    this._d.scrollToRow(ri);
    this._d.doRender();
    const col = this._d.getVisibleLeaves()[ci];
    const row = this._d.data.getRowByIndex(ri);
    if (col && row) {
      const val = (row as any)[col.field];
      this._d.announce(
        `${ri + 1}행 ${ci + 1}열, ${col.header}: ${val == null ? '빈 값' : String(val)}`
      );
    }
  }

  clearFocusCell(): void { this._focusCell = null; }

  // ─── 편집 시작 (키보드) ──────────────────────────────────
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
    const ctx = {
      value: row?.[col.field], row: row as any, rowIndex,
      column: col as any, colIndex, isSelected: true, rowState: 'none' as any
    };
    editor.mount(cellEl, ctx,
      (value) => this.commitEditWithValue(rowIndex, colIndex, value),
      () => this.cancelEdit()
    );
    requestAnimationFrame(() => editor.focus());
  }

  // ─── 편집 시작 (마우스) ──────────────────────────────────
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
    const ctx = {
      value: row?.[col.field], row: row as any, rowIndex,
      column: col as any, colIndex, isSelected: true, rowState: 'none' as any
    };
    editor.mount(cellEl, ctx,
      (value) => this.commitEditWithValue(rowIndex, colIndex, value),
      () => this.cancelEdit()
    );
    requestAnimationFrame(() => editor.focus());
  }

  // ─── 편집 종료 ───────────────────────────────────────────
  commitEdit(): void {
    if (!this._activeEditor || !this._editCell) return;
    const val = this._activeEditor.getValue();
    const { ri, ci } = this._editCell;
    this._finishEdit(ri, ci, val, false);
  }

  commitEditWithValue(ri: number, ci: number, value: any): void {
    this._finishEdit(ri, ci, value, false);
  }

  cancelEdit(): void {
    if (!this._editCell) return;
    const { ri, ci } = this._editCell;
    this._finishEdit(ri, ci, undefined, true);
  }

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
      if (value !== old) {
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
