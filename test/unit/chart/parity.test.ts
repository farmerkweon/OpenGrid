import { describe, it, expect } from 'vitest';
import { renderChart } from '../../../src/core/chart/scene';
import { sceneEquals } from '../../../src/core/chart/parity';
import { CanvasSurface } from '../../../src/core/chart/surfaces/CanvasSurface';
import { SvgSurface } from '../../../src/core/chart/surfaces/SvgSurface';
import { ServerRasterSurface } from '../../../src/core/chart/surfaces/ServerRasterSurface';
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

// jsdom ctx=null 대비 — canvas 는 형태만 있는 mock(paint 는 no-op).
function fakeCanvas() { return { width: 0, height: 0, getContext: () => null }; }

const CASES: Array<[string, ChartDataModel, ChartType]> = [
  ['bar 양수', model(['a', 'b', 'c'], [[10, 20, 30]]), 'bar'],
  ['bar 음수', model(['a', 'b'], [[-5, 10]]), 'bar'],
  ['line 결측', model(['a', 'b', 'c', 'd'], [[1, null, 3, 4]]), 'line'],
  ['area 다계열', model(['a', 'b', 'c'], [[1, 2, 3], [3, 2, 1]]), 'area'],
  ['pie 음수', model(['a', 'b', 'c'], [[3, -1, 2]]), 'pie'],
];

describe('parity — 3타깃이 바이트 동일 scene 을 소비(REQ-T6-806, UC-3 1급 파리티)', () => {
  for (const [label, m, type] of CASES) {
    it(`${label}: canvas=svg=server scene deep-equal`, () => {
      const canvasScene = renderChart(m, spec(type), SIZE, new CanvasSurface(fakeCanvas(), 2));
      const svgScene = renderChart(m, spec(type), SIZE, new SvgSurface());
      const serverScene = renderChart(m, spec(type), SIZE, new ServerRasterSurface());
      expect(sceneEquals(canvasScene, svgScene)).toBe(true);
      expect(sceneEquals(svgScene, serverScene)).toBe(true);
      // deep-equal 정본(prims 구조 동일).
      expect(JSON.stringify(canvasScene.prims)).toBe(JSON.stringify(serverScene.prims));
    });
  }
});

describe('parity — sceneEquals 는 실제 차이를 잡는다(위양성 방지)', () => {
  it('데이터가 다르면 false', () => {
    const a = renderChart(model(['a'], [[1]]), spec('bar'), SIZE, new SvgSurface());
    const b = renderChart(model(['a'], [[2]]), spec('bar'), SIZE, new SvgSurface());
    expect(sceneEquals(a, b)).toBe(false);
  });
  it('크기가 다르면 false', () => {
    const a = renderChart(model(['a'], [[1]]), spec('bar'), SIZE, new SvgSurface());
    const b = renderChart(model(['a'], [[1]]), spec('bar'), { width: 600, height: 300 }, new SvgSurface());
    expect(sceneEquals(a, b)).toBe(false);
  });
});
