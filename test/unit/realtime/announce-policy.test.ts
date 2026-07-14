// DD-07 §2.5 RtAnnouncePolicy — 백그라운드 규모요약 디바운스 병합·연결 즉시공지. / DD-07 §2.5.
import { describe, it, expect } from 'vitest';
import { RtAnnouncePolicy } from '../../../src/core/realtime/index.js';
import type { AppliedDelta, RtAnnounceSummary } from '../../../src/core/realtime/index.js';
import { ManualTimer } from './_helpers.js';

const applied = (a: Partial<AppliedDelta>): AppliedDelta => ({
  changedCells: [],
  insertedRowIds: [],
  removedRowIds: [],
  userInitiated: false,
  ...a,
});

describe('DD-07 RtAnnouncePolicy — SR 공지 정책', () => {
  it('고빈도 백그라운드 갱신을 디바운스 후 규모요약 1회(개별 셀 나열 금지)', () => {
    const timer = new ManualTimer();
    const out: RtAnnounceSummary[] = [];
    const p = new RtAnnouncePolicy({ announce: (s) => out.push(s), debounceMs: 500, schedule: timer.scheduler });
    p.onBackgroundChange(applied({ changedCells: [{ rowId: 'r1', field: 'a' }] }));
    p.onBackgroundChange(applied({ changedCells: [{ rowId: 'r2', field: 'b' }] }));
    p.onBackgroundChange(applied({ changedCells: [{ rowId: 'r1', field: 'a' }] })); // 중복 셀
    expect(out).toHaveLength(0); // 디바운스 대기
    timer.runAll();
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('background-update');
    expect(out[0]!.changedCount).toBe(2); // 고유 셀 2
    expect(out[0]!.rowCount).toBe(2);
    expect(out[0]!.label).toBe('background');
    expect(out[0]!.interruptsFocus).toBe(false);
  });

  it('연결 공지는 즉시(디바운스 없음, 정직 노출)', () => {
    const timer = new ManualTimer();
    const out: RtAnnounceSummary[] = [];
    const p = new RtAnnouncePolicy({ announce: (s) => out.push(s), schedule: timer.scheduler });
    p.onConnection('reconnecting');
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('connection');
    expect(out[0]!.connectionStatus).toBe('reconnecting');
  });

  it('dispose 후 대기중 공지 취소', () => {
    const timer = new ManualTimer();
    const out: RtAnnounceSummary[] = [];
    const p = new RtAnnouncePolicy({ announce: (s) => out.push(s), schedule: timer.scheduler });
    p.onBackgroundChange(applied({ changedCells: [{ rowId: 'r1', field: 'a' }] }));
    p.dispose();
    timer.runAll();
    expect(out).toHaveLength(0);
  });
});
