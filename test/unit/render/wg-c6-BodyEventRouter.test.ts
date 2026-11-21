/**
 * 걸음 C6 — 칸 리스너 7개·행 리스너 → 본문 위임 하나(BodyEventRouter·CellLocator) + 내장 렌더러 컬럼당 한 번(ColumnPaintPlan).
 * 테스트 설계서 §10-1 C6 줄: U-EVT-01~10 · U-LOC-01~03 · U-CPP-01~03·09 · U-CP-02 · AR-04 · AR-14.
 * (U-CP-02 실행판과 리스너 수는 wg-c6-listener-count, 옛 판과 같은 기록은 wg-c6-event-parity.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { registerRenderer } from '../../../src/core/renderers/CellRenderer.js';
import { CellLocator } from '../../../src/core/render/body/CellLocator.js';
import { ColumnPaintPlan } from '../../../src/core/render/body/ColumnPaintPlan.js';
import type { BodyRowContext } from '../../../src/core/render/body/rows/BodyRowContext.js';
import { installSceneEnv, makeSceneContainer, tick, cols, rows } from '../wg-helpers/scenes.js';

const ROOT = path.resolve(__dirname, '../../..');

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

async function mount(options: Record<string, any> = {}, n = 30) {
  const outer = document.createElement('div');
  document.body.appendChild(outer);
  const container = makeSceneContainer();
  outer.appendChild(container);
  const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns: cols(), ...options } as any);
  grid.setData(rows(n));
  await tick();
  const log: string[] = [];
  const cbs = (grid as any)._renderer._cbs;
  for (const k of ['onCellClick', 'onCellDblClick', 'onCellMouseOver', 'onCellMouseOut', 'onCellMouseDown', 'onCellMouseUp', 'onCellMouseMove']) {
    cbs[k] = (ri: number, ci: number) => log.push(`${k}(${ri},${ci})`);
  }
  cbs.onRowCheck = (ri: number, v: boolean) => log.push(`onRowCheck(${ri},${v})`);
  return { grid, container, outer, log, dispose: () => { try { grid.destroy(); } catch { /* */ } outer.remove(); } };
}
const cell = (c: HTMLElement, ri: number, ci: number) =>
  c.querySelector(`.og-body .og-row[aria-rowindex="${ri + 1}"] .og-cell[aria-colindex="${ci + 1}"]`) as HTMLElement;
const fire = (el: Element, type: string, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));

