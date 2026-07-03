// ============================================================
// FormulaStore — 셀 수식 사이드카 저장소 (값과 분리, §4.1)
// 레이어: Algorithm
// 계약 참조: 11_design_F3_v2.md §4.1(사이드카)·§4.2(신규 DataLayer 메서드 상당 — 여기선
//           DataLayer 를 건드리지 않고 동일 시그니처의 독립 클래스로 제공, 배선은 후속 태스크)
//
// stable-id 앵커(§3.2/C0.5): 키는 (rowId, field) — 정렬/필터에 흔들리지 않는다.
// ============================================================

import { cellKey, type CellKey, type FormulaCell } from './types.js';

export class FormulaStore {
  private readonly _cells: Map<CellKey, FormulaCell> = new Map();

  setFormula(rowId: string, field: string, cell: FormulaCell): void {
    this._cells.set(cellKey(rowId, field), cell);
  }

  getFormula(rowId: string, field: string): FormulaCell | undefined {
    return this._cells.get(cellKey(rowId, field));
  }

  clearFormula(rowId: string, field: string): void {
    this._cells.delete(cellKey(rowId, field));
  }

  hasFormula(rowId: string, field: string): boolean {
    return this._cells.has(cellKey(rowId, field));
  }

  getFormulaByKey(key: CellKey): FormulaCell | undefined {
    return this._cells.get(key);
  }

  getAllFormulaCells(): Array<{ rowId: string; field: string; cell: FormulaCell }> {
    const out: Array<{ rowId: string; field: string; cell: FormulaCell }> = [];
    for (const [key, cell] of this._cells) {
      const idx = key.indexOf(':');
      out.push({ rowId: key.slice(0, idx), field: key.slice(idx + 1), cell });
    }
    return out;
  }

  /** applySort/applyFilter 후크가 dirty 대상으로 모아야 할 range-보유 수식 키(§3.5 P0). */
  getRangeBearingKeys(): CellKey[] {
    const out: CellKey[] = [];
    for (const [key, cell] of this._cells) {
      if (cell.hasRangeRef) out.push(key);
    }
    return out;
  }

  size(): number {
    return this._cells.size;
  }
}
