// ============================================================
// FormulaEvaluator — 정규화된 AST를 평가해 값/에러/근사 여부를 산출
// 레이어: Algorithm (헤드리스, DOM/렌더러 비의존 — §5.5)
// 계약 참조: 11_design_F3_v2.md §2.4(함수표)·§6(에러 분류/전파)·§9(E4/E5/E15)·
//           §3.5(범위 evaluate-time 라이브 멤버십)
//           15_cross_contracts.md C10 R-NONNUMERIC(#VALUE, 빈 셀만 관대)·
//           C11(에러 집계 제외·근사 `_approx`·로케일은 표시 레이어 몫이라 여기선 값만 산출)
//
// 정밀도(F3-R20/R34): 사칙연산은 전부 OGDecimal(BigInt 정확). SQRT·비정수 거듭제곱만
// float 근사이며 결과에 approx=true 플래그를 남긴다(OGDecimal.ts 는 수정하지 않음 —
// 이 파일은 OGDecimal의 공개 메서드만 사용해 ROUND/ROUNDUP/ROUNDDOWN/INT 를 구현한다).
//
// 동적 의존성 추적(§5.3 "재작성" 대응): 평가 중 실제로 읽은 (rowId,field) 를 모두
// `touched` 집합에 기록해 반환한다. RecalcCoordinator 는 이를 FormulaGraph.addFormula 의
// deps 로 재등록해 그래프 엣지를 "이번 평가에서 실제로 쓰인 셀"로 항상 최신화한다 —
// 범위 멤버십이 정렬/필터로 바뀌어도 다음 평가 시 엣지가 다시 정확해진다.
// ============================================================

import { OGDecimal, type OGDecimalLike } from '../OGDecimal.js';
import {
  cellKey, isErrorToken,
  type AstNode, type CanonicalRangeRef, type CellKey, type CellValue,
  type FormulaErrorCode, type FormulaGridAccessor, type CanonicalRef,
} from './types.js';
import { NUMERIC_LITERAL_RE, normalizeNumericLiteral } from './numericLiteral.js';
import type { FunctionRegistry, FunctionDef, FnArg, FnEvalCtx, FnArgResult } from './FunctionRegistry.js';

/**
 * 수식 1개 평가 결과. / Outcome of evaluating a single formula.
 */
export interface EvalOutcome {
  /** 평가된 값(에러면 에러 토큰 문자열). / Evaluated value (an error token string on error). */
  value: CellValue;
  /** 에러 코드(정상이면 null). / Error code (null when successful). */
  error: FormulaErrorCode | null;
  /** SQRT·비정수 거듭제곱 등 float 근사가 섞였는지. / Whether a float approximation (SQRT, non-integer power, …) was involved. */
  approx: boolean;
  /** 평가 중 실제로 읽은 셀 키 집합(그래프 엣지 재등록용, §5.3 동적 의존성). / Cell keys actually read during evaluation (for graph edge re-registration, §5.3 dynamic deps). */
  touched: Set<CellKey>;
}

/**
 * 평가 옵션. / Evaluation options.
 */
export interface EvalOptions {
  /** 나눗셈 소수점 자리수(§8.1 formula.divisionPrecision, 기본 30, FormulaEngine 계승). / Division decimal-place precision (§8.1 formula.divisionPrecision, default 30, inherited from FormulaEngine). */
  divisionPrecision?: number;
  /**
   * (선택·additive, DD-08 §2.3) 함수 레지스트리. 주입 시 `callFunction` 이 내장 switch 보다
   * **먼저** 레지스트리를 조회한다 — override/확장 함수가 여기서 활성된다. 미주입 시 내장 switch
   * 만 동작해 기존 동작과 셀 단위 동일(회귀 0).
   * / (optional·additive, DD-08 §2.3) Function registry. When injected, `callFunction` consults
   *   the registry *before* the built-in switch (override/extended functions activate here). When
   *   omitted, only the built-in switch runs — cell-for-cell identical to prior behavior (zero regression).
   */
  functions?: FunctionRegistry;
  /** (선택·additive, DD-08 §2.4/불변식1) 결정론 주입 시각(volatile 함수용, 기본 Date.now). / (optional·additive) Injected deterministic clock (for volatile funcs, default Date.now). */
  now?: () => number;
}

