// ============================================================
// DD-07 §2.4 신선도 시계 — lastReceivedAt 기준 fresh/stale 파생. / DD-07 §2.4 freshness clock.
// REQ: T7-810 (신선도) · REQ-RT-806 (연결/신선도 UX)
// ------------------------------------------------------------
// 소스→표시 흐름의 단일 시효 규칙(값객체). 연결과 독립 — 열려 있어도 stale 가능(수신 정지).
// 순수: now 주입(테스트 결정론). 배지 UI(DD-11/12)는 compute()/onChange 를 읽기만.
// ============================================================

export type FreshnessState = 'fresh' | 'stale';

export interface FreshnessSnapshot {
  readonly state: FreshnessState;
  readonly ageMs: number;
  readonly lastReceivedAt?: number;
}

export interface FreshnessConfig {
  readonly staleAfterMs: number;
  readonly now?: () => number;
}

/**
 * 신선도 시효 파생. markReceived 로 시계 리셋, compute 로 현재 파생값, onChange 로 전이 통지.
 * / Freshness derivation: markReceived resets, compute derives, onChange notifies transitions.
 */
export class FreshnessClock {
  private readonly _staleAfterMs: number;
  private readonly _now: () => number;
  private _lastReceivedAt: number | undefined;
  private _lastState: FreshnessState = 'stale'; // 수신 전 = stale(신선도 미확립). / Pre-receive = stale.
  private readonly _listeners = new Set<(f: FreshnessSnapshot) => void>();

  constructor(cfg: FreshnessConfig) {
    this._staleAfterMs = cfg.staleAfterMs;
    this._now = cfg.now ?? (() => Date.now());
  }

  /** 성공 수신 기록 — 시계 리셋(fresh 로 전이 가능). / Record a successful receive. */
  markReceived(at: number): void {
    this._lastReceivedAt = at;
    this._emitIfChanged();
  }

  /** 현재 신선도 상태 파생값. / Current derived freshness. */
  compute(): FreshnessSnapshot {
    const now = this._now();
    if (this._lastReceivedAt === undefined) {
      return { state: 'stale', ageMs: Infinity };
    }
    const ageMs = now - this._lastReceivedAt;
    const state: FreshnessState = ageMs > this._staleAfterMs ? 'stale' : 'fresh';
    return { state, ageMs, lastReceivedAt: this._lastReceivedAt };
  }

  /**
   * 신선도 전이 재평가 트리거(시간 경과는 외부 tick 이 호출 — RT 는 전역 타이머 미소유).
   * 배지가 주기 폴하거나 연결/수신 이벤트 시 호출. 전이가 있으면 onChange 발화.
   * / Re-evaluate freshness (driven by an external tick — RT owns no global timer).
   */
  tick(): FreshnessSnapshot {
    return this._emitIfChanged();
  }

  private _emitIfChanged(): FreshnessSnapshot {
    const snap = this.compute();
    if (snap.state !== this._lastState) {
      this._lastState = snap.state;
      for (const l of this._listeners) l(snap);
    }
    return snap;
  }

  onChange(l: (f: FreshnessSnapshot) => void): () => void {
    this._listeners.add(l);
    return () => this._listeners.delete(l);
  }
}
