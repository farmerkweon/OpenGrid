// DD-07 §2.2 StreamingSource — 전송 SPI·decode·끊김 backoff 재연결·소진 error. / DD-07 §2.2.
import { describe, it, expect, vi } from 'vitest';
import { StreamingSource } from '../../../src/core/realtime/index.js';
import type { RtPayload, BackoffPolicy } from '../../../src/core/realtime/index.js';
import { ManualTimer, FakeTransport } from './_helpers.js';

interface T {
  a: number;
}
const decode = (raw: string | ArrayBuffer): RtPayload<T> | null =>
  raw === 'heartbeat' ? null : (JSON.parse(raw as string) as RtPayload<T>);

describe('DD-07 StreamingSource — 스트리밍 어댑터', () => {
  it('open→onOpen 시 open, onMessage decode 후 데이터 방출', () => {
    const timer = new ManualTimer();
    const tr = new FakeTransport();
    const payloads: RtPayload<T>[] = [];
    const src = new StreamingSource<T>({ transport: tr, decode, timer: timer.scheduler, now: () => 500 });
    src.onData((p) => payloads.push(p));
    src.start();
    expect(src.status.status).toBe('connecting');
    expect(tr.openCount).toBe(1);
    tr.emitOpen();
    expect(src.status.status).toBe('open');
    tr.emitMessage(JSON.stringify({ kind: 'delta', seq: 1, cells: [{ rowId: 'r1', field: 'a', value: 1 }] }));
    expect(payloads).toHaveLength(1);
    expect(src.status.lastReceivedAt).toBe(500);
  });

  it('decode null 프레임(heartbeat)은 무시', () => {
    const timer = new ManualTimer();
    const tr = new FakeTransport();
    const payloads: RtPayload<T>[] = [];
    const src = new StreamingSource<T>({ transport: tr, decode, timer: timer.scheduler });
    src.onData((p) => payloads.push(p));
    src.start();
    tr.emitOpen();
    tr.emitMessage('heartbeat');
    expect(payloads).toHaveLength(0);
  });

  it('seq 역전 드롭+경고', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timer = new ManualTimer();
    const tr = new FakeTransport();
    const payloads: RtPayload<T>[] = [];
    const src = new StreamingSource<T>({ transport: tr, decode, timer: timer.scheduler });
    src.onData((p) => payloads.push(p));
    src.start();
    tr.emitOpen();
    tr.emitMessage(JSON.stringify({ kind: 'delta', seq: 5, cells: [] }));
    tr.emitMessage(JSON.stringify({ kind: 'delta', seq: 2, cells: [] }));
    expect(payloads).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('끊김(onClose)→backoff 재연결(전송 재open)', () => {
    const timer = new ManualTimer();
    const tr = new FakeTransport();
    const backoff: BackoffPolicy = { baseMs: 300, factor: 2, maxMs: 5000, maxAttempts: 5 };
    const src = new StreamingSource<T>({ transport: tr, decode, backoff, timer: timer.scheduler, now: () => 700 });
    src.start();
    tr.emitOpen();
    tr.emitClose('server gone');
    expect(src.status.status).toBe('reconnecting');
    expect(src.status.retryAttempt).toBe(1);
    expect(src.status.lastError?.code).toBe('closed_by_peer');
    expect(src.status.nextRetryAt).toBe(1000); // 700 + base 300
    expect(tr.closeCount).toBeGreaterThan(0);
    // 재연결 타이머 발화 → 재open
    timer.runNext();
    expect(tr.openCount).toBe(2);
    tr.emitOpen();
    expect(src.status.status).toBe('open');
    expect(src.status.retryAttempt).toBe(0);
  });

  it('onError 반복 → maxAttempts 소진 시 error 표면화', () => {
    const timer = new ManualTimer();
    const tr = new FakeTransport();
    const backoff: BackoffPolicy = { baseMs: 100, factor: 2, maxMs: 1000, maxAttempts: 2 };
    const src = new StreamingSource<T>({ transport: tr, decode, backoff, timer: timer.scheduler });
    src.start();
    tr.emitError(new Error('reset'));
    expect(src.status.status).toBe('reconnecting'); // attempt 1
    timer.runNext(); // 재open
    tr.emitError(new Error('reset again'));
    expect(src.status.status).toBe('error'); // attempt 2 소진
    expect(timer.pending).toBe(0);
  });

  it('stop 은 멱등 — closed + 전송 close', () => {
    const timer = new ManualTimer();
    const tr = new FakeTransport();
    const src = new StreamingSource<T>({ transport: tr, decode, timer: timer.scheduler });
    src.start();
    tr.emitOpen();
    src.stop();
    expect(src.status.status).toBe('closed');
    src.stop();
    expect(src.status.status).toBe('closed');
  });
});
