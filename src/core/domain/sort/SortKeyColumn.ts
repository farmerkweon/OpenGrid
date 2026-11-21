// ============================================================
// 정렬 키 열 — 한 컬럼의 값을 비교 가능한 키로 한 번 뽑아 둔다 / Sort key column
//
// 정렬은 「키 뽑기 → 순서 매기기 → 실행」 셋으로 갈라 두었고, 이 파일은 첫째(키 뽑기)의 주인이다.
// 구현은 셋이다: 숫자만 든 열(NumberKeyColumn — Float64Array), 글자만 든 열(StringKeyColumn — String() 한 번),
// 그 밖(GeneralKeyColumn — 옛 비교자를 그대로 부름). 어느 것을 쓸지는 build 한 곳에서만 고른다.
// 빠른 두 열은 기본 비교자일 때만, 그리고 그 비교자가 모든 쌍에 일관된 답을 주는 값일 때만 쓴다 —
// 그래야 비교 결과의 부호가 쌍마다 옛 비교자와 같고, 같은 정렬 알고리즘이 바이트까지 같은 순서를 낸다.
//
// Sorting is split into key extraction, ordering and execution; this file owns key extraction.
// Three implementations: numbers only (Float64Array), strings only (String() once), and the rest
// (GeneralKeyColumn, which calls the legacy comparator verbatim). build() is the only place that chooses.
// The fast columns are used only with the default comparator and only for values it orders consistently,
// so every pair compares with the same sign as before and the same sort routine yields the same bytes.
// ============================================================
import type { ISortKeyColumn, SortComparator, SortDir } from './ports.js';

/**
 * 기본 단일 키 비교 — 그리드가 처음부터 써 온 규칙 그대로다.
 * null/undefined 가 먼저, 둘 다 숫자면 뺄셈, 나머지는 String() 으로 바꿔 UTF-16 코드 단위 순.
 * 모듈 상수로 둔 까닭: 덮어쓴 비교자가 이것과 같은 함수인지(===) 보고 빠른 길을 고를 수 있게 하려는 것.
 *
 * The built-in single-key comparison, exactly as the grid has always done it: null/undefined first,
 * numeric subtraction when both are numbers, otherwise String() compared by UTF-16 code units.
 * It is a module constant so a resolved override can be recognised by identity (===).
 */
export const DEFAULT_SORT_COMPARATOR: SortComparator = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

/** 값이 원시값만인가 — 객체 값(Date 등)은 제자리에서 바뀌어도 === 를 통과하므로 보관하면 안 된다. */
function allPrimitive(values: readonly unknown[]): boolean {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && (typeof v === 'object' || typeof v === 'function')) return false;
  }
  return true;
}

/**
 * 키 열의 뼈대. 어떤 구현을 쓸지는 build 한 곳에서만 고른다(부르는 쪽이 종류를 조건문으로 가르지 않게).
 *
 * Base of the key-column strategies; build() is the single place that picks an implementation,
 * so callers never branch on the kind themselves.
 */
export abstract class SortKeyColumn implements ISortKeyColumn {
  abstract readonly field: string;
  abstract readonly kind: ISortKeyColumn['kind'];
  abstract readonly cacheable: boolean;
  abstract compare(i: number, j: number): number;
  abstract stringKeyAt(i: number): string | null;

  /**
   * 한 컬럼의 키 열을 만든다. values[i] = 모델 행 i 의 값(한 번만 읽어 넘긴 것).
   * dir 은 비교자에 그대로 넘기는 정렬 방향이다 — 옛 비교 고리가 사용자 비교자에 (a, b, field, dir) 를
   * 넘겼으므로 덮어쓴 비교자가 dir 을 읽어도 같은 값을 받게 한다. 비교 결과 자체는 늘 오름차순 뜻이고,
   * 내림차순 뒤집기는 순서 매기기 쪽이 한다. 방향이 빠진 정렬 목록이면 undefined 를 그대로 넘긴다(옛 고리와 같음 —
   * 순서는 「asc 가 아니면 뒤집음」이라 내림차순인데, 기본값을 채우면 비교자만 「asc」라고 듣게 된다).
   *
   * Builds the key column for one field; values[i] is model row i's value, read once.
   * dir is forwarded to the comparator unchanged, because the legacy loop passed (a, b, field, dir)
   * and an override may read it. The result of compare() is always in ascending sense; the orderer flips it.
   * A missing dir is passed on as undefined, as before — no default is filled in.
   */
  static build(
    field: string,
    values: readonly unknown[],
    cmp: SortComparator,
    isDefaultCmp: boolean,
    dir?: SortDir,
  ): SortKeyColumn {
    // 사용자 비교자는 값을 들여다보지 않고 옛 길 그대로 — 비교자 호출의 인자·차례·횟수가 그대로 남는다.
    // A user comparator takes the legacy path untouched, so its calls (arguments, order, count) stay the same.
    if (!isDefaultCmp) return new GeneralKeyColumn(field, values, cmp, dir);
    const shape = ValueShape.of(values);
    if (shape.numeric) return new NumberKeyColumn(field, shape.copy);
    if (shape.textual) return new StringKeyColumn(field, shape.copy);
    return new GeneralKeyColumn(field, shape.copy, cmp, dir);
  }
}

