// ============================================================
// DD-09 §2.4 CellWriteCommand — 셀 쓰기 커맨드(Memento-in-Command·연속타이핑 coalesce)
// / DD-09 §2.4 cell-write command (Memento-in-Command; coalesces consecutive typing).
// REQ: T8-895 · TX-892
// ------------------------------------------------------------
// do 가 자기 old 값을 do 시점에 포획(inverse) → undo 는 그 old 로 되쓴다(불변식 §2). 좌표는 rowId 로
// 앵커하고 실행 시점에 index 로 해소(구조 변경에 안전). 같은 (rowId,field) 연속 쓰기는 coalesce 로
// 하나의 undo 단위(최초 old 보존, 리스크2 골든).
// ============================================================

import type { ICommand, ICommandCtx, CommandDTO, CommandFootprint } from '../ICommand.js';

/**
 * 셀 하나에 값을 쓰는 커맨드. `old` 를 주면 이미 포획된 것으로 간주(coalesce 병합 산출물).
 * / Writes a value to a single cell. If `old` is supplied it is treated as already captured
 * (produced by a coalesce merge).
 */
export class CellWriteCommand<T = any> implements ICommand<T> {
  readonly spi = 'command' as const;
  readonly kind = 'cell.write';
  readonly label = 'cmd.cellWrite';

  private _old: unknown;
  private _captured: boolean;
  private _at = 0;

  constructor(
    readonly rowId: string,
    readonly field: string,
    readonly newValue: unknown,
    old?: { readonly value: unknown },
  ) {
    if (old) {
      this._old = old.value;
      this._captured = true;
    } else {
      this._captured = false;
    }
  }

  get footprint(): CommandFootprint {
    return { scope: 'cell', rowId: this.rowId, field: this.field };
  }

  do(ctx: ICommandCtx<T>): void {
    this._at = ctx.clock.now();
    if (!this._captured) {
      this._old = ctx.coords.getCellValue(this.rowId, this.field);
      this._captured = true;
    }
    const ri = ctx.coords.indexOf(this.rowId);
    if (ri < 0) return;
    ctx.mutation.writeCell(ri, this.field, this.newValue);
  }

  undo(ctx: ICommandCtx<T>): void {
    const ri = ctx.coords.indexOf(this.rowId);
    if (ri < 0) return;
    ctx.mutation.writeCell(ri, this.field, this._old);
  }

  /**
   * 같은 (rowId,field) CellWrite 면 병합: old 는 '나의 최초 old', new 는 'next 의 new'.
   * undo 하면 최초 old 로 한 번에 복원(불변식 §2).
   * / Merge with a next CellWrite on the same (rowId,field): keep my original old, take next's new.
   */
  coalesce(next: ICommand<T>): ICommand<T> | null {
    if (!(next instanceof CellWriteCommand)) return null;
    if (next.rowId !== this.rowId || next.field !== this.field) return null;
    const merged = new CellWriteCommand<T>(this.rowId, this.field, next.newValue, { value: this._old });
    merged._at = this._at;
    return merged;
  }

  serialize(): CommandDTO {
    return {
      kind: this.kind,
      payload: { rowId: this.rowId, field: this.field, newValue: this.newValue, oldValue: this._old },
      at: this._at,
    };
  }
}

/** DTO payload → CellWriteCommand(직렬화 복원). / Rehydrate a CellWriteCommand from a DTO payload. */
export function cellWriteFromPayload<T = any>(payload: unknown): CellWriteCommand<T> {
  const p = (payload ?? {}) as { rowId: string; field: string; newValue: unknown; oldValue?: unknown };
  return new CellWriteCommand<T>(p.rowId, p.field, p.newValue, { value: p.oldValue });
}
