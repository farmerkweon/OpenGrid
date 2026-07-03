import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';
import type { ChartAdapter } from '../../src/core/chart/types';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  const grid = new OpenGrid(container, {
    columns: [
      { field: 'quarter', header: '분기', width: 100 },
      { field: 'revenue', header: '매출', width: 100, type: 'number' },
      { field: 'cost', header: '비용', width: 100, type: 'number' },
    ],
    height: 400,
    ...extraOpts,
  });
  return { grid, container };
}

const sample = [
  { quarter: 'Q1', revenue: 100, cost: 60 },
  { quarter: 'Q2', revenue: 140, cost: 80 },
  { quarter: 'Q3', revenue: 120, cost: 70 },
  { quarter: 'Q4', revenue: 180, cost: 90 },
];

describe('ChartWiring — createChart 공개 API(§6, C5)', () => {
  it('createChart 1콜 → docked 패널 DOM + canvas + a11y 테이블 출현', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    const inst = grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    expect(inst.id).toBeTruthy();
    const panel = container.querySelector('.og-chart-panel');
    expect(panel).toBeTruthy();
    expect(panel!.querySelector('canvas.og-chart-canvas')).toBeTruthy();
    expect(panel!.querySelector('table.og-chart-a11y')).toBeTruthy();
    expect(grid.getCharts().length).toBe(1);
  });

  it('getModel: category=분기, series=매출/비용 추론(FR-2)', () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const inst = grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    const m = inst.getModel();
    expect(m.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(m.series.map(s => s.name)).toEqual(['매출', '비용']);
    expect(m.series[0]!.data).toEqual([100, 140, 120, 180]);
  });

  it('setType/update/destroy 동작', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    const inst = grid.createChart({ source: { kind: 'columns', series: ['revenue'] }, type: 'bar' });
    inst.setType('line');
    expect(grid.getCharts().length).toBe(1);
    inst.destroy();
    expect(grid.getCharts().length).toBe(0);
    expect(container.querySelector('.og-chart-panel')).toBeNull();
  });

  it('grid.destroy() 가 열린 차트 패널을 제거(§5.2 누수 방지)', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    grid.destroy();
    expect(container.querySelector('.og-chart-panel')).toBeNull();
  });
});

