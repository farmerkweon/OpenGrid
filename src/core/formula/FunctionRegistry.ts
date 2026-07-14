// ============================================================
// DD-08 §2.3 — 함수 레지스트리(필수/확장 seam) + FunctionDef 정본
// 레이어: Algorithm (헤드리스, DOM/프레임워크 비의존)
// 설계 SSOT: sessions/design-uxui-2026-07/detailed-design/DD-08_formula-engine.md §2.3, §4, R.4~R.6
//
// 정본 소유(§R.4): `FunctionDef` 는 DD-08 단독 정본. DD-10 `IFunctionDescriptor` 는 이 타입을
//   import 하며 `extends IExtension` 만 부여(재선언 금지). 명칭 통일: call→evaluate, FnCtx→EvalCtx.
// additive 원칙: 이 파일은 신설이며 기존 formula/ 코어(Parser/Graph/Store/normalize)를 수정하지
//   않는다. `FormulaEvaluator` 는 **opt-in** 으로만 이 레지스트리를 소비한다(미주입 시 내장 switch
//   경로가 그대로 동작 → 회귀 0). override/확장 함수는 레지스트리 경로로만 활성된다.
// ============================================================

import type { OGDecimal } from '../OGDecimal.js';
import type { CellValue, FormulaErrorCode } from './types.js';

// ── 함수 평가 브리지(§2.3 EvalArg/EvalCtx) ─────────────────────
// FormulaEvaluator 가 매 호출마다 구축해 FunctionDef.evaluate 에 넘기는 얇은 어댑터.
// 확장/오버라이드 함수가 evaluator 내부 헬퍼에 직접 손대지 않고도 자기완결적으로 평가할 수 있게 한다.

/** 인자 1개의 지연 평가 결과(에러 격리형). / Lazy result of one argument (error-isolated). */
export type FnArgResult =
  | { readonly ok: true; readonly value: CellValue }
  | { readonly ok: false; readonly error: FormulaErrorCode };

/**
 * 함수 인자 1개 — 스칼라/리스트/에러격리 평가를 제공한다(§2.3 EvalArg).
 * / A single function argument — scalar/list/error-isolated evaluation (§2.3 EvalArg).
 */
export interface FnArg {
  /** 스칼라로 평가(에러면 FormulaEvalError throw — evaluate() 경계가 격리). / Evaluate as scalar (throws on error; evaluate() boundary isolates it). */
  scalar(): CellValue;
  /** 스칼라로 평가하되 에러를 값으로 포획(IFERROR 류). / Evaluate as scalar but capture errors as a value (IFERROR-like). */
  tryScalar(): FnArgResult;
  /** 리스트로 평가(범위→멤버 나열, 스칼라→단일 원소). / Evaluate as list (range→members, scalar→one element). */
  list(): CellValue[];
}

/**
 * 함수 평가 컨텍스트 — 변환/근사표식/실패/집계 도우미(§2.3 EvalCtx).
 * / Function evaluation context — conversions, approx flag, failure, aggregation helper (§2.3 EvalCtx).
 */
export interface FnEvalCtx {
  /** 나눗셈 정밀도(§8.1 divisionPrecision). / Division precision (§8.1). */
  readonly prec: number;
  /** 결정론 주입 시각(volatile 함수용, 불변식 1). / Injected deterministic clock (for volatile funcs, invariant 1). */
  readonly now: () => number;
  /** 인자 개수. / Argument count. */
  readonly argCount: number;
  /** float 근사가 섞였음을 표식(SQRT 등). / Mark that a float approximation was involved (SQRT, …). */
  markApprox(): void;
  /** 표준 오류로 실패(무예외 불변식 — 내부 FormulaEvalError 로 격리). / Fail with a standard error (never-throw invariant). */
  fail(code: FormulaErrorCode): never;
  /** 산술 문맥 수치 변환(빈 셀만 관대·비수치는 #VALUE). / Numeric coercion (empty tolerant; non-numeric → #VALUE). */
  toNum(v: CellValue): OGDecimal;
  /** 불리언 문맥 변환. / Boolean coercion. */
  toBool(v: CellValue): boolean;
  /** 표시 문자열 변환. / Display-string coercion. */
  toStr(v: CellValue): string;
  /** 수치로 해석 가능한 값인가. / Whether the value is interpretable as numeric. */
  isNumeric(v: CellValue): boolean;
  /** 전 인자를 평탄화(범위 전개)하고 에러 토큰 멤버는 제외(집계 오염 차단, C11). / Flatten all args (expand ranges) excluding error-token members (aggregation guard, C11). */
  collect(): CellValue[];
}

