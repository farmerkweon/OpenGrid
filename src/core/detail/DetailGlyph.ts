/**
 * DetailGlyph — F2 디테일 expander 글리프/aria 정책 (C10 R-DETAIL-GLYPH, HANMS-06 해소).
 * / DetailGlyph — F2 detail-expander glyph / aria policy (C10 R-DETAIL-GLYPH, resolves review item HANMS-06).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C10 "R-DETAIL-GLYPH": detail expander는
 *    **셰브론(▸/▾) 금지**. 트리 셰브론과 별도 글리프(`⊕/⊖` 또는 `▤ 상세`)+툴팁("상세 보기")+
 *    aria-label 로 구분. 트리가 **비활성**일 때만 셰브론 허용.
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §4.5(글리프/aria 상세), §1.2 NFR-5(접근성
 *    측정가능 AC: aria-expanded 토글, aria-controls 연결), §4.3(panel.id 규칙 = aria-controls 타겟),
 *    C8.4(터치 히트 타겟 ≥44×44 CSS px).
 * / Contract basis:
 *  - 15_cross_contracts.md C10 "R-DETAIL-GLYPH": the detail expander **must not use a chevron (▸/▾)**.
 *    It is distinguished from the tree chevron by a separate glyph (`⊕/⊖` or `▤ detail`) + tooltip ("View detail")
 *    + aria-label. A chevron is allowed only when the tree is **inactive**.
 *  - 11_design_F2_v2.md §4.5 (glyph/aria detail), §1.2 NFR-5 (measurable accessibility AC: aria-expanded toggle,
 *    aria-controls linkage), §4.3 (panel.id rule = aria-controls target), C8.4 (touch hit target ≥44×44 CSS px).
 *
 * 렌더 배선(GridRenderer expander 셀)이 이 모듈의 순수 함수/상수를 소비해 실제 DOM 속성을 채운다.
 * 이 파일은 DOM 을 만들지 않는다 — 문자열/속성 값만 생성.
 * / Render wiring (GridRenderer expander cell) consumes this module's pure functions/constants to populate the
 * actual DOM attributes. This file creates no DOM — only string/attribute values.
 */

import { t as _globalT } from '../i18n/LocaleRegistry.js';

/** i18n: 글리프 aria/툴팁 로케일 해석기(주입 없으면 전역 t). / i18n: glyph aria/tooltip resolver (global t when not injected). */
export type DetailGlyphT = (key: string, params?: Record<string, string | number>) => string;

/** 접힘 상태 전용 글리프(트리 셰브론 ▸/▾과 충돌하지 않는 C10 기본값). / Collapsed-state glyph (C10 default that does not collide with the tree chevron ▸/▾). */
export const DETAIL_GLYPH_COLLAPSED = '⊕'; // ⊕
/** 펼침 상태 전용 글리프(트리 셰브론과 충돌하지 않는 C10 기본값). / Expanded-state glyph (C10 default that does not collide with the tree chevron). */
export const DETAIL_GLYPH_EXPANDED = '⊖'; // ⊖
/** 라벨형 대안(옵션) — 기본은 원형 글리프, toggle:'first-cell' 등 배치에서 선택적으로 사용. / Label-style alternative (optional) — the circular glyph is default; used selectively in layouts like toggle:'first-cell'. */
export const DETAIL_GLYPH_LABEL_COLLAPSED = '▤ 상세'; // ▤ 상세
/** 툴팁 고정 문구(C10 "상세 보기"). / Fixed tooltip text (C10 "View detail"). */
export const DETAIL_GLYPH_TOOLTIP = '상세 보기';

/** C8.4: expander 히트 타겟 최소 CSS px(가로/세로). / C8.4: minimum expander hit-target size in CSS px (width/height). */
export const DETAIL_EXPANDER_MIN_HIT_TARGET_PX = 44;

