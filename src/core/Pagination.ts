/**
 * 페이지 변경 시 전달되는 이벤트 페이로드. / Event payload delivered on a page change.
 */
export interface PageChangeEvent {
  /** 현재(변경 후) 페이지 번호(1-base). / Current (post-change) page number (1-based). */
  page: number;
  /** 페이지당 행 수. / Rows per page. */
  pageSize: number;
  /** 전체 행 수. / Total row count. */
  totalRows: number;
  /** 전체 페이지 수. / Total page count. */
  totalPages: number;
}

/** 페이지 변경 콜백. / Callback invoked on a page change. */
export type PageChangeFn = (e: PageChangeEvent) => void;

/** i18n: 페이지네이션 라벨 해석기(행/페이지·범위 배지·빈 상태). / i18n: pagination label resolver (rows-per-page, range badge, empty). */
export type PaginationT = (key: string, params?: Record<string, string | number>) => string;

/** i18n 미주입(직접 생성) 폴백 — 전역 t 없이도 동작(byte-identical ko). / Fallback when i18n is not injected (standalone) — works without global t (byte-identical ko). */
const _KO_FALLBACK: Record<string, string> = {
  'pagination.rowsPerPage': '행/페이지:',
  'pagination.empty': '0건',
};
/** @internal i18n 미주입 시 사용하는 기본 라벨 해석기. / Default label resolver used when i18n is not injected. */
function _defaultT(key: string, params?: Record<string, string | number>): string {
  if (key === 'pagination.rangeBadge') return `${params?.from}–${params?.to} / ${params?.total}건`;
  return _KO_FALLBACK[key] ?? key;
}

/**
 * 그리드 하단 페이지네이션 UI + 상태 관리. / Grid bottom pagination UI plus state management.
 *
 * DataLayer의 `_displayIndexes` 슬라이싱 범위(`getRange`)를 계산해 넘겨준다.
 * / Computes the slice range (`getRange`) used against DataLayer's `_displayIndexes`.
 */
export class Pagination {
  private _el: HTMLElement;
  private _page = 1;
  private _pageSize: number;
  private _totalRows = 0;
  private _onChange: PageChangeFn;
  private _t: PaginationT;

  constructor(container: HTMLElement, pageSize: number, onChange: PageChangeFn, t?: PaginationT) {
    this._pageSize = pageSize;
    this._onChange = onChange;
    this._t = t ?? _defaultT;

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

  /** 현재 페이지 번호(1-base). / Current page number (1-based). */
  get page() { return this._page; }
  /** 페이지당 행 수. / Rows per page. */
  get pageSize() { return this._pageSize; }
  /** 전체 페이지 수(최소 1). / Total page count (minimum 1). */
  get totalPages() { return Math.max(1, Math.ceil(this._totalRows / this._pageSize)); }

  /**
   * 전체 행 수 갱신 → 현재 페이지 유효성 검사 후 재렌더. / Update the total row count, clamp the current page if needed, and re-render.
   *
   * @param n - 새 전체 행 수 / New total row count
   */
  setTotalRows(n: number): void {
    this._totalRows = n;
    if (this._page > this.totalPages) this._page = this.totalPages;
    this._render();
  }

  /**
   * 페이지당 행 수를 변경하고 1페이지로 리셋한다. / Change rows-per-page and reset to page 1.
   *
   * @param size - 새 페이지당 행 수 / New rows-per-page value
   */
  setPageSize(size: number): void {
    this._pageSize = size;
    this._page = 1;
    this._render();
    this._emit();
  }

  /**
   * 지정 페이지로 이동한다(범위를 벗어나면 클램프). / Navigate to the given page (clamped to valid range).
   *
   * @param page - 이동할 페이지 번호(1-base) / Target page number (1-based)
   */
  goTo(page: number): void {
    const p = Math.max(1, Math.min(page, this.totalPages));
    if (p === this._page) return;
    this._page = p;
    this._render();
    this._emit();
  }

  /**
   * 현재 페이지의 `[startIndex, endIndex]` 반환(DataLayer 인덱스 기준). / Return `[startIndex, endIndex]` for the current page (DataLayer index space).
   *
   * @returns 현재 페이지의 시작/끝 인덱스(포함) / Start/end index (inclusive) for the current page
   */
  getRange(): { start: number; end: number } {
    const start = (this._page - 1) * this._pageSize;
    const end   = Math.min(start + this._pageSize - 1, this._totalRows - 1);
    return { start, end };
  }

  /** @internal 현재 상태로 `onChange` 콜백을 실행한다. / Invokes the `onChange` callback with the current state. */
  private _emit(): void {
    this._onChange({
      page: this._page, pageSize: this._pageSize,
      totalRows: this._totalRows, totalPages: this.totalPages,
    });
  }

  /** @internal 페이지네이션 바 DOM 을 전체 재렌더한다. / Fully re-renders the pagination bar DOM. */
  private _render(): void {
    this._el.innerHTML = '';
    const total = this.totalPages;

    // 페이지 크기 선택
    const sizeWrap = document.createElement('span');
    sizeWrap.style.cssText = 'display:flex;align-items:center;gap:3px;margin-right:8px;';
    const sizeLabel = document.createElement('span');
    sizeLabel.textContent = this._t('pagination.rowsPerPage');
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
      ? this._t('pagination.rangeBadge', { from: start + 1, to: end + 1, total: this._totalRows })
      : this._t('pagination.empty');
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

  /** i18n: 상주 크롬 라벨을 활성 로케일로 다시 그린다(setLocale 경로). / i18n: repaint resident chrome labels in the active locale (setLocale path). */
  refreshLabels(): void {
    this._render();
  }

  /** 페이지네이션 바 DOM 을 제거한다. / Remove the pagination bar DOM. */
  destroy(): void {
    this._el.remove();
  }
}

/**
 * 현재 페이지 기준 표시할 페이지 번호 배열을 계산한다(`-1` = 생략 부호).
 * / Compute the array of page numbers to display around the current page (`-1` = ellipsis).
 *
 * @param current - 현재 페이지 번호 / Current page number
 * @param total - 전체 페이지 수 / Total page count
 * @returns 표시할 페이지 번호(및 `-1` 생략 표시) 배열 / Array of page numbers to display (with `-1` for ellipsis)
 */
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