describe('U-EVT — 본문 위임', () => {
  it('U-EVT-01 칸 안 깊은 자식 click → onCellClick 1번, (ri, ci) 그대로', async () => {
    const m = await mount();
    try {
      const target = cell(m.container, 2, 3);
      const deep = document.createElement('b'); const deeper = document.createElement('i');
      deep.appendChild(deeper); target.appendChild(deep);
      fire(deeper, 'click');
      expect(m.log).toEqual(['onCellClick(2,3)']);
    } finally { m.dispose(); }
  });

  it('U-EVT-02 같은 칸 안 자식 사이 이동 → over/out 0번 · 바깥→자식 1번', async () => {
    const m = await mount();
    try {
      const c = cell(m.container, 1, 1);
      const a = document.createElement('span'); const b = document.createElement('span');
      c.append(a, b);
      fire(a, 'mouseout', { relatedTarget: b }); fire(b, 'mouseover', { relatedTarget: a });
      expect(m.log).toEqual([]);
      fire(a, 'mouseover', { relatedTarget: m.container });
      expect(m.log).toEqual(['onCellMouseOver(1,1)']);
    } finally { m.dispose(); }
  });

  it('U-EVT-03 칸 A → 칸 B: out(A) 1번 · over(B) 1번, 그 차례', async () => {
    const m = await mount();
    try {
      const a = cell(m.container, 1, 1), b = cell(m.container, 1, 2);
      fire(a, 'mouseout', { relatedTarget: b }); fire(b, 'mouseover', { relatedTarget: a });
      expect(m.log).toEqual(['onCellMouseOut(1,1)', 'onCellMouseOver(1,2)']);
    } finally { m.dispose(); }
  });

  it('U-EVT-04 dblclick·mousedown·mouseup·mousemove 콜백 이름·인자·횟수 · contextmenu·keydown 은 칸 콜백 없음(옛 칸에도 리스너 없었음)', async () => {
    const m = await mount();
    try {
      const c = cell(m.container, 4, 5);
      fire(c, 'dblclick'); fire(c, 'mousedown'); fire(c, 'mousemove'); fire(c, 'mouseup');
      fire(c, 'contextmenu');
      c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(m.log).toEqual(['onCellDblClick(4,5)', 'onCellMouseDown(4,5)', 'onCellMouseMove(4,5)', 'onCellMouseUp(4,5)']);
    } finally { m.dispose(); }
  });

  it('U-EVT-06 여분 칸: 행번호 click → 행 click(컬럼 -1) · 체크 상자 click → onRowCheck 만', async () => {
    const m = await mount({ rowNumber: true, checkColumn: true });
    try {
      fire(m.container.querySelector('.og-body .og-row[aria-rowindex="3"] .og-col-rownum')!, 'click');
      expect(m.log).toEqual(['onCellClick(2,-1)']);
      m.log.length = 0;
      fire(m.container.querySelector('.og-body .og-row[aria-rowindex="4"] .og-col-check input')!, 'click');
      expect(m.log).toEqual(['onRowCheck(3,true)']);
    } finally { m.dispose(); }
  });

  it('U-EVT-07 전파: 칸 이벤트는 바깥 부모에 안 감(옛 stopPropagation) · 여분 칸 click 은 감(옛과 같음)', async () => {
    const m = await mount({ rowNumber: true });
    try {
      const seen: string[] = [];
      for (const t of ['click', 'mousedown', 'mousemove', 'dblclick', 'mouseover']) m.outer.addEventListener(t, () => seen.push(t));
      const c = cell(m.container, 1, 1);
      fire(c, 'click'); fire(c, 'mousedown'); fire(c, 'mousemove'); fire(c, 'dblclick'); fire(c, 'mouseover', { relatedTarget: m.container });
      expect(seen).toEqual([]);
      fire(m.container.querySelector('.og-body .og-row[aria-rowindex="2"] .og-col-rownum')!, 'click');
      expect(seen).toEqual(['click']);
    } finally { m.dispose(); }
  });

  it('U-EVT-08 행 click 1번(칸·행 두 번 아님)', async () => {
    const m = await mount({ rowNumber: true });
    try {
      fire(m.container.querySelector('.og-body .og-row[aria-rowindex="6"]')!, 'click');
      fire(cell(m.container, 5, 0), 'click');
      expect(m.log).toEqual(['onCellClick(5,-1)', 'onCellClick(5,0)']);
    } finally { m.dispose(); }
  });

  it('U-EVT-09 리스너 수: .og-body 에 8(마우스 7 + keydown), 그릴 때 칸·행 0', async () => {
    const proto = EventTarget.prototype as any;
    const orig = proto.addEventListener;
    const onBody: string[] = [];
    proto.addEventListener = function (this: any, type: string, ...rest: any[]) {
      if (this?.classList?.contains?.('og-body')) onBody.push(type);
      return orig.call(this, type, ...rest);
    };
    let m: Awaited<ReturnType<typeof mount>> | null = null;
    try {
      m = await mount();
      (m.grid as any)._doRender(...(m.grid as any)._visRange());
    } finally { proto.addEventListener = orig; }
    try {
      expect(onBody.sort()).toEqual(['click', 'dblclick', 'keydown', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup']);
    } finally { m!.dispose(); }
  });

  it('U-EVT-10 destroy 뒤 붙들어 둔 칸 click → 콜백 0', async () => {
    const m = await mount();
    const c = cell(m.container, 1, 1);
    m.grid.destroy();
    fire(c, 'click'); fire(c, 'mousedown');
    expect(m.log).toEqual([]);
    m.outer.remove();
  });
});

describe('U-LOC — 칸 찾기', () => {
  function fixture() {
    const body = document.createElement('div');
    const row = document.createElement('div'); row.className = 'og-row'; row.setAttribute('aria-rowindex', '8');
    const c = document.createElement('div'); c.className = 'og-cell'; c.setAttribute('role', 'gridcell'); c.setAttribute('aria-colindex', '4');
    const deep = document.createElement('span'); const deeper = document.createElement('em'); deep.appendChild(deeper); c.appendChild(deep);
    const ph = document.createElement('div'); ph.className = 'og-cell og-cell--merge-ph';
    row.append(c, ph);
    const master = document.createElement('div'); master.className = 'og-cell'; master.setAttribute('role', 'gridcell'); master.setAttribute('aria-colindex', '6');
    body.append(row, master);
    const masters = new Map<HTMLElement, number>([[master, 11]]);
    return { body, row, c, deeper, ph, master, loc: new CellLocator(body, masters) };
  }

  it('U-LOC-01 깊은 자식 → {ri, ci, cell} = aria-rowindex−1, aria-colindex−1', () => {
    const f = fixture();
    const h = f.loc.locate(f.deeper)!;
    expect([h.ri, h.ci, h.cell === f.c, h.top === f.row]).toEqual([7, 3, true, true]);
  });

  it('U-LOC-02 행 밖 세로 병합 마스터 → 기억해 둔 행 번호(DOM 속성 없이)', () => {
    const f = fixture();
    const h = f.loc.locate(f.master)!;
    expect([h.ri, h.ci, h.cell === f.master]).toEqual([11, 5, true]);
    expect(f.master.hasAttribute('data-og-ri')).toBe(false);
  });

  it('U-LOC-03 칸 아님: null · 본문 밖(머리글 th) · 본문 자신 → null / 자리채움 → 칸 없음(행만)', () => {
    const f = fixture();
    expect(f.loc.locate(null)).toBeNull();
    const th = document.createElement('th');
    expect(f.loc.locate(th)).toBeNull();
    expect(f.loc.locate(f.body)).toBeNull();
    const h = f.loc.locate(f.ph)!;
    expect([h.cell, h.ri, h.ci]).toEqual([null, 7, -1]);
    // 다른 그리드(디테일 패널 안)의 칸은 이 본문의 칸이 아니다
    const panel = document.createElement('div'); panel.className = 'og-detail-panel';
    const innerRow = document.createElement('div'); innerRow.className = 'og-row'; innerRow.setAttribute('aria-rowindex', '1');
    const inner = document.createElement('div'); inner.className = 'og-cell'; inner.setAttribute('role', 'gridcell'); inner.setAttribute('aria-colindex', '1');
    innerRow.appendChild(inner); panel.appendChild(innerRow); f.body.appendChild(panel);
    const hp = f.loc.locate(inner)!;
    expect([hp.top === panel, hp.cell, hp.ri]).toEqual([true, null, -1]);
  });
});

describe('U-CPP — 컬럼 준비물', () => {
  it('U-CPP-01 · AR-14 그리기 한 번에 컬럼당 하나(칸 수가 아니라 컬럼 수)', async () => {
    const m = await mount();
    try {
      const table = (m.grid as any)._renderer._bodyView._rows;
      const p = table.painterFor('data');
      let seen: BodyRowContext | null = null;
      const orig = p.paint.bind(p);
      p.paint = (ri: number, item: any, ctx: BodyRowContext) => { seen = ctx; return orig(ri, item, ctx); };
      (m.grid as any)._doRender(...(m.grid as any)._visRange());
      const cells = m.container.querySelectorAll('.og-body .og-cell[role=gridcell]').length;
      expect(seen!.plans.length).toBe(8);
      expect(new Set(seen!.plans).size).toBe(8);
      expect(seen!.plans.every(x => x instanceof ColumnPaintPlan)).toBe(true);
      expect(cells).toBeGreaterThan(8 * 10);
    } finally { m.dispose(); }
  });

  it('U-CPP-02 내장 렌더러는 한 컬럼 칸들이 같은 객체 · 사용자 팩토리는 칸마다 새 것', () => {
    const builtin = new ColumnPaintPlan({ field: 'a', header: 'A', type: 'number' } as any);
    expect(builtin.renderer()).toBe(builtin.renderer());
    const text = new ColumnPaintPlan({ field: 'a', header: 'A' } as any);
    expect(text.renderer()).toBe(text.renderer());
    registerRenderer('c6user', () => ({ render: () => document.createElement('span') }) as any);
    const user = new ColumnPaintPlan({ field: 'a', header: 'A', renderer: 'c6user' } as any);
    expect(user.renderer()).not.toBe(user.renderer());
    // 사용자가 내장 이름을 다시 등록하면 그 이름은 사용자 팩토리(칸마다)
    registerRenderer('c6user2', () => ({ render: () => document.createElement('span') }) as any);
  });

  it('U-CPP-03 사용자 렌더러 공장 호출 수 = 그 컬럼 보이는 칸 수(칸마다 1번, HL-08 그대로)', async () => {
    let calls = 0, renders = 0;
    registerRenderer('c6count', () => { calls++; return { render: () => { renders++; return document.createElement('span'); } } as any; });
    const m = await mount({ columns: cols().map((c, i) => (i === 2 ? { ...c, renderer: 'c6count' } : c)) });
    try {
      calls = 0; renders = 0;
      (m.grid as any)._doRender(...(m.grid as any)._visRange());
      const visible = m.container.querySelectorAll('.og-body .og-cell[aria-colindex="3"]').length;
      expect(visible).toBeGreaterThan(10);
      expect(calls).toBe(visible);
      expect(renders).toBe(visible);
    } finally { m.dispose(); }
  });

  it('U-CPP-09 렌더러에 넘기는 문맥 키 = 옛 키 그대로(더하지도 빼지도 않음 — maxChars 는 다음 걸음)', async () => {
    const keys = new Set<string>();
    registerRenderer('c6keys', () => ({ render: (ctx: any) => { for (const k of Object.keys(ctx)) keys.add(k); return document.createElement('span'); } }) as any);
    const m = await mount({ columns: cols().map((c, i) => (i === 1 ? { ...c, renderer: 'c6keys' } : c)) });
    try {
      expect([...keys].sort()).toEqual(['colIndex', 'column', 'displayFormatter', 'displayValue', 'hasCellFormula', 'isSelected', 'row', 'rowIndex', 'rowState', 't', 'value']);
    } finally { m.dispose(); }
  });
});

describe('AR-04 — 칸·행 그리개 파일에 리스너 붙이기 0', () => {
  it('AR-04 render/body/rows/* 에 addEventListener 0', () => {
    const dir = path.join(ROOT, 'src/core/render/body/rows');
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect((src.match(/addEventListener/g) ?? []).length, f).toBe(0);
    }
    // 대조군: 걸음 전 사본에서는 잡힌다
    const pre = path.join(ROOT, 'sessions/widegrid-perf-2026-11/steps/C6/L35/pre/src/core/render/body/rows/DataRowPainter.ts');
    if (fs.existsSync(pre)) expect((fs.readFileSync(pre, 'utf8').match(/addEventListener/g) ?? []).length).toBeGreaterThan(0);
  });
});
