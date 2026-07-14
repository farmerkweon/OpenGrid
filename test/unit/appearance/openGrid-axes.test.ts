/**
 * DD-11 S2b — OpenGrid 파사드의 외관 신규축(밀도·질감) additive 공개 API 유닛 테스트(jsdom).
 *
 * 검증 축:
 *  1) setDensity(name) → data-og-density 속성 + --og-density-* 토큰(+ 미러된 --og-row-height).
 *  2) setTexture(name) → data-og-texture 속성 + --og-texture-* 토큰(relayout 없음).
 *  3) default/미지정 → 신규 attr 없음(byte-identical). 미등록 name → never-throw.
 *  4) 신규 축이 기존 theme/skin 축과 직교 공존(density 설정이 data-og-theme 를 건드리지 않음).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
});

function makeContainer(): HTMLElement {
  const c = document.createElement('div');
  c.style.width = '600px'; c.style.height = '400px';
  c.getBoundingClientRect = () => ({ width:600, height:400, top:0, left:0, right:600, bottom:400, x:0, y:0, toJSON(){return {};} }) as DOMRect;
  document.body.appendChild(c);
  return c;
}

function makeGrid(opts: Record<string, any> = {}): { grid: OpenGrid; c: HTMLElement } {
  const c = makeContainer();
  const grid = new OpenGrid(c, {
    data: [ { a: 1, b: 'x' }, { a: 2, b: 'y' } ],
    columns: [
      { field: 'a', header: 'A', width: 100, type: 'number' },
      { field: 'b', header: 'B', width: 120 },
    ],
    ...opts,
  });
  return { grid, c };
}

describe('DD-11 S2b — OpenGrid 외관 신규축 additive API', () => {
  it('setDensity(compact) → data-og-density + --og-density-* 토큰 + --og-row-height 미러', () => {
    const { grid, c } = makeGrid();
    grid.setDensity('compact');
    expect(c.getAttribute('data-og-density')).toBe('compact');
    expect(c.style.getPropertyValue('--og-density-row-height')).toBe('28px');
    // 행높이 브리지: base.css 소비 토큰으로 미러되었는지.
    expect(c.style.getPropertyValue('--og-row-height')).toBe('28px');
  });

  it('setTexture(linen) → data-og-texture + --og-texture-* 토큰', () => {
    const { grid, c } = makeGrid();
    grid.setTexture('linen');
    expect(c.getAttribute('data-og-texture')).toBe('linen');
    expect(c.style.getPropertyValue('--og-texture-opacity')).toBe('0.06');
    expect(c.style.getPropertyValue('--og-texture-bg')).not.toBe('');
  });

  it('default(옵션 미지정) → 신규 axis attr 없음(byte-identical)', () => {
    const { c } = makeGrid();
    expect(c.hasAttribute('data-og-density')).toBe(false);
    expect(c.hasAttribute('data-og-texture')).toBe(false);
    expect(c.style.getPropertyValue('--og-density-row-height')).toBe('');
    expect(c.style.getPropertyValue('--og-texture-opacity')).toBe('');
  });

  it("setDensity('default') → attr 제거 + 밀도 토큰 리셋(byte-identical 복귀)", () => {
    const { grid, c } = makeGrid();
    grid.setDensity('compact');
    grid.setDensity('default');
    expect(c.hasAttribute('data-og-density')).toBe(false);
    expect(c.style.getPropertyValue('--og-density-row-height')).toBe('');
    expect(c.style.getPropertyValue('--og-row-height')).toBe('');
  });

  it('미등록 name → throw 안 함(never-throw, 빈 델타 폴백)', () => {
    const { grid, c } = makeGrid();
    expect(() => grid.setDensity('no-such-density')).not.toThrow();
    expect(() => grid.setTexture('no-such-texture')).not.toThrow();
    // 미등록은 default 취급 → attr 없음.
    expect(c.hasAttribute('data-og-density')).toBe(false);
    expect(c.hasAttribute('data-og-texture')).toBe(false);
  });

  it('밀도·질감이 기존 theme/skin 축과 직교 공존(density 가 theme attr 무교란)', () => {
    const { grid, c } = makeGrid({ theme: 'dark', skin: 'default' });
    const themeBefore = c.getAttribute('data-og-theme');
    const skinBefore = c.getAttribute('data-og-skin');
    grid.setDensity('comfortable');
    grid.setTexture('graph');
    expect(c.getAttribute('data-og-theme')).toBe(themeBefore);
    expect(c.getAttribute('data-og-skin')).toBe(skinBefore);
    expect(c.getAttribute('data-og-density')).toBe('comfortable');
    expect(c.getAttribute('data-og-texture')).toBe('graph');
  });

  it('생성자 옵션(density/texture) → mount 시 자동 적용', () => {
    const { c } = makeGrid({ density: 'spacious', texture: 'linen' });
    expect(c.getAttribute('data-og-density')).toBe('spacious');
    expect(c.style.getPropertyValue('--og-row-height')).toBe('40px');
    expect(c.getAttribute('data-og-texture')).toBe('linen');
  });
});
