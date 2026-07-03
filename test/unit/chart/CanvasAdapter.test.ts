import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasAdapter } from '../../../src/core/chart/CanvasAdapter';
import type { ChartDataModel, ChartRenderSpec, ChartPoint } from '../../../src/core/chart/types';
import { buildA11yTable } from '../../../src/core/chart/a11y';

function makeModel(): ChartDataModel {
  const categories = ['Q1', 'Q2', 'Q3'];
  const series = [
    { name: '매출', data: [10, 30, 20] },
    { name: '비용', data: [5, 15, 25] },
  ];
  return {
    categories, series,
    meta: {
      sourceKind: 'all', total: 3, sampled: false,
      a11yTable: buildA11yTable({ categories, series }, { title: '분기 실적' }),
    },
  };
}

function makeSpec(model: ChartDataModel, type: 'bar' | 'line' = 'bar'): ChartRenderSpec {
  return {
    type,
    title: '분기 실적',
    theme: {
      primary: '#1976d2', border: '#e0e0e0', text: '#212121', bg: '#fff',
      gridLine: '#e0e0e0', fontFamily: 'sans-serif', fontSize: 13, palette: [],
    },
    a11y: model.meta.a11yTable,
  };
}

async function mount(type: 'bar' | 'line' = 'bar') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const adapter = new CanvasAdapter();
  const model = makeModel();
  const spec = makeSpec(model, type);
  await adapter.init(host, spec);
  adapter.resize(480, 300);
  adapter.render(model, spec);
  return { host, adapter, model, spec };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('CanvasAdapter — a11y 하드게이트(§B)', () => {
  it('canvas role=img + aria-label + tabindex', async () => {
    const { host } = await mount();
    const canvas = host.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBeTruthy();
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('시각숨김 table.og-chart-a11y 셀 수 == categories×(series+1)', async () => {
    const { host } = await mount();
    const table = host.querySelector('table.og-chart-a11y')!;
    expect(table).toBeTruthy();
    // clip 방식(display:none 아님 — SR 가독)
    expect((table as HTMLElement).style.cssText).toContain('clip');
    expect((table as HTMLElement).style.cssText).not.toContain('display:none');
    const bodyCells = table.querySelectorAll('tbody th, tbody td');
    expect(bodyCells.length).toBe(3 * (2 + 1)); // 3 cat × (2 series + category)
  });

  it('범례가 실 <button> 이고 개수 == series.length, aria-pressed', async () => {
    const { host } = await mount();
    const btns = host.querySelectorAll('.og-chart-legend button');
    expect(btns.length).toBe(2);
    expect(btns[0]!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('CanvasAdapter — 기하(ctx null 무관, §8.3)', () => {
  it('bar: geom 개수 == series×category, bbox 유효', async () => {
    const { adapter } = await mount('bar');
    const geoms = adapter.getGeometry();
    expect(geoms.length).toBe(2 * 3);
    for (const g of geoms) {
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(g.cx)).toBe(true);
    }
  });

  it('line: null 값은 geom 생략', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const adapter = new CanvasAdapter();
    const categories = ['A', 'B', 'C'];
    const series = [{ name: 's', data: [1, null, 3] as Array<number | null> }];
    const model: ChartDataModel = {
      categories, series,
      meta: { sourceKind: 'all', total: 3, sampled: false, a11yTable: buildA11yTable({ categories, series }) },
    };
    const spec = makeSpec(model, 'line');
    await adapter.init(host, spec);
    adapter.resize(480, 300);
    adapter.render(model, spec);
    expect(adapter.getGeometry().length).toBe(2); // B(null) 제외
  });
});

describe('CanvasAdapter — 범례 토글', () => {
  it('범례 클릭 → aria-pressed 토글 + 해당 series geom 제거', async () => {
    const { host, adapter } = await mount('bar');
    expect(adapter.getGeometry().length).toBe(6);
    const btn = host.querySelector('.og-chart-legend button') as HTMLButtonElement;
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    // series0 숨김 → geom 은 series1 것만(3개)
    expect(adapter.getGeometry().length).toBe(3);
  });
});

describe('CanvasAdapter — 키보드 순회 + Enter=pointClick(§B.2)', () => {
  it('화살표 순회가 aria-live 에 값 공지, Enter 가 onPointClick 발화', async () => {
    const { host, adapter } = await mount('bar');
    const clicks: ChartPoint[] = [];
    adapter.onPointClick(p => clicks.push(p));
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    const live = host.querySelector('.og-chart-live')!;

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(live.textContent).toContain('Q2'); // cat 0→1
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(live.textContent).toContain('비용'); // series 0→1

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(clicks.length).toBe(1);
    expect(clicks[0]!.category).toBe('Q2');
    expect(clicks[0]!.seriesName).toBe('비용');
    expect(clicks[0]!.value).toBe(15);
  });
});

describe('CanvasAdapter — destroy 정리', () => {
  it('destroy 후 host 내 차트 DOM 제거', async () => {
    const { host, adapter } = await mount('bar');
    adapter.destroy();
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.querySelector('table.og-chart-a11y')).toBeNull();
    expect(host.querySelector('.og-chart-legend')).toBeNull();
  });
});

describe('CanvasAdapter — resize 동기화(코드리뷰 CRITICAL)', () => {
  it('resize(w,h) 후 canvas 버퍼/표시폭이 내부 좌표계(_w/_h)와 정확히 일치한다', async () => {
    const { host, adapter } = await mount('bar');
    adapter.resize(800, 400);
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('400px');
    expect(canvas.width).toBe(800);  // dpr=1(jsdom 기본)
    expect(canvas.height).toBe(400);
  });

  it('표시폭이 CSS 로 축소돼도(docked narrow 시나리오) 히트테스트 좌표가 역보정된다', async () => {
    const { host, adapter } = await mount('bar');
    adapter.resize(800, 400);
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    const geom = adapter.getGeometry()[0]!;
    // 실브라우저에서 host 가 좁아 canvas 가 CSS 로 절반 축소된 상황을 시뮬레이션(rect ≠ _w/_h).
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0,
      toJSON() { return {}; },
    });
    const clicks: ChartPoint[] = [];
    adapter.onPointClick(p => clicks.push(p));
    canvas.dispatchEvent(new MouseEvent('click', {
      clientX: geom.cx / 2, clientY: geom.cy / 2, bubbles: true,
    }));
    expect(clicks.length).toBe(1);
    expect(clicks[0]!.index).toBe(geom.categoryIndex);
  });
});

describe('CanvasAdapter — 키보드 커서 클램프(코드리뷰 Minor)', () => {
  it('render() 로 데이터가 줄면 다음 키 입력 전에도 커서가 즉시 클램프된다', async () => {
    const { host, adapter, model } = await mount('bar'); // 3 categories × 2 series
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // cat 0→2(Q3)
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));  // series 0→1

    const smallCategories = ['Q1'];
    const smallSeries = [{ name: '매출', data: [10] }];
    const smallModel: ChartDataModel = {
      categories: smallCategories, series: smallSeries,
      meta: {
        sourceKind: 'all', total: 1, sampled: false,
        a11yTable: buildA11yTable({ categories: smallCategories, series: smallSeries }),
      },
    };
    adapter.render(smallModel, makeSpec(smallModel, 'bar'));

    const clicks: ChartPoint[] = [];
    adapter.onPointClick(p => clicks.push(p));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // 클램프 없이 cat=2/series=1 로 남아있었다면 축소된 모델(1cat×1series)에 매치되는 geom 이
    // 없어 Enter 가 무반응(clicks.length===0)이었을 것.
    expect(clicks.length).toBe(1);
    expect(clicks[0]!.category).toBe('Q1');
    expect(clicks[0]!.seriesName).toBe('매출');
    void model;
  });
});

