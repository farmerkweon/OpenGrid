// ============================================================
// SkinRegistry — FORM(스킨) 토큰 델타 등록소 (item2 C14 / R12b)
// ------------------------------------------------------------
// 설계 근거(Why):
//   item3 §6.2 `defineSkin(name, delta)` + item2 §3.1 C14 `SkinRegistry.define(id, tokenSet)`.
//   스킨은 **색⊥형태 직교성**(item3 §1.1~1.2, HANMS §4)의 물리적 강제자다: 어떤 스킨 델타에도
//   색 리터럴이 들어가면 **런타임 거부**한다(Rule 2). COLOR 는 data-og-theme, FORM 은 data-og-skin.
//
// 계약:
//   * `define(id, delta)` — FORM-only 검증(색 리터럴 거부) + HANMS 가드레일 클램프 후 등록.
//       사용자 스킨은 런타임 `<style>` 주입으로 CSS 전달. 내장 스킨은 skins.css(정적 번들)가 소유하므로
//       `registerBuiltin` 으로 **주입 없이** 델타만 기록(카탈로그/검증/list 용).
//   * 내장 스킨은 HANMS 91_hanms_verdict.md §1/§3 판정 반영:
//       Sharp/Rounded/Stitch/Flat/HighContrast/Material 6종. **Neumorph 는 기본 카탈로그에서 컷**
//       (defineSkin 레시피 + allowLowContrastSkins 옵트인으로만 생존, §1.3).
// ============================================================

import type { SkinTokenDelta, SkinTokenName } from './types.js';

/** 허용되는 FORM 토큰 이름(SkinTokenName 과 동일 집합의 런타임 가드).
 *  export 이유(DD-11): 테마 델타의 대칭 검증 `assertColorOnly` 가 이 집합을 denylist 로 재사용해
 *  색축⊥형태축을 양방향으로 기계강제한다(형태/밀도/질감 shape 토큰이 테마 델타에 오면 거부). */
export const FORM_TOKENS: ReadonlySet<string> = new Set<SkinTokenName>([
  '--og-radius-none', '--og-radius-sm', '--og-radius-md', '--og-radius-lg', '--og-radius-pill',
  '--og-radius-container', '--og-radius-control', '--og-radius-widget', '--og-container-radius',
  '--og-border-width', '--og-border-width-strong', '--og-border-style',
  '--og-divider-style', '--og-divider-repeat',
  '--og-elevation-sm', '--og-elevation-md', '--og-elevation-lg',
  '--og-elevation-alpha-sm', '--og-elevation-alpha-md', '--og-elevation-alpha-lg', '--og-elevation-inset',
  '--og-cell-padding-x', '--og-cell-padding-y',
  '--og-density-row-height', '--og-density-header-height', '--og-density-footer-height',
  '--og-scrollbar-size',
  '--og-texture-bg', '--og-texture-size', '--og-texture-opacity',
  '--og-focus-width', '--og-focus-style', '--og-focus-offset', '--og-focus-radius',
  '--og-icon-size', '--og-icon-fill', '--og-icon-stroke-width', '--og-icon-corner',
  '--og-transition-fast', '--og-transition-base',
  '--og-row-accent-width',
]);

