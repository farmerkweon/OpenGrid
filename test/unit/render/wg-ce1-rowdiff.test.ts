/**
 * 걸음 CE-1 (본문 몫) — 세로 행 차분: 「차분 결과 == 통째 결과」 대조.
 * 그리드 둘(A = 차분을 이어서, B = 늘 통째)에 같은 일을 하고 본문 outerHTML 을 바이트로 견준다.
 * 실제 그리기 길(`_doRender` → `renderBody` → `BodyView`)을 그대로 쓰고, 차분 프레임은 renderBody 에 넘어가는 프레임에
 * rowWork:'diff' 만 더해 만든다. 무작위 걸음(씨앗 고정): 세로 ±1~12 · 건너뛰기 · 대각선(창 함께) · 선택·체크·포커스·범위·
 * 행 상태 바뀜 · 정렬 직후 · 자료 바뀜 직후 · 행 높이 바뀜. 자기시험: 들어온 행의 줄무늬·행 번호를 일부러 망가뜨리면 빨개짐.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import { installSceneEnv, disposeScene, makeSceneContainer, tick, rows } from '../wg-helpers/scenes.js';
import { maskRowIds } from '../wg-helpers/dom-snapshot.js';

let restore: () => void;
beforeAll(() => {
  restore = installSceneEnv();
  if (!(OpenGrid as any).__ce1Renderer) {
    OpenGrid.registerRenderer('ce1-mark', () => ({
      render(ctx: any) { const s = document.createElement('span'); s.className = 'ce1-mark'; s.textContent = `<${ctx.value}>`; return s; },
    }) as any);
    (OpenGrid as any).__ce1Renderer = true;
  }
});
afterAll(() => restore());

const NCOL = 30;
const N = 600;
const W = (segs: Array<[number, number]>) => ColumnWindow.of(segs.map(([from, to]) => ({ from, to })) as any, NCOL);
const body = (c: HTMLElement) => c.querySelector<HTMLElement>('.og-body')!;
const html = (c: HTMLElement) => maskRowIds(body(c).outerHTML);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

async function mk(options: Record<string, any>) {
  const container = makeSceneContainer();
  const columns = Array.from({ length: NCOL }, (_, i) => ({
    field: `c${i}`, header: `H${i}`, width: 120,
    ...(i === 4 ? { renderer: 'ce1-mark' } : {}),
  }));
  const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns, ...options } as any);
  grid.setData(rows(N, NCOL, (r, o) => { o.c3 = (r * 37) % 101 - 20; }));
  await tick();
  await tick(1);
  return { grid: grid as any, container };
}

/** 실제 길로 그린다 — offsetY 는 시작 행 × 행 높이(스크롤 위치와 같은 뜻), diff 면 프레임에 rowWork 만 더함. */
function paint(g: any, s: number, e: number, cols: ColumnWindow | undefined, diff: boolean): void {
  const r = g._renderer;
  const orig = r.renderBody;
  r.renderBody = function (f: any) {
    return orig.call(r, { ...f, offsetY: s * f.opts.rowHeight, ...(diff ? { rowWork: 'diff' } : {}) });
  };
  try { g._doRender(s, e, cols); } finally { r.renderBody = orig; }
}

/** A 의 그려 둔 상태가 DOM 과 맞나 — 칸 지도 수 = DOM 칸 수 · 행 집합 = DOM 행 · 떨어진 폭 등록 0. */
function invariants(g: any, c: HTMLElement): string[] {
  const bad: string[] = [];
  const cells = body(c).querySelectorAll('.og-row [role="gridcell"]').length;
  if (g._renderer._cellMap.size !== cells) bad.push(`지도 ${g._renderer._cellMap.size} != 칸 ${cells}`);
  const view = g._renderer._bodyView;
  const domRows = body(c).querySelectorAll('.og-row').length;
  // 행 집합은 차분이 되는 화면에서만 채운다(막힌 화면은 늘 통째)
  if (!view.drawn.diffBlocked && view._rowSet.size !== domRows) bad.push(`행 집합 ${view._rowSet.size} != DOM 행 ${domRows}`);
  const a = g._renderer._applier;
  if (a) for (const p of a.projections('body')) if (!p.el.isConnected) { bad.push(`떨어진 등록 ${p.el.className}`); break; }
  return bad;
}

