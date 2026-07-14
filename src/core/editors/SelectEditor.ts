import type { CellEditor } from './CellEditor.js';
import type { RenderContext } from '../renderers/CellRenderer.js';
import { ctxT } from '../renderers/CellRenderer.js';

/**
 * 셀렉트 옵션. 문자열(라벨=값) 또는 `{ label|text, value }` 객체 형식.
 * / A select option: a string (label = value) or a `{ label|text, value }` object.
 */
export type SelectOption = string | { label?: string; text?: string; value: any };

/**
 * 다양한 옵션 형식을 `{ label, value }` 로 정규화한다. / Normalize the various option shapes into `{ label, value }`.
 *
 * @param raw - 원본 옵션 배열 / Raw option array
 * @returns 정규화된 `{ label, value }` 배열 / Normalized `{ label, value }` array
 */
function normalizeOptions(raw: SelectOption[]): Array<{ label: string; value: any }> {
  return raw.map(o => {
    if (typeof o === 'string') return { label: o, value: o };
    const label = (o as any).label ?? (o as any).text ?? String((o as any).value ?? '');
    return { label, value: (o as any).value };
  });
}

/**
 * 드롭다운 셀 편집기. 고정 옵션 배열 또는 행별 동적 옵션 함수로 `<select>` 를 구성한다.
 * / Dropdown cell editor. Builds a `<select>` from a fixed option array or a per-row dynamic options function.
 *
 * @example
 * // 고정 옵션 / fixed options
 * new SelectEditor(['대기', '진행', '완료']);
 * // 행별 동적 옵션 / per-row dynamic options
 * new SelectEditor([], (row) => row.type === 'A' ? ['a1', 'a2'] : ['b1']);
 */
export class SelectEditor implements CellEditor {
  private select!: HTMLSelectElement;
  private _container!: HTMLElement;
  private _onCommit!: (v: any) => void;
  private _onCancel!: () => void;
  private _options: Array<{ label: string; value: any }>;
  private _optionsFn: ((row: any, rowIndex: number) => SelectOption[]) | null;

  /**
   * @param options - 고정 옵션 배열 / Fixed option array
   * @param optionsFn - 행별 동적 옵션 함수(있으면 options 대신 사용) / Per-row dynamic options function (used instead of options when present)
   */
  constructor(
    options: SelectOption[] = [],
    optionsFn?: (row: any, rowIndex: number) => SelectOption[]
  ) {
    this._options   = normalizeOptions(options);
    this._optionsFn = optionsFn ?? null;
  }

  /**
   * 편집기를 컨테이너에 마운트한다. / Mount the editor into a container.
   *
   * @param container - 편집기를 붙일 셀 요소 / Cell element to attach the editor to
   * @param ctx - 렌더 컨텍스트(값·컬럼·행 등) / Render context (value, column, row, …)
   * @param onCommit - 값 확정 콜백 / Callback to commit a value
   * @param onCancel - 편집 취소 콜백 / Callback to cancel editing
   */
  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void, onCancel: () => void): void {
    this._container = container;
    this._onCommit  = onCommit;
    this._onCancel  = onCancel;

    container.setAttribute('aria-haspopup', 'listbox');
    container.setAttribute('aria-expanded', 'true');

    this.select = document.createElement('select');
    this.select.className = 'og-cell-select';
    this.select.setAttribute('aria-label', ctx.column.header ?? ctxT(ctx, 'editor.select'));

    const resolved = this._optionsFn
      ? normalizeOptions(this._optionsFn(ctx.row, ctx.rowIndex))
      : this._options;

    for (const opt of resolved) {
      const el = document.createElement('option');
      el.value       = String(opt.value);
      el.textContent = opt.label;
      this.select.appendChild(el);
    }

    const cur = ctx.value == null ? '' : String(ctx.value);
    if (resolved.some(o => String(o.value) === cur)) this.select.value = cur;

    this.select.addEventListener('change',  () => onCommit(this.select.value));
    this.select.addEventListener('blur',    () => onCommit(this.select.value));
    this.select.addEventListener('keydown', (e) => { if (e.key === 'Escape') onCancel(); });
    container.appendChild(this.select);
  }

  /** 현재 선택된 값(문자열)을 반환. / Return the currently selected value (string). */
  getValue(): any { return this.select?.value; }
  /** 셀렉트 요소에 포커스. / Focus the select element. */
  focus(): void   { this.select?.focus(); }

  /** aria 상태 원복(리스너는 요소 제거 시 함께 정리됨). / Reset aria state (listeners are cleaned up when the element is removed). */
  destroy(): void {
    this._container?.setAttribute('aria-expanded', 'false');
  }
}
