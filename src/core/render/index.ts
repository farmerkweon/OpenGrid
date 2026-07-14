// ============================================================
// DD-03 렌더 파이프라인·셀 렌더러 서브시스템 배럴 / DD-03 render pipeline barrel
// additive 신설 — 기존 GridRenderer/RenderController 배선을 교란하지 않는다(스트랭글러 단계 1).
// 헤드리스 계약: DOM 접촉은 CellApplier/OverlayCompositor 2곳만.
// ============================================================

export type {
  Disposable,
  RuleVerdict,
  ValidationVerdict,
  CellVerdicts,
  CellRenderRequest,
  StageKind,
  ICellStage,
  ICellRenderer,
  BgRole,
  BgLayer,
  PaintNode,
  OverlayRole,
  OverlayLayer,
  StagePaint,
  StageTraceEntry,
  PaintAccumulator,
  RenderInterceptor,
} from './CellRenderRequest.js';
export { buildRequest } from './CellRenderRequest.js';

export {
  CellStageRegistry,
  defaultCellStageRegistry,
  registerCellStage,
  unregisterCellStage,
} from './CellStageRegistry.js';

export { RenderBudget, type RenderBudgetOptions, type OverBudgetEntry } from './RenderBudget.js';
export { CellApplier } from './CellApplier.js';
export { OverlayCompositor } from './OverlayCompositor.js';
export { CellErrorBoundary, StageCircuitBreaker, type StageScope } from './CellErrorBoundary.js';
export { CellPipeline } from './CellPipeline.js';
export {
  contrastText,
  needsOutlineFallback,
  parseColor,
  AA_CONTRAST,
} from './contrast.js';

export {
  BackgroundStage,
  ValueRendererStage,
  DecoratorStage,
  OverlayStage,
  registerBootstrapStages,
} from './stages/index.js';

import { CellStageRegistry } from './CellStageRegistry.js';
import { RenderBudget } from './RenderBudget.js';
import { CellApplier } from './CellApplier.js';
import { OverlayCompositor } from './OverlayCompositor.js';
import { CellErrorBoundary, StageCircuitBreaker } from './CellErrorBoundary.js';
import { CellPipeline } from './CellPipeline.js';
import { registerBootstrapStages } from './stages/index.js';

/** createDefaultPipeline 결과(파이프라인 + 협력자 핸들). / Result of createDefaultPipeline. */
export interface DefaultPipeline {
  readonly pipeline: CellPipeline;
  readonly registry: CellStageRegistry;
  readonly budget: RenderBudget;
  readonly compositor: OverlayCompositor;
  readonly boundary: CellErrorBoundary;
  readonly breaker: StageCircuitBreaker;
}

/**
 * 부트스트랩 4단계 + 기본 협력자로 완성된 파이프라인을 조립한다(자체 레지스트리 — 전역과 격리).
 * / Assemble a pipeline with the 4 bootstrap stages and default collaborators (own registry).
 *
 * @param opts - 예산 옵션(선택, 기본 frameMs 16·perCellMs 2) / Budget options
 * @returns 파이프라인과 협력자 핸들 / Pipeline plus collaborator handles
 */
export function createDefaultPipeline(opts?: { frameMs?: number; perCellMs?: number }): DefaultPipeline {
  const registry = new CellStageRegistry();
  registerBootstrapStages(registry);
  const budget = new RenderBudget({ frameMs: opts?.frameMs ?? 16, perCellMs: opts?.perCellMs ?? 2 });
  const applier = new CellApplier();
  const compositor = new OverlayCompositor();
  const boundary = new CellErrorBoundary();
  const breaker = new StageCircuitBreaker();
  const pipeline = new CellPipeline(registry, budget, applier, compositor, boundary, breaker);
  return { pipeline, registry, budget, compositor, boundary, breaker };
}
