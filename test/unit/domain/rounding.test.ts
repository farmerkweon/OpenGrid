import { describe, it, expect } from 'vitest';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import { roundDecimal, HALF_UP, HALF_EVEN, DOWN } from '../../../src/core/domain/rounding.js';

const D = (s: string) => OGDecimal.from(s);

describe('rounding — HALF_UP', () => {
  it('0.5 → 1', () => expect(HALF_UP.round(D('0.5'), 0).toString()).toBe('1'));
  it('2.5 → 3', () => expect(HALF_UP.round(D('2.5'), 0).toString()).toBe('3'));
  it('1.234 → 1.23 (2dp)', () => expect(HALF_UP.round(D('1.234'), 2).toString()).toBe('1.23'));
  it('1.235 → 1.24 (2dp)', () => expect(HALF_UP.round(D('1.235'), 2).toString()).toBe('1.24'));
  it('음수 -0.5 → -1', () => expect(HALF_UP.round(D('-0.5'), 0).toString()).toBe('-1'));
});

describe('rounding — HALF_EVEN (은행가)', () => {
  it('0.5 → 0 (짝수)', () => expect(HALF_EVEN.round(D('0.5'), 0).toString()).toBe('0'));
  it('1.5 → 2 (짝수)', () => expect(HALF_EVEN.round(D('1.5'), 0).toString()).toBe('2'));
  it('2.5 → 2 (짝수)', () => expect(HALF_EVEN.round(D('2.5'), 0).toString()).toBe('2'));
  it('3.5 → 4 (짝수)', () => expect(HALF_EVEN.round(D('3.5'), 0).toString()).toBe('4'));
  it('2.51 → 3 (반 초과)', () => expect(HALF_EVEN.round(D('2.51'), 0).toString()).toBe('3'));
  it('1.245 → 1.24 (2dp, 짝수)', () => expect(HALF_EVEN.round(D('1.245'), 2).toString()).toBe('1.24'));
  it('1.235 → 1.24 (2dp, 짝수)', () => expect(HALF_EVEN.round(D('1.235'), 2).toString()).toBe('1.24'));
  it('음수 -2.5 → -2 (짝수)', () => expect(HALF_EVEN.round(D('-2.5'), 0).toString()).toBe('-2'));
});

describe('rounding — DOWN (버림)', () => {
  it('0.9 → 0', () => expect(DOWN.round(D('0.9'), 0).toString()).toBe('0'));
  it('1.999 → 1.99 (2dp)', () => expect(DOWN.round(D('1.999'), 2).toString()).toBe('1.99'));
  it('음수 -0.9 → 0 방향 버림 = 0', () => expect(DOWN.round(D('-0.9'), 0).toString()).toBe('0'));
});

describe('rounding — 경계·불변', () => {
  it('이미 dp 이내면 원값 반환', () => {
    const v = D('1.5');
    expect(roundDecimal(v, 2, 'half-even').toString()).toBe('1.5');
  });
  it('정수는 무변화', () => expect(roundDecimal(D('100'), 0, 'half-even').toString()).toBe('100'));
  it('음의 dp 는 0 으로 클램프', () => expect(roundDecimal(D('1.6'), -1, 'half-up').toString()).toBe('2'));
});
