// DD-07 §2.4 지수 backoff(순수) — 지연 성장·상한·jitter·소진. / DD-07 §2.4 exponential backoff.
import { describe, it, expect } from 'vitest';
import { nextBackoffDelay, backoffExhausted } from '../../../src/core/realtime/index.js';
import type { BackoffPolicy } from '../../../src/core/realtime/index.js';

const policy: BackoffPolicy = { baseMs: 100, factor: 2, maxMs: 5000 };

describe('DD-07 nextBackoffDelay — 지수 성장·상한', () => {
  it('attempt 0..n 지수 성장', () => {
    expect(nextBackoffDelay(policy, 0)).toBe(100);
    expect(nextBackoffDelay(policy, 1)).toBe(200);
    expect(nextBackoffDelay(policy, 2)).toBe(400);
    expect(nextBackoffDelay(policy, 3)).toBe(800);
  });

  it('maxMs 상한 클램프', () => {
    expect(nextBackoffDelay(policy, 20)).toBe(5000);
  });

  it('jitter 는 [0.5,1.0]배 범위(주입 random 결정론)', () => {
    const jp: BackoffPolicy = { ...policy, jitter: true };
    expect(nextBackoffDelay(jp, 2, () => 0)).toBe(200); // 400 * 0.5
    expect(nextBackoffDelay(jp, 2, () => 1)).toBe(400); // 400 * 1.0 (approx; 0.5+1*0.5)
    const mid = nextBackoffDelay(jp, 2, () => 0.5);
    expect(mid).toBeGreaterThanOrEqual(200);
    expect(mid).toBeLessThanOrEqual(400);
  });
});

describe('DD-07 backoffExhausted — 최대 시도 소진', () => {
  it('maxAttempts 미지정=무한(소진 없음)', () => {
    expect(backoffExhausted(policy, 999)).toBe(false);
  });
  it('maxAttempts 도달 시 소진', () => {
    const p: BackoffPolicy = { ...policy, maxAttempts: 3 };
    expect(backoffExhausted(p, 2)).toBe(false);
    expect(backoffExhausted(p, 3)).toBe(true);
    expect(backoffExhausted(p, 4)).toBe(true);
  });
});
