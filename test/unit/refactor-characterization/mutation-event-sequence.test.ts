/**
 * R0 CHARACTERIZATION — mutate→render→emit output ORDER + payload golden.
 *
 * Freezes the observable output contract of each mutator so R4 (render pipeline) / R6 (global
 * state) / R9 (single commit chokepoint) cannot silently reorder or drop emissions. The design
 * (90_final_design.md §3.4 Yourdon) flags the exact firing order of the 3 output sinks as an
 * "un-decided runtime-trace blocker"; this test resolves it by observation and pins it.
 *
 * The three output sinks (00_current_architecture.md §2.4-5):
 *   (1) emit('dataChange')            — EventEmitter, host subscribes via grid.on('dataChange')
 *   (2) onDataChange option callback  — NOTE: bound as a 'dataChange' LISTENER in _bindOptionEvents
 *                                        (OpenGrid.ts:1055), so it fires from the emit itself; the
 *                                        row mutators ALSO call this._options.onDataChange?.() again
 *                                        (e.g. :1147) → observable DOUBLE-FIRE (setData does NOT).
 *   (3) after:<op> / complete triggers — TriggerManager (OpenGrid.ts:1104,1149,1200,1244).
 *
 * Golden ordering below was captured by runtime observation, not guessed.
 * Design refs: 90_final_design.md §2.9 R-9c, §3.4; 00_current_architecture.md §2.4-5,-7.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid';

// Deterministic manual rAF queue: keeps VirtualScroll's scheduled render out of the synchronous
// emit-order observation, and lets the setData-render probe assert scheduling explicitly.
let rafQueue: FrameRequestCallback[] = [];
function flushRaf() {
  const q = rafQueue;
  rafQueue = [];
  q.forEach(cb => cb(0));
}

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  (global as any).cancelAnimationFrame = () => {};
});

afterEach(() => {
  rafQueue = [];
  document.body.innerHTML = '';
});

const columns = [
  { field: 'name',   header: 'name', width: 120, editable: true },
  { field: 'salary', header: 'salary', width: 100, type: 'number' as const, editable: true },
];
const sample = [
  { name: 'A', salary: 100 },
  { name: 'B', salary: 200 },
  { name: 'C', salary: 300 },
];

/** Build a grid whose every observable output sink appends a label to `log`. */
function makeGrid(log: string[]) {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  // Option callbacks are registered FIRST (bound during construction via _bindOptionEvents).
  const g = new OpenGrid(el, {
    columns,
    height: 400,
    onDataChange: () => log.push('opt:onDataChange'),
    onEditEnd: () => log.push('opt:onEditEnd'),
  });
  // Host emit-subscribers registered AFTER construction (so they run after the bound option cbs).
  g.on('dataChange', () => log.push('emit:dataChange'));
  g.on('editEnd', () => log.push('emit:editEnd'));
  for (const op of ['setData', 'insertRow', 'pushRow', 'deleteRow', 'writeCell']) {
    g.addTrigger(`after:${op}`, () => log.push(`after:${op}`));
  }
  g.addTrigger('complete', (ctx: any) => log.push(`complete:${ctx.operation}`));
  return g;
}

describe('R0: mutation output ORDER golden (emit / onDataChange / trigger)', () => {
  it('setData — emits dataChange (onDataChange fires ONCE via bound listener), then after/complete', () => {
    const log: string[] = [];
    const g = makeGrid(log);
    g.setData(sample.map(r => ({ ...r })));
    // GOLDEN (observed): setData does NOT call this._options.onDataChange?.() explicitly — the
    // single opt:onDataChange comes from the bound 'dataChange' listener → NO double-fire here.
    expect(log).toEqual([
      'opt:onDataChange',
      'emit:dataChange',
      'after:setData',
      'complete:setData',
    ]);
    g.destroy();
  });

  it('insertRow — onDataChange DOUBLE-fires (bound listener + explicit call), then after/complete', () => {
    const log: string[] = [];
    const g = makeGrid(log);
    g.setData(sample.map(r => ({ ...r })));
    log.length = 0;
    g.insertRow({ name: 'X', salary: 1 });
    expect(log).toEqual([
      'opt:onDataChange',   // bound listener (from emit)
      'emit:dataChange',    // host subscriber (from emit)
      'opt:onDataChange',   // explicit this._options.onDataChange?.() (OpenGrid.ts:1147)
      'after:insertRow',
      'complete:insertRow',
    ]);
    g.destroy();
  });

  it('pushRow — same double-fire but fires NO trigger (no before/after bracket)', () => {
    const log: string[] = [];
    const g = makeGrid(log);
    g.setData(sample.map(r => ({ ...r })));
    log.length = 0;
    g.pushRow({ name: 'Y', salary: 2 });
    // GOLDEN: pushRow has no mkCtx/exec bracket → no after:pushRow, no complete.
    expect(log).toEqual([
      'opt:onDataChange',
      'emit:dataChange',
      'opt:onDataChange',
    ]);
    g.destroy();
  });

  it('deleteRow — onDataChange double-fires, then after/complete', () => {
    const log: string[] = [];
    const g = makeGrid(log);
    g.setData(sample.map(r => ({ ...r })));
    log.length = 0;
    g.deleteRow(0);
    expect(log).toEqual([
      'opt:onDataChange',
      'emit:dataChange',
      'opt:onDataChange',
      'after:deleteRow',
      'complete:deleteRow',
    ]);
    g.destroy();
  });

  it('writeCell — editEnd pair fires first, then dataChange pair, then after/complete', () => {
    const log: string[] = [];
    const g = makeGrid(log);
    g.setData(sample.map(r => ({ ...r })));
    log.length = 0;
    g.writeCell(0, 'name', 'Z');
    // GOLDEN: editEnd double-fires (bound onEditEnd + explicit onEditEnd, OpenGrid.ts:1228-1229),
    // then dataChange double-fires (OpenGrid.ts:1239-1240), then after:writeCell/complete.
    expect(log).toEqual([
      'opt:onEditEnd',
      'emit:editEnd',
      'opt:onEditEnd',
      'opt:onDataChange',
      'emit:dataChange',
      'opt:onDataChange',
      'after:writeCell',
      'complete:writeCell',
    ]);
    g.destroy();
  });
});

describe('R0: does setData render? (Yourdon runtime-trace blocker)', () => {
  it('setData does NOT call the synchronous _doRender tail, but SCHEDULES an async render via VirtualScroll', () => {
    const log: string[] = [];
    const g = makeGrid(log);

    // Warm up + flush any construction/first-load scheduled frames so the VS rAF guard is clear.
    g.setData(sample.map(r => ({ ...r })));
    flushRaf();
    rafQueue = [];

    // A second setData: capture whether it schedules a render frame.
    g.setData(sample.map(r => ({ ...r })));

    // ANSWER: setData renders — but via VirtualScroll.setTotalRows → _scheduleRender →
    // requestAnimationFrame (async), NOT via the imperative `_doRender(...this._visRange())` tail
    // that insertRow/deleteRow/writeCell use. So the render is scheduled, not synchronous.
    expect(rafQueue.length).toBeGreaterThan(0);

    // The scheduled frame executes a real render pass without throwing.
    expect(() => flushRaf()).not.toThrow();

    g.destroy();
  });
});
