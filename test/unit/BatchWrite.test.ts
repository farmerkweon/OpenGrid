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
      { field: 'name',   header: '이름', width: 120, editable: true },
      { field: 'dept',   header: '부서', width: 100, editable: true },
      { field: 'salary', header: '급여', width: 100, type: 'number', editable: true },
    ],
    height: 400,
    ...extraOpts,
  });
}

const sampleData = [
  { name: '홍길동', dept: '개발팀',   salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '인사팀',   salary: 3800000 },
];

/** 인스턴스의 private _doRender 호출 횟수를 세는 스파이. JS 런타임엔 private 이 없으므로 안전. */
function spyOnDoRender(grid: OpenGrid<any>): { count: () => number } {
  const orig = (grid as any)._doRender.bind(grid);
  let n = 0;
  (grid as any)._doRender = (...args: any[]) => { n++; return orig(...args); };
  return { count: () => n };
}

// ── Phase 0(C2.1) — 배치 쓰기 API: beginBatch/endBatch/writeCells ──────────
describe('배치 쓰기 — render/dataChange coalescing', () => {
  it('writeCells: R×C 패치라도 _doRender 는 정확히 1회만 발생', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const render = spyOnDoRender(grid);

    const patches = [];
    for (let r = 0; r < 3; r++) {
      for (const field of ['name', 'salary']) {
        patches.push({ rowIndex: r, field, value: field === 'salary' ? 1 : 'X' });
      }
    }
    grid.writeCells(patches);

    expect(render.count()).toBe(1);
  });

  it('writeCells: dataChange 이벤트도 1회로 coalesce 된다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const onDataChange = vi.fn();
    grid.on('dataChange', onDataChange);

    grid.writeCells([
      { rowIndex: 0, field: 'name', value: 'A' },
      { rowIndex: 1, field: 'name', value: 'B' },
      { rowIndex: 2, field: 'name', value: 'C' },
    ]);

    expect(onDataChange).toHaveBeenCalledTimes(1);
  });

  it('writeCells: 실제 값이 각 대상 셀에 정확히 반영된다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);

    grid.writeCells([
      { rowIndex: 0, field: 'name', value: '변경0' },
      { rowIndex: 2, field: 'dept', value: '변경2' },
    ]);

    expect(grid.readCell(0, 'name')).toBe('변경0');
    expect(grid.readCell(2, 'dept')).toBe('변경2');
  });

  it('beginBatch/endBatch 수동 사용도 동일하게 1회로 coalesce 된다(reentrant)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const render = spyOnDoRender(grid);

    grid.beginBatch();
    grid.beginBatch(); // 중첩 — 카운팅
    grid.writeCell(0, 'name', 'X');
    grid.writeCell(1, 'name', 'Y');
    grid.endBatch(); // 아직 바깥 배치가 남아 flush 안 됨
    expect(render.count()).toBe(0);
    grid.endBatch(); // 이제 flush
    expect(render.count()).toBe(1);
  });

  it('빈 배치(쓰기 없음)는 endBatch 에서 아무 render 도 발생시키지 않는다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const render = spyOnDoRender(grid);

    grid.beginBatch();
    grid.endBatch();

    expect(render.count()).toBe(0);
  });
});

describe('배치 쓰기 — C0.3 쓰기 안전(non-data 대상 skip)', () => {
  it('group 헤더 flat index 로의 쓰기는 건너뛰고 skip 카운트를 반환한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.groupBy(['dept']);
    grid.expandAll(); // [group,row,group,row,group,row] — 짝수 인덱스는 group

    const model = grid.getFlatRowModel();
    const groupIdx = [0, 1, 2, 3, 4, 5].find(i => model.resolveFlatRow(i).kind === 'group')!;
    const dataIdx  = [0, 1, 2, 3, 4, 5].find(i => model.resolveFlatRow(i).kind === 'data')!;

    const skipped = grid.writeCells([
      { rowIndex: groupIdx, field: 'salary', value: 999 }, // kind='group' → skip
      { rowIndex: dataIdx,  field: 'salary', value: 111 }, // kind='data'  → 정상 처리 시도
    ]);

    expect(skipped).toBe(1);
  });

  it('skip 발생 시 writeCellsSkip 이벤트로 표면화된다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.groupBy(['dept']);
    grid.expandAll();

    const model = grid.getFlatRowModel();
    const groupIdx = [0, 1, 2, 3, 4, 5].find(i => model.resolveFlatRow(i).kind === 'group')!;

    const onSkip = vi.fn();
    grid.on('writeCellsSkip', onSkip);
    grid.writeCells([{ rowIndex: groupIdx, field: 'salary', value: 999 }]);

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip.mock.calls[0][0]).toMatchObject({ skipped: 1, total: 1 });
  });

  it('전부 data 대상이면 skip=0, writeCellsSkip 미발생', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const onSkip = vi.fn();
    grid.on('writeCellsSkip', onSkip);

    const skipped = grid.writeCells([{ rowIndex: 0, field: 'name', value: 'X' }]);

    expect(skipped).toBe(0);
    expect(onSkip).not.toHaveBeenCalled();
  });
});
