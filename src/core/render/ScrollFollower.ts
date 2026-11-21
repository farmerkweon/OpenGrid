// ============================================================
// 가로 따라가기 — 본문의 가로 스크롤 위치를 머리글(나중에 푸터도)이 따라가게 한다 / Horizontal scroll follower
// 머리글은 본문 스크롤 상자 밖에 있어서, 본문이 가로로 움직이면 같은 scrollLeft 를 머리글에 써 줘야 줄이 맞는다.
// 그 「같은 값을 따라 쓰기」의 주인을 하나로 모은다: 따라갈 요소를 등록해 두고, 값이 오면 등록한 차례대로 쓴다(읽기 없음).
// 지금은 본문 상자의 scroll 이벤트도 이 객체가 직접 듣는다(이벤트마다 scrollLeft 한 번 읽기). 스크롤 입력을 읽는
// 주인이 따로 생기면 그쪽이 sync 를 부르고 여기서는 듣기를 뺀다. 머리글을 본문 상자 안에 붙이는(sticky) 방식으로
// 바꿀 때도 같은 포트의 다른 구현으로 갈아 끼우면 된다.
//
// Owns "write the body's scrollLeft onto the elements that follow it" (the header now, the footer later).
// Followers are written in registration order; sync never reads layout. For now this object also
// listens to the body's scroll event (one scrollLeft read per event); once a dedicated scroll-input
// owner exists it calls sync and the listening moves out. A sticky implementation can replace this
// behind the same port.
// ============================================================
import type { IScrollFollower } from './ports.js';

/**
 * scrollLeft 를 따라 쓰는 구현. 상태: 따라가는 요소 목록과 (있으면) 듣고 있는 원천 하나.
 *
 * scrollLeft-copying implementation. State: the followers and at most one listened source.
 */
export class ScrollLeftFollower implements IScrollFollower {
  private readonly _targets: HTMLElement[] = [];
  private _source: HTMLElement | null = null;
  /** 마지막으로 쓴 값 — 나중에 붙는 요소(다시 그린 푸터 막대 등)를 같은 자리에서 시작하게. / Last written value. */
  private _last = 0;
  private readonly _onScroll = (): void => {
    this.sync(this._source!.scrollLeft);
  };

  /**
   * 따라갈 요소를 더한다. 이미 있으면 그대로(두 번 쓰지 않으려고). 본문이 이미 가로로 옮겨져 있으면(마지막 값이 0 이 아니면)
   * 새 요소에 그 값을 바로 쓴다 — 옮긴 상태에서 다시 그려진 푸터가 맨 왼쪽에서 나타났다가 튀지 않게. 0 이면 쓰지 않는다(새 요소는 이미 0).
   *
   * Adds a follower once; when the body is already scrolled, writes the last value to it right away.
   */
  follow(el: HTMLElement): void {
    if (this._targets.indexOf(el) >= 0) return;
    this._targets.push(el);
    if (this._last !== 0) el.scrollLeft = this._last;
  }

  /** 따라가기에서 뺀다. / Removes a follower. */
  unfollow(el: HTMLElement): void {
    const i = this._targets.indexOf(el);
    if (i >= 0) this._targets.splice(i, 1);
  }

  /** 따라가는 요소 전부에 같은 scrollLeft 를 쓴다(더한 차례대로, 읽기 없음). / Writes scrollLeft to every follower. */
  sync(scrollLeft: number): void {
    this._last = scrollLeft;
    const t = this._targets;
    for (let i = 0; i < t.length; i++) t[i]!.scrollLeft = scrollLeft;
  }

  /**
   * 원천(본문 스크롤 상자)의 scroll 이벤트를 듣는다 — passive 듣개 하나. 이벤트마다 원천의 scrollLeft 를 읽어 sync 로 넘긴다.
   * 같은 원천을 다시 주면 아무것도 안 하고, 다른 원천을 주면 앞의 듣개를 떼고 옮긴다.
   *
   * Listens to the source's scroll event with one passive listener and forwards its scrollLeft to sync.
   */
  listenTo(source: HTMLElement): void {
    if (this._source === source) return;
    this._detach();
    this._source = source;
    source.addEventListener('scroll', this._onScroll, { passive: true });
  }

  /** 듣개를 떼고 따라가는 요소를 비운다. / Detaches the listener and clears followers. */
  destroy(): void {
    this._detach();
    this._targets.length = 0;
    this._last = 0;
  }

  private _detach(): void {
    if (this._source) {
      this._source.removeEventListener('scroll', this._onScroll);
      this._source = null;
    }
  }
}
