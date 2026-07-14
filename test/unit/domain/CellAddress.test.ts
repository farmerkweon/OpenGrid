import { describe, it, expect } from 'vitest';
import { CellAddress, CellRange } from '../../../src/core/domain/CellAddress.js';

describe('CellAddress — A1 ↔ R1C1 동치·클램프', () => {
  it('parseA1 "B3" → (row=2, col=1)', () => {
    const a = CellAddress.parseA1('B3');
    expect(a.row).toBe(2);
    expect(a.col).toBe(1);
  });
  it('toA1 / toR1C1 왕복', () => {
    const a = CellAddress.of(2, 1);
    expect(a.toA1()).toBe('B3');
    expect(a.toR1C1()).toBe('R3C2');
    expect(CellAddress.parseA1(a.toA1()).equals(a)).toBe(true);
  });
  it('AA1 (26열 넘김)', () => {
    expect(CellAddress.of(0, 26).toA1()).toBe('AA1');
    expect(CellAddress.parseA1('AA1').col).toBe(26);
  });
  it('음수 인덱스 → 0 클램프', () => {
    const a = CellAddress.of(-5, -3);
    expect(a.row).toBe(0);
    expect(a.col).toBe(0);
  });
  it('compareTo 행 우선', () => {
    expect(CellAddress.of(0, 5).compareTo(CellAddress.of(1, 0))).toBeLessThan(0);
    expect(CellAddress.of(1, 0).compareTo(CellAddress.of(1, 1))).toBeLessThan(0);
  });
});

describe('CellRange — 정규화 불변식', () => {
  it('역방향 드래그 → (min→max) 정규화', () => {
    const r = CellRange.of(CellAddress.of(5, 5), CellAddress.of(1, 2));
    expect(r.start.row).toBe(1);
    expect(r.start.col).toBe(2);
    expect(r.end.row).toBe(5);
    expect(r.end.col).toBe(5);
  });
  it('contains', () => {
    const r = CellRange.of(CellAddress.of(0, 0), CellAddress.of(3, 3));
    expect(r.contains(CellAddress.of(2, 2))).toBe(true);
    expect(r.contains(CellAddress.of(4, 2))).toBe(false);
  });
  it('intersects', () => {
    const a = CellRange.of(CellAddress.of(0, 0), CellAddress.of(2, 2));
    const b = CellRange.of(CellAddress.of(2, 2), CellAddress.of(4, 4));
    const c = CellRange.of(CellAddress.of(5, 5), CellAddress.of(6, 6));
    expect(a.intersects(b)).toBe(true);
    expect(a.intersects(c)).toBe(false);
  });
  it('normalizeSet: 겹치는 범위 병합', () => {
    const set = CellRange.normalizeSet([
      CellRange.of(CellAddress.of(0, 0), CellAddress.of(2, 2)),
      CellRange.of(CellAddress.of(1, 1), CellAddress.of(3, 3)),
    ]);
    expect(set.length).toBe(1);
  });
  it('normalizeSet: 분리된 범위 유지', () => {
    const set = CellRange.normalizeSet([
      CellRange.of(CellAddress.of(0, 0), CellAddress.of(1, 1)),
      CellRange.of(CellAddress.of(5, 5), CellAddress.of(6, 6)),
    ]);
    expect(set.length).toBe(2);
  });
  it('equals/hashKey/textEquivalent', () => {
    const r = CellRange.of(CellAddress.of(0, 0), CellAddress.of(2, 1));
    expect(r.textEquivalent()).toBe('A1:B3');
    expect(r.equals(CellRange.of(CellAddress.of(0, 0), CellAddress.of(2, 1)))).toBe(true);
  });
});
