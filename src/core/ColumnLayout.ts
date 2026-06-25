import type { ColumnDef } from './types.js';

export interface FlatColumn<T = any> extends ColumnDef<T> {
  _colIndex: number;
  _depth: number;
  _leaf: boolean;
  _colSpanCount?: number;
  _rowSpanCount?: number;
}

export interface HeaderCell {
  column: FlatColumn;
  colIndex: number;
  depth: number;
  colSpan: number;
  rowSpan: number;
}

export class ColumnLayout<T = any> {
  private _columns: ColumnDef<T>[];
  private _flatLeaves: FlatColumn<T>[] = [];
  private _maxDepth: number = 1;
  private _frozenCount: number = 0;

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

  get leaves(): FlatColumn<T>[] {
    return this._flatLeaves;
  }

  get visibleLeaves(): FlatColumn<T>[] {
    return this._flatLeaves.filter(c => !c.hidden);
  }

  get headerDepth(): number {
    return this._maxDepth;
  }

  get frozenCount(): number {
    return this._frozenCount;
  }

  setFrozen(count: number): void {
    this._frozenCount = count;
  }

  setColumns(columns: ColumnDef<T>[]): void {
    this._columns = columns;
    this._process();
  }

  hideColumn(field: string | string[]): void {
    const fields = Array.isArray(field) ? field : [field];
    this._flatLeaves.forEach(c => {
      if (fields.includes(c.field)) c.hidden = true;
    });
  }

  showColumn(field: string | string[]): void {
    const fields = Array.isArray(field) ? field : [field];
    this._flatLeaves.forEach(c => {
      if (fields.includes(c.field)) c.hidden = false;
    });
  }

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

  getColumnByField(field: string): FlatColumn<T> | undefined {
    return this._flatLeaves.find(c => c.field === field);
  }

  getColumnByIndex(index: number): FlatColumn<T> | undefined {
    return this._flatLeaves[index];
  }

  getColumnIndex(field: string): number {
    return this._flatLeaves.findIndex(c => c.field === field);
  }

  /** 헤더 렌더링용 셀 계산 */
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

  /** 각 리프 컬럼의 계산된 너비 배열 반환 */
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
