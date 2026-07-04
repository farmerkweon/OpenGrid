// ============================================================
// AppearanceResolver — 스타일 해결 단일 초크포인트 (item2 C10 / R12a)
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

/** 렌더 코드가 오늘 사용하는 border-color 폴백(#e0e0e0). 토큰: --og-border-color. */
const BORDER_COLOR_FALLBACK = '#e0e0e0';

/**
 * ThemeContext — DOM-free 값 객체. 활성 색 테마(및 미래의 스킨) 식별자를 운반한다.
 * R12a 에서 resolver 메서드는 아직 이 컨텍스트로 분기하지 않는다(반환은 항상 `var()` 문자열이라
 * 브라우저가 런타임에 테마별로 재계산 → 오늘의 zero-rerender 테마 전환을 보존, 현상맵 §1.3).
 * R12b(스킨)에서 `skin` 을 읽어 FORM 토큰을 해결하는 자리를 여기 마련해 둔다.
 */
export class ThemeContext {
  constructor(
    public readonly theme: string = 'default',
    public readonly skin: string = 'default',
  ) {}
}

/**
 * propagateAppearance — 분리(portal-ed) UI 로 외관 축을 함께 복사(item3 §4.3, HANMS Q8).
 * 두 속성(`data-og-theme` COLOR · `data-og-skin` FORM)을 **한 번에** 복사해, 컴포넌트마다
 * 두 번째 속성을 잊어 스킨만 안 먹는 조용한 사고(§6-9)를 구조적으로 막는다.
 * `fromEl` 에서 가장 가까운 속성 보유 조상을 찾아 `toEl` 에 복사한다.
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

/** border()/focusRing() 형태 옵션(미래 스킨용). 미지정 시 오늘의 기본값 = byte-identical. */
export interface BorderOptions {
  /** 보더 스타일 키워드(기본 'solid'). */
  style?: string;
  /** true 면 상태(added/edited/removed·selection·range) 보더 — HANMS G-ST2: 항상 solid 강제. */
  state?: boolean;
}

export interface FocusRingOptions {
  width?: number;
  style?: string;
  color?: string;
}

export type ElevationLevel = 'sm' | 'md' | 'lg';

/**
 * AppearanceResolver — 렌더 레이어가 "형태 값"을 물어보는 단일 지점.
 * R12a 는 **결정을 객체화**할 뿐 값은 오늘과 동일하다(회귀 0). 상태 없음(순수) — 반환은
 * `var()` 기반 문자열 또는 px 패스스루라, 인스턴스 공유가 안전하다(멀티그리드 격리 무해).
 */
export class AppearanceResolver {
  constructor(private _ctx: ThemeContext = new ThemeContext()) {}

  /** 활성 테마/스킨 컨텍스트(R12b 스킨 해결의 진입점). */
  get context(): ThemeContext { return this._ctx; }

  /** 스킨이 활성(비-default)인가. default 면 오늘의 리터럴을 그대로 반환(byte-identical). */
  private _skinActive(): boolean { return this._ctx.skin !== 'default'; }

  /**
   * R12b: 스킨 컨텍스트 교체(테마는 유지). 파사드 setSkin 이 호출한 뒤 재렌더하면 인라인 form 사이트가
   * 이 컨텍스트로 재해석된다. default → named 전환 시 border/divider 가 리터럴 → var() 로 승격.
   */
  setSkin(skin: string): void { this._ctx = new ThemeContext(this._ctx.theme, skin); }

  /** border-color 토큰 참조(폴백 포함) — 렌더 코드가 오늘 쓰는 문자열과 동일. */
  private _borderColorVar(): string {
    return `var(--og-border-color,${BORDER_COLOR_FALLBACK})`;
  }

  /**
   * 셀/헤더 가장자리 보더. 오늘의 리터럴 `1px solid var(--og-border-color,#e0e0e0)` 과
   * **문자 단위 동일**. HANMS G-ST2: state 보더는 스타일을 solid 로 강제(현재 호출은 state 미지정 → no-op).
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
   */
  divider(): string {
    if (this._skinActive()) {
      // 스킨 활성: divider-style 이 border-style 과 갈라질 수 있어(§1.2) 별도 토큰으로 승격.
      return `var(--og-border-width, 1px) var(--og-divider-style, solid) ${this._borderColorVar()}`;
    }
    return this.border(); // default: border() 와 byte-identical
  }

  /**
   * G-ST1(코어 불변식, HANMS §2): 텍스처 존 제한. 텍스처는 컨테이너 배경·헤더 여백·빈 상태·온보딩
   * 오버레이에만 렌더되고, **데이터/상태/범위/병합/포커스 셀 배경 뒤에는 절대 렌더 금지**(스킨이 끌 수 없음).
   * 렌더 레이어가 셀 배경 텍스처를 바를 때 이 메서드로 zone 을 물어본다.
   *   - 금지 zone → 항상 `'none'`(스킨과 무관).
   *   - 허용 zone → `var(--og-texture-bg, none)`(스킨 미설정 시 none = byte-identical).
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
   */
  radius(px: number): string {
    return `${px}px`;
  }

  /**
   * 데이터/그룹 셀의 인라인 패딩. 오늘의 그룹 셀 리터럴 `2px 8px` 과 동일.
   * R12b `--og-cell-padding-*` 승격 자리.
   */
  cellPadding(): string {
    return '2px 8px';
  }

  /**
   * 엘리베이션(box-shadow) — R12b 스킨 축의 형태/잉크 분리 seam(§1.4)을 미리 표기한다.
   * R12a 에서는 어떤 인라인 사이트도 이 메서드를 경유하지 않는다(현재 그림자 결정이 인라인에 없음).
   * 값은 미래 토큰 + 오늘과 무해한 기본 geometry/alpha 로, 라우팅 0 이라 출력에 영향 없음.
   */
  elevation(level: ElevationLevel = 'md'): string {
    const geom: Record<ElevationLevel, string> = { sm: '0 1px 2px', md: '0 2px 6px', lg: '0 8px 24px' };
    const alpha: Record<ElevationLevel, string> = { sm: '0.07', md: '0.10', lg: '0.14' };
    return `var(--og-elevation-${level}, ${geom[level]}) rgba(var(--og-shadow-ink, 0 0 0), var(--og-elevation-alpha-${level}, ${alpha[level]}))`;
  }

  /**
   * 포커스 링. HANMS 하드 계약(불변식): 가시 포커스는 비협상 —
   * `width < 2px` 또는 `style: 'none'` 은 최소 `2px solid` 로 **클램프**한다(스킨이 끌 수 없음).
   * R12a 에서 라우팅되는 인라인 포커스 사이트는 없다(포커스 표시는 CSS 클래스 `.og-cell-focused`).
   * 기본 반환은 현 프라이머리 색 기반의 AA-safe 링 — 미래 스킨/오버라이드가 이 초크포인트를 경유한다.
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
 */
export const defaultAppearance = new AppearanceResolver();
