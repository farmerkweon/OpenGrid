/**
 * RangeQuery — F1↔F4 필수 계약(FR-6, C4) getRangeValues/getRangeStats의 순수 계산 재료 (헤드리스).
 * 계약 근거: 11_design_F1_v2.md §6.2, C4.
 */
import { OGDecimal } from '../OGDecimal.js';
import type { CellRange } from './types.js';

/** 범위 질의 컨텍스트(그리드 접근 seam). / Range-query context (grid access seam). */
export interface RangeQueryContext {
  /** 컬럼 인덱스 → field 명. / Column index → field name. */
  fieldAt(ci: number): string | undefined;
  /** (행 인덱스, field) 셀 값 조회. / Read the cell value at (row index, field). */
  getCellValue(ri: number, field: string): any;
}

/**
 * rect 범위의 값 2D 배열을 반환(FR-6). / Return the 2D value array for a rect range (FR-6).
 *
 * @param rect - 대상 셀 범위 / Target cell range
 * @param ctx - 범위 질의 컨텍스트 / Range-query context
 * @returns 행×열 값 2D 배열 / Row×column 2D value array
 */
export function getRangeValues(rect: CellRange, ctx: RangeQueryContext): any[][] {
  const out: any[][] = [];
  for (let ri = rect.startRow; ri <= rect.endRow; ri++) {
    const row: any[] = [];
    for (let ci = rect.startCol; ci <= rect.endCol; ci++) {
      const field = ctx.fieldAt(ci);
      row.push(field ? ctx.getCellValue(ri, field) : undefined);
    }
    out.push(row);
  }
  return out;
}

/** 범위 통계 결과(OGDecimal 문자열). / Range statistics result (OGDecimal strings). */
export interface RangeStats {
  /** 합계. / Sum. */
  sum: string;
  /** 평균. / Average. */
  avg: string;
  /** 숫자 셀 개수. / Count of numeric cells. */
  count: number;
  /** 최솟값. / Minimum. */
  min: string;
  /** 최댓값. / Maximum. */
  max: string;
}

/**
 * 숫자 셀에 대해 OGDecimal 기반 sum/avg/count/min/max(FR-6). 숫자 셀이 없으면 null.
 * / OGDecimal-based sum/avg/count/min/max over numeric cells (FR-6); null when there are no numeric cells.
 *
 * @param rect - 대상 셀 범위 / Target cell range
 * @param ctx - 범위 질의 컨텍스트 / Range-query context
 * @returns 통계 결과 또는 null / Statistics result, or null
 */
export function getRangeStats(rect: CellRange, ctx: RangeQueryContext): RangeStats | null {
  const values = getRangeValues(rect, ctx).flat();
  const nums: OGDecimal[] = [];
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) continue;
    nums.push(OGDecimal.from(s));
  }
  if (nums.length === 0) return null;
  return {
    sum: OGDecimal.sum(nums).toString(),
    avg: OGDecimal.avg(nums).toString(),
    count: nums.length,
    min: OGDecimal.min(nums).toString(),
    max: OGDecimal.max(nums).toString(),
  };
}
