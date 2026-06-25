import type { ColumnDef } from '../types.js';
import type { RenderContext } from '../renderers/CellRenderer.js';
export { DateEditor } from './DateEditor.js';
export { SelectEditor } from './SelectEditor.js';
import { DateEditor } from './DateEditor.js';
import { SelectEditor } from './SelectEditor.js';

export interface EditorResult {
  committed: boolean;
  value: any;
}

export interface CellEditor {
  mount(container: HTMLElement, ctx: RenderContext, onCommit: (value: any) => void, onCancel: () => void): void;
  getValue(): any;
  focus(): void;
  destroy(): void;
}

// ─── TextEditor ───────────────────────────────────────────
export class TextEditor implements CellEditor {
  private input!: HTMLInputElement;
  private _onCommit!: (v: any) => void;
  private _onCancel!: () => void;

  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void, onCancel: () => void): void {
    this._onCommit = onCommit;
    this._onCancel = onCancel;

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.value = ctx.value == null ? '' : String(ctx.value);
    this.input.style.cssText = `
      width:100%;height:100%;border:none;outline:none;padding:0 8px;
      font-size:var(--og-font-size,13px);font-family:var(--og-font-family,sans-serif);
      background:var(--og-row-bg,#fff);box-sizing:border-box;
    `;

    this.input.addEventListener('keydown', this._onKeyDown);
    this.input.addEventListener('blur', this._onBlur);
    container.appendChild(this.input);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this._onCommit(this.input.value);
    } else if (e.key === 'Escape') {
      this._onCancel();
    }
  };

  private _onBlur = (): void => {
    this._onCommit(this.input.value);
  };

  getValue(): any { return this.input?.value; }

  focus(): void {
    this.input?.focus();
    this.input?.select();
  }

  destroy(): void {
    this.input?.removeEventListener('keydown', this._onKeyDown);
    this.input?.removeEventListener('blur', this._onBlur);
  }
}

// ─── NumberEditor ─────────────────────────────────────────
export class NumberEditor implements CellEditor {
  private input!: HTMLInputElement;
  private _onCommit!: (v: any) => void;
  private _onCancel!: () => void;
  private min: number | undefined;
  private max: number | undefined;
  private step: number | undefined;

  constructor(opts?: { min?: number; max?: number; step?: number }) {
    this.min = opts?.min;
    this.max = opts?.max;
    this.step = opts?.step;
  }

  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void, onCancel: () => void): void {
    this._onCommit = onCommit;
    this._onCancel = onCancel;

    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.value = ctx.value == null ? '' : String(ctx.value);
    if (this.min != null) this.input.min = String(this.min);
    if (this.max != null) this.input.max = String(this.max);
    if (this.step != null) this.input.step = String(this.step);
    this.input.style.cssText = `
      width:100%;height:100%;border:none;outline:none;padding:0 8px;
      font-size:var(--og-font-size,13px);text-align:right;
      background:var(--og-row-bg,#fff);box-sizing:border-box;
    `;
    this.input.addEventListener('keydown', this._onKeyDown);
    this.input.addEventListener('blur', this._onBlur);
    container.appendChild(this.input);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this._commit(); }
    else if (e.key === 'Escape') this._onCancel();
  };

  private _onBlur = (): void => { this._commit(); };

  private _commit(): void {
    const v = this.input.value === '' ? null : Number(this.input.value);
    this._onCommit(v);
  }

  getValue(): any { return this.input?.value === '' ? null : Number(this.input?.value); }
  focus(): void { this.input?.focus(); this.input?.select(); }
  destroy(): void {
    this.input?.removeEventListener('keydown', this._onKeyDown);
    this.input?.removeEventListener('blur', this._onBlur);
  }
}


// ─── CheckboxEditor ───────────────────────────────────────
export class CheckboxEditor implements CellEditor {
  private chk!: HTMLInputElement;
  private _onCommit!: (v: any) => void;

  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void, _onCancel: () => void): void {
    this._onCommit = onCommit;
    container.style.cssText += 'display:flex;align-items:center;justify-content:center;';

    this.chk = document.createElement('input');
    this.chk.type = 'checkbox';
    this.chk.checked = !!ctx.value;
    this.chk.style.cursor = 'pointer';
    this.chk.addEventListener('change', () => onCommit(this.chk.checked));
    container.appendChild(this.chk);
  }

  getValue(): any { return this.chk?.checked; }
  focus(): void { this.chk?.focus(); }
  destroy(): void {}
}

// ─── Editor 팩토리 ────────────────────────────────────────
export function createEditor(col: ColumnDef): CellEditor {
  const editor = col.editor;
  if (!editor) {
    switch (col.type as string) {
      case 'number':  return new NumberEditor();
      case 'date':    return new DateEditor();
      case 'boolean': return new CheckboxEditor();
      case 'select':  return new SelectEditor(col.options ?? [], col.optionsFn as any);
      default:        return new TextEditor();
    }
  }
  if (typeof editor === 'string') {
    switch (editor) {
      case 'number':   return new NumberEditor();
      case 'date':     return new DateEditor();
      case 'select':   return new SelectEditor(col.options ?? [], col.optionsFn as any);
      case 'checkbox': return new CheckboxEditor();
      default:         return new TextEditor();
    }
  }
  // EditorDef 객체
  switch (editor.type) {
    case 'number': {
      const opts: { min?: number; max?: number; step?: number } = {};
      if (editor.min != null) opts.min = editor.min;
      if (editor.max != null) opts.max = editor.max;
      if (editor.step != null) opts.step = editor.step;
      return new NumberEditor(opts);
    }
    case 'date':     return new DateEditor();
    case 'select':   return new SelectEditor(editor.options ?? [], col.optionsFn as any);
    case 'checkbox': return new CheckboxEditor();
    default:         return new TextEditor();
  }
}
