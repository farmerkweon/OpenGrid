// ============================================================
// DD-12 §2.3 라이브영역 공지 파이프 / aria-live announcement pipe
// ------------------------------------------------------------
// 설계 근거(Why): Mediator. 다수 공지 소스와 두 라이브영역(polite/assertive) 사이의 중재자.
//   소스는 서로/라이브영역을 모르고 `enqueue` 만 안다 → 병합·우선순위·디바운스·중복억제 정책을
//   한 곳에 집중(REQ-T9-821). 큐잉 → 병합(mergeKey) → 우선순위 → 디바운스 → 라이브영역 1회 발화.
//   assertive 는 디바운스를 우회해 즉시 발화(R1 결정, `assertiveImmediate`).
// / Design: Mediator. One place concentrates coalescing/priority/debounce/dedup between many
//   announcement sources and the polite/assertive live regions. Sources know only `enqueue`.
//   enqueue → merge(mergeKey) → prioritize → debounce → flush once. assertive bypasses debounce.
//
// 헤드리스·결정론: 타이머를 주입 가능한 스케줄러로 추상화해(기본 setTimeout) 테스트에서 결정론적
//   flush 를 구동한다. DOM 물질화(라이브영역 textContent)는 IAriaRenderPort.announce 경계 밖.
// ============================================================

import type { MessageParams } from '../i18n/types.js';
import type { IAriaRenderPort, LiveChannel } from './ports.js';

/**
 * 공지 1건 — 텍스트가 아니라 (채널·우선순위·병합키·메시지키·페이로드) 구조. 병합·중복억제의 단위.
 * / One announcement — a (channel, priority, mergeKey, messageKey, payload) structure, not raw text.
 */
export interface Announcement {
  /** 라이브영역 채널. polite=대기열 합류, assertive=즉시(오류). / Live channel. */
  readonly channel: LiveChannel;
  /** 우선순위(같은 채널 내 경합 시 큰 값 우선). 예 오류>편집완료>선택. / Priority (higher wins within a channel). */
  readonly priority: number;
  /**
   * 병합키 — 같은 키의 연속 공지는 마지막 1건으로 병합(coalesce). 예 'sort'·'selection'·'bg-update'.
   * 빠른 연속 정렬이 마지막 상태만 1회 발화되게 하는 핵심(REQ-T9-821 AC).
   * / Merge key — successive announcements with the same key coalesce to the latest one.
   */
  readonly mergeKey: string;
  /** i18n 메시지 키(컨트롤러가 `t()` 로 해석; 하드코딩 문자열 금지). / i18n message key (resolved via `t()`). */
  readonly messageKey: string;
  /** 보간 파라미터. / Interpolation params. */
  readonly params?: MessageParams;
  /** 배경(비-사용자) 변경 표식 — 편집/포커스 중 억제 대상(REQ-T9-822). / Background (non-user) change flag. */
  readonly background?: boolean;
}

/** 주입 가능한 타이머 핸들·스케줄러(결정론 테스트용). / Injectable timer handle & scheduler (for deterministic tests). */
export type TimerHandle = unknown;

/** `LiveRegionController` 구성. render 는 필수 의존(교차리뷰 R: opts 전체 옵셔널 금지). / Controller config. */
export interface LiveRegionControllerOpts {
  /** aria/공지 물질화 포트(필수). / aria/announcement materialization port (required). */
  readonly render: IAriaRenderPort;
  /** 메시지 해석기(하드코딩 금지). 미주입 시 키 원문 반환(항등). / Message resolver; defaults to identity (key). */
  readonly t?: (key: string, params?: MessageParams) => string;
  /** polite 디바운스(ms). 기본 150. / polite debounce (ms). Default 150. */
  readonly debounceMs?: number;
  /** assertive 즉시 발화(디바운스 우회, R1). 기본 true. / assertive immediate (bypass debounce). Default true. */
  readonly assertiveImmediate?: boolean;
  /** 타이머 예약(기본 setTimeout). / Schedule a timer (defaults to setTimeout). */
  readonly schedule?: (fn: () => void, ms: number) => TimerHandle;
  /** 타이머 취소(기본 clearTimeout). / Cancel a timer (defaults to clearTimeout). */
  readonly cancel?: (h: TimerHandle) => void;
}

/**
 * aria-live 경계의 문지기. 위젯의 직접 라이브영역 `textContent =` 접근을 대체한다(불변식 4).
 * / Gatekeeper of the aria-live boundary; replaces direct live-region `textContent =` access.
 */
