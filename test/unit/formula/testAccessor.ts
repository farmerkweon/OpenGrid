// ============================================================
// MockGridAccessor — F3 헤드리스 유닛테스트 전용 FormulaGridAccessor 구현
// 실제 FlatRowModel/ColumnLayout/DataLayer 배선은 후속 태스크 몫이며, 이 목은
// "정렬/필터/삭제/숨김"을 흉내내 §3.5/§C1 시나리오를 재현하는 용도다.
// ============================================================

import type { FormulaGridAccessor } from '../../../src/core/formula/types.js';

export class MockGridAccessor implements FormulaGridAccessor {
  private _rows = new Map<string, Record<string, unknown>>();
  private _columns: string[] = [];
  private _hidden = new Set<string>();
  private _displayOrder: string[] = []; // 정렬/필터 반영된 현재 표시 순서(=flat 순서, MVP 단순화)

  addColumn(field: string): void {
    if (!this._columns.includes(field)) this._columns.push(field);
  }

  addRow(rowId: string, data: Record<string, unknown> = {}): void {
    this._rows.set(rowId, { ...data });
    this._displayOrder.push(rowId);
  }

  setValue(rowId: string, field: string, value: unknown): void {
    const row = this._rows.get(rowId);
    if (row) row[field] = value;
  }

  deleteRow(rowId: string): void {
    this._rows.delete(rowId);
    this._displayOrder = this._displayOrder.filter((r) => r !== rowId);
  }

  removeColumn(field: string): void {
    this._columns = this._columns.filter((f) => f !== field);
    this._hidden.delete(field);
  }

  hideColumn(field: string): void {
    this._hidden.add(field);
  }
  unhideColumn(field: string): void {
    this._hidden.delete(field);
  }

  /** 정렬 시뮬레이션: 표시 순서를 완전히 새로 지정. */
  setDisplayOrder(rowIds: string[]): void {
    this._displayOrder = [...rowIds];
  }

  /** 필터 시뮬레이션: 표시 순서에서 일부 rowId만 남김(순서 유지). */
  filterTo(rowIds: Set<string>): void {
    this._displayOrder = this._displayOrder.filter((r) => rowIds.has(r));
  }

  // ── FormulaGridAccessor 구현 ────────────────────────────
  visibleFields(): string[] {
    return this._columns.filter((f) => !this._hidden.has(f));
  }
  rowIdAtFlat(flatIndex: number): string | null {
    return this._displayOrder[flatIndex] ?? null;
  }
  flatIndexOfRowId(rowId: string): number {
    return this._displayOrder.indexOf(rowId);
  }
  displayedRowIds(): string[] {
    return [...this._displayOrder];
  }
  getCellValue(rowId: string, field: string): unknown {
    return this._rows.get(rowId)?.[field] ?? null;
  }
  hasRow(rowId: string): boolean {
    return this._rows.has(rowId);
  }
  hasField(field: string): boolean {
    return this._columns.includes(field);
  }
}
