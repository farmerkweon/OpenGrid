// ============================================================
// DD-08 §2.3 — ESSENTIAL_FUNCTIONS (코어 필수 함수군, tier:'essential')
// 레이어: Algorithm (헤드리스, 순수)
// 설계 SSOT: DD-08 §2.3 `ESSENTIAL_FUNCTIONS` — 현 FormulaEvaluator switch 구현 셋과 **동일 의미**.
//
// ⚠️ 정합성(회귀 방지): 각 FunctionDef.evaluate 는 FormulaEvaluator 의 내장 switch 와 셀 단위
//   동일 결과를 내야 한다. FunctionRegistry.test.ts 가 대표 입력에서 등가를 강제(오라클)한다.
//   내장 switch 는 미주입(레지스트리 없음) 시의 기본 경로로 그대로 유지되며(회귀 0), 이 카탈로그는
//   레지스트리 경로(override/확장)에서 소비된다.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../../OGDecimal.js';
import type { FunctionDef, FnArg, FnEvalCtx } from '../FunctionRegistry.js';

// ── 정밀 정수/거듭제곱 헬퍼(FormulaEvaluator 와 동일 알고리즘) ──

function unitAtDp(dp: number): OGDecimal {
  if (dp <= 0) return OGDecimal.from('1');
  return OGDecimal.from('0.' + '0'.repeat(dp - 1) + '1');
}

function truncateToDp(x: OGDecimal, dp: number, mode: 'up' | 'down'): OGDecimal {
  const d = Math.max(dp, 0);
  const s = x.toFixed(d + 20);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [ip, fp = ''] = body.split('.');
  const kept = fp.slice(0, d);
  const rest = fp.slice(d);
  const hasRemainder = /[1-9]/.test(rest);
  const truncatedStr = (neg ? '-' : '') + ip + (d > 0 ? '.' + kept : '');
  let result = OGDecimal.from(truncatedStr);
  if (hasRemainder && mode === 'up') {
    const bump = unitAtDp(d);
    result = neg ? result.sub(bump) : result.add(bump);
  }
  return result;
}

function floorDecimal(x: OGDecimal): OGDecimal {
  const towardZero = truncateToDp(x, 0, 'down');
  if (x.isNeg() && !x.eq(towardZero)) return towardZero.sub('1');
  return towardZero;
}

function roundHalfUp(x: OGDecimal, dp: number): OGDecimal {
  return OGDecimal.from(x.toFixed(Math.max(dp, 0)));
}

function powDecimal(base: OGDecimal, exp: OGDecimal, prec: number, ctx: FnEvalCtx): OGDecimal {
  const flo = floorDecimal(exp);
  if (exp.eq(flo)) {
    const n = Number(flo.toFixed(0));
    if (!Number.isFinite(n) || Math.abs(n) > 100000) {
      ctx.markApprox();
      return OGDecimal.from(String(Math.pow(base.toNumber(), exp.toNumber())));
    }
    if (n === 0) return OGDecimal.one();
    let result = OGDecimal.one();
    for (let i = 0; i < Math.abs(n); i++) result = result.mul(base);
    if (n < 0) {
      if (result.isZero()) ctx.fail('#DIV0');
      result = OGDecimal.one().div(result, prec);
    }
    return result;
  }
  ctx.markApprox();
  return OGDecimal.from(String(Math.pow(base.toNumber(), exp.toNumber())));
}

// ── 인자 개수 계약 도우미 ──
function requireExact(ctx: FnEvalCtx, n: number): void {
  if (ctx.argCount !== n) ctx.fail('#ERR');
}
function requireAtLeast(ctx: FnEvalCtx, n: number): void {
  if (ctx.argCount < n) ctx.fail('#ERR');
}

// ── 필수 함수 정의(§2.4 함수표와 1:1) ──

