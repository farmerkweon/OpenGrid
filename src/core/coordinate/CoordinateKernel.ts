// ============================================================
// DD-02 §2.6 좌표 변환 전권 SSOT / DD-02 §2.6 coordinate authority kernel (Facade)
// 4좌표 사슬(model↔view↔pixel↔frozen↔merge)을 조립. 각 축 산술은 위임(SRP).
// 소비처는 placeCell/hitTest/snapshot/scrollTopFor 네 창구만 안다 → 자체 곱셈·누적 소멸.
// 순수 — DOM/window/canvas 미접근(REQ-TX-846 헤드리스).
// ============================================================
import {
  makeRange,
  makeRect,
  viewIndex,
  leafColIndex,
  px,
  type Px,
  type ViewIndex,
  type LeafColIndex,
  type ModelIndex,
  type IndexRange,
  type CellRect,
  type CellPlacement,
  type PaneId,
} from './types.js';
import type { RowMetrics } from './RowMetrics.js';
import type { ColumnMetrics } from './ColumnMetrics.js';
import type { ViewPermutation } from './ViewPermutation.js';
import type { FrozenPanes } from './FrozenPanes.js';
import type { NodeBudget } from './NodeBudget.js';
import type { IMergeSource, IWindowingPort } from './ports.js';

/** 한 프레임의 불변 좌표 스냅샷 — 소비처는 이것만 읽는다. / Immutable per-frame snapshot. */
export interface CoordinateSnapshot {
  readonly range: IndexRange;
  readonly colRange: { start: LeafColIndex; end: LeafColIndex };
  readonly offsetY: Px;
  readonly totalHeight: Px;
  readonly totalWidth: Px;
  readonly nodeBudget: { estimatedNodes: number; withinBudget: boolean };
  readonly clamped: { viewport: boolean; nodes: boolean };
}

/** 커널 조립 의존성. / Kernel assembly dependencies. */
export interface CoordinateKernelDeps {
  perm: ViewPermutation;
  rows: RowMetrics;
  cols: ColumnMetrics;
  frozen: FrozenPanes;
  merges: IMergeSource;
  budget: NodeBudget;
  /** 세로/가로 윈도 오버스캔(기본 = budget.overscan). / windowing overscan. */
  overscan?: number;
}

/**
 * 좌표 변환 전권 SSOT. 순수 함수 커널(전역 미접근).
 * / The coordinate authority. Pure kernel with no global access.
 */
export class CoordinateKernel implements IWindowingPort {
  private readonly perm: ViewPermutation;
  private readonly rows: RowMetrics;
  private readonly cols: ColumnMetrics;
  private readonly frozen: FrozenPanes;
  private readonly merges: IMergeSource;
  private readonly budget: NodeBudget;
  private readonly overscan: number;

  constructor(deps: CoordinateKernelDeps) {
    this.perm = deps.perm;
    this.rows = deps.rows;
    this.cols = deps.cols;
    this.frozen = deps.frozen;
    this.merges = deps.merges;
    this.budget = deps.budget;
    this.overscan = Math.max(0, Math.floor(deps.overscan ?? deps.budget.overscan));
  }

  // ── 순열: model ↔ view (§2.3 위임) ──
  /** v → m. / view → model. */
  toModel(v: ViewIndex): ModelIndex {
    return this.perm.toModel(v);
  }
  /** m → v(-1 = 소멸). / model → view (-1 if gone). */
  toView(m: ModelIndex): ViewIndex | -1 {
    return this.perm.toView(m);
  }

  // ── 배치: (view,col) → 완전 사각형(merge·frozen 반영) ──
  /** 셀 완전 배치 — 소비처 SSOT. / Full cell placement — consumer SSOT. */
  placeCell(view: ViewIndex, col: LeafColIndex): CellPlacement {
    const info = this.merges.isEmpty ? null : this.merges.getInfo(view, col);
    const rowSpan = info ? Math.max(1, info.rowSpan) : 1;
    const colSpan = info ? Math.max(1, info.colSpan) : 1;
    const hidden = info ? info.hidden : false;

    const x = this.cols.leftOf(col);
    const y = this.rows.topOf(view);
    let w: number = this.cols.widthOf(col);
    let h: number = this.rows.heightOf(view);

    for (let c = 1; c < colSpan; c++) w += this.cols.widthOf(leafColIndex(col + c));
    for (let r = 1; r < rowSpan; r++) h += this.rows.heightOf(viewIndex(view + r));

    return {
      view,
      col,
      rect: makeRect(x, y, w, h),
      pane: this.frozen.paneOf(view, col),
      rowSpan,
      colSpan,
      hidden,
    };
  }

  /** 셀 범위 사각형(frozen 경계 넘어도 콘텐츠 좌표 통합 사각형). / Rect covering an inclusive cell range. */
  rectOfRange(
    a: { view: ViewIndex; col: LeafColIndex },
    b: { view: ViewIndex; col: LeafColIndex }
  ): CellRect {
    const minView = viewIndex(Math.min(a.view, b.view));
    const maxView = viewIndex(Math.max(a.view, b.view));
    const minCol = leafColIndex(Math.min(a.col, b.col));
    const maxCol = leafColIndex(Math.max(a.col, b.col));

    const x = this.cols.leftOf(minCol);
    const y = this.rows.topOf(minView);
    const right = this.cols.leftOf(maxCol) + this.cols.widthOf(maxCol);
    const bottom = this.rows.topOf(maxView) + this.rows.heightOf(maxView);
    return makeRect(x, y, right - x, bottom - y);
  }

