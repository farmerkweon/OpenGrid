/**
 * 넓은 그리드 · 걸음 C1 의 VP 몫 — 정렬·필터 뒤 범위 수식 재계산이 바뀐 것이 없으면 다시 그리지 않는다.
 * PACT_C1 §4(「orderBy 한 번에 본문 그리기 3 → 1 의 나머지 몫」). 레인 L21(VP).
 * 번호는 이 파일에서 붙인 것(VP-C1-*) — 테스트 설계서 NR-03b(orderBy 그리기 횟수)·HL-09 상한의 VP 쪽 근거.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installResizeObserverStub, makeContainer } from './widegrid-helpers.js';
import { injectBodyWrap, frames } from './wg-helpers/counters.js';

beforeAll(() => installResizeObserverStub());

const COLS = [
  { field: 'name', header: 'Name', width: 100 },
  { field: 'dept', header: 'Dept', width: 100 },
  { field: 'salary', header: 'Salary', width: 100, type: 'number' },
];

async function sized(data: any[]): Promise<{ grid: OpenGrid<any>; container: HTMLElement; paints: () => number; reset: () => void }> {
  const container = makeContainer(800, 400);
  const grid = new OpenGrid<any>(container, { columns: COLS, sortable: true } as any);
  injectBodyWrap(container, 800, 400);
  grid.setData(data);
  await frames(3);
  // 그리기 실행기는 부를 때마다 인스턴스의 _doRender 를 찾는다 — 갈아 끼워 횟수를 센다.
  const g = grid as any;
  const orig = g._doRender.bind(g);
  let n = 0;
  g._doRender = (s: number, e: number) => { n++; return orig(s, e); };
  return { grid, container, paints: () => n, reset: () => { n = 0; } };
}

/** 그려진 칸 글자(행 aria-rowindex 1부터, 컬럼 aria-colindex 1부터). */
function cellText(container: HTMLElement, ri: number, ci: number): string | null {
  const row = container.querySelector(`[role="row"][aria-rowindex="${ri + 1}"]`);
  return row?.querySelector(`[role="gridcell"][aria-colindex="${ci + 1}"]`)?.textContent ?? null;
}

const rows4 = () => [
  { name: 'r0', dept: '', salary: 10 },
  { name: 'r1', dept: '', salary: 40 },
  { name: 'r2', dept: '', salary: 30 },
  { name: 'r3', dept: '', salary: 20 },
];

describe('C1 VP — 바뀐 수식 0 이면 다시 그리기 요청 안 함', () => {
  it('VP-C1-01 수식 없는 그리드: orderBy 한 번에 본문 그리기 1', async () => {
    const s = await sized(rows4());
    s.reset();
    s.grid.orderBy('salary', 'desc');
    await frames(2);
    expect(s.paints()).toBe(1);
    expect(cellText(s.container, 0, 2)).toBe('40');
    s.grid.destroy(); s.container.remove();
  });

  it('VP-C1-02 범위 아닌 수식만 있는 그리드: orderBy 그리기 1 · 수식 칸 값이 정렬 뒤 자리에 옳게 보임', async () => {
    const s = await sized(rows4());
    s.grid.setCellFormula(0, 'dept', '=C1*2'); // r0.dept = r0.salary*2 = 20 (같은 행 참조 — 범위 아님)
    await frames(2);
    const r0 = s.grid.getFlatRowModel().rowIdOfFlat(0)!;
    s.reset();
    s.grid.orderBy('salary', 'desc');
    await frames(2);
    expect(s.paints()).toBe(1);
    const at = s.grid.getFlatRowModel().flatIndexOfRowId(r0);
    expect(cellText(s.container, at, 0)).toBe('r0');
    expect(Number(cellText(s.container, at, 1))).toBe(Number(s.grid.readCell(at, 'dept')));
    s.grid.destroy(); s.container.remove();
  });

  it('VP-C1-03 범위 수식이 바뀌는 필터: 지금처럼 다시 그림 · 화면에 새 값(40)', async () => {
    const s = await sized(rows4().map((r, i) => ({ ...r, salary: [10, 20, 30, 40][i] })));
    const r3 = s.grid.getFlatRowModel().rowIdOfFlat(3)!;
    s.grid.setCellFormula(3, 'dept', '=SUM(C1:C3)');
    await frames(2);
    expect(cellText(s.container, 3, 1)).toBe('60');
    s.reset();
    let recalcEvents = 0;
    s.grid.on('formulaRecalc', () => { recalcEvents++; });
    s.grid.setFilter('salary', [{ operator: '!=', value: 20 } as any]);
    await frames(2);
    const at = s.grid.getFlatRowModel().flatIndexOfRowId(r3);
    expect(cellText(s.container, at, 1)).toBe('40');
    expect(recalcEvents).toBe(1);
    expect(s.paints()).toBeGreaterThanOrEqual(1);
    s.grid.destroy(); s.container.remove();
  });

  it('VP-C1-04 바뀐 것이 없으면 formulaRecalc 이벤트도 없음(규칙 그대로)', async () => {
    const s = await sized(rows4());
    let recalcEvents = 0;
    s.grid.on('formulaRecalc', () => { recalcEvents++; });
    s.grid.orderBy('salary', 'asc');
    await frames(2);
    expect(recalcEvents).toBe(0);
    s.grid.destroy(); s.container.remove();
  });
});
