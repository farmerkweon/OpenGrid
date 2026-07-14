// ============================================================
// DD-01 증감(Delta) 값 객체 / DD-01 Delta value object
// 설계: DD-01 §2.2 · REQ-T5-813 (정본 소유 — DD-03 은 이 Delta 를 import)
// 시각표현(화살표+색+부호)과 분리된 순수 증감 모델.
// 정본 용어: 절대델타(magnitude) / 증감률(growthRate) / 방향(direction).
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, cmpDecimal } from './DomainValue.js';
import type { ValueType, ParseContext } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NUMERIC } from './strategies.js';
import { HALF_UP } from './rounding.js';
import { Missing, MissingReason } from './Missing.js';
import { GrowthRate, type BaseValidity } from './Ratios.js';

/** 증감 방향. / Change direction. */
export type DeltaDirection = 'up' | 'down' | 'flat';

const HUNDRED = OGDecimal.from('100');

/**
 * 증감 값 객체(REQ-T5-813). / Delta value object.
 */
export class Delta implements DomainValue {
  readonly kind = 'delta';
  private constructor(
    readonly current: OGDecimal,
    readonly base: OGDecimal,
    readonly direction: DeltaDirection,
    readonly magnitude: OGDecimal,   // |current - base| (절대델타)
    readonly baseValidity: BaseValidity,
  ) { Object.freeze(this); }

  /**
   * 현재·기저·무변화 임계(eps)로 증감 생성. 방향/절대델타/기저적법을 한 곳에서 판정.
   * / Build a delta; direction, magnitude and base validity are decided in one place.
   */
  static from(current: OGDecimalLike, base: OGDecimalLike, eps: OGDecimalLike = 0): Delta {
    const c = OGDecimal.from(current);
    const b = OGDecimal.from(base);
    const diff = c.sub(b);
    const mag = diff.abs();
    const e = OGDecimal.from(eps).abs();

    let direction: DeltaDirection;
    if (mag.lte(e)) direction = 'flat';
    else direction = diff.isPos() ? 'up' : 'down';

    let validity: BaseValidity;
    if (b.isZero()) validity = 'zeroBase';
    else if (b.isNeg()) validity = 'negativeBase';
    else if (c.isNeg()) validity = 'signChange';
    else validity = 'ok';

    return new Delta(c, b, direction, mag, validity);
  }

  get type(): ValueType { return deltaType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** 파생 증감률(같은 기저 규칙 재사용). / Derived growth rate (reuses the same base rules). */
  growthRate(): GrowthRate { return GrowthRate.from(this.current, this.base); }

  equals(other: DomainValue): boolean {
    return other instanceof Delta && other.current.eq(this.current) && other.base.eq(this.base);
  }
  hashKey(): string { return `delta:${this.current.toString()}:${this.base.toString()}`; }

  /** 절대델타(magnitude) 순. / Ordered by magnitude. */
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    return cmpDecimal(this.magnitude, (other as Delta).magnitude);
  }

  textEquivalent(locale?: string): string {
    const ko = locale ? locale.startsWith('ko') : false;
    if (this.direction === 'flat') return ko ? '무변화' : 'no change';
    const gr = this.growthRate();
    const pct = gr.rate === null ? '' : ` (${gr.rate.isNeg() ? '' : '+'}${gr.rate.mul(HUNDRED).toString()}%)`;
    const word = this.direction === 'up' ? (ko ? '증가' : 'up') : (ko ? '감소' : 'down');
    return `${word} Δ${this.magnitude.toString()}${pct}`;
  }

  toJSON(): DomainValueDTO {
    return {
      kind: 'delta',
      v: this.current.toString(),
      meta: { base: this.base.toString(), direction: this.direction, baseValidity: this.baseValidity },
    };
  }
}

/** Delta 값 타입(레지스트리 등록용). / ValueType for delta. */
export const deltaType: ValueType = {
  kind: 'delta',
  dimension: 'none',
  rounding: HALF_UP,
  sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE,
  aggregation: AGG_NUMERIC,
  parse: (raw: unknown, _ctx?: ParseContext): DomainValue => {
    if (raw === null || raw === undefined || raw === '') return Missing.of(MissingReason.NoData);
    return Delta.from(raw as OGDecimalLike, 0);
  },
};
