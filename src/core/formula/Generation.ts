// ============================================================
// DD-08 §2.4 — 비동기 세대 토큰 + CalcExecutor seam (REQ-T8-806/843)
// 레이어: Algorithm (헤드리스, 순수)
// 설계 SSOT: DD-08 §2.4, §3.5 — 늦게 도착한 옛 결과는 세대 불일치로 폐기(스테일 안전, 불변식 7).
// additive: 신설 파일. 기존 코어 무수정. 동기 실행기(SyncCalcExecutor)가 항상 존재하는 폴백.
// ============================================================

import type { AstNode, CellKey, FormulaGridAccessor } from './types.js';
import { evaluate, type EvalOutcome, type EvalOptions } from './FormulaEvaluator.js';

/** 단조 증가 세대(브랜드 타입). 값 변경/구조편집/대량 무효화 시 증가(§2.4). / Monotonic generation (branded). */
export type Generation = number & { readonly __brand: 'Generation' };

/** 원시 수를 Generation 으로 태그(내부 전용). / Tag a raw number as a Generation (internal). */
export function makeGeneration(n: number): Generation {
  return n as Generation;
}

/** 비동기 계산 결과의 세대 봉투(§2.4) — executor 가 반환, 코디네이터가 게이트. / Generational envelope of an async result. */
export interface GenerationalResult<T> {
  /** 요청 발행 시점 세대. / Generation at request-issue time. */
  readonly gen: Generation;
  /** 결과 값. / Result value. */
  readonly value: T;
}

/**
 * 단조 세대 카운터. 스테일 게이트의 단일 진실(§2.4/§3.5). in-flight 폐기의 근거.
 * / Monotonic generation counter — single source of truth for the stale gate (§2.4/§3.5).
 *
 * @example
 * const gc = new GenerationCounter();
 * const g = gc.current();
 * gc.invalidate();            // 대량 변경 → 세대 증가
 * gc.isCurrent(g);            // false → 늦게 온 g 세대 결과는 폐기
 */
export class GenerationCounter {
  private _g: Generation = makeGeneration(0);

  /** 현재 세대. / Current generation. */
  current(): Generation {
    return this._g;
  }

  /** 세대를 1 올리고 새 값을 반환(in-flight 폐기). / Bump the generation by 1 and return it (discards in-flight). */
  invalidate(): Generation {
    this._g = makeGeneration(this._g + 1);
    return this._g;
  }

  /** 주어진 세대가 현재와 일치하는가(스테일 게이트). / Whether the given generation equals the current (stale gate). */
  isCurrent(gen: Generation): boolean {
    return gen === this._g;
  }
}

/**
 * 세대 게이트 적용 도우미(§3.5 스텝4): 결과 세대가 현재와 일치할 때만 apply 를 호출한다.
 * 불일치면 폐기(apply 미호출)하고 false 반환. "A 요청 후 즉시 B → 늦은 A 무시" 계약을 캡슐.
 * / Apply a generational result only if its generation is still current (§3.5 step 4); otherwise
 *   discard (apply not called) and return false.
 *
 * @param counter - 세대 카운터 / Generation counter
 * @param result - 세대 봉투 결과 / Generational envelope result
 * @param apply - 세대 일치 시 실행할 적용 함수 / Applied only when generations match
 * @returns 적용되었으면 true, 폐기되었으면 false / true if applied, false if discarded
 */
export function applyIfCurrent<T>(counter: GenerationCounter, result: GenerationalResult<T>, apply: (value: T) => void): boolean {
  if (!counter.isCurrent(result.gen)) return false;
  apply(result.value);
  return true;
}

/** 비동기 계산 배치 요청(§2.4). / An async calc batch request (§2.4). */
export interface AsyncCalcRequest {
  /** 평가 대상 (ast, host) 목록. / (ast, host) pairs to evaluate. */
  readonly items: ReadonlyArray<{ ast: AstNode; host: { rowId: string; field: string } }>;
}

/**
 * 계산 실행기 seam(§2.4, Strategy) — 동기(기본)/워커/목 교체 가능. 워커 미지원 시 evalSync 폴백.
 * / Calc executor seam (§2.4, Strategy) — sync (default) / worker / mock. Falls back to evalSync
 *   when workers are unsupported (REQ-T8-843).
 */
export interface CalcExecutor {
  /** 동기 평가(메인스레드). 항상 존재(폴백). / Synchronous evaluation (main thread). Always present (fallback). */
  evalSync(ast: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, opts?: EvalOptions): EvalOutcome;
  /** (선택) 비동기 오프로드(REQ-T8-843) — 순수·직렬화가능 계약. 세대 봉투로 반환. / (optional) async offload — returns a generational envelope. */
  evalAsync?(batch: AsyncCalcRequest, accessor: FormulaGridAccessor, gen: Generation, opts?: EvalOptions): Promise<GenerationalResult<EvalOutcome[]>>;
  /** 워커 지원 여부(false → evalSync 폴백, REQ-T8-843). / Whether workers are supported (false → evalSync fallback). */
  readonly supportsWorker: boolean;
}

/**
 * 기본 동기 실행기 — `evaluate` 를 그대로 위임한다(폴백 계약). 워커 미지원.
 * / Default synchronous executor — delegates straight to `evaluate` (fallback contract). No worker.
 */
export class SyncCalcExecutor implements CalcExecutor {
  readonly supportsWorker = false;

  evalSync(ast: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, opts?: EvalOptions): EvalOutcome {
    return evaluate(ast, host, accessor, opts);
  }
}

/** 편의 재수출(테스트/소비자). / Convenience re-export. */
export type { CellKey };
