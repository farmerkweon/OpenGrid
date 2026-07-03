import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue('') },
    configurable: true,
  });
});

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width  = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  return new OpenGrid(container, {
    columns: [
      { field: 'name',   header: '이름', width: 120, editable: true },
      { field: 'dept',   header: '부서', width: 100, editable: true },
      { field: 'salary', header: '급여', width: 100, type: 'number', editable: true },
    ],
    height: 400,
    selection: 'cells',
    editable: true,
    ...extraOpts,
  });
}

const sampleData = [
  { name: '홍길동', dept: '개발팀',   salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '인사팀',   salary: 3800000 },
];

function cellEl(grid: OpenGrid<any>, ri: number, ci: number): HTMLElement {
  const el = (grid as any)._renderer.getCellEl(ri, ci);
  if (!el) throw new Error(`cell (${ri},${ci}) not rendered`);
  return el;
}

/** jsdom 은 실레이아웃이 없어 container.getBoundingClientRect()==0 → _onResize 가 조기 return 해서
 * 첫 렌더가 (VirtualScroll rAF 스케줄링 전까지) 지연된다. 셀 DOM 이 필요한 테스트는 이걸로 동기 강제. */
function renderNow(grid: OpenGrid<any>): void {
  (grid as any)._doRender(...(grid as any)._visRange());
}

/** vi.fn().mockResolvedValue() 기반 Promise 체인은 마이크로태스크 홉이 여러 겹이라
 * Promise.resolve() 반복만으로는 불충분할 수 있다 — 매크로태스크 경계로 확실히 플러시. */
function flushAsync(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function mouseEvt(type: string, opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...opts });
}

function keyEvt(key: string, opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
}

function spyOnDoRender(grid: OpenGrid<any>): { count: () => number } {
  const orig = (grid as any)._doRender.bind(grid);
  let n = 0;
  (grid as any)._doRender = (...args: any[]) => { n++; return orig(...args); };
  return { count: () => n };
}

// ── FR-1(M-1): 'cells' 모드 클릭 앵커 ──────────────────────────────────────
describe('F1 배선 — 클릭 앵커(FR-1/M-1)', () => {
  it('cells 모드에서 단일 클릭은 1×1 범위를 앵커링한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    cellEl(grid, 0, 1).dispatchEvent(mouseEvt('click'));
    expect(grid.getActiveRange()).toEqual({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 });
  });

  it('selectionChange 의 cells 필드가 실제 CellRange[] 로 채워진다(FR-5)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    const spy = vi.fn();
    grid.on('selectionChange', spy);
    cellEl(grid, 1, 0).dispatchEvent(mouseEvt('click'));
    expect(spy).toHaveBeenCalled();
    const evt = spy.mock.calls.at(-1)![0];
    expect(evt.cells).toEqual([{ startRow: 1, endRow: 1, startCol: 0, endCol: 0 }]);
  });

  it("'row' 모드에서는 클릭해도 범위가 생기지 않는다(회귀 0)", () => {
    const grid = makeGrid({ selection: 'row' });
    grid.setData(sampleData);
    renderNow(grid);
    cellEl(grid, 0, 0).dispatchEvent(mouseEvt('click'));
    expect(grid.getActiveRange()).toBeNull();
    expect(grid.getRangeSelection()).toEqual([]);
  });
});

// ── UC-1: 드래그 선택 ───────────────────────────────────────────────────────
describe('F1 배선 — 포인터 드래그 선택(UC-1)', () => {
  it('mousedown→mousemove→mouseup 드래그가 정규화된 rect 를 만든다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    const rangeChangeSpy = vi.fn();
    grid.on('rangeChange', rangeChangeSpy);

    cellEl(grid, 2, 0).dispatchEvent(mouseEvt('mousedown'));
    cellEl(grid, 0, 1).dispatchEvent(mouseEvt('mousemove'));
    cellEl(grid, 0, 1).dispatchEvent(mouseEvt('mouseup'));

    expect(grid.getActiveRange()).toEqual({ startRow: 0, endRow: 2, startCol: 0, endCol: 1 });
    expect(rangeChangeSpy).toHaveBeenCalledTimes(1);
    expect(rangeChangeSpy.mock.calls[0][0]).toEqual({ range: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 } });
  });
});

// ── UC-3: Shift+Arrow 확장 ──────────────────────────────────────────────────
describe('F1 배선 — Shift+Arrow 확장(UC-3/M-3)', () => {
  it('Shift+ArrowDown 이 anchor 고정한 채 focus 만 확장한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    const container: HTMLElement = (grid as any)._container;

    cellEl(grid, 0, 0).dispatchEvent(mouseEvt('click'));
    container.dispatchEvent(keyEvt('ArrowDown', { shiftKey: true }));

    expect(grid.getActiveRange()).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 });
  });

  it("selection!=='cells' 에서는 Shift+Arrow 가 기존 focus 이동으로 낙하한다(회귀 0)", () => {
    const grid = makeGrid({ selection: 'single' });
    grid.setData(sampleData);
    renderNow(grid);
    const container: HTMLElement = (grid as any)._container;
    (grid as any)._setFocusCell(0, 0);

    container.dispatchEvent(keyEvt('ArrowDown', { shiftKey: true }));

    // 범위 API 자체가 비활성 — 여전히 빈 배열
    expect(grid.getRangeSelection()).toEqual([]);
  });
});

