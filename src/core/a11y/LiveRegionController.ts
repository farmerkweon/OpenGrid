// ============================================================
// 화면 낭독기 공지 관리 / screen-reader announcement manager
// ------------------------------------------------------------
// 무엇을 하나: 여러 곳에서 들어오는 공지를 모아, 같은 종류는 마지막 것만, 중요한 것부터, 잠깐
//   기다렸다가 한 번에 aria-live 영역에 적는다. 오류(assertive)는 기다리지 않고 곧바로 적는다.
// 왜 이렇게: 중재자(Mediator) 패턴 — 공지를 넣는 쪽은 `enqueue` 만 알고 서로나 aria-live 영역을 모른다.
//   합치기·우선순위·기다림 규칙이 한곳에 있어, 정렬을 빠르게 바꿔도 낭독기가 같은 말을 되풀이하지 않는다.
//   타이머는 바꿔 끼울 수 있어(기본 setTimeout) 테스트에서 시간을 직접 돌릴 수 있다.
// / What: collects announcements, keeps the latest per kind, orders by priority, waits briefly, then
//   writes once to the aria-live region; errors (assertive) are written at once.
//   Why: Mediator — sources only know `enqueue`. Merge/priority/wait rules live in one place, so rapid
//   changes do not make the screen reader repeat itself. The timer is swappable for tests.
// ============================================================

import type { MessageParams } from '../i18n/types.js';
import type { IAriaRenderPort, LiveChannel } from './ports.js';

/**
 * 화면 낭독기에 알릴 공지 한 건. 글 자체가 아니라 메시지 키와 값으로 주면, 컨트롤러가 겹친 공지를 합치고 순서를 정해 한 번에 읽힌다.
 *
 * One announcement for screen readers. Give a message key and values rather than the text itself; the controller merges overlapping announcements, orders them and has them read once.
 *
 * スクリーンリーダーに知らせるお知らせ 1 件。文そのものではなくメッセージキーと値で渡すと、コントローラーが重なったお知らせをまとめ、順番を決めて一度に読ませます。
 *
 * 要告知屏幕阅读器的一条通知。不是直接给文字,而是给消息键和值;控制器会合并重叠的通知、排好顺序后一次性朗读。
 */
export interface Announcement {
  /**
   * `polite`=지금 읽는 것이 끝난 뒤 읽는다, `assertive`=곧바로 끼어들어 읽는다(오류 등).
   *
   * `polite` = read after the current speech; `assertive` = interrupt and read at once (errors, etc.).
   *
   * `polite`=いま読んでいるものが終わってから読む、`assertive`=すぐ割り込んで読む(エラーなど)。
   *
   * `polite`=等当前朗读结束后再读;`assertive`=立即插入朗读(错误等)。
   */
  readonly channel: LiveChannel;
  /**
   * 우선순위. 같은 채널에서 여러 건이 한꺼번에 나갈 때 큰 값을 먼저 읽는다(예: 오류 > 편집 완료 > 선택).
   *
   * Priority. When several go out together on one channel, higher values are read first (e.g. error > edit done > selection).
   *
   * 優先度。同じチャンネルで複数件が一度に出るとき、大きい値から先に読みます(例: エラー > 編集完了 > 選択)。
   *
   * 优先级。同一通道上有多条同时发出时,值大的先读(例如 错误 > 编辑完成 > 选择)。
   */
  readonly priority: number;
  /**
   * 합치기 키. 같은 키로 잇달아 들어온 공지는 마지막 한 건만 읽는다(예: 'sort'·'selection'). 정렬을 빠르게 여러 번 바꿔도 마지막 상태만 한 번 읽힌다.
   *
   * Merge key. Announcements arriving in a row with the same key are read only once, as the latest (e.g. 'sort', 'selection'). Changing the sort quickly several times reads only the final state once.
   *
   * まとめキー。同じキーで続けて入ったお知らせは最後の 1 件だけを読みます(例: 'sort'・'selection')。並べ替えを素早く何度変えても、最後の状態だけが一度読まれます。
   *
   * 合并键。以同一键连续到来的通知只读最后一条(例如 'sort'、'selection')。即使快速多次改变排序,也只读一次最终状态。
   */
  readonly mergeKey: string;
  /**
   * 메시지 키. 컨트롤러가 `t` 옵션으로 글로 바꾼다(`t` 를 안 주면 키를 그대로 읽는다).
   *
   * Message key. The controller turns it into text with the `t` option (without `t`, the key itself is read).
   *
   * メッセージキー。コントローラーが `t` オプションで文に変えます(`t` を渡さなければキーをそのまま読みます)。
   *
   * 消息键。控制器用 `t` 选项把它变成文字(不传 `t` 则直接朗读键本身)。
   */
  readonly messageKey: string;
  /**
   * 메시지에 끼울 값(예: `{ field: '이름' }`).
   *
   * Values to fill into the message (e.g. `{ field: 'Name' }`).
   *
   * メッセージに差し込む値(例: `{ field: '名前' }`)。
   *
   * 要填入消息的值(例如 `{ field: '名称' }`)。
   */
  readonly params?: MessageParams;
  /**
   * 사용자가 한 일이 아닌 바탕 변경(실시간 갱신 등)이면 `true`. 사용자가 편집 중일 때(`setUserBusy(true)`)는 미뤄 두었다가 끝나면 읽는다.
   *
   * `true` for a background change the user did not make (live updates, etc.). While the user is busy (`setUserBusy(true)`) it is held and read afterwards.
   *
   * 利用者の操作ではない裏側の変更(リアルタイム更新など)なら `true`。利用者が編集中(`setUserBusy(true)`)は保留し、終わってから読みます。
   *
   * 如果是非用户操作的后台变化(实时更新等)则为 `true`。用户正在编辑时(`setUserBusy(true)`)会暂缓,结束后再读。
   */
  readonly background?: boolean;
}

