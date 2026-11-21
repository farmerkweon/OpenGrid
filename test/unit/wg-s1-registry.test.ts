// @vitest-environment node
/**
 * 걸음 S1 — `CellRegistry` 단위 경우 U-REG-01~07 (테스트 설계서 §2-25, 환경 N: 가짜 요소 — DOM 없이 도는지 증명).
 * U-REG-08·09(실제 그리드)는 wg-s1-split.test.ts(J). L19(TEST), 코드 검토 REVIEW_CODE_S1.md 찾은 것 1.
 * 뒤 걸음(R4 GeometryApplier 가 끄는 동안 cellsOfColumn 으로 칸을 찾음)이 이 위에 선다.
 */
import { describe, it, expect } from 'vitest';
import { CellRegistry } from '../../src/core/render/body/CellRegistry.js';

/** 가짜 요소 — 지도는 요소의 무엇도 읽지 않으므로 이름표 객체면 된다. */
const el = (name: string) => ({ name }) as unknown as HTMLElement;
const names = (it: Iterable<HTMLElement>) => Array.from(it, e => (e as any).name).sort();

function base(): { r: CellRegistry; a: HTMLElement; b: HTMLElement; c: HTMLElement } {
  const r = new CellRegistry();
  const a = el('0,0'), b = el('0,1'), c = el('1,0');
  r.set(0, 0, a); r.set(0, 1, b); r.set(1, 0, c);
  return { r, a, b, c };
}

describe('U-REG CellRegistry (node)', () => {
  it('U-REG-01 set/get — (0,0)·(0,1)·(1,0) 셋 다 돌려주고 size 3', () => {
    const { r, a, b, c } = base();
    expect(r.get(0, 0)).toBe(a);
    expect(r.get(0, 1)).toBe(b);
    expect(r.get(1, 0)).toBe(c);
    expect(r.size).toBe(3);
  });

  it('U-REG-02 cellsOfColumn — 컬럼 0 → 두 요소, 컬럼 1 → 하나', () => {
    const { r } = base();
    expect(names(r.cellsOfColumn(0))).toEqual(['0,0', '1,0']);
    expect(names(r.cellsOfColumn(1))).toEqual(['0,1']);
  });

  it('U-REG-03 dropRow(0) — (0,0)·(0,1) 없음 · size 1 · cellsOfColumn(0) 하나', () => {
    const { r } = base();
    r.dropRow(0);
    expect(r.get(0, 0)).toBeUndefined();
    expect(r.get(0, 1)).toBeUndefined();
    expect(r.size).toBe(1);
    expect(names(r.cellsOfColumn(0))).toEqual(['1,0']);
  });

  it('U-REG-04 dropColumn(1,0) — (1,0) 없음, 나머지 그대로', () => {
    const { r, a, b } = base();
    r.dropColumn(1, 0);
    expect(r.get(1, 0)).toBeUndefined();
    expect(r.get(0, 0)).toBe(a);
    expect(r.get(0, 1)).toBe(b);
    expect(r.size).toBe(2);
    expect(names(r.cellsOfColumn(0))).toEqual(['0,0']);
  });

  it('U-REG-05 clear — size 0', () => {
    const { r } = base();
    r.clear();
    expect(r.size).toBe(0);
    expect(names(r.cellsOfColumn(0))).toEqual([]);
  });

  it('U-REG-06 같은 자리 두 번 — 새 요소로 바뀜 · size 그대로 · cellsOfColumn(0) 에 옛 요소 없음', () => {
    const { r, a } = base();
    const a2 = el('0,0-new');
    r.set(0, 0, a2);
    expect(r.get(0, 0)).toBe(a2);
    expect(r.size).toBe(3);
    const col0 = Array.from(r.cellsOfColumn(0));
    expect(col0).not.toContain(a);
    expect(names(col0)).toEqual(['0,0-new', '1,0']);
  });

  it('U-REG-07 없는 자리 — get(9,9) undefined · dropRow(9) · dropColumn(9,9) 던지지 않음', () => {
    const { r } = base();
    expect(r.get(9, 9)).toBeUndefined();
    expect(() => r.dropRow(9)).not.toThrow();
    expect(() => r.dropColumn(9, 9)).not.toThrow();
    expect(r.size).toBe(3);
  });
});
