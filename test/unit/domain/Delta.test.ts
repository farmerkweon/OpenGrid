import { describe, it, expect } from 'vitest';
import { Delta } from '../../../src/core/domain/Delta.js';

describe('Delta — 방향·절대델타·기저', () => {
  it('증가: current>base → up, magnitude=|Δ|', () => {
    const d = Delta.from('120', '100');
    expect(d.direction).toBe('up');
    expect(d.magnitude.toString()).toBe('20');
    expect(d.baseValidity).toBe('ok');
  });
  it('감소: current<base → down', () => {
    const d = Delta.from('80', '100');
    expect(d.direction).toBe('down');
    expect(d.magnitude.toString()).toBe('20');
  });
  it('무변화: |Δ| ≤ eps → flat', () => {
    expect(Delta.from('100.5', '100', '1').direction).toBe('flat');
    expect(Delta.from('100', '100').direction).toBe('flat');
  });
  it('기저 0 → zeroBase', () => expect(Delta.from('5', '0').baseValidity).toBe('zeroBase'));
  it('음수 기저 → negativeBase', () => expect(Delta.from('5', '-10').baseValidity).toBe('negativeBase'));
});

describe('Delta — 파생 증감률(동일 기저 규칙)', () => {
  it('growthRate 일치', () => {
    const d = Delta.from('120', '100');
    expect(d.growthRate().rate!.toString()).toBe('0.2');
  });
  it('기저 0 델타의 증감률도 null', () => {
    expect(Delta.from('5', '0').growthRate().rate).toBeNull();
  });
});

describe('Delta — 동등·비교·텍스트', () => {
  it('current+base 동일 → equals', () => {
    expect(Delta.from('120', '100').equals(Delta.from('120', '100'))).toBe(true);
  });
  it('compareTo = magnitude 순', () => {
    expect(Delta.from('105', '100').compareTo(Delta.from('130', '100'))).toBeLessThan(0);
  });
  it('textEquivalent 증가 표기', () => {
    expect(Delta.from('120', '100').textEquivalent('ko')).toContain('증가');
    expect(Delta.from('100', '100').textEquivalent('ko')).toBe('무변화');
  });
  it('동결(frozen)', () => expect(Object.isFrozen(Delta.from('1', '0'))).toBe(true));
});
