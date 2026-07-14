// ============================================================
// AppearanceResolver — 스타일 해결 단일 초크포인트 (C10 / R12a)
// / AppearanceResolver — the single chokepoint for style resolution (C10 / R12a)
// ------------------------------------------------------------
// EN summary: The render layer currently hardcodes "shape-value decisions" (border/divider/
//   radius/padding/focus-ring/elevation/texture) inline across a large renderer and many cell
//   renderers, leaving no single seat for the skin/appearance axis to land. This object gathers
//   those decisions into one place. In R12a each method returns a CSS string **byte-identical**
//   to what the render code emits today (a `var(--og-*, <existing fallback>)` where a token
//   exists, otherwise today's literal), so the 15 color themes render unchanged. Host-isolation
//   forced-inline stays: the resolver supplies **values only**, and the render layer still writes
//   them inline to beat host CSS. HANMS honesty hard rules are pre-seeded as invariants but are
//   no-ops under the current (skin-less) theme: focusRing() clamps `<2px`/`none` to at least
//   `2px solid` (visible focus is non-negotiable), and a state border is always solid (G-ST2).
// ------------------------------------------------------------
// 설계 근거(Why):
//   현상맵 §5.3 — "GridRenderer 가 인라인 스타일을 결정하는 지점이 1,010줄 렌더러와
//   ~19개 CellRenderer 에 흩어져 있어 스킨/외관 축이 착지할 단일 지점이 없다."
//   item3 `90_skin_system_design.md` §4.4 가 그 해소책으로 AppearanceResolver 를 설계했고,
//   item2 `90_final_design.md` §3.1 C10 / §6-R12 가 이를 T4/T5 착지점으로 확정했다.
//
// 이 파일(R12a)의 계약 — **행동 보존(byte-identical)**:
//   * 렌더 레이어가 지금 인라인으로 하드코딩하는 "형태 값 결정"을 이 한 객체로 모은다.
//   * 각 메서드는 **현재 렌더 코드가 내보내는 것과 문자 단위로 동일한** CSS 문자열을
//     반환한다(토큰이 있으면 `var(--og-*, <기존 폴백>)`, 없으면 오늘의 리터럴).
//   * 아직 스킨은 없다(R12b) · 아이콘도 없다(R12c). 따라서 15개 색 테마 렌더는 불변.
//   * host-isolation 강제-인라인 메커니즘은 그대로다 — resolver 는 **값만** 공급하고,
//     렌더 레이어가 그 값을 여전히 인라인으로 써서 호스트 CSS 를 이긴다.
//
// HANMS 정직성 하드룰(item3 `91_hanms_verdict.md` §2/§7, item2 R-5f)을 **강제 불변식**으로
//   미리 심는다 — 단, 아직 스킨이 없으므로 현 테마에서는 전부 no-op(출력 불변):
//   * focusRing(): `<2px` 또는 `none` 을 최소 `2px solid` 로 클램프(가시 포커스 비협상).
//   * border({state:true}): 상태 보더는 스킨과 무관하게 항상 solid(G-ST2).
// ============================================================

/** 렌더 코드가 오늘 사용하는 border-color 폴백(#e0e0e0). 토큰: --og-border-color. / The border-color fallback (#e0e0e0) the render code uses today. Token: --og-border-color. */
const BORDER_COLOR_FALLBACK = '#e0e0e0';

/**
 * ThemeContext — DOM-free 값 객체. 활성 색 테마(및 미래의 스킨) 식별자를 운반한다.
 * R12a 에서 resolver 메서드는 아직 이 컨텍스트로 분기하지 않는다(반환은 항상 `var()` 문자열이라
 * 브라우저가 런타임에 테마별로 재계산 → 오늘의 zero-rerender 테마 전환을 보존).
 * R12b(스킨)에서 `skin` 을 읽어 FORM 토큰을 해결하는 자리를 여기 마련해 둔다.
 * / ThemeContext — a DOM-free value object carrying the active color theme (and future skin)
 * identifiers. In R12a the resolver methods do not yet branch on this context (returns are always
 * `var()` strings so the browser recomputes per-theme at runtime → preserving today's
 * zero-rerender theme switching). R12b (skins) will read `skin` here to resolve FORM tokens.
 *
 * @param theme - 활성 색 테마 id / Active color theme id
 * @param skin - 활성 스킨 id(FORM 축, R12b) / Active skin id (FORM axis, R12b)
 */
