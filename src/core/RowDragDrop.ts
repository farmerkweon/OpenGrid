import { DragGhost, DropIndicator } from './DragVisuals.js';

/**
 * 행 재정렬이 확정됐을 때 호출되는 콜백. / Callback fired when a row reorder is committed.
 *
 * @param fromIndex - 이동 전 행의 flat index / Flat index of the row before the move
 * @param toIndex - 이동 후 삽입 위치 flat index / Flat index of the insertion position after the move
 */
export type RowDropCallback = (fromIndex: number, toIndex: number) => void;

/** 커서 좌표로 다른 그리드의 바디를 찾는 해석기의 결과. / Result of resolving another grid's body from cursor coordinates. */
export interface CrossGridResolveResult {
  /** 대상 그리드의 바디 요소. / Body element of the target grid. */
  bodyEl: HTMLElement;
  /** 대상 그리드의 행 높이(px). / Row height of the target grid (px). */
  rowHeight: number;
  /** 대상 그리드의 전체 행 수. / Total number of rows in the target grid. */
  totalRows: number;
}
/**
 * 그리드 간 드래그(crossGrid) 판정을 주입하는 설정.
 * / Configuration that injects cross-grid drag resolution.
 */
export interface CrossGridConfig {
  /**
   * 커서 위치(x,y)에 있는 다른(crossGrid 허용) 그리드 바디 정보 반환. 없으면 null.
   * / Return the body info of another (crossGrid-enabled) grid at cursor position (x,y); null if none.
   *
   * @param clientX - 커서 X(clientX) / Cursor X (clientX)
   * @param clientY - 커서 Y(clientY) / Cursor Y (clientY)
   * @returns 대상 그리드 정보 또는 null / Target grid info, or null
   */
  resolveTarget: (clientX: number, clientY: number) => CrossGridResolveResult | null;
  /**
   * 다른 그리드로 드롭됐을 때 호출 (소스 fromIndex, 타깃 바디, 타깃 삽입 인덱스).
   * / Called when dropped onto another grid (source fromIndex, target body, target insertion index).
   *
   * @param fromIndex - 소스 그리드에서의 행 flat index / Row flat index in the source grid
   * @param targetBodyEl - 드롭 대상 그리드의 바디 / Body of the drop target grid
   * @param targetIndex - 대상 그리드의 삽입 인덱스 / Insertion index in the target grid
   */
  onCrossDrop: (fromIndex: number, targetBodyEl: HTMLElement, targetIndex: number) => void;
}

/** 진행 중인 드래그의 내부 상태. / Internal state of an in-progress drag. */
interface DragState {
  fromIndex: number;
  bodyEl: HTMLElement;
  rowHeight: number;
  totalRows: number;
  ghost: DragGhost;
  currentTarget: number;
  /**
   * 현재 커서가 올라가 있는 다른 그리드 (없으면 null = 자기 그리드 내 재정렬).
   * / The other grid the cursor is currently over (null = reorder within the source grid).
   */
  crossTarget: { bodyEl: HTMLElement; index: number } | null;
}

/** 값을 [lo, hi] 범위로 클램프. / Clamp a value into the [lo, hi] range. */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 행 드래그앤드롭 관리자 (순수 DnD).
 * 행 DOM에 드래그 핸들을 심고, 고스트/인디케이터로 위치를 표시한 뒤 콜백으로 알림.
 * 그리드 간 이동 판정(타깃 그리드 해석)은 주입된 CrossGridConfig 에 위임한다.
 * / Row drag-and-drop manager (pure DnD).
 *   Plants a drag handle into row DOM, shows position via ghost/indicator, then notifies through
 *   callbacks. Cross-grid move resolution (target grid lookup) is delegated to the injected
 *   CrossGridConfig.
 *
 * @param _bodyEl - 이 관리자가 담당하는 그리드 바디 / Grid body this manager owns
 * @param _rowHeight - 행 높이(px) / Row height (px)
 * @param _onDrop - 자기 그리드 내 재정렬 확정 콜백 / Callback for a committed in-grid reorder
 * @param _cross - 그리드 간 드래그 설정(없으면 자기 그리드 내로 제한) / Cross-grid config (null limits to in-grid)
 * @param _getDragCount - fromIndex 기준 함께 드래그할 행 수 계산기(멀티행 배지용) / Computes rows dragged together from fromIndex (for the multi-row badge)
 */
export class RowDragDrop {
  private _drag: DragState | null = null;
  private readonly _selfIndicator = new DropIndicator('#1976d2');   // 자기 그리드 재정렬 / in-grid reorder
  private readonly _crossIndicator = new DropIndicator('#2e7d32');  // 다른 그리드 드롭 / cross-grid drop

  constructor(
    private _bodyEl: HTMLElement,
    private _rowHeight: number,
    private _onDrop: RowDropCallback,
    private _cross: CrossGridConfig | null = null,
    /** fromIndex 기준 함께 드래그할 행 수(멀티행 배지용). 기본 1 / Rows dragged together from fromIndex (multi-row badge). Default 1 */
    private _getDragCount: (fromIndex: number) => number = () => 1,
  ) {
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp   = this._onMouseUp.bind(this);
  }

