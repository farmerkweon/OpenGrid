// ============================================================
// DD-12 §2.4 문화 규칙 단일 컨텍스트 파사드 / single culture-context facade
// ------------------------------------------------------------
// 설계 근거(Why): Facade + Chain of Responsibility. 값객체·포맷터·정렬·검색이 문화를 **오직 여기서만**
//   조회하게 하는 단일 컨텍스트(REQ-T9-816, 불변식 3). 기존 `LocaleRegistry`(폴백 체인·child·t·meta)를
//   감싸 문화별 Intl 객체(Collator/NumberFormat/DateTimeFormat)를 메모이즈 제공한다(재생성 비용 절감).
//   자체 CLDR 미탑재 — 브라우저 내장 `Intl` 위임(zero-dependency 정체성 계승).
// / Design: Facade + CoR. The single culture context (REQ-T9-816, invariant 3). Wraps the existing
//   `LocaleRegistry` and memoizes per-locale Intl objects. Delegates to built-in `Intl` (zero-dep).
// ============================================================

import type { LocaleRegistry } from './LocaleRegistry.js';
import type { LocaleMeta, LocaleMessageKey, MessageParams } from './types.js';

/**
 * `LocaleMeta` 조회 파사드 — 값객체/포맷터/정렬/검색이 주입받는 단일 컨텍스트 포트.
 * `LocaleRegistry.meta()` 를 감싸 문화별 Intl 객체를 메모이즈 제공한다.
 * / The single culture-context port injected into VOs/formatters/sort/search. Wraps
 *   `LocaleRegistry.meta()` and memoizes per-locale Intl objects.
 */
export class LocaleContextProvider {
  private readonly _registry: LocaleRegistry;
  private readonly _subscribers = new Set<() => void>();
  private _collator: Intl.Collator | undefined;
  private _numberFmt = new Map<string, Intl.NumberFormat>();
  private _dateTimeFmt = new Map<string, Intl.DateTimeFormat>();
  /** 메모 무효화 기준 — 활성 로케일. 변경 감지 시 캐시 clear. / Memo-invalidation basis: active locale. */
  private _memoLocale: string;

  constructor(registry: LocaleRegistry) {
    this._registry = registry;
    this._memoLocale = registry.active();
  }

  /** 활성 로케일 문화 컨텍스트(폴백 병합 후). / Active-locale culture context (after fallback merge). */
  meta(): LocaleMeta {
    this._syncMemo();
    return this._registry.meta();
  }

  /** 정렬/검색 tie-break 콜레이터(메모이즈). collation 규칙은 `LocaleMeta.collation` 에서 조회. / Collator (memoized). */
  collator(): Intl.Collator {
    this._syncMemo();
    if (!this._collator) {
      const m = this._registry.meta();
      const opts: Intl.CollatorOptions = {};
      if (m.collation?.sensitivity !== undefined) opts.sensitivity = m.collation.sensitivity;
      if (m.collation?.numeric !== undefined) opts.numeric = m.collation.numeric;
      if (m.collation?.caseFirst !== undefined) opts.caseFirst = m.collation.caseFirst;
      this._collator = new Intl.Collator(m.intlLocale, opts);
    }
    return this._collator;
  }

  /** 숫자 포맷(메모이즈). numbering/currency 기본값은 `LocaleMeta` 에서 보강. / NumberFormat (memoized). */
  numberFormat(opts?: Intl.NumberFormatOptions): Intl.NumberFormat {
    this._syncMemo();
    const m = this._registry.meta();
    const merged: Intl.NumberFormatOptions = { ...opts };
    if (m.numbering !== undefined && merged.numberingSystem === undefined) merged.numberingSystem = m.numbering;
    if (merged.style === 'currency' && merged.currency === undefined && m.currency !== undefined) {
      merged.currency = m.currency;
    }
    const key = `${m.intlLocale}::${stableKey(merged)}`;
    let fmt = this._numberFmt.get(key);
    if (!fmt) { fmt = new Intl.NumberFormat(m.intlLocale, merged); this._numberFmt.set(key, fmt); }
    return fmt;
  }

  /** 날짜/시간 포맷(메모이즈). calendar/timeZone 기본값은 `LocaleMeta` 에서 보강. / DateTimeFormat (memoized). */
  dateTimeFormat(opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    this._syncMemo();
    const m = this._registry.meta();
    const merged: Intl.DateTimeFormatOptions = { ...opts };
    if (m.calendar !== undefined && merged.calendar === undefined) merged.calendar = m.calendar;
    if (m.timeZone !== undefined && merged.timeZone === undefined) merged.timeZone = m.timeZone;
    const key = `${m.intlLocale}::${stableKey(merged)}`;
    let fmt = this._dateTimeFmt.get(key);
    if (!fmt) { fmt = new Intl.DateTimeFormat(m.intlLocale, merged); this._dateTimeFmt.set(key, fmt); }
    return fmt;
  }

  /** i18n 메시지 해석(어댑터·공지가 하드코딩 대신 이걸로). / Message resolution. */
  t(key: LocaleMessageKey | string, params?: MessageParams): string {
    return this._registry.t(key, params);
  }

  /**
   * 활성 로케일 전환의 정본 경로 — 레지스트리 전환 + 메모 무효화 + 구독자 통지(어댑터 onLocaleChange 배선).
   * / The canonical active-locale switch: registry.setActive + memo invalidation + notify subscribers.
   */
  setLocale(id: string): void {
    const before = this._memoLocale;
    this._registry.setActive(id);
    const after = this._registry.active();
    // 실제 전환된 경우에만 무효화·통지(미등록 로케일 무시·동일 로케일 재설정은 no-op). / notify only on a real switch.
    if (after !== before) {
      this._invalidate();
      this._memoLocale = after;
      this._notify();
    }
  }

  /** 활성 로케일 변경 구독. 해제 함수 반환. / Subscribe to active-locale change; returns an unsubscribe fn. */
  onChange(cb: () => void): () => void {
    this._subscribers.add(cb);
    return () => { this._subscribers.delete(cb); };
  }

  /** 외부에서 레지스트리를 직접 전환한 경우의 수동 메모 갱신·통지. / Manual refresh when the registry changed externally. */
  refresh(): void {
    if (this._registry.active() !== this._memoLocale) {
      this._invalidate();
      this._memoLocale = this._registry.active();
      this._notify();
    }
  }

  private _syncMemo(): void {
    if (this._registry.active() !== this._memoLocale) {
      this._invalidate();
      this._memoLocale = this._registry.active();
    }
  }

  private _invalidate(): void {
    this._collator = undefined;
    this._numberFmt.clear();
    this._dateTimeFmt.clear();
  }

  private _notify(): void {
    for (const cb of this._subscribers) cb();
  }
}

/** 옵션 객체를 안정 키 문자열로(키 정렬). / Stable key string from an options object (sorted keys). */
function stableKey(o: object): string {
  const rec = o as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return keys.map((k) => `${k}=${String(rec[k])}`).join('|');
}