export class ThemeContext {
  constructor(
    public readonly theme: string = 'default',
    public readonly skin: string = 'default',
  ) {}
}

/**
 * propagateAppearance — 분리(portal-ed) UI 로 외관 축을 함께 복사(§4.3).
 * 두 속성(`data-og-theme` COLOR · `data-og-skin` FORM)을 **한 번에** 복사해, 컴포넌트마다
 * 두 번째 속성을 잊어 스킨만 안 먹는 조용한 사고를 구조적으로 막는다.
 * `fromEl` 에서 가장 가까운 속성 보유 조상을 찾아 `toEl` 에 복사한다.
 * / propagateAppearance — copy the appearance axes together onto portal-ed UI (§4.3). Copies both
 * attributes (`data-og-theme` COLOR · `data-og-skin` FORM) **in one call**, structurally
 * preventing the silent bug where a component forgets the second attribute and the skin quietly
 * fails to apply. Finds the nearest attribute-bearing ancestor of `fromEl` and copies onto `toEl`.
 *
 * @param fromEl - 외관 속성을 상속받을 원본 요소(null 이면 no-op) / Source element to inherit appearance from (no-op if null)
 * @param toEl - 속성을 복사받을 대상 요소 / Target element to receive the attributes
 */
export function propagateAppearance(fromEl: Element | null, toEl: Element): void {
  if (!fromEl) return;
  const themeEl = fromEl.closest('[data-og-theme]');
  const theme = themeEl?.getAttribute('data-og-theme');
  if (theme) toEl.setAttribute('data-og-theme', theme);
  const skinEl = fromEl.closest('[data-og-skin]');
  const skin = skinEl?.getAttribute('data-og-skin');
  if (skin) toEl.setAttribute('data-og-skin', skin);
}

/**
 * border()/focusRing() 형태 옵션(미래 스킨용). 미지정 시 오늘의 기본값 = byte-identical.
 * / Shape options for border()/focusRing() (for future skins). Unset = today's defaults = byte-identical.
 */
export interface BorderOptions {
  /** 보더 스타일 키워드(기본 'solid'). / Border style keyword (default 'solid'). */
  style?: string;
  /** true 면 상태(added/edited/removed·selection·range) 보더 — G-ST2: 항상 solid 강제. / true = a state border (added/edited/removed·selection·range) — G-ST2: always forced solid. */
  state?: boolean;
}

/** focusRing() 형태 옵션. / Shape options for focusRing(). */
export interface FocusRingOptions {
  /** 링 두께(px, 최소 2 클램프). / Ring width (px, clamped to a minimum of 2). */
  width?: number;
  /** 링 스타일('none' 은 solid 로 클램프). / Ring style ('none' is clamped to solid). */
  style?: string;
  /** 링 색(미지정 시 프라이머리 기반). / Ring color (primary-based if unset). */
  color?: string;
}

/** 엘리베이션(그림자) 단계. / Elevation (shadow) level. */
export type ElevationLevel = 'sm' | 'md' | 'lg';

/**
 * AppearanceResolver — 렌더 레이어가 "형태 값"을 물어보는 단일 지점.
 * R12a 는 **결정을 객체화**할 뿐 값은 오늘과 동일하다(회귀 0). 상태 없음(순수) — 반환은
 * `var()` 기반 문자열 또는 px 패스스루라, 인스턴스 공유가 안전하다(멀티그리드 격리 무해).
 * / AppearanceResolver — the single place the render layer asks for "shape values". R12a merely
 * **objectifies the decisions**; the values are identical to today (zero regression). It is
 * stateless (pure) — returns are `var()`-based strings or px pass-throughs, so sharing an
 * instance is safe (harmless to multi-grid isolation).
 *
 * @example
 * const ap = new AppearanceResolver(new ThemeContext('dark'));
 * el.style.border = ap.border();          // "1px solid var(--og-border-color,#e0e0e0)"
 * el.style.outline = ap.focusRing();      // AA-safe, clamped to ≥2px solid
 */
