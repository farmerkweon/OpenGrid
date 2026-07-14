// DD-05 §9.3·§9.4 히트맵 이산/연속(단색 명도 램프·발산 중립) + 채움 위 텍스트 AA(InkResolver)
import { describe, it, expect } from 'vitest';
import {
  sequentialColor,
  sequentialBands,
  divergingColor,
  divergingBands,
  NEUTRAL_MIDPOINT,
  DefaultInkResolver,
  passesInkGate,
  AA_BODY,
} from '../../../src/core/cf/index.js';
import { parseColor, relativeLuminance, contrastRatio } from '../../../src/core/chart/palette.js';

function lum(hex: string): number {
  const c = parseColor(hex)!;
  return relativeLuminance(c);
}

describe('DD-05 §9.3 순차 단색 명도 램프 — 명도 단조(무지개 금지)', () => {
  const seed = '#3a3f45'; // graphite

  it('연속 — ratio 증가 시 명도 단조 감소(밝음→어두움)', () => {
    const l0 = lum(sequentialColor(seed, 0));
    const lMid = lum(sequentialColor(seed, 0.5));
    const l1 = lum(sequentialColor(seed, 1));
    expect(l0).toBeGreaterThan(lMid);
    expect(lMid).toBeGreaterThan(l1);
  });

  it('이산 3~5단 기본 — 밴드 명도 엄격 단조', () => {
    for (const n of [3, 4, 5]) {
      const bands = sequentialBands(seed, n);
      expect(bands).toHaveLength(n);
      for (let i = 1; i < bands.length; i++) {
        expect(lum(bands[i]!)).toBeLessThan(lum(bands[i - 1]!));
      }
    }
  });

  it('밴드 수 2..5 클램프', () => {
    expect(sequentialBands(seed, 1)).toHaveLength(2);
    expect(sequentialBands(seed, 9)).toHaveLength(5);
  });
});

describe('DD-05 §9.3 발산 스케일 — 중앙값 중립', () => {
  const lo = '#3a3f45';
  const hi = '#1976d2';

  it('연속 — midpoint(0.5)는 중립(양끝보다 밝음)', () => {
    const lMid = lum(divergingColor(lo, hi, 0.5));
    expect(lMid).toBeGreaterThan(lum(divergingColor(lo, hi, 0)));
    expect(lMid).toBeGreaterThan(lum(divergingColor(lo, hi, 1)));
    // 중립은 NEUTRAL_MIDPOINT 에 근접.
    expect(lMid).toBeCloseTo(lum(NEUTRAL_MIDPOINT), 5);
  });

  it('이산 — 중앙 밴드 중립', () => {
    const bands = divergingBands(lo, hi, 3);
    expect(bands).toHaveLength(3);
    expect(lum(bands[1]!)).toBeGreaterThan(lum(bands[0]!));
    expect(lum(bands[1]!)).toBeGreaterThan(lum(bands[2]!));
  });
});

describe('DD-05 §9.4 InkResolver — 채움 위 텍스트 AA 자동보증', () => {
  const ink = new DefaultInkResolver();

  it('어두운 채움 → 흰 잉크, 밝은 채움 → 검은 잉크', () => {
    expect(ink.pickInk('#111111').color).toBe('#ffffff');
    expect(ink.pickInk('#ffffff').color).toBe('#111111');
  });

  it('임의 색 전수 — 항상 ≥4.5:1(흑/백 보장, 폴백 불필요)', () => {
    const samples = ['#3a3f45', '#1976d2', '#808080', '#7f7f7f', '#c0392b', '#27ae60', '#f39c12', '#2c3e50', '#95a5a6', '#e74c3c'];
    for (const s of samples) {
      const d = ink.pickInk(s);
      expect(d.ratio).toBeGreaterThanOrEqual(AA_BODY);
      expect(d.outline).toBeUndefined();
      // 실제 대비도 palette 산식으로 재확인.
      expect(contrastRatio(d.color, s)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('파싱 불가 색 → 외곽선(halo) 폴백 지시(방어)', () => {
    const d = ink.pickInk('not-a-color');
    expect(d.ratio).toBeLessThan(AA_BODY);
    expect(d.outline).toBe(true);
    expect(d.outlineColor).toBeDefined();
  });

  it('passesInkGate — 커스텀 램프 AA 게이트', () => {
    for (const s of sequentialBands('#3a3f45', 5)) expect(passesInkGate(s)).toBe(true);
  });
});
