// ============================================================
// DD-11 외관 시스템 배럴 — 색×형태×질감×밀도 4직교축 + 컴포지션 루트 + 스냅샷 브리지 + 전파 경계.
// / DD-11 appearance-system barrel. additive 신설 — 기존 SkinRegistry/AppearanceResolver 무교란.
// 헤드리스 계약: 값 객체·컴포저·축 레지스트리는 DOM 미참조(DOM 조회는 SnapshotBridge/Provider 경계).
// ============================================================

// ── 동형 축 SPI + 델타축 기반구현 ──
export type { AxisId, TokenDelta, AxisAttr, AxisResolution, AxisDefineResult, IAppearanceAxis, TokenAxisConfig } from './AppearanceAxis.js';
export { DEFAULT_AXIS_VALUE, EMPTY_RESOLUTION, assertNamespace, TokenAxis } from './AppearanceAxis.js';

// ── 밀도 축(신설) ──
export {
  DensityRegistry,
  densityRegistry,
  DENSITY_TOKENS,
  TOUCH_MIN_PX,
  BUILTIN_DENSITIES,
  DENSITY_COMPACT,
  DENSITY_COMFORTABLE,
  DENSITY_SPACIOUS,
  DENSITY_GALLERY,
  DENSITY_COMPACT_TOUCH,
} from './DensityRegistry.js';

// ── 질감 축(신설) ──
export {
  TextureRegistry,
  textureRegistry,
  TEXTURE_TOKENS,
  TEXTURE_OPACITY_CAP,
  BUILTIN_TEXTURES,
  TEXTURE_LINEN,
  TEXTURE_PAPER_GRAIN,
  TEXTURE_GRAPH,
} from './TextureRegistry.js';

// ── 테마 메타 축(신설) + 색⊥형태 대칭 강제 ──
export type { ThemeMeta, EmotionalTemperature } from './ThemeMetaRegistry.js';
export {
  ThemeMetaRegistry,
  themeMetaRegistry,
  assertColorOnly,
  BUILTIN_THEME_METAS,
} from './ThemeMetaRegistry.js';

// ── 기존 축 어댑터(SkinRegistry·IconRegistry → IAppearanceAxis) ──
export { SkinAxisAdapter, IconAxisAdapter } from './axisAdapters.js';

// ── 값 애그리게이트 + 조합 판정 + 재질 서사 프리셋 ──
export type { AppearanceVerdict, AppearanceFinding, AppearanceMetaLookup, MaterialPreset } from './Appearance.js';
export { Appearance, worstVerdict, MATERIAL_PRESETS } from './Appearance.js';

// ── 단일 컴포지션 루트 ──
export type { AppearanceRegistrySet, ComposedAppearance } from './AppearanceComposer.js';
export { AppearanceComposer } from './AppearanceComposer.js';

// ── CSS→JS 스냅샷 브리지(비-DOM 표면용, 단일 정본=DD-11) ──
export type { ResolvedAppearanceSnapshot, SnapshotResolveFn, SnapshotTokenMap } from './ResolvedAppearanceSnapshot.js';
export {
  AppearanceSnapshotBridge,
  snapshotFromComputedStyle,
  DEFAULT_SNAPSHOT_TOKEN_MAP,
} from './ResolvedAppearanceSnapshot.js';

// ── 외관 읽기 전용 좁은 포트(ISP) + CF 어댑터 ──
export type { AppearanceView, SemanticRole, CFAppearancePort } from './AppearanceView.js';
export { cfPortFrom, staticAppearanceView, DEFAULT_SEMANTIC_INK } from './AppearanceView.js';

// ── 전파 발행-구독 경계 ──
export type { AppearanceListener } from './AppearanceProvider.js';
export { AppearanceProvider } from './AppearanceProvider.js';

// ── 토큰 카탈로그 SSOT + 인스펙터 모델 ──
export type { TokenCatalogEntry, ColorContext } from './tokenCatalog.js';
export { TOKEN_CATALOG, SEMANTIC_ALIASES, tokensByAxis, catalogEntry } from './tokenCatalog.js';

// ── 기본 축 묶음 팩토리 + 공유 컴포저 ──
export { defaultAppearanceRegistrySet, defaultAppearanceComposer } from './defaults.js';
