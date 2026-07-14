// ============================================================
// DD-01 임계 집합 값 객체 / DD-01 ThresholdSet value object
// 설계: DD-01 §2.4 · REQ-T5-814
// CF·불릿·데이터바·게이지·아이콘셋 공유 임계. 경계 포함/배타·방향 단일 규칙.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind, numericOf } from './DomainValue.js';
import type { ValueType } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NONE } from './strategies.js';
import { HALF_UP } from './rounding.js';

/** 임계 구간 정의. / A threshold band definition. */
export interface Band {
  /** 구간 상한(null = 상방 무한). / Upper bound (null = unbounded above). */
  readonly upper: OGDecimal | null;
  /** 상한 포함 여부. / Whether the upper bound is inclusive. */
  readonly inclusive: boolean;
  /** 구간 라벨. / Band label. */
  readonly label: string;
}

/** 임계 방향. / Threshold direction. */
export type ThresholdDirection = 'higherIsBetter' | 'lowerIsBetter';

/** 밴드 입력(OGDecimalLike 허용). / Band input accepting OGDecimalLike. */
export interface BandInput {
  readonly upper: OGDecimalLike | null;
  readonly inclusive: boolean;
  readonly label: string;
}

/**
 * 임계 집합 값 객체(REQ-T5-814). / ThresholdSet value object.
 */
export class ThresholdSet implements DomainValue {
  readonly kind = 'thresholdSet';

  private constructor(
    readonly bands: ReadonlyArray<Band>,
    readonly direction: ThresholdDirection,
  ) { Object.freeze(this); }

  static of(bands: ReadonlyArray<BandInput>, direction: ThresholdDirection = 'higherIsBetter'): ThresholdSet {
    const norm: Band[] = bands.map((b) => ({
      upper: b.upper === null ? null : OGDecimal.from(b.upper),
      inclusive: b.inclusive,
      label: b.label,
    }));
    return new ThresholdSet(Object.freeze(norm), direction);
  }

  get type(): ValueType { return thresholdSetType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /**
   * 값이 속한 구간 인덱스(경계 규칙 일관 판정). 결측/오류/미소속 → -1.
   * / Index of the band a value falls into; missing/error/unmatched → -1.
   */
  bandOf(v: DomainValue): number {
    const n = numericOf(v);
    if (n === null) return -1;
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i]!;
      if (band.upper === null) return i;                       // 상방 무한 catch-all
      if (band.inclusive ? n.lte(band.upper) : n.lt(band.upper)) return i;
    }
    return -1;
  }

  equals(other: DomainValue): boolean {
    if (!(other instanceof ThresholdSet) || other.direction !== this.direction) return false;
    if (other.bands.length !== this.bands.length) return false;
    return this.bands.every((b, i) => {
      const o = other.bands[i]!;
      const upEq = b.upper === null || o.upper === null ? b.upper === o.upper : b.upper.eq(o.upper);
      return upEq && b.inclusive === o.inclusive && b.label === o.label;
    });
  }
  hashKey(): string {
    const parts = this.bands.map((b) => `${b.upper === null ? '∞' : b.upper.toString()}/${b.inclusive ? 'i' : 'e'}/${b.label}`);
    return `thresholdSet:${this.direction}:${parts.join('|')}`;
  }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const a = this.hashKey();
    const b = (other as ThresholdSet).hashKey();
    return a < b ? -1 : a > b ? 1 : 0;
  }
  textEquivalent(_locale?: string): string {
    return `thresholds(${this.direction}): ${this.bands.map((b) => b.label).join(', ')}`;
  }
  toJSON(): DomainValueDTO {
    return {
      kind: 'thresholdSet', v: null,
      meta: {
        direction: this.direction,
        bands: this.bands.map((b) => ({ upper: b.upper === null ? null : b.upper.toString(), inclusive: b.inclusive, label: b.label })),
      },
    };
  }
}

/** ThresholdSet 값 타입. / ValueType for thresholdSet. */
export const thresholdSetType: ValueType = {
  kind: 'thresholdSet', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NONE,
  parse: () => ThresholdSet.of([{ upper: null, inclusive: true, label: 'all' }]),
};
