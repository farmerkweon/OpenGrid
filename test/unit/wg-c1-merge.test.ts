// @vitest-environment node
/**
 * 넓은 그리드 새 그물 — 걸음 C1(같은 높이면 예약 안 함 · 같은 프레임 요청 합치기).
 * 테스트 설계서 §2-22 U-VS-01·02 · §2-36 U-SCH-09 + 설계 §17-5·§17-6 C1 줄(VS 요청을 스케줄러로 · 재진입 없음).
 * VirtualScroll 은 DOM 요소 대신 손으로 만든 가짜 상자(addEventListener·scrollTop·querySelector)로 돈다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { VirtualScroll } from '../../src/core/VirtualScroll.js';
import { RenderScheduler, type LegacyPaintPort } from '../../src/core/render/RenderScheduler.js';
import { RenderPlanner } from '../../src/core/domain/render/RenderPlanner.js';
import { RenderRequest } from '../../src/core/domain/render/RenderRequest.js';
import { Change } from '../../src/core/domain/render/ports.js';
import type { FramePort } from '../../src/core/render/ports.js';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FakeFrame implements FramePort {
  private _next = 1;
  readonly cbs = new Map<number, () => void>();
  request(cb: () => void): number { const id = this._next++; this.cbs.set(id, cb); return id; }
  cancel(id: number): void { this.cbs.delete(id); }
  tick(): void { const run = [...this.cbs.values()]; this.cbs.clear(); for (const cb of run) cb(); }
  get waiting(): number { return this.cbs.size; }
}

/** VirtualScroll 이 쓰는 몫만 가진 가짜 스크롤 상자. */
function fakeBox() {
  const listeners: Array<() => void> = [];
  return {
    scrollTop: 0,
    addEventListener: (_t: string, fn: () => void) => { listeners.push(fn); },
    removeEventListener: () => undefined,
    querySelector: () => null,
    scrollTo(top: number) { this.scrollTop = top; for (const l of listeners) l(); },
  };
}

/** 가짜 rAF(전역) — 예약 수를 센다. */
function stubRaf() {
  const cbs: Array<() => void> = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cbs.push(cb); return cbs.length; });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  return { cbs, run: () => { const r = cbs.splice(0); for (const cb of r) cb(); } };
}

afterEach(() => vi.unstubAllGlobals());

/** sync 아닌 명시 범위 요청(끝 포함) — 스케줄러 합치기 규칙 시험용. */
const later = (s: number, e: number) => RenderRequest.of(Change.All, { rows: { start: s as never, end: (e + 1) as never } });

describe('VirtualScroll — U-VS-01·02 (같은 높이면 예약 안 함)', () => {
  it('U-VS-01 setViewportHeight(1000) 두 번 → 둘째 호출에 예약 0번', () => {
    const raf = stubRaf();
    const renders: [number, number][] = [];
    const vs = new VirtualScroll(fakeBox() as never, { rowHeight: 32, onRender: (s, e) => renders.push([s, e]) });
    vs.setTotalRows(1000);
    raf.run();
    vs.setViewportHeight(1000);
    expect(raf.cbs.length).toBe(1);
    raf.run();
    vs.setViewportHeight(1000);
    expect(raf.cbs.length).toBe(0);
    expect(renders.length).toBe(2);
  });

  it('U-VS-02 1000 → 1001 → 예약 1번', () => {
    const raf = stubRaf();
    const vs = new VirtualScroll(fakeBox() as never, { rowHeight: 32, onRender: () => undefined });
    vs.setViewportHeight(1000);
    raf.run();
    vs.setViewportHeight(1001);
    expect(raf.cbs.length).toBe(1);
  });

  it('C1 지킬 이음새 — 비공개 필드 이름 rowHeight · _viewportHeight · getVisibleRange 그대로', () => {
    stubRaf();
    const vs = new VirtualScroll(fakeBox() as never, { rowHeight: 32, onRender: () => undefined });
    vs.setViewportHeight(640);
    expect((vs as unknown as { rowHeight: number }).rowHeight).toBe(32);
    expect((vs as unknown as { _viewportHeight: number })._viewportHeight).toBe(640);
    expect(typeof vs.getVisibleRange).toBe('function');
  });
});

