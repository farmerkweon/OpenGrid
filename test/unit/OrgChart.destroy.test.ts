/**
 * OrgChart.destroy() — 조직도가 컨테이너에 더한 것을 되돌린다.
 *
 * OrgChart.destroy() undoes what the org chart added to its container.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OrgChart } from '../../src/core/OrgChart';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { document.body.innerHTML = ''; });

const data = [
  { id: 1, parentId: null, name: '대표' },
  { id: 2, parentId: 1, name: '개발' },
];

function makeChart(): { el: HTMLDivElement; chart: OrgChart } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const chart = new OrgChart(el, {
    idField: 'id', parentIdField: 'parentId',
    columns: [{ field: 'name' }],
  } as any);
  chart.setData(data);
  return { el, chart };
}

describe('OrgChart.destroy', () => {
  it('T4-01 내용을 비우고 og-orgchart 클래스를 뗀다', () => {
    const { el, chart } = makeChart();
    expect(el.children.length).toBeGreaterThan(0);
    chart.destroy();
    expect(el.innerHTML).toBe('');
    expect(el.classList.contains('og-orgchart')).toBe(false);
  });

  it('T4-02 두 번 불러도 오류가 없다', () => {
    const { chart } = makeChart();
    chart.destroy();
    expect(() => chart.destroy()).not.toThrow();
  });

  it('T4-03 setTheme 으로 사용자가 건 data-og-theme 는 남긴다', () => {
    const { el, chart } = makeChart();
    chart.setTheme('dark');
    chart.destroy();
    expect(el.getAttribute('data-og-theme')).toBe('dark');
  });

  it('T4-04 같은 요소에 새 그리드를 만들어도 og-orgchart 가 남지 않는다', () => {
    const { el, chart } = makeChart();
    chart.destroy();
    el.style.width = '400px';
    el.style.height = '200px';
    const g = new OpenGrid(el, { columns: [{ field: 'name', header: '이름' }], height: 200 });
    expect(el.classList.contains('og-orgchart')).toBe(false);
    expect(el.classList.contains('og-container')).toBe(true);
    g.destroy();
  });
});
