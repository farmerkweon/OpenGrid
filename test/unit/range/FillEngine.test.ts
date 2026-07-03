import { describe, it, expect } from 'vitest';
import {
  detectSeries,
  buildFillPlan,
  ctrlFillSourceTarget,
  type FillPlanContext,
} from '../../../src/core/range/FillEngine.js';
import type { CellRange, FlatRowRefLike } from '../../../src/core/range/types.js';

// ── detectSeries 경계 매트릭스(FR-3, REQ-24, §3.4.1) ─────────

describe('detectSeries — copy vs 선형시리즈 경계 AC(REQ-24)', () => {
  it('[1,2,4] 비등차 → copy', () => {
    expect(detectSeries([1, 2, 4]).kind).toBe('copy');
  });
  it('[5] 단일 숫자 → copy(엑셀 관례)', () => {
    expect(detectSeries([5]).kind).toBe('copy');
  });
  it('["a","b"] 접미숫자 없음 → copy', () => {
    expect(detectSeries(['a', 'b']).kind).toBe('copy');
  });
  it('["Q1","Q2"] 동일 prefix+등차 접미 → text-suffix(step=1)', () => {
    const r = detectSeries(['Q1', 'Q2']);
    expect(r.kind).toBe('text-suffix');
    expect(r.step?.toNumber()).toBe(1);
    expect(r.prefix).toBe('Q');
  });
  it('[1,2] 등차 → arith(step=1)', () => {
    const r = detectSeries([1, 2]);
    expect(r.kind).toBe('arith');
    expect(r.step?.toNumber()).toBe(1);
  });
  it('prefix 상이("A1","B2") → copy', () => {
    expect(detectSeries(['A1', 'B2']).kind).toBe('copy');
  });
  it('숫자부 비등차("Q1","Q3") → copy', () => {
    // 참고: 두 원소만으론 diff가 항상 uniform이라 실제로는 arith 판정 가능한 등차이므로
    // 3개 이상으로 비등차를 구성해 검증한다.
    expect(detectSeries(['Q1', 'Q2', 'Q4']).kind).toBe('copy');
  });
});

// ── buildFillPlan — copy(MVP) & series(FR-3) ─────────────────

function withValues(values: Record<number, Record<string, any>>, base?: Partial<FillPlanContext>): FillPlanContext {
  const fields = ['a', 'b', 'c', 'd'];
  return {
    resolveFlatRow: (ri: number): FlatRowRefLike => ({ kind: 'data', rowId: `r${ri}` }),
    fieldAt: (ci: number) => fields[ci],
    getCellValue: (ri: number, field: string) => values[ri]?.[field],
    ...base,
  };
}

describe('buildFillPlan — copy 채우기(UR-3a, MVP)', () => {
  it('아래로 채우기: 소스 패턴 타일 반복(2행 소스 → 4행 타깃)', () => {
    const ctx = withValues({ 0: { a: 10 }, 1: { a: 20 } });
    const source: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 2, endRow: 5, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items.map(i => i.value)).toEqual([10, 20, 10, 20]);
    expect(items.every(i => i.action === 'value')).toBe(true);
  });

  it('오른쪽으로 채우기: 1셀 소스 단순 복제(UC-4 대안흐름)', () => {
    const ctx = withValues({ 0: { a: 7 } });
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 0, endRow: 0, startCol: 1, endCol: 3 };
    const { items } = buildFillPlan(source, target, 'right', 'copy', ctx);
    expect(items.map(i => i.value)).toEqual([7, 7, 7]);
  });

  it('위로 채우기: 타일 반복 방향 대칭', () => {
    const ctx = withValues({ 4: { a: 10 }, 5: { a: 20 } });
    const source: CellRange = { startRow: 4, endRow: 5, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 0, endRow: 3, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'up', 'copy', ctx);
    // 소스(row4=10,row5=20) 기준 위쪽으로 seamless 타일: row3=20,row2=10,row1=20,row0=10
    // (전체적으로 읽으면 10,20,10,20,10,20 — 블록 경계에서 값이 끊기지 않는다)
    expect(items.find(i => i.rowIndex === 3)!.value).toBe(20);
    expect(items.find(i => i.rowIndex === 2)!.value).toBe(10);
    expect(items.find(i => i.rowIndex === 1)!.value).toBe(20);
    expect(items.find(i => i.rowIndex === 0)!.value).toBe(10);
  });
});

describe('buildFillPlan — series 채우기(UR-3b, Full)', () => {
  it('소스 [1,2] 아래 4칸 → [3,4,5,6](설계 예시)', () => {
    const ctx = withValues({ 0: { a: 1 }, 1: { a: 2 } });
    const source: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 2, endRow: 5, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'series', ctx);
    expect(items.map(i => i.value)).toEqual([3, 4, 5, 6]);
  });

  it('소스 [Q1,Q2] 오른쪽 2칸 → [Q3,Q4](설계 예시)', () => {
    const ctx = withValues({ 0: { a: 'Q1', b: 'Q2' } });
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 1 };
    const target: CellRange = { startRow: 0, endRow: 0, startCol: 2, endCol: 3 };
    const { items } = buildFillPlan(source, target, 'right', 'series', ctx);
    expect(items.map(i => i.value)).toEqual(['Q3', 'Q4']);
  });

  it('series 모드에서도 detectSeries가 copy로 귀결되면 타일 반복(경계 케이스)', () => {
    const ctx = withValues({ 0: { a: 1 }, 1: { a: 2 }, 2: { a: 4 } });
    const source: CellRange = { startRow: 0, endRow: 2, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 3, endRow: 5, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'series', ctx);
    expect(items.map(i => i.value)).toEqual([1, 2, 4]); // 타일 반복
  });
});