/** 평가 중 격리 전파용 내부 예외(§6 F3-R24) — evaluate() 경계에서만 캐치한다. */
class FormulaEvalError extends Error {
  constructor(public code: FormulaErrorCode) {
    super(code);
  }
}

/**
 * 정규화된 AST 하나를 평가해 값/에러/근사여부/touched 를 산출한다. 절대 throw 하지 않는다
 * (에러는 outcome.error 로 격리, F3-R24).
 * / Evaluate a single normalized AST, producing value / error / approx flag / touched set.
 *   Never throws (errors are isolated into outcome.error, F3-R24).
 *
 * @param ast - 평가할 정규화 AST / Normalized AST to evaluate
 * @param host - 이 수식이 저장된 호스트 셀(rowId·field) / Host cell (rowId, field) where the formula lives
 * @param accessor - 그리드 좌표/값 접근자 / Grid coordinate/value accessor
 * @param opts - 평가 옵션(divisionPrecision 등) / Evaluation options (divisionPrecision, …)
 * @returns 값·에러·근사여부·touched 를 담은 결과 / Outcome carrying value, error, approx flag and touched set
 */
export function evaluate(ast: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, opts: EvalOptions = {}): EvalOutcome {
  const touched = new Set<CellKey>();
  const approxBox = { v: false };
  const prec = opts.divisionPrecision ?? 30;

  try {
    const value = evalNode(ast, host, accessor, touched, approxBox, prec, opts.functions, opts.now);
    return { value, error: null, approx: approxBox.v, touched };
  } catch (e) {
    const code: FormulaErrorCode = e instanceof FormulaEvalError ? e.code : '#ERR';
    return { value: code, error: code, approx: approxBox.v, touched };
  }
}

// ── 참조 해소 ────────────────────────────────────────────────

function resolveRowId(ref: CanonicalRef, host: { rowId: string; field: string }, accessor: FormulaGridAccessor): string | null {
  if (ref.kind === 'abs') return ref.rowId;
  const hostFlat = accessor.flatIndexOfRowId(host.rowId);
  if (hostFlat === -1) return null;
  return accessor.rowIdAtFlat(hostFlat + ref.dRow);
}

/** 단일 참조를 읽는다. 죽은 참조(삭제된 행/열)→#REF, 이미 에러값→그 에러 전파(§6). */
function readRef(ref: CanonicalRef, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, touched: Set<CellKey>): unknown {
  const rowId = resolveRowId(ref, host, accessor);
  if (rowId === null || !accessor.hasRow(rowId)) throw new FormulaEvalError('#REF');
  if (!accessor.hasField(ref.field)) throw new FormulaEvalError('#REF');
  touched.add(cellKey(rowId, ref.field));
  const raw = accessor.getCellValue(rowId, ref.field);
  const errTok = isErrorToken(raw);
  if (errTok) throw new FormulaEvalError(errTok);
  return raw;
}

/**
 * 범위 멤버 값을 evaluate-time 에 라이브 해소한다(§3.5 P0). 두 코너의 rowId가 현재
 * "표시(필터 통과)" 순서에서 어디 있는지 매 평가마다 다시 찾아 사이 멤버를 모은다.
 * 에러 토큰 멤버는 집계 오염 차단(C11)을 위해 이 함수 호출부(집계 함수)에서 제외한다 —
 * 여기서는 원시값 그대로 반환하고, 필터링은 aggregator 가 담당한다.
 */
