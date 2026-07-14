// ============================================================
// DD-01 수량·물리량 값 객체 / DD-01 Quantity value object
// 설계: DD-01 §2.2 · REQ-T9-839 근접
// 단위 차원 보유, 이종 차원 합산 거부.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, cmpDecimal } from './DomainValue.js';
import type { ValueType, ParseContext } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NUMERIC } from './strategies.js';
import { HALF_UP } from './rounding.js';
import { Missing, MissingReason } from './Missing.js';

/** 차원/단위 불일치 합산 오류. / Raised when quantities of different dimensions/units are combined. */
export class QuantityMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Quantity mismatch: ${a} vs ${b}`);
    this.name = 'QuantityMismatchError';
  }
}

/**
 * 수량 값 객체(REQ-T9-839 근접). / Quantity value object with a unit dimension.
 */
export class Quantity implements DomainValue {
  readonly kind = 'quantity';
  private constructor(
    readonly value: OGDecimal,
    readonly unit: string,
    readonly dimension: string,
  ) { Object.freeze(this); }

  static of(value: OGDecimalLike, unit: string, dimension = 'none'): Quantity {
    return new Quantity(OGDecimal.from(value), unit, dimension);
  }

  get type(): ValueType { return quantityType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** 동일 차원·동일 단위만 합산(불일치 시 throw). / Add only same dimension & unit (throws otherwise). */
  add(other: Quantity): Quantity {
    if (other.dimension !== this.dimension || other.unit !== this.unit) {
      throw new QuantityMismatchError(`${this.value.toString()}${this.unit}`, `${other.value.toString()}${other.unit}`);
    }
    return new Quantity(this.value.add(other.value), this.unit, this.dimension);
  }

  equals(other: DomainValue): boolean {
    return other instanceof Quantity && other.unit === this.unit
      && other.dimension === this.dimension && other.value.eq(this.value);
  }
  hashKey(): string { return `quantity:${this.dimension}:${this.unit}:${this.value.toString()}`; }

  /** 동일 단위=value, 이종 단위=unit 콜레이션 그룹분리 후 value. / Same unit: by value; else group by unit code. */
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as Quantity;
    if (this.unit !== o.unit) return this.unit < o.unit ? -1 : 1;
    return cmpDecimal(this.value, o.value);
  }

  textEquivalent(_locale?: string): string { return `${this.value.toString()} ${this.unit}`; }
  toJSON(): DomainValueDTO {
    return { kind: 'quantity', v: this.value.toString(), meta: { unit: this.unit, dimension: this.dimension } };
  }
}

/** Quantity 값 타입(레지스트리 등록용). / ValueType for quantity. */
export const quantityType: ValueType = {
  kind: 'quantity',
  dimension: 'none',
  rounding: HALF_UP,
  sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE,
  aggregation: AGG_NUMERIC,
  parse: (raw: unknown, ctx?: ParseContext): DomainValue => {
    if (raw === null || raw === undefined || raw === '') return Missing.of(MissingReason.NoData);
    const unit = ctx?.unit ?? '';
    return Quantity.of(raw as OGDecimalLike, unit, ctx?.dimension ?? 'none');
  },
};
