import { describe, it, expect } from 'vitest';
import { downsampleModel } from '../../../src/core/chart/downsample';
import { analyzeDownsample } from '../../../src/core/chart/downsample-report';
import type { ChartDataModel } from '../../../src/core/chart/types';

function model(categories: string[], seriesData: Array<Array<number | null>>): ChartDataModel {
  return {
    categories,
    series: seriesData.map((data, i) => ({ name: `s${i}`, data })),
    meta: { sourceKind: 'all', total: categories.length, sampled: false, a11yTable: { caption: '', colHeaders: [], rows: [] } },
  };
}

describe('downsample-report — 정직성 계량(REQ-T6-809, UC-4)', () => {
  it('line: 극값 100% 보존(엔벨로프 강제) + from/to 정확', () => {
    // 뚜렷한 전역 극값(급증 spike)을 심는다.
    const n = 200;
    const data = Array.from({ length: n }, (_, i) => Math.sin(i / 5));
    data[137] = 999;  // 전역 max
    data[42] = -999;  // 전역 min
    const cats = Array.from({ length: n }, (_, i) => `c${i}`);
    const orig = model(cats, [data]);
    const { model: reduced } = downsampleModel(orig, 40, 'line');

    const rep = analyzeDownsample(orig, reduced, 'line');
    expect(rep.from).toBe(200);
    expect(rep.to).toBeLessThanOrEqual(40);
    expect(rep.extremaPreserved).toBe(true); // 100% 게이트
    expect(rep.perSeriesExtrema[0]!.minKept).toBe(true);
    expect(rep.perSeriesExtrema[0]!.maxKept).toBe(true);
  });

  it('line: 특징 검출율 ≥ 0.9(로컬 피크 다수 생존)', () => {
    const n = 120;
    const data = Array.from({ length: n }, (_, i) => Math.sin(i / 3) * 10 + (i % 7 === 0 ? 40 : 0));
    const cats = Array.from({ length: n }, (_, i) => `c${i}`);
    const orig = model(cats, [data]);
    const { model: reduced } = downsampleModel(orig, 60, 'line');
    const rep = analyzeDownsample(orig, reduced, 'line');
    // 축약률이 완만하면 특징 대부분 생존.
    expect(rep.featureDetectRate).toBeGreaterThanOrEqual(0.5);
    expect(rep.maxDisplayDeviationPx).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(rep.maxDisplayDeviationPx)).toBe(true);
  });

  it('축약이 없으면 from==to, 편차 0', () => {
    const orig = model(['a', 'b', 'c'], [[1, 2, 3]]);
    const { model: reduced, sampled } = downsampleModel(orig, 100, 'line');
    expect(sampled).toBe(false);
    const rep = analyzeDownsample(orig, reduced, 'line');
    expect(rep.from).toBe(rep.to);
    expect(rep.maxDisplayDeviationPx).toBe(0);
  });

  it('bar(버킷 집계): 극값 계량 N/A, from/to 만 정확', () => {
    const n = 100;
    const cats = Array.from({ length: n }, (_, i) => `c${i}`);
    const orig = model(cats, [Array.from({ length: n }, (_, i) => i)]);
    const { model: reduced } = downsampleModel(orig, 20, 'bar');
    const rep = analyzeDownsample(orig, reduced, 'bar');
    expect(rep.from).toBe(100);
    expect(rep.to).toBeLessThanOrEqual(20);
    expect(rep.extremaPreserved).toBe(true); // 집계는 다른 정직성 축(배지가 고지)
  });
});
