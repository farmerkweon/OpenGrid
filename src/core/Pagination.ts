export interface PageChangeEvent {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export type PageChangeFn = (e: PageChangeEvent) => void;

/**
 * 그리드 하단 페이지네이션 UI + 상태 관리.
 * DataLayer의 _displayIndexes 슬라이싱을 담당.
 */
export class Pagination {
  private _el: HTMLElement;
  private _page = 1;
  private _pageSize: number;
  private _totalRows = 0;
  private _onChange: PageChangeFn;

  constructor(container: HTMLElement, pageSize: number, onChange: PageChangeFn) {
    this._pageSize = pageSize;
    this._onChange = onChange;

    this._el = document.createElement('div');
    this._el.className = 'og-pagination';
    this._el.style.cssText = `
      display:flex;align-items:center;justify-content:center;gap:4px;
      padding:6px 8px;border-top:1px solid var(--og-border-color,#e0e0e0);
      background:var(--og-header-bg,#f5f5f5);flex-shrink:0;user-select:none;
      font-size:12px;color:var(--og-text-color,#333);
    `;
    container.appendChild(this._el);
    this._render();
  }

  get page() { return this._page; }
  get pageSize() { return this._pageSize; }
  get totalPages() { return Math.max(1, Math.ceil(this._totalRows / this._pageSize)); }

  /** 전체 행 수 갱신 → 현재 페이지 유효성 검사 후 재렌더 */
  setTotalRows(n: number): void {
    this._totalRows = n;
    if (this._page > this.totalPages) this._page = this.totalPages;
    this._render();
  }

  setPageSize(size: number): void {
    this._pageSize = size;
    this._page = 1;
    this._render();
    this._emit();
  }

  goTo(page: number): void {
    const p = Math.max(1, Math.min(page, this.totalPages));
    if (p === this._page) return;
    this._page = p;
    this._render();
    this._emit();
  }

  /** 현재 페이지의 [startIndex, endIndex] 반환 (DataLayer 인덱스 기준) */
  getRange(): { start: number; end: number } {
    const start = (this._page - 1) * this._pageSize;
    const end   = Math.min(start + this._pageSize - 1, this._totalRows - 1);
    return { start, end };
  }

  private _emit(): void {
    this._onChange({
      page: this._page, pageSize: this._pageSize,
      totalRows: this._totalRows, totalPages: this.totalPages,
    });
  }

  private _render(): void {
    this._el.innerHTML = '';
    const total = this.totalPages;

    // 페이지 크기 선택
    const sizeWrap = document.createElement('span');
    sizeWrap.style.cssText = 'display:flex;align-items:center;gap:3px;margin-right:8px;';
    const sizeLabel = document.createElement('span');
    sizeLabel.textContent = '행/페이지:';
    sizeLabel.style.color = '#888';
    const sizeSel = document.createElement('select');
    sizeSel.style.cssText = `padding:2px 4px;border:1px solid var(--og-border-color,#e0e0e0);border-radius:3px;font-size:11px;cursor:pointer;`;
    for (const s of [10, 20, 50, 100, 200]) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = String(s);
      if (s === this._pageSize) opt.selected = true;
      sizeSel.appendChild(opt);
    }
    sizeSel.addEventListener('change', () => this.setPageSize(Number(sizeSel.value)));
    sizeWrap.appendChild(sizeLabel);
    sizeWrap.appendChild(sizeSel);
    this._el.appendChild(sizeWrap);

    // 총 행 수
    const info = document.createElement('span');
    const { start, end } = this.getRange();
    info.textContent = this._totalRows > 0
      ? `${start + 1}–${end + 1} / ${this._totalRows}건`
      : '0건';
    info.style.cssText = 'margin-right:8px;color:#888;';
    this._el.appendChild(info);

    // 이전/다음 버튼 + 페이지 번호
    const mkBtn = (label: string, page: number, disabled: boolean) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.disabled = disabled;
      btn.style.cssText = `
        min-width:28px;height:24px;padding:0 6px;
        border:1px solid var(--og-border-color,#e0e0e0);border-radius:3px;
        background:${disabled ? '#f5f5f5' : '#fff'};
        color:${disabled ? '#bbb' : 'var(--og-text-color,#333)'};
        cursor:${disabled ? 'default' : 'pointer'};font-size:12px;
      `;
      if (!disabled) btn.addEventListener('click', () => this.goTo(page));
      return btn;
    };

    this._el.appendChild(mkBtn('«', 1, this._page === 1));
    this._el.appendChild(mkBtn('‹', this._page - 1, this._page === 1));

    // 페이지 번호 (최대 5개 표시)
    const range = _pageRange(this._page, total);
    for (const p of range) {
      if (p === -1) {
        const dot = document.createElement('span');
        dot.textContent = '…';
        dot.style.padding = '0 3px';
        this._el.appendChild(dot);
      } else {
        const btn = mkBtn(String(p), p, p === this._page);
        if (p === this._page) {
          btn.style.background = 'var(--og-primary,#1976d2)';
          btn.style.color = '#fff';
          btn.style.borderColor = 'var(--og-primary,#1976d2)';
        }
        this._el.appendChild(btn);
      }
    }

    this._el.appendChild(mkBtn('›', this._page + 1, this._page === total));
    this._el.appendChild(mkBtn('»', total, this._page === total));
  }

  destroy(): void {
    this._el.remove();
  }
}

/** 현재 페이지 기준 표시할 페이지 번호 배열 (-1 = ellipsis) */
function _pageRange(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: number[] = [1];
  if (current > 3) pages.push(-1);
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push(-1);
  pages.push(total);
  return pages;
}
