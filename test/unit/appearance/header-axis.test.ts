/**
 * 헤더 축(제6축) 유닛 — `HeaderAxis` · `applyHeader` · 등록 정책.
 *
 * `typography-axis.test.ts` 와 대칭이되, **헤더 축이 형제 축보다 더 갖는 것**(내장 보호·출처·
 * 플러그인 수명)을 별도로 검증한다. 그 부분이 이번 트랙에서 새로 들어온 구조이기 때문이다.
 *
 * 각 테스트는 「무엇을」이 아니라 **「왜 이게 깨지면 안 되는가」** 를 실패 메시지에 담는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HeaderAxis,
  HEADER_TOKENS,
  HEADER_ATTR,
  assertHeaderOnly,
  headerRegistry,
  BUILTIN_HEADERS,
} from '../../../src/core/appearance/HeaderRegistry.js';
import { applyHeader, HEADER_PRESETS, defineHeader, listHeader } from '../../../src/header/index.js';

const BUILTIN_IDS = ['rule', 'quiet', 'band', 'pill'];

describe('이름공간 — 헤더 축은 형태 8개만 소유한다', () => {
  it('색·타이포그래피 --og-header-* 는 이름공간 밖이다 (접두사가 같다고 같은 축이 아니다)', () => {
    expect(HEADER_TOKENS.size).toBe(8);
    for (const t of HEADER_TOKENS) expect(t.startsWith('--og-header-')).toBe(true);

    // 색 축(theme) 소유 — themes.css 가 선언한다.
    for (const colorToken of ['--og-header-bg', '--og-header-color', '--og-header-hover-bg', '--og-header-sort-color']) {
      expect(HEADER_TOKENS.has(colorToken), colorToken + ' 는 색 축 소유인데 헤더 이름공간에 들어와 있다').toBe(false);
    }
    // 타이포그래피 축(typography) 소유 — TYPOGRAPHY_TOKENS 에 이미 등록돼 있다.
    for (const typoToken of ['--og-header-font-family', '--og-header-font-weight', '--og-header-letter-spacing']) {
      expect(HEADER_TOKENS.has(typoToken), typoToken + ' 는 타이포 축 소유인데 헤더 이름공간에 들어와 있다').toBe(false);
    }
  });

  it('색 토큰을 담은 델타는 throw — 형태 축이 색을 칠하면 불변식 1 이 깨진다', () => {
    expect(() => assertHeaderOnly('bad', { '--og-header-bg': 'red' })).toThrow(/색\(data-og-theme\)/);
    expect(() => assertHeaderOnly('bad', { '--og-header-color': '#fff' })).toThrow(/색 축|색\(data-og-theme\)/);
  });

  it('타이포그래피 토큰을 담은 델타는 throw — 오류 메시지가 진짜 소유 축을 알려준다', () => {
    expect(() => assertHeaderOnly('bad', { '--og-header-font-weight': '700' })).toThrow(/타이포그래피\(data-og-typography\)/);
  });

  it('내장 프리셋 4종은 전부 이름공간을 지킨다', () => {
    for (const [id, delta] of BUILTIN_HEADERS) {
      expect(() => assertHeaderOnly(id, delta), id + ' 가 남의 축 토큰을 담고 있다').not.toThrow();
    }
  });
});

describe('기본값 불변 — default 는 빈 델타에 속성도 안 붙는다', () => {
  it("resolve('default') 는 빈 델타 + attr 없음 (축을 켜도 오늘과 바이트가 같다)", () => {
    const r = headerRegistry.resolve('default');
    expect(r.tokens).toEqual({});
    expect(r.attr, 'default 에 속성이 붙으면 그 자체로 DOM diff 라 골든이 깨진다').toBeUndefined();
    expect(r.requiresRelayout).toBeFalsy();
  });

  it('미등록 id 는 never-throw 폴백으로 default 취급 (형제 축과 같은 계약)', () => {
    const r = headerRegistry.resolve('그런거없음');
    expect(r.tokens).toEqual({});
    expect(r.attr).toBeUndefined();
  });

  it('named 값은 relayout 을 요구하지 않는다 — 머리글 형태는 좌표를 안 바꾼다', () => {
    for (const id of BUILTIN_IDS) {
      expect(headerRegistry.resolve(id).requiresRelayout, id).toBeFalsy();
    }
  });
});

describe('해소 — named 값은 델타 + 속성을 낸다', () => {
  it.each(BUILTIN_IDS)('%s 는 형태 토큰과 data-og-header 를 낸다', (id) => {
    const r = headerRegistry.resolve(id);
    expect(r.attr).toEqual({ name: HEADER_ATTR, value: id });
    expect(Object.keys(r.tokens).length).toBeGreaterThan(0);
    for (const k of Object.keys(r.tokens)) expect(HEADER_TOKENS.has(k), k + ' 는 헤더 소유가 아니다').toBe(true);
  });

  it('list() 에 default 가 섞이지 않는다 — 카탈로그는 「고를 수 있는 것」만 담는다', () => {
    expect(listHeader().sort()).toEqual([...BUILTIN_IDS].sort());
  });

  it('HEADER_PRESETS 는 내장 델타와 같은 것을 본다', () => {
    expect(Object.keys(HEADER_PRESETS).sort()).toEqual([...BUILTIN_IDS].sort());
  });
});

describe('형태 가드 — 조용히 깨지는 값을 등록 시점에 잡는다', () => {
  let ax: HeaderAxis;
  beforeEach(() => { ax = new HeaderAxis(); });

  it('불투명도 > 1 은 1 로 클램프 + 경고 (CSS 가 조용히 자른다)', () => {
    const r = ax.define('x', { '--og-header-hint-opacity': '2.5' });
    expect(r.delta['--og-header-hint-opacity']).toBe('1');
    expect(r.warnings.join()).toMatch(/0~1/);
  });

  it('불투명도 < 0 은 0 으로 클램프 + 경고 (요소가 사라진 것처럼 보인다)', () => {
    const r = ax.define('x', { '--og-header-grip-opacity': '-0.4' });
    expect(r.delta['--og-header-grip-opacity']).toBe('0');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('음수 길이는 0 으로 + 경고 — 브라우저가 선언 전체를 버려 그 줄만 죽는다', () => {
    const r = ax.define('x', { '--og-header-rule-width': '-2px' });
    expect(r.delta['--og-header-rule-width']).toBe('0');
    expect(r.warnings.join()).toMatch(/음수/);
  });

  it('정상 범위는 손대지 않는다 — 가드는 잘못된 값만 만진다', () => {
    const r = ax.define('x', { '--og-header-rule-width': '2px', '--og-header-hint-opacity': '0.45' });
    expect(r.delta).toEqual({ '--og-header-rule-width': '2px', '--og-header-hint-opacity': '0.45' });
    expect(r.warnings).toEqual([]);
  });

  it('calc()/var() 는 통과시킨다 — CSS 가 최종 심판이고 표현식 재구현은 더 큰 결함이다', () => {
    const r = ax.define('x', { '--og-header-pill-inset': 'calc(var(--og-cell-padding) / 2)' });
    expect(r.delta['--og-header-pill-inset']).toBe('calc(var(--og-cell-padding) / 2)');
    expect(r.warnings).toEqual([]);
  });
});

describe('★ 등록 정책 — 헤더 축이 형제 축보다 더 갖는 것 (TypedRegistry 합성)', () => {
  let ax: HeaderAxis;
  beforeEach(() => {
    ax = new HeaderAxis();
    ax.registerBuiltin('rule', { '--og-header-rule-width': '2px' });
  });

  it('내장 프리셋은 조용히 안 덮인다 — 형제 축(생 Map)에는 없는 보호다', () => {
    const before = ax.resolve('rule').tokens;
    const r = ax.define('rule', { '--og-header-rule-width': '99px' });

    expect(r.registration.ok, '내장이 override 없이 교체됐다 — 사용자가 모르는 사이 내장값이 사라진다').toBe(false);
    expect(r.registration.action).toBe('kept');
    expect(ax.resolve('rule').tokens, '거부됐는데 델타는 바뀌었다 — 두 저장소가 갈리면 진단이 거짓말을 한다')
      .toEqual(before);
  });

  it('{ override: true } 면 교체된다 — 의도를 명시하면 통과', () => {
    const r = ax.define('rule', { '--og-header-rule-width': '99px' }, { override: true });
    expect(r.registration.ok).toBe(true);
    expect(ax.resolve('rule').tokens['--og-header-rule-width']).toBe('99px');
  });

  it('새 id 는 그냥 등록된다 — 보호는 내장에만 걸린다', () => {
    const r = ax.define('hairline', { '--og-header-rule-width': '1px' });
    expect(r.registration.ok).toBe(true);
    expect(ax.has('hairline')).toBe(true);
  });

  it('출처(origin)를 기록한다 — 누가 넣었는지 모르면 진단이 안 된다', () => {
    ax.define('mine', { '--og-header-rule-width': '1px' });
    const entries = ax.entries();
    expect(entries.find((e) => e.key === 'rule')?.origin).toBe('builtin');
    expect(entries.find((e) => e.key === 'mine')?.origin).toBe('user');
  });

  it('disposePlugin 은 그 플러그인 것만 뺀다 — 등록의 대칭', () => {
    ax.define('a', { '--og-header-rule-width': '1px' }, { pluginId: 'acme' });
    ax.define('b', { '--og-header-rule-width': '2px' }, { pluginId: 'acme' });
    ax.define('c', { '--og-header-rule-width': '3px' });

    expect(ax.disposePlugin('acme')).toBe(2);
    expect(ax.has('a')).toBe(false);
    expect(ax.has('b')).toBe(false);
    expect(ax.has('c'), '남의 플러그인 것까지 지웠다').toBe(true);
    expect(ax.has('rule'), '내장까지 지웠다').toBe(true);
  });

  it('축 오염은 정책보다 먼저 throw — 오염된 델타는 등록 후보가 아니다', () => {
    expect(() => ax.define('bad', { '--og-header-bg': 'red' })).toThrow();
    expect(ax.entries().some((e) => e.key === 'bad'), '오염됐는데 정책 레지스트리에 자리가 생겼다').toBe(false);
  });
});

describe('applyHeader — DOM 경계. 두 경로의 능력 차이를 정직하게 알린다', () => {
  it('요소 경로: 속성만 붙이고 토큰은 인라인하지 않는다 (인라인은 프리셋 T1 을 덮는다)', () => {
    const el = document.createElement('div');
    const r = applyHeader(el, 'rule');

    expect(r.mode).toBe('element');
    expect(r.warnings).toEqual([]);
    expect(el.getAttribute(HEADER_ATTR)).toBe('rule');
    for (const k of HEADER_TOKENS) {
      expect(el.style.getPropertyValue(k), k + ' 를 인라인했다 — 프리셋 규칙을 덮어버린다').toBe('');
    }
  });

  it("요소 경로 'default' 는 속성을 뗀다 — 축 해제가 실제로 해제한다", () => {
    const el = document.createElement('div');
    applyHeader(el, 'rule');
    applyHeader(el, 'default');
    expect(el.hasAttribute(HEADER_ATTR)).toBe(false);
  });

  it('미등록 id 는 조용히 무동작하지 않고 경고를 돌려준다', () => {
    const el = document.createElement('div');
    const r = applyHeader(el, '그런거없음');
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toMatch(/등록되어 있지 않습니다/);
    expect(el.hasAttribute(HEADER_ATTR)).toBe(false);
  });

  it('그리드 경로: 속성을 못 붙이므로 「사실상 무동작」을 경고한다 (타이포보다 능력차가 크다)', () => {
    const setThemeVar = vi.fn();
    const r = applyHeader({ setThemeVar }, 'rule');

    expect(r.mode).toBe('grid-vars');
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0], '헤더 축은 프리셋이 거의 전부 속성 조건부라 그 사실을 밝혀야 한다')
      .toMatch(/속성은 붙지 않습니다/);
    expect(setThemeVar).toHaveBeenCalled();
  });

  it('그리드 경로는 이전 프리셋 잔재를 먼저 지운다', () => {
    const calls: Array<[string, string]> = [];
    applyHeader({ setThemeVar: (k: string, v: string) => calls.push([k, v]) }, 'rule');
    for (const k of HEADER_TOKENS) {
      expect(calls.some(([key, val]) => key === k && val === ''), k + ' 를 비우지 않았다').toBe(true);
    }
  });

  it('요소도 그리드도 아니면 throw — 조용한 오사용을 막는다', () => {
    expect(() => applyHeader({} as never, 'rule')).toThrow(/HTMLElement/);
  });
});

describe('defineHeader — 플러그인 표면도 같은 계약을 낸다', () => {
  it('전역 싱글턴의 내장도 보호된다', () => {
    const r = defineHeader('rule', { '--og-header-rule-width': '99px' });
    expect(r.registration.ok).toBe(false);
    expect(headerRegistry.resolve('rule').tokens['--og-header-rule-width'])
      .toBe(HEADER_PRESETS['rule']!['--og-header-rule-width']);
  });
});
