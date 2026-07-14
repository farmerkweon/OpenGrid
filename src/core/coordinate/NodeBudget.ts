// ============================================================
// DD-02 §2.5 노드 예산 게이트 / DD-02 §2.5 DOM node budget gate (REQ-TX-803)
// 가시행수×표시열수+버퍼 ≤ 5000(기본). 초과 시 세로 윈도를 축소해 전행 DOM 폭주 차단.
// 순수.
// ============================================================

/** 노드 예산 판정 결과. / Node budget evaluation result. */
export interface NodeBudgetResult {
  readonly estimatedNodes: number;
  readonly withinBudget: boolean;
  /** 예산 초과 시에만 존재 — 세로 윈도 축소 목표 행수. / Present only when over budget. */
  readonly clampedRows?: number;
}

/**
 * DOM 라이브 노드 상한 예산 계산기. 순수.
 * / DOM live-node budget calculator. Pure.
 */
export class NodeBudget {
  private readonly _maxNodes: number;
  private readonly _overscan: number;

  /**
   * @param opts.maxNodes 라이브 노드 상한(기본 5000) / live-node cap (default 5000)
   * @param opts.overscan 기본 오버스캔(기본 5) / default overscan (default 5)
   */
  constructor(opts: { maxNodes?: number; overscan?: number } = {}) {
    this._maxNodes = Math.max(1, Math.floor(opts.maxNodes ?? 5000));
    this._overscan = Math.max(0, Math.floor(opts.overscan ?? 5));
  }

  /** 상한(기본 5000). / Node cap. */
  get maxNodes(): number {
    return this._maxNodes;
  }

  /** 기본 오버스캔. / Default overscan. */
  get overscan(): number {
    return this._overscan;
  }

  /** 가시행수×표시열수+버퍼 → 예산 판정. / Evaluate rows×cols+buffer against the cap. */
  evaluate(input: { visibleRows: number; visibleCols: number; overscanRows: number }): NodeBudgetResult {
    const cols = Math.max(0, Math.floor(input.visibleCols));
    const rows = Math.max(0, Math.floor(input.visibleRows));
    const buffer = Math.max(0, Math.floor(input.overscanRows));
    const estimatedNodes = (rows + buffer) * cols;

    if (estimatedNodes <= this._maxNodes) {
      return { estimatedNodes, withinBudget: true };
    }

    // 세로 윈도 축소: 열당 예산으로 담을 수 있는 최대 행수(버퍼 제외, 최소 1).
    const perColBudget = cols > 0 ? Math.floor(this._maxNodes / cols) : this._maxNodes;
    const clampedRows = Math.max(1, perColBudget - buffer);
    return { estimatedNodes, withinBudget: false, clampedRows };
  }
}
