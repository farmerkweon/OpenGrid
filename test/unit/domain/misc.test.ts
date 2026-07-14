import { describe, it, expect } from 'vitest';
import { Quantity, QuantityMismatchError } from '../../../src/core/domain/Quantity.js';
import { PlainNumber, PlainText } from '../../../src/core/domain/Plain.js';
import { BasicAggregateResult } from '../../../src/core/domain/AggregateResult.js';
import { Money } from '../../../src/core/domain/Money.js';
import { Missing, MissingReason } from '../../../src/core/domain/Missing.js';

describe('Quantity — 단위 차원', () => {
  it('동일 차원·단위 add', () => {
    expect(Quantity.of('3', 'kg', 'mass').add(Quantity.of('2', 'kg', 'mass')).value.toString()).toBe('5');
  });
  it('차원 불일치 → throw', () => {
    expect(() => Quantity.of('3', 'kg', 'mass').add(Quantity.of('2', 'm', 'length'))).toThrow(QuantityMismatchError);
  });
  it('단위 불일치(동일 차원) → throw', () => {
    expect(() => Quantity.of('3', 'kg', 'mass').add(Quantity.of('2', 'g', 'mass'))).toThrow(QuantityMismatchError);
  });
  it('equals/compareTo', () => {
    expect(Quantity.of('3', 'kg', 'mass').equals(Quantity.of('3', 'kg', 'mass'))).toBe(true);
    expect(Quantity.of('1', 'kg', 'mass').compareTo(Quantity.of('2', 'kg', 'mass'))).toBeLessThan(0);
  });
});

describe('Plain — 폴백 값 객체', () => {
  it('PlainNumber 동등·불변', () => {
    expect(PlainNumber.of('1.5').equals(PlainNumber.of('1.50'))).toBe(true);
    expect(Object.isFrozen(PlainNumber.of('1'))).toBe(true);
  });
  it('PlainText blank 판정(빈 문자열)', () => {
    expect(PlainText.of('').isBlank()).toBe(true);
    expect(PlainText.of('a').isBlank()).toBe(false);
  });
  it('PlainText 비교(문자열 순)', () => {
    expect(PlainText.of('apple').compareTo(PlainText.of('banana'))).toBeLessThan(0);
  });
});

describe('AggregateResult — 문맥 결합 값 객체', () => {
  const agg = BasicAggregateResult.of({
    fn: 'SUM', value: Money.of('1300', 'USD'), n: 3, unit: 'money',
    missingHandling: 'excluded', population: 'selection',
  });
  it('문맥 필드 보유', () => {
    expect(agg.fn).toBe('SUM');
    expect(agg.n).toBe(3);
    expect(agg.population).toBe('selection');
    expect(agg.missingHandling).toBe('excluded');
    expect((agg.value as Money).amount.toString()).toBe('1300');
  });
  it('결과 값 객체 오류 전파', () => {
    expect(agg.isError()).toBe(false);
  });
  it('equals/hashKey 정합', () => {
    const b = BasicAggregateResult.of({
      fn: 'SUM', value: Money.of('1300', 'USD'), n: 3, unit: 'money',
      missingHandling: 'excluded', population: 'selection',
    });
    expect(agg.equals(b)).toBe(true);
    expect(agg.hashKey()).toBe(b.hashKey());
  });
  it('textEquivalent', () => expect(agg.textEquivalent()).toContain('SUM(n=3)'));
});

describe('집계 적법성(AggregationLegality)', () => {
  it('통화=합 허용, 텍스트=비집계', () => {
    expect(Money.of('1', 'USD').type.aggregation.allows('SUM')).toBe(true);
    expect(PlainText.of('x').type.aggregation.allows('SUM')).toBe(false);
    expect(PlainText.of('x').type.aggregation.allows('COUNT')).toBe(true);
  });
  it('비율=가중평균만(단순평균 금지)', () => {
    const missing = Missing.of(MissingReason.NoData);
    expect(missing.type.aggregation.allows('SUM')).toBe(false);
  });
});
