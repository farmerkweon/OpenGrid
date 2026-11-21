import type { IResizeSink, ResizeBounds } from '../domain/resize/ports.js';

/** 받는 쪽이 이 어댑터에 내주는 일(폭 입력의 주인과 머리글 높이 맞추기). / What the host lends this adapter. */
export interface ResizeSinkHost {
  /**
   * 놓은 폭을 그리드의 기존 너비 조절 입구로 넘긴다(렌더러 콜백 onColResize → 사용자 폭 기억 — 다시 그리기 없음).
   * 기존 입구를 지나게 해 그 콜백을 지켜보는 코드가 지금처럼 놓기 한 번에 한 번 본다.
   *
   * Hand the released width to the grid's existing resize entry (renderer callback onColResize → remember user width, no redraw),
   * so code observing that callback still sees it once per release.
   */
  commitWidth(ci: number, width: number): void;
  /** 줄바꿈 머리글이 하나라도 있나. / Whether any header wraps. */
  hasWrappedHeader(): boolean;
  /**
   * 머리글 높이를 한 번 재어, 마지막으로 맞춘 높이와 다를 때만 본문 위치를 맞춘다(같으면 배치를 다시 하지 않음).
   *
   * Measure the header height once and realign the body only when it differs from the last fitted height (no relayout when equal).
   */
  relayoutHeaderIfChanged(): void;
}

/** 너비 조절 폭 한계 — 지금 동작 그대로 40px 하한, 상한 없음(컬럼 정의의 min/max 는 읽지 않음). */
const BOUNDS: ResizeBounds = Object.freeze({ min: 40, max: Infinity });

/**
 * 너비 조절을 놓았을 때 바깥에 알리는 작은 어댑터. 사용자 폭을 기억하고, 줄바꿈 머리글이면 높이를 한 번 다시 잰다.
 * 다시 그리기를 부르지 않는다 — 놓은 폭은 이미 끄는 동안 기하와 화면에 반영돼 있기 때문이다.
 *
 * Small adapter notified when a width resize is released. It remembers the user width and re-measures the header once
 * if headers wrap. It never triggers a redraw, because the released width is already in the geometry and on screen.
 */
export class ResizeSinkAdapter implements IResizeSink {
  constructor(private readonly _host: ResizeSinkHost) {}

  boundsOf(_ci: number): ResizeBounds {
    return BOUNDS;
  }

  commit(ci: number, width: number): void {
    this._host.commitWidth(ci, width);
  }

  needsHeaderRemeasure(): boolean {
    return this._host.hasWrappedHeader();
  }

  remeasureHeader(): void {
    this._host.relayoutHeaderIfChanged();
  }
}
