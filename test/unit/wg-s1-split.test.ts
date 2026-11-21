/**
 * 걸음 S1(머리글·본문·칸 지도 빼내기 — 동작 불변) 의 걸음 전용 번호. 테스트 설계서 §10-1 S1 줄. L19(TEST).
 * 코드 검토 REVIEW_CODE_S1.md 찾은 것 1·3·4.
 *
 * - U-HV-01 · U-BV-01 · U-CP-01 · U-CP-06 : GD 골든과 머리글/본문/칸 부분을 맞대는 얇은 시험(GD 바이트 같음과 같은 뜻 —
 *   번호가 이름에 있어야 뒤 걸음 판정표가 그 번호로 「계속 초록」을 센다).
 * - U-REG-08·09 · U-HV-02·03 · U-BV-14 · U-VS-05 · AR-18 · AR-09(기록) : 지금 코드로.
 * - U-HV-06 : 걸음 전 코드도 destroy 뒤 콜백이 2번 불려(검토 찾은 것 3) 빼내기 걸음에서 초록이 될 수 없다 →
 *   걸음 C4(머리글 리스너 주인이 바뀌는 걸음)로 옮기고 그때까지 「기대된 실패」(it.fails). C4 에서 it 로 바꾼다.
 * - U-BV-02(drawn) : 창 객체가 R1 몫이라 이 걸음에 없음 — 테스트 설계서 §10-1·경우표 걸음 칸을 R1 로 옮김(CHANGES.md).
 * 내부 접근(진단): grid._renderer 의 `_cellMap`·`_headerView`·`_bodyView`, grid._vs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES, installSceneEnv, disposeScene, makeSceneContainer, tick } from './wg-helpers/scenes.js';
import { maskRowIds, unformatGolden } from './wg-helpers/dom-snapshot.js';
import { OpenGrid } from '../../src/core/OpenGrid.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = path.resolve(__dirname, '../..');
const GOLD = path.resolve(__dirname, '__golden__/wg');
let restoreEnv: () => void;
beforeAll(() => { restoreEnv = installSceneEnv(); });
afterAll(() => restoreEnv());

const parse = (html: string): HTMLElement => { const d = document.createElement('div'); d.innerHTML = html; return d; };
/** 지금 그림과 골든을 같은 꼴(행 id 가림)의 떨어진 DOM 으로. */
function pair(id: string, container: HTMLElement): { cur: HTMLElement; gold: HTMLElement } {
  const cur = parse(maskRowIds(container.innerHTML));
  const gold = parse(unformatGolden(fs.readFileSync(path.join(GOLD, `${id}.html`), 'utf8')));
  return { cur, gold };
}
const part = (root: HTMLElement, sel: string) => root.querySelector(sel)?.innerHTML ?? null;
const cellsOuter = (root: HTMLElement) => Array.from(root.querySelectorAll('.og-body [role="gridcell"]')).map(c => c.outerHTML);

// 장면마다 한 번만 그려 모든 부분 대조에 쓴다. 까닭(잼): GD-10(CF) 은 한 파일 안에서 **처음** 그릴 때만 골든과 같은
// 59행이 되고, 같은 파일에서 다시 그리면 CF 지연 청크가 이미 실려 그리는 길이 달라져 30행이 된다(골든 시험 wg-golden-dom
// 도 첫 그림으로 비교한다 — 그 장면의 시점 의존은 로그 WARN 으로 L18/TEST 에 알림).
const SNAP = new Map<string, { cur: HTMLElement; gold: HTMLElement }>();
beforeAll(async () => {
  for (const { id, make } of SCENES) {
    const s = await make();
    try { SNAP.set(id, pair(id, s.container)); } finally { disposeScene(s); }
  }
}, 120_000);

describe('U-HV-01 · U-BV-01 · U-CP-01 — GD 골든과 부분 대조', () => {
  for (const { id } of SCENES) {
    const n = Number(id.slice(3));
    if (n <= 12) {
      it(`U-HV-01 ${id} 머리글 부분 innerHTML 이 GD 와 바이트로 같다`, () => {
        const { cur, gold } = SNAP.get(id)!;
        expect(part(gold, '.og-header')).not.toBeNull();
        expect(part(cur, '.og-header')).toBe(part(gold, '.og-header'));
      });
    }
    it(`U-BV-01 ${id} 본문 부분 innerHTML 이 GD 와 바이트로 같다(창 full)`, () => {
      const { cur, gold } = SNAP.get(id)!;
      expect(part(gold, '.og-body')).not.toBeNull();
      expect(part(cur, '.og-body')).toBe(part(gold, '.og-body'));
    });
    it(`U-CP-01 ${id} 칸 outerHTML 하나하나가 GD 와 같다`, () => {
      const { cur, gold } = SNAP.get(id)!;
      const g = cellsOuter(gold);
      expect(g.length).toBeGreaterThan(0);
      expect(cellsOuter(cur)).toEqual(g);
    });
  }
});

