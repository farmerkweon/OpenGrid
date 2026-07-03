import { describe, it, expect } from 'vitest';
import { niceScale, niceNum } from '../../../src/core/chart/scales';

describe('scales — niceNum', () => {
  it('round=false 는 느슨한 상한 방향으로 1/2/5/10 계열 반환', () => {
    expect(niceNum(97, false)).toBe(100);
    expect(niceNum(24, false)).toBe(50);
  });
  it('round=true 는 가장 가까운 1/2/5/10 계열 반환', () => {
    expect(niceNum(20, true)).toBe(20);
    expect(niceNum(12.5, true)).toBe(10);
  });
  it('0 입력은 0 반환(안전)', () => {
    expect(niceNum(0, false)).toBe(0);
  });
});

describe('scales — niceScale (§8.1 대표 입력 자동검증)', () => {
  it('[0,97] → [0,20,40,60,80,100], 6 tick (설계서 문서화 예시)', () => {
    const s = niceScale(0, 97);
    expect(s.ticks).toEqual([0, 20, 40, 60, 80, 100]);
    expect(s.ticks.length).toBe(6);
  });

  it('[0,1] → 6 tick, step=0.2', () => {
    const s = niceScale(0, 1);
    expect(s.ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('[0,10] → 6 tick, step=2', () => {
    const s = niceScale(0, 10);
    expect(s.ticks).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('tick 수 불변식 ∈[5,6] — 대표(min=0) 입력 집합', () => {
    for (const max of [1, 10, 45, 97, 200, 999]) {
      const s = niceScale(0, max);
      expect(s.ticks.length).toBeGreaterThanOrEqual(5);
      expect(s.ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it('degenerate(min===max, 0) 는 인위 확장해 유효한 스케일을 낸다', () => {
    const s = niceScale(0, 0);
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.ticks.length).toBeGreaterThan(1);
  });

  it('degenerate(min===max, 비0) 도 인위 확장한다', () => {
    const s = niceScale(50, 50);
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.min).toBeLessThan(50);
    expect(s.max).toBeGreaterThan(50);
  });

  it('min>max 로 뒤바뀐 입력도 정렬해 처리한다', () => {
    const s = niceScale(97, 0);
    expect(s.ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('음수 구간도 안전하게 스케일을 낸다', () => {
    const s = niceScale(-10, -1);
    expect(s.min).toBeLessThanOrEqual(-10);
    expect(s.max).toBeGreaterThanOrEqual(-1);
    expect(s.ticks[0]).toBe(s.min);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
  });

  it('부동소수 오차 없이 정갈한 tick 값을 낸다', () => {
    const s = niceScale(0, 0.3);
    for (const t of s.ticks) {
      expect(Number.isFinite(t)).toBe(true);
      // 소수점 표기가 지저분하지 않아야 한다(예: 0.30000000000000004 금지)
      expect(t.toString().replace('-', '').length).toBeLessThanOrEqual(6);
    }
  });
});
