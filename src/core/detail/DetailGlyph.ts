/**
 * DetailGlyph — F2 디테일 expander 글리프/aria 정책 (C10 R-DETAIL-GLYPH, HANMS-06 해소).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C10 "R-DETAIL-GLYPH": detail expander는
 *    **셰브론(▸/▾) 금지**. 트리 셰브론과 별도 글리프(`⊕/⊖` 또는 `▤ 상세`)+툴팁("상세 보기")+
 *    aria-label 로 구분. 트리가 **비활성**일 때만 셰브론 허용.
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §4.5(글리프/aria 상세), §1.2 NFR-5(접근성
 *    측정가능 AC: aria-expanded 토글, aria-controls 연결), §4.3(panel.id 규칙 = aria-controls 타겟),
 *    C8.4(터치 히트 타겟 ≥44×44 CSS px).
 *
 * 렌더 배선(GridRenderer expander 셀)이 이 모듈의 순수 함수/상수를 소비해 실제 DOM 속성을 채운다.
 * 이 파일은 DOM 을 만들지 않는다 — 문자열/속성 값만 생성.
 */

import { t as _globalT } from '../i18n/LocaleRegistry.js';

/** i18n: 글리프 aria/툴팁 로케일 해석기(주입 없으면 전역 t). / i18n: glyph aria/tooltip resolver (global t when not injected). */
export type DetailGlyphT = (key: string, params?: Record<string, string | number>) => string;

/** 트리 셰브론(▸/▾)과 충돌하지 않는 전용 글리프(C10 기본값). */
export const DETAIL_GLYPH_COLLAPSED = '⊕'; // ⊕
export const DETAIL_GLYPH_EXPANDED = '⊖'; // ⊖
/** 라벨형 대안(옵션) — 기본은 원형 글리프, toggle:'first-cell' 등 배치에서 선택적으로 사용. */
export const DETAIL_GLYPH_LABEL_COLLAPSED = '▤ 상세'; // ▤ 상세
export const DETAIL_GLYPH_TOOLTIP = '상세 보기';

/** C8.4: expander 히트 타겟 최소 CSS px(가로/세로). */
export const DETAIL_EXPANDER_MIN_HIT_TARGET_PX = 44;

export interface DetailGlyphInfo {
  /** 화면에 그릴 문자(셰브론 아님, C10). */
  glyph: string;
  /** expander 자체 aria-label(NFR-5, HANMS-06 — SR 에서 트리 토글과 구분). */
  ariaLabel: string;
  /** 툴팁 title 속성(C10 "상세 보기" 고정 문구). */
  title: string;
}

/**
 * 펼침 여부에 따른 글리프/aria-label/title 조합을 반환한다. 트리 셰브론과 절대 겹치지 않는
 * 문자셋만 사용(C10 R-DETAIL-GLYPH 하드 룰).
 */
export function getDetailGlyph(expanded: boolean, t: DetailGlyphT = _globalT): DetailGlyphInfo {
  return {
    glyph: expanded ? DETAIL_GLYPH_EXPANDED : DETAIL_GLYPH_COLLAPSED,
    ariaLabel: expanded ? t('detail.collapseAria') : t('detail.expandAria'),
    title: t('detail.glyphTooltip'),
  };
}

/** NFR-5(1): 마스터 행 `aria-expanded` 값(문자열 — DOM setAttribute 그대로 사용). */
export function getMasterRowAriaExpanded(expanded: boolean): 'true' | 'false' {
  return expanded ? 'true' : 'false';
}

/**
 * NFR-5(2)/§4.3: 패널 DOM id 규칙. expander 의 `aria-controls` 와 패널의 `id` 는 반드시 이
 * 한 함수로만 생성해 두 값의 불일치를 구조적으로 차단한다.
 */
export function getDetailPanelId(rowId: string): string {
  return `og-detail-${rowId}`;
}

/**
 * §4.5 "트리 동시 활성 시 충돌 해소" 규칙의 판별 헬퍼: 트리가 활성화된 그리드에서는 셰브론을
 * 쓸 수 없다(트리 셰브론과 자리를 공유하지 않도록 렌더 배선이 별도 컬럼/색을 쓰게 강제하는 신호).
 * 트리 비활성일 때만 셰브론 허용 여부를 true 로 반환한다.
 */
export function isChevronAllowedForDetail(treeActive: boolean): boolean {
  return !treeActive;
}
