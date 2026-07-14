// ============================================================
// DD-11 §2.1·§5 축 어댑터 — 기존 SkinRegistry·IconRegistry 를 IAppearanceAxis 로 정합(공개 시그니처 불변)
// / DD-11 §2.1·§5 axis adapters — conform existing SkinRegistry·IconRegistry to IAppearanceAxis.
// ------------------------------------------------------------
// 설계 근거(Why, §5 "재사용 — 공개 시그니처 불변"):
//   SkinRegistry(FORM)·IconRegistry(icon)는 이미 존재하며 계약이 안정적이다. 이들을 **얇은 어댑터**로
//   감싸 컴포저에 동형 축으로 주입한다(재구현 0, 기존 파일 무수정). skin 축은 named 스킨에서
//   `data-og-skin` 속성을 발행하고(토큰은 skins.css 정적 번들 소유라 델타는 검증용), icon 축은
//   글리프 결합축이라 컨테이너 토큰 델타가 없다(role→glyph 는 렌더 시점 IconRegistry 소유).
//   default 는 빈 델타 + (skin) 속성 유지 = byte-identical.
// ============================================================

import type { SkinRegistry } from '../SkinRegistry.js';
import type { IconRegistry } from '../IconRegistry.js';
import type { AxisId, AxisResolution, IAppearanceAxis, TokenDelta, AxisDefineResult } from './AppearanceAxis.js';
import { DEFAULT_AXIS_VALUE } from './AppearanceAxis.js';

/**
 * SkinAxisAdapter — SkinRegistry(기존)를 skin 축(IAppearanceAxis)으로 정합.
 * resolve 는 default → 빈 델타(+속성 유지, 오늘의 data-og-skin), named → 등록 델타 + `data-og-skin`.
 * 토큰은 skins.css 정적 번들이 실제 CSS 를 전달하므로 델타는 카탈로그/검증용(컴포저는 속성만 적용).
 * / SkinAxisAdapter — conforms the existing SkinRegistry to the skin axis.
 */
export class SkinAxisAdapter implements IAppearanceAxis {
  readonly id: AxisId = 'skin';
  /** FORM 이름공간은 SkinRegistry.assertFormOnly 가 소유·강제(어댑터는 위임). 참조용 빈 집합. */
  readonly namespace: ReadonlySet<string> = new Set<string>();

  constructor(private readonly _reg: SkinRegistry) {}

  define(id: string, delta: TokenDelta): AxisDefineResult {
    const r = this._reg.define(id, delta as Record<string, string>);
    return { delta: r.delta as TokenDelta, warnings: r.warnings };
  }

  has(id: string): boolean {
    return this._reg.has(id);
  }

  resolve(valueId: string): AxisResolution {
    if (valueId === DEFAULT_AXIS_VALUE) {
      return { tokens: {}, attr: { name: 'data-og-skin', value: DEFAULT_AXIS_VALUE } };
    }
    const delta = (this._reg.get(valueId) ?? {}) as TokenDelta;
    return { tokens: delta, attr: { name: 'data-og-skin', value: valueId } };
  }

  list(): string[] {
    return this._reg.list();
  }
}

/**
 * IconAxisAdapter — IconRegistry(기존)를 icon 축(IAppearanceAxis)으로 정합.
 * 아이콘 축은 컨테이너 토큰 델타·data-* 속성을 발행하지 않는다(role→glyph 결합은 렌더 시점 소유).
 * has/list 는 role 존재/목록으로 위임. resolve 는 항상 빈 델타(컴포저 속성 적용 대상 아님).
 * / IconAxisAdapter — conforms the existing IconRegistry to the icon axis (no container tokens/attrs).
 */
export class IconAxisAdapter implements IAppearanceAxis {
  readonly id: AxisId = 'icon';
  readonly namespace: ReadonlySet<string> = new Set<string>();

  constructor(private readonly _reg: IconRegistry) {}

  /** 아이콘 축의 define 은 role→glyph 등록으로 위임(delta 의 첫 항목을 role/glyph 로 해석하지 않음 — 명시 API 사용 권장). */
  define(_id: string, _delta: TokenDelta): AxisDefineResult {
    // 아이콘 role 등록은 IconRegistry.register(role, glyph) 명시 API 로. 축 define 은 no-op(빈 델타).
    return { delta: {}, warnings: [] };
  }

  has(id: string): boolean {
    return this._reg.has(id);
  }

  resolve(_valueId: string): AxisResolution {
    return { tokens: {} }; // 아이콘은 컨테이너 속성/토큰 없음(글리프 결합은 렌더 소유)
  }

  list(): string[] {
    return this._reg.roles();
  }
}
