// ============================================================
// FormulaParser — F3 셀 수식 파서 (재귀 하강, EBNF §2.2)
// 레이어: Algorithm (순수 파싱, DOM/그리드 비의존)
// 계약 참조: 11_design_F3_v2.md §2.2(문법)·§2.3(참조 타입)·§9 E6(범위 역순은
//           normalizeRefs 단계에서 처리, 여기선 원문 그대로 코너 2개 보존)
//
// 기존 FormulaEngine.ts(컬럼 수식, [field] 전용)를 대체하지 않고 "확장"한다(F3-R30).
// 이 파서는 셀 수식 전용 상위 문법(A1 참조·범위·함수·문자열·비교·연결)을 다룬다.
// 소수 구분자는 '.'로 고정(§2.2 REQ-06) — ','는 항상 함수 인자 구분자.
// ============================================================

import type { AstNode, BinOp, RawCellRefNode } from './types.js';
import { normalizeNumericLiteral } from './numericLiteral.js';

/**
 * 셀 수식 원문(선두 '=' 포함 가능)을 파싱해 AST(원시 참조 노드 포함, 정규화 전)를 만든다.
 * 정규화(normalizeRefs)는 별도 단계(§3.3)에서 수행한다.
 * / Parse cell-formula source (a leading '=' is allowed) into an AST that still holds raw
 *   reference nodes (pre-normalization). Normalization (normalizeRefs) happens in a separate
 *   stage (§3.3).
 *
 * @param src - 셀 수식 원문(예: "=SUM(A1:A5)") / Cell-formula source (e.g. "=SUM(A1:A5)")
 * @returns 원시 참조 노드를 포함한 정규화 전 AST / Pre-normalization AST including raw reference nodes
 * @throws SyntaxError 문법 오류(닫는 괄호 누락, 예상치 못한 토큰 등) / on grammar errors (missing paren, unexpected token, …)
 * @example
 * const ast = parseFormula('=[price] * 1.1');
 */
export function parseFormula(src: string): AstNode {
  const body = src.startsWith('=') ? src.slice(1) : src;
  const p = new _Parser(body);
  const ast = p.parseComparison();
  p.skip();
  if (!p.eof()) {
    throw new SyntaxError(`FormulaParser: 예상치 못한 토큰 '${p.peekChar()}' (위치 ${p.pos})`);
  }
  return ast;
}

class _Parser {
  pos = 0;
  readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  eof(): boolean {
    return this.pos >= this.src.length;
  }

  peekChar(): string {
    return this.src[this.pos] ?? '';
  }

  skip(): void {
    while (!this.eof() && /\s/.test(this.peekChar())) this.pos++;
  }

  /** 2문자 연산자를 우선 시도 후 1문자로 폴백. */
  private _tryOp(...ops: string[]): string | null {
    this.skip();
    for (const op of ops.sort((a, b) => b.length - a.length)) {
      if (this.src.startsWith(op, this.pos)) {
        this.pos += op.length;
        return op;
      }
    }
    return null;
  }

  // comparison = concat , { ( "=" | "<>" | "<" | "<=" | ">" | ">=" ) , concat } ;
  parseComparison(): AstNode {
    let left = this.parseConcat();
    for (;;) {
      const op = this._tryOp('<=', '>=', '<>', '=', '<', '>');
      if (!op) break;
      const right = this.parseConcat();
      left = { t: 'bin', op: op as BinOp, left, right };
    }
    return left;
  }

  // concat = additive , { "&" , additive } ;
  parseConcat(): AstNode {
    let left = this.parseAdditive();
    for (;;) {
      const op = this._tryOp('&');
      if (!op) break;
      const right = this.parseAdditive();
      left = { t: 'bin', op: '&', left, right };
    }
    return left;
  }

