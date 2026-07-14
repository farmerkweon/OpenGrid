// ============================================================
// DD-11 §2.1·§5 ThemeMetaRegistry — 테마 도메인 엔티티 레지스트리 + assertColorOnly(색⊥형태 대칭 강제)
// / DD-11 §2.1·§5 ThemeMetaRegistry — theme domain-entity registry + assertColorOnly.
// ------------------------------------------------------------
// 설계 근거(Why, §2.1·§5·불변식 1·REQ-T1-807/013):
//   테마를 "색 스와치" 가 아니라 **도메인 엔티티**(dark 짝·질감성·textureZone·의도·감정온도)로
//   모델링한다. Appearance.validate() 가 이 메타를 조회해 조합 불변식을 **객관적으로**(육안 아님)
//   집행한다(neumorph×dark·stitch×dark·질감테마 정합 등, §3.5).
//   `assertColorOnly` 는 `assertFormOnly`(SkinRegistry, 기존)의 **대칭**이다: 테마 델타에 형태/밀도/
//   질감 shape 토큰이 오면 등록 게이트에서 거부 → 색⊥형태 직교를 **양방향** 기계강제(불변식 1).
//   실제 색 토큰 CSS 는 themes.css(정적 번들)가 소유하므로 이 레지스트리는 메타·검증만 보유(무증량).
//   헤드리스·순수.
// ============================================================

import { FORM_TOKENS } from '../SkinRegistry.js';
import { DENSITY_TOKENS } from './DensityRegistry.js';
import { TEXTURE_TOKENS } from './TextureRegistry.js';
import type { AxisId, AxisResolution, IAppearanceAxis, TokenDelta, AxisDefineResult } from './AppearanceAxis.js';
import { DEFAULT_AXIS_VALUE, EMPTY_RESOLUTION } from './AppearanceAxis.js';

/** 감정 온도 — 색이 실어 나르는 정서 축(§9.6 재질 서사). / Emotional temperature the color carries. */
export type EmotionalTemperature = 'cool' | 'neutral' | 'warm';

/**
 * ThemeMeta — 한 테마의 도메인 속성(색 값이 아니라 **조합 판정용 메타**).
 * / ThemeMeta — a theme's domain attributes (not color values — metadata for combination verdicts).
 */
export interface ThemeMeta {
  /** 테마 id. / Theme id. */
  readonly id: string;
  /** 다크 테마인가(neumorph/stitch 위험 판정의 1차 축). / Is this a dark theme (primary axis for risk verdicts)? */
  readonly dark: boolean;
  /** 질감 테마인가(textureZone 을 chrome 이상으로 의도). / Is this a textured theme? */
  readonly textured: boolean;
  /** 이 테마가 의도하는 텍스처 존('chrome'|'all'|'off'). / Intended texture zone. */
  readonly textureZone?: 'chrome' | 'all' | 'off';
  /** 다크 짝 테마 id(있으면). / Paired dark theme id (if any). */
  readonly darkPair?: string;
  /** 감정 온도. / Emotional temperature. */
  readonly temperature?: EmotionalTemperature;
  /** 색 델타(선택 — 사용자 defineTheme 산출; 내장은 themes.css 소유라 비움). / Color delta (optional; built-ins live in themes.css). */
  readonly delta?: TokenDelta;
}

/** 색 축이 소유하지 않는(=거부 대상) shape 토큰 denylist. FORM ∪ DENSITY ∪ TEXTURE-shape. / Shape-token denylist for the color axis. */
const NON_COLOR_TOKENS: ReadonlySet<string> = new Set<string>([
  ...FORM_TOKENS,
  ...DENSITY_TOKENS,
  ...TEXTURE_TOKENS,
]);

/**
 * assertColorOnly — 테마 델타가 형태/밀도/질감 shape 토큰을 담지 않는지 검사(색⊥형태 대칭 강제).
 * `assertFormOnly` 의 거울상: 스킨은 색을, 테마는 형태를 담을 수 없다(불변식 1, REQ-T1-013).
 * / assertColorOnly — the mirror of assertFormOnly: a theme delta may not carry shape tokens.
 *
 * @param id - 테마 id / Theme id
 * @param delta - 검사할 색 델타 / Color delta to validate
 * @throws shape 토큰(FORM/DENSITY/TEXTURE)이 있으면 Error / Throws if a shape token is present
 */
export function assertColorOnly(id: string, delta: TokenDelta): void {
  for (const key of Object.keys(delta)) {
    // 예외: --og-font-size 는 density 소유이나 색 델타엔 오면 안 됨 → denylist 유지.
    if (NON_COLOR_TOKENS.has(key)) {
      throw new Error(
        `[ThemeMetaRegistry] 테마 "${id}" 의 토큰 "${key}" 은 형태/밀도/질감 축 소유입니다. ` +
        `테마(색) 델타는 shape 토큰을 담을 수 없습니다(색⊥형태 직교, 불변식 1). ` +
        `형태는 data-og-skin, 밀도는 data-og-density, 질감은 data-og-texture 축입니다.`,
      );
    }
  }
}