describe('VirtualScroll — requestRender(스케줄러로 넘기는 길)', () => {
  it('C1-VS-REQ requestRender 를 주면 자체 rAF 0 · 그리기 필요마다 그 자리에서 지금 범위로 부름(늦은 것이 최신)', () => {
    const raf = stubRaf();
    const box = fakeBox();
    const req: [number, number][] = [];
    const onRender = vi.fn();
    const vs = new VirtualScroll(box as never, { rowHeight: 32, onRender, requestRender: (s, e) => req.push([s, e]) });
    vs.setViewportHeight(640);   // 보이는 20행
    vs.setTotalRows(1000);
    box.scrollTo(320);           // 10행 아래
    box.scrollTo(640);
    expect(raf.cbs.length).toBe(0);
    expect(onRender).not.toHaveBeenCalled();
    expect(req).toEqual([[0, -1], [0, 30], [5, 35], [15, 45]]); // 행 0개일 때 (0,−1) · 20행 + 여유 5×2
    vs.setViewportHeight(640);   // 같은 값 → 요청 없음
    expect(req.length).toBe(4);
  });
});

describe('RenderScheduler — 같은 프레임 합치기 (C1)', () => {
  function sch(vis: readonly [number, number] = [0, 29]) {
    const f = new FakeFrame();
    const paints: [number, number][] = [];
    const port: LegacyPaintPort = { paintRows: (s, e) => paints.push([s, e]), visibleRows: () => vis };
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    return { f, paints, s };
  }

  it('C1-MERGE 세로 스크롤 쪽 요청(sync 아님)이 쌓인 채 sync 요청이 오면 한 번에(범위는 하나 — 세로 창 범위)', () => {
    const { f, paints, s } = sch();
    s.submit(RenderRequest.WINDOW_CHANGED);   // setData → setTotalRows 의 VS 요청
    expect(paints).toEqual([]);
    expect(f.waiting).toBe(1);
    s.submit(RenderRequest.REPAINT_VISIBLE);               // 같은 호출의 sync 다시 그리기
    expect(paints).toEqual([[0, 29]]);
    f.tick();
    expect(paints).toEqual([[0, 29]]);                     // 걸음 C1 전: 동기 (0,58) + 다음 프레임 (0,29) = 2번
  });

  it('C1-MERGE sync 다음에 온 sync 아닌 요청은 다음 프레임에 한 번(같은 프레임 여러 개는 하나로, 범위는 마지막)', () => {
    const { f, paints, s } = sch();
    s.submit(RenderRequest.REPAINT_VISIBLE);
    s.submit(RenderRequest.WINDOW_CHANGED);
    s.submit(later(5, 34));
    s.submit(later(10, 39));
    expect(paints).toEqual([[0, 29]]);
    f.tick();
    expect(paints).toEqual([[0, 29], [10, 39]]);
    f.tick();
    expect(paints.length).toBe(2);
  });

  it('U-SCH-09 프레임당 본문 ≤ 1 — 씨앗 8 × 200 무작위 submit/tick/sync 열(sync 는 그 자리 한 번)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(seed);
      const { f, paints, s } = sch();
      let syncs = 0;
      for (let k = 0; k < 200; k++) {
        const r = rnd();
        if (r < 0.45) s.submit(later(Math.floor(rnd() * 100), 120));
        else if (r < 0.6) { syncs++; const before = paints.length; s.submit(RenderRequest.REPAINT_VISIBLE); expect(paints.length).toBe(before + 1); }
        else { const before = paints.length; f.tick(); expect(paints.length - before).toBeLessThanOrEqual(1); }
      }
      expect(syncs).toBeGreaterThan(0);
    }
  });

  it('C1 재진입 없음 — 그리는 중 sync 요청은 끝난 뒤 같은 호출에서 한 번 더(돌아올 때 DOM 맞음), sync 아님은 다음 프레임', () => {
    const f = new FakeFrame();
    let s!: RenderScheduler;
    const log: string[] = [];
    let n = 0;
    const port: LegacyPaintPort = {
      paintRows: (a, b) => {
        log.push(`${a},${b}@${s.depth}`);
        n++;
        if (n === 1) { s.submit(RenderRequest.rowsInclusive(3, 4)); s.submit(later(7, 8)); }
      },
      visibleRows: () => [0, 9],
    };
    s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    // 안쪽 sync(3..4) 와 그 뒤 sync 아닌(7..8) 은 같은 누적기에 — 끝난 뒤 한 번에(범위는 마지막 7..8)
    expect(log).toEqual(['0,9@1', '7,8@1']);
    expect(s.depth).toBe(0);
    f.tick();
    expect(log.length).toBe(2);
  });
});