/**
 * 값 배열을 한 번만 읽어(사본을 남김) 어느 빠른 키 열이 옛 비교자와 같은 답을 내는지 판정한다.
 * - numeric: null/undefined 아니면 모두 number 이고, 옛 비교자의 뺄셈이 NaN 을 내는 쌍이 없음
 *   (NaN 이 하나라도 있거나 같은 부호의 Infinity 가 둘 이상이면 NaN 이 나옴 → 일반 길).
 * - textual: null/undefined 아니면 모두 string 또는 boolean(옛 비교자가 String() 으로 비교하는 값, 숫자와 섞이지 않음).
 * 객체·Symbol·bigint 가 섞이면 둘 다 아님(String() 이 사용자 코드를 부르거나 던질 수 있어 옛 길에 둔다).
 *
 * Reads the values once (keeping a copy) and decides which fast column reproduces the legacy comparator:
 * numeric = only numbers besides null/undefined and no pair whose subtraction is NaN (any NaN, or two
 * infinities of the same sign, sends it to the general path); textual = only strings/booleans besides
 * null/undefined. Objects, symbols and bigints stay on the legacy path, where String() may run user code.
 */
class ValueShape {
  private constructor(readonly copy: unknown[], readonly numeric: boolean, readonly textual: boolean) {}

  static of(values: readonly unknown[]): ValueShape {
    const n = values.length;
    const copy: unknown[] = new Array(n);
    let numeric = true, textual = true, posInf = 0, negInf = 0;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      copy[i] = v;
      if (v == null) continue;
      const t = typeof v;
      if (t === 'number') {
        textual = false;
        if (v !== v) numeric = false;
        else if (v === Infinity) { if (++posInf > 1) numeric = false; }
        else if (v === -Infinity) { if (++negInf > 1) numeric = false; }
      } else if (t === 'string' || t === 'boolean') {
        numeric = false;
      } else {
        numeric = false;
        textual = false;
      }
    }
    return new ValueShape(copy, numeric, textual);
  }
}

/**
 * 옛 비교자를 그대로 부르는 키 열. 섞인 열·사용자 비교자·비교가 일관되지 않는 값(NaN 등)이 오는 자리.
 * 비교마다 행에서 값을 다시 꺼내지 않도록 값 배열만 들고, 비교는 그 배열의 두 칸을 비교자에 넘긴다.
 *
 * Key column that calls the legacy comparator as-is — used for mixed columns, user comparators and
 * values the comparator does not order consistently (NaN …). It holds the extracted value array so
 * a comparison never goes back to the row objects.
 */
export class GeneralKeyColumn extends SortKeyColumn {
  readonly kind = 'general' as const;
  readonly cacheable: boolean;

  constructor(
    readonly field: string,
    private readonly _values: readonly unknown[],
    private readonly _cmp: SortComparator,
    private readonly _dir: SortDir | undefined,
  ) {
    super();
    this.cacheable = allPrimitive(_values);
  }

  compare(i: number, j: number): number {
    // 비교자는 받는 쪽 없이(this 없이) 부른다 — 옛 고리처럼. 메서드로 부르면 비교자 안의 this 가 이 키 열이 되어
    // 사용자 코드에 안쪽 값 배열이 드러난다.
    // Call the comparator without a receiver, as the legacy loop did, so user code never sees this column as its receiver.
    const cmp = this._cmp;
    return cmp(this._values[i], this._values[j], this.field, this._dir);
  }

  stringKeyAt(_i: number): string | null {
    return null;
  }
}

/**
 * 숫자만 든 열. 키를 Float64Array 에, 빈 값(null/undefined)을 따로 표시해 두고 비교는 두 칸 뺄셈뿐이다.
 * 옛 비교자와 같은 값을 돌려준다: 빈 값끼리 0, 빈 값이 앞, 나머지는 a - b(−0 과 0 은 같음).
 *
 * Numbers-only column: keys in a Float64Array plus an empty-value mark; compare() returns exactly what the
 * legacy comparator returned (empties equal and first, otherwise a - b, so −0 equals 0).
 */
export class NumberKeyColumn extends SortKeyColumn {
  readonly kind = 'number' as const;
  readonly cacheable = true;
  private readonly _keys: Float64Array;
  private readonly _empty: Uint8Array;

  constructor(readonly field: string, values: readonly unknown[]) {
    super();
    const n = values.length;
    this._keys = new Float64Array(n);
    this._empty = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v == null) this._empty[i] = 1;
      else this._keys[i] = v as number;
    }
  }

  compare(i: number, j: number): number {
    const e = this._empty;
    if (e[i]) return e[j] ? 0 : -1;
    if (e[j]) return 1;
    return this._keys[i]! - this._keys[j]!;
  }

  stringKeyAt(_i: number): string | null {
    return null;
  }
}

/**
 * 글자만 든 열. String() 을 행마다 한 번만 불러 키를 들고, 비교는 UTF-16 코드 단위 사전순(옛 비교자와 같음).
 * 빈 값(null/undefined)은 키 null 로 두고 앞에 온다. 긴 공통 머리말 정렬이 쓰도록 키를 그대로 내준다.
 *
 * Strings-only column: String() runs once per row; compare() is UTF-16 code-unit order like the legacy
 * comparator, with empties (key null) first. stringKeyAt() exposes the key for prefix-aware orderers.
 */
export class StringKeyColumn extends SortKeyColumn {
  readonly kind = 'string' as const;
  readonly cacheable = true;
  private readonly _keys: (string | null)[];

  constructor(readonly field: string, values: readonly unknown[]) {
    super();
    const n = values.length;
    const keys: (string | null)[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = values[i];
      keys[i] = v == null ? null : String(v);
    }
    this._keys = keys;
  }

  compare(i: number, j: number): number {
    const a = this._keys[i], b = this._keys[j];
    if (a == null) return b == null ? 0 : -1;
    if (b == null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  stringKeyAt(i: number): string | null {
    return this._keys[i] ?? null;
  }
}
