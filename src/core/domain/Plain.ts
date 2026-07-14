// ============================================================
// DD-01 원시 폴백 값 객체 / DD-01 plain fallback value objects
// 설계: DD-01 §2.2·§2.1(폴백 seam) · REQ-TX-831
// 미지 kind/일반 숫자·텍스트. 미등록 값종은 여기로 폴백(깨지지 않음).
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, cmpDecimal } from './DomainValue.js';
import type { ValueType, ParseContext } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NUMERIC, AGG_NONE } from './strategies.js';
import { HALF_UP } from './rounding.js';
import { Missing, MissingReason } from './Missing.js';

/** 일반 숫자 값 객체. / Plain number value object. */
export class PlainNumber implements DomainValue {
  readonly kind = 'number';
  private constructor(readonly value: OGDecimal) { Object.freeze(this); }

  static of(value: OGDecimalLike): PlainNumber { return new PlainNumber(OGDecimal.from(value)); }

  get type(): ValueType { return plainNumberType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  equals(other: DomainValue): boolean { return other instanceof PlainNumber && other.value.eq(this.value); }
  hashKey(): string { return `number:${this.value.toString()}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    return cmpDecimal(this.value, (other as PlainNumber).value);
  }
  textEquivalent(_locale?: string): string { return this.value.toString(); }
  toJSON(): DomainValueDTO { return { kind: 'number', v: this.value.toString() }; }
}

/** 일반 텍스트 값 객체. / Plain text value object. */
export class PlainText implements DomainValue {
  readonly kind = 'text';
  private constructor(readonly value: string) { Object.freeze(this); }

  static of(value: string): PlainText { return new PlainText(value); }

  get type(): ValueType { return plainTextType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return this.value === ''; }

  equals(other: DomainValue): boolean { return other instanceof PlainText && other.value === this.value; }
  hashKey(): string { return `text:${this.value}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as PlainText;
    return this.value < o.value ? -1 : this.value > o.value ? 1 : 0;
  }
  textEquivalent(_locale?: string): string { return this.value; }
  toJSON(): DomainValueDTO { return { kind: 'text', v: this.value }; }
}

/** 숫자 판별(문자열이 순수 수치인가). / Whether a string is a pure numeric token. */
function looksNumeric(s: string): boolean { return /^-?\d+(\.\d+)?$/.test(s.trim()); }

/** PlainNumber 값 타입. / ValueType for plain number. */
export const plainNumberType: ValueType = {
  kind: 'number', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NUMERIC,
  parse: (raw: unknown): DomainValue => {
    if (raw === null || raw === undefined || raw === '') return Missing.of(MissingReason.NoData);
    return PlainNumber.of(raw as OGDecimalLike);
  },
};

/** PlainText 값 타입. / ValueType for plain text. */
export const plainTextType: ValueType = {
  kind: 'text', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NONE,
  parse: (raw: unknown): DomainValue => {
    if (raw === null || raw === undefined) return Missing.of(MissingReason.NoData);
    return PlainText.of(String(raw));
  },
};

/**
 * PLAIN 폴백 값 타입(REQ-TX-831) — 미등록 kind 소비 시 반환.
 * 수치면 PlainNumber, 아니면 PlainText 로 안전 처리.
 * / PLAIN fallback type for unregistered kinds; numeric → PlainNumber, else PlainText.
 */
export const plainType: ValueType = {
  kind: 'number', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NUMERIC,
  parse: (raw: unknown, _ctx?: ParseContext): DomainValue => {
    if (raw === null || raw === undefined || raw === '') return Missing.of(MissingReason.NoData);
    if (typeof raw === 'number' || typeof raw === 'bigint') return PlainNumber.of(raw as OGDecimalLike);
    if (raw instanceof OGDecimal) return PlainNumber.of(raw);
    const s = String(raw);
    return looksNumeric(s) ? PlainNumber.of(s as OGDecimalLike) : PlainText.of(s);
  },
};