describe('C1 · C5 요청 — 스크롤 비트 · 스케줄러 푸터 실행(PACT_C5 §2)', () => {
  it('C1-VS-BIT 스크롤만이면 셋째 인자 true, 행 수·높이 변화면 false', () => {
    stubRaf();
    const box = fakeBox();
    const got: boolean[] = [];
    const vs = new VirtualScroll(box as never, { rowHeight: 32, onRender: () => undefined, requestRender: (_s, _e, sc) => got.push(sc) });
    vs.setViewportHeight(640);
    vs.setTotalRows(100);
    box.scrollTo(64);
    vs.setRowHeight(40);
    expect(got).toEqual([false, false, true, false]);
  });

  it('C5-SCH 푸터 포트 — 계획 footer 를 행 일 뒤에(행 일 없어도): rebuild→paint · values→updateValues · none→0', () => {
    const f = new FakeFrame();
    const log: string[] = [];
    const port: LegacyPaintPort = { paintRows: (a, b) => log.push(`rows ${a},${b}`), visibleRows: () => [0, 9] };
    const footer = { paint: () => log.push('footer paint'), updateValues: () => log.push('footer values') };
    // 묶음 전부 끔: 행 일이 있으면 푸터 values(지금처럼 그릴 때마다)
    const s0 = new RenderScheduler(f, { planner: new RenderPlanner(), paint: port, footer });
    s0.submit(RenderRequest.REPAINT_VISIBLE);
    expect(log).toEqual(['rows 0,9', 'footer values']);
    // footerGating 켬: 스크롤만이면 푸터 0, 컬럼 구성이면 막대 다시
    log.length = 0;
    const s1 = new RenderScheduler(f, { planner: new RenderPlanner({ features: { footerGating: true } }), paint: port, footer });
    s1.submit(RenderRequest.SCROLLED);
    f.tick();
    expect(log).toEqual(['rows 0,9']);
    log.length = 0;
    s1.submit(RenderRequest.of(Change.Columns, { sync: true }));
    expect(log).toEqual(['rows 0,9', 'footer paint']);
    // 행 일이 없어도 푸터 일: smallUpdates 켜고 CellValue → 행 none · 푸터 values
    log.length = 0;
    const s2 = new RenderScheduler(f, { planner: new RenderPlanner({ features: { footerGating: true, smallUpdates: true } }), paint: port, footer });
    s2.submit(RenderRequest.of(Change.CellValue, { sync: true, cells: [{ ri: 1, field: 'a' }] }));
    expect(log).toEqual(['footer values']);
  });
});

describe('C1 — 명시 범위 sync 는 쌓인 스크롤 요청과 합치지 않음(펼침 뒤 최종 DOM 그대로)', () => {
  it('C1-EXPL 전 행 sync(묶음 펼침)는 그 자리에서 전 행, 쌓인 VS 요청은 다음 프레임에 보이는 범위로', () => {
    const f = new FakeFrame();
    const paints: [number, number][] = [];
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: { paintRows: (a, b) => paints.push([a, b]), visibleRows: () => [0, 29] } });
    s.submit(RenderRequest.WINDOW_CHANGED);  // setTotalRows 의 VS 요청
    s.submit(RenderRequest.rowsInclusive(0, 136));        // doRenderFull(137)
    expect(paints).toEqual([[0, 136]]);
    f.tick();
    expect(paints).toEqual([[0, 136], [0, 29]]);          // 걸음 전과 같은 차례·최종 범위
    s.submit(RenderRequest.WINDOW_CHANGED);
    s.submit(RenderRequest.REPAINT_CLEAR);
    expect(paints.slice(2)).toEqual([[0, -1]]);
    f.tick();
    expect(paints.slice(2)).toEqual([[0, -1], [0, 29]]);
  });

  it('C1-EXPL 그 안에서 sync 요청이 들어오면 돌아오기 전에 한 번 더(쌓인 것과 함께)', () => {
    const f = new FakeFrame();
    const paints: [number, number][] = [];
    let s!: RenderScheduler;
    let first = true;
    s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: { paintRows: (a, b) => { paints.push([a, b]); if (first) { first = false; s.submit(RenderRequest.REPAINT_VISIBLE); } }, visibleRows: () => [0, 29] } });
    s.submit(RenderRequest.WINDOW_CHANGED);
    s.submit(RenderRequest.rowsInclusive(0, 99));
    expect(paints).toEqual([[0, 99], [0, 29]]);           // 안쪽 sync 가 쌓인 VS 요청과 합쳐져 돌아오기 전에
    f.tick();
    expect(paints.length).toBe(2);
  });
});

