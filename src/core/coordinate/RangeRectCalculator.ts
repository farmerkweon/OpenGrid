// ============================================================
// 범위 선택 테두리 좌표 — 칸 DOM 을 재지 않고 기하·행 번호로 / Range border rectangle from geometry
// 지금은 모서리 두 칸의 화면 사각형을 재서 테두리를 그린다. 그러면 모서리 칸이 화면 밖이라 DOM 에 없을 때
// 테두리가 사라지고, 잴 때마다 배치를 강제로 다시 하게 된다. 같은 값을 기하에서 계산하면 둘 다 없어진다.
// 좌표 뜻은 지금 테두리와 같다: 두 모서리 칸(시작 칸·끝 칸) 사각형의 합집합, 본문 스크롤 상자의 보이는 왼쪽 위 기준.
// 고정 컬럼 칸은 가로 스크롤을 타지 않으므로 그 자리(left)에 그대로 있다.
//
// Computes the range border from geometry instead of measuring the corner cells, so it works when a
// corner is not rendered and never forces layout. Same meaning as today: the union of
// the start and end corner cells, relative to the visible top-left of the body scroller; frozen
// columns ignore horizontal scroll.
// ============================================================
import { leafColIndex } from './types.js';
import type { CellRangeLike, IColumnGeometry, IRangeRectCalculator } from './geometryPorts.js';

export interface RangeRectOptions {
  /**
   * 행 아래 테두리 두께(px). 행은 border-box 라 칸 높이 = rowHeight − 이 값이고, 지금 테두리 높이도 그 칸 높이로 잰다(기본 1).
   *
   * Row bottom border thickness; cells are rowHeight minus this, and today's border is measured from cells (default 1).
   */
  rowBorderPx?: number;
}

/**
 * 범위 테두리 좌표를 기하·행 번호로 계산하는 곳. 상태가 없어 기하가 바뀌면 다음 호출에 그대로 반영된다.
 * 불변: 칸이 DOM 에 없어도 같은 좌표 · DOM 읽기 0.
 *
 * Stateless: geometry changes show up on the next call.
 */
export class RangeRectCalculator implements IRangeRectCalculator {
  private readonly _geometry: IColumnGeometry;
  private readonly _rowBorder: number;

  constructor(geometry: IColumnGeometry, opts?: RangeRectOptions) {
    this._geometry = geometry;
    this._rowBorder = opts?.rowBorderPx ?? 1;
  }

  /**
   * @param scroll 본문 상자의 scrollTop·scrollLeft / body scroller offsets
   * @param headerHeight top 에 더할 값. 본문 상자 기준이면 0, 컨테이너 기준이면 머리글 높이. / added to top
   */
  rect(
    range: CellRangeLike,
    scroll: { readonly top: number; readonly left: number },
    rowHeight: number,
    headerHeight: number,
  ): { left: number; top: number; width: number; height: number } {
    const a = this._cellX(range.startCol, scroll.left);
    const aw = this._geometry.widthOf(range.startCol);
    const b = this._cellX(range.endCol, scroll.left);
    const bw = this._geometry.widthOf(range.endCol);
    const left = Math.min(a, b);
    const right = Math.max(a + aw, b + bw);
    const r0 = Math.min(range.startRow, range.endRow);
    const r1 = Math.max(range.startRow, range.endRow);
    const top = headerHeight + r0 * rowHeight - scroll.top;
    const bottom = headerHeight + r1 * rowHeight + rowHeight - this._rowBorder - scroll.top;
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  /** 칸 하나의 보이는 x. 고정 컬럼은 sticky 라 스크롤을 안 탄다. */
  private _cellX(ci: number, scrollLeft: number): number {
    const c = leafColIndex(ci);
    const x = this._geometry.leftOf(c);
    return ci < this._geometry.frozenCount ? x : x - scrollLeft;
  }
}
