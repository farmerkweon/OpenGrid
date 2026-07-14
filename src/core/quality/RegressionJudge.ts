// ============================================================
// DD-13 §2.3 회귀 판정기 — SPS 예산 + 기준선 2중 게이트 (REQ-TX-801·871)
// / DD-13 §2.3 Regression judge — SPS budget + baseline double gate.
// 규칙: (1) 절대 예산 위반 → fail-budget. (2) 예산 내지만 기준 대비 +5% 초과 → fail-regression.
// fps/처리량 지표는 하한이라 -5% 초과 하락이 회귀. 순수 함수(부작용 0)·헤드리스.
// ============================================================

import type { PerfSpec, Operation, Scale } from './PerfSpec.js';
import type { PerfBaseline } from './PerfBaseline.js';
import { DEFAULT_REGRESSION_TOLERANCE_PCT } from './PerfBaseline.js';

/** 한 지표의 판정 결과 — 게이트 산출의 최소 단위. / A single metric verdict — the atomic gate output. */
export interface MetricVerdict {
  readonly metricId: string;
  readonly measured: number;
  readonly baseline: number | null;  // null=신규 지표(기준 없음) / null = new metric
  readonly budget: number;           // SPS 절대 상한/하한 / SPS absolute ceiling/floor
  /** (measured-baseline)/baseline*100. baseline=null|0 이면 null(NaN 금지). / null when baseline is null/0. */
  readonly regressionPct: number | null;
  readonly status: 'pass' | 'fail-budget' | 'fail-regression' | 'new';
  readonly reqIds: readonly string[];
}

/** metricId → 예산 해석 결과. / Resolved budget for a metricId. */
interface ResolvedBudget {
  readonly budget: number;
  readonly isFloor: boolean;   // fps/처리량이면 true(하한) / true for floor metrics
  readonly reqIds: readonly string[];
}

const OPS: readonly Operation[] = [
  'initialRender', 'verticalScroll', 'sort', 'filter', 'cellEditCommit', 'cfRecalc', 'themeSwitch',
];
const SCALES: readonly Scale[] = ['10k', '100k', '1m'];

function isOperation(s: string): s is Operation {
  return (OPS as readonly string[]).includes(s);
}
function isScale(s: string): s is Scale {
  return (SCALES as readonly string[]).includes(s);
}

/**
 * metricId(`op.scale.kind` 등)를 SPS 예산으로 해석.
 * 조작 지표(p95/p50 상한·fps 하한·nodes 상한)·paint·memory 를 인식. 미인식은 budget=∞(회귀만).
 * / Resolve a metricId against the SPS budget.
 */
function resolveBudget(spec: PerfSpec, metricId: string): ResolvedBudget {
  const parts = metricId.split('.');
  // 조작 지표: op.scale.kind
  if (parts.length === 3 && isOperation(parts[0]!) && isScale(parts[1]!)) {
    const [op, scale, kind] = parts as [Operation, Scale, string];
    const cell = spec.operations.find(b => b.op === op && b.scale === scale);
    if (cell) {
      if (kind === 'p95') return { budget: cell.p95Ms, isFloor: false, reqIds: cell.reqIds };
      if (kind === 'p50') return { budget: cell.p50Ms ?? Number.POSITIVE_INFINITY, isFloor: false, reqIds: cell.reqIds };
      if (kind === 'fps') return { budget: cell.minFps ?? 0, isFloor: true, reqIds: cell.reqIds };
      if (kind === 'nodes') return { budget: cell.maxDomNodes ?? Number.POSITIVE_INFINITY, isFloor: false, reqIds: cell.reqIds };
    }
  }
  // feature 지표(TX-808 각론): feature.scale.(frameMs|nodesPerVisibleRow) — 둘 다 상한(≤).
  // / per-feature budget (TX-808): feature.scale.(frameMs|nodesPerVisibleRow), both ceilings.
  if (parts.length === 3 && isScale(parts[1]!)) {
    const f = spec.features.find(x => x.feature === parts[0] && x.scale === parts[1]);
    if (f) {
      if (parts[2] === 'frameMs') return { budget: f.frameMs, isFloor: false, reqIds: f.reqIds };
      if (parts[2] === 'nodesPerVisibleRow') return { budget: f.nodesPerVisibleRow, isFloor: false, reqIds: f.reqIds };
    }
  }
  // paint 지표: paint.scale.(ttfr|tti|cls)
  if (parts.length === 3 && parts[0] === 'paint' && isScale(parts[1]!)) {
    const p = spec.paint.find(x => x.scale === parts[1]);
    if (p) {
      if (parts[2] === 'ttfr') return { budget: p.ttfrMs, isFloor: false, reqIds: ['REQ-TX-801'] };
      if (parts[2] === 'tti') return { budget: p.ttiMs, isFloor: false, reqIds: ['REQ-TX-801'] };
      if (parts[2] === 'cls') return { budget: p.cls, isFloor: false, reqIds: ['REQ-TX-801'] };
    }
  }
  // memory 지표: memory.scale.(residentMb|detachedNodes)
  if (parts.length === 3 && parts[0] === 'memory' && isScale(parts[1]!)) {
    const m = spec.memory.find(x => x.scale === parts[1]);
    if (m) {
      if (parts[2] === 'residentMb') return { budget: m.maxResidentMb, isFloor: false, reqIds: ['REQ-TX-804'] };
      if (parts[2] === 'detachedNodes') return { budget: m.maxDetachedNodes, isFloor: false, reqIds: ['REQ-TX-804'] };
    }
  }
  // 미인식: 절대 예산 없음 → 회귀 판정만. / Unrecognized: no absolute budget, regression-only.
  return { budget: Number.POSITIVE_INFINITY, isFloor: false, reqIds: [] };
}

