/**
 * C6 맞대기 — 본문 마우스 이벤트를 칸마다 붙이던 리스너에서 본문 위임 하나로 바꾸어도
 * 콜백 기록(종류·대상 칸·차례·횟수)과 바깥 부모로 새는 이벤트가 같은가.
 *
 * 쓰는 법
 * - 보통 실행: 지금 src 로 기록을 만들어 걸음 전 기록(`__golden__/wg/C6_EVENTS_pre.json`)과 맞댄다.
 *   설계가 바꾸기로 한 것(칸 안 자식 사이 이동의 over/out — U-EVT-02)만 기대 차이로 둔다.
 * - 기록 만들기: `WG_SRC=<src 사본 경로> WG_C6_OUT=<json 경로>` 로 돌리면 그 src 로 기록만 쓴다
 *   (steps/C6/L35/tools/parity.mjs 가 걸음 전 사본·지금 사본을 같은 순간에 만들어 두 번 돌린다).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installSceneEnv, makeSceneContainer, tick } from '../wg-helpers/scenes.js';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = process.env.WG_SRC ? path.resolve(process.env.WG_SRC) : path.join(ROOT, 'src');
const OUT = process.env.WG_C6_OUT;
const PRE = path.join(ROOT, 'test/unit/__golden__/wg/C6_EVENTS_pre.json');

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

type Log = string[];
const TYPES = ['click', 'dblclick', 'mouseover', 'mouseout', 'mousedown', 'mouseup', 'mousemove', 'keydown'] as const;

async function load() {
  const og = await import(/* @vite-ignore */ path.join(SRC, 'core/OpenGrid.ts'));
  const cr = await import(/* @vite-ignore */ path.join(SRC, 'core/renderers/CellRenderer.ts'));
  return { OpenGrid: og.OpenGrid, registerRenderer: cr.registerRenderer };
}

function cols(n = 6) {
  return Array.from({ length: n }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 100 }));
}
function data(n: number, ncol = 6, patch?: (r: number, o: any) => void) {
  return Array.from({ length: n }, (_, r) => {
    const o: any = { id: `r${r}` };
    for (let c = 0; c < ncol; c++) o[`c${c}`] = `r${r}c${c}`;
    patch?.(r, o);
    return o;
  });
}

/** 그리드 하나 + 바깥 부모 + 기록. 콜백은 기록만 하고 넘기지 않는다(그리드 상태가 바뀌어 다음 조작이 흔들리지 않게). */
async function mount(options: any, rows: any[], after?: (g: any) => Promise<void> | void) {
  const { OpenGrid } = await load();
  const log: Log = [];
  const outer = document.createElement('div');
  document.body.appendChild(outer);
  const container = makeSceneContainer();
  outer.appendChild(container);
  for (const t of TYPES) outer.addEventListener(t, () => log.push(`outer:${t}`));
  const grid = new OpenGrid(container, { rowHeight: 32, headerHeight: 40, ...options });
  grid.setData(rows);
  await tick();
  if (after) { await after(grid); await tick(); }
  const cbs = grid._renderer._cbs;
  for (const k of ['onCellClick', 'onCellDblClick', 'onCellMouseOver', 'onCellMouseOut', 'onCellMouseDown', 'onCellMouseUp', 'onCellMouseMove']) {
    cbs[k] = (ri: number, ci: number) => log.push(`${k}(${ri},${ci})`);
  }
  cbs.onRowCheck = (ri: number, v: boolean) => log.push(`onRowCheck(${ri},${v})`);
  if (grid._grpMgr) grid._grpMgr.handleGroupToggle = (key: string) => log.push(`groupToggle(${key})`);
  if (grid._grpMgr) grid._grpMgr.handleTreeToggle = (id: unknown) => log.push(`treeToggle(${String(id)})`);
  (grid as any)._doRender(...(grid as any)._visRange());
  await tick(1);
  return { grid, container, outer, log };
}

