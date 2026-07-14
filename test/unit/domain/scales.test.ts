import { describe, it, expect } from 'vitest';
import { NormalizationBasis } from '../../../src/core/domain/NormalizationBasis.js';
import { ThresholdSet } from '../../../src/core/domain/ThresholdSet.js';
import { PlainNumber } from '../../../src/core/domain/Plain.js';
import { Missing, MissingReason, ErrorValue, ErrorCode } from '../../../src/core/domain/Missing.js';

describe('NormalizationBasis — 0~1 사상', () => {
  it('linear min 앵커', () => {
    const b = NormalizationBasis.of({ scope: 'column', min: 0, max: 100, anchor: 'min' });
    expect(b.project(PlainNumber.of('50'))).toBeCloseTo(0.5);
    expect(b.project(PlainNumber.of('0'))).toBeCloseTo(0);
    expect(b.project(PlainNumber.of('100'))).toBeCloseTo(1);
  });
  it('zero 앵커', () => {
    const b = NormalizationBasis.of({ scope: 'column', min: 50, max: 100, anchor: 'zero' });
    expect(b.project(PlainNumber.of('50'))).toBeCloseTo(0.5);
  });
  it('clamp: 범위 밖 극단값 클램프', () => {
    const b = NormalizationBasis.of({ scope: 'column', min: 0, max: 100, clamp: true });
    expect(b.project(PlainNumber.of('150'))).toBe(1);
    expect(b.project(PlainNumber.of('-50'))).toBe(0);
  });
  it('결측/오류 → null(gap)', () => {
    const b = NormalizationBasis.of({ scope: 'column', min: 0, max: 100 });
    expect(b.project(Missing.of(MissingReason.NoData))).toBeNull();
    expect(b.project(ErrorValue.of(ErrorCode.NA))).toBeNull();
  });
  it('span 0 → 0', () => {
    const b = NormalizationBasis.of({ scope: 'column', min: 5, max: 5, anchor: 'min' });
    expect(b.project(PlainNumber.of('5'))).toBe(0);
  });
  it('기준 변경 감지: equals', () => {
    const a = NormalizationBasis.of({ scope: 'column', min: 0, max: 100 });
    const b = NormalizationBasis.of({ scope: 'column', min: 0, max: 100 });
    const c = NormalizationBasis.of({ scope: 'selection', min: 0, max: 100 });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('ThresholdSet — 구간 판정', () => {
  const ts = ThresholdSet.of([
    { upper: 50, inclusive: false, label: 'low' },
    { upper: 80, inclusive: false, label: 'mid' },
    { upper: null, inclusive: true, label: 'high' },
  ]);
  it('경계 배타 판정', () => {
    expect(ts.bandOf(PlainNumber.of('30'))).toBe(0);
    expect(ts.bandOf(PlainNumber.of('50'))).toBe(1); // 50 은 low(배타)에서 제외
    expect(ts.bandOf(PlainNumber.of('80'))).toBe(2);
    expect(ts.bandOf(PlainNumber.of('999'))).toBe(2); // catch-all
  });
  it('결측 → -1', () => expect(ts.bandOf(Missing.of(MissingReason.NoData))).toBe(-1));
  it('equals/hashKey', () => {
    const a = ThresholdSet.of([{ upper: 10, inclusive: true, label: 'x' }]);
    const b = ThresholdSet.of([{ upper: 10, inclusive: true, label: 'x' }]);
    expect(a.equals(b)).toBe(true);
    expect(a.hashKey()).toBe(b.hashKey());
  });
});
