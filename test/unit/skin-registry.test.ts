/**
 * R12b — SkinRegistry + data-og-skin(FORM 축) 소비 테스트.
 *
 * 검증:
 *  1) [byte-identical] 스킨 미설정(default)에서 resolver 는 R12a 와 동일 문자열을 반환(회귀 0).
 *  2) [FORM 토큰] 내장 스킨(HANMS 6종)이 자신의 form 토큰을 담고, Neumorph 는 기본 카탈로그에 없다.
 *  3) [FORM-only 검증] 스킨 델타에 색 리터럴이 있으면 define/registerBuiltin 이 throw(색⊥형태).
 *  4) [가드레일] focus <2px/none 클램프, 상태 보더는 스킨과 무관하게 solid(G-ST2), 텍스처 존 제한(G-ST1).
 *  5) [축 배선] setSkin/getSkin 이 data-og-skin 을 설정하고 resolver 컨텍스트를 갈아끼운다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { AppearanceResolver, ThemeContext } from '../../src/core/AppearanceResolver.js';
import {
  SkinRegistry, skinRegistry, assertFormOnly, applyGuardrails, BUILTIN_SKINS,
} from '../../src/core/SkinRegistry.js';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
});

function makeGrid(opts: any = {}) {
  const c = document.createElement('div');
  c.style.width = '600px'; c.style.height = '400px';
  c.getBoundingClientRect = () => ({ width:600, height:400, top:0, left:0, right:600, bottom:400, x:0, y:0, toJSON(){return {};} }) as DOMRect;
  document.body.appendChild(c);
  const g = new OpenGrid(c, {
    data: [{ a: 1, b: 'x' }, { a: 2, b: 'y' }],
    columns: [{ field: 'a', header: 'A', width: 100 }, { field: 'b', header: 'B', width: 120 }],
    ...opts,
  });
  return { grid: g, el: c };
}

// ─── 1) default byte-identical ─────────────────────────────
describe('R12b — default(스킨 없음) byte-identical', () => {
  const ap = new AppearanceResolver(new ThemeContext('default', 'default'));

  it('border() 는 R12a 리터럴과 동일', () => {
    expect(ap.border()).toBe('1px solid var(--og-border-color,#e0e0e0)');
  });
  it('divider() 는 border() 와 동일', () => {
    expect(ap.divider()).toBe('1px solid var(--og-border-color,#e0e0e0)');
  });
  it('focusRing() 는 R12a 리터럴과 동일', () => {
    expect(ap.focusRing()).toBe('2px solid var(--og-focus-border,var(--og-primary,#1976d2))');
  });
  it('그리드 mount 시 data-og-skin="default" (매칭 CSS 블록 없음 → 폴백)', () => {
    const { el, grid } = makeGrid();
    expect(el.getAttribute('data-og-skin')).toBe('default');
    expect(grid.getSkin()).toBe('default');
    grid.destroy();
  });
});

// ─── 2) 스킨 활성 시 form 토큰 var() 승격 ────────────────────
describe('R12b — 스킨 활성 → form 토큰 var() 로 승격', () => {
  const sharp = new AppearanceResolver(new ThemeContext('default', 'sharp'));
  it('border() 가 border-width/style 토큰을 참조', () => {
    expect(sharp.border()).toBe('var(--og-border-width, 1px) var(--og-border-style, solid) var(--og-border-color,#e0e0e0)');
  });
  it('divider() 가 divider-style 토큰을 참조', () => {
    expect(sharp.divider()).toBe('var(--og-border-width, 1px) var(--og-divider-style, solid) var(--og-border-color,#e0e0e0)');
  });
  it('focusRing() 가 focus-width/style 토큰을 참조', () => {
    expect(sharp.focusRing()).toBe('var(--og-focus-width, 2px) var(--og-focus-style, solid) var(--og-focus-border,var(--og-primary,#1976d2))');
  });
});

// ─── 3) 내장 카탈로그 (HANMS 6종, Neumorph 컷) ───────────────
describe('R12b — 내장 스킨 카탈로그(HANMS 판정)', () => {
  it('기본 카탈로그 = Sharp/Rounded/Stitch/Flat/High-Contrast/Material 6종', () => {
    const ids = skinRegistry.list();
    for (const id of ['sharp', 'rounded', 'stitch', 'flat', 'high-contrast', 'material']) {
      expect(ids).toContain(id);
    }
    expect(BUILTIN_SKINS.length).toBe(6);
  });
  it('Neumorph 는 기본 카탈로그에서 컷(HANMS §1.3)', () => {
    expect(skinRegistry.has('neumorph')).toBe(false);
    expect(skinRegistry.list()).not.toContain('neumorph');
  });
  it('내장 스킨 델타는 FORM 토큰만 담는다(색 0)', () => {
    for (const [id, delta] of BUILTIN_SKINS) {
      expect(() => assertFormOnly(id, delta)).not.toThrow();
    }
  });
  it('Sharp 델타는 radius 0 / miter icon 등 form 값을 담는다', () => {
    const s = skinRegistry.get('sharp')!;
    expect(s['--og-radius-md']).toBe('0');
    expect(s['--og-icon-corner']).toBe('miter');
  });
});

// ─── 4) FORM-only 검증 (색 리터럴 거부) ─────────────────────
describe('R12b — FORM-only 검증(색⊥형태 직교성)', () => {
  it('hex 색은 거부', () => {
    expect(() => assertFormOnly('bad', { '--og-border-style': '#ff0000' } as any)).toThrow(/색/);
  });
  it('rgb() 리터럴은 거부', () => {
    expect(() => assertFormOnly('bad', { '--og-elevation-md': 'rgb(0,0,0)' } as any)).toThrow(/색/);
  });
  it('named color 는 거부', () => {
    expect(() => assertFormOnly('bad', { '--og-border-style': 'red' } as any)).toThrow(/색/);
  });
  it('FORM 토큰이 아닌 키(색 토큰)는 거부', () => {
    expect(() => assertFormOnly('bad', { '--og-primary': '4px' } as any)).toThrow(/FORM/);
  });
  it('rgba(var(--og-*-ink), …) 색 참조는 허용(Rule 2)', () => {
    expect(() => assertFormOnly('ok', {
      '--og-texture-bg': 'repeating-linear-gradient(45deg, rgba(var(--og-texture-ink),0.04) 0 2px, transparent 2px 6px)',
    })).not.toThrow();
  });
  it('define() 색 델타는 throw', () => {
    const r = new SkinRegistry();
    expect(() => r.define('bad', { '--og-border-style': '#123456' } as any)).toThrow();
  });
});

// ─── 5) 가드레일 (focus 클램프 · 상태보더 solid · 텍스처 존) ──
describe('R12b — HANMS 가드레일(불변식)', () => {
  it('focus-width < 2px 는 2px 로 클램프 + 경고', () => {
    const { delta, warnings } = applyGuardrails('x', { '--og-focus-width': '1px' });
    expect(delta['--og-focus-width']).toBe('2px');
    expect(warnings.length).toBeGreaterThan(0);
  });
  it('focus-style: none 은 solid 로 클램프', () => {
    const { delta } = applyGuardrails('x', { '--og-focus-style': 'none' });
    expect(delta['--og-focus-style']).toBe('solid');
  });
  it('상태 보더는 스킨(dashed 요청)과 무관하게 solid(G-ST2)', () => {
    const sk = new AppearanceResolver(new ThemeContext('default', 'stitch'));
    // state=true → dashed 요청도 solid; 스킨 활성이어도 상태 보더 스타일은 토큰화하지 않고 solid 고정.
    expect(sk.border({ state: true, style: 'dashed' })).toContain(' solid ');
    expect(sk.border({ state: true, style: 'dashed' })).not.toContain('dashed');
    expect(sk.border({ state: true, style: 'dashed' })).not.toContain('--og-border-style');
  });
  it('G-ST1: 텍스처는 데이터/상태/범위/병합/포커스 셀 뒤 금지(none), 허용 존만 var', () => {
    const sk = new AppearanceResolver(new ThemeContext('default', 'stitch'));
    for (const zone of ['data', 'status', 'range', 'merge', 'focus'] as const) {
      expect(sk.texture(zone)).toBe('none');
    }
    for (const zone of ['container', 'header-pad', 'empty', 'onboarding'] as const) {
      expect(sk.texture(zone)).toBe('var(--og-texture-bg, none)');
    }
  });
  it('defineSkin 이 focus<2px 스킨을 클램프해 등록', () => {
    const res = skinRegistry.define('t-clamp', { '--og-focus-width': '1px', '--og-radius-md': '3px' });
    expect(res.delta['--og-focus-width']).toBe('2px');
    expect(skinRegistry.get('t-clamp')!['--og-focus-width']).toBe('2px');
  });
});

// ─── 6) setSkin / getSkin 배선 ─────────────────────────────
describe('R12b — setSkin/getSkin 배선', () => {
  it('setSkin 이 data-og-skin 을 설정하고 getSkin 이 반영', () => {
    const { grid, el } = makeGrid();
    grid.setSkin('rounded');
    expect(el.getAttribute('data-og-skin')).toBe('rounded');
    expect(grid.getSkin()).toBe('rounded');
    grid.setSkin('default');
    expect(el.getAttribute('data-og-skin')).toBe('default');
    // default 복귀 시 컨테이너 보더는 레거시 문자열(byte-identical)
    expect(el.style.border).toBe('1px solid var(--og-border-color, #e0e0e0)');
    grid.destroy();
  });
  it('생성자 skin 옵션이 mount 에 반영', () => {
    const { grid, el } = makeGrid({ skin: 'material' });
    expect(el.getAttribute('data-og-skin')).toBe('material');
    expect(grid.getSkin()).toBe('material');
    grid.destroy();
  });
  it('setSkinVar 는 색 리터럴을 거부(형태 축 front door)', () => {
    const { grid } = makeGrid();
    expect(() => grid.setSkinVar('--og-border-width', '#fff')).toThrow();
    expect(() => grid.setSkinVar('--og-border-width', '3px')).not.toThrow();
    grid.destroy();
  });
  it('static OpenGrid.defineSkin 이 커스텀 스킨을 등록', () => {
    OpenGrid.defineSkin('my-brand', { '--og-radius-md': '10px', '--og-border-width': '2px' });
    expect(skinRegistry.has('my-brand')).toBe(true);
    expect(skinRegistry.get('my-brand')!['--og-radius-md']).toBe('10px');
  });
});
