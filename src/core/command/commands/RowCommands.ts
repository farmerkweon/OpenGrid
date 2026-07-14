// ============================================================
// DD-09 §3.2 구조 변경 커맨드 — RowInsert/RowDelete(stable rowId 앵커 undo)
// / DD-09 §3.2 structural commands — RowInsert/RowDelete (stable-rowId-anchored undo).
// REQ: T8-895
// ------------------------------------------------------------
// RowDelete 는 삭제 전 rowId + 행 스냅샷(값)을 inverse 로 동결(flat index 는 삭제 후 흔들리므로 절대
// 저장 안 함) → undo 는 그 순서·값으로 재삽입. RowInsert 는 do 후 부여된 rowId 를 잡아 undo 로 삭제.
// ============================================================

import type { ICommand, ICommandCtx, CommandDTO, CommandFootprint } from '../ICommand.js';

/** 행 하나를 삽입하는 커맨드. undo 는 do 가 부여받은 rowId 로 그 행을 삭제. / Insert a single row. */
export class RowInsertCommand<T = any> implements ICommand<T> {
  readonly spi = 'command' as const;
  readonly kind = 'row.insert';
  readonly label = 'cmd.rowInsert';

  private _rowId: string | undefined;
  private _at = 0;

  constructor(
    readonly item: Partial<T>,
    readonly position: number | 'first' | 'last' = 'last',
  ) {}

  get footprint(): CommandFootprint {
    return this._rowId != null ? { scope: 'row', rowIds: [this._rowId] } : { scope: 'structure' };
  }

  do(ctx: ICommandCtx<T>): void {
    this._at = ctx.clock.now();
    const before = ctx.coords.rowCount();
    const idx =
      this.position === 'last' ? before : this.position === 'first' ? 0 : Math.max(0, Math.min(this.position, before));
    ctx.mutation.insertRow(this.item, this.position);
    this._rowId = ctx.coords.rowIdAt(idx);
  }

  undo(ctx: ICommandCtx<T>): void {
    if (this._rowId == null) return;
    const ri = ctx.coords.indexOf(this._rowId);
    if (ri < 0) return;
    ctx.mutation.deleteRows([ri]);
  }

  serialize(): CommandDTO {
    return { kind: this.kind, payload: { item: this.item, position: this.position, rowId: this._rowId }, at: this._at };
  }
}

/** DTO payload → RowInsertCommand. / Rehydrate a RowInsertCommand from a DTO payload. */
export function rowInsertFromPayload<T = any>(payload: unknown): RowInsertCommand<T> {
  const p = (payload ?? {}) as { item: Partial<T>; position?: number | 'first' | 'last' };
  return new RowInsertCommand<T>(p.item, p.position ?? 'last');
}

interface RemovedRow {
  readonly rowId: string;
  readonly index: number;
  readonly snapshot: Record<string, unknown>;
}

/**
 * 하나 이상의 행을 제거하는 커맨드. do 는 삭제 전 rowId·index·스냅샷을 동결, undo 는 원래 index 오름차순으로
 * 스냅샷을 재삽입(각 삽입이 뒤 index 를 밀어 위치 정합).
 * / Deletes one or more rows. do freezes rowId/index/snapshot before removal; undo reinserts by
 * ascending original index (each insert shifts later indices back into place).
 */
export class RowDeleteCommand<T = any> implements ICommand<T> {
  readonly spi = 'command' as const;
  readonly kind = 'row.delete';
  readonly label = 'cmd.rowDelete';

  private _removed: RemovedRow[] = [];
  private _at = 0;

  constructor(readonly indices: readonly number[]) {}

  get footprint(): CommandFootprint {
    return { scope: 'row', rowIds: this._removed.map((r) => r.rowId) };
  }

  do(ctx: ICommandCtx<T>): void {
    this._at = ctx.clock.now();
    const sorted = [...this.indices].sort((a, b) => a - b);
    this._removed = [];
    for (const i of sorted) {
      const rowId = ctx.coords.rowIdAt(i);
      if (rowId == null) continue;
      const snapshot = ctx.coords.getRowSnapshot(rowId) ?? {};
      this._removed.push({ rowId, index: i, snapshot });
    }
    ctx.mutation.deleteRows([...this.indices]);
  }

  undo(ctx: ICommandCtx<T>): void {
    // 원래 index 오름차순으로 재삽입(동결 시 이미 오름차순 수집). / Reinsert ascending by original index.
    for (const r of this._removed) {
      ctx.mutation.insertRow(r.snapshot as Partial<T>, r.index);
    }
  }

  serialize(): CommandDTO {
    return { kind: this.kind, payload: { removed: this._removed }, at: this._at };
  }
}

/** DTO payload → RowDeleteCommand(복원). 재삽입 스냅샷을 그대로 싣는다. / Rehydrate a RowDeleteCommand. */
export function rowDeleteFromPayload<T = any>(payload: unknown): RowDeleteCommand<T> {
  const p = (payload ?? {}) as { removed?: RemovedRow[] };
  const cmd = new RowDeleteCommand<T>((p.removed ?? []).map((r) => r.index));
  // 복원 시 동결분을 주입해 undo 가능하게 한다(교차리뷰: 재생 후 되돌림 지원). / Inject frozen removals so undo works after replay.
  (cmd as unknown as { _removed: RemovedRow[] })._removed = p.removed ?? [];
  return cmd;
}
