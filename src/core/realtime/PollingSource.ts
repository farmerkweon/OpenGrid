// ============================================================
// DD-07 §2.2 폴링 어댑터 — interval 마다 fetcher 호출 → 정규 페이로드. / DD-07 §2.2 polling adapter.
// REQ: REQ-RT-801 (폴링 1급 어댑터) · REQ-RT-806 (연결/오류 UX, 무언 삼킴 0)
// ------------------------------------------------------------
// 코어는 fetcher 내부(HTTP 등)를 모른다(DI). 타이머 주입 = 헤드리스/테스트 격리(전역 미참조).
// seq 단조성: 역전/중복은 드롭+경고(무언 삼킴 아님). 실패는 backoff 재시도 → 상한 시 error 표면화.
// ============================================================

import {
  isSeqNewer,
  type BackoffPolicy,
  type ConnectionState,
  type ConnectionStatus,
  type IRealtimeSource,
  type RtPayload,
} from './IRealtimeSource.js';
import { backoffExhausted, nextBackoffDelay } from './backoff.js';
import { defaultTimerScheduler, type TimerHandle, type TimerScheduler } from './ports.js';

export interface PollingConfig<T> {
  readonly intervalMs: number;
  /** 사용자 제공 — 코어는 내부(HTTP 등)를 모른다. / User-provided; the core knows nothing inside. */
  readonly fetcher: (ctx: { since?: number; signal: AbortSignal }) => Promise<RtPayload<T>>;
  /** 폴 실패 재시도 정책. 미지정=고정 intervalMs 재시도. / Retry policy; default fixed interval. */
  readonly backoff?: BackoffPolicy;
  /** 지연 실행 주입(테스트 수동 시계). / Injected timer. */
  readonly timer?: TimerScheduler;
  readonly now?: () => number;
  readonly random?: () => number;
}

/** 폴링 소스 — IRealtimeSource 구현. seq 정규화·상태 방출만 책임. / Polling source. */
export class PollingSource<T> implements IRealtimeSource<T> {
  private readonly _cfg: PollingConfig<T>;
  private readonly _timer: TimerScheduler;
  private readonly _now: () => number;
  private readonly _random: () => number;
  private readonly _dataListeners = new Set<(p: RtPayload<T>) => void>();
  private readonly _statusListeners = new Set<(s: ConnectionState) => void>();

  private _state: ConnectionState = { status: 'idle', retryAttempt: 0 };
  private _lastSeq: number | undefined;
  private _since: number | undefined;
  private _handle: TimerHandle | undefined;
  private _abort: AbortController | undefined;
  private _started = false;

  constructor(cfg: PollingConfig<T>) {
    this._cfg = cfg;
    this._timer = cfg.timer ?? defaultTimerScheduler;
    this._now = cfg.now ?? (() => Date.now());
    this._random = cfg.random ?? Math.random;
  }

  get status(): ConnectionState {
    return this._state;
  }

  onData(listener: (p: RtPayload<T>) => void): () => void {
    this._dataListeners.add(listener);
    return () => this._dataListeners.delete(listener);
  }

  onStatus(listener: (s: ConnectionState) => void): () => void {
    this._statusListeners.add(listener);
    return () => this._statusListeners.delete(listener);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this._transition('connecting');
    this._scheduleNext(0);
  }

  stop(): void {
    this._started = false;
    this._handle?.cancel();
    this._handle = undefined;
    this._abort?.abort();
    this._abort = undefined;
    this._transition('closed', { retryAttempt: 0 });
  }

  private _scheduleNext(delayMs: number): void {
    if (!this._started) return;
    this._handle?.cancel();
    this._handle = this._timer(() => {
      void this._poll();
    }, delayMs);
  }

  private async _poll(): Promise<void> {
    if (!this._started) return;
    this._abort = new AbortController();
    const signal = this._abort.signal;
    try {
      const payload = await this._cfg.fetcher(
        this._since === undefined ? { signal } : { since: this._since, signal },
      );
      if (!this._started || signal.aborted) return;
      this._onPayload(payload);
      this._scheduleNext(this._cfg.intervalMs);
    } catch (err) {
      if (!this._started || signal.aborted) return;
      this._onFailure(err);
    }
  }

  private _onPayload(payload: RtPayload<T>): void {
    const at = this._now();
    if (!isSeqNewer(this._lastSeq, payload.seq)) {
      // 역전/중복 — 드롭+경고(무언 삼킴 아님). 연결은 건강하므로 open 유지. / Reversed seq: drop + warn.
      // eslint-disable-next-line no-console
      console.warn(`[open-grid/realtime] dropped out-of-order poll payload seq=${payload.seq} (last=${this._lastSeq})`);
      this._transition('open', { lastReceivedAt: at, retryAttempt: 0 });
      return;
    }
    this._lastSeq = payload.seq;
    if (payload.serverTime !== undefined) this._since = payload.serverTime;
    this._transition('open', { lastReceivedAt: at, retryAttempt: 0 });
    for (const l of this._dataListeners) l(payload);
  }

  private _onFailure(err: unknown): void {
    const attempt = this._state.retryAttempt + 1;
    const rtError = {
      code: 'poll_failed',
      message: err instanceof Error ? err.message : String(err),
      at: this._now(),
    };
    const policy = this._cfg.backoff;
    if (policy && backoffExhausted(policy, attempt)) {
      this._transition('error', { retryAttempt: attempt, lastError: rtError });
      return; // 상한 도달 — 재시도 중단(정직 노출). / Exhausted: stop, surfaced.
    }
    const delay = policy ? nextBackoffDelay(policy, attempt - 1, this._random) : this._cfg.intervalMs;
    const nextRetryAt = this._now() + delay;
    this._transition('reconnecting', { retryAttempt: attempt, lastError: rtError, nextRetryAt });
    this._scheduleNext(delay);
  }

  private _transition(
    status: ConnectionStatus,
    extra?: Partial<Pick<ConnectionState, 'lastReceivedAt' | 'lastError' | 'retryAttempt' | 'nextRetryAt'>>,
  ): void {
    const prev = this._state;
    const next: ConnectionState = {
      status,
      retryAttempt: extra?.retryAttempt ?? prev.retryAttempt,
      ...(( extra?.lastReceivedAt ?? prev.lastReceivedAt) !== undefined
        ? { lastReceivedAt: extra?.lastReceivedAt ?? prev.lastReceivedAt }
        : {}),
      ...((extra?.lastError ?? prev.lastError) !== undefined
        ? { lastError: extra?.lastError ?? prev.lastError }
        : {}),
      ...(extra?.nextRetryAt !== undefined ? { nextRetryAt: extra.nextRetryAt } : {}),
    };
    this._state = next;
    for (const l of this._statusListeners) l(next);
  }
}
