// ============================================================
// FormulaGraph — 의존성 그래프 (precedents/dependents 양방향) + Kahn 위상정렬
// 레이어: Algorithm (DOM/렌더러/DataLayer 전혀 모름 — §5.1)
// 계약 참조: 11_design_F3_v2.md §5.1~§5.4(그래프/Kahn/사이클)·§9 E3/E14
//           Spike-A(spikes/spike-a-recalc/recalc-bench.mjs) 와 동일 철학:
//           Map<string,Set<string>> 두 개(precedents/dependents), BFS 폐포, Kahn 위상.
//
// 동적 의존성(F3-R21 "재작성" 대응): addFormula(key, deps) 는 매 평가마다 "이번에 실제로
// 읽은" deps 로 엣지를 재등록한다(기존 엣지 전부 제거 후 재구성) — 범위 참조처럼 멤버십이
// 정렬/필터로 바뀌는 경우에도 다음 평가 시점에 그래프가 항상 최신 상태를 유지한다.
// ============================================================

import { cellKey, parseCellKey, type CellKey } from './types.js';

export class FormulaGraph {
  /** cellKey(수식) → 그 수식이 참조하는 선행 셀 키 집합. */
  private readonly _precedents: Map<CellKey, Set<CellKey>> = new Map();
  /** cellKey(임의: 수식이든 값 리프든) → 그 키를 참조하는 수식 키 집합(dirty 전파 방향). */
  private readonly _dependents: Map<CellKey, Set<CellKey>> = new Map();
  /** rowId → 그 rowId의 "어떤 field"든 deps 로 가진 수식 키 집합(행 삭제 역조회, §5.1). */
  private readonly _byRowId: Map<string, Set<CellKey>> = new Map();
  /** field → 그 field 를 deps 로 가진 수식 키 집합(열 삭제 역조회). */
  private readonly _byField: Map<string, Set<CellKey>> = new Map();

  private _addEdge(precedentKey: CellKey, dependentFormulaKey: CellKey): void {
    let set = this._dependents.get(precedentKey);
    if (!set) { set = new Set(); this._dependents.set(precedentKey, set); }
    set.add(dependentFormulaKey);

    const { rowId, field } = parseCellKey(precedentKey);
    let byRow = this._byRowId.get(rowId);
    if (!byRow) { byRow = new Set(); this._byRowId.set(rowId, byRow); }
    byRow.add(dependentFormulaKey);
    let byField = this._byField.get(field);
    if (!byField) { byField = new Set(); this._byField.set(field, byField); }
    byField.add(dependentFormulaKey);
  }

  private _removeEdgesFrom(key: CellKey): void {
    const prev = this._precedents.get(key);
    if (!prev) return;
    for (const dep of prev) {
      const set = this._dependents.get(dep);
      if (set) {
        set.delete(key);
        if (set.size === 0) this._dependents.delete(dep);
      }
      const { rowId, field } = parseCellKey(dep);
      const byRow = this._byRowId.get(rowId);
      if (byRow) { byRow.delete(key); if (byRow.size === 0) this._byRowId.delete(rowId); }
      const byField = this._byField.get(field);
      if (byField) { byField.delete(key); if (byField.size === 0) this._byField.delete(field); }
    }
  }

  /** key(수식 셀)의 선행 엣지를 deps 로 완전히 교체한다(§5.1 addFormula). */
  addFormula(key: CellKey, deps: Set<CellKey>): void {
    this._removeEdgesFrom(key);
    this._precedents.set(key, new Set(deps));
    for (const dep of deps) this._addEdge(dep, key);
  }

  /** 수식 삭제(clearCellFormula) — 엣지 + 역인덱스 정리. */
  removeFormula(key: CellKey): void {
    this._removeEdgesFrom(key);
    this._precedents.delete(key);
  }

  isFormula(key: CellKey): boolean {
    return this._precedents.has(key);
  }

  getPrecedents(key: CellKey): CellKey[] {
    return [...(this._precedents.get(key) ?? [])];
  }

  getDependents(key: CellKey): CellKey[] {
    return [...(this._dependents.get(key) ?? [])];
  }

  /**
   * dirty 폐포(BFS): seeds 로부터 도달 가능한 모든 dependents(수식 노드만, dependents 맵의
   * value 는 항상 수식 키이므로 자동 보장). seed 자신이 수식이면 폐포에 포함한다
   * (§5.3 "수식 셀 편집 → 자신 + dependents dirty").
   */
  getDependentsClosure(seeds: CellKey[]): CellKey[] {
    const visited = new Set<CellKey>();
    for (const s of seeds) {
      if (this.isFormula(s)) visited.add(s);
    }
    const queue = [...seeds];
    let qi = 0;
    while (qi < queue.length) {
      const k = queue[qi++];
      const next = this._dependents.get(k);
      if (!next) continue;
      for (const d of next) {
        if (!visited.has(d)) { visited.add(d); queue.push(d); }
      }
    }
    return [...visited];
  }

  /** Kahn 위상정렬(subset 내부 선행수 기준, §5.4). 잔여 노드 = 사이클 구성원. */
  topoOrder(subset: CellKey[]): { order: CellKey[]; cycles: CellKey[] } {
    const subsetSet = new Set(subset);
    const indeg = new Map<CellKey, number>();
    for (const n of subset) {
      const prec = this._precedents.get(n);
      let d = 0;
      if (prec) for (const p of prec) if (subsetSet.has(p)) d++;
      indeg.set(n, d);
    }
    const queue: CellKey[] = [];
    for (const [n, d] of indeg) if (d === 0) queue.push(n);
    let qi = 0;
    const order: CellKey[] = [];
    while (qi < queue.length) {
      const n = queue[qi++];
      order.push(n);
      const deps = this._dependents.get(n);
      if (!deps) continue;
      for (const d of deps) {
        if (!subsetSet.has(d)) continue;
        const nd = (indeg.get(d) ?? 0) - 1;
        indeg.set(d, nd);
        if (nd === 0) queue.push(d);
      }
    }
    const orderedSet = new Set(order);
    const cycles = subset.filter((n) => !orderedSet.has(n));
    return { order, cycles };
  }

  /**
   * 삭제 무효화 역조회(§5.1/F3-R28 P0): 특정 rowId(전체 field, field 생략 시) 또는
   * (rowId,field) 특정 셀을 deps 로 가진 수식 키들. removeRow/removeColumn 후크가
   * 이 결과를 onValuesChanged 의 seed 로 넘기면(대상 rowId/field 는 이미 grid 에서
   * 제거된 상태이므로) 평가 시 accessor.hasRow/hasField 가 false 를 반환해 자연스럽게
   * #REF 로 귀결한다(별도 특수 처리 없이 일반 재계산 경로 재사용).
   */
  formulasReferencing(rowId: string, field?: string): CellKey[] {
    if (field !== undefined) {
      return [...(this._dependents.get(cellKey(rowId, field)) ?? [])];
    }
    return [...(this._byRowId.get(rowId) ?? [])];
  }

  /** 열 삭제 역조회(field 단독 기준, §5.1). */
  formulasReferencingField(field: string): CellKey[] {
    return [...(this._byField.get(field) ?? [])];
  }

  /** 등록된 모든 수식 키(recalculateAll 전체 재계산용). */
  allFormulaKeys(): CellKey[] {
    return [...this._precedents.keys()];
  }
}
