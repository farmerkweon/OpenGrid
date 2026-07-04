import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { localeRegistry } from '../../../src/core/i18n/LocaleRegistry.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => { localeRegistry.setActive('ko'); });
afterEach(() => { document.body.innerHTML = ''; });

function mount(opts: any = {}): { grid: OpenGrid; el: HTMLElement } {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  const grid = new OpenGrid(el, {
    columns: [{ field: 'name', header: '이름', width: 200 }],
    height: 400,
    pagination: true,
    pageSize: 10,
    ...opts,
  });
  grid.setData([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  return { grid, el };
}

describe('기본(ko) 렌더 byte-identical (하위호환)', () => {
  it('locale 미지정 시 페이지네이션/찾기 라벨은 기존 한국어', () => {
    const { el } = mount();
    expect(el.querySelector('.og-pagination')!.textContent).toContain('행/페이지:');
    expect(el.querySelector('.og-find-label')!.textContent).toBe('찾기');
    expect(el.querySelector('.og-find-input')!.getAttribute('placeholder')).toBe('검색어 입력...');
  });
  it('getLocale 기본값 ko', () => {
    const { grid } = mount();
    expect(grid.getLocale()).toBe('ko');
  });
});

describe('setLocale — 상주 크롬 재렌더 + lang + 이벤트 (T5)', () => {
  it('setLocale("en") → 페이지네이션/찾기 라벨이 영어로 갱신', () => {
    const { grid, el } = mount();
    grid.setLocale('en');
    expect(grid.getLocale()).toBe('en');
    expect(el.querySelector('.og-pagination')!.textContent).toContain('Rows per page:');
    expect(el.querySelector('.og-find-label')!.textContent).toBe('Find');
    expect(el.querySelector('.og-find-input')!.getAttribute('placeholder')).toBe('Enter search term...');
    expect(el.querySelector('.og-find-close')!.getAttribute('aria-label')).toBe('Close find');
  });
  it('setLocale 시 컨테이너 lang 속성 갱신(SR 발음)', () => {
    const { grid, el } = mount();
    grid.setLocale('en');
    expect(el.getAttribute('lang')).toBe('en-US');
  });
  it('localeChange 이벤트가 { locale, prev } 로 발화', () => {
    const { grid } = mount();
    let payload: any = null;
    grid.on('localeChange', (p: any) => { payload = p; });
    grid.setLocale('en');
    expect(payload).toEqual({ locale: 'en', prev: 'ko' });
  });
  it('미등록 로케일 setLocale 은 throw 안 함(폴백 유지)', () => {
    const { grid, el } = mount();
    expect(() => grid.setLocale('zzz')).not.toThrow();
    // 미등록이라 활성 로케일 미변경 → ko 라벨 유지
    expect(el.querySelector('.og-find-label')!.textContent).toBe('찾기');
  });
});

describe('options.locale / options.messages 배선', () => {
  it('생성 시 locale:"en" 이면 초기 렌더부터 영어', () => {
    const { el } = mount({ locale: 'en' });
    expect(el.querySelector('.og-find-label')!.textContent).toBe('Find');
    expect(el.getAttribute('lang')).toBe('en-US');
  });
  it('options.messages 부분 오버라이드가 카탈로그를 이김', () => {
    const { el } = mount({ messages: { findBar: { label: '검색바' } } });
    expect(el.querySelector('.og-find-label')!.textContent).toBe('검색바');
    // 오버라이드 안 한 라벨은 ko 유지
    expect(el.querySelector('.og-find-input')!.getAttribute('placeholder')).toBe('검색어 입력...');
  });
  it('setMessage 인스턴스 오버라이드(setLocale 로 반영)', () => {
    const { grid, el } = mount();
    grid.setMessage('findBar.label', 'FINDER');
    grid.setLocale('ko'); // refreshLabels 트리거
    expect(el.querySelector('.og-find-label')!.textContent).toBe('FINDER');
  });
});

describe('멀티그리드 인스턴스 격리 (T7)', () => {
  it('한 그리드의 setLocale 이 다른 그리드에 영향 없음', () => {
    const g1 = mount();
    const g2 = mount();
    g1.grid.setLocale('en');
    expect(g1.el.querySelector('.og-find-label')!.textContent).toBe('Find');
    expect(g2.el.querySelector('.og-find-label')!.textContent).toBe('찾기');
    expect(localeRegistry.active()).toBe('ko');
  });
});

describe('XSS — messages 주입은 textContent 로만 (T8)', () => {
  it('<img onerror> 주입 → 텍스트로만 렌더, img 요소·실행 없음', () => {
    (window as any).__xss_grid = undefined;
    const evil = '<img src=x onerror="window.__xss_grid=1">';
    const { el } = mount({ messages: { findBar: { label: evil } } });
    const label = el.querySelector('.og-find-label')!;
    expect(label.textContent).toBe(evil);         // 문자열 그대로
    expect(label.querySelector('img')).toBeNull(); // 마크업으로 해석 안 됨
    expect(el.querySelector('img')).toBeNull();
    expect((window as any).__xss_grid).toBeUndefined();
  });
});
