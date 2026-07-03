import { describe, it, expect } from 'vitest';
import {
  OKABE_ITO, PATTERN_CYCLE,
  parseColor, normalizeColor, contrastRatio, relativeLuminance,
  simulateDichromacy, colorDistance,
  resolveSeriesStyles, orderByAdjacentContrast,
  minAdjacentContrast, minAdjacentDichromacyDeltaE,
} from '../../../src/core/chart/palette';

describe('palette — 색 파싱/정규화', () => {
  it('#rgb / #rrggbb / rgb() 파싱', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#0072B2')).toEqual({ r: 0, g: 114, b: 178 });
    expect(parseColor('rgb(16, 32, 48)')).toEqual({ r: 16, g: 32, b: 48 });
    expect(parseColor('nope')).toBeNull();
  });
  it('normalizeColor → rgba(r, g, b, 1) (UR-2 theme_bind 비교형)', () => {
    expect(normalizeColor('#336699')).toBe('rgba(51, 102, 153, 1)');
    expect(normalizeColor('rgb(51,102,153)')).toBe('rgba(51, 102, 153, 1)');
  });
  it('rgb() 성분이 255 를 초과하면 클램프한다(코드리뷰 Minor: 방어 부재)', () => {
    expect(parseColor('rgb(300, 999, 0)')).toEqual({ r: 255, g: 255, b: 0 });
    expect(normalizeColor('rgba(500, 10, 260, 1)')).toBe('rgba(255, 10, 255, 1)');
  });
});

describe('palette — WCAG 대비비', () => {
  it('흑백 대비 = 21, 동일색 = 1', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
  it('relativeLuminance 단조(흰색>검정)', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(
      relativeLuminance({ r: 0, g: 0, b: 0 })
    );
  });
});

describe('palette — 색약 시뮬(§D 실보증: ΔE 분리)', () => {
  it('simulateDichromacy 는 0-255 범위 RGB 를 반환', () => {
    const out = simulateDichromacy({ r: 0, g: 158, b: 115 }, 'deuteranopia');
    for (const v of [out.r, out.g, out.b]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
  });
  it('OKABE_ITO 인접쌍 색약 ΔE ≥ 40 (deuteranopia/protanopia 최악, 실 구별보증)', () => {
    // 색맹 구별의 실질 보증. (인접 luminance 3:1 은 8색에서 수학적으로 불가 — 설계 주석 참조.)
    expect(minAdjacentDichromacyDeltaE(OKABE_ITO)).toBeGreaterThanOrEqual(40);
  });
});

describe('palette — 재배치(§D "미달 시 팔레트 재배치")', () => {
  it('orderByAdjacentContrast 는 인접 최소대비를 identity 이상으로 끌어올린다', () => {
    const reordered = orderByAdjacentContrast(OKABE_ITO);
    expect(reordered.length).toBe(OKABE_ITO.length);
    expect(new Set(reordered).size).toBe(OKABE_ITO.length); // 순열(색 보존)
    expect(minAdjacentContrast(reordered)).toBeGreaterThanOrEqual(minAdjacentContrast(OKABE_ITO));
  });
  it('2색은 3:1 을 실제로 만족(소수 series 경로)', () => {
    // 2 series 는 luminance 대비로도 안전 — 대표 안전쌍.
    expect(contrastRatio('#0072B2', '#F0E442')).toBeGreaterThanOrEqual(3);
  });
});

describe('palette — resolveSeriesStyles(§D 색+패턴)', () => {
  it('series.color 명시가 최우선', () => {
    const r = resolveSeriesStyles([{ color: '#abcdef' }]);
    expect(r[0]!.color).toBe('#abcdef');
  });
  it('패턴은 인덱스 순환 — ≤4 series 에서 유일', () => {
    const r = resolveSeriesStyles([{}, {}, {}, {}]);
    const patterns = r.map(s => s.pattern);
    expect(new Set(patterns).size).toBe(4);
    expect(patterns).toEqual([...PATTERN_CYCLE]);
  });
  it('primary(--og-primary) 유도는 다음 색과 대비 통과 시 첫 색으로', () => {
    const r = resolveSeriesStyles([{}, {}], { primary: '#000000' });
    expect(r[0]!.color).toBe('#000000'); // 검정은 다음 색과 대비 충분 → 채택
  });
  it('명시 palette 가 있으면 primary 유도 안 함', () => {
    const r = resolveSeriesStyles([{}, {}], { palette: ['#111', '#eee'], primary: '#f00' });
    expect(r[0]!.color).toBe('#111');
  });
});