describe('U-CP-06 — 수식·나무·cellStyle·CF 덧붙는 표시(GD-07·10)', () => {
  for (const id of ['GD-07', 'GD-10']) {
    it(`U-CP-06 ${id} 덧붙는 표시가 있는 칸까지 옛과 같다`, () => {
      const { cur, gold } = SNAP.get(id)!;
      // 덧붙는 표시(자식 요소가 있는 칸)가 실제로 있어야 이 시험이 뜻을 가진다
      expect(Array.from(gold.querySelectorAll('.og-body [role="gridcell"]')).some(c => c.children.length > 0)).toBe(true);
      expect(cellsOuter(cur)).toEqual(cellsOuter(gold));
    });
  }
});

// ─── 실제 그리드에서 ─────────────────────────────────────────────────────
async function grid(opts: Record<string, any>, nrows = 200, ncols = 50): Promise<{ grid: OpenGrid<any>; container: HTMLElement }> {
  const container = makeSceneContainer();
  const columns = Array.from({ length: ncols }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
  const g = new OpenGrid<any>(container, { columns, sortable: true, headerHeight: 40, ...opts } as any);
  g.setData(Array.from({ length: nrows }, (_, r) => Object.fromEntries(columns.map((c, i) => [c.field, `r${r}c${i}`]))));
  await tick();
  return { grid: g, container };
}
const R = (g: OpenGrid<any>) => (g as any)._renderer;
const domCells = (c: HTMLElement) => c.querySelectorAll('.og-body .og-cell[aria-colindex]').length;

describe('U-REG-08 · U-REG-09 — 칸 지도 = 그려진 DOM', () => {
  it('U-REG-08 size == .og-cell[aria-colindex] 수 — 그린 뒤 · 세로 스크롤 · 가로 스크롤 · 정렬 뒤', async () => {
    const { grid: g, container } = await grid({});
    const reg = R(g)._cellMap;
    const bw = container.querySelector('.og-body-wrapper') as HTMLElement;
    let st = 0, sl = 0; // jsdom 은 스크롤 값을 안 들고 있어 주입
    Object.defineProperty(bw, 'scrollTop', { configurable: true, get: () => st, set: (v: number) => { st = v; } });
    Object.defineProperty(bw, 'scrollLeft', { configurable: true, get: () => sl, set: (v: number) => { sl = v; } });
    const steps: Record<string, [number, number]> = {};
    steps.drawn = [reg.size, domCells(container)];
    bw.scrollTop = 32 * 40; bw.dispatchEvent(new Event('scroll')); await tick();
    steps.vScroll = [reg.size, domCells(container)];
    bw.scrollLeft = 1500; bw.dispatchEvent(new Event('scroll')); await tick();
    steps.hScroll = [reg.size, domCells(container)];
    g.orderBy('c1', 'desc'); await tick();
    steps.sorted = [reg.size, domCells(container)];
    for (const [k, [a, b]] of Object.entries(steps)) {
      expect(b, `${k} DOM 칸 0 이면 시험 무의미`).toBeGreaterThan(0);
      expect(a, k).toBe(b);
    }
    disposeScene({ grid: g, container });
  });

  it('U-REG-08 세로 병합(GD-05) — 마스터 칸은 aria-colindex 를 가진 칸으로 세어짐(T0_FACTS.U-REG-08 정의: 238)', async () => {
    const s = await SCENES.find(x => x.id === 'GD-05')!.make();
    try {
      expect(domCells(s.container)).toBe(238);
      expect(R(s.grid)._cellMap.size).toBe(238);
    } finally { disposeScene(s); }
  });

  it('U-REG-09 getCellEl(ri,ci) == 지도 get(ri,ci) — 그려진 칸 전부', async () => {
    const { grid: g, container } = await grid({}, 100, 10);
    const r = R(g);
    const rowsEls = Array.from(container.querySelectorAll('.og-body [role="row"][aria-rowindex]'));
    expect(rowsEls.length).toBeGreaterThan(0);
    let n = 0;
    for (const row of rowsEls) {
      const ri = Number(row.getAttribute('aria-rowindex')) - 1;
      for (let ci = 0; ci < 10; ci++) {
        const viaSeam = r.getCellEl(ri, ci);
        expect(viaSeam).toBe(r._cellMap.get(ri, ci));
        expect(viaSeam).toBe(row.querySelector(`[aria-colindex="${ci + 1}"]`));
        n++;
      }
    }
    expect(n).toBe(rowsEls.length * 10);
    disposeScene({ grid: g, container });
  });
});

describe('U-HV — 머리글', () => {
  it('U-HV-02 50컬럼 + 여분 둘(rowNumber·checkColumn) — 잎 th 50개, 표시 잎 순서와 같음(가상화 안 함)', async () => {
    const { grid: g, container } = await grid({ rowNumber: true, checkColumn: true }, 20, 50);
    const leaves = Array.from(container.querySelectorAll('.og-header th.og-header-cell:not(.og-extra-col)'));
    expect(leaves.length).toBe(50);
    expect(leaves.map(t => (t.querySelector('span')?.textContent ?? '').trim())).toEqual(Array.from({ length: 50 }, (_, i) => `H${i}`));
    expect(container.querySelectorAll('.og-header th.og-extra-col').length).toBe(2);
    disposeScene({ grid: g, container });
  });

  it('U-HV-03 height() == 옛 getHeaderHeight() — 줄바꿈 머리글 장면(GD-11)', async () => {
    const s = await SCENES.find(x => x.id === 'GD-11')!.make();
    try {
      const r = R(s.grid);
      const hv = r._headerView;
      expect(typeof hv?.height, 'HeaderView.height() 가 아직 없음(검토 찾은 것 4)').toBe('function');
      const header = s.container.querySelector('.og-header') as HTMLElement;
      expect(hv.height()).toBe(header.offsetHeight);   // 옛 getHeaderHeight 몸통 = this._header.offsetHeight
      expect(r.getHeaderHeight()).toBe(hv.height());
    } finally { disposeScene(s); }
  });

  async function hv06Calls(): Promise<number> {
    const { grid: g, container } = await grid({}, 10, 5);
    const th = container.querySelector('th.og-sortable') as HTMLElement;
    if (!th) throw new Error('정렬 머리글 th 없음');
    const cbs = R(g)._cbs;
    let calls = 0;
    cbs.onHeaderClick = () => { calls++; };   // 머리글 콜백 자리(검토 hv06 와 같은 방식)
    g.destroy();
    th.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    th.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    container.remove();
    return calls;
  }
  // 걸음 C4(HeaderView.destroy 가 머리글 리스너를 뗌)로 초록 — 기대된 실패 표시를 떼고 「지금 값 2」 기록 시험은 지웠다(2026-11-21).
  it('U-HV-06 [C4] destroy 뒤 th 에 click·keydown → 콜백 0', async () => {
    expect(await hv06Calls()).toBe(0);
  });
});

describe('U-BV-14 · U-VS-05', () => {
  it('U-BV-14 cell(ri,ci) — 그려진 칸이면 그 요소, 창(그린 범위) 밖이면 undefined', async () => {
    const { grid: g, container } = await grid({}, 500, 10);
    const bv = R(g)._bodyView;
    const el = container.querySelector('.og-body [role="row"][aria-rowindex="1"] [aria-colindex="1"]');
    expect(el).not.toBeNull();
    expect(bv.cell(0, 0)).toBe(el);
    expect(bv.cell(499, 0)).toBeUndefined();
    expect(bv.cell(0, 99)).toBeUndefined();
    disposeScene({ grid: g, container });
  });

  it('U-VS-05 VirtualScroll 이음새 _viewportHeight · getVisibleRange 가 있고 뜻 같음', async () => {
    const { grid: g, container } = await grid({}, 500, 5);
    const vs = (g as any)._vs;
    expect(typeof vs._viewportHeight).toBe('number');
    expect(vs._viewportHeight).toBeGreaterThan(0);
    const r = vs.getVisibleRange();
    expect(r).toEqual({ startIndex: expect.any(Number), endIndex: expect.any(Number), offsetY: expect.any(Number) });
    expect(r.endIndex).toBeGreaterThanOrEqual(r.startIndex);
    disposeScene({ grid: g, container });
  });
});

describe('AR-18 · AR-09 — 구조', () => {
  const walk = (d: string): string[] => fs.existsSync(d) ? fs.readdirSync(d).flatMap(n => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; }) : [];
  it('AR-18 render/body/*·render/header/* 가 CellPipeline 을 import 하지 않음(0)', () => {
    const files = [...walk(path.join(ROOT, 'src/core/render/body')), ...walk(path.join(ROOT, 'src/core/render/header'))];
    expect(files.length).toBeGreaterThan(0);
    const bad = files.filter(f => /import[^;]*from\s+['"][^'"]*CellPipeline(\.js)?['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('AR-18 자기시험 — 같은 정규식이 CellPipeline import 줄을 잡는다', () => {
    expect(/import[^;]*from\s+['"][^'"]*CellPipeline(\.js)?['"]/.test("import { CellPipeline } from '../CellPipeline.js';")).toBe(true);
  });
  it('AR-09 큰 클래스 줄 수 기록 — OpenGrid ≤ 4,881(T0 값), GridRenderer 는 기록만(R끝에 ≤ 300)', () => {
    const lines = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\n').length - 1;
    const og = lines('src/core/OpenGrid.ts'), gr = lines('src/core/GridRenderer.ts');
    console.log(`[AR-09] OpenGrid.ts ${og} · GridRenderer.ts ${gr}`);
    expect(og).toBeLessThanOrEqual(4881);
    expect(gr).toBeLessThan(1289);   // S1 은 빼내기라 T0(1,289) 보다 줄어야 함
  });
});
