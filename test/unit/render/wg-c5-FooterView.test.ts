// @vitest-environment jsdom
// 넓은 그리드 새 그물 — 걸음 C5(EDGE) 푸터 뷰: U-FV-02(값만 고침) · U-FV-03(따라가기 등록) + 따라가기 「마지막 값」 · 관리자 IFooterView.
// 테스트 설계서 §2-38 · §10-1 C5 줄.
import { describe, it, expect } from 'vitest';
import { FooterView } from '../../../src/core/render/FooterView.js';
import { FooterValues } from '../../../src/core/domain/footer/FooterValues.js';
import { FooterManager } from '../../../src/core/FooterManager.js';
import { ScrollLeftFollower } from '../../../src/core/render/ScrollFollower.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import type { IScrollFollower } from '../../../src/core/render/ports.js';

const LEAVES = [{ field: 'a', type: 'number' }, { field: 'b' }, { field: 'c', type: 'number' }];
const GEO = new ColumnGeometry([120, 130, 140], ExtraColumns.fromOptions({ rowNumber: true }), 0);

function setup(defs: any[], data: any[], follower?: IScrollFollower) {
  const c = document.createElement('div');
  const opts: any = { footerHeight: 30, rowNumber: true, footer: defs };
  const values = new FooterValues();
  let calls = 0;
  const view = new FooterView({
    container: () => c, options: () => opts, leaves: () => LEAVES, geometry: () => GEO, widths: () => [120, 130, 140],
    values: () => { calls++; return values.compute(opts.footer, { rows: () => data }); },
    ...(follower ? { follower } : {}),
  });
  return { c, opts, view, data, calls: () => calls };
}
const freshHtml = (defs: any[], data: any[]) => { const s = setup(defs, data); s.view.paint(); return s.c.innerHTML; };