/**
 * ThemeMetaRegistry — 테마 메타 도메인 레지스트리(theme 축, IAppearanceAxis 정합).
 * theme 축은 **속성만** 발행한다(color 는 CSS var 라 브라우저가 런타임 재계산 = zero-rerender):
 * resolve(id) 는 사용자 defineTheme 델타가 있으면 그 델타를, 없으면 빈 델타 + `data-og-theme` 속성.
 * / ThemeMetaRegistry — the theme metadata domain registry (theme axis, IAppearanceAxis-conformant).
 *
 * @example
 * themeMetaRegistry.meta('dark')?.dark; // true
 * themeMetaRegistry.resolve('dark');     // { tokens:{}, attr:{name:'data-og-theme', value:'dark'} }
 */
export class ThemeMetaRegistry implements IAppearanceAxis {
  readonly id: AxisId = 'theme';
  /** 색 축은 개방 이름공간(themes.css 소유) — 검증은 denylist(assertColorOnly)로. namespace 는 참조용 빈 집합. */
  readonly namespace: ReadonlySet<string> = new Set<string>();
  private _metas = new Map<string, ThemeMeta>();

  /** 내장 테마 메타 등록(검증만 — CSS 는 themes.css). / Register a built-in theme meta (validation only). */
  registerBuiltin(meta: ThemeMeta): void {
    if (meta.delta) assertColorOnly(meta.id, meta.delta);
    this._metas.set(meta.id, meta);
  }

  /** 테마 메타 조회(없으면 undefined). / Look up a theme meta (undefined if absent). */
  meta(id: string): ThemeMeta | undefined {
    return this._metas.get(id);
  }

  /**
   * 사용자 테마 등록(defineTheme 산출 델타). 색⊥형태 검증 후 등록.
   * IAppearanceAxis.define 시그니처 정합: delta 는 색 델타, 메타는 delta 로부터 최소 추론(dark/textured 기본 false).
   * 풍부한 메타가 필요하면 registerBuiltin(ThemeMeta) 를 사용한다.
   * / Register a user theme (defineTheme output delta). Minimal meta inferred; use registerBuiltin for rich meta.
   */
  define(id: string, delta: TokenDelta): AxisDefineResult {
    assertColorOnly(id, delta);
    const existing = this._metas.get(id);
    const meta: ThemeMeta = existing
      ? { ...existing, delta }
      : { id, dark: false, textured: false, delta };
    this._metas.set(id, meta);
    return { delta, warnings: [] };
  }

  has(id: string): boolean {
    return this._metas.has(id);
  }

  resolve(valueId: string): AxisResolution {
    if (valueId === DEFAULT_AXIS_VALUE) {
      // theme default 도 오늘 data-og-theme 가 붙는다(기존 축) → 속성 유지, 토큰 비움.
      return { tokens: {}, attr: { name: 'data-og-theme', value: DEFAULT_AXIS_VALUE } };
    }
    const meta = this._metas.get(valueId);
    if (meta === undefined) {
      // 미등록 테마도 속성은 붙인다(themes.css 에 CSS 가 있을 수 있음 — never-throw).
      return { tokens: {}, attr: { name: 'data-og-theme', value: valueId } };
    }
    const tokens = meta.delta ?? EMPTY_RESOLUTION.tokens;
    return { tokens, attr: { name: 'data-og-theme', value: valueId } };
  }

  list(): string[] {
    return [...this._metas.keys()];
  }
}

// ─── 내장 테마 메타 (조합 판정용 대표 집합 — 전체 15테마 중 dark/textured 판정에 필요한 것) ───
// 색 값은 themes.css 소유. 여기서는 dark 짝·질감성만 선언(validate 규칙의 객관 근거).

/** 내장 테마 메타 카탈로그(대표). / Built-in theme meta catalog (representative). */
export const BUILTIN_THEME_METAS: ReadonlyArray<ThemeMeta> = [
  { id: 'default', dark: false, textured: false, temperature: 'cool', darkPair: 'dark' },
  { id: 'dark', dark: true, textured: false, temperature: 'cool' },
  { id: 'ocean', dark: false, textured: false, temperature: 'cool', darkPair: 'ocean-dark' },
  { id: 'ocean-dark', dark: true, textured: false, temperature: 'cool' },
  { id: 'linen', dark: false, textured: true, textureZone: 'chrome', temperature: 'warm' },
  { id: 'washi', dark: false, textured: true, textureZone: 'chrome', temperature: 'warm' },
  { id: 'blueprint', dark: true, textured: true, textureZone: 'chrome', temperature: 'cool' },
  { id: 'executive', dark: true, textured: false, temperature: 'neutral' },
  { id: 'graphite', dark: false, textured: false, temperature: 'neutral' },
  { id: 'high-contrast', dark: false, textured: false, temperature: 'neutral' },
];

/** 프로세스 전역 기본 테마 메타 레지스트리(내장 부트스트랩). / Process-global default theme-meta registry. */
export const themeMetaRegistry = new ThemeMetaRegistry();
for (const m of BUILTIN_THEME_METAS) themeMetaRegistry.registerBuiltin(m);
