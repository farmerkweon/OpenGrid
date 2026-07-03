import { describe, it, expect } from 'vitest';
import {
  getDetailGlyph,
  getMasterRowAriaExpanded,
  getDetailPanelId,
  isChevronAllowedForDetail,
  DETAIL_GLYPH_COLLAPSED,
  DETAIL_GLYPH_EXPANDED,
  DETAIL_GLYPH_TOOLTIP,
  DETAIL_EXPANDER_MIN_HIT_TARGET_PX,
} from '../../src/core/detail/DetailGlyph.js';

const CHEVRONS = ['▸', '▾', '▶', '▼', '›', '⌄'];

describe('DetailGlyph (C10 R-DETAIL-GLYPH)', () => {
  describe('글리프는 셰브론이 아니다', () => {
    it('collapsed/expanded 글리프 상수가 셰브론 집합에 속하지 않는다', () => {
      expect(CHEVRONS).not.toContain(DETAIL_GLYPH_COLLAPSED);
      expect(CHEVRONS).not.toContain(DETAIL_GLYPH_EXPANDED);
    });

    it('getDetailGlyph(false) → 접힘 글리프 + 펼치기 aria-label + 공용 툴팁', () => {
      const info = getDetailGlyph(false);
      expect(info.glyph).toBe(DETAIL_GLYPH_COLLAPSED);
      expect(CHEVRONS).not.toContain(info.glyph);
      expect(info.ariaLabel).toBe('상세 패널 펼치기');
      expect(info.title).toBe(DETAIL_GLYPH_TOOLTIP);
    });

    it('getDetailGlyph(true) → 펼침 글리프 + 접기 aria-label', () => {
      const info = getDetailGlyph(true);
      expect(info.glyph).toBe(DETAIL_GLYPH_EXPANDED);
      expect(CHEVRONS).not.toContain(info.glyph);
      expect(info.ariaLabel).toBe('상세 패널 접기');
    });

    it('collapsed/expanded 글리프는 서로 다르다(시각적으로 상태 구분 가능)', () => {
      expect(getDetailGlyph(false).glyph).not.toBe(getDetailGlyph(true).glyph);
    });
  });

  describe('aria-expanded (NFR-5)', () => {
    it('true/false 를 문자열로 정확히 토글', () => {
      expect(getMasterRowAriaExpanded(true)).toBe('true');
      expect(getMasterRowAriaExpanded(false)).toBe('false');
    });
  });

  describe('패널 id / aria-controls 연결 (NFR-5, §4.3)', () => {
    it('rowId 로부터 결정적(deterministic) id 생성', () => {
      expect(getDetailPanelId('r1')).toBe('og-detail-r1');
      expect(getDetailPanelId('r1')).toBe(getDetailPanelId('r1'));
    });

    it('서로 다른 rowId 는 서로 다른 패널 id', () => {
      expect(getDetailPanelId('r1')).not.toBe(getDetailPanelId('r2'));
    });
  });

  describe('트리 동시 활성 시 셰브론 금지 판별 (§4.5)', () => {
    it('트리 활성(treeActive:true) → 셰브론 비허용', () => {
      expect(isChevronAllowedForDetail(true)).toBe(false);
    });

    it('트리 비활성(treeActive:false) → 셰브론 허용', () => {
      expect(isChevronAllowedForDetail(false)).toBe(true);
    });
  });

  describe('터치 히트 타겟 상수 (C8.4)', () => {
    it('최소 44px 이상', () => {
      expect(DETAIL_EXPANDER_MIN_HIT_TARGET_PX).toBeGreaterThanOrEqual(44);
    });
  });
});