/**
 * `schedule` 옵션이 돌려주는 타이머 손잡이(`setTimeout` 의 반환값과 같은 역할).
 *
 * The timer handle the `schedule` option returns (the same role as `setTimeout`'s return value).
 *
 * `schedule` オプションが返すタイマーのハンドル(`setTimeout` の戻り値と同じ役割)。
 *
 * `schedule` 选项返回的定时器句柄(作用与 `setTimeout` 的返回值相同)。
 */
export type TimerHandle = unknown;

/**
 * `LiveRegionController` 설정. `render` 만 필수다.
 *
 * `LiveRegionController` settings. Only `render` is required.
 *
 * `LiveRegionController` の設定。必須は `render` だけです。
 *
 * `LiveRegionController` 的设置。只有 `render` 是必需的。
 */
export interface LiveRegionControllerOpts {
  /**
   * 공지를 실제로 화면(aria-live 영역)에 적는 곳. `announce(channel, text)` 하나만 있으면 된다.
   *
   * Where announcements are actually written to the page (an aria-live region). Only `announce(channel, text)` is needed.
   *
   * お知らせを実際に画面(aria-live 領域)へ書く場所。`announce(channel, text)` が一つあれば足ります。
   *
   * 把通知实际写到页面(aria-live 区域)的地方。只需要一个 `announce(channel, text)`。
   */
  readonly render: Pick<IAriaRenderPort, 'announce'>;
  /**
   * 메시지 키를 글로 바꾸는 함수. 주지 않으면 키를 그대로 쓴다.
   *
   * Turns a message key into text. Without it the key is used as is.
   *
   * メッセージキーを文に変える関数。渡さなければキーをそのまま使います。
   *
   * 把消息键变成文字的函数。不传则直接使用键。
   */
  readonly t?: (key: string, params?: MessageParams) => string;
  /**
   * `polite` 공지를 모았다가 읽기까지 기다리는 시간(ms). 기본 150.
   *
   * How long `polite` announcements are collected before being read (ms). Default 150.
   *
   * `polite` のお知らせを集めてから読むまで待つ時間(ms)。既定 150。
   *
   * 收集 `polite` 通知后等待朗读的时间(毫秒)。默认 150。
   */
  readonly debounceMs?: number;
  /**
   * `assertive` 공지를 기다리지 않고 곧바로 읽을지. 기본 `true`.
   *
   * Whether `assertive` announcements are read at once without waiting. Default `true`.
   *
   * `assertive` のお知らせを待たずにすぐ読むかどうか。既定 `true`。
   *
   * 是否不等待立即朗读 `assertive` 通知。默认 `true`。
   */
  readonly assertiveImmediate?: boolean;
  /**
   * 타이머 걸기(기본 `setTimeout`). 테스트에서 시간을 직접 돌릴 때 바꿔 끼운다.
   *
   * Schedules a timer (default `setTimeout`). Swap it in tests to drive time yourself.
   *
   * タイマーを掛ける(既定 `setTimeout`)。テストで時間を自分で進めるときに差し替えます。
   *
   * 设置定时器(默认 `setTimeout`)。在测试中自己推进时间时替换它。
   */
  readonly schedule?: (fn: () => void, ms: number) => TimerHandle;
  /**
   * 타이머 취소(기본 `clearTimeout`).
   *
   * Cancels a timer (default `clearTimeout`).
   *
   * タイマーの取り消し(既定 `clearTimeout`)。
   *
   * 取消定时器(默认 `clearTimeout`)。
   */
  readonly cancel?: (h: TimerHandle) => void;
}

