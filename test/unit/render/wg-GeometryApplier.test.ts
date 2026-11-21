// 넓은 그리드 새 그물 — GeometryApplier (테스트 설계서 §2-24 U-GP-01·02 · U-GP-12 의 R8 판 · 등록이 메모리를 붙잡지 않음).
// 걸음 R8 은 「등록만」 — 어떤 px 도 다시 쓰지 않는다. 그래서 그린 뒤 등록된 모든 자리의 지금 값 == 기하가 정한 값이어야 한다.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { CellRegistry } from '../../../src/core/render/body/CellRegistry.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import {
  installSceneEnv, disposeScene, tick, sceneGD01, sceneGD02, sceneGD03, sceneGD08, sceneGD09, sceneGD10, type Scene,
} from '../wg-helpers/scenes.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

const geo50 = () => new ColumnGeometry(new Array(50).fill(120), ExtraColumns.fromOptions({}), 0);
const applierOf = (s: Scene): GeometryApplier | undefined => (s.grid as any)._renderer?._applier;

/** 등록된 모든 자리에서 지금 inline 값 == 기하 값인지. 어긋난 자리 목록을 돌려준다. */
function mismatches(a: GeometryApplier): string[] {
  const bad: string[] = [];
  for (const p of a.projections()) {
    const got = (p.el.style as any)[p.prop];
    if (got !== p.value) bad.push(`${p.el.tagName}.${p.el.className} ${p.prop}: ${got} ≠ ${p.value}`);
  }
  return bad;
}

describe('GeometryApplier — 단위 (R8)', () => {
  it('U-GP-01 writeCellWidth — w / wm / wmm 조합', () => {
    const a = new GeometryApplier(geo50(), new CellRegistry());
    const d1 = document.createElement('div'); a.writeCellWidth(d1, 3, 'w');
    expect([d1.style.width, d1.style.minWidth, d1.style.maxWidth]).toEqual(['120px', '', '']);
    const d2 = document.createElement('div'); a.writeCellWidth(d2, 3, 'wm');
    expect([d2.style.width, d2.style.minWidth, d2.style.maxWidth]).toEqual(['120px', '120px', '']);
    const d3 = document.createElement('div'); a.writeCellWidth(d3, 3, 'wmm');
    expect([d3.style.width, d3.style.minWidth, d3.style.maxWidth]).toEqual(['120px', '120px', '120px']);
    expect(a.trackedCount()).toBe(0); // 칸은 등록하지 않는다(지도가 안다)
  });

  it('U-GP-02 trackHeaderCell 은 안 씀 — cssText 글자 그대로', () => {
    const a = new GeometryApplier(geo50(), new CellRegistry());
    const th = document.createElement('th');
    th.style.cssText = 'width: 100px; min-width: 100px; padding: 4px 8px';
    const before = th.style.cssText;
    a.trackHeaderCell(th, 0, 'wm');
    a.trackLeft(th, 0, 'header');
    a.trackTotal(th, 'width', 'header');
    a.trackSpan(th, 0, 3, 'wmm', 'body');
    a.trackGap(th, 0, 4, 'body');
    a.trackExtra(th, 'body');
    a.trackBar(th, 0, 1, 0.5);
    expect(th.style.cssText).toBe(before);
  });

  it('R8-GP-a release·untrack — 범위별로 풀리고 다른 범위는 남음, 같은 종류 다시 등록은 갈아 끼움', () => {
    const a = new GeometryApplier(geo50(), new CellRegistry());
    const h = document.createElement('th'); const b = document.createElement('div');
    a.trackHeaderCell(h, 1, 'wm'); a.trackLeft(h, 1, 'header'); a.trackHeaderCell(h, 1, 'wm');
    a.trackSpan(b, 2, 2, 'wmm', 'body');
    expect(a.trackedCount('header')).toBe(2);
    expect(a.trackedCount('body')).toBe(1);
    a.release('body');
    expect(a.trackedCount('body')).toBe(0);
    expect(a.trackedCount('header')).toBe(2);
    a.untrack(h);
    expect(a.trackedCount()).toBe(0);
  });

  it('R8-GP-b projections 값의 뜻 — span = 닫힌 구간 폭 합 · left = leftOf · total · bar = clamp(ratio)×폭 · gap', () => {
    const g = new ColumnGeometry([100, 120, 80, 60], ExtraColumns.fromOptions({ rowNumber: true }), 2);
    const a = new GeometryApplier(g, new CellRegistry());
    const el = (t = 'div') => document.createElement(t);
    const sp = el(), lf = el(), tt = el(), br = el(), gp = el(), ex = el();
    a.trackSpan(sp, 1, 2, 'w', 'body'); a.trackLeft(lf, 1, 'header'); a.trackTotal(tt, 'minWidth', 'body');
    a.trackBar(br, 2, 1, 1.5); a.trackGap(gp, 1, 3, 'body'); a.trackExtra(ex, 'body');
    const v = new Map(a.projections().map(p => [p.el, `${p.prop}=${p.value}`]));
    expect(v.get(sp)).toBe('width=200px');
    expect(v.get(lf)).toBe('left=144px');
    expect(v.get(tt)).toBe('minWidth=404px');
    expect(v.get(br)).toBe('width=80px');
    expect(v.get(gp)).toBe('width=260px');
    expect(v.get(ex)).toBe('width=44px');
  });
});

