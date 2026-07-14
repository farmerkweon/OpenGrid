// ============================================================
// DD-11 §2.1 IAppearanceAxis — 동형 외관 축 SPI(5축 공통 계약) + 델타축 기반구현
// / DD-11 §2.1 IAppearanceAxis — the isomorphic appearance-axis SPI + a token-delta base impl.
// ------------------------------------------------------------
// 설계 근거(Why, §2.1·불변식 1~3):
//   외관을 "특수 케이스 5개" 가 아니라 **하나의 인터페이스를 만족하는 5개 등록소**(theme·skin·
//   density·texture·icon)로 통일한다. 각 축은 **자기 이름공간 토큰만** 낸다(축 오염 금지 = 물리
//   직교). default id 는 **빈 델타**(byte-identical) 이며, 신설 축(density·texture)은 default 시
//   `attr` 를 생략한다 — default 에 `data-og-density="default"` 같은 새 속성이 붙으면 그 자체로
//   DOM diff 라 골든이 깨진다(REQ-TX-827, §R.1).
//
//   `define/has/resolve/list` 는 DD-10 `IRegistry<V,K>`(REQ-T4-801)의 얇은 어댑터다(재구현 아님):
//   define≈register(축 오염·정직성 검증을 등록 게이트로), has≈has, resolve≈get(미등록→빈 델타 =
//   never-throw 폴백, IconRegistry 와 동일 계약), list≈keys. 축 고유의 이름공간 검증·relayout
//   플래그만 얹은 특화 뷰다. 헤드리스·순수(DOM 미참조).
// ============================================================

/** 외관 축 식별자. 이름공간(prefix)이 물리 직교의 열쇠. / Appearance axis id; the token prefix is the key to physical orthogonality. */
export type AxisId = 'theme' | 'skin' | 'density' | 'texture' | 'icon';

/** 한 축의 CSS 변수 델타(자기 이름공간만). / A CSS-var delta for one axis (own namespace only). */
export type TokenDelta = Readonly<Record<string, string>>;

/** 컨테이너에 붙일 data-* 속성. / A data-* attribute to place on the container. */
export interface AxisAttr {
  readonly name: string;
  readonly value: string;
}

/**
 * 한 축의 선택 결과 = 토큰 델타 + 컨테이너 속성 + relayout 플래그.
 * / One axis's selection = token delta + container attribute + relayout flag.
 */
export interface AxisResolution {
  /** 이 축이 발행하는 CSS 변수 델타(자기 이름공간만). default → 빈 객체. / CSS var delta (own namespace only); empty for default. */
  readonly tokens: TokenDelta;
  /** 컨테이너 data-* 속성. default/신설 축이면 생략(byte-identical). / Container data-* attr; omitted for default/new-axis. */
  readonly attr?: AxisAttr;
  /** 이 선택이 재계산을 요구하는가(밀도 = 행높이 relayout). / Does this selection require recompute (density → row-height relayout)? */
  readonly requiresRelayout?: boolean;
}

/** 축 정의 결과 — 등록된(가드레일 반영) 델타 + 경고. / Axis-definition result — registered (clamped) delta + warnings. */
export interface AxisDefineResult {
  readonly delta: TokenDelta;
  readonly warnings: string[];
}

/**
 * IAppearanceAxis — 한 외관 축의 등록·검증·해소를 소유하는 동형 SPI(§2.1).
 * 불변식: resolve(id)는 **자기 이름공간 토큰만** 낸다(축 오염 금지). default id 는 빈 델타(byte-identical).
 * / IAppearanceAxis — the isomorphic SPI owning one axis's registration/validation/resolution.
 */
export interface IAppearanceAxis {
  readonly id: AxisId;
  /** 이 축이 소유하는 토큰 이름공간(검증용). / Token namespace this axis owns (for validation). */
  readonly namespace: ReadonlySet<string>;
  /** 값 등록(사용자 확장). 축 오염·정직성 위반 시 throw 또는 클램프+경고. / Register a value; throws on axis-pollution, clamps+warns on honesty violations. */
  define(id: string, delta: TokenDelta): AxisDefineResult;
  /** 등록 여부. / Whether registered. */
  has(id: string): boolean;
  /** 축값 → 해소(토큰·속성·relayout 플래그). 미등록/default → 빈 델타. / Value id → resolution; unknown/default → empty delta. */
  resolve(valueId: string): AxisResolution;
  /** 등록된 값 id 목록(카탈로그·인스펙터용). / Registered value ids (for catalog/inspector). */
  list(): string[];
}

/** 축값이 default 인가(빈-델타·attr 생략 경로). / Is a value id the default (empty-delta / attr-omitted path)? */
export const DEFAULT_AXIS_VALUE = 'default';