type Pair = { A: { grid: any; container: HTMLElement }; B: { grid: any; container: HTMLElement } };
async function pair(options: Record<string, any>): Promise<Pair> { return { A: await mk(options), B: await mk(options) }; }
function both(p: Pair, fn: (g: any) => void) { fn(p.A.grid); fn(p.B.grid); }

/** 한 걸음: A 는 차분, B 는 통째 — 바이트 같음 + A 불변 조건 + 등록 수 같음. */
/** A 가 실제로 차분 길을 탄 횟수(통째로 떨어진 걸음과 가르려고). */
let diffs = 0;
function step(p: Pair, s: number, e: number, cols: ColumnWindow | undefined, label: string): string[] {
  const view = p.A.grid._renderer._bodyView;
  const d = view._diffRows;
  view._diffRows = function (...a: any[]) { diffs++; return d.apply(this, a); };
  try { paint(p.A.grid, s, e, cols, true); } finally { view._diffRows = d; }
  paint(p.B.grid, s, e, cols, false);
  const out: string[] = [];
  if (html(p.A.container) !== html(p.B.container)) out.push(`${label}: 본문 바이트 다름`);
  for (const b of invariants(p.A.grid, p.A.container)) out.push(`${label}: ${b}`);
  const ta = p.A.grid._renderer._applier?.trackedCount('body');
  const tb = p.B.grid._renderer._applier?.trackedCount('body');
  if (ta !== tb) out.push(`${label}: 등록 수 ${ta} != ${tb}`);
  return out;
}

const SCENES: Array<[string, Record<string, any>]> = [
  ['보통', {}],
  ['고정+여분', { frozenColumns: 2, rowNumber: true, checkColumn: true, stateColumn: true }],
  // 고정 없이 여분 칸만 — 대각선에서 왼쪽 빈칸이 여분 칸 뒤에 와야 한다(실제 브라우저에서 잡힌 경우)
  ['여분(고정 없음)', { rowNumber: true, checkColumn: true }],
  ['CF 막대', { conditionalFormat: [{ id: 'b', when: { type: 'compare', op: '!=', a: -99999 }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'c3' }, priority: 0 }] }],
];