export class AppearanceResolver {
  constructor(private _ctx: ThemeContext = new ThemeContext()) {}

  /** 활성 테마/스킨 컨텍스트(R12b 스킨 해결의 진입점). / The active theme/skin context (entry point for R12b skin resolution). */
  get context(): ThemeContext { return this._ctx; }

  /** 스킨이 활성(비-default)인가. default 면 오늘의 리터럴을 그대로 반환(byte-identical). / Whether a skin is active (non-default). When default, today's literals are returned as-is (byte-identical). */
  private _skinActive(): boolean { return this._ctx.skin !== 'default'; }

  /**
   * R12b: 스킨 컨텍스트 교체(테마는 유지). 파사드 setSkin 이 호출한 뒤 재렌더하면 인라인 form 사이트가
   * 이 컨텍스트로 재해석된다. default → named 전환 시 border/divider 가 리터럴 → var() 로 승격.
   * / R12b: swap the skin context (theme kept). After the facade setSkin calls this and re-renders,
   * inline form sites are re-resolved against this context. On default → named, border/divider are
   * promoted from literals to var().
   *
   * @param skin - 새 스킨 id / New skin id
   */
  setSkin(skin: string): void { this._ctx = new ThemeContext(this._ctx.theme, skin); }

  /** border-color 토큰 참조(폴백 포함) — 렌더 코드가 오늘 쓰는 문자열과 동일. */
  private _borderColorVar(): string {
    return `var(--og-border-color,${BORDER_COLOR_FALLBACK})`;
  }

  /**
   * 셀/헤더 가장자리 보더. 오늘의 리터럴 `1px solid var(--og-border-color,#e0e0e0)` 과
   * **문자 단위 동일**. G-ST2: state 보더는 스타일을 solid 로 강제(현재 호출은 state 미지정 → no-op).
   * / Cell/header edge border. **Byte-identical** to today's literal
   * `1px solid var(--og-border-color,#e0e0e0)`. G-ST2: a state border forces solid style (current
   * calls pass no state → no-op).
   *
   * @param opts - 보더 스타일·state 여부(선택) / Border style / state flag (optional)
   * @returns CSS border shorthand 문자열 / A CSS border-shorthand string
   */
  border(opts?: BorderOptions): string {
    let style = opts?.style ?? 'solid';
    if (opts?.state) style = 'solid'; // G-ST2(하드룰): 상태 신호는 장식보다 우선 — 항상 solid
    if (this._skinActive()) {
      // 스킨 활성: width/style 을 토큰으로 승격 → [data-og-skin] 이 인라인 사이트에 도달.
      //   상태 보더는 스킨과 무관하게 solid 리터럴(G-ST2) — 토큰화하지 않는다.
      const width = 'var(--og-border-width, 1px)';
      const st = opts?.state ? 'solid' : `var(--og-border-style, ${style})`;
      return `${width} ${st} ${this._borderColorVar()}`;
    }
    return `1px ${style} ${this._borderColorVar()}`; // default: 오늘과 byte-identical
  }

  /**
   * 행/섹션 구획선(가로 separator). 오늘은 border() 와 동일 문자열(=`1px solid var(--og-border-color,#e0e0e0)`).
   * 별도 메서드로 둔 이유: R12b 스킨에서 divider-style 이 border-style 과 갈라질 수 있어(§1.2)
   * 결정 지점을 미리 분리해 둔다. 현재 출력은 border() 와 byte-identical.
   * / Row/section divider (horizontal separator). Today the same string as border()
   * (=`1px solid var(--og-border-color,#e0e0e0)`). Kept as a separate method because in R12b skins
   * divider-style may diverge from border-style (§1.2), so the decision point is split in advance.
   * Current output is byte-identical to border().
   *
   * @returns CSS border shorthand 문자열(구획선용) / A CSS border-shorthand string (for the divider)
   */
  divider(): string {
    if (this._skinActive()) {
      // 스킨 활성: divider-style 이 border-style 과 갈라질 수 있어(§1.2) 별도 토큰으로 승격.
      return `var(--og-border-width, 1px) var(--og-divider-style, solid) ${this._borderColorVar()}`;
    }
    return this.border(); // default: border() 와 byte-identical
  }

