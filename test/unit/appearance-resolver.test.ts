/**
 * R12a — AppearanceResolver (스타일 해결 단일 초크포인트) 특성화 + 유닛 테스트.
 *
 * 목적 두 가지:
 *  1) [특성화 / 행동보존] 렌더 레이어의 형태 결정을 resolver 로 경유시킨 뒤에도, 대표 헤더/셀의
 *     인라인 `style.cssText` 가 **변경 전(pre-change) 골든과 byte-identical** 인지 검증.
 *     골든 문자열은 리팩터 착수 전 현행 코드에서 그대로 캡처했다(공백·순서 포함). 한 글자라도
 *     달라지면(예: resolver 반환 오탈자) 실패한다 = 15색 테마 시각 회귀 방지 가드.
 *  2) [유닛] resolver 메서드가 오늘의 리터럴과 동일 문자열을 반환하고, HANMS 하드 불변식
 *     (focus 최소 2px, state 보더 solid)이 성립하는지 검증.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { AppearanceResolver, ThemeContext, defaultAppearance } from '../../src/core/AppearanceResolver.js';

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

function makeGrid(): HTMLElement {
  const c = makeContainer();
  new OpenGrid(c, {
    rowNumber: true, checkColumn: true, stateColumn: true,
    data: [ { a: 1, b: 'x', c: 10 }, { a: 2, b: 'y', c: 20 } ],
    columns: [
      { field: 'a', header: 'A', width: 100, type: 'number' },
      { field: 'b', header: 'B', width: 120 },
      { field: 'c', header: 'C', width: 100 },
    ],
  });
  return c;
}

// ─── 변경 전(pre-change) 캡처 골든 (jsdom cssText 직렬화, 공백·순서 그대로) ───
const GOLDEN_HEADER_DIV =
  'flex-shrink: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; border: 0px; background: var(--og-header-bg,#f5f5f5);';
const GOLDEN_LEAF_TH =
  'width: 100px; min-width: 100px; padding: 4px 8px; box-sizing: border-box; background: var(--og-header-bg); ' +
  'color: var(--og-header-color); line-height: normal; vertical-align: middle; font-size: var(--og-font-size); ' +
  'text-align: center; border-top: 0px; border-left: 0px; border-right: 1px solid var(--og-border-color,#e0e0e0); ' +
  'border-bottom: 1px solid var(--og-border-color,#e0e0e0); user-select: none; cursor: pointer; white-space: nowrap; ' +
  'overflow: hidden; text-overflow: ellipsis; word-break: normal; position: relative;';
const GOLDEN_EXTRA_TH =
  'width: 24px; min-width: 24px; text-align: center; border-right: 1px solid var(--og-border-color,#e0e0e0); ' +
  'border-bottom: 1px solid var(--og-border-color,#e0e0e0); border-top: 0px; border-left: 0px; line-height: normal; ' +
  'vertical-align: middle; padding: 0px; font-size: 11px; color: rgb(153, 153, 153); user-select: none; ' +
  'box-sizing: border-box; background: var(--og-header-bg,#f5f5f5);';

describe('AppearanceResolver — 특성화(byte-identical 렌더)', () => {
  it('헤더 wrapper div 의 cssText 가 변경 전 골든과 정확히 동일', () => {
    const c = makeGrid();
    const headerDiv = c.querySelector('.og-header') as HTMLElement;
    expect(headerDiv.style.cssText).toBe(GOLDEN_HEADER_DIV);
  });

  it('leaf 데이터 헤더 th 의 cssText 가 변경 전 골든과 정확히 동일(보더 문자열 포함)', () => {
    const c = makeGrid();
    const leafTh = c.querySelector('.og-header-cell:not(.og-extra-col)') as HTMLElement;
    expect(leafTh.style.cssText).toBe(GOLDEN_LEAF_TH);
  });

  it('extra 컬럼(stateColumn) th 의 cssText 가 변경 전 골든과 정확히 동일', () => {
    const c = makeGrid();
    const extraTh = c.querySelector('.og-header-cell.og-extra-col') as HTMLElement;
    expect(extraTh.style.cssText).toBe(GOLDEN_EXTRA_TH);
  });
});

describe('AppearanceResolver — 유닛(리터럴 동치)', () => {
  const ap = new AppearanceResolver(new ThemeContext('default'));

  it('border() 는 오늘의 셀 가장자리 리터럴과 동일', () => {
    expect(ap.border()).toBe('1px solid var(--og-border-color,#e0e0e0)');
  });

  it('divider() 는 border() 와 동일(오늘 구획선 = 셀 보더)', () => {
    expect(ap.divider()).toBe('1px solid var(--og-border-color,#e0e0e0)');
    expect(ap.divider()).toBe(ap.border());
  });

  it('radius(px) 는 패스스루 `${px}px`', () => {
    expect(ap.radius(3)).toBe('3px');
    expect(ap.radius(5)).toBe('5px');
    expect(ap.radius(9)).toBe('9px');
    expect(ap.radius(12)).toBe('12px');
    expect(defaultAppearance.radius(4)).toBe('4px');
  });

  it('cellPadding() 은 오늘의 그룹/데이터 셀 인라인 패딩과 동일', () => {
    expect(ap.cellPadding()).toBe('2px 8px');
  });

  it('context 는 주입된 ThemeContext 를 노출', () => {
    expect(ap.context.theme).toBe('default');
    expect(ap.context.skin).toBe('default');
  });
});

describe('AppearanceResolver — HANMS 하드 불변식(스킨 없어 현재 no-op)', () => {
  const ap = new AppearanceResolver();

  it('focusRing(): width<2 는 2px 로 클램프', () => {
    expect(ap.focusRing({ width: 1 }).startsWith('2px ')).toBe(true);
    expect(ap.focusRing({ width: 0 }).startsWith('2px ')).toBe(true);
  });

  it('focusRing(): style:"none" 은 solid 로 대체', () => {
    expect(ap.focusRing({ style: 'none' }).includes(' solid ')).toBe(true);
    expect(ap.focusRing({ style: 'none' }).includes('none')).toBe(false);
  });

  it('focusRing(): 기본은 2px solid 가시 링', () => {
    expect(ap.focusRing()).toBe('2px solid var(--og-focus-border,var(--og-primary,#1976d2))');
  });

  it('border({state:true}): 상태 보더는 dashed 요청도 solid 강제(G-ST2)', () => {
    expect(ap.border({ state: true, style: 'dashed' })).toBe('1px solid var(--og-border-color,#e0e0e0)');
  });

  it('elevation(): 형태 geometry + shadow-ink/alpha 토큰 seam 노출(라우팅 0, 참조용)', () => {
    const md = ap.elevation('md');
    expect(md).toContain('var(--og-elevation-md, 0 2px 6px)');
    expect(md).toContain('var(--og-shadow-ink, 0 0 0)');
    expect(md).toContain('var(--og-elevation-alpha-md, 0.10)');
  });
});