describe('CanvasAdapter — a11y id 유일성(코드리뷰 Minor: 모듈 스코프 카운터)', () => {
  it('여러 인스턴스를 만들어도 a11y 테이블 id 가 서로 다르다', async () => {
    const { host: h1 } = await mount('bar');
    const { host: h2 } = await mount('bar');
    const id1 = h1.querySelector('table.og-chart-a11y')!.id;
    const id2 = h2.querySelector('table.og-chart-a11y')!.id;
    expect(id1).toMatch(/^og-chart-a11y-\d+$/);
    expect(id2).toMatch(/^og-chart-a11y-\d+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('CanvasAdapter — 범례 diff 렌더 + 포커스 보존(코드리뷰 MAJOR)', () => {
  it('series 구성 불변 시 재렌더해도 버튼 DOM 이 재사용되고 포커스가 유지된다', async () => {
    const { host, adapter, model, spec } = await mount('bar');
    const btnBefore = host.querySelectorAll('.og-chart-legend button')[0] as HTMLButtonElement;
    btnBefore.focus();
    expect(document.activeElement).toBe(btnBefore);

    adapter.render(model, spec); // 라이브 재렌더 시뮬레이션(동일 series)

    const btnAfter = host.querySelectorAll('.og-chart-legend button')[0] as HTMLButtonElement;
    expect(btnAfter).toBe(btnBefore); // 재생성이 아니라 동일 DOM 재사용
    expect(document.activeElement).toBe(btnBefore); // 포커스 유지
  });

  it('series 구성이 바뀌면 재생성하되 이전 포커스 index 로 복원한다', async () => {
    const { host, adapter, model, spec } = await mount('bar'); // 2 series
    const btns = host.querySelectorAll('.og-chart-legend button');
    (btns[1] as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(btns[1]);

    const newSeries = [
      { name: '매출', data: [1, 2, 3] },
      { name: '비용', data: [1, 2, 3] },
      { name: '이익', data: [1, 2, 3] }, // series 추가 → 재생성 유발
    ];
    const newModel: ChartDataModel = {
      categories: model.categories, series: newSeries,
      meta: {
        sourceKind: 'all', total: 3, sampled: false,
        a11yTable: buildA11yTable({ categories: model.categories, series: newSeries }),
      },
    };
    adapter.render(newModel, spec);

    const newBtns = host.querySelectorAll('.og-chart-legend button');
    expect(newBtns.length).toBe(3);
    expect(document.activeElement).toBe(newBtns[1]); // 동일 index(1)로 포커스 복원
  });
});