describe('CE-1 세로 행 차분 — 차분 == 통째(무작위 걸음)', () => {
  for (const [name, opts] of SCENES) {
    for (const seed of [1, 7, 42]) {
      it(`CE1-RND ${name} 씨앗 ${seed}: 세로·건너뛰기·대각선·상태 바뀜 섞어 80걸음`, async () => {
        const p = await pair(opts);
        try {
          const r = rng(seed);
          const V = 22;
          let s = 0;
          let cols: ColumnWindow | undefined = W([[0, 11]]);
          const F = opts.frozenColumns ?? 0;
          const fails: string[] = [];
          diffs = 0;
          fails.push(...step(p, s, s + V - 1, cols, 'start'));
          for (let k = 0; k < 80; k++) {
            const x = r();
            let label: string;
            if (x < 0.45) { s = Math.max(0, Math.min(N - V, s + Math.round((r() - 0.5) * 24))); label = `세로 s=${s}`; }
            else if (x < 0.55) { s = Math.floor(r() * (N - V)); label = `건너뛰기 s=${s}`; }
            else if (x < 0.75) {
              s = Math.max(0, Math.min(N - V, s + Math.round((r() - 0.5) * 10)));
              const a = Math.max(F, Math.floor(r() * (NCOL - 12)));
              cols = W(F > 0 ? [[0, F - 1], [a, a + 11]] : [[a, a + 11]]);
              label = `대각선 s=${s} a=${a}`;
            } else if (x < 0.82) {
              const ri = s + Math.floor(r() * V);
              both(p, (g) => { const set = g._rowMgr.selectedRows; set.has(ri) ? set.delete(ri) : set.add(ri); });
              s = Math.max(0, Math.min(N - V, s + 2)); label = `선택 ${ri} + 세로`;
            } else if (x < 0.88) {
              const ri = s + Math.floor(r() * V);
              both(p, (g) => { const set = g._rowMgr.checkedRows; set.has(ri) ? set.delete(ri) : set.add(ri); });
              s = Math.max(0, s - 1); label = `체크 ${ri} + 세로`;
            } else if (x < 0.93) {
              const ri = s + Math.floor(r() * V), ci = Math.floor(r() * NCOL);
              both(p, (g) => g._setFocusCell(ri, ci));
              s = Math.min(N - V, s + 3); label = `포커스 ${ri},${ci} + 세로`;
            } else {
              const ri = s + Math.floor(r() * V);
              both(p, (g) => g.setRangeSelection({ startRow: ri, endRow: ri + 4, startCol: 2, endCol: 5 }));
              s = Math.min(N - V, s + 1); label = `범위 ${ri} + 세로`;
            }
            fails.push(...step(p, s, s + V - 1, cols, `#${k} ${label}`));
            if (fails.length > 4) break;
          }
          expect(fails).toEqual([]);
          // 대부분의 걸음은 실제로 차분 길(건너뛰기·처음만 통째)
          expect(diffs).toBeGreaterThan(50);
        } finally { disposeScene(p.A); disposeScene(p.B); }
      }, 30000);
    }
  }

  it('CE1-AFTER 정렬 직후 · 자료 바뀜 직후 · 행 높이 바뀜 — 그 뒤 차분도 통째와 같음', async () => {
    const p = await pair({ rowNumber: true });
    try {
      const fails: string[] = [];
      const cols = W([[0, 11]]);
      fails.push(...step(p, 0, 21, cols, 'start'), ...step(p, 3, 24, cols, '세로'));
      both(p, (g) => g.orderBy('c3', 'desc'));
      await tick(1);
      both(p, (g) => paint(g, 3, 24, cols, false));
      fails.push(...step(p, 6, 27, cols, '정렬 뒤 세로'));
      both(p, (g) => g.setData(rows(N, NCOL, (r2, o) => { o.c1 = `x${r2}`; })));
      await tick(1);
      both(p, (g) => paint(g, 6, 27, cols, false));
      fails.push(...step(p, 2, 23, cols, '자료 바뀜 뒤 세로'));
      both(p, (g) => g.setRowHeight(40));
      await tick(1);
      fails.push(...step(p, 4, 25, cols, '행 높이 바뀜 프레임(차분 요청이어도 통째로 떨어짐)'));
      fails.push(...step(p, 7, 28, cols, '행 높이 바뀐 뒤 세로'));
      both(p, (g) => g.writeCell(10, 'c2', 'EDITED'));
      fails.push(...step(p, 9, 30, cols, '값 고침(행 상태 바뀜) + 세로'));
      expect(fails).toEqual([]);
    } finally { disposeScene(p.A); disposeScene(p.B); }
  }, 30000);

  it('CE1-BLOCK 묶음·디테일·autoHeight 는 drawn.diffBlocked 참 — 차분 요청이 와도 통째와 같음', async () => {
    for (const [opts, after] of [
      [{ rowNumber: true }, (g: any) => g.groupBy(['c0'])],
      [{ masterDetail: { enabled: true, height: 64, renderer: (_r: any, h: HTMLElement) => { h.textContent = 'd'; } } }, (g: any) => g.expandRow(1)],
      [{ autoHeight: true }, null],
    ] as Array<[Record<string, any>, ((g: any) => void) | null]>) {
      const p = await pair(opts);
      try {
        if (after) { both(p, after); await tick(1); }
        both(p, (g) => paint(g, 0, 21, undefined, false));
        expect(p.A.grid._renderer._bodyView.drawn.diffBlocked).toBe(true);
        expect(step(p, 2, 23, undefined, JSON.stringify(Object.keys(opts)))).toEqual([]);
      } finally { disposeScene(p.A); disposeScene(p.B); }
    }
    const q = await pair({});
    try {
      both(q, (g) => paint(g, 0, 21, undefined, false));
      expect(q.A.grid._renderer._bodyView.drawn.diffBlocked).toBe(false);
    } finally { disposeScene(q.A); disposeScene(q.B); }
  }, 30000);

  it('CE1-KEEP 남는 행은 요소 그대로(===) · 3행 걸음에 만든 행 = 3 · 만든 칸 = 3 × 창 컬럼 수', async () => {
    const { grid, container } = await mk({});
    try {
      const cols = W([[0, 11]]);
      paint(grid, 0, 21, cols, false);
      const before = new Map<number, Element>();
      body(container).querySelectorAll('.og-row').forEach((el) => before.set(Number(el.getAttribute('aria-rowindex')) - 1, el));
      const orig = document.createElement.bind(document);
      let divs = 0;
      (document as any).createElement = (t: string, o?: any) => { if (t === 'div') divs++; return orig(t, o); };
      try { paint(grid, 3, 24, cols, true); } finally { (document as any).createElement = orig; }
      const now = new Map<number, Element>();
      body(container).querySelectorAll('.og-row').forEach((el) => now.set(Number(el.getAttribute('aria-rowindex')) - 1, el));
      for (let ri = 3; ri <= 21; ri++) expect(now.get(ri), `ri ${ri}`).toBe(before.get(ri));
      for (let ri = 0; ri < 3; ri++) expect(now.has(ri)).toBe(false);
      // 행 div 3 + 칸 div 3 × 12 + 오른쪽 빈칸 3
      expect(divs).toBe(3 + 3 * 12 + 3);
    } finally { disposeScene({ grid, container }); }
  });

  it('CE1-PIN 편집 행은 범위 밖으로 나가도 남고, pin 풀면 그 자리에서 떼짐(지도·등록도)', async () => {
    const { grid, container } = await mk({});
    try {
      const view = grid._renderer._bodyView;
      paint(grid, 0, 21, undefined, false);
      view.pin({ editRow: 1 });
      paint(grid, 5, 26, undefined, true);
      const ris = Array.from(body(container).querySelectorAll('.og-row')).map((e) => Number(e.getAttribute('aria-rowindex')) - 1);
      expect(ris[0]).toBe(1);
      expect(ris.slice(1)).toEqual(Array.from({ length: 22 }, (_, i) => 5 + i));
      expect(grid._renderer._cellMap.get(1, 0)).toBeTruthy();
      view.pin({ editRow: null });
      expect(body(container).querySelector('.og-row[aria-rowindex="2"]')).toBeNull();
      expect(grid._renderer._cellMap.get(1, 0)).toBeUndefined();
      expect(invariants(grid, container)).toEqual([]);
    } finally { disposeScene({ grid, container }); }
  });
});

