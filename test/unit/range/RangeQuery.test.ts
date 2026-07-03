import { describe, it, expect } from 'vitest';
import { getRangeValues, getRangeStats } from '../../../src/core/range/RangeQuery.js';
import type { RangeQueryContext } from '../../../src/core/range/RangeQuery.js';
import type { CellRange } from '../../../src/core/range/types.js';

function ctxFrom(values: Record<number, Record<string, any>>): RangeQueryContext {
  return {
    fieldAt: ci => ['a', 'b'][ci],
    getCellValue: (ri, field) => values[ri]?.[field],
  };
}

describe('getRangeValues — F4 필수 계약(FR-6, C4)', () => {
  it('rect 값을 2D 배열로 반환', () => {
    const ctx = ctxFrom({ 0: { a: 1, b: 2 }, 1: { a: 3, b: 4 } });
    const rect: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 };
    expect(getRangeValues(rect, ctx)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('getRangeStats — OGDecimal 기반 집계(FR-6)', () => {
  it('숫자 셀에 sum/avg/count/min/max 반환', () => {
    const ctx = ctxFrom({ 0: { a: 1, b: 2 }, 1: { a: 3, b: 4 } });
    const rect: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 };
    const stats = getRangeStats(rect, ctx)!;
    expect(stats.sum).toBe('10');
    expect(stats.count).toBe(4);
    expect(stats.min).toBe('1');
    expect(stats.max).toBe('4');
    expect(stats.avg).toBe('2.5');
  });

  it('비수치 셀은 집계에서 제외(에러/공백 등)', () => {
    const ctx = ctxFrom({ 0: { a: 5, b: '' }, 1: { a: 'N/A', b: 10 } });
    const rect: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 };
    const stats = getRangeStats(rect, ctx)!;
    expect(stats.count).toBe(2);
    expect(stats.sum).toBe('15');
  });

  it('숫자 셀이 하나도 없으면 null', () => {
    const ctx = ctxFrom({ 0: { a: 'x', b: '' } });
    const rect: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 1 };
    expect(getRangeStats(rect, ctx)).toBeNull();
  });
});
