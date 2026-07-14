// ============================================================
// DD-03 §2.4 CellErrorBoundary + StageCircuitBreaker — 셀단위 격리·회로차단
// REQ-T3-819 / T4-810 / TX-840: 한 셀/단계의 예외가 다른 셀·행·그리드 전체를 죽이지 않게 격리하고,
// 반복 실패 provider 를 회로차단(open)해 폭주를 막는다. 관측성 onTrip/onError 이벤트 방출.
// 헤드리스·순수(DOM 접근 0).
// ============================================================

/** guard/circuit 이 다루는 스코프(진단 좌표). / Scope handled by guard/circuit (diagnostic coords). */
export interface StageScope {
  readonly stageId: string;
  readonly ri: number;
  readonly ci: number;
}

/**
 * 단계 회로차단기. N회 연속 실패 → open. open 이면 이후 프레임에서 호출 자체를 skip(폭주 차단).
 * 성공 1회 → 실패 카운트 리셋(닫힘 복귀). onTrip 으로 관측성 이벤트 방출(REQ-T3-819).
 * / Stage circuit breaker. N consecutive failures → open; while open, callers skip the stage.
 * One success resets the failure count (closes). Emits onTrip for observability.
 */
export class StageCircuitBreaker {
  private _fails = new Map<string, number>();
  private _open = new Set<string>();
  private _tripCbs: Array<(stageId: string) => void> = [];
  private readonly _threshold: number;

  /**
   * @param threshold - open 으로 넘어가는 연속 실패 임계(기본 3) / Consecutive-failure threshold (default 3)
   */
  constructor(threshold = 3) {
    this._threshold = Math.max(1, threshold);
  }

  /**
   * 단계 실행 결과 기록. 실패 누적이 임계 도달 시 open + onTrip. 성공은 카운트 리셋.
   * / Record a stage outcome. Trips open + onTrip when failures hit threshold; success resets.
   *
   * @param stageId - 단계 id / Stage id
   * @param ok - 성공 여부 / Whether it succeeded
   */
  record(stageId: string, ok: boolean): void {
    if (ok) {
      this._fails.delete(stageId);
      return;
    }
    const n = (this._fails.get(stageId) ?? 0) + 1;
    this._fails.set(stageId, n);
    if (n >= this._threshold && !this._open.has(stageId)) {
      this._open.add(stageId);
      for (const cb of this._tripCbs) {
        try { cb(stageId); } catch { /* 관측성 콜백 예외는 무시(격리) */ }
      }
    }
  }

  /** open(차단) 상태인가 — open 이면 호출측이 단계를 skip. / Whether open (callers skip the stage). */
  isOpen(stageId: string): boolean {
    return this._open.has(stageId);
  }

  /** 특정 단계 회로를 수동 리셋(닫힘). / Manually reset a stage's circuit (close). */
  reset(stageId: string): void {
    this._open.delete(stageId);
    this._fails.delete(stageId);
  }

  /**
   * 회로 open 관측성 콜백 등록(텔레메트리·경고 UI). / Register an on-trip observability callback.
   *
   * @param cb - open 될 때 호출 / Called when a circuit trips open
   */
  onTrip(cb: (stageId: string) => void): void {
    this._tripCbs.push(cb);
  }
}

/**
 * 셀단위 오류 경계. fn 을 try/catch 로 감싸 예외 시 fallback 을 반환(never throw to host).
 * 예외는 onError 로 관측만 하고 삼킨다 — 그 셀·단계만 격리, 다른 셀/행/그리드는 무영향.
 * / Cell-level error boundary. Wraps fn in try/catch, returning fallback on throw (never throws to
 * host). Exceptions are observed via onError and swallowed — isolating that cell/stage only.
 */
export class CellErrorBoundary {
  private _errCbs: Array<(scope: StageScope, err: unknown) => void> = [];

  /**
   * fn 을 격리 실행. 예외 시 onError 방출 후 fallback 반환.
   * / Run fn in isolation. On throw, emit onError then return fallback.
   *
   * @param scope - 진단 스코프 / Diagnostic scope
   * @param fn - 실행 함수 / Function to run
   * @param fallback - 실패 시 반환값 / Value returned on failure
   * @returns fn 결과 또는 fallback / fn's result, or fallback
   */
  guard<R>(scope: StageScope, fn: () => R, fallback: R): R {
    try {
      return fn();
    } catch (err) {
      for (const cb of this._errCbs) {
        try { cb(scope, err); } catch { /* 관측성 콜백 예외는 무시 */ }
      }
      return fallback;
    }
  }

  /**
   * 격리된 예외 관측성 콜백 등록. / Register an observability callback for isolated exceptions.
   *
   * @param cb - 예외 발생 시 호출 / Called on an isolated exception
   */
  onError(cb: (scope: StageScope, err: unknown) => void): void {
    this._errCbs.push(cb);
  }
}