/** getDetailGlyph 반환 구조 — 렌더 배선이 소비할 글리프/aria/title 묶음. / Return shape of getDetailGlyph — glyph/aria/title bundle for render wiring to consume. */
export interface DetailGlyphInfo {
  /** 화면에 그릴 문자(셰브론 아님, C10). / Character to render (not a chevron, C10). */
  glyph: string;
  /** expander 자체 aria-label(NFR-5, HANMS-06 — SR 에서 트리 토글과 구분). / The expander's own aria-label (NFR-5, HANMS-06 — distinguished from the tree toggle for screen readers). */
  ariaLabel: string;
  /** 툴팁 title 속성(C10 "상세 보기" 고정 문구). / Tooltip title attribute (C10 fixed text "View detail"). */
  title: string;
}

/**
 * 펼침 여부에 따른 글리프/aria-label/title 조합을 반환한다. 트리 셰브론과 절대 겹치지 않는
 * 문자셋만 사용(C10 R-DETAIL-GLYPH 하드 룰).
 * / Return the glyph/aria-label/title combination for the given expanded state. Uses only a character set that
 * never overlaps the tree chevron (C10 R-DETAIL-GLYPH hard rule).
 *
 * @param expanded - 현재 펼침 여부 / Whether currently expanded
 * @param t - i18n 로케일 해석기(미주입 시 전역 t) / i18n locale resolver (global t when not injected)
 * @returns 글리프/aria-label/title 묶음 / glyph/aria-label/title bundle
 */
export function getDetailGlyph(expanded: boolean, t: DetailGlyphT = _globalT): DetailGlyphInfo {
  return {
    glyph: expanded ? DETAIL_GLYPH_EXPANDED : DETAIL_GLYPH_COLLAPSED,
    ariaLabel: expanded ? t('detail.collapseAria') : t('detail.expandAria'),
    title: t('detail.glyphTooltip'),
  };
}

/**
 * NFR-5(1): 마스터 행 `aria-expanded` 값(문자열 — DOM setAttribute 그대로 사용).
 * / NFR-5(1): master-row `aria-expanded` value (string — used directly in DOM setAttribute).
 *
 * @param expanded - 현재 펼침 여부 / Whether currently expanded
 * @returns 'true' 또는 'false' 문자열 / 'true' or 'false' string
 */
export function getMasterRowAriaExpanded(expanded: boolean): 'true' | 'false' {
  return expanded ? 'true' : 'false';
}

/**
 * NFR-5(2)/§4.3: 패널 DOM id 규칙. expander 의 `aria-controls` 와 패널의 `id` 는 반드시 이
 * 한 함수로만 생성해 두 값의 불일치를 구조적으로 차단한다.
 * / NFR-5(2)/§4.3: panel DOM id rule. The expander's `aria-controls` and the panel's `id` must be generated only
 * by this single function, structurally preventing any mismatch between the two.
 *
 * @param rowId - stable rowId / stable rowId
 * @returns 패널 DOM id(`og-detail-<rowId>`) / Panel DOM id (`og-detail-<rowId>`)
 */
export function getDetailPanelId(rowId: string): string {
  return `og-detail-${rowId}`;
}

/**
 * §4.5 "트리 동시 활성 시 충돌 해소" 규칙의 판별 헬퍼: 트리가 활성화된 그리드에서는 셰브론을
 * 쓸 수 없다(트리 셰브론과 자리를 공유하지 않도록 렌더 배선이 별도 컬럼/색을 쓰게 강제하는 신호).
 * 트리 비활성일 때만 셰브론 허용 여부를 true 로 반환한다.
 * / Decision helper for the §4.5 "resolve conflict when tree is simultaneously active" rule: a chevron cannot be
 * used in a tree-active grid (a signal that forces render wiring to use a separate column/color so it does not
 * share space with the tree chevron). Returns true only when the tree is inactive.
 *
 * @param treeActive - 트리 활성 여부 / Whether the tree is active
 * @returns 셰브론 허용 여부 / Whether a chevron is allowed
 */
export function isChevronAllowedForDetail(treeActive: boolean): boolean {
  return !treeActive;
}
