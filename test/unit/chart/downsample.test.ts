import { describe, it, expect } from 'vitest';
import { downsampleModel, lttbIndices } from '../../../src/core/chart/downsample';
import type { ChartDataModel } from '../../../src/core/chart/types';

function model(categories: string[], seriesData: number[][]): ChartDataModel {
  return {
    categories,
    series: seriesData.map((data, i) => ({ name: `s${i}`, data })),
    meta: {
      sourceKind: 'all', total: categories.length, sampled: false,
      a11yTable: { caption: '', colHeaders: [], rows: [] },
    },
  };
}

function minMax(data: Array<number | null>): [number, number] {
  const nums = data.filter((v): v is number => v != null);
  return [Math.min(...nums), Math.max(...nums)];
}

describe('downsample — lttbIndices', () => {
  it('threshold≥n 이면 전 인덱스, 첫/마지막 항상 포함', () => {
    expect(lttbIndices([1, 2, 3], 10)).toEqual([0, 1, 2]);
    const idx = lttbIndices(Array.from({ length: 100 }, (_, i) => Math.sin(i)), 10);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(99);
    expect(idx.length).toBe(10);
  });
});

describe('downsample — line/area LTTB (§8.2 / NFR-2)', () => {
  const n = 5000;
  const cats = Array.from({ length: n }, (_, i) => String(i));
  // 극값을 중간에 심어 엔벨로프 보존을 검증
  const data = Array.from({ length: n }, (_, i) => Math.sin(i / 30) * 10);
  data[1234] = 999;   // 전역 최대
  data[4321] = -999;  // 전역 최소

  it('len ≤ maxPoints && min/max 엔벨로프 정확 보존', () => {
    const { model: down, sampled } = downsampleModel(model(cats, [data]), 500, 'line');
    expect(sampled).toBe(true);
    expect(down.series[0]!.data.length).toBeLessThanOrEqual(500);
    expect(down.categories.length).toBe(down.series[0]!.data.length);
    const [dMin, dMax] = minMax(down.series[0]!.data);
    const [oMin, oMax] = minMax(data);
    expect(dMax).toBe(oMax); // 999 살아남음
    expect(dMin).toBe(oMin); // -999 살아남음
    expect(dMax).toBe(999);
    expect(dMin).toBe(-999);
  });

  it('다중 series 각각의 극값 모두 보존', () => {
    const d2 = data.map(v => v * 0.5);
    d2[2000] = 5000; // series1 고유 전역 최대(다른 어떤 값보다 큼)
    const { model: down } = downsampleModel(model(cats, [data, d2]), 400, 'line');
    expect(down.series[0]!.data.length).toBeLessThanOrEqual(400);
    expect(minMax(down.series[0]!.data)[1]).toBe(999);  // series0 극값
    expect(minMax(down.series[1]!.data)[1]).toBe(5000); // series1 고유 극값 보존
  });

  it('meta.sampled/sampledFrom/sampledTo + a11yTable 재정합', () => {
    const { model: down } = downsampleModel(model(cats, [data]), 300, 'line');
    expect(down.meta.sampled).toBe(true);
    expect(down.meta.sampledFrom).toBe(n);
    expect(down.meta.sampledTo).toBe(down.categories.length);
    // a11yTable 셀 수 == categories × (series+1) 재정합(§B.4)
    expect(down.meta.a11yTable.rows.length).toBe(down.categories.length);
    expect(down.meta.a11yTable.colHeaders.length).toBe(2);
  });
});

describe('downsample — 엔벨로프 예산 초과 시 라운드로빈 배분(코드리뷰 Minor)', () => {
  it('series 수가 많아 예산을 넘겨도 뒤쪽(고인덱스) series 의 극값이 통째로 잘리지 않는다', () => {
    const n = 1000;
    const cats = Array.from({ length: n }, (_, i) => String(i));
    // 3 series, 각자 고유 극값을 서로 다른 위치에 심는다(series2 는 뒤쪽 인덱스에 위치).
    const a = new Array(n).fill(0); a[5] = -100; a[6] = 100;
    const b = new Array(n).fill(0); b[7] = -200; b[8] = 200;
    const c = new Array(n).fill(0); c[500] = -300; c[501] = 300;
    // 강제 truncation 을 유발하도록 매우 작은 maxPoints(2 forced + 3 series 분 여유 3 = 5).
    const { model: down } = downsampleModel(model(cats, [a, b, c]), 5, 'line');
    expect(down.categories.length).toBeLessThanOrEqual(5);
    // 인덱스 오름차순 slice(옛 구현)였다면 series C(뒤쪽 인덱스)는 전혀 대표되지 못했다.
    const seriesCHasValue = down.series[2]!.data.some(v => v === 300 || v === -300);
    expect(seriesCHasValue).toBe(true);
  });
});

describe('downsample — bar 버킷 집계 (§8.2)', () => {
  it('인접 category 버킷으로 len ≤ maxPoints, sampled=true', () => {
    const n = 3000;
    const cats = Array.from({ length: n }, (_, i) => `c${i}`);
    const data = Array.from({ length: n }, () => 1);
    const { model: down, sampled } = downsampleModel(model(cats, [data]), 100, 'bar');
    expect(sampled).toBe(true);
    expect(down.categories.length).toBeLessThanOrEqual(100);
    expect(down.series[0]!.data.length).toBe(down.categories.length);
    // 합산 보존: 전체 합 == 3000 (모든 값 1)
    const total = down.series[0]!.data.reduce((a, v) => a + (v ?? 0), 0);
    expect(total).toBe(3000);
  });
});

describe('downsample — no-op (n ≤ maxPoints)', () => {
  it('축약 불필요 시 원본 반환 + sampled=false', () => {
    const m = model(['a', 'b', 'c'], [[1, 2, 3]]);
    const { model: down, sampled } = downsampleModel(m, 500, 'line');
    expect(sampled).toBe(false);
    expect(down).toBe(m); // 동일 참조(비변경)
  });
});
