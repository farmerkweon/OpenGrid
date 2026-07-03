// ============================================================
// FormulaParser 유닛테스트 — EBNF §2.2 문법, 숫자 리터럴(부동소수점 완전지원 포함)
// ============================================================
import { describe, it, expect } from 'vitest';
import { parseFormula } from '../../../src/core/formula/FormulaParser.js';

describe('FormulaParser — 숫자 리터럴', () => {
  it('정수', () => {
    expect(parseFormula('=42')).toEqual({ t: 'num', v: '42' });
  });
  it('일반 소수', () => {
    expect(parseFormula('=3.14')).toEqual({ t: 'num', v: '3.14' });
  });
  it('선행 0 생략 소수(.5)', () => {
    expect(parseFormula('=.5')).toEqual({ t: 'num', v: '.5' });
  });
  it('0.001', () => {
    expect(parseFormula('=0.001')).toEqual({ t: 'num', v: '0.001' });
  });
  it('과학표기 1e-5 → 정확 10진 변환', () => {
    expect(parseFormula('=1e-5')).toEqual({ t: 'num', v: '0.00001' });
  });
  it('과학표기 2.5E3 → 정확 10진 변환', () => {
    expect(parseFormula('=2.5E3')).toEqual({ t: 'num', v: '2500' });
  });
  it('음수 단항 + 소수', () => {
    expect(parseFormula('=-3.5')).toEqual({ t: 'unary', op: '-', arg: { t: 'num', v: '3.5' } });
  });
});

describe('FormulaParser — 연산자/괄호(§2.2 EBNF)', () => {
  it('산술 4종 + 거듭제곱', () => {
    const ast = parseFormula('=2+3*4^2');
    expect(ast).toEqual({
      t: 'bin', op: '+',
      left: { t: 'num', v: '2' },
      right: { t: 'bin', op: '*', left: { t: 'num', v: '3' }, right: { t: 'bin', op: '^', left: { t: 'num', v: '4' }, right: { t: 'num', v: '2' } } },
    });
  });
  it('괄호 우선순위', () => {
    const ast = parseFormula('=(2+3)*4');
    expect(ast).toEqual({ t: 'bin', op: '*', left: { t: 'bin', op: '+', left: { t: 'num', v: '2' }, right: { t: 'num', v: '3' } }, right: { t: 'num', v: '4' } });
  });
  it('비교 연산자', () => {
    expect(parseFormula('=A1>=100')).toEqual({
      t: 'bin', op: '>=',
      left: { t: 'rawRef', colLetters: 'A', row: 1, dollarCol: false, dollarRow: false },
      right: { t: 'num', v: '100' },
    });
  });
  it('문자열 연결 &', () => {
    expect(parseFormula('="a"&"b"')).toEqual({ t: 'bin', op: '&', left: { t: 'str', v: 'a' }, right: { t: 'str', v: 'b' } });
  });
  it('문자열 이스케이프 ""', () => {
    expect(parseFormula('="a""b"')).toEqual({ t: 'str', v: 'a"b' });
  });
});

describe('FormulaParser — 참조/범위/필드(§2.3)', () => {
  it('셀참조 B2', () => {
    expect(parseFormula('=B2')).toEqual({ t: 'rawRef', colLetters: 'B', row: 2, dollarCol: false, dollarRow: false });
  });
  it('절대참조 $A$1', () => {
    expect(parseFormula('=$A$1')).toEqual({ t: 'rawRef', colLetters: 'A', row: 1, dollarCol: true, dollarRow: true });
  });
  it('혼합참조 A$1 / $A1', () => {
    expect(parseFormula('=A$1')).toEqual({ t: 'rawRef', colLetters: 'A', row: 1, dollarCol: false, dollarRow: true });
    expect(parseFormula('=$A1')).toEqual({ t: 'rawRef', colLetters: 'A', row: 1, dollarCol: true, dollarRow: false });
  });
  it('범위 A1:B5', () => {
    expect(parseFormula('=A1:B5')).toEqual({
      t: 'rawRange',
      a: { t: 'rawRef', colLetters: 'A', row: 1, dollarCol: false, dollarRow: false },
      b: { t: 'rawRef', colLetters: 'B', row: 5, dollarCol: false, dollarRow: false },
    });
  });
  it('필드참조 [qty]', () => {
    expect(parseFormula('=[qty]*2')).toEqual({ t: 'bin', op: '*', left: { t: 'field', field: 'qty' }, right: { t: 'num', v: '2' } });
  });
  it('함수 호출 SUM(A1:A3)', () => {
    expect(parseFormula('=SUM(A1:A3)')).toEqual({
      t: 'call', name: 'SUM',
      args: [{ t: 'rawRange', a: { t: 'rawRef', colLetters: 'A', row: 1, dollarCol: false, dollarRow: false }, b: { t: 'rawRef', colLetters: 'A', row: 3, dollarCol: false, dollarRow: false } }],
    });
  });
  it('함수명 대소문자 무시(sum → SUM)', () => {
    expect(parseFormula('=sum(1,2)')).toEqual({ t: 'call', name: 'SUM', args: [{ t: 'num', v: '1' }, { t: 'num', v: '2' }] });
  });
  it('불리언 리터럴', () => {
    expect(parseFormula('=TRUE')).toEqual({ t: 'bool', v: true });
    expect(parseFormula('=false')).toEqual({ t: 'bool', v: false });
  });
});

describe('FormulaParser — 에러(문법 오류)', () => {
  it('닫는 괄호 누락', () => {
    expect(() => parseFormula('=(1+2')).toThrow();
  });
  it('닫는 ] 누락', () => {
    expect(() => parseFormula('=[qty')).toThrow();
  });
  it('빈 함수 인자 누락 아님(SUM() 허용)', () => {
    expect(parseFormula('=SUM()')).toEqual({ t: 'call', name: 'SUM', args: [] });
  });
  it('예상치 못한 후행 토큰', () => {
    expect(() => parseFormula('=1 2')).toThrow();
  });
});
