// @vitest-environment node
/**
 * U-SKC (걸음 R1 몫: 03·04·05·10·12·14 — General 키 열) — TEST_DESIGN_NEW §2-11.
 * C2 몫(01·02·06~09·11·13·15~19)은 Number/String 전략이 들어오는 걸음에서.
 */
import { describe, it, expect, vi } from 'vitest';

// 대조 시험은 생성기 14 × 씨앗 8 을 다 돈다 — 다른 레인이 같은 PC 에서 돌 때를 대비해 한도만 넉넉히(단언은 그대로).
vi.setConfig({ testTimeout: 180_000 });
import { SortKeyColumn, GeneralKeyColumn, DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { GENS, mulberry32, rowsOf } from '../../wg-helpers/sort-data.js';
import { legacySortCompare, legacySortIndexes } from '../../wg-helpers/legacy-controls.js';
import { newOrder, sameArray, valuesOf, SORT_SEEDS } from './wg-sort-kit.js';

const G = (id: string) => GENS.find(g => g.id === id)!;
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0); // NaN → 0

describe('U-SKC SortKeyColumn (R1 — General)', () => {
  it('U-SKC-03 섞인 열(G01) → general', () => {
    for (const seed of SORT_SEEDS) {
      const col = SortKeyColumn.build('f', valuesOf(G('G01'), seed), DEFAULT_SORT_COMPARATOR, true);
      expect(col.kind).toBe('general');
      expect(col).toBeInstanceOf(GeneralKeyColumn);
      expect(col.field).toBe('f');
    }
  });

  it('U-SKC-04 사용자 비교자 → general, 비교자를 (a, b, field, dir) 로 부름', () => {
    const calls: any[][] = [];
    const fn = (a: unknown, b: unknown, field: string, dir: 'asc' | 'desc') => { calls.push([a, b, field, dir]); return (a as number) - (b as number); };
    const asc = SortKeyColumn.build('n', [3, 1, 2], fn, false);
    expect(asc.kind).toBe('general');
    expect(sign(asc.compare(1, 0))).toBe(-1);
    expect(calls[0]).toEqual([1, 3, 'n', undefined]); // 방향을 안 주면 채우지 않고 undefined 그대로(옛 고리 — R2 검토 R2-2)
    const desc = SortKeyColumn.build('n', [3, 1, 2], fn, false, 'desc');
    desc.compare(0, 2);
    expect(calls[1]).toEqual([3, 2, 'n', 'desc']); // 옛 고리처럼 dir 그대로, 결과는 오름차순 뜻
    // 숫자 열이라도 isDefault=false 면 general
    expect(SortKeyColumn.build('n', [1, 2, 3], fn, false).kind).toBe('general');
  });

  it('U-SKC-05 Date 열(G11) → general · cacheable false / 원시값만인 열은 cacheable true', () => {
    for (const seed of SORT_SEEDS) {
      const col = SortKeyColumn.build('d', valuesOf(G('G11'), seed), DEFAULT_SORT_COMPARATOR, true);
      expect(col.kind).toBe('general');
      expect(col.cacheable).toBe(false);
    }
    expect(SortKeyColumn.build('f', valuesOf(G('G01'), 1), DEFAULT_SORT_COMPARATOR, true).cacheable).toBe(true);
    expect(SortKeyColumn.build('f', [1, 'a', null, undefined, true, Symbol('s')], DEFAULT_SORT_COMPARATOR, true).cacheable).toBe(true);
    expect(SortKeyColumn.build('f', ['a', [1, 2]], DEFAULT_SORT_COMPARATOR, true).cacheable).toBe(false);
  });

  it('U-SKC-10 부호 대조 — 씨앗 8 × 생성기 14 × 무작위 쌍 1만: sign(compare) = sign(옛 비교자)', () => {
    let pairs = 0;
    const bad: string[] = [];
    for (const g of GENS) {
      for (const seed of SORT_SEEDS) {
        const v = valuesOf(g, seed);
        const col = SortKeyColumn.build('f', v, DEFAULT_SORT_COMPARATOR, true);
        const r = mulberry32(seed ^ 0x1234);
        for (let k = 0; k < 10000; k++) {
          const i = Math.floor(r() * v.length), j = Math.floor(r() * v.length);
          pairs++;
          if (sign(col.compare(i, j)) !== sign(legacySortCompare(v[i], v[j], 'f', 'asc')) && bad.length < 20) bad.push(`${g.id}/${seed}/${i},${j}`);
        }
      }
    }
    expect(pairs).toBe(14 * SORT_SEEDS.length * 10000);
    expect(bad).toEqual([]);
  });

  it('U-SKC-12 빈 열 — build 던지지 않음, compare 불리지 않음', () => {
    let calls = 0;
    const fn = () => { calls++; return 0; };
    const col = SortKeyColumn.build('f', [], fn, false);
    expect(col.kind).toBe('general');
    expect(new ComparisonOrderer().order([], [col], ['asc']).length).toBe(0);
    expect(calls).toBe(0);
    expect(() => SortKeyColumn.build('f', [], DEFAULT_SORT_COMPARATOR, true)).not.toThrow();
  });

  it('U-SKC-14 결과 대조 — 씨앗 8 × 생성기 14, ComparisonOrderer asc·desc == 옛 비교자 Array.sort', () => {
    const bad: string[] = [];
    for (const g of GENS) {
      for (const seed of SORT_SEEDS) {
        const rows = rowsOf(valuesOf(g, seed), seed);
        const start = rows.map((_, i) => i);
        for (const dir of ['asc', 'desc'] as const) {
          const got = newOrder(rows, start, [{ field: 'f', dir }]);
          const want = legacySortIndexes(rows, start, [{ field: 'f', dir }]);
          if (!sameArray(got, want)) bad.push(`${g.id}/${seed}/${dir}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
