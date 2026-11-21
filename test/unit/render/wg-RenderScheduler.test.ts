// @vitest-environment node
/**
 * 넓은 그리드 새 그물 — RenderScheduler 단위 시험. 테스트 설계서 §2-36 U-SCH-01~08·10~13 (09 는 C1).
 * 이 걸음(R7)의 스케줄러는 그리기 객체가 아직 안 물려 「옛 그리기 길」(LegacyPaintPort — `_doRender`·`_visRange`) 하나로
 * 계획의 행 일만 넘긴다(PACT_R7). 그래서 U-SCH-05·13 은 그 꼴에 맞춰 줄였다(NOTES 「R7 경우변경」).
 */
import { describe, it, expect, vi } from 'vitest';
import { RenderScheduler, type LegacyPaintPort } from '../../../src/core/render/RenderScheduler.js';
import { RenderPlanner } from '../../../src/core/domain/render/RenderPlanner.js';
import { RenderRequest } from '../../../src/core/domain/render/RenderRequest.js';
import { Change, type IRenderPlan, type IRenderPlanner, type IRenderRequest, type DrawnState, type NextState } from '../../../src/core/domain/render/ports.js';
import type { FramePort } from '../../../src/core/render/ports.js';
import type { ViewIndex } from '../../../src/core/coordinate/types.js';

/** 손으로 한 틱씩 넘기는 가짜 프레임. */
class FakeFrame implements FramePort {
  private _next = 1;
  readonly cbs = new Map<number, () => void>();
  readonly cancelled: number[] = [];
  request(cb: () => void): number { const id = this._next++; this.cbs.set(id, cb); return id; }
  cancel(id: number): void { this.cancelled.push(id); this.cbs.delete(id); }
  tick(): void { const run = [...this.cbs.values()]; this.cbs.clear(); for (const cb of run) cb(); }
  get waiting(): number { return this.cbs.size; }
}

/** 부른 차례를 적는 옛 그리기 길. */
function paintLog(vis: readonly [number, number] = [0, 29]) {
  const calls: [number, number][] = [];
  const port: LegacyPaintPort = { paintRows: (s, e) => { calls.push([s, e]); }, visibleRows: () => vis };
  return { calls, port };
}

/** 받은 입력을 적는 플래너 감싸기. */
function spyPlanner(inner: IRenderPlanner = new RenderPlanner()) {
  const seen: { req: IRenderRequest; drawn: DrawnState; next: NextState }[] = [];
  const planner: IRenderPlanner = { plan: (req, drawn, next) => { seen.push({ req, drawn, next }); return inner.plan(req, drawn, next); } };
  return { seen, planner };
}

const ALL_SYNC = () => RenderRequest.of(Change.All, { sync: true });

