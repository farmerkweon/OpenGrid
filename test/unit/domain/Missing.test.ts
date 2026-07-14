import { describe, it, expect } from 'vitest';
import { Missing, ErrorValue, MissingReason, ErrorCode } from '../../../src/core/domain/Missing.js';
import { PlainNumber } from '../../../src/core/domain/Plain.js';
import { classifyState } from '../../../src/core/domain/DomainValue.js';

describe('Missing — 결측 1급 값 객체', () => {
  it('사유별 싱글턴(캐시)', () => {
    expect(Missing.of(MissingReason.NoData)).toBe(Missing.of(MissingReason.NoData));
  });
  it('사유 구분 → not equal', () => {
    expect(Missing.of(MissingReason.NoData).equals(Missing.of(MissingReason.Suppressed))).toBe(false);
  });
  it('isMissing/isBlank true, isError false', () => {
    const m = Missing.of(MissingReason.NoData);
    expect(m.isMissing()).toBe(true);
    expect(m.isBlank()).toBe(true);
    expect(m.isError()).toBe(false);
  });
  it('textEquivalent 사유별 로케일', () => {
    expect(Missing.of(MissingReason.NoData).textEquivalent('ko')).toBe('결측: 미수집');
    expect(Missing.of(MissingReason.NoData).textEquivalent('en')).toContain('no data');
  });
  it('toJSON', () => {
    expect(Missing.of(MissingReason.Suppressed).toJSON()).toEqual({ kind: 'missing', v: null, meta: { reason: 'suppressed' } });
  });
});

describe('ErrorValue — 오류 1급 값 객체', () => {
  it('code 보유·isError true', () => {
    const e = ErrorValue.of(ErrorCode.DivZero);
    expect(e.code).toBe('#DIV/0!');
    expect(e.isError()).toBe(true);
    expect(e.isMissing()).toBe(false);
    expect(e.isBlank()).toBe(false);
  });
  it('propagate 는 자기 전파', () => {
    const e = ErrorValue.of(ErrorCode.Ref);
    expect(e.propagate()).toBe(e);
  });
  it('code+detail 동등', () => {
    expect(ErrorValue.of(ErrorCode.Value, 'x').equals(ErrorValue.of(ErrorCode.Value, 'x'))).toBe(true);
    expect(ErrorValue.of(ErrorCode.Value, 'x').equals(ErrorValue.of(ErrorCode.Value, 'y'))).toBe(false);
  });
  it('textEquivalent', () => expect(ErrorValue.of(ErrorCode.DivZero, '0으로 나눔').textEquivalent()).toContain('#DIV/0!'));
  it('detail undefined ≡ "" (equals ⟺ hashKey 정합)', () => {
    const a = ErrorValue.of(ErrorCode.NA);
    const b = ErrorValue.of(ErrorCode.NA, '');
    expect(a.hashKey()).toBe(b.hashKey());
    expect(a.equals(b)).toBe(true); // hashKey 충돌과 equals 정합(biconditional)
  });
});

describe('classifyState — 4-state (실제 0 ≠ blank)', () => {
  it('실제 0 → zero', () => expect(classifyState(PlainNumber.of('0'))).toBe('zero'));
  it('일반값 → value', () => expect(classifyState(PlainNumber.of('5'))).toBe('value'));
  it('결측 → blank', () => expect(classifyState(Missing.of(MissingReason.NoData))).toBe('blank'));
  it('오류 → error', () => expect(classifyState(ErrorValue.of(ErrorCode.NA))).toBe('error'));
});
