// ============================================================
// DD-13 §2.8 릴리스 게이트 정본 — ReleaseGate (REQ-TX-871)
// / DD-13 §2.8 Release gate — the canonical single blocking gate.
// perf·mem·bundle·contrast·a11y 5개 예산을 단일 블로킹 게이트로 조립(AND). 하나라도 초과 시 차단
// + 원인 지표·REQ 리포트. 순수·헤드리스. 하위게이트는 ISubGate 로 additive 확장(OCP).
// ============================================================

import type { RegressionJudge, MetricVerdict } from './RegressionJudge.js';
import type { ContrastAuditor, AppearanceSnapshotLike } from './ContrastAuditor.js';

/** 5대 하위 게이트. / The 5 sub-gates. */
export type SubGateId = 'perf' | 'memory' | 'bundle' | 'contrast' | 'a11y';

/** 하위 게이트 실패 항목. / A sub-gate failure item. */
export interface SubGateFailure {
  readonly metricId: string;
  readonly measured: number;
  readonly budget: number;
  readonly reqIds: readonly string[];
}

/** 하위 게이트 결과. / A sub-gate result. */
export interface SubGateResult {
  readonly id: SubGateId;
  readonly status: 'pass' | 'fail';
  readonly failures: readonly SubGateFailure[];
}

/** 릴리스 종합 판정. / Aggregate release verdict. */
export interface ReleaseVerdict {
  readonly status: 'pass' | 'blocked';
  readonly subGates: readonly SubGateResult[];
  /** 차단 시: 원인 하위게이트·지표·REQ 요약(리포트 SSOT). / Blocking reasons (report SSOT). */
  readonly blockingReasons: ReadonlyArray<{ subGate: SubGateId; metricId: string; reqIds: readonly string[] }>;
}

/**
 * 게이트 컨텍스트 — 하위 게이트 입력 버킷. 각 게이트는 필요한 것만 읽는다.
 * / Gate context — input buckets; each sub-gate reads only what it needs.
 */
export interface GateContext {
  /** 실측 지표맵(perf/memory/bundle). / measured metric map. */
  readonly metrics?: Readonly<Record<string, number>>;
  /** 외관 토큰 스냅샷(contrast/a11y). / appearance token snapshots. */
  readonly snapshots?: readonly AppearanceSnapshotLike[];
}

/** 하위 게이트 공통 계약 — OCP seam(신규 예산 축 additive 추가). / Sub-gate contract (OCP seam). */
export interface ISubGate {
  readonly id: SubGateId;
  run(ctx: GateContext): Promise<SubGateResult>;
}

/** 체크리스트 항목(자동/수동). / A checklist item. */
export interface ReleaseChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly automated: boolean;
  readonly subGate?: SubGateId;
}

/**
 * 회귀 기반 하위게이트 — RegressionJudge 판정을 지표 prefix 로 선별해 perf/memory/bundle 축에 배정.
 * / Regression-based sub-gate — selects RegressionJudge verdicts by metric-id prefix.
 */
export class RegressionSubGate implements ISubGate {
  constructor(
    readonly id: SubGateId,
    private readonly judge: RegressionJudge,
    /** 이 게이트가 소유하는 지표인지 판별(prefix 등). / owns-this-metric predicate. */
    private readonly owns: (metricId: string) => boolean,
  ) {}

  async run(ctx: GateContext): Promise<SubGateResult> {
    const metrics = ctx.metrics ?? {};
    const verdicts: MetricVerdict[] = this.judge.judge(metrics).filter(v => this.owns(v.metricId));
    const failures = verdicts
      .filter(v => v.status === 'fail-budget' || v.status === 'fail-regression')
      .map(v => ({ metricId: v.metricId, measured: v.measured, budget: v.budget, reqIds: v.reqIds }));
    return { id: this.id, status: failures.length ? 'fail' : 'pass', failures };
  }
}

