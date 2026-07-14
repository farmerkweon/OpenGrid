import { describe, it, expect } from 'vitest';
import { computeChartGeometry } from '../../../src/core/chart/geometry';
import { buildChartScene } from '../../../src/core/chart/scene';
import type { DrawPrim } from '../../../src/core/chart/scene';
import type { ChartDataModel, ChartRenderSpec, ChartType } from '../../../src/core/chart/types';

function model(categories: string[], seriesData: Array<Array<number | null>>, metaPatch: Partial<ChartDataModel['meta']> = {}): ChartDataModel {
  return {
    categories,
    series: seriesData.map((data, i) => ({ name: `s${i}`, data })),
    meta: { sourceKind: 'all', total: categories.length, sampled: false, a11yTable: { caption: 'c', colHeaders: [], rows: [] }, ...metaPatch },
  };
}
function spec(type: ChartType): ChartRenderSpec {
  return {
    type,
    theme: { primary: '#0072B2', border: '#e0e0e0', text: '#212121', bg: '#fafafa', gridLine: '#e0e0e0', fontFamily: 'sans-serif', fontSize: 12, palette: [] },
    a11y: { caption: 'c', colHeaders: [], rows: [] },
  };
}
const SIZE = { width: 480, height: 300 };
function scene(m: ChartDataModel, s: ChartRenderSpec, hidden?: Set<number>) {
  return buildChartScene(m, s, computeChartGeometry(m, s, SIZE, hidden), hidden);
}
const only = <K extends DrawPrim['k']>(prims: readonly DrawPrim[], k: K) => prims.filter(p => p.k === k) as Extract<DrawPrim, { k: K }>[];

describe('scene — 크기·배경 복원', () => {
  it('scene width/height 는 입력 크기와 일치, bg=테마', () => {
    const sc = scene(model(['a'], [[1]]), spec('bar'));
    expect(sc.width).toBe(480);
    expect(sc.height).toBe(300);
    expect(sc.bg).toBe('#fafafa');
  });
});

describe('scene — bar 막대 rect + 패턴(§9.2 색 외 이중부호화)', () => {
  it('막대 rect 는 fill + pattern 을 항상 실어보낸다', () => {
    const sc = scene(model(['a', 'b'], [[3, 6]]), spec('bar'));
    const rects = only(sc.prims, 'rect').filter(r => r.w > 12); // 범례 스와치(12) 제외
    expect(rects.length).toBe(2);
    for (const r of rects) {
      expect(r.fill).toBeTruthy();
      expect(r.pattern).toBeTruthy(); // solid 포함, 색 단독 부호화 아님
    }
  });
});

describe('scene — line 결측 gap(§9.3.3 선 끊김)', () => {
  it('중간 null 은 polyline 을 두 세그먼트로 끊는다', () => {
    const sc = scene(model(['a', 'b', 'c', 'd', 'e'], [[1, 2, null, 4, 5]]), spec('line'));
    const polys = only(sc.prims, 'polyline');
    expect(polys.length).toBe(2); // [0,1] 과 [3,4] 두 세그먼트
    // 마커는 실 데이터포인트(4개)에만.
    expect(only(sc.prims, 'circle').length).toBe(4);
  });
  it('연속 데이터는 단일 polyline', () => {
    const sc = scene(model(['a', 'b', 'c'], [[1, 2, 3]]), spec('line'));
    expect(only(sc.prims, 'polyline').length).toBe(1);
  });
});

describe('scene — pie arc(§9.3.2)', () => {
  it('슬라이스마다 arc prim, 절댓값 각도', () => {
    const sc = scene(model(['a', 'b'], [[3, 1]]), spec('pie'));
    const arcs = only(sc.prims, 'arc');
    expect(arcs.length).toBe(2);
    const sweep = arcs.reduce((s, a) => s + (a.a1 - a.a0), 0);
    expect(sweep).toBeCloseTo(Math.PI * 2, 5);
  });
});

describe('scene — 범례 색+패턴명 병기(§9.2 "봤지만 뜻 모름" 방지)', () => {
  it('범례 텍스트에 패턴명이 병기된다', () => {
    const sc = scene(model(['a'], [[1], [2]]), spec('bar'));
    const legendTexts = only(sc.prims, 'text').filter(t => /\((solid|hatch|dot|cross)\)/.test(t.s));
    expect(legendTexts.length).toBe(2);
  });
});

describe('scene — 숨긴 series 반영', () => {
  it('hidden series 의 데이터 prim 은 없다', () => {
    const sc = scene(model(['a', 'b'], [[1, 2], [3, 4]]), spec('bar'), new Set([1]));
    const dataRects = only(sc.prims, 'rect').filter(r => r.w > 12);
    // series0(2개)만 남고 series1 은 빠진다.
    expect(dataRects.length).toBe(2);
  });
});

describe('scene — provenance 동행(meta 실림)', () => {
  it('scene.meta 가 원 모델 meta 를 그대로 실어보낸다', () => {
    const m = model(['a'], [[1]], { sampled: true, sampledFrom: 100, sampledTo: 1 });
    const sc = scene(m, spec('bar'));
    expect(sc.meta.sampled).toBe(true);
    expect(sc.meta.sampledFrom).toBe(100);
  });
});
