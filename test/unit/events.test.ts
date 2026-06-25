import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width  = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  return new OpenGrid(container, {
    columns: [
      { field: 'name',  header: '이름',  width: 150, editable: true },
      { field: 'score', header: '점수',  width: 100, type: 'number', editable: true },
    ],
    height: 400,
    ...extraOpts,
  });
}

const sampleData = [
  { name: '홍길동', score: 90 },
  { name: '김철수', score: 85 },
];

// ─── EventEmitter on/emit 연동 테스트 ─────────────────────────
describe('Sprint 35 — EventEmitter on/emit 연동', () => {
  it('cellMouseOver: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellMouseOver', cb);
    const mockEvt = { type: 'cellMouseOver', rowIndex: 0, columnIndex: 0, field: 'name', value: '홍길동', row: sampleData[0], column: {} };
    grid.emit('cellMouseOver', mockEvt);
    expect(cb).toHaveBeenCalledWith(mockEvt);
  });

  it('cellMouseOut: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellMouseOut', cb);
    grid.emit('cellMouseOut', { type: 'cellMouseOut' });
    expect(cb).toHaveBeenCalled();
  });

  it('cellMouseDown: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellMouseDown', cb);
    grid.emit('cellMouseDown', { type: 'cellMouseDown' });
    expect(cb).toHaveBeenCalled();
  });

  it('cellMouseUp: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellMouseUp', cb);
    grid.emit('cellMouseUp', { type: 'cellMouseUp' });
    expect(cb).toHaveBeenCalled();
  });

  it('cellMouseMove: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellMouseMove', cb);
    grid.emit('cellMouseMove', { type: 'cellMouseMove' });
    expect(cb).toHaveBeenCalled();
  });

  it('rowDblClick: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('rowDblClick', cb);
    grid.emit('rowDblClick', { type: 'rowDblClick', rowIndex: 1 });
    expect(cb).toHaveBeenCalled();
  });

  it('rowMouseOver: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('rowMouseOver', cb);
    grid.emit('rowMouseOver', { type: 'rowMouseOver' });
    expect(cb).toHaveBeenCalled();
  });

  it('rowMouseOut: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('rowMouseOut', cb);
    grid.emit('rowMouseOut', { type: 'rowMouseOut' });
    expect(cb).toHaveBeenCalled();
  });

  it('rowMouseDown: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('rowMouseDown', cb);
    grid.emit('rowMouseDown', { type: 'rowMouseDown' });
    expect(cb).toHaveBeenCalled();
  });

  it('rowMouseUp: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('rowMouseUp', cb);
    grid.emit('rowMouseUp', { type: 'rowMouseUp' });
    expect(cb).toHaveBeenCalled();
  });

  it('rowMouseMove: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('rowMouseMove', cb);
    grid.emit('rowMouseMove', { type: 'rowMouseMove' });
    expect(cb).toHaveBeenCalled();
  });

  it('cellKeyDown: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellKeyDown', cb);
    grid.emit('cellKeyDown', { type: 'cellKeyDown', key: 'ArrowDown' });
    expect(cb).toHaveBeenCalled();
  });

  it('cellKeyUp: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellKeyUp', cb);
    grid.emit('cellKeyUp', { type: 'cellKeyUp', key: 'Enter' });
    expect(cb).toHaveBeenCalled();
  });

  it('cellKeyPress: on/emit 정상 동작', () => {
    const grid = makeGrid();
    const cb = vi.fn();
    grid.on('cellKeyPress', cb);
    grid.emit('cellKeyPress', { type: 'cellKeyPress', key: 'a' });
    expect(cb).toHaveBeenCalled();
  });
});

// ─── GridOptions 콜백 연동 테스트 ─────────────────────────────
describe('Sprint 35 — GridOptions 콜백 _bindOptionEvents 연동', () => {
  it('onCellMouseOver: emit 시 콜백 호출', () => {
    const onCellMouseOver = vi.fn();
    const grid = makeGrid({ onCellMouseOver });
    const mockEvt = { type: 'cellMouseOver', rowIndex: 0, columnIndex: 1, field: 'score', value: 90 };
    grid.emit('cellMouseOver', mockEvt);
    expect(onCellMouseOver).toHaveBeenCalledWith(mockEvt);
  });

  it('onRowDblClick: emit 시 콜백 호출', () => {
    const onRowDblClick = vi.fn();
    const grid = makeGrid({ onRowDblClick });
    const mockEvt = { type: 'rowDblClick', rowIndex: 0, row: sampleData[0] };
    grid.emit('rowDblClick', mockEvt);
    expect(onRowDblClick).toHaveBeenCalledWith(mockEvt);
  });

  it('onCellKeyDown: emit 시 콜백 호출', () => {
    const onCellKeyDown = vi.fn();
    const grid = makeGrid({ onCellKeyDown });
    const mockEvt = { type: 'cellKeyDown', key: 'Enter', rowIndex: 0 };
    grid.emit('cellKeyDown', mockEvt);
    expect(onCellKeyDown).toHaveBeenCalledWith(mockEvt);
  });

  it('onRowMouseMove: emit 시 콜백 호출', () => {
    const onRowMouseMove = vi.fn();
    const grid = makeGrid({ onRowMouseMove });
    grid.emit('rowMouseMove', { type: 'rowMouseMove', rowIndex: 1 });
    expect(onRowMouseMove).toHaveBeenCalled();
  });
});

// ─── 이벤트 파라미터 구조 검증 ───────────────────────────────
describe('Sprint 35 — 이벤트 파라미터 구조', () => {
  it('cellMouseOver 파라미터: rowIndex·columnIndex·field·value·row 포함', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    let received: any = null;
    grid.on('cellMouseOver', (e: any) => { received = e; });

    const mockEvt = {
      type: 'cellMouseOver', rowIndex: 0, columnIndex: 0,
      field: 'name', value: '홍길동', row: sampleData[0],
      column: { field: 'name', header: '이름' },
    };
    grid.emit('cellMouseOver', mockEvt);

    expect(received).not.toBeNull();
    expect(received.rowIndex).toBe(0);
    expect(received.columnIndex).toBe(0);
    expect(received.field).toBe('name');
    expect(received.value).toBe('홍길동');
    expect(received.row).toBe(sampleData[0]);
  });

  it('cellKeyDown 파라미터: key 필드 포함', () => {
    const grid = makeGrid();
    let received: any = null;
    grid.on('cellKeyDown', (e: any) => { received = e; });
    grid.emit('cellKeyDown', { type: 'cellKeyDown', key: 'ArrowDown', rowIndex: 0, columnIndex: 1 });
    expect(received?.key).toBe('ArrowDown');
    expect(received?.columnIndex).toBe(1);
  });

  it('rowDblClick 파라미터: rowIndex·row 포함', () => {
    const grid = makeGrid();
    let received: any = null;
    grid.on('rowDblClick', (e: any) => { received = e; });
    grid.emit('rowDblClick', { type: 'rowDblClick', rowIndex: 1, row: sampleData[1] });
    expect(received?.rowIndex).toBe(1);
    expect(received?.row).toBe(sampleData[1]);
  });
});
