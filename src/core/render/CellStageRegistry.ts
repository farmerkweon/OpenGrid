// ============================================================
// DD-03 §2.4 CellStageRegistry — 단계 등록 레지스트리(OCP seam)
// kind별 버킷 + order 정렬 캐시 + 중복 id 거부(REQ-T6-823 우회 금지).
// DD-10 IRegistry<ICellStage,string> 동형(§4.4 C1) — kind 버킷·order 는 그 위의 뷰.
// 헤드리스·순수(DOM 접근 0).
// ============================================================

import type { Disposable, ICellStage, StageKind } from './CellRenderRequest.js';

const DEFAULT_ORDER = 100;

/**
 * 단계 등록 레지스트리. register/unregister/stagesFor + 중복 id 거부 + order 정렬 캐시.
 * / Cell-stage registry. register/unregister/stagesFor + duplicate-id rejection + order-sorted cache.
 */
export class CellStageRegistry {
  /** id → 단계(단일 디스패치·중복 거부의 근거). / id → stage (basis of single-dispatch dedup). */
  private _byId = new Map<string, ICellStage>();
  /** kind → 정렬된 단계 배열 캐시(무효화 시 재계산). / kind → sorted-stage cache. */
  private _cache = new Map<StageKind, readonly ICellStage[]>();

  /**
   * 단계 등록. 같은 id 재등록은 거부(우회 0 — REQ-T6-823). 해제 토큰 반환.
   * / Register a stage; rejects duplicate id (no bypass — REQ-T6-823). Returns a disposal token.
   *
   * @param def - 단계 정의 / Stage definition
   * @returns 등록 해제 토큰 / A disposal token
   */
  register(def: ICellStage): Disposable {
    if (this._byId.has(def.id)) {
      throw new Error(`[OpenGrid] CellStageRegistry: duplicate stage id '${def.id}' (REQ-T6-823: 단일 디스패치·우회 금지)`);
    }
    this._byId.set(def.id, def);
    this._cache.delete(def.kind);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.unregister(def.id);
      },
    };
  }

  /**
   * id 로 단계 해제(없으면 no-op). / Unregister a stage by id (no-op if absent).
   *
   * @param id - 단계 id / Stage id
   */
  unregister(id: string): void {
    const def = this._byId.get(id);
    if (!def) return;
    this._byId.delete(id);
    this._cache.delete(def.kind);
  }

  /** id 등록 여부. / Whether an id is registered. */
  has(id: string): boolean {
    return this._byId.has(id);
  }

  /**
   * 해당 레인의 단계를 order 오름차순으로 반환(캐시). 동률 order 는 등록 순서 안정 정렬.
   * / Stages for a lane, ascending by order (cached). Ties keep registration order (stable sort).
   *
   * @param kind - 레인 / Lane
   * @returns order 정렬된 단계(불변) / Order-sorted stages (immutable)
   */
  stagesFor(kind: StageKind): readonly ICellStage[] {
    const cached = this._cache.get(kind);
    if (cached) return cached;
    const list = [...this._byId.values()].filter(s => s.kind === kind);
    // 안정 정렬: order 오름차순, 동률은 삽입순 유지(Map 반복은 삽입순).
    const sorted = list
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (a.s.order ?? DEFAULT_ORDER) - (b.s.order ?? DEFAULT_ORDER) || a.i - b.i)
      .map(x => x.s);
    const frozen = Object.freeze(sorted);
    this._cache.set(kind, frozen);
    return frozen;
  }

  /** 전체 등록 수(진단). / Total registered count (diagnostics). */
  get size(): number {
    return this._byId.size;
  }
}

// ── 전역 파사드 — 코어 편집 없이 새 단계 삽입(§2.4). ────────────
/** 프로세스 전역 기본 레지스트리(파사드 대상). / Process-global default registry. */
export const defaultCellStageRegistry = new CellStageRegistry();

/**
 * 코어 파이프라인 소스 미편집으로 단계 삽입(OCP). 다음 프레임부터 자동 합성.
 * / Insert a stage without editing core pipeline source (OCP). Composed from the next frame.
 *
 * @param def - 단계 정의 / Stage definition
 * @returns 등록 해제 토큰 / A disposal token
 */
export function registerCellStage(def: ICellStage): Disposable {
  return defaultCellStageRegistry.register(def);
}

/**
 * 전역 파사드에서 단계 해제. / Unregister a stage from the global facade.
 *
 * @param id - 단계 id / Stage id
 */
export function unregisterCellStage(id: string): void {
  defaultCellStageRegistry.unregister(id);
}
