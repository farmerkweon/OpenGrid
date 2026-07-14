import { describe, it, expect } from 'vitest';
import { Ratio, Percent, PercentagePoint, GrowthRate } from '../../../src/core/domain/Ratios.js';

describe('Ratio', () => {
  it('toPercent = ×100', () => expect(Ratio.of('0.125').toPercent().value.toString()).toBe('12.5'));
  it('가중평균(모수 가중)', () => {
    // (0.5*100 + 0.1*900)/1000 = (50+90)/1000 = 0.14
    const r = Ratio.weightedMean([[Ratio.of('0.5'), 100], [Ratio.of('0.1'), 900]]);
    expect(r.value.toString()).toBe('0.14');
  });
  it('가중치 0 합 → 0(0분모 방어)', () => {
    expect(Ratio.weightedMean([[Ratio.of('0.5'), 0]]).value.toString()).toBe('0');
  });
  it('equals/hashKey 정합', () => {
    expect(Ratio.of('0.5').equals(Ratio.of('0.50'))).toBe(true);
    expect(Ratio.of('0.5').hashKey()).toBe(Ratio.of('0.50').hashKey());
  });
});

describe('Percent ↔ PercentagePoint (타입 분리)', () => {
  it('Percent.toRatio = ÷100', () => expect(Percent.of('12.5').toRatio().value.toString()).toBe('0.125'));
  it('두 Percent 의 차 = PercentagePoint', () => {
    const pp = Percent.of('15').minus(Percent.of('12'));
    expect(pp).toBeInstanceOf(PercentagePoint);
    expect(pp.value.toString()).toBe('3');
  });
  it('%p 는 %와 별개 kind', () => {
    expect(Percent.of('3').kind).toBe('percent');
    expect(PercentagePoint.of('3').kind).toBe('percentagePoint');
  });
  it('%p 가법', () => expect(PercentagePoint.of('3').add(PercentagePoint.of('2')).value.toString()).toBe('5'));
});

describe('GrowthRate — 부호·기저 규칙', () => {
  it('정상: (120-100)/100 = 0.2, ok', () => {
    const g = GrowthRate.from('120', '100');
    expect(g.rate!.toString()).toBe('0.2');
    expect(g.baseValidity).toBe('ok');
    expect(g.isMeaningful()).toBe(true);
  });
  it('기저 0 → rate=null, zeroBase(∞ 금지)', () => {
    const g = GrowthRate.from('5', '0');
    expect(g.rate).toBeNull();
    expect(g.baseValidity).toBe('zeroBase');
    expect(g.isMeaningful()).toBe(false);
  });
  it('음수 기저 → negativeBase', () => {
    const g = GrowthRate.from('5', '-10');
    expect(g.baseValidity).toBe('negativeBase');
    expect(g.isMeaningful()).toBe(false);
  });
  it('부호전환(양기저→음현재) → signChange', () => {
    const g = GrowthRate.from('-5', '10');
    expect(g.baseValidity).toBe('signChange');
  });
  it('null rate 정렬 말단', () => {
    const meaningful = GrowthRate.from('120', '100');
    const nullRate = GrowthRate.from('5', '0');
    expect(meaningful.compareTo(nullRate)).toBeLessThan(0);
  });
});
