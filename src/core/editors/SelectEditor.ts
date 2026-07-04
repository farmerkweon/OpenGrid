import type { CellEditor } from './CellEditor.js';
import type { RenderContext } from '../renderers/CellRenderer.js';
import { ctxT } from '../renderers/CellRenderer.js';

export type SelectOption = string | { label?: string; text?: string; value: any };

function normalizeOptions(raw: SelectOption[]): Array<{ label: string; value: any }> {
  return raw.map(o => {
    if (typeof o === 'string') return { label: o, value: o };
    const label = (o as any).label ?? (o as any).text ?? String((o as any).value ?? '');
    return { label, value: (o as any).value };
  });
}

export class SelectEditor implements CellEditor {
  private select!: HTMLSelectElement;
  private _container!: HTMLElement;
  private _onCommit!: (v: any) => void;
  private _onCancel!: () => void;
  private _options: Array<{ label: string; value: any }>;
  private _optionsFn: ((row: any, rowIndex: number) => SelectOption[]) | null;

  constructor(
    options: SelectOption[] = [],
    optionsFn?: (row: any, rowIndex: number) => SelectOption[]
  ) {
    this._options   = normalizeOptions(options);
    this._optionsFn = optionsFn ?? null;
  }

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

  getValue(): any { return this.select?.value; }
  focus(): void   { this.select?.focus(); }

  destroy(): void {
    this._container?.setAttribute('aria-expanded', 'false');
  }
}
