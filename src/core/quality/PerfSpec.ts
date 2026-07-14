// ============================================================
// DD-13 §2.1 성능 요구 명세(SPS) 데이터 모델 (REQ-TX-801·802·808)
// / DD-13 §2.1 Performance Spec (SPS) data model.
// SPS 는 산문이 아니라 실행 가능한 선언형 데이터. CI 벤치가 이 객체를 순회하며 각 셀을 실측·assert 한다.
// "예산 배정 없이 머지 금지" = 이 배열에 항목이 없으면 게이트가 미커버로 실패.
// 순수 데이터·헤드리스(DOM/전역 미접근).
// ============================================================

/** 규모 축 — 대표 워크로드. / Scale axis — representative workloads. */
export type Scale = '10k' | '100k' | '1m';

/** 조작 축 — 7대 핵심 조작(SPS 매트릭스 행). / Operation axis — the 7 core operations (SPS matrix rows). */
export type Operation =
  | 'initialRender' | 'verticalScroll' | 'sort' | 'filter'
  | 'cellEditCommit' | 'cfRecalc' | 'themeSwitch';

/**
 * 상호작용 지연 등급(TX-802) — 정성어를 수치로 못박는 SSOT. 모든 상호작용 예산은 이 등급 하나를 인용.
 * / Interaction latency class (TX-802) — the SSOT that pins qualitative words to numbers.
 */
export enum LatencyClass {
  Instant      = 'instant',       // keypress→paint ≤16.7ms (1프레임)
  Immediate    = 'immediate',     // 지각적 즉시 ≤100ms
  Responsive   = 'responsive',    // INP p75 ≤200ms
  Heavy        = 'heavy',         // ≥300ms → 진행표시 트리거 의무
}

/** 지연 등급별 상한(ms) — 의도적 고정(표준·SSOT). / Per-class latency ceilings (ms) — intentionally fixed. */
export const LATENCY_MS: Readonly<Record<LatencyClass, number>> = {
  [LatencyClass.Instant]: 16.7,
  [LatencyClass.Immediate]: 100,
  [LatencyClass.Responsive]: 200,
  [LatencyClass.Heavy]: 300,
};

/**
 * 단일 예산 셀 — SPS 매트릭스의 한 칸(조작×규모).
 * 불변식: 모든 임계는 상한(≤)이거나 하한(≥, fps만). null=해당 규모에서 미측정 명시(누락과 구분).
 * / A single budget cell — one square (operation×scale) of the SPS matrix.
 */
export interface PerfBudget {
  readonly op: Operation;
  readonly scale: Scale;
  readonly p50Ms?: number;          // 지연 중앙값 상한 / p50 latency ceiling
  readonly p95Ms: number;           // 지연 95퍼센타일 상한(게이트 1급 지표) / p95 ceiling (first-class gate metric)
  readonly minFps?: number;         // 프레임 예산 하한(스크롤류) / frame-rate floor (scroll-like)
  readonly maxDomNodes?: number;    // 라이브 DOM 노드 상한(TX-803 연동, DD-02 NodeBudget 소유) / live DOM node cap
  readonly latencyClass: LatencyClass; // 이 셀이 인용하는 지연 등급(TX-802) / referenced latency class
  readonly reqIds: readonly string[];  // 이 예산이 봉사하는 REQ(추적성) / served REQ ids
}

/**
 * per-feature 렌더 예산 — 가시행 기준 노드/프레임(TX-801 원장·TX-808 각론).
 * "빈 그리드는 빨라도 CF 켜지면 무너진다" — 총론이 아닌 기능별 각론.
 * / per-feature render budget — nodes/frame per visible row.
 */
export interface FeatureBudget {
  readonly feature: 'cf' | 'sparkline' | 'databar' | 'heatmap' | 'widgetCell' | 'chart';
  readonly scale: Scale;
  readonly nodesPerVisibleRow: number; // 가시행당 추가 노드 상한 / extra nodes per visible row
  readonly frameMs: number;            // 이 기능이 켜진 상태 프레임 예산(ms) / frame budget with this feature on
  readonly reqIds: readonly string[];
}

/** TTFR·페인트·CLS 예산(TX-801). mount→첫 페인트. / TTFR·paint·CLS budget (TX-801). */
export interface PaintBudget {
  readonly scale: Scale;
  readonly ttfrMs: number;   // mount→첫 렌더행 페인트 / mount→first rendered-row paint
  readonly ttiMs: number;    // Time To Interactive p95 / Time To Interactive p95
  readonly cls: number;      // Cumulative Layout Shift 예산(=0) / CLS budget (=0)
}

/** 상주 메모리 상한 곡선(TX-804). / Resident-memory ceiling curve (TX-804). */
export interface MemoryBudget {
  readonly scale: Scale;
  readonly maxResidentMb: number;   // 100만행 ≤400MB / 1M rows ≤400MB
  readonly maxDetachedNodes: number; // mount/unmount 100회 후 =0 / detached nodes after 100 mount/unmount cycles
}

