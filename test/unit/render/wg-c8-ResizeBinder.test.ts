// 넓은 그리드 새 그물 — 걸음 C8 ResizeHandleBinder 새 흐름(테스트 설계서 §2-27 U-RHB-01·02·04·05·08~11·20·21·24·27·31~33).
// 가짜 협력자(폭 주인·스케줄러·sink)를 그리드의 binder 에 connect 해 binder 혼자의 몫만 본다(배선 전에도 돈다).
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse } from '../widegrid-helpers.js';
import { Change } from '../../../src/core/domain/render/ports.js';
import { ResizeHandleBinder, type ResizeBinderPorts } from '../../../src/core/render/header/ResizeHandleBinder.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';

beforeAll(() => installResizeObserverStub());
afterEach(() => vi.restoreAllMocks());

const COLS = [
  { field: 'k', header: 'K', width: 100 },
  { field: 'v', header: 'V', width: 110 },
  { field: 'w', header: 'W', width: 120 },
];
const DATA = [{ k: 'b', v: 1, w: 'x' }, { k: 'c', v: 2, w: 'y' }, { k: 'a', v: 3, w: 'z' }];
const R = (g: any) => g._renderer;

function fakes(widths = [100, 110, 120], opts: { remeasure?: boolean } = {}) {
  const log: string[] = [];
  const geometry = new ColumnGeometry(widths, ExtraColumns.fromOptions({}), 0);
  const ports: ResizeBinderPorts = {
    widths: { setWidth: (ci: number, w: number) => { log.push(`set:${ci}:${w}`); } },
    scheduler: { submit: (req: any) => { log.push(`submit:${req.changes === Change.ColWidth ? 'ColWidth' : req.changes}:${req.detail?.sync ? 'sync' : 'async'}`); }, flushNow() {}, lastPlan: null, destroy() {} } as any,
    sink: {
      boundsOf: () => ({ min: 40, max: Infinity }),
      commit: (ci: number, w: number) => { log.push(`commit:${ci}:${w}`); },
      needsHeaderRemeasure: () => !!opts.remeasure,
      remeasureHeader: () => { log.push('remeasure'); },
    },
    geometry,
  };
  return { ports, log, geometry };
}
async function connected(opts: { remeasure?: boolean } = {}) {
  const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
  await settle();
  const f = fakes(undefined, opts);
  R(grid)._resize.connect(f.ports);
  const handle = (h: string) => headerCellByText(container, h).querySelector<HTMLElement>('.og-resize-handle')!;
  return { grid, container, handle, ...f };
}

