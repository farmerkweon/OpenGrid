// ============================================================
// DD-02 §2.2 프리즌 팬 / DD-02 §2.2 frozen panes
// 고정 행/열 분할 상태. view/col 를 팬으로 분류. 순수 값 객체.
// ============================================================
import { viewIndex, leafColIndex, type Px, type ViewIndex, type LeafColIndex, type PaneId } from './types.js';
import type { RowMetrics } from './RowMetrics.js';
import type { ColumnMetrics } from './ColumnMetrics.js';

/**
 * 고정 행/열 분할 상태. 순수 불변.
 * / Frozen row/column split. Pure & immutable.
 */
export class FrozenPanes {
  private readonly _rows: number;
  private readonly _cols: number;

  /**
   * @param opts.rows 상단 고정 행 수 / top-frozen row count
   * @param opts.cols 좌측 고정 컬럼 수 / left-frozen column count
   */
  constructor(opts: { rows: number; cols: number }) {
    this._rows = Math.max(0, Math.floor(opts.rows));
    this._cols = Math.max(0, Math.floor(opts.cols));
  }

  /** 상단 고정 행 수. / Top-frozen row count. */
  get rows(): number {
    return this._rows;
  }

  /** 좌측 고정 컬럼 수. / Left-frozen column count. */
  get cols(): number {
    return this._cols;
  }

  /** 어느 팬에 속하는가 — view/col 를 팬으로 분류. / Classify (view,col) into a pane. */
  paneOf(view: ViewIndex, col: LeafColIndex): PaneId {
    const topFrozen = view < this._rows;
    const leftFrozen = col < this._cols;
    if (topFrozen && leftFrozen) return 'frozen-corner';
    if (topFrozen) return 'frozen-top';
    if (leftFrozen) return 'frozen-left';
    return 'body';
  }

  /** 본문 스크롤에서 제외되는 상단 고정 높이. / Top-frozen height excluded from body scroll. */
  topOffset(rm: RowMetrics): Px {
    return rm.topOf(viewIndex(this._rows));
  }

  /** 본문 스크롤에서 제외되는 좌측 고정 폭. / Left-frozen width excluded from body scroll. */
  leftOffset(cm: ColumnMetrics): Px {
    return cm.leftOf(leafColIndex(this._cols));
  }
}
