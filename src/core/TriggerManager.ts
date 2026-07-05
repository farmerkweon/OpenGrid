import type { TriggerContext, TriggerHandler, TriggerEvent } from './types.js';

/**
 * before/after 트리거 훅 레지스트리. / Registry for before/after trigger hooks.
 *
 * 그리드 연산(`operation`) 앞뒤로 사용자 핸들러를 실행한다. `before:*` 훅은
 * 컨텍스트를 `cancel()` 하여 연산을 취소할 수 있고, `after:*` 훅 뒤에는 `complete`
 * 훅이 추가로 실행된다.
 * / Runs user handlers around grid operations. A `before:*` hook may cancel the
 * operation via `ctx.cancel()`; after any `after:*` hook, registered `complete`
 * hooks also fire.
 */
export class TriggerManager {
  private _triggers = new Map<string, TriggerHandler[]>();

  /**
   * 트리거 이벤트에 핸들러를 등록한다. / Register a handler for a trigger event.
   *
   * @param event - 트리거 이벤트명(예: `before:setValue`) / Trigger event name (e.g. `before:setValue`)
   * @param handler - 실행할 핸들러 / Handler to run
   */
  add(event: TriggerEvent | string, handler: TriggerHandler): void {
    if (!this._triggers.has(event)) this._triggers.set(event, []);
    this._triggers.get(event)!.push(handler);
  }

  /**
   * 등록된 핸들러를 제거한다. / Remove a previously registered handler.
   *
   * @param event - 트리거 이벤트명 / Trigger event name
   * @param handler - 제거할 핸들러(등록 시와 동일 참조) / Handler to remove (same reference used at registration)
   */
  remove(event: TriggerEvent | string, handler: TriggerHandler): void {
    const arr = this._triggers.get(event);
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  /**
   * 특정 이벤트 또는 전체 트리거를 해제한다. / Clear one event's triggers, or all of them.
   *
   * @param event - 지우려는 이벤트명. 생략하면 전체 삭제 / Event to clear; omit to clear everything
   */
  clear(event?: TriggerEvent | string): void {
    if (event) this._triggers.delete(event);
    else this._triggers.clear();
  }

  /**
   * 트리거 실행용 컨텍스트 객체를 생성한다. / Build a context object for trigger execution.
   *
   * @param operation - 연산 이름 / Operation name
   * @param args - 연산 인자 배열 / Operation argument array
   * @returns `cancel()` 로 취소 가능한 트리거 컨텍스트 / A trigger context cancellable via `cancel()`
   */
  mkCtx(operation: string, args: any[]): TriggerContext {
    let _cancelled = false;
    return {
      operation, args, result: undefined, extra: {},
      timestamp: Date.now(),
      get cancelled() { return _cancelled; },
      cancel() { _cancelled = true; },
    };
  }

  /**
   * 이벤트에 등록된 핸들러를 순차 실행한다. / Run handlers registered for an event, in order.
   *
   * `before:*` 훅 중 하나라도 `ctx.cancel()` 을 호출하면 즉시 중단하고 `false` 를
   * 반환한다. `after:*` 이벤트는 완료 후 `complete` 훅도 실행한다.
   * / If any `before:*` hook calls `ctx.cancel()`, execution stops immediately and
   * returns `false`. For `after:*` events, `complete` hooks also run afterward.
   *
   * @param event - 실행할 이벤트명 / Event name to run
   * @param ctx - 트리거 컨텍스트 / Trigger context
   * @returns 취소되지 않았으면 `true` / `true` unless the operation was cancelled
   */
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