function fire(el: Element | null, type: string, init: MouseEventInit = {}) {
  if (!el) throw new Error(`대상 없음: ${type}`);
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 장면 하나를 돌려 조작별 기록을 돌려준다. */
type Scene = { id: string; options: any; rows: any[]; after?: (g: any) => any; ops: Array<[string, (c: HTMLElement) => void]> };

const cell = (c: HTMLElement, ri: number, ci: number) =>
  c.querySelector(`.og-body .og-row[aria-rowindex="${ri + 1}"] .og-cell[aria-colindex="${ci + 1}"]`) as HTMLElement;

const BASIC_OPS: Scene['ops'] = [
  ['click 칸 글자', c => fire(cell(c, 1, 2).querySelector('.og-cell-text') ?? cell(c, 1, 2), 'click')],
  ['click 칸', c => fire(cell(c, 2, 0), 'click')],
  ['dblclick 칸', c => fire(cell(c, 1, 3), 'dblclick')],
  ['mousedown/up/move 칸', c => { const e = cell(c, 0, 1); fire(e, 'mousedown'); fire(e, 'mousemove'); fire(e, 'mouseup'); }],
  ['over/out 칸 A→B', c => { const a = cell(c, 1, 1), b = cell(c, 1, 2); fire(a, 'mouseout', { relatedTarget: b }); fire(b, 'mouseover', { relatedTarget: a }); }],
  ['over 바깥→칸', c => fire(cell(c, 3, 4), 'mouseover', { relatedTarget: c })],
  ['out 칸→바깥', c => fire(cell(c, 3, 4), 'mouseout', { relatedTarget: c })],
  ['click 행번호 칸', c => fire(c.querySelector('.og-body .og-row[aria-rowindex="3"] .og-col-rownum'), 'click')],
  ['click 상태 칸', c => fire(c.querySelector('.og-body .og-row[aria-rowindex="3"] .og-col-state'), 'click')],
  ['click 체크 상자', c => fire(c.querySelector('.og-body .og-row[aria-rowindex="4"] .og-col-check input'), 'click')],
  ['click 체크 칸 여백', c => fire(c.querySelector('.og-body .og-row[aria-rowindex="4"] .og-col-check'), 'click')],
  ['mousedown 행번호 칸', c => fire(c.querySelector('.og-body .og-row[aria-rowindex="3"] .og-col-rownum'), 'mousedown')],
  ['click 행 자체', c => fire(c.querySelector('.og-body .og-row[aria-rowindex="5"]'), 'click')],
  ['click 본문 빈 곳', c => fire(c.querySelector('.og-body'), 'click')],
  ['click 머리글 칸', c => fire(c.querySelector('th, .og-header-cell'), 'mousemove')],
];

const SCENES: Scene[] = [
  { id: 'basic', options: { columns: cols(), rowNumber: true, checkColumn: true, stateColumn: true }, rows: data(30), ops: BASIC_OPS },
  { id: 'frozen', options: { columns: cols(), frozenColumns: 2, rowNumber: true }, rows: data(30), ops: [
    ['click 고정 칸', c => fire(cell(c, 1, 0), 'click')],
    ['over/out 고정→보통', c => { const a = cell(c, 1, 1), b = cell(c, 1, 2); fire(a, 'mouseout', { relatedTarget: b }); fire(b, 'mouseover', { relatedTarget: a }); }],
    ['dblclick 고정 칸', c => fire(cell(c, 2, 1), 'dblclick')],
  ] },
  { id: 'merge', options: { columns: cols() }, rows: data(30), after: (g) => g.mergeCells([{ row: 0, col: 1, colSpan: 3 }, { row: 2, col: 4, rowSpan: 3 }]), ops: [
    ['click 가로 병합 칸', c => fire(c.querySelector('.og-cell[aria-colspan="3"]'), 'click')],
    ['click 병합 자리채움', c => fire(c.querySelector('.og-cell--merge-ph'), 'click')],
    ['click 세로 병합 마스터', c => fire(c.querySelector('.og-cell[aria-rowspan="3"]'), 'click')],
    ['mousemove 세로 병합 마스터', c => fire(c.querySelector('.og-cell[aria-rowspan="3"]'), 'mousemove')],
    ['over 마스터 바깥→칸', c => fire(c.querySelector('.og-cell[aria-rowspan="3"]'), 'mouseover', { relatedTarget: c })],
  ] },
  { id: 'group', options: { columns: cols() }, rows: data(30, 6, (r, o) => { o.c0 = ['A', 'B', 'C'][r % 3]; }), after: (g) => g.groupBy(['c0']), ops: [
    ['click 묶음 행 칸', c => fire(c.querySelector('.og-group-row .og-group-cell'), 'click')],
    ['click 묶음 행 이름', c => fire(c.querySelector('.og-group-row .og-group-label'), 'click')],
    ['mousedown 묶음 행', c => fire(c.querySelector('.og-group-row'), 'mousedown')],
    ['over 묶음 행 칸', c => fire(c.querySelector('.og-group-row .og-group-cell'), 'mouseover', { relatedTarget: c })],
  ] },
  { id: 'detail', options: { columns: cols(), masterDetail: { enabled: true, height: 64, renderer: (_row: any, host: HTMLElement) => { const b = document.createElement('button'); b.className = 'in-detail'; b.textContent = 'x'; host.appendChild(b); } } },
    rows: data(30), after: (g) => g.expandRow(1), ops: [
    ['click 디테일 패널 안', c => fire(c.querySelector('.og-detail-panel .in-detail') ?? c.querySelector('.og-detail-panel'), 'click')],
    ['mousedown 디테일 패널 안', c => fire(c.querySelector('.og-detail-panel'), 'mousedown')],
    ['click 펼침 단추', c => fire(c.querySelector('.og-detail-expander'), 'click')],
    ['click 펼침 칸', c => fire(c.querySelector('.og-col-detail-toggle'), 'click')],
    ['click 자료 칸', c => fire(cell(c, 0, 1), 'click')],
  ] },
];

SCENES.push({ id: 'tree', options: { columns: cols(), treeMode: 'flat', treeId: 'id', treeParentId: 'pid' },
  rows: data(30, 6, (r, o) => { o.id = 'n' + r; o.pid = r % 10 === 0 ? null : 'n' + (r - (r % 10)); }),
  after: (g) => { g.enableTree(); g.expandAllNodes(); }, ops: [
    ['click 나무 아이콘', c => fire(c.querySelector('.og-tree-node-icon--toggle'), 'click')],
    ['keydown Enter 나무 아이콘', c => { const i = c.querySelector('.og-tree-node-icon--toggle')!; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); }],
    ['keydown a 나무 아이콘', c => { const i = c.querySelector('.og-tree-node-icon--toggle')!; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })); }],
    ['click 나무 칸 글자', c => fire(c.querySelector('.og-tree-cell')!.parentElement, 'click')],
    ['click 잎 아이콘', c => fire(c.querySelector('.og-tree-node-icon--leaf'), 'click')],
  ] });

