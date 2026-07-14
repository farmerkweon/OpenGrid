// ============================================================
// DD-01 ValueType 레지스트리 / DD-01 ValueType registry
// 설계: DD-01 §2.1·§4.2·§4.4(C1) · REQ-TX-831
// 값 종류별 도메인 메타의 개방형 데이터 사전. 미등록 kind → PLAIN 폴백(never-throw).
// ※ IRegistry(DD-10)와 동형(어댑터 정합): register↔register, get↔resolve, has↔has.
// ============================================================

import type { DomainValue, ValueKind } from './DomainValue.js';
import type { RoundingRule } from './rounding.js';
import type { SignRule, MissingPolicy, AggregationLegality } from './strategies.js';

import { moneyType } from './Money.js';
import { ratioType, percentType, percentagePointType, growthRateType } from './Ratios.js';
import { deltaType } from './Delta.js';
import { quantityType } from './Quantity.js';
import { missingType, errorType } from './Missing.js';
import { plainNumberType, plainTextType, plainType } from './Plain.js';
import { normBasisType } from './NormalizationBasis.js';
import { thresholdSetType } from './ThresholdSet.js';

export type { SignRule, MissingPolicy, AggregationLegality } from './strategies.js';
export type { RoundingRule } from './rounding.js';

/** 파싱 문맥(편집 커밋·임포트 시 값종별 부속 정보). / Parse context (per-kind hints on commit/import). */
export interface ParseContext {
  readonly currency?: string;
  readonly unit?: string;
  readonly dimension?: string;
  readonly locale?: string;
  readonly precision?: number;
}

/**
 * ValueType — 값 종류별 도메인 메타(REQ-TX-831). 순수 메타 객체.
 * / Per-kind domain meta; a pure, tree-shakeable descriptor.
 */
export interface ValueType {
  readonly kind: ValueKind;
  /** 단위 차원('money'|'none'|'length'…). 집계 호환성 판정용. / Unit dimension. */
  readonly dimension: string;
  /** 기본 반올림 규칙(값객체·포맷터·집계 공유). / Default rounding rule. */
  readonly rounding: RoundingRule;
  /** 부호·기저 규칙(의미). / Sign/base semantics rule. */
  readonly sign: SignRule;
  /** 결측 처우 기본. / Default missing-handling policy. */
  readonly missing: MissingPolicy;
  /** 집계 적법성(REQ-T2-805). / Aggregation legality. */
  readonly aggregation: AggregationLegality;
  /** 원시값 → 값 객체 파싱(편집 커밋·임포트 진입점). / Parse a raw value into a value object. */
  parse(raw: unknown, ctx?: ParseContext): DomainValue;
}

/** 컬럼 값 메타(개방형 기술자) — 적합 타입 해석 입력. / Open column descriptor for type resolution. */
export interface ColumnValueMeta {
  readonly kind?: ValueKind;
  readonly dataType?: string;
  readonly unit?: string;
  readonly currencyCode?: string;
  readonly intlLocale?: string;
  readonly precision?: number;
  readonly nullable?: boolean;
}

/**
 * ValueTypeRegistry — 값 타입 카탈로그(REQ-TX-831). / ValueType catalog.
 */
export interface ValueTypeRegistry {
  /** 값 타입 등록(additive; 동일 kind 재등록=last-wins 승격). / Register a value type (last-wins). */
  register(type: ValueType): void;
  /** kind 로 조회(미등록 → PLAIN 폴백, throw 아님). / Resolve by kind; unknown → PLAIN fallback. */
  get(kind: ValueKind): ValueType;
  /** 등록 여부. / Whether a kind is registered. */
  has(kind: ValueKind): boolean;
  /** 컬럼 메타로 적합 타입 해석. / Resolve a suitable type from column meta. */
  resolveForColumn(meta: ColumnValueMeta): ValueType;
}

/** dataType(기존 컬럼 힌트) → ValueKind 매핑. / Map legacy column dataType to a ValueKind. */
const DATATYPE_TO_KIND: Record<string, ValueKind> = {
  number: 'number',
  string: 'text',
  money: 'money',
  currency: 'money',
  percent: 'percent',
  ratio: 'ratio',
};

/**
 * 기본 ValueTypeRegistry 구현(REQ-TX-831). / Default registry implementation.
 */
export class DefaultValueTypeRegistry implements ValueTypeRegistry {
  private _map = new Map<ValueKind, ValueType>();

  register(type: ValueType): void { this._map.set(type.kind, type); }

  get(kind: ValueKind): ValueType { return this._map.get(kind) ?? plainType; }

  has(kind: ValueKind): boolean { return this._map.has(kind); }

  resolveForColumn(meta: ColumnValueMeta): ValueType {
    if (meta.kind && this.has(meta.kind)) return this.get(meta.kind);
    if (meta.currencyCode) return this.get('money');
    if (meta.dataType) {
      const mapped = DATATYPE_TO_KIND[meta.dataType];
      if (mapped && this.has(mapped)) return this.get(mapped);
    }
    return plainType;
  }
}

/** 기본 8+종 값 타입. / The built-in value types. */
export const DEFAULT_VALUE_TYPES: readonly ValueType[] = [
  plainNumberType, plainTextType,
  moneyType, ratioType, percentType, percentagePointType, growthRateType,
  deltaType, quantityType, missingType, errorType,
  normBasisType, thresholdSetType,
];

/**
 * 기본 값 타입이 등록된 레지스트리 생성(REQ-TX-831). / Create a registry with the built-in types registered.
 */
export function createDefaultRegistry(): DefaultValueTypeRegistry {
  const reg = new DefaultValueTypeRegistry();
  for (const t of DEFAULT_VALUE_TYPES) reg.register(t);
  return reg;
}