/**
 * 대비 기반 하위게이트 — ContrastAuditor 전수 판정을 contrast/a11y 축에 배정. 미달 1건이라도 실패.
 * / Contrast-based sub-gate — maps ContrastAuditor verdicts to the contrast/a11y axis.
 */
export class ContrastSubGate implements ISubGate {
  constructor(
    readonly id: SubGateId,
    private readonly auditor: ContrastAuditor,
  ) {}

  async run(ctx: GateContext): Promise<SubGateResult> {
    const snapshots = ctx.snapshots ?? [];
    const pairs = this.auditor.enumeratePairs(snapshots);
    const verdicts = this.auditor.audit(pairs);
    const failures = this.auditor.failures(verdicts).map(v => ({
      metricId: `contrast.${v.pair.context.theme}.${v.pair.context.skin}.${v.pair.context.state}.${v.pair.context.tokenId}`,
      measured: v.ratio,
      budget: v.required,
      reqIds: ['REQ-TX-814', 'REQ-TX-813'] as readonly string[],
    }));
    return { id: this.id, status: failures.length ? 'fail' : 'pass', failures };
  }
}

/**
 * 릴리스 게이트 — 산재 게이트가 참조하는 단일 정본.
 * CRC: 5개 하위 게이트 조립·단일 blocking 판정 | 협력: RegressionSubGate·ContrastSubGate·…
 * 불변식: subGates 중 하나라도 fail → 전체 blocked(AND 게이트). 부분통과 개념 없음.
 * / Release gate — the single canonical AND-gate.
 */
export class ReleaseGate {
  constructor(private readonly subGates: readonly ISubGate[]) {}

  async evaluate(ctx: GateContext): Promise<ReleaseVerdict> {
    const results = await Promise.all(this.subGates.map(g => g.run(ctx)));
    const blockingReasons: Array<{ subGate: SubGateId; metricId: string; reqIds: readonly string[] }> = [];
    for (const r of results) {
      if (r.status === 'fail') {
        for (const f of r.failures) {
          blockingReasons.push({ subGate: r.id, metricId: f.metricId, reqIds: f.reqIds });
        }
      }
    }
    const blocked = results.some(r => r.status === 'fail');
    return {
      status: blocked ? 'blocked' : 'pass',
      subGates: results,
      blockingReasons,
    };
  }

  /**
   * 커버리지: 5대 정본 축(perf·memory·bundle·contrast·a11y) 중 조립된 하위게이트가 없는 축 지목.
   * evaluate() 는 등록된 게이트만 판정하므로, 미등록 축은 침묵 통과한다 — 이 메서드가 그 갭을 계량한다.
   * / Coverage: canonical axes with no assembled sub-gate. evaluate() silently passes missing axes;
   * this measures that gap (measurability guard, mirrors RegressionJudge/RealBrowserGate.coverageGaps).
   */
  coverageGaps(): SubGateId[] {
    const CANONICAL: readonly SubGateId[] = ['perf', 'memory', 'bundle', 'contrast', 'a11y'];
    const present = new Set(this.subGates.map(g => g.id));
    return CANONICAL.filter(id => !present.has(id));
  }

  /** 체크리스트 정본 렌더(자동/수동 항목). / Render the canonical checklist. */
  checklist(): ReleaseChecklistItem[] {
    return [
      { id: 'perf-p95', label: '성능 p95 예산·회귀(≤5%) 통과 / perf p95 budget & regression', automated: true, subGate: 'perf' },
      { id: 'memory', label: '메모리 ≤400MB·detached=0 / memory ≤400MB, detached=0', automated: true, subGate: 'memory' },
      { id: 'bundle', label: '번들 gzip ≤108KB / bundle gzip ≤108KB', automated: true, subGate: 'bundle' },
      { id: 'contrast', label: '대비 AA 전수(bodyText≥4.5) / contrast AA sweep', automated: true, subGate: 'contrast' },
      { id: 'a11y', label: '접근성 스위트(WCAG/VPAT) / a11y suite', automated: true, subGate: 'a11y' },
    ];
  }
}
