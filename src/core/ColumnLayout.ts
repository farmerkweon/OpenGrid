import type { ColumnDef } from './types.js';

/** 리프(말단) 컬럼 — 배치 계산에 필요한 인덱스·깊이 메타를 얹은 컬럼 정의. / A leaf column — a column def augmented with index/depth metadata for layout. */
export interface FlatColumn<T = any> extends ColumnDef<T> {
  /** 좌→우 리프 컬럼 순번(0-base). / Left-to-right leaf column index (0-based). */
  _colIndex: number;
  /** 헤더 트리 깊이(1-base). / Header tree depth (1-based). */
  _depth: number;
  /** 리프 여부(항상 true). / Whether this is a leaf (always true here). */
  _leaf: boolean;
  /** 계산된 가로 병합 수(선택). / Computed horizontal span (optional). */
  _colSpanCount?: number;
  /** 계산된 세로 병합 수(선택). / Computed vertical span (optional). */
  _rowSpanCount?: number;
}

/** 헤더 렌더링용 셀 하나의 배치 정보. / Layout info for a single header cell to render. */
export interface HeaderCell {
  /** 대상 컬럼 정의. / The column definition. */
  column: FlatColumn;
  /** 리프 컬럼 인덱스. / Leaf column index. */
  colIndex: number;
  /** 헤더 깊이(1-base). / Header depth (1-based). */
  depth: number;
  /** 가로 병합 칸 수. / Horizontal span count. */
  colSpan: number;
  /** 세로 병합 칸 수. / Vertical span count. */
  rowSpan: number;
}

/**
 * 컬럼 트리(그룹 헤더 포함)를 리프 배열·헤더 셀·너비로 평탄화하는 배치 엔진.
 * / Layout engine that flattens the column tree (including group headers) into leaf arrays,
 *   header cells, and computed widths.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * const layout = new ColumnLayout([{ field: 'name', header: '이름' }], 1);
 * layout.visibleLeaves;          // 표시 리프 컬럼 / visible leaf columns
 * layout.computeWidths(800);     // 리프 너비 배열 / per-leaf widths
 */
export class ColumnLayout<T = any> {
  private _columns: ColumnDef<T>[];
  private _flatLeaves: FlatColumn<T>[] = [];
  private _maxDepth: number = 1;
  private _frozenCount: number = 0;

  /**
   * 컬럼 정의로 배치 엔진 생성 후 즉시 리프·깊이를 계산. / Create the layout engine and immediately compute leaves/depth.
   *
   * @param columns - 컬럼 정의 배열(그룹 헤더는 children 사용) / Column definitions (group headers use `children`)
   * @param frozenCount - 좌측 고정 컬럼 수(기본 0) / Number of left-frozen columns (default 0)
   */
  constructor(columns: ColumnDef<T>[], frozenCount: number = 0) {
    this._columns = columns;
    this._frozenCount = frozenCount;
    this._process();
  }

  private _process(): void {
    const leaves: FlatColumn<T>[] = [];
    let colIndex = 0;

    const walk = (cols: ColumnDef<T>[], depth: number): void => {
      for (const col of cols) {
        if (col.children && col.children.length > 0) {
          walk(col.children, depth + 1);
          this._maxDepth = Math.max(this._maxDepth, depth + 1);
        } else {
          leaves.push({ ...col, _colIndex: colIndex++, _depth: depth, _leaf: true });
        }
      }
    };

    this._maxDepth = 1;
    walk(this._columns, 1);
    this._flatLeaves = leaves;
  }

  /** 전체 리프 컬럼(숨김 포함). / All leaf columns (including hidden ones). */
  get leaves(): FlatColumn<T>[] {
    return this._flatLeaves;
  }

  /** 표시 리프 컬럼(hidden 제외). / Visible leaf columns (excluding hidden). */
  get visibleLeaves(): FlatColumn<T>[] {
    return this._flatLeaves.filter(c => !c.hidden);
  }

  /** 헤더 트리 최대 깊이(=헤더 행 수). / Maximum header tree depth (= header row count). */
  get headerDepth(): number {
    return this._maxDepth;
  }

  /** 좌측 고정 컬럼 수. / Number of left-frozen columns. */
  get frozenCount(): number {
    return this._frozenCount;
  }

  /**
   * 좌측 고정 컬럼 수 변경. / Change the number of left-frozen columns.
   *
   * @param count - 고정할 컬럼 수 / Column count to freeze
   */
  setFrozen(count: number): void {
    this._frozenCount = count;
  }

  /**
   * 컬럼 정의 전체 교체 후 배치 재계산. / Replace all column definitions and re-run layout.
   *
   * @param columns - 새 컬럼 정의 배열 / New column definitions
   */
  setColumns(columns: ColumnDef<T>[]): void {
    this._columns = columns;
    this._process();
  }

  /**
   * 지정 field(들)의 리프 컬럼을 숨김 처리. / Hide the leaf column(s) for the given field(s).
   *
   * @param field - 숨길 field 또는 field 배열 / Field or fields to hide
   */
  hideColumn(field: string | string[]): void {
    const fields = Array.isArray(field) ? field : [field];
    this._flatLeaves.forEach(c => {
      if (fields.includes(c.field)) c.hidden = true;
    });
  }

