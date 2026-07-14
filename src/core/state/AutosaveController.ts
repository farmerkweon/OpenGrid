// ============================================================
// DD-09 §2.6 AutosaveController — RPO 자동저장 스케줄러·크래시 복구·초안 충돌
// / DD-09 §2.6 AutosaveController — RPO autosave scheduler / crash recovery / draft conflict.
// REQ: T8-819 · T8-820
// ------------------------------------------------------------
// CommandBus 'command' 구독: 조작 수(N) 또는 시간(≤30s) 임계 도달 시 저장(RPO 수치 계약). 저장 전
// MultiTabGuard 로 충돌 검사(조용한 클로버 차단). 크래시 후 초안은 자동 덮어쓰기 없이 발견만 보고
// (복원/버림/비교 UI 계약).
// ============================================================

import type { StateCodec } from './StateCodec.js';
import type { IStatePersistence, PersistedRecord } from './IStatePersistence.js';
import type { MultiTabGuard, TabConflictNotice } from './MultiTabGuard.js';

/** RPO 수치 계약. / RPO numeric contract. */
export interface AutosavePolicy {
  /** ≤ 30_000 (수용기준). / Max interval between saves (acceptance: ≤ 30s). */
  readonly maxIntervalMs: number;
  /** N 조작마다 저장. / Save every N ops. */
  readonly maxOpsBetweenSaves: number;
}

/** 초안↔현재 충돌 해소(조용히 덮지 않음 — 복원/버림/비교). / Draft-vs-current resolution (never silent overwrite). */
export interface DraftStatus {
  readonly hasDraft: boolean;
  readonly draftSavedAt?: number;
  readonly loadedRevision?: number;
  /** 초안 채택(setState). / Adopt the draft. */
  restore(): void;
  /** 초안 버림. / Discard the draft. */
  discard(): void;
  /** 비교(무엇이 다른지 — 섹션 키). / Diff (which sections differ). */
  diff(): DraftDiff;
}

export interface DraftDiff {
  readonly changedSections: string[];
}

export interface AutosaveControllerConfig {
  readonly docId: string;
  readonly codec: StateCodec;
  readonly store: IStatePersistence;
  readonly policy: AutosavePolicy;
  readonly tabId?: string;
  readonly guard?: MultiTabGuard;
  readonly now?: () => number;
  /** 저장 전 충돌 시 호출(조용한 클로버 대신 표면화). / Called on pre-save conflict (surface instead of clobber). */
  readonly onConflict?: (notice: PersistedRecord) => void;
}

const EMPTY_DRAFT: DraftStatus = {
  hasDraft: false,
  restore: () => {},
  discard: () => {},
  diff: () => ({ changedSections: [] }),
};

/** RPO 계약을 강제하는 자동저장 스케줄러. / Autosave scheduler enforcing the RPO contract. */
export class AutosaveController {
  private readonly _cfg: AutosaveControllerConfig;
  private readonly _now: () => number;
  private readonly _tabId: string;

  private _opsSinceSave = 0;
  private _lastSaveAt: number;
  private _baseRevision = -1;
  private _saveCount = 0;

  constructor(cfg: AutosaveControllerConfig) {
    this._cfg = cfg;
    this._now = cfg.now ?? (() => Date.now());
    this._tabId = cfg.tabId ?? 'tab';
    this._lastSaveAt = this._now();
  }

  /** CommandBus 'command' 구독점: 임계 도달 시 저장. / Subscription point for CommandBus 'command'. */
  onCommand(): void {
    this._opsSinceSave++;
    if (this._shouldSave()) void this.flush();
  }

  private _shouldSave(): boolean {
    return (
      this._opsSinceSave >= this._cfg.policy.maxOpsBetweenSaves ||
      this._now() - this._lastSaveAt >= this._cfg.policy.maxIntervalMs
    );
  }

  /** 강제 저장(언로드 직전 beforeunload 등). 충돌 시 저장 생략 + onConflict. / Force a save; skip on conflict. */
  async flush(): Promise<boolean> {
    const env = this._cfg.codec.getState();
    if (this._cfg.guard) {
      const c = this._cfg.guard.checkBeforeSave(this._baseRevision);
      if (c !== 'ok') {
        this._cfg.onConflict?.(c.conflict);
        return false;
      }
    }
    const rec: PersistedRecord = {
      env,
      tabId: this._tabId,
      revision: env.revision,
      savedAt: env.savedAt,
    };
    await this._cfg.store.save(this._cfg.docId, rec);
    this._baseRevision = env.revision;
    this._cfg.guard?.observe(rec);
    this._opsSinceSave = 0;
    this._lastSaveAt = this._now();
    this._saveCount++;
    return true;
  }

  /**
   * 크래시 복구: 초안 존재 시 로드하지 않고 '초안 발견' 보고(자동 덮어쓰기 금지).
   * restore()/discard()/diff() 로 호스트가 결정한다.
   * / Crash recovery: reports a found draft without loading it (no auto-overwrite).
   */
  async detectDraft(): Promise<DraftStatus> {
    const rec = await this._cfg.store.load(this._cfg.docId);
    if (!rec) return EMPTY_DRAFT;
    const codec = this._cfg.codec;
    const current = codec.getState();
    return {
      hasDraft: true,
      draftSavedAt: rec.savedAt,
      loadedRevision: rec.revision,
      restore: () => {
        codec.setState(rec.env);
      },
      discard: () => {},
      diff: () => ({ changedSections: codec.roundTripEquals(current, rec.env).diffs }),
    };
  }

  /** 다른 탭 저장 통지 처리(멀티탭 §2.7). / Handle another tab's save notice (multi-tab §2.7). */
  onExternalSave(rec: PersistedRecord): TabConflictNotice | null {
    return this._cfg.guard?.onExternalSave(rec) ?? null;
  }

  get saveCount(): number {
    return this._saveCount;
  }
  get opsSinceSave(): number {
    return this._opsSinceSave;
  }
  get baseRevision(): number {
    return this._baseRevision;
  }
}
