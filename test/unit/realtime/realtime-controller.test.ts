// DD-07 §2.3 RealtimeController — 상태보존 증분 적용 통합(UC-1/UC-3). / DD-07 §2.3 orchestrator e2e.
import { describe, it, expect } from 'vitest';
import {
  RealtimeController,
  LiveStateGuard,
  FreshnessClock,
  RtAnnouncePolicy,
  DefaultRtChartTargetTrigger,
} from '../../../src/core/realtime/index.js';
import type {
  IRealtimeSource,
  ConnectionState,
  RtPayload,
  RtAnnounceSummary,
} from '../../../src/core/realtime/index.js';
import { FakeModel, FakeSink, FakeStateSource, ManualFrame, ManualTimer, type Row } from './_helpers.js';

interface T {
  a: number;
}

/** 수동 구동 소스. / Manually-driven source. */
class FakeSource<X> implements IRealtimeSource<X> {
  started = false;
  status: ConnectionState = { status: 'idle', retryAttempt: 0 };
  private _data = new Set<(p: RtPayload<X>) => void>();
  private _status = new Set<(s: ConnectionState) => void>();
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.started = false;
  }
  onData(l: (p: RtPayload<X>) => void): () => void {
    this._data.add(l);
    return () => this._data.delete(l);
  }
  onStatus(l: (s: ConnectionState) => void): () => void {
    this._status.add(l);
    return () => this._status.delete(l);
  }
  push(p: RtPayload<X>): void {
    for (const l of this._data) l(p);
  }
  emitStatus(s: ConnectionState): void {
    this.status = s;
    for (const l of this._status) l(s);
  }
}

function harness(rows: Row[]) {
  const model = new FakeModel(rows);
  const stateSrc = new FakeStateSource();
  const frame = new ManualFrame();
  const timer = new ManualTimer();
  const announced: RtAnnounceSummary[] = [];
  const chartDirty: string[] = [];
  const source = new FakeSource<T>();
  const controller = new RealtimeController<T>(source, {
    sink: new FakeSink(model.ctx()),
    stateGuard: new LiveStateGuard(stateSrc, model.asCoords()),
    freshness: new FreshnessClock({ staleAfterMs: 1000, now: () => 5000 }),
    announce: new RtAnnouncePolicy({ announce: (s) => announced.push(s), schedule: timer.scheduler }),
    scheduleFrame: frame.scheduler,
    chart: new DefaultRtChartTargetTrigger('server', (ids) => chartDirty.push(...ids)),
    applySnapshot: (r) => {
      model.rows = r.map((x) => ({ ...(x as Row) }));
    },
    now: () => 5000,
  });
  return { model, stateSrc, frame, timer, announced, chartDirty, source, controller };
}

describe('DD-07 RealtimeController — UC-1 상태보존 증분 적용', () => {
  it('델타 유입 → 프레임 flush → 모델 갱신(단일 쓰기경로) + 차트 dirty + 신선도 fresh', () => {
    const h = harness([{ id: 'r1', a: 1 }]);
    h.controller.attach();
    expect(h.source.started).toBe(true);
    h.source.push({ kind: 'delta', seq: 1, cells: [{ rowId: 'r1', field: 'a', value: 42 }] });
    expect(h.frame.pending).toBe(1); // 백프레셔 1프레임 예약
    h.frame.flush();
    expect(h.model.getCellValue('r1', 'a')).toBe(42);
    expect(h.chartDirty).toContain('r1');
    h.timer.runAll(); // announce 디바운스 flush
    expect(h.announced.some((s) => s.kind === 'background-update' && s.changedCount === 1)).toBe(true);
    expect(h.controller.backpressureStats.pending).toBe(0);
  });

  it('upsert/remove 로 인덱스가 바뀌어도 선택은 rowId 앵커로 보존(제거만 해제)', () => {
    const h = harness([
      { id: 'r1', a: 1 },
      { id: 'r2', a: 2 },
      { id: 'r3', a: 3 },
    ]);
    h.stateSrc.selection = [{ rowId: 'r1' }, { rowId: 'r2' }];
    h.stateSrc.scroll = { anchorRowId: 'r3', pixelWithinRow: 10, scrollLeft: 5 };
    h.controller.attach();
    h.source.push({ kind: 'delta', seq: 1, removes: ['r2'] });
    h.frame.flush();
    expect(h.model.rows.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(h.stateSrc.selection).toEqual([{ rowId: 'r1' }]); // r2 해제, r1 유지
    expect(h.stateSrc.scroll.anchorRowId).toBe('r3'); // 스크롤 앵커 생존 → 유지
  });

  it('UC-3 스냅샷 재동기 → applySnapshot 위임 + 전체갱신 공지', () => {
    const h = harness([{ id: 'r1', a: 1 }]);
    h.controller.attach();
    h.source.push({ kind: 'snapshot', seq: 9, rows: [{ a: 7 } as unknown as T], serverTime: 4999 });
    h.frame.flush();
    expect(h.model.rows).toHaveLength(1);
    expect(h.model.rows[0]!.a).toBe(7);
  });

  it('연결 전이 → announce.onConnection 즉시 공지', () => {
    const h = harness([{ id: 'r1', a: 1 }]);
    h.controller.attach();
    h.source.emitStatus({ status: 'reconnecting', retryAttempt: 1 });
    expect(h.controller.connection.status).toBe('reconnecting');
    expect(h.announced.some((s) => s.kind === 'connection' && s.connectionStatus === 'reconnecting')).toBe(true);
  });

  it('detach 는 멱등 — 소스 정지 + 이후 델타 무시', () => {
    const h = harness([{ id: 'r1', a: 1 }]);
    h.controller.attach();
    h.controller.detach();
    expect(h.source.started).toBe(false);
    h.source.push({ kind: 'delta', seq: 1, cells: [{ rowId: 'r1', field: 'a', value: 99 }] });
    expect(h.frame.pending).toBe(0); // 스케줄러 dispose — 무시
    h.controller.detach(); // 멱등
    expect(h.model.getCellValue('r1', 'a')).toBe(1);
  });
});