// ── 에디터 SPI 메타(§2.3 signature, REQ-T8-827) ────────────────

/** 함수 인자 1개의 시그니처 메타(자동완성·인자힌트 데이터원). / Signature meta for one parameter (autocomplete/arg-hint source). */
export interface FunctionParam {
  /** 인자 표시명. / Parameter display name. */
  readonly name: string;
  /** 선택 인자 여부. / Whether the parameter is optional. */
  readonly optional?: boolean;
  /** 가변 인자 여부. / Whether the parameter is variadic. */
  readonly variadic?: boolean;
}

/** 함수 시그니처(에디터 6기능 데이터원, REQ-T8-827). 렌더/위젯은 DD-09/DD-03. / Function signature (editor data source; widgets belong to DD-09/DD-03). */
export interface FunctionSignature {
  /** 인자 목록. / Parameter list. */
  readonly params: readonly FunctionParam[];
  /** 한 줄 요약. / One-line summary. */
  readonly summary?: string;
  /** 반환 설명. / Return description. */
  readonly returns?: string;
}

// ── FunctionDef 정본(§2.3, §R.4) ───────────────────────────────

/**
 * 함수 1개의 순수 정의(§2.3 FunctionDef 정본). 값 목록/스칼라 인자를 받아 CellValue 를 산출.
 * 무예외 계약: throw 대신 `ctx.fail(code)` 로 오류 격리(오버라이드 함수도 동일, CRC 불변식 ③).
 * / Pure definition of one function (§2.3 canonical FunctionDef). Never-throw contract:
 *   isolate errors via `ctx.fail(code)` rather than throwing (overrides included).
 */
export interface FunctionDef {
  /** 정규화 대문자 이름. / Normalized upper-case name. */
  readonly name: string;
  /** 인자 개수 제약. / Arity constraint. */
  readonly arity: { readonly min: number; readonly max: number | 'variadic' };
  /** 번들 배분·Go/NoGo 집계 기준(REQ-T8-844). / Bundle-budget/Go-NoGo tier (REQ-T8-844). */
  readonly tier: 'essential' | 'extended';
  /** 순수 평가. / Pure evaluation. */
  evaluate(args: FnArg[], ctx: FnEvalCtx): CellValue;
  /** (선택) 에디터 SPI 메타(REQ-T8-827). / (optional) editor SPI meta (REQ-T8-827). */
  readonly signature?: FunctionSignature;
  /** (선택) spill 산출(동적배열, REQ-T8-112). / (optional) spill output (dynamic arrays, REQ-T8-112). */
  readonly spills?: boolean;
  /**
   * (선택·additive) 휘발성(§R.4, DD-10 흡수). 'volatile'(NOW/RAND: 매 재계산 재평가·캐시 무효)
   * | 'stable'(기본). `CalcCacheStore` 는 volatile 참조 셀을 캐시에서 제외한다.
   * / (optional) volatility (§R.4). 'volatile' funcs are excluded from CalcCacheStore.
   */
  readonly volatility?: 'stable' | 'volatile';
  /** (선택·additive) 지역화 표시명(§R.4). 평가는 정규화 name 기준, 라벨만 i18n. / (optional) localized display name (§R.4). */
  readonly i18nName?: Readonly<Record<string, string>>;
}

