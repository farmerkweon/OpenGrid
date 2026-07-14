import React, { useRef, useEffect, useCallback, CSSProperties } from 'react';
import { OpenGrid } from '../core/OpenGrid.js';
import type { GridOptions, ColumnDef, OpenGridInstance } from '../core/types.js';
import '../styles/base.css';

/**
 * React `<OpenGrid>` 컴포넌트의 props. / Props of the React `<OpenGrid>` component.
 *
 * 코어 `GridOptions` 의 자주 쓰는 옵션을 선언적 prop 으로 노출하고, 나머지는 `options` 로 전달한다.
 * / Exposes the commonly used `GridOptions` as declarative props; pass the rest through `options`.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface OpenGridProps<T extends Record<string, any> = any> {
  /** 표시할 행 데이터 배열. / Row data array to display. */
  data?: T[];
  /** 컬럼 정의 배열(필수). / Column definitions (required). */
  columns: ColumnDef<T>[];
  /** 그리드 높이(숫자는 px). 기본 400. / Grid height (number = px). Default 400. */
  height?: number | string;
  /** 그리드 너비(숫자는 px). 기본 '100%'. / Grid width (number = px). Default '100%'. */
  width?: number | string;
  /** 셀 편집 허용. 기본 false. / Allow cell editing. Default false. */
  editable?: boolean;
  /** 정렬 허용. 기본 true. / Allow sorting. Default true. */
  sortable?: boolean;
  /** 필터 허용. 기본 true. / Allow filtering. Default true. */
  filterable?: boolean;
  /** 행 번호 컬럼 표시. 기본 false. / Show a row-number column. Default false. */
  rowNumber?: boolean;
  /** 체크박스 선택 컬럼 표시. 기본 false. / Show a checkbox selection column. Default false. */
  checkColumn?: boolean;
  /** 왼쪽에서 고정할 컬럼 수. 기본 0. / Number of columns frozen from the left. Default 0. */
  frozenColumns?: number;
  /** 테마 id. 기본 'default'. / Theme id. Default 'default'. */
  theme?: string;
  /** 위 prop 으로 못 덮는 나머지 코어 옵션. / Remaining core options not covered by the props above. */
  options?: Partial<GridOptions<T>>;
  /** 컨테이너 인라인 스타일(height/width 위에 병합). / Container inline style (merged over height/width). */
  style?: CSSProperties;
  /** 컨테이너 CSS 클래스. / Container CSS class. */
  className?: string;

  /** 행 상태 컬럼 표시. 기본 false. / Show a row-state column. Default false. */
  stateColumn?: boolean;
  /** 행 드래그앤드롭 허용. 기본 false. / Allow row drag-and-drop. Default false. */
  draggable?: boolean;

  /** 그리드 인스턴스 준비 완료 콜백. / Fired when the grid instance is ready. */
  onReady?: (grid: OpenGridInstance<T>) => void;
  /** 데이터 변경 콜백. / Fired when the data changes. */
  onDataChange?: (data: T[]) => void;
  /** 셀 클릭 콜백. / Fired on cell click. */
  onCellClick?: (e: any) => void;
  /** 행 클릭 콜백. / Fired on row click. */
  onRowClick?: (e: any) => void;
  /** 편집 종료(커밋) 콜백. / Fired when editing ends (commit). */
  onEditEnd?: (e: any) => void;
  /** 정렬 변경 콜백. / Fired when sorting changes. */
  onSortChange?: (e: any) => void;
  /** 필터 변경 콜백. / Fired when filtering changes. */
  onFilterChange?: (e: any) => void;
  /** 행 드롭(재정렬) 콜백. / Fired on row drop (reorder). */
  onRowDrop?: (e: { fromIndex: number; toIndex: number }) => void;
}

/**
 * OPEN_GRID 코어를 감싸는 React 컴포넌트. / React component wrapping the OPEN_GRID core.
 *
 * 마운트 시 코어 `OpenGrid` 인스턴스를 만들고, `data`·`theme`·구조 prop 변경을 감지해 동기화한다.
 * / Creates a core `OpenGrid` instance on mount and syncs it as `data`, `theme`, and structural
 *   props change.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param props - 그리드 props / Grid props
 * @returns 그리드 컨테이너 엘리먼트 / The grid container element
 * @example
 * <OpenGrid columns={[{ field: 'name', header: '이름' }]} data={rows} height={400} />
 */
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
    // / theme is handled in a separate effect, so it is excluded from deps
  }, [columns, editable, sortable, filterable, rowNumber, checkColumn, stateColumn, draggable, frozenColumns]);

  // data 변경 감지 / react to data changes
  useEffect(() => {
    if (gridRef.current && data) {
      gridRef.current.setData(data);
    }
  }, [data]);

  // theme 변경 감지 (그리드 재생성 없이 setTheme만 호출) / react to theme changes (call setTheme without recreating the grid)
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

/**
 * ref 로 코어 grid 인스턴스에 접근할 수 있는 forwardRef 래퍼.
 * / forwardRef wrapper exposing the core grid instance through a ref.
 *
 * @example
 * const ref = useRef<OpenGridInstance>(null);
 * <OpenGridWithRef ref={ref} columns={cols} />;
 * ref.current?.setData(rows);
 */
// ref forwarder (외부에서 grid 인스턴스 접근) / ref forwarder (external access to the grid instance)
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