  // ── hitTest: pixel → (view,col) ──
  /** 픽셀 → (view,col,pane). 은폐 셀은 앵커로 흡수. / Pixel → cell; hidden cells resolve to anchor. */
  hitTest(x: Px, y: Px): { view: ViewIndex; col: LeafColIndex; pane: PaneId } | null {
    if (this.rows.total === 0 || this.cols.count === 0) return null;
    if (x < 0 || y < 0 || x >= this.cols.totalWidth() || y >= this.rows.totalHeight()) return null;

    let av = this.rows.indexAt(y);
    let ac = this.cols.colAt(x);

    if (!this.merges.isEmpty && this.merges.getInfo(av, ac)?.hidden) {
      // 은폐 셀이면 앵커로 역흡수: 스팬으로 (av,ac)를 덮는 비은폐 앵커를 위-왼쪽 방향으로 탐색.
      // 은폐 셀은 병합 스팬 내부라 앵커는 그 스팬 크기만큼만 떨어져 있다(지역 탐색).
      const cv = av;
      const cc = ac;
      outer: for (let ar = cv; ar >= 0; ar--) {
        for (let acol = cc; acol >= 0; acol--) {
          const info = this.merges.getInfo(viewIndex(ar), leafColIndex(acol));
          if (info && !info.hidden && ar + info.rowSpan > cv && acol + info.colSpan > cc) {
            av = viewIndex(ar);
            ac = leafColIndex(acol);
            break outer;
          }
        }
      }
    }

    return { view: av, col: ac, pane: this.frozen.paneOf(av, ac) };
  }

  // ── 윈도잉 포트(IWindowingPort) ──
  /** 세로 가시 view 범위(overscan 포함, 반열림). / Vertical visible range (overscan, half-open). */
  verticalWindow(scrollTop: Px, viewportH: Px): IndexRange {
    const total = this.rows.total;
    if (total === 0) return makeRange(0, 0);
    const first = this.rows.indexAt(scrollTop);
    const last = this.rows.indexAt(px(Math.max(0, scrollTop + viewportH)));
    const start = Math.max(0, first - this.overscan);
    const end = Math.min(total, last + this.overscan + 1);
    return makeRange(start, end);
  }

  /** 가로 가시 리프 컬럼 범위(overscan 포함, 반열림). / Horizontal visible range. */
  horizontalWindow(scrollLeft: Px, viewportW: Px): { start: LeafColIndex; end: LeafColIndex } {
    const count = this.cols.count;
    if (count === 0) return { start: leafColIndex(0), end: leafColIndex(0) };
    const first = this.cols.colAt(scrollLeft);
    const last = this.cols.colAt(px(Math.max(0, scrollLeft + viewportW)));
    const start = Math.max(0, first - this.overscan);
    const end = Math.min(count, last + this.overscan + 1);
    return { start: leafColIndex(start), end: leafColIndex(end) };
  }

  // ── 프레임 스냅샷 ──
  /** 뷰포트/노드예산/클램프 일괄 산출. / Compute range + budget + clamp in one shot. */
  snapshot(scroll: { top: Px; left: Px }, viewport: { h: Px; w: Px }): CoordinateSnapshot {
    // 방어: 뷰포트 높이 언바운드/0/무한이면 0 으로 취급(윈도 최소화) + clamped 신호.
    const vpH = Number.isFinite(viewport.h) && viewport.h > 0 ? viewport.h : 0;
    const vpW = Number.isFinite(viewport.w) && viewport.w > 0 ? viewport.w : 0;
    const viewportClamped = vpH !== viewport.h || vpW !== viewport.w;

    let vRange = this.verticalWindow(scroll.top, px(vpH));
    const hRange = this.horizontalWindow(scroll.left, px(vpW));

    const visibleRows = vRange.end - vRange.start;
    const visibleCols = hRange.end - hRange.start;
    const budgetEval = this.budget.evaluate({ visibleRows, visibleCols, overscanRows: 0 });

    if (!budgetEval.withinBudget && budgetEval.clampedRows !== undefined) {
      const clampedEnd = Math.min(this.rows.total, vRange.start + budgetEval.clampedRows);
      vRange = makeRange(vRange.start, clampedEnd);
    }

    return {
      range: vRange,
      colRange: hRange,
      offsetY: this.rows.topOf(vRange.start),
      totalHeight: this.rows.totalHeight(),
      totalWidth: this.cols.totalWidth(),
      nodeBudget: { estimatedNodes: budgetEval.estimatedNodes, withinBudget: budgetEval.withinBudget },
      clamped: { viewport: viewportClamped, nodes: !budgetEval.withinBudget },
    };
  }

  // ── 스크롤 타깃 산출(찾기-스크롤·scrollToRow 공통) ──
  /** 지정 view 가 보이도록 하는 scrollTop(이미 보이면 cur 유지). / scrollTop to reveal a view. */
  scrollTopFor(view: ViewIndex, viewportH: Px, cur: Px): Px {
    const top = this.rows.topOf(view);
    const bottom = top + this.rows.heightOf(view);
    if (top < cur) return px(top);
    if (bottom > cur + viewportH) return px(Math.max(0, bottom - viewportH));
    return cur;
  }
}
