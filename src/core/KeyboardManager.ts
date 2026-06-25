import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { CellEditManager } from './CellEditManager.js';
import type { RowManager } from './RowManager.js';

export interface KeyboardDeps<T extends Record<string, any>> {
  getEditMgr: () => CellEditManager<T>;
  getRowMgr: () => RowManager<T>;
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getOptions: () => any;
  setFocusCell: (ri: number, ci: number) => void;
  handleRowDrop: (from: number, to: number) => void;
  doRender: () => void;
  announce: (msg: string) => void;
  emit: (event: string, ...args: any[]) => void;
  visRange: () => [number, number];
  handleCellKeyEvt: (eventName: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent) => void;
}

export class KeyboardManager<T extends Record<string, any> = any> {
  private _d: KeyboardDeps<T>;

  constructor(deps: KeyboardDeps<T>) {
    this._d = deps;
  }

  handleKeyDown(e: KeyboardEvent): void {
    const editMgr = this._d.getEditMgr();
    if (editMgr.activeEditor) return;

    this._d.handleCellKeyEvt('cellKeyDown', e);

    const data = this._d.getData();
    const colLayout = this._d.getColLayout();
    const totalRows = data.rowCount;
    const totalCols = colLayout.visibleLeaves.length;
    if (totalRows === 0 || totalCols === 0) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      this._copyToClipboard();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      this._pasteFromClipboard();
      return;
    }

    const opts = this._d.getOptions();
    if ((e.ctrlKey || e.metaKey) && opts.draggable && editMgr.focusCell) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const ri = editMgr.focusCell.ci !== undefined ? editMgr.focusCell.ri : 0;
        if (ri < totalRows - 1) {
          this._d.handleRowDrop(ri, ri + 1);
          this._d.setFocusCell(ri + 1, editMgr.focusCell.ci);
          this._d.announce(`행 ${ri + 1}을(를) ${ri + 2}번째 위치로 이동`);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const ri = editMgr.focusCell.ri;
        if (ri > 0) {
          this._d.handleRowDrop(ri, ri - 1);
          this._d.setFocusCell(ri - 1, editMgr.focusCell.ci);
          this._d.announce(`행 ${ri + 1}을(를) ${ri}번째 위치로 이동`);
        }
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        const nextRi = cur ? Math.min(cur.ri + 1, totalRows - 1) : 0;
        this._d.setFocusCell(nextRi, cur?.ci ?? 0);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        const nextRi = cur ? Math.max(cur.ri - 1, 0) : 0;
        this._d.setFocusCell(nextRi, cur?.ci ?? 0);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        if (!cur) { this._d.setFocusCell(0, 0); break; }
        if (cur.ci < totalCols - 1) {
          this._d.setFocusCell(cur.ri, cur.ci + 1);
        } else if (cur.ri < totalRows - 1) {
          this._d.setFocusCell(cur.ri + 1, 0);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        if (!cur) { this._d.setFocusCell(0, 0); break; }
        if (cur.ci > 0) {
          this._d.setFocusCell(cur.ri, cur.ci - 1);
        } else if (cur.ri > 0) {
          this._d.setFocusCell(cur.ri - 1, totalCols - 1);
        }
        break;
      }
      case 'Tab': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        if (!cur) { this._d.setFocusCell(0, 0); break; }
        if (!e.shiftKey) {
          if (cur.ci < totalCols - 1) this._d.setFocusCell(cur.ri, cur.ci + 1);
          else if (cur.ri < totalRows - 1) this._d.setFocusCell(cur.ri + 1, 0);
        } else {
          if (cur.ci > 0) this._d.setFocusCell(cur.ri, cur.ci - 1);
          else if (cur.ri > 0) this._d.setFocusCell(cur.ri - 1, totalCols - 1);
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          this._d.setFocusCell(0, 0);
        } else {
          const cur = editMgr.focusCell;
          this._d.setFocusCell(cur?.ri ?? 0, 0);
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          this._d.setFocusCell(totalRows - 1, totalCols - 1);
        } else {
          const cur = editMgr.focusCell;
          this._d.setFocusCell(cur?.ri ?? 0, totalCols - 1);
        }
        break;
      }
      case 'PageDown': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        const step = this._d.getOptions().pageSize ?? 10;
        const nextRi = cur ? Math.min(cur.ri + step, totalRows - 1) : Math.min(step - 1, totalRows - 1);
        this._d.setFocusCell(nextRi, cur?.ci ?? 0);
        break;
      }
      case 'PageUp': {
        e.preventDefault();
        const cur = editMgr.focusCell;
        const step = this._d.getOptions().pageSize ?? 10;
        const nextRi = cur ? Math.max(cur.ri - step, 0) : 0;
        this._d.setFocusCell(nextRi, cur?.ci ?? 0);
        break;
      }
      case ' ': {
        if (editMgr.focusCell) {
          e.preventDefault();
          const ri = editMgr.focusCell.ri;
          const rowMgr = this._d.getRowMgr();
          if (this._d.getOptions().checkColumn) {
            rowMgr.check(ri, !rowMgr.checkedRows.has(ri));
            this._d.doRender();
          } else {
            rowMgr.selectToggle(ri);
            this._d.doRender();
          }
        }
        break;
      }
      case 'F2':
      case 'Enter': {
        if (editMgr.focusCell && this._d.getOptions().editable) {
          e.preventDefault();
          editMgr.startEditByKey(editMgr.focusCell.ri, editMgr.focusCell.ci);
        }
        break;
      }
      case 'Escape': {
        editMgr.clearFocusCell();
        this._d.doRender();
        break;
      }
    }
  }

  private _copyToClipboard(): void {
    const opts = this._d.getOptions();
    if (!opts.clipboard) return;

    const editMgr = this._d.getEditMgr();
    const colLayout = this._d.getColLayout();
    const data = this._d.getData();

    let text = '';
    if (editMgr.focusCell) {
      const { ri, ci } = editMgr.focusCell;
      const col = colLayout.visibleLeaves[ci];
      if (col) text = String(data.getCellValue(ri, col.field) ?? '');
    } else if (this._d.getRowMgr().selectedRows.size > 0) {
      const cols = colLayout.visibleLeaves;
      const rowTexts = [...this._d.getRowMgr().selectedRows].sort((a, b) => a - b).map(ri => {
        const row = data.getRowByIndex(ri);
        return cols.map(c => String(row?.[c.field] ?? '')).join('\t');
      });
      text = rowTexts.join('\n');
    }

    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  }

  private _pasteFromClipboard(): void {
    const opts = this._d.getOptions();
    if (!opts.clipboard || !opts.editable) return;

    const editMgr = this._d.getEditMgr();
    if (!editMgr.focusCell) return;

    navigator.clipboard?.readText().then(text => {
      if (!text) return;
      const { ri, ci } = editMgr.focusCell!;
      const lines = text.split('\n');
      const cols = this._d.getColLayout().visibleLeaves;
      const data = this._d.getData();

      for (let dr = 0; dr < lines.length; dr++) {
        const cells = lines[dr]!.split('\t');
        for (let dc = 0; dc < cells.length; dc++) {
          const targetRi = ri + dr;
          const targetCi = ci + dc;
          const col = cols[targetCi];
          if (col && targetRi < data.rowCount) {
            data.updateCell(targetRi, col.field, cells[dc]);
          }
        }
      }
      this._d.emit('dataChange', data.getData());
      this._d.doRender();
    }).catch(() => {});
  }
}