describe('RenderScheduler — U-SCH (R7)', () => {
  it('U-SCH-01 한 프레임 합치기 — sync 아닌 A·B → tick 에 plan 1번, 요청 = A·B 합', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const { seen, planner } = spyPlanner();
    const s = new RenderScheduler(f, { planner, paint: port });
    s.submit(RenderRequest.of(Change.RowSet, { cells: [{ ri: 1, field: 'a' }] }));
    s.submit(RenderRequest.of(Change.Focus, { cells: [{ ri: 2, field: 'b' }, { ri: 1, field: 'a' }], focusTo: { ri: 3, ci: 4 } }));
    expect(seen.length).toBe(0);
    expect(f.waiting).toBe(1);
    f.tick();
    expect(seen.length).toBe(1);
    expect(seen[0]!.req.changes).toBe(Change.RowSet | Change.Focus);
    expect(seen[0]!.req.detail.cells.map((c) => `${c.ri}|${c.field}`)).toEqual(['1|a', '2|b']);
    expect(seen[0]!.req.detail.focusTo).toEqual({ ri: 3, ci: 4 });
    expect(calls).toEqual([[0, 29]]);
  });

  it('U-SCH-02 sync — 쌓인 A 와 합쳐 그 자리에서 1번, 예약 프레임 cancel, 뒤 tick 에 일 0', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const { seen, planner } = spyPlanner();
    const s = new RenderScheduler(f, { planner, paint: port });
    s.submit(RenderRequest.of(Change.RowState));
    s.submit(RenderRequest.of(Change.RowSet, { sync: true }));
    expect(seen.length).toBe(1);
    expect(seen[0]!.req.changes).toBe(Change.RowState | Change.RowSet);
    expect(f.cancelled.length).toBe(1);
    f.tick();
    expect(seen.length).toBe(1);
    expect(calls.length).toBe(1);
  });

  // C1(설계 §17-6 「재진입 다음 프레임 켬」): 실행 중 sync 아닌 요청은 다음 tick. sync 요청은 안쪽으로 재귀하지 않고
  // 지금 실행이 끝난 바로 뒤 같은 호출 안에서 한 번 더(부른 쪽이 돌아올 때 DOM 이 맞음 — 공개 API 동기 약속을 지키려고
  // 「다음 프레임」 대신 「끝난 뒤」. 경우변경 WARN — NOTES C1).
  it('U-SCH-03 재진입 없음 — 실행 중 sync 아닌 submit 은 다음 tick, sync 는 실행이 끝난 뒤 같은 호출에서(깊이 1)', () => {
    const f = new FakeFrame();
    let s!: RenderScheduler;
    const calls: string[] = [];
    let nested: 'async' | 'sync' | null = 'async';
    const port: LegacyPaintPort = {
      paintRows: (a, b) => {
        calls.push(`paint ${a},${b} depth ${s.depth}`);
        if (nested === 'async') { nested = null; s.submit(RenderRequest.of(Change.RowSet)); }
        else if (nested === 'sync') { nested = null; s.submit(RenderRequest.of(Change.RowSet, { sync: true, rows: { start: 5 as ViewIndex, end: 7 as ViewIndex } })); }
      },
      visibleRows: () => [0, 9],
    };
    s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    s.submit(ALL_SYNC());
    expect(calls).toEqual(['paint 0,9 depth 1']);
    expect(f.waiting).toBe(1);
    f.tick();
    expect(calls).toEqual(['paint 0,9 depth 1', 'paint 0,9 depth 1']);
    nested = 'sync';
    s.submit(ALL_SYNC());
    expect(calls.slice(2)).toEqual(['paint 0,9 depth 1', 'paint 5,6 depth 1']);
    expect(f.waiting).toBe(0);
    expect(s.depth).toBe(0);
  });

  it('U-SCH-04 빈 계획 — 그리기 길 호출 0', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    s.submit(RenderRequest.of(0, { sync: true }));
    expect(calls).toEqual([]);
    expect(s.lastPlan!.empty).toBe(true);
  });

  // 경우변경(R7): 그리기 객체(body·sort·footer·applier·overlay)가 아직 안 물려 행 일만 옛 길로 넘긴다.
  // 나머지 칸은 옛 본문 다시 그리기가 지금처럼 함께 하거나(푸터·덧그림) 안 한다(머리글) — 실행하지 않고 기록만.
  it('U-SCH-05 일 나눠 주기(R7 판) — 행 rebuild 는 옛 길 1번, 머리글·푸터·기하·덧그림 칸은 실행 안 함(기록만)', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog([10, 40]);
    const fixed: IRenderPlanner = {
      plan: (_r, _d, next): IRenderPlan => Object.freeze({
        rows: 'rebuild', cols: 'none', header: 'sortIndicator', footer: 'values', geometry: true, refillColumns: [],
        rowStateRows: [], focus: null, cells: [], overlay: true, next, empty: false,
      }),
    };
    const s = new RenderScheduler(f, { planner: fixed, paint: port });
    s.submit(RenderRequest.of(Change.RowOrder, { sync: true }));
    expect(calls).toEqual([[10, 40]]);
    // clear · none · diff
    const mk = (rows: IRenderPlan['rows']): IRenderPlanner => ({ plan: (_r, _d, next) => ({ ...fixed.plan(_r, _d, next), rows }) });
    const c2 = paintLog([0, 3]);
    new RenderScheduler(f, { planner: mk('clear'), paint: c2.port }).submit(ALL_SYNC());
    new RenderScheduler(f, { planner: mk('none'), paint: c2.port }).submit(ALL_SYNC());
    new RenderScheduler(f, { planner: mk('diff'), paint: c2.port }).submit(ALL_SYNC());
    expect(c2.calls).toEqual([[0, -1], [0, 3]]);
  });

  it('U-SCH-06 lastPlan = 마지막 계획', () => {
    const f = new FakeFrame();
    const { port } = paintLog();
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    expect(s.lastPlan).toBeNull();
    s.submit(ALL_SYNC());
    expect(s.lastPlan!.rows).toBe('rebuild');
    expect(s.lastPlan!.next.rows).toEqual({ start: 0, end: 30 });
  });

  it('U-SCH-07 destroy — 예약 cancel · 뒤 submit 무시', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    s.submit(RenderRequest.of(Change.RowSet));
    s.destroy();
    expect(f.cancelled.length).toBe(1);
    f.tick();
    s.submit(ALL_SYNC());
    s.flushNow();
    expect(calls).toEqual([]);
  });

  it('U-SCH-08 빈 flush — 일 0', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const { seen, planner } = spyPlanner();
    const s = new RenderScheduler(f, { planner, paint: port });
    s.flushNow();
    expect(seen.length).toBe(0);
    expect(calls).toEqual([]);
    // 쌓인 것이 있으면 flushNow 가 그 자리에서
    s.submit(RenderRequest.of(Change.RowSet));
    s.flushNow();
    expect(calls).toEqual([[0, 29]]);
    expect(f.waiting).toBe(0);
  });

  it('U-SCH-10 스스로 판단 안 함 — 플래너가 낸 계획만 실행', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const always: IRenderPlanner = { plan: (_r, _d, next) => ({ ...new RenderPlanner().plan(RenderRequest.NONE, _d, next), rows: 'none', empty: true }) };
    const s = new RenderScheduler(f, { planner: always, paint: port });
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: 'clear' }));
    s.submit(RenderRequest.of(Change.Columns, { sync: true }));
    expect(calls).toEqual([]);
  });

  it('U-SCH-11 일 하나가 던짐 — 프레임 실행은 console.error 1번 뒤 다음 요청 정상 · sync 실행은 부른 쪽으로 던짐', () => {
    const f = new FakeFrame();
    let fail = true;
    const calls: number[] = [];
    const port: LegacyPaintPort = { paintRows: (a) => { if (fail) { fail = false; throw new Error('boom'); } calls.push(a); }, visibleRows: () => [0, 1] };
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
      s.submit(RenderRequest.of(Change.RowSet));
      f.tick();
      expect(err).toHaveBeenCalledTimes(1);
      s.submit(RenderRequest.of(Change.RowSet));
      f.tick();
      expect(calls).toEqual([0]);
      fail = true;
      expect(() => s.submit(ALL_SYNC())).toThrow('boom');
      expect(s.depth).toBe(0);
      s.submit(ALL_SYNC());
      expect(calls).toEqual([0, 0]);
    } finally {
      err.mockRestore();
    }
  });

  it('U-SCH-12 DOM 안 만짐 — 이 파일 전부 node 환경에서 돎', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });

  // 경우변경(R7): 창 정책·기하가 아직 안 물려 NextState 의 행만 만든다(창은 컬럼 0개 전 컬럼 자리).
  it('U-SCH-13 NextState 를 만드는 곳 — 행 = 요청의 명시 범위, 없으면 보이는 범위(끝 포함 → 반열림)', () => {
    const f = new FakeFrame();
    const { seen, planner } = spyPlanner();
    const vis = paintLog([12, 41]);
    const s = new RenderScheduler(f, { planner, paint: vis.port });
    s.submit(ALL_SYNC());
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: { start: 0 as ViewIndex, end: 500 as ViewIndex } }));
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: 'clear' }));
    expect(seen.map((x) => x.next.rows)).toEqual([{ start: 12, end: 42 }, { start: 0, end: 500 }, 'clear']);
    // 그려 둔 행 범위는 직전 실행 결과
    expect(seen.map((x) => x.drawn.rows)).toEqual([null, { start: 12, end: 42 }, { start: 0, end: 500 }]);
    expect(vis.calls).toEqual([[12, 41], [0, 499], [0, -1]]);
  });
});

