// DD-11 §2.1·§2.3·불변식 1~3 — 동형 4축 직교 조합·이름공간 충돌검출·기본 byte-identical 락
import { describe, it, expect } from 'vitest';
import {
  TokenAxis,
  assertNamespace,
  DEFAULT_AXIS_VALUE,
  DensityRegistry,
  densityRegistry,
  DENSITY_TOKENS,
  TOUCH_MIN_PX,
  TextureRegistry,
  textureRegistry,
  TEXTURE_OPACITY_CAP,
  ThemeMetaRegistry,
  assertColorOnly,
  Appearance,
  AppearanceComposer,
  defaultAppearanceRegistrySet,
  type AppearanceRegistrySet,
} from '../../../src/core/appearance/index.js';
import { assertFormOnly } from '../../../src/core/SkinRegistry.js';

function regs(): AppearanceRegistrySet {
  return defaultAppearanceRegistrySet();
}

describe('DD-11 §2.1 IAppearanceAxis/TokenAxis — 자기 이름공간만·default 빈 델타', () => {
  it('default id → 빈 델타 + attr 생략(신설 축 byte-identical)', () => {
    const res = densityRegistry.resolve('default');
    expect(res.tokens).toEqual({});
    expect(res.attr).toBeUndefined();
    expect(res.requiresRelayout).toBeUndefined();
  });

  it('미등록 값 → never-throw 빈 델타(default 취급)', () => {
    expect(() => densityRegistry.resolve('nonexistent')).not.toThrow();
    expect(densityRegistry.resolve('nonexistent').tokens).toEqual({});
  });

  it('named 값 → 델타 + data-* 속성', () => {
    const res = densityRegistry.resolve('compact');
    expect(res.attr).toEqual({ name: 'data-og-density', value: 'compact' });
    expect(res.tokens['--og-density-row-height']).toBe('28px');
  });

  it('assertNamespace — 이름공간 밖 토큰 등록 거부(축 오염)', () => {
    const ax = new TokenAxis({ id: 'density', attrName: 'data-og-density', namespace: DENSITY_TOKENS });
    expect(() => ax.define('bad', { '--og-radius-md': '4px' })).toThrow(/이름공간/);
    expect(() => assertNamespace('density', DENSITY_TOKENS, { '--og-primary': '#f00' })).toThrow();
  });
});

describe('DD-11 불변식 1 — 색⊥형태 양방향 기계강제', () => {
  it('assertFormOnly(기존) — 스킨 델타에 색 리터럴 거부', () => {
    expect(() => assertFormOnly('x', { '--og-radius-md': '#ff0000' })).toThrow();
  });

  it('assertColorOnly(신설) — 테마 델타에 형태 토큰 거부', () => {
    expect(() => assertColorOnly('x', { '--og-radius-md': '4px' })).toThrow(/형태\/밀도\/질감/);
    expect(() => assertColorOnly('x', { '--og-density-row-height': '28px' })).toThrow();
    expect(() => assertColorOnly('x', { '--og-texture-bg': 'none' })).toThrow();
  });

  it('assertColorOnly — 순수 색 토큰은 통과', () => {
    expect(() => assertColorOnly('x', { '--og-primary': '#1976d2', '--og-border-color': '#e0e0e0' })).not.toThrow();
  });

  it('ThemeMetaRegistry.define — shape 토큰 담긴 테마 거부', () => {
    const reg = new ThemeMetaRegistry();
    expect(() => reg.define('bad', { '--og-focus-width': '2px' })).toThrow();
  });
});

