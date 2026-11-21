// 넓은 그리드 새 그물 — 걸음 C8 GeometryApplier.applyChange (테스트 설계서 §2-24 U-GP-03~10·12·13).
// applyChange 는 끄는 동안 프레임마다 도는 뜨거운 길: 바뀐 컬럼 뒤의 자리만 쓰고, 배치 조회 없이 쓰기만.
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { CellRegistry } from '../../../src/core/render/body/CellRegistry.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L } from '../../../src/core/coordinate/types.js';
import {
  installSceneEnv, disposeScene, tick, sceneGD01, sceneGD03, sceneGD08, sceneGD09, sceneGD10, type Scene,
} from '../wg-helpers/scenes.js';
import { OpenGrid } from '../../../src/core/OpenGrid.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());
afterEach(() => vi.restoreAllMocks());

const el = (tag = 'div') => { const e = document.createElement(tag); document.body.appendChild(e); return e; };
const sized = (w: number, tag = 'div') => { const e = el(tag); e.style.width = `${w}px`; e.style.minWidth = `${w}px`; e.style.maxWidth = `${w}px`; return e; };

/** 등록 전부 준비(U-GP-03 준비): 머리글 th(c2) · 지도 칸 5개(c2) · 전체 폭 · 빈칸 2~9 · 병합 1~3 · left(c4) · 막대(c2, 0.5). */
function fixture() {
  const g = new ColumnGeometry(new Array(12).fill(120), ExtraColumns.fromOptions({}), 0);
  const cells = new CellRegistry();
  const a = new GeometryApplier(g, cells);
  const th = sized(120, 'th'); a.trackHeaderCell(th, 2, 'wm');
  const cs = Array.from({ length: 5 }, (_, r) => { const c = sized(120); cells.set(r, 2, c); return c; });
  const total = el(); total.style.width = `${g.totalWidth()}px`; a.trackTotal(total, 'width', 'body');
  const gap = el(); gap.style.width = `${g.spanWidth(L(2), 8)}px`; a.trackGap(gap, 2, 9, 'body');
  const span = el(); span.style.width = `${g.spanWidth(L(1), 3)}px`; a.trackSpan(span, 1, 3, 'w', 'body');
  const left = el(); left.style.left = `${g.leftOf(L(4))}px`; a.trackLeft(left, 4, 'body');
  const bar = el(); bar.style.width = `${0.5 * 120}px`; a.trackBar(bar, 2, 1, 0.5);
  return { g, cells, a, th, cs, total, gap, span, left, bar };
}

/** 그 사이 일어난 style 쓰기 수(MutationObserver — 같은 값이면 속성이 안 바뀌어 안 셈). */
async function styleWrites(root: Node, fn: () => void): Promise<number> {
  const recs: MutationRecord[] = [];
  const mo = new MutationObserver(r => recs.push(...r));
  mo.observe(root, { attributes: true, attributeFilter: ['style'], subtree: true });
  fn();
  await Promise.resolve();
  recs.push(...mo.takeRecords());
  mo.disconnect();
  return recs.length;
}

