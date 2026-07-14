// ============================================================
// DD-09 §2.7 MultiTabGuard — 최종쓰기 충돌 감지(revision 낙관적 잠금·조용한 클로버 차단)
// / DD-09 §2.7 MultiTabGuard — last-write conflict detection (revision optimistic lock).
// REQ: T8-820
// ------------------------------------------------------------
// 저장매체 revision 이 내가 아는 baseRevision 보다 앞서면(다른 탭이 씀) → 조용히 덮지 않고 충돌 신고.
// 다른 탭 저장 통지 수신 시 뒤늦은 탭이 덮기 전에 경고(TabConflictNotice). storage 구독은 어댑터가 공급.
// ============================================================

import type { PersistedRecord } from './IStatePersistence.js';

/** 다른 탭 저장 통지. / Notice of another tab's save. */
export interface TabConflictNotice {
  readonly otherTabId: string;
  readonly otherRevision: number;
  readonly savedAt: number;
}

/**
 * revision 기반 낙관적 잠금. observe/onExternalSave 로 최신 매체 리비전을 추적하고, checkBeforeSave
 * 로 저장 전 충돌을 감지한다. 내 탭(tabId) 저장은 충돌로 보지 않는다.
 * / Revision-based optimistic lock. Tracks the latest media revision via observe/onExternalSave and
 * detects conflicts before a save via checkBeforeSave. My own tab's saves are never conflicts.
 */
export class MultiTabGuard {
  private _latestRevision = -1;
  private _latestRec: PersistedRecord | undefined;

  constructor(private readonly _tabId: string) {}

  get tabId(): string {
    return this._tabId;
  }

  /** 매체에서 관측한 최신 레코드 반영(subscribe 콜백/명시 폴링). / Record the latest observed media state. */
  observe(rec: PersistedRecord): void {
    if (rec.revision > this._latestRevision) {
      this._latestRevision = rec.revision;
      this._latestRec = rec;
    }
  }

  /**
   * 저장 전 충돌 검사: 관측한 최신 리비전이 baseRevision 보다 앞서고 그게 다른 탭 소행이면 충돌.
   * / Pre-save conflict check: conflict if the observed latest revision leads baseRevision and it
   * came from another tab.
   */
  checkBeforeSave(baseRevision: number): 'ok' | { conflict: PersistedRecord } {
    if (this._latestRevision > baseRevision && this._latestRec && this._latestRec.tabId !== this._tabId) {
      return { conflict: this._latestRec };
    }
    return 'ok';
  }

  /** 다른 탭 저장 통지 수신 → 관측 반영 + 경고(내 탭이면 null). / Receive another tab's save notice. */
  onExternalSave(rec: PersistedRecord): TabConflictNotice | null {
    this.observe(rec);
    if (rec.tabId === this._tabId) return null;
    return { otherTabId: rec.tabId, otherRevision: rec.revision, savedAt: rec.savedAt };
  }

  get latestRevision(): number {
    return this._latestRevision;
  }
}
