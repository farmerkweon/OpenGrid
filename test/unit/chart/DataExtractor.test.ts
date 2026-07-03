import { describe, it, expect } from 'vitest';
import { extractChartData, type ChartExtractDeps, type ChartColumnRef } from '../../../src/core/chart/DataExtractor';
import { OGDecimal } from '../../../src/core/OGDecimal';

const rows = [
  { dept: '개발팀', sales: 100, cost: 10 },
  { dept: '마케팅팀', sales: 200, cost: 20 },
  { dept: '개발팀', sales: 50, cost: 5 },
];

const columns: ChartColumnRef[] = [
  { field: 'dept', header: '부서' },
  { field: 'sales', header: '매출', type: 'number' },
  { field: 'cost', header: '비용', type: 'number' },
];

function baseDeps(overrides: Partial<ChartExtractDeps> = {}): ChartExtractDeps {
  return {
    getAllRows: () => rows,
    getSelectedRows: () => rows.slice(0, 2),
    getCheckedRows: () => rows.slice(1),
    getVisibleColumns: () => columns,
    ...overrides,
  };
}

describe('DataExtractor — FR-1: 4소스 동일 ChartDataModel', () => {
  it('all: categories/series 를 추론해 산출한다', () => {
    const { model } = extractChartData({ kind: 'all' }, baseDeps());
    expect(model.categories).toEqual(['개발팀', '마케팅팀', '개발팀']);
    expect(model.series.map(s => s.name)).toEqual(['매출', '비용']);
    expect(model.series[0]!.data).toEqual([100, 200, 50]);
    expect(model.meta.sourceKind).toBe('all');
    expect(model.meta.total).toBe(3);
  });

  it('selection: getSelectedRows() 만 반영', () => {
    const { model } = extractChartData({ kind: 'selection' }, baseDeps());
    expect(model.categories).toEqual(['개발팀', '마케팅팀']);
    expect(model.meta.sourceKind).toBe('selection');
    expect(model.meta.total).toBe(2);
  });

  it('checked: getCheckedRows() 만 반영', () => {
    const { model } = extractChartData({ kind: 'checked' }, baseDeps());
    expect(model.categories).toEqual(['마케팅팀', '개발팀']);
    expect(model.meta.sourceKind).toBe('checked');
  });

  it('columns: 명시 category/series 필드로 산출', () => {
    const { model } = extractChartData(
      { kind: 'columns', category: 'dept', series: ['sales'] },
      baseDeps()
    );
    expect(model.categories).toEqual(['개발팀', '마케팅팀', '개발팀']);
    expect(model.series.map(s => s.name)).toEqual(['매출']);
    expect(model.meta.sourceKind).toBe('columns');
  });

  it('range: getRangeRows/getRangeColumns 주입 시 사용(F1 없이도 동작, C0.3)', () => {
    const deps = baseDeps({
      getRangeRows: () => rows.slice(0, 2),
      getRangeColumns: () => columns,
    });
    const { model, rangeFallback } = extractChartData(
      { kind: 'range', range: { startRow: 0, endRow: 1, startCol: 0, endCol: 2 } },
      deps
    );
    expect(rangeFallback).toBe(false);
    expect(model.meta.sourceKind).toBe('range');
    expect(model.categories).toEqual(['개발팀', '마케팅팀']);
  });

  it('4소스 모두 동일 ChartDataModel 형태(categories/series/meta.a11yTable)를 갖는다', () => {
    const kinds: Array<'all' | 'selection' | 'checked'> = ['all', 'selection', 'checked'];
    for (const kind of kinds) {
      const { model } = extractChartData({ kind } as any, baseDeps());
      expect(Array.isArray(model.categories)).toBe(true);
      expect(Array.isArray(model.series)).toBe(true);
      expect(model.meta.a11yTable.colHeaders[0]).toBe('category');
      expect(model.meta.a11yTable.rows.length).toBe(model.categories.length);
    }
  });
});

describe('DataExtractor — §7 F1 부재 graceful fallback (HANMS-04)', () => {
  it('range 소스인데 getRangeRows/getActiveRange 없음 → selection 으로 강등', () => {
    const { model, rangeFallback } = extractChartData({ kind: 'range' }, baseDeps());
    expect(rangeFallback).toBe(true);
    expect(model.meta.sourceKind).toBe('selection');
    expect(model.categories).toEqual(['개발팀', '마케팅팀']);
  });

  it('range 소스, getActiveRange()===null → selection 으로 강등', () => {
    const deps = baseDeps({
      getRangeRows: () => rows,
      getRangeColumns: () => columns,
      getActiveRange: () => null,
    });
    const { model, rangeFallback } = extractChartData({ kind: 'range' }, deps);
    expect(rangeFallback).toBe(true);
    expect(model.meta.sourceKind).toBe('selection');
  });
});

