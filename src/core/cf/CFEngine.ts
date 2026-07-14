// ============================================================
// DD-05 §2.6 조율자 — CFEngine 파사드 + CFRuleStore + 계보 조회 / DD-05 §2.6 CFEngine facade.
// REQ: T5-808 · T5-803 · T5-809 · T5-016
// ------------------------------------------------------------
// DD-03 가 셀당 1회 호출하는 유일한 진입점. 순수 파이프: 평가 → 인코딩 → 잉크 → VisualSpec[].
// statsNeedsFor 는 컬럼에 걸린 전 규칙의 통계 needs 합집합(엔진→DD-02 스캔 계약, REQ-T5-803).
// 레이어 우선순위(선택>조건부>데이터색)는 DD-03 compositor 소유 — CF 는 배경/데코 층만 산출. 헤드리스.
// ============================================================

import type { CFRule } from './CFRule.js';
import type { CellInput, ColumnStats, EvalCtx, StatKind } from './eval-types.js';
import type { CellRect } from '../coordinate/index.js';
import type { AppearanceView } from './appearance.js';
import { DefaultCFEvaluator, type CFEvaluator } from './CFEvaluator.js';
import { createRuleTypeRegistry, type CFRuleTypeRegistry } from './predicates.js';
import { createEncoderRegistry, type CFEncoderRegistry, type VisualSpec } from './encoders.js';
import type { CFLineageQuery, RuleLineage } from './lineage.js';

/** 스코프별 규칙 인덱스(컬럼→규칙). 직렬화·상태는 DD-09 소유; 여기선 조회 인덱스만. / Scope-indexed rule store. */
export class CFRuleStore {
  private readonly byColumn = new Map<string, CFRule[]>();
  private readonly all: CFRule[] = [];

  constructor(rules: readonly CFRule[] = []) {
    for (const r of rules) this.add(r);
  }

  /** 규칙 추가(컬럼 인덱스 갱신). / Add a rule (updates the column index). */
  add(rule: CFRule): void {
    this.all.push(rule);
    const list = this.byColumn.get(rule.scope.columnId) ?? [];
    list.push(rule);
    this.byColumn.set(rule.scope.columnId, list);
  }

  /** 이 컬럼에 걸린 규칙(스코프 1차 필터). / Rules scoped to this column. */
  rulesFor(columnId: string): readonly CFRule[] {
    return this.byColumn.get(columnId) ?? [];
  }

  /** 전 규칙. / All rules. */
  list(): readonly CFRule[] {
    return this.all;
  }
}

/**
 * CF 하위도메인 파사드. 평가기·인코더·규칙 저장소·술어 레지스트리를 조율한다.
 * / CF subdomain facade — orchestrates evaluator, encoders, rule store, and predicate registry.
 */
export class CFEngine implements CFLineageQuery {
  private readonly evaluator: CFEvaluator;

  constructor(
    private readonly rules: CFRuleStore,
    private readonly encoders: CFEncoderRegistry = createEncoderRegistry(),
    private readonly ruleTypes: CFRuleTypeRegistry = createRuleTypeRegistry(),
    evaluator?: CFEvaluator,
  ) {
    this.evaluator = evaluator ?? new DefaultCFEvaluator(ruleTypes);
  }

  /** 계보 조회 파사드(인스펙터·디버그·회귀). / Lineage query facade. */
  get lineage(): CFLineageQuery {
    return this;
  }

  /**
   * 셀 하나의 시각 스펙(배경/데코) 산출 — 순수 파이프: 평가 → 인코딩 → 잉크.
   * 미지 인코더는 skip(하위호환). 배경 승자 1 + 데코 다중을 VisualSpec[] 로 반환.
   * / Produce a cell's visual specs (background/decorator) — pure: evaluate → encode → ink.
   *
   * @param input - 셀 평가 입력 / Cell evaluation input
   * @param stats - 컬럼 통계 스냅샷 / Column stats snapshot
   * @param appearance - 외관 읽기 포트(색 시드) / Appearance read port (color seed)
   * @param rect - DD-02 셀 사각형 / DD-02 cell rect
   * @param ctx - 평가 컨텍스트(now 주입) / Evaluation context (now injected)
   * @returns 배경(최대 1) + 데코 VisualSpec 배열 / Background (≤1) + decorator VisualSpecs
   */
  paintFor(input: CellInput, stats: ColumnStats, appearance: AppearanceView, rect: CellRect, ctx: EvalCtx): VisualSpec[] {
    const verdict = this.evaluator.evaluate(this.rules.rulesFor(input.columnId), input, stats, ctx);
    const out: VisualSpec[] = [];
    if (verdict.background) {
      const enc = this.encoders.get(verdict.background.encode.kind);
      if (enc) out.push(enc.encode(verdict.background, appearance, rect));
    }
    for (const dec of verdict.decorators) {
      const enc = this.encoders.get(dec.encode.kind);
      if (enc) out.push(enc.encode(dec, appearance, rect));
    }
    return out;
  }

  /**
   * 이 컬럼에 걸린 전 규칙의 통계 needs 합집합(엔진→DD-02 스캔 계약, REQ-T5-803). 미지 술어는 무시.
   * / Union of stats needs across all rules scoped to this column (engine → DD-02 scan contract).
   *
   * @param columnId - 컬럼 식별자 / Column id
   * @returns 결정론 정렬된 StatKind 배열 / A deterministically-sorted StatKind array
   */
  statsNeedsFor(columnId: string): StatKind[] {
    const needs = new Set<StatKind>();
    for (const rule of this.rules.rulesFor(columnId)) {
      const pred = this.ruleTypes.get(rule.when.type);
      if (!pred) continue;
      for (const n of pred.needs) needs.add(n);
    }
    return [...needs].sort();
  }

  /** 발화한 규칙들의 계보를 우선순위 순으로 반환(툴팁 재계산 금지). / Fired rules' lineage in priority order. */
  explain(input: CellInput, rules: readonly CFRule[], stats: ColumnStats, ctx: EvalCtx): RuleLineage[] {
    const verdict = this.evaluator.evaluate(rules, input, stats, ctx);
    const out: RuleLineage[] = [];
    if (verdict.background) out.push(verdict.background.lineage);
    for (const dec of verdict.decorators) out.push(dec.lineage);
    return out.sort((a, b) => a.priority - b.priority);
  }
}
