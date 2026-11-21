// @vitest-environment node
/**
 * C9 — 가로 창: 정책 프레임 입구(next)·스케줄러가 창을 본문에 넘기는 길.
 * 실제 ColumnGeometry · ColumnWindowPolicy · RenderPlanner 로, 본문은 가짜(그려 둔 창을 기록).
 * 기본: 50컬럼 × 180px(전체 9,000), 고정 0, 보이는 폭 900 → 여유 max(400, 450) = 450.
 */
import { describe, it, expect } from 'vitest';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ColumnWindowPolicy } from '../../../src/core/coordinate/ColumnWindowPolicy.js';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import type { GridShape, IColumnWindow, IExtraColumns, ViewportBox } from '../../../src/core/coordinate/geometryPorts.js';
import type { Px } from '../../../src/core/coordinate/types.js';
import { RenderScheduler } from '../../../src/core/render/RenderScheduler.js';
import { RenderPlanner } from '../../../src/core/domain/render/RenderPlanner.js';
import { RenderRequest } from '../../../src/core/domain/render/RenderRequest.js';
import { Change, type NextState, type RowWork, type ColWork } from '../../../src/core/domain/render/ports.js';
import type { FramePort } from '../../../src/core/render/ports.js';

class FakeFrame implements FramePort {
  private _n = 1;
  readonly cbs = new Map<number, () => void>();
  request(cb: () => void): number { const id = this._n++; this.cbs.set(id, cb); return id; }
  cancel(id: number): void { this.cbs.delete(id); }
  tick(): void { const run = [...this.cbs.values()]; this.cbs.clear(); for (const cb of run) cb(); }
}
const ext0: IExtraColumns = { ids: [], widthOf: () => 0 as Px, leftOf: () => 0 as Px, width: () => 0 as Px, legacyWidthWithoutDetail: () => 0 as Px };
const SHAPE: GridShape = { autoHeight: false, viewportWidth: 900, mergeEmpty: true, virtualColumns: true };
const segs = (w: IColumnWindow) => w.segments.map((s) => [s.from, s.to]);

function mk(opts: { frozen?: number; shape?: () => GridShape; pinned?: () => readonly number[] } = {}) {
  const geo = new ColumnGeometry(Array(50).fill(180), ext0, opts.frozen ?? 0);
  const policy = new ColumnWindowPolicy(geo, ColumnWindowPolicy.defaultRules());
  const f = new FakeFrame();
  const log: string[] = [];
  let box: ViewportBox = { scrollLeft: 0, width: 900 };
  const body = {
    drawn: { columns: null as IColumnWindow | null },
    update(next: NextState, rows: RowWork, cols: ColWork) { log.push(`update ${rows} ${cols} ${JSON.stringify(segs(next.columns))}`); body.drawn.columns = next.columns; },
  };
  const applier = { applyChange: () => log.push('apply') } as never;
  const s = new RenderScheduler(f, {
    planner: new RenderPlanner({ features: { footerGating: true, scrollSkip: true, geometryOnly: true, columnWindow: true } }),
    paint: {
      paintRows: (a: number, b: number, cols?: IColumnWindow) => { log.push(`rows ${a},${b} ${cols ? JSON.stringify(segs(cols)) : 'all'}`); body.drawn.columns = cols ?? null; },
      visibleRows: () => [0, 9],
    },
    geometry: geo, applier,
    window: policy, scroll: { get box() { return box; } }, shape: opts.shape ?? (() => SHAPE), body,
    pinnedColumns: opts.pinned,
  });
  const scrollTo = (x: number) => { box = { scrollLeft: x, width: 900 }; s.submit(RenderRequest.of(Change.ColsScrolled)); };
  return { geo, policy, f, log, s, body, scrollTo };
}

describe('C9 — ColumnWindowPolicy.next(프레임 입구)', () => {
  it('C9-POL-01 그려 둔 창이 덮으면 같은 객체 · 못 덮으면 새 창 · 모양이 창을 막으면 덮어도 전 컬럼', () => {
    const geo = new ColumnGeometry(Array(50).fill(180), ext0, 0);
    const p = new ColumnWindowPolicy(geo, ColumnWindowPolicy.defaultRules());
    const q = (x: number) => ({ box: { scrollLeft: x, width: 900 }, pinned: [] });
    const w0 = p.next(null, q(0), SHAPE);
    expect(segs(w0)).toEqual([[0, 7]]);           // 0 ~ 900+450 = 1,350 → 컬럼 7
    expect(p.next(w0, q(100), SHAPE)).toBe(w0);    // 100+900+225 = 1,225 < 1,440 → 덮음
    const w1 = p.next(w0, q(600), SHAPE);
    expect(w1).not.toBe(w0);
    expect(p.next(w0, q(0), { ...SHAPE, mergeEmpty: false }).full).toBe(true);
  });

  it('C9-POL-02 오른쪽으로 빠르게 긁으면 나아가는 쪽 여유가 움직인 만큼(×2, 폭 한 장까지) 넓어짐 · 뒤쪽은 기본 여유', () => {
    const geo = new ColumnGeometry(Array(50).fill(180), ext0, 0);
    const p = new ColumnWindowPolicy(geo, ColumnWindowPolicy.defaultRules());
    const q = (x: number) => ({ box: { scrollLeft: x, width: 900 }, pinned: [] });
    p.next(null, q(1000), SHAPE);
    const fast = p.next(null, q(1300), SHAPE);    // dx=300 → 앞 여유 450+600
    // 왼쪽 1300−450 = 850 → 컬럼 4 · 오른쪽 1300+900+450+600 = 3,250 → 컬럼 18
    expect(segs(fast)).toEqual([[4, 18]]);
    expect(segs(p.compute(q(1300), SHAPE))).toEqual([[4, 14]]);   // compute 는 이력 없이 같은 답
    const back = p.next(null, q(1000), SHAPE);    // 되돌아감 dx=−300 → 왼쪽 여유가 넓어짐
    expect(segs(back)).toEqual([[0, 13]]);
  });
});