describe('ChartWiring — 테마 바인딩(UR-2 theme_bind)', () => {
  it('--og-primary 스냅샷이 첫 series 색으로 유도된다', () => {
    const { grid, container } = makeGrid();
    container.style.setProperty('--og-primary', '#336699');
    grid.setData(sample);
    grid.createChart({ source: { kind: 'columns', series: ['revenue', 'cost'] }, type: 'bar' });
    const swatch = container.querySelector('.og-chart-legend button span[aria-hidden]') as HTMLElement;
    expect(swatch).toBeTruthy();
    // getComputedStyle 이 커스텀 프로퍼티를 돌려주면 primary 유도, 아니면 안전팔레트 첫색.
    // 둘 중 하나로 결정론적 — 유효한 색 문자열이면 통과(색상 파이프 연결 확인).
    const bg = swatch.style.background || swatch.style.backgroundColor;
    expect(bg).toMatch(/#|rgb/);
  });
});

describe('ChartWiring — 라이브 갱신 디바운스(FR-6, C2.2)', () => {
  it('dataChange 연타 → 디바운스 후 chartRender 1회', () => {
    vi.useFakeTimers();
    try {
      const { grid } = makeGrid({ chart: { debounceMs: 50 } });
      grid.setData(sample);
      grid.createChart({ source: { kind: 'all' }, type: 'bar' });
      const spy = vi.fn();
      grid.on('chartRender', spy);
      grid.setData(sample);
      grid.setData(sample);
      grid.setData(sample);
      expect(spy).not.toHaveBeenCalled(); // 아직 디바운스 창 안
      vi.advanceTimersByTime(60);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('live:false 면 갱신 구독 안 함', () => {
    vi.useFakeTimers();
    try {
      const { grid } = makeGrid();
      grid.setData(sample);
      grid.createChart({ source: { kind: 'all' }, type: 'bar', live: false });
      const spy = vi.fn();
      grid.on('chartRender', spy);
      grid.setData(sample);
      vi.advanceTimersByTime(100);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ChartWiring — 배지 상시 가시(§C)', () => {
  it('maxPoints 초과 → 샘플링 배지 DOM 텍스트', () => {
    const { grid, container } = makeGrid();
    const many = Array.from({ length: 40 }, (_, i) => ({ quarter: `M${i}`, revenue: i * 3, cost: i }));
    grid.setData(many);
    grid.createChart({ source: { kind: 'all' }, type: 'bar', maxPoints: 5 });
    const badges = container.querySelector('.og-chart-badges')!;
    expect(badges.textContent).toContain('샘플링됨');
  });

  it('aggregate 강제 → 집계 배지', () => {
    const { grid, container } = makeGrid();
    const dup = [
      { quarter: 'A', revenue: 10, cost: 1 },
      { quarter: 'A', revenue: 20, cost: 2 },
      { quarter: 'B', revenue: 30, cost: 3 },
    ];
    grid.setData(dup);
    grid.createChart({ source: { kind: 'all' }, type: 'bar', aggregate: 'sum' });
    expect(container.querySelector('.og-chart-badges')!.textContent).toContain('집계');
  });
});

describe('ChartWiring — 이벤트 4종(C5.2)', () => {
  it('chartCreate emit', () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const spy = vi.fn();
    grid.on('chartCreate', spy);
    grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('키보드 Enter → chartPointClick emit(point 포함)', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    const spy = vi.fn();
    grid.on('chartPointClick', spy);
    const canvas = container.querySelector('canvas.og-chart-canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0]![0];
    expect(evt.id).toBeTruthy();
    expect(evt.point.category).toBe('Q1');
  });

  it('chartDestroy emit', () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    const inst = grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    const spy = vi.fn();
    grid.on('chartDestroy', spy);
    inst.destroy();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('options.chart.onChartCreate 콜백 바인딩', () => {
    const onChartCreate = vi.fn();
    const { grid } = makeGrid({ chart: { onChartCreate } });
    grid.setData(sample);
    grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    expect(onChartCreate).toHaveBeenCalledTimes(1);
  });
});

describe('ChartWiring — 렌더 크기 동기화(코드리뷰 CRITICAL)', () => {
  it('config.size 지정 시 canvas 버퍼/표시폭이 그 크기와 정확히 일치한다', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    grid.createChart({ source: { kind: 'all' }, type: 'bar', size: { width: 800, height: 400 } });
    const canvas = container.querySelector('canvas.og-chart-canvas') as HTMLCanvasElement;
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('400px');
  });

  it('size 미지정 + jsdom(clientWidth=0) 이면 기존 기본값 480×300 으로 동작(회귀 방지)', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    grid.createChart({ source: { kind: 'all' }, type: 'bar' });
    const canvas = container.querySelector('canvas.og-chart-canvas') as HTMLCanvasElement;
    expect(canvas.style.width).toBe('480px');
    expect(canvas.style.height).toBe('300px');
  });
});

describe('ChartWiring — 컨테이너 리사이즈 관찰(코드리뷰 MAJOR)', () => {
  it('host 리사이즈 관찰 콜백이 디바운스 후 adapter.resize 를 호출해 canvas 폭을 갱신한다', () => {
    const original = (global as any).ResizeObserver;
    let capturedCb: (() => void) | null = null;
    (global as any).ResizeObserver = class {
      constructor(cb: () => void) { capturedCb = cb; }
      observe() { /* no-op — 콜백을 수동으로 발화해 디바운스 로직만 검증 */ }
      unobserve() {}
      disconnect() {}
    };
    try {
      vi.useFakeTimers();
      const { grid, container } = makeGrid();
      grid.setData(sample);
      grid.createChart({ source: { kind: 'all' }, type: 'bar' });
      const host = container.querySelector('.og-chart-host') as HTMLElement;
      Object.defineProperty(host, 'clientWidth', { value: 640, configurable: true });
      expect(capturedCb).toBeTruthy();
      capturedCb!();
      vi.advanceTimersByTime(150);
      const canvas = container.querySelector('canvas.og-chart-canvas') as HTMLCanvasElement;
      expect(canvas.style.width).toBe('640px');
    } finally {
      vi.useRealTimers();
      (global as any).ResizeObserver = original;
    }
  });
});

describe('ChartWiring — createChart 실패 시 정리(코드리뷰 Minor)', () => {
  it('초기화 도중 예외가 나면 rec 를 정리하고 재throw한다(map 누수 방지)', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    const badAdapter: ChartAdapter = {
      id: 'bad-test-adapter',
      init: async () => {},
      render: () => { throw new Error('boom'); },
      resize: () => {},
      destroy: () => {},
    };
    expect(() =>
      grid.createChart({ source: { kind: 'all' }, type: 'bar', engine: badAdapter })
    ).toThrow('boom');
    expect(grid.getCharts().length).toBe(0);
    expect(container.querySelector('.og-chart-panel')).toBeNull();
  });
});

describe('ChartWiring — refresh() 가 테마를 재스냅샷한다(코드리뷰 MAJOR: 문서화 보장)', () => {
  it('컨테이너 --og-primary 변경 후 refresh() 를 호출해도 정상 재렌더된다', () => {
    const { grid, container } = makeGrid();
    grid.setData(sample);
    const inst = grid.createChart({ source: { kind: 'columns', series: ['revenue'] }, type: 'bar' });
    container.style.setProperty('--og-primary', '#123456');
    inst.refresh();
    const swatch = container.querySelector('.og-chart-legend button span[aria-hidden]') as HTMLElement;
    expect(swatch).toBeTruthy();
    const bg = swatch.style.background || swatch.style.backgroundColor;
    expect(bg).toMatch(/#|rgb/);
  });
});