// ── 레지스트리 계약·구현(§2.3, §R.5/R.6) ───────────────────────

/**
 * 함수 등록·조회·**오버라이드** SPI(§2.3). DD-10 `IRegistry<FunctionDef>` 동형(C1) — register/get/has
 * 는 IRegistry 코어, list(tier)·child 는 본 레지스트리 확장.
 * / Function register/get/override SPI (§2.3). Isomorphic to DD-10 IRegistry<FunctionDef> (C1).
 */
export interface FunctionRegistry {
  /**
   * 등록·교체. 기본은 **우발적 섀도잉 방지**(§R.5): 기존 이름 재등록은 `override` 미지정 시 throw.
   * / Register/replace. Fail-fast on accidental shadowing (§R.5): re-registering an existing name
   *   without `override` throws.
   */
  register(def: FunctionDef, opts?: { override?: boolean }): void;
  /** 미등록 → undefined(평가 시 #NAME). / Unregistered → undefined (#NAME at eval). */
  get(name: string): FunctionDef | undefined;
  /** 등록 여부(부모 스코프 포함). / Whether registered (parent scope included). */
  has(name: string): boolean;
  /** tier 별 목록(번들 예산 집계·Go/NoGo, REQ-T8-844). / List by tier (bundle budget/Go-NoGo). */
  list(tier?: 'essential' | 'extended'): FunctionDef[];
  /** 자식 스코프 — per-instance 오버라이드(전역 오염 없음, 부모 폴백). / Child scope — per-instance override (no global pollution, parent fallback). */
  child(): FunctionRegistry;
}

/** 함수 이름 정규화(대문자·trim) — register/get 진입 공통. / Normalize a function name (upper-case, trim). */
export function normalizeFnName(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * `FunctionRegistry` 기본 구현. 얇은 Map + 부모 폴백 체인(§2.3 child). 직렬화 없음(코드 참조).
 * / Default `FunctionRegistry` implementation. Thin Map + parent-fallback chain (§2.3 child).
 */
export class TieredFunctionRegistry implements FunctionRegistry {
  private readonly _map = new Map<string, FunctionDef>();
  private readonly _parent: TieredFunctionRegistry | undefined;

  constructor(parent?: TieredFunctionRegistry) {
    this._parent = parent;
  }

  register(def: FunctionDef, opts?: { override?: boolean }): void {
    const key = normalizeFnName(def.name);
    if (key.length === 0) throw new Error('[OpenGrid] FunctionRegistry.register: 빈 함수명은 등록할 수 없습니다.');
    // 우발적 섀도잉 방지(§R.5): 로컬 스코프에 이미 있으면 override 필수. 부모 스코프는 폴백 대상이라 검사 제외.
    if (this._map.has(key) && !opts?.override) {
      throw new Error(`[OpenGrid] FunctionRegistry.register: '${key}' 는 이미 등록됨 — 교체하려면 { override: true }.`);
    }
    this._map.set(key, def);
  }

  get(name: string): FunctionDef | undefined {
    const key = normalizeFnName(name);
    return this._map.get(key) ?? this._parent?.get(key);
  }

  has(name: string): boolean {
    const key = normalizeFnName(name);
    return this._map.has(key) || (this._parent?.has(key) ?? false);
  }

  list(tier?: 'essential' | 'extended'): FunctionDef[] {
    // 부모→자식 병합(자식 오버라이드 우선). / Merge parent then child (child overrides win).
    const merged = new Map<string, FunctionDef>();
    if (this._parent) for (const d of this._parent.list()) merged.set(normalizeFnName(d.name), d);
    for (const [k, d] of this._map) merged.set(k, d);
    const all = [...merged.values()];
    return tier ? all.filter((d) => d.tier === tier) : all;
  }

  child(): FunctionRegistry {
    return new TieredFunctionRegistry(this);
  }
}
