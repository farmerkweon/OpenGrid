import { describe, it, expect } from 'vitest';
import { rangeToTSV, parseTSV, buildPastePlan } from '../../../src/core/range/ClipboardCodec.js';
import type { ClipboardQueryContext, PastePlanContext } from '../../../src/core/range/ClipboardCodec.js';
import type { CellRange, FlatRowRefLike } from '../../../src/core/range/types.js';

describe('rangeToTSV / parseTSV — 왕복(UR-4, UC-6)', () => {
  it('R행×C열 범위 → 행마다 \\t조인 + 행간 \\n', () => {
    const values: Record<number, Record<string, any>> = {
      0: { a: 1, b: 2 },
      1: { a: 3, b: 4 },
    };
    const ctx: ClipboardQueryContext = {
      fieldAt: ci => ['a', 'b'][ci],
      getCellValue: (ri, field) => values[ri]?.[field],
    };
    const rect: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 };
    const tsv = rangeToTSV(rect, ctx);
    expect(tsv).toBe('1\t2\n3\t4');
  });

  it('getDisplayText가 있으면 표시값 우선(override 데모 정합)', () => {
    const ctx: ClipboardQueryContext = {
      fieldAt: () => 'a',
      getCellValue: () => 1000,
      getDisplayText: () => '1,000',
    };
    const rect: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    expect(rangeToTSV(rect, ctx)).toBe('1,000');
  });

  it('TSV 왕복: rangeToTSV 결과를 parseTSV로 되돌리면 동일 셀 배열', () => {
    const tsv = '1\t2\n3\t4';
    expect(parseTSV(tsv)).toEqual([['1', '2'], ['3', '4']]);
  });

  it('빈 문자열은 1x1 빈 블록', () => {
    expect(parseTSV('')).toEqual([['']]);
  });
});

function pasteCtx(overrides: Partial<PastePlanContext> = {}): PastePlanContext {
  const fields = ['a', 'b', 'c', 'd'];
  return {
    resolveFlatRow: (ri: number): FlatRowRefLike => ({ kind: 'data', rowId: `r${ri}` }),
    fieldAt: ci => fields[ci],
    ...overrides,
  };
}

describe('buildPastePlan — 타일 반복/전개(FR-4)', () => {
  it('붙여넣기 블록이 범위보다 작으면 타일 반복', () => {
    const block = [['1', '2']]; // 1행×2열
    const target: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 3 }; // 2행×4열
    const items = buildPastePlan(block, target, pasteCtx());
    const grid = items.filter(i => i.action === 'value').map(i => i.value);
    expect(grid).toEqual(['1', '2', '1', '2', '1', '2', '1', '2']);
  });

  it('붙여넣기 블록이 범위보다 크면 범위 무시하고 블록 그대로 전개', () => {
    const block = [
      ['1', '2', '3'],
      ['4', '5', '6'],
    ];
    const target: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }; // 1x1 범위
    const items = buildPastePlan(block, target, pasteCtx());
    expect(items.filter(i => i.action === 'value').length).toBe(6);
    expect(items.find(i => i.rowIndex === 1 && i.field === 'c')!.value).toBe('6');
  });

  it('non-data 대상 행은 skip', () => {
    const ctx = pasteCtx({
      resolveFlatRow: (ri: number): FlatRowRefLike => (ri === 1 ? { kind: 'detailFiller' } : { kind: 'data', rowId: `r${ri}` }),
    });
    const items = buildPastePlan([['x']], { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }, ctx);
    expect(items.find(i => i.rowIndex === 1)!.action).toBe('skip');
    expect(items.find(i => i.rowIndex === 1)!.reason).toBe('non-data-row');
  });

  it('비편집 셀은 skip', () => {
    const ctx = pasteCtx({ isEditable: (rowId: string) => rowId !== 'r0' });
    const items = buildPastePlan([['x']], { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, ctx);
    expect(items[0]!.action).toBe('skip');
    expect(items[0]!.reason).toBe('not-editable');
  });
});
