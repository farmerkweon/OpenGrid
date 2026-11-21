/**
 * 걸음 C9 (본문 몫) — 가로 창: 그려 둔 창 기록, 창 옮김(들어온 칸만 만들고 나간 칸만 뗌), 좌우 빈칸, og-cell--last.
 * 테스트 설계서 C9 줄: 창이 전 컬럼이면 본문 DOM 바이트 같음 · U-BV-03~06 · U-BV-15(무작위 — 창 옮김 == 그 창으로 통째) ·
 * 묶음·나무·디테일 행도 창(Q-35) · Q-37(og-cell--last 는 오른쪽 빈칸이 있을 때만) · 뜨거운 길(한 컬럼 옮김 = 보이는 행 수 × 1 칸).
 * 창은 BodyView.update 로 직접 준다(스케줄러가 창을 켜기 전에도 본문 몫을 시험할 수 있게).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import { SCENES, installSceneEnv, disposeScene, makeSceneContainer, tick, rows } from '../wg-helpers/scenes.js';
import { unformatGolden, maskRowIds } from '../wg-helpers/dom-snapshot.js';

const GOLDEN = path.resolve(__dirname, '../__golden__/wg');

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

const body = (c: HTMLElement) => c.querySelector<HTMLElement>('.og-body')!;
const bodyHtml = (c: HTMLElement) => maskRowIds(body(c).outerHTML);
const W = (segs: Array<[number, number]>, n: number) => ColumnWindow.of(segs.map(([from, to]) => ({ from, to })) as any, n);

async function wide(options: Record<string, any> = {}, ncol = 50, n = 60, after?: (g: any) => any) {
  const container = makeSceneContainer();
  const columns = Array.from({ length: ncol }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
  const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns, ...options } as any);
  grid.setData(rows(n, ncol, (r, o) => { o.c0 = ['A', 'B', 'C'][r % 3]; }));
  await tick();
  if (after) { await after(grid); await tick(); }
  (grid as any)._doRender(...(grid as any)._visRange());
  await tick(1);
  const view = (grid as any)._renderer._bodyView;
  return { grid, container, view, dispose: () => disposeScene({ grid, container }) };
}
/** 그 창으로 통째로 다시 그린 본문(같은 마지막 프레임). */
function freshWith(view: any, c: HTMLElement, w: ColumnWindow): string {
  view.update({ columns: w }, 'rebuild', 'none');
  return bodyHtml(c);
}

describe('C9 본문 — 창이 전 컬럼이면 바이트 같음', () => {
  for (const { id, make } of SCENES) {
    it(`C9-GD ${id} 본문 outerHTML == 골든의 본문(머리글은 다른 레인 몫이라 뺌)`, async () => {
      const s = await make();
      try {
        const holder = document.createElement('div');
        holder.innerHTML = unformatGolden(fs.readFileSync(path.join(GOLDEN, `${id}.html`), 'utf8'));
        const want = maskRowIds(holder.querySelector('.og-body')!.outerHTML);
        expect(maskRowIds(body(s.container).outerHTML) === want).toBe(true);
        expect(s.container.querySelectorAll('.og-col-gap, .og-cell--last').length).toBe(0);
      } finally { disposeScene(s); }
    });
  }
});

