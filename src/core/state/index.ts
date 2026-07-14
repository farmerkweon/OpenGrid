// ============================================================
// DD-09 상태층 배럴 / DD-09 state-layer barrel.
// additive 신설 — 봉투 합성·버전권위·왕복보증·자동저장·멀티탭. 조각 스키마는 각 소유 DD 위임.
// 헤드리스·순수 TS(브라우저 매체는 어댑터 뒤로 격리).
// ============================================================

export {
  DefaultSemVerPolicy,
  asSemVer,
  type SemVer,
  type ParsedSemVer,
  type Classification,
  type ClassifyContext,
  type SemVerPolicy,
} from './SemVerPolicy.js';

export {
  StateCodec,
  type StateEnvelope,
  type ISectionCodec,
  type SectionLoadResult,
  type LoadResult,
  type StateCodecConfig,
} from './StateCodec.js';

export {
  DefaultSchemaMigrator,
  type SchemaMigrator,
  type MigrationStep,
  type MigrationNote,
  type MigrateResult,
} from './SchemaMigrator.js';

export {
  InMemoryStatePersistence,
  LocalStorageStatePersistence,
  type IStatePersistence,
  type PersistedRecord,
} from './IStatePersistence.js';

export { MultiTabGuard, type TabConflictNotice } from './MultiTabGuard.js';

export {
  AutosaveController,
  type AutosavePolicy,
  type AutosaveControllerConfig,
  type DraftStatus,
  type DraftDiff,
} from './AutosaveController.js';