describe('ResizeHandleBinder 새 흐름 — 끄는 동안 (C8)', () => {
  it('U-RHB-01 시작 폭은 기하에서 — th 의 offsetWidth 를 안 읽음', async () => {
    const s = await connected();
    const read = vi.fn(() => 999);
    (R(s.grid)._resize as any)._readWidth = read;
    mouse(s.handle('V'), 'mousedown', { clientX: 500 });
    mouse(document, 'mousemove', { clientX: 510 });
    mouse(document, 'mouseup', { clientX: 510 });
    expect(read).toHaveBeenCalledTimes(0);
    expect(s.log[0]).toBe('set:1:120');               // 기하 폭 110 + 10
    s.grid.destroy();
  });

  it('U-RHB-02 · U-RHB-30 입력 5번 → 폭 주인 5번 · ColWidth 요청 5번 · th 폭 직접 쓰기 0 · 다시 그리기 0', async () => {
    const s = await connected();
    const th = headerCellByText(s.container, 'K');
    const before = th.style.cssText;
    const renderBody = vi.spyOn(Object.getPrototypeOf(R(s.grid)), 'renderBody');
    const renderHeader = vi.spyOn(Object.getPrototypeOf(R(s.grid)), 'renderHeader');
    mouse(s.handle('K'), 'mousedown', { clientX: 100 });
    for (let i = 1; i <= 5; i++) mouse(document, 'mousemove', { clientX: 100 + i * 7 });
    expect(s.log.filter(x => x.startsWith('set:0:')).length).toBe(5);
    expect(s.log.filter(x => x === 'submit:ColWidth:async').length).toBe(5);
    expect(th.style.cssText).toBe(before);
    expect(renderBody).toHaveBeenCalledTimes(0);
    expect(renderHeader).toHaveBeenCalledTimes(0);
    mouse(document, 'mouseup', { clientX: 135 });
    s.grid.destroy();
  });

  it('U-RHB-04 움직임 없으면 일 없음 — 누름 뒤 제자리 move · 놓음: 폭 쓰기 0 · 요청 0 · commit 0', async () => {
    const s = await connected();
    mouse(s.handle('K'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 100 });
    mouse(document, 'mouseup', { clientX: 100 });
    expect(s.log).toEqual([]);
    s.grid.destroy();
  });

  it('U-RHB-05 놓으면 저장만 — commit 1번 · 다시 그리기 0', async () => {
    const s = await connected();
    const renderBody = vi.spyOn(Object.getPrototypeOf(R(s.grid)), 'renderBody');
    const renderHeader = vi.spyOn(Object.getPrototypeOf(R(s.grid)), 'renderHeader');
    mouse(s.handle('K'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 130 });
    mouse(document, 'mouseup', { clientX: 130 });
    expect(s.log.filter(x => x.startsWith('commit')).length).toBe(1);
    expect(s.log.at(-1)).toBe('commit:0:130');
    expect(renderBody).toHaveBeenCalledTimes(0);
    expect(renderHeader).toHaveBeenCalledTimes(0);
    s.grid.destroy();
  });

  it('U-RHB-33 마지막 move 와 다른 x 에서 놓기 — 그 폭으로 한 번 더(sync) 를 commit 앞에', async () => {
    const s = await connected();
    mouse(s.handle('W'), 'mousedown', { clientX: 1000 });
    mouse(document, 'mousemove', { clientX: 1200 });
    mouse(document, 'mouseup', { clientX: 1210 });
    expect(s.log).toEqual(['set:2:320', 'submit:ColWidth:async', 'set:2:330', 'submit:ColWidth:sync', 'commit:2:330']);
    s.grid.destroy();
  });

  it('U-RHB-24 줄바꿈 머리글 — needsHeaderRemeasure true 면 놓을 때 remeasureHeader 1번 / false 면 0번', async () => {
    const a = await connected({ remeasure: true });
    mouse(a.handle('K'), 'mousedown', { clientX: 100 }); mouse(document, 'mousemove', { clientX: 140 }); mouse(document, 'mouseup', { clientX: 140 });
    expect(a.log.filter(x => x === 'remeasure').length).toBe(1);
    a.grid.destroy();
    const b = await connected({ remeasure: false });
    mouse(b.handle('K'), 'mousedown', { clientX: 100 }); mouse(document, 'mousemove', { clientX: 140 }); mouse(document, 'mouseup', { clientX: 140 });
    expect(b.log.filter(x => x === 'remeasure').length).toBe(0);
    b.grid.destroy();
  });
});

describe('ResizeHandleBinder 새 흐름 — Esc · 잃음 · 지움 (C8)', () => {
  it('U-RHB-08 Esc — 시작 폭으로 · commit 0 · 끝난 뒤 문서 keydown 리스너 남지 않음(U-RHB-09)', async () => {
    const s = await connected();
    mouse(s.handle('V'), 'mousedown', { clientX: 500 });
    mouse(document, 'mousemove', { clientX: 560 });
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(s.log).toEqual(['set:1:170', 'submit:ColWidth:async', 'set:1:110', 'submit:ColWidth:async']);
    mouse(document, 'mousemove', { clientX: 600 });
    mouse(document, 'mouseup', { clientX: 600 });
    expect(s.log.filter(x => x.startsWith('commit')).length).toBe(0);
    const esc2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(esc2);
    expect(esc2.defaultPrevented).toBe(false);          // 평소 Esc 는 안 건드림
    s.grid.destroy();
  });

  it('U-RHB-10 포인터 잃음(lostpointercapture) — 그 순간 폭으로 commit 1번', async () => {
    const s = await connected();
    const h = s.handle('K');
    h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, pointerId: 7, button: 0 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150, pointerId: 7 }));
    h.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 7 }));
    expect(s.log.filter(x => x.startsWith('commit'))).toEqual(['commit:0:150']);
    s.grid.destroy();
  });

  it('U-RHB-11 창 blur — commit 1번 · 상태 정리(뒤 move 무시)', async () => {
    const s = await connected();
    mouse(s.handle('K'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 130 });
    window.dispatchEvent(new Event('blur'));
    mouse(document, 'mousemove', { clientX: 200 });
    expect(s.log.filter(x => x.startsWith('commit'))).toEqual(['commit:0:130']);
    expect(s.log.filter(x => x.startsWith('set')).length).toBe(1);
    s.grid.destroy();
  });

  it('U-RHB-21 끄는 중 destroy — 리스너 0 · commit 0', async () => {
    const s = await connected();
    mouse(s.handle('K'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 120 });
    s.grid.destroy();
    mouse(document, 'mousemove', { clientX: 180 });
    mouse(document, 'mouseup', { clientX: 180 });
    expect(s.log.filter(x => x.startsWith('commit')).length).toBe(0);
    expect(s.log.filter(x => x.startsWith('set')).length).toBe(1);
  });
});

