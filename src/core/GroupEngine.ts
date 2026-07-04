import type { SummaryOp } from './types.js';
import { OGDecimal } from './OGDecimal.js';
// i18n: GroupEngine 은 그룹 flat 을 만드는 순수 엔진(인스턴스 컨텍스트 없음) → null 그룹 라벨을 전역 t 로 해석.
import { t } from './i18n/LocaleRegistry.js';

export interface GroupRow<T = any> {
  _isGroup: true;
  _groupField: string;
  _groupValue: any;
  _groupLabel: string;
  _depth: number;
  _expanded: boolean;
  _childCount: number;
  _summary: Record<string, any>;           // { field → 계산값(number) }
  _summaryFmt: Record<string, string>;     // { field → 포맷된 문자열 }
  _states: { added: number; edited: number; removed: number };
  children: Array<GroupRow<T> | T>;
}

export type GroupItem<T> = GroupRow<T> | T;

export interface SummaryDef {
  field: string;
  op: SummaryOp;
  label?: string;
  format?: string;   // '#,##0' | '#,##0.00' | '0.00' | '2' 등
}

function _isGroup<T>(item: any): item is GroupRow<T> {
  return item && item._isGroup === true;
}

/**
 * flat 데이터를 fields 기준으로 계층 그룹핑.
 * Phase 2 슬롯 #5: groupKeyFn(getKey) — 미지정 시 default = `row[field]`(현행 단일 필드 키).
 *   GroupTreeManager 가 host.getStrategy 로 주입. ⚠️ 핫패스(행당) — 슬롯 예외 비격리.
 */
export function buildGroups<T extends Record<string, any>>(
  data: T[],
  fields: string[],
  summaryDefs: SummaryDef[] = [],
  expandedKeys: Set<string> = new Set(),
  getRowState?: (row: T) => string,
  getKey?: (row: T, remainingFields: string[]) => any
): GroupRow<T>[] {
  if (!fields.length) return [];
  return _groupByFields(data, fields, 0, summaryDefs, expandedKeys, '', getRowState, getKey);
}

