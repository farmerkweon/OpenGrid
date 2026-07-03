// ============================================================
// FormulaGraph 유닛테스트 — dirty 폐포/Kahn 위상정렬/사이클/삭제 역조회(§5)
// ============================================================
import { describe, it, expect } from 'vitest';
import { FormulaGraph } from '../../../src/core/formula/FormulaGraph.js';
import { cellKey } from '../../../src/core/formula/types.js';

describe('FormulaGraph — 엣지/폐포(§5.1~5.3)', () => {
  it('addFormula 로 precedents/dependents 양방향 등록', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r2', 'sum'), new Set([cellKey('r1', 'a')]));
    expect(g.getPrecedents(cellKey('r2', 'sum'))).toEqual([cellKey('r1', 'a')]);
    expect(g.getDependents(cellKey('r1', 'a'))).toEqual([cellKey('r2', 'sum')]);
  });

  it('dirty 폐포는 간접 종속까지 BFS로 전부 포함(다단계 체인)', () => {
    const g = new FormulaGraph();
    // r1.a(leaf) <- r1.b(=A+1) <- r1.c(=B+1) <- r1.d(=C+1)
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'a')]));
    g.addFormula(cellKey('r1', 'c'), new Set([cellKey('r1', 'b')]));
    g.addFormula(cellKey('r1', 'd'), new Set([cellKey('r1', 'c')]));
    const closure = g.getDependentsClosure([cellKey('r1', 'a')]);
    expect(new Set(closure)).toEqual(new Set([cellKey('r1', 'b'), cellKey('r1', 'c'), cellKey('r1', 'd')]));
  });

  it('수식 셀 자신이 seed 이면 폐포에 자신도 포함(재편집 시나리오)', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'a')]));
    const closure = g.getDependentsClosure([cellKey('r1', 'b')]);
    expect(closure).toContain(cellKey('r1', 'b'));
  });

  it('leaf(수식 아님) seed 는 폐포에 자기 자신을 포함하지 않는다', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'a')]));
    const closure = g.getDependentsClosure([cellKey('r1', 'a')]);
    expect(closure).not.toContain(cellKey('r1', 'a'));
  });

  it('addFormula 재호출 시 이전 엣지를 완전히 교체(동적 의존성 재등록)', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'a')]));
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'z')])); // 이제 a 대신 z 참조
    expect(g.getDependents(cellKey('r1', 'a'))).toEqual([]);
    expect(g.getDependents(cellKey('r1', 'z'))).toEqual([cellKey('r1', 'b')]);
  });

  it('removeFormula 는 엣지/역인덱스를 모두 정리한다', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'a')]));
    g.removeFormula(cellKey('r1', 'b'));
    expect(g.isFormula(cellKey('r1', 'b'))).toBe(false);
    expect(g.getDependents(cellKey('r1', 'a'))).toEqual([]);
    expect(g.formulasReferencing('r1', 'a')).toEqual([]);
  });
});

describe('FormulaGraph — Kahn 위상정렬 + 사이클(§5.4/F3-R12)', () => {
  it('선형 체인 위상 순서(선행 먼저)', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r1', 'b'), new Set([cellKey('r1', 'a')]));
    g.addFormula(cellKey('r1', 'c'), new Set([cellKey('r1', 'b')]));
    const { order, cycles } = g.topoOrder([cellKey('r1', 'b'), cellKey('r1', 'c')]);
    expect(order).toEqual([cellKey('r1', 'b'), cellKey('r1', 'c')]);
    expect(cycles).toEqual([]);
  });

  it('A=B, B=A 사이클 → 둘 다 cycles 에 포함, 무한루프 없음', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r', 'A'), new Set([cellKey('r', 'B')]));
    g.addFormula(cellKey('r', 'B'), new Set([cellKey('r', 'A')]));
    const { order, cycles } = g.topoOrder([cellKey('r', 'A'), cellKey('r', 'B')]);
    expect(order).toEqual([]);
    expect(new Set(cycles)).toEqual(new Set([cellKey('r', 'A'), cellKey('r', 'B')]));
  });

  it('자기참조(A=A+1) → 사이클', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r', 'A'), new Set([cellKey('r', 'A')]));
    const { cycles } = g.topoOrder([cellKey('r', 'A')]);
    expect(cycles).toEqual([cellKey('r', 'A')]);
  });

  it('사이클과 무관한 나머지 노드는 정상 위상정렬된다(부분 사이클)', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r', 'A'), new Set([cellKey('r', 'B')]));
    g.addFormula(cellKey('r', 'B'), new Set([cellKey('r', 'A')]));
    g.addFormula(cellKey('r', 'C'), new Set([cellKey('r', 'X')])); // C 는 독립(leaf X 참조)
    const { order, cycles } = g.topoOrder([cellKey('r', 'A'), cellKey('r', 'B'), cellKey('r', 'C')]);
    expect(order).toEqual([cellKey('r', 'C')]);
    expect(new Set(cycles)).toEqual(new Set([cellKey('r', 'A'), cellKey('r', 'B')]));
  });

  it('깊은 체인(1000단계) — 비재귀 Kahn, 스택 안전(E3)', () => {
    const g = new FormulaGraph();
    const N = 1000;
    for (let i = 1; i < N; i++) {
      g.addFormula(cellKey('r', `f${i}`), new Set([cellKey('r', i === 1 ? 'leaf' : `f${i - 1}`)]));
    }
    const all = Array.from({ length: N - 1 }, (_, i) => cellKey('r', `f${i + 1}`));
    const { order, cycles } = g.topoOrder(all);
    expect(cycles).toEqual([]);
    expect(order.length).toBe(N - 1);
    expect(order[0]).toBe(cellKey('r', 'f1'));
    expect(order[order.length - 1]).toBe(cellKey('r', `f${N - 1}`));
  });
});

describe('FormulaGraph — 삭제 역조회(formulasReferencing, F3-R28 P0)', () => {
  it('field 지정 시 그 (rowId,field) 를 직접 참조하는 수식만', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r2', 'sum'), new Set([cellKey('r1', 'a')]));
    g.addFormula(cellKey('r2', 'other'), new Set([cellKey('r1', 'b')]));
    expect(g.formulasReferencing('r1', 'a')).toEqual([cellKey('r2', 'sum')]);
  });
  it('field 생략 시 그 rowId 의 어떤 field 든 참조하는 수식 전부(행 삭제용)', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r2', 'sum'), new Set([cellKey('r1', 'a')]));
    g.addFormula(cellKey('r3', 'other'), new Set([cellKey('r1', 'b')]));
    expect(new Set(g.formulasReferencing('r1'))).toEqual(new Set([cellKey('r2', 'sum'), cellKey('r3', 'other')]));
  });
  it('formulasReferencingField — 열 삭제용', () => {
    const g = new FormulaGraph();
    g.addFormula(cellKey('r2', 'sum'), new Set([cellKey('r1', 'a')]));
    g.addFormula(cellKey('r3', 'sum2'), new Set([cellKey('r9', 'a')]));
    expect(new Set(g.formulasReferencingField('a'))).toEqual(new Set([cellKey('r2', 'sum'), cellKey('r3', 'sum2')]));
  });
});
