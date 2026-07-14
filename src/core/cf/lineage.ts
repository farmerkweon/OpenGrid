// ============================================================
// DD-05 §2.4 규칙 계보 — RuleLineage(모델 우선) / DD-05 §2.4 rule lineage (model-first).
// REQ: T5-809 · T5-901
// ------------------------------------------------------------
// "어느 규칙이 왜 이겼나(발화 규칙·평가 임계·입력값·우선순위 승자)"를 툴팁 이전에 모델로 소유한다.
// 인스펙터(T5-901)·직렬화·디버그·회귀가 같은 계보 객체를 조회한다(툴팁 텍스트 재계산 금지). 순수·헤드리스.
// ============================================================

import type { CFCondition } from './CFRule.js';
import type { CellInput, ColumnStats, EvalCtx } from './eval-types.js';
import type { CFRule } from './CFRule.js';

/** 판정에 참조된 통계 스냅샷(계보 기록용, 함수 제외 스칼라만). / Scalar stats snapshot referenced by a verdict. */
export interface StatsSnapshot {
  readonly min?: number;
  readonly max?: number;
  readonly avg?: number;
  readonly stddev?: number;
  readonly count?: number;
  readonly distinct?: number;
}

/** 규칙 계보 — 어느 규칙이 왜 이겼나(REQ-T5-809). / Rule lineage — which rule won and why. */
export interface RuleLineage {
  readonly ruleId: string;
  readonly conditionType: CFCondition['type'];
  /** 발화 임계(비교값·N·σk·백분위 등). / Firing threshold (compare value, N, σk, percentile…). */
  readonly threshold: Readonly<Record<string, unknown>>;
  /** 판정에 쓰인 원시값. / The raw value used for the verdict. */
  readonly inputValue: unknown;
  /** 이 판정이 참조한 통계 스냅샷. / The stats snapshot this verdict referenced. */
  readonly statsUsed: StatsSnapshot;
  readonly priority: number;
  /** 이 규칙이 이긴(덮은) 하위 규칙 id. / Ids of lower rules this rule won over. */
  readonly wonOver: readonly string[];
}

/** 계보 조회 API — 인스펙터·직렬화·디버그·회귀가 공유(REQ-T5-901). / Lineage query shared by inspector/tests. */
export interface CFLineageQuery {
  /** 발화한 규칙들의 계보를 우선순위 순으로 반환. / Return fired rules' lineage in priority order. */
  explain(input: CellInput, rules: readonly CFRule[], stats: ColumnStats, ctx: EvalCtx): RuleLineage[];
}

/** ColumnStats(함수 포함)에서 계보용 스칼라 스냅샷만 추출. / Extract the scalar-only lineage snapshot. */
export function snapshotStats(stats: ColumnStats): StatsSnapshot {
  const s: {
    min?: number; max?: number; avg?: number; stddev?: number; count?: number; distinct?: number;
  } = {};
  if (stats.min !== undefined) s.min = stats.min;
  if (stats.max !== undefined) s.max = stats.max;
  if (stats.avg !== undefined) s.avg = stats.avg;
  if (stats.stddev !== undefined) s.stddev = stats.stddev;
  if (stats.count !== undefined) s.count = stats.count;
  if (stats.distinct !== undefined) s.distinct = stats.distinct;
  return s;
}
