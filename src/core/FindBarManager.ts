import type { ColumnLayout } from './ColumnLayout.js';
import type { DataLayer } from './DataLayer.js';
import type { Pagination } from './Pagination.js';
import type { VirtualScroll } from './VirtualScroll.js';

export interface FindBarDeps<T extends Record<string, any>> {
  getColLayout: () => ColumnLayout<T>;
  getData: () => DataLayer<T>;
  getFilters: () => Record<string, any[]>;
  getVs: () => VirtualScroll | null;
  getPagination: () => Pagination | null;
  doRender: () => void;
  /** i18n: 메시지 해석(라벨/placeholder/aria/카운트 배지). / i18n: resolve labels/placeholder/aria/count badge. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

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

  get findFilter(): string { return this._filter; }

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

  open(): void {
    if (!this._bar) return;
    this._bar.hidden = false;
    this._input!.focus();
    this._input!.select();
  }

  close(): void {
    if (!this._bar) return;
    this._bar.hidden   = true;
    this._filter       = '';
    this._input!.value = '';
    if (this._count) this._count.textContent = '';
    this._apply();
  }

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
