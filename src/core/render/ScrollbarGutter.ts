// ============================================================
// 끝 여백 재기 — 본문에 세로 스크롤바가 서면 본문의 보이는 폭이 그만큼 줄어 가로 스크롤 끝값이 머리글보다 커진다.
// 머리글(스크롤바 없음)은 그 끝까지 못 따라가 오른쪽 끝에서 선이 스크롤바 폭만큼 어긋난다. 그 모자람(머리글 보이는 폭 −
// 본문 보이는 폭)을 크기 관찰 때 한 번 재서 넘긴다 — 그리는 길에서는 읽지 않는다. 0 이면(스크롤바가 겹쳐 뜨는 환경·숨긴 환경)
// 넘기지 않는다(받는 쪽 DOM 이 그대로).
//
// Measures how much narrower the body's visible width is than the header's (a vertical scrollbar takes that space,
// so the body can scroll further right than the header). Read once per size observation, never on the paint path;
// a zero gap (overlay / hidden scrollbars) is never reported, so receivers keep their DOM untouched.
// ============================================================

/**
 * 본문 상자의 크기 관찰(세로 스크롤바가 생기고 없어질 때도 내용 상자가 바뀌어 불린다)마다 모자란 폭을 재서 바뀌었을 때만 알린다.
 *
 * On each size observation of the body box (also fired when its vertical scrollbar appears or goes away) measures the
 * shortfall and reports it only when it changed.
 */
export class ScrollbarGutter {
  private _ro: ResizeObserver | null = null;
  private _px = 0;

  constructor(
    private readonly _body: HTMLElement,
    private readonly _header: HTMLElement,
    private readonly _apply: (px: number) => void,
  ) {
    if (typeof ResizeObserver === 'undefined') return;
    this._ro = new ResizeObserver(() => this.measure());
    this._ro.observe(_body);
  }

  /** 지금 모자란 폭(px, 정수). / The current shortfall in px. */
  get px(): number { return this._px; }

  /** 한 번 잰다(크기 관찰 밖에서 부를 때 — 예: 행 수가 바뀐 뒤). / Measure once. */
  measure(): void {
    const px = Math.max(0, Math.round(this._header.clientWidth - this._body.clientWidth));
    if (px === this._px) return;
    this._px = px;
    this._apply(px);
  }

  destroy(): void {
    this._ro?.disconnect();
    this._ro = null;
  }
}
