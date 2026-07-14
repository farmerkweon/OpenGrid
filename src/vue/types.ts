import type { GridOptions, ColumnDef, OpenGridInstance } from '../core/types.js';

/**
 * Vue `<OpenGrid>` 컴포넌트의 props. / Props of the Vue `<OpenGrid>` component.
 *
 * 코어 `GridOptions` 의 자주 쓰는 옵션을 선언적 prop 으로 노출하고, 나머지는 `options` 로 전달한다.
 * / Exposes the commonly used `GridOptions` as declarative props; pass the rest through `options`.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface OpenGridProps<T = any> {
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
  /** 행 상태 컬럼 표시. 기본 false. / Show a row-state column. Default false. */
  stateColumn?: boolean;
  /** 행 드래그앤드롭 허용. 기본 false. / Allow row drag-and-drop. Default false. */
  draggable?: boolean;
  /** 왼쪽에서 고정할 컬럼 수. 기본 0. / Number of columns frozen from the left. Default 0. */
  frozenColumns?: number;
  /** 테마 id. 기본 'default'. / Theme id. Default 'default'. */
  theme?: string;
  /** 위 prop 으로 못 덮는 나머지 코어 옵션. / Remaining core options not covered by the props above. */
  options?: Partial<GridOptions<T>>;
}

/**
 * Vue `<OpenGrid>` 가 발행하는 이벤트. / Events emitted by the Vue `<OpenGrid>` component.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface OpenGridEmits<T = any> {
  /** `v-model:data` 양방향 갱신. / Two-way update for `v-model:data`. */
  (e: 'update:data', data: T[]): void;
  /** 그리드 인스턴스 준비 완료. / The grid instance is ready. */
  (e: 'ready', grid: OpenGridInstance<T>): void;
  /** 셀 클릭. / Cell click. */
  (e: 'cell-click', event: any): void;
  /** 행 클릭. / Row click. */
  (e: 'row-click', event: any): void;
  /** 편집 종료(커밋). / Editing ended (commit). */
  (e: 'edit-end', event: any): void;
  /** 정렬 변경. / Sorting changed. */
  (e: 'sort-change', event: any): void;
  /** 필터 변경. / Filtering changed. */
  (e: 'filter-change', event: any): void;
  /** 행 체크 상태 변경. / Row check state changed. */
  (e: 'row-check', event: any): void;
}
