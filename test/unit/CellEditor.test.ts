import { describe, it, expect, vi } from 'vitest';
import {
  TextEditor, NumberEditor, SelectEditor, DateEditor, CheckboxEditor,
  createEditor,
} from '../../src/core/editors/CellEditor.js';
import type { RenderContext } from '../../src/core/renderers/CellRenderer.js';
import type { ColumnDef } from '../../src/core/types.js';

function ctx(value: any): RenderContext {
  return {
    value, row: {}, rowIndex: 0,
    column: { field: 'f', header: 'H' } as ColumnDef,
    colIndex: 0, isSelected: false, rowState: 'none',
  };
}

function mount<E extends { mount: any; getValue: any; destroy: any }>(
  editor: E,
  value: any,
  onCommit = vi.fn(),
  onCancel = vi.fn(),
): { container: HTMLElement; onCommit: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  editor.mount(container, ctx(value), onCommit, onCancel);
  return { container, onCommit, onCancel };
}

// ─── TextEditor ─────────────────────────────────────────────
describe('TextEditor', () => {
  it('초기값 표시', () => {
    const e = new TextEditor();
    const { container } = mount(e, 'hello');
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('hello');
    e.destroy();
  });

  it('Enter → onCommit', () => {
    const e = new TextEditor();
    const { container, onCommit } = mount(e, 'init');
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'changed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith('changed');
    e.destroy();
  });

  it('Escape → onCancel', () => {
    const e = new TextEditor();
    const { container, onCancel } = mount(e, 'init');
    const input = container.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
    e.destroy();
  });

  it('getValue', () => {
    const e = new TextEditor();
    const { container } = mount(e, 'abc');
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'xyz';
    expect(e.getValue()).toBe('xyz');
    e.destroy();
  });
});

// ─── NumberEditor ───────────────────────────────────────────
describe('NumberEditor', () => {
  it('숫자 초기값', () => {
    const e = new NumberEditor();
    const { container } = mount(e, 42);
    expect(container.querySelector('input')!.value).toBe('42');
    e.destroy();
  });

  it('null → 빈 문자열', () => {
    const e = new NumberEditor();
    const { container } = mount(e, null);
    expect(container.querySelector('input')!.value).toBe('');
    e.destroy();
  });

  it('Enter → onCommit with number', () => {
    const e = new NumberEditor();
    const { container, onCommit } = mount(e, 0);
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '99';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith(99);
    e.destroy();
  });

  it('빈값 commit → null', () => {
    const e = new NumberEditor();
    const { container, onCommit } = mount(e, 5);
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith(null);
    e.destroy();
  });

  it('min/max/step 속성 반영', () => {
    const e = new NumberEditor({ min: 0, max: 100, step: 5 });
    const { container } = mount(e, 10);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
    expect(input.step).toBe('5');
    e.destroy();
  });
});

// ─── SelectEditor ───────────────────────────────────────────
describe('SelectEditor', () => {
  const opts = ['A', 'B', 'C'];

  it('옵션 렌더링', () => {
    const e = new SelectEditor(opts);
    const { container } = mount(e, 'A');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(select.value).toBe('A');
    e.destroy();
  });

  it('change → onCommit', () => {
    const e = new SelectEditor(opts);
    const { container, onCommit } = mount(e, 'A');
    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'B';
    select.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith('B');
    e.destroy();
  });

  it('label/value 객체 옵션', () => {
    const e = new SelectEditor([{ label: '활성', value: 1 }, { label: '비활성', value: 0 }]);
    const { container } = mount(e, 1);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options[0]!.text).toBe('활성');
    expect(select.value).toBe('1');
    e.destroy();
  });
});

// ─── DateEditor ─────────────────────────────────────────────
describe('DateEditor', () => {
  it('날짜 초기값 변환', () => {
    const e = new DateEditor();
    const { container } = mount(e, '2024-03-15');
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('2024-03-15');
    e.destroy();
  });

  it('Enter → onCommit', () => {
    const e = new DateEditor();
    const { container, onCommit } = mount(e, '2024-01-01');
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '2024-12-31';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith('2024-12-31');
    e.destroy();
  });
});

// ─── CheckboxEditor ─────────────────────────────────────────
describe('CheckboxEditor', () => {
  it('true → checked', () => {
    const e = new CheckboxEditor();
    const { container } = mount(e, true);
    expect(container.querySelector('input')!.checked).toBe(true);
    e.destroy();
  });

  it('change → onCommit with boolean', () => {
    const e = new CheckboxEditor();
    const { container, onCommit } = mount(e, false);
    const chk = container.querySelector('input') as HTMLInputElement;
    chk.checked = true;
    chk.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith(true);
    e.destroy();
  });
});

// ─── createEditor 팩토리 ────────────────────────────────────
describe('createEditor 팩토리', () => {
  it('기본 → TextEditor', () => {
    expect(createEditor({ field: 'f', header: 'h' })).toBeInstanceOf(TextEditor);
  });
  it('type:number → NumberEditor', () => {
    expect(createEditor({ field: 'f', header: 'h', type: 'number' })).toBeInstanceOf(NumberEditor);
  });
  it('type:date → DateEditor', () => {
    expect(createEditor({ field: 'f', header: 'h', type: 'date' })).toBeInstanceOf(DateEditor);
  });
  it('type:boolean → CheckboxEditor', () => {
    expect(createEditor({ field: 'f', header: 'h', type: 'boolean' })).toBeInstanceOf(CheckboxEditor);
  });
  it('editor:"select" → SelectEditor', () => {
    expect(createEditor({ field: 'f', header: 'h', editor: 'select' })).toBeInstanceOf(SelectEditor);
  });
  it('EditorDef number with opts', () => {
    const col: ColumnDef = {
      field: 'f', header: 'h',
      editor: { type: 'number', min: 0, max: 100, step: 1 },
    };
    const e = createEditor(col);
    expect(e).toBeInstanceOf(NumberEditor);
  });
  it('EditorDef select with options', () => {
    const col: ColumnDef = {
      field: 'f', header: 'h',
      editor: { type: 'select', options: ['X', 'Y'] },
    };
    const e = createEditor(col);
    expect(e).toBeInstanceOf(SelectEditor);
  });
});
