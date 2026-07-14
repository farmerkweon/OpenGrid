// ============================================================
// OGDecimal — BigInt 기반 임의정밀도 소수 클래스
// 레이어: Algorithm
// 설계 근거(Why): JS IEEE 754는 소수점 17자리가 한계.
//   음원 수익 배분 등 수백 자리 정밀도가 필요한 경우 BigInt를
//   coefficient + scale 구조로 표현해 오차 없는 연산을 보장한다.
//   외부 라이브러리 없음 (ES2020+ BigInt 내장 사용).
// 표현: value = coefficient / 10^scale
//   예) 3.14 → {c: 314n, s: 2}  / 0.001 → {c: 1n, s: 3}
// ============================================================

/** OGDecimal 로 변환 가능한 입력 타입. / Input types convertible to an OGDecimal. */
export type OGDecimalLike = string | number | bigint | OGDecimal;

/**
 * BigInt 기반 임의정밀도 소수. / BigInt-based arbitrary-precision decimal.
 *
 * 값은 `coefficient / 10^scale` 로 표현되며, IEEE 754 오차 없이 정확한 사칙연산·집계를 제공한다.
 * 음원 수익 배분처럼 수백 자리 정밀도가 필요한 계산을 외부 라이브러리 없이(ES2020+ BigInt) 지원한다.
 * 인스턴스는 불변(immutable)이며, 모든 연산은 새 인스턴스를 반환한다.
 * / A value is represented as `coefficient / 10^scale`, giving exact arithmetic and aggregation with
 *   no IEEE 754 error. Supports hundreds-of-digits precision (e.g. royalty splits) with no external
 *   library (ES2020+ BigInt). Instances are immutable; every operation returns a new instance.
 *
 * @example
 * const total = OGDecimal.from('0.1').add('0.2'); // 정확히 0.3 / exactly 0.3
 * total.toFixed(2); // '0.30'
 */
export class OGDecimal {
  private readonly _c: bigint;   // coefficient (부호 포함 정수)
  private readonly _s: number;   // scale = 소수점 아래 자릿수

  /**
   * coefficient/scale 로 직접 생성(보통 {@link OGDecimal.from} 사용 권장).
   * / Construct directly from coefficient/scale (prefer {@link OGDecimal.from} in most cases).
   *
   * @param coefficient - 부호 포함 정수 계수 / Signed integer coefficient
   * @param scale - 소수점 아래 자릿수(음수는 0으로 클램프) / Number of fractional digits (negatives clamp to 0)
   */
  constructor(coefficient: bigint, scale: number) {
    this._c = coefficient;
    this._s = scale < 0 ? 0 : scale;
  }

  // ── 생성 ─────────────────────────────────────────────────

  /**
   * 문자열·숫자·bigint·OGDecimal 을 OGDecimal 로 변환. / Convert a string/number/bigint/OGDecimal into an OGDecimal.
   *
   * 빈 값/'null'/'undefined'/'NaN' 은 0 으로 처리한다. / Empty/'null'/'undefined'/'NaN' inputs map to 0.
   * ⚠️ number 입력은 이미 부동소수 오차를 담을 수 있으니 정밀 계산은 문자열 입력 권장.
   * / ⚠️ A number input may already carry float error; prefer string input for exact math.
   *
   * @param value - 변환할 값 / Value to convert
   * @returns 대응하는 OGDecimal / The corresponding OGDecimal
   */
  static from(value: OGDecimalLike): OGDecimal {
    if (value instanceof OGDecimal) return value;
    if (typeof value === 'bigint') return new OGDecimal(value, 0);

    const str = String(value).trim();
    if (!str || str === 'null' || str === 'undefined' || str === 'NaN') {
      return new OGDecimal(0n, 0);
    }

    const isNeg = str.startsWith('-');
    const abs   = isNeg ? str.slice(1) : str;
    const dot   = abs.indexOf('.');

    let coeff: bigint;
    let scale: number;

    if (dot === -1) {
      coeff = BigInt(abs);
      scale = 0;
    } else {
      const frac = abs.slice(dot + 1);
      coeff = BigInt(abs.slice(0, dot) + frac);
      scale = frac.length;
    }

    return new OGDecimal(isNeg ? -coeff : coeff, scale);
  }

  /** 0 값 생성. / Create a zero value. */
  static zero(): OGDecimal { return new OGDecimal(0n, 0); }
  /** 1 값 생성. / Create a one value. */
  static one():  OGDecimal { return new OGDecimal(1n, 0); }

  // ── 내부: 두 값의 스케일 정렬 ────────────────────────────

  private static _align(a: OGDecimal, b: OGDecimal): [bigint, bigint, number] {
    if (a._s === b._s) return [a._c, b._c, a._s];
    if (a._s > b._s) {
      return [a._c, b._c * (10n ** BigInt(a._s - b._s)), a._s];
    }
    return [a._c * (10n ** BigInt(b._s - a._s)), b._c, b._s];
  }

