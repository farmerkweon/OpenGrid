// ============================================================
// DD-07 §2.2 스트리밍 어댑터 — SSE/WebSocket 전송을 다시 DI. / DD-07 §2.2 streaming adapter.
// REQ: REQ-RT-801 (스트리밍 1급 어댑터) · REQ-RT-806 (backoff 재연결·신선도, 무언 삼킴 0)
// ------------------------------------------------------------
// 코어는 프레이밍(SSE/WS)을 전혀 모른다 — StreamTransport(전송 SPI) + decode(anti-corruption)만 안다.
// 끊김/오류는 삼키지 않고 lastError 기록 → 지수 backoff 재연결 → 상한 시 error 표면화.
// 타이머 주입 = 헤드리스/테스트 격리. seq 단조성 드롭+경고.
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

/** 전송 SPI — SSE/WebSocket/커스텀 프레이밍 교체(코어는 프레이밍 무지). / Transport SPI. */
export interface StreamTransport {
  open(handlers: {
    onMessage: (raw: string | ArrayBuffer) => void;
    onOpen: () => void;
    onClose: (why?: unknown) => void;
    onError: (e: unknown) => void;
  }): void;
  close(): void;
}

export interface StreamingConfig<T> {
  /** SSE/WebSocket 중 무엇이든 이 계약만 만족하면 됨. / Any transport satisfying the SPI. */
  readonly transport: StreamTransport;
  /** 원문 프레임 → 정규 페이로드(anti-corruption). null=무시할 프레임. / Decode; null = ignore frame. */
  readonly decode: (raw: string | ArrayBuffer) => RtPayload<T> | null;
  readonly backoff?: BackoffPolicy;
  readonly timer?: TimerScheduler;
  readonly now?: () => number;
  readonly random?: () => number;
}

/** 스트리밍 소스 — IRealtimeSource 구현. 전송 원문 → 정규 페이로드 + 상태 방출. / Streaming source. */
export class StreamingSource<T> implements IRealtimeSource<T> {
  private readonly _cfg: StreamingConfig<T>;
  private readonly _timer: TimerScheduler;
  private readonly _now: () => number;
  private readonly _random: () => number;
  private readonly _dataListeners = new Set<(p: RtPayload<T>) => void>();
  private readonly _statusListeners = new Set<(s: ConnectionState) => void>();

  private _state: ConnectionState = { status: 'idle', retryAttempt: 0 };
  private _lastSeq: number | undefined;
  private _reconnect: TimerHandle | undefined;
  private _started = false;
  private _open = false;

  constructor(cfg: StreamingConfig<T>) {
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
    this._connect();
  }

  stop(): void {
    this._started = false;
    this._reconnect?.cancel();
    this._reconnect = undefined;
    this._open = false;
    try {
      this._cfg.transport.close();
    } catch {
      /* close 는 멱등·최선노력. / close is idempotent / best-effort. */
    }
    this._transition('closed', { retryAttempt: 0 });
  }

  private _connect(): void {
    if (!this._started) return;
    this._transition(this._state.retryAttempt > 0 ? 'reconnecting' : 'connecting');
    this._cfg.transport.open({
      onOpen: () => this._onOpen(),
      onMessage: (raw) => this._onMessage(raw),
      onClose: (why) => this._onDrop('closed_by_peer', why),
      onError: (e) => this._onDrop('transport_error', e),
    });
  }

  private _onOpen(): void {
    if (!this._started) return;
    this._open = true;
    this._transition('open', { retryAttempt: 0 });
  }

  private _onMessage(raw: string | ArrayBuffer): void {
    if (!this._started) return;
    const payload = this._cfg.decode(raw);
    if (payload === null) return; // 무시할 프레임(heartbeat 등). / Ignorable frame.
    const at = this._now();
    if (!isSeqNewer(this._lastSeq, payload.seq)) {
      // eslint-disable-next-line no-console
      console.warn(`[open-grid/realtime] dropped out-of-order stream payload seq=${payload.seq} (last=${this._lastSeq})`);
      this._transition('open', { lastReceivedAt: at });
      return;
    }
    this._lastSeq = payload.seq;
    this._transition('open', { lastReceivedAt: at });
    for (const l of this._dataListeners) l(payload);
  }

  private _onDrop(code: string, why: unknown): void {
    if (!this._started) return;
    this._open = false;
    const attempt = this._state.retryAttempt + 1;
    const rtError = {
      code,
      message: why instanceof Error ? why.message : why === undefined ? code : String(why),
      at: this._now(),
    };
    try {
      this._cfg.transport.close();
    } catch {
      /* best-effort */
    }
    const policy = this._cfg.backoff;
    if (policy && backoffExhausted(policy, attempt)) {
      this._transition('error', { retryAttempt: attempt, lastError: rtError });
      return;
    }
    const delay = policy ? nextBackoffDelay(policy, attempt - 1, this._random) : 1000;
    const nextRetryAt = this._now() + delay;
    this._transition('reconnecting', { retryAttempt: attempt, lastError: rtError, nextRetryAt });
    this._reconnect?.cancel();
    this._reconnect = this._timer(() => this._connect(), delay);
  }

  private _transition(
    status: ConnectionStatus,
    extra?: Partial<Pick<ConnectionState, 'lastReceivedAt' | 'lastError' | 'retryAttempt' | 'nextRetryAt'>>,
  ): void {
    const prev = this._state;
    const next: ConnectionState = {
      status,
      retryAttempt: extra?.retryAttempt ?? prev.retryAttempt,
      ...((extra?.lastReceivedAt ?? prev.lastReceivedAt) !== undefined
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
