import type { SummaryOp } from './types.js';
import { OGDecimal } from './OGDecimal.js';
// i18n: GroupEngine 은 그룹 flat 을 만드는 순수 엔진(인스턴스 컨텍스트 없음) → null 그룹 라벨을 전역 t 로 해석.
import { t } from './i18n/LocaleRegistry.js';

/** 그룹 헤더 행 — 하위 행 집계·상태·펼침 메타를 담는다. / A group header row — carries child aggregation, state, and expansion metadata. */
export interface GroupRow<T = any> {
  /** 그룹 행 판별 플래그(항상 true). / Group-row discriminant flag (always true). */
  _isGroup: true;
  /** 그룹핑 기준 필드명. / Field this level is grouped by. */
  _groupField: string;
  /** 그룹 값(원본). / Raw group value. */
  _groupValue: any;
  /** 표시용 그룹 라벨(null 값은 전역 로케일 라벨로 대체). / Display label (null values fall back to the global locale label). */
  _groupLabel: string;
  /** 그룹 깊이(0-base). / Group depth (0-based). */
  _depth: number;
  /** 펼침 여부. / Whether the group is expanded. */
  _expanded: boolean;
  /** 하위 행 수. / Number of child rows. */
  _childCount: number;
  /** { field → 계산값(number) }. / { field → computed value (number) }. */
  _summary: Record<string, any>;
  /** { field → 포맷된 문자열 }. / { field → formatted string }. */
  _summaryFmt: Record<string, string>;
  /** 하위 행 편집 상태 카운트. / Edit-state counts among child rows. */
  _states: { added: number; edited: number; removed: number };
  /** 자식(중첩 그룹 또는 원본 행). / Children (nested groups or raw rows). */
  children: Array<GroupRow<T> | T>;
}

/** 그룹 항목 — 그룹 헤더 행 또는 원본 행. / A group item — either a group header row or a raw row. */
export type GroupItem<T> = GroupRow<T> | T;

/** 그룹 집계(summary) 정의. / A group summary (aggregation) definition. */
export interface SummaryDef {
  /** 집계 대상 필드명. / Field to aggregate. */
  field: string;
  /** 집계 연산(SUM/AVG/COUNT/MIN/MAX). / Aggregation op (SUM/AVG/COUNT/MIN/MAX). */
  op: SummaryOp;
  /** 표시 라벨(선택). / Display label (optional). */
  label?: string;
  /** 숫자 포맷 예: '#,##0' | '#,##0.00' | '0.00' | '2'. / Number format, e.g. '#,##0' | '#,##0.00' | '0.00' | '2'. */
  format?: string;
}

function _isGroup<T>(item: any): item is GroupRow<T> {
  return item && item._isGroup === true;
}

/**
 * flat 데이터를 fields 기준으로 계층 그룹핑. / Hierarchically group flat data by `fields`.
 *
 * Phase 2 슬롯 #5: groupKeyFn(getKey) — 미지정 시 default = `row[field]`(현행 단일 필드 키).
 *   GroupTreeManager 가 host.getStrategy 로 주입. ⚠️ 핫패스(행당) — 슬롯 예외 비격리.
 * / Phase 2 slot #5: groupKeyFn (`getKey`) — when unset the default is `row[field]` (the current
 *   single-field key), injected by GroupTreeManager via host.getStrategy. ⚠️ Hot path (per row) —
 *   exceptions thrown by the slot are not isolated.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param data - flat 행 배열 / Flat rows
 * @param fields - 그룹핑 기준 필드 순서 / Fields to group by, in order
 * @param summaryDefs - 그룹별 집계 정의(기본 없음) / Per-group aggregation defs (default none)
 * @param expandedKeys - 펼침 상태 그룹 키 집합 / Set of expanded group keys
 * @param getRowState - 행 편집 상태 조회자(선택) / Optional row edit-state accessor
 * @param getKey - 그룹 키 계산 슬롯(선택) / Optional group-key computation slot
 * @returns 최상위 그룹 행 배열 / Array of top-level group rows
 * @example
 * const groups = buildGroups(rows, ['region', 'city'], [{ field: 'amount', op: 'SUM' }]);
 * const flat = flattenGroups(groups); // 화면 표시용 / for on-screen display
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
 * 숫자 포맷팅(GroupEngine 내부 + 외부 공용). / Number formatting (used inside GroupEngine and shared externally).
 *
 * '#,##0'    → 천단위 콤마, 정수 / thousands comma, integer
 * '#,##0.00' → 천단위 콤마, 소수 2자리 / thousands comma, 2 decimals
 * '0.00'     → 소수 2자리 (콤마 없음) / 2 decimals, no comma
 * '2'        → 소수 2자리 (하위 호환) / 2 decimals (legacy compatibility)
 *
 * @param value - 포맷할 숫자 / Number to format
 * @param fmt - 포맷 패턴(생략 시 자동: 정수/소수 판별) / Format pattern (auto integer/decimal when omitted)
 * @returns 포맷된 문자열 / The formatted string
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
 * 그룹 트리를 화면에 표시할 flat 행 배열로 변환. / Flatten a group tree into a display row array.
 *
 * 접힌 그룹(expanded=false)의 자식은 포함하지 않음. / Children of collapsed groups (expanded=false) are excluded.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param groups - 최상위 그룹 행 배열 / Top-level group rows
 * @returns 펼침 상태에 따른 표시 행(그룹 헤더 + 원본 행) / Visible rows per expansion state (group headers + raw rows)
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

/**
 * 특정 그룹 키의 펼침 상태를 토글. / Toggle the expansion state of a group key.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param groups - 그룹 행 배열(시그니처 호환용) / Group rows (kept for signature compatibility)
 * @param groupKey - 토글할 그룹 키 / Group key to toggle
 * @param expandedKeys - 펼침 상태 집합(제자리 변경) / Set of expanded keys (mutated in place)
 */
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

/**
 * 모든 그룹 키 수집(전체 펼침/접기 등에 사용). / Collect every group key (used for expand-all/collapse-all).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param groups - 그룹 행 배열 / Group rows
 * @param parentKey - 상위 키 접두(재귀용, 기본 '') / Parent key prefix (for recursion, default '')
 * @returns 중첩 포함 전체 그룹 키 배열 / All group keys including nested ones
 */
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
