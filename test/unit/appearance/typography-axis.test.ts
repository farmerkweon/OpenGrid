/**
 * SPEC §2.1·§2.4·§2.6 — 타이포그래피 제5축 유닛 테스트(jsdom).
 *
 * 검증 축:
 *  1) 이름공간 9개 정확성 — --og-font-size/--og-line-height 는 density 소유라 들어 있으면 안 된다.
 *  2) 축 오염 거부 — 색/형태/밀도/질감 토큰이 오면 throw(4축 대칭).
 *  3) default — 빈 델타 + 속성 미부착(byte-identical).
 *  4) 정직 가드 2종 — 음수 자간 × CJK → normal 클램프+경고 / url()·@font-face → throw.
 *  5) 내장 프리셋 7종이 전부 유효 델타.
 *  6) 플러그인 표면 — applyTypography 요소 경로(속성) / 그리드 경로(변수 + 제약 경고).
 *
 * ⚠ 유닛으로는 검증할 수 없는 것(SPEC §5.2): jsdom 은 폰트를 로드하지 않는다. 서체 폴백이 실제로
 *   어느 face 로 떨어지는지, tabular-nums/slashed-zero 가 글리프에 먹는지는 실브라우저 몫이다.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TypographyRegistry,
  typographyRegistry,
  TYPOGRAPHY_TOKENS,
  TYPOGRAPHY_ATTR,
  assertTypographyOnly,
  BUILTIN_TYPOGRAPHIES,
} from '../../../src/core/appearance/TypographyRegistry.js';
import {
  applyTypography,
  defineTypography,
  listTypography,
  TYPOGRAPHY_PRESETS,
} from '../../../src/typography/index.js';
import { assertColorOnly } from '../../../src/core/appearance/ThemeMetaRegistry.js';

describe('SPEC §2.1 TYPOGRAPHY_TOKENS — 소유 토큰 9개, 밀도 토큰 불가침', () => {
  it('정확히 9개이며 SPEC §2.1 목록과 일치', () => {
    expect(TYPOGRAPHY_TOKENS.size).toBe(9);
    for (const t of [
      '--og-font-family', '--og-font-weight', '--og-letter-spacing',
      '--og-header-font-family', '--og-header-font-weight', '--og-header-letter-spacing',
      '--og-font-variant-numeric', '--og-num-font-family', '--og-prose-line-height',
    ]) expect(TYPOGRAPHY_TOKENS.has(t)).toBe(true);
  });

  it('--og-font-size / --og-line-height 는 density 소유 — 이름공간에 없다', () => {
    expect(TYPOGRAPHY_TOKENS.has('--og-font-size')).toBe(false);
    expect(TYPOGRAPHY_TOKENS.has('--og-line-height')).toBe(false);
  });
});

describe('SPEC §2.4 assertTypographyOnly — 축 오염 거부(4축 대칭)', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['밀도', '--og-font-size', /밀도/],
    ['밀도', '--og-density-row-height', /밀도/],
    ['질감', '--og-texture-bg', /질감/],
    ['형태', '--og-radius-md', /형태/],
    ['형태', '--og-elevation-sm', /형태/],
    ['색', '--og-primary', /색/],
  ];
  for (const [axis, token, msg] of cases) {
    it(`${axis} 토큰 "${token}" 유입 → throw`, () => {
      expect(() => assertTypographyOnly('x', { [token]: 'v' })).toThrow(msg);
      expect(() => new TypographyRegistry().define('x', { [token]: 'v' })).toThrow(/타이포 축 이름공간이 아닙니다/);
    });
  }

  it('정상 델타는 통과', () => {
    expect(() => assertTypographyOnly('ok', { '--og-font-weight': '500' })).not.toThrow();
  });

  it('역방향 대칭 — 타이포 토큰이 색 델타로 밀수되면 assertColorOnly 가 throw', () => {
    expect(() => assertColorOnly('t', { '--og-font-family': 'Arial' })).toThrow();
  });
});

describe('SPEC §2.4 default — 빈 델타 + 속성 미부착(byte-identical)', () => {
  it("resolve('default') 는 빈 토큰·attr 없음", () => {
    const r = typographyRegistry.resolve('default');
    expect(r.tokens).toEqual({});
    expect(r.attr).toBeUndefined();
    expect(r.requiresRelayout).toBeUndefined();
  });

  it("'default' 는 등록 목록에 없다", () => {
    expect(typographyRegistry.has('default')).toBe(false);
  });

  it('미등록 id 는 never-throw 폴백(빈 델타)', () => {
    expect(typographyRegistry.resolve('없는프리셋').tokens).toEqual({});
    expect(typographyRegistry.resolve('없는프리셋').attr).toBeUndefined();
  });
});

describe('SPEC §2.4 정직 가드 2종', () => {
  it('웹폰트 선언(url()) → throw — 무다운로드 보증', () => {
    const reg = new TypographyRegistry();
    expect(() => reg.define('web', { '--og-font-family': 'url(https://x/f.woff2), sans-serif' }))
      .toThrow(/웹폰트 선언/);
  });

  it('@font-face 흔적 → throw', () => {
    const reg = new TypographyRegistry();
    expect(() => reg.define('web2', { '--og-num-font-family': '@font-face { src: local(x) }' }))
      .toThrow(/웹폰트 선언/);
  });

  it('음수 자간 × CJK 스택 → normal 클램프 + 경고', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reg = new TypographyRegistry();
    const r = reg.define('tight-ko', {
      '--og-font-family': 'Pretendard, "맑은 고딕", sans-serif',
      '--og-letter-spacing': '-0.02em',
      '--og-header-letter-spacing': '-0.01em',
    });
    expect(r.delta['--og-letter-spacing']).toBe('normal');
    expect(r.delta['--og-header-letter-spacing']).toBe('normal');
    expect(r.warnings.length).toBe(2);
    expect(r.warnings[0]).toMatch(/한글 음절/);
    warn.mockRestore();
  });

  it('음수 자간 × 라틴 전용 스택 → 클램프하지 않는다(정직: CJK 위험이 없으면 손대지 않음)', () => {
    const reg = new TypographyRegistry();
    const r = reg.define('tight-latin', {
      '--og-font-family': 'Inter, Arial, sans-serif',
      '--og-letter-spacing': '-0.02em',
    });
    expect(r.delta['--og-letter-spacing']).toBe('-0.02em');
    expect(r.warnings).toEqual([]);
  });
});

describe('SPEC §2.6 내장 프리셋 7종', () => {
  const IDS = ['ui', 'ledger', 'terminal', 'dense-scan', 'humanist', 'hangul-first', 'cjk-doc'];

  it('7종이 정확히 등록되어 있다', () => {
    expect(BUILTIN_TYPOGRAPHIES.map(([id]) => id)).toEqual(IDS);
    expect(listTypography().sort()).toEqual([...IDS].sort());
    expect(Object.keys(TYPOGRAPHY_PRESETS).sort()).toEqual([...IDS].sort());
  });

  it('전부 유효 델타(이름공간 내 · 웹폰트 없음 · 재등록해도 throw 0)', () => {
    for (const [id, delta] of BUILTIN_TYPOGRAPHIES) {
      expect(() => assertTypographyOnly(id, delta)).not.toThrow();
      for (const k of Object.keys(delta)) expect(TYPOGRAPHY_TOKENS.has(k)).toBe(true);
      expect(JSON.stringify(delta)).not.toMatch(/url\(|@font-face/);
    }
  });

  it('resolve(id) 는 델타 + data-og-typography 속성, relayout 없음(서체는 좌표 불변)', () => {
    for (const id of IDS) {
      const r = typographyRegistry.resolve(id);
      expect(r.attr).toEqual({ name: TYPOGRAPHY_ATTR, value: id });
      expect(r.requiresRelayout).toBeUndefined();
      expect(Object.keys(r.tokens).length).toBeGreaterThan(0);
    }
  });

  it('ledger·terminal 은 오독 차단용 slashed-zero 를 켠다', () => {
    expect(TYPOGRAPHY_PRESETS['ledger']!['--og-font-variant-numeric']).toContain('slashed-zero');
    expect(TYPOGRAPHY_PRESETS['terminal']!['--og-font-variant-numeric']).toContain('slashed-zero');
  });

  it('humanist 만 헤더 서체를 분리한다', () => {
    const withHeaderFamily = BUILTIN_TYPOGRAPHIES
      .filter(([, d]) => d['--og-header-font-family'] != null)
      .map(([id]) => id);
    expect(withHeaderFamily).toEqual(['humanist']);
  });
});

describe('SPEC §2.6 플러그인 표면 — applyTypography 두 경로', () => {
  it('요소 경로 — 속성만 붙인다(인라인 토큰 없음: 복합 셀렉터 보정을 덮지 않기 위해)', () => {
    const el = document.createElement('div');
    const r = applyTypography(el, 'ledger');
    expect(r.mode).toBe('element');
    expect(r.warnings).toEqual([]);
    expect(el.getAttribute(TYPOGRAPHY_ATTR)).toBe('ledger');
    expect(el.style.getPropertyValue('--og-font-family')).toBe('');
  });

  it("요소 경로 — 'default' 는 속성을 제거한다(축 해제)", () => {
    const el = document.createElement('div');
    applyTypography(el, 'ui');
    applyTypography(el, 'default');
    expect(el.hasAttribute(TYPOGRAPHY_ATTR)).toBe(false);
  });

  it('그리드 경로 — 공개 setThemeVar 로 변수 주입 + 속성 미부착 제약을 경고로 알린다', () => {
    const vars: Record<string, string> = {};
    const grid = { setThemeVar: (k: string, v: string) => { vars[k] = v; } };
    const r = applyTypography(grid, 'hangul-first');
    expect(r.mode).toBe('grid-vars');
    expect(vars['--og-font-family']).toContain('Pretendard');
    // 이전 프리셋 잔재 제거를 위해 9개 토큰을 먼저 빈 값으로 리셋한다.
    expect(Object.keys(vars).length).toBe(TYPOGRAPHY_TOKENS.size);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/:lang\(\)|복합 셀렉터/);
  });

  it('미등록 id → 정직 경고(조용한 무동작 금지)', () => {
    const el = document.createElement('div');
    const r = applyTypography(el, 'nope');
    expect(r.warnings[0]).toMatch(/등록되어 있지 않습니다/);
    expect(el.hasAttribute(TYPOGRAPHY_ATTR)).toBe(false);
  });

  it('target 이 요소도 그리드도 아니면 throw', () => {
    expect(() => applyTypography({} as never, 'ui')).toThrow(/HTMLElement/);
  });

  it('defineTypography — 사용자 프리셋 등록 후 resolve 가능', () => {
    defineTypography('brand-x', { '--og-font-family': '"Brand Sans", sans-serif', '--og-font-weight': '450' });
    expect(typographyRegistry.resolve('brand-x').tokens['--og-font-weight']).toBe('450');
    expect(() => defineTypography('bad-x', { '--og-font-size': '11px' })).toThrow(/밀도/);
  });
});
