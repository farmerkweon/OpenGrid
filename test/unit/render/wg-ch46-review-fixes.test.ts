// 넓은 그리드 L46 — 코드 검토(REVIEW_CODE_CEFG) F-1·F-2·F-3 고침 시험.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse } from '../widegrid-helpers.js';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { ScrollObserver } from '../../../src/core/render/ScrollObserver.js';
import { RenderRequest } from '../../../src/core/domain/render/RenderRequest.js';
import { installSceneEnv, makeSceneContainer, tick, rows } from '../wg-helpers/scenes.js';

const frames = (n = 3) => new Promise<void>(res => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });

describe('F-1 Esc 와 놓음 사이 destroy — 문서 듣개 누수 없음', () => {
  beforeAll(() => installResizeObserverStub());
  it('CH46-F1 Esc 뒤 destroy ⇒ 문서에 단 모든 듣개의 signal 이 중단됨', async () => {
    const cols = Array.from({ length: 3 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
    const data = Array.from({ length: 3 }, (_, r) => ({ c0: `a${r}`, c1: `b${r}`, c2: `c${r}` }));
    const { grid, container } = makeGrid({ columns: cols, sortable: true }, data);
    await settle();
    const sigs: AbortSignal[] = [];
    const orig = document.addEventListener.bind(document);
    const spy = vi.spyOn(document, 'addEventListener').mockImplementation((t: any, fn: any, o: any) => {
      if (o && typeof o === 'object' && o.signal) sigs.push(o.signal);
      return orig(t, fn, o);
    });
    const th = headerCellByText(container, 'H1');
    mouse(th.querySelector<HTMLElement>('.og-resize-handle')!, 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 160 });
    await frames();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await frames();
    grid.destroy();   // 놓기 전에 파괴
    spy.mockRestore();
    expect(sigs.length).toBeGreaterThan(0);
    expect(sigs.filter(s => !s.aborted).length).toBe(0);
  });
});

describe('F-2 LTR 일시 음수 scrollLeft — RTL 로 못 박지 않음', () => {
  it('CH46-F2 LTR 상자에 -5 가 와도 다음 scroll 에서 폭이 유지됨', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const submitted: unknown[] = [];
    const ob = new ScrollObserver(el, { submit: (r: RenderRequest) => { submitted.push(r); } } as any);
    ob.setWidth(800);
    Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: -5 });
    el.dispatchEvent(new Event('scroll'));
    (el as any).scrollLeft = 10;
    el.dispatchEvent(new Event('scroll'));
    expect(ob.box.width).toBe(800);
    expect(ob.box.scrollLeft).toBe(10);
    ob.destroy();
    el.remove();
  });
});

describe('F-3 편집 중인 행은 차분에서 다시 만들지 않음', () => {
  let restore: () => void;
  beforeAll(() => { restore = installSceneEnv(); });
  afterAll(() => restore());
  it('CH46-F3 편집 행의 상태 열쇠가 달라져도 차분이 그 행 요소를 그대로 둠', async () => {
    const container = makeSceneContainer();
    const columns = Array.from({ length: 6 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
    const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns } as any) as any;
    grid.setData(rows(200, 6));
    await tick(); await tick(1);
    const view = grid._renderer._bodyView;
    const paint = (s: number, e: number, diff: boolean) => {
      const r = grid._renderer; const orig = r.renderBody;
      r.renderBody = function (f: any) { return orig.call(r, { ...f, offsetY: s * f.opts.rowHeight, ...(diff ? { rowWork: 'diff' } : {}) }); };
      try { grid._doRender(s, e, undefined); } finally { r.renderBody = orig; }
    };
    paint(0, 15, false);
    view.pin({ editRow: 8 });
    const before = view._rowSet.get ? view._rowSet.get(8) : container.querySelectorAll('.og-row')[8];
    grid._rowMgr.selectedRows.add(8);      // 열쇠가 달라짐
    paint(2, 17, true);
    const after = view._rowSet.get ? view._rowSet.get(8) : container.querySelectorAll('.og-row')[6];
    expect(before).toBeTruthy();
    expect(after).toBe(before);
    grid.destroy();
  });
});
