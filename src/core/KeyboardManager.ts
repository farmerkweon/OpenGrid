import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { CellEditManager } from './CellEditManager.js';
import type { RowManager } from './RowManager.js';

/** F1 범위 선택 배선 훅(M-3/M-4/M-5) — RangeSelectionManager 가 그대로 구현한다. */
export interface RangeKeyboardHooks {
  isEnabled(): boolean;
  hasSelection(): boolean;
  extendFocus(dir: 'up' | 'down' | 'left' | 'right'): void;
  ctrlFill(axis: 'down' | 'right'): void;
  clear(): void;
  /** 범위 없으면 null(호출측이 기존 focusCell/selectedRows 경로로 폴백) */
  copyText(): string | null;
  /** true = 배치 경유로 처리함, false = 범위 없음(폴백) */
  pasteText(text: string): boolean;
}

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
  /** i18n: 행 이동 announce 해석. / i18n: resolve row-move announce. */
  t: (key: string, params?: Record<string, string | number>) => string;
  emit: (event: string, ...args: any[]) => void;
  visRange: () => [number, number];
  handleCellKeyEvt: (eventName: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent) => void;
  /** M-4: 붙여넣기 쓰기 퍼널을 writeCell(배치)로 교체(CON-2, 의도적 동작 변경) */
  writeCells?: (patches: Array<{ rowIndex: number; field: string; value: any }>) => number;
  getRangeHooks?: () => RangeKeyboardHooks | null;
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

    const rangeHooks = this._d.getRangeHooks?.() ?? null;

    // M-3(HANMS-02/C9): Ctrl+D/Ctrl+R 키보드 채우기 — 'cells' 모드 + 편집 비활성일 때만.
    if ((e.ctrlKey || e.metaKey) && rangeHooks?.isEnabled() && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      rangeHooks.ctrlFill('down');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && rangeHooks?.isEnabled() && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      rangeHooks.ctrlFill('right');
      return;
    }

    // M-3: Shift+Arrow 범위 확장 — 'cells' 모드일 때만. 그 외 모드는 기존 focus 이동 분기로 낙하(회귀 0).
    if (e.shiftKey && rangeHooks?.isEnabled() &&
      (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowLeft' ? 'left' : 'right';
      rangeHooks.extendFocus(dir);
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
          this._d.announce(this._d.t('row.moveAnnounce', { from: ri + 1, to: ri + 2 }));
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const ri = editMgr.focusCell.ri;
        if (ri > 0) {
          this._d.handleRowDrop(ri, ri - 1);
          this._d.setFocusCell(ri - 1, editMgr.focusCell.ci);
          this._d.announce(this._d.t('row.moveAnnounce', { from: ri + 1, to: ri }));
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
        // C9: 이 지점에 도달했다는 것은 이미 activeEditor 가 없다는 뜻(함수 최상단에서 return) —
        // 편집 종료 후에만 범위 해제(M-3, 부록 B).
        this._d.getRangeHooks?.()?.clear();
        editMgr.clearFocusCell();
        this._d.doRender();
        break;
      }
    }
  }

  private _copyToClipboard(): void {
    const opts = this._d.getOptions();
    if (!opts.clipboard) return;

    // M-5(§5.1, UR-4): 범위 선택이 있으면 범위 TSV 가 focusCell/selectedRows 보다 우선.
    const rangeHooks = this._d.getRangeHooks?.();
    if (rangeHooks?.isEnabled() && rangeHooks.hasSelection()) {
      const rangeText = rangeHooks.copyText();
      if (rangeText != null) {
        navigator.clipboard?.writeText(rangeText).catch(() => {});
        return;
      }
    }

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
    const rangeHooks = this._d.getRangeHooks?.();

    navigator.clipboard?.readText().then(text => {
      if (!text) return;

      // M-4(FR-4/§5.2): 범위 선택이 있으면 범위 붙여넣기(타일/blockp 전개)가 우선.
      if (rangeHooks?.isEnabled() && rangeHooks.hasSelection() && rangeHooks.pasteText(text)) return;

      if (!editMgr.focusCell) return;
      const { ri, ci } = editMgr.focusCell;
      const lines = text.split('\n');
      const cols = this._d.getColLayout().visibleLeaves;
      const data = this._d.getData();

      // M-4 ⚠️의도적 동작 변경(CON-2): 기존 updateCell 직접호출(트리거/editEnd/dataChange 미발화) →
      // writeCell(배치 writeCells) 경유로 교체. 트리거/editEnd/dataChange 가 새로 발화한다
      // (unit:F1-paste-writecell-sideeffect 로 명시 검증).
      const patches: Array<{ rowIndex: number; field: string; value: any }> = [];
      for (let dr = 0; dr < lines.length; dr++) {
        const cells = lines[dr]!.split('\t');
        for (let dc = 0; dc < cells.length; dc++) {
          const targetRi = ri + dr;
          const targetCi = ci + dc;
          const col = cols[targetCi];
          if (col && targetRi < data.rowCount) {
            patches.push({ rowIndex: targetRi, field: col.field, value: cells[dc] });
          }
        }
      }
      if (patches.length) this._d.writeCells?.(patches);
    }).catch(() => {});
  }
}