  // ── 사칙연산 ─────────────────────────────────────────────

  /**
   * 덧셈(정확). / Exact addition.
   *
   * @param other - 더할 값 / Value to add
   * @returns 합을 담은 새 OGDecimal / A new OGDecimal holding the sum
   */
  add(other: OGDecimalLike): OGDecimal {
    const [ac, bc, s] = OGDecimal._align(this, OGDecimal.from(other));
    return new OGDecimal(ac + bc, s);
  }

  /**
   * 뺄셈(정확). / Exact subtraction.
   *
   * @param other - 뺄 값 / Value to subtract
   * @returns 차를 담은 새 OGDecimal / A new OGDecimal holding the difference
   */
  sub(other: OGDecimalLike): OGDecimal {
    const [ac, bc, s] = OGDecimal._align(this, OGDecimal.from(other));
    return new OGDecimal(ac - bc, s);
  }

  /**
   * 곱셈(정확). / Exact multiplication.
   *
   * @param other - 곱할 값 / Value to multiply by
   * @returns 곱을 담은 새 OGDecimal / A new OGDecimal holding the product
   */
  mul(other: OGDecimalLike): OGDecimal {
    const o = OGDecimal.from(other);
    return new OGDecimal(this._c * o._c, this._s + o._s);
  }

  /**
   * 나눗셈. / Division.
   *
   * precision = 결과 소수점 자리수(기본 20). 수익 배분처럼 소수 수백 자리가 필요하면 precision 을 높인다.
   * / `precision` is the number of result decimal places (default 20). Raise it when hundreds of
   *   fractional digits are required (e.g. royalty splits).
   *
   * @param other - 제수(0 금지) / Divisor (must be non-zero)
   * @param precision - 결과 소수점 자리수(기본 20) / Result decimal places (default 20)
   * @returns 몫을 담은 새 OGDecimal / A new OGDecimal holding the quotient
   * @throws 제수가 0 이면 Error / Error when the divisor is 0
   */
  div(other: OGDecimalLike, precision = 20): OGDecimal {
    const o = OGDecimal.from(other);
    if (o._c === 0n) throw new Error('OGDecimal: division by zero');
    // 분자를 키워서 정수 나눗셈으로 정밀도 확보
    const scaledNumerator = this._c * (10n ** BigInt(precision + o._s));
    const result = scaledNumerator / o._c;
    return new OGDecimal(result, precision + this._s);
  }

  /**
   * 나머지(정수 나머지 개념을 소수에 적용). / Remainder (integer-remainder concept applied to decimals).
   *
   * @param other - 제수 / Divisor
   * @returns 나머지를 담은 새 OGDecimal / A new OGDecimal holding the remainder
   */
  mod(other: OGDecimalLike): OGDecimal {
    const o = OGDecimal.from(other);
    const [ac, bc, s] = OGDecimal._align(this, o);
    return new OGDecimal(ac % bc, s);
  }

  /**
   * 부호 반전. / Negation.
   *
   * @returns 부호를 뒤집은 새 OGDecimal / A new OGDecimal with the sign flipped
   */
  neg(): OGDecimal { return new OGDecimal(-this._c, this._s); }

  /**
   * 절댓값. / Absolute value.
   *
   * @returns 절댓값을 담은 새 OGDecimal / A new OGDecimal holding the absolute value
   */
  abs(): OGDecimal {
    return new OGDecimal(this._c < 0n ? -this._c : this._c, this._s);
  }

  // ── 비교 ─────────────────────────────────────────────────

  /**
   * 같음 비교. / Equality comparison.
   * @param other - 비교 대상 / Value to compare
   * @returns 값이 같으면 true / true if equal
   */
  eq(other: OGDecimalLike): boolean {
    const [ac, bc] = OGDecimal._align(this, OGDecimal.from(other));
    return ac === bc;
  }
  /**
   * 초과 비교. / Greater-than comparison.
   * @param other - 비교 대상 / Value to compare
   * @returns this > other 이면 true / true if this > other
   */
  gt(other: OGDecimalLike): boolean {
    const [ac, bc] = OGDecimal._align(this, OGDecimal.from(other));
    return ac > bc;
  }
  /**
   * 미만 비교. / Less-than comparison.
   * @param other - 비교 대상 / Value to compare
   * @returns this < other 이면 true / true if this < other
   */
  lt(other: OGDecimalLike): boolean {
    const [ac, bc] = OGDecimal._align(this, OGDecimal.from(other));
    return ac < bc;
  }
  /** 이상(>=) 비교. / Greater-than-or-equal comparison. @param other 비교 대상 / Value to compare @returns this >= other 이면 true / true if this >= other */
  gte(other: OGDecimalLike): boolean { return !this.lt(other); }
  /** 이하(<=) 비교. / Less-than-or-equal comparison. @param other 비교 대상 / Value to compare @returns this <= other 이면 true / true if this <= other */
  lte(other: OGDecimalLike): boolean { return !this.gt(other); }
  /** 0 인지 여부. / Whether the value is zero. @returns 0 이면 true / true if zero */
  isZero(): boolean { return this._c === 0n; }
  /** 음수인지 여부. / Whether the value is negative. @returns 음수이면 true / true if negative */
  isNeg():  boolean { return this._c < 0n; }
  /** 양수인지 여부. / Whether the value is positive. @returns 양수이면 true / true if positive */
  isPos():  boolean { return this._c > 0n; }

