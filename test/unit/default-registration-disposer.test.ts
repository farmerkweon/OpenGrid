/**
 * OpenGrid.addDefaultOverride / OpenGrid.addDefaultStrategy — 전역 기본을 걸고, 돌려받은 함수로 되돌린다.
 *
 * Register a global default and undo it with the returned function.
 *
 * 정리는 공개 API(되돌리는 함수)로 한다. 예외는 T3-08 하나 — 되돌리는 수단이 없는 옛 메서드를 시험하기 때문.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const undo: Array<() => void> = [];
afterEach(() => {
  while (undo.length) undo.pop()!();
  document.body.innerHTML = '';
});

function makeGrid(): OpenGrid {
  const el = document.createElement('div');
  el.style.width = '400px';
  el.style.height = '200px';
  document.body.appendChild(el);
  const g = new OpenGrid(el, { columns: [{ field: 'name', header: '이름', width: 120 }], height: 200 });
  g.setData([{ name: 'kim' }]);
  return g;
}
const upper = (orig: any, r: number, f: string) => String(orig(r, f)).toUpperCase();

describe('OpenGrid.addDefaultOverride', () => {
  it('T3-01·T3-09 등록하면 새 그리드에 적용되고, 되돌리는 함수를 돌려준다', () => {
    const off = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    undo.push(off);
    expect(typeof off).toBe('function');
    const g = makeGrid();
    expect(g.getDisplayValue(0, 'name')).toBe('KIM');
    g.destroy();
  });

  it('T3-02 되돌린 뒤 만든 그리드에는 적용되지 않는다', () => {
    const off = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    off();
    const g = makeGrid();
    expect(g.hasOverride('getDisplayValue')).toBe(false);
    expect(g.getDisplayValue(0, 'name')).toBe('kim');
    g.destroy();
  });

  it('T3-03 두 번 불러도 탈이 없고 다른 등록은 그대로다', () => {
    const offA = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    const offB = OpenGrid.addDefaultOverride('getDisplayValue', (orig: any, r: number, f: string) => `[${orig(r, f)}]`);
    undo.push(offB);
    offA();
    expect(() => offA()).not.toThrow();
    const g = makeGrid();
    expect(g.getDisplayValue(0, 'name')).toBe('[kim]');
    g.destroy();
  });

  it('T3-04 같은 함수를 두 번 걸면 되돌리기도 하나씩', () => {
    const off1 = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    const off2 = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    undo.push(off2);
    off1();
    const g = makeGrid();
    expect(g.getDisplayValue(0, 'name')).toBe('KIM'); // 남은 한 벌이 적용
    g.destroy();
  });

  it('T3-05 A 만 되돌리면 B 는 새 그리드에 남는다', () => {
    const offA = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    const offB = OpenGrid.addDefaultOverride('getData', (orig: any, ...a: any[]) => orig(...a));
    undo.push(offB);
    offA();
    const g = makeGrid();
    expect(g.hasOverride('getDisplayValue')).toBe(false);
    expect(g.hasOverride('getData')).toBe(true);
    g.destroy();
  });

  it('T3-06 이미 만든 그리드에는 영향이 없다', () => {
    const off = OpenGrid.addDefaultOverride('getDisplayValue', upper);
    const g = makeGrid();
    off();
    expect(g.getDisplayValue(0, 'name')).toBe('KIM');
    g.destroy();
  });
});

describe('OpenGrid.addDefaultStrategy', () => {
  it('T3-07 등록하면 적용, 되돌리면 새 그리드는 폴백', () => {
    const off = OpenGrid.addDefaultStrategy('summaryOp', () => 'GLOBAL');
    const g1 = makeGrid();
    expect(g1.getStrategy('summaryOp', () => 'fb')()).toBe('GLOBAL');
    off();
    const g2 = makeGrid();
    expect(g2.getStrategy('summaryOp', () => 'fb')()).toBe('fb');
    g1.destroy(); g2.destroy();
  });
});

describe('호환 — 기존 체이닝 메서드', () => {
  it('T3-08 defaultOverride·defaults.strategy 는 여전히 OpenGrid 를 돌려주고 이어 부를 수 있다', () => {
    // 옛 메서드는 반환값·동작이 그대로인지만 본다.
    const before = makeGrid();
    const hadBefore = before.hasOverride('getDisplayValue');
    before.destroy();
    expect(hadBefore).toBe(false);

    const ret1 = OpenGrid.defaultOverride('getDisplayValue', upper);
    const ret2 = OpenGrid.defaults.strategy('summaryOp', () => 'CHAIN');
    expect(ret1).toBe(OpenGrid);
    expect(ret2).toBe(OpenGrid);
    const g = makeGrid();
    expect(g.getDisplayValue(0, 'name')).toBe('KIM');
    expect(g.getStrategy('summaryOp', () => 'fb')()).toBe('CHAIN');
    g.destroy();
    // 옛 메서드는 되돌리는 함수가 없다 — 이 파일의 다른 테스트에 새지 않게 private 배열을 비운다(이유: 옛 API 에는 해제 수단이 없음).
    (OpenGrid as any)._defaultOverrides.length = 0;
    (OpenGrid as any)._defaultStrategies.length = 0;
  });
});