describe('buildFillPlan — non-data 행 skip(C0.3/CON-5)', () => {
  it('타깃이 pseudo-row(kind!==data)이면 write 없이 skip', () => {
    const ctx = withValues(
      { 0: { a: 1 } },
      {
        resolveFlatRow: (ri: number): FlatRowRefLike =>
          ri === 2 ? { kind: 'detailFiller' } : { kind: 'data', rowId: `r${ri}` },
      },
    );
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 2, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'copy', ctx);
    const skipped = items.find(i => i.rowIndex === 2)!;
    expect(skipped.action).toBe('skip');
    expect(skipped.reason).toBe('non-data-row');
  });

  it('비편집(editable:false) 셀은 skip', () => {
    const ctx = withValues(
      { 0: { a: 1 } },
      { isEditable: (rowId: string) => rowId !== 'r2' },
    );
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 2, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items.find(i => i.rowIndex === 2)!.action).toBe('skip');
    expect(items.find(i => i.rowIndex === 2)!.reason).toBe('not-editable');
  });
});

describe('buildFillPlan — 수식 합동 3규칙(C3, FR-7)', () => {
  it('규칙1: 소스가 수식 → offsetFormula 경유 setFormula(값 write 아님)', () => {
    const ctx = withValues(
      { 0: { a: 5 } },
      {
        hasCellFormula: (rowId: string, field: string) => rowId === 'r0' && field === 'a',
        offsetFormula: (rowId, field, dRow, dCol) => `=A${dRow}+B${dCol}(${rowId}/${field})`,
      },
    );
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 1, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items[0]!.action).toBe('setFormula');
    expect(items[0]!.formula).toContain('r0/a');
  });

  it('규칙1 변형: Ctrl-강제-copy는 오프셋 없이 수식 원문 복제', () => {
    const ctx = withValues(
      { 0: { a: '=SUM(A1:A2)' } },
      { hasCellFormula: () => true, forceCopyFormula: true, offsetFormula: () => 'SHOULD_NOT_BE_USED' },
    );
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 1, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items[0]!.action).toBe('setFormula');
    expect(items[0]!.formula).toBe('=SUM(A1:A2)');
  });

  it('규칙2: 소스=값, 대상=수식 → 기본 skip + skippedFormula 카운트(HANMS-05)', () => {
    const ctx = withValues(
      { 0: { a: 5 } },
      { hasCellFormula: (rowId: string) => rowId === 'r1' },
    );
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 1, startCol: 0, endCol: 0 };
    const { items, skippedFormula } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items[0]!.action).toBe('skip');
    expect(items[0]!.reason).toBe('formula-preserved');
    expect(skippedFormula).toBe(1);
  });

  it('규칙2 opt-in: fillOverwriteFormula:true면 값으로 덮어씀', () => {
    const ctx = withValues(
      { 0: { a: 5 } },
      { hasCellFormula: (rowId: string) => rowId === 'r1', overwriteFormula: true },
    );
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 1, startCol: 0, endCol: 0 };
    const { items, skippedFormula } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items[0]!.action).toBe('value');
    expect(items[0]!.value).toBe(5);
    expect(skippedFormula).toBe(0);
  });

  it('규칙3: 소스·대상 모두 값 → 값 배치', () => {
    const ctx = withValues({ 0: { a: 5 } });
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    const target: CellRange = { startRow: 1, endRow: 1, startCol: 0, endCol: 0 };
    const { items } = buildFillPlan(source, target, 'down', 'copy', ctx);
    expect(items[0]).toMatchObject({ action: 'value', value: 5 });
  });
});

// ── Ctrl+D / Ctrl+R 대상 산출(UR-5, §3.3) ────────────────────

describe('ctrlFillSourceTarget', () => {
  it('Ctrl+D: 최상단 행 → 하단 행들', () => {
    const rect: CellRange = { startRow: 2, endRow: 5, startCol: 0, endCol: 1 };
    const r = ctrlFillSourceTarget(rect, 'down');
    expect(r).toEqual({
      source: { startRow: 2, endRow: 2, startCol: 0, endCol: 1 },
      target: { startRow: 3, endRow: 5, startCol: 0, endCol: 1 },
    });
  });

  it('Ctrl+R: 최좌측 열 → 우측 열들', () => {
    const rect: CellRange = { startRow: 0, endRow: 1, startCol: 2, endCol: 4 };
    const r = ctrlFillSourceTarget(rect, 'right');
    expect(r).toEqual({
      source: { startRow: 0, endRow: 1, startCol: 2, endCol: 2 },
      target: { startRow: 0, endRow: 1, startCol: 3, endCol: 4 },
    });
  });

  it('1행뿐이면 Ctrl+D 대상 없음(null)', () => {
    expect(ctrlFillSourceTarget({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 }, 'down')).toBeNull();
  });

  it('1열뿐이면 Ctrl+R 대상 없음(null)', () => {
    expect(ctrlFillSourceTarget({ startRow: 0, endRow: 2, startCol: 0, endCol: 0 }, 'right')).toBeNull();
  });
});
