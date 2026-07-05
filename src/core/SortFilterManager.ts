import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { Pagination } from './Pagination.js';
import type { SortItem, FilterItem } from './types.js';

/**
 * {@link SortFilterManager} 의존성 주입 계약. / Dependency-injection contract for {@link SortFilterManager}.
 *
 * 호스트 그리드가 데이터/렌더/i18n 접근을 함수로 넘겨 매니저를 데이터 소스와 분리한다.
 * / The host grid passes data/render/i18n access as functions, decoupling the manager
 * from its data source.
 */
export interface SortFilterDeps<T extends Record<string, any>> {
  /** 현재 데이터 레이어 조회. / Look up the current data layer. */
  getData: () => DataLayer<T>;
  /** 현재 컬럼 레이아웃 조회. / Look up the current column layout. */
  getColLayout: () => ColumnLayout<T>;
  /** 통합검색(find) 필터 문자열 조회. / Look up the current find-filter string. */
  getFindFilter: () => string;
  /** 가상 스크롤 인스턴스 조회(없으면 `null`). / Look up the virtual-scroll instance (or `null`). */
  getVs: () => VirtualScroll | null;
  /** 페이지네이션 인스턴스 조회(없으면 `null`). / Look up the pagination instance (or `null`). */
  getPagination: () => Pagination | null;
  /** 현재 그리드 옵션 조회. / Look up the current grid options. */
  getOptions: () => any;
  /** 헤더(정렬/필터 표시)를 다시 그린다. / Re-render the header (sort/filter indicators). */
  renderHeader: () => void;
  /** 바디를 다시 그린다. / Re-render the body. */
  doRender: () => void;
  /** 스크린리더용 상태 안내. / Announce a status message for screen readers. */
  announce: (msg: string) => void;
  /** i18n: 정렬 상태어 + announce 해석. / i18n: resolve sort state words + announce. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 그리드 이벤트를 발행한다. / Emit a grid event. */
  emit: (event: string, ...args: any[]) => void;
  /** C0.5/§2.5: 정렬/필터 후 F1 범위 선택을 rowId 집합 기준으로 재투영(해제 아님).
   * / C0.5/§2.5: after sort/filter, re-project the F1 range selection by its rowId
   * set instead of clearing it. */
  onReproject?: () => void;
}

/**
 * 정렬·필터 상태와 적용을 담당하는 매니저. / Manages sort/filter state and their application.
 *
 * 정렬 목록(`SortItem[]`)과 컬럼별 필터(`FilterItem[]`)를 소유하고, 데이터 레이어에
 * 적용한 뒤 헤더/바디 재렌더와 관련 이벤트 발행까지 처리한다.
 * / Owns the sort list (`SortItem[]`) and per-column filters (`FilterItem[]`), applies
 * them to the data layer, and drives header/body re-render plus related event emission.
 */
export class SortFilterManager<T extends Record<string, any> = any> {
  private _sortList: SortItem[] = [];
  private _filters: Record<string, FilterItem[]> = {};
  private _d: SortFilterDeps<T>;

  constructor(deps: SortFilterDeps<T>) {
    this._d = deps;
  }

  // ─── 상태 접근자 ─────────────────────────────────────────
  /** 현재 정렬 목록(원본 참조). / Current sort list (live reference). */
  get sortList(): SortItem[] { return this._sortList; }
  /** 컬럼 field 별 필터 목록(원본 참조). / Filter items keyed by column field (live reference). */
  get filters(): Record<string, FilterItem[]> { return this._filters; }

