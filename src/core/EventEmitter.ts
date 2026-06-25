type Handler = (...args: any[]) => any;

interface ListenerEntry {
  handler: Handler;
  once: boolean;
}

export class EventEmitter {
  private listeners: Map<string, ListenerEntry[]> = new Map();

  on(event: string, handler: Handler): this {
    const list = this.listeners.get(event) ?? [];
    list.push({ handler, once: false });
    this.listeners.set(event, list);
    return this;
  }

  once(event: string, handler: Handler): this {
    const list = this.listeners.get(event) ?? [];
    list.push({ handler, once: true });
    this.listeners.set(event, list);
    return this;
  }

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

  removeAllListeners(event?: string): this {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