export class LiveRegionController {
  private readonly _render: IAriaRenderPort;
  private readonly _t: (key: string, params?: MessageParams) => string;
  private readonly _debounceMs: number;
  private readonly _assertiveImmediate: boolean;
  private readonly _schedule: (fn: () => void, ms: number) => TimerHandle;
  private readonly _cancel: (h: TimerHandle) => void;

  /** polite 큐 — mergeKey 당 최신 1건(병합). / polite queue — latest per mergeKey. */
  private _polite = new Map<string, Announcement>();
  /** assertive 큐 — mergeKey 당 최신 1건. / assertive queue — latest per mergeKey. */
  private _assertive = new Map<string, Announcement>();
  private _timer: TimerHandle | null = null;
  private _userBusy = false;
  private _disposed = false;

  private _spoken = 0;
  private _coalesced = 0;
  private _dropped = 0;

  constructor(opts: LiveRegionControllerOpts) {
    this._render = opts.render;
    this._t = opts.t ?? ((k) => k);
    this._debounceMs = opts.debounceMs ?? 150;
    this._assertiveImmediate = opts.assertiveImmediate ?? true;
    this._schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms) as unknown as TimerHandle);
    this._cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /**
   * 공지 투입 — 즉시 발화 아님(assertive-immediate 제외). 같은 mergeKey 는 큐에서 최신으로 대체(병합).
   * / Enqueue — not spoken immediately (except assertive-immediate). Same mergeKey replaces (coalesce).
   */
  enqueue(a: Announcement): void {
    if (this._disposed) return;
    const q = a.channel === 'assertive' ? this._assertive : this._polite;
    if (q.has(a.mergeKey)) this._coalesced++;
    q.set(a.mergeKey, a);

    // assertive 즉시 발화 — 디바운스 우회(오류 등 즉시성 요구). / assertive immediate — bypass debounce.
    if (a.channel === 'assertive' && this._assertiveImmediate) {
      this._flushAssertive();
      return;
    }
    this._scheduleFlush();
  }

  /** 편집/포커스 중 배경 공지 억제 게이트(REQ-T9-822). false 전환 시 억제분 방출. / Suppress background while busy. */
  setUserBusy(busy: boolean): void {
    const was = this._userBusy;
    this._userBusy = busy;
    if (was && !busy) this._scheduleFlush(); // 편집 종료 → 누적 배경 요약 방출. / release held background summary.
  }

  /**
   * stale 공지 취소 — 큐에서 mergeKey 를 제거하고 dropped 계측(UC-2 E1: 정렬 대상 소멸).
   * / Drop a stale announcement — remove the mergeKey from queues, count as dropped.
   */
  drop(mergeKey: string): void {
    let hit = false;
    if (this._polite.delete(mergeKey)) hit = true;
    if (this._assertive.delete(mergeKey)) hit = true;
    if (hit) this._dropped++;
  }

  /** 계측: 발화 수·병합으로 삭제된 중복 수·drop 수(REQ-T9-821 중복률 0 계측 SSOT). / Metrics. */
  metrics(): { spoken: number; coalesced: number; dropped: number } {
    return { spoken: this._spoken, coalesced: this._coalesced, dropped: this._dropped };
  }

  dispose(): void {
    if (this._timer != null) { this._cancel(this._timer); this._timer = null; }
    this._polite.clear();
    this._assertive.clear();
    this._disposed = true;
  }

  // ── 내부 ─────────────────────────────────────────────

  private _scheduleFlush(): void {
    if (this._disposed || this._timer != null) return;
    this._timer = this._schedule(() => {
      this._timer = null;
      this._flush();
    }, this._debounceMs);
  }

  /** 디바운스 만료 flush — 채널별 우선순위 정렬 → mergeKey 최신 1건씩 발화. / Debounced flush. */
  private _flush(): void {
    if (this._disposed) return;
    this._flushAssertive();
    this._flushPolite();
  }

  private _flushAssertive(): void {
    if (this._assertive.size === 0) return;
    const items = [...this._assertive.values()].sort((a, b) => b.priority - a.priority);
    this._assertive.clear();
    for (const a of items) this._speak(a);
  }

  private _flushPolite(): void {
    if (this._polite.size === 0) return;
    const ready: Announcement[] = [];
    const held = new Map<string, Announcement>();
    for (const [key, a] of this._polite) {
      // 편집/포커스 중이면 배경 공지는 억제(보류), 비-배경은 발화. / hold background while busy.
      if (this._userBusy && a.background) held.set(key, a);
      else ready.push(a);
    }
    this._polite = held;
    ready.sort((a, b) => b.priority - a.priority);
    for (const a of ready) this._speak(a);
  }

  private _speak(a: Announcement): void {
    const text = this._t(a.messageKey, a.params);
    this._render.announce(a.channel, text);
    this._spoken++;
  }
}
