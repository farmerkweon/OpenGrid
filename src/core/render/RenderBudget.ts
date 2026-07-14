// ============================================================
// DD-03 §2.4 RenderBudget — 렌더 인터셉터 + 프레임/셀 예산 (REQ-TX-889)
// before/after 인터셉터를 예산 안에서만 실행·계측한다. 초과 시 1회/세션 경고 + report() 집계.
// 가시행 한정은 파이프라인이 보장(오프스크린 셀은 애초에 renderCell 미호출).
// 헤드리스: 시간 측정은 주입 가능한 now()(기본 Date.now) — 캔버스·DOM 미접근.
// ============================================================

import type { CellRenderRequest, Disposable, RenderInterceptor } from './CellRenderRequest.js';

/** 예산 옵션. / Budget options. */
export interface RenderBudgetOptions {
  /** 프레임 예산(ms). / Frame budget (ms). */
  frameMs: number;
  /** 셀당 예산(ms) — 초과 인터셉터 계측 임계. / Per-cell budget (ms). */
  perCellMs: number;
  /** 시간 소스(테스트 주입용, 기본 Date.now). / Time source (injectable for tests). */
  now?: () => number;
}

/** report() 집계 항목. / A report() aggregation entry. */
export interface OverBudgetEntry {
  readonly id: string;
  readonly ms: number;
}

/**
 * 렌더 예산·인터셉터 러너. 인터셉터 훅을 예산 안에서 실행하고 초과분을 계측·경고한다.
 * / Render-budget & interceptor runner. Runs interceptor hooks within budget; measures/warns on overrun.
 */
export class RenderBudget {
  private _interceptors: RenderInterceptor[] = [];
  private _over = new Map<string, number>();   // id → 관측된 최대 초과 ms
  private _warned = new Set<string>();          // 1회/세션 경고 가드
  private readonly _frameMs: number;
  private readonly _perCellMs: number;
  private readonly _now: () => number;

  constructor(opts: RenderBudgetOptions) {
    this._frameMs = opts.frameMs;
    this._perCellMs = opts.perCellMs;
    this._now = opts.now ?? Date.now;
  }

  /** 프레임 예산(ms). / Frame budget (ms). */
  get frameMs(): number { return this._frameMs; }
  /** 셀당 예산(ms). / Per-cell budget (ms). */
  get perCellMs(): number { return this._perCellMs; }

  /**
   * 인터셉터 등록. 해제 토큰 반환. / Add an interceptor. Returns a disposal token.
   *
   * @param i - 인터셉터 / Interceptor
   * @returns 등록 해제 토큰 / A disposal token
   */
  addInterceptor(i: RenderInterceptor): Disposable {
    this._interceptors.push(i);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const idx = this._interceptors.indexOf(i);
        if (idx >= 0) this._interceptors.splice(idx, 1);
      },
    };
  }

  /** 등록된 인터셉터 수. / Number of registered interceptors. */
  get interceptorCount(): number { return this._interceptors.length; }

  /**
   * 인터셉터 함수 1개를 계측하며 실행. perCellMs 초과 시 계측·1회 경고. 예외는 호출측(파이프라인
   * 오류 경계)이 격리하므로 여기서 삼키지 않는다 — 단, 계측은 finally 로 보장.
   * / Run one interceptor fn while measuring. Over perCellMs → record + warn-once. Does not swallow
   * exceptions (the caller's error boundary isolates); measurement is guaranteed in finally.
   *
   * @param id - 인터셉터 식별자 / Interceptor id
   * @param fn - 실행 함수 / Function to run
   */
  runInterceptor(id: string, fn: () => void): void {
    const start = this._now();
    try {
      fn();
    } finally {
      const ms = this._now() - start;
      if (ms > this._perCellMs) {
        const prev = this._over.get(id) ?? 0;
        if (ms > prev) this._over.set(id, ms);
        if (!this._warned.has(id)) {
          this._warned.add(id);
          console.warn(`[OpenGrid] RenderBudget: interceptor '${id}' over per-cell budget (${ms.toFixed(2)}ms > ${this._perCellMs}ms). 가시행 한정·경량화 필요.`);
        }
      }
    }
  }

  /** 등록된 모든 인터셉터의 beforeRow 훅 실행(예산 내). / Run beforeRow of all interceptors (within budget). */
  runBeforeRow(ri: number): void {
    for (const i of this._interceptors) {
      if (i.beforeRow) this.runInterceptor(i.id, () => i.beforeRow!(ri));
    }
  }
  /** 등록된 모든 인터셉터의 beforeCell 훅 실행(예산 내). / Run beforeCell of all interceptors. */
  runBeforeCell(req: CellRenderRequest): void {
    for (const i of this._interceptors) {
      if (i.beforeCell) this.runInterceptor(i.id, () => i.beforeCell!(req));
    }
  }
  /** 등록된 모든 인터셉터의 afterCell 훅 실행(예산 내). / Run afterCell of all interceptors. */
  runAfterCell(req: CellRenderRequest, el: HTMLElement): void {
    for (const i of this._interceptors) {
      if (i.afterCell) this.runInterceptor(i.id, () => i.afterCell!(req, el));
    }
  }
  /** 등록된 모든 인터셉터의 afterRow 훅 실행(예산 내). / Run afterRow of all interceptors. */
  runAfterRow(ri: number): void {
    for (const i of this._interceptors) {
      if (i.afterRow) this.runInterceptor(i.id, () => i.afterRow!(ri));
    }
  }

  /**
   * 예산 초과 계측 보고. / Over-budget measurement report.
   *
   * @returns 초과 인터셉터 목록(ms 내림차순) / Over-budget interceptors (desc by ms)
   */
  report(): { overBudget: readonly OverBudgetEntry[] } {
    const overBudget = [...this._over.entries()]
      .map(([id, ms]) => ({ id, ms }))
      .sort((a, b) => b.ms - a.ms);
    return { overBudget };
  }
}
