// ============================================================
// DD-02 좌표 SSOT·가상화 서브시스템 배럴 / DD-02 coordinate SSOT & virtualization barrel
// 순수 커널(헤드리스). 소비처는 CoordinateKernel 을 유일 창구로 질의한다.
// ============================================================
export {
  type ModelIndex,
  type ViewIndex,
  type LeafColIndex,
  type Px,
  type IndexRange,
  type CellRect,
  type PaneId,
  type CellPlacement,
  px,
  modelIndex,
  viewIndex,
  leafColIndex,
  makeRange,
  makeRect,
  unbrandPx,
} from './types.js';

export { RowMetrics } from './RowMetrics.js';
export { ColumnMetrics } from './ColumnMetrics.js';
export { ViewPermutation } from './ViewPermutation.js';
export { FrozenPanes } from './FrozenPanes.js';
export { NodeBudget, type NodeBudgetResult } from './NodeBudget.js';
export { ResizeGovernor, type ResizeDecision, type ResizeStats } from './ResizeGovernor.js';
export {
  CoordinateKernel,
  type CoordinateSnapshot,
  type CoordinateKernelDeps,
} from './CoordinateKernel.js';
export {
  type IWindowingPort,
  type IMeasurementSeam,
  type IMergeSource,
  type SliceKey,
  SLICE_OWNERSHIP,
} from './ports.js';
export { MergeSourceAdapter, EMPTY_MERGE_SOURCE } from './MergeSourceAdapter.js';