  // additive = multiplicative , { ( "+" | "-" ) , multiplicative } ;
  parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    for (;;) {
      this.skip();
      const ch = this.peekChar();
      if (ch !== '+' && ch !== '-') break;
      this.pos++;
      const right = this.parseMultiplicative();
      left = { t: 'bin', op: ch as BinOp, left, right };
    }
    return left;
  }

  // multiplicative = power , { ( "*" | "/" | "%" ) , power } ;
  parseMultiplicative(): AstNode {
    let left = this.parsePower();
    for (;;) {
      this.skip();
      const ch = this.peekChar();
      if (ch !== '*' && ch !== '/' && ch !== '%') break;
      this.pos++;
      const right = this.parsePower();
      left = { t: 'bin', op: ch as BinOp, left, right };
    }
    return left;
  }

  // power = unary , { "^" , unary } ;  (우결합)
  parsePower(): AstNode {
    const left = this.parseUnary();
    this.skip();
    if (this.peekChar() === '^') {
      this.pos++;
      const right = this.parsePower(); // 우결합 재귀
      return { t: 'bin', op: '^', left, right };
    }
    return left;
  }

  // unary = ( "-" | "+" ) , unary | primary ;
  parseUnary(): AstNode {
    this.skip();
    const ch = this.peekChar();
    if (ch === '-' || ch === '+') {
      this.pos++;
      return { t: 'unary', op: ch, arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  // primary = "(" expr ")" | functionCall | rangeRef | cellRef | fieldRef | stringLit | boolLit | number ;
  parsePrimary(): AstNode {
    this.skip();
    const ch = this.peekChar();

    if (ch === '(') {
      this.pos++;
      const inner = this.parseComparison();
      this.skip();
      if (this.peekChar() !== ')') throw new SyntaxError('FormulaParser: 닫는 괄호 ) 누락');
      this.pos++;
      return inner;
    }

    if (ch === '[') return this._fieldRef();
    if (ch === '"') return this._stringLit();

    // 식별자/함수/셀참조/불리언 — 렉서가 [A-Za-z]+ 런을 먼저 읽는다(§2.2 모호성 해소 규칙).
    if (/[A-Za-z$]/.test(ch)) return this._identifierLike();

    if (/[0-9.]/.test(ch)) return this._number();

    throw new SyntaxError(`FormulaParser: 예상치 못한 문자 '${ch || 'EOF'}' (위치 ${this.pos})`);
  }

  private _fieldRef(): AstNode {
    this.pos++; // '['
    const start = this.pos;
    while (!this.eof() && this.peekChar() !== ']') this.pos++;
    if (this.eof()) throw new SyntaxError('FormulaParser: 닫는 ] 누락');
    const field = this.src.slice(start, this.pos);
    this.pos++; // ']'
    return { t: 'field', field };
  }

  private _stringLit(): AstNode {
    this.pos++; // 여는 "
    let out = '';
    while (!this.eof()) {
      const ch = this.peekChar();
      if (ch === '"') {
        if (this.src[this.pos + 1] === '"') { out += '"'; this.pos += 2; continue; }
        this.pos++; // 닫는 "
        return { t: 'str', v: out };
      }
      out += ch;
      this.pos++;
    }
    throw new SyntaxError('FormulaParser: 닫는 " 누락');
  }

  /** 함수명 / 셀참조($A$1·A$1·$A1 등) / 범위(A1:B5) / TRUE|FALSE 를 렉서 런 하나로 구분(§2.2).
   *  열/행 각 축의 '$' 는 서로 독립이라(§2.3 A1/$A$1/A$1/$A1 4종) 열 앞과 행 앞 모두에서
   *  개별적으로 검사해야 한다 — 이전 구현은 "선두 '$'"만 별도 취급해 A$1(행만 절대)을
   *  놓치는 버그가 있었다(수정: 하나의 경로로 통일). */
  private _identifierLike(): AstNode {
    const start = this.pos;
    let dollarCol = false;
    if (this.peekChar() === '$') { dollarCol = true; this.pos++; }

    const colStart = this.pos;
    while (!this.eof() && /[A-Za-z]/.test(this.peekChar())) this.pos++;
    const word = this.src.slice(colStart, this.pos);
    if (!word) throw new SyntaxError(`FormulaParser: 식별자를 기대했지만 '${this.peekChar() || 'EOF'}' (위치 ${start})`);

    if (!dollarCol) {
      // 함수 호출: 식별자 뒤에 '(' 이면 함수(§2.2 규칙). '$' 선두면 함수일 수 없음.
      this.skip();
      if (this.peekChar() === '(') {
        this.pos++;
        const args: AstNode[] = [];
        this.skip();
        if (this.peekChar() !== ')') {
          args.push(this.parseComparison());
          this.skip();
          while (this.peekChar() === ',') {
            this.pos++;
            args.push(this.parseComparison());
            this.skip();
          }
        }
        if (this.peekChar() !== ')') throw new SyntaxError(`FormulaParser: 함수 '${word}' 닫는 ) 누락`);
        this.pos++;
        return { t: 'call', name: word.toUpperCase(), args };
      }

      // 불리언 리터럴 — 뒤에 '$'나 숫자가 이어지면 셀참조 패턴 우선(§2.2 모호성 규칙).
      const upper = word.toUpperCase();
      if (this.peekChar() !== '$' && !/[0-9]/.test(this.peekChar())) {
        if (upper === 'TRUE') return { t: 'bool', v: true };
        if (upper === 'FALSE') return { t: 'bool', v: false };
      }
    }

    // 셀참조: [ '$' ] 행번호(§2.3 4가지 조합 모두 여기서 처리).
    let dollarRow = false;
    if (this.peekChar() === '$') { dollarRow = true; this.pos++; }
    const rowStart = this.pos;
    while (!this.eof() && /[0-9]/.test(this.peekChar())) this.pos++;
    if (this.pos === rowStart) {
      if (dollarCol || dollarRow) throw new SyntaxError(`FormulaParser: 셀참조 행번호 누락 (위치 ${this.pos})`);
      // 예약 식별자도 아니고 셀참조 패턴도 아니면 함수명 오타 등 → #NAME 처리 위임.
      return { t: 'error', code: '#NAME' };
    }
    const row = parseInt(this.src.slice(rowStart, this.pos), 10);
    const ref: RawCellRefNode = { t: 'rawRef', colLetters: word.toUpperCase(), row, dollarCol, dollarRow };
    return this._maybeRange(ref);
  }

  /** cellRef 뒤에 ':'가 오면 range 로 확장(§2.2). */
  private _maybeRange(a: RawCellRefNode): AstNode {
    const save = this.pos;
    this.skip();
    if (this.peekChar() === ':') {
      this.pos++;
      this.skip();
      // 콜론 다음은 반드시 또 다른 cellRef.
      let dollarCol = false;
      let dollarRow = false;
      if (this.peekChar() === '$') { dollarCol = true; this.pos++; }
      const colStart = this.pos;
      while (!this.eof() && /[A-Za-z]/.test(this.peekChar())) this.pos++;
      const colLetters = this.src.slice(colStart, this.pos).toUpperCase();
      if (!colLetters) throw new SyntaxError(`FormulaParser: 범위 두번째 코너 열문자 누락 (위치 ${this.pos})`);
      if (this.peekChar() === '$') { dollarRow = true; this.pos++; }
      const rowStart = this.pos;
      while (!this.eof() && /[0-9]/.test(this.peekChar())) this.pos++;
      if (this.pos === rowStart) throw new SyntaxError(`FormulaParser: 범위 두번째 코너 행번호 누락 (위치 ${this.pos})`);
      const row = parseInt(this.src.slice(rowStart, this.pos), 10);
      const b: RawCellRefNode = { t: 'rawRef', colLetters, row, dollarCol, dollarRow };
      return { t: 'rawRange', a, b };
    }
    this.pos = save;
    return a;
  }

  private _number(): AstNode {
    const start = this.pos;
    while (!this.eof() && /[0-9]/.test(this.peekChar())) this.pos++;
    if (this.peekChar() === '.') {
      this.pos++;
      while (!this.eof() && /[0-9]/.test(this.peekChar())) this.pos++;
    }
    // 과학표기 지수부(1e-5, 2.5E3, §2.2 확장 — 발주자 추가요구: 부동소수점 완전지원).
    if ((this.peekChar() === 'e' || this.peekChar() === 'E')) {
      const save = this.pos;
      this.pos++;
      if (this.peekChar() === '+' || this.peekChar() === '-') this.pos++;
      const expDigitsStart = this.pos;
      while (!this.eof() && /[0-9]/.test(this.peekChar())) this.pos++;
      if (this.pos === expDigitsStart) this.pos = save; // 지수 숫자 없으면 되돌림(식별자 오인 방지)
    }
    const numStr = this.src.slice(start, this.pos);
    if (!numStr || numStr === '.') {
      throw new SyntaxError(`FormulaParser: 숫자를 기대했지만 '${this.peekChar() || 'EOF'}' (위치 ${start})`);
    }
    return { t: 'num', v: normalizeNumericLiteral(numStr) };
  }
}