describe('C7 — 보이는 범위는 하나(세로 창), 그릴 때 묻는다', () => {
  it('C7-ONE 낸 뒤 보이는 높이가 바뀌어도 그릴 때의 범위로 — sync 다시 그리기와 합쳐지면 그 범위로 한 번 · 스크롤은 프레임에 그때 범위로', () => {
    const f = new FakeFrame();
    const paints: [number, number][] = [];
    let vs: [number, number] = [0, 30];
    const s = new RenderScheduler(f, { planner: new RenderPlanner(), paint: { paintRows: (a, b) => paints.push([a, b]), visibleRows: () => vs } });
    s.submit(RenderRequest.WINDOW_CHANGED);   // setTotalRows — 이때 범위는 (0,30)
    vs = [0, 29];                              // 그 뒤 보이는 높이가 정해짐
    s.submit(RenderRequest.REPAINT_VISIBLE);   // 같은 호출의 sync 다시 그리기
    expect(paints).toEqual([[0, 29]]);         // 그릴 때의 범위(낼 때의 (0,30) 아님)
    f.tick();
    expect(paints.length).toBe(1);
    s.submit(RenderRequest.SCROLLED);
    vs = [5, 34];
    s.submit(RenderRequest.SCROLLED);
    vs = [10, 39];
    f.tick();
    expect(paints).toEqual([[0, 29], [10, 39]]);
    s.submit(RenderRequest.REPAINT_VISIBLE);   // sync 만이어도 같은 범위(식이 하나)
    expect(paints[2]).toEqual([10, 39]);
  });

  it('C7-SKIP scrollSkip 켬: 스크롤만이고 그려 둔 범위와 같으면 그리기 0 · 범위가 바뀌면 그림 · 내용 변화(WINDOW_CHANGED)는 늘 그림', () => {
    const f = new FakeFrame();
    const paints: [number, number][] = [];
    let vs: [number, number] = [0, 29];
    const s = new RenderScheduler(f, { planner: new RenderPlanner({ features: { scrollSkip: true, footerGating: true } }), paint: { paintRows: (a, b) => paints.push([a, b]), visibleRows: () => vs } });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    expect(paints.length).toBe(1);
    s.submit(RenderRequest.SCROLLED);          // 가로 스크롤·한 행 안 세로 스크롤 — 세로 창 범위 그대로
    f.tick();
    expect(paints.length).toBe(1);
    vs = [3, 32];
    s.submit(RenderRequest.SCROLLED);          // 세 행 아래
    f.tick();
    expect(paints).toEqual([[0, 29], [3, 32]]);
    s.submit(RenderRequest.WINDOW_CHANGED);    // 행 수가 바뀜(범위 같아도 내용이 다를 수 있음)
    f.tick();
    expect(paints.length).toBe(3);
  });

  it('C1-LAZY 공용 값 — SCROLLED = RowsScrolled · WINDOW_CHANGED = All, 둘 다 sync 아님·범위 없음', () => {
    expect(RenderRequest.SCROLLED.changes).toBe(Change.RowsScrolled);
    expect(RenderRequest.WINDOW_CHANGED.changes).toBe(Change.All);
    for (const r of [RenderRequest.SCROLLED, RenderRequest.WINDOW_CHANGED]) {
      expect(r.detail.sync).toBe(false);
      expect(r.detail.rows).toBeNull();
      expect(Object.isFrozen(r)).toBe(true);
    }
  });
});