/** 사용자 렌더러 — 칸 안에 자식 셋, 둘째는 자기 click 리스너(전파 그대로), 셋째는 자기 click 에서 전파를 막음. */
function kidsScene(registerRenderer: (n: string, f: any) => void): Scene {
  registerRenderer('c6kids', () => ({
    render(ctx: any) {
      const w = document.createElement('div'); w.className = 'kids';
      const a = document.createElement('span'); a.className = 'k-a'; a.textContent = 'A';
      const b = document.createElement('span'); b.className = 'k-b'; b.textContent = 'B';
      const s = document.createElement('span'); s.className = 'k-s'; s.textContent = String(ctx.value);
      b.addEventListener('click', () => (globalThis as any).__c6log?.push('user:k-b'));
      s.addEventListener('click', (e) => { (globalThis as any).__c6log?.push('user:k-s'); e.stopPropagation(); });
      w.append(a, b, s);
      return w;
    },
  }));
  const kc = (c: HTMLElement, sel: string) => cell(c, 1, 2).querySelector(sel)!;
  return {
    id: 'kids', options: { columns: cols().map((x, i) => (i === 2 ? { ...x, renderer: 'c6kids' } : x)) }, rows: data(30), ops: [
      ['click 자식 A', c => fire(kc(c, '.k-a'), 'click')],
      ['click 자식 B(사용자 리스너)', c => fire(kc(c, '.k-b'), 'click')],
      ['click 자식 S(사용자가 전파 막음)', c => fire(kc(c, '.k-s'), 'click')],
      ['over 바깥→자식 A', c => fire(kc(c, '.k-a'), 'mouseover', { relatedTarget: c })],
      ['over/out 자식 A→B(같은 칸)', c => { const a = kc(c, '.k-a'), b = kc(c, '.k-b'); fire(a, 'mouseout', { relatedTarget: b }); fire(b, 'mouseover', { relatedTarget: a }); }],
      ['out 자식 B→바깥', c => fire(kc(c, '.k-b'), 'mouseout', { relatedTarget: c })],
      ['mousemove 자식 A', c => fire(kc(c, '.k-a'), 'mousemove')],
    ],
  };
}

/** 장면 하나를 돌려 조작별 기록을 돌려준다. */
async function recordScene(sc: Scene): Promise<Record<string, string[]>> {
  const m = await mount(sc.options, sc.rows, sc.after);
  (globalThis as any).__c6log = m.log;
  const out: Record<string, string[]> = {};
  try {
    for (const [name, op] of sc.ops) {
      m.log.length = 0;
      try { op(m.container); } catch (e) { m.log.push(`ERR ${(e as Error).message}`); }
      out[name] = m.log.slice();
    }
  } finally {
    (globalThis as any).__c6log = undefined;
    try { m.grid.destroy(); } catch { /* 이미 치움 */ }
    m.outer.remove();
  }
  return out;
}

/** 설계가 바꾸기로 한 기록(U-EVT-02: 같은 칸 안 자식 사이 이동은 칸 단위 들고-나기 — 콜백 0). */
const DESIGNED: Record<string, Record<string, string[]>> = {
  kids: { 'over/out 자식 A→B(같은 칸)': [] },
};

describe('C6 맞대기 — 이벤트 기록 걸음 전 == 지금', () => {
  // 장면마다 시험 하나 — 한 시험이 무거워 같은 PC 의 다른 측정과 겹칠 때 시간 한도에 걸리지 않게.
  const ids = [...SCENES.map(x => x.id), 'kids'];
  if (OUT) fs.writeFileSync(OUT, '{}');
  for (const id of ids) {
    it(`C6-PAR ${id}`, async () => {
      const sc = id === 'kids' ? kidsScene((await load()).registerRenderer) : SCENES.find(x => x.id === id)!;
      const now = await recordScene(sc);
      if (OUT) {
        const all = JSON.parse(fs.readFileSync(OUT, 'utf8'));
        all[id] = now;
        fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
        return;
      }
      const pre = JSON.parse(fs.readFileSync(PRE, 'utf8'))[id];
      expect(pre, `걸음 전 기록에 ${id} 장면이 없다`).toBeTruthy();
      for (const op of Object.keys(pre)) {
        const want = DESIGNED[id]?.[op] ?? pre[op];
        expect(now[op], `${id} / ${op}`).toEqual(want);
      }
    }, 30_000);
  }
});
