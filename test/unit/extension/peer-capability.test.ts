// DD-10 §2.5·§2.8 — peer 검증(안전 거부) + capability detection + semver 비교.
import { describe, it, expect } from 'vitest';
import { verifyPeer, Capabilities, compareSemver } from '../../../src/core/extension/IExtension';

describe('compareSemver', () => {
  it('수치 세그먼트 비교', () => {
    expect(compareSemver('2.4.0', '2.4.0')).toBe(0);
    expect(compareSemver('2.4.0', '2.5.0')).toBe(-1);
    expect(compareSemver('3.0.0', '2.9.9')).toBe(1);
    expect(compareSemver('2.4', '2.4.1')).toBe(-1);
  });
});

describe('Capabilities: 런타임 능력 질의(§2.8)', () => {
  const caps = new Capabilities({ core: '2.4.0', spi: { IChartRenderer: '2' }, tokens: ['canvas2d'] });
  it('has/spiVersion/satisfies', () => {
    expect(caps.has('canvas2d')).toBe(true);
    expect(caps.has('webgl')).toBe(false);
    expect(caps.spiVersion('IChartRenderer')).toBe('2');
    expect(caps.spiVersion('IUnknown')).toBeUndefined();
    expect(caps.satisfies('2.0.0')).toBe(true);
    expect(caps.satisfies('3.0.0')).toBe(false);
  });
});

describe('verifyPeer: 확장 로드 안전 거부(UC-6)', () => {
  const core = new Capabilities({ core: '2.4.0', spi: { IChartRenderer: '2' }, tokens: ['canvas2d'] });

  it('SPI major 불일치 → reject(사유 고지)', () => {
    const v = verifyPeer({ minCore: '2.0.0', spi: 'IChartRenderer@3' }, core);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('SPI major');
  });

  it('동일 major → ok', () => {
    expect(verifyPeer({ minCore: '2.0.0', spi: 'IChartRenderer@2' }, core).ok).toBe(true);
  });

  it('minCore 미달 → reject', () => {
    const v = verifyPeer({ minCore: '9.0.0', spi: 'IChartRenderer@2' }, core);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('minCore');
  });

  it('capability 미보유 → reject', () => {
    const v = verifyPeer({ minCore: '2.0.0', spi: 'IChartRenderer@2', requires: ['webgl'] }, core);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('capability');
  });

  it('요구 capability 보유 → ok', () => {
    expect(verifyPeer({ minCore: '2.0.0', spi: 'IChartRenderer@2', requires: ['canvas2d'] }, core).ok).toBe(true);
  });

  it('SPI 미제공 → reject', () => {
    const v = verifyPeer({ minCore: '2.0.0', spi: 'IMissing@1' }, core);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('SPI 미제공');
  });
});
