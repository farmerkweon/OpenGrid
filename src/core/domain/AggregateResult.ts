// ============================================================
// DD-01 집계 결과 값 객체 / DD-01 AggregateResult value object
// 설계: DD-01 §2.4 · REQ-T2-805/806
// 집계 결과를 스칼라가 아닌 문맥 결합 값 객체로(함수·표본수·단위·모집단 고지).
// ※ 형상+적법성만 소유; 산출 실행은 DD-08/09.
// ============================================================

import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind } from './DomainValue.js';
import type { ValueType } from './ValueType.js';
import { SIGN_ALLOW_NEGATIVE, MISSING_EXCLUDE, AGG_NONE } from './strategies.js';
import { HALF_UP } from './rounding.js';

/** 집계 함수 이름. / Aggregation function name. */
export type AggregateFn = 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT' | 'WMEAN' | (string & {});
/** 결측 처리 방식. / Missing-handling mode. */
export type MissingHandling = 'excluded' | 'included';
/** 모집단 스코프. / Population scope. */
export type Population = 'all' | 'filtered' | 'visible' | 'selection';

/**
 * 집계 결과(REQ-T2-806) — 문맥(함수·표본수·단위·결측처리·모집단)을 함께 고지.
 * / Aggregate result carrying its computation context.
 */
export interface AggregateResult extends DomainValue {
  readonly fn: AggregateFn;
  readonly value: DomainValue;          // 결과 자체도 값 객체(통화 SUM → Money)
  readonly n: number;                   // 표본수
  readonly unit: string;                // 단위 차원
  readonly missingHandling: MissingHandling;
  readonly population: Population;
}

/** AggregateResult 구성 인자. / Fields to construct an aggregate result. */
export interface AggregateResultInit {
  fn: AggregateFn;
  value: DomainValue;
  n: number;
  unit: string;
  missingHandling: MissingHandling;
  population: Population;
}

/**
 * 기본 집계 결과 구현. / Concrete aggregate-result value object.
 */
export class BasicAggregateResult implements AggregateResult {
  readonly kind = 'aggregate';
  readonly fn: AggregateFn;
  readonly value: DomainValue;
  readonly n: number;
  readonly unit: string;
  readonly missingHandling: MissingHandling;
  readonly population: Population;

  private constructor(init: AggregateResultInit) {
    this.fn = init.fn;
    this.value = init.value;
    this.n = init.n;
    this.unit = init.unit;
    this.missingHandling = init.missingHandling;
    this.population = init.population;
    Object.freeze(this);
  }

  static of(init: AggregateResultInit): BasicAggregateResult { return new BasicAggregateResult(init); }

  get type(): ValueType { return aggregateType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return this.value.isError(); }
  isBlank(): boolean { return false; }

  equals(other: DomainValue): boolean {
    return other instanceof BasicAggregateResult
      && other.fn === this.fn && other.n === this.n && other.unit === this.unit
      && other.missingHandling === this.missingHandling && other.population === this.population
      && other.value.equals(this.value);
  }
  hashKey(): string {
    return `aggregate:${this.fn}:${this.n}:${this.unit}:${this.missingHandling}:${this.population}:${this.value.hashKey()}`;
  }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    return this.value.compareTo((other as BasicAggregateResult).value);
  }
  textEquivalent(locale?: string): string {
    return `${this.fn}(n=${this.n}) = ${this.value.textEquivalent(locale)}`;
  }
  toJSON(): DomainValueDTO {
    return {
      kind: 'aggregate', v: null,
      meta: {
        fn: this.fn, n: this.n, unit: this.unit,
        missingHandling: this.missingHandling, population: this.population,
        value: this.value.toJSON(),
      },
    };
  }
}

/** AggregateResult 값 타입. / ValueType for aggregate. */
export const aggregateType: ValueType = {
  kind: 'aggregate', dimension: 'none', rounding: HALF_UP, sign: SIGN_ALLOW_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NONE,
  parse: () => { throw new Error('aggregateType.parse: AggregateResult is produced by the aggregation engine (DD-08/09), not parsed.'); },
};
