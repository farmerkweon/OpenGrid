import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { Pagination } from './Pagination.js';
import type { SortItem, FilterItem } from './types.js';

export interface SortFilterDeps<T extends Record<string, any>> {
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getFindFilter: () => string;
  getVs: () => VirtualScroll | null;
  getPagination: () => Pagination | null;
  getOptions: () => any;
  renderHeader: () => void;
  doRender: () => void;
  announce: (msg: string) => void;
  emit: (event: string, ...args: any[]) => void;
  /** C0.5/§2.5: 정렬/필터 후 F1 범위 선택을 rowId 집합 기준으로 재투영(해제 아님). */
  onReproject?: () => void;
}

export class SortFilterManager<T extends Record<string, any> = any> {
  private _sortList: SortItem[] = [];
  private _filters: Record<string, FilterItem[]> = {};
  private _d: SortFilterDeps<T>;

  constructor(deps: SortFilterDeps<T>) {
    this._d = deps;
  }

  // ─── 상태 접근자 ─────────────────────────────────────────
  get sortList(): SortItem[] { return this._sortList; }
  get filters(): Record<string, FilterItem[]> { return this._filters; }

  // ─── 정렬 ─────────────────────────────────────────────────
  handleSortClick(field: string, shiftKey: boolean): void {
    const opts = this._d.getOptions();
    if (!opts.sortable) return;
    const idx = this._sortList.findIndex(s => s.field === field);
    if (idx >= 0) {
      const cur = this._sortList[idx]!;
      if (cur.dir === 'asc') {
        cur.dir = 'desc';
      } else {
        this._sortList.splice(idx, 1);
      }
    } else {
      if (!shiftKey || !opts.multiSort) this._sortList = [];
      this._sortList.push({ field, dir: 'asc' });
    }
    this._d.getData().applySort(this._sortList);
    this._d.onReproject?.();
    this._d.renderHeader();
    this._d.doRender();
    const sortedItem = this._sortList.find(s => s.field === field);
    const dirLabel = sortedItem ? (sortedItem.dir === 'asc' ? '오름차순' : '내림차순') : '정렬 해제';
    this._d.announce(`${field} ${dirLabel} 정렬`);
    this._d.emit('sortChange', { sortList: this._sortList });
    opts.onSortChange?.({ field, dir: sortedItem?.dir ?? 'asc', sortList: this._sortList });
  }

  sort(fieldOrList: string | SortItem[], dir: 'asc' | 'desc' = 'asc'): void {
    if (Array.isArray(fieldOrList)) {
      this._sortList = fieldOrList;
    } else {
      const i = this._sortList.findIndex(s => s.field === fieldOrList);
      if (i >= 0) this._sortList[i]!.dir = dir;
      else this._sortList = [{ field: fieldOrList, dir }];
      if (!this._d.getOptions().multiSort) this._sortList = this._sortList.slice(-1);
    }
    this._d.getData().applySort(this._sortList);
    this._d.onReproject?.();
    this._d.renderHeader();
    this._d.doRender();
    this._d.emit('sortChange', { sortList: this._sortList });
  }

  resetSort(): void {
    this._sortList = [];
    this._d.getData().applySort([]);
    this._d.onReproject?.();
    this._d.renderHeader();
    this._d.doRender();
  }

  initSort(sortList: SortItem[]): void {
    this._sortList = [...sortList];
    this._d.getData().applySort(this._sortList);
    this._d.onReproject?.();
  }

  getSortState(): SortItem[] { return [...this._sortList]; }

  // ─── 필터 ─────────────────────────────────────────────────
  setFilter(field: string, filterItems: FilterItem[]): void {
    this._filters[field] = filterItems;
    this.applyFilters();
    this._d.renderHeader();
    this._d.doRender();
    this._d.emit('filterChange', { field, filterItems, allFilters: this._filters });
    this._d.getOptions().onFilterChange?.({ field, filterItems, allFilters: this._filters });
  }

  resetFilter(field?: string): void {
    if (field) delete this._filters[field];
    else this._filters = {};
    this.applyFilters();
    this._d.renderHeader();
    this._d.doRender();
  }

  getFilterState(): Record<string, FilterItem[]> { return { ...this._filters }; }

  restoreFilter(state: Record<string, FilterItem[]>): void {
    this._filters = { ...state };
    this.applyFilters();
  }

  applyFilters(): void {
    const data = this._d.getData();
    data.setFindFilter(this._d.getFindFilter(), this._d.getColLayout().visibleLeaves.map(c => c.field));
    data.applyFilter(this._filters);
    this._d.onReproject?.();
    const n = data.rowCount;
    this._d.getVs()?.setTotalRows(n);
    this._d.getPagination()?.setTotalRows(n);
  }
}
