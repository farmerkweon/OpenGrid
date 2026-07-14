// DD-07 §2.4 백프레셔 스케줄러 — coalesce·최신값우선·프레임예산·스냅샷 무효화. / DD-07 §2.4 backpressure.
import { describe, it, expect } from 'vitest';
import { BackpressureScheduler } from '../../../src/core/realtime/index.js';
import type { NormalizedBatch, DeltaPayload, SnapshotPayload } from '../../../src/core/realtime/index.js';
import { ManualFrame } from './_helpers.js';

interface T {
  a: number;
  b: number;
}
const delta = (p: Partial<DeltaPayload<T>> & { seq: number }): DeltaPayload<T> => ({ kind: 'delta', ...p });

describe('DD-07 BackpressureScheduler — coalesce 최신값우선', () => {
  it('같은 rowId+field 재유입은 펜딩 맵에서 덮어쓰기(최신값 우선)', () => {
    const frame = new ManualFrame();
    const flushed: NormalizedBatch<T>[] = [];
    const s = new BackpressureScheduler<T>({ scheduleFrame: frame.scheduler, flush: (b) => flushed.push(b) });
    s.enqueue(delta({ seq: 1, cells: [{ rowId: 'r1', field: 'a', value: 1 }] }));
    s.enqueue(delta({ seq: 2, cells: [{ rowId: 'r1', field: 'a', value: 2 }] }));
    s.enqueue(delta({ seq: 3, cells: [{ rowId: 'r1', field: 'a', value: 3 }] }));
    expect(frame.pending).toBe(1); // rAF 1회만 예약
    frame.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.cells).toEqual([{ rowId: 'r1', field: 'a', value: 3 }]);
    expect(s.stats.coalesced).toBe(2);
  });

  it('프레임 예산(maxBatchPerFrame) 초과분은 다음 프레임(overflow)', () => {
    const frame = new ManualFrame();
    const flushed: NormalizedBatch<T>[] = [];
    const s = new BackpressureScheduler<T>({
      maxBatchPerFrame: 2,
      scheduleFrame: frame.scheduler,
      flush: (b) => flushed.push(b),
    });
    for (let i = 0; i < 5; i++) s.enqueue(delta({ seq: i, cells: [{ rowId: 'r' + i, field: 'a', value: i }] }));
    frame.flush();
    expect(flushed[0]!.cells).toHaveLength(2);
    expect(flushed[0]!.overflowToNextFrame).toBe(true);
    expect(frame.pending).toBe(1); // 초과분 재예약
    frame.flush();
    expect(flushed[1]!.cells).toHaveLength(2);
    frame.flush();
    expect(flushed[2]!.cells).toHaveLength(1);
  });

  it('upsert 는 rowId 로 병합, remove 는 펜딩 셀/upsert 정리', () => {
    const frame = new ManualFrame();
    const flushed: NormalizedBatch<T>[] = [];
    const s = new BackpressureScheduler<T>({ scheduleFrame: frame.scheduler, flush: (b) => flushed.push(b) });
    s.enqueue(delta({ seq: 1, upserts: [{ rowId: 'r1', row: { a: 1 } }] }));
    s.enqueue(delta({ seq: 2, upserts: [{ rowId: 'r1', row: { b: 2 } }] }));
    s.enqueue(delta({ seq: 3, cells: [{ rowId: 'r2', field: 'a', value: 9 }] }));
    s.enqueue(delta({ seq: 4, removes: ['r2'] }));
    frame.flush();
    const b = flushed[0]!;
    expect(b.upserts).toEqual([{ rowId: 'r1', row: { a: 1, b: 2 } }]);
    expect(b.removes).toEqual(['r2']);
    expect(b.cells.find((c) => c.rowId === 'r2')).toBeUndefined(); // 제거로 정리됨
  });

  it('스냅샷 도착 시 펜딩 델타 전량 무효화(스냅샷=최신 진실)', () => {
    const frame = new ManualFrame();
    const flushed: NormalizedBatch<T>[] = [];
    const s = new BackpressureScheduler<T>({ scheduleFrame: frame.scheduler, flush: (b) => flushed.push(b) });
    s.enqueue(delta({ seq: 1, cells: [{ rowId: 'r1', field: 'a', value: 1 }] }));
    const snap: SnapshotPayload<T> = { kind: 'snapshot', rows: [{ a: 1, b: 2 }], seq: 2 };
    s.enqueue(snap);
    expect(s.stats.dropped).toBeGreaterThan(0); // 펜딩 델타 폐기 계량
    frame.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]!.snapshot).toBe(snap);
    expect(flushed[0]!.cells).toHaveLength(0);
  });

  it('dispose 후 enqueue 무시(누수·폭주 0)', () => {
    const frame = new ManualFrame();
    const flushed: NormalizedBatch<T>[] = [];
    const s = new BackpressureScheduler<T>({ scheduleFrame: frame.scheduler, flush: (b) => flushed.push(b) });
    s.dispose();
    s.enqueue(delta({ seq: 1, cells: [{ rowId: 'r1', field: 'a', value: 1 }] }));
    expect(frame.pending).toBe(0);
    expect(s.stats.pending).toBe(0);
  });
});
