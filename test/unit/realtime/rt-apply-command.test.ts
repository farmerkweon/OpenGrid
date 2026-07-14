// DD-07 §2.3 RtApplyCommand — 기존 초크포인트 위임(증분=전체)·appliedDelta·undo·footprint. / DD-07 §2.3.
import { describe, it, expect } from 'vitest';
import { RtApplyCommand } from '../../../src/core/realtime/index.js';
import type { NormalizedBatch } from '../../../src/core/realtime/index.js';
import { FakeModel } from './_helpers.js';

interface T {
  name: string;
  qty: number;
}
const batch = (b: Partial<NormalizedBatch<T>>): NormalizedBatch<T> => ({
  cells: [],
  upserts: [],
  removes: [],
  overflowToNextFrame: false,
  ...b,
});

describe('DD-07 RtApplyCommand — do 가 MutationService 초크포인트로만 적용(TX-807 상속)', () => {
  it('셀 패치는 writeCells 초크포인트 경유(직접 우회 0)', () => {
    const m = new FakeModel([{ id: 'r1', name: 'a', qty: 1 }]);
    const cmd = new RtApplyCommand<T>(batch({ cells: [{ rowId: 'r1', field: 'qty', value: 9 }] }));
    cmd.do(m.ctx());
    expect(m.getCellValue('r1', 'qty')).toBe(9);
    expect(m.writeCallCount).toBe(1); // writeCells 경유
    expect(m.batchDepth).toBe(0); // begin/endBatch 균형
    expect(cmd.appliedDelta!.changedCells).toEqual([{ rowId: 'r1', field: 'qty' }]);
  });

  it('upsert 는 존재 행 병합 / 신규 행 삽입', () => {
    const m = new FakeModel([{ id: 'r1', name: 'a', qty: 1 }]);
    const cmd = new RtApplyCommand<T>(
      batch({
        upserts: [
          { rowId: 'r1', row: { qty: 5 } }, // 병합
          { rowId: 'r2', row: { id: 'r2', name: 'b', qty: 2 } as Partial<T> }, // 삽입
        ],
      }),
    );
    cmd.do(m.ctx());
    expect(m.getCellValue('r1', 'qty')).toBe(5);
    expect(m.indexOf('r2')).toBeGreaterThanOrEqual(0);
    expect(cmd.appliedDelta!.insertedRowIds).toEqual(['r2']);
  });

  it('remove 는 인덱스 내림차순 삭제(shift 안전)', () => {
    const m = new FakeModel([
      { id: 'r1', name: 'a', qty: 1 },
      { id: 'r2', name: 'b', qty: 2 },
      { id: 'r3', name: 'c', qty: 3 },
    ]);
    const cmd = new RtApplyCommand<T>(batch({ removes: ['r1', 'r3'] }));
    cmd.do(m.ctx());
    expect(m.rows.map((r) => r.id)).toEqual(['r2']);
    expect(cmd.appliedDelta!.removedRowIds).toEqual(['r1', 'r3']);
  });

  it('undo 는 포획 inverse 로 셀·삽입·삭제 복원', () => {
    const m = new FakeModel([
      { id: 'r1', name: 'a', qty: 1 },
      { id: 'r2', name: 'b', qty: 2 },
    ]);
    const cmd = new RtApplyCommand<T>(
      batch({
        cells: [{ rowId: 'r1', field: 'qty', value: 99 }],
        upserts: [{ rowId: 'r3', row: { id: 'r3', name: 'c', qty: 3 } as Partial<T> }],
        removes: ['r2'],
      }),
    );
    cmd.do(m.ctx());
    expect(m.rows.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
    cmd.undo(m.ctx());
    expect(m.getCellValue('r1', 'qty')).toBe(1); // 셀 복원
    expect(m.indexOf('r3')).toBe(-1); // 삽입 되돌림
    expect(m.indexOf('r2')).toBeGreaterThanOrEqual(0); // 삭제 복원
  });

  it('footprint — 구조변경/범위/단일 셀 구분', () => {
    expect(new RtApplyCommand<T>(batch({ removes: ['r1'] })).footprint.scope).toBe('structure');
    expect(
      new RtApplyCommand<T>(batch({ cells: [{ rowId: 'r1', field: 'qty', value: 1 }] })).footprint.scope,
    ).toBe('cell');
    expect(
      new RtApplyCommand<T>(
        batch({
          cells: [
            { rowId: 'r1', field: 'qty', value: 1 },
            { rowId: 'r2', field: 'name', value: 'x' },
          ],
        }),
      ).footprint.scope,
    ).toBe('range');
  });

  it('serialize — kind rt.apply + payload 델타 + 동결 시각', () => {
    const m = new FakeModel([{ id: 'r1', name: 'a', qty: 1 }]);
    const cmd = new RtApplyCommand<T>(batch({ cells: [{ rowId: 'r1', field: 'qty', value: 9 }] }));
    cmd.do(m.ctx(() => 4242));
    const dto = cmd.serialize();
    expect(dto.kind).toBe('rt.apply');
    expect(dto.at).toBe(4242);
    expect(cmd.spi).toBe('command');
  });
});
