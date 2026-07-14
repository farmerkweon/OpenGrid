// ============================================================
// DD-05 §2.3 평가층 계약 — 순수 입출력 값객체(평가⟂적용의 평가 측) / DD-05 §2.3 evaluation contracts.
// REQ: T5-808 · T5-803
// ------------------------------------------------------------
// evaluate() 반환은 hex·px 가 전혀 없다 — 도메인 판정(정규화비율·구간인덱스·부호·계보)뿐.
// 이 순수성이 REQ-T5-808 수용기준("규칙집합+데이터로 DOM 없이 검증")을 그대로 만족한다.
// ColumnStats 는 엔진이 needs 합집합으로 미리 채워 주입(DD-02 스캔 위임). 순수·헤드리스.
// ============================================================

import type { CFEncodeSpec, CFStyleRef, CFInlineStyle, CFCondition } from './CFRule.js';
import type { RuleLineage } from './lineage.js';

/** 행 변경 상태(DD-03 rowState 정합). / Row mutation state. */
export type RowState = 'none' | 'added' | 'edited' | 'removed';

/** 조건이 요구하는 통계 종류. needs 선언 → 엔진이 컬럼 스캔 1회로 모은다(REQ-T5-803). / Stat kind. */
export type StatKind = 'min' | 'max' | 'avg' | 'stddev' | 'count' | 'distinct' | 'rank' | 'percentile' | 'cardinality';

/** 한 셀의 평가 입력 — 읽기 전용 투영. / One cell's evaluation input (read-only projection). */
export interface CellInput {
  readonly value: unknown;
  readonly rowIndex: number;
  readonly columnId: string;
  readonly rowState: RowState;
}

/**
 * 컬럼 전역 통계 스냅샷(엔진이 needs 합집합으로 채움). 순위·분위·중복은 함수로 조회.
 * / Column-wide stats snapshot (engine fills the needs union). Rank/percentile/dup are functional.
 */
export interface ColumnStats {
  readonly min?: number;
  readonly max?: number;
  readonly avg?: number;
  readonly stddev?: number;
  readonly count?: number;
  readonly distinct?: number;
  /** 1-based 내림차순 순위(1=최대). 동값은 최소(최상) 순위 공유. topN 용. / 1-based descending rank (1=max). */
  readonly rankOf?: (v: number) => number;
  /** 1-based 오름차순 순위(1=최소). bottomN 용. / 1-based ascending rank (1=min). */
  readonly rankAscOf?: (v: number) => number;
  /** 값 이하 비율 0..1(백분위). / Fraction of values ≤ v (percentile). */
  readonly percentileOf?: (v: number) => number;
  /** 값의 출현 횟수(중복/고유 판정). / Occurrence count of a value (dup/unique). */
  readonly countOf?: (v: number) => number;
}

/** 평가 컨텍스트 — now 주입으로 상대날짜 결정론(Date.now 금지). / Evaluation context; now injected for determinism. */
export interface EvalCtx {
  readonly now: number;
  readonly locale?: string;
}

/**
 * 규칙 발화 시 산출되는 도메인 결과(시각 원시값 아님). 인코더가 소비.
 * / The domain result produced when a rule fires (never a visual primitive); consumed by encoders.
 */
export interface RuleDatum {
  /** 정규화 비율 0..1(bar/scale continuous). / Normalized ratio 0..1. */
  readonly ratio?: number;
  /** 부호(-1|0|1) — 0기준 데이터바 양방향. / Sign (-1|0|1) for zero-based bidirectional bars. */
  readonly sign?: -1 | 0 | 1;
  /** 이산 구간 인덱스(0..bandCount-1). / Discrete band index. */
  readonly bandIndex?: number;
  /** 이산 구간 총수. / Total discrete bands. */
  readonly bandCount?: number;
  /** 판정에 쓰인 수치 원값(있으면). / The numeric value used (if any). */
  readonly value?: number;
  /** 클램프 발동 여부(범위 초과 고지, T5-007). / Whether clamping fired (out-of-range notice). */
  readonly clamped?: boolean;
}

