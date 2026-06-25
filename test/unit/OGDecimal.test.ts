import { describe, it, expect } from 'vitest';
import { OGDecimal } from '../../src/core/OGDecimal.js';
import { evaluateFormula } from '../../src/core/FormulaEngine.js';

// ── OGDecimal 기본 ────────────────────────────────────────

describe('OGDecimal — from()', () => {
  it('정수 문자열', () => {
    expect(OGDecimal.from('100').toString()).toBe('100');
  });
  it('소수 문자열', () => {
    expect(OGDecimal.from('3.14').toString()).toBe('3.14');
  });
  it('number 타입', () => {
    expect(OGDecimal.from(0.1).toString()).toBe('0.1');
  });
  it('BigInt', () => {
    expect(OGDecimal.from(123n).toString()).toBe('123');
  });
  it('음수', () => {
    expect(OGDecimal.from('-0.5').toString()).toBe('-0.5');
  });
  it('OGDecimal 재입력 → 동일 인스턴스 반환', () => {
    const d = OGDecimal.from('1.23');
    expect(OGDecimal.from(d)).toBe(d);
  });
});

describe('OGDecimal — 사칙연산 (정확도)', () => {
  it('0.1 + 0.2 = 0.3 (IEEE 754 오차 없음)', () => {
    expect(OGDecimal.from('0.1').add('0.2').toString()).toBe('0.3');
  });

  it('0.3 - 0.1 = 0.2', () => {
    expect(OGDecimal.from('0.3').sub('0.1').toString()).toBe('0.2');
  });

  it('0.1 * 3 = 0.3', () => {
    expect(OGDecimal.from('0.1').mul('3').toString()).toBe('0.3');
  });

  it('1 / 3 = 0.333... (precision 5)', () => {
    expect(OGDecimal.from('1').div('3', 5).toFixed(5)).toBe('0.33333');
  });

  it('1.5 / 0.3 = 5 (정확)', () => {
    expect(OGDecimal.from('1.5').div('0.3', 10).toFixed(0)).toBe('5');
  });

  it('음수 사칙연산', () => {
    expect(OGDecimal.from('-0.1').add('-0.2').toString()).toBe('-0.3');
  });
});

describe('OGDecimal — 음원 수익 배분 (수백자리)', () => {
  it('스트리밍 수익 배분: 0.035 * 1000000 * 0.7 = 24500', () => {
    const rate     = OGDecimal.from('0.035');
    const streams  = OGDecimal.from('1000000');
    const share    = OGDecimal.from('0.7');
    const royalty  = rate.mul(streams).mul(share);
    expect(royalty.toString()).toBe('24500');
  });

  it('극소 단가 배분: 0.00000001 * 999999 = 0.00999999', () => {
    const unitFee  = OGDecimal.from('0.00000001');
    const plays    = OGDecimal.from('999999');
    const result   = unitFee.mul(plays);
    expect(result.toString()).toBe('0.00999999');
  });

  it('다수 배분 합산 정확성 (100개 × 0.001 = 0.1)', () => {
    const arr = Array(100).fill('0.001');
    expect(OGDecimal.sum(arr).toString()).toBe('0.1');
  });

  it('고정밀 나눗셈: 1 / 7 = precision 50', () => {
    const result = OGDecimal.from('1').div('7', 50).toFixed(50);
    // 0.14285714285714285714...이 50자리 나와야 함
    expect(result).toMatch(/^0\.\d{50}$/);
    expect(result.startsWith('0.14285')).toBe(true);
  });
});

describe('OGDecimal — toFixed()', () => {
  it('정수 → 소수 패딩', () => {
    expect(OGDecimal.from('5').toFixed(3)).toBe('5.000');
  });

  it('반올림 (Half-up)', () => {
    expect(OGDecimal.from('1.567').toFixed(2)).toBe('1.57');
    expect(OGDecimal.from('1.564').toFixed(2)).toBe('1.56');
  });

  it('음수 반올림', () => {
    expect(OGDecimal.from('-1.567').toFixed(2)).toBe('-1.57');
  });

  it('0자리', () => {
    expect(OGDecimal.from('3.7').toFixed(0)).toBe('4');
  });
});

describe('OGDecimal — 집계 (sum/avg/min/max)', () => {
  it('sum — 부동소수점 오차 없음', () => {
    expect(OGDecimal.sum(['0.1', '0.2', '0.3']).toString()).toBe('0.6');
  });

  it('avg — 정확한 평균', () => {
    expect(OGDecimal.avg(['1', '2', '3'], 0).toString()).toBe('2');
    expect(OGDecimal.avg(['0.1', '0.2', '0.3'], 10).toFixed(1)).toBe('0.2');
  });

  it('min / max', () => {
    const arr = ['3.5', '1.1', '9.9', '0.001'];
    expect(OGDecimal.min(arr).toString()).toBe('0.001');
    expect(OGDecimal.max(arr).toString()).toBe('9.9');
  });
});

// ── FormulaEngine ────────────────────────────────────────

describe('FormulaEngine — 문자열 수식', () => {
  const row = { price: 1000, qty: 3, rate: '0.035', discount: '10' };

  it('[price] * [qty]', () => {
    const result = evaluateFormula('[price] * [qty]', row);
    expect(result.toString()).toBe('3000');
  });

  it('[price] * [rate]', () => {
    const result = evaluateFormula('[price] * [rate]', row);
    expect(result.toString()).toBe('35');
  });

  it('([price] - 100) * [qty]', () => {
    const result = evaluateFormula('([price] - 100) * [qty]', row);
    expect(result.toString()).toBe('2700');
  });

  it('[price] * (1 - [discount] / 100)', () => {
    const result = evaluateFormula('[price] * (1 - [discount] / 100)', row, 10);
    expect(result.toFixed(2)).toBe('900.00');
  });

  it('상수만 (연산자 우선순위)', () => {
    expect(evaluateFormula('2 + 3 * 4', {}).toString()).toBe('14');
    expect(evaluateFormula('(2 + 3) * 4', {}).toString()).toBe('20');
  });

  it('음수 리터럴', () => {
    expect(evaluateFormula('-5 + 3', {}).toString()).toBe('-2');
  });

  it('나누기 0 → 에러', () => {
    expect(() => evaluateFormula('[a] / [b]', { a: 1, b: 0 })).toThrow();
  });

  it('없는 필드 → 에러', () => {
    expect(() => evaluateFormula('[unknown]', {})).toThrow(/필드/);
  });
});
