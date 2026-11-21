/**
 * 걸음 C4(SORT 몫) — HeaderSortIndicator (TEST_DESIGN_NEW §2-28 U-HSI-01~05·08~10 · GD-15 장면).
 * 대조군 = 같은 옵션 그리드를 그 정렬 상태로 「처음부터」 그린 머리글 칸(orderBy → 지금 renderHeader).
 * 고친 칸의 outerHTML 이 처음 그린 칸과 바이트까지 같아야 한다.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid';
import { HeaderSortIndicator } from '../../../src/core/render/header/HeaderSortIndicator';

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
const grids: any[] = [];
afterEach(() => { while (grids.length) grids.pop().destroy(); document.body.innerHTML = ''; });

type S = { field: string; dir: 'asc' | 'desc' }[];
const COLS = [
  { field: 'c1', header: 'C1', width: 90 },
  { field: 'c2', header: 'C2', width: 90 },
  { field: 'c3', header: 'C3', width: 90, filterable: false },
  { field: 'c4', header: 'C4\n둘째 줄', width: 90 },
  { field: 'c5', header: 'C5', width: 90, sortable: false },
];
function grid(sort: S, extra: Record<string, unknown> = {}) {
  const el = document.createElement('div'); el.style.width = '800px'; el.style.height = '300px';
  document.body.appendChild(el);
  const g: any = new OpenGrid(el, { columns: COLS as any, height: 300, multiSort: true, filterable: true, ...extra });
  g.setData([{ c1: 'b', c2: 2, c3: 'x', c4: 'q', c5: 1 }, { c1: 'a', c2: 1, c3: 'y', c4: 'p', c5: 2 }]);
  g.orderBy(sort.map(s => ({ ...s })));
  g._renderHeader(); // 대조군 = 이 정렬 상태로 머리글을 처음부터 그린 것(지킬 이음새 _renderHeader)
  grids.push(g);
  return { g, el };
}
const ths = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('th.og-header-cell')).filter(th => th.colSpan === 1 && COLS.some(c => th.textContent!.startsWith(c.header.split('\n')[0]!)));
const fieldOf = (th: HTMLElement) => COLS.find(c => th.textContent!.startsWith(c.header.split('\n')[0]!))!;
function bindAll(el: HTMLElement) {
  const ind = new HeaderSortIndicator();
  for (const th of ths(el)) { const c = fieldOf(th); ind.bind(th, c.field, (c as any).sortable !== false); }
  return ind;
}
const html = (el: HTMLElement) => ths(el).map(th => th.outerHTML);

describe('C4 U-HSI HeaderSortIndicator', () => {
  it('U-HSI-01 오름 — 고친 칸 == 처음 그린 칸(og-sorted · aria-sort ascending · 화살표 자리)', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    ind.update([{ field: 'c1', dir: 'asc' }]);
    expect(html(a.el)).toEqual(html(grid([{ field: 'c1', dir: 'asc' }]).el));
  });
  it('U-HSI-02 내림 → 해제 — 각각 처음 그린 칸과 같음, 해제 뒤 화살표 없음', () => {
    const a = grid([{ field: 'c1', dir: 'asc' }]);
    const ind = bindAll(a.el);
    ind.update([{ field: 'c1', dir: 'desc' }]);
    expect(html(a.el)).toEqual(html(grid([{ field: 'c1', dir: 'desc' }]).el));
    ind.update([]);
    expect(html(a.el)).toEqual(html(grid([]).el));
    expect(a.el.querySelector('.og-sort-icon')).toBeNull();
  });
  it('U-HSI-03 바뀐 칸만 씀 — 50칸 중 3번 칸만 정렬, 다른 49칸 변이 0', async () => {
    const cols = Array.from({ length: 50 }, (_, i) => ({ field: 'f' + i, header: 'H' + i, width: 60 }));
    const el = document.createElement('div'); document.body.appendChild(el);
    const g: any = new OpenGrid(el, { columns: cols as any, height: 300 }); grids.push(g);
    g.setData([{ f0: 1 }]);
    g._renderHeader();
    const list = Array.from(el.querySelectorAll<HTMLElement>('th.og-header-cell')).filter(th => /^H\d+/.test(th.textContent!));
    const ind = new HeaderSortIndicator();
    list.forEach((th, i) => ind.bind(th, 'f' + i, true));
    const touched = new Set<Element>();
    const mo = new MutationObserver(recs => recs.forEach(r => touched.add(r.target instanceof Element ? r.target.closest('th')! : (r.target.parentElement!.closest('th')!))));
    list.forEach(th => mo.observe(th, { attributes: true, childList: true, subtree: true, characterData: true }));
    ind.update([{ field: 'f3', dir: 'asc' }]);
    await Promise.resolve();
    mo.disconnect();
    expect([...touched]).toEqual([list[3]]);
  });
  it('U-HSI-04 th 동일성 — update 전후 같은 요소', () => {
    const a = grid([]);
    const before = ths(a.el);
    bindAll(a.el).update([{ field: 'c2', dir: 'desc' }]);
    const after = ths(a.el);
    after.forEach((th, i) => expect(th).toBe(before[i]));
  });
  it('U-HSI-05 눌림 — setPressed(f) 에 og-sorting, null 에 빠짐(다른 칸 그대로)', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    ind.setPressed('c2');
    expect(ths(a.el).filter(th => th.classList.contains('og-sorting')).map(th => fieldOf(th).field)).toEqual(['c2']);
    ind.setPressed(null);
    expect(a.el.querySelector('.og-sorting')).toBeNull();
  });
  it('U-HSI-08 release 뒤 update — 칸 안 바뀜', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    const before = html(a.el);
    ind.release();
    ind.update([{ field: 'c1', dir: 'asc' }]);
    expect(html(a.el)).toEqual(before);
  });
  it('U-HSI-09 여러 컬럼 정렬 — 처음 그린 머리글과 같음(순번 표시 없음도 같게)', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    const list: S = [{ field: 'c2', dir: 'desc' }, { field: 'c4', dir: 'asc' }];
    ind.update(list);
    expect(html(a.el)).toEqual(html(grid(list).el));
  });
  it('U-HSI-10 sortable:false 칸 — 처음 그린 칸과 같음(지금 동작: 프로그램 정렬이면 화살표는 붙고 aria-sort 는 없음)', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    ind.update([{ field: 'c5', dir: 'asc' }]);
    const fresh = grid([{ field: 'c5', dir: 'asc' }]);
    expect(html(a.el)).toEqual(html(fresh.el));
    const th = ths(a.el).find(t => fieldOf(t).field === 'c5')!;
    expect(th.hasAttribute('aria-sort')).toBe(false);
  });
  it('GD-15 장면(필터 켬·활성 필터·여러 컬럼·filterable:false·sortable:false) — 사슬 asc→desc→다른 컬럼→해제 매 단계 == 처음 그린 칸', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    const chain: S[] = [[{ field: 'c1', dir: 'asc' }], [{ field: 'c1', dir: 'desc' }], [{ field: 'c2', dir: 'desc' }, { field: 'c4', dir: 'asc' }], [{ field: 'c3', dir: 'asc' }], []];
    for (const s of chain) {
      ind.update(s);
      expect(html(a.el)).toEqual(html(grid(s).el));
    }
  });
  it('setBusy — aria-busy 붙음 → 떨어짐', () => {
    const a = grid([]);
    const ind = bindAll(a.el);
    ind.setBusy('c1', true, 'desc');
    expect(ths(a.el).find(t => fieldOf(t).field === 'c1')!.getAttribute('aria-busy')).toBe('true');
    ind.setBusy('c1', false);
    expect(a.el.querySelector('[aria-busy]')).toBeNull();
  });
});
