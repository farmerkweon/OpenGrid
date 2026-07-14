// ============================================================
// DD-01 비율 계열 값 객체 / DD-01 ratio-family value objects
// 설계: DD-01 §2.2 · REQ-T2-803
// Ratio(0~1) · Percent(%) · PercentagePoint(%p) · GrowthRate(증감률).
// %↔%p 혼동을 타입 수준에서 차단(별개 클래스·암시 변환 없음).
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, cmpDecimal } from './DomainValue.js';
import type { ValueType, ParseContext } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_WEIGHTED_MEAN, AGG_NUMERIC } from './strategies.js';
import { HALF_UP } from './rounding.js';
import { Missing, MissingReason } from './Missing.js';

/**
 * 기저 적법성 판별자(REQ-T2-803) — GrowthRate·Delta 공유 정본 열거.
 * / Base validity discriminant shared by GrowthRate and Delta.
 */
export type BaseValidity = 'ok' | 'zeroBase' | 'negativeBase' | 'signChange';

const HUNDRED = OGDecimal.from('100');

/** 0~1 무차원 비율. / Dimensionless ratio in [0,1]. */
export class Ratio implements DomainValue {
  readonly kind = 'ratio';
  private constructor(readonly value: OGDecimal) { Object.freeze(this); }

  static of(value: OGDecimalLike): Ratio { return new Ratio(OGDecimal.from(value)); }

  get type(): ValueType { return ratioType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** ×100 명시 변환. / Explicit ×100 conversion. */
  toPercent(): Percent { return Percent.of(this.value.mul(HUNDRED)); }

  /**
   * 비율 집계 적법성(REQ-T2-805): 단순평균 금지 → 가중평균만(가중치=모수).
   * / Weighted mean only (weights = population size); simple mean is disallowed.
   */
  static weightedMean(pairs: Array<[Ratio, OGDecimalLike]>): Ratio {
    let num = OGDecimal.zero();
    let den = OGDecimal.zero();
    for (const [r, w] of pairs) {
      const wd = OGDecimal.from(w);
      num = num.add(r.value.mul(wd));
      den = den.add(wd);
    }
    if (den.isZero()) return Ratio.of(0);
    return new Ratio(num.div(den));
  }

  equals(other: DomainValue): boolean { return other instanceof Ratio && other.value.eq(this.value); }
  hashKey(): string { return `ratio:${this.value.toString()}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    return cmpDecimal(this.value, (other as Ratio).value);
  }
  textEquivalent(_locale?: string): string { return `${this.value.toString()}`; }
  toJSON(): DomainValueDTO { return { kind: 'ratio', v: this.value.toString() }; }
}

/** 백분율(예: 12.5%). / Percentage (e.g. 12.5%). */
export class Percent implements DomainValue {
  readonly kind = 'percent';
  private constructor(readonly value: OGDecimal) { Object.freeze(this); }

  static of(value: OGDecimalLike): Percent { return new Percent(OGDecimal.from(value)); }

  get type(): ValueType { return percentType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** ÷100 명시 변환. / Explicit ÷100 conversion. */
  toRatio(): Ratio { return Ratio.of(this.value.div(HUNDRED)); }

  /** %p 는 오직 두 Percent 의 차로만 생성(의미 강제). / A %p is only produced by subtracting two Percents. */
  minus(other: Percent): PercentagePoint { return PercentagePoint.of(this.value.sub(other.value)); }

  equals(other: DomainValue): boolean { return other instanceof Percent && other.value.eq(this.value); }
  hashKey(): string { return `percent:${this.value.toString()}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    return cmpDecimal(this.value, (other as Percent).value);
  }
  textEquivalent(locale?: string): string {
    return locale && locale.startsWith('ko') ? `${this.value.toString()}퍼센트` : `${this.value.toString()} percent`;
  }
  toJSON(): DomainValueDTO { return { kind: 'percent', v: this.value.toString() }; }
}

/** 퍼센트 포인트(%p) — 두 Percent 의 차. Percent 로 암시 변환 없음. / Percentage point; no implicit conversion to Percent. */
export class PercentagePoint implements DomainValue {
  readonly kind = 'percentagePoint';
  private constructor(readonly value: OGDecimal) { Object.freeze(this); }

  static of(value: OGDecimalLike): PercentagePoint { return new PercentagePoint(OGDecimal.from(value)); }

