/**
 * 걸음 C9 — U-EVT-05 빈칸(og-col-gap) click. L19(TEST).
 * 테스트 설계서 U-EVT-05 는 「가상화 빈칸 click 콜백 0」. BODY(L35 13:47) 물음에 총괄 판정: **지금 동작을 받는다** —
 * 빈칸은 화면 밖 컬럼 자리라 보통 눌릴 일이 없고, 눌리면 그 행을 누른 것과 같게(여분 칸·자리채움과 같은 뜻):
 * 칸 콜백(cellClick·cellMouseDown·cellDblClick) 0 · 행 click 1.
 * 대조: 같은 행의 진짜 칸을 누르면 cellClick 1(계수기가 살아 있음).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installSceneEnv, makeSceneContainer, tick, disposeScene, cols, rows } from './wg-helpers/scenes.js';
import { fire, frames } from './wg-helpers/counters.js';

vi.setConfig({ testTimeout: 30_000 });
// DF-01 과 같은 장면 환경(컨테이너·본문 상자 크기를 주어 가로 창이 켜지게).
let restoreEnv: () => void;
beforeAll(() => { restoreEnv = installSceneEnv(); });
afterAll(() => { restoreEnv(); });
const disposeW = (s: { grid: OpenGrid<any>; container: HTMLElement }) => disposeScene(s);

async function setup() {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, { columns: cols(50), rowHeight: 32, headerHeight: 40 } as any);
  grid.setData(rows(200, 50));
  await tick();
  const bw = container.querySelector<HTMLElement>('.og-body-wrapper')!;
  bw.scrollLeft = 3000;
  bw.dispatchEvent(new Event('scroll'));
  await tick(3);
  await frames(1);
  const s = { grid, container };
  const g: any = grid;
  const n = { cellClick: 0, cellMouseDown: 0, cellDblClick: 0, rowClick: 0 };
  for (const k of Object.keys(n) as (keyof typeof n)[]) g.on(k, () => { n[k]++; });
  const row = s.container.querySelector<HTMLElement>('.og-body [role="row"][aria-rowindex="2"]')!;
  return { s, n, row };
}
const press = (el: HTMLElement) => {
  fire(el, 'mousedown', { clientX: 5, clientY: 5 });
  fire(el, 'mouseup', { clientX: 5, clientY: 5 });
  fire(el, 'click', { clientX: 5, clientY: 5 });
};

describe('U-EVT-05 가로 창의 빈칸 click = 그 행 click(칸 콜백 0)', () => {
  it('U-EVT-05 준비: 가로 3,000 에서 행 안에 왼쪽 빈칸(og-col-gap)이 있다 — 창이 켜짐', async () => {
    const { s, row } = await setup();
    try {
      const gap = row.querySelector('.og-col-gap');
      expect(gap, '빈칸 요소').not.toBeNull();
      expect(gap!.classList.contains('og-cell')).toBe(false);
      expect(gap!.getAttribute('role')).toBeNull();
    } finally { disposeW(s); }
  });

  // 「행 click 1」= 본문 위임이 그 행을 컬럼 −1 로 한 번 넘긴다(_handleCellClick(ri, −1) — 여분 칸·자리채움과 같은 길).
  // 그 길은 행 선택만 하고 공개 cellClick·rowClick 은 내지 않는다(누른 컬럼이 없으므로 — 여분 칸 click 과 같음, 2026-11-21 잼).
  it('U-EVT-05 빈칸 click → 행 click 1(그 행·컬럼 −1) · 칸 콜백(cellClick·cellMouseDown·cellDblClick) 0 · 공개 rowClick 0 · 그 행이 선택됨', async () => {
    const { s, n, row } = await setup();
    try {
      const g: any = s.grid;
      const calls: Array<[number, number]> = [];
      const orig = g._handleCellClick.bind(g);
      g._handleCellClick = (ri: number, ci: number, e: MouseEvent) => { calls.push([ri, ci]); orig(ri, ci, e); };
      press(row.querySelector<HTMLElement>('.og-col-gap')!);
      await frames(1);
      expect(calls).toEqual([[1, -1]]);
      expect(n).toEqual({ cellClick: 0, cellMouseDown: 0, cellDblClick: 0, rowClick: 0 });
      expect(s.container.querySelector('.og-body [role="row"][aria-rowindex="2"]')!.classList.contains('og-selected')).toBe(true);
    } finally { disposeW(s); }
  });

  it('U-EVT-05 빈칸 dblclick → cellDblClick 0', async () => {
    const { s, n, row } = await setup();
    try {
      fire(row.querySelector<HTMLElement>('.og-col-gap')!, 'dblclick', { clientX: 5, clientY: 5 });
      await frames(1);
      expect(n.cellDblClick).toBe(0);
    } finally { disposeW(s); }
  });

  it('U-EVT-05 대조: 같은 행의 진짜 칸 click → cellClick 1 · rowClick 1(계수기가 살아 있음)', async () => {
    const { s, n, row } = await setup();
    try {
      press(row.querySelector<HTMLElement>('[role="gridcell"]')!);
      await frames(1);
      expect([n.cellClick, n.rowClick]).toEqual([1, 1]);
    } finally { disposeW(s); }
  });
});
