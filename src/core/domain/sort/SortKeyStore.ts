// ============================================================
// 정렬 키 열을 내주는 곳 · 컬럼 등수 보관 / Source of sort key columns · keeper of column ranks
//
// 정렬하는 쪽(Sorter)이 「이 컬럼의 키 열을 달라」고 묻는 유일한 창구이고, 한 번 정렬한 컬럼의 키와 등수를
// 들고 있는 유일한 곳이다. 같은 컬럼을 다시 정렬하면(오름 ↔ 내림 되눌림이 흔하다) 행에서 값을 다시 꺼내
// 키를 새로 만들지 않고, 정렬 결과로 매겨 둔 정수 등수로 비교하게 한다.
// 낡았는지는 「정렬할 행마다 지금 값이 보관값과 === 인가」 하나로 안다 — 값을 바꾸는 길이 여럿이라도
// (직접 수정·updateCell·수식 재계산·행 추가·이동 …) 무효화 호출을 그 길마다 흩지 않는다.
// 보관하는 것은 기본 비교자로 만든 숫자·글자 키 열뿐이다: 사용자 비교자는 방향(dir)을 읽거나 바뀔 수 있고,
// 객체 값(Date 등)은 제자리에서 바뀌어도 === 를 통과하기 때문이다.
//
// The single place a sorter asks for "the key column of this field", and the single keeper of a sorted
// column's keys and ranks. Re-sorting the same column (asc <-> desc is common) reuses the extracted keys and
// compares by the integer ranks taken from the previous result. Staleness is one check — every row to sort
// still holds a value === the stored one — so no invalidation calls are scattered over the many mutation paths.
// Only number/string columns built with the default comparator are kept: user comparators may read dir or
// change, and object values (Date …) pass === even after in-place edits.
// ============================================================
import type { IRowSource, ISortKeyColumn, ISortKeyStore, SortComparator, SortDir, SortSpec } from './ports.js';
import { DEFAULT_SORT_COMPARATOR, SortKeyColumn } from './SortKeyColumn.js';
import { RankIndex, RankedKeyColumn, ValueSnapshot } from './RankIndex.js';

/** 한 컬럼에 대해 들고 있는 것: 키 열 · 그때 읽은 값 · (정렬을 거쳤으면) 그 결과 순서 · (다시 쓰였으면) 등수. */
interface Kept {
  readonly key: ISortKeyColumn;
  readonly snapshot: ValueSnapshot;
  sorted: ArrayLike<number> | null;
  dir: SortDir | undefined;
  ranks: RankIndex | null;
}

/**
 * 행 원천에서 정렬할 행의 한 컬럼 값을 한 번 읽어 키 열을 만들고, 보관할 수 있으면 들고 있다.
 *
 * Reads one field of the rows being sorted once, builds its key column, and keeps it when that is safe.
 */
export class SortKeyStore implements ISortKeyStore {
  private readonly _kept = new Map<string, Kept>();

  constructor(private readonly _source: IRowSource) {}

  /** 진단: 지금 보관 중인 컬럼 수. / Diagnostic: number of columns currently kept. */
  get size(): number {
    return this._kept.size;
  }

  /**
   * @param start 이번 정렬의 출발 순서. 생략하면 원천의 지금 표시 순서 / this sort's start order; defaults to the source's display order
   */
  keyColumnFor(spec: SortSpec, cmp: SortComparator, start: readonly number[] = this._source.displayOrder()): ISortKeyColumn {
    const rows = this._source.rows as readonly Record<string, unknown>[];
    const field = spec.field;
    const isDefault = cmp === DEFAULT_SORT_COMPARATOR;
    if (isDefault) {
      const kept = this._kept.get(field);
      if (kept && kept.snapshot.isFreshFor(rows, start)) return this._reuse(kept, start);
    }
    // 정렬할 행(출발 순서에 든 행)의 값만 읽는다 — 숨은 행·지운 행은 읽지 않는다. 옛 정렬이 읽던 범위와
    // 같아야 행 객체의 게터 호출이나 빈 행 자리에서의 예외가 예전과 똑같이 일어난다.
    // Read only the rows being sorted (those in the start order), never hidden or removed ones — the same
    // range the legacy sort read, so getters and errors on empty row slots behave exactly as before.
    const values: unknown[] = new Array(rows.length);
    for (let k = 0; k < start.length; k++) {
      const i = start[k]!;
      values[i] = rows[i]![field];
    }
    const key = SortKeyColumn.build(field, values, cmp, isDefault, spec.dir);
    if (isDefault && (key.kind === 'number' || key.kind === 'string')) {
      this._kept.set(field, { key, snapshot: new ValueSnapshot(field, values, start), sorted: null, dir: undefined, ranks: null });
    } else if (isDefault) {
      this._kept.delete(field);
    }
    return key;
  }

  /**
   * 정렬이 끝났다는 알림. key 가 이 저장소가 내준(보관 중인) 키 열이면 결과 순서만 기억해 둔다 — 등수는
   * 같은 컬럼을 다시 정렬할 때 매긴다(첫 정렬에 이웃 비교 n 번을 더 치르지 않으려고).
   *
   * Notification that a sort finished. If key is a column this store handed out and keeps, only the order is
   * remembered; ranks are taken on the next sort of the same column, so the first sort pays nothing extra.
   */
  noteSorted(key: ISortKeyColumn, sorted: ArrayLike<number>, dir: SortDir | undefined): void {
    const kept = this._kept.get(key.field);
    if (!kept || kept.key !== key) return;
    kept.sorted = sorted;
    kept.dir = dir;
  }

  clear(): void {
    // 보관한 키·값·등수를 놓아 메모리를 푼다(setData·clearData 때).
    // Drop kept keys, values and ranks to release memory (on setData / clearData).
    this._kept.clear();
  }

  /**
   * 낡지 않은 보관분을 다시 쓴다 — 지난 정렬 결과를 알면 거기서 등수를 매겨(이웃 비교 n 번) 등수 키 열로,
   * 등수가 이번에 정렬할 행을 다 덮지 못하면(필터가 풀려 행이 늘어난 경우 등) 뽑아 둔 키 열 그대로.
   *
   * Reuses a fresh entry: ranks are taken from the last sort result (n neighbour comparisons) and handed out as
   * a ranked column; if they do not cover every row to sort now (e.g. a filter was lifted), the kept key column.
   */
  private _reuse(kept: Kept, start: readonly number[]): ISortKeyColumn {
    if (kept.sorted && (!kept.ranks || !kept.ranks.covers(start))) {
      kept.ranks = RankIndex.fromSorted(kept.key.field, kept.key, kept.sorted, kept.dir, kept.snapshot.values);
      kept.sorted = null;
    }
    return kept.ranks && kept.ranks.covers(start) ? new RankedKeyColumn(kept.ranks) : kept.key;
  }
}
