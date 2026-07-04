import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocaleRegistry, localeRegistry, t } from '../../../src/core/i18n/LocaleRegistry.js';
import { interpolate } from '../../../src/core/i18n/interpolate.js';
import { KO_MESSAGES } from '../../../src/core/i18n/locales/ko.js';
import { EN_MESSAGES } from '../../../src/core/i18n/locales/en.js';

// 전역 레지스트리는 프로세스 싱글턴이므로, 각 테스트는 mutation 을 child() 로 격리하고
// 전역 active 를 'ko' 로 되돌린다(설계 §6 "beforeEach 레지스트리 리셋"의 안전판).
beforeEach(() => {
  localeRegistry.setActive('ko');
});

describe('interpolate — {name} 보간 (T4)', () => {
  it('숫자/문자 파라미터 치환', () => {
    expect(interpolate('{n}건', { n: 5 })).toBe('5건');
    expect(interpolate('{a}-{b}', { a: 'x', b: 'y' })).toBe('x-y');
  });
  it('중복 파라미터도 모두 치환', () => {
    expect(interpolate('{n}/{n}', { n: 2 })).toBe('2/2');
  });
  it('누락 파라미터는 플레이스홀더 잔존 (U3 정책 고정)', () => {
    expect(interpolate('{a}{b}', { a: 'x' })).toBe('x{b}');
    expect(interpolate('{missing}', {})).toBe('{missing}');
  });
  it('{{ }} 리터럴 이스케이프', () => {
    expect(interpolate('{{x}}')).toBe('{x}');
    expect(interpolate('{{{n}}}', { n: 1 })).toBe('{1}');
  });
  it('토큰 없는 문자열 fast-path(무변경)', () => {
    expect(interpolate('오름차순 정렬')).toBe('오름차순 정렬');
  });
});

describe('LocaleRegistry — 폴백 체인 en→ko→key (T1)', () => {
  it('활성 로케일 값 우선(en)', () => {
    const c = localeRegistry.child();
    c.setActive('en');
    expect(c.t('contextMenu.print')).toBe('Print');
  });
  it('활성 로케일에 없으면 ko(SSOT)로 폴백', () => {
    const c = localeRegistry.child();
    c.register('partial', { contextMenu: { find: 'FIND' } });
    c.setActive('partial');
    expect(c.t('contextMenu.find')).toBe('FIND');       // partial 자체
    expect(c.t('contextMenu.print')).toBe('인쇄');      // ko 폴백(SSOT 종단)
  });
  it('어디에도 없으면 키 원문 반환(never-throw) (T3)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = localeRegistry.child();
    expect(c.t('nope.nope')).toBe('nope.nope');
    warn.mockRestore();
  });
});

describe('LocaleRegistry — 부분 오버라이드 2단 딥머지, 원본 불변 (T2)', () => {
  it('leaf 만 교체, 형제 키는 ko 유지', () => {
    const c = localeRegistry.child();
    c.applyOverrides({ filter: { apply: 'GO' } });
    expect(c.t('filter.apply')).toBe('GO');
    expect(c.t('filter.clear')).toBe('초기화'); // 형제 키 = ko
  });
  it('원본 카탈로그(KO_MESSAGES)·전역 레지스트리 불변', () => {
    const c = localeRegistry.child();
    c.applyOverrides({ filter: { apply: 'GO' } });
    expect(KO_MESSAGES.filter.apply).toBe('적용');
    expect(localeRegistry.t('filter.apply')).toBe('적용');
  });
  it('extend 는 2단 딥머지(원본 ko 미오염)', () => {
    const c = localeRegistry.child();
    c.extend('ja', { contextMenu: { find: '検索' } });
    c.setActive('ja');
    expect(c.t('contextMenu.find')).toBe('検索');
    expect(c.t('contextMenu.print')).toBe('인쇄'); // ko 폴백
    expect(KO_MESSAGES.contextMenu.find).toBe('찾기');
  });
});

describe('LocaleRegistry — setActive never-throw (T3)', () => {
  it('미등록 로케일은 warn 후 현재 로케일 유지', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = localeRegistry.child();
    c.setActive('zzz');
    expect(c.active()).toBe('ko');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('LocaleRegistry — 인스턴스/전역 격리 (T7)', () => {
  it('child 두 개가 서로 다른 로케일을 독립 유지', () => {
    const a = localeRegistry.child();
    const b = localeRegistry.child();
    a.setActive('en');
    expect(a.t('contextMenu.find')).toBe('Find');
    expect(b.t('contextMenu.find')).toBe('찾기');  // b 는 ko
    expect(localeRegistry.active()).toBe('ko');     // 전역 불변
  });
  it('setOverride 는 해당 child 에만 기록', () => {
    const a = localeRegistry.child();
    const b = localeRegistry.child();
    a.setOverride('filter.apply', 'A-ONLY');
    expect(a.t('filter.apply')).toBe('A-ONLY');
    expect(b.t('filter.apply')).toBe('적용');
  });
});

describe('LocaleRegistry — register 결과 missingKeys (정직 신호)', () => {
  it('ko(SSOT) 대비 누락 키 목록 반환(막지 않음)', () => {
    const c = localeRegistry.child();
    const res = c.register('sparse', { contextMenu: { find: 'F' } });
    expect(res.missingKeys.length).toBeGreaterThan(0);
    expect(res.missingKeys).toContain('contextMenu.print');
    expect(res.missingKeys).not.toContain('contextMenu.find');
  });
});

describe('전역 t() 편의함수 + 함수형 값(복수형)', () => {
  it('전역 t 는 활성(ko) 로케일 위임', () => {
    expect(t('contextMenu.find')).toBe('찾기');
  });
  it('en 함수형 값(복수형)이 params 로 호출됨', () => {
    const c = localeRegistry.child();
    c.setActive('en');
    expect(c.t('drag.rowCount', { count: 1 })).toBe('Move 1 row');
    expect(c.t('drag.rowCount', { count: 3 })).toBe('Move 3 rows');
  });
  it('en/ko 카탈로그는 동일 섹션 키 집합', () => {
    expect(Object.keys(EN_MESSAGES).sort()).toEqual(Object.keys(KO_MESSAGES).sort());
  });
});

describe('LocaleRegistry — meta()', () => {
  it('활성 로케일 meta(폴백 ko)', () => {
    const c = localeRegistry.child();
    expect(c.meta().intlLocale).toBe('ko-KR');
    c.setActive('en');
    expect(c.meta().intlLocale).toBe('en-US');
    expect(c.meta().exportFont).toBe('Calibri');
  });
});

describe('XSS — 레지스트리는 문자열만 반환(마크업 실행 없음) (T8)', () => {
  it('오버라이드에 주입한 HTML 은 그대로 문자열로 반환(해석/실행 안 함)', () => {
    const evil = '<img src=x onerror="window.__xss_reg=1">';
    const c = localeRegistry.child();
    c.setOverride('findBar.label', evil);
    expect(c.t('findBar.label')).toBe(evil); // 문자열 그대로 — 소비 지점(textContent)이 방어
    expect((window as any).__xss_reg).toBeUndefined();
  });
});