function resolveRangeMembers(range: CanonicalRangeRef, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, touched: Set<CellKey>): unknown[] {
  const rowIdA = resolveRowId(range.a, host, accessor);
  const rowIdB = resolveRowId(range.b, host, accessor);
  if (rowIdA === null || rowIdB === null || !accessor.hasRow(rowIdA) || !accessor.hasRow(rowIdB)) {
    throw new FormulaEvalError('#REF'); // 코너 소멸(삭제) → 죽은 범위(§3.5 삭제 규범)
  }
  if (!accessor.hasField(range.a.field) || !accessor.hasField(range.b.field)) {
    throw new FormulaEvalError('#REF'); // 열 삭제
  }

  const displayed = accessor.displayedRowIds();
  const idxA = displayed.indexOf(rowIdA);
  const idxB = displayed.indexOf(rowIdB);
  if (idxA === -1 || idxB === -1) {
    // 코너 자체가 필터로 표시열 밖에 있는 경우 — MVP 알려진 한계: evaluate-time 정밀
    // 재투영 대신 안전하게 #REF 로 격리한다(조용한 오답 대신 명시적 신호, F3-R24 정신).
    throw new FormulaEvalError('#REF');
  }
  const lo = Math.min(idxA, idxB);
  const hi = Math.max(idxA, idxB);
  const memberRowIds = displayed.slice(lo, hi + 1);

  const visibleFields = accessor.visibleFields();
  const colA = visibleFields.indexOf(range.a.field);
  const colB = visibleFields.indexOf(range.b.field);
  const [loCol, hiCol] = colA === -1 || colB === -1
    ? [null, null]
    : [Math.min(colA, colB), Math.max(colA, colB)];

  const out: unknown[] = [];
  for (const rid of memberRowIds) {
    if (loCol === null || hiCol === null) {
      // 열이 숨겨져 visibleFields 색인을 못 찾는 경우 — 단일 필드(loCol/hiCol 미상) 범위는
      // 두 코너가 같은 field 일 때가 대부분이라 field 하나로 폴백.
      touched.add(cellKey(rid, range.a.field));
      out.push(accessor.getCellValue(rid, range.a.field));
      continue;
    }
    for (let c = loCol; c <= hiCol; c++) {
      const f = visibleFields[c];
      touched.add(cellKey(rid, f));
      out.push(accessor.getCellValue(rid, f));
    }
  }
  return out;
}

// ── 수치/문자열 변환 ─────────────────────────────────────────

/** 산술 문맥 변환: 빈 셀(null/undefined/'')만 관대(0), 비수치 텍스트는 #VALUE(F3-R28/C10).
 *  과학표기(1e-5 등) 텍스트도 정확한 10진 문자열로 변환 후 OGDecimal.from — float 왕복 없음. */
function toNumericOrThrow(v: unknown): OGDecimal {
  if (v == null || v === '') return OGDecimal.zero();
  if (v instanceof OGDecimal) return v;
  if (typeof v === 'boolean') return OGDecimal.from(v ? '1' : '0');
  if (typeof v === 'number') return OGDecimal.from(v);
  if (typeof v === 'string') {
    const t = v.trim();
    if (!NUMERIC_LITERAL_RE.test(t)) throw new FormulaEvalError('#VALUE');
    return OGDecimal.from(normalizeNumericLiteral(t));
  }
  throw new FormulaEvalError('#VALUE');
}

