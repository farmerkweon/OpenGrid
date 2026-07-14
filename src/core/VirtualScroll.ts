/** 가상 스크롤 생성 옵션. / Virtual scroll construction options. */
export interface VirtualScrollOptions {
  /** 행 높이(px). / Row height in px. */
  rowHeight: number;
  /** 뷰포트 위/아래로 여분 렌더할 행 수(기본 5). / Extra rows rendered above/below the viewport (default 5). */
  overscan?: number;
  /** 가시 범위 변화 시 호출되는 렌더 콜백. / Render callback fired when the visible range changes. */
  onRender: (startIndex: number, endIndex: number) => void;
}

/** 현재 가시 행 범위와 스크롤 오프셋. / Current visible row range and scroll offset. */
export interface VirtualScrollRange {
  /** 렌더 시작 행 인덱스. / First row index to render. */
  startIndex: number;
  /** 렌더 종료 행 인덱스(포함). / Last row index to render (inclusive). */
  endIndex: number;
  /** 시작 행의 상단 y 오프셋(px). / Top y-offset of the start row in px. */
  offsetY: number;
}

/**
 * 대용량 행을 위한 가상 스크롤 엔진(C0 가상스크롤). / Virtual scroll engine for large row counts (contract C0 virtual-scroll).
 *
 * 컨테이너의 scroll 이벤트를 rAF 로 코얼레싱하여 가시 범위만 렌더 콜백으로 통지한다.
 * 스크롤 위치·뷰포트 높이·행 높이에서 시작/종료 인덱스를 계산해 DOM 노드 수를 상수로 유지한다.
 * / Coalesces the container's scroll events via rAF and notifies only the visible range through
 *   the render callback. Derives start/end indices from scroll position, viewport height, and row
 *   height so the DOM node count stays constant.
 *
 * @example
 * const vs = new VirtualScroll(container, { rowHeight: 32, onRender: (s, e) => renderRows(s, e) });
 * vs.setViewportHeight(640);
 * vs.setTotalRows(100000);
 */
export class VirtualScroll {
  private container: HTMLElement;
  private rowHeight: number;
  private overscan: number;
  private _totalRows: number = 0;
  private _scrollTop: number = 0;
  private _viewportHeight: number = 0;
  private _rafId: number | null = null;
  private onRender: (startIndex: number, endIndex: number) => void;

  /**
   * 가상 스크롤 엔진 생성 및 컨테이너 scroll 리스너 부착. / Create the engine and attach the container scroll listener.
   *
   * @param container - 스크롤을 감지할 컨테이너 요소 / Container element whose scroll is tracked
   * @param options - 행 높이·overscan·렌더 콜백 / Row height, overscan, and render callback
   */
  constructor(container: HTMLElement, options: VirtualScrollOptions) {
    this.container = container;
    this.rowHeight = options.rowHeight;
    this.overscan = options.overscan ?? 5;
    this.onRender = options.onRender;

    this.container.addEventListener('scroll', this._onScroll, { passive: true });
  }

  private _onScroll = (): void => {
    this._scrollTop = this.container.scrollTop;
    this._scheduleRender();
  };

  private _scheduleRender(): void {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      const range = this.getVisibleRange();
      this.onRender(range.startIndex, range.endIndex);
    });
  }

  /**
   * 현재 스크롤 상태 기준 가시 행 범위 계산. / Compute the visible row range for the current scroll state.
   *
   * overscan 을 반영해 시작/종료 인덱스와 시작 오프셋을 반환한다.
   * / Returns start/end indices and the start offset, accounting for overscan.
   *
   * @returns 가시 범위 및 오프셋 / The visible range and offset
   */
  getVisibleRange(): VirtualScrollRange {
    const visibleCount = Math.ceil(this._viewportHeight / this.rowHeight);
    const startIndex = Math.max(0, Math.floor(this._scrollTop / this.rowHeight) - this.overscan);
    const endIndex = Math.min(
      this._totalRows - 1,
      startIndex + visibleCount + this.overscan * 2
    );
    const offsetY = startIndex * this.rowHeight;
    return { startIndex, endIndex, offsetY };
  }

  /**
   * 전체 행 수 설정 — spacer 높이 갱신 후 재렌더 예약. / Set total row count — updates spacer height and schedules a re-render.
   *
   * @param count - 전체 행 수 / Total number of rows
   */
  setTotalRows(count: number): void {
    this._totalRows = count;
    this._updateSpacerHeight();
    this._scheduleRender();
  }

  /**
   * 뷰포트 높이 설정 — 가시 행 개수 계산에 사용. / Set viewport height — used to compute the number of visible rows.
   *
   * @param height - 뷰포트 높이(px) / Viewport height in px
   */
  setViewportHeight(height: number): void {
    this._viewportHeight = height;
    this._scheduleRender();
  }

  /**
   * 행 높이 변경 — spacer 높이 갱신 후 재렌더 예약. / Change row height — updates spacer height and schedules a re-render.
   *
   * @param height - 새 행 높이(px) / New row height in px
   */
  setRowHeight(height: number): void {
    this.rowHeight = height;
    this._updateSpacerHeight();
    this._scheduleRender();
  }

  /**
   * 지정 행이 보이도록 스크롤 위치 조정(이미 보이면 무이동). / Scroll so the given row is visible (no-op if already visible).
   *
   * @param rowIndex - 대상 행 인덱스 / Target row index
   */
  scrollToRow(rowIndex: number): void {
    const targetTop = rowIndex * this.rowHeight;
    const targetBottom = targetTop + this.rowHeight;
    const viewBottom = this._scrollTop + this._viewportHeight;

    if (targetTop < this._scrollTop) {
      this._scrollTop = targetTop;
      this.container.scrollTop = targetTop;
    } else if (targetBottom > viewBottom) {
      const newTop = targetBottom - this._viewportHeight;
      this._scrollTop = newTop;
      this.container.scrollTop = newTop;
    }
  }

  /**
   * 전체 콘텐츠 높이(전체 행 수 × 행 높이) 반환. / Return the total content height (total rows × row height).
   *
   * @returns 전체 높이(px) / Total height in px
   */
  getTotalHeight(): number {
    return this._totalRows * this.rowHeight;
  }

  private _updateSpacerHeight(): void {
    // spacer 엘리먼트가 있다면 높이 업데이트
    const spacer = this.container.querySelector<HTMLElement>('.og-spacer');
    if (spacer) spacer.style.height = `${this.getTotalHeight()}px`;
  }

  /**
   * 리스너·rAF 정리. 그리드 파기 시 반드시 호출. / Tear down the listener and pending rAF; call on grid destroy.
   */
  destroy(): void {
    this.container.removeEventListener('scroll', this._onScroll);
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
  }
}
