// ============================================================
// DD-01 결측·오류 1급 값 객체 / DD-01 first-class missing & error values
// 설계: DD-01 §2.3 · REQ-TX-832
// 4-state 의미론: 실제0 / 없음(null) / 오류 / 결측사유. 조용한 0/빈문자 치환 차단.
// ============================================================

import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind } from './DomainValue.js';
import type { ValueType } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NONE } from './strategies.js';
import { HALF_UP } from './rounding.js';

/** 결측 사유 5종(REQ-TX-832) — 실제 0 과 구분. / Five missing reasons, distinct from a real zero. */
export enum MissingReason {
  NotApplicable = 'na',        // 미해당(구조적으로 값이 없음) / structurally not applicable
  NoData = 'no-data',          // 미수집(있어야 하나 아직 없음) / expected but not yet collected
  Suppressed = 'suppressed',   // 억제(권한·프라이버시로 가림) / suppressed for privacy/permission
  Calculating = 'pending',     // 계산 중/미확정 / calculating / not finalized
  Error = 'error',             // 계산 불가(오류에서 파생) / unavailable due to an error
}

/** 표준 오류 토큰 셋 — 문자열 아닌 값 객체. / Standard error tokens as a value object, not a string. */
export enum ErrorCode {
  DivZero = '#DIV/0!',
  Ref = '#REF!',
  Value = '#VALUE!',
  Name = '#NAME?',
  NA = '#N/A',
  Num = '#NUM!',
  Cycle = '#CYCLE!',
}

const MISSING_TEXT_KO: Record<MissingReason, string> = {
  [MissingReason.NotApplicable]: '결측: 미해당',
  [MissingReason.NoData]: '결측: 미수집',
  [MissingReason.Suppressed]: '결측: 억제됨',
  [MissingReason.Calculating]: '결측: 계산 중',
  [MissingReason.Error]: '결측: 오류',
};
const MISSING_TEXT_EN: Record<MissingReason, string> = {
  [MissingReason.NotApplicable]: 'missing: not applicable',
  [MissingReason.NoData]: 'missing: no data',
  [MissingReason.Suppressed]: 'missing: suppressed',
  [MissingReason.Calculating]: 'missing: calculating',
  [MissingReason.Error]: 'missing: error',
};

/**
 * 결측 값 객체(REQ-TX-832). 사유별 캐시 싱글턴. / Missing value object; cached per reason.
 */
export class Missing implements DomainValue {
  readonly kind = 'missing';
  private static _cache = new Map<MissingReason, Missing>();

  private constructor(readonly reason: MissingReason) {
    Object.freeze(this);
  }

  /** 사유별 캐시된 싱글턴. / Cached singleton per reason. */
  static of(reason: MissingReason): Missing {
    let m = Missing._cache.get(reason);
    if (!m) {
      m = new Missing(reason);
      Missing._cache.set(reason, m);
    }
    return m;
  }

  get type(): ValueType { return missingType; }

  isMissing(): boolean { return true; }
  isError(): boolean { return false; }
  isBlank(): boolean { return true; }

  equals(other: DomainValue): boolean {
    return other instanceof Missing && other.reason === this.reason;
  }
  hashKey(): string { return `missing:${this.reason}`; }

  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as Missing;
    return this.reason < o.reason ? -1 : this.reason > o.reason ? 1 : 0;
  }

  textEquivalent(locale?: string): string {
    const table = locale && locale.startsWith('ko') ? MISSING_TEXT_KO : MISSING_TEXT_EN;
    return table[this.reason];
  }

  toJSON(): DomainValueDTO {
    return { kind: 'missing', v: null, meta: { reason: this.reason } };
  }
}

/**
 * 오류 값 객체 — 표준 오류 토큰(결측·0 과 구분). / Error value object; distinct from missing/zero.
 */
export class ErrorValue implements DomainValue {
  readonly kind = 'error';

  private constructor(readonly code: ErrorCode, readonly detail?: string) {
    Object.freeze(this);
  }

  static of(code: ErrorCode, detail?: string): ErrorValue {
    return detail === undefined ? new ErrorValue(code) : new ErrorValue(code, detail);
  }

  get type(): ValueType { return errorType; }

  isMissing(): boolean { return false; }
  isError(): boolean { return true; }
  isBlank(): boolean { return false; }

  /** 오류 전파(산술·집계에서 우선 전파). / Errors propagate through arithmetic/aggregation. */
  propagate(): ErrorValue { return this; }

  equals(other: DomainValue): boolean {
    // detail 은 undefined 와 '' 를 동치로(hashKey·toJSON 과 정합: equals ⟺ hashKey).
    // / Treat absent and empty detail as equal, consistent with hashKey/toJSON.
    return other instanceof ErrorValue && other.code === this.code
      && (other.detail ?? '') === (this.detail ?? '');
  }
  hashKey(): string { return `error:${this.code}:${this.detail ?? ''}`; }

  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as ErrorValue;
    if (this.code !== o.code) return this.code < o.code ? -1 : 1;
    const d1 = this.detail ?? '';
    const d2 = o.detail ?? '';
    return d1 < d2 ? -1 : d1 > d2 ? 1 : 0;
  }

  textEquivalent(_locale?: string): string {
    return this.detail ? `${this.code} ${this.detail}` : this.code;
  }

  toJSON(): DomainValueDTO {
    return { kind: 'error', v: this.code, meta: this.detail ? { detail: this.detail } : {} };
  }
}

/** Missing 값 타입(레지스트리 등록용). / ValueType for missing. */
export const missingType: ValueType = {
  kind: 'missing',
  dimension: 'none',
  rounding: HALF_UP,
  sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE,
  aggregation: AGG_NONE,
  parse: () => Missing.of(MissingReason.NoData),
};

/** Error 값 타입(레지스트리 등록용). / ValueType for error. */
export const errorType: ValueType = {
  kind: 'error',
  dimension: 'none',
  rounding: HALF_UP,
  sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE,
  aggregation: AGG_NONE,
  parse: () => ErrorValue.of(ErrorCode.NA),
};
