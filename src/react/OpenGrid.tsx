import React, { useRef, useEffect, useCallback, CSSProperties } from 'react';
import { OpenGrid } from '../core/OpenGrid.js';
import type { GridOptions, ColumnDef, OpenGridInstance } from '../core/types.js';
import '../styles/base.css';

export interface OpenGridProps<T extends Record<string, any> = any> {
  data?: T[];
  columns: ColumnDef<T>[];
  height?: number | string;
  width?: number | string;
  editable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  rowNumber?: boolean;
  checkColumn?: boolean;
  frozenColumns?: number;
  theme?: string;
  options?: Partial<GridOptions<T>>;
  style?: CSSProperties;
  className?: string;

  stateColumn?: boolean;
  draggable?: boolean;

  onReady?: (grid: OpenGridInstance<T>) => void;
  onDataChange?: (data: T[]) => void;
  onCellClick?: (e: any) => void;
  onRowClick?: (e: any) => void;
  onEditEnd?: (e: any) => void;
  onSortChange?: (e: any) => void;
  onFilterChange?: (e: any) => void;
  onRowDrop?: (e: { fromIndex: number; toIndex: number }) => void;
}

export function OpenGridReact<T extends Record<string, any> = any>({
  data,
  columns,
  height = 400,
  width = '100%',
  editable = false,
  sortable = true,
  filterable = true,
  rowNumber = false,
  checkColumn = false,
  stateColumn = false,
  draggable = false,
  frozenColumns = 0,
  theme = 'default',
  options,
  style,
  className,
  onReady,
  onDataChange,
  onCellClick,
  onRowClick,
  onEditEnd,
  onSortChange,
  onFilterChange,
  onRowDrop,
}: OpenGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<OpenGridInstance<T> | null>(null);

  const containerStyle: CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
    width: typeof width === 'number' ? `${width}px` : width,
    display: 'block',
    boxSizing: 'border-box',
    ...style,
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const gridOptions: GridOptions<T> = {
      columns,
      height: '100%',
      width: '100%',
      editable,
      sortable,
      filterable,
      rowNumber,
      checkColumn,
      stateColumn,
      draggable,
      frozenColumns,
      theme,
      ...options,

      onReady: (grid) => {
        gridRef.current = grid;
        if (data?.length) grid.setData(data);
        onReady?.(grid);
      },
      ...(onDataChange && { onDataChange }),
      ...(onCellClick && { onCellClick }),
      ...(onRowClick && { onRowClick }),
      ...(onEditEnd && { onEditEnd }),
      ...(onSortChange && { onSortChange }),
      ...(onFilterChange && { onFilterChange }),
      ...(onRowDrop && { onRowDrop }),
    };

    const grid = new OpenGrid<T>(containerRef.current, gridOptions);
    gridRef.current = grid;

    return () => {
      grid.destroy();
      gridRef.current = null;
    };
    // theme은 별도 effect에서 처리하므로 deps에서 제외
  }, [columns, editable, sortable, filterable, rowNumber, checkColumn, stateColumn, draggable, frozenColumns]);

  // data 변경 감지
  useEffect(() => {
    if (gridRef.current && data) {
      gridRef.current.setData(data);
    }
  }, [data]);

  // theme 변경 감지 (그리드 재생성 없이 setTheme만 호출)
  useEffect(() => {
    if (gridRef.current) gridRef.current.setTheme(theme);
  }, [theme]);

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={className}
    />
  );
}

// ref forwarder (외부에서 grid 인스턴스 접근)
export const OpenGridWithRef = React.forwardRef<
  OpenGridInstance,
  OpenGridProps
>((props, ref) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<OpenGridInstance | null>(null);

  useEffect(() => {
    if (gridRef.current && ref) {
      if (typeof ref === 'function') ref(gridRef.current);
      else (ref as React.MutableRefObject<OpenGridInstance | null>).current = gridRef.current;
    }
  });

  return <OpenGridReact {...props} />;
});

OpenGridWithRef.displayName = 'OpenGrid';
