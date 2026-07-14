// ============================================================
// DD-01 통화 값 객체 / DD-01 Money value object
// 설계: DD-01 §2.2 · REQ-T9-838
// 금액(정밀 OGDecimal) + 통화코드 + 최소단위정밀도. 같은 통화만 산술, penny-rounding.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, cmpDecimal } from './DomainValue.js';
import type { ValueType, ParseContext } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_MONEY } from './strategies.js';
import { HALF_EVEN, roundDecimal } from './rounding.js';
import { Missing, MissingReason } from './Missing.js';

/** 통화 불일치 산술 오류. / Raised when arithmetic mixes different currencies. */
export class MoneyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Money currency mismatch: ${a} vs ${b}`);
    this.name = 'MoneyMismatchError';
  }
}

/** ISO 4217 최소단위 소수자리(미등록 통화는 2). / Minor-unit digits per ISO 4217 (default 2). */
const MINOR_UNITS: Record<string, number> = {
  KRW: 0, JPY: 0, VND: 0, CLP: 0,
  USD: 2, EUR: 2, GBP: 2, CNY: 2, AUD: 2, CAD: 2, HKD: 2, SGD: 2,
  BHD: 3, KWD: 3, OMR: 3,
};

/** 통화별 최소단위 소수자리. / Minor-unit digits for a currency. */
export function minorUnitsOf(currency: string): number {
  return MINOR_UNITS[currency] ?? 2;
}

/**
 * 통화 값 객체(REQ-T9-838). / Money value object.
 */
export class Money implements DomainValue {
  readonly kind = 'money';

  private constructor(
    readonly amount: OGDecimal,
    readonly currency: string,
    readonly minorUnits: number,
  ) {
    Object.freeze(this);
  }

  /** 금액+통화로 생성. / Construct from amount and currency. */
  static of(amount: OGDecimalLike, currency: string): Money {
    return new Money(OGDecimal.from(amount), currency, minorUnitsOf(currency));
  }

  get type(): ValueType { return moneyType; }

  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  private _same(other: Money): void {
    if (other.currency !== this.currency) throw new MoneyMismatchError(this.currency, other.currency);
  }

  /** 같은 통화 덧셈(불일치 시 throw). / Add same-currency money (throws on mismatch). */
  add(other: Money): Money {
    this._same(other);
    return new Money(this.amount.add(other.amount), this.currency, this.minorUnits);
  }
  /** 같은 통화 뺄셈(불일치 시 throw). / Subtract same-currency money (throws on mismatch). */
  sub(other: Money): Money {
    this._same(other);
    return new Money(this.amount.sub(other.amount), this.currency, this.minorUnits);
  }

  /** 명시적 환산(레이트 주입) — 통화 교차 산술의 유일 경로. / Explicit conversion via injected rate. */
  convertTo(currency: string, rate: OGDecimalLike): Money {
    return new Money(this.amount.mul(rate), currency, minorUnitsOf(currency));
  }

  /** penny-rounding: 최소단위로 HALF_EVEN 반올림. / Round to the currency's minor unit (banker's). */
  roundToMinorUnit(): Money {
    return new Money(roundDecimal(this.amount, this.minorUnits, 'half-even'), this.currency, this.minorUnits);
  }

  equals(other: DomainValue): boolean {
    return other instanceof Money && other.currency === this.currency && other.amount.eq(this.amount);
  }
  hashKey(): string { return `money:${this.currency}:${this.amount.toString()}`; }

  /** 동일 통화=amount, 다통화=currency 콜레이션 그룹분리 후 amount. / Same currency: by amount; else by currency code then amount. */
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as Money;
    if (this.currency !== o.currency) return this.currency < o.currency ? -1 : 1;
    return cmpDecimal(this.amount, o.amount);
  }

  textEquivalent(_locale?: string): string {
    return `${this.amount.toString()} ${this.currency}`;
  }

  toJSON(): DomainValueDTO {
    return { kind: 'money', v: this.amount.toString(), meta: { currency: this.currency, minorUnits: this.minorUnits } };
  }
}

/** Money 값 타입(레지스트리 등록용). / ValueType for money. */
export const moneyType: ValueType = {
  kind: 'money',
  dimension: 'money',
  rounding: HALF_EVEN,
  sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE,
  aggregation: AGG_MONEY,
  parse: (raw: unknown, ctx?: ParseContext): DomainValue => {
    if (raw === null || raw === undefined || raw === '') return Missing.of(MissingReason.NoData);
    const currency = ctx?.currency ?? 'USD';
    const str = typeof raw === 'string' ? raw.replace(/[^0-9.\-]/g, '') : raw;
    return Money.of(OGDecimal.from(str as OGDecimalLike), currency);
  },
};
