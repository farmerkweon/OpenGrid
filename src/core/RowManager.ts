import { DataLayer } from './DataLayer.js';

export class RowManager<T extends Record<string, any> = any> {
  private _selectedRows: Set<number> = new Set();
  private _checkedRows: Set<number> = new Set();
  private _data: DataLayer<T>;

  constructor(data: DataLayer<T>) {
    this._data = data;
  }

  // ─── Read-only 접근 ───────────────────────────────────────
  get selectedRows(): Set<number> { return this._selectedRows; }
  get checkedRows(): Set<number> { return this._checkedRows; }

  // ─── 선택 변경 ───────────────────────────────────────────
  selectSingle(ri: number): void {
    this._selectedRows.clear();
    this._selectedRows.add(ri);
  }

  selectToggle(ri: number): void {
    if (this._selectedRows.has(ri)) this._selectedRows.delete(ri);
    else this._selectedRows.add(ri);
  }

  clearSelection(): void { this._selectedRows.clear(); }

  // ─── 체크 변경 ───────────────────────────────────────────
  check(ri: number, checked: boolean): void {
    if (checked) this._checkedRows.add(ri);
    else this._checkedRows.delete(ri);
  }

  checkAll(checked: boolean, totalRows: number): void {
    if (checked) {
      for (let i = 0; i < totalRows; i++) this._checkedRows.add(i);
    } else {
      this._checkedRows.clear();
    }
  }

  checkByValue(field: string, values: any[]): void {
    for (let i = 0; i < this._data.rowCount; i++) {
      if (values.includes(this._data.getCellValue(i, field))) this._checkedRows.add(i);
    }
  }

  uncheckAll(): void { this._checkedRows.clear(); }

  checkById(_ids: string[]): void {}
  addCheckById(_ids: string[]): void {}
  uncheckById(_ids: string[]): void {}

  // ─── 선택 쿼리 API ───────────────────────────────────────
  getSelections(): T[] {
    return [...this._selectedRows]
      .map(i => this._data.getRowByIndex(i))
      .filter(Boolean) as T[];
  }

  getChecked(): Array<{ row: T; rowIndex: number }> {
    return [...this._checkedRows].map(i => ({
      row: this._data.getRowByIndex(i) as T,
      rowIndex: i,
    }));
  }

  getAllChecked(): T[] { return this.getChecked().map(r => r.row); }

  getActiveRow(): number {
    return this._selectedRows.size > 0 ? [...this._selectedRows][0]! : -1;
  }

  activate(index: number): void {
    this._selectedRows.clear();
    this._selectedRows.add(index);
  }

  deselect(): void { this._selectedRows.clear(); }

  // ─── 전체 초기화 (setData / clearData 시) ────────────────
  reset(): void {
    this._selectedRows.clear();
    this._checkedRows.clear();
  }
}
