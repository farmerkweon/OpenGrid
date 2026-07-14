// DD-13 §2.4 결정론 렌더 이음새 — DeterminismKernel (REQ-TX-825)
import { describe, it, expect } from 'vitest';
import {
  DeterminismKernel, SeededRandom, FakeClock, SystemClock,
} from '../../../src/core/quality/DeterminismKernel.js';

describe('SeededRandom — 시드 결정론', () => {
  it('동일 시드 → 동일 수열', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const n of seqA) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
  });

  it('seed() 재설정 → 수열 재현', () => {
    const r = new SeededRandom(1);
    const first = [r.next(), r.next(), r.next()];
    r.seed(1);
    expect([r.next(), r.next(), r.next()]).toEqual(first);
  });

  it('다른 시드 → 다른 수열', () => {
    const a = new SeededRandom(1); const b = new SeededRandom(2);
    expect(a.next()).not.toBe(b.next());
  });
});

describe('FakeClock — 수동 전진·raf 결정론 flush', () => {
  it('advance 로 시간 전진 + 예약 raf 결정론 실행', () => {
    const clock = new FakeClock(1000);
    const seen: number[] = [];
    clock.raf(t => seen.push(t));
    clock.raf(t => seen.push(t + 1));
    expect(clock.now()).toBe(1000);
    clock.advance(16);
    expect(clock.now()).toBe(1016);
    expect(seen).toEqual([1016, 1017]); // 등록 순서·현재 시각 전달
  });

  it('cancelRaf 는 콜백 제거', () => {
    const clock = new FakeClock();
    let ran = false;
    const id = clock.raf(() => { ran = true; });
    clock.cancelRaf(id);
    clock.flushRaf();
    expect(ran).toBe(false);
  });
});

describe('DeterminismKernel — 동일 입력→동일 출력', () => {
  it('주입 clock/RNG 동일 → 동일 렌더 산출(결정론)', () => {
    // "렌더"를 clock+RNG 로 결정되는 순수 산출로 모델링. 동일 주입 → 동일 결과.
    const render = () => {
      const kernel = new DeterminismKernel(new FakeClock(500), new SeededRandom(7));
      return {
        t: kernel.clock.now(),
        noise: [kernel.random.next(), kernel.random.next()],
      };
    };
    expect(render()).toEqual(render());
  });

  it('assertPure: 순수 함수는 통과', () => {
    const kernel = new DeterminismKernel(new FakeClock(), new SeededRandom(1));
    expect(() => kernel.assertPure(() => ({ a: 1, b: [2, 3] }))).not.toThrow();
  });

  it('assertPure: 비순수(외부 상태 의존) 함수는 throw', () => {
    const kernel = new DeterminismKernel(new FakeClock(), new SeededRandom(1));
    let counter = 0;
    expect(() => kernel.assertPure(() => ({ n: counter++ }))).toThrow(/순수성 위반/);
  });

  it('stableStringify: 키 순서 무관 동일 직렬화', () => {
    const kernel = new DeterminismKernel(new FakeClock(), new SeededRandom(1));
    const s1 = kernel.stableStringify({ b: 1, a: 2, c: { z: 9, y: 8 } });
    const s2 = kernel.stableStringify({ c: { y: 8, z: 9 }, a: 2, b: 1 });
    expect(s1).toBe(s2);
  });

  it('whenIdle: FakeClock 보류 raf 를 flush 후 resolve', async () => {
    const clock = new FakeClock();
    const kernel = new DeterminismKernel(clock, new SeededRandom(1));
    let flushed = false;
    clock.raf(() => { flushed = true; });
    await kernel.whenIdle();
    expect(flushed).toBe(true);
  });
});

describe('SystemClock — 헤드리스 폴백 존재', () => {
  it('now 는 유한 수, raf/cancelRaf 는 폴백 동작(throw 없음)', () => {
    const clock = new SystemClock();
    expect(Number.isFinite(clock.now())).toBe(true);
    const id = clock.raf(() => {});
    expect(() => clock.cancelRaf(id)).not.toThrow();
  });
});
