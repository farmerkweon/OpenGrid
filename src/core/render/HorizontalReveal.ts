// ============================================================
// 「이 컬럼이 보이게」 가로로 옮기는 객체 / Horizontal reveal
// 가로 가상화가 켜지면 화면 밖 컬럼은 칸 요소가 없다 — 칸을 찾아 scrollIntoView 하는 길이 통하지 않는다.
// 그래서 목표 위치를 컬럼 기하에서 계산하고, 본문 가로 위치는 스크롤 관찰 객체에 맡겨 옮긴다(DOM 읽기 0 —
// 보이는 상자 크기·지금 위치도 그 객체가 이미 들고 있는 값을 읽는다).
// 고정 컬럼 구역은 가로 스크롤을 타지 않으므로, 옮긴 컬럼이 그 뒤에 가리지 않게 고정 구역 오른쪽 끝을 왼쪽 경계로 본다.
//
// With horizontal virtualization, off-screen columns have no cell elements, so scrollIntoView on a cell no longer works.
// The target position is computed from the column geometry and the move is delegated to the scroll observer (no DOM
// reads — the viewport box and current offset come from that observer). Frozen columns do not scroll, so the frozen
// zone's right edge is the left limit to avoid hiding the column behind it.
// ============================================================
import { leafColIndex } from '../coordinate/types.js';
import type { IColumnGeometry, ViewportBox } from '../coordinate/geometryPorts.js';
import type { IHorizontalReveal } from './ports.js';

/** 옮기기에 필요한 스크롤 쪽(스크롤 관찰 객체가 구현). / The scroll side needed to move (implemented by the scroll observer). */
export interface RevealScroll {
  readonly box: ViewportBox;
  scrollLeftTo(x: number): void;
}

/**
 * 컬럼 하나가 보이도록 가로 위치를 정하는 곳. 상태 없음(기하·상자는 부를 때마다 묻는다).
 *
 * Decides the horizontal offset that reveals one column. Stateless (geometry and box are asked per call).
 */
export class HorizontalReveal implements IHorizontalReveal {
  constructor(
    private readonly _scroll: RevealScroll,
    private readonly _geometry: IColumnGeometry,
  ) {}

  revealColumn(ci: number): void {
    this.reveal(ci);
  }

  /**
   * 컬럼 ci 가 보이게 옮기고 새 scrollLeft 를 돌려준다. 이미 보이거나(고정 컬럼 포함) 보이는 폭을 모르면 null(안 옮김).
   * 컬럼이 보이는 폭보다 넓으면 왼쪽 끝을 맞춘다.
   *
   * Moves so column ci is visible and returns the new scrollLeft; null when already visible (frozen included) or the
   * viewport width is unknown. A column wider than the viewport is aligned to its left edge.
   */
  reveal(ci: number): number | null {
    const g = this._geometry;
    if (!Number.isInteger(ci) || ci < 0 || ci >= g.count || ci < g.frozenCount) return null;
    const { scrollLeft, width } = this._scroll.box;
    if (!(width > 0)) return null;
    const c = leafColIndex(ci);
    const left = g.leftOf(c);
    const right = left + g.widthOf(c);
    // 고정 컬럼이 있으면 여분 칸과 고정 칸이 화면 왼쪽에 붙어 있다 — 그 오른쪽 끝까지는 가려지는 자리.
    const hidden = g.frozenCount > 0 ? g.frozenRight() : 0;
    const viewLeft = scrollLeft + hidden;
    const viewRight = scrollLeft + width;
    let target: number;
    if (left < viewLeft || right - left > width - hidden) target = left - hidden;
    else if (right > viewRight) target = right - width;
    else return null;
    const max = Math.max(0, g.totalWidth() - width);
    target = Math.min(max, Math.max(0, target));
    if (target === scrollLeft) return null;
    this._scroll.scrollLeftTo(target);
    return target;
  }
}
