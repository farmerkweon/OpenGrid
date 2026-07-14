// ============================================================
// DD-02 §2.4 되먹임 차단 계약 / DD-02 §2.4 resize-feedback governor
// REQ-T8-871(리사이즈 되먹임)·T3-816(재진입·진동 0)·T8-872(height 0/unbounded 클램프).
// 3중 방벽: ①minDeltaPx 미만 무시 ②프레임 재진입 가드 ③A→B→A 진동 검출.
// 순수 판정 로직(DOM 미접근) — 관측 크기는 shell 이 주입.
// ============================================================
import { px, type Px } from './types.js';

/** admit 판정 결과. / Result of an admit decision. */
export type ResizeDecision =
  | { kind: 'apply'; height: Px; width: Px; clamped: boolean }
  | { kind: 'ignore'; reason: 'below-threshold' | 'reentrant' | 'oscillation' | 'coalesced' };

/** governor 통계(회귀 게이트가 pull). / Governor stats (pulled by regression gate). */
export interface ResizeStats {
  readonly passesThisFrame: number;
  readonly oscillationDetected: boolean;
  readonly lastConvergedInPasses: number;
}

const RING_CAP = 8;

/**
 * ResizeObserver 되먹임 차단 계약. 순수 판정(임계값·재진입·진동·클램프).
 * / Guarded governor for resize feedback. Pure decisions (threshold, reentrancy, oscillation, clamp).
 */
export class ResizeGovernor {
  private readonly _minDeltaPx: number;
  private readonly _maxPassesPerFrame: number;
  private readonly _fallback: number;

  private _last: { height: number; width: number } | null = null;
  private _passesThisFrame = 0;
  private _oscillationDetected = false;
  private _lastConvergedInPasses = 0;
  private readonly _ring: number[] = []; // 최근 apply 된 height 링버퍼

  /**
   * @param opts.minDeltaPx 크기 변화 임계값(기본 1px) / size-change threshold
   * @param opts.maxPassesPerFrame 프레임당 재계산 상한(기본 1) / recompute cap per frame
   * @param opts.fallbackViewportHeight 언바운드/0 클램프 목표 / clamp target for unbounded/0
   */
  constructor(opts: { minDeltaPx?: Px; maxPassesPerFrame?: number; fallbackViewportHeight: Px }) {
    this._minDeltaPx = Math.max(0, opts.minDeltaPx ?? 1);
    this._maxPassesPerFrame = Math.max(1, Math.floor(opts.maxPassesPerFrame ?? 1));
    this._fallback = Math.max(1, opts.fallbackViewportHeight);
  }

  /** 관측 크기 유입 → 반영해도 되는지 판정(진동·재진입 차단). / Admit an observed box. */
  admit(box: { height: number; width: number }): ResizeDecision {
    // ② 프레임 재진입 가드 — 같은 프레임 상한 초과.
    if (this._passesThisFrame >= this._maxPassesPerFrame) {
      return { kind: 'ignore', reason: 'reentrant' };
    }

    // 언바운드/0/무한 감지 → fallback 클램프(경고 아닌 동작 계약).
    const rawH = box.height;
    const unbounded = !Number.isFinite(rawH) || rawH <= 0;
    const height = unbounded ? this._fallback : rawH;
    const clamped = unbounded;

    const rawW = box.width;
    const width = Number.isFinite(rawW) && rawW >= 0 ? rawW : (this._last?.width ?? 0);

    // ① 임계값 — 첫 유입은 항상 반영.
    if (this._last !== null) {
      const dh = Math.abs(height - this._last.height);
      const dw = Math.abs(width - this._last.width);
      if (dh < this._minDeltaPx && dw < this._minDeltaPx) {
        return { kind: 'ignore', reason: 'below-threshold' };
      }
    }

    // ③ A→B→A 진동 검출 — 직전과 다르나 2-back 과 동일하면 순환.
    const n = this._ring.length;
    if (n >= 2 && this._ring[n - 2] === height && this._ring[n - 1] !== height) {
      this._oscillationDetected = true;
      return { kind: 'ignore', reason: 'oscillation' };
    }

    // 정상/클램프 반영.
    this._passesThisFrame++;
    this._lastConvergedInPasses = this._passesThisFrame;
    this._last = { height, width };
    this._ring.push(height);
    if (this._ring.length > RING_CAP) this._ring.shift();
    return { kind: 'apply', height: px(height), width: px(width), clamped };
  }

  /** 프레임 경계 — 재진입/패스 카운터·진동 플래그 리셋. shell 이 rAF 마다 호출. / Frame boundary reset. */
  beginFrame(): void {
    this._passesThisFrame = 0;
    this._oscillationDetected = false;
  }

  /** 진동 감지·수렴 통계(회귀 게이트가 pull). / Convergence/oscillation stats. */
  stats(): ResizeStats {
    return {
      passesThisFrame: this._passesThisFrame,
      oscillationDetected: this._oscillationDetected,
      lastConvergedInPasses: this._lastConvergedInPasses,
    };
  }
}
