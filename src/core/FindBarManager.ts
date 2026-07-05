import type { ColumnLayout } from './ColumnLayout.js';
import type { DataLayer } from './DataLayer.js';
import type { Pagination } from './Pagination.js';
import type { VirtualScroll } from './VirtualScroll.js';

/**
 * FindBarManager 의존성 주입 인터페이스. / Dependency-injection interface for FindBarManager.
 */
export interface FindBarDeps<T extends Record<string, any>> {
  /** 현재 컬럼 레이아웃(검색 대상 필드 조회용). / Current column layout (for resolving searchable fields). */
  getColLayout: () => ColumnLayout<T>;
  /** 그리드 데이터 레이어(찾기/필터 적용 대상). / Grid data layer to apply the find filter against. */
  getData: () => DataLayer<T>;
  /** 현재 활성 컬럼 필터(찾기와 함께 재적용). / Currently active column filters (reapplied alongside the find filter). */
  getFilters: () => Record<string, any[]>;
  /** 가상 스크롤 인스턴스(행수 갱신용). 없으면 `null`. / Virtual-scroll instance (for updating row count); `null` if absent. */
  getVs: () => VirtualScroll | null;
  /** 페이지네이션 인스턴스(행수 갱신용). 없으면 `null`. / Pagination instance (for updating row count); `null` if absent. */
  getPagination: () => Pagination | null;
  /** 필터 적용 후 그리드 재렌더를 트리거. / Triggers a grid re-render after the filter is applied. */
  doRender: () => void;
  /** i18n: 메시지 해석(라벨/placeholder/aria/카운트 배지). / i18n: resolve labels/placeholder/aria/count badge. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 그리드 상단 찾기(find) 바 관리자. / Manages the grid's top find bar.
 *
 * 입력값을 표시 중인 모든 컬럼에 대한 부분 일치 필터로 변환해 {@link DataLayer}에
 * 적용하고, 가상 스크롤/페이지네이션의 행 수를 함께 갱신한다.
 * / Turns the input value into a substring-match filter across all visible columns,
 * applies it via {@link DataLayer}, and keeps virtual-scroll/pagination row counts in sync.
 */
export class FindBarManager<T extends Record<string, any> = any> {
  private _bar:    HTMLElement | null = null;
  private _input:  HTMLInputElement | null = null;
  private _count:  HTMLElement | null = null;
  private _lbl:    HTMLElement | null = null;
  private _close:  HTMLElement | null = null;
  private _filter: string = '';
  private _d: FindBarDeps<T>;

  constructor(deps: FindBarDeps<T>) {
    this._d = deps;
  }

  /** 현재 찾기 입력값. / Current find-bar input value. */
  get findFilter(): string { return this._filter; }

  /**
   * 찾기 바 DOM 을 생성하고 컨테이너 최상단에 삽입한다. / Build the find-bar DOM and insert it at the top of the container.
   *
   * @param container - 그리드 컨테이너 엘리먼트 / Grid container element
   */
  init(container: HTMLElement): void {
    const bar = document.createElement('div');
    bar.className = 'og-find-bar';
    bar.hidden    = true;

    const lbl = document.createElement('span');
    lbl.className   = 'og-find-label';
    lbl.textContent = this._d.t('findBar.label');

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'og-find-input';
    input.placeholder = this._d.t('findBar.placeholder');
    input.setAttribute('aria-label', this._d.t('findBar.searchAria'));

    const count = document.createElement('span');
    count.className = 'og-find-count';

    const closeBtn = document.createElement('button');
    closeBtn.className   = 'og-find-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', this._d.t('findBar.closeAria'));

    bar.appendChild(lbl);
    bar.appendChild(input);
    bar.appendChild(count);
    bar.appendChild(closeBtn);

    container.insertBefore(bar, container.firstChild);

    input.addEventListener('input', () => {
      this._filter = input.value.trim();
      this._apply();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    closeBtn.addEventListener('click', () => this.close());

    this._bar   = bar;
    this._input = input;
    this._count = count;
    this._lbl   = lbl;
    this._close = closeBtn;
  }

  /** i18n: 상주 크롬 라벨을 활성 로케일로 다시 그린다(setLocale 경로). / i18n: repaint resident chrome labels in the active locale (setLocale path). */
  refreshLabels(): void {
    if (this._lbl)   this._lbl.textContent = this._d.t('findBar.label');
    if (this._input) {
      this._input.placeholder = this._d.t('findBar.placeholder');
      this._input.setAttribute('aria-label', this._d.t('findBar.searchAria'));
    }
    if (this._close) this._close.setAttribute('aria-label', this._d.t('findBar.closeAria'));
    if (this._count && this._filter) {
      this._count.textContent = this._d.t('findBar.countBadge', { n: this._d.getData().rowCount });
    }
  }

  /** 찾기 바를 표시하고 입력에 포커스한다. / Show the find bar and focus the input. */
  open(): void {
    if (!this._bar) return;
    this._bar.hidden = false;
    this._input!.focus();
    this._input!.select();
  }

  /** 찾기 바를 숨기고 필터를 해제한다. / Hide the find bar and clear the filter. */
  close(): void {
    if (!this._bar) return;
    this._bar.hidden   = true;
    this._filter       = '';
    this._input!.value = '';
    if (this._count) this._count.textContent = '';
    this._apply();
  }

  /** @internal 현재 찾기 필터를 데이터 레이어에 적용하고 재렌더한다. / Applies the current find filter to the data layer and re-renders. */
  private _apply(): void {
    const data   = this._d.getData();
    const fields = this._d.getColLayout().visibleLeaves.map(c => c.field);
    data.setFindFilter(this._filter, fields);
    data.applyFilter(this._d.getFilters());
    const n = data.rowCount;
    this._d.getVs()?.setTotalRows(n);
    this._d.getPagination()?.setTotalRows(n);
    if (this._count) this._count.textContent = this._filter ? this._d.t('findBar.countBadge', { n }) : '';
    this._d.doRender();
  }
}
