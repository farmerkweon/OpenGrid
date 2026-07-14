// ============================================================
// MathUtils — 부동소수점 안전 연산 유틸리티
// 레이어: Algorithm
// 설계 근거(Why): JS IEEE 754 오차(0.1+0.2=0.30000000000000004) 방지.
//   epsilon_round(곱셈 스케일링)와 Kahan compensated summation 두 전략을 조합.
// ============================================================

const DEFAULT_PREC = 10;

/**
 * 소수점 precision 자리로 반올림 (epsilon round). / Round to `precision` decimal places (epsilon round).
 *
 * 0.1+0.2+... 누적 오차를 최종 표시 단계에서 제거한다.
 * / Removes accumulated 0.1+0.2+… floating-point error at the final display step.
 *
 * @param val - 반올림할 값 / Value to round
 * @param precision - 소수점 자리수(기본 10) / Number of decimal places (default 10)
 * @returns 반올림된 값 / The rounded value
 */
export function round(val: number, precision: number = DEFAULT_PREC): number {
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
}

/**
 * Kahan compensated summation — 대량 합산 시 부동소수점 오차 최소화.
 * / Kahan compensated summation — minimizes floating-point error over large sums.
 *
 * 시간복잡도 O(n), 공간 O(1). 빈 배열 → 0 반환.
 * / Time O(n), space O(1). Empty array → returns 0.
 *
 * @param arr - 합산할 숫자 배열 / Numbers to sum
 * @returns 보정 합계 / The compensated sum
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
 * 안전 덧셈 — 결과를 precision 반올림해 소수점 오차 방지. / Safe addition — rounds the result to `precision` to avoid float error.
 *
 * @param a - 피연산자 1 / First operand
 * @param b - 피연산자 2 / Second operand
 * @param precision - 소수점 자리수(기본 10) / Decimal places (default 10)
 * @returns 반올림된 합 / The rounded sum
 */
export function safeAdd(a: number, b: number, precision: number = DEFAULT_PREC): number {
  return round(a + b, precision);
}

/**
 * 안전 뺄셈 — 결과를 precision 반올림. / Safe subtraction — rounds the result to `precision`.
 *
 * @param a - 피연산자 1 / First operand
 * @param b - 피연산자 2 / Second operand
 * @param precision - 소수점 자리수(기본 10) / Decimal places (default 10)
 * @returns 반올림된 차 / The rounded difference
 */
export function safeSub(a: number, b: number, precision: number = DEFAULT_PREC): number {
  return round(a - b, precision);
}

/**
 * 안전 곱셈 — 결과를 precision 반올림. / Safe multiplication — rounds the result to `precision`.
 *
 * @param a - 피연산자 1 / First operand
 * @param b - 피연산자 2 / Second operand
 * @param precision - 소수점 자리수(기본 10) / Decimal places (default 10)
 * @returns 반올림된 곱 / The rounded product
 */
export function safeMul(a: number, b: number, precision: number = DEFAULT_PREC): number {
  return round(a * b, precision);
}

/**
 * 안전 나눗셈 — 결과를 precision 반올림. 0 나눗셈은 예외. / Safe division — rounds the result; throws on divide-by-zero.
 *
 * @param a - 피제수 / Dividend
 * @param b - 제수(0 금지) / Divisor (must be non-zero)
 * @param precision - 소수점 자리수(기본 10) / Decimal places (default 10)
 * @returns 반올림된 몫 / The rounded quotient
 * @throws b 가 0 이면 Error / Error when `b` is 0
 */
export function safeDiv(a: number, b: number, precision: number = DEFAULT_PREC): number {
  if (b === 0) throw new Error('safeDiv: division by zero');
  return round(a / b, precision);
}

/**
 * Kahan 합산 후 precision 반올림. / Kahan sum followed by `precision` rounding.
 *
 * SUM/AVG footer 계산에 사용. / Used for SUM/AVG footer computation.
 *
 * @param arr - 합산할 숫자 배열 / Numbers to sum
 * @param precision - 소수점 자리수(기본 10) / Decimal places (default 10)
 * @returns 반올림된 보정 합계 / The rounded compensated sum
 */
export function kahanSumRounded(arr: number[], precision: number = DEFAULT_PREC): number {
  return round(kahanSum(arr), precision);
}

/**
 * Kahan AVG — 합산 후 count로 나누기. / Kahan average — sum, then divide by count.
 *
 * 빈 배열 → 0 반환. / Empty array → returns 0.
 *
 * @param arr - 평균 낼 숫자 배열 / Numbers to average
 * @param precision - 소수점 자리수(기본 10) / Decimal places (default 10)
 * @returns 반올림된 평균 / The rounded average
 */
export function kahanAvg(arr: number[], precision: number = DEFAULT_PREC): number {
  if (arr.length === 0) return 0;
  return round(kahanSum(arr) / arr.length, precision);
}
