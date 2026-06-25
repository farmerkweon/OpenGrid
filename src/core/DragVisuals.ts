// ============================================================
// 드래그 시각 요소 — 고스트(따라다니는 점선 박스) + 드롭 인디케이터(라인)
// RowDragDrop 에서 분리해 단일 책임으로 캡슐화한다.
// ============================================================

/** 커서를 따라다니는 점선 고스트. transform 으로 X·Y 모두 이동(부드럽게). */
export class DragGhost {
  private _el: HTMLElement;
  private _dx: number;   // grab 지점의 좌측 오프셋
  private _dy: number;   // grab 지점의 상단 오프셋

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
    if (count > 1) el.textContent = `${count}개 행 이동`;
    document.body.appendChild(el);
    this._el = el;
  }

  /** 커서 위치로 이동 (grab 오프셋 유지) */
  move(clientX: number, clientY: number): void {
    this._el.style.transform = `translate(${clientX - this._dx}px,${clientY - this._dy}px)`;
  }

  destroy(): void { this._el.remove(); }
}

/**
 * 드롭(삽입) 위치 마커. 행과 행 사이 경계에 "▶━━━◀" 형태로 또렷하게 표시해
 * "여기에 삽입됩니다 / 지금 버튼을 떼면 됩니다" 를 직관적으로 알린다(워드 표 삽입 표시 느낌).
 * 자기 그리드/타깃 그리드 모두에 재사용.
 */
export class DropIndicator {
  private _el: HTMLElement;

  constructor(color = '#1976d2') {
    const el = document.createElement('div');
    el.className = 'og-drop-indicator';
    // 경계(top) 중앙에 마커가 오도록 translateY(-50%)
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

  /** parent(그리드 바디) 안의 top(행 경계) 위치에 표시 */
  showIn(parent: HTMLElement, top: number): void {
    if (this._el.parentElement !== parent) {
      this._el.remove();
      parent.appendChild(this._el);
    }
    this._el.style.display = 'flex';
    this._el.style.top = `${top}px`;
  }

  hide(): void { this._el.style.display = 'none'; }

  destroy(): void { this._el.remove(); }
}