describe('C9 본문 — 창 옮김', () => {
  it('drawn.columns — 통째 그리기 뒤 그 창(전 컬럼이면 full) · 창 옮김 뒤 새 창', async () => {
    const m = await wide();
    try {
      expect(m.view.drawn.columns.full).toBe(true);
      const w = W([[0, 15]], 50);
      m.view.update({ columns: w }, 'rebuild', 'none');
      expect(m.view.drawn.columns).toBe(w);
      const w2 = W([[3, 18]], 50);
      m.view.update({ columns: w2 }, 'none', 'shift');
      expect(m.view.drawn.columns).toBe(w2);
    } finally { m.dispose(); }
  });

  it('U-BV-03 창 [0,15] → [3,18]: 남는 칸 3~15 요소 그대로(===) · 붙은 칸 = 16~18 × 행 수 · 뗀 칸 = 0~2 × 행 수', async () => {
    const m = await wide();
    try {
      m.view.update({ columns: W([[0, 15]], 50) }, 'rebuild', 'none');
      const map = (m.grid as any)._renderer._cellMap;
      const rowsDrawn = m.container.querySelectorAll('.og-body .og-row').length;
      const kept = new Map<string, HTMLElement>();
      for (let ri = 0; ri < rowsDrawn; ri++) for (let ci = 3; ci <= 15; ci++) kept.set(`${ri},${ci}`, map.get(ri, ci));
      let added = 0, removed = 0;
      const mo = new MutationObserver(recs => {
        for (const r of recs) {
          r.addedNodes.forEach(n => { if ((n as HTMLElement).getAttribute?.('role') === 'gridcell') added++; });
          r.removedNodes.forEach(n => { if ((n as HTMLElement).getAttribute?.('role') === 'gridcell') removed++; });
        }
      });
      mo.observe(body(m.container), { childList: true, subtree: true });
      m.view.update({ columns: W([[3, 18]], 50) }, 'none', 'shift');
      await Promise.resolve();
      mo.disconnect();
      for (const [k, el] of kept) { const [ri, ci] = k.split(',').map(Number); expect(map.get(ri!, ci!)).toBe(el); expect(el.isConnected).toBe(true); }
      expect(added).toBe(3 * rowsDrawn);
      expect(removed).toBe(3 * rowsDrawn);
      expect(map.size).toBe(16 * rowsDrawn);
    } finally { m.dispose(); }
  });

  it('U-BV-04·05 여분 둘 + 고정 2 + 창 [11,32]: 행 자식 차례 = 여분 → 고정 0·1 → 빈칸(2~10) → 11…32 → 빈칸(33~49) · 빈칸은 칸이 아님', async () => {
    const m = await wide({ frozenColumns: 2, rowNumber: true, checkColumn: true });
    try {
      m.view.update({ columns: W([[0, 1], [11, 32]], 50) }, 'rebuild', 'none');
      const row = m.container.querySelector<HTMLElement>('.og-body .og-row')!;
      const order = Array.from(row.children).map(el => el.classList.contains('og-col-gap') ? 'gap' : (el.getAttribute('aria-colindex') ?? el.className.split(' ').pop()));
      const want = ['og-col-rownum', 'og-col-check', '1', '2', 'gap', ...Array.from({ length: 22 }, (_, i) => String(12 + i)), 'gap'];
      expect(order).toEqual(want);
      const gaps = Array.from(row.querySelectorAll<HTMLElement>('.og-col-gap'));
      for (const g of gaps) {
        expect(g.classList.contains('og-cell')).toBe(false);
        expect(g.hasAttribute('role')).toBe(false);
        expect(g.hasAttribute('aria-colindex')).toBe(false);
      }
      expect(gaps[0]!.style.width).toBe('1080px');
      expect(gaps[1]!.style.width).toBe(`${17 * 120}px`);
    } finally { m.dispose(); }
  });

  it('U-BV-06 og-cell--last: 창 [11,32] → [14,35] 에서 32 칸 → 35 칸으로 옮김, 행마다 하나 · 오른쪽 빈칸이 없으면 없음(Q-37)', async () => {
    const m = await wide();
    try {
      m.view.update({ columns: W([[11, 32]], 50) }, 'rebuild', 'none');
      const lastOf = () => Array.from(m.container.querySelectorAll<HTMLElement>('.og-body .og-row')).map(r => {
        const l = r.querySelectorAll('.og-cell--last');
        return l.length === 1 ? l[0]!.getAttribute('aria-colindex') : `n=${l.length}`;
      });
      expect(new Set(lastOf())).toEqual(new Set(['33']));
      m.view.update({ columns: W([[14, 35]], 50) }, 'none', 'shift');
      expect(new Set(lastOf())).toEqual(new Set(['36']));
      m.view.update({ columns: W([[30, 49]], 50) }, 'none', 'shift');
      expect(m.container.querySelectorAll('.og-cell--last').length).toBe(0);
    } finally { m.dispose(); }
  });

  const MODES: Array<[string, Record<string, any>, ((g: any) => any) | undefined]> = [
    ['보통', {}, undefined],
    ['고정+여분', { frozenColumns: 3, rowNumber: true, checkColumn: true, stateColumn: true }, undefined],
    ['묶음', { rowNumber: true }, (g: any) => g.groupBy(['c0'])],
    ['디테일', { frozenColumns: 1, masterDetail: { enabled: true, height: 64, renderer: (r: any, h: HTMLElement) => { h.textContent = `d ${r.c1}`; } } }, (g: any) => g.expandRow(1)],
  ];
  for (const [name, opts, after] of MODES) {
    it(`C9-SH ${name}: 창 옮김 결과 == 그 창으로 통째 그린 결과(바이트, 들어온·나간·겹침 없음 셋)`, async () => {
      const m = await wide(opts, 50, 60, after);
      try {
        const F = opts.frozenColumns ?? 0;
        const seg = (a: number, b: number): Array<[number, number]> => (F > 0 ? [[0, F - 1], [Math.max(a, F), b]] : [[a, b]]);
        const steps = [seg(5, 20), seg(8, 23), seg(2, 17), seg(30, 45), seg(0, 49)];
        m.view.update({ columns: W(seg(0, 15), 50) }, 'rebuild', 'none');
        for (const st of steps) {
          const w = W(st, 50);
          m.view.update({ columns: w }, 'none', 'shift');
          const shifted = bodyHtml(m.container);
          expect(shifted).toBe(freshWith(m.view, m.container, w));
        }
      } finally { m.dispose(); }
    });
  }

  it('U-BV-15 무작위 — 씨앗 4 × 40걸음(통째·옮김 섞음): 매 걸음 옮긴 화면 == 통째 · 칸 지도 수 = DOM 칸 수 · 행마다 칸 = 창', async () => {
    const m = await wide({ frozenColumns: 2, rowNumber: true });
    try {
      const map = (m.grid as any)._renderer._cellMap;
      for (let seed = 1; seed <= 4; seed++) {
        let x = seed * 7919;
        const rnd = (n: number) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
        for (let step = 0; step < 40; step++) {
          const a = 2 + rnd(40), b = Math.min(49, a + 5 + rnd(20));
          const w = W([[0, 1], [a, b]], 50);
          if (rnd(4) === 0) m.view.update({ columns: w }, 'rebuild', 'none');
          else m.view.update({ columns: w }, 'none', 'shift');
          const now = bodyHtml(m.container);
          const cells = m.container.querySelectorAll('.og-body .og-row [role="gridcell"]').length;
          expect(map.size, `seed ${seed} step ${step}`).toBe(cells);
          const perRow = m.container.querySelector('.og-body .og-row')!.querySelectorAll('[role="gridcell"]').length;
          expect(perRow).toBe(2 + (b - Math.max(a, 2) + 1));
          expect(now, `seed ${seed} step ${step}`).toBe(freshWith(m.view, m.container, w));
        }
      }
    } finally { m.dispose(); }
  });

  it('C9-HOT 창이 한 컬럼 움직일 때 만드는 칸 = 보이는 자료 행 수 × 1', async () => {
    const m = await wide({}, 50, 200);
    try {
      m.view.update({ columns: W([[10, 25]], 50) }, 'rebuild', 'none');
      const rowsDrawn = m.container.querySelectorAll('.og-body .og-row').length;
      const orig = document.createElement.bind(document);
      let divs = 0;
      (document as any).createElement = (t: string, o?: any) => { if (t === 'div') divs++; return orig(t, o); };
      try { m.view.update({ columns: W([[11, 26]], 50) }, 'none', 'shift'); } finally { (document as any).createElement = orig; }
      // 들어온 칸 하나에 div 1 — 빈칸은 옛 요소를 다시 써서 새로 만들지 않는다
      expect(divs).toBe(rowsDrawn * 1);
      expect(m.container.querySelectorAll('.og-body .og-row > .og-col-gap').length).toBe(rowsDrawn * 2);
    } finally { m.dispose(); }
  });

  it('C9-ARM 누른 칸(한 번짜리 dblclick 듣개)이 창에서 나가면 듣개도 풀림', async () => {
    const m = await wide();
    try {
      m.view.update({ columns: W([[0, 15]], 50) }, 'rebuild', 'none');
      const router = m.view._events;
      const cell = m.container.querySelector<HTMLElement>('.og-body .og-row [role="gridcell"][aria-colindex="2"]')!;
      // 칸 click 이 다시 그리기를 부르지 않게 콜백만 기록으로 바꾼다
      (m.grid as any)._renderer._cbs.onCellClick = () => {};
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(router._armed).toBe(cell);
      m.view.update({ columns: W([[5, 20]], 50) }, 'none', 'shift');
      expect(cell.isConnected).toBe(false);
      expect(router._armed).toBe(null);
    } finally { m.dispose(); }
  });

  it('C9-GP 빈칸 폭 등록 · 창 옮김 뒤 등록 자리가 모두 붙어 있고 px == 기하', async () => {
    const m = await wide({ frozenColumns: 2 });
    try {
      const a = (m.grid as any)._renderer._applier;
      m.view.update({ columns: W([[0, 1], [10, 25]], 50) }, 'rebuild', 'none');
      for (const w of [W([[0, 1], [12, 27]], 50), W([[0, 1], [30, 45]], 50), W([[0, 1], [2, 17]], 50)]) {
        m.view.update({ columns: w }, 'none', 'shift');
        for (const p of a.projections('body')) {
          expect(p.el.isConnected, p.el.className).toBe(true);
          expect((p.el.style as any)[p.prop], p.el.className).toBe(p.value);
        }
      }
    } finally { m.dispose(); }
  });
});