/** 빈 해소(default/미등록) — attr·relayout 없음. / Empty resolution (default/unknown) — no attr, no relayout. */
export const EMPTY_RESOLUTION: AxisResolution = Object.freeze({ tokens: Object.freeze({}) });

/** TokenAxis 구성. / TokenAxis configuration. */
export interface TokenAxisConfig {
  readonly id: AxisId;
  /** 컨테이너 data-* 속성명(예: 'data-og-density'). / Container data-* attribute name. */
  readonly attrName: string;
  /** 이 축이 소유하는 토큰 이름공간(자기 prefix 집합). / The token namespace (own prefix set). */
  readonly namespace: ReadonlySet<string>;
  /** named 값이 relayout 을 요구하는가(density=true). 기본 false. / Do named values require relayout (density=true)? Default false. */
  readonly requiresRelayout?: boolean;
}

/**
 * 이름공간 검증 — 델타의 모든 토큰이 이 축 소유인지(축 오염 거부). throw on violation.
 * / Namespace validation — every token must be owned by this axis (rejects axis-pollution).
 *
 * @param axisId - 축 id / Axis id
 * @param namespace - 소유 토큰 집합 / Owned token set
 * @param delta - 검사할 델타 / Delta to validate
 * @throws 이름공간 밖 토큰이 있으면 Error / Throws if a token is outside the namespace
 */
export function assertNamespace(axisId: AxisId, namespace: ReadonlySet<string>, delta: TokenDelta): void {
  for (const key of Object.keys(delta)) {
    if (!namespace.has(key)) {
      throw new Error(
        `[AppearanceAxis:${axisId}] 토큰 "${key}" 은 ${axisId} 축 이름공간이 아닙니다. ` +
        `각 축은 자기 이름공간 토큰만 소유합니다(축 오염 금지 — 이름-분리 물리 직교, 불변식 1).`,
      );
    }
  }
}

/**
 * TokenAxis — 델타-등록형 축(density·texture)의 재사용 기반 구현.
 * define 은 이름공간 검증 + (서브클래스) 가드레일 후 등록. resolve 는 default/미등록 → 빈 델타(+attr 생략),
 * named → 델타 + `{name:attrName, value:id}` (+ requiresRelayout).
 * / TokenAxis — reusable base for delta-registered axes (density·texture). Headless, pure.
 *
 * @example
 * const ax = new TokenAxis({ id: 'density', attrName: 'data-og-density', namespace: DENSITY_TOKENS, requiresRelayout: true });
 * ax.resolve('default'); // { tokens:{} } — byte-identical
 */
export class TokenAxis implements IAppearanceAxis {
  readonly id: AxisId;
  readonly namespace: ReadonlySet<string>;
  protected readonly _attrName: string;
  protected readonly _requiresRelayout: boolean;
  protected readonly _values = new Map<string, TokenDelta>();

  constructor(cfg: TokenAxisConfig) {
    this.id = cfg.id;
    this.namespace = cfg.namespace;
    this._attrName = cfg.attrName;
    this._requiresRelayout = cfg.requiresRelayout ?? false;
  }

  /** 내장 값 등록(가드레일만, 경고는 삼킴 — CSS 는 정적 번들 소유). / Register a built-in value (guardrails only). */
  registerBuiltin(id: string, delta: TokenDelta): void {
    assertNamespace(this.id, this.namespace, delta);
    this._values.set(id, this._guardrails(id, delta).delta);
  }

  /** 서브클래스 가드레일 훅(기본 no-op). / Subclass guardrail hook (default no-op). */
  protected _guardrails(_id: string, delta: TokenDelta): AxisDefineResult {
    return { delta, warnings: [] };
  }

  define(id: string, delta: TokenDelta): AxisDefineResult {
    assertNamespace(this.id, this.namespace, delta);
    const result = this._guardrails(id, delta);
    this._values.set(id, result.delta);
    for (const w of result.warnings) {
      if (typeof console !== 'undefined') console.warn(`[AppearanceAxis:${this.id}] "${id}": ${w}`);
    }
    return result;
  }

  has(id: string): boolean {
    return this._values.has(id);
  }

  resolve(valueId: string): AxisResolution {
    if (valueId === DEFAULT_AXIS_VALUE) return EMPTY_RESOLUTION;
    const delta = this._values.get(valueId);
    if (delta === undefined) return EMPTY_RESOLUTION; // never-throw 폴백(미등록 = default 취급)
    const res: { tokens: TokenDelta; attr: AxisAttr; requiresRelayout?: boolean } = {
      tokens: delta,
      attr: { name: this._attrName, value: valueId },
    };
    if (this._requiresRelayout) res.requiresRelayout = true;
    return res;
  }

  list(): string[] {
    return [...this._values.keys()];
  }
}
