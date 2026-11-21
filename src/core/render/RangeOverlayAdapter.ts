// ============================================================
// 범위 덧그림 포트 / Range overlay port
// 그리기 계획이 「덧그림 다시」(범위 테두리·채우기 핸들·미리보기와 범위 칸 클래스)를 말할 때 스케줄러가 부르는 자리.
// 테두리 좌표의 주인은 범위 선택 관리자 하나라 여기서는 맡기기만 한다 — 그 관리자는 모서리 칸이 그려져 있으면 칸을 재고,
// 가로 창 밖이라 없으면 기하로 계산한다. 스케줄러가 관리자 클래스를 직접 알지 않도록 포트 하나로 끼운다.
//
// The scheduler's hook for "repaint overlays" (range border, fill handle, preview, range-cell classes). Border
// coordinates are owned by the range selection manager (cells when rendered, geometry when outside the column
// window); this only delegates, so the scheduler depends on a port rather than the manager class.
// ============================================================
import type { IRangeOverlay } from './ports.js';

/** 덧그림을 다시 그릴 줄 아는 것(범위 선택 관리자). / Something that can repaint the range overlay. */
export interface RangeOverlayTarget {
  repaint(): void;
}

export class RangeOverlayAdapter implements IRangeOverlay {
  private readonly _target: RangeOverlayTarget;

  constructor(target: RangeOverlayTarget) {
    this._target = target;
  }

  repaint(): void {
    this._target.repaint();
  }
}
