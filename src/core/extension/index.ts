// ============================================================
// DD-10 확장 아키텍처 배럴 / extension-architecture barrel
// ------------------------------------------------------------
// 확장 저작자 편의용 단일 진입점. SPI 정본은 소유 DD(재-export 만, 재정의 아님, §5.3).
// DD-10 소유: IRegistry/TypedRegistry(단일 제네릭 계약)·정책·예약 가드·IExtension 수명·
// IValidator·SlotProvider·conformance 키트·진화 인프라(Deprecation/Capability). 헤드리스.
// ============================================================

// ── 단일 제네릭 계약 + 정책 엔진(§2.1·§2.2·§2.3) ──
export {
  TypedRegistry,
  orderedApply,
  detectAmbiguousOrder,
  spiCompatible,
} from './Registry.js';
export type {
  IRegistry,
  RegisterOptions,
  RegisterResult,
  RegisterAction,
  RegisterReason,
  RegistryEntry,
  EntryOrigin,
  DuplicatePolicy,
  DeprecationInfo,
  TypedRegistryConfig,
} from './Registry.js';

// ── 예약 네임스페이스 가드(§2.4) ──
export { RESERVED_PREFIXES, isReserved } from './reserved.js';

// ── 공통 수명 계약 + IValidator(정본 소유) + peer 검증(§2.5·§2.8) ──
export { verifyPeer, compareSemver, Capabilities } from './IExtension.js';
export type {
  IExtension,
  IValidator,
  ValResult,
  CoreCapabilities,
  CapabilitiesSpec,
  ExtensionPeer,
  PeerVerdict,
} from './IExtension.js';

// ── 뷰 슬롯 provider 통일(§2.7) ──
export { createSlotRegistry, safeMount } from './SlotRegistry.js';
export type { ISlotProvider, SlotRegistry, SlotName, SlotHost, SlotHandle } from './SlotRegistry.js';

// ── 재사용 계약 테스트 키트(§2.6) ──
export {
  baseExtensionChecks,
  runConformance,
  conformancePassed,
  registryConformanceKit,
  BASE_REGISTRY_CHECK_IDS,
} from './conformance.js';
export type { ConformanceKit, ConformanceCheck, ConformanceResult } from './conformance.js';

// ── 진화 인프라: deprecation(§2.8) ──
export { DeprecationManager } from './DeprecationManager.js';
export type { DeprecationRecord } from './DeprecationManager.js';

// ── 파라미터화 레지스트리 인스턴스/팩토리(§5.3) ──
export {
  createCellTypeRegistry,
  createFormatterRegistry,
  createValidatorRegistry,
  createExtensionRegistry,
} from './registries.js';

// ── 기존 레지스트리 → IRegistry 어댑터(§5.2·§4.5, 파괴적 재작성 금지) ──
export { adaptRegistry, adaptFormatterRegistry, adaptSkinRegistry } from './adapters.js';
export type { RegistryBridge } from './adapters.js';

// ── SPI 정본 재-export(소유 DD, 시그니처 재정의 아님, §5.3) ──
export type { ICellRenderer } from '../render/CellRenderRequest.js';
export type { IFormatter } from '../format/types.js';