// ── UR-5: Ctrl+D/R 키보드 채우기 + 배치 렌더 ≤1회 ───────────────────────────
describe('F1 배선 — Ctrl+D/R 키보드 채우기(UR-5, C2.1)', () => {
  it('Ctrl+D 는 최상단 값을 하단으로 배치 복제하고 _doRender 는 1회만 늘어난다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 2, startCol: 2, endCol: 2 }); // salary 컬럼 3행
    const render = spyOnDoRender(grid);
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('d', { ctrlKey: true }));

    expect(grid.readCell(1, 'salary')).toBe(grid.readCell(0, 'salary'));
    expect(grid.readCell(2, 'salary')).toBe(grid.readCell(0, 'salary'));
    expect(render.count()).toBe(1);
  });

  it('Ctrl+R 은 왼쪽 값을 오른쪽으로 배치 복제한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 });
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('r', { ctrlKey: true }));

    expect(grid.readCell(0, 'dept')).toBe(grid.readCell(0, 'name'));
    expect(grid.readCell(0, 'salary')).toBe(grid.readCell(0, 'name'));
  });

  it('rangeFill 이벤트가 written 배열과 함께 1회 emit 된다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 2, endCol: 2 });
    const spy = vi.fn();
    grid.on('rangeFill', spy);
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('d', { ctrlKey: true }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].written.length).toBe(1);
  });
});

// ── FillEngine 직접 호출: fillRange 공개 API ───────────────────────────────
describe('F1 배선 — fillRange 공개 API(§6.2)', () => {
  it('R×C 채우기 커밋은 _doRender 를 정확히 1회만 발생시킨다(QA-1/C2.1)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    const render = spyOnDoRender(grid);

    grid.fillRange(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 2 },
      { startRow: 1, endRow: 2, startCol: 0, endCol: 2 },
      'copy',
    );

    expect(render.count()).toBe(1);
    expect(grid.readCell(1, 'name')).toBe(grid.readCell(0, 'name'));
    expect(grid.readCell(2, 'dept')).toBe(grid.readCell(0, 'dept'));
  });
});

// ── UR-4/UC-6: 범위 클립보드 ─────────────────────────────────────────────
describe('F1 배선 — 범위 복사/붙여넣기(UR-4/UC-6, M-4/M-5)', () => {
  it('Ctrl+C 는 선택 범위를 TSV(행 \\t, 열 \\n) 로 clipboard 에 쓴다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('c', { ctrlKey: true }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('홍길동\t개발팀\n김철수\t마케팅팀');
  });

  it('Ctrl+V 는 범위 대상에 배치 쓰기로 붙여넣는다(엑셀 왕복)', async () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
    (navigator.clipboard.readText as any).mockResolvedValue('A\tB\nC\tD');
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('v', { ctrlKey: true }));
    await flushAsync();

    expect(grid.readCell(0, 'name')).toBe('A');
    expect(grid.readCell(0, 'dept')).toBe('B');
    expect(grid.readCell(1, 'name')).toBe('C');
    expect(grid.readCell(1, 'dept')).toBe('D');
  });

  it('M-4: 범위 없는 기존 focusCell 붙여넣기도 writeCell 경유로 바뀌어 editEnd/dataChange 가 발화한다', async () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    (grid as any)._setFocusCell(0, 0); // 범위 없음 — 기존 focusCell 경로
    const onEditEnd = vi.fn();
    const onDataChange = vi.fn();
    grid.on('editEnd', onEditEnd);
    grid.on('dataChange', onDataChange);
    (navigator.clipboard.readText as any).mockResolvedValue('변경됨');
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('v', { ctrlKey: true }));
    await flushAsync();

    expect(grid.readCell(0, 'name')).toBe('변경됨');
    expect(onEditEnd).toHaveBeenCalled();
    expect(onDataChange).toHaveBeenCalled();
  });
});

// ── C9: 편집 우선순위 / Esc 해제 ─────────────────────────────────────────
describe('F1 배선 — Esc/편집 우선순위(C9)', () => {
  it('편집 비활성 상태에서 Esc 는 범위 선택을 해제한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
    const container: HTMLElement = (grid as any)._container;

    container.dispatchEvent(keyEvt('Escape'));

    expect(grid.getActiveRange()).toBeNull();
  });

  it('활성 에디터가 있으면 Ctrl+D/Shift+Arrow 등 범위 키를 그리드가 가로채지 않는다(에디터 우선)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 2, startCol: 2, endCol: 2 });
    (grid as any)._editMgr.startEditByKey(0, 2); // 활성 에디터 생성
    const container: HTMLElement = (grid as any)._container;
    const before = grid.readCell(1, 'salary');

    container.dispatchEvent(keyEvt('d', { ctrlKey: true }));

    // handleKeyDown 최상단에서 activeEditor 존재 시 즉시 return — 채우기 미실행
    expect(grid.readCell(1, 'salary')).toBe(before);
  });
});

// ── C0.5/§2.5: 정렬 후 선택 재투영(해제 아님) ───────────────────────────────
describe('F1 배선 — 정렬 후 범위 재투영(C0.5, HANMS-04)', () => {
  it('orderBy 이후에도 선택했던 행들이 rowId 기준으로 재투영되어 유지된다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }); // 홍길동, 김철수 선택
    const selectedNames = [grid.readCell(0, 'name'), grid.readCell(1, 'name')];

    grid.orderBy('name', 'desc');

    const sortedNames = grid.getData().map((r: any) => r.name);
    const newIdxs = selectedNames.map(n => sortedNames.indexOf(n)).sort((a, b) => a - b);
    expect(grid.getActiveRange()).toEqual({
      startRow: newIdxs[0], endRow: newIdxs[1], startCol: 0, endCol: 0,
    });
  });
});
