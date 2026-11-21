/**
 * 줄이기 걸음(CD) — 스케줄러 쪽 두 가지.
 * C-13: 행을 통째 다시 그릴 계획에서는 투영에 「본문 자리 건너뛰기」를 넘긴다(본문 등록 자리 쓰기 0) — 최종 DOM 은 같다.
 * Late 포트: 값 대신 「지금 것을 돌려주는 함수」를 받고, 함수가 null 이면(붙이기 전) 그 일을 건너뛴다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { RenderScheduler } from '../../../src/core/render/RenderScheduler.js';
import { RenderPlanner } from '../../../src/core/domain/render/RenderPlanner.js';
import { RenderRequest } from '../../../src/core/domain/render/RenderRequest.js';
import { Change } from '../../../src/core/domain/render/ports.js';
import type { FramePort } from '../../../src/core/render/ports.js';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { installResizeObserverStub } from '../widegrid-helpers.js';
import { mkW, disposeW, frames } from '../wg-helpers/counters.js';
import { dfSnapshot } from '../wg-helpers/dom-snapshot.js';

class FakeFrame implements FramePort {
  private _n = 1;
  readonly cbs = new Map<number, () => void>();
  request(cb: () => void): number { const id = this._n++; this.cbs.set(id, cb); return id; }
  cancel(id: number): void { this.cbs.delete(id); }
  tick(): void { const run = [...this.cbs.values()]; this.cbs.clear(); for (const cb of run) cb(); }
}

function fakeGeo() {
  let version = 1;
  return {
    get version() { return version; },
    widths: () => [100, 100],
    changesSince: (v: number) => ({ none: v === version, widthCols: [0], leftFrom: 0, totalChanged: true, structural: false, version }),
    bump: () => { version++; },
  };
}

describe('CD — 스케줄러 C-13 · Late 포트', () => {
  beforeAll(() => installResizeObserverStub());

  it('CD-SCH-01 행 통째 계획(All·clear) → applyChange 에 { skipScope:"body" } · 폭만 바뀐 계획 → 선택 없음', () => {
    const f = new FakeFrame();
    const geo = fakeGeo();
    const calls: unknown[] = [];
    const s = new RenderScheduler(f, {
      planner: new RenderPlanner({ features: { footerGating: true, geometryOnly: true } }),
      paint: { paintRows: () => undefined, visibleRows: () => [0, 9] },
      geometry: geo as never,
      applier: { applyChange: (_c: unknown, o?: unknown) => calls.push(o ?? null) } as never,
    });
    geo.bump(); s.submit(RenderRequest.REPAINT_VISIBLE);
    geo.bump(); s.submit(RenderRequest.REPAINT_CLEAR);
    geo.bump(); s.submit(RenderRequest.of(Change.ColWidth, { sync: true }));
    expect(calls).toEqual([{ skipScope: 'body' }, { skipScope: 'body' }, null]);
  });

  it('CD-SCH-02 Late 포트: 함수가 null 을 돌려주는 동안 기하 일 0 · 생기면 그 판부터 반영', () => {
    const f = new FakeFrame();
    const geo = fakeGeo();
    let ready = false;
    const applied: number[] = [];
    const s = new RenderScheduler(f, {
      planner: new RenderPlanner({ features: { geometryOnly: true } }),
      paint: { paintRows: () => undefined, visibleRows: () => [0, 9] },
      geometry: () => (ready ? (geo as never) : null),
      applier: () => (ready ? ({ applyChange: (c: { version: number }) => applied.push(c.version) } as never) : null),
    });
    s.submit(RenderRequest.of(Change.ColWidth, { sync: true }));
    expect(applied).toEqual([]);
    ready = true;
    geo.bump();
    s.submit(RenderRequest.of(Change.ColWidth, { sync: true }));
    expect(applied).toEqual([2]);
  });

  it('CD-SCH-03 실제 그리드: 폭을 바꾼 뒤 통째 다시 그리기 — 투영은 본문을 건너뛰고, 최종 DOM == 그 폭으로 처음부터 그린 DOM', async () => {
    const opts: unknown[] = [];
    const orig = GeometryApplier.prototype.applyChange;
    GeometryApplier.prototype.applyChange = function (this: GeometryApplier, c, o) { opts.push(o ?? null); return orig.call(this, c, o); };
    const a = await mkW({ rows: 200, cols: 12, rendererEvery: 0 });
    const cols = Array.from({ length: 12 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: i === 3 ? 177 : 120 }));
    try {
      await frames(2);
      (a.grid as any)._render.setUserWidth(3, 177);
      a.grid.setOptions({});           // 통째(REPAINT_VISIBLE sync) — 기하 바뀐 뒤 첫 All
      await frames(2);
      expect(opts).toContainEqual({ skipScope: 'body' });
      const b = await mkW({ rows: 200, cols: 12, rendererEvery: 0, columns: cols });
      try {
        await frames(2);
        const body = (s: string) => s.slice(s.indexOf('== body'));
        expect(body(dfSnapshot(a.container))).toBe(body(dfSnapshot(b.container)));
      } finally { disposeW(b); }
    } finally {
      GeometryApplier.prototype.applyChange = orig;
      disposeW(a);
    }
  });
});
