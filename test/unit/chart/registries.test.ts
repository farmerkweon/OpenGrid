import { describe, it, expect } from 'vitest';
import { ChartTypeRegistry, type IChartRenderer } from '../../../src/core/chart/chart-type-registry';
import { ChartEngineRegistry, isValidSri, type ExternalEngineSpec } from '../../../src/core/chart/engine/ChartEngineRegistry';
import type { ChartAdapter } from '../../../src/core/chart/types';

const renderer = (type: string): IChartRenderer => ({ type, toPrims: () => [] });

describe('ChartTypeRegistry — §2.9 IChartRenderer SPI(REQ-T6-073, DD-10 동형)', () => {
  it('미등록 타입은 null(→ unsupportedType 배지, 조용한 폴백 금지 불변식4)', () => {
    const reg = new ChartTypeRegistry();
    expect(reg.resolve('waterfall')).toBeNull();
  });
  it('등록 후 resolve', () => {
    const reg = new ChartTypeRegistry();
    const r = renderer('waterfall');
    expect(reg.register(r).ok).toBe(true);
    expect(reg.resolve('waterfall')).toBe(r);
    expect(reg.has('waterfall')).toBe(true);
  });
  it('빌트인 보호 — override 없이는 교체 불가(OCP·결정론)', () => {
    const reg = new ChartTypeRegistry();
    reg.register(renderer('bar'), { origin: 'builtin' });
    const mine = renderer('bar');
    expect(reg.register(mine).ok).toBe(false); // kept
    expect(reg.register(mine, { override: true }).ok).toBe(true); // 명시 교체
    expect(reg.resolve('bar')).toBe(mine);
  });
});

describe('ChartEngineRegistry — §2.8 SRI/폴백(REQ-T6-808/812)', () => {
  const spec = (patch: Partial<ExternalEngineSpec> = {}): ExternalEngineSpec => ({
    id: 'chartjs', url: 'https://cdn/chart.js', sri: 'sha384-AAAABBBBCCCC', globalName: 'Chart', ...patch,
  });

  it('SRI 형식 검증', () => {
    expect(isValidSri('sha384-AAAABBBBCCCC')).toBe(true);
    expect(isValidSri('md5-xxx')).toBe(false);
    expect(isValidSri('')).toBe(false);
  });
  it('SRI 없거나 불량이면 등록 거부(공급망 게이트)', () => {
    const reg = new ChartEngineRegistry();
    expect(reg.register(spec({ sri: '' }))).toBe(false);
    expect(reg.register(spec({ sri: 'nope' }))).toBe(false);
    expect(reg.register(spec())).toBe(true);
  });
  it('미등록 resolve → not-registered(값으로 고지)', async () => {
    const reg = new ChartEngineRegistry();
    const r = await reg.resolve('echarts');
    expect(r.adapter).toBeNull();
    expect(r.reason).toBe('not-registered');
  });
  it('loader 미주입 → load-failed(조용한 폴백 금지)', async () => {
    const reg = new ChartEngineRegistry();
    reg.register(spec());
    const r = await reg.resolve('chartjs');
    expect(r.adapter).toBeNull();
    expect(r.reason).toBe('load-failed');
  });
  it('loader 주입 + 성공 → 어댑터 해소', async () => {
    const fakeAdapter = { id: 'chartjs' } as ChartAdapter;
    const reg = new ChartEngineRegistry(async () => fakeAdapter);
    reg.register(spec());
    const r = await reg.resolve('chartjs');
    expect(r.adapter).toBe(fakeAdapter);
    expect(r.reason).toBeUndefined();
  });
  it('loader throw → load-failed(조용한 흡수)', async () => {
    const reg = new ChartEngineRegistry(async () => { throw new Error('network'); });
    reg.register(spec());
    const r = await reg.resolve('chartjs');
    expect(r.adapter).toBeNull();
    expect(r.reason).toBe('load-failed');
  });
});
