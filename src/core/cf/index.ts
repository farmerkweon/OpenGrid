// ============================================================
// DD-05 조건부서식(CF) 규칙엔진 서브시스템 배럴 / DD-05 conditional-formatting rule-engine barrel.
// additive 신설 — 기존 CellTypeRegistry/CellRenderer 배선을 교란하지 않는다(스트랭글러).
// 헤드리스 계약: CF 는 DOM 을 만지지 않는다(VisualSpec 만). 평가⟂적용 순수성 유지.
// ============================================================

// ── 선언 스키마(값객체) ──
export type {
  CFRule,
  CFCondition,
  CFEncodeSpec,
  CFScope,
  CFStyleRef,
  CFInlineStyle,
} from './CFRule.js';
export { CF_SCHEMA_VERSION, isStyleRef, cfRuleEquals } from './CFRule.js';

// ── 외관 읽기 포트(DD-11 위임 경계) ──
export type { AppearanceView, CFRampSeed } from './appearance.js';
export { staticAppearanceView } from './appearance.js';

// ── 평가층 계약(순수) ──
export type {
  RowState,
  StatKind,
  CellInput,
  ColumnStats,
  EvalCtx,
  RuleDatum,
  RuleVerdict,
  CFCellVerdict,
} from './eval-types.js';
export { computeColumnStats } from './eval-types.js';

// ── 계보 ──
export type { RuleLineage, CFLineageQuery, StatsSnapshot } from './lineage.js';
export { snapshotStats } from './lineage.js';

// ── 조건 술어 카탈로그 + 레지스트리(OCP SPI) ──
export type { CFPredicate, CFRuleTypeRegistry } from './predicates.js';
export { BUILTIN_PREDICATES, createRuleTypeRegistry } from './predicates.js';

// ── 평가기 ──
export type { CFEvaluator } from './CFEvaluator.js';
export { DefaultCFEvaluator, computeDatum, scopeMatches } from './CFEvaluator.js';

// ── 색상스케일(단색 명도 램프·발산 중립) ──
export type { ScaleDomain } from './ColorScale.js';
export {
  NEUTRAL_MIDPOINT,
  sequentialColor,
  sequentialBands,
  divergingColor,
  divergingBands,
} from './ColorScale.js';

// ── 채움 위 텍스트 AA(잉크) ──
export type { InkResolver, InkDecision } from './InkResolver.js';
export { DefaultInkResolver, passesInkGate, AA_BODY } from './InkResolver.js';

// ── 적용층 인코더 + 레지스트리(OCP SPI) ──
export type { CFEncoder, VisualSpec, CFEncoderRegistry } from './encoders.js';
export {
  createEncoderRegistry,
  BarEncoder,
  ScaleEncoder,
  IconEncoder,
  SparklineEncoder,
} from './encoders.js';

// ── 직렬화 로더(미지 규칙 skip) + named style 레지스트리 ──
export type {
  CFRuleLoader,
  LoadResult,
  LoaderRegistries,
  SkipReport,
  SkipReason,
  CFNamedStyleRegistry,
} from './serialize.js';
export { DefaultCFRuleLoader, serializeRules, createNamedStyleRegistry } from './serialize.js';

// ── 파사드 + 규칙 저장소 ──
export { CFEngine, CFRuleStore } from './CFEngine.js';
