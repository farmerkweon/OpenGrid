// ============================================================
// DD-07 §2.3 라이브 반영 오케스트레이터 — 상태보존 증분 적용의 조립 루트. / DD-07 §2.3 orchestrator.
// REQ: REQ-RT-802 (증분·상태보존) · REQ-RT-805 (백프레셔) · REQ-RT-806/807 (연결/SR) · TX-807 (증분=전체)
// ------------------------------------------------------------
// 흐름(UC-1): source.onData → freshness.markReceived + scheduler.enqueue → (프레임) flush →
//   stateGuard.capture → RtApplyCommand → sink.dispatchSilent(=DD-09 CommandBus, undo 미오염) →
//   MutationService.writeCells 초크포인트(증분=전체 자연통과) → stateGuard.restore →
//   announce.onBackgroundChange + chart.markDirty. 연결 전이는 announce.onConnection + freshness.tick.
// RT 는 렌더를 직접 하지 않는다(커밋의 coalesced sync-window 가 영향 창만 렌더 — DD-02 VS 소유).
// ============================================================

import type { ConnectionState, IRealtimeSource, RtPayload } from './IRealtimeSource.js';
import { BackpressureScheduler, type NormalizedBatch } from './BackpressureScheduler.js';
import type { FreshnessClock } from './FreshnessClock.js';
import type { LiveStateGuard } from './LiveStateGuard.js';
import { RtApplyCommand } from './RtApplyCommand.js';
import type { RtAnnouncePolicy } from './RtAnnouncePolicy.js';
import type { RtChartTargetTrigger } from './RtChartTargetTrigger.js';
import type { FrameScheduler, RtCommandSink } from './ports.js';
import { defaultFrameScheduler } from './ports.js';

export interface RealtimeControllerDeps<T> {
  /** 단일 쓰기 이음새(DD-09 CommandBus 부분집합). RT 델타 = 비-undoable silent 커맨드. */
  readonly sink: RtCommandSink<T>;
  /** 사용자 상태 캡처/복원(전환 보존 계약 재사용). / State capture/restore. */
  readonly stateGuard: LiveStateGuard;
  /** 신선도 시계(연결/stale 표기). / Freshness clock. */
  readonly freshness: FreshnessClock;
  /** 실시간 접근성 게이트(백그라운드 SR 공지 정책). / A11y announce gate. */
  readonly announce: RtAnnouncePolicy;
  /** 프레임 예산 스케줄러 주입(rAF 전역 미참조). 미지정=기본 rAF/폴백. */
  readonly scheduleFrame?: FrameScheduler;
  /** 프레임당 최대 적용 셀 수(백프레셔). / Max cells applied per frame. */
  readonly maxBatchPerFrame?: number;
  /** 차트 갱신 신호(영향 시리즈만). DD-06 위임. / Chart dirty trigger. */
  readonly chart?: RtChartTargetTrigger;
  /** 전체 스냅샷 적용 훅(통합 TODO: DataLayer.setData 배선). 미지정=경고 후 스킵. */
  readonly applySnapshot?: (rows: readonly T[]) => void;
  readonly now?: () => number;
}

/**
 * RT 서브시스템 조립 루트. 소스 1개를 그리드/차트에 배선. OpenGrid 가 소유·주입(통합 TODO).
 * / Assembly root wiring one source to the grid/chart; owned & injected by OpenGrid.
 */
export class RealtimeController<T> {
  private readonly _source: IRealtimeSource<T>;
  private readonly _deps: RealtimeControllerDeps<T>;
  private readonly _scheduler: BackpressureScheduler<T>;
  private readonly _now: () => number;
  private readonly _statusListeners = new Set<(s: ConnectionState) => void>();

  private _offData: (() => void) | undefined;
  private _offStatus: (() => void) | undefined;
  private _connection: ConnectionState;
  private _attached = false;

  constructor(source: IRealtimeSource<T>, deps: RealtimeControllerDeps<T>) {
    this._source = source;
    this._deps = deps;
    this._now = deps.now ?? (() => Date.now());
    this._connection = source.status;
    this._scheduler = new BackpressureScheduler<T>({
      ...(deps.maxBatchPerFrame !== undefined ? { maxBatchPerFrame: deps.maxBatchPerFrame } : {}),
      scheduleFrame: deps.scheduleFrame ?? defaultFrameScheduler,
      flush: (batch) => this._applyBatch(batch),
    });
  }

  /** 소스 start + onData/onStatus 구독 배선. 멱등. / Wire subscriptions + start. Idempotent. */
  attach(): void {
    if (this._attached) return;
    this._attached = true;
    this._offData = this._source.onData((p) => this._onData(p));
    this._offStatus = this._source.onStatus((s) => this._onStatus(s));
    this._source.start();
  }

  /** 구독 해제 + source.stop() + scheduler.dispose(). 멱등. / Teardown. Idempotent. */
  detach(): void {
    if (!this._attached) return;
    this._attached = false;
    this._offData?.();
    this._offStatus?.();
    this._offData = undefined;
    this._offStatus = undefined;
    this._source.stop();
    this._scheduler.dispose();
  }

  /** 연결 상태 스냅샷(UI 배지용). / Connection snapshot (for UI badge). */
  get connection(): ConnectionState {
    return this._connection;
  }

  /** 백프레셔 계측(폭주 0 검증). / Backpressure stats. */
  get backpressureStats() {
    return this._scheduler.stats;
  }

  /** 연결 상태 관측(배지 배선). / Observe connection transitions. */
  onConnection(l: (s: ConnectionState) => void): () => void {
    this._statusListeners.add(l);
    return () => this._statusListeners.delete(l);
  }

  private _onData(payload: RtPayload<T>): void {
    // 신선도는 원시 수신 시각으로 갱신(적용 지연과 분리). / Freshness fed on raw receipt.
    this._deps.freshness.markReceived(payload.serverTime ?? this._now());
    this._scheduler.enqueue(payload);
  }

  private _onStatus(s: ConnectionState): void {
    this._connection = s;
    this._deps.announce.onConnection(s.status);
    this._deps.freshness.tick();
    for (const l of this._statusListeners) l(s);
  }

  private _applyBatch(batch: NormalizedBatch<T>): void {
    const captured = this._deps.stateGuard.capture();

    if (batch.snapshot) {
      // UC-3 전체 재동기 — 기존 setData 경로 위임(통합 TODO). / Full resync via setData.
      if (this._deps.applySnapshot) {
        this._deps.applySnapshot(batch.snapshot.rows);
        const applied = {
          changedCells: [] as { rowId: string; field: string }[],
          insertedRowIds: [] as string[],
          removedRowIds: [] as string[],
          userInitiated: false as const,
        };
        this._deps.stateGuard.restore(captured, applied);
        this._deps.announce.onBackgroundChange(applied);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[open-grid/realtime] snapshot received but no applySnapshot dep wired — skipped');
      }
      return;
    }

    const cmd = new RtApplyCommand<T>(batch);
    this._deps.sink.beginBatch();
    try {
      this._deps.sink.dispatchSilent(cmd);
    } finally {
      this._deps.sink.endBatch();
    }

    const applied = cmd.appliedDelta;
    if (!applied) return;
    this._deps.stateGuard.restore(captured, applied);
    this._deps.announce.onBackgroundChange(applied);
    if (this._deps.chart) {
      const rowIds = [
        ...new Set([
          ...applied.changedCells.map((c) => c.rowId),
          ...applied.insertedRowIds,
          ...applied.removedRowIds,
        ]),
      ];
      if (rowIds.length > 0) this._deps.chart.markDirty(rowIds);
    }
  }
}
