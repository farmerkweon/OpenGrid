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
   * rowId → DataLayer 원본(_data) 인덱스 조회.
   * Phase 0 인프라(FlatRowModel.ts, C0.3 FlatRowRef.dataIndex) 해소 전용 — _idMap 을
   * 직접 노출하지 않고 단건 조회만 허용한다. 없으면 undefined(삭제된 행 등).
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

  constructor(idField: string = '_ogRowId') {
    this._idField = idField;
  }

  /** Phase 2: OpenGrid 가 OverrideKernel.getStrategy 를 주입(슬롯 sortComparator/filterPredicate 도달용). */
  setStrategyResolver(resolver: <F extends Function>(slot: string, fallback: F) => F): void {
    this._getStrategy = resolver;
  }

  // ─── 데이터 설정 ──────────────────────────────────────
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

  getData(): T[] {
    return this._displayIndexes.map(i => this._data[i]!);
  }

  getOriginalData(): T[] {
    return [...this._original];
  }

  getAllData(): T[] {
    return [...this._data];
  }

  clearData(): void {
    this._data = [];
    this._original = [];
    this._meta.clear();
    this._idMap.clear();
    this._displayIndexes = [];
  }

  get rowCount(): number {
    return this._displayIndexes.length;
  }

  get totalRowCount(): number {
    return this._data.length;
  }

  // ─── 행 CRUD ──────────────────────────────────────────
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

  getRowByIndex(rowIndex: number): T | undefined {
    const dataIdx = this._displayIndexes[rowIndex];
    return dataIdx !== undefined ? this._data[dataIdx] : undefined;
  }

  getCellValue(rowIndex: number, field: string): any {
    return this.getRowByIndex(rowIndex)?.[field];
  }

  // ─── F3(수식) stable-id 기반 접근자 ────────────────────
  // FormulaGridAccessor(RecalcCoordinator 주입, C0.5 stable-id 앵커) 구현에 쓰인다.
  // 정렬/필터로 흔들리는 displayIndex 가 아니라 rowId 로 직접 조회하므로 이 그룹의
  // 메서드는 applySort/applyFilter/moveRow 와 무관하게 항상 같은 논리 레코드를 가리킨다.

  /** rowId 가 아직 존재(soft-delete 제외)하는지(F3-R28 삭제 무효화 판정용). */
  hasRow(rowId: string): boolean {
    const idx = this._idMap.get(rowId);
    if (idx === undefined) return false;
    return this._meta.get(rowId)?.state !== 'removed';
  }

  /** rowId → 원본 행(soft-delete 된 행은 undefined, F3-R28). */
  getRowById(rowId: string): T | undefined {
    if (!this.hasRow(rowId)) return undefined;
    const idx = this._idMap.get(rowId)!;
    return this._data[idx];
  }

  getCellValueByRowId(rowId: string, field: string): any {
    return this.getRowById(rowId)?.[field];
  }

  /**
   * 수식 재계산 결과 기록(§4.2/C2.2) — 일반 updateCell 과 달리 meta.state 를 건드리지
   * 않는다(edited 오염 방지) 및 dataChange 를 발화하지 않는다(호출부가 배치 종료 후
   * formulaRecalc 1회로 표면화할 책임을 진다).
   */
  setComputedValueByRowId(rowId: string, field: string, value: any): void {
    const idx = this._idMap.get(rowId);
    if (idx === undefined) return;
    (this._data[idx] as any)[field] = value;
  }

  // ─── 변경 추적 ────────────────────────────────────────
  /** 수정된 행만 반환 (추가/삭제 제외) */
  getEditedRows(): T[] {
    return this._data.filter(r =>
      this._meta.get(r[this._idField] as string)?.state === 'edited'
    );
  }

  /** 수정된 행만 반환 (하위 호환용 — 신규 코드는 getEditedRows() 사용) */
  getChangedRows(): T[] { return this.getEditedRows(); }

  getAddedRows(): T[] {
    return this._data.filter(r =>
      this._meta.get(r[this._idField] as string)?.state === 'added'
    );
  }

  getRemovedRows(): T[] {
    return this._data.filter(r =>
      this._meta.get(r[this._idField] as string)?.state === 'removed'
    );
  }

  /**
   * 추가/수정/삭제 모든 변경사항을 한 번에 반환.
   * edited 행에는 _changedFields 배열도 포함.
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
   * diff: { field, oldValue, newValue }[]
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

  /** rowIndex 행의 원본(수정 전) 데이터 반환. 추가된 행은 undefined. */
  getOriginalRow(rowIndex: number): T | undefined {
    const dataIdx = this._displayIndexes[rowIndex];
    if (dataIdx === undefined) return undefined;
    const row  = this._data[dataIdx]!;
    const meta = this._meta.get(row[this._idField] as string);
    if (!meta || meta.state === 'added') return undefined;
    if (meta.state === 'edited' && meta.original) return { ...meta.original } as T;
    return { ...this._original[dataIdx] } as T;
  }

  getRowsWithState(stateField: string): T[] {
    return this._data.map(r => {
      const state = this._meta.get(r[this._idField] as string)?.state ?? 'none';
      return { ...r, [stateField]: state };
    });
  }

  getRowState(rowIndex: number): RowState {
    const row = this.getRowByIndex(rowIndex);
    if (!row) return 'none';
    return this._meta.get(row[this._idField] as string)?.state ?? 'none';
  }

  // ─── 정렬 ─────────────────────────────────────────────
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

  /** F3: 찾기 바 전체 컬럼 OR 검색 설정 */
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
