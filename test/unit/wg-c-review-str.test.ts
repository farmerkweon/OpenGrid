/**
 * 변경 걸음 코드 검토(REVIEW_CODE_C) STR 몫의 시험.
 * - C-06 공개 getColumnDefs() 는 사본 — 받은 배열을 망가뜨려도 그리드의 표시 컬럼·머리글이 그대로.
 * - C-08 컨테이너 폭이 0 이라 폭 계산이 안 돈 그리드에서 끈 폭이 다음 맞춤에 덮이지 않는다.
 * - C-10 놓기 한 번 = 폭 쓰기 한 번·그리기 요청 한 번(안쪽 콜백 onColResize 는 그대로 한 번).
 */
import { describe, it, expect, vi } from 'vitest';
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { RenderController } from '../../src/core/RenderController.js';

const frame = () => new Promise((r) => setTimeout(r, 40));
const cols = () => Array.from({ length: 4 }, (_, i) => ({ field: 'c' + i, header: 'H' + i, width: 120 }));
const rows = () => Array.from({ length: 20 }, (_, r) => ({ c0: 'a' + r, c1: 'b' + r, c2: 'c' + r, c3: 'd' + r }));
function mount(width: number) {
  const c = document.createElement('div');
  Object.defineProperty(c, 'getBoundingClientRect', { value: () => ({ width, height: width ? 400 : 0, top: 0, left: 0, right: width, bottom: 400 }) });
  document.body.appendChild(c);
  const g = new OpenGrid(c, { columns: cols(), height: 400 } as any);
  g.setData(rows());
  return { c, g };
}
const headers = (c: HTMLElement) => Array.from(c.querySelectorAll('th.og-header-cell')).map((th) => th.querySelector('span')?.textContent?.trim());

describe('C 검토 STR', () => {
  it('C-06 getColumnDefs() 사본 — 망가뜨려도 그리드는 그대로', async () => {
    const { c, g } = mount(800);
    await frame();
    const a = g.getColumnDefs();
    const before = a.map((d) => d.field);
    a.reverse(); a.splice(0, 2); a.push({ field: 'zz', header: 'ZZ' } as any);
    expect(g.getColumnDefs().map((d) => d.field)).toEqual(before);
    expect(g.getColumnDefs()).not.toBe(g.getColumnDefs());
    (g as any)._renderHeader();
    expect(headers(c)).toEqual(['H0', 'H1', 'H2', 'H3']);
    g.destroy();
  });

  it('C-08 폭 계산이 안 돈(컨테이너 폭 0) 그리드에서 setUserWidth 의 폭이 다음 맞춤에도 남는다', async () => {
    const { g } = mount(0);
    await frame();
    const rc = (g as any)._render as RenderController;
    expect((g as any)._colWidths.length).toBe(0);
    rc.setUserWidth(1, 222);
    expect(rc.syncGeometry().widthOf(1 as any)).toBe(222);
    rc.syncGeometry();
    expect(rc.syncGeometry().widthOf(1 as any)).toBe(222);
    expect(rc.syncGeometry().widthOf(0 as any)).toBe(100);
    g.destroy();
  });

  it('C-10 놓기 한 번 — setUserWidth 1번 · 그리기 요청(ColWidth) 1번 · onColResize 1번', async () => {
    const { c, g } = mount(800);
    await frame(); await frame();
    const rc = (g as any)._render as RenderController;
    const writes = vi.spyOn(rc, 'setUserWidth');
    const sch = (g as any)._scheduler;
    const submits = vi.spyOn(sch, 'submit');
    const cbs = (g as any)._renderer._cbs;
    let cb = 0; const orig = cbs.onColResize; cbs.onColResize = (ci: number, w: number) => { cb++; orig(ci, w); };
    const handle = c.querySelectorAll<HTMLElement>('th.og-header-cell')[1]!.querySelector<HTMLElement>('.og-resize-handle')!;
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 200 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 240 }));
    await frame();
    writes.mockClear(); submits.mockClear();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 260 }));
    await frame();
    expect(cb).toBe(1);
    expect(writes.mock.calls.length).toBe(1);
    expect(submits.mock.calls.length).toBe(1);
    expect((g as any)._userWidths.get('c1')).toBe(Math.round(rc.syncGeometry().widthOf(1 as any)));
    g.destroy();
  });
});
