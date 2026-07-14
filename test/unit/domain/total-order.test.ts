import { describe, it, expect } from 'vitest';
import { PlainNumber, PlainText } from '../../../src/core/domain/Plain.js';
import { Money } from '../../../src/core/domain/Money.js';
import { Missing, MissingReason, ErrorValue, ErrorCode } from '../../../src/core/domain/Missing.js';
import type { DomainValue } from '../../../src/core/domain/DomainValue.js';
import { kindRank } from '../../../src/core/domain/DomainValue.js';

const num = PlainNumber.of('5');
const err = ErrorValue.of(ErrorCode.NA);
const miss = Missing.of(MissingReason.NoData);

describe('compareTo — 전순서 kindRank (정상 < 오류 < 결측)', () => {
  it('정상 < 오류', () => expect(num.compareTo(err)).toBeLessThan(0));
  it('오류 < 결측', () => expect(err.compareTo(miss)).toBeLessThan(0));
  it('정상 < 결측', () => expect(num.compareTo(miss)).toBeLessThan(0));
  it('반대칭', () => {
    expect(err.compareTo(num)).toBeGreaterThan(0);
    expect(miss.compareTo(err)).toBeGreaterThan(0);
  });
  it('kindRank 값', () => {
    expect(kindRank(num)).toBe(0);
    expect(kindRank(err)).toBe(1);
    expect(kindRank(miss)).toBe(2);
  });
});

describe('compareTo — 이종 kind 결정론 그룹분리(의미비교 아님)', () => {
  it('money vs number: kind 문자열 순 결정론', () => {
    const m = Money.of('1', 'USD');
    const r = m.compareTo(num); // 'money' < 'number'
    expect(r).toBeLessThan(0);
    expect(num.compareTo(m)).toBeGreaterThan(0); // 반대칭
  });
  it('추이律: number < text (kind 순)', () => {
    expect(num.compareTo(PlainText.of('z'))).toBeLessThan(0);
  });
});

describe('compareTo — 정렬 안정(결측/오류 말단)', () => {
  it('배열 정렬 시 결측·오류가 뒤로', () => {
    const arr: DomainValue[] = [miss, PlainNumber.of('3'), err, PlainNumber.of('1')];
    const sorted = arr.slice().sort((a, b) => a.compareTo(b));
    expect(sorted[0]!.kind).toBe('number');
    expect(sorted[1]!.kind).toBe('number');
    expect(sorted[2]).toBe(err);
    expect(sorted[3]).toBe(miss);
  });
});

describe('equals ⇒ compareTo === 0', () => {
  it('PlainNumber', () => {
    expect(PlainNumber.of('1.50').compareTo(PlainNumber.of('1.5'))).toBe(0);
    expect(PlainNumber.of('1.50').equals(PlainNumber.of('1.5'))).toBe(true);
  });
});