  /**
   * 행 엘리먼트에 드래그 핸들 삽입.
   * / Insert a drag handle into a row element.
   *
   * @param rowEl - 핸들을 붙일 행 요소 / Row element to attach the handle to
   * @param rowIndex - 해당 행의 flat index / Flat index of that row
   * @param totalRows - 현재 전체 행 수(경계 클램프용) / Current total row count (for boundary clamping)
   * @returns 생성된 드래그 핸들 요소 / The created drag handle element
   */
  attachHandle(rowEl: HTMLElement, rowIndex: number, totalRows: number): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'og-drag-handle';
    handle.innerHTML = '⠿';
    handle.style.cssText = `
      width:18px;min-width:18px;height:100%;
      display:flex;align-items:center;justify-content:center;
      cursor:grab;font-size:14px;color:#bbb;flex-shrink:0;
      user-select:none;border-right:1px solid var(--og-border-color,#e0e0e0);
    `;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._startDrag(e, rowEl, rowIndex, totalRows);
    });
    return handle;
  }

  private _startDrag(e: MouseEvent, rowEl: HTMLElement, fromIndex: number, totalRows: number): void {
    const rect = rowEl.getBoundingClientRect();
    const count = this._getDragCount(fromIndex);
    this._drag = {
      fromIndex,
      bodyEl: this._bodyEl,
      rowHeight: this._rowHeight,
      totalRows,
      ghost: new DragGhost(rect, e.clientX, e.clientY, count),
      currentTarget: fromIndex,
      crossTarget: null,
    };
    // 캡처 단계로 등록 — 바디 셀이 mousemove/mouseup 에서 stopPropagation 해도
    // (버블 단계 차단) 드래그 추적/종료가 항상 동작하게 한다.
    // / Register on the capture phase so drag tracking/end always run even if body cells
    //   stopPropagation on mousemove/mouseup (which blocks the bubble phase).
    document.addEventListener('mousemove', this._onMouseMove, true);
    document.addEventListener('mouseup', this._onMouseUp, true);
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this._drag) return;
    const d = this._drag;

    // 고스트가 커서를 X·Y 모두 따라간다 (다른 그리드로 끌어도 끊기지 않음)
    // / The ghost follows the cursor on both X and Y (stays continuous even when dragged to another grid)
    d.ghost.move(e.clientX, e.clientY);

    // ── 크로스그리드: 커서가 다른 그리드 위에 있는지 ── / cross-grid: is the cursor over another grid?
    if (this._cross) {
      const hit = this._cross.resolveTarget(e.clientX, e.clientY);
      if (hit && hit.bodyEl !== d.bodyEl) {
        const tRect = hit.bodyEl.getBoundingClientRect();
        const tRelY = e.clientY - tRect.top + hit.bodyEl.scrollTop;
        const tIdx = clamp(Math.round(tRelY / hit.rowHeight), 0, hit.totalRows);
        d.crossTarget = { bodyEl: hit.bodyEl, index: tIdx };
        this._selfIndicator.hide();
        this._crossIndicator.showIn(hit.bodyEl, tIdx * hit.rowHeight);
        return;
      }
    }

    // ── 자기 그리드 내 재정렬 ── / reorder within the source grid
    d.crossTarget = null;
    this._crossIndicator.hide();
    const bodyRect = d.bodyEl.getBoundingClientRect();
    const relY = e.clientY - bodyRect.top + d.bodyEl.scrollTop;
    d.currentTarget = clamp(Math.round(relY / d.rowHeight), 0, d.totalRows - 1);
    this._selfIndicator.showIn(d.bodyEl, d.currentTarget * d.rowHeight);
  }

  private _onMouseUp(_e: MouseEvent): void {
    document.removeEventListener('mousemove', this._onMouseMove, true);
    document.removeEventListener('mouseup', this._onMouseUp, true);

    if (!this._drag) return;
    const { fromIndex, currentTarget, ghost, crossTarget } = this._drag;
    this._drag = null;

    // 모든 드래그 잔상 제거 / clear all drag residue
    ghost.destroy();
    this._selfIndicator.hide();
    this._crossIndicator.hide();

    if (crossTarget && this._cross) {
      this._cross.onCrossDrop(fromIndex, crossTarget.bodyEl, crossTarget.index);
    } else if (fromIndex !== currentTarget) {
      this._onDrop(fromIndex, currentTarget);
    }
  }

  /** 전역 리스너 해제 + 진행 중 드래그/인디케이터 정리. / Detach global listeners + clean up any in-progress drag/indicators. */
  destroy(): void {
    document.removeEventListener('mousemove', this._onMouseMove, true);
    document.removeEventListener('mouseup', this._onMouseUp, true);
    this._drag?.ghost.destroy();
    this._selfIndicator.destroy();
    this._crossIndicator.destroy();
    this._drag = null;
  }
}
