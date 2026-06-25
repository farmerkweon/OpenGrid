import { describe, it, expect } from 'vitest';
import { round, kahanSum, kahanSumRounded, kahanAvg, safeAdd, safeSub, safeMul, safeDiv } from '../../src/core/MathUtils.js';

describe('MathUtils — round (epsilon round)', () => {
  it('0.1+0.2 → precision 10 적용 시 0.3', () => {
    expect(round(0.1 + 0.2, 10)).toBe(0.3);
  });

  it('소수점 2자리 반올림', () => {
    // 1.005는 IEEE 754에서 1.00499...로 저장되므로 내림이 정상
    expect(round(1.006, 2)).toBe(1.01);
    expect(round(1.004, 2)).toBe(1.00);
  });

  it('정수에 적용 → 그대로', () => {
    expect(round(42, 5)).toBe(42);
  });

  it('음수 처리', () => {
    expect(round(-0.1 - 0.2, 10)).toBe(-0.3);
  });
});

describe('MathUtils — kahanSum', () => {
  it('빈 배열 → 0', () => {
    expect(kahanSum([])).toBe(0);
  });

  it('0.1 × 10개 합산 → 정확히 1.0', () => {
    const arr = Array(10).fill(0.1);
    expect(kahanSum(arr)).toBeCloseTo(1.0, 10);
  });

  it('일반 합산 정확성', () => {
    expect(kahanSum([1, 2, 3, 4, 5])).toBe(15);
  });

  it('부동소수점 누적 오차 방지', () => {
    const arr = [0.1, 0.2, 0.3];
    // 단순 reduce: 0.6000000000000001 가능
    const naiveSum = arr.reduce((a, b) => a + b, 0);
    const safeResult = kahanSum(arr);
    // Kahan은 naiveSum보다 정확해야 함
    expect(Math.abs(safeResult - 0.6)).toBeLessThan(Math.abs(naiveSum - 0.6) + 1e-15);
  });
});

describe('MathUtils — kahanSumRounded', () => {
  it('합산 후 precision 반올림', () => {
    expect(kahanSumRounded([0.1, 0.2], 2)).toBe(0.30);
    expect(kahanSumRounded([0.1, 0.2, 0.3], 2)).toBe(0.60);
  });
});

describe('MathUtils — kahanAvg', () => {
  it('빈 배열 → 0', () => {
    expect(kahanAvg([])).toBe(0);
  });

  it('평균 계산 정확성', () => {
    expect(kahanAvg([1, 2, 3])).toBeCloseTo(2, 10);
    expect(kahanAvg([0.1, 0.2, 0.3], 10)).toBeCloseTo(0.2, 10);
  });
});

describe('MathUtils — 사칙연산 헬퍼', () => {
  it('safeAdd: 0.1 + 0.2 = 0.3', () => {
    expect(safeAdd(0.1, 0.2)).toBe(0.3);
  });

  it('safeSub: 0.3 - 0.1 = 0.2', () => {
    expect(safeSub(0.3, 0.1)).toBe(0.2);
  });

  it('safeMul: 0.1 * 3 = 0.3', () => {
    expect(safeMul(0.1, 3)).toBe(0.3);
  });

  it('safeDiv: 1 / 3 precision 2 = 0.33', () => {
    expect(safeDiv(1, 3, 2)).toBe(0.33);
  });

  it('safeDiv: 0으로 나누기 → 에러', () => {
    expect(() => safeDiv(1, 0)).toThrow('division by zero');
  });
});
