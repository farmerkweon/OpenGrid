// @vitest-environment node
// 넓은 그리드 새 그물 — ScrollLeftFollower 단위 시험(테스트 설계서 §2-37 U-SFL-01~04 · U-SOB-05·08, 걸음 R6).
// 가짜 요소 객체로 node 에서 돈다(이 객체가 DOM 을 직접 만들지 않는다는 증명).
// U-SOB-05·08 은 설계상 ScrollObserver 의 번호지만, 그 객체가 생기기 전(이 걸음)에는 본문 scroll 을 듣는 일이
// ScrollLeftFollower.listenTo 에 있으므로 여기서 같은 뜻을 본다(ScrollObserver 가 생기면 그쪽 시험으로 옮김).
import { describe, it, expect } from 'vitest';
import { ScrollLeftFollower } from '../../../src/core/render/ScrollFollower.js';

/** scrollLeft 읽기·쓰기를 세는 가짜 요소. */
function fakeEl(initial = 0) {
  let v = initial;
  const el = {
    reads: 0, writes: 0,
    get scrollLeft() { el.reads++; return v; },
    set scrollLeft(x: number) { el.writes++; v = x; },
    peek: () => v,
  };
  return el;
}
/** scroll 듣개를 기록하는 가짜 원천. */
function fakeSource(initial = 0) {
  const el = fakeEl(initial) as ReturnType<typeof fakeEl> & {
    listeners: Array<{ type: string; fn: () => void; opts: unknown }>;
    addEventListener(type: string, fn: () => void, opts?: unknown): void;
    removeEventListener(type: string, fn: () => void): void;
    fire(): void;
    set(x: number): void;
  };
  el.listeners = [];
  el.addEventListener = (type, fn, opts) => { el.listeners.push({ type, fn, opts }); };
  el.removeEventListener = (type, fn) => { el.listeners = el.listeners.filter((l) => !(l.type === type && l.fn === fn)); };
  el.fire = () => { for (const l of el.listeners.slice()) if (l.type === 'scroll') l.fn(); };
  el.set = (x: number) => { (el as any).scrollLeft = x; el.writes--; };
  return el;
}
const asEl = (x: unknown) => x as HTMLElement;

describe('ScrollLeftFollower — U-SFL (R6)', () => {
  it('U-SFL-01 둘 따라가기 — follow(머리글)·follow(푸터) → sync(500) → 둘 다 500', () => {
    const f = new ScrollLeftFollower();
    const header = fakeEl(), footer = fakeEl();
    f.follow(asEl(header)); f.follow(asEl(footer));
    f.sync(500);
    expect([header.peek(), footer.peek()]).toEqual([500, 500]);
    // 같은 요소를 두 번 더해도 한 번만 씀
    f.follow(asEl(header));
    f.sync(600);
    expect(header.writes).toBe(2);
  });

  it('U-SFL-02 unfollow — 푸터를 떼고 sync(700) → 푸터 500 그대로, 머리글 700', () => {
    const f = new ScrollLeftFollower();
    const header = fakeEl(), footer = fakeEl();
    f.follow(asEl(header)); f.follow(asEl(footer));
    f.sync(500);
    f.unfollow(asEl(footer));
    f.sync(700);
    expect([header.peek(), footer.peek()]).toEqual([700, 500]);
    f.unfollow(asEl(footer)); // 없는 요소를 다시 떼도 던지지 않음
  });

  it('U-SFL-03 쓰기만 — sync 동안 따라가는 요소의 scrollLeft 읽기 0', () => {
    const f = new ScrollLeftFollower();
    const a = fakeEl(), b = fakeEl();
    f.follow(asEl(a)); f.follow(asEl(b));
    for (let i = 0; i < 10; i++) f.sync(i * 37);
    expect([a.reads, b.reads]).toEqual([0, 0]);
    expect([a.writes, b.writes]).toEqual([10, 10]);
  });

  it('U-SFL-04 destroy → sync 해도 쓰기 0', () => {
    const f = new ScrollLeftFollower();
    const a = fakeEl();
    f.follow(asEl(a));
    f.destroy();
    f.sync(300);
    expect(a.writes).toBe(0);
  });
});

describe('ScrollLeftFollower.listenTo — U-SOB-05·08 의 뜻 (R6)', () => {
  it('U-SOB-05 따라가기 즉시 — scroll 이벤트 안에서 원천 scrollLeft 1번 읽고 머리글에 1번 씀(rAF 기다리지 않음), passive 듣개 하나', () => {
    const f = new ScrollLeftFollower();
    const body = fakeSource(), header = fakeEl();
    f.follow(asEl(header));
    f.listenTo(asEl(body));
    expect(body.listeners.length).toBe(1);
    expect(body.listeners[0]!.type).toBe('scroll');
    expect(body.listeners[0]!.opts).toEqual({ passive: true });
    body.set(1000);
    const r0 = body.reads;
    body.fire();
    expect(body.reads - r0).toBe(1);
    expect(header.peek()).toBe(1000);
    expect(header.writes).toBe(1);
    // 같은 원천을 다시 주면 듣개가 늘지 않음
    f.listenTo(asEl(body));
    expect(body.listeners.length).toBe(1);
  });

  it('U-SOB-08 destroy → 원천의 듣개 0 · 그 뒤 scroll 이 와도 쓰기 0', () => {
    const f = new ScrollLeftFollower();
    const body = fakeSource(), header = fakeEl();
    f.follow(asEl(header));
    f.listenTo(asEl(body));
    f.destroy();
    expect(body.listeners.length).toBe(0);
    body.set(200);
    body.fire();
    expect(header.writes).toBe(0);
  });

  it('(덤) 다른 원천을 주면 앞 원천의 듣개를 떼고 옮김', () => {
    const f = new ScrollLeftFollower();
    const a = fakeSource(), b = fakeSource(), header = fakeEl();
    f.follow(asEl(header));
    f.listenTo(asEl(a));
    f.listenTo(asEl(b));
    expect([a.listeners.length, b.listeners.length]).toEqual([0, 1]);
    b.set(42); b.fire();
    expect(header.peek()).toBe(42);
  });
});
