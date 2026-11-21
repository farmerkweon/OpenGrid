// ============================================================
// 너비 조절 손잡이의 맞는 영역 판정 / Resize grip hit zone
// 컬럼 경계는 1px 선이라 정확히 잡기 어렵다. 경계 양쪽 몇 px 를 손잡이로 쳐 주면, 사용자가 조금 빗나가도
// 정렬 대신 너비 조절이 된다. 「이 점이 어느 컬럼의 손잡이인가」는 순수 계산이라 DOM·시계 없이 여기 둔다.
// 오른쪽 경계 쪽이면 그 컬럼, 왼쪽 경계 쪽이면 앞 컬럼(경계 어느 쪽을 잡아도 경계 왼쪽 컬럼이 끌린다).
//
// Column boundaries are 1px lines; treating a few px on both sides as the grip turns near-misses into resizes
// instead of sorts. Which column a point grips is pure math, so it lives here with no DOM or clock.
// Near the right edge → that column; near the left edge → the previous column (the column left of the boundary).
// ============================================================

/**
 * 경계에서 이 px 안쪽까지(양 끝 포함)를 손잡이로 친다.
 *
 * Points within this many px of a boundary (inclusive) count as the grip.
 */
export const RESIZE_HIT_HALF_PX = 6;

/**
 * 머리글 잎 칸 안의 한 점이 어느 컬럼의 손잡이에 드는지 판정한다(불변 값 — 칸마다 객체를 만들지 않으려고 그리드당 하나).
 *
 * Decides which column's grip a point inside a header leaf cell falls on (one immutable instance per grid).
 */
export class ResizeHitZone {
  constructor(private readonly _half: number = RESIZE_HIT_HALF_PX) {}

  /**
   * @param x 칸 왼쪽 끝에서 잰 점의 x(px) / x of the point from the cell's left edge
   * @param width 칸 폭(px) / cell width
   * @param leaf 칸의 잎 컬럼 번호 / leaf column index of the cell
   * @param canResize 그 컬럼을 끌 수 있나(손잡이가 있는 잎) / whether a column is resizable
   * @returns 끌 컬럼 번호, 손잡이가 아니면 −1 / column to resize, or −1
   */
  columnFor(x: number, width: number, leaf: number, canResize: (ci: number) => boolean): number {
    if (!Number.isFinite(x) || !Number.isFinite(width) || leaf < 0) return -1;
    const toRight = width - x;
    const nearRight = toRight >= -this._half && toRight <= this._half && canResize(leaf);
    const nearLeft = x >= -this._half && x <= this._half && leaf > 0 && canResize(leaf - 1);
    if (nearRight && nearLeft) return toRight <= x ? leaf : leaf - 1; // 아주 좁은 칸 — 더 가까운 경계
    if (nearRight) return leaf;
    if (nearLeft) return leaf - 1;
    return -1;
  }
}
