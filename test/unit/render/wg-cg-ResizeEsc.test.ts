// 넓은 그리드 새 그물 — 너비 끌기를 Esc 로 취소하고 프레임이 지난 뒤 놓을 때, 따라오는 click 이 정렬이 아님(review R-02 — 검토 탐침 P-ESC 를 시험으로).
import { describe, it, expect, beforeAll } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse } from '../widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const COLS = Array.from({ length: 4 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
const DATA = Array.from({ length: 5 }, (_, r) => Object.fromEntries(COLS.map((c, k) => [c.field, `r${r}c${k}`])));
const frames = (n = 3) => new Promise<void>(res => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });

async function drag(esc: boolean) {
  const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
  await settle();
  const th = headerCellByText(container, 'H1');
  mouse(th.querySelector<HTMLElement>('.og-resize-handle')!, 'mousedown', { clientX: 100 });
  mouse(document, 'mousemove', { clientX: 160 });
  await frames();
  if (esc) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await frames();
  mouse(document, 'mouseup', { clientX: 160 });
  th.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));   // 실제 브라우저에서 click 대상이 th 인 경우
  await frames();
  const sort = (grid as any)._sfMgr?.getSort?.() ?? (grid as any).getSortState?.() ?? Array.from(container.querySelectorAll('th[aria-sort]')).map(t => t.getAttribute('aria-sort')).filter(s => s !== 'none');
  const width = headerCellByText(container, 'H1').style.width;
  // 그 뒤 보통 click 은 정렬됨(삼킴이 남지 않음)
  headerCellByText(container, 'H2').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await frames();
  const h2 = headerCellByText(container, 'H2').getAttribute('aria-sort');
  grid.destroy();
  return { sort, width, h2 };
}

describe('Esc 취소 뒤 놓음', () => {
  it('CG-ESC-U01 누름 → 끎 → Esc → 프레임 → 놓음 → th click ⇒ 정렬 없음 · 시작 폭 · 다음 보통 click 은 정렬', async () => {
    const r = await drag(true);
    expect(r.sort).toEqual([]);
    expect(r.width).toBe('120px');
    expect(r.h2 === 'ascending' || r.h2 === 'descending').toBe(true);
  });
  it('CG-ESC-U02 대조: Esc 없이 놓음 ⇒ 정렬 없음 · 폭 180', async () => {
    const r = await drag(false);
    expect(r.sort).toEqual([]);
    expect(r.width).toBe('180px');
  });
});