  /**
   * 지정 field(들)의 리프 컬럼을 다시 표시. / Show the leaf column(s) for the given field(s).
   *
   * @param field - 표시할 field 또는 field 배열 / Field or fields to show
   */
  showColumn(field: string | string[]): void {
    const fields = Array.isArray(field) ? field : [field];
    this._flatLeaves.forEach(c => {
      if (fields.includes(c.field)) c.hidden = false;
    });
  }

  /**
   * 컬럼 추가 후 배치 재계산. / Add a column and re-run layout.
   *
   * @param colDef - 추가할 컬럼 정의 / Column definition to add
   * @param position - 삽입 위치: 'first' | 'last' | 인덱스(기본 'last') / Insert position: 'first' | 'last' | index (default 'last')
   */
  addColumn(colDef: ColumnDef<T>, position: 'first' | 'last' | number = 'last'): void {
    if (position === 'last') {
      this._columns.push(colDef);
    } else if (position === 'first') {
      this._columns.unshift(colDef);
    } else {
      this._columns.splice(position, 0, colDef);
    }
    this._process();
  }

  /**
   * 지정 field 컬럼을 트리에서 제거(중첩 그룹 포함) 후 배치 재계산.
   * / Remove the column with the given field from the tree (including nested groups) and re-run layout.
   *
   * @param field - 제거할 컬럼 field / Field of the column to remove
   */
  removeColumn(field: string): void {
    const removeFromList = (cols: ColumnDef<T>[]): ColumnDef<T>[] => {
      return cols.filter(c => {
        if (c.field === field) return false;
        if (c.children) c.children = removeFromList(c.children);
        return true;
      });
    };
    this._columns = removeFromList(this._columns);
    this._process();
  }

  /**
   * field 로 리프 컬럼 조회. / Look up a leaf column by field.
   *
   * @param field - 컬럼 field / Column field
   * @returns 리프 컬럼, 없으면 undefined / The leaf column, or undefined
   */
  getColumnByField(field: string): FlatColumn<T> | undefined {
    return this._flatLeaves.find(c => c.field === field);
  }

  /**
   * 인덱스로 리프 컬럼 조회. / Look up a leaf column by index.
   *
   * @param index - 리프 컬럼 인덱스 / Leaf column index
   * @returns 리프 컬럼, 없으면 undefined / The leaf column, or undefined
   */
  getColumnByIndex(index: number): FlatColumn<T> | undefined {
    return this._flatLeaves[index];
  }

  /**
   * field 의 리프 컬럼 인덱스 조회. / Get the leaf column index for a field.
   *
   * @param field - 컬럼 field / Column field
   * @returns 리프 인덱스, 없으면 -1 / Leaf index, or -1 if not found
   */
  getColumnIndex(field: string): number {
    return this._flatLeaves.findIndex(c => c.field === field);
  }

  /**
   * 헤더 렌더링용 셀 계산 — 깊이별 행 배열(그룹 헤더 colSpan/rowSpan 포함).
   * / Compute header cells for rendering — rows by depth (with group-header colSpan/rowSpan).
   *
   * @returns 깊이(행) × 셀 2차원 배열 / A 2D array of cells indexed by depth (row)
   */
  buildHeaderCells(): HeaderCell[][] {
    const rows: HeaderCell[][] = Array.from({ length: this._maxDepth }, () => []);
    let colIndex = 0;

    const walk = (cols: ColumnDef<T>[], depth: number): number => {
      let span = 0;
      for (const col of cols) {
        if (col.hidden) continue;
        if (col.children && col.children.length > 0) {
          const childSpan = walk(col.children, depth + 1);
          if (childSpan > 0) {
            rows[depth - 1]!.push({
              column: col as FlatColumn<T>,
              colIndex: colIndex,
              depth,
              colSpan: childSpan,
              rowSpan: 1
            });
            span += childSpan;
          }
        } else {
          rows[depth - 1]!.push({
            column: col as FlatColumn<T>,
            colIndex: colIndex++,
            depth,
            colSpan: 1,
            rowSpan: this._maxDepth - depth + 1
          });
          span++;
        }
      }
      return span;
    };

    walk(this._columns, 1);
    return rows;
  }

  /**
   * 각 표시 리프 컬럼의 계산된 너비 배열 반환. / Return computed widths for each visible leaf column.
   *
   * flex 컬럼은 잔여 폭을 flex 비율로 분배받고, 고정 컬럼은 자기 width(없으면 기본값)를 쓴다.
   * / Flex columns share the remaining width by their flex ratio; fixed columns use their own
   *   width (or the default when unset).
   *
   * @param totalWidth - 전체 사용 가능 폭(px) / Total available width in px
   * @param defaultWidth - width 미지정 고정 컬럼의 기본 폭(기본 100) / Default width for fixed columns without a width (default 100)
   * @returns 표시 리프 순서의 너비 배열(px) / Widths in visible-leaf order (px)
   */
  computeWidths(totalWidth: number, defaultWidth: number = 100): number[] {
    const visible = this.visibleLeaves;
    const flexCols = visible.filter(c => c.flex);
    const fixedTotal = visible
      .filter(c => !c.flex && c.width)
      .reduce((sum, c) => sum + c.width!, 0);

    const flexTotal = flexCols.reduce((sum, c) => sum + (c.flex ?? 1), 0);
    const remaining = Math.max(0, totalWidth - fixedTotal);

    return visible.map(c => {
      if (c.flex) return Math.round((c.flex / flexTotal) * remaining);
      return c.width ?? defaultWidth;
    });
  }
}