  /**
   * G-ST1(코어 불변식, §2): 텍스처 존 제한. 텍스처는 컨테이너 배경·헤더 여백·빈 상태·온보딩
   * 오버레이에만 렌더되고, **데이터/상태/범위/병합/포커스 셀 배경 뒤에는 절대 렌더 금지**(스킨이 끌 수 없음).
   * 렌더 레이어가 셀 배경 텍스처를 바를 때 이 메서드로 zone 을 물어본다.
   *   - 금지 zone → 항상 `'none'`(스킨과 무관).
   *   - 허용 zone → `var(--og-texture-bg, none)`(스킨 미설정 시 none = byte-identical).
   * / G-ST1 (core invariant, §2): texture-zone restriction. Texture renders only behind the
   * container background, header padding, empty state, and onboarding overlay, and is **never**
   * rendered behind data/status/range/merge/focus cell backgrounds (a skin cannot turn it on). The
   * render layer asks this method for the zone before painting a cell-background texture.
   *   - forbidden zone → always `'none'` (skin-independent).
   *   - allowed zone → `var(--og-texture-bg, none)` (none when no skin is set = byte-identical).
   *
   * @param zone - 텍스처를 바르려는 위치 / The zone the texture would paint into
   * @returns `'none'` 또는 텍스처 토큰 문자열 / `'none'` or the texture token string
   */
  texture(zone: 'container' | 'header-pad' | 'empty' | 'onboarding' | 'data' | 'status' | 'range' | 'merge' | 'focus'): string {
    const FORBIDDEN = zone === 'data' || zone === 'status' || zone === 'range' || zone === 'merge' || zone === 'focus';
    if (FORBIDDEN) return 'none';
    return 'var(--og-texture-bg, none)';
  }

  /**
   * 반경 값 → CSS 길이 문자열. R12a 는 패스스루(`${px}px`)로 오늘의 리터럴을 그대로 보존한다.
   * 반경 리터럴이 흩어져 있던 결정 지점(이미지/프로그레스/스위치/뱃지/마스킹/상태뱃지)을 이 한 곳으로 모은다.
   * R12b 에서 `--og-radius-*` 스케일 토큰으로 승격할 착지점.
   * / Radius value → CSS length string. R12a is a pass-through (`${px}px`) that preserves today's
   * literal. It gathers the radius-literal decision points (image/progress/switch/badge/masking/
   * state-badge) into this one place. A landing site for promotion to `--og-radius-*` scale tokens
   * in R12b.
   *
   * @param px - 반경 픽셀 값 / Radius value in px
   * @returns CSS 길이 문자열(`${px}px`) / A CSS length string (`${px}px`)
   */
  radius(px: number): string {
    return `${px}px`;
  }

  /**
   * 데이터/그룹 셀의 인라인 패딩. 오늘의 그룹 셀 리터럴 `2px 8px` 과 동일.
   * R12b `--og-cell-padding-*` 승격 자리.
   * / Inline padding for data/group cells. Same as today's group-cell literal `2px 8px`. A landing
   * site for promotion to `--og-cell-padding-*` in R12b.
   *
   * @returns CSS padding shorthand 문자열 / A CSS padding-shorthand string
   */
  cellPadding(): string {
    return '2px 8px';
  }

