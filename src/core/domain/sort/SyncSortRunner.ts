// ============================================================
// 한 번에 정렬하는 실행기 / Run-to-completion sort runner
//
// 정렬의 「실행 방식」 가운데 가장 단순한 것 — 부른 자리에서 끝까지 정렬하고, 이미 끝난 작업을 돌려준다.
// orderBy() 처럼 공개 뜻이 「돌아오면 정렬이 끝나 있다」인 길은 늘 이 실행기를 쓴다.
// 조각으로 나누는 실행기도 같은 SortJob 꼴을 돌려주므로, 부르는 쪽은 어느 실행기인지 몰라도 된다.
//
// The simplest execution strategy: sorts to completion on the spot and returns an already-finished job.
// Paths whose public meaning is "sorted when it returns" (orderBy) always use it. Sliced runners return
// the same SortJob shape, so callers never need to know which runner they got.
// ============================================================
import type { ISortKeyColumn, ISortOrderer, ISortRunner, SortDir, SortJob } from './ports.js';

/**
 * 이미 끝난 정렬 작업. onDone 은 붙이는 그 자리에서 한 번 부르고, cancel 뒤에는 부르지 않는다.
 *
 * An already-finished sort job: onDone fires immediately, once per callback, and never after cancel().
 */
class DoneSortJob implements SortJob {
  readonly done = true;
  private _cancelled = false;

  constructor(private readonly _order: Int32Array) {}

  cancel(): void {
    this._cancelled = true;
  }

  onDone(cb: (order: Int32Array) => void): void {
    if (!this._cancelled) cb(this._order);
  }

  settle(): Int32Array {
    return this._order;
  }

  peekWindow(_start: number, _end: number): Int32Array | null {
    // 구간을 먼저 주는 것은 「화면 구간 먼저」 실행기의 일이다. 끝난 작업은 settle() 로 전체를 준다.
    // Handing out a visible slice early belongs to the slice-first runner; a finished job answers via settle().
    return null;
  }
}

/**
 * 부른 자리에서 순서 매기기를 한 번 부르고 끝난 작업을 돌려준다. 순서는 매기지 않는다(전략에 맡김).
 *
 * Calls the orderer once, synchronously, and returns a finished job; ordering itself is the orderer's job.
 */
export class SyncSortRunner implements ISortRunner {
  run(start: readonly number[], keys: readonly ISortKeyColumn[], dirs: readonly SortDir[], orderer: ISortOrderer): SortJob {
    return new DoneSortJob(orderer.order(start, keys, dirs));
  }
}
