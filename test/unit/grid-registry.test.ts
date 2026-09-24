/**
 * OpenGrid.instancesIn(el) / OpenGrid.destroyAllIn(el) — 요소 안의 그리드 찾기·파괴.
 *
 * Find and destroy the grids mounted inside an element.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { document.body.innerHTML = ''; });

const columns = [{ field: 'name', header: '이름', width: 120 }];

function box(parent: Element = document.body): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '400px';
  el.style.height = '200px';
  parent.appendChild(el);
  return el;
}
const grid = (el: HTMLElement) => new OpenGrid(el, { columns, height: 200 });

describe('OpenGrid.instancesIn', () => {
  it('T2-01 무대 안 자손 그리드를 문서 순서로 모은다', () => {
    const stage = box();
    const a = grid(box(stage));
    const b = grid(box(stage));
    expect(OpenGrid.instancesIn(stage)).toEqual([a, b]);
    a.destroy(); b.destroy();
  });

  it('T2-02 그리드 컨테이너 자체를 넘기면 그 그리드', () => {
    const el = box();
    const g = grid(el);
    expect(OpenGrid.instancesIn(el)).toEqual([g]);
    g.destroy();
  });

  it('T2-03 그리드가 없으면 빈 배열', () => {
    expect(OpenGrid.instancesIn(box())).toEqual([]);
  });

  it('T2-04 무대 밖 그리드는 잡지 않는다', () => {
    const stage = box();
    const inside = grid(box(stage));
    const outside = grid(box());
    expect(OpenGrid.instancesIn(stage)).toEqual([inside]);
    inside.destroy(); outside.destroy();
  });

  it('T2-06 직접 destroy 한 그리드는 빠진다', () => {
    const stage = box();
    const a = grid(box(stage));
    const b = grid(box(stage));
    a.destroy();
    expect(OpenGrid.instancesIn(stage)).toEqual([b]);
    b.destroy();
  });
});

describe('OpenGrid.destroyAllIn', () => {
  it('T2-05 무대 안 그리드를 모두 파괴한다', () => {
    const stage = box();
    const elA = box(stage);
    const elB = box(stage);
    grid(elA); grid(elB);
    OpenGrid.destroyAllIn(stage);
    for (const el of [elA, elB]) {
      expect(el.classList.contains('og-container')).toBe(false);
      expect(el.innerHTML).toBe('');
    }
    expect(OpenGrid.instancesIn(stage)).toEqual([]);
  });

  it('T2-07 같은 요소에 두 번 만든 그리드도 둘 다 찾아 파괴한다', () => {
    const el = box();
    const first = grid(el);
    const second = grid(el);
    expect(OpenGrid.instancesIn(el)).toEqual([first, second]);
    OpenGrid.destroyAllIn(el);
    expect(first.listenerCount('cellClick')).toBe(0);
    expect(second.listenerCount('cellClick')).toBe(0);
    expect(OpenGrid.instancesIn(el)).toEqual([]);
  });

  it('T2-08 두 번 불러도 오류가 없다', () => {
    const stage = box();
    grid(box(stage));
    OpenGrid.destroyAllIn(stage);
    expect(() => OpenGrid.destroyAllIn(stage)).not.toThrow();
  });

  it('T2-09 파괴 뒤 옵션 콜백·구독이 남지 않는다', () => {
    const el = box();
    const g = new OpenGrid(el, { columns, height: 200, onCellClick: () => {} });
    g.on('dataChange', () => {});
    OpenGrid.destroyAllIn(el);
    expect(g.listenerCount('cellClick')).toBe(0);
    expect(g.listenerCount('dataChange')).toBe(0);
  });
});

describe('destroyAllIn — 견고성', () => {
  it('T2-10 한 그리드의 destroy 가 던져도 나머지는 끝까지 정리하고, 그 예외를 던진다', () => {
    const stage = box();
    const bad = grid(box(stage));
    const goodEl = box(stage);
    grid(goodEl);
    const boom = new Error('boom');
    const realDestroy = bad.destroy;
    bad.destroy = () => { throw boom; };
    expect(() => OpenGrid.destroyAllIn(stage)).toThrow(boom);
    expect(goodEl.classList.contains('og-container')).toBe(false);
    bad.destroy = realDestroy;
    bad.destroy();
  });

  it('T2-11 같은 요소의 두 그리드 중 하나만 destroy 해도 남은 쪽을 자손 검색으로 찾는다', () => {
    const stage = box();
    const el = box(stage);
    const first = grid(el);
    const second = grid(el);
    first.destroy();
    expect(OpenGrid.instancesIn(stage)).toEqual([second]);
    second.destroy();
    expect(el.classList.contains('og-container')).toBe(false);
  });
});