describe('RenderScheduler — R7 옛 호출 대응표(PACT_R7 §3) · 그리는 횟수 그대로', () => {
  it('R7-MAP 옛 호출 네 꼴이 같은 _doRender 인자로, 요청 하나 = 그리기 한 번', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog([3, 33]);
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    s.submit(RenderRequest.of(Change.All, { sync: true }));                                                  // _doRender(...visRange)
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: { start: 0 as ViewIndex, end: 120 as ViewIndex } })); // doRenderFull(120)
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: { start: 0 as ViewIndex, end: 0 as ViewIndex } }));   // doRenderFull(0)
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: 'clear' }));                                    // _doRender(0,-1)
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: { start: 40 as ViewIndex, end: 70 as ViewIndex } }));  // VS onRender(40,69)
    s.submit(RenderRequest.of(Change.All, { sync: true, rows: { start: 9 as ViewIndex, end: 0 as ViewIndex } }));    // VS onRender(9,-1) — 자르지 않음
    expect(calls).toEqual([[3, 33], [0, 119], [0, -1], [0, -1], [40, 69], [9, -1]]);
    expect(f.waiting).toBe(0);
  });

  it('R7-MAP 묶음 전부 끔(기본 플래너)이면 0 이 아닌 어떤 요청도 행 rebuild(또는 clear)', () => {
    const f = new FakeFrame();
    const { calls, port } = paintLog();
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    const bits = Object.entries(Change).map(([, v]) => v);
    for (const b of bits) s.submit(RenderRequest.of(b, { sync: true, focusTo: { ri: 1, ci: 1 }, cells: [{ ri: 1, field: 'x' }] }));
    expect(calls.length).toBe(bits.length);
  });
});