/**
 * 통합 성능 명세 — 단일 SSOT 애그리게이트.
 * 이 객체 하나가 "성능이 무엇을 의미하는가"의 유일한 정본. CI·문서·대시보드가 모두 이걸 인용.
 * / Aggregate performance spec — the single SSOT.
 */
export interface PerfSpec {
  readonly version: string;             // semver — 예산 변경 이력 추적 / tracks budget change history
  readonly operations: readonly PerfBudget[];   // 7조작×3규모=21셀(전수) / 7 ops × 3 scales = 21 cells
  readonly features: readonly FeatureBudget[];  // 6+시각기능×규모 / 6+ visual features × scale
  readonly paint: readonly PaintBudget[];
  readonly memory: readonly MemoryBudget[];
  /** 커버리지 계약: 신규 기능 키가 등장했는데 예산이 없으면 게이트 실패(머지 금지 강제). */
  readonly coveredFeatures: readonly string[];
}

// ── 대표 예산(선언형 SSOT) — 1M 값은 DD-13 §2.1 브리프와 바이트 정합 ──────────
// initialRender.p95=500 · tti.p95=1000 · verticalScroll.minFps=55 · sort/filter.p95=600
// · memory.maxResidentMb=400 · cls=0 · maxDomNodes=5000(DD-02 NodeBudget 소유 상한 대조)

const TX = (...ids: string[]): readonly string[] => Object.freeze(ids);