/**
 * 화면 낭독기 공지를 한곳에서 관리한다. 여러 곳에서 공지를 넣어도 같은 종류는 마지막 것만, 중요한 것부터, 잠깐 모았다가 한 번에 읽힌다.
 * 그래서 정렬을 빠르게 바꾸거나 값이 쏟아져도 낭독기가 같은 말을 되풀이하지 않는다.
 *
 * Manages screen-reader announcements in one place. However many places enqueue, only the latest of each kind is read, most important first, after a short wait.
 * So rapid sort changes or a flood of updates do not make the screen reader repeat itself.
 *
 * スクリーンリーダーへのお知らせを一か所で管理します。何か所からお知らせを入れても、同じ種類は最後のものだけを、重要なものから、少しまとめてから一度に読ませます。
 * そのため、並べ替えを素早く変えたり値が次々に変わったりしても、スクリーンリーダーが同じことを繰り返しません。
 *
 * 在一处管理屏幕阅读器的通知。无论从多少处放入通知,同类只读最后一条,从重要的开始,稍作收集后一次朗读。
 * 因此即使快速改变排序或数值大量涌入,屏幕阅读器也不会重复同样的话。
 *
 * @example
 * const politeEl = document.getElementById('live-polite')!;       // <div aria-live="polite">
 * const alertEl = document.getElementById('live-assertive')!;     // <div aria-live="assertive">
 * const live = new LiveRegionController({
 *   render: { announce: (channel, text) => { (channel === 'assertive' ? alertEl : politeEl).textContent = text; } },
 *   t: (key, params) => myMessages(key, params),   // 번역 함수가 없으면 이 줄을 빼고 messageKey 에 문장을 그대로 넣어도 된다
 * });
 * grid.on('sortChange', (e) => live.enqueue({ channel: 'polite', priority: 1, mergeKey: 'sort', messageKey: 'sorted', params: { field: e.field } }));
 */
export class LiveRegionController {
  private readonly _render: Pick<IAriaRenderPort, 'announce'>;
  private readonly _t: (key: string, params?: MessageParams) => string;
  private readonly _debounceMs: number;
  private readonly _assertiveImmediate: boolean;
  private readonly _schedule: (fn: () => void, ms: number) => TimerHandle;
  private readonly _cancel: (h: TimerHandle) => void;

  /** polite 큐 — mergeKey 당 최신 1건(병합). / polite queue — latest per mergeKey. */
  private _polite = new Map<string, Announcement>();
  /** assertive 큐 — mergeKey 당 최신 1건. / assertive queue — latest per mergeKey. */
  private _assertive = new Map<string, Announcement>();
  private _timer: TimerHandle | null = null;
  private _userBusy = false;
  private _disposed = false;

  private _spoken = 0;
  private _coalesced = 0;
  private _dropped = 0;

