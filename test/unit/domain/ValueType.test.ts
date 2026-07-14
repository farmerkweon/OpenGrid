import { describe, it, expect } from 'vitest';
import {
  createDefaultRegistry, DefaultValueTypeRegistry, DEFAULT_VALUE_TYPES,
} from '../../../src/core/domain/ValueType.js';
import { Money } from '../../../src/core/domain/Money.js';
import { Percent } from '../../../src/core/domain/Ratios.js';
import { PlainNumber, PlainText } from '../../../src/core/domain/Plain.js';
import { Missing } from '../../../src/core/domain/Missing.js';

describe('ValueTypeRegistry — 기본 등록', () => {
  const reg = createDefaultRegistry();
  it('8+ 종 기본 등록', () => {
    expect(DEFAULT_VALUE_TYPES.length).toBeGreaterThanOrEqual(8);
    for (const k of ['money', 'ratio', 'percent', 'percentagePoint', 'growthRate', 'delta', 'quantity', 'missing', 'error']) {
      expect(reg.has(k)).toBe(true);
    }
  });
  it('has 정확', () => {
    expect(reg.has('money')).toBe(true);
    expect(reg.has('nonexistent-kind')).toBe(false);
  });
});

describe('ValueTypeRegistry — 미등록 kind → PLAIN 폴백(never-throw)', () => {
  const reg = createDefaultRegistry();
  it('get(미등록) throw 아님, PLAIN 반환', () => {
    const t = reg.get('coordinate-unknown');
    expect(t).toBeDefined();
    const v = t.parse('42');
    expect(v).toBeInstanceOf(PlainNumber);
  });
  it('PLAIN 폴백: 텍스트는 PlainText', () => {
    expect(reg.get('unknown').parse('hello')).toBeInstanceOf(PlainText);
  });
});

describe('ValueType.parse — 값종별 파싱', () => {
  const reg = createDefaultRegistry();
  it('money parse (currency ctx)', () => {
    const v = reg.get('money').parse('$1,200.50', { currency: 'USD' });
    expect(v).toBeInstanceOf(Money);
    expect((v as Money).amount.toString()).toBe('1200.5');
  });
  it('percent parse ("12.5%")', () => {
    const v = reg.get('percent').parse('12.5%');
    expect(v).toBeInstanceOf(Percent);
    expect((v as Percent).value.toString()).toBe('12.5');
  });
  it('빈 값 → Missing', () => {
    expect(reg.get('money').parse('')).toBeInstanceOf(Missing);
    expect(reg.get('percent').parse(null)).toBeInstanceOf(Missing);
  });
});

describe('ValueTypeRegistry — resolveForColumn', () => {
  const reg = createDefaultRegistry();
  it('currencyCode → money', () => {
    expect(reg.resolveForColumn({ currencyCode: 'USD' }).kind).toBe('money');
  });
  it('dataType number → number', () => {
    expect(reg.resolveForColumn({ dataType: 'number' }).kind).toBe('number');
  });
  it('kind 우선', () => {
    expect(reg.resolveForColumn({ kind: 'percent' }).kind).toBe('percent');
  });
});

describe('ValueTypeRegistry — additive register (last-wins)', () => {
  it('동일 kind 재등록 승격', () => {
    const reg = new DefaultValueTypeRegistry();
    const base = { kind: 'x', dimension: 'none' } as unknown;
    reg.register({ ...(base as object), parse: () => PlainNumber.of('1') } as never);
    reg.register({ ...(base as object), parse: () => PlainNumber.of('2') } as never);
    expect((reg.get('x').parse(null) as PlainNumber).value.toString()).toBe('2');
  });
});