function _groupByFields<T extends Record<string, any>>(
  data: T[],
  fields: string[],
  depth: number,
  summaryDefs: SummaryDef[],
  expandedKeys: Set<string>,
  parentKey: string,
  getRowState?: (row: T) => string,
  getKey?: (row: T, remainingFields: string[]) => any
): GroupRow<T>[] {
  const field = fields[depth]!;
  const map = new Map<any, T[]>();

  for (const row of data) {
    const key = getKey ? getKey(row, fields.slice(depth)) : row[field];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const result: GroupRow<T>[] = [];
  for (const [value, rows] of map) {
    const groupKey = `${parentKey}__${field}:${value}`;
    const expanded = expandedKeys.has(groupKey);

    let children: Array<GroupRow<T> | T>;
    if (depth < fields.length - 1) {
      children = _groupByFields(rows, fields, depth + 1, summaryDefs, expandedKeys, groupKey, getRowState, getKey);
    } else {
      children = rows;
    }

    const { summary, summaryFmt } = _calcSummary(rows, summaryDefs);
    const states = _calcStates(rows, getRowState);

    result.push({
      _isGroup: true,
      _groupField: field,
      _groupValue: value,
      _groupLabel: value == null ? t('group.nullLabel') : String(value),
      _depth: depth,
      _expanded: expanded,
      _childCount: rows.length,
      _summary: summary,
      _summaryFmt: summaryFmt,
      _states: states,
      children,
    } as GroupRow<T>);
  }
  return result;
}

/** OGDecimal 정밀 계산으로 summary 집계 */
function _calcSummary(
  data: Record<string, any>[],
  defs: SummaryDef[]
): { summary: Record<string, any>; summaryFmt: Record<string, string> } {
  const summary: Record<string, any>       = {};
  const summaryFmt: Record<string, string> = {};

  for (const def of defs) {
    const vals = data
      .map(r => r[def.field])
      .filter(v => v !== null && v !== undefined && v !== '');

    let result: OGDecimal | null = null;
    const opUC = (def.op as string).toUpperCase();

    if (opUC === 'SUM') {
      result = vals.length > 0 ? OGDecimal.sum(vals.map(String)) : null;
    } else if (opUC === 'AVG') {
      result = vals.length > 0
        ? OGDecimal.sum(vals.map(String)).div(OGDecimal.from(String(vals.length)))
        : null;
    } else if (opUC === 'COUNT') {
      summary[def.field]    = data.length;
      summaryFmt[def.field] = data.length.toLocaleString('ko-KR');
      continue;
    } else if (opUC === 'MAX') {
      result = vals.length > 0 ? OGDecimal.max(vals.map(String)) : null;
    } else if (opUC === 'MIN') {
      result = vals.length > 0 ? OGDecimal.min(vals.map(String)) : null;
    }

    if (!result) { summary[def.field] = null; summaryFmt[def.field] = ''; continue; }

    const numVal = result.toNumber();
    summary[def.field]    = numVal;
    summaryFmt[def.field] = _fmtNum(numVal, def.format);
  }

  return { summary, summaryFmt };
}

/** 그룹 내 행 편집 상태 집계 */
function _calcStates<T extends Record<string, any>>(
  rows: T[],
  getRowState?: (row: T) => string
): { added: number; edited: number; removed: number } {
  if (!getRowState) return { added: 0, edited: 0, removed: 0 };
  let added = 0, edited = 0, removed = 0;
  for (const r of rows) {
    const s = getRowState(r);
    if (s === 'added')        added++;
    else if (s === 'edited')  edited++;
    else if (s === 'removed') removed++;
  }
  return { added, edited, removed };
}

/**
 * 숫자 포맷팅 (GroupEngine 내부 + 외부 공용)
 * '#,##0'    → 천단위 콤마, 정수
 * '#,##0.00' → 천단위 콤마, 소수 2자리
 * '0.00'     → 소수 2자리 (콤마 없음)
 * '2'        → 소수 2자리 (하위 호환)
 */
export function _fmtNum(value: number, fmt?: string): string {
  if (fmt === undefined || fmt === null) {
    return value % 1 === 0
      ? value.toLocaleString('ko-KR')
      : parseFloat(value.toFixed(6)).toLocaleString('ko-KR', {
          minimumFractionDigits: 2, maximumFractionDigits: 6,
        });
  }
  const useComma = fmt.includes('#') || fmt.includes(',');
  const dpMatch  = fmt.match(/\.(\d+)$/);
  const dp = dpMatch ? parseInt(dpMatch[1]!, 10) : /^\d+$/.test(fmt) ? parseInt(fmt, 10) : 0;

  const fixed = Math.abs(value).toFixed(dp);
  const [intPart = '0', decPart] = fixed.split('.');
  const intStr = useComma
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : intPart;
  const result = decPart !== undefined ? `${intStr}.${decPart}` : intStr;
  return value < 0 ? `-${result}` : result;
}

/**
 * 그룹 트리를 화면에 표시할 flat 행 배열로 변환.
 * 접힌 그룹(expanded=false)의 자식은 포함하지 않음.
 */
export function flattenGroups<T>(groups: GroupRow<T>[]): Array<GroupRow<T> | T> {
  const result: Array<GroupRow<T> | T> = [];
  for (const g of groups) {
    result.push(g);
    if (g._expanded) {
      for (const child of g.children) {
        if (_isGroup(child)) {
          result.push(...flattenGroups([child as GroupRow<T>]));
        } else {
          result.push(child);
        }
      }
    }
  }
  return result;
}

/** 특정 그룹 키의 펼침 상태를 토글 */
export function toggleGroup<T>(
  groups: GroupRow<T>[],
  groupKey: string,
  expandedKeys: Set<string>
): void {
  if (expandedKeys.has(groupKey)) {
    expandedKeys.delete(groupKey);
  } else {
    expandedKeys.add(groupKey);
  }
}

/** 모든 그룹 키 수집 */
export function collectAllKeys<T>(groups: GroupRow<T>[], parentKey = ''): string[] {
  const keys: string[] = [];
  for (const g of groups) {
    const key = `${parentKey}__${g._groupField}:${g._groupValue}`;
    keys.push(key);
    const nested = g.children.filter((c): c is GroupRow<T> => _isGroup(c));
    if (nested.length) keys.push(...collectAllKeys(nested, key));
  }
  return keys;
}

export { _isGroup };
