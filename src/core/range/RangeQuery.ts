/**
 * RangeQuery — F1↔F4 필수 계약(FR-6, C4) getRangeValues/getRangeStats의 순수 계산 재료 (헤드리스).
 * 계약 근거: 11_design_F1_v2.md §6.2, C4.
 */
import { OGDecimal } from '../OGDecimal.js';
import type { CellRange } from './types.js';

export interface RangeQueryContext {
  fieldAt(ci: number): string | undefined;
  getCellValue(ri: number, field: string): any;
}

/** rect 값 2D 배열(FR-6). */
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

export interface RangeStats {
  sum: string;
  avg: string;
  count: number;
  min: string;
  max: string;
}

/** 숫자 셀에 대해 OGDecimal 기반 sum/avg/count/min/max(FR-6). 숫자 셀이 없으면 null. */
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
