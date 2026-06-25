import { describe, it, expect, vi } from 'vitest';
import { DateEditor } from '../../src/core/editors/DateEditor.js';
import { SelectEditor } from '../../src/core/editors/SelectEditor.js';
import { createEditor } from '../../src/core/editors/CellEditor.js';
import type { RenderContext } from '../../src/core/renderers/CellRenderer.js';
import type { ColumnDef } from '../../src/core/types.js';

function ctx(value: any, col?: Partial<ColumnDef>): RenderContext {
  return {
    value, row: {}, rowIndex: 0,
    column: { field: 'f', header: '테스트', ...col } as ColumnDef,
    colIndex: 0, isSelected: false, rowState: 'none',
  };
}

function mount<E extends { mount: any; getValue: any; destroy: any }>(
  editor: E, value: any, col?: Partial<ColumnDef>
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  editor.mount(container, ctx(value, col), onCommit, onCancel);
  return { container, onCommit, onCancel };
}

// ─── DateEditor ─────────────────────────────────────────────
describe('DateEditor (Sprint 36)', () => {
  it('날짜 초기값 — yyyy-MM-dd 형식으로 변환', () => {
    const e = new DateEditor();
    const { container } = mount(e, '2024-06-15');
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe('2024-06-15');
    e.destroy();
  });

  it('Date 객체 초기값도 변환됨', () => {
    const e = new DateEditor();
    const { container } = mount(e, new Date('2025-03-01'));
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe('2025-03-01');
    e.destroy();
  });

  it('Enter → onCommit 호출', () => {
    const e = new DateEditor();
    const { container, onCommit } = mount(e, '2024-01-01');
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '2024-12-31';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith('2024-12-31');
    e.destroy();
  });

  it('Escape → onCancel 호출', () => {
    const e = new DateEditor();
    const { container, onCancel } = mount(e, '2024-01-01');
    const input = container.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
    e.destroy();
  });

  it('mount 시 aria-haspopup="dialog" 설정', () => {
    const e = new DateEditor();
    const { container } = mount(e, '2024-01-01');
    expect(container.getAttribute('aria-haspopup')).toBe('dialog');
    expect(container.getAttribute('aria-expanded')).toBe('true');
    e.destroy();
  });

  it('destroy 시 aria-expanded="false"로 복원', () => {
    const e = new DateEditor();
    const { container } = mount(e, '2024-01-01');
    e.destroy();
    expect(container.getAttribute('aria-expanded')).toBe('false');
  });

  it('input에 aria-label이 컬럼 헤더로 설정됨', () => {
    const e = new DateEditor();
    const { container } = mount(e, null, { header: '입사일' });
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('입사일');
    e.destroy();
  });

  it('getValue → 현재 input 값 반환', () => {
    const e = new DateEditor();
    const { container } = mount(e, '2024-06-01');
    const input = container.querySelector('input') as HTMLInputElement;
    input.value = '2025-01-01';
    expect(e.getValue()).toBe('2025-01-01');
    e.destroy();
  });
});

// ─── SelectEditor ────────────────────────────────────────────
describe('SelectEditor (Sprint 36)', () => {
  const opts = ['A', 'B', 'C'];

  it('정적 옵션 배열 렌더링', () => {
    const e = new SelectEditor(opts);
    const { container } = mount(e, 'A');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(select.options[0]!.text).toBe('A');
    e.destroy();
  });

  it('초기값 선택 상태', () => {
    const e = new SelectEditor(opts);
    const { container } = mount(e, 'B');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('B');
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

  it('change → onCommit 호출', () => {
    const e = new SelectEditor(opts);
    const { container, onCommit } = mount(e, 'A');
    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'C';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith('C');
    e.destroy();
  });

  it('Escape → onCancel 호출', () => {
    const e = new SelectEditor(opts);
    const { container, onCancel } = mount(e, 'A');
    const select = container.querySelector('select') as HTMLSelectElement;
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
    e.destroy();
  });

  it('mount 시 aria-haspopup="listbox" 설정', () => {
    const e = new SelectEditor(opts);
    const { container } = mount(e, 'A');
    expect(container.getAttribute('aria-haspopup')).toBe('listbox');
    expect(container.getAttribute('aria-expanded')).toBe('true');
    e.destroy();
  });

  it('destroy 시 aria-expanded="false"로 복원', () => {
    const e = new SelectEditor(opts);
    const { container } = mount(e, 'A');
    e.destroy();
    expect(container.getAttribute('aria-expanded')).toBe('false');
  });

  it('select에 aria-label이 컬럼 헤더로 설정됨', () => {
    const e = new SelectEditor(opts);
    const { container } = mount(e, 'A', { header: '카테고리' });
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-label')).toBe('카테고리');
    e.destroy();
  });

  it('optionsFn — row/rowIndex 기반 동적 옵션', () => {
    const optionsFn = vi.fn((_row: any, _ri: number) => ['X', 'Y', 'Z']);
    const e = new SelectEditor([], optionsFn);
    const container = document.createElement('div');
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const c = ctx('X');
    e.mount(container, c, onCommit, onCancel);
    expect(optionsFn).toHaveBeenCalledWith(c.row, c.rowIndex);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(select.options[0]!.text).toBe('X');
    e.destroy();
  });

  it('optionsFn — row 데이터 기반 필터링', () => {
    const data = { category: 'electronics' };
    const fn = (row: any) => row.category === 'electronics' ? ['TV', 'Phone'] : ['Shirt'];
    const e = new SelectEditor([], fn);
    const container = document.createElement('div');
    const c: RenderContext = { value: 'TV', row: data, rowIndex: 0, column: { field: 'brand', header: '브랜드' } as ColumnDef, colIndex: 1, isSelected: false, rowState: 'none' };
    e.mount(container, c, vi.fn(), vi.fn());
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[0]!.text).toBe('TV');
    e.destroy();
  });
});

// ─── createEditor 팩토리 — type='select' 지원 ────────────────
describe('createEditor — Sprint 36 신규 타입', () => {
  it("type:'select' → SelectEditor 반환", () => {
    const col: ColumnDef = { field: 'cat', header: '카테고리', type: 'select' as any, options: ['A', 'B'] };
    expect(createEditor(col)).toBeInstanceOf(SelectEditor);
  });

  it("type:'select' + options → 옵션이 에디터에 반영됨", () => {
    const col: ColumnDef = { field: 'cat', header: '카테고리', type: 'select' as any, options: ['X', 'Y', 'Z'] };
    const e = createEditor(col) as SelectEditor;
    const container = document.createElement('div');
    e.mount(container, ctx('X', col), vi.fn(), vi.fn());
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    e.destroy();
  });

  it("type:'select' + optionsFn → 동적 옵션 함수가 에디터에 전달됨", () => {
    const optionsFn = vi.fn(() => ['P', 'Q']);
    const col: ColumnDef = { field: 'brand', header: '브랜드', type: 'select' as any, optionsFn };
    const e = createEditor(col) as SelectEditor;
    const container = document.createElement('div');
    e.mount(container, ctx(null, col), vi.fn(), vi.fn());
    expect(optionsFn).toHaveBeenCalled();
    e.destroy();
  });

  it("editor:'select' + col.options → SelectEditor에 옵션 전달", () => {
    const col: ColumnDef = { field: 'f', header: 'h', editor: 'select', options: ['M', 'N'] };
    const e = createEditor(col) as SelectEditor;
    const container = document.createElement('div');
    e.mount(container, ctx('M', col), vi.fn(), vi.fn());
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    e.destroy();
  });
});
