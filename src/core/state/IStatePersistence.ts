// ============================================================
// DD-09 §2.6 IStatePersistence — 저장 매체 추상화 포트 + 어댑터(InMemory/localStorage)
// / DD-09 §2.6 IStatePersistence — persistence port + adapters (InMemory / localStorage).
// REQ: T8-819 · T8-820
// ------------------------------------------------------------
// 헤드리스 코어는 저장 매체를 참조하지 않는다(Ports & Adapters). 계약만 정하고 구현체는 호스트가 주입.
// InMemory 는 테스트/헤드리스 기본, LocalStorage 는 브라우저 환경(typeof 가드)에서만 동작.
// ============================================================

import type { StateEnvelope } from './StateCodec.js';

/** 저장 레코드 — 봉투 + 탭/리비전 메타. / Persisted record — envelope plus tab/revision metadata. */
export interface PersistedRecord {
  readonly env: StateEnvelope;
  readonly tabId: string;
  readonly revision: number;
  readonly savedAt: number;
}

/** 저장 매체 추상화 포트(구현은 호스트 주입). / Persistence port (host-injected implementation). */
export interface IStatePersistence {
  load(docId: string): Promise<PersistedRecord | null>;
  save(docId: string, rec: PersistedRecord): Promise<void>;
  /** 멀티탭: 다른 탭의 저장 통지 구독. 해제 함수 반환. / Multi-tab: subscribe to other tabs' saves; returns an unsubscribe fn. */
  subscribe(docId: string, cb: (rec: PersistedRecord) => void): () => void;
}

/** 인메모리 어댑터(테스트·헤드리스 기본). 같은 인스턴스 내 subscribe 는 즉시 동기 통지. / In-memory adapter (test/headless default). */
export class InMemoryStatePersistence implements IStatePersistence {
  private readonly _store = new Map<string, PersistedRecord>();
  private readonly _subs = new Map<string, Set<(rec: PersistedRecord) => void>>();

  load(docId: string): Promise<PersistedRecord | null> {
    return Promise.resolve(this._store.get(docId) ?? null);
  }

  save(docId: string, rec: PersistedRecord): Promise<void> {
    this._store.set(docId, rec);
    const subs = this._subs.get(docId);
    if (subs) for (const cb of subs) cb(rec);
    return Promise.resolve();
  }

  subscribe(docId: string, cb: (rec: PersistedRecord) => void): () => void {
    let s = this._subs.get(docId);
    if (!s) {
      s = new Set();
      this._subs.set(docId, s);
    }
    s.add(cb);
    return () => {
      s!.delete(cb);
    };
  }

  /** 테스트 편의: 동기 조회. / Test convenience: synchronous peek. */
  peek(docId: string): PersistedRecord | null {
    return this._store.get(docId) ?? null;
  }
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WindowLike {
  addEventListener(type: 'storage', cb: (e: { key: string | null; newValue: string | null }) => void): void;
  removeEventListener(type: 'storage', cb: (e: { key: string | null; newValue: string | null }) => void): void;
}

/**
 * localStorage 어댑터 — 브라우저 전용. `storage` 이벤트로 다른 탭의 저장을 자연 통지받는다(멀티탭 §2.7).
 * 헤드리스/서버에는 매체가 없으므로 load/save 는 무해히 no-op(주입 매체가 없으면).
 * / localStorage adapter (browser-only). Receives other tabs' saves via the native `storage` event.
 */
export class LocalStorageStatePersistence implements IStatePersistence {
  private readonly _storage: StorageLike | null;
  private readonly _win: WindowLike | null;
  private readonly _prefix: string;

  constructor(opts: { storage?: StorageLike; win?: WindowLike; prefix?: string } = {}) {
    const g = globalThis as unknown as { localStorage?: StorageLike; window?: WindowLike };
    this._storage = opts.storage ?? g.localStorage ?? null;
    this._win = opts.win ?? g.window ?? null;
    this._prefix = opts.prefix ?? 'og:state:';
  }

  private _key(docId: string): string {
    return this._prefix + docId;
  }

  load(docId: string): Promise<PersistedRecord | null> {
    if (!this._storage) return Promise.resolve(null);
    const raw = this._storage.getItem(this._key(docId));
    if (raw == null) return Promise.resolve(null);
    try {
      return Promise.resolve(JSON.parse(raw) as PersistedRecord);
    } catch {
      return Promise.resolve(null);
    }
  }

  save(docId: string, rec: PersistedRecord): Promise<void> {
    this._storage?.setItem(this._key(docId), JSON.stringify(rec));
    return Promise.resolve();
  }

  subscribe(docId: string, cb: (rec: PersistedRecord) => void): () => void {
    if (!this._win) return () => {};
    const key = this._key(docId);
    const handler = (e: { key: string | null; newValue: string | null }): void => {
      if (e.key !== key || e.newValue == null) return;
      try {
        cb(JSON.parse(e.newValue) as PersistedRecord);
      } catch {
        /* 손상 payload 무시(조용한 크래시 방지). */
      }
    };
    this._win.addEventListener('storage', handler);
    return () => this._win!.removeEventListener('storage', handler);
  }
}