/**
 * 회귀 판정기 — SPS 예산 + 기준선을 함께 적용하는 2중 게이트.
 * CRC: 예산 위반·기준선 회귀 판정 | 협력: PerfSpec(예산)·PerfBaseline(기준선 DI).
 * / Regression judge — the SPS-budget + baseline double gate.
 */
export class RegressionJudge {
  constructor(
    private readonly spec: PerfSpec,
    private readonly baseline: PerfBaseline,
  ) {}

  /** 지표별 허용 회귀율(%) — override 없으면 기본 5. / Per-metric tolerance (%). */
  private tolerance(metricId: string): number {
    return this.baseline.toleranceOverrides?.[metricId] ?? DEFAULT_REGRESSION_TOLERANCE_PCT;
  }

  /**
   * 실측 지표맵을 받아 지표별 판정 배열 반환. 순수 함수(부작용 0).
   * / Judge a measured metric map into per-metric verdicts. Pure.
   */
  judge(measured: Readonly<Record<string, number>>): MetricVerdict[] {
    const out: MetricVerdict[] = [];
    for (const metricId of Object.keys(measured)) {
      const value = measured[metricId]!;
      const { budget, isFloor, reqIds } = resolveBudget(this.spec, metricId);
      const baseEntry = this.baseline.entries[metricId];
      const base = baseEntry ? baseEntry.value : null;

      // (1) 절대 예산 위반 우선. / Absolute budget violation first.
      const violatesBudget = isFloor ? value < budget : value > budget;

      // 회귀율(부호 유지) — baseline=null|0 이면 계산 불가(null). / Regression pct (signed).
      const regressionPct =
        base === null || base === 0 ? null : ((value - base) / base) * 100;

      let status: MetricVerdict['status'];
      if (violatesBudget) {
        status = 'fail-budget';
      } else if (base === null) {
        status = 'new';
      } else if (regressionPct !== null) {
        const tol = this.tolerance(metricId);
        const regressed = isFloor ? regressionPct < -tol : regressionPct > tol;
        status = regressed ? 'fail-regression' : 'pass';
      } else {
        status = 'pass';
      }

      out.push({ metricId, measured: value, baseline: base, budget, regressionPct, status, reqIds });
    }
    return out;
  }

  /**
   * 커버리지 검사: SPS coveredFeatures 중 실측에 없는 기능 지표 → 미커버 지목(머지 금지 강제).
   * / Coverage check: covered features with no measured metric → merge-blocking gaps.
   */
  coverageGaps(measured: Readonly<Record<string, number>>): string[] {
    const keys = Object.keys(measured);
    return this.spec.coveredFeatures.filter(
      feature => !keys.some(k => k === feature || k.startsWith(`${feature}.`)),
    );
  }
}
