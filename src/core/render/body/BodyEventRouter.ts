// ============================================================
// 본문 마우스 이벤트 위임 / Body mouse-event delegation
// 예전에는 칸마다 리스너 일곱 개와 행마다 click 리스너를 붙였다 — 칸 50 × 행 수십이면 그릴 때마다 리스너 수천 개를
// 붙였다 떼었다. 본문 요소 하나에 종류마다 하나씩만 두고, 대상 요소에서 칸을 찾아 같은 콜백을 같은 인자로 부른다.
// 지켜야 할 옛 뜻:
// - 칸에서 난 이벤트는 칸 콜백을 부르고 위로 올라가지 않는다(옛 칸 리스너의 stopPropagation). 본문에서 막으므로
//   본문 바깥 부모가 받지 않는 것은 같다.
// - 자료 행의 여분 칸·병합 자리채움 등 칸 아닌 곳의 click 은 행 click(컬럼 -1)이고 위로 올라간다.
// - 묶음 행 click 은 그 묶음을 펴고 접고 위로 올라간다.
// - 들고-나기(over/out)는 칸 단위: 같은 칸 안 자식 사이를 옮겨 다닐 때는 부르지 않는다.
//
// One listener per event type on the body instead of seven per cell plus one per row. Kept semantics: events from a
// cell call the cell callback and stop there (the old per-cell stopPropagation); clicks on non-cell parts of a data row
// are row clicks (column -1) and keep bubbling; group-row clicks toggle the group and keep bubbling; over/out are per
// cell, so moving between children of the same cell does not fire.
// ============================================================
import type { RendererCallbacks } from '../../GridRenderer.js';
import type { CellLocator } from './CellLocator.js';

/**
 * 칸 콜백 말고 본문 뷰가 직접 아는 일 두 가지(묶음 행·나무 아이콘). 뷰가 그릴 때 기억해 둔 요소로 판단한다.
 *
 * The two things only the body view knows (group rows and tree icons), judged by elements it remembered while painting.
 */
export interface BodyEventHooks {
  /** 칸도 자료 행도 아닌 본문 바로 아래 요소의 click(묶음 행이면 펴고 접는다). / Click on a non-data top element. */
  otherRowClick(top: HTMLElement): void;
  /** 대상이 이 본문의 나무 펼침 아이콘이면 펴고 접고 true. / Toggles and returns true when the target is a tree icon. */
  treeToggle(target: EventTarget | null): boolean;
}

/**
 * 이벤트 종류 → 칸 콜백 이름. 칸에서 난 것만 부르고 거기서 멈춘다(click·들고-나기·keydown 은 따로).
 *
 * Event type → cell callback name; called only for cell events, which stop there (click, enter/leave, keydown differ).
 */
const CELL_ONLY: Readonly<Record<string, 'onCellDblClick' | 'onCellMouseDown' | 'onCellMouseUp' | 'onCellMouseMove'>> = {
  dblclick: 'onCellDblClick', mousedown: 'onCellMouseDown', mouseup: 'onCellMouseUp', mousemove: 'onCellMouseMove',
};
const ENTER_LEAVE: Readonly<Record<string, 'onCellMouseOver' | 'onCellMouseOut'>> = {
  mouseover: 'onCellMouseOver', mouseout: 'onCellMouseOut',
};
/** 본문에 붙이는 종류(마우스 일곱 + 나무 아이콘 Enter/Space). / Types listened on the body. */
const TYPES = ['click', 'dblclick', 'mouseover', 'mouseout', 'mousedown', 'mouseup', 'mousemove', 'keydown'] as const;

/**
 * 본문 요소 하나의 마우스 이벤트를 받아 칸·행 콜백으로 바꿔 넘긴다. 리스너 함수를 종류마다 만들지 않고 이 객체 하나를
 * 리스너로 붙인다(handleEvent).
 *
 * Receives the body's mouse events and forwards them as cell/row callbacks; this object itself is the listener
 * (handleEvent), so no function per type is created.
 */
export class BodyEventRouter implements EventListenerObject {
  /**
   * 마지막으로 누른 칸과 그 (행, 컬럼). 칸 click 은 본문을 다시 그리게 하므로, 브라우저는 dblclick 을 둘째 click 이 떨어진
   * (그 click 의 다시 그리기로 이제 떼어진) 칸 쪽으로 보낸다 — 본문에 붙인 듣개에는 닿지 않는다. 그래서 click 마다 누른 칸 하나에만
   * dblclick 듣개를 옮겨 걸고, 그 칸이 dblclick 을 받았는데 이미 떼어져 있으면·창에서 나가면·지우기 때 놓는다(늘 많아야 하나).
   *
   * The last clicked cell and its (row, column). A cell click repaints the body, so the browser sends dblclick toward the
   * cell the second click landed on (now detached by that click's repaint), never reaching the body listener. Each click
   * moves a dblclick listener to the clicked cell; it is dropped once that cell got its dblclick while detached, when the
   * cell leaves the window, or on destroy (at most one at a time).
   */
  private _armed: HTMLElement | null = null;
  private _armedRi = -1;
  private _armedCi = -1;
  /** 걸어 둔 칸이 받은 dblclick — 같은 사건이 본문까지 올라오면 두 번 부르지 않게 기억한다. / Remembered so the body path skips it. */
  private _armedEvent: Event | null = null;
  private readonly _onArmedDbl = (e: Event): void => {
    const cell = this._armed;
    this._armedEvent = e;
    this._cbs.onCellDblClick(this._armedRi, this._armedCi, e as MouseEvent);
    // 떼어진 칸은 사건이 본문까지 안 오므로 여기서 놓는다 — 붙어 있으면 본문 길이 거르며 놓는다(남으면 한 작업 뒤 놓음).
    // A detached cell never bubbles to the body, so release here; an attached one is released by the body path (or after a task).
    if (cell && !cell.isConnected && this._armed === cell) this._arm(null, -1, -1);
    setTimeout(() => { if (this._armedEvent === e) this._armedEvent = null; }, 0);
  };

