import { DragGhost, DropIndicator } from './DragVisuals.js';

export type RowDropCallback = (fromIndex: number, toIndex: number) => void;

/** 커서 좌표로 다른 그리드의 바디를 찾는 해석기 */
export interface CrossGridResolveResult {
  bodyEl: HTMLElement;
  rowHeight: number;
  totalRows: number;
}
export interface CrossGridConfig {
  /** 커서 위치(x,y)에 있는 다른(crossGrid 허용) 그리드 바디 정보 반환. 없으면 null */
  resolveTarget: (clientX: number, clientY: number) => CrossGridResolveResult | null;
  /** 다른 그리드로 드롭됐을 때 호출 (소스 fromIndex, 타깃 바디, 타깃 삽입 인덱스) */
  onCrossDrop: (fromIndex: number, targetBodyEl: HTMLElement, targetIndex: number) => void;
}

interface DragState {
  fromIndex: number;
  bodyEl: HTMLElement;
  rowHeight: number;
  totalRows: number;
  ghost: DragGhost;
  currentTarget: number;
  /** 현재 커서가 올라가 있는 다른 그리드 (없으면 null = 자기 그리드 내 재정렬) */
  crossTarget: { bodyEl: HTMLElement; index: number } | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 행 드래그앤드롭 관리자 (순수 DnD).
 * 행 DOM에 드래그 핸들을 심고, 고스트/인디케이터로 위치를 표시한 뒤 콜백으로 알림.
 * 그리드 간 이동 판정(타깃 그리드 해석)은 주입된 CrossGridConfig 에 위임한다.
 */
export class RowDragDrop {
  private _drag: DragState | null = null;
  private readonly _selfIndicator = new DropIndicator('#1976d2');   // 자기 그리드 재정렬
  private readonly _crossIndicator = new DropIndicator('#2e7d32');  // 다른 그리드 드롭

  constructor(
    private _bodyEl: HTMLElement,
    private _rowHeight: number,
    private _onDrop: RowDropCallback,
    private _cross: CrossGridConfig | null = null,
    /** fromIndex 기준 함께 드래그할 행 수(멀티행 배지용). 기본 1 */
    private _getDragCount: (fromIndex: number) => number = () => 1,
  ) {
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp   = this._onMouseUp.bind(this);
  }

  /** 행 엘리먼트에 드래그 핸들 삽입 */
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
    document.addEventListener('mousemove', this._onMouseMove, true);
    document.addEventListener('mouseup', this._onMouseUp, true);
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this._drag) return;
    const d = this._drag;

    // 고스트가 커서를 X·Y 모두 따라간다 (다른 그리드로 끌어도 끊기지 않음)
    d.ghost.move(e.clientX, e.clientY);

    // ── 크로스그리드: 커서가 다른 그리드 위에 있는지 ──
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

    // ── 자기 그리드 내 재정렬 ──
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

    // 모든 드래그 잔상 제거
    ghost.destroy();
    this._selfIndicator.hide();
    this._crossIndicator.hide();

    if (crossTarget && this._cross) {
      this._cross.onCrossDrop(fromIndex, crossTarget.bodyEl, crossTarget.index);
    } else if (fromIndex !== currentTarget) {
      this._onDrop(fromIndex, currentTarget);
    }
  }

  destroy(): void {
    document.removeEventListener('mousemove', this._onMouseMove, true);
    document.removeEventListener('mouseup', this._onMouseUp, true);
    this._drag?.ghost.destroy();
    this._selfIndicator.destroy();
    this._crossIndicator.destroy();
    this._drag = null;
  }
}
