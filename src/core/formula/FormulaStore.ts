// ============================================================
// FormulaStore — 셀 수식 사이드카 저장소 (값과 분리, §4.1)
// 레이어: Algorithm
// 계약 참조: 11_design_F3_v2.md §4.1(사이드카)·§4.2(신규 DataLayer 메서드 상당 — 여기선
//           DataLayer 를 건드리지 않고 동일 시그니처의 독립 클래스로 제공, 배선은 후속 태스크)
//
// stable-id 앵커(§3.2/C0.5): 키는 (rowId, field) — 정렬/필터에 흔들리지 않는다.
// ============================================================

import { cellKey, type CellKey, type FormulaCell } from './types.js';

/**
 * 셀 수식 사이드카 저장소. 값과 분리해 (rowId, field) 키로 수식 셀을 보관한다(§4.1).
 * stable-id 앵커(§3.2/C0.5)라 정렬/필터에 흔들리지 않는다.
 * / Sidecar store for cell formulas. Keeps formula cells keyed by (rowId, field), separate
 *   from values (§4.1). The stable-id anchor (§3.2/C0.5) keeps keys stable across sort/filter.
 */
export class FormulaStore {
  private readonly _cells: Map<CellKey, FormulaCell> = new Map();

  /**
   * (rowId, field) 셀에 수식을 저장한다(기존이 있으면 덮어쓴다).
   * / Store a formula for the (rowId, field) cell (overwrites any existing entry).
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @param field - 컬럼 field 명 / Column field name
   * @param cell - 저장할 수식 셀 / Formula cell to store
   */
  setFormula(rowId: string, field: string, cell: FormulaCell): void {
    this._cells.set(cellKey(rowId, field), cell);
  }

  /**
   * (rowId, field) 셀의 수식을 조회한다.
   * / Look up the formula for the (rowId, field) cell.
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @param field - 컬럼 field 명 / Column field name
   * @returns 수식 셀 또는 없으면 undefined / The formula cell, or undefined if absent
   */
  getFormula(rowId: string, field: string): FormulaCell | undefined {
    return this._cells.get(cellKey(rowId, field));
  }

  /**
   * (rowId, field) 셀의 수식을 제거한다.
   * / Remove the formula for the (rowId, field) cell.
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @param field - 컬럼 field 명 / Column field name
   */
  clearFormula(rowId: string, field: string): void {
    this._cells.delete(cellKey(rowId, field));
  }

  /**
   * (rowId, field) 셀에 수식이 있는지 여부.
   * / Whether the (rowId, field) cell has a formula.
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @param field - 컬럼 field 명 / Column field name
   * @returns 수식 존재 여부 / Whether a formula exists
   */
  hasFormula(rowId: string, field: string): boolean {
    return this._cells.has(cellKey(rowId, field));
  }

  /**
   * CellKey 로 직접 수식을 조회한다(내부 키를 이미 알고 있을 때).
   * / Look up a formula directly by CellKey (when the internal key is already known).
   *
   * @param key - 셀 키(rowId+field 합성) / Cell key (composite of rowId+field)
   * @returns 수식 셀 또는 없으면 undefined / The formula cell, or undefined if absent
   */
  getFormulaByKey(key: CellKey): FormulaCell | undefined {
    return this._cells.get(key);
  }

  /**
   * 저장된 모든 수식 셀을 (rowId, field, cell) 형태로 나열한다.
   * / List every stored formula cell as { rowId, field, cell }.
   *
   * @returns 전체 수식 셀 배열 / Array of all formula cells
   */
  getAllFormulaCells(): Array<{ rowId: string; field: string; cell: FormulaCell }> {
    const out: Array<{ rowId: string; field: string; cell: FormulaCell }> = [];
    for (const [key, cell] of this._cells) {
      const idx = key.indexOf(':');
      out.push({ rowId: key.slice(0, idx), field: key.slice(idx + 1), cell });
    }
    return out;
  }

  /**
   * applySort/applyFilter 후크가 dirty 대상으로 모아야 할 range-보유 수식 키들(§3.5 P0).
   * / Keys of formulas that hold a range reference — the set applySort/applyFilter hooks must
   *   mark dirty (§3.5 P0).
   *
   * @returns 범위 참조를 가진 수식 셀 키 배열 / Array of formula cell keys bearing a range reference
   */
  getRangeBearingKeys(): CellKey[] {
    const out: CellKey[] = [];
    for (const [key, cell] of this._cells) {
      if (cell.hasRangeRef) out.push(key);
    }
    return out;
  }

  /**
   * 저장된 수식 셀 개수.
   * / Number of stored formula cells.
   *
   * @returns 수식 셀 개수 / Count of formula cells
   */
  size(): number {
    return this._cells.size;
  }
}
