// ============================================================
// DD-09 §2.3 CommandBus — 유일한 쓰기 진입점(dispatch·undo·redo·매크로·트랜잭션)
// / DD-09 §2.3 CommandBus — the sole write entry point (dispatch/undo/redo/macro/transact).
// REQ: T8-895 · TX-892
// ------------------------------------------------------------
// 모델을 바꾸는 유일한 방법은 dispatch(cmd)(불변식 §1). dispatch: guard.enter → cmd.do → stack.push
// (coalesce) → audit → dirty → emit('command'). undo/redo 는 스택에서 꺼내 역/정방향 재적용.
// 매크로/트랜잭션은 여러 dispatch 를 하나의 CompositeCommand undo 단위로 접는다.
// ============================================================

import type { ICommand, ICommandCtx } from './ICommand.js';
import { CommandStack } from './CommandStack.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { DefaultAuditLog, DirtyTracker, MutationGuard, type AuditLog } from './support.js';

/** CommandBus 협력자(전부 옵션 — 기본 구현 주입). / CommandBus collaborators (all optional — defaults injected). */
export interface CommandBusDeps<T = any> {
  readonly ctx: ICommandCtx<T>;
  stack?: CommandStack<T>;
  audit?: AuditLog;
  dirty?: DirtyTracker;
  guard?: MutationGuard;
  /** 자동저장/협업/감사 구독 fan-out. / Fan-out for autosave/collaboration/audit subscribers. */
  emit?: (event: 'command', cmd: ICommand<T>) => void;
}

/**
 * 유일한 쓰기 진입점. 이벤트 오케스트레이션(DD-08/896)이 UI 이벤트를 커맨드로 번역해 여기로 보낸다.
 * / The sole write entry point. Event orchestration (DD-08/896) translates UI events into commands here.
 */
export class CommandBus<T = any> {
  private readonly _ctx: ICommandCtx<T>;
  private readonly _stack: CommandStack<T>;
  private readonly _audit: AuditLog;
  private readonly _dirty: DirtyTracker;
  private readonly _guard: MutationGuard;
  private readonly _emit: (event: 'command', cmd: ICommand<T>) => void;

  private _macro: ICommand<T>[] | undefined;
  private _macroLabel = 'cmd.macro';

  constructor(deps: CommandBusDeps<T>) {
    this._ctx = deps.ctx;
    this._stack = deps.stack ?? new CommandStack<T>();
    this._audit = deps.audit ?? new DefaultAuditLog();
    this._dirty = deps.dirty ?? new DirtyTracker();
    this._guard = deps.guard ?? new MutationGuard();
    this._emit = deps.emit ?? (() => {});
  }

  get stack(): CommandStack<T> {
    return this._stack;
  }
  get audit(): AuditLog {
    return this._audit;
  }
  get dirty(): DirtyTracker {
    return this._dirty;
  }
  get guard(): MutationGuard {
    return this._guard;
  }

  /**
   * 커맨드 실행: do → 스택 push(coalesce 시도) → audit → dirty → emit. 매크로 녹화 중이면 스택 대신
   * 프레임에 수집(그대로 실행됨). / Execute a command; while recording a macro, collect into the frame instead of the stack.
   */
  dispatch(cmd: ICommand<T>): void {
    this._guard.enter();
    try {
      cmd.do(this._ctx);
    } finally {
      this._guard.leave();
    }
    if (this._macro) {
      this._macro.push(cmd);
    } else {
      this._stack.push(cmd);
    }
    this._audit.record(cmd.serialize());
    this._dirty.mark(cmd.footprint);
    this._emit('command', cmd);
  }

  /** 되돌리기: 스택에서 꺼내 undo 재적용. / Undo: pop and apply undo. */
  undo(): boolean {
    const c = this._stack.popUndo();
    if (!c) return false;
    this._guard.enter();
    try {
      c.undo(this._ctx);
    } finally {
      this._guard.leave();
    }
    this._audit.record(c.serialize());
    this._dirty.mark(c.footprint);
    this._emit('command', c);
    return true;
  }

  /** 다시하기: 스택에서 꺼내 do 재적용. / Redo: pop and re-apply do. */
  redo(): boolean {
    const c = this._stack.popRedo();
    if (!c) return false;
    this._guard.enter();
    try {
      c.do(this._ctx);
    } finally {
      this._guard.leave();
    }
    this._audit.record(c.serialize());
    this._dirty.mark(c.footprint);
    this._emit('command', c);
    return true;
  }

  canUndo(): boolean {
    return this._stack.canUndo();
  }
  canRedo(): boolean {
    return this._stack.canRedo();
  }

  /** 매크로 녹화 시작 — 이후 dispatch 는 프레임에 수집(실행은 됨). / Begin macro recording. */
  beginMacro(label: string): void {
    this._macroLabel = label;
    this._macro = [];
  }

  /** 매크로 중지 — 수집분을 CompositeCommand 로 접어 단일 undo 단위로 스택에 등록. / End macro; fold into one undo unit. */
  endMacro(): void {
    const frame = this._macro;
    this._macro = undefined;
    if (!frame || frame.length === 0) return;
    const composite = new CompositeCommand<T>(this._macroLabel, frame);
    this._stack.push(composite);
    this._audit.record(composite.serialize());
    this._emit('command', composite);
  }

  /** 트랜잭션 배치 — body 안의 dispatch 를 하나의 undo 단위로. 예외 시에도 endMacro 로 닫는다. / Transaction batch. */
  transact(label: string, body: () => void): void {
    this.beginMacro(label);
    try {
      body();
    } finally {
      this.endMacro();
    }
  }

  /** 녹화 중 여부. / Whether a macro is being recorded. */
  get recording(): boolean {
    return this._macro !== undefined;
  }
}
