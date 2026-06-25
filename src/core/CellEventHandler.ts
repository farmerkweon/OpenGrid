import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { CellEditManager } from './CellEditManager.js';
import type { RowManager } from './RowManager.js';
import { isToggleCol } from './CellTypeRegistry.js';
import { evaluateFormula } from './FormulaEngine.js';
import { OGDecimal } from './OGDecimal.js';

export interface CellEventDeps<T extends Record<string, any>> {
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getOptions: () => any;
  getEditMgr: () => CellEditManager<T>;
  getRowMgr: () => RowManager<T>;
  emit: (event: string, ...args: any[]) => void;
  writeCell: (ri: number, field: string, value: any) => void;
  doRender: () => void;
  getContainer: () => HTMLElement;
}

export class CellEventHandler<T extends Record<string, any> = any> {
  private _d: CellEventDeps<T>;

  constructor(deps: CellEventDeps<T>) {
    this._d = deps;
  }

  handleCellClick(rowIndex: number, colIndex: number, e: MouseEvent): void {
    const opts = this._d.getOptions();
    const rowMgr = this._d.getRowMgr();
    const editMgr = this._d.getEditMgr();

    if (opts.selection === 'single' || opts.selection === 'row') {
      rowMgr.selectSingle(rowIndex);
    } else if (opts.selection === 'multiple') {
      if (e.ctrlKey || e.metaKey) {
        rowMgr.selectToggle(rowIndex);
      } else {
        rowMgr.selectSingle(rowIndex);
      }
    }

    const row = this._d.getData().getRowByIndex(rowIndex);
    const col = this._d.getColLayout().visibleLeaves[colIndex];

    if (row && col) {
      const colEditable = col.editable !== false && (col.editable !== undefined || opts.editable);
      if (isToggleCol(col) && colEditable) {
        const curVal = (row as any)[col.field];
        this._d.writeCell(rowIndex, col.field as unknown as string, !curVal);
      }

      if ((col.type as string) === 'radio') {
        const grp = (col as any).group;
        for (const c of this._d.getColLayout().visibleLeaves) {
          if ((c.type as string) === 'radio' && c.field !== col.field &&
              (!grp || (c as any).group === grp)) {
            this._d.getData().updateCell(rowIndex, c.field, false);
          }
        }
        this._d.writeCell(rowIndex, col.field as any, true);
      }

      let cellValue = (row as any)[col.field];
      if (cellValue === undefined && (col as any).formula) {
        try {
          const prec = (col as any).formulaPrecision ?? 30;
          const result = evaluateFormula((col as any).formula, row as any, prec);
          cellValue = result instanceof OGDecimal
            ? ((col as any).precision != null ? result.toFixed((col as any).precision) : result.toString())
            : String(result);
        } catch {}
      }
      const evt = {
        type: 'cellClick', rowIndex, columnIndex: colIndex,
        field: col.field, value: cellValue, row, column: col,
        target: e.target as HTMLElement, originalEvent: e,
      };
      this._d.emit('cellClick', evt);
      opts.onCellClick?.(evt);

      const rowEvt = { type: 'rowClick', rowIndex, row, target: e.target as HTMLElement, originalEvent: e };
      this._d.emit('rowClick', rowEvt);
      opts.onRowClick?.(rowEvt);

      const isSelectCol = (col.type as string) === 'select';
      const alreadyEditing = editMgr.activeEditor != null &&
        editMgr.editCell?.ri === rowIndex && editMgr.editCell?.ci === colIndex;
      if (!alreadyEditing && (opts.editMode === 'click' || isSelectCol) && !isToggleCol(col)) {
        editMgr.startEdit(rowIndex, colIndex, e);
      }
    }

    if (editMgr.activeEditor && editMgr.editCell?.ri === rowIndex && editMgr.editCell?.ci === colIndex) {
      return;
    }

    this._d.doRender();
    this._d.emit('selectionChange', {
      rows: rowMgr.getSelections(),
      rowIndexes: [...rowMgr.selectedRows],
    });
    opts.onSelectionChange?.({ rows: rowMgr.getSelections(), rowIndexes: [...rowMgr.selectedRows], cells: [] });
  }

  handleCellDblClick(rowIndex: number, colIndex: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(rowIndex);
    const col = this._d.getColLayout().visibleLeaves[colIndex];
    if (!row || !col) return;

    const opts = this._d.getOptions();
    const evt = {
      type: 'cellDblClick', rowIndex, columnIndex: colIndex,
      field: col.field, value: row[col.field], row, column: col,
      target: e.target as HTMLElement, originalEvent: e,
    };
    this._d.emit('cellDblClick', evt);
    opts.onCellDblClick?.(evt);

    const rowEvt = { type: 'rowDblClick', rowIndex, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowDblClick', rowEvt);
    opts.onRowDblClick?.(rowEvt);

    if (opts.editMode === 'dblclick') this._d.getEditMgr().startEdit(rowIndex, colIndex, e);
  }

  handleCellMouseOver(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseOver', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseOver', cellEvt);
    opts.onCellMouseOver?.(cellEvt);
    const rowEvt = { type: 'rowMouseOver', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseOver', rowEvt);
    opts.onRowMouseOver?.(rowEvt);
  }

  handleCellMouseOut(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseOut', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseOut', cellEvt);
    opts.onCellMouseOut?.(cellEvt);
    const rowEvt = { type: 'rowMouseOut', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseOut', rowEvt);
    opts.onRowMouseOut?.(rowEvt);
  }

  handleCellMouseDown(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseDown', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseDown', cellEvt);
    opts.onCellMouseDown?.(cellEvt);
    const rowEvt = { type: 'rowMouseDown', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseDown', rowEvt);
    opts.onRowMouseDown?.(rowEvt);
  }

  handleCellMouseUp(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseUp', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseUp', cellEvt);
    opts.onCellMouseUp?.(cellEvt);
    const rowEvt = { type: 'rowMouseUp', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseUp', rowEvt);
    opts.onRowMouseUp?.(rowEvt);
  }

  handleCellMouseMove(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseMove', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseMove', cellEvt);
    opts.onCellMouseMove?.(cellEvt);
    const rowEvt = { type: 'rowMouseMove', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseMove', rowEvt);
    opts.onRowMouseMove?.(rowEvt);
  }

  handleCellKeyEvt(eventName: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent): void {
    const editMgr = this._d.getEditMgr();
    if (!editMgr.focusCell || editMgr.activeEditor) return;
    const { ri, ci } = editMgr.focusCell;
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const evt = { type: eventName, rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, key: e.key, target: this._d.getContainer(), originalEvent: e };
    this._d.emit(eventName, evt);
    if (eventName === 'cellKeyDown') opts.onCellKeyDown?.(evt as any);
    else if (eventName === 'cellKeyUp') opts.onCellKeyUp?.(evt as any);
    else opts.onCellKeyPress?.(evt as any);
  }
}
