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

export type OGDecimalLike = string | number | bigint | OGDecimal;

export class OGDecimal {
  private readonly _c: bigint;   // coefficient (부호 포함 정수)
  private readonly _s: number;   // scale = 소수점 아래 자릿수

  constructor(coefficient: bigint, scale: number) {
    this._c = coefficient;
    this._s = scale < 0 ? 0 : scale;
  }

  // ── 생성 ─────────────────────────────────────────────────

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

  static zero(): OGDecimal { return new OGDecimal(0n, 0); }
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

  add(other: OGDecimalLike): OGDecimal {
    const [ac, bc, s] = OGDecimal._align(this, OGDecimal.from(other));
    return new OGDecimal(ac + bc, s);
  }

  sub(other: OGDecimalLike): OGDecimal {
    const [ac, bc, s] = OGDecimal._align(this, OGDecimal.from(other));
    return new OGDecimal(ac - bc, s);
  }

  mul(other: OGDecimalLike): OGDecimal {
    const o = OGDecimal.from(other);
    return new OGDecimal(this._c * o._c, this._s + o._s);
  }

  /**
   * 나눗셈. precision = 결과 소수점 자리수 (기본 20).
   * 수익 배분처럼 소수 수백 자리가 필요하면 precision을 높인다.
   */
  div(other: OGDecimalLike, precision = 20): OGDecimal {
    const o = OGDecimal.from(other);
    if (o._c === 0n) throw new Error('OGDecimal: division by zero');
    // 분자를 키워서 정수 나눗셈으로 정밀도 확보
    const scaledNumerator = this._c * (10n ** BigInt(precision + o._s));
    const result = scaledNumerator / o._c;
    return new OGDecimal(result, precision + this._s);
  }

  /** 나머지 (정수 나머지와 동일한 개념을 소수에 적용) */
  mod(other: OGDecimalLike): OGDecimal {
    const o = OGDecimal.from(other);
    const [ac, bc, s] = OGDecimal._align(this, o);
    return new OGDecimal(ac % bc, s);
  }

  /** 부호 반전 */
  neg(): OGDecimal { return new OGDecimal(-this._c, this._s); }

  /** 절댓값 */
  abs(): OGDecimal {
    return new OGDecimal(this._c < 0n ? -this._c : this._c, this._s);
  }

  // ── 비교 ─────────────────────────────────────────────────

  eq(other: OGDecimalLike): boolean {
    const [ac, bc] = OGDecimal._align(this, OGDecimal.from(other));
    return ac === bc;
  }
  gt(other: OGDecimalLike): boolean {
    const [ac, bc] = OGDecimal._align(this, OGDecimal.from(other));
    return ac > bc;
  }
  lt(other: OGDecimalLike): boolean {
    const [ac, bc] = OGDecimal._align(this, OGDecimal.from(other));
    return ac < bc;
  }
  gte(other: OGDecimalLike): boolean { return !this.lt(other); }
  lte(other: OGDecimalLike): boolean { return !this.gt(other); }
  isZero(): boolean { return this._c === 0n; }
  isNeg():  boolean { return this._c < 0n; }
  isPos():  boolean { return this._c > 0n; }

  // ── 출력 ─────────────────────────────────────────────────

  /**
   * 지정 소수점 자리수로 반올림(Half-up) 후 문자열 반환.
   * 음원 배분 등 정확한 자리수 표시에 사용.
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

  /** 정규화(후행 0 제거) 후 최소 표현 문자열 반환 */
  toString(): string {
    if (this._s === 0) return this._c.toString();
    // 후행 0 제거
    let c = this._c, s = this._s;
    while (s > 0 && c !== 0n && c % 10n === 0n) { c /= 10n; s--; }
    return new OGDecimal(c, s).toFixed(s);
  }

  /** number로 변환 (정밀도 손실 주의 — 표시 전용) */
  toNumber(): number { return parseFloat(this.toFixed(20)); }

  // ── 집계 정적 메서드 ─────────────────────────────────────

  /** 정확한 합산 (내부적으로 BigInt 정수 연산) */
  static sum(arr: OGDecimalLike[]): OGDecimal {
    return arr.reduce<OGDecimal>((acc, v) => acc.add(v), OGDecimal.zero());
  }

  /** 정확한 평균. precision = 나눗셈 소수점 자리수 */
  static avg(arr: OGDecimalLike[], precision = 20): OGDecimal {
    if (!arr.length) return OGDecimal.zero();
    return OGDecimal.sum(arr).div(arr.length, precision);
  }

  /** 배열 최솟값 */
  static min(arr: OGDecimalLike[]): OGDecimal {
    if (!arr.length) throw new Error('OGDecimal.min: empty array');
    return arr.map(OGDecimal.from).reduce((a, b) => a.lt(b) ? a : b);
  }

  /** 배열 최댓값 */
  static max(arr: OGDecimalLike[]): OGDecimal {
    if (!arr.length) throw new Error('OGDecimal.max: empty array');
    return arr.map(OGDecimal.from).reduce((a, b) => a.gt(b) ? a : b);
  }
}
