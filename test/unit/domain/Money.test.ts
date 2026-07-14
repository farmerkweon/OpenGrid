import { describe, it, expect } from 'vitest';
import { Money, MoneyMismatchError, minorUnitsOf } from '../../../src/core/domain/Money.js';

describe('Money — 생성·메타', () => {
  it('KRW 최소단위 0, USD 2', () => {
    expect(minorUnitsOf('KRW')).toBe(0);
    expect(minorUnitsOf('USD')).toBe(2);
    expect(minorUnitsOf('XYZ')).toBe(2); // 미등록 기본 2
  });
  it('of 로 금액·통화 보유', () => {
    const m = Money.of('1200', 'KRW');
    expect(m.amount.toString()).toBe('1200');
    expect(m.currency).toBe('KRW');
    expect(m.minorUnits).toBe(0);
  });
  it('kind = money, 상태질의 전부 false', () => {
    const m = Money.of('1', 'USD');
    expect(m.kind).toBe('money');
    expect(m.isMissing()).toBe(false);
    expect(m.isError()).toBe(false);
    expect(m.isBlank()).toBe(false);
  });
});

describe('Money — 산술(같은 통화만)', () => {
  it('같은 통화 add', () => {
    expect(Money.of('10.10', 'USD').add(Money.of('0.05', 'USD')).amount.toString()).toBe('10.15');
  });
  it('같은 통화 sub', () => {
    expect(Money.of('10', 'USD').sub(Money.of('3', 'USD')).amount.toString()).toBe('7');
  });
  it('다통화 add → MoneyMismatchError', () => {
    expect(() => Money.of('1', 'KRW').add(Money.of('1', 'USD'))).toThrow(MoneyMismatchError);
  });
  it('convertTo 로만 통화 교차', () => {
    const usd = Money.of('10', 'USD').convertTo('KRW', '1300');
    expect(usd.currency).toBe('KRW');
    expect(usd.amount.toString()).toBe('13000');
  });
});

describe('Money — penny-rounding (HALF_EVEN)', () => {
  it('USD 0.125 → 0.12 (짝수)', () => {
    expect(Money.of('0.125', 'USD').roundToMinorUnit().amount.toString()).toBe('0.12');
  });
  it('USD 0.135 → 0.14 (짝수)', () => {
    expect(Money.of('0.135', 'USD').roundToMinorUnit().amount.toString()).toBe('0.14');
  });
  it('KRW 1200.5 → 1200 (짝수, 0 자리)', () => {
    expect(Money.of('1200.5', 'KRW').roundToMinorUnit().amount.toString()).toBe('1200');
  });
});

describe('Money — 동등성·비교', () => {
  it('통화+금액 동일 → equals', () => {
    expect(Money.of('1.50', 'USD').equals(Money.of('1.5', 'USD'))).toBe(true);
  });
  it('통화 다르면 not equals', () => {
    expect(Money.of('1', 'USD').equals(Money.of('1', 'KRW'))).toBe(false);
  });
  it('equals ⟺ hashKey 동일', () => {
    const a = Money.of('1.50', 'USD');
    const b = Money.of('1.5', 'USD');
    expect(a.equals(b)).toBe(true);
    expect(a.hashKey()).toBe(b.hashKey());
  });
  it('동일 통화 compareTo = amount 순', () => {
    expect(Money.of('1', 'USD').compareTo(Money.of('2', 'USD'))).toBeLessThan(0);
    expect(Money.of('2', 'USD').compareTo(Money.of('1', 'USD'))).toBeGreaterThan(0);
    expect(Money.of('1', 'USD').compareTo(Money.of('1', 'USD'))).toBe(0);
  });
  it('다통화 compareTo = currency 콜레이션 그룹분리(금액 interleave 금지)', () => {
    // KRW < USD 코드순: 큰 KRW 금액도 USD 앞에 그룹
    expect(Money.of('99999', 'KRW').compareTo(Money.of('1', 'USD'))).toBeLessThan(0);
  });
  it('equals ⇒ compareTo===0', () => {
    expect(Money.of('1.50', 'USD').compareTo(Money.of('1.5', 'USD'))).toBe(0);
  });
});

describe('Money — 불변·직렬화', () => {
  it('동결(frozen)', () => expect(Object.isFrozen(Money.of('1', 'USD'))).toBe(true));
  it('toJSON 슬라이스', () => {
    expect(Money.of('1200', 'KRW').toJSON()).toEqual({ kind: 'money', v: '1200', meta: { currency: 'KRW', minorUnits: 0 } });
  });
});
