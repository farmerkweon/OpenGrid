import type { FilterItem } from './types.js';

export type FilterApplyFn = (field: string, items: FilterItem[]) => void;
export type FilterClearFn = (field: string) => void;

/**
 * 컬럼 헤더 필터 드롭다운 패널.
 * 단일 인스턴스를 재사용(열릴 때 위치 재계산).
 */
export class FilterPanel {
  private _el: HTMLElement;
  private _field = '';
  private _onApply: FilterApplyFn;
  private _onClear: FilterClearFn;
  private _outsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement, onApply: FilterApplyFn, onClear: FilterClearFn) {
    this._onApply = onApply;
    this._onClear = onClear;

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

  open(field: string, anchorEl: HTMLElement, currentFilters: FilterItem[]): void {
    this._field = field;
    this._el.innerHTML = '';

    // 제목
    const title = document.createElement('div');
    title.textContent = '필터';
    title.style.cssText = `font-weight:600;margin-bottom:8px;color:var(--og-text-color,#333);`;
    this._el.appendChild(title);

    // 조건 선택
    const condRow = document.createElement('div');
    condRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';

    const condSel = document.createElement('select');
    condSel.style.cssText = `flex:1;padding:3px 4px;border:1px solid var(--og-border-color,#e0e0e0);border-radius:3px;font-size:12px;`;
    const conditions: Array<{ label: string; value: FilterItem['operator'] }> = [
      { label: '포함', value: 'contains' },
      { label: '같음', value: '=' },
      { label: '같지 않음', value: '!=' },
      { label: '시작', value: 'startsWith' },
      { label: '끝남', value: 'endsWith' },
      { label: '보다 큼', value: '>' },
      { label: '보다 작음', value: '<' },
      { label: '이상', value: '>=' },
      { label: '이하', value: '<=' },
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
    valueInput.placeholder = '필터 값 입력...';
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
    clearBtn.textContent = '초기화';
    clearBtn.style.cssText = `
      padding:3px 10px;border:1px solid var(--og-border-color,#e0e0e0);
      border-radius:3px;background:#fff;cursor:pointer;font-size:12px;color:#666;
    `;
    clearBtn.addEventListener('click', () => {
      this._onClear(this._field);
      this.close();
    });

    const applyBtn = document.createElement('button');
    applyBtn.textContent = '적용';
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

  close(): void {
    this._el.style.display = 'none';
    if (this._outsideHandler) {
      document.removeEventListener('mousedown', this._outsideHandler);
      this._outsideHandler = null;
    }
  }

  get isOpen(): boolean {
    return this._el.style.display !== 'none';
  }

  destroy(): void {
    this.close();
    this._el.remove();
  }
}