  // ─── 정렬 ─────────────────────────────────────────────────
  /**
   * 헤더 정렬 클릭을 처리한다(단일/다중 정렬 토글). / Handle a header sort click (toggles single/multi sort).
   *
   * 같은 필드를 다시 클릭하면 asc→desc→해제 순으로 순환한다. `shiftKey` 와
   * `multiSort` 옵션이 모두 켜져야 다중 정렬 목록에 누적된다.
   * / Re-clicking the same field cycles asc → desc → removed. Multi-sort only
   * accumulates when both `shiftKey` and the `multiSort` option are on.
   *
   * @param field - 정렬 대상 컬럼 field 명 / Column field to sort by
   * @param shiftKey - 다중 정렬 결합 키(Shift) 눌림 여부 / Whether the multi-sort modifier (Shift) was held
   */
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
    const dirLabel = this._d.t(sortedItem ? (sortedItem.dir === 'asc' ? 'sort.asc' : 'sort.desc') : 'sort.none');
    this._d.announce(this._d.t('sort.announce', { field, dir: dirLabel }));
    this._d.emit('sortChange', { sortList: this._sortList });
    opts.onSortChange?.({ field, dir: sortedItem?.dir ?? 'asc', sortList: this._sortList });
  }

  /**
   * 프로그램적으로 정렬을 설정한다(단일 필드+방향, 또는 전체 정렬 목록). / Set sort programmatically (single field+direction, or a full sort list).
   *
   * @param fieldOrList - 정렬할 필드명, 또는 대체할 전체 `SortItem[]` / Field to sort by, or a full `SortItem[]` to replace the current list
   * @param dir - `fieldOrList` 가 문자열일 때의 정렬 방향(기본 `'asc'`) / Sort direction when `fieldOrList` is a string (default `'asc'`)
   * @example
   * mgr.sort('name', 'desc');
   * mgr.sort([{ field: 'age', dir: 'asc' }]);
   */
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

  /** 모든 정렬을 해제한다. / Clear all sorting. */
  resetSort(): void {
    this._sortList = [];
    this._d.getData().applySort([]);
    this._d.onReproject?.();
    this._d.renderHeader();
    this._d.doRender();
  }

  /**
   * 초기 정렬 목록을 조용히 적용한다(렌더/이벤트 없이 데이터만). / Silently seed the initial sort list (data only, no render/events).
   *
   * @param sortList - 초기화 시 적용할 정렬 목록 / Sort list to apply at initialization
   */
  initSort(sortList: SortItem[]): void {
    this._sortList = [...sortList];
    this._d.getData().applySort(this._sortList);
    this._d.onReproject?.();
  }

  /** 현재 정렬 목록의 복사본을 반환한다. / Return a copy of the current sort list. */
  getSortState(): SortItem[] { return [...this._sortList]; }

  // ─── 필터 ─────────────────────────────────────────────────
  /**
   * 특정 컬럼의 필터를 설정하고 적용한다. / Set and apply the filter for one column.
   *
   * @param field - 필터를 적용할 컬럼 field 명 / Column field to filter
   * @param filterItems - 적용할 필터 조건 목록 / Filter conditions to apply
   */
  setFilter(field: string, filterItems: FilterItem[]): void {
    this._filters[field] = filterItems;
    this.applyFilters();
    this._d.renderHeader();
    this._d.doRender();
    this._d.emit('filterChange', { field, filterItems, allFilters: this._filters });
    this._d.getOptions().onFilterChange?.({ field, filterItems, allFilters: this._filters });
  }

  /**
   * 필터를 해제한다(필드 지정 시 해당 필드만, 생략 시 전체). / Clear filters (one field if given, otherwise all).
   *
   * @param field - 해제할 컬럼 field 명. 생략하면 전체 필터 해제 / Column field to clear; omit to clear every filter
   */
  resetFilter(field?: string): void {
    if (field) delete this._filters[field];
    else this._filters = {};
    this.applyFilters();
    this._d.renderHeader();
    this._d.doRender();
  }

  /** 현재 컬럼별 필터 상태의 복사본을 반환한다. / Return a copy of the current per-column filter state. */
  getFilterState(): Record<string, FilterItem[]> { return { ...this._filters }; }

  /**
   * 저장된 필터 상태를 복원하고 재적용한다(헤더/바디 재렌더는 호출측 책임). / Restore a saved filter state and reapply it (caller is responsible for header/body re-render).
   *
   * @param state - 복원할 컬럼별 필터 상태 / Per-column filter state to restore
   */
  restoreFilter(state: Record<string, FilterItem[]>): void {
    this._filters = { ...state };
    this.applyFilters();
  }

  /**
   * 통합검색 + 컬럼 필터를 데이터 레이어에 적용하고 행수를 재투영한다. / Apply find-filter and column filters to the data layer, then re-project row counts.
   *
   * 정렬과 달리 이 메서드는 헤더/바디를 직접 재렌더하지 않는다(호출측이 필요 시 처리).
   * / Unlike sorting, this does not re-render header/body itself (callers handle that as needed).
   */
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
