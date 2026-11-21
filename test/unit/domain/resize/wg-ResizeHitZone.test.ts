// @vitest-environment node
// 넓은 그리드 새 그물 — ResizeHitZone(경계 ±6px 손잡이 판정, 걸음 C4 — U-RHB-H1~H3·14·16·17 의 헤드리스 판정 몫 · V14).
import { describe, it, expect } from 'vitest';
import { ResizeHitZone, RESIZE_HIT_HALF_PX } from '../../../../src/core/domain/resize/ResizeHitZone.js';

const z = new ResizeHitZone();
const all = () => true;

describe('ResizeHitZone — 경계 ±6px (C4)', () => {
  it('C4-HZ-01 오른쪽 경계 쪽 — 경계에서 0~6px 안(끝 포함)이면 그 컬럼', () => {
    expect(RESIZE_HIT_HALF_PX).toBe(6);
    for (const d of [0, 1, 3, 6]) expect(z.columnFor(120 - d, 120, 4, all)).toBe(4);
    expect(z.columnFor(120 - 7, 120, 4, all)).toBe(-1);
  });

  it('C4-HZ-02 왼쪽 경계 쪽 — 0~6px 안이면 앞 컬럼(앞 컬럼 손잡이)', () => {
    for (const x of [0, 1, 3, 6]) expect(z.columnFor(x, 120, 4, all)).toBe(3);
    expect(z.columnFor(7, 120, 4, all)).toBe(-1);
  });

  it('C4-HZ-03 가운데는 손잡이 아님', () => {
    expect(z.columnFor(60, 120, 4, all)).toBe(-1);
  });

  it('C4-HZ-04 첫 잎 컬럼 왼쪽 — 앞 컬럼 없음(여분 칸 쪽)', () => {
    expect(z.columnFor(2, 120, 0, all)).toBe(-1);
  });

  it('C4-HZ-05 끌 수 없는 컬럼 — 자기 오른쪽도, 그 뒤 칸의 왼쪽(앞 컬럼 손잡이)도 아님', () => {
    const can = (ci: number) => ci !== 1;
    expect(z.columnFor(118, 120, 1, can)).toBe(-1);
    expect(z.columnFor(2, 120, 2, can)).toBe(-1);
    // 끌 수 없는 칸의 왼쪽은 앞 컬럼(0)이 끌 수 있으면 손잡이
    expect(z.columnFor(2, 120, 1, can)).toBe(0);
  });

  it('C4-HZ-06 마지막 컬럼 오른쪽 끝 — 그 컬럼', () => {
    expect(z.columnFor(119, 120, 49, all)).toBe(49);
  });

  it('C4-HZ-07 아주 좁은 칸(두 경계가 다 가까움) — 더 가까운 경계', () => {
    expect(z.columnFor(2, 8, 5, all)).toBe(4);
    expect(z.columnFor(6, 8, 5, all)).toBe(5);
  });

  it('C4-HZ-08 숫자 아님·음수 잎 — −1', () => {
    expect(z.columnFor(NaN, 120, 3, all)).toBe(-1);
    expect(z.columnFor(3, NaN, 3, all)).toBe(-1);
    expect(z.columnFor(3, 120, -1, all)).toBe(-1);
  });

  it('C4-HZ-09 반폭을 바꿔 만들 수 있음(기본 6)', () => {
    const z2 = new ResizeHitZone(3);
    expect(z2.columnFor(4, 120, 2, all)).toBe(-1);
    expect(z2.columnFor(3, 120, 2, all)).toBe(1);
  });
});
