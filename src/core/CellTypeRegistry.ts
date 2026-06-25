import type { ColumnDef } from './types.js';

export function isToggleCol<T>(col: ColumnDef<T>): boolean {
  const rendType = typeof col.renderer === 'string'
    ? col.renderer
    : (col.renderer && typeof col.renderer === 'object' ? (col.renderer as any).type : '');
  return col.type === 'boolean' || (col.type as string) === 'checkbox'
    || rendType === 'checkbox' || rendType === 'switch';
}

export function isSelectCol<T>(col: ColumnDef<T>): boolean {
  return (col.type as string) === 'select';
}

export function isRadioCol<T>(col: ColumnDef<T>): boolean {
  return (col.type as string) === 'radio';
}
