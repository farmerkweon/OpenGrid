import type { SortItem, FilterItem } from './types.js';

type RowState = 'added' | 'edited' | 'removed' | 'none';

interface RowMeta {
  state: RowState;
  original?: any;
  rowId: string;
}

let _rowIdSeq = 0;
function nextRowId(): string {
  return `og-r-${++_rowIdSeq}`;
}

/**
 * 그리드 데이터 모델 계층(C0 DataLayer). / Grid data model layer (contract C0 DataLayer).
 *
 * 원본 데이터·변경 추적(added/edited/removed)·정렬/필터 후 표시 인덱스·rowId 역매핑을 관리한다.
 * 각 행에는 안정적 rowId 를 부여하여 정렬/필터로 순서가 바뀌어도 같은 논리 레코드를 가리킬 수 있다.
 * / Manages source data, change tracking (added/edited/removed), the post-sort/filter display index,
 *   and the rowId reverse map. Each row is assigned a stable rowId so it keeps pointing to the same
 *   logical record even as sorting/filtering reorders rows.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * const layer = new DataLayer();
 * layer.setData([{ name: 'Kim' }, { name: 'Lee' }]);
 * layer.updateCell(0, 'name', 'Park');
 * layer.getChanges(); // { added, edited, removed }
 */
export class DataLayer<T extends Record<string, any> = any> {
  private _data: T[] = [];
  private _original: T[] = [];
  private _meta: Map<string, RowMeta> = new Map();
  private _idField: string;

  // 정렬/필터 적용 후 표시되는 인덱스 목록
  private _displayIndexes: number[] = [];

  // rowId → _data 인덱스 역매핑
  private _idMap: Map<string, number> = new Map();

  /**
   * rowId → DataLayer 원본(_data) 인덱스 조회. / rowId → source (`_data`) index lookup.
   *
   * Phase 0 인프라(FlatRowModel.ts, C0.3 FlatRowRef.dataIndex) 해소 전용 — 내부 역매핑을
   * 직접 노출하지 않고 단건 조회만 허용한다. 없으면 undefined(삭제된 행 등).
   * / Serves the Phase 0 infrastructure (contract C0.3 FlatRowRef.dataIndex) — exposes a single
   *   lookup rather than the internal reverse map. Returns undefined when absent (e.g. removed rows).
   *
   * @param rowId - 안정적 행 id / Stable row id
   * @returns 원본 인덱스, 없으면 undefined / Source index, or undefined
   */
  getDataIndexByRowId(rowId: string): number | undefined {
    return this._idMap.get(rowId);
  }

  // F3: 찾기 바 전용 크로스-필드 OR 필터
  private _findQuery:  string   = '';
  private _findFields: string[] = [];

  // Phase 2: strategy 슬롯 resolver(미설정 시 default 폴백 = 현행 로직).
  private _getStrategy: <F extends Function>(slot: string, fallback: F) => F =
    (_slot, fallback) => fallback;

  /**
   * 데이터 계층 생성. / Create the data layer.
   *
   * @param idField - 각 행에 부여할 rowId 필드명(기본 '_ogRowId') / Field name that holds each row's rowId (default '_ogRowId')
   */
  constructor(idField: string = '_ogRowId') {
    this._idField = idField;
  }

  /**
   * Phase 2: 전략 resolver 주입 — 슬롯 sortComparator/filterPredicate 도달용.
   * / Phase 2: inject the strategy resolver — routes to the sortComparator/filterPredicate slots.
   *
   * OpenGrid 가 OverrideKernel.getStrategy 를 넘긴다. / OpenGrid passes OverrideKernel.getStrategy.
   *
   * @param resolver - 슬롯명+폴백을 받아 실제 전략 함수를 반환 / Takes a slot name + fallback and returns the effective strategy fn
   */
  setStrategyResolver(resolver: <F extends Function>(slot: string, fallback: F) => F): void {
    this._getStrategy = resolver;
  }

  // ─── 데이터 설정 ──────────────────────────────────────
  /**
   * 데이터 전체 교체 — 각 행에 rowId 부여, 원본 스냅샷 저장, 표시 인덱스 초기화.
   * / Replace all data — assigns a rowId per row, snapshots the original, resets the display index.
   *
   * @param data - 설정할 행 배열 / Rows to set
   */
  setData(data: T[]): void {
    this._data = data.map(row => {
      const id = nextRowId();
      const item = { ...row, [this._idField]: id };
      this._meta.set(id, { state: 'none', rowId: id });
      return item as T;
    });
    this._original = this._data.map(r => ({ ...r }));
    this._rebuildIdMap();
    this._displayIndexes = this._data.map((_, i) => i);
  }

