// 넓은 그리드 새 그물 — C8 코드 검토(review/REVIEW_CODE_C.md) 반영: C-03(P1) · C-04(P5) · C-01 의 jsdom 몫 · C-02.
// 실제 그리드(협력자가 배선된 binder)로 끈다.
import { describe, it, expect, beforeAll } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse } from '../widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const COLS = Array.from({ length: 6 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
const DATA = Array.from({ length: 5 }, (_, r) => Object.fromEntries(COLS.map((c, k) => [c.field, `r${r}c${k}`])));
const handle = (c: HTMLElement, h: string) => headerCellByText(c, h).querySelector<HTMLElement>('.og-resize-handle')!;
const cellW = (c: HTMLElement, ci: number) => c.querySelector<HTMLElement>(`.og-body .og-row[aria-rowindex="1"] [aria-colindex="${ci + 1}"]`)!.style.width;

describe('C8 검토 반영', () => {
  it('C8-REV-C03 (P1) 넓혔다가 move 없이 시작 x 에서 놓음 — 화면 == 날 배열 == 기하 == 시작 폭, 사용자 폭 저장 안 함', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const g = grid as any;
    mouse(handle(container, 'H1'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 160 });
    await settle();
    expect(headerCellByText(container, 'H1').style.width).toBe('180px');     // 끄는 동안 따라옴
    mouse(document, 'mouseup', { clientX: 100 });                           // 시작 x 로 돌아와 move 없이 놓음
    await settle();
    expect(headerCellByText(container, 'H1').style.width).toBe('120px');
    expect(cellW(container, 1)).toBe('120px');
    expect(g._colWidths[1]).toBe(120);
    expect(g._render.geometry.widthOf(1)).toBe(120);
    expect(g._userWidths.has('c1')).toBe(false);
    grid.destroy();
  });

  it('C8-REV-C04 (P5) 끄는 중 hideColumn(앞 컬럼) — 번호가 밀려도 같은 컬럼(H3)을 이어 끌고 그 이름으로 저장, 이웃 H4 는 그대로', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const g = grid as any;
    mouse(handle(container, 'H3'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 130 });
    await settle();
    grid.hideColumn('c0');
    await settle();
    mouse(document, 'mousemove', { clientX: 170 });
    mouse(document, 'mouseup', { clientX: 170 });
    await settle();
    expect(headerCellByText(container, 'H4').style.width).toBe('120px');     // 밀린 번호의 이웃 컬럼이 안 늘어남
    expect(headerCellByText(container, 'H3').style.width).toBe('190px');     // 끌던 컬럼이 이어 따라옴
    expect([...g._userWidths.entries()]).toEqual([['c3', 190]]);            // 끌던 컬럼 이름으로만 저장
    grid.destroy();
  });

  it('C8-REV-C04b 끄는 중 끌던 컬럼 자체를 숨김 — 끌기를 확정 없이 끝냄(다른 컬럼에 쓰거나 저장 안 함)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const g = grid as any;
    mouse(handle(container, 'H3'), 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 130 });
    await settle();
    grid.hideColumn('c3');
    await settle();
    mouse(document, 'mousemove', { clientX: 170 });
    mouse(document, 'mouseup', { clientX: 170 });
    await settle();
    for (const h of ['H0', 'H1', 'H2', 'H4', 'H5']) expect(headerCellByText(container, h).style.width).toBe('120px');
    expect(g._userWidths.size).toBe(0);
    grid.destroy();
  });

  it('C8-REV-C01 (jsdom 몫) 포인터 누름은 취소하지 않음 · 뒤따르는 호환 mousedown 은 선택만 막고 전파는 손잡이에서 멈춤(옛 손잡이와 같음)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const h = handle(container, 'H2');
    const pd = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, pointerId: 3, button: 0 });
    h.dispatchEvent(pd);
    expect(pd.defaultPrevented).toBe(false);
    const seen: string[] = [];
    const docDown = () => seen.push('doc-mousedown');
    document.addEventListener('mousedown', docDown);
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 100, button: 0 });
    h.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);                                                // 옛 손잡이도 mousedown 전파를 막았다
    // 호환 mousemove·mouseup 은 문서까지 감
    const docMove = () => seen.push('doc-mousemove');
    const docUp = () => seen.push('doc-mouseup');
    document.addEventListener('mousemove', docMove); document.addEventListener('mouseup', docUp);
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 140, pointerId: 3 }));
    h.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 140 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 140, pointerId: 3 }));
    h.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 140 }));
    expect(seen).toEqual(['doc-mousemove', 'doc-mouseup']);
    document.removeEventListener('mousedown', docDown); document.removeEventListener('mousemove', docMove); document.removeEventListener('mouseup', docUp);
    grid.destroy();
  });

  it('C8-REV-C02 손잡이 DOM 은 걸음 전과 같음 — touch-action 을 더하지 않음(터치 끌기는 발주자 결정 항목)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const h = handle(container, 'H1');
    expect(h.getAttribute('style')).toBe('position: absolute; right: 0px; top: 0px; bottom: 0px; width: 4px; cursor: col-resize; z-index: 1;');
    expect(headerCellByText(container, 'H1').style.touchAction).toBe('');
    grid.destroy();
  });
});
