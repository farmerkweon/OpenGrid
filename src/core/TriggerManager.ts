import type { TriggerContext, TriggerHandler, TriggerEvent } from './types.js';

export class TriggerManager {
  private _triggers = new Map<string, TriggerHandler[]>();

  add(event: TriggerEvent | string, handler: TriggerHandler): void {
    if (!this._triggers.has(event)) this._triggers.set(event, []);
    this._triggers.get(event)!.push(handler);
  }

  remove(event: TriggerEvent | string, handler: TriggerHandler): void {
    const arr = this._triggers.get(event);
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  clear(event?: TriggerEvent | string): void {
    if (event) this._triggers.delete(event);
    else this._triggers.clear();
  }

  mkCtx(operation: string, args: any[]): TriggerContext {
    let _cancelled = false;
    return {
      operation, args, result: undefined, extra: {},
      timestamp: Date.now(),
      get cancelled() { return _cancelled; },
      cancel() { _cancelled = true; },
    };
  }

  exec(event: string, ctx: TriggerContext): boolean {
    const handlers = this._triggers.get(event) ?? [];
    for (const fn of handlers) {
      fn(ctx);
      if (ctx.cancelled) return false;
    }
    if (event.startsWith('after:')) {
      const completeHandlers = this._triggers.get('complete') ?? [];
      for (const fn of completeHandlers) fn(ctx);
    }
    return true;
  }
}
