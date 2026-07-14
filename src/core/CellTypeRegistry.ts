import type { ColumnDef } from './types.js';

/**
 * 컬럼이 토글(체크박스/스위치) 셀인지 판정. / Whether a column renders as a toggle (checkbox/switch) cell.
 *
 * `type` 이 `boolean`/`checkbox` 이거나 renderer 가 `checkbox`/`switch` 이면 참.
 * / True when `type` is `boolean`/`checkbox`, or the renderer is `checkbox`/`switch`.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param col - 검사할 컬럼 정의 / Column definition to inspect
 * @returns 토글 셀이면 true / true if the column is a toggle cell
 */
export function isToggleCol<T>(col: ColumnDef<T>): boolean {
  const rendType = typeof col.renderer === 'string'
    ? col.renderer
    : (col.renderer && typeof col.renderer === 'object' ? (col.renderer as any).type : '');
  return col.type === 'boolean' || (col.type as string) === 'checkbox'
    || rendType === 'checkbox' || rendType === 'switch';
}

/**
 * 컬럼이 셀렉트(드롭다운) 셀인지 판정. / Whether a column renders as a select (dropdown) cell.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param col - 검사할 컬럼 정의 / Column definition to inspect
 * @returns `type` 이 `select` 이면 true / true if `type` is `select`
 */
export function isSelectCol<T>(col: ColumnDef<T>): boolean {
  return (col.type as string) === 'select';
}

/**
 * 컬럼이 라디오 버튼 셀인지 판정. / Whether a column renders as a radio-button cell.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param col - 검사할 컬럼 정의 / Column definition to inspect
 * @returns `type` 이 `radio` 이면 true / true if `type` is `radio`
 */
export function isRadioCol<T>(col: ColumnDef<T>): boolean {
  return (col.type as string) === 'radio';
}
