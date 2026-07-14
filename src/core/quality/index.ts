// ============================================================
// DD-13 성능·품질 게이트 인프라 — 배럴 export
// / DD-13 performance & quality gate infrastructure — barrel export.
// dev/CI 전용 계량 계층(기능을 만들지 않고 예산·기준선·판정을 소유). 순수·헤드리스.
// 코어 편입은 PerfHooks(경량 마크, 콜백 미등록 시 no-op)뿐 — 나머지는 트리셰이크로 프로덕션 0바이트.
// ============================================================

// §2.1 성능 요구 명세(SPS) / performance spec
export type {
  Scale, Operation, PerfBudget, FeatureBudget, PaintBudget, MemoryBudget, PerfSpec, BudgetCheck,
} from './PerfSpec.js';
export {
  LatencyClass, LATENCY_MS, DEFAULT_PERF_SPEC, metricId, findBudget, assertP95, assertFps,
} from './PerfSpec.js';

// §2.2 계측 훅 / instrumentation hooks
export type { RenderMetric, InteractionSample, LatencyStats, PerfHooks } from './hooks.js';
export { LatencyCollector } from './hooks.js';

// §2.3 기준선·회귀 판정 / baseline & regression
export type { MetricUnit, BaselineEntry, PerfBaseline } from './PerfBaseline.js';
export { DEFAULT_REGRESSION_TOLERANCE_PCT, EMPTY_BASELINE, makeBaseline } from './PerfBaseline.js';
export type { MetricVerdict } from './RegressionJudge.js';
export { RegressionJudge } from './RegressionJudge.js';

// §2.4 결정론 이음새 / determinism seam
export type { IClock, IRandom } from './DeterminismKernel.js';
export { DeterminismKernel, SystemClock, SeededRandom, FakeClock } from './DeterminismKernel.js';

// §2.5 픽셀 계량 커널 + 시각회귀 하니스 / pixel metrics + visual regression
export type { ImageLike } from './pixelMetrics.js';
export { changedPixelRatio, ssim, maxDeltaE } from './pixelMetrics.js';
export type {
  SnapshotSpec, DiffThreshold, DiffResult, ICapturer, IGoldenStore, MatrixConfig,
} from './VisualRegression.js';
export { DEFAULT_DIFF_THRESHOLD, VisualRegressionHarness, snapshotKey } from './VisualRegression.js';

// §2.6 대비 AA 스위트 / contrast AA suite
export type { ContrastPair, ContrastVerdict, AppearanceSnapshotLike } from './ContrastAuditor.js';
export { CONTRAST_MIN, ContrastAuditor } from './ContrastAuditor.js';

// §2.7 실브라우저 게이트 / real-browser gate
export type {
  PixelAssertion, NodeCountAssertion, RenderGateCase, AssertionResult, CaseResult,
  RenderGateReport, ICaseRunner,
} from './RealBrowserGate.js';
export { RealBrowserGate } from './RealBrowserGate.js';

// §2.8 릴리스 게이트 / release gate
export type {
  SubGateId, SubGateFailure, SubGateResult, ReleaseVerdict, GateContext, ISubGate,
  ReleaseChecklistItem,
} from './ReleaseGate.js';
export { RegressionSubGate, ContrastSubGate, ReleaseGate } from './ReleaseGate.js';
