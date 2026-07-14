// ============================================================
// DD-08 §2.5 — ReferenceRewriter 유닛테스트 (순수 AST 변환)
// 못박는 계약: 삭제된 행/열 걸린 참조→#REF 정직 전환(REQ-T8-805)·abs(rowId 앵커) 삽입 불변·
//   rel dRow 시프트(삽입/삭제가 host↔target 사이)·범위 코너 삭제→#REF·RewriteReport 집계.
// ⚠️ host 는 편집 전(pre-edit) 좌표를 반영(§2.5).
// ============================================================
import { describe, it, expect } from 'vitest';
import { AstReferenceRewriter } from '../../../src/core/formula/ReferenceRewriter.js';
import type { AstNode, CanonicalAbsRef, CanonicalRelRef } from '../../../src/core/formula/types.js';
import { MockGridAccessor } from './testAccessor.js';

function grid5(): MockGridAccessor {
  const g = new MockGridAccessor();
  g.addColumn('a'); g.addColumn('b'); g.addColumn('c');
  for (const r of ['r1', 'r2', 'r3', 'r4', 'r5']) g.addRow(r);
  return g;
}

const abs = (rowId: string, field: string, dollarRow = false, dollarCol = false): AstNode =>
  ({ t: 'ref', ref: { kind: 'abs', rowId, field, dollarRow, dollarCol } as CanonicalAbsRef });
const rel = (dRow: number, field: string): AstNode =>
  ({ t: 'ref', ref: { kind: 'rel', dRow, field, dollarRow: false, dollarCol: false } as CanonicalRelRef });

describe('AstReferenceRewriter — 행 삭제 → #REF(§2.5, REQ-T8-805)', () => {
  it('삭제 범위에 걸린 abs 참조는 #REF, 리포트 broken 기록', () => {
    const rw = new AstReferenceRewriter(grid5());
    const out = rw.rewrite(abs('r3', 'a'), { rowId: 'r5', field: 'out' }, { op: 'deleteRows', at: 2, count: 1 });
    expect(out).toEqual({ t: 'error', code: '#REF' });
    const rep = rw.lastReport();
    expect(rep.broken.length).toBe(1);
    expect(rep.broken[0].reason).toBe('row-deleted');
  });

  it('삭제 범위 밖 abs 참조(rowId 앵커)는 불변', () => {
    const rw = new AstReferenceRewriter(grid5());
    const src = abs('r4', 'a');
    const out = rw.rewrite(src, { rowId: 'r5', field: 'out' }, { op: 'deleteRows', at: 2, count: 1 });
    expect(out).toBe(src); // 구조 공유(불변)
    expect(rw.lastReport().unchanged).toBe(1);
    expect(rw.lastReport().broken.length).toBe(0);
  });
});

describe('AstReferenceRewriter — 행 삽입 시 abs 불변 / rel 시프트(§2.5)', () => {
  it('abs 참조는 행 삽입에 불변(stable-id 앵커)', () => {
    const rw = new AstReferenceRewriter(grid5());
    const src = abs('r3', 'a');
    const out = rw.rewrite(src, { rowId: 'r1', field: 'out' }, { op: 'insertRows', at: 1, count: 2 });
    expect(out).toBe(src);
    expect(rw.lastReport().unchanged).toBe(1);
  });

  it('rel 참조는 삽입이 host↔target 사이에 끼면 dRow 시프트', () => {
    const rw = new AstReferenceRewriter(grid5());
    // host=r1(flat0), rel dRow=2 → target flat2. insert at=1,count=1 → target 밀림 → dRow 3.
    const out = rw.rewrite(rel(2, 'a'), { rowId: 'r1', field: 'out' }, { op: 'insertRows', at: 1, count: 1 });
    expect(out.t).toBe('ref');
    expect((out as Extract<AstNode, { t: 'ref' }>).ref).toMatchObject({ kind: 'rel', dRow: 3 });
    expect(rw.lastReport().rewritten).toBe(1);
  });

  it('rel 대상이 삭제되면 #REF', () => {
    const rw = new AstReferenceRewriter(grid5());
    // host=r1(flat0), dRow=2 → target flat2. deleteRows at=2,count=1 삭제 → #REF.
    const out = rw.rewrite(rel(2, 'a'), { rowId: 'r1', field: 'out' }, { op: 'deleteRows', at: 2, count: 1 });
    expect(out).toEqual({ t: 'error', code: '#REF' });
  });
});

describe('AstReferenceRewriter — 열 삭제 / 범위(§2.5)', () => {
  it('삭제된 열 참조는 #REF(col-deleted)', () => {
    const rw = new AstReferenceRewriter(grid5());
    // 'b' = visible index 1. deleteCols at=1,count=1.
    const out = rw.rewrite(abs('r2', 'b'), { rowId: 'r1', field: 'out' }, { op: 'deleteCols', at: 1, count: 1 });
    expect(out).toEqual({ t: 'error', code: '#REF' });
    expect(rw.lastReport().broken[0].reason).toBe('col-deleted');
  });

  it('열 삽입은 명명 field 를 바꾸지 않음(불변)', () => {
    const rw = new AstReferenceRewriter(grid5());
    const src = abs('r2', 'b');
    const out = rw.rewrite(src, { rowId: 'r1', field: 'out' }, { op: 'insertCols', at: 0, count: 1 });
    expect(out).toBe(src);
  });

  it('범위 한 코너가 삭제되면 범위 전체 #REF', () => {
    const rw = new AstReferenceRewriter(grid5());
    const range: AstNode = { t: 'range', ref: {
      a: { kind: 'abs', rowId: 'r1', field: 'a', dollarRow: false, dollarCol: false },
      b: { kind: 'abs', rowId: 'r3', field: 'a', dollarRow: false, dollarCol: false },
    } };
    const out = rw.rewrite(range, { rowId: 'r5', field: 'out' }, { op: 'deleteRows', at: 2, count: 1 }); // r3 삭제
    expect(out).toEqual({ t: 'error', code: '#REF' });
  });

  it('중첩 함수 인자 안의 참조도 재귀 재작성', () => {
    const rw = new AstReferenceRewriter(grid5());
    const call: AstNode = { t: 'call', name: 'ABS', args: [abs('r3', 'a')] };
    const out = rw.rewrite(call, { rowId: 'r5', field: 'out' }, { op: 'deleteRows', at: 2, count: 1 });
    expect(out).toEqual({ t: 'call', name: 'ABS', args: [{ t: 'error', code: '#REF' }] });
  });
});