/** SUM/AVG/… 집계군 공통: 수치 리스트로 평탄화. / Aggregation helper shared by SUM/AVG/…. */
function nums(ctx: FnEvalCtx, values: readonly import('../types.js').CellValue[]): OGDecimalLike[] {
  return values.map((v) => ctx.toNum(v) as OGDecimalLike);
}

/** 코어 필수 함수군(tier:'essential'). / Core essential function set (tier:'essential'). */
export const ESSENTIAL_FUNCTIONS: readonly FunctionDef[] = [
  {
    name: 'SUM', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '합계 / sum', returns: 'number' },
    evaluate: (_a, ctx) => OGDecimal.sum(nums(ctx, ctx.collect())),
  },
  {
    name: 'AVG', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '평균 / average', returns: 'number' },
    evaluate: (_a, ctx) => {
      const vals = ctx.collect().filter((v) => v != null && v !== '');
      if (vals.length === 0) ctx.fail('#ERR');
      return OGDecimal.avg(nums(ctx, vals), ctx.prec);
    },
  },
  {
    name: 'AVERAGE', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '평균 / average', returns: 'number' },
    evaluate: (_a, ctx) => {
      const vals = ctx.collect().filter((v) => v != null && v !== '');
      if (vals.length === 0) ctx.fail('#ERR');
      return OGDecimal.avg(nums(ctx, vals), ctx.prec);
    },
  },
  {
    name: 'MIN', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '최소 / minimum', returns: 'number' },
    evaluate: (_a, ctx) => {
      const vals = ctx.collect().filter((v) => ctx.isNumeric(v));
      if (vals.length === 0) ctx.fail('#ERR');
      return OGDecimal.min(nums(ctx, vals));
    },
  },
  {
    name: 'MAX', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '최대 / maximum', returns: 'number' },
    evaluate: (_a, ctx) => {
      const vals = ctx.collect().filter((v) => ctx.isNumeric(v));
      if (vals.length === 0) ctx.fail('#ERR');
      return OGDecimal.max(nums(ctx, vals));
    },
  },
  {
    name: 'COUNT', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '수치 개수 / count numbers', returns: 'number' },
    evaluate: (_a, ctx) => OGDecimal.from(String(ctx.collect().filter((v) => ctx.isNumeric(v)).length)),
  },
  {
    name: 'COUNTA', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'value', variadic: true }], summary: '비어있지 않은 개수 / count non-empty', returns: 'number' },
    evaluate: (_a, ctx) => OGDecimal.from(String(ctx.collect().filter((v) => v != null && v !== '').length)),
  },
  {
    name: 'IF', tier: 'essential', arity: { min: 2, max: 3 },
    signature: { params: [{ name: 'cond' }, { name: 'then' }, { name: 'else', optional: true }], summary: '조건 분기 / conditional', returns: 'any' },
    evaluate: (a, ctx) => {
      requireAtLeast(ctx, 2);
      if (ctx.toBool(a[0].scalar())) return a[1].scalar();
      if (ctx.argCount > 2) return a[2].scalar();
      return false;
    },
  },
  {
    name: 'AND', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'cond', variadic: true }], summary: '논리곱 / logical AND', returns: 'boolean' },
    evaluate: (a, ctx) => a.every((arg) => ctx.toBool(arg.scalar())),
  },
  {
    name: 'OR', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'cond', variadic: true }], summary: '논리합 / logical OR', returns: 'boolean' },
    evaluate: (a, ctx) => a.some((arg) => ctx.toBool(arg.scalar())),
  },
  {
    name: 'NOT', tier: 'essential', arity: { min: 1, max: 1 },
    signature: { params: [{ name: 'cond' }], summary: '논리부정 / logical NOT', returns: 'boolean' },
    evaluate: (a, ctx) => { requireExact(ctx, 1); return !ctx.toBool(a[0].scalar()); },
  },
  {
    name: 'ROUND', tier: 'essential', arity: { min: 2, max: 2 },
    signature: { params: [{ name: 'number' }, { name: 'digits' }], summary: '반올림 / round half-up', returns: 'number' },
    evaluate: (a, ctx) => {
      requireExact(ctx, 2);
      const x = ctx.toNum(a[0].scalar());
      const dp = Number(ctx.toNum(a[1].scalar()).toFixed(0));
      return roundHalfUp(x, dp);
    },
  },
  {
    name: 'ROUNDUP', tier: 'essential', arity: { min: 2, max: 2 },
    signature: { params: [{ name: 'number' }, { name: 'digits' }], summary: '올림 / round up', returns: 'number' },
    evaluate: (a, ctx) => {
      requireExact(ctx, 2);
      const x = ctx.toNum(a[0].scalar());
      const dp = Number(ctx.toNum(a[1].scalar()).toFixed(0));
      return truncateToDp(x, dp, 'up');
    },
  },
  {
    name: 'ROUNDDOWN', tier: 'essential', arity: { min: 2, max: 2 },
    signature: { params: [{ name: 'number' }, { name: 'digits' }], summary: '내림 / round down', returns: 'number' },
    evaluate: (a, ctx) => {
      requireExact(ctx, 2);
      const x = ctx.toNum(a[0].scalar());
      const dp = Number(ctx.toNum(a[1].scalar()).toFixed(0));
      return truncateToDp(x, dp, 'down');
    },
  },
  {
    name: 'ABS', tier: 'essential', arity: { min: 1, max: 1 },
    signature: { params: [{ name: 'number' }], summary: '절댓값 / absolute value', returns: 'number' },
    evaluate: (a, ctx) => { requireExact(ctx, 1); return ctx.toNum(a[0].scalar()).abs(); },
  },
  {
    name: 'INT', tier: 'essential', arity: { min: 1, max: 1 },
    signature: { params: [{ name: 'number' }], summary: '내림 정수 / floor to integer', returns: 'number' },
    evaluate: (a, ctx) => { requireExact(ctx, 1); return floorDecimal(ctx.toNum(a[0].scalar())); },
  },
  {
    name: 'MOD', tier: 'essential', arity: { min: 2, max: 2 },
    signature: { params: [{ name: 'number' }, { name: 'divisor' }], summary: '나머지 / modulo', returns: 'number' },
    evaluate: (a, ctx) => {
      requireExact(ctx, 2);
      const x = ctx.toNum(a[0].scalar());
      const b = ctx.toNum(a[1].scalar());
      if (b.isZero()) ctx.fail('#DIV0');
      return x.mod(b);
    },
  },
  {
    name: 'POWER', tier: 'essential', arity: { min: 2, max: 2 },
    signature: { params: [{ name: 'base' }, { name: 'exponent' }], summary: '거듭제곱 / power', returns: 'number' },
    evaluate: (a, ctx) => {
      requireExact(ctx, 2);
      return powDecimal(ctx.toNum(a[0].scalar()), ctx.toNum(a[1].scalar()), ctx.prec, ctx);
    },
  },
  {
    name: 'SQRT', tier: 'essential', arity: { min: 1, max: 1 },
    signature: { params: [{ name: 'number' }], summary: '제곱근(근사) / square root (approx)', returns: 'number' },
    evaluate: (a, ctx) => {
      requireExact(ctx, 1);
      const x = ctx.toNum(a[0].scalar());
      if (x.isNeg()) ctx.fail('#NUM');
      ctx.markApprox();
      return OGDecimal.from(String(Math.sqrt(x.toNumber())));
    },
  },
  {
    name: 'CONCAT', tier: 'essential', arity: { min: 1, max: 'variadic' },
    signature: { params: [{ name: 'text', variadic: true }], summary: '문자열 결합 / concatenate', returns: 'string' },
    evaluate: (a, ctx) => a.map((arg) => ctx.toStr(arg.scalar())).join(''),
  },
];
