// ============================================================
// DD-14 호스트 어댑터·경계 서브시스템 배럴 / DD-14 host adapter & boundary barrel
// 어댑터의 유일 진입점은 createGridHost 팩토리. 구현 클래스는 은닉(캡슐화).
// ============================================================
export type {
  GridHostPort,
  GridPropsPatch,
  Unsubscribe,
  HostEventHandler,
} from './GridHostPort.js';

export { createGridHost, GridHostDriver } from './GridHostDriver.js';

export {
  reconcile,
  STRUCTURAL_KEYS,
  type ReconcilePlan,
  type StructuralKey,
} from './reconcile.js';

export {
  CapabilityRegistry,
  CAPABILITY_REGISTRY,
  computeParity,
  type Capability,
  type CapabilitySnapshot,
  type AdapterConformance,
  type AdapterId,
  type Priority,
  type ParityMatrix,
  type ParityCell,
  type AdapterParity,
} from './CapabilityRegistry.js';

// REQ-TX-841 강제 등록 — 좌표 슬라이스 직접변이 차단(런타임 가드).
export {
  sealSlice,
  assertSliceOwner,
  ownerOf,
  SliceOwnershipViolation,
  SLICE_KEYS,
} from './SliceOwnershipGuard.js';

// arch:check 정적 적합성 함수(의존방향·헤드리스 전역).
export {
  archCheck,
  formatViolations,
  type ArchViolation,
  type ArchRuleId,
  type SourceFile,
  type ArchCheckOptions,
} from './archCheck.js';
