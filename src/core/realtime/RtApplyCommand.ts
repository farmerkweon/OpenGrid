// ============================================================
// DD-07 §2.3 RT 델타를 접는 비-undoable 백그라운드 커맨드. / DD-07 §2.3 RT background delta command.
// REQ: REQ-RT-802 (증분 라이브반영) · TX-807 (증분=전체 불변식) · R.2 (DD-09 ICommand seam 재사용)
// ------------------------------------------------------------
// RT 는 MutationService 를 직접 우회하지 않는다(DD-09 우회 금지 불변식). 델타를 이 ICommand 로 접어
// dispatchSilent → do 내부가 기존 MutationService.writeCells 초크포인트를 호출 →
// seedFormulaDirty→flushFormula→RecalcCoordinator 증분 무효화(TX-807) 자연 통과.
// 좌표(rowId↔index)는 실행 시점에 ctx.coords 로 해소(구조 변경 안전). 인덱스는 매 op 직전 재해소.
// ============================================================

import type { ICommand, ICommandCtx, CommandDTO, CommandFootprint } from '../command/ICommand.js';
import type { NormalizedBatch } from './BackpressureScheduler.js';
import type { AppliedDelta } from './RtAnnouncePolicy.js';

interface CellInverse {
  rowId: string;
  field: string;
  oldValue: unknown;
}
interface RemovedInverse {
  rowId: string;
  snapshot: Record<string, unknown> | undefined;
}

/**
 * 정규화 배치 1프레임분을 do 시 기존 초크포인트로 적용. 백그라운드(userInitiated=false)·silent.
 * undo 계약은 완결성 위해 구현하나(포획 inverse 복원), RT 경로는 dispatchSilent 로 스택 미적재.
 * / Applies one normalized frame via the existing chokepoint; silent/background, but a well-formed
 * ICommand (undo restores captured inverse). RT dispatches silently (never pushed to the undo stack).
 */
export class RtApplyCommand<T> implements ICommand<T> {
  readonly spi = 'command' as const;
  readonly kind = 'rt.apply';
  readonly label = 'rt.backgroundUpdate';
  readonly footprint: CommandFootprint;

  private readonly _batch: NormalizedBatch<T>;
  private _at = 0;
  private _cellInverse: CellInverse[] = [];
  private _insertedRowIds: string[] = [];
  private _removedInverse: RemovedInverse[] = [];
  private _applied: AppliedDelta | undefined;

  constructor(batch: NormalizedBatch<T>) {
    this._batch = batch;
    this.footprint = RtApplyCommand._footprintOf(batch);
  }

  /** do 이후 적용 요약(상태 복원·SR 규모 요약 입력). / Applied summary after do. */
  get appliedDelta(): AppliedDelta | undefined {
    return this._applied;
  }

