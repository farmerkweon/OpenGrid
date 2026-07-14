// ============================================================
// DD-07 §2.5 실시간 접근성 게이트 — 백그라운드 SR 공지 트리거·규모요약. / DD-07 §2.5 realtime a11y gate.
// REQ: REQ-RT-807 (실시간 SR) · T9-833 / T9-821 (백그라운드 SR)
// ------------------------------------------------------------
// RT 는 "무엇을/언제 공지할지"의 트리거·규모 요약만. 실제 aria-live 리전·병합 큐는 DD-12 소유.
// 규칙: ① userInitiated=false 만 "백그라운드" 라벨 ② 편집/포커스 방해 금지 ③ 고빈도=규모요약(개별 셀 나열 금지)
//       ④ 디바운스로 SR 폭주 차단(윈도우 내 누적→1회 요약).
// ============================================================

import type { TimerHandle, TimerScheduler } from './ports.js';

/** commit 결과 요약(복원 오프셋·SR 규모 요약 입력). / Applied-delta summary. */
export interface AppliedDelta {
  readonly changedCells: readonly { rowId: string; field: string }[];
  readonly insertedRowIds: readonly string[];
  readonly removedRowIds: readonly string[];
  /** 실시간 = 항상 백그라운드. / Realtime = always background. */
  readonly userInitiated: false;
}

/** DD-12 로 넘어가는 요약 메시지 형태. / Summary message handed to DD-12. */
export interface RtAnnounceSummary {
  readonly kind: 'background-update' | 'connection';
  readonly changedCount: number;
  readonly rowCount: number;
  /** i18n 키 'rt.backgroundUpdate' / 'rt.connection'. / i18n label. */
  readonly label: 'background' | 'connection';
  /** 편집/포커스 방해 금지 불변식. / Never interrupts focus. */
  readonly interruptsFocus: false;
  /** 연결 공지 시 상태 텍스트(정직 노출). / Connection status text. */
  readonly connectionStatus?: string;
}

export interface RtAnnouncePolicyConfig {
  /** DD-12 aria-live 로 넘기는 콜백. / Handoff to DD-12 aria-live. */
  readonly announce: (summary: RtAnnounceSummary) => void;
  /** 디바운스 윈도우(ms). 기본 500. / Debounce window(ms). */
  readonly debounceMs?: number;
  /** 지연 실행 주입(테스트 결정론). / Injected timer. */
  readonly schedule?: TimerScheduler;
}

/**
 * 백그라운드 값 변화·연결 상태를 디바운스 병합해 규모 요약으로 DD-12 에 넘긴다.
 * 연결 공지(끊김/재연결/오류)는 디바운스하지 않고 즉시(정직·지연 금지).
 * / Debounce-merges background value changes into a magnitude summary; connection is immediate.
 */
export class RtAnnouncePolicy {
  private readonly _announce: (summary: RtAnnounceSummary) => void;
  private readonly _debounceMs: number;
  private readonly _schedule: TimerScheduler;
  private _pendingCells = new Set<string>();
  private _pendingRows = new Set<string>();
  private _timer: TimerHandle | undefined;

  constructor(cfg: RtAnnouncePolicyConfig) {
    this._announce = cfg.announce;
    this._debounceMs = cfg.debounceMs ?? 500;
    this._schedule = cfg.schedule ?? ((cb, ms) => {
      const id = setTimeout(cb, ms);
      return { cancel: () => clearTimeout(id) };
    });
  }

  /** 백그라운드 갱신 — 규모 누적 후 디바운스 flush. / Accumulate then debounce-flush. */
  onBackgroundChange(applied: AppliedDelta): void {
    for (const c of applied.changedCells) {
      this._pendingCells.add(c.rowId + ' ' + c.field);
      this._pendingRows.add(c.rowId);
    }
    for (const r of applied.insertedRowIds) this._pendingRows.add(r);
    for (const r of applied.removedRowIds) this._pendingRows.add(r);
    this._arm();
  }

  private _arm(): void {
    if (this._timer) return;
    this._timer = this._schedule(() => {
      this._timer = undefined;
      this._flush();
    }, this._debounceMs);
  }

  private _flush(): void {
    if (this._pendingCells.size === 0 && this._pendingRows.size === 0) return;
    this._announce({
      kind: 'background-update',
      changedCount: this._pendingCells.size,
      rowCount: this._pendingRows.size,
      label: 'background',
      interruptsFocus: false,
    });
    this._pendingCells.clear();
    this._pendingRows.clear();
  }

  /** 연결 전이 공지 — 즉시(정직, 디바운스 없음). / Connection transition — immediate. */
  onConnection(statusText: string): void {
    this._announce({
      kind: 'connection',
      changedCount: 0,
      rowCount: 0,
      label: 'connection',
      interruptsFocus: false,
      connectionStatus: statusText,
    });
  }

  dispose(): void {
    this._timer?.cancel();
    this._timer = undefined;
    this._pendingCells.clear();
    this._pendingRows.clear();
  }
}
