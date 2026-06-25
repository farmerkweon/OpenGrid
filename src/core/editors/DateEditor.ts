import type { CellEditor } from './CellEditor.js';
import type { RenderContext } from '../renderers/CellRenderer.js';
import { formatDate } from '../renderers/CellRenderer.js';

export class DateEditor implements CellEditor {
  private input!: HTMLInputElement;
  private _container!: HTMLElement;
  private _onCommit!: (v: any) => void;
  private _onCancel!: () => void;

  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void, onCancel: () => void): void {
    this._container = container;
    this._onCommit  = onCommit;
    this._onCancel  = onCancel;

    container.setAttribute('aria-haspopup', 'dialog');
    container.setAttribute('aria-expanded', 'true');

    this.input = document.createElement('input');
    this.input.type = 'date';
    this.input.className = 'og-cell-input';
    this.input.setAttribute('aria-label', ctx.column.header ?? '날짜 선택');

    const raw = ctx.value;
    if (raw) {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!isNaN(d.getTime())) {
        this.input.value = formatDate(d, 'yyyy-MM-dd');
      }
    }

    this.input.addEventListener('keydown', this._onKeyDown);
    this.input.addEventListener('blur',    this._onBlur);
    container.appendChild(this.input);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); this._onCommit(this.input.value); }
    else if (e.key === 'Escape') this._onCancel();
  };

  private _onBlur = (): void => { this._onCommit(this.input.value); };

  getValue(): any { return this.input?.value; }
  focus(): void   { this.input?.focus(); }

  destroy(): void {
    this._container?.setAttribute('aria-expanded', 'false');
    this.input?.removeEventListener('keydown', this._onKeyDown);
    this.input?.removeEventListener('blur',    this._onBlur);
  }
}
