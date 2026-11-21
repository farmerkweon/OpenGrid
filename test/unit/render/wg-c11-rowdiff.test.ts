// @vitest-environment node
/**
 * C11(세로 행 차분) — 스케줄러 쪽: 계획이 rows:'diff' 를 낼 때 옛 그리기 길에 넷째 인자 'diff' 로 넘기고,
 * 같은 계획의 창 옮김(대각선)은 따로 부르지 않으며, 「행 차분 막힘」은 본문이 답한다(없으면 막힘으로 봄).
 */
import { describe, it, expect } from 'vitest';
import { RenderScheduler } from '../../../src/core/render/RenderScheduler.js';
import { RenderPlanner } from '../../../src/core/domain/render/RenderPlanner.js';
import { RenderRequest } from '../../../src/core/domain/render/RenderRequest.js';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import type { IColumnWindow, GridShape } from '../../../src/core/coordinate/geometryPorts.js';
import type { FramePort } from '../../../src/core/render/ports.js';

class FakeFrame implements FramePort {
  private _n = 1;
  readonly cbs = new Map<number, () => void>();
  request(cb: () => void): number { const id = this._n++; this.cbs.set(id, cb); return id; }
  cancel(id: number): void { this.cbs.delete(id); }
  tick(): void { const run = [...this.cbs.values()]; this.cbs.clear(); for (const cb of run) cb(); }
}
const SHAPE: GridShape = { autoHeight: false, viewportWidth: 900, mergeEmpty: true, virtualColumns: true };
const W1 = ColumnWindow.of([{ from: 0 as never, to: 7 as never }], 50);
const W2 = ColumnWindow.of([{ from: 3 as never, to: 12 as never }], 50);

function mk(o: { rowDiff?: boolean; blocked?: boolean | undefined; withWindow?: boolean } = {}) {
  const f = new FakeFrame();
  const log: string[] = [];
  let vis: [number, number] = [0, 29];
  let win: IColumnWindow = W1;
  const drawn: { columns: IColumnWindow | null; diffBlocked?: boolean } = { columns: null };
  if (o.blocked !== undefined) drawn.diffBlocked = o.blocked;
  const body = {
    drawn,
    update: (_n: unknown, rows: string, cols: string) => { log.push(`update ${rows} ${cols}`); },
  };
  const withWindow = o.withWindow !== false;
  const s = new RenderScheduler(f, {
    planner: new RenderPlanner({ features: { footerGating: true, scrollSkip: true, columnWindow: true, rowDiff: o.rowDiff !== false } }),
    paint: {
      paintRows: (a: number, b: number, cols?: IColumnWindow, rw?: 'diff') => {
        log.push(`rows ${a},${b}${rw ? ' ' + rw : ''}${cols === W2 ? ' W2' : ''}`);
        if (cols) drawn.columns = cols;
      },
      visibleRows: () => vis,
    },
    ...(withWindow ? {
      window: { next: () => win }, scroll: { box: { scrollLeft: 0, width: 900 } }, shape: () => SHAPE, body,
    } : {}),
  });
  const scrollRows = (start: number) => { vis = [start, start + 29]; s.submit(RenderRequest.SCROLLED); };
  return { f, log, s, scrollRows, setWin: (w: IColumnWindow) => { win = w; } };
}

describe('C11 — 스케줄러가 행 차분을 넘기는 길', () => {
  it('C11-SCH-01 세로 3행 걸음(겹침 큼) · 본문이 막힘 아님 → paintRows(…, "diff") 한 번', () => {
    const { f, log, s, scrollRows } = mk({ blocked: false });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    log.length = 0;
    scrollRows(3); f.tick();
    expect(log).toEqual(['rows 3,32 diff']);
    expect(s.lastPlan!.rows).toBe('diff');
  });

  it('C11-SCH-02 본문이 막힘(세로 병합·묶음·디테일 등)이면 통째 · 본문이 diffBlocked 를 안 주면 막힘으로 봄(안전)', () => {
    const a = mk({ blocked: true });
    a.s.submit(RenderRequest.REPAINT_VISIBLE); a.log.length = 0;
    a.scrollRows(3); a.f.tick();
    expect(a.log).toEqual(['rows 3,32']);
    const b = mk({ blocked: undefined });
    b.s.submit(RenderRequest.REPAINT_VISIBLE); b.log.length = 0;
    b.scrollRows(3); b.f.tick();
    expect(b.log).toEqual(['rows 3,32']);
  });

  it('C11-SCH-03 겹침 0(건너뛰기)·절반 넘게 바뀜 → 통째', () => {
    const { f, log, s, scrollRows } = mk({ blocked: false });
    s.submit(RenderRequest.REPAINT_VISIBLE); log.length = 0;
    scrollRows(500); f.tick();
    expect(log).toEqual(['rows 500,529']);
    log.length = 0;
    scrollRows(516); f.tick();            // 16행 바뀜 ≥ 30 × 0.5
    expect(log).toEqual(['rows 516,545']);
  });

  it('C11-SCH-04 대각선(같은 프레임에 세로 3행 + 창 바뀜) → diff 한 번에 새 창, 창 옮김 따로 0', () => {
    const { f, log, s, scrollRows, setWin } = mk({ blocked: false });
    s.submit(RenderRequest.REPAINT_VISIBLE); log.length = 0;
    setWin(W2);
    scrollRows(3);
    s.submit(RenderRequest.of(2 /* ColsScrolled */));
    f.tick();
    expect(log).toEqual(['rows 3,32 diff W2']);
    expect(s.lastPlan!.cols).toBe('shift');
  });

  it('C11-SCH-05 자료 바뀜(All)이 같은 프레임에 섞이면 통째(rebuild 가 diff 를 이김)', () => {
    const { f, log, s, scrollRows } = mk({ blocked: false });
    s.submit(RenderRequest.REPAINT_VISIBLE); log.length = 0;
    scrollRows(3);
    s.submit(RenderRequest.WINDOW_CHANGED);
    f.tick();
    expect(log).toEqual(['rows 3,32']);
  });

  it('C11-SCH-06 rowDiff 꺼짐(지금 배선 전) → 늘 통째 · 창 포트가 없어도 통째', () => {
    const a = mk({ blocked: false, rowDiff: false });
    a.s.submit(RenderRequest.REPAINT_VISIBLE); a.log.length = 0;
    a.scrollRows(3); a.f.tick();
    expect(a.log).toEqual(['rows 3,32']);
    const b = mk({ blocked: false, withWindow: false });
    b.s.submit(RenderRequest.REPAINT_VISIBLE); b.log.length = 0;
    b.scrollRows(3); b.f.tick();
    expect(b.log).toEqual(['rows 3,32']);
  });
});
