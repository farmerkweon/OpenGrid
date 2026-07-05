import type { ColumnDef, EditorDef } from '../types.js';
import type { RenderContext } from '../renderers/CellRenderer.js';
export { DateEditor } from './DateEditor.js';
export { SelectEditor } from './SelectEditor.js';
import { DateEditor } from './DateEditor.js';
import { SelectEditor } from './SelectEditor.js';

/** 편집 결과(커밋 여부 + 값). / Edit result (whether committed + value). */
export interface EditorResult {
  /** 커밋(확정) 여부. / Whether committed. */
  committed: boolean;
  /** 편집된 값. / Edited value. */
  value: any;
}

/** 셀 에디터 인터페이스 — 편집 위젯 수명 관리. / Cell editor interface — manages the edit widget lifecycle. */
export interface CellEditor {
  /** 컨테이너에 편집 위젯을 마운트한다. / Mount the edit widget into the container. */
  mount(container: HTMLElement, ctx: RenderContext, onCommit: (value: any) => void, onCancel: () => void): void;
  /** 현재 편집 값을 반환한다. / Return the current edit value. */
  getValue(): any;
  /** 편집 위젯에 포커스한다. / Focus the edit widget. */
  focus(): void;
  /** 편집 위젯을 정리한다. / Tear down the edit widget. */
  destroy(): void;
}

// ─── TextEditor ───────────────────────────────────────────
/** 텍스트 입력 에디터. / Text input editor. */
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
/** 숫자 입력 에디터(min/max/step 지원). / Number input editor (supports min/max/step). */
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
/** 체크박스 에디터(change 즉시 커밋). / Checkbox editor (commits immediately on change). */
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
/** 셀 에디터 팩토리 시그니처 `(col, def?) => CellEditor`. / Cell-editor factory signature `(col, def?) => CellEditor`. */
export type EditorFactory = (col: ColumnDef, def?: EditorDef) => CellEditor;

const _editorRegistry = new Map<string, EditorFactory>();

/**
 * 커스텀 셀 에디터 타입을 코어 편집 없이 등록(OCP). 프로세스 전역.
 * / Register a custom cell-editor type without editing core (OCP). Process-global.
 *
 * @param typeName - 에디터 타입 이름(예: 'color') / Editor type name (e.g. 'color')
 * @param factory - 에디터 팩토리 / Editor factory
 * @example
 * registerEditor('color', () => new TextEditor());
 */
export function registerEditor(typeName: string, factory: EditorFactory): void {
  _editorRegistry.set(typeName, factory);
}

/** 에디터 타입 등록 여부 조회(내부/테스트용). / Whether an editor type is registered (internal/test use). */
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
/**
 * 컬럼 정의로부터 셀 에디터를 생성한다(레지스트리 해석, 미등록 시 TextEditor 폴백).
 * / Create a cell editor from a column definition (registry resolution; falls back to TextEditor when unregistered).
 *
 * @param col - 컬럼 정의 / Column definition
 * @returns 셀 에디터 / A cell editor
 */
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