  constructor(opts: LiveRegionControllerOpts) {
    this._render = opts.render;
    this._t = opts.t ?? ((k) => k);
    this._debounceMs = opts.debounceMs ?? 150;
    this._assertiveImmediate = opts.assertiveImmediate ?? true;
    this._schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms) as unknown as TimerHandle);
    this._cancel = opts.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /**
   * 공지를 넣는다. 곧바로 읽지 않고 잠깐 모은다(`assertive` 는 곧바로). 같은 `mergeKey` 가 기다리고 있으면 새 것으로 바꾼다.
   *
   * Enqueues an announcement. It is not read at once but collected briefly (`assertive` is read at once). If one with the same `mergeKey` is waiting, it is replaced by the new one.
   *
   * お知らせを入れます。すぐには読まず少しまとめます(`assertive` はすぐ)。同じ `mergeKey` が待っていれば新しいものに置き換えます。
   *
   * 放入通知。不会立即朗读,而是稍作收集(`assertive` 立即读)。如果有相同 `mergeKey` 的通知在等待,就换成新的。
   *
   * @param a - 공지
   *
   * The announcement
   *
   * お知らせ
   *
   * 通知
   */
  enqueue(a: Announcement): void {
    if (this._disposed) return;
    const q = a.channel === 'assertive' ? this._assertive : this._polite;
    if (q.has(a.mergeKey)) this._coalesced++;
    q.set(a.mergeKey, a);

    // assertive 즉시 발화 — 디바운스 우회(오류 등 즉시성 요구). / assertive immediate — bypass debounce.
    if (a.channel === 'assertive' && this._assertiveImmediate) {
      this._flushAssertive();
      return;
    }
    this._scheduleFlush();
  }

  /**
   * 사용자가 편집 중인지 알린다. `true` 인 동안 바탕 변경 공지(`background: true`)는 미뤄 두고, `false` 로 돌아오면 모아 둔 것을 읽는다.
   *
   * Tells whether the user is busy editing. While `true`, background announcements (`background: true`) are held; when it goes back to `false` the held ones are read.
   *
   * 利用者が編集中かどうかを知らせます。`true` の間は裏側の変更のお知らせ(`background: true`)を保留し、`false` に戻るとためておいたものを読みます。
   *
   * 告知用户是否正在编辑。为 `true` 期间,后台变化通知(`background: true`)会暂缓;回到 `false` 时朗读暂存的通知。
   *
   * @param busy - 편집 중이면 `true`
   *
   * `true` while editing
   *
   * 編集中なら `true`
   *
   * 编辑中为 `true`
   *
   * @example
   * grid.on('editStart', () => live.setUserBusy(true));
   * grid.on('editEnd', () => live.setUserBusy(false));
   */
  setUserBusy(busy: boolean): void {
    const was = this._userBusy;
    this._userBusy = busy;
    if (was && !busy) this._scheduleFlush(); // 편집 종료 → 누적 배경 요약 방출. / release held background summary.
  }

  /**
   * 기다리던 공지를 버린다(예: 알릴 대상이 사라졌을 때).
   *
   * Discards a waiting announcement (e.g. when what it was about is gone).
   *
   * 待っていたお知らせを捨てます(例: 知らせる対象がなくなったとき)。
   *
   * 丢弃正在等待的通知(例如要告知的对象已经消失时)。
   *
   * @param mergeKey - 버릴 공지의 합치기 키
   *
   * Merge key of the announcement to discard
   *
   * 捨てるお知らせのまとめキー
   *
   * 要丢弃的通知的合并键
   */
  drop(mergeKey: string): void {
    let hit = false;
    if (this._polite.delete(mergeKey)) hit = true;
    if (this._assertive.delete(mergeKey)) hit = true;
    if (hit) this._dropped++;
  }

  /**
   * 지금까지의 수: 읽힌 수(`spoken`)·합쳐져 빠진 수(`coalesced`)·버린 수(`dropped`).
   *
   * Counts so far: read (`spoken`), merged away (`coalesced`), discarded (`dropped`).
   *
   * これまでの数: 読まれた数(`spoken`)・まとめられて消えた数(`coalesced`)・捨てた数(`dropped`)。
   *
   * 到目前为止的数量:已朗读(`spoken`)、被合并掉(`coalesced`)、已丢弃(`dropped`)。
   *
   * @returns 세 가지 수
   *
   * The three counts
   *
   * 三つの数
   *
   * 三个数量
   */
  metrics(): { spoken: number; coalesced: number; dropped: number } {
    return { spoken: this._spoken, coalesced: this._coalesced, dropped: this._dropped };
  }

  /**
   * 정리한다: 기다리던 공지와 타이머를 버리고, 이후 `enqueue` 는 무시한다.
   *
   * Cleans up: discards waiting announcements and the timer; later `enqueue` calls are ignored.
   *
   * 後片付けをします: 待っていたお知らせとタイマーを捨て、その後の `enqueue` は無視します。
   *
   * 清理:丢弃等待中的通知和定时器,之后的 `enqueue` 会被忽略。
   */
  dispose(): void {
    if (this._timer != null) { this._cancel(this._timer); this._timer = null; }
    this._polite.clear();
    this._assertive.clear();
    this._disposed = true;
  }

  // ── 내부 ─────────────────────────────────────────────

  private _scheduleFlush(): void {
    if (this._disposed || this._timer != null) return;
    this._timer = this._schedule(() => {
      this._timer = null;
      this._flush();
    }, this._debounceMs);
  }

  /** 디바운스 만료 flush — 채널별 우선순위 정렬 → mergeKey 최신 1건씩 발화. / Debounced flush. */
  private _flush(): void {
    if (this._disposed) return;
    this._flushAssertive();
    this._flushPolite();
  }

  private _flushAssertive(): void {
    if (this._assertive.size === 0) return;
    const items = [...this._assertive.values()].sort((a, b) => b.priority - a.priority);
    this._assertive.clear();
    for (const a of items) this._speak(a);
  }

  private _flushPolite(): void {
    if (this._polite.size === 0) return;
    const ready: Announcement[] = [];
    const held = new Map<string, Announcement>();
    for (const [key, a] of this._polite) {
      // 편집/포커스 중이면 배경 공지는 억제(보류), 비-배경은 발화. / hold background while busy.
      if (this._userBusy && a.background) held.set(key, a);
      else ready.push(a);
    }
    this._polite = held;
    ready.sort((a, b) => b.priority - a.priority);
    for (const a of ready) this._speak(a);
  }

  private _speak(a: Announcement): void {
    const text = this._t(a.messageKey, a.params);
    this._render.announce(a.channel, text);
    this._spoken++;
  }
}
