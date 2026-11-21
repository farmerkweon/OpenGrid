// @vitest-environment node
// 넓은 그리드 새 그물 — ResizeGesture 단위 시험(테스트 설계서 §2-9 U-RSZ-01~37 + §2-40 U-RSZ-38 + §17-3 U-RSZ-39·40, 걸음 R1).
// 상태 × 사건 4 × 6 = 24칸(U-RSZ-01~24)은 일어나면 안 되는 넘어감까지 전부.
// Q-25 답(설계 §14-1): pressed 에서 cancel/lose → null·idle / dragging 에서 cancel/lose → 결과·swallowing / expireSwallow().
// U-RSZ-40 의 걸음은 C4 지만 계약 메서드 expireSwallow 가 이미 있어 R1 에서 같이 둔다(§17-11 Q-25 — dismiss → expireSwallow).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ResizeGesture } from '../../../../src/core/domain/resize/ResizeGesture.js';
import type { ResizeBounds, ResizePhase } from '../../../../src/core/domain/resize/ports.js';

const B: ResizeBounds = { min: 40, max: Infinity };
/** 준비 P: press(ci=3, startWidth=180, clientX=1000, bounds={40, ∞}). */
function P(): ResizeGesture {
  const g = new ResizeGesture();
  g.press(3, 180, 1000, B);
  return g;
}
/** P → move(1100) → release(1200) 뒤(U-RSZ-16 뒤 = swallowing). */
function S16(): ResizeGesture {
  const g = P();
  g.move(1100);
  g.release(1200);
  return g;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEEDS = [20261121, 1, 2, 3, 42, 7777, 0xC0FFEE, 99991];

describe('ResizeGesture — 상태 × 사건 24칸 (U-RSZ-01~24, R1)', () => {
  // ── idle ──
  it('U-RSZ-01 idle · press → pressed, column 3', () => {
    const g = new ResizeGesture();
    expect(g.phase).toBe('idle');
    expect(g.press(3, 180, 1000, B)).toBeUndefined();
    expect(g.phase).toBe('pressed');
    expect(g.column).toBe(3);
  });
  it('U-RSZ-02 idle · move(1100) → null, idle', () => {
    const g = new ResizeGesture();
    expect(g.move(1100)).toBeNull();
    expect(g.phase).toBe('idle');
  });
  it('U-RSZ-03 idle · release(1100) → null, idle', () => {
    const g = new ResizeGesture();
    expect(g.release(1100)).toBeNull();
    expect(g.phase).toBe('idle');
  });
  it('U-RSZ-04 idle · cancel() → null, idle', () => {
    const g = new ResizeGesture();
    expect(g.cancel()).toBeNull();
    expect(g.phase).toBe('idle');
  });
  it('U-RSZ-05 idle · lose() → null, idle', () => {
    const g = new ResizeGesture();
    expect(g.lose()).toBeNull();
    expect(g.phase).toBe('idle');
  });
  it('U-RSZ-06 idle · consumeClick() → false, idle', () => {
    const g = new ResizeGesture();
    expect(g.consumeClick()).toBe(false);
    expect(g.phase).toBe('idle');
  });
  // ── pressed ──
  it('U-RSZ-07 pressed · press(5,…) → 무시, pressed, column 3', () => {
    const g = P();
    g.press(5, 120, 500, B);
    expect(g.phase).toBe('pressed');
    expect(g.column).toBe(3);
    expect(g.move(1010)).toBe(190); // 시작 폭·x 도 첫 누름 그대로
  });
  it('U-RSZ-08 pressed · move(1001) → 181, dragging (문턱 없음)', () => {
    const g = P();
    expect(g.move(1001)).toBe(181);
    expect(g.phase).toBe('dragging');
  });
  it('U-RSZ-09 pressed · move(1000) 제자리 → null, pressed', () => {
    const g = P();
    expect(g.move(1000)).toBeNull();
    expect(g.phase).toBe('pressed');
  });
  it('U-RSZ-10 pressed · release(1000) → null, swallowing', () => {
    const g = P();
    expect(g.release(1000)).toBeNull();
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-10b pressed · release(다른 x) — 움직임 이벤트 없이 놓음 → 놓는 x 로 폭 확정, swallowing (검토 G-1·T-4)', () => {
    const g = new ResizeGesture();
    g.press(0, 100, 500, B);
    expect(g.release(560)).toEqual({ ci: 0, width: 160 });
    expect(g.phase).toBe('swallowing');
    expect(g.consumeClick()).toBe(true);
    // 한계도 그대로 적용
    const h = P();
    expect(h.release(500)).toEqual({ ci: 3, width: 40 });
  });
  it('U-RSZ-11 pressed · cancel() → null, idle (Q-25)', () => {
    const g = P();
    expect(g.cancel()).toBeNull();
    expect(g.phase).toBe('idle');
    expect(g.consumeClick()).toBe(false);
  });
  it('U-RSZ-12 pressed · lose() → null, idle (Q-25)', () => {
    const g = P();
    expect(g.lose()).toBeNull();
    expect(g.phase).toBe('idle');
  });
  it('U-RSZ-13 pressed · consumeClick() → true, idle', () => {
    const g = P();
    expect(g.consumeClick()).toBe(true);
    expect(g.phase).toBe('idle');
  });
  // ── dragging ──
  it('U-RSZ-14 dragging · press(5,…) → 무시, dragging, column 3', () => {
    const g = P();
    g.move(1100);
    g.press(5, 120, 500, B);
    expect(g.phase).toBe('dragging');
    expect(g.column).toBe(3);
    expect(g.move(1200)).toBe(380);
  });
  it('U-RSZ-15 dragging · move(1200) → 380, dragging', () => {
    const g = P();
    g.move(1100);
    expect(g.move(1200)).toBe(380);
    expect(g.phase).toBe('dragging');
  });
  it('U-RSZ-16 dragging · release(1200) → {ci:3, width:380}, swallowing', () => {
    const g = P();
    g.move(1100);
    expect(g.release(1200)).toEqual({ ci: 3, width: 380 });
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-17 dragging · cancel() → {ci:3, width:180}, swallowing (Q-25)', () => {
    const g = P();
    g.move(1300);
    expect(g.cancel()).toEqual({ ci: 3, width: 180 });
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-18 dragging · lose() → {ci:3, width:280}, swallowing', () => {
    const g = P();
    g.move(1100);
    expect(g.lose()).toEqual({ ci: 3, width: 280 });
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-19 dragging · consumeClick() → true, dragging (끄는 중 정렬로 넘어가는 길 없음)', () => {
    const g = P();
    g.move(1100);
    expect(g.consumeClick()).toBe(true);
    expect(g.phase).toBe('dragging');
    expect(g.move(1150)).toBe(330);
  });
  // ── swallowing ──
  it('U-RSZ-20 swallowing · press(5,120,500) → pressed, column 5 (새 제스처가 이김)', () => {
    const g = S16();
    g.press(5, 120, 500, B);
    expect(g.phase).toBe('pressed');
    expect(g.column).toBe(5);
    expect(g.move(510)).toBe(130);
  });
  it('U-RSZ-21 swallowing · move(1300) → null, swallowing', () => {
    const g = S16();
    expect(g.move(1300)).toBeNull();
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-22 swallowing · release(1300) → null, swallowing', () => {
    const g = S16();
    expect(g.release(1300)).toBeNull();
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-23 swallowing · cancel() → null, swallowing (놓은 뒤 Esc 는 안 되돌림)', () => {
    const g = S16();
    expect(g.cancel()).toBeNull();
    expect(g.phase).toBe('swallowing');
    expect(g.lose()).toBeNull();
    expect(g.phase).toBe('swallowing');
  });
  it('U-RSZ-24 swallowing · consumeClick() 두 번 → true·idle, false·idle', () => {
    const g = S16();
    expect(g.consumeClick()).toBe(true);
    expect(g.phase).toBe('idle');
    expect(g.consumeClick()).toBe(false);
    expect(g.phase).toBe('idle');
  });
});

describe('ResizeGesture — 그 밖의 경우 (U-RSZ-25~40)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('U-RSZ-25 최소 폭 — P → move(500) → 40', () => {
    expect(P().move(500)).toBe(40);
  });
  it('U-RSZ-26 최대 폭 — max 300 → move(1500) → 300', () => {
    const g = new ResizeGesture();
    g.press(3, 180, 1000, { min: 40, max: 300 });
    expect(g.move(1500)).toBe(300);
  });
  it('U-RSZ-27 한계에서 더 밈 — move(500)(40) → move(400) → null', () => {
    const g = P();
    expect(g.move(500)).toBe(40);
    expect(g.move(400)).toBeNull();
    expect(g.phase).toBe('dragging');
  });
  it('U-RSZ-28 한계에서 돌아옴 — move(500) → move(870) → 50 (누적 오차 없음)', () => {
    const g = P();
    g.move(500);
    expect(g.move(870)).toBe(50);
  });
  it('U-RSZ-29 소수 x — move(1000.5) → 180.5 (반올림 안 함)', () => {
    expect(P().move(1000.5)).toBe(180.5);
  });
  it('U-RSZ-30 commit ≤ 1 — move → release → release → lose: 둘째부터 null', () => {
    const g = P();
    g.move(1100);
    expect(g.release(1100)).toEqual({ ci: 3, width: 280 });
    expect(g.release(1150)).toBeNull();
    expect(g.lose()).toBeNull();
  });
  it('U-RSZ-31 취소 뒤 click — move(1100) → cancel → consumeClick → true (Q-25)', () => {
    const g = P();
    g.move(1100);
    g.cancel();
    expect(g.consumeClick()).toBe(true);
    expect(g.phase).toBe('idle');
  });
  it('U-RSZ-32 column 값 — idle −1 / P 뒤 3 / 24 뒤 −1', () => {
    expect(new ResizeGesture().column).toBe(-1);
    expect(P().column).toBe(3);
    const g = S16();
    g.consumeClick();
    expect(g.column).toBe(-1);
    const c = P(); c.cancel();
    expect(c.column).toBe(-1);
  });
  it('U-RSZ-33 시작 폭이 최소보다 작음 — press(3,30,…) → move(1001) → 40', () => {
    const g = new ResizeGesture();
    g.press(3, 30, 1000, B);
    expect(g.move(1001)).toBe(40);
  });
  it('U-RSZ-34 잘못된 한계 {min:300, max:100} → press 가 RangeError, 상태 그대로', () => {
    const g = new ResizeGesture();
    expect(() => g.press(3, 180, 1000, { min: 300, max: 100 })).toThrow(RangeError);
    expect(g.phase).toBe('idle');
    expect(g.column).toBe(-1);
  });

  it('U-RSZ-35 성질 무작위 — 씨앗 8 × 5,000 사건', () => {
    const PHASES: ResizePhase[] = ['idle', 'pressed', 'dragging', 'swallowing'];
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      const g = new ResizeGesture();
      let bounds: ResizeBounds = B;
      let commitsSincePress = 0;
      let swallowTruesSinceCommit = 0;
      let commitSeen = false;
      for (let k = 0; k < 5000; k++) {
        const before = g.phase;
        const ev = Math.floor(r() * 7);
        const x = Math.round(r() * 2000 * 2) / 2;
        if (ev === 0) {
          const min = Math.floor(r() * 100);
          const nb: ResizeBounds = { min, max: r() < 0.5 ? Infinity : min + Math.floor(r() * 500) };
          const wasNewGesture = before === 'idle' || before === 'swallowing';
          g.press(Math.floor(r() * 10), Math.floor(r() * 400), x, nb);
          // 누름이 받아들여졌을 때만(새 제스처) 한계가 바뀐다 — 진행 중 누름은 무시된다(U-RSZ-07·14)
          if (wasNewGesture) { bounds = nb; commitsSincePress = 0; commitSeen = false; swallowTruesSinceCommit = 0; }
        } else if (ev === 1 || ev === 6) {
          const w = g.move(x);
          // ① dragging 아닐 때 move 는 null (pressed 에서 x 가 바뀌면 그 사건으로 dragging 이 됨)
          if (before !== 'pressed' && before !== 'dragging') expect(w).toBeNull();
          if (w !== null) {
            expect(g.phase).toBe('dragging');
            // ② 낸 폭은 늘 [min, max]
            expect(w).toBeGreaterThanOrEqual(bounds.min);
            expect(w).toBeLessThanOrEqual(bounds.max);
          }
        } else if (ev === 2 || ev === 4) {
          const res = ev === 2 ? g.release(x) : g.lose();
          if (res) {
            commitsSincePress++;
            expect(res.width).toBeGreaterThanOrEqual(bounds.min);
            expect(res.width).toBeLessThanOrEqual(bounds.max);
          }
          if (before === 'dragging' || (ev === 2 && before === 'pressed')) { commitSeen = true; swallowTruesSinceCommit = 0; }
          // ③ press 와 다음 press 사이 non-null release+lose ≤ 1
          expect(commitsSincePress).toBeLessThanOrEqual(1);
        } else if (ev === 3) {
          g.cancel();
          if (before === 'dragging') { commitSeen = true; swallowTruesSinceCommit = 0; }
        } else {
          const t = g.consumeClick();
          if (t) {
            // ⑥ (경우변경) consumeClick true 뒤 phase 는 idle — 단 끄는 중이었으면 끄기를 그대로 잇는다(U-RSZ-19)
            expect(g.phase).toBe(before === 'dragging' ? 'dragging' : 'idle');
            if (commitSeen && before === 'swallowing') swallowTruesSinceCommit++;
          }
          // ④ 놓음(release·lose·cancel) 하나당 consumeClick true ≤ 1
          expect(swallowTruesSinceCommit).toBeLessThanOrEqual(1);
        }
        // ⑤ phase ∈ 4값
        expect(PHASES).toContain(g.phase);
        if (g.phase === 'idle') expect(g.column).toBe(-1);
      }
    }
  });

  it('U-RSZ-36 시계·DOM 없음 — setTimeout·Date.now·performance.now 호출 0', () => {
    const st = vi.spyOn(globalThis, 'setTimeout');
    const dn = vi.spyOn(Date, 'now');
    const pn = vi.spyOn(performance, 'now');
    const g = P();
    g.move(1100); g.move(1200); g.release(1250); g.consumeClick();
    g.press(1, 100, 0, B); g.move(10); g.lose(); g.expireSwallow();
    g.press(1, 100, 0, B); g.move(10); g.cancel(); g.consumeClick();
    expect(st).toHaveBeenCalledTimes(0);
    expect(dn).toHaveBeenCalledTimes(0);
    expect(pn).toHaveBeenCalledTimes(0);
    expect(typeof (globalThis as any).document).toBe('undefined');
  });

  it('U-RSZ-37 놓음이 오래 남음 — lose 뒤 click 이 안 옴 → expireSwallow → 다음 click 은 정렬됨', () => {
    const g = P();
    g.move(1100);
    g.lose();
    expect(g.phase).toBe('swallowing');
    g.expireSwallow();
    expect(g.phase).toBe('idle');
    expect(g.consumeClick()).toBe(false);
    // 다음 press 도 놓음을 끝낸다
    const h = P(); h.move(1100); h.lose();
    h.press(4, 100, 0, B);
    expect(h.phase).toBe('pressed');
    expect(h.column).toBe(4);
    // swallowing 이 아닐 때 expireSwallow 는 아무것도 안 함
    const d = P(); d.move(1100); d.expireSwallow();
    expect(d.phase).toBe('dragging');
    const p = P(); p.expireSwallow();
    expect(p.phase).toBe('pressed');
  });

  it('U-RSZ-38 minWidth 무시(지금 동작) — boundsOf 의 {40, ∞} 로 −500 끌면 40', () => {
    // 컬럼 정의 minWidth:100 이어도 IResizeSink.boundsOf 는 {40, ∞}(M1) — 상태 기계는 받은 한계만 안다
    const sinkBounds: ResizeBounds = { min: 40, max: Infinity };
    const g = new ResizeGesture();
    g.press(0, 150, 1000, sinkBounds);
    expect(g.move(500)).toBe(40);
    expect(g.release(500)).toEqual({ ci: 0, width: 40 });
  });

  it('U-RSZ-39 마지막 move 와 다른 x 에서 놓기 — move(1200) → release(1250) → {ci:3, width:430}', () => {
    const g = P();
    expect(g.move(1200)).toBe(380);
    expect(g.release(1250)).toEqual({ ci: 3, width: 430 });
  });

  it('U-RSZ-41 유한수 아닌 x 는 폭을 바꾸지 않는다 — 한계 불변을 NaN 이 못 뚫음 (검토 G-2·T-4)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      // pressed 에서 move(NaN) → 없던 사건(pressed 그대로)
      const a = P();
      expect(a.move(bad)).toBeNull();
      expect(a.phase).toBe('pressed');
      // dragging 에서 move(NaN) → null, 폭 그대로, 다음 move 는 정상
      const b = P();
      b.move(1100);
      expect(b.move(bad)).toBeNull();
      expect(b.phase).toBe('dragging');
      expect(b.move(1150)).toBe(330);
      // dragging 에서 release(NaN) → 마지막 유효 폭으로 확정(제스처는 끝남 — 상태가 남지 않게)
      expect(b.release(bad)).toEqual({ ci: 3, width: 330 });
      expect(b.phase).toBe('swallowing');
      // pressed 에서 release(NaN) → 같은 x 에서 놓은 것과 같음(null · swallowing)
      const c = P();
      expect(c.release(bad)).toBeNull();
      expect(c.phase).toBe('swallowing');
      // 좌표·시작 폭이 숫자가 아닌 press 는 받지 않음
      const d = new ResizeGesture();
      d.press(1, 100, bad, B);
      expect(d.phase).toBe('idle');
      d.press(1, bad, 10, B);
      expect(d.phase).toBe('idle');
      expect(d.column).toBe(-1);
    }
  });

  it('U-RSZ-40 expireSwallow(=TR-13 dismiss) — move(1100) → lose → expireSwallow → consumeClick false · idle', () => {
    const g = P();
    g.move(1100);
    g.lose();
    g.expireSwallow();
    expect(g.consumeClick()).toBe(false);
    expect(g.phase).toBe('idle');
  });
});
