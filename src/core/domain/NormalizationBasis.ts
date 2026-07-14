// ============================================================
// DD-01 정규화 기준 값 객체 / DD-01 NormalizationBasis value object
// 설계: DD-01 §2.4 · REQ-TX-836
// 스파크·히트맵·데이터바·인셀차트가 0~1 사상에 공유하는 단일 척도.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, numericOf } from './DomainValue.js';
import type { ValueType } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NONE } from './strategies.js';
import { HALF_UP } from './rounding.js';

/** 정규화 스코프. / Normalization scope. */
export type NormScope = 'row' | 'column' | 'global' | 'selection';
/** 정규화 앵커. / Normalization anchor. */
export type NormAnchor = 'zero' | 'min';
/** 정규화 스케일. / Normalization scale. */
export type NormScale = 'linear' | 'log';

/**
 * 정규화 기준 값 객체(REQ-TX-836). / Shared normalization basis for micro-visuals.
 */
export class NormalizationBasis implements DomainValue {
  readonly kind = 'normBasis';

  private constructor(
    readonly scope: NormScope,
    readonly min: OGDecimal,
    readonly max: OGDecimal,
    readonly anchor: NormAnchor,
    readonly clamp: boolean,
    readonly scale: NormScale,
  ) { Object.freeze(this); }

  static of(opts: {
    scope: NormScope; min: OGDecimalLike; max: OGDecimalLike;
    anchor?: NormAnchor; clamp?: boolean; scale?: NormScale;
  }): NormalizationBasis {
    return new NormalizationBasis(
      opts.scope,
      OGDecimal.from(opts.min),
      OGDecimal.from(opts.max),
      opts.anchor ?? 'min',
      opts.clamp ?? true,
      opts.scale ?? 'linear',
    );
  }

  get type(): ValueType { return normBasisType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /**
   * 값 → 0~1 사상(클램프/로그 규칙 내장). 결측/오류는 null(gap).
   * / Project a value to [0,1]; missing/error → null (gap).
   */
  project(v: DomainValue): number | null {
    const n = numericOf(v);
    if (n === null) return null;

    const lo = this.anchor === 'zero' ? OGDecimal.zero() : this.min;
    const hi = this.max;
    const span = hi.sub(lo);
    if (span.isZero()) return 0;

    if (this.scale === 'log') {
      const xv = n.toNumber();
      const lov = lo.toNumber();
      const hiv = hi.toNumber();
      if (xv <= 0 || lov <= 0 || hiv <= 0) return null;   // 로그 정의역 밖 / outside log domain
      const t = (Math.log(xv) - Math.log(lov)) / (Math.log(hiv) - Math.log(lov));
      return this._clampT(t);
    }

    const t = n.sub(lo).div(span).toNumber();
    return this._clampT(t);
  }

  private _clampT(t: number): number {
    if (!this.clamp) return t;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  equals(other: DomainValue): boolean {
    return other instanceof NormalizationBasis
      && other.scope === this.scope && other.anchor === this.anchor
      && other.clamp === this.clamp && other.scale === this.scale
      && other.min.eq(this.min) && other.max.eq(this.max);
  }
  hashKey(): string {
    return `normBasis:${this.scope}:${this.min.toString()}:${this.max.toString()}:${this.anchor}:${this.clamp}:${this.scale}`;
  }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const a = this.hashKey();
    const b = (other as NormalizationBasis).hashKey();
    return a < b ? -1 : a > b ? 1 : 0;
  }
  textEquivalent(_locale?: string): string {
    return `basis ${this.scope} [${this.min.toString()}, ${this.max.toString()}]`;
  }
  toJSON(): DomainValueDTO {
    return {
      kind: 'normBasis', v: null,
      meta: {
        scope: this.scope, min: this.min.toString(), max: this.max.toString(),
        anchor: this.anchor, clamp: this.clamp, scale: this.scale,
      },
    };
  }
}

/** NormalizationBasis 값 타입. / ValueType for normBasis. */
export const normBasisType: ValueType = {
  kind: 'normBasis', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NONE,
  parse: () => NormalizationBasis.of({ scope: 'global', min: 0, max: 1 }),
};
