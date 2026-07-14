// ============================================================
// DD-11 §2.4b AppearanceView — 외관 읽기 전용 좁은 포트(DD-11 소유·export, ISP)
// / DD-11 §2.4b AppearanceView — the narrow read-only appearance port (owned/exported by DD-11).
// ------------------------------------------------------------
// 설계 근거(Why, §2.4b·§R.2·REQ-T1-805/806/T6-814):
//   CF(DD-05)·렌더(DD-03) 등 **외관을 읽기만** 하는 협력자를 위해, 축 레지스트리·컴포저 전체가
//   아니라 **필요한 읽기 표면만** 노출한다(ISP). 데이터색↔의미색 컨텍스트 분리(REQ-T1-806)를 포트
//   시그니처가 강제한다(`rampFrom` ≠ `semanticInk` — 의미 빨강을 시리즈 색으로 재사용 금지).
//   **소유권(§R.2)**: 이 포트가 정본. DD-05 cf/appearance.ts 의 좁은 AppearanceView(rampFrom(seed):
//   string)는 통합 시 이 포트의 어댑터로 배선한다(cfPortFrom, 아래). 헤드리스·순수.
// ============================================================

import type { ResolvedAppearanceSnapshot } from './ResolvedAppearanceSnapshot.js';
import type { Appearance } from './Appearance.js';

/** 의미색(상태) 역할. / Semantic (status) color role. */
export type SemanticRole = 'error' | 'warning' | 'success' | 'info';

/**
 * AppearanceView — 외관 읽기 전용 좁은 포트(DD-11 소유·export).
 * / AppearanceView — the narrow read-only appearance port (owned/exported by DD-11).
 */
export interface AppearanceView {
  /** 현재 확정 외관(값 애그리게이트). / Current resolved appearance. */
  readonly appearance: Appearance;
  /** 데이터색 램프(키 고정 — 시리즈·히트맵·데이터바 공유 단일 소스). / Data-color ramp (key-stable, single source). */
  rampFrom(key: string): readonly string[];
  /** 의미색(상태) 토큰 조회 — 상태색을 데이터색으로 재사용 금지(컨텍스트 분리). / Semantic (status) color lookup. */
  semanticInk(role: SemanticRole): string;
  /** 비-DOM 표면용 해소 스냅샷(§2.4). / Resolved snapshot for non-DOM surfaces. */
  snapshot(): ResolvedAppearanceSnapshot;
}

/**
 * CF(DD-05) 좁은 포트 형태 — cf/appearance.ts 의 rampFrom(seed):string 와 정합(재선언 없이 어댑터).
 * / The CF (DD-05) narrow-port shape — matches cf/appearance.ts's rampFrom(seed):string.
 */
export interface CFAppearancePort {
  rampFrom(seed: 'primary' | 'graphite'): string;
  radius?(px: number): string;
}

/**
 * cfPortFrom — DD-11 AppearanceView → DD-05 CF 좁은 포트 어댑터(통합 배선용).
 * CF 는 시드색 1개를 물어본다 → view.rampFrom('primary'|'graphite') 램프의 대표색(첫 항목)을 반환.
 * / cfPortFrom — adapts a DD-11 AppearanceView to the DD-05 CF narrow port (integration wiring).
 *
 * @param view - DD-11 외관 읽기 포트 / A DD-11 appearance read port
 * @returns CF 가 소비하는 좁은 포트 / The narrow port CF consumes
 */
export function cfPortFrom(view: AppearanceView): CFAppearancePort {
  return {
    rampFrom: (seed) => {
      const ramp = view.rampFrom(seed);
      return ramp[0] ?? (seed === 'primary' ? '#1976d2' : '#3a3f45');
    },
  };
}

/** 기본 의미색(상태) — themes.css 상태색과 정합하는 폴백. / Default semantic (status) colors. */
export const DEFAULT_SEMANTIC_INK: Readonly<Record<SemanticRole, string>> = {
  error: '#d32f2f',
  warning: '#f9a825',
  success: '#388e3c',
  info: '#1976d2',
};

/**
 * staticAppearanceView — 테스트·기본용 정적 읽기 포트(순수·DOM 무의존).
 * rampFrom 은 시드 램프를, semanticInk 는 기본 상태색을 반환(데이터색↔의미색 분리 유지).
 * / staticAppearanceView — a static read port for tests/defaults (pure, DOM-free).
 *
 * @param cfg - 외관·스냅샷·램프 override(선택) / Appearance/snapshot/ramp overrides
 * @returns 정적 읽기 포트 / A static read port
 */
export function staticAppearanceView(cfg: {
  appearance: Appearance;
  snapshot: ResolvedAppearanceSnapshot;
  ramps?: Readonly<Record<string, readonly string[]>>;
  semantic?: Readonly<Record<SemanticRole, string>>;
}): AppearanceView {
  const ramps = cfg.ramps ?? {};
  const semantic = cfg.semantic ?? DEFAULT_SEMANTIC_INK;
  return {
    appearance: cfg.appearance,
    rampFrom: (key) => ramps[key] ?? [],
    semanticInk: (role) => semantic[role],
    snapshot: () => cfg.snapshot,
  };
}
