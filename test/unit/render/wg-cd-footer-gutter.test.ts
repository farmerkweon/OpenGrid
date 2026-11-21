// @vitest-environment jsdom
// 넓은 그리드 새 그물 — 푸터 막대 끝 여백(본문 세로 스크롤바 폭) — FooterManager.setEndGutter → FooterView.
// 가로 끝까지 긁으면 막대가 스크롤바 폭만큼 덜 가던 결함(판 시작부터, 머리글도 같음 — 머리글은 GEO 가 고침).
// 실제 브라우저 판정(스크롤바 보이는 실행)은 test/e2e/wg-cd-rightend.spec.ts(GEO).
import { describe, it, expect } from 'vitest';
import { FooterManager } from '../../../src/core/FooterManager.js';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L } from '../../../src/core/coordinate/types.js';

const LEAVES = Array.from({ length: 6 }, (_, i) => ({ field: 'c' + i }));
const W6 = [120, 130, 140, 150, 160, 170];
function mk(defs: any[], extra: any = {}, widths = W6) {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const geo = new ColumnGeometry(widths, ExtraColumns.fromOptions(extra), 0);
  const mgr = new FooterManager({ getData: () => [{ c0: 1, c1: 2 }] as any[], getColLayout: () => ({ visibleLeaves: LEAVES }) as any,
    getColWidths: () => widths, getOptions: () => ({ footerHeight: 30, footer: defs }), getContainer: () => c, getGeometry: () => geo });
  return { c, geo, mgr };
}
const kids = (c: HTMLElement) => Array.from(c.querySelector('.og-footer-bar')!.children) as HTMLElement[];

describe('푸터 막대 끝 여백(setEndGutter)', () => {
  const DEFS = [{ field: 'c0', op: 'count' }, { field: 'c1', op: 'count' }];

  it('CD-FG-01 0 이면 아무것도 안 씀 — 막대 글자가 여백을 모르는 판과 바이트 같음', () => {
    const a = mk(DEFS); a.mgr.render();
    const b = mk(DEFS); b.mgr.setEndGutter(0); b.mgr.render();
    expect(b.c.innerHTML).toBe(a.c.innerHTML);
    expect(b.c.querySelector('.og-footer-gutter')).toBeNull();
    a.c.remove(); b.c.remove();
  });

  it('CD-FG-02 그린 뒤 8px → 막대 끝에 8px 칸 하나(막대·칸 요소는 그대로) · 10px 로 바꾸면 그 칸만 · 0 이면 뗌', () => {
    const a = mk(DEFS); a.mgr.render();
    const bar = a.c.querySelector('.og-footer-bar');
    const before = kids(a.c);
    a.mgr.setEndGutter(8);
    expect(a.c.querySelector('.og-footer-bar')).toBe(bar);
    const k = kids(a.c);
    expect(k.slice(0, -1)).toEqual(before);
    expect(k.at(-1)!.className).toBe('og-footer-gutter');
    expect(k.at(-1)!.style.width).toBe('8px');
    a.mgr.setEndGutter(10);
    expect(kids(a.c).at(-1)!.style.width).toBe('10px');
    expect(a.c.querySelectorAll('.og-footer-gutter').length).toBe(1);
    a.mgr.setEndGutter(0);
    expect(a.c.querySelector('.og-footer-gutter')).toBeNull();
    a.c.remove();
  });

  it('CD-FG-03 여백을 정한 뒤 다시 그려도 여백 칸이 끝에 하나 — 막대 내용 폭 = 본문 전체 폭 + 여백', () => {
    const a = mk(DEFS, { rowNumber: true });
    a.mgr.setEndGutter(8);
    a.mgr.render(); a.mgr.render();
    const w = kids(a.c).map((k) => parseFloat(k.style.width));
    expect(a.c.querySelectorAll('.og-footer-gutter').length).toBe(1);
    expect(w.reduce((x, y) => x + y, 0)).toBe(a.geo.totalWidth() + 8);
    a.c.remove();
  });

  it('CD-FG-04 끄는 동안(C8) 여백은 그대로 · 칸·채움 칸만 따라감 — applyChange == 처음부터 그린 것(여백 포함)', () => {
    const a = mk(DEFS);
    const ap = new GeometryApplier(a.geo, { cellsOfColumn: () => [] } as any);
    a.mgr.setApplier(ap); a.mgr.setEndGutter(8); a.mgr.render();
    ap.applyChange(a.geo.resize(L(4), 260));
    const w2 = W6.slice(); w2[4] = 260;
    const b = mk(DEFS, {}, w2);
    b.mgr.setApplier(new GeometryApplier(b.geo, { cellsOfColumn: () => [] } as any)); b.mgr.setEndGutter(8); b.mgr.render();
    expect(a.c.innerHTML).toBe(b.c.innerHTML);
    a.c.remove(); b.c.remove();
  });

  it('CD-FG-05 [C15] 디테일 켠 화면 — 여분 칸 = 본문 여분 폭(44+28) · 여백은 끝에', () => {
    const a = mk(DEFS, { rowNumber: true, detailExpanderCol: true });
    a.mgr.setEndGutter(8); a.mgr.render();
    const w = kids(a.c).map((k) => parseFloat(k.style.width));
    expect(w[0]).toBe(72);
    expect(w.at(-1)).toBe(8);
    expect(w.reduce((x, y) => x + y, 0)).toBe(a.geo.totalWidth() + 8);
    a.c.remove();
  });
});