describe('FooterView — C5', () => {
  const DEFS = [{ label: '합계', colspan: 1 }, { field: 'b', op: 'sum', label: 'B' }, { field: 'c', op: 'avg', format: '#,##0.00' }];

  it('U-FV-02 updateValues — 값만 바뀌면 막대·칸 요소는 그대로(===)이고 글자·title 만 바뀜, 결과 글자 = 통째로 그린 것', () => {
    const data = [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }];
    const s = setup(DEFS, data);
    s.view.paint();
    const bar = s.c.querySelector('.og-footer-bar')!;
    const kids = Array.from(bar.children);
    data.push({ a: 7, b: 100, c: 9 });
    s.view.updateValues();
    expect(s.c.querySelector('.og-footer-bar')).toBe(bar);
    expect(Array.from(bar.children)).toEqual(kids);
    kids.forEach((k, i) => expect(bar.children[i]).toBe(k));
    expect(bar.textContent).toContain('B: 107');
    expect(s.c.innerHTML).toBe(freshHtml(DEFS, data));
  });

  it('U-FV-02 덤 — 정의 배열이 바뀌거나 막대가 떨어져 나갔으면 통째로 다시 그림', () => {
    const data = [{ b: 1, c: 2 }];
    const s = setup(DEFS, data);
    s.view.paint();
    const bar1 = s.c.querySelector('.og-footer-bar');
    s.opts.footer = [{ field: 'b', op: 'count' }];
    s.view.updateValues();
    const bar2 = s.c.querySelector('.og-footer-bar');
    expect(bar2).not.toBe(bar1);
    expect(s.c.innerHTML).toBe(freshHtml([{ field: 'b', op: 'count' }], data));
    bar2!.remove();
    s.view.updateValues();
    expect(s.c.querySelectorAll('.og-footer-bar').length).toBe(1);
  });

  it('U-FV-02 덤 — 값 칸이 라벨 칸으로 갈래가 바뀌면(필드 값이 없어짐) 통째로 다시 그려 결과가 통째와 같음', () => {
    const data = [{ b: 1 }];
    const defs = [{ field: 'b', op: 'sum', label: 'B' }];
    const s = setup(defs, data);
    s.view.paint();
    // 같은 정의 배열이지만 값 원천이 그 필드를 안 냄(사용자 summaryOp 등) — 갈래가 바뀜
    (s.view as any)._d.values = () => [];
    s.view.updateValues();
    const c2 = document.createElement('div');
    new FooterView({ container: () => c2, options: () => s.opts, leaves: () => LEAVES, geometry: () => GEO, widths: () => [120, 130, 140], values: () => [] }).paint();
    expect(s.c.innerHTML).toBe(c2.innerHTML);
  });

  it('U-FV-02 덤 — 컬럼 폭(기하 판)·높이·위치가 바뀌었으면 값만 고치지 않고 통째로(FT-02: 폭 조절 뒤 합계 칸이 따라 옮겨짐)', () => {
    const c = document.createElement('div');
    const geo = new ColumnGeometry([120, 130, 140], ExtraColumns.fromOptions({}), 0);
    const opts: any = { footerHeight: 30, footer: [{ label: 'L' }, { field: 'b', op: 'sum' }] };
    const v = new FooterView({ container: () => c, options: () => opts, leaves: () => LEAVES, geometry: () => geo, widths: () => [120, 130, 140],
      values: () => [{ _field: 'b', _value: 1, _formatted: '1' }] });
    v.paint();
    const bar1 = c.querySelector('.og-footer-bar');
    geo.reset([180, 130, 140], ExtraColumns.fromOptions({}), 0);
    v.updateValues();
    const bar2 = c.querySelector('.og-footer-bar') as HTMLElement;
    expect(bar2).not.toBe(bar1);
    expect((bar2.children[0] as HTMLElement).style.width).toBe('180px');
    v.updateValues();
    expect(c.querySelector('.og-footer-bar')).toBe(bar2); // 판이 그대로면 값만
    opts.footerHeight = 44;
    v.updateValues();
    expect(c.querySelector('.og-footer-bar')).not.toBe(bar2);
  });

  it('U-FV-03 따라가기 등록 — setFollower 뒤 paint 에 follow(막대) 1번, 다시 그리면 옛 막대 unfollow · 새 막대 follow', () => {
    const log: string[] = [];
    let last: Element | null = null;
    const f: IScrollFollower = { follow: (el) => { log.push('follow'); last = el; }, unfollow: (el) => { log.push(el === last ? 'unfollow-last' : 'unfollow-other'); }, sync: () => {}, destroy: () => {} };
    const s = setup(DEFS, [{ b: 1, c: 1 }]);
    s.view.setFollower(f);
    s.view.paint();
    expect(log).toEqual(['follow']);
    expect(last).toBe(s.c.querySelector('.og-footer-bar'));
    s.view.paint();
    expect(log).toEqual(['follow', 'unfollow-last', 'follow']);
    s.view.updateValues(); // 값만 — 따라가기 그대로
    expect(log.length).toBe(3);
  });

  it('U-FV-03 덤 — 이미 그린 막대가 있을 때 setFollower 하면 그 막대를 맡김 · 다른 객체로 바꾸면 옛 객체에서 풂', () => {
    const a: string[] = [], b: string[] = [];
    const mk = (log: string[]): IScrollFollower => ({ follow: () => log.push('f'), unfollow: () => log.push('u'), sync: () => {}, destroy: () => {} });
    const s = setup(DEFS, [{ b: 1, c: 1 }]);
    s.view.paint();
    s.view.setFollower(mk(a));
    s.view.setFollower(mk(b));
    expect(a).toEqual(['f', 'u']);
    expect(b).toEqual(['f']);
  });

  it('따라가기 마지막 값 — 본문을 옮긴 뒤 새로 그린 푸터 막대가 같은 scrollLeft 에서 시작(0 이면 쓰지 않음)', () => {
    const f = new ScrollLeftFollower();
    const header = document.createElement('div');
    f.follow(header);
    const s = setup(DEFS, [{ b: 1, c: 1 }], f);
    let writes = 0;
    s.view.paint();
    const bar1 = s.c.querySelector('.og-footer-bar') as HTMLElement;
    Object.defineProperty(bar1, 'scrollLeft', { set() { writes++; }, get() { return 0; }, configurable: true });
    expect(writes).toBe(0);
    f.sync(345);
    expect(writes).toBe(1);
    const seen: number[] = [];
    const proto = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')!;
    Object.defineProperty(Element.prototype, 'scrollLeft', { configurable: true, get() { return 0; }, set(v: number) { seen.push(v); } });
    try {
      s.view.paint(); // 새 막대
    } finally {
      Object.defineProperty(Element.prototype, 'scrollLeft', proto);
    }
    expect(seen).toEqual([345]);
  });

  it('채움 칸 — 막대 내용 폭 = 본문 전체 폭(기하 totalWidth). 정의가 컬럼을 다 덮으면 채움 칸 없음 · H-4 장면도 끝은 본문과 같음', () => {
    const widthsOf = (c: HTMLElement) => Array.from(c.querySelector('.og-footer-bar')!.children).map((k) => parseFloat((k as HTMLElement).style.width));
    // GEO: 여분 44 + 120·130·140 = 434
    const s = setup([{ field: 'b', op: 'sum' }], [{ b: 1 }]);
    s.view.paint();
    const w = widthsOf(s.c);
    expect(w).toEqual([44, 120, 270]);
    expect(s.c.querySelector('.og-footer-fill')).not.toBeNull();
    expect(w.reduce((a, b) => a + b, 0)).toBe(GEO.totalWidth());
    const full = setup([{ field: 'a', op: 'sum' }, { field: 'b', op: 'sum' }, { field: 'c', op: 'sum' }], [{ a: 1, b: 1, c: 1 }]);
    full.view.paint();
    expect(full.c.querySelector('.og-footer-fill')).toBeNull();
    // [C15] 디테일 펼침 칸(28)이 켜진 기하 — 여분 칸이 본문과 같은 여분 폭(44+28)이라 정의가 컬럼을 다 덮으면 채움 칸이 없다
    const geoD = new ColumnGeometry([120, 130, 140], ExtraColumns.fromOptions({ rowNumber: true, detailExpanderCol: true }), 0);
    const c = document.createElement('div');
    new FooterView({ container: () => c, options: () => ({ footerHeight: 30, footer: [{ field: 'a', op: 'sum' }, { field: 'b', op: 'sum' }, { field: 'c', op: 'sum' }] }),
      leaves: () => LEAVES, geometry: () => geoD, widths: () => [120, 130, 140], values: () => [] }).paint();
    const wd = widthsOf(c);
    expect(wd).toEqual([72, 120, 130, 140]);
    expect(wd.reduce((a, b) => a + b, 0)).toBe(geoD.totalWidth());
  });

  it('FooterManager 는 스케줄러의 푸터 포트(IFooterView) — paint = render, updateValues 는 값만, destroy 는 따라가기를 풂', () => {
    const c = document.createElement('div');
    const data = [{ a: 1 }, { a: 2 }];
    const opts: any = { footerHeight: 30, footer: [{ field: 'a', op: 'sum' }] };
    const mgr = new FooterManager({ getData: () => data as any[], getColLayout: () => ({ visibleLeaves: LEAVES }) as any, getColWidths: () => [120, 130, 140],
      getOptions: () => opts, getContainer: () => c, getGeometry: () => GEO });
    const log: string[] = [];
    mgr.setFollower({ follow: () => log.push('f'), unfollow: () => log.push('u'), sync: () => {}, destroy: () => {} });
    mgr.paint();
    const bar = c.querySelector('.og-footer-bar');
    data.push({ a: 10 });
    mgr.updateValues();
    expect(c.querySelector('.og-footer-bar')).toBe(bar);
    expect(bar!.textContent).toBe('13');
    expect(mgr.computeValues()).toEqual([{ _field: 'a', _value: 13, _formatted: '13' }]);
    mgr.destroy();
    expect(log).toEqual(['f', 'u']);
  });
});