/** 21셀(7조작×3규모) 예산 원장. / 21-cell (7 ops × 3 scales) budget ledger. */
const OPERATIONS: readonly PerfBudget[] = Object.freeze([
  // initialRender — 로드 무거움(Heavy). 1M p95≤500(브리프).
  { op: 'initialRender', scale: '10k',  p50Ms: 80,  p95Ms: 300, maxDomNodes: 5000, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801', 'REQ-TX-803') },
  { op: 'initialRender', scale: '100k', p50Ms: 150, p95Ms: 400, maxDomNodes: 5000, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801', 'REQ-TX-803') },
  { op: 'initialRender', scale: '1m',   p50Ms: 250, p95Ms: 500, maxDomNodes: 5000, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801', 'REQ-TX-803') },
  // verticalScroll — 연속 스크롤 프레임 예산. minFps 하한, p95Ms=프레임 시간. 1M ≥55fps(=18.18ms/frame, DD-07 정합).
  { op: 'verticalScroll', scale: '10k',  p95Ms: 16.7, minFps: 60, maxDomNodes: 5000, latencyClass: LatencyClass.Instant, reqIds: TX('REQ-TX-801', 'REQ-TX-803') },
  { op: 'verticalScroll', scale: '100k', p95Ms: 17.2, minFps: 58, maxDomNodes: 5000, latencyClass: LatencyClass.Instant, reqIds: TX('REQ-TX-801', 'REQ-TX-803') },
  { op: 'verticalScroll', scale: '1m',   p95Ms: 18.2, minFps: 55, maxDomNodes: 5000, latencyClass: LatencyClass.Instant, reqIds: TX('REQ-TX-801', 'REQ-TX-803') },
  // sort — 1M p95≤600(브리프).
  { op: 'sort', scale: '10k',  p50Ms: 40,  p95Ms: 150, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801') },
  { op: 'sort', scale: '100k', p50Ms: 120, p95Ms: 350, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801') },
  { op: 'sort', scale: '1m',   p50Ms: 300, p95Ms: 600, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801') },
  // filter — 1M p95≤600(브리프).
  { op: 'filter', scale: '10k',  p50Ms: 40,  p95Ms: 150, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801') },
  { op: 'filter', scale: '100k', p50Ms: 120, p95Ms: 350, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801') },
  { op: 'filter', scale: '1m',   p50Ms: 300, p95Ms: 600, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-801') },
  // cellEditCommit — 지각적 즉시(Immediate ≤100ms), 규모 무관.
  { op: 'cellEditCommit', scale: '10k',  p50Ms: 20, p95Ms: 100, latencyClass: LatencyClass.Immediate, reqIds: TX('REQ-TX-801', 'REQ-TX-802') },
  { op: 'cellEditCommit', scale: '100k', p50Ms: 25, p95Ms: 100, latencyClass: LatencyClass.Immediate, reqIds: TX('REQ-TX-801', 'REQ-TX-802') },
  { op: 'cellEditCommit', scale: '1m',   p50Ms: 30, p95Ms: 100, latencyClass: LatencyClass.Immediate, reqIds: TX('REQ-TX-801', 'REQ-TX-802') },
  // cfRecalc — 조건부서식 재계산.
  { op: 'cfRecalc', scale: '10k',  p50Ms: 30,  p95Ms: 100, latencyClass: LatencyClass.Responsive, reqIds: TX('REQ-TX-808') },
  { op: 'cfRecalc', scale: '100k', p50Ms: 80,  p95Ms: 200, latencyClass: LatencyClass.Responsive, reqIds: TX('REQ-TX-808') },
  { op: 'cfRecalc', scale: '1m',   p50Ms: 150, p95Ms: 300, latencyClass: LatencyClass.Heavy, reqIds: TX('REQ-TX-808') },
  // themeSwitch — 테마 전환.
  { op: 'themeSwitch', scale: '10k',  p50Ms: 30, p95Ms: 100, latencyClass: LatencyClass.Responsive, reqIds: TX('REQ-TX-801') },
  { op: 'themeSwitch', scale: '100k', p50Ms: 50, p95Ms: 150, latencyClass: LatencyClass.Responsive, reqIds: TX('REQ-TX-801') },
  { op: 'themeSwitch', scale: '1m',   p50Ms: 80, p95Ms: 200, latencyClass: LatencyClass.Responsive, reqIds: TX('REQ-TX-801') },
]);

const FEATURES: readonly FeatureBudget[] = Object.freeze([
  { feature: 'cf',         scale: '1m', nodesPerVisibleRow: 1, frameMs: 18, reqIds: TX('REQ-TX-808') },
  { feature: 'sparkline',  scale: '1m', nodesPerVisibleRow: 1, frameMs: 18, reqIds: TX('REQ-TX-808') },
  { feature: 'databar',    scale: '1m', nodesPerVisibleRow: 2, frameMs: 18, reqIds: TX('REQ-TX-808') },
  { feature: 'heatmap',    scale: '1m', nodesPerVisibleRow: 1, frameMs: 18, reqIds: TX('REQ-TX-808') },
  { feature: 'widgetCell', scale: '1m', nodesPerVisibleRow: 3, frameMs: 18, reqIds: TX('REQ-TX-808') },
  { feature: 'chart',      scale: '1m', nodesPerVisibleRow: 0, frameMs: 18, reqIds: TX('REQ-TX-808') },
]);

const PAINT: readonly PaintBudget[] = Object.freeze([
  { scale: '10k',  ttfrMs: 300, ttiMs: 400,  cls: 0 },
  { scale: '100k', ttfrMs: 500, ttiMs: 700,  cls: 0 },
  { scale: '1m',   ttfrMs: 500, ttiMs: 1000, cls: 0 },
]);

const MEMORY: readonly MemoryBudget[] = Object.freeze([
  { scale: '10k',  maxResidentMb: 100, maxDetachedNodes: 0 },
  { scale: '100k', maxResidentMb: 200, maxDetachedNodes: 0 },
  { scale: '1m',   maxResidentMb: 400, maxDetachedNodes: 0 },
]);

/** 기본 성능 명세 SSOT(v1). / Default performance spec SSOT (v1). */
export const DEFAULT_PERF_SPEC: PerfSpec = Object.freeze({
  version: '1.0.0',
  operations: OPERATIONS,
  features: FEATURES,
  paint: PAINT,
  memory: MEMORY,
  coveredFeatures: Object.freeze(FEATURES.map(f => f.feature)),
});

// ── 예산 조회·assert 헬퍼(순수) ─────────────────────────────────────────────

/** 지표 id 규약: `${op}.${scale}.p95` 등 — 기준선/판정 키의 SSOT. / Metric id convention. */
export function metricId(op: Operation, scale: Scale, kind: 'p50' | 'p95' | 'fps' = 'p95'): string {
  return `${op}.${scale}.${kind}`;
}

/** op×scale 예산 셀 조회. 없으면 undefined. / Look up the op×scale budget cell. */
export function findBudget(spec: PerfSpec, op: Operation, scale: Scale): PerfBudget | undefined {
  return spec.operations.find(b => b.op === op && b.scale === scale);
}

/** 단일 예산 assert 결과. / Single budget assertion result. */
export interface BudgetCheck {
  readonly metricId: string;
  readonly measured: number;
  readonly budget: number;
  /** fps/처리량 하한 지표면 true(작을수록 실패). / true for a floor metric (smaller = failing). */
  readonly isFloor: boolean;
  readonly withinBudget: boolean;
}

/**
 * 측정 p95(ms)를 op×scale 상한과 대조. 상한 초과 시 withinBudget=false.
 * / Assert a measured p95 (ms) against the op×scale ceiling.
 */
export function assertP95(spec: PerfSpec, op: Operation, scale: Scale, measuredMs: number): BudgetCheck {
  const b = findBudget(spec, op, scale);
  const budget = b?.p95Ms ?? Number.POSITIVE_INFINITY;
  return {
    metricId: metricId(op, scale, 'p95'),
    measured: measuredMs,
    budget,
    isFloor: false,
    withinBudget: measuredMs <= budget,
  };
}

/**
 * 측정 fps 를 op×scale 하한과 대조(스크롤류). 하한 미만이면 withinBudget=false.
 * / Assert a measured fps against the op×scale floor (scroll-like).
 */
export function assertFps(spec: PerfSpec, op: Operation, scale: Scale, measuredFps: number): BudgetCheck {
  const b = findBudget(spec, op, scale);
  const budget = b?.minFps ?? 0;
  return {
    metricId: metricId(op, scale, 'fps'),
    measured: measuredFps,
    budget,
    isFloor: true,
    withinBudget: measuredFps >= budget,
  };
}
