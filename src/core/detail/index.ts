/**
 * src/core/detail — F2 마스터/디테일 헤드리스 코어 배럴.
 * 계약: docs/design/grid-features-2026-07/11_design_F2_v2.md, 15_cross_contracts.md
 *
 * 후속 배선(미포함, 이 디렉터리 범위 밖):
 *  - GridRenderer.renderBody 의 `_isDetailHead`/`_isDetailFiller` 분기 + full-width 패널 절대배치
 *  - VirtualScroll.setTotalRows 에 detail 슬롯 반영(spliceDetails 결과 길이)
 *  - FlatRowModel.registerSplice(spliceDetails 어댑터) 연결
 *  - OpenGrid 의 expander 셀 렌더(DetailGlyph 소비) + expandRow/collapseRow/toggleRow API 배선
 */

export * from './DetailState.js';
export * from './DetailSplice.js';
export * from './SubgridCache.js';
export * from './DetailGlyph.js';
