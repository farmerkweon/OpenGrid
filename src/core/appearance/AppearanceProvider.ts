// ============================================================
// DD-11 §2.5 AppearanceProvider — 확정 외관의 단일 발행-구독 경계(전파 provider)
// / DD-11 §2.5 AppearanceProvider — the single publish/subscribe boundary for resolved appearance.
// ------------------------------------------------------------
// 설계 근거(Why, §2.5·§3.1-4·REQ-T1-803·리스크 #3):
//   `propagateAppearance`(기존 헬퍼)를 **provider 경계** 로 승격한다. 확정 외관을 단일 채널로
//   발행하고 DOM/비-DOM 구독자가 격리를 존중하며 구독한다:
//   * DOM 구독자: 부속 요소(다이얼로그·필터패널·서브그리드)에 외관 속성 복제(propagateTo = 기존
//     propagateAppearance 흡수) — 컴포넌트마다 속성 하나 잊는 조용한 사고를 구조적으로 차단.
//   * 비-DOM 구독자: 명시 콜백(subscribe)으로 캔버스·스파크 리드로우.
//   publish 는 스냅샷 브리지를 **무효화**(invalidate)한 뒤 전 구독자에 통지 → "구독 등록 누락 =
//   낡은 색"(기지 결함) 리스크를 단일 채널로 구조 축소(REQ-T6-813). 헤드리스(subscribe/publish 는
//   DOM 무의존; propagateTo 만 DOM 조작).
// ============================================================

import { propagateAppearance } from '../AppearanceResolver.js';
import type { ComposedAppearance } from './AppearanceComposer.js';
import type { AppearanceSnapshotBridge } from './ResolvedAppearanceSnapshot.js';

/** 외관 변경 구독자(부속 컴포넌트·서브그리드·캔버스 리드로우). / Appearance-change subscriber. */
export type AppearanceListener = (composed: ComposedAppearance) => void;

/**
 * AppearanceProvider — 확정 외관의 단일 발행 채널.
 * / AppearanceProvider — the single publish channel for resolved appearance.
 *
 * @example
 * const provider = new AppearanceProvider(snapshotBridge);
 * const off = provider.subscribe((c) => chart.redraw(c));
 * provider.publish(composer.compose(appearance)); // bridge.invalidate() + 전 구독자 통지
 * off();
 */
export class AppearanceProvider {
  private _listeners = new Set<AppearanceListener>();
  private _last: ComposedAppearance | null = null;

  /**
   * @param _bridge - publish 시 무효화할 스냅샷 브리지(선택 — 없으면 통지만). / Snapshot bridge to invalidate on publish (optional).
   */
  constructor(private readonly _bridge?: AppearanceSnapshotBridge) {}

  /**
   * 부속 DOM 요소에 확정 외관 속성 복제(data-og-theme/skin 을 한 번에 — 기존 propagateAppearance).
   * / Clone appearance attrs onto detached DOM (data-og-theme/skin together).
   *
   * @param fromEl - 외관 속성을 상속받을 원본(그리드 컨테이너 등) / Source to inherit appearance from
   * @param toEl - 속성을 받을 대상(다이얼로그·서브그리드) / Target to receive the attributes
   */
  propagateTo(fromEl: Element | null, toEl: Element): void {
    propagateAppearance(fromEl, toEl);
  }

  /**
   * 비-DOM 표면(캔버스차트·스파크·인쇄버퍼) 구독. 반환 = 해지 함수.
   * / Subscribe a non-DOM surface; returns an unsubscribe function.
   *
   * @param fn - 외관 변경 리스너 / Appearance-change listener
   * @returns 구독 해지 함수 / Unsubscribe function
   */
  subscribe(fn: AppearanceListener): () => void {
    this._listeners.add(fn);
    return () => {
      this._listeners.delete(fn);
    };
  }

  /**
   * 외관 확정 → 스냅샷 무효화 + 전 구독자 통지(낡은 색 0, REQ-T6-813).
   * / Publish → invalidate snapshot + notify all subscribers.
   *
   * @param composed - 확정된 합성 외관 / The resolved composed appearance
   */
  publish(composed: ComposedAppearance): void {
    this._last = composed;
    this._bridge?.invalidate();
    for (const fn of this._listeners) fn(composed);
  }

  /** 마지막 발행 외관(늦게 구독한 표면의 초기 동기화용). / The last published appearance (for late subscribers). */
  get last(): ComposedAppearance | null {
    return this._last;
  }

  /** 활성 구독자 수(진단/테스트). / Active subscriber count (diagnostics/tests). */
  get subscriberCount(): number {
    return this._listeners.size;
  }
}
