// ============================================================
// DD-01 도메인 규칙 Strategy / DD-01 domain rule strategies
// 설계: DD-01 §2.1·§4.1(Strategy)·§4.4 · REQ-T2-803/804/805
// 부호 규칙·결측 처우·집계 적법성의 교체 가능한 정책 객체(값종 단위 주입).
// (리프 모듈 — 값 객체를 import 하지 않아 순환 없음.)
// ============================================================

/**
 * 부호·기저 규칙(REQ-T2-803). 회계부호/무변화 ε 등 의미 규칙(표현은 밖).
 * / Sign/base semantics rule (presentation lives outside).
 */
export interface SignRule {
  /** 음수 허용 여부. / Whether negatives are allowed. */
  readonly allowNegative: boolean;
}

/**
 * 결측 처우 정책(REQ-TX-832). 표식은 밖, 여기선 정책 값만.
 * / Missing-value handling policy (visual marks live outside).
 */
export interface MissingPolicy {
  /** 집계에서 제외/포함. / Excluded or included from aggregation. */
  readonly aggregation: 'excluded' | 'included';
  /** 정규화 스케일에서 제외 여부. / Excluded from normalization scale. */
  readonly scaleExcluded: boolean;
}

/**
 * 집계 적법성(REQ-T2-805). 타입별 허용 집계 선언(비율=가중평균, 통화=합, 코드=비집계).
 * / Aggregation legality: which aggregations are meaningful for a value type.
 */
export interface AggregationLegality {
  readonly legalFns: readonly string[];
  /** fn 이 이 타입에 적법한가. / Whether `fn` is legal for this type. */
  allows(fn: string): boolean;
}

// ── 기본 부호 규칙 / default sign rules ──────────────────────
export const SIGN_ALLOW_NEGATIVE: SignRule = { allowNegative: true };
export const SIGN_NON_NEGATIVE: SignRule = { allowNegative: false };

// ── 기본 결측 정책 / default missing policies ────────────────
export const MISSING_EXCLUDE: MissingPolicy = { aggregation: 'excluded', scaleExcluded: true };

// ── 집계 적법성 팩토리 / aggregation legality factory ────────
function legality(fns: readonly string[]): AggregationLegality {
  const set = new Set(fns);
  return { legalFns: fns, allows: (fn) => set.has(fn) };
}

/** 통화·수치: 합·평균·최소·최대·개수. / Money & numbers: sum/avg/min/max/count. */
export const AGG_NUMERIC: AggregationLegality = legality(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']);
/** 비율: 가중평균만(단순평균 금지). / Ratios: weighted mean only. */
export const AGG_WEIGHTED_MEAN: AggregationLegality = legality(['WMEAN', 'MIN', 'MAX', 'COUNT']);
/** 통화: 합·최소·최대·개수(평균은 가중 문맥). / Money: sum/min/max/count. */
export const AGG_MONEY: AggregationLegality = legality(['SUM', 'MIN', 'MAX', 'COUNT']);
/** 코드·텍스트: 비집계(개수만). / Codes & text: count only. */
export const AGG_NONE: AggregationLegality = legality(['COUNT']);
