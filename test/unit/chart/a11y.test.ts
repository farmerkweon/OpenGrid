import { describe, it, expect } from 'vitest';
import { buildA11yTable, chartAriaLabel } from '../../../src/core/chart/a11y';
import type { ChartDataModel } from '../../../src/core/chart/types';

const model: Pick<ChartDataModel, 'categories' | 'series'> = {
  categories: ['1월', '2월', '3월'],
  series: [
    { name: '매출', data: [100, null, 300] },
    { name: '비용', data: [10, 20, 30] },
  ],
};

describe('a11y — buildA11yTable (NFR-A11Y-1)', () => {
  it('셀 수 == categories × (series + 1)', () => {
    const table = buildA11yTable(model);
    const cellCount = table.rows.length * table.colHeaders.length;
    expect(cellCount).toBe(model.categories.length * (model.series.length + 1));
  });

  it('colHeaders = [category, ...seriesNames]', () => {
    const table = buildA11yTable(model);
    expect(table.colHeaders).toEqual(['category', '매출', '비용']);
  });

  it('rows 는 [category, v1, v2] 정합, 결측=빈 문자열', () => {
    const table = buildA11yTable(model);
    expect(table.rows[0]).toEqual(['1월', '100', '10']);
    expect(table.rows[1]).toEqual(['2월', '', '20']);
  });

  it('numberFormat 훅을 tooltip 컨텍스트로 호출한다(i18n §E)', () => {
    const table = buildA11yTable(model, {
      numberFormat: (v, ctx) => `${ctx.axis}:${v}`,
    });
    expect(table.rows[0]![1]).toBe('tooltip:100');
  });

  it('caption 에 title·시리즈명이 반영된다', () => {
    const table = buildA11yTable(model, { title: '월별 매출' });
    expect(table.caption).toContain('월별 매출');
    expect(table.caption).toContain('매출');
    expect(table.caption).toContain('비용');
  });

  it('빈 모델도 안전하게 처리(카테고리/시리즈 0)', () => {
    const table = buildA11yTable({ categories: [], series: [] });
    expect(table.rows).toEqual([]);
    expect(table.colHeaders).toEqual(['category']);
  });
});

describe('a11y — chartAriaLabel', () => {
  it('title·카테고리 수·시리즈명을 포함한다', () => {
    const label = chartAriaLabel(model, '월별 매출');
    expect(label).toContain('월별 매출');
    expect(label).toContain('3개');
    expect(label).toContain('매출');
    expect(label).toContain('비용');
  });

  it('시리즈가 없으면 "데이터 없음"을 표시한다', () => {
    const label = chartAriaLabel({ categories: [], series: [] });
    expect(label).toContain('데이터 없음');
  });
});
