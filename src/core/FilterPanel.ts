import type { FilterItem } from './types.js';
import { t as _globalT } from './i18n/LocaleRegistry.js';

/** 필터 적용 콜백. / Callback invoked when a filter is applied. */
export type FilterApplyFn = (field: string, items: FilterItem[]) => void;
/** 필터 해제 콜백. / Callback invoked when a filter is cleared. */
export type FilterClearFn = (field: string) => void;
/** i18n: 필터 라벨 로케일 해석기(주입 없으면 전역 t). / i18n: filter-label resolver (global t when not injected). */
export type FilterPanelT = (key: string, params?: Record<string, string | number>) => string;

/**
 * 컬럼 헤더 필터 드롭다운 패널. / Column-header filter dropdown panel.
 *
 * 단일 인스턴스를 재사용하며, 열릴 때마다 대상 컬럼(`field`)과 앵커 기준 위치를
 * 재계산한다. / Reuses a single instance; on each open it recomputes the target
 * column (`field`) and its anchor-relative position.
 */
export class FilterPanel {
  private _el: HTMLElement;
  private _field = '';
  private _onApply: FilterApplyFn;
  private _onClear: FilterClearFn;
  private _t: FilterPanelT;
  private _outsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement, onApply: FilterApplyFn, onClear: FilterClearFn, t?: FilterPanelT) {
    this._onApply = onApply;
    this._onClear = onClear;
    this._t = t ?? _globalT;

    this._el = document.createElement('div');
    this._el.className = 'og-filter-panel';
    this._el.style.cssText = `
      position:absolute;z-index:1000;min-width:200px;max-width:280px;
      background:var(--og-row-bg,#fff);border:1px solid var(--og-border-color,#e0e0e0);
      border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.15);
      padding:10px;box-sizing:border-box;display:none;font-size:13px;
    `;
    container.appendChild(this._el);
  }

  /**
   * 지정 컬럼의 필터 패널을 앵커 엘리먼트 아래에 연다. / Open the filter panel for the given column, anchored below `anchorEl`.
   *
   * @param field - 필터 대상 컬럼 field 명 / Field name of the column to filter
   * @param anchorEl - 위치 기준이 되는 헤더 엘리먼트(보통 필터 아이콘) / Header element used as the position anchor (typically the filter icon)
   * @param currentFilters - 해당 컬럼에 이미 적용된 필터(있으면 입력값 프리필) / Filters already applied to this column (pre-fills the inputs, if any)
   */
  open(field: string, anchorEl: HTMLElement, currentFilters: FilterItem[]): void {
    this._field = field;
    this._el.innerHTML = '';

    // 제목
    const title = document.createElement('div');
    title.textContent = this._t('filter.title');
    title.style.cssText = `font-weight:600;margin-bottom:8px;color:var(--og-text-color,#333);`;
    this._el.appendChild(title);

    // 조건 선택
    const condRow = document.createElement('div');
    condRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';

    const condSel = document.createElement('select');
    condSel.style.cssText = `flex:1;padding:3px 4px;border:1px solid var(--og-border-color,#e0e0e0);border-radius:3px;font-size:12px;`;
    const conditions: Array<{ label: string; value: FilterItem['operator'] }> = [
      { label: this._t('filter.opContains'), value: 'contains' },
      { label: this._t('filter.opEq'), value: '=' },
      { label: this._t('filter.opNe'), value: '!=' },
      { label: this._t('filter.opStartsWith'), value: 'startsWith' },
      { label: this._t('filter.opEndsWith'), value: 'endsWith' },
      { label: this._t('filter.opGt'), value: '>' },
      { label: this._t('filter.opLt'), value: '<' },
      { label: this._t('filter.opGte'), value: '>=' },
      { label: this._t('filter.opLte'), value: '<=' },
    ];
    for (const c of conditions) {
      const opt = document.createElement('option');
      opt.value = c.value;
      opt.textContent = c.label;
      condSel.appendChild(opt);
    }
    if (currentFilters[0]) condSel.value = currentFilters[0].operator;
    condRow.appendChild(condSel);
    this._el.appendChild(condRow);

    // 값 입력
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = this._t('filter.valuePlaceholder');
    valueInput.value = currentFilters[0]?.value ?? '';
    valueInput.style.cssText = `
      width:100%;padding:4px 6px;border:1px solid var(--og-border-color,#e0e0e0);
      border-radius:3px;font-size:12px;box-sizing:border-box;margin-bottom:8px;
      outline:none;
    `;
    valueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyBtn.click();
      else if (e.key === 'Escape') this.close();
    });
    this._el.appendChild(valueInput);

    // 버튼 행
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = this._t('filter.clear');
    clearBtn.style.cssText = `
      padding:3px 10px;border:1px solid var(--og-border-color,#e0e0e0);
      border-radius:3px;background:#fff;cursor:pointer;font-size:12px;color:#666;
    `;
    clearBtn.addEventListener('click', () => {
      this._onClear(this._field);
      this.close();
    });

    const applyBtn = document.createElement('button');
    applyBtn.textContent = this._t('filter.apply');
    applyBtn.style.cssText = `
      padding:3px 10px;border:1px solid var(--og-primary,#1976d2);
      border-radius:3px;background:var(--og-primary,#1976d2);
      color:#fff;cursor:pointer;font-size:12px;
    `;
    applyBtn.addEventListener('click', () => {
      const val = valueInput.value.trim();
      if (!val) {
        this._onClear(this._field);
      } else {
        this._onApply(this._field, [{ operator: condSel.value as FilterItem['operator'], value: val }]);
      }
      this.close();
    });

    btnRow.appendChild(clearBtn);
    btnRow.appendChild(applyBtn);
    this._el.appendChild(btnRow);

    // 위치 계산 (앵커 기준)
    const rect = anchorEl.getBoundingClientRect();
    const containerRect = this._el.parentElement!.getBoundingClientRect();
    this._el.style.top = `${rect.bottom - containerRect.top + 2}px`;
    this._el.style.left = `${Math.min(rect.left - containerRect.left, containerRect.width - 220)}px`;
    this._el.style.display = 'block';

    requestAnimationFrame(() => valueInput.focus());

    // 외부 클릭 시 닫기
    if (this._outsideHandler) document.removeEventListener('mousedown', this._outsideHandler);
    this._outsideHandler = (e: MouseEvent) => {
      if (!this._el.contains(e.target as Node) && e.target !== anchorEl) {
        this.close();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', this._outsideHandler!), 0);
  }

  /** 필터 패널을 숨기고 외부 클릭 리스너를 해제한다. / Hide the filter panel and detach the outside-click listener. */
  close(): void {
    this._el.style.display = 'none';
    if (this._outsideHandler) {
      document.removeEventListener('mousedown', this._outsideHandler);
      this._outsideHandler = null;
    }
  }

  /** 패널이 현재 열려 있는지 여부. / Whether the panel is currently open. */
  get isOpen(): boolean {
    return this._el.style.display !== 'none';
  }

  /** 패널을 닫고 DOM 에서 제거한다. / Close the panel and remove it from the DOM. */
  destroy(): void {
    this.close();
    this._el.remove();
  }
}