describe('C9 — 스케줄러가 창을 본문에 넘기는 길', () => {
  it('C9-SCH-01 처음 그림은 행 통째 + 창(paintRows 셋째 인자) · 창 안 가로 스크롤은 일 0 · 못 덮으면 창만 옮김(행 그리기 0)', () => {
    const { f, log, s, scrollTo } = mk();
    s.submit(RenderRequest.REPAINT_VISIBLE);
    expect(log).toEqual(['rows 0,9 [[0,7]]']);
    log.length = 0;
    scrollTo(100); f.tick();
    expect(log).toEqual([]);
    expect(s.lastPlan!.empty).toBe(true);
    scrollTo(800); f.tick();
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^update none shift /);
    expect(s.lastPlan!.rows).toBe('none');
    expect(s.lastPlan!.footer).toBe('none');
    expect(s.lastPlan!.header).toBe('none');
  });

  it('C9-SCH-02 한 프레임에 가로 입력 여러 번 → 창 옮김 한 번(마지막 위치로)', () => {
    const { f, log, s, scrollTo } = mk();
    s.submit(RenderRequest.REPAINT_VISIBLE);
    log.length = 0;
    for (const x of [300, 900, 1500, 2100]) scrollTo(x);
    f.tick();
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^update none shift /);
  });

  it('C9-SCH-03 끄는 중 좁히기: 같은 프레임에 기하 먼저, 그다음 들어온 컬럼으로 창 옮김', () => {
    const { geo, f, log, s } = mk();
    s.submit(RenderRequest.REPAINT_VISIBLE);
    log.length = 0;
    // 컬럼 2~6 을 40px 로(그려 둔 창 [0,7] 의 끝 1,440 → 740 < 필요 900+225) — 들어올 컬럼이 생김
    for (let ci = 2; ci <= 6; ci++) geo.resize(ci as never, 40 as never);
    s.submit(RenderRequest.of(Change.ColWidth, { widthChangedFrom: 2 }));
    f.tick();
    expect(log[0]).toBe('apply');
    // 새 창 끝 = 0+900+450 = 1,350 → 컬럼 0·1 = 360, 2~6 = 200 → 560, 7.. 180씩 → 1,350 은 컬럼 11(1,280~1,460)
    expect(log[1]).toBe('update none shift [[0,11]]');
    expect(log.length).toBe(2);
  });

  it('C9-SCH-04 세로 범위가 바뀌는 대각선 → 행 통째 한 번(새 창으로) · 창 옮김 0', () => {
    const { f, log, s, scrollTo } = mk();
    s.submit(RenderRequest.REPAINT_VISIBLE);
    log.length = 0;
    scrollTo(2000);
    s.submit(RenderRequest.WINDOW_CHANGED);
    f.tick();
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^rows 0,9 \[\[/);
    expect(s.lastPlan!.cols).toBe('none');
  });

  it('C9-SCH-05 병합을 켜면(모양) 창이 전 컬럼으로 · 다시 끄면 창으로', () => {
    let merge = false;
    const { f, log, s, body } = mk({ shape: () => ({ ...SHAPE, mergeEmpty: !merge }) });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    expect(body.drawn.columns!.full).toBe(false);
    merge = true;
    s.submit(RenderRequest.of(Change.Columns));
    f.tick();
    expect(body.drawn.columns!.full).toBe(true);
    merge = false;
    log.length = 0;
    s.submit(RenderRequest.of(Change.Columns));
    f.tick();
    expect(body.drawn.columns!.full).toBe(false);
  });

  it('C9-SCH-06 편집·포커스 컬럼(pinned)이 창 밖이면 창이 그 컬럼까지 넓어짐', () => {
    let pinned: number[] = [];
    const { f, s, body } = mk({ pinned: () => pinned });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    pinned = [30];
    s.submit(RenderRequest.of(Change.ColsScrolled));
    f.tick();
    expect(body.drawn.columns!.contains(30 as never)).toBe(true);
  });

  it('C9-SCH-07 고정 컬럼은 늘 창 안(첫 구간 = 고정 구간)', () => {
    const { f, s, body, scrollTo } = mk({ frozen: 2 });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    scrollTo(4000); f.tick();
    expect(segs(body.drawn.columns!)[0]).toEqual([0, 1]);
  });

  it('C9-SCH-08 창 포트가 하나라도 없으면 지금처럼 전 컬럼(셋째 인자 없음) · 가로 요청은 일 0', () => {
    const f = new FakeFrame();
    const log: string[] = [];
    const s = new RenderScheduler(f, {
      planner: new RenderPlanner({ features: { scrollSkip: true, columnWindow: true } }),
      paint: { paintRows: (a: number, b: number, c?: IColumnWindow) => log.push(`rows ${a},${b} ${c ? 'win' : 'all'}`), visibleRows: () => [0, 9] },
      window: new ColumnWindowPolicy(new ColumnGeometry(Array(50).fill(180), ext0, 0), ColumnWindowPolicy.defaultRules()),
    });
    s.submit(RenderRequest.REPAINT_VISIBLE);
    s.submit(RenderRequest.of(Change.ColsScrolled));
    f.tick();
    expect(log).toEqual(['rows 0,9 all']);
    expect(ColumnWindow.full(0).full).toBe(true);
  });
});
