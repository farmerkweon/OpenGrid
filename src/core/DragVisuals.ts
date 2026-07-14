// ============================================================
// 드래그 시각 요소 — 고스트(따라다니는 점선 박스) + 드롭 인디케이터(라인)
// RowDragDrop 에서 분리해 단일 책임으로 캡슐화한다.
// / Drag visuals — ghost (dashed box following the cursor) + drop indicator (line).
//   Split out of RowDragDrop and encapsulated with a single responsibility.
// ============================================================

// i18n: DragGhost 는 RowDragDrop 이 인스턴스 컨텍스트 없이 생성하는 순수 시각 헬퍼라
//   per-instance 로케일 경로가 없다 → 전역 t 로 해석(설계 §3 헬퍼 예외, 전역 활성 로케일).
// / DragGhost is a pure visual helper created by RowDragDrop without instance context,
//   so it has no per-instance locale path → resolve via the global t (design §3 helper
//   exception, global active locale).
import { t } from './i18n/LocaleRegistry.js';

/**
 * 커서를 따라다니는 점선 고스트. transform 으로 X·Y 모두 이동(부드럽게).
 * / Dashed ghost that follows the cursor. Moves on both X and Y via transform (smoothly).
 *
 * @param rect - 잡은 행의 화면 사각형(위치·크기 기준) / Screen rect of the grabbed row (position/size basis)
 * @param grabX - 잡은 시점의 커서 X(clientX) / Cursor X at grab time (clientX)
 * @param grabY - 잡은 시점의 커서 Y(clientY) / Cursor Y at grab time (clientY)
 * @param count - 함께 드래그하는 행 수(2 이상이면 배지 표시) / Number of rows dragged together (badge shown when > 1)
 */
export class DragGhost {
  private _el: HTMLElement;
  private _dx: number;   // grab 지점의 좌측 오프셋 / left offset of the grab point
  private _dy: number;   // grab 지점의 상단 오프셋 / top offset of the grab point

  constructor(rect: DOMRect, grabX: number, grabY: number, count: number) {
    this._dx = grabX - rect.left;
    this._dy = grabY - rect.top;

    const el = document.createElement('div');
    el.className = 'og-drag-ghost';
    el.style.cssText =
      `position:fixed;left:0;top:0;width:${rect.width}px;height:${Math.min(rect.height, 40)}px;` +
      `transform:translate(${rect.left}px,${rect.top}px);` +
      'background:rgba(25,118,210,0.12);border:2px dashed #1976d2;box-sizing:border-box;' +
      'pointer-events:none;z-index:10000;border-radius:3px;opacity:0.92;' +
      'display:flex;align-items:center;padding-left:10px;font-size:12px;color:#1565c0;font-weight:600;' +
      'white-space:nowrap;overflow:hidden;';
    if (count > 1) el.textContent = t('drag.rowCount', { count });
    document.body.appendChild(el);
    this._el = el;
  }

  /**
   * 커서 위치로 이동 (grab 오프셋 유지).
   * / Move to the cursor position (keeping the grab offset).
   *
   * @param clientX - 현재 커서 X(clientX) / Current cursor X (clientX)
   * @param clientY - 현재 커서 Y(clientY) / Current cursor Y (clientY)
   */
  move(clientX: number, clientY: number): void {
    this._el.style.transform = `translate(${clientX - this._dx}px,${clientY - this._dy}px)`;
  }

  /** 고스트 요소를 DOM 에서 제거한다. / Remove the ghost element from the DOM. */
  destroy(): void { this._el.remove(); }
}

/**
 * 드롭(삽입) 위치 마커. 행과 행 사이 경계에 "▶━━━◀" 형태로 또렷하게 표시해
 * "여기에 삽입됩니다 / 지금 버튼을 떼면 됩니다" 를 직관적으로 알린다(문서 편집기 표 삽입 표시 느낌).
 * 자기 그리드/타깃 그리드 모두에 재사용.
 * / Drop (insertion) position marker. Rendered crisply as "▶━━━◀" on the boundary between two
 *   rows so the user intuitively sees "it will be inserted here / release the button now"
 *   (like an inline table-insertion marker in a document editor). Reused for both the source
 *   grid and target grids.
 *
 * @param color - 마커 색(자기=파랑, 크로스=초록 등 구분용) / Marker color (e.g. blue for self, green for cross)
 */
export class DropIndicator {
  private _el: HTMLElement;

  constructor(color = '#1976d2') {
    const el = document.createElement('div');
    el.className = 'og-drop-indicator';
    // 경계(top) 중앙에 마커가 오도록 translateY(-50%)
    // / translateY(-50%) so the marker centers on the boundary (top)
    el.style.cssText =
      'position:absolute;left:0;right:0;display:none;align-items:center;' +
      'pointer-events:none;z-index:9998;transform:translateY(-50%);';

    const cap = (dir: 'left' | 'right'): HTMLElement => {
      const c = document.createElement('div');
      const side = dir === 'left' ? `border-left:7px solid ${color}` : `border-right:7px solid ${color}`;
      c.style.cssText =
        `width:0;height:0;flex-shrink:0;border-top:5px solid transparent;border-bottom:5px solid transparent;${side};`;
      return c;
    };
    const bar = document.createElement('div');
    bar.style.cssText =
      `flex:1;height:3px;background:${color};border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.7);`;

    el.append(cap('left'), bar, cap('right'));   // ▶━━━◀
    this._el = el;
  }

  /**
   * parent(그리드 바디) 안의 top(행 경계) 위치에 표시.
   * / Show at the given top (row boundary) position inside parent (the grid body).
   *
   * @param parent - 마커를 붙일 컨테이너(그리드 바디) / Container to attach the marker to (grid body)
   * @param top - parent 기준 세로 위치(px, 행 경계) / Vertical position relative to parent (px, row boundary)
   */
  showIn(parent: HTMLElement, top: number): void {
    if (this._el.parentElement !== parent) {
      this._el.remove();
      parent.appendChild(this._el);
    }
    this._el.style.display = 'flex';
    this._el.style.top = `${top}px`;
  }

  /** 마커를 숨긴다(요소는 유지). / Hide the marker (element is kept). */
  hide(): void { this._el.style.display = 'none'; }

  /** 마커 요소를 DOM 에서 제거한다. / Remove the marker element from the DOM. */
  destroy(): void { this._el.remove(); }
}