describe('ResizeHandleBinder 새 흐름 — 입력 규칙 (C8)', () => {
  it('U-RHB-31 마우스만(jsdom RU 꼴) — press 1 · commit 1 · 폭 바뀜', async () => {
    const s = await connected();
    mouse(s.handle('K'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 110 }); mouse(document, 'mousemove', { clientX: 120 }); mouse(document, 'mousemove', { clientX: 130 });
    mouse(document, 'mouseup', { clientX: 130 });
    expect(s.log.filter(x => x.startsWith('commit'))).toEqual(['commit:0:130']);
    s.grid.destroy();
  });

  it('U-RHB-32 · U-RHB-27 pointerdown(setPointerCapture 없는 요소) — 던지지 않음 · 뒤따르는 합성 mousedown/move/up 무시', async () => {
    const s = await connected();
    const h = s.handle('K');
    expect(() => h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, pointerId: 1, button: 0 }))).not.toThrow();
    mouse(h, 'mousedown', { clientX: 100 });                       // 합성 — 무시(누름 두 번 아님)
    mouse(document, 'mousemove', { clientX: 300 });                // 합성 — 포인터 제스처라 무시
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 140, pointerId: 1 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 999, pointerId: 2 }));   // 다른 포인터 — 무시
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 140, pointerId: 1 }));
    mouse(document, 'mouseup', { clientX: 300 });                  // 합성 — 무시
    expect(s.log).toEqual(['set:0:140', 'submit:ColWidth:async', 'commit:0:140']);
    s.grid.destroy();
  });

  it('U-RHB-20 iframe — move·up 리스너가 손잡이의 ownerDocument 에 붙고 바깥 document 사건은 안 먹힘', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument!;
    const th = idoc.createElement('th'); idoc.body.appendChild(th);
    const handle = idoc.createElement('div'); th.appendChild(handle);
    const b = new ResizeHandleBinder(() => 0, () => {});
    const f = fakes();
    b.connect(f.ports);
    b.clear();
    b.attach(handle, th, 0);
    handle.dispatchEvent(new (iframe.contentWindow as any).MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 100, button: 0 }));
    mouse(document, 'mousemove', { clientX: 300 });               // 바깥 문서 — 무시
    idoc.dispatchEvent(new (iframe.contentWindow as any).MouseEvent('mousemove', { bubbles: true, clientX: 130 }));
    idoc.dispatchEvent(new (iframe.contentWindow as any).MouseEvent('mouseup', { bubbles: true, clientX: 130 }));
    expect(f.log).toEqual(['set:0:130', 'submit:ColWidth:async', 'commit:0:130']);
    iframe.remove();
  });

  it('C8-RHB-a connect 전(협력자 없음) — 끄는 동안 DOM 쓰기 0, 놓을 때 옛 commit 1번', async () => {
    const commits: Array<[number, number]> = [];
    const th = document.createElement('th'); document.body.appendChild(th);
    const handle = document.createElement('div'); th.appendChild(handle);
    const b = new ResizeHandleBinder(() => 100, (ci, w) => commits.push([ci, w]));
    b.clear(); b.attach(handle, th, 0);
    const before = th.style.cssText;
    mouse(handle, 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 150 });
    expect(th.style.cssText).toBe(before);
    mouse(document, 'mouseup', { clientX: 150 });
    expect(commits).toEqual([[0, 150]]);
    th.remove();
  });
});
