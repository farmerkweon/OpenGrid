// ============================================================
// DD-09 §2.4 CompositeCommand — 매크로·트랜잭션 합성(자식 순서대로 do, 역순 undo)
// / DD-09 §2.4 CompositeCommand — macro/transaction composite (do in order, undo in reverse).
// REQ: T8-895 · TX-892
// ------------------------------------------------------------
// Composite(GoF): 자식 커맨드들을 하나의 undo 단위로 접는다. serialize = 자식 DTO 배열.
// ============================================================

import type { ICommand, ICommandCtx, CommandDTO, CommandFootprint } from '../ICommand.js';

/** 여러 커맨드를 단일 undo 단위로 묶는 합성 커맨드. / Composite command folding many commands into one undo unit. */
export class CompositeCommand<T = any> implements ICommand<T> {
  readonly spi = 'command' as const;
  readonly kind = 'composite';

  private _at = 0;

  constructor(
    readonly label: string,
    private readonly _children: ReadonlyArray<ICommand<T>>,
  ) {}

  /** 매크로는 구조 변경을 포함할 수 있으므로 보수적으로 structure 로 신고(dirty 안전측). / Conservative structure footprint. */
  get footprint(): CommandFootprint {
    return { scope: 'structure' };
  }

  get size(): number {
    return this._children.length;
  }

  get children(): ReadonlyArray<ICommand<T>> {
    return this._children;
  }

  do(ctx: ICommandCtx<T>): void {
    this._at = ctx.clock.now();
    for (const c of this._children) c.do(ctx);
  }

  undo(ctx: ICommandCtx<T>): void {
    for (let i = this._children.length - 1; i >= 0; i--) this._children[i]!.undo(ctx);
  }

  serialize(): CommandDTO {
    return { kind: this.kind, payload: this._children.map((c) => c.serialize()), at: this._at };
  }
}