function toDisplayString(v: CellValue | unknown): string {
  if (v == null) return '';
  if (v instanceof OGDecimal) return v.toString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function toBool(v: CellValue | unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (v instanceof OGDecimal) return !v.isZero();
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.trim().toUpperCase() === 'TRUE' || (NUMERIC_LITERAL_RE.test(v.trim()) && v.trim() !== '0');
  return false;
}

// ── 정밀 정수 헬퍼 (ROUND/ROUNDUP/ROUNDDOWN/INT — OGDecimal 공개 API만 사용) ──

/** dp 자리 단위값(예: dp=2 → '0.01'). ROUNDUP 잔여 보정에 사용. */
function unitAtDp(dp: number): OGDecimal {
  if (dp <= 0) return OGDecimal.from('1');
  return OGDecimal.from('0.' + '0'.repeat(dp - 1) + '1');
}

/**
 * dp 자리에서 0 방향(toward-zero)으로 자른 뒤, mode='up' 이면 잔여가 있을 때 0에서
 * 먼 방향으로 한 단위 보정한다(ROUNDUP). mode='down' 은 그대로 자른 값(ROUNDDOWN).
 * 실용적 상한: dp+20 자리까지만 정밀 문자열을 취급한다(그 이상은 MVP 범위 밖).
 */
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

/** floor(x) — 0 방향 절사(ROUNDDOWN) 후 음수+잔여였으면 1단위 더 내림(INT, §2.4). */
function floorDecimal(x: OGDecimal): OGDecimal {
  const towardZero = truncateToDp(x, 0, 'down');
  if (x.isNeg() && !x.eq(towardZero)) return towardZero.sub('1');
  return towardZero;
}

/** 반올림 half-up (ROUND, §2.4 — OGDecimal.toFixed 가 이미 half-up 구현). */
function roundHalfUp(x: OGDecimal, dp: number): OGDecimal {
  return OGDecimal.from(x.toFixed(Math.max(dp, 0)));
}

/** x^n. 정수 지수는 정확(반복 곱/역수), 비정수 지수는 float 근사(approx=true, §2.4). */
function powDecimal(base: OGDecimal, exp: OGDecimal, divisionPrecision: number, approxBox: { v: boolean }): OGDecimal {
  const flo = floorDecimal(exp);
  if (exp.eq(flo)) {
    const n = Number(flo.toFixed(0));
    if (!Number.isFinite(n) || Math.abs(n) > 100000) {
      // 안전 가드 — 비정상적으로 큰 지수는 근사로 폴백.
      approxBox.v = true;
      return OGDecimal.from(String(Math.pow(base.toNumber(), exp.toNumber())));
    }
    if (n === 0) return OGDecimal.one();
    let result = OGDecimal.one();
    for (let i = 0; i < Math.abs(n); i++) result = result.mul(base);
    if (n < 0) {
      if (result.isZero()) throw new FormulaEvalError('#DIV0');
      result = OGDecimal.one().div(result, divisionPrecision);
    }
    return result;
  }
  approxBox.v = true;
  return OGDecimal.from(String(Math.pow(base.toNumber(), exp.toNumber())));
}

// ── 이항/단항 연산 ───────────────────────────────────────────

function evalBin(op: string, l: unknown, r: unknown, prec: number, approxBox: { v: boolean }): CellValue {
  switch (op) {
    case '+': return toNumericOrThrow(l).add(toNumericOrThrow(r));
    case '-': return toNumericOrThrow(l).sub(toNumericOrThrow(r));
    case '*': return toNumericOrThrow(l).mul(toNumericOrThrow(r));
    case '/': {
      const rn = toNumericOrThrow(r);
      if (rn.isZero()) throw new FormulaEvalError('#DIV0');
      return toNumericOrThrow(l).div(rn, prec);
    }
    case '%': {
      const rn = toNumericOrThrow(r);
      if (rn.isZero()) throw new FormulaEvalError('#DIV0');
      return toNumericOrThrow(l).mod(rn);
    }
    case '^':
      return powDecimal(toNumericOrThrow(l), toNumericOrThrow(r), prec, approxBox);
    case '&':
      return toDisplayString(l) + toDisplayString(r);
    case '=':
    case '<>': {
      const eq = looseEquals(l, r);
      return op === '=' ? eq : !eq;
    }
    case '<': case '<=': case '>': case '>=': {
      const ln = toNumericOrThrow(l);
      const rn = toNumericOrThrow(r);
      if (op === '<') return ln.lt(rn);
      if (op === '<=') return ln.lte(rn);
      if (op === '>') return ln.gt(rn);
      return ln.gte(rn);
    }
    default:
      throw new FormulaEvalError('#ERR');
  }
}

function looseEquals(l: unknown, r: unknown): boolean {
  try {
    return toNumericOrThrow(l).eq(toNumericOrThrow(r));
  } catch {
    return toDisplayString(l) === toDisplayString(r);
  }
}

// ── 함수 테이블 (§2.4) ───────────────────────────────────────

type EvalCtx = { host: { rowId: string; field: string }; accessor: FormulaGridAccessor; touched: Set<CellKey>; prec: number; approxBox: { v: boolean }; functions?: FunctionRegistry | undefined; now?: (() => number) | undefined };

/** 함수 인자 하나를 "집계용 값 목록"으로 평가(range 는 멤버 나열, 스칼라는 단일 원소). */
function evalArgAsList(node: AstNode, ctx: EvalCtx): unknown[] {
  if (node.t === 'range') return resolveRangeMembers(node.ref, ctx.host, ctx.accessor, ctx.touched);
  return [evalNode(node, ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)];
}

/** 집계 함수 인자 전체를 평탄화. C11: 에러 토큰 멤버는 "제외"(집계 오염 차단), 예외 전파 안 함. */
function flattenAggArgs(args: AstNode[], ctx: EvalCtx): unknown[] {
  const out: unknown[] = [];
  for (const a of args) {
    for (const v of evalArgAsList(a, ctx)) {
      if (isErrorToken(v)) continue; // C11 집계 오염 차단
      out.push(v);
    }
  }
  return out;
}

function isNumericValue(v: unknown): boolean {
  if (v == null || v === '') return false;
  if (v instanceof OGDecimal) return true;
  if (typeof v === 'number') return true;
  if (typeof v === 'string') return NUMERIC_LITERAL_RE.test(v.trim());
  return false;
}

function callFunction(name: string, args: AstNode[], ctx: EvalCtx): CellValue {
  // DD-08 §2.3 opt-in 레지스트리 seam: 레지스트리가 주입돼 있고 이 이름이 등록돼 있으면(override/확장)
  // 레지스트리 정의를 우선 사용한다. 미주입이거나 미등록이면 아래 내장 switch 로 폴백(회귀 0).
  if (ctx.functions) {
    const def = ctx.functions.get(name);
    if (def) return callRegistryFn(def, args, ctx);
  }
  switch (name) {
    case 'SUM': {
      const vals = flattenAggArgs(args, ctx);
      return OGDecimal.sum(vals.map((v) => toNumericOrThrow(v) as OGDecimalLike));
    }
    case 'AVG':
    case 'AVERAGE': {
      const vals = flattenAggArgs(args, ctx).filter((v) => v != null && v !== '');
      const nums = vals.map((v) => toNumericOrThrow(v) as OGDecimalLike);
      if (nums.length === 0) throw new FormulaEvalError('#ERR');
      return OGDecimal.avg(nums, ctx.prec);
    }
    case 'MIN': {
      const vals = flattenAggArgs(args, ctx).filter(isNumericValue);
      if (vals.length === 0) throw new FormulaEvalError('#ERR');
      return OGDecimal.min(vals.map((v) => toNumericOrThrow(v) as OGDecimalLike));
    }
    case 'MAX': {
      const vals = flattenAggArgs(args, ctx).filter(isNumericValue);
      if (vals.length === 0) throw new FormulaEvalError('#ERR');
      return OGDecimal.max(vals.map((v) => toNumericOrThrow(v) as OGDecimalLike));
    }
    case 'COUNT': {
      const vals = flattenAggArgs(args, ctx);
      return OGDecimal.from(String(vals.filter(isNumericValue).length));
    }
    case 'COUNTA': {
      const vals = flattenAggArgs(args, ctx);
      return OGDecimal.from(String(vals.filter((v) => v != null && v !== '').length));
    }
    case 'IF': {
      if (args.length < 2) throw new FormulaEvalError('#ERR');
      const cond = evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now);
      if (toBool(cond)) return evalNode(args[1], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now);
      if (args.length > 2) return evalNode(args[2], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now);
      return false;
    }
    case 'AND':
      return args.every((a) => toBool(evalNode(a, ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)));
    case 'OR':
      return args.some((a) => toBool(evalNode(a, ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)));
    case 'NOT':
      if (args.length !== 1) throw new FormulaEvalError('#ERR');
      return !toBool(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
    case 'ROUND': {
      if (args.length !== 2) throw new FormulaEvalError('#ERR');
      const x = toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      const dp = Number(toNumericOrThrow(evalNode(args[1], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)).toFixed(0));
      return roundHalfUp(x, dp);
    }
    case 'ROUNDUP':
    case 'ROUNDDOWN': {
      if (args.length !== 2) throw new FormulaEvalError('#ERR');
      const x = toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      const dp = Number(toNumericOrThrow(evalNode(args[1], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)).toFixed(0));
      return truncateToDp(x, dp, name === 'ROUNDUP' ? 'up' : 'down');
    }
    case 'ABS': {
      if (args.length !== 1) throw new FormulaEvalError('#ERR');
      return toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)).abs();
    }
    case 'INT': {
      if (args.length !== 1) throw new FormulaEvalError('#ERR');
      return floorDecimal(toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now)));
    }
    case 'MOD': {
      if (args.length !== 2) throw new FormulaEvalError('#ERR');
      const a = toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      const b = toNumericOrThrow(evalNode(args[1], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      if (b.isZero()) throw new FormulaEvalError('#DIV0');
      return a.mod(b);
    }
    case 'POWER': {
      if (args.length !== 2) throw new FormulaEvalError('#ERR');
      const base = toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      const exp = toNumericOrThrow(evalNode(args[1], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      return powDecimal(base, exp, ctx.prec, ctx.approxBox);
    }
    case 'SQRT': {
      if (args.length !== 1) throw new FormulaEvalError('#ERR');
      const x = toNumericOrThrow(evalNode(args[0], ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now));
      if (x.isNeg()) throw new FormulaEvalError('#NUM');
      ctx.approxBox.v = true;
      return OGDecimal.from(String(Math.sqrt(x.toNumber())));
    }
    case 'CONCAT': {
      return args.map((a) => toDisplayString(evalNode(a, ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now))).join('');
    }
    default:
      throw new FormulaEvalError('#NAME');
  }
}

/**
 * DD-08 §2.3 브리지: FunctionDef 를 evaluator 내부 헬퍼(evalNode/집계/변환)로 배선해 평가한다.
 * 확장/오버라이드 함수가 evaluator 내부에 손대지 않고 자기완결적으로 동작하게 한다(무예외 격리 동일).
 * / Bridge that wires a FunctionDef to the evaluator's internal helpers so extended/override
 *   functions run self-contained under the same never-throw isolation.
 */
function callRegistryFn(def: FunctionDef, argNodes: AstNode[], ctx: EvalCtx): CellValue {
  const { min, max } = def.arity;
  if (argNodes.length < min || (max !== 'variadic' && argNodes.length > max)) {
    throw new FormulaEvalError('#ERR');
  }
  const fnArgs: FnArg[] = argNodes.map((node) => ({
    scalar: (): CellValue => evalNode(node, ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now),
    tryScalar: (): FnArgResult => {
      try {
        return { ok: true, value: evalNode(node, ctx.host, ctx.accessor, ctx.touched, ctx.approxBox, ctx.prec, ctx.functions, ctx.now) };
      } catch (e) {
        return { ok: false, error: e instanceof FormulaEvalError ? e.code : '#ERR' };
      }
    },
    list: (): CellValue[] => evalArgAsList(node, ctx) as CellValue[],
  }));
  const fnCtx: FnEvalCtx = {
    prec: ctx.prec,
    now: ctx.now ?? (() => Date.now()),
    argCount: argNodes.length,
    markApprox: () => { ctx.approxBox.v = true; },
    fail: (code: FormulaErrorCode): never => { throw new FormulaEvalError(code); },
    toNum: (v) => toNumericOrThrow(v),
    toBool: (v) => toBool(v),
    toStr: (v) => toDisplayString(v),
    isNumeric: (v) => isNumericValue(v),
    collect: () => flattenAggArgs(argNodes, ctx) as CellValue[],
  };
  return def.evaluate(fnArgs, fnCtx);
}

// ── 메인 재귀 평가 ───────────────────────────────────────────

function evalNode(node: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, touched: Set<CellKey>, approxBox: { v: boolean }, prec: number, functions?: FunctionRegistry, now?: () => number): CellValue {
  switch (node.t) {
    case 'num': return OGDecimal.from(node.v);
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'error': throw new FormulaEvalError(node.code);
    case 'field': {
      if (!accessor.hasField(node.field)) throw new FormulaEvalError('#REF'); // 열 삭제(F3-R28)
      touched.add(cellKey(host.rowId, node.field)); // 그래프 엣지 등록 대상(누락 시 [field] 증분재계산이 끊김)
      const raw = accessor.getCellValue(host.rowId, node.field);
      const errTok = isErrorToken(raw);
      if (errTok) throw new FormulaEvalError(errTok);
      return normalizeRawCellValue(raw);
    }
    case 'ref': {
      const raw = readRef(node.ref, host, accessor, touched);
      return normalizeRawCellValue(raw);
    }
    case 'range':
      // 단독 범위(함수 인자 밖)는 스칼라로 쓸 수 없음 — 안전한 명시적 실패.
      throw new FormulaEvalError('#VALUE');
    case 'call':
      return callFunction(node.name, node.args, { host, accessor, touched, prec, approxBox, functions, now });
    case 'unary': {
      const v = toNumericOrThrow(evalNode(node.arg, host, accessor, touched, approxBox, prec, functions, now));
      return node.op === '-' ? v.neg() : v;
    }
    case 'bin':
      return evalBin(
        node.op,
        evalNode(node.left, host, accessor, touched, approxBox, prec, functions, now),
        evalNode(node.right, host, accessor, touched, approxBox, prec, functions, now),
        prec,
        approxBox,
      );
    default:
      throw new FormulaEvalError('#ERR');
  }
}

/** accessor 가 돌려준 원시값을 CellValue 형태로 느슨하게 맞춘다(number→그대로 두고 산술 시 변환). */
function normalizeRawCellValue(raw: unknown): CellValue {
  if (raw == null) return null;
  if (raw instanceof OGDecimal || typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return OGDecimal.from(raw);
  return String(raw);
}
