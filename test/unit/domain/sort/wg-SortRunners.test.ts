// @vitest-environment node
/**
 * U-SRUN-S-01~05 (걸음 R1, SyncSortRunner) — TEST_DESIGN_NEW §2-17.
 * U-SRUN-L-*(SlicedSortRunner)은 C13, U-SRUN-W-* 는 C13b.
 */
import { describe, it, expect } from 'vitest';
import { SyncSortRunner } from '../../../../src/core/domain/sort/SyncSortRunner.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SortKeyColumn, DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import type { ISortKeyColumn, ISortOrderer, SortDir } from '../../../../src/core/domain/sort/ports.js';
import { GENS, rowsOf } from '../../wg-helpers/sort-data.js';
import { legacySortIndexes } from '../../wg-helpers/legacy-controls.js';

function setup() {
  const rows = rowsOf(GENS[0]!.make(3), 3);
  const start = rows.map((_, i) => i);
  const keys = [SortKeyColumn.build('f', rows.map(r => r.f), DEFAULT_SORT_COMPARATOR, true)];
  const dirs: SortDir[] = ['asc'];
  return { rows, start, keys, dirs };
}

/** 기록하는 가짜 정렬기 — 받은 인자를 그대로 남기고 진짜 정렬기에 맡긴다. */
class RecordingOrderer implements ISortOrderer {
  readonly id = 'rec';
  calls: Array<{ start: readonly number[]; keys: readonly ISortKeyColumn[]; dirs: readonly SortDir[]; out: Int32Array }> = [];
  private readonly inner = new ComparisonOrderer();
  accepts() { return true; }
  order(start: readonly number[], keys: readonly ISortKeyColumn[], dirs: readonly SortDir[]): Int32Array {
    const out = this.inner.order(start, keys, dirs);
    this.calls.push({ start, keys, dirs, out });
    return out;
  }
}

describe('U-SRUN-S SyncSortRunner (R1)', () => {
  it('U-SRUN-S-01 run 은 즉시 끝 — n=2,000, 돌아온 직후 done true', () => {
    const { start, keys, dirs } = setup();
    const job = new SyncSortRunner().run(start, keys, dirs, new ComparisonOrderer());
    expect(job.done).toBe(true);
    expect(job.settle().length).toBe(2000);
  });

  it('U-SRUN-S-02 끝난 뒤 붙인 onDone 은 그 자리에서 1번, 결과 = orderer.order 결과', () => {
    const { rows, start, keys, dirs } = setup();
    const rec = new RecordingOrderer();
    const job = new SyncSortRunner().run(start, keys, dirs, rec);
    const got: Int32Array[] = [];
    job.onDone(o => got.push(o));
    expect(got.length).toBe(1);
    expect(got[0]).toBe(rec.calls[0]!.out);
    expect(Array.from(got[0]!)).toEqual(legacySortIndexes(rows, start, [{ field: 'f', dir: 'asc' }]));
    expect(job.settle()).toBe(rec.calls[0]!.out);
  });

  it('U-SRUN-S-03 끝난 뒤 cancel → onDone 0번, 던지지 않음', () => {
    const { start, keys, dirs } = setup();
    const job = new SyncSortRunner().run(start, keys, dirs, new ComparisonOrderer());
    expect(() => job.cancel()).not.toThrow();
    let n = 0;
    job.onDone(() => { n++; });
    expect(n).toBe(0);
    expect(job.peekWindow(0, 10)).toBeNull();
  });

  it('U-SRUN-S-04 onDone 두 개 — 각각 정확히 1번', () => {
    const { start, keys, dirs } = setup();
    const job = new SyncSortRunner().run(start, keys, dirs, new ComparisonOrderer());
    let a = 0, b = 0;
    job.onDone(() => { a++; });
    job.onDone(() => { b++; });
    expect([a, b]).toEqual([1, 1]);
  });

  it('U-SRUN-S-05 인자 전달 — start·keys·dirs 가 같은 참조로 orderer 에 1번', () => {
    const { start, keys, dirs } = setup();
    const rec = new RecordingOrderer();
    new SyncSortRunner().run(start, keys, dirs, rec);
    expect(rec.calls.length).toBe(1);
    expect(rec.calls[0]!.start).toBe(start);
    expect(rec.calls[0]!.keys).toBe(keys);
    expect(rec.calls[0]!.dirs).toBe(dirs);
  });
});