describe('RenderScheduler — R5678 검토 반영(F-14 그린 뒤 기록)', () => {
  it('F-14 던진 뒤 drawn = null · 안쪽 실행이 있으면 안쪽 것이 기록', () => {
    const f = new FakeFrame();
    const sp = spyPlanner();
    let mode: 'throw' | 'nested' | 'ok' = 'throw';
    let s!: RenderScheduler;
    const port: LegacyPaintPort = {
      paintRows: () => {
        if (mode === 'throw') { mode = 'ok'; throw new Error('x'); }
        if (mode === 'nested') { mode = 'ok'; s.submit(RenderRequest.of(Change.All, { sync: true, rows: { start: 7 as ViewIndex, end: 8 as ViewIndex } })); }
      },
      visibleRows: () => [0, 9],
    };
    s = new RenderScheduler(f, { planner: sp.planner, paint: port });
    expect(() => s.submit(ALL_SYNC())).toThrow('x');
    s.submit(ALL_SYNC());
    expect(sp.seen[1]!.drawn.rows).toBeNull(); // 앞 그리기가 던졌으므로 모름
    mode = 'nested';
    s.submit(ALL_SYNC());
    s.submit(ALL_SYNC());
    // 셋째 실행(바깥)이 그리는 도중 넷째(안쪽, 7..7)가 돌았다 → 다섯째가 보는 그려 둔 범위는 안쪽 것
    expect(sp.seen[4]!.drawn.rows).toEqual({ start: 7, end: 8 });
  });
});