  do(ctx: ICommandCtx<T>): void {
    this._at = ctx.clock.now();
    this._cellInverse = [];
    this._insertedRowIds = [];
    this._removedInverse = [];
    const changedCells: { rowId: string; field: string }[] = [];

    ctx.mutation.beginBatch();
    try {
      // ① 셀 패치 — 존재 행만(신규는 upsert 경로). / Cell patches on existing rows.
      const patches: { rowIndex: number; field: string; value: unknown }[] = [];
      for (const c of this._batch.cells) {
        const idx = ctx.coords.indexOf(c.rowId);
        if (idx < 0) continue; // 존재하지 않으면 스킵(스냅샷/upsert 로만 생성). / Skip absent.
        this._cellInverse.push({ rowId: c.rowId, field: c.field, oldValue: ctx.coords.getCellValue(c.rowId, c.field) });
        patches.push({ rowIndex: idx, field: c.field, value: c.value });
        changedCells.push({ rowId: c.rowId, field: c.field });
      }
      if (patches.length > 0) ctx.mutation.writeCells(patches);

      // ② upsert — 존재 시 필드 병합, 없으면 신규 행 삽입. / Upsert: merge existing, insert new.
      for (const u of this._batch.upserts) {
        const idx = ctx.coords.indexOf(u.rowId);
        if (idx >= 0) {
          const mergePatches: { rowIndex: number; field: string; value: unknown }[] = [];
          for (const [field, value] of Object.entries(u.row as Record<string, unknown>)) {
            this._cellInverse.push({ rowId: u.rowId, field, oldValue: ctx.coords.getCellValue(u.rowId, field) });
            mergePatches.push({ rowIndex: idx, field, value });
            changedCells.push({ rowId: u.rowId, field });
          }
          if (mergePatches.length > 0) ctx.mutation.writeCells(mergePatches);
        } else {
          // 통합 TODO: 서버 rowId ↔ 모델 rowId 배정은 DataLayer 소유. 여기선 행 아이템만 삽입.
          ctx.mutation.insertRow(u.row, 'last');
          this._insertedRowIds.push(u.rowId);
        }
      }

      // ③ remove — 인덱스 내림차순으로 삭제(shift 안전). / Remove, descending index (shift-safe).
      const removeTargets: { rowId: string; index: number }[] = [];
      for (const rowId of this._batch.removes) {
        const idx = ctx.coords.indexOf(rowId);
        if (idx < 0) continue;
        this._removedInverse.push({ rowId, snapshot: ctx.coords.getRowSnapshot(rowId) });
        removeTargets.push({ rowId, index: idx });
      }
      if (removeTargets.length > 0) {
        ctx.mutation.deleteRows(removeTargets.sort((a, b) => b.index - a.index).map((r) => r.index));
      }

      this._applied = {
        changedCells,
        insertedRowIds: [...this._insertedRowIds],
        removedRowIds: this._removedInverse.map((r) => r.rowId),
        userInitiated: false,
      };
    } finally {
      ctx.mutation.endBatch();
    }
  }

  /** 완결성용 역적용(RT silent 경로는 호출 안 함). / Inverse (unused on the RT silent path). */
  undo(ctx: ICommandCtx<T>): void {
    ctx.mutation.beginBatch();
    try {
      // 삽입 되돌림. / Undo inserts.
      const insertIdx = this._insertedRowIds
        .map((rowId) => ctx.coords.indexOf(rowId))
        .filter((i) => i >= 0)
        .sort((a, b) => b - a);
      if (insertIdx.length > 0) ctx.mutation.deleteRows(insertIdx);

      // 삭제 복원. / Restore removed rows.
      for (const r of this._removedInverse) {
        if (r.snapshot) ctx.mutation.insertRow(r.snapshot as Partial<T>, 'last');
      }

      // 셀 값 복원. / Restore old cell values.
      const patches: { rowIndex: number; field: string; value: unknown }[] = [];
      for (const inv of this._cellInverse) {
        const idx = ctx.coords.indexOf(inv.rowId);
        if (idx >= 0) patches.push({ rowIndex: idx, field: inv.field, value: inv.oldValue });
      }
      if (patches.length > 0) ctx.mutation.writeCells(patches);
    } finally {
      ctx.mutation.endBatch();
    }
  }

  serialize(): CommandDTO {
    return {
      kind: this.kind,
      payload: {
        cells: this._batch.cells,
        upserts: this._batch.upserts,
        removes: this._batch.removes,
      },
      at: this._at,
    };
  }

  private static _footprintOf<T>(batch: NormalizedBatch<T>): CommandFootprint {
    if (batch.snapshot || batch.upserts.length > 0 || batch.removes.length > 0) {
      return { scope: 'structure' };
    }
    const rowIds = [...new Set(batch.cells.map((c) => c.rowId))];
    const fields = [...new Set(batch.cells.map((c) => c.field as string))];
    if (rowIds.length === 1 && fields.length === 1) {
      return { scope: 'cell', rowId: rowIds[0]!, field: fields[0]! };
    }
    return { scope: 'range', rowIds, fields };
  }
}
