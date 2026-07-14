// ============================================================
// DD-11 §5·§9.1 tokenCatalog — 공개 토큰 SSOT(이름·축·기본값·설명) + 인스펙터 데이터 모델
// / DD-11 §5·§9.1 tokenCatalog — public token SSOT + inspector data model.
// ------------------------------------------------------------
// 설계 근거(Why, §9.1·REQ-T1-014/016/030):
//   `--og-*` 공개 토큰의 이름·소속 축·기본값·설명을 담은 **토큰 카탈로그**(라이브 인스펙터 데이터
//   모델의 근거). 직교성은 규율이 아니라 **이름공간이 강제**한다 — 카탈로그의 axis 필드가 "이름만
//   보고 소유 축을 안다" 를 데이터로 확증한다. semantic 토큰층(surface/ink/accent/line)은 alias 로
//   기존 토큰에 매핑(구 이름 전량 보존 = 회귀 0). 색은 3 바운디드 컨텍스트(의미색·데이터색·장식색)로
//   분리(REQ-T1-806). 헤드리스·순수(데이터만).
// ============================================================

import type { AxisId } from './AppearanceAxis.js';

/** 색 바운디드 컨텍스트(REQ-T1-806) — 의미 빨강을 시리즈 색으로 재사용 금지. / Color bounded context. */
export type ColorContext = 'semantic' | 'data' | 'decorative' | 'chrome';

/** 토큰 카탈로그 1건 — 인스펙터가 소비하는 데이터 모델. / One token catalog entry — the inspector's data model. */
export interface TokenCatalogEntry {
  /** 토큰 이름(예: '--og-ink'). / Token name. */
  readonly name: string;
  /** 소속 축(이름공간이 강제). / Owning axis (enforced by namespace). */
  readonly axis: AxisId;
  /** 기본값(오늘의 리터럴/참조). / Default value (today's literal/reference). */
  readonly default: string;
  /** 설명(인스펙터 툴팁). / Description (inspector tooltip). */
  readonly desc: string;
  /** 색 토큰이면 바운디드 컨텍스트. / Bounded context for color tokens. */
  readonly context?: ColorContext;
  /** semantic alias 가 가리키는 실토큰(있으면). / The concrete token a semantic alias points to (if any). */
  readonly aliasOf?: string;
}

/**
 * 공개 토큰 카탈로그(SSOT). 이름만 보고 소유 축을 안다(§9.1 직교 증거).
 * 대표 집합 — 신규 컴포넌트/인스펙터가 축·컨텍스트·기본값을 조회하는 단일 소스.
 * / The public token catalog (SSOT). Representative set.
 */
export const TOKEN_CATALOG: ReadonlyArray<TokenCatalogEntry> = [
  // ── 색(COLOR / theme) — semantic 레벨 + 기존 alias ──
  { name: '--og-accent', axis: 'theme', default: 'var(--og-primary)', desc: '강조색(프라이머리) semantic 레벨', context: 'semantic', aliasOf: '--og-primary' },
  { name: '--og-surface', axis: 'theme', default: 'var(--og-row-bg)', desc: '표면(배경) semantic 레벨', context: 'semantic', aliasOf: '--og-row-bg' },
  { name: '--og-line', axis: 'theme', default: 'var(--og-border-color)', desc: '보더/구획선 semantic 레벨', context: 'semantic', aliasOf: '--og-border-color' },
  { name: '--og-primary', axis: 'theme', default: '#1976d2', desc: '프라이머리 색', context: 'semantic' },
  { name: '--og-border-color', axis: 'theme', default: '#e0e0e0', desc: '보더 색', context: 'chrome' },
  { name: '--og-status-error', axis: 'theme', default: '#d32f2f', desc: '상태: 오류(의미색 — 데이터색 재사용 금지)', context: 'semantic' },
  { name: '--og-status-warning', axis: 'theme', default: '#f9a825', desc: '상태: 경고', context: 'semantic' },
  { name: '--og-status-success', axis: 'theme', default: '#388e3c', desc: '상태: 성공', context: 'semantic' },
  { name: '--og-status-info', axis: 'theme', default: '#1976d2', desc: '상태: 정보', context: 'semantic' },
  { name: '--og-texture-ink', axis: 'theme', default: '0 0 0', desc: '질감 잉크(rgb 채널) — 질감 결이 참조하는 색(장식색)', context: 'decorative' },

  // ── 형태(FORM / skin) ──
  { name: '--og-radius-md', axis: 'skin', default: '4px', desc: '중간 반경(형태)' },
  { name: '--og-border-style', axis: 'skin', default: 'solid', desc: '보더 스타일(형태)' },
  { name: '--og-border-width', axis: 'skin', default: '1px', desc: '보더 두께(형태)' },
  { name: '--og-elevation-md', axis: 'skin', default: 'none', desc: '엘리베이션(그림자, 형태)' },
  { name: '--og-focus-width', axis: 'skin', default: '2px', desc: '포커스 링 두께(형태, ≥2px 비협상)' },
  { name: '--og-focus-style', axis: 'skin', default: 'solid', desc: '포커스 링 스타일(형태, none 금지)' },
  { name: '--og-icon-corner', axis: 'skin', default: 'miter', desc: '아이콘 모서리(형태)' },

  // ── 밀도(DENSITY / density) — 신설 축 ──
  { name: '--og-density-row-height', axis: 'density', default: '32px', desc: '행 높이(밀도) — relayout 트리거' },
  { name: '--og-density-header-height', axis: 'density', default: '34px', desc: '헤더 높이(밀도)' },
  { name: '--og-density-footer-height', axis: 'density', default: '32px', desc: '푸터 높이(밀도)' },
  { name: '--og-font-size', axis: 'density', default: '13px', desc: '폰트 크기(밀도-타이포 동조 파생)' },
  { name: '--og-density-touch-min', axis: 'density', default: '44px', desc: '터치 히트타깃 하한(밀도)' },

  // ── 질감(TEXTURE / texture) — 신설 축 ──
  { name: '--og-texture-bg', axis: 'texture', default: 'none', desc: '질감 결(gradient 레시피, --og-texture-ink 참조)', context: 'decorative' },
  { name: '--og-texture-size', axis: 'texture', default: 'auto', desc: '질감 반복 크기' },
  { name: '--og-texture-opacity', axis: 'texture', default: '0', desc: '질감 알파(정직 상한 0.1)' },
  { name: '--og-texture-seam', axis: 'texture', default: 'none', desc: '실땀(무광 스티치 — 대각 해칭 금지)', context: 'decorative' },
  { name: '--og-texture-zone', axis: 'texture', default: 'chrome', desc: '질감 존(chrome|all — 데이터셀 배경 금지는 코어 불변식)' },
];

/** semantic alias 목록(구 토큰 보존 매핑). / Semantic alias list (legacy-token-preserving map). */
export const SEMANTIC_ALIASES: ReadonlyArray<TokenCatalogEntry> = TOKEN_CATALOG.filter(
  (e) => e.aliasOf !== undefined,
);

/** 축별 토큰 조회(인스펙터 그룹핑). / Look up tokens by axis (inspector grouping). */
export function tokensByAxis(axis: AxisId): TokenCatalogEntry[] {
  return TOKEN_CATALOG.filter((e) => e.axis === axis);
}

/** 이름 → 카탈로그 항목(축·기본값·컨텍스트). / Name → catalog entry. */
export function catalogEntry(name: string): TokenCatalogEntry | undefined {
  return TOKEN_CATALOG.find((e) => e.name === name);
}
