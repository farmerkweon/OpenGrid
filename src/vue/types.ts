import type { GridOptions, ColumnDef, OpenGridInstance } from '../core/types.js';

export interface OpenGridProps<T = any> {
  data?: T[];
  columns: ColumnDef<T>[];
  height?: number | string;
  width?: number | string;
  editable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  rowNumber?: boolean;
  checkColumn?: boolean;
  stateColumn?: boolean;
  draggable?: boolean;
  frozenColumns?: number;
  theme?: string;
  options?: Partial<GridOptions<T>>;
}

export interface OpenGridEmits<T = any> {
  (e: 'update:data', data: T[]): void;
  (e: 'ready', grid: OpenGridInstance<T>): void;
  (e: 'cell-click', event: any): void;
  (e: 'row-click', event: any): void;
  (e: 'edit-end', event: any): void;
  (e: 'sort-change', event: any): void;
  (e: 'filter-change', event: any): void;
  (e: 'row-check', event: any): void;
}
