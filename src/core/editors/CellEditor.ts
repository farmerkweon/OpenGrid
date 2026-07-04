import type { ColumnDef, EditorDef } from '../types.js';
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

// ─── Editor 레지스트리 (R10, OCP — Replace Conditional with Registry) ────────
/**
 * R10(§6-R10, §2.5 R-4c, §3.1 C12): `createEditor` 삼중 switch 를 `Map<typeName, factory>`
 * 레지스트리로 대체한다. 내장 타입은 모듈 로드시 부트스트랩 등록, 미등록 타입은 기존과 동일하게
 * TextEditor 로 폴백한다. `registerEditor(typeName, factory)` 로 코어 편집 없이 커스텀 에디터를
 * 추가할 수 있다(OCP). 등록은 렌더러와 동일하게 **프로세스 전역**.
 *
 * 팩토리는 `(col, def)` 를 받는다. `def`(EditorDef 객체)는 객체 경로에서만 채워지며, 원 switch 의
 * 세 컨텍스트(col.type / 문자열 / 객체) 동작을 정확히 보존한다:
 *  - number 는 def 가 있으면 min/max/step 을 옵션으로, 없으면 기본 NumberEditor.
 *  - select 는 def 가 있으면 def.options, 없으면 col.options 를 쓴다(원 switch 와 동일).
 */
export type EditorFactory = (col: ColumnDef, def?: EditorDef) => CellEditor;

const _editorRegistry = new Map<string, EditorFactory>();

/** 커스텀 셀 에디터 타입을 코어 편집 없이 등록(OCP). 프로세스 전역. */
export function registerEditor(typeName: string, factory: EditorFactory): void {
  _editorRegistry.set(typeName, factory);
}

/** 등록 여부 조회(내부/테스트용). */
export function hasEditor(typeName: string): boolean {
  return _editorRegistry.has(typeName);
}

registerEditor('number', (_col, def) => {
  const opts: { min?: number; max?: number; step?: number } = {};
  if (def) {
    if (def.min != null) opts.min = def.min;
    if (def.max != null) opts.max = def.max;
    if (def.step != null) opts.step = def.step;
  }
  return new NumberEditor(opts);
});
registerEditor('date',     () => new DateEditor());
registerEditor('boolean',  () => new CheckboxEditor());
registerEditor('checkbox', () => new CheckboxEditor());
registerEditor('select',   (col, def) => new SelectEditor((def ? def.options : col.options) ?? [], col.optionsFn as any));

// ─── Editor 팩토리 ────────────────────────────────────────
export function createEditor(col: ColumnDef): CellEditor {
  const editor = col.editor;
  let name: string;
  let def: EditorDef | undefined;
  if (!editor)                       { name = String(col.type ?? ''); def = undefined; }
  else if (typeof editor === 'string') { name = editor;                 def = undefined; }
  else                               { name = editor.type;           def = editor; }
  const factory = _editorRegistry.get(name);
  return factory ? factory(col, def) : new TextEditor();
}