  /**
   * 정렬/필터가 적용된 표시 순서의 행 배열 반환. / Return rows in the applied sort/filter display order.
   *
   * @returns 표시 순서 행 배열 / Rows in display order
   */
  getData(): T[] {
    return this._displayIndexes.map(i => this._data[i]!);
  }

  /**
   * setData 시점의 원본 데이터 스냅샷 반환. / Return the original data snapshot taken at setData time.
   *
   * @returns 원본 행 배열(복사본) / A copy of the original rows
   */
  getOriginalData(): T[] {
    return [...this._original];
  }

  /**
   * 정렬/필터·soft-delete 무시하고 전체 행 반환. / Return all rows, ignoring sort/filter and soft-delete.
   *
   * @returns 전체 행 배열(복사본) / A copy of all rows
   */
  getAllData(): T[] {
    return [...this._data];
  }

  /** 모든 데이터·메타·인덱스 초기화. / Clear all data, metadata, and indexes. */
  clearData(): void {
    this._data = [];
    this._original = [];
    this._meta.clear();
    this._idMap.clear();
    this._displayIndexes = [];
  }

  /** 표시(정렬/필터 후) 행 수. / Displayed (post sort/filter) row count. */
  get rowCount(): number {
    return this._displayIndexes.length;
  }

  /** 전체(soft-delete 포함) 행 수. / Total row count (including soft-deleted). */
  get totalRowCount(): number {
    return this._data.length;
  }

  // ─── 행 CRUD ──────────────────────────────────────────
  /**
   * 행 추가 — added 상태로 표시되고 표시 인덱스에 반영된다. / Add a row — marked as `added` and reflected in the display index.
   *
   * @param item - 추가할 부분 행(rowId 자동 부여) / Partial row to add (rowId assigned automatically)
   * @param position - 삽입 위치: 'first' | 'last' | 표시 인덱스(기본 'last') / Insert position: 'first' | 'last' | display index (default 'last')
   */
  addRow(item: Partial<T>, position: 'first' | 'last' | number = 'last'): void {
    const id = nextRowId();
    const row = { ...item, [this._idField]: id } as T;
    this._meta.set(id, { state: 'added', rowId: id });

    if (position === 'last') {
      const idx = this._data.push(row) - 1;
      this._idMap.set(id, idx);
      this._displayIndexes.push(idx);
    } else if (position === 'first') {
      this._data.unshift(row);
      this._rebuildIdMap();
      this._displayIndexes.unshift(0);
    } else {
      const dispPos = Math.min(position, this._displayIndexes.length);
      const dataIdx = dispPos < this._displayIndexes.length
        ? this._displayIndexes[dispPos]!
        : this._data.length;
      this._data.splice(dataIdx, 0, row);
      this._rebuildIdMap();
      this._displayIndexes = this._data.map((_, i) => i);
    }
  }

  /**
   * 행 삭제 — 새로 추가된 행은 완전 삭제, 기존 행은 soft-delete(removed 표시).
   * / Remove a row — newly added rows are fully deleted; existing rows are soft-deleted (marked removed).
   *
   * @param rowIndex - 표시 순서 행 인덱스 / Display-order row index
   * @returns 삭제된 행, 없으면 undefined / The removed row, or undefined
   */
  removeRow(rowIndex: number): T | undefined {
    const dataIdx = this._displayIndexes[rowIndex];
    if (dataIdx === undefined) return undefined;

    const row = this._data[dataIdx]!;
    const id = row[this._idField] as string;
    const meta = this._meta.get(id);

    if (meta?.state === 'added') {
      // 새로 추가된 행은 완전 삭제
      this._data.splice(dataIdx, 1);
      this._meta.delete(id);
    } else {
      // 기존 행은 soft delete
      this._meta.set(id, { ...meta!, state: 'removed' });
    }

    this._rebuildIdMap();
    this._displayIndexes = this._data
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => this._meta.get(r[this._idField] as string)?.state !== 'removed')
      .map(({ i }) => i);