describe('GeometryApplier — 검토 R5678 반영 (F-06 범위별 저장소 · F-07 행 등록)', () => {
  it('R8-GP-d trackRowCells — 등록 하나로 칸 여럿, projections 는 칸마다 펼침, applyChange 는 바뀐 컬럼 칸만 씀', () => {
    const g = new ColumnGeometry([100, 120, 80, 60], ExtraColumns.fromOptions({ rowNumber: true }), 0);
    const a = new GeometryApplier(g, new CellRegistry());
    const row = document.createElement('div');
    document.body.appendChild(row);
    const extra = document.createElement('div'); row.appendChild(extra);       // 여분 칸 하나가 먼저
    const cells = [100, 120, 80, 60].map(w => { const c = document.createElement('div'); c.style.width = c.style.minWidth = `${w}px`; row.appendChild(c); return c; });
    a.trackRowCells(row, 1, 0, 3, 'wm', 'body');
    expect(a.trackedCount('body')).toBe(1);
    const p = a.projections('body');
    expect(p.length).toBe(8);
    for (const x of p) expect((x.el.style as any)[x.prop]).toBe(x.value);
    expect(p.some(x => x.el === extra)).toBe(false);
    cells[0]!.style.width = '7px'; // 바뀌지 않은 컬럼 칸은 applyChange 가 건드리지 않는다
    const ch = g.resize(2 as any, 95);
    a.applyChange(ch);
    expect(cells.map(c => c.style.width)).toEqual(['7px', '120px', '95px', '60px']);
    expect(cells[2]!.style.minWidth).toBe('95px');
    a.release('body');
    expect(a.trackedCount('body')).toBe(0);
    row.remove();
  });

  it('R8-GP-e release(scope) 는 그 범위만 비움 — 다른 범위 등록·값 그대로, untrack 은 세 범위에서 뺌', () => {
    const a = new GeometryApplier(geo50(), new CellRegistry());
    const hs = Array.from({ length: 50 }, () => document.createElement('th'));
    hs.forEach((h, i) => a.trackHeaderCell(h, i, 'wm'));
    const b = document.createElement('div'); a.trackTotal(b, 'minWidth', 'body');
    const f = document.createElement('div'); a.trackTotal(f, 'width', 'footer');
    const before = a.projections('header').map(p => p.el);
    for (let k = 0; k < 100; k++) { a.trackTotal(b, 'minWidth', 'body'); a.release('body'); }
    expect(a.trackedCount('header')).toBe(50);
    expect(a.projections('header').map(p => p.el)).toEqual(before);
    expect(a.trackedCount('footer')).toBe(1);
    expect(a.trackedCount('body')).toBe(0);
    const both = document.createElement('div');
    a.trackTotal(both, 'width', 'header'); a.trackTotal(both, 'width', 'footer');
    a.untrack(both);
    expect(a.trackedCount('header')).toBe(50);
    expect(a.trackedCount('footer')).toBe(1);
  });
});

describe('GeometryApplier — 그리드에 물린 등록 (U-GP-12 R8 판 · 메모리)', () => {
  const scenes: [string, () => Promise<Scene>][] = [
    ['GD-01', sceneGD01], ['GD-02', sceneGD02], ['GD-03', sceneGD03], ['GD-08', sceneGD08], ['GD-09', sceneGD09], ['GD-10', sceneGD10],
  ];
  for (const [id, make] of scenes) {
    it(`U-GP-12(R8) ${id} 등록된 자리 px == 기하 값`, async () => {
      const s = await make();
      const a = applierOf(s);
      expect(a, '그리드에 GeometryApplier 가 물려 있어야 함(GridRenderer._applier)').toBeInstanceOf(GeometryApplier);
      expect(a!.trackedCount('header')).toBeGreaterThan(0);
      expect(mismatches(a!)).toEqual([]);
      disposeScene(s);
    });
  }

  it('R8-GP-c 머리글을 다시 그려도 옛 등록이 남지 않음 — 등록 수 그대로·모든 등록 요소가 DOM 에 붙어 있음', async () => {
    const s = await sceneGD03();
    const a = applierOf(s)!;
    const n0 = a.trackedCount('header');
    // 고정 2 + rowNumber: 잎 th 8(폭) + 고정 th 2(left) + 표 1
    expect(n0).toBe(8 + 2 + 1);
    for (let k = 0; k < 5; k++) { s.grid.orderBy?.([{ field: 'c1', dir: k % 2 ? 'asc' : 'desc' }] as any); await tick(1); }
    (s.grid as any)._renderHeader?.();
    await tick();
    expect(a.trackedCount('header')).toBe(n0);
    for (const p of a.projections('header')) expect(p.el.isConnected).toBe(true);
    expect(mismatches(a)).toEqual([]);
    disposeScene(s);
  });
});
