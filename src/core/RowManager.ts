import { DataLayer } from './DataLayer.js';

/**
 * 행 선택(selection)과 체크(checkbox) 상태를 관리하는 매니저. / Manages row selection and checkbox state.
 *
 * 두 상태는 서로 독립적이다 — 선택은 활성/포커스 개념(단일 행만 유지 가능),
 * 체크는 다중 표시(예: 체크박스 컬럼)를 위한 별도 집합이다.
 * / The two states are independent — selection tracks an active/focus concept
 * (can be limited to a single row), while checks are a separate set for
 * multi-marking (e.g. a checkbox column).
 */
export class RowManager<T extends Record<string, any> = any> {
  private _selectedRows: Set<number> = new Set();
  private _checkedRows: Set<number> = new Set();
  private _data: DataLayer<T>;

  constructor(data: DataLayer<T>) {
    this._data = data;
  }

  // ─── Read-only 접근 ───────────────────────────────────────
  /** 선택된 행 인덱스 집합(원본 참조). / Set of selected row indexes (live reference). */
  get selectedRows(): Set<number> { return this._selectedRows; }
  /** 체크된 행 인덱스 집합(원본 참조). / Set of checked row indexes (live reference). */
  get checkedRows(): Set<number> { return this._checkedRows; }

  // ─── 선택 변경 ───────────────────────────────────────────
  /**
   * 단일 행만 선택한다(기존 선택은 모두 해제). / Select exactly one row (clears any prior selection).
   *
   * @param ri - 선택할 행의 flat index / Flat index of the row to select
   */
  selectSingle(ri: number): void {
    this._selectedRows.clear();
    this._selectedRows.add(ri);
  }

  /**
   * 지정 행의 선택 상태를 토글한다(다중 선택 누적). / Toggle a row's selection state (accumulates for multi-select).
   *
   * @param ri - 토글할 행의 flat index / Flat index of the row to toggle
   */
  selectToggle(ri: number): void {
    if (this._selectedRows.has(ri)) this._selectedRows.delete(ri);
    else this._selectedRows.add(ri);
  }

  /** 모든 행 선택을 해제한다. / Clear every row selection. */
  clearSelection(): void { this._selectedRows.clear(); }

  // ─── 체크 변경 ───────────────────────────────────────────
  /**
   * 지정 행의 체크 상태를 설정한다. / Set the checked state of a single row.
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param checked - 체크 여부 / Whether the row should be checked
   */
  check(ri: number, checked: boolean): void {
    if (checked) this._checkedRows.add(ri);
    else this._checkedRows.delete(ri);
  }

  /**
   * 전체 행을 체크하거나 전체 해제한다. / Check or uncheck every row.
   *
   * @param checked - `true` 면 전체 체크, `false` 면 전체 해제 / `true` to check all, `false` to clear all
   * @param totalRows - 전체 행 수(체크 시 0..totalRows-1 을 채움) / Total row count (when checking, fills indexes 0..totalRows-1)
   */
  checkAll(checked: boolean, totalRows: number): void {
    if (checked) {
      for (let i = 0; i < totalRows; i++) this._checkedRows.add(i);
    } else {
      this._checkedRows.clear();
    }
  }

  /**
   * 특정 컬럼 값이 주어진 목록에 포함된 행들을 체크한다. / Check every row whose column value is in the given list.
   *
   * @param field - 값을 비교할 컬럼 field 명 / Column field to compare values against
   * @param values - 매칭 대상 값 목록 / Values to match against
   */
  checkByValue(field: string, values: any[]): void {
    for (let i = 0; i < this._data.rowCount; i++) {
      if (values.includes(this._data.getCellValue(i, field))) this._checkedRows.add(i);
    }
  }

  /** 모든 체크를 해제한다. / Clear every checked row. */
  uncheckAll(): void { this._checkedRows.clear(); }

  /** @internal 미구현 스텁(rowId 기반 체크 API 예약). / @internal Unimplemented stub (reserved for a rowId-based check API). */
  checkById(_ids: string[]): void {}
  /** @internal 미구현 스텁(rowId 기반 체크 추가 API 예약). / @internal Unimplemented stub (reserved for a rowId-based add-check API). */
  addCheckById(_ids: string[]): void {}
  /** @internal 미구현 스텁(rowId 기반 체크 해제 API 예약). / @internal Unimplemented stub (reserved for a rowId-based uncheck API). */
  uncheckById(_ids: string[]): void {}

  // ─── 선택 쿼리 API ───────────────────────────────────────
  /** 현재 선택된 행 데이터 배열을 반환한다(존재하지 않는 인덱스는 제외). / Return the currently selected row data (indexes with no backing row are skipped). */
  getSelections(): T[] {
    return [...this._selectedRows]
      .map(i => this._data.getRowByIndex(i))
      .filter(Boolean) as T[];
  }

  /** 체크된 행을 `{ row, rowIndex }` 쌍의 배열로 반환한다. / Return checked rows as an array of `{ row, rowIndex }` pairs. */
  getChecked(): Array<{ row: T; rowIndex: number }> {
    return [...this._checkedRows].map(i => ({
      row: this._data.getRowByIndex(i) as T,
      rowIndex: i,
    }));
  }

  /** 체크된 행의 데이터만 배열로 반환한다. / Return only the row data of checked rows. */
  getAllChecked(): T[] { return this.getChecked().map(r => r.row); }

  /** 활성(선택) 행의 인덱스를 반환한다(없으면 -1). / Return the active (selected) row's index, or -1 if none. */
  getActiveRow(): number {
    return this._selectedRows.size > 0 ? [...this._selectedRows][0]! : -1;
  }

  /**
   * 지정 행을 활성 상태로 만든다(단일 선택과 동일 동작). / Make the given row active (same effect as single-select).
   *
   * @param index - 활성화할 행의 flat index / Flat index of the row to activate
   */
  activate(index: number): void {
    this._selectedRows.clear();
    this._selectedRows.add(index);
  }

  /** 선택을 해제한다(활성 행 없음). / Deselect (no active row). */
  deselect(): void { this._selectedRows.clear(); }

  // ─── 전체 초기화 (setData / clearData 시) ────────────────
  /** 선택·체크 상태를 모두 초기화한다(주로 `setData`/`clearData` 시 호출). / Reset both selection and check state (typically called on `setData`/`clearData`). */
  reset(): void {
    this._selectedRows.clear();
    this._checkedRows.clear();
  }
}
