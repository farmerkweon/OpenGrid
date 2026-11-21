/**
 * 줄바꿈 머리글 그리드에서 너비 조절을 놓을 때 머리글 높이 맞춤은 「마지막으로 맞춘 높이와 다를 때만」.
 * - 놓기 전후로 머리글 높이가 그대로면 syncHeaderLayout 0번(강제 배치 없음).
 * - 놓는 사이 머리글 높이가 바뀌면 1번, 본문 상자 높이가 새 머리글 높이에 맞음.
 * jsdom 은 배치가 없으므로 머리글 높이(offsetHeight)를 시험이 정한다.
 */
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { RenderController } from '../../src/core/RenderController.js';

let headerH = 50;
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) { return this.classList.contains('og-header') ? headerH : 0; },
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', desc); });

const frame = () => new Promise((r) => setTimeout(r, 40));
function mount() {
  const c = document.createElement('div');
  Object.defineProperty(c, 'getBoundingClientRect', { value: () => ({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400 }) });
  document.body.appendChild(c);
  const cols = [
    { field: 'a', header: '긴 머리글\n둘째 줄', width: 120 },
    { field: 'b', header: 'B', width: 120 },
    { field: 'c', header: 'C', width: 120 },
  ];
  const g = new OpenGrid(c, { columns: cols, height: 400 } as any);
  g.setData(Array.from({ length: 10 }, (_, r) => ({ a: 'a' + r, b: 'b' + r, c: 'c' + r })));
  return { c, g };
}
function drag(c: HTMLElement, from: number, to: number) {
  const handle = c.querySelectorAll<HTMLElement>('th.og-header-cell')[1]!.querySelector<HTMLElement>('.og-resize-handle')!;
  handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: from }));
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: to }));
  return () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: to }));
}

describe('놓은 뒤 머리글 맞춤 — 높이가 다를 때만', () => {
  it('머리글 높이가 그대로인 놓기 — syncHeaderLayout 0번', async () => {
    headerH = 50;
    const { c, g } = mount();
    await frame(); await frame();
    const spy = vi.spyOn(RenderController.prototype, 'syncHeaderLayout');
    const up = drag(c, 200, 240);
    await frame();
    spy.mockClear();
    up();
    await frame();
    expect(spy.mock.calls.length).toBe(0);
    g.destroy();
  });

  it('놓는 사이 머리글 높이가 바뀐 놓기 — syncHeaderLayout 1번 · 본문 상자 높이 = 전체 − 새 머리글 높이', async () => {
    headerH = 50;
    const { c, g } = mount();
    await frame(); await frame();
    const spy = vi.spyOn(RenderController.prototype, 'syncHeaderLayout');
    const up = drag(c, 200, 160);
    await frame();
    spy.mockClear();
    headerH = 70;
    up();
    await frame();
    expect(spy.mock.calls.length).toBe(1);
    const bw = c.querySelector<HTMLElement>('.og-body-wrapper')!;
    expect(bw.style.height).toBe(`${400 - 70}px`);
    g.destroy();
  });
});