  // ── 출력 ─────────────────────────────────────────────────

  /**
   * 지정 소수점 자리수로 반올림(Half-up) 후 문자열 반환. / Round Half-up to `dp` places and return a string.
   *
   * 음원 배분 등 정확한 자리수 표시에 사용. / Used for exact fixed-place display (e.g. royalty splits).
   *
   * @param dp - 소수점 자리수 / Number of decimal places
   * @returns 반올림된 고정소수 문자열 / The rounded fixed-point string
   */
  toFixed(dp: number): string {
    let c = this._c;
    let s = this._s;

    if (s < dp) {
      c = c * (10n ** BigInt(dp - s));
    } else if (s > dp) {
      const diff    = BigInt(s - dp);
      const divisor = 10n ** diff;
      const half    = divisor / 2n;
      const isNeg   = c < 0n;
      const abs_c   = isNeg ? -c : c;
      const rem     = abs_c % divisor;
      let   rounded = abs_c / divisor;
      if (rem >= half) rounded += 1n;
      c = isNeg ? -rounded : rounded;
    }
    s = dp;

    const isNeg  = c < 0n;
    const abs_c  = isNeg ? -c : c;
    const digits = abs_c.toString().padStart(dp + 1, '0');
    const intPart  = digits.slice(0, digits.length - dp) || '0';
    const fracPart = dp > 0 ? '.' + digits.slice(digits.length - dp) : '';
    return (isNeg ? '-' : '') + intPart + fracPart;
  }

  /**
   * 정규화(후행 0 제거) 후 최소 표현 문자열 반환. / Return the minimal string after normalization (trailing zeros removed).
   *
   * @returns 최소 표현 문자열 / The minimal string representation
   */
  toString(): string {
    if (this._s === 0) return this._c.toString();
    // 후행 0 제거
    let c = this._c, s = this._s;
    while (s > 0 && c !== 0n && c % 10n === 0n) { c /= 10n; s--; }
    return new OGDecimal(c, s).toFixed(s);
  }

  /**
   * number 로 변환. / Convert to a number.
   *
   * ⚠️ 정밀도 손실 주의 — 표시/차트 등 근사 용도 전용, 정확 계산엔 쓰지 말 것.
   * / ⚠️ Lossy — for display/chart approximations only; do not use for exact math.
   *
   * @returns 근사 number 값 / The approximate number value
   */
  toNumber(): number { return parseFloat(this.toFixed(20)); }

  // ── 집계 정적 메서드 ─────────────────────────────────────

  /**
   * 정확한 합산(내부적으로 BigInt 정수 연산). / Exact summation (BigInt integer arithmetic internally).
   *
   * @param arr - 합산할 값 배열 / Values to sum
   * @returns 합계 OGDecimal(빈 배열 → 0) / The sum (empty array → 0)
   */
  static sum(arr: OGDecimalLike[]): OGDecimal {
    return arr.reduce<OGDecimal>((acc, v) => acc.add(v), OGDecimal.zero());
  }

  /**
   * 정확한 평균. / Exact average.
   *
   * @param arr - 평균 낼 값 배열 / Values to average
   * @param precision - 나눗셈 소수점 자리수(기본 20) / Division decimal places (default 20)
   * @returns 평균 OGDecimal(빈 배열 → 0) / The average (empty array → 0)
   */
  static avg(arr: OGDecimalLike[], precision = 20): OGDecimal {
    if (!arr.length) return OGDecimal.zero();
    return OGDecimal.sum(arr).div(arr.length, precision);
  }

  /**
   * 배열 최솟값. / Minimum of an array.
   *
   * @param arr - 값 배열(비어 있으면 예외) / Values (throws if empty)
   * @returns 최솟값 OGDecimal / The minimum value
   * @throws 빈 배열이면 Error / Error when the array is empty
   */
  static min(arr: OGDecimalLike[]): OGDecimal {
    if (!arr.length) throw new Error('OGDecimal.min: empty array');
    return arr.map(OGDecimal.from).reduce((a, b) => a.lt(b) ? a : b);
  }

  /**
   * 배열 최댓값. / Maximum of an array.
   *
   * @param arr - 값 배열(비어 있으면 예외) / Values (throws if empty)
   * @returns 최댓값 OGDecimal / The maximum value
   * @throws 빈 배열이면 Error / Error when the array is empty
   */
  static max(arr: OGDecimalLike[]): OGDecimal {
    if (!arr.length) throw new Error('OGDecimal.max: empty array');
    return arr.map(OGDecimal.from).reduce((a, b) => a.gt(b) ? a : b);
  }
}