describe('DataExtractor — FR-2: category/value 자동 추론', () => {
  it('첫 비수치 컬럼 = category, 수치 컬럼들 = series', () => {
    const { model } = extractChartData({ kind: 'all' }, baseDeps());
    expect(model.series.map(s => s.name)).toEqual(['매출', '비용']);
  });

  it('비수치 컬럼이 전혀 없으면 행 순번(1..n)을 category 로 사용', () => {
    const numericOnly = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const cols: ChartColumnRef[] = [
      { field: 'a', header: 'A', type: 'number' },
      { field: 'b', header: 'B', type: 'number' },
    ];
    const { model } = extractChartData(
      { kind: 'all' },
      baseDeps({ getAllRows: () => numericOnly, getVisibleColumns: () => cols })
    );
    expect(model.categories).toEqual(['1', '2']);
  });

  it('표본검사: type 미지정 컬럼도 값이 ≥80% 숫자면 수치 컬럼으로 판정', () => {
    const sampleRows = [
      { label: 'x', qty: '10' },
      { label: 'y', qty: '20' },
      { label: 'z', qty: '30' },
    ];
    const cols: ChartColumnRef[] = [{ field: 'label' }, { field: 'qty' }];
    const { model } = extractChartData(
      { kind: 'all' },
      baseDeps({ getAllRows: () => sampleRows, getVisibleColumns: () => cols })
    );
    expect(model.series.map(s => s.name)).toEqual(['qty']);
    expect(model.series[0]!.data).toEqual([10, 20, 30]);
  });
});

describe('DataExtractor — §8.4 비수치/결측 처리', () => {
  it('series 값이 비수치면 null(결측)로, 하드에러 아님', () => {
    const mixed = [
      { dept: '개발팀', sales: 'N/A' },
      { dept: '마케팅팀', sales: 200 },
    ];
    const cols: ChartColumnRef[] = [{ field: 'dept' }, { field: 'sales', type: 'number' }];
    const { model } = extractChartData(
      { kind: 'all' },
      baseDeps({ getAllRows: () => mixed, getVisibleColumns: () => cols })
    );
    expect(model.series[0]!.data).toEqual([null, 200]);
  });

  it('빈 문자열/undefined 도 null(결측)로 처리(가짜 0 금지)', () => {
    const withBlanks = [
      { dept: 'A', sales: '' },
      { dept: 'B', sales: undefined },
    ];
    const cols: ChartColumnRef[] = [{ field: 'dept' }, { field: 'sales', type: 'number' }];
    const { model } = extractChartData(
      { kind: 'all' },
      baseDeps({ getAllRows: () => withBlanks, getVisibleColumns: () => cols })
    );
    expect(model.series[0]!.data).toEqual([null, null]);
  });
});

describe('DataExtractor — FR-3: 집계 == OGDecimal 정확 일치', () => {
  it('aggregate:"sum" 은 OGDecimal.sum 과 정확히 일치, sampled/aggregatedOp 메타 설정', () => {
    const { model } = extractChartData(
      { kind: 'columns', category: 'dept', series: ['sales'] },
      baseDeps(),
      { aggregate: 'sum' }
    );
    // dept '개발팀' 은 100, 50 → sum=150
    const idx = model.categories.indexOf('개발팀');
    expect(model.series[0]!.data[idx]).toBe(OGDecimal.sum([100, 50]).toNumber());
    expect(model.meta.aggregatedOp).toBe('sum');
    expect(model.meta.sampled).toBe(true);
    expect(model.categories.length).toBeLessThan(model.meta.total);
  });

  it('aggregate:"avg"/"min"/"max"/"count" 는 각각 OGDecimal 결과와 일치', () => {
    const values = [100, 50];
    const cases: Array<['avg' | 'min' | 'max' | 'count', number]> = [
      ['avg', OGDecimal.avg(values).toNumber()],
      ['min', OGDecimal.min(values).toNumber()],
      ['max', OGDecimal.max(values).toNumber()],
      ['count', 2],
    ];
    for (const [op, expected] of cases) {
      const { model } = extractChartData(
        { kind: 'columns', category: 'dept', series: ['sales'] },
        baseDeps(),
        { aggregate: op }
      );
      const idx = model.categories.indexOf('개발팀');
      expect(model.series[0]!.data[idx]).toBe(expected);
    }
  });

  it('커스텀 집계 함수 사용 시 aggregatedOp="custom"', () => {
    const { model } = extractChartData(
      { kind: 'columns', category: 'dept', series: ['sales'] },
      baseDeps(),
      { aggregate: (vals) => vals.length * 1000 }
    );
    expect(model.meta.aggregatedOp).toBe('custom');
    const idx = model.categories.indexOf('개발팀');
    expect(model.series[0]!.data[idx]).toBe(2000);
  });

  it('aggregate 미지정 시 중복 category 를 그대로 유지(비집계)', () => {
    const { model } = extractChartData(
      { kind: 'columns', category: 'dept', series: ['sales'] },
      baseDeps()
    );
    expect(model.categories).toEqual(['개발팀', '마케팅팀', '개발팀']);
    expect(model.meta.sampled).toBe(false);
    expect(model.meta.aggregatedOp).toBeUndefined();
  });
});
