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

// 계약 추적: item2 §3.1 C14 / DD-11(테마쪽 대칭 검증 assertColorOnly 가 이 집합을 재사용).
// / Contract refs: item2 §3.1 C14 / DD-11 (the theme-side symmetric check assertColorOnly reuses this set).
/**
 * 스킨(FORM) 델타에 등장할 수 있는 CSS 커스텀 프로퍼티 이름의 허용 목록(런타임 가드).
 * 스킨은 형태(모서리·테두리·그림자·밀도 등)만 다루고 색은 다루지 않는다는 규칙을, 이 목록이
 * 물리적으로 강제한다 — `define()`/`registerBuiltin()` 이 델타를 검사할 때 이 집합에 없는
 * 키는 거부한다. 반대 방향(테마 델타에 형태 토큰이 섞이는 것)도 이 집합을 재사용해 막는다
 * (색⊥형태 축 분리를 양방향으로 기계 강제).
 * / Allow-list of CSS custom-property names permitted in a skin (FORM) delta (runtime guard).
 *   It physically enforces the rule that skins own shape only (radius/border/elevation/density/…)
 *   and never color — `define()`/`registerBuiltin()` reject any key outside this set. The reverse
 *   direction (shape tokens leaking into a theme delta) reuses this same set, so the color⊥shape
 *   axis separation is mechanically enforced both ways.
 */
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
 * 스킨(FORM)에는 형태만 담고 색은 담지 않는다는 규칙을 실제로 검사하는 함수. 왜 필요한가:
 * 스킨과 테마(색)를 분리해 두어도, 개발자가 실수로 스킨 델타에 `#fff` 같은 색을 넣으면 그
 * 분리가 눈에 안 띄게 무너진다 — 그래서 등록 시점에 색 리터럴이 섞이면 즉시 던져서 알아채게
 * 한다(조용히 무시하지 않음).
 * / Actually enforces the rule that a skin (FORM) carries shape only, never color. Why: even with
 *   skin/theme separation on paper, a developer slipping `#fff` into a skin delta would quietly
 *   break that separation — so this throws immediately at registration time instead of ignoring it.
 *
 * @param id - 스킨 id / Skin id
 * @param delta - 검사할 토큰 델타 / Token delta to validate
 * @throws FORM 토큰이 아니거나 색 리터럴이 있으면 Error / Throws if a non-FORM token or a color literal is present
 * @example
 * skinRegistry.define('my-skin', { '--og-radius-md': '#fff' }); // throws — 색 리터럴 검출 / color literal detected
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