/** 색 리터럴 탐지: hex(#rgb..) 또는 rgb()/hsl() 에 리터럴 채널(숫자 시작)이 오면 색으로 본다.
 *  `rgba(var(--og-texture-ink), 0.04)` 처럼 var() 로 색을 **참조**하는 것은 허용(Rule 2). */
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const FUNC_COLOR_LITERAL = /\b(?:rgba?|hsla?)\(\s*\d/;
/** 흔한 named color 몇 개(스킨 델타엔 색이 오면 안 되므로 대표만 차단). */
const NAMED_COLOR = /\b(?:red|green|blue|black|white|gray|grey|yellow|orange|purple|pink|brown|cyan|magenta)\b/i;

/** 스킨 정의 결과. / Result of a skin definition. */
export interface SkinDefineResult {
  /** 실제 등록된(가드레일 클램프가 반영된) 델타. / The actually registered delta (with guardrail clamps applied). */
  readonly delta: SkinTokenDelta;
  /** 접근성 가드레일이 조정한 토큰 경고(있으면 콘솔에도 출력). / Warnings for tokens adjusted by accessibility guardrails (also logged to console when present). */
  readonly warnings: string[];
}

/**
 * 스킨 델타가 색 리터럴을 담고 있는지 검사하고, 위반 시 던진다(FORM-only, Rule 2).
 * / Assert a skin delta carries no color literal; throws on violation (FORM-only, Rule 2).
 *
 * @param id - 스킨 id / Skin id
 * @param delta - 검사할 토큰 델타 / Token delta to validate
 * @throws FORM 토큰이 아니거나 색 리터럴이 있으면 Error / Throws if a non-FORM token or a color literal is present
 */
export function assertFormOnly(id: string, delta: SkinTokenDelta): void {
  for (const [rawKey, rawVal] of Object.entries(delta)) {
    const key = rawKey as SkinTokenName;
    if (!FORM_TOKENS.has(key)) {
      throw new Error(
        `[SkinRegistry] 스킨 "${id}" 의 토큰 "${key}" 은 FORM 토큰이 아닙니다. ` +
        `스킨은 형태(radius/border/elevation/…)만 소유하며 색 토큰은 data-og-theme 축입니다(색⊥형태 직교성).`,
      );
    }
    const val = String(rawVal ?? '');
    if (HEX_COLOR.test(val) || FUNC_COLOR_LITERAL.test(val) || NAMED_COLOR.test(val)) {
      throw new Error(
        `[SkinRegistry] 스킨 "${id}" 토큰 "${key}: ${val}" 에 색 리터럴이 있습니다. ` +
        `스킨 델타는 색을 담을 수 없습니다(Rule 2). 색이 필요하면 COLOR 토큰(예: var(--og-texture-ink))을 참조하세요.`,
      );
    }
  }
}

/**
 * 접근성 가드레일(불변식) 적용 — 정의 시점 클램프(§6.4).
 * / Apply accessibility guardrails (invariants) — clamp at definition time (§6.4).
 *
 *  - focus-width < 2px → 2px 로 클램프(가시 포커스 비협상). / clamp to 2px (visible focus is non-negotiable).
 *  - focus-style: none → solid.
 *
 * 반환은 조정된 델타 + 경고 목록(silent override 아님 — 무엇을 클램프했는지 알린다).
 * / Returns the adjusted delta plus a warning list (not a silent override — it reports what was clamped).
 *
 * @param id - 스킨 id / Skin id
 * @param delta - 조정할 토큰 델타 / Token delta to adjust
 * @returns 조정된 델타 + 경고 목록 / Adjusted delta plus warnings
 */
export function applyGuardrails(id: string, delta: SkinTokenDelta): SkinDefineResult {
  const out: SkinTokenDelta = { ...delta };
  const warnings: string[] = [];

  const fw = out['--og-focus-width'];
  if (fw != null) {
    const px = parseFloat(String(fw));
    if (!Number.isNaN(px) && px < 2) {
      out['--og-focus-width'] = '2px';
      warnings.push(`focus-width ${fw} → 2px (가시 포커스 최소 2px, HANMS)`);
    }
  }
  if (out['--og-focus-style'] === 'none') {
    out['--og-focus-style'] = 'solid';
    warnings.push(`focus-style none → solid (가시 포커스 비협상, HANMS)`);
  }

  return { delta: out, warnings };
}

/**
 * 프로세스 전역 스킨 등록소. defineSkin(사용자) 는 검증+가드레일+`<style>` 주입,
 * registerBuiltin(내장) 은 검증+가드레일만(CSS 는 skins.css 정적 번들 소유).
 * / Process-global skin registry. `define` (user) does validation + guardrails + `<style>` injection;
 * `registerBuiltin` (built-in) does validation + guardrails only (CSS is owned by the skins.css static bundle).
 *
 * @example
 * skinRegistry.define('my-skin', { '--og-radius-md': '10px', '--og-border-style': 'solid' });
 */
export class SkinRegistry {
  private _skins = new Map<string, SkinTokenDelta>();
  private _styleEl: HTMLStyleElement | null = null;

  /**
   * 내장 스킨 등록(주입 없음 — CSS 는 skins.css 가 전달). 검증/가드레일은 동일 적용.
   * / Register a built-in skin (no injection — CSS is delivered by skins.css). Validation/guardrails still apply.
   *
   * @param id - 스킨 id / Skin id
   * @param delta - FORM 토큰 델타 / FORM token delta
   */
  registerBuiltin(id: string, delta: SkinTokenDelta): void {
    assertFormOnly(id, delta);
    const { delta: safe } = applyGuardrails(id, delta);
    this._skins.set(id, safe);
  }

  /**
   * 사용자 스킨 등록. FORM-only 검증 + 가드레일 클램프 후 런타임 `<style>` 로
   * `.og-container[data-og-skin="id"]` 블록을 주입(브라우저 환경). 반환은 조정 결과.
   * / Register a user skin. After FORM-only validation and guardrail clamps, injects a
   * `.og-container[data-og-skin="id"]` block via a runtime `<style>` (browser env). Returns the adjusted result.
   *
   * @param id - 스킨 id / Skin id
   * @param delta - FORM 토큰 델타 / FORM token delta
   * @returns 조정된 델타 + 경고 목록 / Adjusted delta plus warnings
   */
  define(id: string, delta: SkinTokenDelta): SkinDefineResult {
    assertFormOnly(id, delta);
    const result = applyGuardrails(id, delta);
    this._skins.set(id, result.delta);
    for (const w of result.warnings) {
      // eslint-disable-next-line no-console
      if (typeof console !== 'undefined') console.warn(`[SkinRegistry] "${id}": ${w}`);
    }
    this._inject(id, result.delta);
    return result;
  }

  /** 스킨 id 등록 여부. / Whether a skin id is registered. */
  has(id: string): boolean { return this._skins.has(id); }
  /** 등록된 스킨 델타 조회(없으면 undefined). / Get a registered skin delta (undefined if absent). */
  get(id: string): SkinTokenDelta | undefined { return this._skins.get(id); }
  /** 등록된 모든 스킨 id(내장 + 사용자). / All registered skin ids (built-in + user). */
  list(): string[] { return [...this._skins.keys()]; }

  /** 런타임 `<style>` 주입(테스트/SSR 등 document 없으면 no-op). 같은 태그를 누적 사용. */
  private _inject(id: string, delta: SkinTokenDelta): void {
    if (typeof document === 'undefined') return;
    if (!this._styleEl) {
      this._styleEl = document.createElement('style');
      this._styleEl.setAttribute('data-og-skins', 'runtime');
      document.head.appendChild(this._styleEl);
    }
    const body = Object.entries(delta)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    this._styleEl.appendChild(
      document.createTextNode(`\n.og-container[data-og-skin="${id}"] {\n${body}\n}\n`),
    );
  }
}

// ─── 내장 스킨 델타 (HANMS 승인 5 + Material 대체 = 6) — item3 §3, HANMS §1/§3 ───
// 값은 item3 §3.1~§3.6 + HANMS §3(Material) 의 구체 토큰. density 행은 **권장 밀도 힌트**
// (실제 relayout 은 data-og-density 축 소유, item4 C1 — setSkin 은 무비용).

/** Sharp/Gothic — 엔터프라이즈 고밀도·각짐(§3.1). / Sharp/Gothic — enterprise high-density, squared corners (§3.1). */
export const SKIN_SHARP: SkinTokenDelta = {
  '--og-radius-sm': '0', '--og-radius-md': '0', '--og-radius-lg': '0',
  '--og-radius-pill': '0', '--og-radius-container': '0', '--og-container-radius': '0',
  '--og-border-width': '1px', '--og-border-style': 'solid', '--og-divider-style': 'solid',
  '--og-elevation-sm': 'none', '--og-elevation-md': 'none', '--og-elevation-lg': '0 1px 2px',
  '--og-cell-padding-x': '6px',
  '--og-density-row-height': '28', '--og-density-header-height': '28', // G-S1: 26→28 클램프(터치 경계)
  '--og-focus-width': '2px', '--og-focus-style': 'solid', '--og-focus-radius': '0',
  '--og-icon-fill': '0', '--og-icon-corner': 'miter',
};

/** Rounded — 소비자 SaaS 소프트(§3.2). / Rounded — consumer-SaaS soft look (§3.2). */
export const SKIN_ROUNDED: SkinTokenDelta = {
  '--og-radius-sm': '4px', '--og-radius-md': '8px', '--og-radius-lg': '12px',
  '--og-radius-pill': '999px', '--og-radius-container': '12px', '--og-container-radius': '12px',
  '--og-radius-control': '8px', '--og-radius-widget': '6px',
  '--og-border-width': '1px', '--og-border-style': 'solid',
  '--og-elevation-sm': '0 1px 3px', '--og-elevation-md': '0 4px 12px', '--og-elevation-lg': '0 12px 32px',
  '--og-elevation-alpha-sm': '0.06', '--og-elevation-alpha-md': '0.10', '--og-elevation-alpha-lg': '0.16',
  '--og-cell-padding-x': '12px', '--og-cell-padding-y': '2px',
  '--og-density-row-height': '40', '--og-density-header-height': '42',
  '--og-focus-width': '2px', '--og-focus-offset': '2px', '--og-focus-radius': '8px',
  '--og-icon-fill': '0', '--og-icon-corner': 'round',
};

/** Stitch — 핸드크래프트(§3.3). 색(리넨/자수)은 theme 축. / Stitch — handcrafted look (§3.3); color (linen/embroidery) lives on the theme axis. */
export const SKIN_STITCH: SkinTokenDelta = {
  '--og-radius-sm': '2px', '--og-radius-md': '3px', '--og-radius-lg': '4px', '--og-container-radius': '3px',
  '--og-border-width': '1px', '--og-border-style': 'dashed', '--og-divider-style': 'dashed',
  '--og-divider-repeat': '2',
  // 텍스처 ink 는 COLOR 토큰 참조(Rule 2 준수). 실제 존 제한(숫자/상태 셀 뒤 금지)은 코어 불변식 G-ST1.
  '--og-texture-bg': 'repeating-linear-gradient(45deg, rgba(var(--og-texture-ink),0.04) 0 2px, transparent 2px 6px)',
  '--og-texture-size': '6px 6px', '--og-texture-opacity': '1',
  '--og-elevation-sm': '0 1px 2px', '--og-elevation-md': '0 2px 4px', '--og-elevation-lg': '0 4px 10px',
  '--og-cell-padding-x': '10px',
  '--og-density-row-height': '36',
  '--og-focus-style': 'dashed',
  '--og-icon-fill': '0', '--og-icon-corner': 'round',
};

/** Flat/Minimal — 플랫 2.0(§3.5). / Flat/Minimal — flat 2.0 (§3.5). */
export const SKIN_FLAT: SkinTokenDelta = {
  '--og-radius-sm': '2px', '--og-radius-md': '3px', '--og-radius-lg': '4px', '--og-container-radius': '4px',
  '--og-border-width': '1px', '--og-border-style': 'solid', '--og-divider-style': 'solid',
  '--og-elevation-sm': 'none', '--og-elevation-md': 'none', '--og-elevation-lg': 'none',
  '--og-elevation-inset': 'none',
  '--og-cell-padding-x': '10px',
  '--og-density-row-height': '34',
  '--og-focus-width': '2px', '--og-focus-style': 'solid',
  '--og-icon-fill': '0', '--og-icon-corner': 'round',
};

/** High-Contrast — 접근성 우선·레퍼런스(§3.6). / High-Contrast — accessibility-first reference skin (§3.6). */
export const SKIN_HIGH_CONTRAST: SkinTokenDelta = {
  '--og-radius-sm': '0', '--og-radius-md': '2px', '--og-radius-lg': '2px', '--og-container-radius': '2px',
  '--og-border-width': '2px', '--og-border-width-strong': '3px',
  '--og-border-style': 'solid', '--og-divider-style': 'solid',
  '--og-elevation-sm': 'none', '--og-elevation-md': '0 2px 4px', '--og-elevation-lg': '0 4px 8px',
  '--og-elevation-alpha-md': '0.30', '--og-elevation-alpha-lg': '0.40',
  '--og-cell-padding-x': '10px',
  '--og-density-row-height': '40',
  '--og-focus-width': '3px', '--og-focus-style': 'solid', '--og-focus-offset': '2px', '--og-focus-radius': '0',
  '--og-icon-size': '18px', '--og-icon-fill': '1', '--og-icon-stroke-width': '2', '--og-icon-corner': 'miter',
};

/** Material/Elevated — 중간 반경 + 정직한 그림자 엘리베이션. / Material/Elevated — medium radius plus honest shadow elevation. */
export const SKIN_MATERIAL: SkinTokenDelta = {
  '--og-radius-sm': '2px', '--og-radius-md': '4px', '--og-radius-lg': '8px', '--og-container-radius': '8px',
  '--og-radius-control': '4px', '--og-radius-widget': '4px',
  '--og-border-width': '1px', '--og-border-style': 'solid', '--og-divider-style': 'solid',
  '--og-elevation-sm': '0 1px 2px', '--og-elevation-md': '0 2px 6px', '--og-elevation-lg': '0 8px 24px',
  '--og-elevation-alpha-sm': '0.12', '--og-elevation-alpha-md': '0.16', '--og-elevation-alpha-lg': '0.20',
  '--og-cell-padding-x': '8px',
  '--og-density-row-height': '36',
  '--og-focus-width': '2px', '--og-focus-style': 'solid', '--og-focus-offset': '1px',
  '--og-icon-fill': '0', '--og-icon-corner': 'round',
};

/** 내장 스킨 카탈로그(확정 6종). id → 델타. / Built-in skin catalog (6 finalized skins). id → delta. */
export const BUILTIN_SKINS: ReadonlyArray<readonly [string, SkinTokenDelta]> = [
  ['sharp', SKIN_SHARP],
  ['rounded', SKIN_ROUNDED],
  ['stitch', SKIN_STITCH],
  ['flat', SKIN_FLAT],
  ['high-contrast', SKIN_HIGH_CONTRAST],
  ['material', SKIN_MATERIAL],
];

/** 프로세스 전역 기본 레지스트리 — 내장 스킨을 부트스트랩 등록(주입 없음, CSS=skins.css).
 *  / Process-global default registry — bootstraps the built-in skins (no injection; CSS=skins.css). */
export const skinRegistry = new SkinRegistry();
for (const [id, delta] of BUILTIN_SKINS) skinRegistry.registerBuiltin(id, delta);
