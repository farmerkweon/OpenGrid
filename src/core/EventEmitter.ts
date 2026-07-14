type Handler = (...args: any[]) => any;

interface ListenerEntry {
  handler: Handler;
  once: boolean;
}

/**
 * 최소 이벤트 발행/구독 허브. / Minimal publish/subscribe event hub.
 *
 * 그리드 코어 전반의 이벤트 배선에 쓰이는 경량 emitter. 모든 등록 메서드는
 * 체이닝을 위해 `this` 를 반환한다.
 * / Lightweight emitter used across the grid core for event wiring. Registration
 *   methods return `this` for chaining.
 *
 * @example
 * const bus = new EventEmitter();
 * bus.on('dataChange', () => render()).emit('dataChange');
 */
export class EventEmitter {
  private listeners: Map<string, ListenerEntry[]> = new Map();

  /**
   * 이벤트 핸들러 등록(반복 호출). / Register a handler for an event (fires repeatedly).
   *
   * @param event - 이벤트 이름 / Event name
   * @param handler - 발화 시 호출될 콜백 / Callback invoked on emit
   * @returns 체이닝용 this / this, for chaining
   */
  on(event: string, handler: Handler): this {
    const list = this.listeners.get(event) ?? [];
    list.push({ handler, once: false });
    this.listeners.set(event, list);
    return this;
  }

  /**
   * 1회성 이벤트 핸들러 등록(발화 후 자동 제거). / Register a one-shot handler (auto-removed after first emit).
   *
   * @param event - 이벤트 이름 / Event name
   * @param handler - 한 번만 호출될 콜백 / Callback invoked exactly once
   * @returns 체이닝용 this / this, for chaining
   */
  once(event: string, handler: Handler): this {
    const list = this.listeners.get(event) ?? [];
    list.push({ handler, once: true });
    this.listeners.set(event, list);
    return this;
  }

  /**
   * 핸들러 해제. handler 미지정 시 해당 이벤트의 모든 핸들러 제거.
   * / Remove a handler. When `handler` is omitted, removes all handlers for the event.
   *
   * @param event - 이벤트 이름 / Event name
   * @param handler - 제거할 특정 핸들러(생략 시 전체) / Specific handler to remove (omit for all)
   * @returns 체이닝용 this / this, for chaining
   */
  off(event: string, handler?: Handler): this {
    if (!handler) {
      this.listeners.delete(event);
      return this;
    }
    const list = this.listeners.get(event);
    if (list) {
      const filtered = list.filter(e => e.handler !== handler);
      if (filtered.length === 0) this.listeners.delete(event);
      else this.listeners.set(event, filtered);
    }
    return this;
  }

  /**
   * 이벤트 발화 — 등록된 모든 핸들러를 순서대로 호출. / Emit an event — invokes all registered handlers in order.
   *
   * @param event - 이벤트 이름 / Event name
   * @param args - 핸들러에 전달할 인자 / Arguments passed to handlers
   * @returns 호출된 핸들러가 하나 이상이면 true / true if at least one handler was invoked
   */
  emit(event: string, ...args: any[]): boolean {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return false;

    const remaining: ListenerEntry[] = [];
    for (const entry of list) {
      entry.handler(...args);
      if (!entry.once) remaining.push(entry);
    }

    if (remaining.length !== list.length) {
      if (remaining.length === 0) this.listeners.delete(event);
      else this.listeners.set(event, remaining);
    }
    return true;
  }

  /**
   * 핸들러 일괄 제거. event 지정 시 해당 이벤트만, 미지정 시 전체.
   * / Remove handlers in bulk — a single event when given, otherwise all.
   *
   * @param event - 비울 이벤트 이름(생략 시 전체) / Event to clear (omit for all)
   * @returns 체이닝용 this / this, for chaining
   */
  removeAllListeners(event?: string): this {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }

  /**
   * 특정 이벤트에 등록된 핸들러 수 반환. / Return the number of handlers registered for an event.
   *
   * @param event - 이벤트 이름 / Event name
   * @returns 등록된 핸들러 개수 / Count of registered handlers
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