  /**
   * 엘리베이션(box-shadow) — R12b 스킨 축의 형태/잉크 분리 seam(§1.4)을 미리 표기한다.
   * R12a 에서는 어떤 인라인 사이트도 이 메서드를 경유하지 않는다(현재 그림자 결정이 인라인에 없음).
   * 값은 미래 토큰 + 오늘과 무해한 기본 geometry/alpha 로, 라우팅 0 이라 출력에 영향 없음.
   * / Elevation (box-shadow) — pre-marks the shape/ink separation seam of the R12b skin axis
   * (§1.4). In R12a no inline site routes through this method (no shadow decision is inline today).
   * The value is a future token plus a harmless default geometry/alpha, and with zero routing it
   * does not affect output.
   *
   * @param level - 그림자 단계(기본 'md') / Shadow level (default 'md')
   * @returns CSS box-shadow 문자열 / A CSS box-shadow string
   */
  elevation(level: ElevationLevel = 'md'): string {
    const geom: Record<ElevationLevel, string> = { sm: '0 1px 2px', md: '0 2px 6px', lg: '0 8px 24px' };
    const alpha: Record<ElevationLevel, string> = { sm: '0.07', md: '0.10', lg: '0.14' };
    return `var(--og-elevation-${level}, ${geom[level]}) rgba(var(--og-shadow-ink, 0 0 0), var(--og-elevation-alpha-${level}, ${alpha[level]}))`;
  }

  /**
   * 포커스 링. 하드 계약(불변식): 가시 포커스는 비협상 —
   * `width < 2px` 또는 `style: 'none'` 은 최소 `2px solid` 로 **클램프**한다(스킨이 끌 수 없음).
   * R12a 에서 라우팅되는 인라인 포커스 사이트는 없다(포커스 표시는 CSS 클래스 `.og-cell-focused`).
   * 기본 반환은 현 프라이머리 색 기반의 AA-safe 링 — 미래 스킨/오버라이드가 이 초크포인트를 경유한다.
   * / Focus ring. Hard contract (invariant): visible focus is non-negotiable — `width < 2px` or
   * `style: 'none'` is **clamped** to at least `2px solid` (a skin cannot turn it off). No inline
   * focus site routes through this in R12a (focus is shown via the CSS class `.og-cell-focused`).
   * The default return is an AA-safe ring based on the current primary color — future
   * skins/overrides pass through this chokepoint.
   *
   * @param opts - 링 두께·스타일·색(선택, 미지정 시 안전 기본값) / Ring width/style/color (optional; safe defaults when unset)
   * @returns CSS outline/border shorthand 문자열 / A CSS outline/border-shorthand string
   */
  focusRing(opts?: FocusRingOptions): string {
    let width = opts?.width ?? 2;
    let style = opts?.style ?? 'solid';
    if (width < 2) width = 2;            // HANMS: 최소 2px
    if (style === 'none') style = 'solid'; // HANMS: none 거부 → solid
    const color = opts?.color ?? 'var(--og-focus-border,var(--og-primary,#1976d2))';
    // 스킨 활성 + opts 미지정: focus width/style 을 토큰으로 승격(스킨의 focus form 도달).
    //   토큰 자체는 SkinRegistry 가 정의 시점에 <2px/none 을 클램프하므로 가시 포커스가 보장된다.
    if (this._skinActive() && opts?.width === undefined && opts?.style === undefined) {
      return `var(--og-focus-width, 2px) var(--og-focus-style, solid) ${color}`;
    }
    return `${width}px ${style} ${color}`;
  }
}

/**
 * 프로세스 공유 기본 resolver. CellRenderer(팩토리로 생성돼 per-instance 컨텍스트를 받지 않음)가
 * 반경 결정을 이 초크포인트로 보낼 때 사용한다. R12a 반환은 상태 없는 순수값이라 공유가 안전하다.
 * per-instance(테마 컨텍스트) 주입은 R12b 스킨에서 확장한다.
 * / The process-shared default resolver. Used by cell renderers (factory-created, so they receive
 * no per-instance context) to route radius decisions through this chokepoint. R12a returns
 * stateless pure values, so sharing is safe. Per-instance (theme-context) injection is extended in
 * the R12b skin work.
 */
export const defaultAppearance = new AppearanceResolver();
