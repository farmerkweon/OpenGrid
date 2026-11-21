// @vitest-environment node
/**
 * 넓은 그리드 새 그물 — ColumnWindow(값) 단위 시험. 테스트 설계서 §2-3 U-WIN-01~12.
 * (U-WIN-13~19 는 유령 번호 — TR-09 로 「01~12·20~49」 로 고쳐 적음, 경우 없음.)
 */
import { describe, it, expect } from 'vitest';
import { ColumnWindow } from '../../../src/core/coordinate/ColumnWindow.js';
import type { LeafColIndex } from '../../../src/core/coordinate/types.js';
import type { WindowSegment } from '../../../src/core/coordinate/geometryPorts.js';

const seg = (from: number, to: number): WindowSegment => ({ from: from as LeafColIndex, to: to as LeafColIndex });
const plain = (s: readonly WindowSegment[]) => s.map((x) => [x.from, x.to]);
const visit = (w: ColumnWindow): number[] => {
  const out: number[] = [];
  w.forEachColumn((ci) => out.push(ci));
  return out;
};

describe('ColumnWindow — U-WIN-01~12', () => {
  it('U-WIN-01 full(5)', () => {
    const w = ColumnWindow.full(5);
    expect(w.full).toBe(true);
    expect(plain(w.segments)).toEqual([[0, 4]]);
    expect(w.gaps()).toEqual([]);
    for (let i = 0; i < 5; i++) expect(w.contains(i as LeafColIndex)).toBe(true);
    expect(visit(w)).toEqual([0, 1, 2, 3, 4]);
  });

  it('U-WIN-02 of 구간 둘', () => {
    const w = ColumnWindow.of([seg(0, 1), seg(10, 20)], 50);
    expect(w.full).toBe(false);
    expect(plain(w.gaps())).toEqual([[2, 9], [21, 49]]);
    expect(w.contains(5 as LeafColIndex)).toBe(false);
    expect(w.contains(15 as LeafColIndex)).toBe(true);
    expect(visit(w)).toEqual([0, 1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('U-WIN-03 왼쪽 빈칸(첫 구간 앞도 gaps 에 — Q-07 답)', () => {
    const w = ColumnWindow.of([seg(10, 20)], 50);
    expect(plain(w.gaps())).toEqual([[0, 9], [21, 49]]);
  });

  it('U-WIN-04 full(0)', () => {
    const w = ColumnWindow.full(0);
    expect(w.segments).toEqual([]);
    expect(w.gaps()).toEqual([]);
    expect(visit(w)).toEqual([]);
    expect(w.full).toBe(true);
  });

  it('U-WIN-05 다 덮는 of 는 full', () => {
    const w = ColumnWindow.of([seg(0, 49)], 50);
    expect(w.full).toBe(true);
    expect(w.equals(ColumnWindow.full(50))).toBe(true);
    // 붙은 두 구간도 같은 집합 — 정규형으로 합쳐 full (NOTES 정한 것 W-2)
    const w2 = ColumnWindow.of([seg(0, 9), seg(10, 49)], 50);
    expect(w2.full).toBe(true);
    expect(w2.equals(w)).toBe(true);
  });

  it('U-WIN-06 겹친 구간 → RangeError', () => {
    expect(() => ColumnWindow.of([seg(0, 5), seg(3, 8)], 50)).toThrow(RangeError);
  });

  it('U-WIN-07 거꾸로 순서 → RangeError', () => {
    expect(() => ColumnWindow.of([seg(10, 20), seg(0, 1)], 50)).toThrow(RangeError);
  });

  it('U-WIN-08 범위 밖 → RangeError', () => {
    expect(() => ColumnWindow.of([seg(40, 55)], 50)).toThrow(RangeError);
    expect(() => ColumnWindow.of([seg(-1, 3)], 50)).toThrow(RangeError);
    expect(() => ColumnWindow.of([seg(5, 4)], 50)).toThrow(RangeError);
    expect(() => ColumnWindow.of([seg(1.5, 4)], 50)).toThrow(RangeError);
    expect(() => ColumnWindow.full(-1)).toThrow(RangeError);
  });

  it('U-WIN-09 equals', () => {
    const a = ColumnWindow.of([seg(0, 1), seg(10, 20)], 50);
    const b = ColumnWindow.of([seg(0, 1), seg(10, 20)], 50);
    const c = ColumnWindow.of([seg(0, 1), seg(10, 21)], 50);
    const d = ColumnWindow.of([seg(0, 1), seg(11, 20)], 50);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.equals(d)).toBe(false);
    expect(ColumnWindow.full(5).equals(ColumnWindow.of([seg(0, 4)], 5))).toBe(true);
    expect(ColumnWindow.full(5).equals(ColumnWindow.full(6))).toBe(false);
    expect(ColumnWindow.full(0).equals(ColumnWindow.of([], 5))).toBe(false);
  });

  it('U-WIN-10 불변 값', () => {
    const src = [seg(0, 1), seg(10, 20)];
    const w = ColumnWindow.of(src, 50);
    expect(Object.isFrozen(w.segments)).toBe(true);
    for (const s of w.segments) expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(w.gaps())).toBe(true);
    for (const g of w.gaps()) expect(Object.isFrozen(g)).toBe(true);
    // 넘겨준 배열을 나중에 고쳐도 창은 그대로(사본을 든다)
    (src as WindowSegment[]).push(seg(30, 31));
    expect(plain(w.segments)).toEqual([[0, 1], [10, 20]]);
  });

  it('U-WIN-11 한 컬럼 창', () => {
    const w = ColumnWindow.of([seg(7, 7)], 50);
    expect(plain(w.gaps())).toEqual([[0, 6], [8, 49]]);
    expect(visit(w)).toEqual([7]);
  });

  it('U-WIN-12 맨 끝 붙은 창 — 오른쪽 빈칸 없음', () => {
    const w = ColumnWindow.of([seg(30, 49)], 50);
    expect(plain(w.gaps())).toEqual([[0, 29]]);
  });

  it('검토 T-2 창이 끝에서 한 칸 앞에서 끝남 — 마지막 컬럼 하나짜리 오른쪽 빈칸', () => {
    expect(plain(ColumnWindow.of([seg(0, 47)], 49).gaps())).toEqual([[48, 48]]);
    expect(ColumnWindow.of([seg(0, 47)], 49).count).toBe(49);
  });
});
