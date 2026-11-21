/**
 * 걸음 CG (본문 몫) — 검토 반영: V-05 나무 아이콘 지도 · R-05 한 번짜리 dblclick 듣개가 떼어진 칸을 붙듦 ·
 * R-08 행 값 계산 한 벌 · V-04 묶음 이름 컬럼이 창 밖일 때 묶음 행 aria-label.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import { installSceneEnv, disposeScene, makeSceneContainer, tick, rows } from '../wg-helpers/scenes.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

const W = (segs: Array<[number, number]>, n = 30) => ColumnWindow.of(segs.map(([from, to]) => ({ from, to })) as any, n);

async function mk(options: Record<string, any>, data: any[], after?: (g: any) => void) {
  const container = makeSceneContainer();
  const columns = Array.from({ length: 30 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
  const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns, ...options } as any) as any;
  grid.setData(data);
  await tick();
  if (after) { after(grid); await tick(); }
  grid._doRender(...grid._visRange());
  await tick(1);
  return { grid, container, view: grid._renderer._bodyView, dispose: () => disposeScene({ grid, container }) };
}

describe('V-05 나무 아이콘 지도', () => {
  it('나무 컬럼이 창에서 나갔다 들어오기를 10번 해도 지도 수 = DOM 아이콘 수', async () => {
    const data = rows(60, 30, (r, o) => { o.id = r + 1; o.pid = r % 6 === 0 ? null : r - (r % 6) + 1; });
    const m = await mk({ treeMode: 'flat', treeId: 'id', treeParentId: 'pid' }, data, (g) => g.enableTree());
    try {
      m.view.update({ columns: W([[0, 11]]) }, 'rebuild', 'none');
      const icons = () => m.container.querySelectorAll('.og-body .og-tree-node-icon--toggle').length;
      const n0 = icons();
      expect(n0).toBeGreaterThan(0);
      expect(m.view._treeIcons.size).toBe(n0);
      for (let k = 0; k < 10; k++) {
        m.view.update({ columns: W([[10, 21]]) }, 'none', 'shift');
        expect(m.view._treeIcons.size, `나감 ${k}`).toBe(icons());
        m.view.update({ columns: W([[0, 11]]) }, 'none', 'shift');
        expect(m.view._treeIcons.size, `들어옴 ${k}`).toBe(icons());
      }
      expect(icons()).toBe(n0);
    } finally { m.dispose(); }
  });
});

describe('R-05 한 번짜리 dblclick 듣개', () => {
  it('떼어진 칸이 받은 dblclick 뒤: 기억한 사건은 한 작업 뒤 비고, 떼어진 칸도 놓음 · destroy 는 둘 다 놓음', async () => {
    const m = await mk({}, rows(40, 30));
    try {
      const router = m.view._events;
      m.grid._renderer._cbs.onCellClick = () => {};
      let dbl = 0;
      m.grid._renderer._cbs.onCellDblClick = () => { dbl++; };
      const cell = m.container.querySelector<HTMLElement>('.og-body .og-row [role="gridcell"][aria-colindex="2"]')!;
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(router._armed).toBe(cell);
      cell.remove(); // click 이 다시 그려 떼어진 것과 같은 꼴
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(dbl).toBe(1);
      expect(router._armed).toBe(null);
      await new Promise((r) => setTimeout(r, 0));
      expect(router._armedEvent).toBe(null);
      // 붙어 있는 칸: 한 번만 부르고, 본문 길에서 거른 뒤 사건을 놓는다
      const live = m.container.querySelector<HTMLElement>('.og-body .og-row [role="gridcell"][aria-colindex="3"]')!;
      live.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      live.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(dbl).toBe(2);
      expect(router._armedEvent).toBe(null);
      expect(router._armed).toBe(live);
      router.destroy();
      expect(router._armed).toBe(null);
      expect(router._armedEvent).toBe(null);
    } finally { m.dispose(); }
  });
});

describe('R-08 행 값 한 벌', () => {
  it('paint 가 _rowValues 를 부른다(행마다 한 번) · 행 상태·선택 행의 고정 칸 배경이 통째와 창 옮김에서 같음', async () => {
    const m = await mk({ frozenColumns: 2 }, rows(40, 30), (g) => { g._rowMgr.selectedRows.add(2); g.writeCell(3, 'c1', 'X'); });
    try {
      const painter = m.view._dataRows;
      let calls = 0;
      const orig = painter._rowValues;
      painter._rowValues = function (...a: any[]) { calls++; return orig.apply(this, a); };
      try { m.view.update({ columns: W([[0, 1], [5, 16]]) }, 'rebuild', 'none'); } finally { painter._rowValues = orig; }
      const rowsDrawn = m.container.querySelectorAll('.og-body .og-row').length;
      expect(calls).toBe(rowsDrawn);
      const bgOf = (ri: number, ci: number) => (m.container.querySelector(`.og-body .og-row[aria-rowindex="${ri + 1}"] [role="gridcell"][aria-colindex="${ci + 1}"]`) as HTMLElement).style.background;
      m.view.update({ columns: W([[0, 1], [8, 19]]) }, 'none', 'shift');
      const shifted = [bgOf(2, 0), bgOf(3, 0), bgOf(2, 18), bgOf(3, 18)];
      m.view.update({ columns: W([[0, 1], [8, 19]]) }, 'rebuild', 'none');
      expect([bgOf(2, 0), bgOf(3, 0), bgOf(2, 18), bgOf(3, 18)]).toEqual(shifted);
    } finally { m.dispose(); }
  });
});

describe('V-04 묶음 이름 컬럼이 창 밖', () => {
  it('창 밖이면 묶음 행에 aria-label(이름·건수), 창 안이면 없음(전 컬럼 = 골든 DOM 그대로)', async () => {
    const m = await mk({}, rows(30, 30, (r, o) => { o.c0 = `G${r % 3}`; }), (g) => g.groupBy(['c0']));
    try {
      const groups = () => Array.from(m.container.querySelectorAll<HTMLElement>('.og-body .og-group-row'));
      expect(groups().length).toBeGreaterThan(0);
      expect(groups().every((g) => !g.hasAttribute('aria-label'))).toBe(true);
      m.view.update({ columns: W([[10, 21]]) }, 'none', 'shift');
      const labels = groups().map((g) => g.getAttribute('aria-label'));
      expect(labels.every((l) => !!l && /G\d/.test(l) && /10/.test(l))).toBe(true);
      expect(m.container.querySelectorAll('.og-body .og-group-label').length).toBe(0);
      m.view.update({ columns: W([[0, 11]]) }, 'none', 'shift');
      expect(groups().every((g) => !g.hasAttribute('aria-label'))).toBe(true);
      m.view.update({ columns: W([[10, 21]]) }, 'rebuild', 'none');
      expect(groups().every((g) => !!g.getAttribute('aria-label'))).toBe(true);
    } finally { m.dispose(); }
  });
});

describe('창 구간 셋 이상(고정 + 꼭 넣을 컬럼 토막 + 보이는 구간) — L27 CF 요청', () => {
  const body = (c: HTMLElement) => c.querySelector<HTMLElement>('.og-body')!.outerHTML.replace(/og-r-\d+/g, 'R');
  const MODES: Array<[string, Record<string, any>, ((g: any) => void) | undefined]> = [
    ['보통', {}, undefined],
    ['고정+여분', { frozenColumns: 2, rowNumber: true, checkColumn: true }, undefined],
    ['묶음', { frozenColumns: 1, rowNumber: true }, (g) => { g.groupBy(['c0']); g.expandAll(); }],
    ['나무', { frozenColumns: 1, treeMode: 'flat', treeId: 'id', treeParentId: 'pid' }, (g) => g.enableTree()],
    ['디테일', { frozenColumns: 1, masterDetail: { enabled: true, height: 64, renderer: (_r: any, h: HTMLElement) => { h.textContent = 'd'; } } }, (g) => g.expandRow(1)],
  ];
  for (const [name, opts, after] of MODES) {
    it(`${name}: 구간 셋·넷 창으로 옮김 == 그 창으로 통째 · 폭 등록 모두 붙어 있고 px == 기하 · og-cell--last 는 오른쪽 빈칸 앞 칸 하나`, async () => {
      const data = rows(40, 30, (r, o) => { o.c0 = `G${r % 3}`; o.id = r + 1; o.pid = r % 5 === 0 ? null : r - (r % 5) + 1; });
      const m = await mk(opts, data, after);
      try {
        const F = opts.frozenColumns ?? 0;
        const fz: Array<[number, number]> = F > 0 ? [[0, F - 1]] : [];
        const wins = [
          W([...fz, [4, 4], [12, 20]]), W([...fz, [6, 7], [14, 22]]), W([...fz, [3, 3], [9, 9], [18, 26]]),
          W([...fz, [25, 25], [8, 16]].sort((a, b) => a[0] - b[0]) as Array<[number, number]>), W([...fz, [2, 29]]),
        ];
        m.view.update({ columns: W([...fz, [5, 13]]) }, 'rebuild', 'none');
        const a = m.grid._renderer._applier;
        for (const w of wins) {
          m.view.update({ columns: w }, 'none', 'shift');
          const shifted = body(m.container);
          for (const p of a.projections('body')) {
            expect(p.el.isConnected, `${name} 떨어진 등록 ${p.el.className}`).toBe(true);
            expect((p.el.style as any)[p.prop]).toBe(p.value);
          }
          const lasts = Array.from(m.container.querySelectorAll('.og-body .og-row')).map((r) => r.querySelectorAll('.og-cell--last').length);
          expect(lasts.every((n) => n === (w.gaps().length && w.segments[w.segments.length - 1]!.to < 29 ? 1 : 0))).toBe(true);
          m.view.update({ columns: w }, 'rebuild', 'none');
          expect(shifted === body(m.container), `${name} ${JSON.stringify(w.segments)}`).toBe(true);
        }
      } finally { m.dispose(); }
    });
  }
});