describe('CE-1 자기시험 — 대조가 망가진 차분을 잡는가', () => {
  async function broken(mutate: (el: HTMLElement) => void): Promise<string[]> {
    const p = await pair({ rowNumber: true });
    try {
      paint(p.A.grid, 0, 21, undefined, false);
      paint(p.B.grid, 0, 21, undefined, false);
      const painter = p.A.grid._renderer._bodyView._dataRows;
      const orig = painter.paint;
      painter.paint = function (...a: any[]) { const el = orig.apply(this, a); if (el) mutate(el); return el; };
      try { return step(p, 3, 24, undefined, '망가진 판'); } finally { painter.paint = orig; }
    } finally { disposeScene(p.A); disposeScene(p.B); }
  }
  it('SELF-1 들어온 행의 줄무늬를 뒤집으면 빨강', async () => {
    const r = await broken((el) => { el.style.background = el.style.background.includes('alt') ? 'var(--og-row-bg,#fff)' : 'var(--og-row-alt-bg,#fafafa)'; });
    expect(r.some((x) => x.includes('바이트'))).toBe(true);
  });
  it('SELF-2 들어온 행의 행 번호 칸 글자를 망가뜨리면 빨강', async () => {
    const r = await broken((el) => { const n = el.querySelector('.og-row-number, [class*="row-num"]'); if (n) n.textContent = '?'; else el.setAttribute('data-x', '1'); });
    expect(r.some((x) => x.includes('바이트'))).toBe(true);
  });
  it('SELF-3 남는 행 상태 열쇠를 무시하면(선택 바뀜을 못 봄) 빨강', async () => {
    const p = await pair({});
    try {
      both(p, (g) => paint(g, 0, 21, undefined, false));
      const view = p.A.grid._renderer._bodyView;
      const orig = view._stateKey;
      view._stateKey = () => 'same';
      view._rowKeys.forEach((_v: string, k: number) => view._rowKeys.set(k, 'same'));
      both(p, (g) => g._rowMgr.selectedRows.add(10));
      try { expect(step(p, 2, 23, undefined, '열쇠 무시').some((x) => x.includes('바이트'))).toBe(true); } finally { view._stateKey = orig; }
    } finally { disposeScene(p.A); disposeScene(p.B); }
  });
});