describe('GeometryApplier.applyChange — 단위 (C8)', () => {
  it('U-GP-03 한 컬럼 바뀜 — th·칸 5·전체 폭·빈칸·병합·left·막대가 다 새 값', () => {
    const f = fixture();
    f.a.applyChange(f.g.resize(L(2), 200));
    expect([f.th.style.width, f.th.style.minWidth]).toEqual(['200px', '200px']);
    for (const c of f.cs) expect([c.style.width, c.style.minWidth, c.style.maxWidth]).toEqual(['200px', '200px', '200px']);
    expect(f.total.style.width).toBe(`${12 * 120 + 80}px`);
    expect(f.gap.style.width).toBe(`${8 * 120 + 80}px`);
    expect(f.span.style.width).toBe(`${3 * 120 + 80}px`);
    expect(f.left.style.left).toBe(`${4 * 120 + 80}px`);
    expect(f.bar.style.width).toBe('100px');
  });

  it('U-GP-04 같은 변화 몫을 다시 — 쓰기 0', async () => {
    const f = fixture();
    const ch = f.g.resize(L(2), 200);
    f.a.applyChange(ch);
    expect(await styleWrites(document.body, () => f.a.applyChange(ch))).toBe(0);
  });

  it('U-GP-05 untrack 한 자리는 안 바뀜', () => {
    const f = fixture();
    f.a.untrack(f.span);
    f.a.applyChange(f.g.resize(L(2), 200));
    expect(f.span.style.width).toBe('360px');
  });

  it('U-GP-06 release(body) 뒤 — 본문 범위 자리 안 바뀜, 머리글 범위는 바뀜', () => {
    const f = fixture();
    f.a.release('body');
    f.a.applyChange(f.g.resize(L(2), 200));
    expect(f.total.style.width).toBe(`${12 * 120}px`);
    expect(f.th.style.width).toBe('200px');
  });

  it('U-GP-07 고정 3 — 컬럼 0 을 +60 하면 고정 1·2 의 th·칸 left +60, 고정 밖은 안 씀', () => {
    const g = new ColumnGeometry([100, 100, 100, 100, 100], ExtraColumns.fromOptions({}), 3);
    const cells = new CellRegistry();
    const a = new GeometryApplier(g, cells);
    const ths = [0, 1, 2, 3].map(i => { const t = el('th'); t.style.left = `${g.leftOf(L(i))}px`; if (i < 3) a.trackLeft(t, i, 'header'); return t; });
    const cl = [0, 1, 2, 3].map(i => { const c = sized(100); c.style.left = `${g.leftOf(L(i))}px`; cells.set(0, i, c); return c; });
    a.applyChange(g.resize(L(0), 160));
    expect(ths.map(t => t.style.left)).toEqual(['0px', '160px', '260px', '300px']);
    expect(cl.map(c => c.style.left)).toEqual(['0px', '160px', '260px', '300px']);   // 고정 밖(3)은 안 씀(옛 값 그대로)
  });

  it('U-GP-08 구조 변화(여분 켬) — 등록된 모든 자리를 기하 값으로 다시 씀', () => {
    const f = fixture();
    f.a.applyChange(f.g.reset(new Array(12).fill(120), ExtraColumns.fromOptions({ rowNumber: true }), 0));
    expect(f.left.style.left).toBe(`${44 + 4 * 120}px`);
    expect(f.total.style.width).toBe(`${44 + 12 * 120}px`);
    expect(f.th.style.width).toBe('120px');
  });

  it('U-GP-09 떼어 낸 요소 — 던지지 않고 그 요소에 쓰기 0 · 등록도 풀림', () => {
    const f = fixture();
    f.span.remove();
    const before = f.a.trackedCount('body');
    expect(() => f.a.applyChange(f.g.resize(L(2), 200))).not.toThrow();
    expect(f.span.style.width).toBe('360px');
    expect(f.a.trackedCount('body')).toBe(before - 1);
  });

  it('U-GP-10 누른 뒤 새로 생긴 칸 — 매번 지도에 물어 새 행 칸도 새 폭', () => {
    const f = fixture();
    f.a.applyChange(f.g.resize(L(2), 150));
    const late = sized(120); f.cells.set(9, 2, late);
    f.a.applyChange(f.g.resize(L(2), 170));
    expect(late.style.width).toBe('170px');
  });

  it('C8-GP-a 읽기 0 — 배치 조회(offset*·client*·getBoundingClientRect·getComputedStyle) 없음', () => {
    const f = fixture();
    const proto = HTMLElement.prototype as any;
    const spies = [
      vi.spyOn(Element.prototype, 'getBoundingClientRect'),
      vi.spyOn(window, 'getComputedStyle'),
    ];
    const got: string[] = [];
    for (const k of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'clientWidth']) {
      const d = Object.getOwnPropertyDescriptor(proto, k) ?? Object.getOwnPropertyDescriptor(Element.prototype, k);
      if (d?.get) vi.spyOn(proto, k, 'get').mockImplementation(function (this: any) { got.push(k); return d.get!.call(this); });
    }
    f.a.applyChange(f.g.resize(L(2), 200));
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
    expect(got).toEqual([]);
  });
});

