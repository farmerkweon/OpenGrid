/**
 * 옵션 콜백은 한 번의 일에 한 번만 불린다.
 *
 * Option callbacks fire exactly once per occurrence.
 *
 * 결함: `_bindOptionEvents` 가 `onX` 옵션을 이벤트 'x' 의 리스너로 등록하는데, 처리기들이
 * `emit('x')` 직후 `opts.onX?.()` 를 또 불러 한 번의 클릭에 두 번 불렸다.
 * 고친 뒤 규칙: 옵션 `onX` 는 이벤트 'x' 구독의 줄임말이며, 전달 경로는 이벤트 하나뿐이다.
 *
 * Defect: `_bindOptionEvents` registered the `onX` option as a listener of event 'x', while the
 * handlers also called `opts.onX?.()` right after `emit('x')`, so one click fired it twice.
 * Rule after the fix: option `onX` is shorthand for subscribing to event 'x'; the event is the only path.
 *
 * 셀 이벤트는 셀 요소 리스너가 부르는 처리기(`_handleCellClick` 등)를 직접 불러 실제 경로
 * (CellEventHandler → emit → 리스너)를 태운다. jsdom 은 크기가 0 이라 가상 스크롤이 셀 요소를
 * 그리지 않을 수 있기 때문이다.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

let rafQueue: FrameRequestCallback[] = [];
beforeAll(() => {
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback): number => { rafQueue.push(cb); return rafQueue.length; };
  (global as any).cancelAnimationFrame = () => {};
});
afterEach(() => { rafQueue = []; document.body.innerHTML = ''; });

const columns = [
  { field: 'name', header: '이름', width: 120, editable: true },
  { field: 'age', header: '나이', width: 80, type: 'number' as const, editable: true },
];
const rows = () => [{ name: 'A', age: 30 }, { name: 'B', age: 20 }, { name: 'C', age: 40 }];

function makeGrid(options: Record<string, any> = {}): any {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  const g: any = new OpenGrid(el, { columns, height: 400, ...options } as any);
  g.setData(rows());
  return g;
}

const click = () => new MouseEvent('click');

describe('옵션 콜백 1회 — 셀·행 포인터 이벤트', () => {
  it('T1-01 onCellClick: 셀 클릭 한 번에 한 번', () => {
    const onCellClick = vi.fn();
    const g = makeGrid({ onCellClick });
    g._handleCellClick(1, 0, click());
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onCellClick.mock.calls[0][0]).toMatchObject({ rowIndex: 1, field: 'name' });
    g.destroy();
  });

  it('T1-02 onRowClick: 셀 클릭 한 번에 한 번', () => {
    const onRowClick = vi.fn();
    const g = makeGrid({ onRowClick });
    g._handleCellClick(0, 1, click());
    expect(onRowClick).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-03 onCellDblClick · onRowDblClick: 더블클릭 한 번에 각 한 번', () => {
    const onCellDblClick = vi.fn();
    const onRowDblClick = vi.fn();
    const g = makeGrid({ onCellDblClick, onRowDblClick, editable: false });
    g._handleCellDblClick(0, 0, new MouseEvent('dblclick'));
    expect(onCellDblClick).toHaveBeenCalledTimes(1);
    expect(onRowDblClick).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-04 마우스 10종: 각 한 번', () => {
    const kinds = ['Over', 'Out', 'Down', 'Up', 'Move'] as const;
    const spies: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const k of kinds) { spies[`onCellMouse${k}`] = vi.fn(); spies[`onRowMouse${k}`] = vi.fn(); }
    const g = makeGrid(spies);
    for (const k of kinds) g[`_handleCellMouse${k}`](0, 0, new MouseEvent(`mouse${k.toLowerCase()}`));
    for (const [name, spy] of Object.entries(spies)) {
      expect(spy, name).toHaveBeenCalledTimes(1);
    }
    g.destroy();
  });

  it('T1-05 키 3종: 포커스 셀이 있을 때 각 한 번', () => {
    const onCellKeyDown = vi.fn();
    const onCellKeyUp = vi.fn();
    const onCellKeyPress = vi.fn();
    const g = makeGrid({ onCellKeyDown, onCellKeyUp, onCellKeyPress });
    g._setFocusCell(0, 0);
    g._handleCellKeyEvt('cellKeyDown', new KeyboardEvent('keydown', { key: 'a' }));
    g._handleCellKeyEvt('cellKeyUp', new KeyboardEvent('keyup', { key: 'a' }));
    g._handleCellKeyEvt('cellKeyPress', new KeyboardEvent('keypress', { key: 'a' }));
    expect(onCellKeyDown).toHaveBeenCalledTimes(1);
    expect(onCellKeyUp).toHaveBeenCalledTimes(1);
    expect(onCellKeyPress).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-06 onSelectionChange: 셀 클릭(행 선택) 한 번에 한 번, 인자에 cells 배열', () => {
    const onSelectionChange = vi.fn();
    const g = makeGrid({ onSelectionChange });
    g._handleCellClick(0, 0, click());
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(Array.isArray(onSelectionChange.mock.calls[0][0].cells)).toBe(true);
    g.destroy();
  });
});

describe('옵션 콜백 1회 — 정렬·필터·편집·데이터', () => {
  it('T1-07 onSortChange: 머리글 정렬 한 번에 한 번, 인자 {field, dir, sortList}', () => {
    const onSortChange = vi.fn();
    const g = makeGrid({ onSortChange, sortable: true });
    g._handleSortClick('age', false);
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange.mock.calls[0][0]).toMatchObject({ field: 'age', dir: 'asc' });
    g.destroy();
  });

  it('T1-08 onFilterChange: setFilter 한 번에 한 번', () => {
    const onFilterChange = vi.fn();
    const g = makeGrid({ onFilterChange });
    g.setFilter('name', [{ operator: 'eq', value: 'A' }]);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-09 onEditEnd · onDataChange: writeCell 한 번에 각 한 번', () => {
    const onEditEnd = vi.fn();
    const onDataChange = vi.fn();
    const g = makeGrid({ onEditEnd, onDataChange });
    onDataChange.mockClear(); // setData 분 제외
    g.writeCell(0, 'name', 'Z');
    expect(onEditEnd).toHaveBeenCalledTimes(1);
    expect(onDataChange).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-11 onEditStart: 편집 시작 한 번에 한 번', () => {
    const onEditStart = vi.fn();
    const g = makeGrid({ onEditStart, editable: true, editMode: 'click' });
    // jsdom 은 크기가 0 이라 셀 요소가 그려지지 않는다 → 편집기를 붙일 셀 요소만 대신 건넨다.
    g._renderer.getCellEl = () => document.createElement('div');
    g._handleCellClick(0, 0, click()); // editMode 'click' → CellEditManager.startEdit
    expect(onEditStart).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it.each([
    ['insertRow', (g: any) => g.insertRow({ name: 'X', age: 1 })],
    ['pushRow', (g: any) => g.pushRow({ name: 'Y', age: 2 })],
    ['unshiftRow', (g: any) => g.unshiftRow({ name: 'W', age: 3 })],
    ['deleteRow', (g: any) => g.deleteRow(0)],
  ])('T1-10 onDataChange: %s 한 번에 한 번', (_name, op) => {
    const onDataChange = vi.fn();
    const g = makeGrid({ onDataChange });
    onDataChange.mockClear();
    op(g);
    expect(onDataChange).toHaveBeenCalledTimes(1);
    g.destroy();
  });
});

describe('옵션 콜백 — 순서·갱신·구독 대조군', () => {
  it('T1-12 옵션 콜백은 grid.on 구독자보다 먼저, 한 번', () => {
    const log: string[] = [];
    const g = makeGrid({ onCellClick: () => log.push('opt') });
    g.on('cellClick', () => log.push('sub'));
    g._handleCellClick(0, 0, click());
    expect(log).toEqual(['opt', 'sub']);
    g.destroy();
  });

  it('T1-13 setOptions 로 바꾼 콜백만 한 번 불린다', () => {
    const oldFn = vi.fn();
    const newFn = vi.fn();
    const g = makeGrid({ onCellClick: oldFn });
    g.setOptions({ onCellClick: newFn });
    g._handleCellClick(0, 0, click());
    expect(oldFn).toHaveBeenCalledTimes(0);
    expect(newFn).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-14 (대조군) 옵션 없이 grid.on 구독만 — 한 번, 오류 없음', () => {
    const sub = vi.fn();
    const g = makeGrid();
    g.on('cellClick', sub);
    expect(() => g._handleCellClick(0, 0, click())).not.toThrow();
    expect(sub).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('T1-15 grid.on("sortChange") 인자에 field·dir 가 있다(머리글 정렬)', () => {
    const sub = vi.fn();
    const g = makeGrid({ sortable: true });
    g.on('sortChange', sub);
    g._handleSortClick('name', false);
    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub.mock.calls[0][0]).toMatchObject({ field: 'name', dir: 'asc' });
    g.destroy();
  });
});
