// DD-07 §2.4 신선도 시계 — fresh/stale 파생·전이 통지. / DD-07 §2.4 freshness clock.
import { describe, it, expect } from 'vitest';
import { FreshnessClock } from '../../../src/core/realtime/index.js';
import type { FreshnessSnapshot } from '../../../src/core/realtime/index.js';

describe('DD-07 FreshnessClock — 시효 파생', () => {
  it('수신 전 = stale(신선도 미확립)', () => {
    let t = 0;
    const fc = new FreshnessClock({ staleAfterMs: 1000, now: () => t });
    const s = fc.compute();
    expect(s.state).toBe('stale');
    expect(s.ageMs).toBe(Infinity);
  });

  it('markReceived 후 임계 이내 = fresh, 초과 = stale', () => {
    let t = 0;
    const fc = new FreshnessClock({ staleAfterMs: 1000, now: () => t });
    fc.markReceived(0);
    t = 500;
    expect(fc.compute().state).toBe('fresh');
    t = 1500;
    expect(fc.compute().state).toBe('stale');
    expect(fc.compute().ageMs).toBe(1500);
  });

  it('연결과 독립 — 재수신 시 fresh 로 리셋', () => {
    let t = 0;
    const fc = new FreshnessClock({ staleAfterMs: 1000, now: () => t });
    fc.markReceived(0);
    t = 2000;
    expect(fc.compute().state).toBe('stale');
    fc.markReceived(2000);
    expect(fc.compute().state).toBe('fresh');
  });

  it('onChange 는 전이 시에만 발화(tick 으로 재평가)', () => {
    let t = 0;
    const fc = new FreshnessClock({ staleAfterMs: 1000, now: () => t });
    const events: FreshnessSnapshot[] = [];
    fc.onChange((f) => events.push(f));
    fc.markReceived(0); // stale→fresh 전이 1회
    expect(events).toHaveLength(1);
    expect(events[0]!.state).toBe('fresh');
    t = 2000;
    fc.tick(); // fresh→stale 전이 1회
    expect(events).toHaveLength(2);
    expect(events[1]!.state).toBe('stale');
    fc.tick(); // 전이 없음 — 무발화
    expect(events).toHaveLength(2);
  });
});