    return row;
  }

  /**
   * 행 이동 — 표시 인덱스 기준으로 원본 배열에서 실제 위치를 옮긴다. / Move a row — repositions it in the source array by display index.
   *
   * @param fromDisplayIdx - 원래 표시 인덱스 / Source display index
   * @param toDisplayIdx - 목표 표시 인덱스 / Target display index
   */
  moveRow(fromDisplayIdx: number, toDisplayIdx: number): void {
    const fromDataIdx = this._displayIndexes[fromDisplayIdx];
    const toDataIdx   = this._displayIndexes[toDisplayIdx];
    if (fromDataIdx === undefined || toDataIdx === undefined) return;

    // _data 배열에서 실제 이동
    const [row] = this._data.splice(fromDataIdx, 1);
    const insertAt = fromDataIdx < toDataIdx ? toDataIdx - 1 : toDataIdx;
    this._data.splice(insertAt, 0, row!);

    this._rebuildIdMap();
    this._displayIndexes = this._data
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => this._meta.get(r[this._idField] as string)?.state !== 'removed')
      .map(({ i }) => i);
  }

  /**
   * 셀 값 수정 — 최초 수정 시 원본을 백업하고 상태를 edited 로 전이. / Update a cell — backs up the original on first edit and transitions state to `edited`.
   *
   * @param rowIndex - 표시 순서 행 인덱스 / Display-order row index
   * @param field - 컬럼 field 명 / Column field name
   * @param value - 기록할 값 / Value to write
   * @returns 성공하면 true, 대상 행이 없으면 false / true on success, false when the row is absent
   */
  updateCell(rowIndex: number, field: string, value: any): boolean {
    const dataIdx = this._displayIndexes[rowIndex];
    if (dataIdx === undefined) return false;

    const row = this._data[dataIdx]!;
    const id = row[this._idField] as string;
    const meta = this._meta.get(id);

    // original 백업
    if (meta?.state === 'none') {
      this._meta.set(id, {
        ...meta,
        state: 'edited',
        original: { ...this._original[dataIdx] }
      });
    }

    (this._data[dataIdx] as any)[field] = value;
    return true;
  }

  /**
   * 표시 순서 인덱스로 행 조회. / Get a row by display-order index.
   *
   * @param rowIndex - 표시 순서 행 인덱스 / Display-order row index
   * @returns 행, 없으면 undefined / The row, or undefined
   */
  getRowByIndex(rowIndex: number): T | undefined {
    const dataIdx = this._displayIndexes[rowIndex];
    return dataIdx !== undefined ? this._data[dataIdx] : undefined;
  }

  /**
   * 표시 순서 인덱스 + field 로 셀 값 조회. / Get a cell value by display index + field.
   *
   * @param rowIndex - 표시 순서 행 인덱스 / Display-order row index
   * @param field - 컬럼 field 명 / Column field name
   * @returns 셀 값, 없으면 undefined / The cell value, or undefined
   */
  getCellValue(rowIndex: number, field: string): any {
    return this.getRowByIndex(rowIndex)?.[field];
  }

  // ─── F3(수식) stable-id 기반 접근자 ────────────────────
  // F3(formula) stable-id based accessors.
  // FormulaGridAccessor(RecalcCoordinator 주입, C0.5 stable-id 앵커) 구현에 쓰인다.
  // 정렬/필터로 흔들리는 displayIndex 가 아니라 rowId 로 직접 조회하므로 이 그룹의
  // 메서드는 applySort/applyFilter/moveRow 와 무관하게 항상 같은 논리 레코드를 가리킨다.
  // / Used by FormulaGridAccessor (injected into RecalcCoordinator, contract C0.5 stable-id anchor).
  //   These look up by rowId rather than the sort/filter-volatile displayIndex, so they always point
  //   to the same logical record regardless of applySort/applyFilter/moveRow.

  /**
   * rowId 가 아직 존재(soft-delete 제외)하는지 판정(F3-R28 삭제 무효화). / Whether a rowId still exists (excluding soft-delete) (F3-R28 delete invalidation).
   *
   * @param rowId - 안정적 행 id / Stable row id
   * @returns 존재하고 삭제되지 않았으면 true / true if present and not removed
   */
  hasRow(rowId: string): boolean {
    const idx = this._idMap.get(rowId);
    if (idx === undefined) return false;
    return this._meta.get(rowId)?.state !== 'removed';
  }

  /**
   * rowId → 원본 행 조회(soft-delete 된 행은 undefined, F3-R28). / rowId → row lookup (soft-deleted rows return undefined, F3-R28).
   *
   * @param rowId - 안정적 행 id / Stable row id
   * @returns 행, 없거나 삭제되었으면 undefined / The row, or undefined if absent/removed
   */
  getRowById(rowId: string): T | undefined {
    if (!this.hasRow(rowId)) return undefined;
    const idx = this._idMap.get(rowId)!;
    return this._data[idx];
  }

  /**
   * rowId + field 로 셀 값 조회(정렬/필터 무관). / Get a cell value by rowId + field (independent of sort/filter).
   *
   * @param rowId - 안정적 행 id / Stable row id
   * @param field - 컬럼 field 명 / Column field name
   * @returns 셀 값, 없으면 undefined / The cell value, or undefined
   */
  getCellValueByRowId(rowId: string, field: string): any {
    return this.getRowById(rowId)?.[field];
  }

  /**
   * 수식 재계산 결과 기록(§4.2/C2.2). / Write a formula recalculation result (contract §4.2/C2.2).
   *
   * 일반 updateCell 과 달리 meta.state 를 건드리지 않고(edited 오염 방지) dataChange 도 발화하지
   * 않는다(호출부가 배치 종료 후 formulaRecalc 1회로 표면화할 책임을 진다).
   * / Unlike updateCell, this does not touch meta.state (to avoid polluting `edited`) and does not
   *   emit dataChange (the caller surfaces the batch via a single formulaRecalc afterwards).
   *
   * @param rowId - 안정적 행 id / Stable row id
   * @param field - 컬럼 field 명 / Column field name
   * @param value - 계산된 값 / Computed value
   */
  setComputedValueByRowId(rowId: string, field: string, value: any): void {
    const idx = this._idMap.get(rowId);
    if (idx === undefined) return;
    (this._data[idx] as any)[field] = value;
  }

  // ─── 변경 추적 ────────────────────────────────────────
  /**
   * 수정된 행만 반환(추가/삭제 제외). / Return only edited rows (excluding added/removed).
   *
   * @returns edited 상태 행 배열 / Rows in the `edited` state
   */
  getEditedRows(): T[] {
    return this._data.filter(r =>
      this._meta.get(r[this._idField] as string)?.state === 'edited'
    );
  }

  /**
   * 수정된 행만 반환(하위 호환용 — 신규 코드는 getEditedRows() 사용).
   * / Return only edited rows (legacy alias — new code should use getEditedRows()).
   *
   * @returns edited 상태 행 배열 / Rows in the `edited` state
   */
  getChangedRows(): T[] { return this.getEditedRows(); }

  /**
   * 추가된 행만 반환. / Return only added rows.
   *
   * @returns added 상태 행 배열 / Rows in the `added` state
   */
  getAddedRows(): T[] {
    return this._data.filter(r =>
      this._meta.get(r[this._idField] as string)?.state === 'added'
    );
  }

  /**
   * 삭제(soft-delete)된 행만 반환. / Return only removed (soft-deleted) rows.
   *
   * @returns removed 상태 행 배열 / Rows in the `removed` state
   */
  getRemovedRows(): T[] {
    return this._data.filter(r =>
      this._meta.get(r[this._idField] as string)?.state === 'removed'
    );
  }

  /**
   * 추가/수정/삭제 모든 변경사항을 한 번에 반환. / Return all added/edited/removed changes at once.
   *
   * edited 행에는 _changedFields 배열도 포함. / Edited rows also carry a `_changedFields` array.
   *
   * @returns { added, edited, removed } 변경 묶음 / An { added, edited, removed } change bundle
   */
  getChanges(): { added: T[]; edited: T[]; removed: T[] } {
    const added: T[]   = [];
    const edited: T[]  = [];
    const removed: T[] = [];

    for (const row of this._data) {
      const id    = row[this._idField] as string;
      const meta  = this._meta.get(id);
      const state = meta?.state ?? 'none';
      if (state === 'added')   { added.push({ ...row }); }
      else if (state === 'removed') { removed.push({ ...row }); }
      else if (state === 'edited') {
        const orig = meta!.original ?? {};
        const changedFields = Object.keys(row).filter(
          k => k !== this._idField && row[k] !== orig[k]
        );
        edited.push({ ...row, _changedFields: changedFields } as any);
      }
    }
    return { added, edited, removed };
  }

  /**
   * 수정된 컬럼 정보 반환 — 각 edited 행에 대해 { row, fields, diff } 반환.
   * / Return changed-column info — for each edited row, yields { row, fields, diff }.
   *
   * diff 는 { field, oldValue, newValue } 배열. / `diff` is an array of { field, oldValue, newValue }.
   *
   * @returns edited 행별 변경 컬럼 상세 배열 / Per-edited-row changed-column details
   */
  getChangedColumns(): Array<{ row: T; fields: string[]; diff: Array<{ field: string; oldValue: any; newValue: any }> }> {
    return this._data
      .filter(r => this._meta.get(r[this._idField] as string)?.state === 'edited')
      .map(row => {
        const orig = this._meta.get(row[this._idField] as string)?.original ?? {};
        const diff: Array<{ field: string; oldValue: any; newValue: any }> = [];
        for (const key of Object.keys(row)) {
          if (key === this._idField) continue;
          if (row[key] !== orig[key]) {
            diff.push({ field: key, oldValue: orig[key], newValue: row[key] });
          }
        }
        return { row: { ...row }, fields: diff.map(d => d.field), diff };
      });
  }

  /**
   * 지정 행의 원본(수정 전) 데이터 반환. / Return the original (pre-edit) data for a row.
   *
   * 추가된 행은 undefined. / Added rows return undefined.
   *
   * @param rowIndex - 표시 순서 행 인덱스 / Display-order row index
   * @returns 원본 행, 추가/미존재면 undefined / The original row, or undefined for added/absent rows
   */
  getOriginalRow(rowIndex: number): T | undefined {
    const dataIdx = this._displayIndexes[rowIndex];
    if (dataIdx === undefined) return undefined;
    const row  = this._data[dataIdx]!;
    const meta = this._meta.get(row[this._idField] as string);
    if (!meta || meta.state === 'added') return undefined;
    if (meta.state === 'edited' && meta.original) return { ...meta.original } as T;
    return { ...this._original[dataIdx] } as T;
  }

  /**
   * 각 행에 편집 상태를 지정 필드로 얹어 전체 행 반환. / Return all rows with each row's edit state attached under the given field.
   *
   * @param stateField - 상태를 담을 필드명 / Field name to hold the state
   * @returns 상태가 부착된 전체 행 배열 / All rows with the state field attached
   */
  getRowsWithState(stateField: string): T[] {
    return this._data.map(r => {
      const state = this._meta.get(r[this._idField] as string)?.state ?? 'none';
      return { ...r, [stateField]: state };
    });
  }

  /**
   * 지정 행의 편집 상태 반환. / Return the edit state of a row.
   *
   * @param rowIndex - 표시 순서 행 인덱스 / Display-order row index
   * @returns 'added' | 'edited' | 'removed' | 'none' / One of 'added' | 'edited' | 'removed' | 'none'
   */
  getRowState(rowIndex: number): RowState {
    const row = this.getRowByIndex(rowIndex);
    if (!row) return 'none';
    return this._meta.get(row[this._idField] as string)?.state ?? 'none';
  }

  // ─── 정렬 ─────────────────────────────────────────────
  /**
   * 다중 키 정렬 적용 — 표시 인덱스를 재배열한다. / Apply multi-key sorting — reorders the display index.
   *
   * 빈 목록이면 원본 순서로 복원한다. Schwartzian transform 으로 비교 비용을 낮추고,
   * 비교자는 Phase 2 sortComparator 슬롯을 통해 오버라이드될 수 있다(기본은 내장 비교).
   * / An empty list restores source order. Uses a Schwartzian transform to cut comparison cost; the
   *   comparator can be overridden via the Phase 2 sortComparator slot (built-in comparison by default).
   *
   * @param sortList - {field, dir} 정렬 키 목록(우선순위 순) / Sort keys {field, dir} in priority order
   */
  applySort(sortList: SortItem[]): void {
    const notRemoved = (i: number) =>
      this._meta.get((this._data[i] as any)?.[this._idField])?.state !== 'removed';

    if (sortList.length === 0) {
      this._displayIndexes = this._data.map((_, i) => i).filter(notRemoved);
      return;
    }

    // Schwartzian transform: 키를 미리 추출하여 sort comparator 비용 절감
    const keyed = this._displayIndexes
      .filter(notRemoved)
      .map(idx => {
        const row = this._data[idx]!;
        return {
          idx,
          keys: sortList.map(s => row[s.field]),
        };
      });

    // Phase 2 슬롯 #1: 단일키 비교자. default = 현행 인라인(number는 av-bv, 그 외 String, null 우선).
    //   멀티키 루프가 단일키 비교를 래핑. dir 부호 적용은 호출자(루프) 책임이므로 슬롯은 비교만.
    //   ⚠️ 핫패스(행쌍당) — 슬롯 fn 예외는 호출자 책임(try/catch 비감쌈).
    const cmpStrategy = this._getStrategy(
      'sortComparator',
      (a: any, b: any, _field: string, _dir: 'asc' | 'desc'): number => {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        const sa = String(a), sb = String(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      },
    );

    keyed.sort((a, b) => {
      for (let si = 0; si < sortList.length; si++) {
        const dir = sortList[si]!.dir;
        const field = sortList[si]!.field;
        const av = a.keys[si];
        const bv = b.keys[si];
        const cmp = cmpStrategy(av, bv, field, dir);
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });

    this._displayIndexes = keyed.map(k => k.idx);
  }

  // ─── 필터 ─────────────────────────────────────────────
  /**
   * 컬럼별 필터 + F3 찾기 바(전체 컬럼 OR)를 적용해 표시 인덱스를 재계산. / Recompute the display index by applying per-column filters plus the F3 find bar (cross-column OR).
   *
   * 같은 컬럼의 여러 조건은 AND, 컬럼 간에도 AND 이며, 찾기 바는 지정 필드들에 대해 OR 로 결합된다.
   * 술어는 Phase 2 filterPredicate 슬롯으로 오버라이드될 수 있다(기본은 모듈 matchFilter).
   * / Multiple conditions on the same column are ANDed, columns are ANDed together, and the find bar
   *   ORs across its fields. The predicate can be overridden via the Phase 2 filterPredicate slot
   *   (module `matchFilter` by default).
   *
   * @param filters - field → 필터 조건 배열 맵 / Map of field → array of filter conditions
   */
  applyFilter(filters: Record<string, FilterItem[]>): void {
    const fields = Object.keys(filters);

    // Phase 2 슬롯 #2: 필터 술어. default = 모듈 matchFilter(operator switch).
    //   ⚠️ 핫패스(셀당) — 슬롯 fn 예외는 호출자 책임.
    const predicate = this._getStrategy(
      'filterPredicate',
      (value: any, fi: FilterItem, _field: string): boolean => matchFilter(value, fi),
    );

    this._displayIndexes = this._data
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => {
        if (this._meta.get(r[this._idField] as string)?.state === 'removed') return false;
        // 컬럼별 AND 필터
        if (fields.length > 0) {
          if (!fields.every(field => {
            const val = r[field];
            return filters[field]!.every(fi => predicate(val, fi, field));
          })) return false;
        }
        // F3 찾기 바: 전체 컬럼 OR 검색
        if (this._findQuery && this._findFields.length > 0) {
          const q = this._findQuery;
          const matched = this._findFields.some(f => {
            const v = r[f];
            return v != null && String(v).toLowerCase().includes(q);
          });
          if (!matched) return false;
        }
        return true;
      })
      .map(({ i }) => i);
  }

  /**
   * F3: 찾기 바 전체 컬럼 OR 검색 설정(대소문자 무시). / F3: configure the find bar's cross-column OR search (case-insensitive).
   *
   * 다음 applyFilter 호출부터 반영된다. / Takes effect from the next applyFilter call.
   *
   * @param query - 검색어(소문자로 정규화됨) / Search query (normalized to lowercase)
   * @param fields - OR 검색 대상 field 목록 / Fields to OR-search across
   */
  setFindFilter(query: string, fields: string[]): void {
    this._findQuery  = query.toLowerCase();
    this._findFields = fields;
  }

  // ─── 내부 유틸 ────────────────────────────────────────
  private _rebuildIdMap(): void {
    this._idMap.clear();
    this._data.forEach((r, i) => {
      this._idMap.set(r[this._idField] as string, i);
    });
  }
}

function matchFilter(value: any, fi: FilterItem): boolean {
  const v = value;
  const fv = fi.value;
  switch (fi.operator) {
    case '=':          return v == fv;
    case '!=':         return v != fv;
    case '>':          return v > fv;
    case '>=':         return v >= fv;
    case '<':          return v < fv;
    case '<=':         return v <= fv;
    case 'contains':   return String(v).includes(String(fv));
    case 'startsWith': return String(v).startsWith(String(fv));
    case 'endsWith':   return String(v).endsWith(String(fv));
    default:           return true;
  }
}