describe('C4 — 스케줄러 sort 포트(PACT_C4)', () => {
  it('C4-SCH 계획 header 가 sortIndicator 면 정렬 표시에 지금 목록을 알림 · rebuild/none 이면 안 부름 · 포트 없으면 0', () => {
    const f = new FakeFrame();
    const rows: string[] = [];
    const updates: string[] = [];
    let list = [{ field: 'c1', dir: 'asc' as const }];
    const sort = { bind: () => undefined, update: (l: readonly { field: string; dir: 'asc' | 'desc' }[]) => updates.push(JSON.stringify(l)), setPressed: () => undefined, setBusy: () => undefined, release: () => undefined };
    const s = new RenderScheduler(f, {
      planner: new RenderPlanner({ features: { sortIndicatorOnly: true, footerGating: true } }),
      paint: { paintRows: (a, b) => rows.push(`${a},${b}`), visibleRows: () => [0, 9] },
      sort, sortList: () => list,
    });
    s.submit(RenderRequest.of(Change.RowOrder, { sync: true }));          // 정렬: 행 다시 + 표시만
    expect(rows).toEqual(['0,9']);
    expect(updates).toEqual(['[{"field":"c1","dir":"asc"}]']);
    list = [{ field: 'c1', dir: 'desc' }];
    s.submit(RenderRequest.of(Change.SortIndicator, { sync: true }));     // 표시만: 행 일 0
    expect(rows.length).toBe(1);
    expect(updates[1]).toBe('[{"field":"c1","dir":"desc"}]');
    s.submit(RenderRequest.REPAINT_VISIBLE);                              // All: 머리글 rebuild → 옛 길(표시 포트 안 부름)
    s.submit(RenderRequest.of(Change.RowSet, { sync: true }));            // header none
    expect(updates.length).toBe(2);
    // 포트 없으면 아무것도 안 함
    const s2 = new RenderScheduler(f, { planner: new RenderPlanner({ features: { sortIndicatorOnly: true } }), paint: { paintRows: () => undefined, visibleRows: () => [0, 1] } });
    expect(() => s2.submit(RenderRequest.of(Change.SortIndicator, { sync: true }))).not.toThrow();
  });
});

