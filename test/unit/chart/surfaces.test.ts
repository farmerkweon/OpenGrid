import { describe, it, expect } from 'vitest';
import { renderChart } from '../../../src/core/chart/scene';
import { CanvasSurface } from '../../../src/core/chart/surfaces/CanvasSurface';
import { SvgSurface } from '../../../src/core/chart/surfaces/SvgSurface';
import { ServerRasterSurface } from '../../../src/core/chart/surfaces/ServerRasterSurface';
import { patternOverlay, dashFor } from '../../../src/core/chart/surfaces/pattern-overlay';
import type { ChartDataModel, ChartRenderSpec, ChartType } from '../../../src/core/chart/types';

function model(categories: string[], seriesData: Array<Array<number | null>>): ChartDataModel {
  return {
    categories,
    series: seriesData.map((data, i) => ({ name: `s${i}`, data })),
    meta: { sourceKind: 'all', total: categories.length, sampled: false, a11yTable: { caption: '캡션 & <겹침>', colHeaders: [], rows: [] } },
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

describe('SvgSurface — DOM 없이 문자열 조립(RT-803)', () => {
  it('완성 <svg> 마크업 + viewBox + role=img', () => {
    const s = new SvgSurface();
    renderChart(model(['a', 'b'], [[10, 20]]), spec('bar'), SIZE, s);
    const svg = s.toString();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 480 300"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<rect');
  });
  it('XML 특수문자 이스케이프(정직·안전)', () => {
    const s = new SvgSurface();
    renderChart(model(['a'], [[1]]), spec('bar'), SIZE, s);
    const svg = s.toString();
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;');
    expect(svg).not.toContain('캡션 & <겹침>');
  });
  it('dpr 배율은 픽셀 크기만 키우고 viewBox 는 CSS px 유지', () => {
    const s = new SvgSurface({ dpr: 2 });
    renderChart(model(['a'], [[1]]), spec('bar'), SIZE, s);
    const svg = s.toString();
    expect(svg).toContain('width="960"');
    expect(svg).toContain('viewBox="0 0 480 300"');
  });
  it('sampled 시 <desc> 에 provenance 동행(REQ-T6-811)', () => {
    const m = model(['a'], [[1]]);
    m.meta.sampled = true; m.meta.sampledFrom = 100; m.meta.sampledTo = 1;
    const s = new SvgSurface();
    renderChart(m, spec('bar'), SIZE, s);
    expect(s.toString()).toContain('sampled 100→1');
  });
});

describe('CanvasSurface — ctx=null no-op(jsdom 안전) + ctx 번역', () => {
  it('ctx=null 이면 크기만 설정하고 throw 없음', () => {
    const canvas = { width: 0, height: 0, getContext: () => null };
    const s = new CanvasSurface(canvas, 2);
    expect(() => renderChart(model(['a'], [[1]]), spec('bar'), SIZE, s)).not.toThrow();
    expect(canvas.width).toBe(960); // 480*2
  });
  it('ctx 존재 시 prim 을 ctx 명령으로 번역(fillRect 호출됨)', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, prop: string) => {
        if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth' || prop === 'font' || prop === 'textAlign' || prop === 'textBaseline') return '';
        return (...a: unknown[]) => { calls.push(`${prop}(${a.join(',')})`); };
      },
      set: () => true,
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx as never };
    renderChart(model(['a', 'b'], [[10, 20]]), spec('bar'), SIZE, new CanvasSurface(canvas, 1));
    expect(calls.some(c => c.startsWith('fillRect'))).toBe(true);
    expect(calls.some(c => c.startsWith('setTransform'))).toBe(true);
  });
});

describe('ServerRasterSurface — 헤드리스 하드제약(R.1 IRasterizer 주입)', () => {
  it('paint 없이 toPNG → throw', () => {
    const s = new ServerRasterSurface();
    expect(() => s.toPNG()).toThrow(/paint/);
  });
  it('rasterizer 미주입 시 toPNG → 명시적 throw(조용한 폴백 금지 불변식4)', () => {
    const s = new ServerRasterSurface();
    renderChart(model(['a'], [[1]]), spec('bar'), SIZE, s);
    expect(() => s.toPNG()).toThrow(/IRasterizer/);
  });
  it('rasterizer 주입 시 위임 산출', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const s = new ServerRasterSurface({ rasterize: () => bytes });
    renderChart(model(['a'], [[1]]), spec('bar'), SIZE, s);
    expect(s.toPNG()).toBe(bytes);
  });
});

describe('pattern-overlay — 텍스처 좌표(세 타깃 공유)', () => {
  it('solid/undefined → 빈 오버레이', () => {
    expect(patternOverlay(0, 0, 10, 10, 'solid')).toEqual({ segs: [], dots: [] });
    expect(patternOverlay(0, 0, 10, 10, undefined)).toEqual({ segs: [], dots: [] });
  });
  it('hatch → 선분, dot → 점, cross → 더 많은 선분', () => {
    expect(patternOverlay(0, 0, 20, 20, 'hatch').segs.length).toBeGreaterThan(0);
    expect(patternOverlay(0, 0, 20, 20, 'dot').dots.length).toBeGreaterThan(0);
    expect(patternOverlay(0, 0, 20, 20, 'cross').segs.length).toBeGreaterThan(patternOverlay(0, 0, 20, 20, 'hatch').segs.length);
  });
  it('dashFor 는 패턴별 대시(색맹·흑백 생존)', () => {
    expect(dashFor('solid')).toEqual([]);
    expect(dashFor('hatch')).toEqual([6, 3]);
    expect(dashFor('dot')).toEqual([2, 3]);
  });
});
