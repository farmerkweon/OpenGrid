// ============================================================
// DD-12 §2.1 aria 투영 값객체 / aria projection value objects
// ------------------------------------------------------------
// 설계 근거(Why): "aria 는 손으로 붙이는 마크업이 아니라 모델 상태의 파생물"(불변식 1).
//   헤드리스 코어는 DOM 을 만지지 않고 한 요소에 투영할 aria "의도"(속성 이름→값 맵) 값객체만
//   산출하며, 실제 setAttribute 물질화는 IAriaRenderPort(DD-03/14) 경계 밖이다.
// / Design: aria is a *derivative of model state*, not hand-authored markup (invariant 1).
//   The headless core produces only an aria "intent" value object (attribute name→value map);
//   materialization via setAttribute happens outside, at the IAriaRenderPort boundary (DD-03/14).
// ============================================================

/**
 * aria 롤(WAI-ARIA grid 패턴). 렌더/호스트가 `el.role` 로 물질화한다.
 * / ARIA roles (WAI-ARIA grid pattern). The renderer/host materializes them via `el.role`.
 */
export type AriaRole =
  | 'grid' | 'row' | 'gridcell' | 'columnheader' | 'rowheader'
  | 'treegrid' | 'button' | 'dialog' | 'listbox' | 'option' | 'menu' | 'menuitem' | 'img';

/**
 * 요소 식별자 — 모델 좌표(어떤 셀/행/오버레이)를 렌더 요소로 해소하기 위한 안정 문자열 키.
 * 예: `'cell:42:3'` · `'overlay:filter'` · `'chart:sales'` · `'grid'`.
 * / Node key — a stable string resolving a model coordinate (cell/row/overlay) to a render element.
 */
export type A11yNodeKey = string;

/** AriaIntent.attrs 의 허용 속성 키(aria-* + 소수의 비-aria 접근성 속성). / Allowed attribute keys. */
export type AriaAttrKey = `aria-${string}` | 'tabindex' | 'lang' | 'dir' | 'role';

/**
 * 한 DOM 요소에 투영할 aria "의도" — 속성 이름→값의 불변 맵(헤드리스 값객체).
 * 렌더(DD-03)/호스트(DD-14)가 이 맵을 `setAttribute` 로 물질화한다. **값 `undefined` = 속성 제거**.
 * / An immutable name→value map of aria attributes to project onto one element (headless VO).
 *   The renderer/host materializes it via setAttribute; a value of `undefined` = remove the attribute.
 */
/** aria/비-aria 접근성 속성 맵(부분 — 존재하는 키만). 값 `undefined`=속성 제거. / Partial attribute map; value `undefined`=remove. */
export type AriaAttrs = Partial<Record<`aria-${string}` | 'tabindex' | 'lang' | 'dir', string | undefined>>;

export interface AriaIntent {
  /** 롤(선택). 미지정 = 롤 미변경. / Role (optional); absent = role unchanged. */
  readonly role?: AriaRole;
  /** aria-* 속성 맵. 예 `{ 'aria-selected': 'true', 'aria-rowindex': '42' }`. `undefined`=제거. */
  readonly attrs: Readonly<AriaAttrs>;
  /** aria-label 소스가 마스킹 후 display 인지 표식(감사가 raw 유출을 검증, 불변식 2). / label is display-derived. */
  readonly labelFromDisplay?: boolean;
}

/** AriaIntent 를 exactOptionalPropertyTypes 안전하게 조립. undefined 옵셔널 키는 넣지 않는다. / Assemble an AriaIntent safely. */
export function makeAriaIntent(
  attrs: AriaAttrs,
  opts?: { role?: AriaRole; labelFromDisplay?: boolean },
): AriaIntent {
  const out: { role?: AriaRole; attrs: AriaAttrs; labelFromDisplay?: boolean } = { attrs };
  if (opts?.role !== undefined) out.role = opts.role;
  if (opts?.labelFromDisplay !== undefined) out.labelFromDisplay = opts.labelFromDisplay;
  return out;
}