// ── U-GP-12: 실제 장면 — 등록 자리를 applyChange 로 고친 DOM == 그 폭으로 처음부터 그린 DOM(폭을 품은 속성만) ──
function widthDom(c: HTMLElement): string[] {
  const out: string[] = [];
  // 본문은 앞 20행만 견준다 — 처음 그림(스크롤 rAF 30행)과 다시 그림(보이는 범위+여유 59행)의 화면 밖 행 수가 달라서(설계 §17-5).
  const walk = (n: Element, path: string) => {
    const ri = Number(n.getAttribute?.('aria-rowindex') ?? 0);
    if (ri > 20) return;
    const s = (n as HTMLElement).style;
    if (s) {
      const v = ['width', 'min-width', 'max-width', 'left'].map(p => s.getPropertyValue(p)).join('|');
      if (v !== '|||') out.push(`${path}${n.tagName}.${(n.className || '').toString().split(' ')[0]} ${v}`);
    }
    let i = 0;
    for (const ch of Array.from(n.children)) walk(ch, `${path}${i++}/`);
  };
  for (const sel of ['.og-header', '.og-body', '.og-footer']) { const e = c.querySelector(sel); if (e) walk(e, sel + ':'); }
  return out;
}
const R = (g: any) => g._render;
async function fresh(make: () => Promise<Scene>, ci: number, w: number): Promise<string[]> {
  const s = await make();
  const field = (s.grid as any)._colLayout?.visibleLeaves?.[ci]?.field ?? R(s.grid).getColLayout?.()?.visibleLeaves?.[ci]?.field;
  void field;
  // 같은 장면을 「그 폭이 처음부터」인 상태로: 사용자 폭을 기억시키고 다시 셈 → 다시 그림(처음부터 그린 것과 같은 길)
  const cbs = (s.grid as any)._renderer._cbs; cbs.onColResize(ci, w);
  await tick();
  const dom = widthDom(s.container);
  disposeScene(s);
  return dom;
}
const SCENES: [string, () => Promise<Scene>][] = [['GD-01', sceneGD01], ['GD-03', sceneGD03], ['GD-08', sceneGD08], ['GD-09', sceneGD09], ['GD-10', sceneGD10]];
describe('U-GP-12 실제 장면 — applyChange 결과 == 처음부터 그린 결과(폭 속성)', () => {
  for (const [id, make] of SCENES) {
    it(`U-GP-12 ${id} 컬럼 1 → 177px`, async () => {
      const want = await fresh(make, 1, 177);
      const s = await make();
      const rc = R(s.grid);
      const geo = rc.geometry as ColumnGeometry;
      const applier: GeometryApplier = (s.grid as any)._renderer._applier;
      const v0 = geo.version;
      geo.resize(L(1), 177);
      applier.applyChange(geo.changesSince(v0));
      expect(widthDom(s.container)).toEqual(want);
      disposeScene(s);
    });
  }
});
void OpenGrid;

describe('U-GP-13 자기시험 — trackBar 를 빈 함수로 바꾼 판에서 U-GP-12(GD-10 막대) 가 빨개짐', () => {
  it('U-GP-13 CF 막대 등록이 빠지면 대조가 다름을 잡는다', async () => {
    const want = await fresh(sceneGD10, 3, 177);
    vi.spyOn(GeometryApplier.prototype, 'trackBar').mockImplementation(() => {});
    const s = await sceneGD10();
    const geo = R(s.grid).geometry as ColumnGeometry;
    const applier: GeometryApplier = (s.grid as any)._renderer._applier;
    const v0 = geo.version;
    geo.resize(L(3), 177);
    applier.applyChange(geo.changesSince(v0));
    expect(widthDom(s.container)).not.toEqual(want);
    disposeScene(s);
  });
});

describe('C8 — 더할 px (BODY ①·EDGE 요청)', () => {
  it('C8-GP-b trackSpan·trackGap 의 extraPx — 값 = 기하 폭 합 + extraPx, applyChange 도 같은 식', () => {
    const g = new ColumnGeometry([100, 100, 100], ExtraColumns.fromOptions({}), 0);
    const a = new GeometryApplier(g, new CellRegistry());
    const sp = el(); const gp = el();
    a.trackSpan(sp, 1, 4, 'w', 'body', 2 * 120);   // 컬럼 1~2 는 기하, 넘은 둘은 기본 폭 120
    a.trackGap(gp, 0, 2, 'footer', 28);
    const v = new Map(a.projections().map(p => [p.el, p.value]));
    expect(v.get(sp)).toBe(`${200 + 240}px`);
    expect(v.get(gp)).toBe(`${300 + 28}px`);
    a.applyChange(g.resize(L(2), 150));
    expect(sp.style.width).toBe(`${250 + 240}px`);
    expect(gp.style.width).toBe(`${350 + 28}px`);
  });
});
