// ============================================================
// DD-11 §2.3 AppearanceComposer — N축을 단일 cascade 로 결합하는 컴포지션 루트(순수)
// / DD-11 §2.3 AppearanceComposer — the single composition root combining N axes in one cascade.
// ------------------------------------------------------------
// 설계 근거(Why, §2.3·REQ-T1-801/804·불변식 2·3):
//   축을 **결정론적 cascade 순서**(theme→skin→density→texture→override)로 합성하는 유일 지점.
//   "곱(조합폭발)" 이 아니라 "합(델타 병합)" 이라 15테마×7스킨×4밀도×3질감을 N개 소스로 감당.
//   뒤 축이 앞 축 토큰을 덮지 않는다(이름-분리라 충돌 불가) — 순서는 속성 적용·relayout 트리거용.
//   **기본(4축 default) 경로는 byte-identical**: tokens={} + theme/skin 속성만(density/texture attr
//   생략, 불변식 3·§R.1). 상태 없음(순수): 같은 Appearance → 같은 ComposedAppearance(캐시 안정).
//   validate 는 Appearance 애그리게이트에 위임(중복 판정 로직 없음). 헤드리스.
// ============================================================

import { Appearance, type AppearanceFinding } from './Appearance.js';
import type { AxisAttr, IAppearanceAxis, TokenDelta } from './AppearanceAxis.js';
import type { ThemeMetaRegistry } from './ThemeMetaRegistry.js';

/** 다섯 축 레지스트리 묶음(컴포저 주입). / The five axis registries (injected into composer). */
export interface AppearanceRegistrySet {
  readonly theme: ThemeMetaRegistry;
  readonly skin: IAppearanceAxis;
  readonly density: IAppearanceAxis;
  readonly texture: IAppearanceAxis;
  readonly icon: IAppearanceAxis;
}

/** 합성 결과 = 컨테이너에 적용할 속성·토큰·relayout 필요 여부·판정. / Composition output. */
export interface ComposedAppearance {
  readonly appearance: Appearance;
  /** data-og-theme/skin/density/texture — 순서 결정론. default/신설 축은 생략. / Container attrs (deterministic order). */
  readonly attrs: ReadonlyArray<AxisAttr>;
  /** 병합된 최종 델타(옵트인 시만 비어있지 않음). / Merged final delta (non-empty only under opt-in). */
  readonly tokens: TokenDelta;
  /** 밀도가 바뀌었나(DD-02 relayout 위임 트리거). / Did density change (triggers DD-02 relayout)? */
  readonly requiresRelayout: boolean;
  /** 위험/불가 플래그(데모 배지·API 공유). / Risky/invalid flags (shared by demo/API). */
  readonly findings: AppearanceFinding[];
}

/**
 * AppearanceComposer — N축을 단일 cascade 로 결합하는 컴포지션 루트(순수·상태 없음).
 * / AppearanceComposer — the pure, stateless composition root.
 *
 * @example
 * const composer = new AppearanceComposer(regs);
 * composer.compose(new Appearance());                 // { attrs:[theme,skin], tokens:{}, requiresRelayout:false } — byte-identical
 * composer.compose(new Appearance('dark','sharp','compact','linen'));
 */
export class AppearanceComposer {
  constructor(private readonly _reg: AppearanceRegistrySet) {}

  /**
   * 4축 선택 → 합성 결과. cascade 순서: theme → skin → density → texture(→ icon: 속성/토큰 없음).
   * default 조합은 tokens={} + theme/skin 속성만(density/texture attr 생략 = byte-identical, 불변식 3).
   * / 4-axis selection → composition. Default composition yields tokens={} + only theme/skin attrs.
   *
   * @param a - 4축 외관 값 / The 4-axis appearance value
   * @returns 속성·토큰·relayout·판정 / Attrs, tokens, relayout flag, findings
   */
  compose(a: Appearance): ComposedAppearance {
    const attrs: AxisAttr[] = [];
    const tokens: Record<string, string> = {};
    let requiresRelayout = false;

    // 결정론 cascade 순서. 이름-분리라 뒤 축이 앞 축 토큰을 덮지 않는다(충돌 불가).
    const order: IAppearanceAxis[] = [
      this._reg.theme,
      this._reg.skin,
      this._reg.density,
      this._reg.texture,
    ];
    const value: Record<string, string> = {
      theme: a.theme,
      skin: a.skin,
      density: a.density,
      texture: a.texture,
    };

    for (const axis of order) {
      const res = axis.resolve(value[axis.id]!);
      if (res.attr) attrs.push(res.attr);
      Object.assign(tokens, res.tokens);
      if (res.requiresRelayout) requiresRelayout = true;
    }

    const findings = a.validate(this._reg);

    return { appearance: a, attrs, tokens, requiresRelayout, findings };
  }
}
