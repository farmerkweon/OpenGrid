/**
 * 검토 V-03 — 공개 jumpToCol(field) 가 그 컬럼이 보이게 가로로 옮긴다(가로 가상화로 창 밖 칸이 DOM 에 없어도).
 * - 보이는 컬럼: 본문 상자 scrollLeft 가 그 컬럼이 보이는 자리로 바뀐다.
 * - 없는 필드·숨은 컬럼: 아무 일 없음(던지지 않음).
 * jsdom 은 배치가 없으므로 본문 상자 보이는 폭을 시험이 정한다.
 */
import { describe, it, expect } from 'vitest';
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get(this: HTMLElement) { return this.classList.contains('og-body-wrapper') ? 600 : 0; },
});
import { OpenGrid } from '../../src/core/OpenGrid.js';

const frame = () => new Promise((r) => setTimeout(r, 40));
function mount() {
  const c = document.createElement('div');
  Object.defineProperty(c, 'getBoundingClientRect', { value: () => ({ width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400 }) });
  document.body.appendChild(c);
  const cols = Array.from({ length: 30 }, (_, i) => ({ field: 'c' + i, header: 'H' + i, width: 120 }));
  const g = new OpenGrid(c, { columns: cols, height: 400 } as any);
  g.setData(Array.from({ length: 20 }, (_, r) => Object.fromEntries(cols.map((cc, i) => [cc.field, `r${r}c${i}`]))));
  return { c, g };
}

describe('V-03 jumpToCol', () => {
  it('V-03 화면 밖 컬럼 c25 로 가면 본문 상자 scrollLeft 가 그 컬럼이 보이는 자리', async () => {
    const { c, g } = mount();
    g.resize?.();
    await frame(); await frame();
    const bw = c.querySelector<HTMLElement>('.og-body-wrapper')!;
    expect(bw.scrollLeft).toBe(0);
    g.jumpToCol('c25');
    await frame();
    const x = bw.scrollLeft;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(25 * 120);
    expect(x + 600).toBeGreaterThanOrEqual(26 * 120);
    g.destroy();
  });

  it('V-03 없는 필드·숨은 컬럼이면 아무 일 없음', async () => {
    const { c, g } = mount();
    g.resize?.();
    await frame(); await frame();
    const bw = c.querySelector<HTMLElement>('.og-body-wrapper')!;
    expect(() => g.jumpToCol('nope')).not.toThrow();
    g.hideColumn('c20');
    g.jumpToCol('c20');
    await frame();
    expect(bw.scrollLeft).toBe(0);
    g.destroy();
  });
});
