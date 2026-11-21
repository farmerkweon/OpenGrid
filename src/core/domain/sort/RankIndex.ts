// ============================================================
// 컬럼 등수 / Column ranks
//
// 한 번 정렬한 컬럼은 행마다 「몇 번째 값인가」(등수)를 정수로 들고 있으면, 같은 컬럼을 다시 정렬할 때
// 글자·숫자를 다시 비교하지 않고 정수 둘만 비교하면 된다(4,000자 글을 다시 견주지 않는다).
// 등수는 값에서만 나오므로, 「같은 자리에 같은 원시값이 있으면」 맞다 — 낡았는지는 그 검사 하나로 안다.
// 그래서 값이 바뀌는 길(직접 수정·updateCell·수식 재계산 …)마다 무효화 호출을 흩어 두지 않는다.
// 값이 객체인 열(Date 등)은 제자리에서 바뀌어도 검사를 통과하므로 여기 오지 않는다(보관하는 쪽이 거른다).
//
// Once a column has been sorted, holding each row's rank (an integer) lets a re-sort compare two integers
// instead of re-comparing strings or numbers. Ranks derive from values alone, so they stay correct exactly
// while the same primitive value sits in the same slot — one check tells staleness, with no invalidation
// calls scattered over every mutation path. Object-valued columns (Date …) never get here.
// ============================================================
import type { IRankIndex, ISortKeyColumn, SortDir } from './ports.js';

/**
 * 한 컬럼에서 읽어 둔 원시값과 「읽은 행」 표시. 낡음 검사의 유일한 기준이다.
 *
 * The primitives read from one column plus which rows were read; the sole baseline for staleness checks.
 */
export class ValueSnapshot {
  private readonly _covered: Uint8Array;

  /**
   * @param field 필드 이름 / field name
   * @param values 행 번호 자리의 값(읽은 행만 의미가 있음) / values by row index (meaningful for read rows only)
   * @param read 값을 읽은 행 번호들 / row indexes that were read
   */
  constructor(readonly field: string, readonly values: readonly unknown[], read: ArrayLike<number>) {
    this._covered = new Uint8Array(values.length);
    for (let k = 0; k < read.length; k++) this._covered[read[k]!] = 1;
  }

  /** 행 번호들이 모두 읽은 행인가. / Whether every given row was read. */
  covers(rows: ArrayLike<number>): boolean {
    const cov = this._covered;
    for (let k = 0; k < rows.length; k++) if (!cov[rows[k]!]) return false;
    return true;
  }

  /**
   * O(n) 낡음 검사: 행 수가 같고, 볼 행(start — 생략하면 읽은 행 전부)이 모두 읽은 행이며,
   * 그 자리의 지금 값이 보관값과 === 인가. 행마다 이 필드를 한 번만 읽는다.
   *
   * O(n) freshness: same row count, every row to check (start, or all read rows when omitted) was read,
   * and its current value is === the stored one. Reads this field once per row.
   */
  isFreshFor(rows: readonly unknown[], start?: ArrayLike<number>): boolean {
    const vals = this.values, n = vals.length;
    if (rows.length !== n) return false;
    const f = this.field, cov = this._covered;
    if (start) {
      for (let k = 0; k < start.length; k++) {
        const i = start[k]!;
        if (!cov[i] || (rows[i] as Record<string, unknown>)[f] !== vals[i]) return false;
      }
      return true;
    }
    for (let i = 0; i < n; i++) {
      if (cov[i] && (rows[i] as Record<string, unknown>)[f] !== vals[i]) return false;
    }
    return true;
  }
}

/**
 * 등수 보관(값 객체 — 만든 뒤 바뀌지 않는다). 같은 값 = 같은 등수, 작은 값 = 작은 등수.
 * 등수를 매긴 행 밖의 행은 등수가 없으므로, 정렬할 행이 하나라도 그 밖이면 낡은 것으로 본다.
 *
 * Immutable rank holder: equal values share a rank, smaller values get smaller ranks. Rows outside the
 * ranked set have no rank, so any row to be sorted outside it makes the index stale.
 */
export class RankIndex implements IRankIndex {
  private constructor(
    readonly field: string,
    private readonly _ranks: Int32Array,
    private readonly _snapshot: ValueSnapshot,
  ) {}

  /**
   * 정렬이 끝난 순서에서 등수를 매긴다 — 이웃끼리 한 번씩만 비교하므로 O(n).
   * sorted 는 key 의 오름(dir 'asc')·내림(그 밖 — 옛 고리처럼 'asc' 가 아니면 뒤집힌 것) 순서로 놓인 행 번호여야 한다
   * (같은 값끼리는 붙어 있다). values 는 key 를 만들 때 읽은 원시값(행 번호 자리) — 낡음 검사의 기준이다.
   *
   * Ranks rows from a finished sort order with one comparison per neighbour (O(n)). sorted must list row
   * indexes in ascending ('asc') or descending (anything else) key order; values are the primitives read when
   * key was built, indexed by row, and are the baseline for staleness checks.
   */
  static fromSorted(
    field: string,
    key: ISortKeyColumn,
    sorted: ArrayLike<number>,
    dir: SortDir | undefined,
    values: readonly unknown[],
  ): RankIndex {
    const ranks = new Int32Array(values.length);
    const m = sorted.length;
    // 내림차순으로 놓였으면 뒤에서부터 걸어 「작은 값 = 작은 등수」로 매긴다(같은 행 번호가 두 번 나와도 한 번만 셈).
    // A descending order is walked from the end so smaller values get smaller ranks (repeated indexes stay consistent).
    const asc = dir === 'asc';
    let r = 0;
    for (let t = 0; t < m; t++) {
      const k = asc ? t : m - 1 - t;
      const i = sorted[k]!;
      if (t > 0 && key.compare(sorted[asc ? k - 1 : k + 1]!, i) !== 0) r++;
      ranks[i] = r;
    }
    return new RankIndex(field, ranks, new ValueSnapshot(field, values, sorted));
  }

  compare(i: number, j: number): number {
    return this._ranks[i]! - this._ranks[j]!;
  }

  /** 행 번호들이 모두 등수를 가졌나. / Whether every given row has a rank. */
  covers(rows: ArrayLike<number>): boolean {
    return this._snapshot.covers(rows);
  }

  /**
   * O(n) 낡음 검사 — 행 수 · 등수 가진 행 · 값 === (ValueSnapshot.isFreshFor 와 같음).
   * O(n) staleness check — row count, ranked rows, values === (same as ValueSnapshot.isFreshFor).
   */
  isFreshFor(rows: readonly unknown[], start?: ArrayLike<number>): boolean {
    return this._snapshot.isFreshFor(rows, start);
  }
}

/**
 * 등수로 비교하는 키 열. 등수가 원래 키 열과 같은 차례를 지키므로 순서 매기기 결과도 같다.
 * 비교가 정수라 글자 키를 내주지 않는다(머리말 기억 정렬이 필요 없다).
 *
 * Key column that compares by rank; ranks keep the original column's order, so orderings are identical.
 * Comparisons are integers, so no string key is exposed (prefix-aware orderers are unnecessary).
 */
export class RankedKeyColumn implements ISortKeyColumn {
  readonly kind = 'ranked' as const;
  readonly cacheable = true;

  constructor(private readonly _index: RankIndex) {}

  get field(): string {
    return this._index.field;
  }

  compare(i: number, j: number): number {
    return this._index.compare(i, j);
  }

  stringKeyAt(_i: number): string | null {
    return null;
  }
}