describe('DD-11 §2.3 AppearanceComposer — 합(델타 병합) cascade', () => {
  it('기본 외관(4축 default) → byte-identical: tokens={}, theme/skin 속성만, relayout 없음', () => {
    const composer = new AppearanceComposer(regs());
    const c = composer.compose(new Appearance());
    expect(c.tokens).toEqual({});
    expect(c.requiresRelayout).toBe(false);
    // theme·skin 은 오늘도 붙는 속성(유지), density·texture 속성은 생략(신설 축)
    const names = c.attrs.map((a) => a.name);
    expect(names).toContain('data-og-theme');
    expect(names).toContain('data-og-skin');
    expect(names).not.toContain('data-og-density');
    expect(names).not.toContain('data-og-texture');
    expect(c.findings).toEqual([]);
  });

  it('4축 named 조합 → 델타 합·속성 4개·relayout(밀도)', () => {
    const composer = new AppearanceComposer(regs());
    const c = composer.compose(new Appearance('ocean', 'sharp', 'compact', 'linen'));
    const names = c.attrs.map((a) => a.name);
    expect(names).toEqual(['data-og-theme', 'data-og-skin', 'data-og-density', 'data-og-texture']);
    // 밀도 토큰 + 질감 토큰이 서로소로 병합(이름 충돌 0)
    expect(c.tokens['--og-density-row-height']).toBe('28px');
    expect(c.tokens['--og-texture-bg']).toContain('repeating-linear-gradient');
    expect(c.requiresRelayout).toBe(true);
  });

  it('순수성 — 같은 Appearance → 같은 tokens(캐시 안정)', () => {
    const composer = new AppearanceComposer(regs());
    const a = new Appearance('dark', 'flat', 'spacious', 'graph');
    expect(composer.compose(a).tokens).toEqual(composer.compose(a).tokens);
  });

  it('cascade 순서 결정론 — 속성은 theme→skin→density→texture 순', () => {
    const composer = new AppearanceComposer(regs());
    const c = composer.compose(new Appearance('a', 'b', 'compact', 'linen'));
    expect(c.attrs.map((x) => x.value)).toEqual(['a', 'b', 'compact', 'linen']);
  });
});

describe('DD-11 §9.4 DensityRegistry — relayout·터치 클램프', () => {
  it('named 밀도는 requiresRelayout=true', () => {
    expect(densityRegistry.resolve('comfortable').requiresRelayout).toBe(true);
  });

  it('행높이→폰트 동조 파생(28→12 / 36→13 / 40→14)', () => {
    expect(densityRegistry.resolve('compact').tokens['--og-font-size']).toBe('12px');
    expect(densityRegistry.resolve('comfortable').tokens['--og-font-size']).toBe('13px');
    expect(densityRegistry.resolve('spacious').tokens['--og-font-size']).toBe('14px');
  });

  it('터치 부스트 — 44px 하한 클램프 + 경고', () => {
    const reg = new DensityRegistry();
    const r = reg.define('mini-touch', { '--og-density-row-height': '20px' });
    expect(r.delta['--og-density-row-height']).toBe(`${TOUCH_MIN_PX}px`);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('DD-11 §9.3 TextureRegistry — 알파 정직 상한 0.1', () => {
  it('texture-opacity > 0.1 → 0.1 클램프 + 경고', () => {
    const reg = new TextureRegistry();
    const r = reg.define('loud', { '--og-texture-bg': 'none', '--og-texture-opacity': '0.9' });
    expect(r.delta['--og-texture-opacity']).toBe(String(TEXTURE_OPACITY_CAP));
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('내장 질감은 색 리터럴 없이 --og-texture-ink 참조만(색⊥질감)', () => {
    for (const id of ['linen', 'paper-grain', 'graph']) {
      const bg = textureRegistry.resolve(id).tokens['--og-texture-bg'] ?? '';
      expect(bg).not.toMatch(/#[0-9a-fA-F]{3,8}/); // hex 리터럴 0
      if (bg) expect(bg).toContain('--og-texture-ink');
    }
  });

  it('질감은 relayout 을 요구하지 않는다(배경 페인트만)', () => {
    expect(textureRegistry.resolve('linen').requiresRelayout).toBeUndefined();
  });
});
