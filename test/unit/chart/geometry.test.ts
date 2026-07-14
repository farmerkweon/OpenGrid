import { describe, it, expect } from 'vitest';
import { computeChartGeometry, PLOT_PAD } from '../../../src/core/chart/geometry';
import type { ChartDataModel, ChartRenderSpec, ChartType } from '../../../src/core/chart/types';

function model(categories: string[], seriesData: Array<Array<number | null>>): ChartDataModel {
  return {
    categories,
    series: seriesData.map((data, i) => ({ name: `s${i}`, data })),
    meta: { sourceKind: 'all', total: categories.length, sampled: false, a11yTable: { caption: 'c', colHeaders: [], rows: [] } },
  };
}
function spec(type: ChartType): ChartRenderSpec {
  return {
    type,
    theme: { primary: '#0072B2', border: '#e0e0e0', text: '#212121', bg: '#ffffff', gridLine: '#e0e0e0', fontFamily: 'sans-serif', fontSize: 12, palette: [] },
    a11y: { caption: 'c', colHeaders: [], rows: [] },
  };
}
const SIZE = { width: 480, height: 300 };

describe('geometry — plot rect (CanvasAdapter 파리티)', () => {
  it('PLOT_PAD 기반 플롯 사각형', () => {
    const g = computeChartGeometry(model(['a', 'b'], [[1, 2]]), spec('bar'), SIZE);
    expect(g.plot.x).toBe(PLOT_PAD.left);
    expect(g.plot.y).toBe(PLOT_PAD.top);
    expect(g.plot.w).toBe(480 - PLOT_PAD.left - PLOT_PAD.right);
    expect(g.plot.h).toBe(300 - PLOT_PAD.top - PLOT_PAD.bottom);
  });
});

describe('geometry — bar 0 기준선 비협상(§9.3.1 축 절단 방지)', () => {
  it('전부 양수여도 extent min=0 강제 → baseline 이 플롯 바닥', () => {
    const g = computeChartGeometry(model(['a', 'b', 'c'], [[10, 20, 30]]), spec('bar'), SIZE);
    expect(g.scale.min).toBe(0);
    expect(g.baselineY).toBeCloseTo(g.plot.y + g.plot.h, 5);
  });
  it('음수 포함 시 0 을 범위에 포함(baseline 이 중간)', () => {
    const g = computeChartGeometry(model(['a', 'b'], [[-5, 10]]), spec('bar'), SIZE);
    expect(g.scale.min).toBeLessThanOrEqual(-5);
    expect(g.scale.max).toBeGreaterThanOrEqual(10);
    expect(g.baselineY).toBeGreaterThan(g.plot.y);
    expect(g.baselineY).toBeLessThan(g.plot.y + g.plot.h);
  });
  it('막대 rect 하단이 baseline 에 닿는다(양수 막대)', () => {
    const g = computeChartGeometry(model(['a'], [[30]]), spec('bar'), SIZE);
    const bar = g.points[0]!;
    expect(bar.y + bar.h).toBeCloseTo(g.baselineY, 5);
  });
});

describe('geometry — 결측 무침묵(§9.3.3)', () => {
  it('line: null 은 포인트로 생성되지 않는다(0 치환 아님)', () => {
    const g = computeChartGeometry(model(['a', 'b', 'c'], [[1, null, 3]]), spec('line'), SIZE);
    // 실제 데이터포인트는 2개(인덱스 0,2). null 은 스킵.
    expect(g.points.length).toBe(2);
    expect(g.points.map(p => p.categoryIndex).sort()).toEqual([0, 2]);
  });
  it('bar: null 은 막대를 만들지 않는다(빈 슬롯)', () => {
    const g = computeChartGeometry(model(['a', 'b'], [[null, 5]]), spec('bar'), SIZE);
    expect(g.points.length).toBe(1);
    expect(g.points[0]!.categoryIndex).toBe(1);
  });
});

describe('geometry — y틱/x라벨 결정론', () => {
  it('y틱은 niceScale 산출, px 단조 감소(값↑ → 위쪽)', () => {
    const g = computeChartGeometry(model(['a', 'b'], [[0, 100]]), spec('line'), SIZE);
    expect(g.yTicks.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < g.yTicks.length; i++) {
      expect(g.yTicks[i]!.px).toBeLessThan(g.yTicks[i - 1]!.px);
    }
  });
  it('x라벨은 카테고리 수만큼, 슬롯 중앙', () => {
    const g = computeChartGeometry(model(['a', 'b', 'c'], [[1, 2, 3]]), spec('bar'), SIZE);
    expect(g.xLabels.map(x => x.label)).toEqual(['a', 'b', 'c']);
  });
});

describe('geometry — pie 선형 각도·절댓값(§9.3.2 면적 왜곡 방지)', () => {
  it('값→각도 선형, 음수는 절댓값', () => {
    const g = computeChartGeometry(model(['a', 'b'], [[3, -1]]), spec('pie'), SIZE);
    expect(g.pie).toBeDefined();
    expect(g.pie!.length).toBe(2);
    expect(g.pie![0]!.value).toBe(3);
    expect(g.pie![1]!.value).toBe(1); // 절댓값
    // 각도 합 = 2π
    const sweep = g.pie!.reduce((s, p) => s + (p.a1 - p.a0), 0);
    expect(sweep).toBeCloseTo(Math.PI * 2, 5);
    // 선형 비례: 슬라이스0 각도 = 3/4 * 2π
    expect(g.pie![0]!.a1 - g.pie![0]!.a0).toBeCloseTo(0.75 * Math.PI * 2, 5);
  });
});

describe('geometry — 헤드리스 불변식(순수)', () => {
  it('동일 입력 → 동일 기하(결정론)', () => {
    const m = model(['a', 'b', 'c'], [[1, 2, 3]]);
    const a = computeChartGeometry(m, spec('line'), SIZE);
    const b = computeChartGeometry(m, spec('line'), SIZE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
