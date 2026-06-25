export interface VirtualScrollOptions {
  rowHeight: number;
  overscan?: number;
  onRender: (startIndex: number, endIndex: number) => void;
}

export interface VirtualScrollRange {
  startIndex: number;
  endIndex: number;
  offsetY: number;
}

export class VirtualScroll {
  private container: HTMLElement;
  private rowHeight: number;
  private overscan: number;
  private _totalRows: number = 0;
  private _scrollTop: number = 0;
  private _viewportHeight: number = 0;
  private _rafId: number | null = null;
  private onRender: (startIndex: number, endIndex: number) => void;

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

  setTotalRows(count: number): void {
    this._totalRows = count;
    this._updateSpacerHeight();
    this._scheduleRender();
  }

  setViewportHeight(height: number): void {
    this._viewportHeight = height;
    this._scheduleRender();
  }

  setRowHeight(height: number): void {
    this.rowHeight = height;
    this._updateSpacerHeight();
    this._scheduleRender();
  }

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

  getTotalHeight(): number {
    return this._totalRows * this.rowHeight;
  }

  private _updateSpacerHeight(): void {
    // spacer 엘리먼트가 있다면 높이 업데이트
    const spacer = this.container.querySelector<HTMLElement>('.og-spacer');
    if (spacer) spacer.style.height = `${this.getTotalHeight()}px`;
  }

  destroy(): void {
    this.container.removeEventListener('scroll', this._onScroll);
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
  }
}
