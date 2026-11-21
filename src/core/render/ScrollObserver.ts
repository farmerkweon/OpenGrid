// ============================================================
// 가로 스크롤·보이는 폭 관찰자 / Horizontal scroll and viewport-width observer
// 그리는 길이 DOM 을 읽지 않게, 본문 상자의 가로 위치와 보이는 폭을 이벤트에서 이미 읽은 값으로 들고 있는 곳.
// 값이 실제로 달라졌을 때만 스케줄러에 요청을 낸다(같은 값 scroll 이벤트·세로 스크롤은 가로 요청 0).
// 세로 위치는 지금처럼 VirtualScroll 이 듣는다 — 이 객체는 가로 몫만 맡는다.
//
// Holds the body box's horizontal position and visible width as values already read in events, so the paint
// path never reads layout. Submits a request only when a value really changed; vertical scrolling stays with
// VirtualScroll.
// ============================================================
import type { ViewportBox } from '../coordinate/geometryPorts.js';
import { Change } from '../domain/render/ports.js';
import { RenderRequest } from '../domain/render/RenderRequest.js';
import type { IRenderScheduler, IScrollObserver } from './ports.js';

/**
 * 본문 상자의 가로 위치·보이는 폭을 들고, 바뀌면 `ColsScrolled`(위치)·`Viewport`(폭) 요청을 낸다.
 * scroll 이벤트마다 DOM 읽기는 한 번(scrollLeft·scrollTop) — 그 밖에 읽는 곳은 없다.
 *
 * Holds scrollLeft and visible width; submits `ColsScrolled` / `Viewport` only on real change.
 */
export class ScrollObserver implements IScrollObserver {
  private readonly _el: HTMLElement;
  private readonly _scheduler: Pick<IRenderScheduler, 'submit'>;
  private _left: number;
  private _top: number;
  private _width = 0;
  private _box: ViewportBox;
  private _alive = true;
  /**
   * 오른쪽에서 왼쪽으로 쓰는 상자(dir=rtl)인가. 그런 상자의 가로 위치는 0 에서 음수로 가서 창 정책의 왼쪽 원점 좌표와
   * 맞지 않으므로, 이때는 보이는 폭을 「모름」(0)으로 답해 창 규칙이 전 컬럼을 그리게 한다(가상화를 끄는 안전한 쪽).
   *
   * Right-to-left box: its scrollLeft runs from 0 to negative and does not match the policy's left-origin x, so the
   * width is reported as unknown (0) and the window rules fall back to all columns.
   */
  private _rtl: boolean;

  constructor(el: HTMLElement, scheduler: Pick<IRenderScheduler, 'submit'>) {
    this._el = el;
    this._scheduler = scheduler;
    this._left = el.scrollLeft || 0;
    this._top = el.scrollTop || 0;
    this._box = { scrollLeft: this._left, width: 0 };
    this._rtl = ScrollObserver._isRtl(el);
    el.addEventListener('scroll', this._onScroll, { passive: true });
  }

  /** 마지막으로 읽은 가로 위치·보이는 폭(값 객체 — 바뀔 때만 새로 만듦). / Last read position and width. */
  get box(): ViewportBox {
    return this._box;
  }

  get scrollTop(): number {
    return this._top;
  }

  /**
   * 크기 관찰이 읽은 보이는 폭을 넘긴다. 같은 값이면 아무것도 안 하고, 다르면 `Viewport` 요청을 낸다
   * (폭이 바뀌면 창도 바뀔 수 있으므로).
   *
   * Receives the width read by the resize observer; submits `Viewport` only when it changed.
   */
  setWidth(width: number): void {
    if (!this._alive) return;
    // 크기가 바뀔 때 방향도 다시 본다(드문 일 — 크기 관찰 한 번에 스타일 읽기 한 번).
    this._rtl = ScrollObserver._isRtl(this._el);
    const w = !this._rtl && Number.isFinite(width) && width > 0 ? width : 0;
    if (w === this._width) return;
    this._width = w;
    this._box = { scrollLeft: this._left, width: w };
    this._scheduler.submit(RenderRequest.of(Change.Viewport));
  }

  /**
   * 가로 위치를 코드로 옮긴다(칸 드러내기 등). DOM 에 쓰고 값을 바로 갱신해, 뒤따르는 scroll 이벤트는 같은 값이라 요청을
   * 다시 내지 않는다. 브라우저가 끝에서 잘라 낸 값은 다음 scroll 이벤트가 바로잡는다.
   *
   * Moves the horizontal position from code; the trailing scroll event then carries the same value.
   */
  scrollLeftTo(x: number): void {
    if (!this._alive || !Number.isFinite(x)) return;
    const v = x < 0 ? 0 : x;
    this._el.scrollLeft = v;
    this._setLeft(v);
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    this._el.removeEventListener('scroll', this._onScroll);
  }

  private _onScroll = (): void => {
    if (!this._alive) return;
    const el = this._el;
    this._top = el.scrollTop;
    this._setLeft(el.scrollLeft);
  };

  private static _isRtl(el: HTMLElement): boolean {
    const view = el.ownerDocument.defaultView;
    return view !== null && view.getComputedStyle(el).direction === 'rtl';
  }

  private _setLeft(left: number): void {
    // 음수 가로 위치 = 오른쪽에서 왼쪽 상자(크기 관찰 전에 방향이 바뀐 경우까지) → 폭 모름으로 바꿔 전 컬럼.
    // A negative scrollLeft means a right-to-left box → report the width as unknown (all columns).
    // 일시적 음수(고무줄 스크롤 등)로 왼쪽→오른쪽 상자를 오른쪽→왼쪽으로 못 박지 않게 방향을 한 번 확인한다.
    // Confirm direction once so a transient negative value in an LTR box does not latch RTL.
    if (left < 0 && !this._rtl && !ScrollObserver._isRtl(this._el)) left = 0;
    if (left < 0 && !this._rtl) {
      this._rtl = true;
      this._width = 0;
      this._left = left;
      this._box = { scrollLeft: left, width: 0 };
      this._scheduler.submit(RenderRequest.of(Change.Viewport));
      return;
    }
    if (left === this._left) return;
    this._left = left;
    this._box = { scrollLeft: left, width: this._width };
    this._scheduler.submit(RenderRequest.of(Change.ColsScrolled));
  }
}
