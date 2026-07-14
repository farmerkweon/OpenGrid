// ============================================================
// DD-08 §2.6 — 순환 경로 복원 (REQ-T8-803/T4-030)
// 레이어: Algorithm (헤드리스, 순수)
// 설계 SSOT: DD-08 §2.6, §3.4 — subset 위상정렬 잔여(사이클 멤버 집합)에서 실제 고리 경로
//   (A1→B1→A1)를 SCC back-edge 추적으로 복원한다. 감지는 증분(위상 잔여), 경로 복원은
//   사용자가 툴팁 열 때 지연(lazy, R2) — 매 편집 전체 순회 금지.
// additive: 신설. FormulaGraph(재사용) 의 precedents 만 읽는다(무수정).
// ============================================================

import type { CellKey } from './types.js';
import type { FormulaGraph } from './FormulaGraph.js';

/**
 * 사이클 멤버 집합에서 대표 고리 경로를 복원하는 리포터(§2.6).
 * / Reporter that recovers representative cycle paths from a set of cycle members (§2.6).
 */
export interface CyclePathReporter {
  /**
   * 사이클 멤버 집합 → 각 멤버의 대표 고리 경로(자기 자신으로 되돌아오는 경로).
   * / Cycle members → a representative cycle path per member (a path back to itself).
   *
   * @param cycleMembers - 위상정렬 잔여(사이클 구성원) / Topological-sort remainder (cycle members)
   * @param graph - 의존성 그래프(precedents 조회) / Dependency graph (precedents lookup)
   * @returns 멤버 → 고리 경로(예: [A,B,A]) / member → cycle path (e.g. [A,B,A])
   */
  recover(cycleMembers: CellKey[], graph: FormulaGraph): Map<CellKey, CellKey[]>;
}

/**
 * DFS back-edge 추적 기본 구현. precedents 방향(내가 읽는 셀)으로 members 내부만 탐색해
 * start 로 되돌아오는 경로를 찾는다. 경로는 [start, …, start] 형태(고리 닫힘).
 * / Default DFS back-edge implementation. Follows the precedents direction within `members` to
 *   find a path returning to `start`. The path is [start, …, start] (closed loop).
 */
export class DefaultCyclePathReporter implements CyclePathReporter {
  recover(cycleMembers: CellKey[], graph: FormulaGraph): Map<CellKey, CellKey[]> {
    const members = new Set(cycleMembers);
    const out = new Map<CellKey, CellKey[]>();
    for (const start of cycleMembers) {
      out.set(start, this._findLoop(start, members, graph));
    }
    return out;
  }

  /** start 로 되돌아오는 최초 고리 경로(DFS). 미발견 시 [start] 단독(방어적). / First loop back to `start` (DFS); [start] alone if none (defensive). */
  private _findLoop(start: CellKey, members: Set<CellKey>, graph: FormulaGraph): CellKey[] {
    const path: CellKey[] = [start];
    const onPath = new Set<CellKey>([start]);

    const dfs = (node: CellKey): boolean => {
      for (const prec of graph.getPrecedents(node)) {
        if (!members.has(prec)) continue;         // 사이클 밖 선행은 무시(부분 진행 보존)
        if (prec === start) {                     // back-edge → 고리 닫힘
          path.push(start);
          return true;
        }
        if (onPath.has(prec)) continue;           // 이미 경로 위(다른 소순환) → 건너뜀
        path.push(prec);
        onPath.add(prec);
        if (dfs(prec)) return true;
        path.pop();
        onPath.delete(prec);
      }
      return false;
    };

    return dfs(start) ? path : [start];
  }
}
