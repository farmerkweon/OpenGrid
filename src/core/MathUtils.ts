// ============================================================
// MathUtils — 부동소수점 안전 연산 유틸리티
// 레이어: Algorithm
// 설계 근거(Why): JS IEEE 754 오차(0.1+0.2=0.30000000000000004) 방지.
//   epsilon_round(곱셈 스케일링)와 Kahan compensated summation 두 전략을 조합.
// ============================================================

const DEFAULT_PREC = 10;

/**
 * 소수점 precision 자리로 반올림 (epsilon round).
 * 0.1+0.2+... 누적 오차를 최종 표시 단계에서 제거한다.
 */
export function round(val: number, precision: number = DEFAULT_PREC): number {
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
}

/**
 * Kahan compensated summation — 대량 합산 시 부동소수점 오차 최소화.
 * 시간복잡도 O(n), 공간 O(1). 빈 배열 → 0 반환.
 */
export function kahanSum(arr: number[]): number {
  let sum = 0, c = 0;
  for (const y of arr) {
    const corrected = y - c;
    const t = sum + corrected;
    c = (t - sum) - corrected;
    sum = t;
  }
  return sum;
}

/**
 * 안전 사칙연산 — 두 수의 곱셈 스케일링으로 소수점 오차 방지.
 */
export function safeAdd(a: number, b: number, precision: number = DEFAULT_PREC): number {
  return round(a + b, precision);
}

export function safeSub(a: number, b: number, precision: number = DEFAULT_PREC): number {
  return round(a - b, precision);
}

export function safeMul(a: number, b: number, precision: number = DEFAULT_PREC): number {
  return round(a * b, precision);
}

export function safeDiv(a: number, b: number, precision: number = DEFAULT_PREC): number {
  if (b === 0) throw new Error('safeDiv: division by zero');
  return round(a / b, precision);
}

/**
 * Kahan 합산 후 precision 반올림.
 * SUM/AVG footer 계산에 사용.
 */
export function kahanSumRounded(arr: number[], precision: number = DEFAULT_PREC): number {
  return round(kahanSum(arr), precision);
}

/**
 * Kahan AVG — 합산 후 count로 나누기.
 */
export function kahanAvg(arr: number[], precision: number = DEFAULT_PREC): number {
  if (arr.length === 0) return 0;
  return round(kahanSum(arr) / arr.length, precision);
}
