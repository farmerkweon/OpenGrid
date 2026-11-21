// ============================================================
// 이벤트 대상 요소 → (행, 컬럼) / Event target → (row, column)
// 칸에 리스너를 붙이지 않고 본문 한 곳에서 받으려면, 대상 요소에서 어느 칸인지 거꾸로 찾는 길이 하나 있어야 한다.
// 칸 객체를 두지 않고 이미 그려 둔 aria-rowindex·aria-colindex 를 읽는다(행 밖에 붙는 세로 병합 마스터만 행 번호를
// 따로 기억 — DOM 에 속성을 더하지 않으려고).
//
// The only path from a target element to its cell. No cell objects: it reads the aria-rowindex/aria-colindex already
// painted; only row-spanning masters (outside any row) have their row index remembered separately, so no attribute is added.
// ============================================================

/**
 * 찾은 결과. 다음 호출 때 같은 객체를 다시 채우므로 받은 자리에서만 읽는다(마우스 이동마다 객체를 만들지 않으려고).
 *
 * The result; the same object is refilled on the next call, so read it on the spot (no object per mouse move).
 */
export interface BodyHit {
  /** 본문 바로 아래 요소(자료 행·묶음 행·세로 병합 마스터·디테일 패널 등). / Direct child of the body. */
  top: HTMLElement;
  /** 그 대상이 든 자료 칸(없으면 null — 여분 칸·자리채움·묶음 행·패널 등). / The data cell, or null. */
  cell: HTMLElement | null;
  /** 행 번호(자료 행·세로 병합 마스터일 때, 그 밖엔 -1). / Row index for data rows and masters, else -1. */
  ri: number;
  /** 컬럼 번호(칸일 때, 그 밖엔 -1). / Column index for cells, else -1. */
  ci: number;
}

function isDataCell(el: Element): boolean {
  return el.getAttribute('role') === 'gridcell';
}

/**
 * 본문 요소 하나에 대한 칸 찾기. 그 본문의 칸만 찾는다 — 디테일 패널 안에 든 다른 그리드의 칸은 이 본문의 칸이 아니다.
 *
 * Cell lookup for one body element; only this body's cells count (a grid nested in a detail panel is not this body).
 */
export class CellLocator {
  private readonly _hit: BodyHit = { top: null as unknown as HTMLElement, cell: null, ri: -1, ci: -1 };

  constructor(
    private readonly _body: HTMLElement,
    /** 행 밖에 붙은 세로 병합 마스터 칸 → 행 번호(그리는 쪽이 채운다). / Row-spanning master → row index (filled by the painter). */
    private readonly _masters: ReadonlyMap<HTMLElement, number>,
  ) {}

  /**
   * 대상이 이 본문 안이면 결과를, 밖이면 null. 칸은 「본문 바로 아래 행의 자식」이거나 「본문 바로 아래의 세로 병합 마스터」만이다.
   *
   * The hit when the target is inside this body, else null. A cell is either a child of a row directly under the body
   * or a row-spanning master directly under the body.
   */
  locate(target: EventTarget | null): BodyHit | null {
    let el: Element | null = target instanceof Element ? target : (target as Node | null)?.parentElement ?? null;
    let below: Element | null = null;
    while (el && el.parentElement !== this._body) {
      below = el;
      el = el.parentElement;
    }
    if (!el) return null;
    const h = this._hit;
    h.top = el as HTMLElement;
    h.cell = null;
    h.ri = -1;
    h.ci = -1;
    if (isDataCell(el)) {
      const ri = this._masters.get(el as HTMLElement);
      if (ri === undefined) return h;
      h.cell = el as HTMLElement;
      h.ri = ri;
    } else if (el.classList.contains('og-row')) {
      h.ri = Number(el.getAttribute('aria-rowindex')) - 1;
      if (below && isDataCell(below)) h.cell = below as HTMLElement;
    }
    if (h.cell) h.ci = Number(h.cell.getAttribute('aria-colindex')) - 1;
    return h;
  }
}
