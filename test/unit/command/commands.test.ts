// DD-09 §2.1·§2.4·§3.2 구체 커맨드 불변식 — 가역성·coalesce·stable rowId 앵커·합성
import { describe, it, expect } from 'vitest';
import {
  CellWriteCommand,
  RowInsertCommand,
  RowDeleteCommand,
  CompositeCommand,
  cellWriteFromPayload,
} from '../../../src/core/command/index.js';
import { FakeGrid, ctxOf } from './fixtures.js';

describe('DD-09 §2.1 CellWriteCommand — 가역성(불변식 §2)', () => {
  it('do 는 새 값을, undo 는 do 직전 old 값을 복원한다', () => {
    const grid = new FakeGrid([{ name: 'a', amt: 10 }]);
    const ctx = ctxOf(grid);
    const cmd = new CellWriteCommand('r0', 'amt', 99);
    cmd.do(ctx);
    expect(grid.getCellValue('r0', 'amt')).toBe(99);
    cmd.undo(ctx);
    expect(grid.getCellValue('r0', 'amt')).toBe(10);
  });

  it('좌표는 rowId 로 앵커 — 앞 행 삭제로 index 가 흔들려도 안전', () => {
    const grid = new FakeGrid([{ v: 1 }, { v: 2 }]);
    const ctx = ctxOf(grid);
    const cmd = new CellWriteCommand('r1', 'v', 200);
    cmd.do(ctx);
    // 앞 행(r0)을 지워 r1 이 index 0 으로 이동.
    grid.deleteRows([0]);
    expect(grid.indexOf('r1')).toBe(0);
    cmd.undo(ctx);
    expect(grid.getCellValue('r1', 'v')).toBe(2);
  });

  it('footprint 은 cell scope 로 rowId·field 를 신고', () => {
    const cmd = new CellWriteCommand('r0', 'amt', 1);
    expect(cmd.footprint).toEqual({ scope: 'cell', rowId: 'r0', field: 'amt' });
  });

  it('serialize/rehydrate 왕복 — payload 에 old/new 보존', () => {
    const grid = new FakeGrid([{ amt: 5 }]);
    const cmd = new CellWriteCommand('r0', 'amt', 42);
    cmd.do(ctxOf(grid));
    const dto = cmd.serialize();
    expect(dto.kind).toBe('cell.write');
    const restored = cellWriteFromPayload(dto.payload);
    // 복원 커맨드 undo → old(5) 복원.
    restored.undo(ctxOf(grid));
    expect(grid.getCellValue('r0', 'amt')).toBe(5);
  });
});

describe('DD-09 §2.4 coalesce — 연속 타이핑 병합(리스크2 골든)', () => {
  it('같은 셀 N타 병합 후 1 undo = 최초 값', () => {
    const grid = new FakeGrid([{ amt: 0 }]);
    const ctx = ctxOf(grid);
    let head: CellWriteCommand = new CellWriteCommand('r0', 'amt', 1);
    head.do(ctx);
    for (const v of [2, 3, 4]) {
      const next = new CellWriteCommand('r0', 'amt', v);
      next.do(ctx);
      const merged = head.coalesce(next) as CellWriteCommand;
      expect(merged).not.toBeNull();
      head = merged;
    }
    expect(grid.getCellValue('r0', 'amt')).toBe(4);
    head.undo(ctx);
    expect(grid.getCellValue('r0', 'amt')).toBe(0); // 최초 old 로 한 번에 복원
  });

  it('다른 셀/필드는 coalesce 하지 않는다(null)', () => {
    const a = new CellWriteCommand('r0', 'amt', 1);
    const b = new CellWriteCommand('r0', 'qty', 2);
    const c = new CellWriteCommand('r1', 'amt', 3);
    expect(a.coalesce(b)).toBeNull();
    expect(a.coalesce(c)).toBeNull();
  });
});

describe('DD-09 §3.2 RowInsert/RowDelete — 구조 변경 undo 안정성', () => {
  it('RowInsert do 는 행 추가, undo 는 그 행 제거', () => {
    const grid = new FakeGrid([{ v: 1 }]);
    const ctx = ctxOf(grid);
    const cmd = new RowInsertCommand({ v: 2 }, 'last');
    cmd.do(ctx);
    expect(grid.rowCount()).toBe(2);
    expect(grid.snapshotData()).toEqual([{ v: 1 }, { v: 2 }]);
    cmd.undo(ctx);
    expect(grid.rowCount()).toBe(1);
    expect(grid.snapshotData()).toEqual([{ v: 1 }]);
  });

  it('RowDelete do 는 제거, undo 는 값·위치 복원(rowId 앵커·스냅샷)', () => {
    const grid = new FakeGrid([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const ctx = ctxOf(grid);
    const cmd = new RowDeleteCommand([0, 2]); // v1, v3 삭제
    cmd.do(ctx);
    expect(grid.snapshotData()).toEqual([{ v: 2 }]);
    cmd.undo(ctx);
    expect(grid.snapshotData()).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
  });

  it('RowDelete 단일 삭제 undo', () => {
    const grid = new FakeGrid([{ v: 'x' }, { v: 'y' }]);
    const ctx = ctxOf(grid);
    const cmd = new RowDeleteCommand([1]);
    cmd.do(ctx);
    expect(grid.snapshotData()).toEqual([{ v: 'x' }]);
    cmd.undo(ctx);
    expect(grid.snapshotData()).toEqual([{ v: 'x' }, { v: 'y' }]);
  });
});

describe('DD-09 §2.4 CompositeCommand — 순서대로 do, 역순 undo', () => {
  it('자식들을 순서대로 do, 역순 undo 하여 원자적 되돌림', () => {
    const grid = new FakeGrid([{ a: 1, b: 1 }]);
    const ctx = ctxOf(grid);
    const c1 = new CellWriteCommand('r0', 'a', 10);
    const c2 = new CellWriteCommand('r0', 'b', 20);
    const comp = new CompositeCommand('cmd.macro', [c1, c2]);
    comp.do(ctx);
    expect(grid.snapshotData()).toEqual([{ a: 10, b: 20 }]);
    comp.undo(ctx);
    expect(grid.snapshotData()).toEqual([{ a: 1, b: 1 }]);
    expect(comp.size).toBe(2);
    expect(comp.footprint).toEqual({ scope: 'structure' });
  });

  it('serialize = 자식 DTO 배열', () => {
    const c1 = new CellWriteCommand('r0', 'a', 10);
    const comp = new CompositeCommand('cmd.macro', [c1]);
    comp.do(ctxOf(new FakeGrid([{ a: 1 }])));
    const dto = comp.serialize();
    expect(dto.kind).toBe('composite');
    expect(Array.isArray(dto.payload)).toBe(true);
    expect((dto.payload as unknown[]).length).toBe(1);
  });
});