/** 규칙 하나의 판정 — 도메인 값(시각 원시값 아님). / A single rule's verdict — domain values only. */
export interface RuleVerdict {
  readonly ruleId: string;
  readonly fired: boolean;
  /** 인코더가 소비할 인코딩 스펙. / The encode spec the encoder consumes. */
  readonly encode: CFEncodeSpec;
  /** 도메인 결과(정규화비율·구간·부호). / Domain result (ratio/band/sign). */
  readonly datum: RuleDatum;
  /** 이 규칙이 참조하는 스타일. / The style this rule references. */
  readonly styleRef?: CFStyleRef | CFInlineStyle;
  /** 계보(REQ-T5-809). / Lineage. */
  readonly lineage: RuleLineage;
}

/**
 * 셀 최종 판정 — 우선순위·Stop-If-True 병합 결과(§2.3, DD-03 CellVerdicts 와 동명이물이라 CF 접두).
 * / Cell final verdict — priority + Stop-If-True merge result (CF-prefixed to avoid DD-03 collision).
 */
export interface CFCellVerdict {
  /** 배경 층 승자(bar|scale 최상위 1). / Background winner (topmost bar|scale). */
  readonly background?: RuleVerdict;
  /** 데코 층(아이콘/스파크 다중). / Decorator layer (icon/sparkline; multiple). */
  readonly decorators: readonly RuleVerdict[];
  /** "왜 이 색인가" 대표 승자. / Representative winner ("why this color"). */
  readonly winner?: RuleVerdict;
  /** Stop-If-True 로 중단시킨 ruleId. / The ruleId that halted via Stop-If-True. */
  readonly stoppedAt?: string;
}

// ── 통계 계산 헬퍼(엔진·테스트 편의; 실계산·캐시·증분무효화는 DD-02/07 위임) ──────────────

/** 유한 수치만 추출(결측·비수치 제외). / Extract finite numerics only. */
function numeric(values: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * 컬럼 값 배열에서 ColumnStats 를 계산한다(min/max/avg/stddev/count/distinct + 순위·분위·중복 함수).
 * 실제 엔진은 DD-02/07 이 스캔·캐시하되, "무엇이 필요한가"는 CF 소유(REQ-T5-803). 이 헬퍼는 그 계약의
 * 참조 구현이자 테스트 편의다. 순수 함수.
 * / Compute ColumnStats from a column's values. Pure; a reference implementation of the stats contract.
 *
 * @param values - 컬럼 값(원시·문자열 포함) / Column values (primitives/strings)
 * @returns 순위·분위·중복 조회를 포함한 통계 스냅샷 / A stats snapshot including rank/percentile/dup lookups
 */
export function computeColumnStats(values: readonly unknown[]): ColumnStats {
  const nums = numeric(values);
  const count = nums.length;
  if (count === 0) return { count: 0, distinct: 0 };
  const sorted = [...nums].sort((a, b) => a - b); // ascending
  const min = sorted[0]!;
  const max = sorted[count - 1]!;
  const sum = nums.reduce((s, n) => s + n, 0);
  const avg = sum / count;
  const variance = nums.reduce((s, n) => s + (n - avg) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);
  const occ = new Map<number, number>();
  for (const n of nums) occ.set(n, (occ.get(n) ?? 0) + 1);
  const distinct = occ.size;

  // rankOf(v): 1 + (# strictly greater). 동값 공유(내림차순, 1=최대).
  const rankOf = (v: number): number => {
    let gt = 0;
    for (const n of nums) if (n > v) gt++;
    return gt + 1;
  };
  // rankAscOf(v): 1 + (# strictly less). 동값 공유(오름차순, 1=최소).
  const rankAscOf = (v: number): number => {
    let lt = 0;
    for (const n of nums) if (n < v) lt++;
    return lt + 1;
  };
  // percentileOf(v): (# ≤ v) / count.
  const percentileOf = (v: number): number => {
    let le = 0;
    for (const n of nums) if (n <= v) le++;
    return le / count;
  };
  const countOf = (v: number): number => occ.get(v) ?? 0;

  return { min, max, avg, stddev, count, distinct, rankOf, rankAscOf, percentileOf, countOf };
}
