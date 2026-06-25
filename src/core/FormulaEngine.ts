// ============================================================
// FormulaEngine — 그리드 컬럼 수식 파서/실행기
// 레이어: Algorithm (순수 파싱·연산 로직)
// 설계 근거(Why): Excel처럼 컬럼에 문자열 수식을 지정하면
//   행 데이터를 컨텍스트로 OGDecimal 정밀 연산을 수행한다.
//   재귀 하강 파서(Recursive Descent) 사용 — 연산자 우선순위 자동 처리.
// 문법:
//   expression = additive
//   additive   = multiplicative (('+' | '-') multiplicative)*
//   multiplicative = unary (('*' | '/' | '%') unary)*
//   unary      = '-' unary | primary
//   primary    = '(' expression ')' | '[' field ']' | number
// 예시:
//   "[revenue] * 0.035"
//   "([price] - [cost]) / [price] * 100"
//   "[qty] * [unit_price] * (1 - [discount_rate] / 100)"
// ============================================================

import { OGDecimal, type OGDecimalLike } from './OGDecimal.js';

export type FormulaContext = Record<string, OGDecimalLike>;

/**
 * 문자열 수식을 평가해 OGDecimal 결과를 반환한다.
 * @param expr - 수식 문자열 (예: "[price] * [qty] * 0.035")
 * @param ctx  - 필드값 컨텍스트 (행 데이터)
 * @param divisionPrecision - 나눗셈 소수점 자리수 (기본 30)
 */
export function evaluateFormula(
  expr: string,
  ctx: FormulaContext,
  divisionPrecision = 30,
): OGDecimal {
  return new _FormulaParser(expr, ctx, divisionPrecision).parse();
}

// ─── 내부: 재귀 하강 파서 ────────────────────────────────

class _FormulaParser {
  private _pos = 0;
  private readonly _src: string;

  constructor(
    src: string,
    private readonly _ctx: FormulaContext,
    private readonly _prec: number,
  ) {
    this._src = src.trim();
  }

  parse(): OGDecimal {
    const result = this._additive();
    this._skip();
    if (this._pos < this._src.length) {
      throw new SyntaxError(
        `FormulaEngine: 예상치 못한 토큰 '${this._src[this._pos]}' (위치 ${this._pos})`
      );
    }
    return result;
  }

  // ── expression layers ──────────────────────────────────

  private _additive(): OGDecimal {
    let left = this._multiplicative();
    this._skip();
    while (this._pos < this._src.length) {
      const ch = this._src[this._pos];
      if (ch !== '+' && ch !== '-') break;
      this._pos++;
      this._skip();
      const right = this._multiplicative();
      left = ch === '+' ? left.add(right) : left.sub(right);
      this._skip();
    }
    return left;
  }

  private _multiplicative(): OGDecimal {
    let left = this._unary();
    this._skip();
    while (this._pos < this._src.length) {
      const ch = this._src[this._pos];
      if (ch !== '*' && ch !== '/' && ch !== '%') break;
      this._pos++;
      this._skip();
      const right = this._unary();
      if      (ch === '*') left = left.mul(right);
      else if (ch === '/') left = left.div(right, this._prec);
      else                 left = left.mod(right);
      this._skip();
    }
    return left;
  }

  private _unary(): OGDecimal {
    this._skip();
    if (this._src[this._pos] === '-') {
      this._pos++;
      return this._unary().neg();
    }
    return this._primary();
  }

  private _primary(): OGDecimal {
    this._skip();
    const ch = this._src[this._pos];

    if (ch === '(') {
      this._pos++;
      const val = this._additive();
      this._skip();
      if (this._src[this._pos] !== ')') {
        throw new SyntaxError('FormulaEngine: 닫는 괄호 ) 누락');
      }
      this._pos++;
      return val;
    }

    if (ch === '[') return this._fieldRef();

    return this._literal();
  }

  // ── 토큰 파싱 ─────────────────────────────────────────

  /** [fieldName] → 행 데이터에서 값 추출 */
  private _fieldRef(): OGDecimal {
    this._pos++; // skip '['
    const start = this._pos;
    while (this._pos < this._src.length && this._src[this._pos] !== ']') {
      this._pos++;
    }
    if (this._pos >= this._src.length) {
      throw new SyntaxError('FormulaEngine: 닫는 ] 누락');
    }
    const field = this._src.slice(start, this._pos);
    this._pos++; // skip ']'

    const val = this._ctx[field];
    if (val == null) {
      throw new ReferenceError(`FormulaEngine: 필드 '[${field}]'가 행 데이터에 없습니다`);
    }
    return OGDecimal.from(val);
  }

  /** 숫자 리터럴 파싱 (정수 / 소수 모두) */
  private _literal(): OGDecimal {
    const start = this._pos;
    while (this._pos < this._src.length && /[0-9.]/.test(this._src[this._pos])) {
      this._pos++;
    }
    const numStr = this._src.slice(start, this._pos);
    if (!numStr) {
      throw new SyntaxError(
        `FormulaEngine: 숫자 또는 [필드]를 기대했지만 '${this._src[this._pos] ?? 'EOF'}' 발견 (위치 ${start})`
      );
    }
    return OGDecimal.from(numStr);
  }

  /** 공백 스킵 */
  private _skip(): void {
    while (this._pos < this._src.length && /\s/.test(this._src[this._pos])) {
      this._pos++;
    }
  }
}