describe('C8 — 스케줄러 ColWidth 실행(기하 투영 · 머리글 높이 · 덧그림)', () => {
  function fakeGeo() {
    let version = 1;
    const widths = [100, 100, 100];
    const geo = {
      get version() { return version; },
      widths: () => widths,
      changesSince: (v: number) => ({ none: v === version, widthCols: [], leftFrom: 0, totalChanged: v !== version, structural: false, version }),
      bump: () => { version++; },
    };
    return geo;
  }
  function mk(features: Record<string, boolean>, extra: Record<string, unknown> = {}) {
    const f = new FakeFrame();
    const log: string[] = [];
    const geo = fakeGeo();
    const applier = { applyChange: (c: { version: number }) => log.push(`apply v${c.version}`) };
    const s = new RenderScheduler(f, {
      planner: new RenderPlanner({ features: { footerGating: true, ...features } }),
      paint: { paintRows: (a, b) => log.push(`rows ${a},${b}`), visibleRows: () => [0, 9] },
      footer: { paint: () => log.push('footer paint'), updateValues: () => log.push('footer values') },
      overlay: { repaint: () => log.push('overlay') },
      geometry: geo as never, applier: applier as never,
      ...extra,
    } as never);
    return { f, log, geo, s };
  }
  const colWidth = (sync = false) => RenderRequest.of(Change.ColWidth, { widthChangedFrom: 1, sync });

  it('C8-SCH-01 끄는 동안 입력 N 번 → 다음 rAF 에 투영 한 번 · 본문 다시 그리기 0 · 푸터 0 · 머리글 0(덧그림은 계획대로 한 번)', () => {
    const { f, log, geo, s } = mk({ geometryOnly: true });
    for (let k = 0; k < 5; k++) { geo.bump(); s.submit(colWidth()); }
    expect(log).toEqual([]);
    f.tick();
    expect(log).toEqual(['apply v6', 'overlay']);
    expect(s.lastPlan!.rows).toBe('none');
    expect(s.lastPlan!.footer).toBe('none');
    expect(s.lastPlan!.header).toBe('none');
    f.tick();
    expect(log.length).toBe(2);
  });

  it('C8-SCH-02 손 뗌(마지막 x 가 달라 sync) → 그 자리에서 투영 한 번 · 본문 그리기 0 · 이후 프레임 일 0', () => {
    const { f, log, geo, s } = mk({ geometryOnly: true });
    geo.bump(); s.submit(colWidth());
    geo.bump(); s.submit(colWidth(true));      // 놓음: 같은 프레임에 쌓인 입력까지 합쳐 그 자리에서
    expect(log).toEqual(['apply v3', 'overlay']);
    f.tick();
    expect(log.length).toBe(2);
    // 손 뗀 뒤(같은 x — 요청 없음): 아무 일 없음
    f.tick();
    expect(log.length).toBe(2);
  });

  it('C8-SCH-03 기하가 안 바뀐 ColWidth(같은 폭) → 투영 0', () => {
    const { f, log, s } = mk({ geometryOnly: true });
    s.submit(colWidth());
    f.tick();
    expect(log.filter((l) => l.startsWith('apply'))).toEqual([]);
  });

  it('C8-SCH-04 끄는 중 다른 요청과 한 프레임: 스크롤(같은 범위) → 투영만 · 자료 바뀜(All) → 투영 먼저, 그다음 행 다시 그리기 한 번(푸터 값)', () => {
    const { f, log, geo, s } = mk({ geometryOnly: true, scrollSkip: true });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    log.length = 0;
    geo.bump(); s.submit(colWidth()); s.submit(RenderRequest.SCROLLED);
    f.tick();
    expect(log).toEqual(['apply v2', 'overlay']);
    log.length = 0;
    geo.bump(); s.submit(colWidth()); s.submit(RenderRequest.WINDOW_CHANGED);
    f.tick();
    expect(log).toEqual(['apply v3', 'rows 0,9', 'footer values']);
  });

  it('C8-SCH-05 geometryOnly 끔(옛 동작) → ColWidth 는 행 다시 그리기로 떨어지되 투영도 함(머리글 자리)', () => {
    const { f, log, geo, s } = mk({});
    geo.bump(); s.submit(colWidth());
    f.tick();
    expect(log).toEqual(['apply v2', 'rows 0,9']);
  });

  // C-07 다시 한 판(PACT_slim v2, WIN 13:51): 스케줄러는 높이를 묻지 않고 줄바꿈이면 기하 프레임마다 headerLayout(= 주인에게 비교를 맡기는
  // relayoutHeaderIfChanged)을 한 번 부른다. 가짜 headerLayout 은 주인처럼 「마지막으로 맞춘 높이를 들고 다를 때만 맞춤」을 센다 →
  // 맞춤 횟수 기대는 걸음 전 그대로(처음 0 · 높이 바뀜 1 · 같은 높이 1 · 줄바꿈 아님 1). 높이 묻기 3 → 0(줄어듦).
  // 실제 RenderController 의 「끄는 동안 syncHeaderLayout ≤ 높이 바뀐 프레임」은 wg-c8-headerlayout-real C7-REAL-02·03 이 지킨다.
  it('C8-SCH-06 줄바꿈 머리글: 기하 프레임마다 주인에게 비교를 맡기는 부름 1 · 실제 맞춤은 높이가 달라졌을 때만 · 줄바꿈 아니면 부르지 않음 · 스케줄러는 높이를 묻지 않음', () => {
    let h = 40;
    let asked = 0;
    let calls = 0;
    let layouts = 0;
    let measured = 40;                                 // 마운트 때 맞춘 높이
    let wraps = true;
    const { f, geo, s } = mk({ geometryOnly: true }, {
      header: { height: () => { asked++; return h; } },
      headerLayout: () => { calls++; if (h !== measured) { measured = h; layouts++; } },
      headerWraps: () => wraps,
    });
    geo.bump(); s.submit(colWidth()); f.tick();      // 처음(같은 높이 — 맞춤 0)
    expect([asked, calls, layouts]).toEqual([0, 1, 0]);
    h = 60; geo.bump(); s.submit(colWidth()); f.tick();
    expect([asked, calls, layouts]).toEqual([0, 2, 1]);
    geo.bump(); s.submit(colWidth()); f.tick();      // 같은 높이
    expect([asked, calls, layouts]).toEqual([0, 3, 1]);
    wraps = false; h = 80; geo.bump(); s.submit(colWidth()); f.tick();
    expect([asked, calls, layouts]).toEqual([0, 3, 1]);
  });

  it('C8-SCH-07 포트가 없으면 기하 일 없음(옛 배선 그대로)', () => {
    const f = new FakeFrame();
    const log: string[] = [];
    const s = new RenderScheduler(f, { planner: new RenderPlanner({ features: { geometryOnly: true } }), paint: { paintRows: (a, b) => log.push(`${a},${b}`), visibleRows: () => [0, 1] } });
    s.submit(RenderRequest.of(Change.ColWidth, { sync: true }));
    expect(log).toEqual([]);
    expect(s.lastPlan!.geometry).toBe(false);
  });
});
