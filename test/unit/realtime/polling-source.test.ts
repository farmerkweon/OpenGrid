// DD-07 §2.2 PollingSource — 성공 방출·seq 드롭·backoff 재연결·소진 error. / DD-07 §2.2 polling source.
import { describe, it, expect, vi } from 'vitest';
import { PollingSource } from '../../../src/core/realtime/index.js';
import type { ConnectionState, RtPayload, BackoffPolicy } from '../../../src/core/realtime/index.js';
import { ManualTimer, flush } from './_helpers.js';

interface T {
  a: number;
}

describe('DD-07 PollingSource — 폴링 어댑터', () => {
  it('start→첫 폴 성공 시 open + 데이터 방출 + 다음 폴 예약', async () => {
    const timer = new ManualTimer();
    let seq = 1;
    const payloads: RtPayload<T>[] = [];
    const src = new PollingSource<T>({
      intervalMs: 100,
      fetcher: async () => ({ kind: 'delta', seq: seq++, cells: [{ rowId: 'r1', field: 'a', value: 1 }] }),
      timer: timer.scheduler,
      now: () => 1000,
    });
    src.onData((p) => payloads.push(p));
    src.start();
    expect(src.status.status).toBe('connecting');
    timer.runNext();
    await flush();
    expect(src.status.status).toBe('open');
    expect(src.status.lastReceivedAt).toBe(1000);
    expect(payloads).toHaveLength(1);
    expect(timer.pending).toBe(1); // 다음 폴 예약
  });

  it('seq 역전 페이로드는 드롭+경고(무언 삼킴 아님, 연결은 open 유지)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timer = new ManualTimer();
    const seqs = [5, 3];
    let i = 0;
    const payloads: RtPayload<T>[] = [];
    const src = new PollingSource<T>({
      intervalMs: 100,
      fetcher: async () => ({ kind: 'delta', seq: seqs[i++]!, cells: [{ rowId: 'r1', field: 'a', value: i }] }),
      timer: timer.scheduler,
    });
    src.onData((p) => payloads.push(p));
    src.start();
    timer.runNext();
    await flush();
    timer.runNext();
    await flush();
    expect(payloads).toHaveLength(1); // 두 번째(seq 3)는 드롭
    expect(src.status.status).toBe('open');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('폴 실패 시 backoff 재연결(reconnecting·nextRetryAt·lastError)', async () => {
    const timer = new ManualTimer();
    const backoff: BackoffPolicy = { baseMs: 200, factor: 2, maxMs: 5000, maxAttempts: 3 };
    let fail = true;
    const src = new PollingSource<T>({
      intervalMs: 100,
      backoff,
      fetcher: async () => {
        if (fail) throw new Error('network down');
        return { kind: 'delta', seq: 1, cells: [] };
      },
      timer: timer.scheduler,
      now: () => 2000,
      random: () => 0.5,
    });
    const states: ConnectionState[] = [];
    src.onStatus((s) => states.push(s));
    src.start();
    timer.runNext();
    await flush();
    expect(src.status.status).toBe('reconnecting');
    expect(src.status.retryAttempt).toBe(1);
    expect(src.status.lastError?.message).toBe('network down');
    expect(src.status.nextRetryAt).toBe(2200); // 2000 + base 200
    // 재연결 성공
    fail = false;
    timer.runNext();
    await flush();
    expect(src.status.status).toBe('open');
    expect(src.status.retryAttempt).toBe(0);
  });

  it('backoff maxAttempts 소진 시 error 표면화(재시도 중단)', async () => {
    const timer = new ManualTimer();
    const backoff: BackoffPolicy = { baseMs: 100, factor: 2, maxMs: 1000, maxAttempts: 2 };
    const src = new PollingSource<T>({
      intervalMs: 100,
      backoff,
      fetcher: async () => {
        throw new Error('boom');
      },
      timer: timer.scheduler,
    });
    src.start();
    timer.runNext();
    await flush(); // attempt 1 → reconnecting
    expect(src.status.status).toBe('reconnecting');
    timer.runNext();
    await flush(); // attempt 2 → 소진 → error
    expect(src.status.status).toBe('error');
    expect(timer.pending).toBe(0); // 재시도 중단
  });

  it('stop 은 멱등 — closed 전이 + 타이머 정리', () => {
    const timer = new ManualTimer();
    const src = new PollingSource<T>({
      intervalMs: 100,
      fetcher: async () => ({ kind: 'delta', seq: 1, cells: [] }),
      timer: timer.scheduler,
    });
    src.start();
    src.stop();
    expect(src.status.status).toBe('closed');
    expect(timer.pending).toBe(0);
    src.stop(); // 멱등
    expect(src.status.status).toBe('closed');
  });
});
