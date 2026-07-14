// DD-09 §2.2·§2.8·§4(C1) CommandRegistry(SPI·rehydrate) + MutationGuard(우회감지)
import { describe, it, expect, vi } from 'vitest';
import {
  DefaultCommandRegistry,
  RehydrateError,
  MutationGuard,
  CellWriteCommand,
  CompositeCommand,
  type CommandSpec,
  type ICommand,
  type CommandDTO,
} from '../../../src/core/command/index.js';
import { FakeGrid, ctxOf } from './fixtures.js';

describe('DD-09 §2.2 CommandRegistry — 내장·SPI·rehydrate', () => {
  it('내장 커맨드 kind 가 등록되어 있다', () => {
    const reg = new DefaultCommandRegistry();
    for (const k of ['cell.write', 'row.insert', 'row.delete', 'composite']) {
      expect(reg.has(k)).toBe(true);
    }
  });

  it('DTO → 살아있는 커맨드 복원(cell.write)', () => {
    const reg = new DefaultCommandRegistry();
    const grid = new FakeGrid([{ amt: 7 }]);
    const dto: CommandDTO = { kind: 'cell.write', payload: { rowId: 'r0', field: 'amt', newValue: 100, oldValue: 7 }, at: 0 };
    const cmd = reg.rehydrate(dto);
    cmd.do(ctxOf(grid));
    expect(grid.getCellValue('r0', 'amt')).toBe(100);
    cmd.undo(ctxOf(grid));
    expect(grid.getCellValue('r0', 'amt')).toBe(7);
  });

  it('미등록 kind 는 조용히 무시하지 않고 RehydrateError(불변식 §5)', () => {
    const reg = new DefaultCommandRegistry();
    expect(() => reg.rehydrate({ kind: 'nope.unknown', payload: {}, at: 0 })).toThrow(RehydrateError);
  });

  it('composite DTO 는 자식을 재귀 복원', () => {
    const reg = new DefaultCommandRegistry();
    const grid = new FakeGrid([{ a: 0, b: 0 }]);
    const dto: CommandDTO = {
      kind: 'composite',
      payload: [
        { kind: 'cell.write', payload: { rowId: 'r0', field: 'a', newValue: 1, oldValue: 0 }, at: 0 },
        { kind: 'cell.write', payload: { rowId: 'r0', field: 'b', newValue: 2, oldValue: 0 }, at: 0 },
      ],
      at: 0,
    };
    const cmd = reg.rehydrate(dto);
    expect(cmd).toBeInstanceOf(CompositeCommand);
    cmd.do(ctxOf(grid));
    expect(grid.snapshotData()).toEqual([{ a: 1, b: 2 }]);
  });

  it('커스텀 kind 확장 → rehydrate 라우팅(SPI)', () => {
    const reg = new DefaultCommandRegistry();
    const spec: CommandSpec = {
      payloadVersion: 1,
      fromPayload: (p): ICommand => {
        const { rowId, field } = p as { rowId: string; field: string };
        return new CellWriteCommand(rowId, field, 'CUSTOM');
      },
    };
    reg.register('my.custom', spec);
    expect(reg.has('my.custom')).toBe(true);
    const grid = new FakeGrid([{ v: '' }]);
    reg.rehydrate({ kind: 'my.custom', payload: { rowId: 'r0', field: 'v' }, at: 0 }).do(ctxOf(grid));
    expect(grid.getCellValue('r0', 'v')).toBe('CUSTOM');
  });

  it('C1: 내장 kind 는 builtin 보호 — override 없이는 교체 거부', () => {
    const reg = new DefaultCommandRegistry();
    let called = false;
    // origin user, override 미지정 → kept(내장 보호). 교체 안 됨.
    reg.register('cell.write', { payloadVersion: 1, fromPayload: () => { called = true; return new CellWriteCommand('r0', 'x', 1); } });
    const grid = new FakeGrid([{ x: 0 }]);
    reg.rehydrate({ kind: 'cell.write', payload: { rowId: 'r0', field: 'x', newValue: 5, oldValue: 0 }, at: 0 }).do(ctxOf(grid));
    expect(called).toBe(false); // 내장 팩토리가 사용됨
    expect(grid.getCellValue('r0', 'x')).toBe(5);
  });

  it('payload 미지 상위버전(__v) 은 거부', () => {
    const reg = new DefaultCommandRegistry();
    expect(() =>
      reg.rehydrate({ kind: 'cell.write', payload: { __v: 99, rowId: 'r0', field: 'x', newValue: 1 }, at: 0 }),
    ).toThrow(RehydrateError);
  });
});

describe('DD-09 §2.8 MutationGuard — 우회 변이 감지', () => {
  it('dispatch 구간 밖 변이는 위반 신고', () => {
    const sink = vi.fn();
    const guard = new MutationGuard({ onViolation: sink });
    guard.assertInside('DataLayer.updateCell'); // 밖 → 위반
    expect(sink).toHaveBeenCalledOnce();
  });

  it('enter/leave 구간 안 변이는 조용', () => {
    const sink = vi.fn();
    const guard = new MutationGuard({ onViolation: sink });
    guard.enter();
    guard.assertInside('ok');
    guard.leave();
    expect(sink).not.toHaveBeenCalled();
    expect(guard.inside).toBe(false);
  });

  it('dev=false 면 감지 비활성', () => {
    const sink = vi.fn();
    const guard = new MutationGuard({ onViolation: sink, dev: false });
    guard.assertInside('x');
    expect(sink).not.toHaveBeenCalled();
  });
});
