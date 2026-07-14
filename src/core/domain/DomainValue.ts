// ============================================================
// DD-01 도메인 코어 — DomainValue 루트 추상 / DD-01 domain core — DomainValue root
// 레이어: Domain (순수·헤드리스·불변 값 객체)
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-01_domain-model.md §2.1
// REQ: T6-803 · TX-832 · T8-843 · T3-802 · T5-817
// ============================================================

import { OGDecimal } from '../OGDecimal.js';
import type { ValueType } from './ValueType.js';

/**
 * 값 종류 판별자(개방형). 미지 kind 는 원시값 폴백(REQ-TX-831).
 * / Open value-kind discriminant. Unknown kinds fall back to plain values.
 */
export type ValueKind =
  | 'number' | 'text' | 'money' | 'ratio' | 'percent' | 'percentagePoint'
  | 'growthRate' | 'delta' | 'quantity' | 'missing' | 'error'
  | 'normBasis' | 'thresholdSet' | 'aggregate' | 'cellAddress' | 'cellRange'
  | (string & {});

/**
 * 값 객체 직렬화 슬라이스(개방형 태그드 유니온). / Serialization slice for a value object.
 * 왕복 스키마·envelope 조립은 DD-09/TX-833 소유. 여기선 최소 형상만 정의.
 */
export interface DomainValueDTO {
  /** 역직렬화 시 registry.get(kind).parse 로 복원. / Kind used to restore via the registry. */
  readonly kind: ValueKind;
  /** 원시 원값(OGDecimal → 문자열로 정밀 보존). / Raw value (OGDecimal serialized as string). */
  readonly v?: string | number | null;
  /** 값종별 부속(currency·reason·code·unit 등). / Per-kind payload. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * 값 객체 루트. 불변·자기 도메인 인지·표현 무지(SRP).
 * / Value-object root. Immutable, domain-aware, presentation-agnostic.
 */
export interface DomainValue {
  /** 개방형 종류 판별자. / Open discriminant. */
  readonly kind: ValueKind;
  /** 소속 ValueType(메타 보유). / The owning ValueType (carries domain meta). */
  readonly type: ValueType;

  /** Missing 인스턴스일 때 true. / true when this is a Missing value. */
  isMissing(): boolean;
  /** ErrorValue 인스턴스일 때 true. / true when this is an ErrorValue. */
  isError(): boolean;
  /** null/none 계열일 때 true(실제 0 은 false). / true for null/none (real 0 is false). */
  isBlank(): boolean;

  /**
   * 구조적 동등성(REQ-T8-843) — 값 동등(참조 아님). / Structural (by-value) equality.
   * a.equals(b) ⟺ a.hashKey()===b.hashKey().
   */
  equals(other: DomainValue): boolean;
  /** 동등성/맵 키용 안정 해시 문자열. / Stable hash string for equality/map keys. */
  hashKey(): string;

  /**
   * 도메인 비교 규칙(REQ-T3-802) — 항상 전순서. / Total-order domain comparison.
   * 3단 층위: kindRank(정상<오류<결측) → kind 그룹키 → 동일 kind 도메인 순서.
   * @returns 음수/0/양수 (this </=/> other).
   */
  compareTo(other: DomainValue): number;

  /**
   * 로케일 인지 텍스트 등가물(REQ-T5-817) — aria 접근성 쌍둥이의 데이터 원천.
   * / Locale-aware text equivalent — data source for the accessible twin (aria).
   */
  textEquivalent(locale?: string): string;

  /** 직렬화 슬라이스. / Serialization slice. */
  toJSON(): DomainValueDTO;
}

/** 4-state 값 상태(REQ-TX-832) — 실제 0 을 blank 와 구분. / Four-state value state. */
export type ValueState = 'value' | 'zero' | 'blank' | 'error';

/**
 * 값 상태 분류(REQ-TX-832) — 실제 0 을 blank(없음)와 명확히 구분.
 * / Classify a value's state, distinguishing a real zero from a blank/missing value.
 */
export function classifyState(v: DomainValue): ValueState {
  if (v.isError()) return 'error';
  if (v.isMissing() || v.isBlank()) return 'blank';
  const n = numericOf(v);
  if (n !== null && n.isZero()) return 'zero';
  return 'value';
}

/**
 * 값 객체에서 정밀 수치 원값을 추출(없으면 null). / Extract the precise numeric backing value (or null).
 * NormalizationBasis·ThresholdSet·classifyState 공유. 결측/오류/텍스트는 null.
 */
export function numericOf(v: DomainValue): OGDecimal | null {
  if (v.isMissing() || v.isError()) return null;
  const a = v as unknown as Record<string, unknown>;
  if (a.amount instanceof OGDecimal) return a.amount;         // Money
  if (a.value instanceof OGDecimal) return a.value;           // Ratio/Percent/PP/PlainNumber/Quantity
  if (a.rate instanceof OGDecimal) return a.rate;             // GrowthRate
  if (a.magnitude instanceof OGDecimal) return a.magnitude;   // Delta
  return null;
}

/**
 * kindRank — 전순서 최상위 층(정상<오류<결측). / Top total-order layer: normal < error < missing.
 */
export function kindRank(v: DomainValue): number {
  if (v.isError()) return 1;
  if (v.isMissing()) return 2;
  return 0;
}

/**
 * 전순서 사전식 스캐폴드. kindRank → kind 그룹키까지 판정하고,
 * 동일 kind(비교 적합)면 null 을 반환해 호출자가 도메인 순서를 적용한다.
 * / Total-order scaffold. Resolves rank & cross-kind grouping; returns null when
 *   the two share a comparable kind so the caller applies the domain ordering.
 */
export function compareByRankAndKind(a: DomainValue, b: DomainValue): number | null {
  const ra = kindRank(a);
  const rb = kindRank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return null;
}

/** OGDecimal 3항 비교(-1/0/1). / OGDecimal three-way comparison. */
export function cmpDecimal(a: OGDecimal, b: OGDecimal): number {
  return a.lt(b) ? -1 : a.gt(b) ? 1 : 0;
}
