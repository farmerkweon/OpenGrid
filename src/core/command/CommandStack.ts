// ============================================================
// DD-09 §2.3 CommandStack — undo/redo 이중 스택(coalesce 창·용량 상한·이력 직렬화)
// / DD-09 §2.3 CommandStack — undo/redo double stack (coalesce window, capacity cap, history serialize).
// REQ: T8-895
// ------------------------------------------------------------
// push 는 최근 커맨드와 coalesce 가능(시간 창 내)하면 접고, 새 push 시 redo 스택을 비운다.
// 용량 상한 초과 시 가장 오래된 undo 엔트리를 버린다(메모리 경계).
// ============================================================

import type { ICommand, CommandDTO } from './ICommand.js';

/** CommandStack 구성. / CommandStack configuration. */
export interface CommandStackConfig {
  /** undo 스택 최대 깊이. 기본 200. / Max undo depth. Default 200. */
  capacity?: number;
  /** 인접 coalesce 시간 창(ms). 기본 500. / Adjacency coalesce window (ms). Default 500. */
  coalesceWindowMs?: number;
  /** 시각 소스(테스트 주입). 기본 Date.now. / Time source (test-injectable). Default Date.now. */
  now?: () => number;
}

/** undo/redo 이중 스택. / undo/redo double stack. */
export class CommandStack<T = any> {
  private _undo: ICommand<T>[] = [];
  private _redo: ICommand<T>[] = [];
  private _lastPushAt = -Infinity;
  private readonly _cap: number;
  private readonly _win: number;
  private readonly _now: () => number;

  constructor(cfg: CommandStackConfig = {}) {
    this._cap = cfg.capacity ?? 200;
    this._win = cfg.coalesceWindowMs ?? 500;
    this._now = cfg.now ?? (() => Date.now());
  }

  /**
   * 커맨드를 스택에 올린다. 최근 커맨드와 시간 창 내이고 coalesce 가 병합을 반환하면 접는다.
   * 새 엔트리는 redo 스택을 비운다(분기 방지).
   * / Push a command; fold into the top if within the window and its coalesce returns a merge.
   * A new entry clears the redo stack (no branching).
   */
  push(cmd: ICommand<T>): void {
    const now = this._now();
    const top = this._undo[this._undo.length - 1];
    if (top && typeof top.coalesce === 'function' && now - this._lastPushAt <= this._win) {
      const merged = top.coalesce(cmd);
      if (merged) {
        this._undo[this._undo.length - 1] = merged;
        this._lastPushAt = now;
        this._redo.length = 0;
        return;
      }
    }
    this._undo.push(cmd);
    this._lastPushAt = now;
    this._redo.length = 0;
    if (this._undo.length > this._cap) this._undo.shift();
  }

  /** 최근 undo 엔트리를 꺼내 redo 로 옮긴다(호출자가 undo 실행). / Pop the latest undo entry onto redo. */
  popUndo(): ICommand<T> | null {
    const c = this._undo.pop();
    if (!c) return null;
    this._redo.push(c);
    // 되돌린 직후 새 입력이 방금 undo 된 엔트리와 coalesce 되지 않도록 창을 무효화.
    this._lastPushAt = -Infinity;
    return c;
  }

  /** 최근 redo 엔트리를 꺼내 undo 로 되돌린다(호출자가 do 재실행). / Pop the latest redo entry back onto undo. */
  popRedo(): ICommand<T> | null {
    const c = this._redo.pop();
    if (!c) return null;
    this._undo.push(c);
    this._lastPushAt = -Infinity;
    return c;
  }

  canUndo(): boolean {
    return this._undo.length > 0;
  }

  canRedo(): boolean {
    return this._redo.length > 0;
  }

  clear(): void {
    this._undo.length = 0;
    this._redo.length = 0;
    this._lastPushAt = -Infinity;
  }

  get undoDepth(): number {
    return this._undo.length;
  }

  get redoDepth(): number {
    return this._redo.length;
  }

  /** undo 이력 영속화용 직렬화(선택). / Serialize the undo history (optional persistence). */
  serializeHistory(): CommandDTO[] {
    return this._undo.map((c) => c.serialize());
  }
}