  get type(): ValueType { return percentagePointType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** 가법(같은 %p 끼리만). / Addition (only with another %p). */
  add(other: PercentagePoint): PercentagePoint { return PercentagePoint.of(this.value.add(other.value)); }

  equals(other: DomainValue): boolean { return other instanceof PercentagePoint && other.value.eq(this.value); }
  hashKey(): string { return `percentagePoint:${this.value.toString()}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    return cmpDecimal(this.value, (other as PercentagePoint).value);
  }
  textEquivalent(locale?: string): string {
    return locale && locale.startsWith('ko') ? `${this.value.toString()}퍼센트포인트` : `${this.value.toString()} percentage points`;
  }
  toJSON(): DomainValueDTO { return { kind: 'percentagePoint', v: this.value.toString() }; }
}

/**
 * 증감률(REQ-T2-803) — 부호·기저 규칙을 값 객체에 못박음.
 * / Growth rate; base/sign rules are encoded in the value object.
 */
export class GrowthRate implements DomainValue {
  readonly kind = 'growthRate';
  private constructor(
    readonly rate: OGDecimal | null,
    readonly baseValidity: BaseValidity,
  ) { Object.freeze(this); }

  /** (현재-기저)/|기저|. 기저 0 → rate=null·zeroBase(∞ 표기 금지). / Growth rate; zero base → null. */
  static from(current: OGDecimalLike, base: OGDecimalLike): GrowthRate {
    const c = OGDecimal.from(current);
    const b = OGDecimal.from(base);
    if (b.isZero()) return new GrowthRate(null, 'zeroBase');
    const rate = c.sub(b).div(b.abs());
    let validity: BaseValidity;
    if (b.isNeg()) validity = 'negativeBase';
    else if (c.isNeg()) validity = 'signChange';
    else validity = 'ok';
    return new GrowthRate(rate, validity);
  }

  get type(): ValueType { return growthRateType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** 해석 가능(기저 적법 && 산출 가능). / Meaningful when base is ok and rate exists. */
  isMeaningful(): boolean { return this.baseValidity === 'ok' && this.rate !== null; }

  equals(other: DomainValue): boolean {
    if (!(other instanceof GrowthRate) || other.baseValidity !== this.baseValidity) return false;
    if (this.rate === null || other.rate === null) return this.rate === other.rate;
    return this.rate.eq(other.rate);
  }
  hashKey(): string { return `growthRate:${this.rate === null ? 'null' : this.rate.toString()}:${this.baseValidity}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as GrowthRate;
    if (this.rate === null || o.rate === null) {
      if (this.rate === o.rate) return 0;
      return this.rate === null ? 1 : -1;   // null(산출불가) 은 말단 / null sorts last
    }
    return cmpDecimal(this.rate, o.rate);
  }
  textEquivalent(locale?: string): string {
    if (this.rate === null) return locale && locale.startsWith('ko') ? '증감률: 산출 불가' : 'growth: n/a';
    return `${this.rate.mul(HUNDRED).toString()}%`;
  }
  toJSON(): DomainValueDTO {
    return { kind: 'growthRate', v: this.rate === null ? null : this.rate.toString(), meta: { baseValidity: this.baseValidity } };
  }
}

function parseNumericLike(raw: unknown): OGDecimal | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[%\s]/g, '');
    if (cleaned === '' || cleaned === '-') return null;
    return OGDecimal.from(cleaned as OGDecimalLike);
  }
  return OGDecimal.from(raw as OGDecimalLike);
}

/** Ratio 값 타입. / ValueType for ratio. */
export const ratioType: ValueType = {
  kind: 'ratio', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_WEIGHTED_MEAN,
  parse: (raw) => { const n = parseNumericLike(raw); return n === null ? Missing.of(MissingReason.NoData) : Ratio.of(n); },
};
/** Percent 값 타입. / ValueType for percent. */
export const percentType: ValueType = {
  kind: 'percent', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_WEIGHTED_MEAN,
  parse: (raw) => { const n = parseNumericLike(raw); return n === null ? Missing.of(MissingReason.NoData) : Percent.of(n); },
};
/** PercentagePoint 값 타입. / ValueType for percentage point. */
export const percentagePointType: ValueType = {
  kind: 'percentagePoint', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NUMERIC,
  parse: (raw) => { const n = parseNumericLike(raw); return n === null ? Missing.of(MissingReason.NoData) : PercentagePoint.of(n); },
};
/** GrowthRate 값 타입. / ValueType for growth rate. */
export const growthRateType: ValueType = {
  kind: 'growthRate', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_WEIGHTED_MEAN,
  parse: (raw) => { const n = parseNumericLike(raw); return n === null ? Missing.of(MissingReason.NoData) : GrowthRate.from(n, OGDecimal.one()); },
};
