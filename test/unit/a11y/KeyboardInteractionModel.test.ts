import { describe, it, expect } from 'vitest';
import {
  KeyboardInteractionModel, normalizePattern, strokeToPattern,
} from '../../../src/core/a11y/KeyboardInteractionModel';
import type { KeyStroke } from '../../../src/core/a11y/KeyboardInteractionModel';

const K = (over: Partial<KeyStroke> & { key: string }): KeyStroke => ({
  ctrl: false, shift: false, alt: false, meta: false, isComposing: false, ...over,
});

describe('normalizePattern/strokeToPattern — 수정자 순서 무관 정규화', () => {
  it('수정자 순서·대소문자와 무관하게 같은 정규 패턴', () => {
    expect(normalizePattern('shift+ctrl+arrowdown')).toBe(normalizePattern('Ctrl+Shift+ArrowDown'));
    expect(normalizePattern('ctrl+c')).toBe(normalizePattern('Ctrl+C'));
  });
  it('KeyStroke 는 동일 정규형으로 매핑된다', () => {
    expect(strokeToPattern(K({ key: 'c', ctrl: true }))).toBe(normalizePattern('Ctrl+C'));
  });
});

describe('KeyboardInteractionModel — 등록/충돌/라우팅 (REQ-T9-829)', () => {
  it('register 후 resolve 로 commandId 를 라우팅(대소문자 무관)', () => {
    const m = new KeyboardInteractionModel();
    m.register({ mode: 'nav', pattern: 'Ctrl+C', commandId: 'copy' });
    expect(m.resolve('nav', K({ key: 'c', ctrl: true }))).toBe('copy');
    expect(m.resolve('nav', K({ key: 'C', ctrl: true }))).toBe('copy');
  });

  it('같은 (mode,pattern) 재등록은 충돌을 정직 반환하고 덮어쓰지 않는다', () => {
    const m = new KeyboardInteractionModel();
    m.register({ mode: 'nav', pattern: 'Ctrl+C', commandId: 'copy' });
    const r = m.register({ mode: 'nav', pattern: 'Ctrl+C', commandId: 'other' });
    expect(r.conflict?.commandId).toBe('copy');
    expect(m.resolve('nav', K({ key: 'c', ctrl: true }))).toBe('copy'); // 원본 유지. / original kept.
  });

  it("'*' 바인딩은 전 모드 폴백, 모드전용이 우선", () => {
    const m = new KeyboardInteractionModel();
    m.register({ mode: '*', pattern: 'Escape', commandId: 'cancel' });
    m.register({ mode: 'nav', pattern: 'Enter', commandId: 'navEnter' });
    m.register({ mode: '*', pattern: 'Enter', commandId: 'anyEnter' });
    expect(m.resolve('edit', K({ key: 'Escape' }))).toBe('cancel');
    expect(m.resolve('nav', K({ key: 'Enter' }))).toBe('navEnter'); // 모드전용 우선. / mode-specific wins.
    expect(m.resolve('edit', K({ key: 'Enter' }))).toBe('anyEnter'); // 폴백. / falls back.
  });

  it('미등록 키는 null', () => {
    const m = new KeyboardInteractionModel();
    expect(m.resolve('nav', K({ key: 'ArrowUp' }))).toBeNull();
  });
});

describe('KeyboardInteractionModel — IME 가드 (UC-1 E2)', () => {
  it('조합 중 커밋 키(Enter)는 소거(null)된다', () => {
    const m = new KeyboardInteractionModel();
    m.register({ mode: 'edit', pattern: 'Enter', commandId: 'commit' });
    expect(m.resolve('edit', K({ key: 'Enter', isComposing: true }))).toBeNull();
    expect(m.resolve('edit', K({ key: 'Enter', isComposing: false }))).toBe('commit');
  });
});

describe('KeyboardInteractionModel — 모드 상태', () => {
  it('기본 nav, setMode 로 전환', () => {
    const m = new KeyboardInteractionModel();
    expect(m.mode()).toBe('nav');
    m.setMode('edit');
    expect(m.mode()).toBe('edit');
  });
});

describe('KeyboardInteractionModel — 파리티 리포트 (REQ-T9-829 AC)', () => {
  it('마우스 인벤토리 대비 키보드 커버리지·미커버 목록 계측', () => {
    const m = new KeyboardInteractionModel();
    m.declareMouseCommand('copy');
    m.declareMouseCommand('paste');
    m.declareMouseCommand('sort');
    m.register({ mode: 'nav', pattern: 'Ctrl+C', commandId: 'copy' });
    m.register({ mode: 'nav', pattern: 'Ctrl+V', commandId: 'paste' });
    const rep = m.parityReport();
    expect(rep.total).toBe(3);
    expect(rep.covered).toBe(2);
    expect(rep.mouseOnly).toEqual(['sort']);
  });

  it('완전 파리티면 mouseOnly 는 비어있다', () => {
    const m = new KeyboardInteractionModel();
    m.declareMouseCommand('copy');
    m.register({ mode: 'nav', pattern: 'Ctrl+C', commandId: 'copy' });
    expect(m.parityReport().mouseOnly).toEqual([]);
  });
});