// 계약 추적: §6.4. / Contract ref: §6.4.
/**
 * 접근성 가드레일(불변식)을 적용해 델타를 정의 시점에 안전값으로 클램프한다. `define()`/
 * `registerBuiltin()` 내부에서 자동 호출되므로 보통 직접 부를 일은 없다(커스텀 등록 파이프라인·
 * 테스트에서 직접 검증할 때만 예외적으로 사용). 스킨 저자가 접근성 최소 기준 이하로 값을
 * 설정해도 조용히 그대로 등록되지 않도록 막는다.
 *  - focus-width < 2px → 2px 로 클램프(가시 포커스 비협상).
 *  - focus-style: none → solid.
 * 반환은 조정된 델타 + 경고 목록(silent override 아님 — 무엇을 클램프했는지 알린다).
 * / Applies accessibility guardrails (invariants), clamping the delta to a safe value at
 *   definition time. Called automatically inside `define()`/`registerBuiltin()`, so you rarely
 *   call it directly (only in a custom registration pipeline or a test that checks it directly).
 *   Prevents a skin author from silently registering values below the minimum accessibility bar.
 *   - focus-width < 2px → clamped to 2px (visible focus is non-negotiable).
 *   - focus-style: none → solid.
 *   Returns the adjusted delta plus a warning list (not a silent override — it reports what was
 *   clamped).
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
 * 스킨(FORM 축 — 모서리·테두리·그림자·밀도 등 "생김새")을 등록하는 전역 레지스트리. 등록하면
 * 내부에서 벌어지는 일: `define()` 은 색 리터럴이 없는지 검사 → 접근성 가드레일 클램프 →
 * `.og-container[data-og-skin="id"] { ... }` 규칙을 담은 `<style>` 태그를 문서 head 에 주입한다.
 * 그리드 쪽에서 `data-og-skin="id"` 속성만 설정하면 이 CSS 가 매치되어 적용된다. 내장 스킨은
 * `registerBuiltin()` 으로 검증+가드레일만 거치고 실제 CSS 는 정적 번들 skins.css 가 이미
 * 담당하므로 별도 주입이 없다.
 * / A global registry for registering skins (the FORM axis — corner/border/shadow/density, i.e.
 *   "shape"). What happens internally when you register: `define()` checks for no color literals
 *   → clamps via accessibility guardrails → injects a `<style>` tag into document head containing
 *   a `.og-container[data-og-skin="id"] { ... }` rule. The grid side only needs to set the
 *   `data-og-skin="id"` attribute for this CSS to match and apply. Built-in skins go through
 *   `registerBuiltin()` for validation + guardrails only — their CSS is already owned by the
 *   static skins.css bundle, so no injection happens.
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

// 계약 추적: item3 §3.1. / Contract ref: item3 §3.1.
/**
 * Sharp/Gothic — 엔터프라이즈 고밀도 화면에 맞춘 각진(라운드 0) 형태. 데이터 밀도가 중요한
 * 백오피스·트레이딩 화면에 어울린다.
 * / Sharp/Gothic — squared (zero-radius) shape tuned for high-density enterprise screens; suits
 *   back-office/trading UIs where data density matters.
 */
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

// 계약 추적: item3 §3.2. / Contract ref: item3 §3.2.
/**
 * Rounded — 소비자 SaaS 에 어울리는 부드러운(둥근 모서리·큰 그림자) 형태.
 * / Rounded — soft shape (rounded corners, larger shadows) suited to consumer-SaaS products.
 */
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

// 계약 추적: item3 §3.3. / Contract ref: item3 §3.3.
/**
 * Stitch — 손바느질/리넨 소재 느낌을 주는 형태(점선 테두리·텍스처). 리넨 색·자수 색 자체는
 * 이 스킨이 아니라 theme(색) 축이 담당한다(색⊥형태 분리).
 * / Stitch — a handcrafted, linen-textured shape (dashed borders, texture). The linen/embroidery
 *   color itself belongs to the theme (color) axis, not this skin (color⊥shape separation).
 */
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

// 계약 추적: item3 §3.5. / Contract ref: item3 §3.5.
/**
 * Flat/Minimal — 그림자·입체감을 없앤 평평한(flat 2.0) 형태. 미니멀한 대시보드에 어울린다.
 * / Flat/Minimal — a flat (flat 2.0) shape with shadows/depth removed; suits minimal dashboards.
 */
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

// 계약 추적: item3 §3.6. / Contract ref: item3 §3.6.
/**
 * High-Contrast — 접근성을 최우선에 둔 레퍼런스 스킨(굵은 테두리·큰 포커스 링·굵은 아이콘 획).
 * 다른 스킨을 만들 때 "접근성 하한선이 뭔가"를 확인하는 기준으로도 쓸 수 있다.
 * / High-Contrast — a reference skin that puts accessibility first (thick borders, a large focus
 *   ring, bold icon strokes). Also useful as a baseline for "what's the accessibility floor" when
 *   authoring other skins.
 */
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

/**
 * Material/Elevated — 중간 정도 반경 + 과장 없는 그림자 엘리베이션을 쓰는 형태.
 * / Material/Elevated — a shape using medium-radius corners plus restrained (non-exaggerated)
 *   shadow elevation.
 */
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

/**
 * 내장 스킨 카탈로그(확정 6종, id → 델타). `skinRegistry.list()`/설정 UI 에서 선택지를 보여줄 때
 * 이 배열을 순회하면 된다.
 * / Built-in skin catalog (6 finalized skins, id → delta). Iterate this array when building a
 *   picker UI or listing options via `skinRegistry.list()`.
 */
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
