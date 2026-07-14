// ============================================================
// DD-08 §2.6 — CyclePathReporter 유닛테스트
// 못박는 계약: 사이클 멤버 집합→고리 경로 복원([A,B,A])·SCC 밖 선행 무시·비순환 안전(REQ-T8-803).
// ============================================================
import { describe, it, expect } from 'vitest';
import { DefaultCyclePathReporter } from '../../../src/core/formula/CyclePathReporter.js';
import { FormulaGraph } from '../../../src/core/formula/FormulaGraph.js';
import { cellKey } from '../../../src/core/formula/types.js';

const K = (r: string) => cellKey(r, 'x');

describe('DefaultCyclePathReporter — 고리 경로 복원(§2.6)', () => {
  it('2-사이클 A↔B 의 경로는 [A,B,A]', () => {
    const g = new FormulaGraph();
    // A 는 B 를 읽고(precedent B), B 는 A 를 읽는다.
    g.addFormula(K('A'), new Set([K('B')]));
    g.addFormula(K('B'), new Set([K('A')]));
    const members = [K('A'), K('B')];
    const paths = new DefaultCyclePathReporter().recover(members, g);
    expect(paths.get(K('A'))).toEqual([K('A'), K('B'), K('A')]);
    expect(paths.get(K('B'))).toEqual([K('B'), K('A'), K('B')]);
  });

  it('3-사이클 A→B→C→A 의 경로는 [A,B,C,A]', () => {
    const g = new FormulaGraph();
    g.addFormula(K('A'), new Set([K('B')]));
    g.addFormula(K('B'), new Set([K('C')]));
    g.addFormula(K('C'), new Set([K('A')]));
    const members = [K('A'), K('B'), K('C')];
    const paths = new DefaultCyclePathReporter().recover(members, g);
    expect(paths.get(K('A'))).toEqual([K('A'), K('B'), K('C'), K('A')]);
  });

  it('사이클 밖 선행은 경로에서 무시(부분 진행 보존)', () => {
    const g = new FormulaGraph();
    // A↔B 사이클 + A 는 사이클 밖 leaf D 도 읽는다.
    g.addFormula(K('A'), new Set([K('B'), K('D')]));
    g.addFormula(K('B'), new Set([K('A')]));
    const members = [K('A'), K('B')]; // D 는 멤버 아님
    const paths = new DefaultCyclePathReporter().recover(members, g);
    expect(paths.get(K('A'))).toEqual([K('A'), K('B'), K('A')]);
    expect(paths.get(K('A'))).not.toContain(K('D'));
  });
});
