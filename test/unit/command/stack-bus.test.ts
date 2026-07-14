// DD-09 §2.3 CommandStack + CommandBus — 이중 스택·coalesce 창·dispatch/undo/redo·매크로·트랜잭션
import { describe, it, expect, vi } from 'vitest';
import {
  CommandStack,
  CommandBus,
  CellWriteCommand,
  RowInsertCommand,
  CompositeCommand,
  DirtyTracker,
  DefaultAuditLog,
  MutationGuard,
  type ICommand,
} from '../../../src/core/command/index.js';
import { FakeGrid, ctxOf } from './fixtures.js';

describe('DD-09 §2.3 CommandStack — 이중 스택·redo 클리어·용량 상한', () => {
  it('새 push 는 redo 스택을 비운다(분기 방지)', () => {
    const s = new CommandStack({ now: () => 0, coalesceWindowMs: 0 });
    const a = new CellWriteCommand('r0', 'x', 1);
    const b = new CellWriteCommand('r1', 'y', 2);
    s.push(a);
    s.popUndo(); // redo 에 a
    expect(s.canRedo()).toBe(true);
    s.push(b); // redo 클리어
    expect(s.canRedo()).toBe(false);
    expect(s.undoDepth).toBe(1);
  });

  it('용량 상한 초과 시 가장 오래된 엔트리를 버린다', () => {
    const s = new CommandStack({ capacity: 2, now: () => 0, coalesceWindowMs: 0 });
    s.push(new CellWriteCommand('r0', 'x', 1));
    s.push(new CellWriteCommand('r1', 'x', 2));
    s.push(new CellWriteCommand('r2', 'x', 3));
    expect(s.undoDepth).toBe(2);
  });

  it('coalesce 창 안이면 접고(depth 불변), 창 밖이면 새 엔트리', () => {
    let t = 0;
    const s = new CommandStack({ now: () => t, coalesceWindowMs: 100 });
    s.push(new CellWriteCommand('r0', 'x', 1));
    t = 50; // 창 안
    s.push(new CellWriteCommand('r0', 'x', 2));
    expect(s.undoDepth).toBe(1); // 접힘
    t = 1000; // 창 밖
    s.push(new CellWriteCommand('r0', 'x', 3));
    expect(s.undoDepth).toBe(2);
  });

  it('serializeHistory 는 undo 이력을 DTO 로', () => {
    const s = new CommandStack({ now: () => 0, coalesceWindowMs: 0 });
    const c = new CellWriteCommand('r0', 'x', 1);
    c.do(ctxOf(new FakeGrid([{ x: 0 }])));
    s.push(c);
    const h = s.serializeHistory();
    expect(h).toHaveLength(1);
    expect(h[0]!.kind).toBe('cell.write');
  });
});

describe('DD-09 §2.3 CommandBus — dispatch/undo/redo 단일 경로', () => {
  function makeBus(grid: FakeGrid, emit?: (e: 'command', c: ICommand) => void) {
    const stack = new CommandStack({ now: () => 0, coalesceWindowMs: 0 });
    const dirty = new DirtyTracker();
    const audit = new DefaultAuditLog();
    const guard = new MutationGuard();
    const bus = new CommandBus({ ctx: ctxOf(grid), stack, dirty, audit, guard, emit });
    return { bus, stack, dirty, audit, guard };
  }

  it('dispatch → do 적용 + audit/dirty 기록 + emit', () => {
    const grid = new FakeGrid([{ amt: 1 }]);
    const emit = vi.fn();
    const { bus, dirty, audit } = makeBus(grid, emit);
    bus.dispatch(new CellWriteCommand('r0', 'amt', 50));
    expect(grid.getCellValue('r0', 'amt')).toBe(50);
    expect(dirty.isDirty()).toBe(true);
    expect(audit.length).toBe(1);
    expect(emit).toHaveBeenCalledOnce();
  });

  it('undo → redo 왕복(관측 상태 복원)', () => {
    const grid = new FakeGrid([{ amt: 1 }]);
    const { bus } = makeBus(grid);
    bus.dispatch(new CellWriteCommand('r0', 'amt', 50));
    expect(bus.undo()).toBe(true);
    expect(grid.getCellValue('r0', 'amt')).toBe(1);
    expect(bus.redo()).toBe(true);
    expect(grid.getCellValue('r0', 'amt')).toBe(50);
  });

  it('빈 스택 undo/redo 는 false', () => {
    const { bus } = makeBus(new FakeGrid());
    expect(bus.undo()).toBe(false);
    expect(bus.redo()).toBe(false);
  });

  it('dispatch 는 guard 구간 안에서 실행(우회 감지 0)', () => {
    const grid = new FakeGrid([{ amt: 1 }]);
    const { bus, guard } = makeBus(grid);
    let insideDuringDo = false;
    const probe: ICommand = {
      kind: 'probe',
      label: 'probe',
      footprint: { scope: 'meta' },
      do: () => {
        insideDuringDo = guard.inside;
      },
      undo: () => {},
      serialize: () => ({ kind: 'probe', payload: null, at: 0 }),
    };
    bus.dispatch(probe);
    expect(insideDuringDo).toBe(true);
    expect(guard.inside).toBe(false); // leave 됨
  });
});

describe('DD-09 §2.3 매크로·트랜잭션 — 단일 undo 단위', () => {
  it('beginMacro/endMacro → CompositeCommand 하나로 undo', () => {
    const grid = new FakeGrid([{ a: 0, b: 0 }]);
    const bus = new CommandBus({
      ctx: ctxOf(grid),
      stack: new CommandStack({ now: () => 0, coalesceWindowMs: 0 }),
    });
    bus.beginMacro('cmd.batch');
    bus.dispatch(new CellWriteCommand('r0', 'a', 1));
    bus.dispatch(new CellWriteCommand('r0', 'b', 2));
    bus.endMacro();
    expect(grid.snapshotData()).toEqual([{ a: 1, b: 2 }]);
    expect(bus.stack.undoDepth).toBe(1); // 단일 엔트리
    bus.undo(); // 한 번에 되돌림
    expect(grid.snapshotData()).toEqual([{ a: 0, b: 0 }]);
  });

  it('transact 는 body 를 하나의 undo 단위로 감싼다', () => {
    const grid = new FakeGrid([{ v: 0 }]);
    const bus = new CommandBus({ ctx: ctxOf(grid), stack: new CommandStack({ now: () => 0, coalesceWindowMs: 0 }) });
    bus.transact('cmd.tx', () => {
      bus.dispatch(new RowInsertCommand({ v: 9 }, 'last'));
      bus.dispatch(new CellWriteCommand('r0', 'v', 5));
    });
    expect(bus.stack.undoDepth).toBe(1);
    bus.undo();
    expect(grid.snapshotData()).toEqual([{ v: 0 }]);
  });

  it('빈 매크로는 스택에 아무것도 올리지 않는다', () => {
    const bus = new CommandBus({ ctx: ctxOf(new FakeGrid()), stack: new CommandStack() });
    bus.beginMacro('empty');
    bus.endMacro();
    expect(bus.stack.undoDepth).toBe(0);
  });
});