  constructor(
    private readonly _body: HTMLElement,
    private readonly _locator: CellLocator,
    private readonly _cbs: RendererCallbacks,
    private readonly _hooks: BodyEventHooks,
  ) {
    for (const t of TYPES) _body.addEventListener(t, this);
  }

  /**
   * 리스너를 모두 뗀다(그리드를 지울 때).
   *
   * Removes all listeners (when the grid is destroyed).
   */
  destroy(): void {
    for (const t of TYPES) this._body.removeEventListener(t, this);
    this._arm(null, -1, -1);
    this._armedEvent = null;
  }

  /**
   * 그 칸이 본문에서 떨어져 나갈 때(창에서 나감) 걸어 둔 dblclick 듣개를 푼다 — 떼어 낸 칸이 듣개를 붙든 채 남지 않게.
   *
   * Drops the armed dblclick listener when that cell leaves the body (window shift), so no detached cell keeps it.
   */
  forget(cell: HTMLElement): void {
    if (this._armed === cell) this._arm(null, -1, -1);
  }

  /** 누른 칸 하나에만 dblclick 듣개를 건다(옛 칸에서는 뗀다). / Keep the dblclick listener on the clicked cell only. */
  private _arm(cell: HTMLElement | null, ri: number, ci: number): void {
    if (this._armed !== cell) {
      this._armed?.removeEventListener('dblclick', this._onArmedDbl);
      cell?.addEventListener('dblclick', this._onArmedDbl);
      this._armed = cell;
    }
    this._armedRi = ri;
    this._armedCi = ci;
  }

  handleEvent(e: Event): void {
    const type = e.type;
    if (type === 'keydown') {
      const k = (e as KeyboardEvent).key;
      if ((k === 'Enter' || k === ' ') && this._hooks.treeToggle(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    // 나무 아이콘 누르기는 칸 click 이 아니다(옛 아이콘 리스너가 전파를 막고 펴고 접었다).
    // A tree-icon click is not a cell click (the old icon listener stopped propagation and toggled).
    if (type === 'click' && this._hooks.treeToggle(e.target)) { e.stopPropagation(); return; }
    const h = this._locator.locate(e.target);
    if (!h) return;
    const me = e as MouseEvent;
    if (!h.cell) {
      // 칸 밖: click 만 행 click(자료 행이면 컬럼 -1, 그 밖은 묶음 행 등) — 위로 올라간다.
      // Outside a cell only click matters (row click, or group row etc.) and it keeps bubbling.
      if (type !== 'click') return;
      if (h.ri >= 0) this._cbs.onCellClick(h.ri, -1, me);
      else this._hooks.otherRowClick(h.top);
      return;
    }
    e.stopPropagation();
    if (type === 'click') {
      // 콜백(다시 그리기를 부를 수 있음)보다 먼저 건다 — 그래야 떼어 낸 뒤에도 그 칸이 dblclick 을 받는다.
      // Arm before the callback (which may repaint) so the cell still receives dblclick after being detached.
      this._arm(h.cell, h.ri, h.ci);
      this._cbs.onCellClick(h.ri, h.ci, me);
      return;
    }
    // 걸어 둔 칸이 이미 받은 dblclick(칸이 그대로 붙어 있어 본문까지 올라온 것)은 두 번 부르지 않는다.
    // A dblclick already handled by the armed cell (it stayed attached and bubbled here) is not called twice.
    if (type === 'dblclick' && e === this._armedEvent) { this._armedEvent = null; return; }
    const el = ENTER_LEAVE[type];
    if (el) {
      // 들고-나기는 칸 단위 — 상대 요소가 같은 칸 안이면(자식 사이 이동) 부르지 않는다.
      // Enter/leave per cell — not fired when the related element is inside the same cell.
      const rel = me.relatedTarget;
      if (!(rel instanceof Node && h.cell.contains(rel))) this._cbs[el](h.ri, h.ci, me);
      return;
    }
    const key = CELL_ONLY[type];
    if (key) this._cbs[key](h.ri, h.ci, me);
  }
}
