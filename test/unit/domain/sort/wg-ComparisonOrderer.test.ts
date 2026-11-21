// @vitest-environment node
/**
 * U-ORD-01~11 (걸음 R1) — TEST_DESIGN_NEW §2-15, U-ORD-11 은 §17-3.
 * 판정: 새 결과 == 옛 비교자로 Array.prototype.sort 한 결과(legacySortIndexes, 출발 = 주어진 start).
 */
import { describe, it, expect, vi } from 'vitest';

// 대조 시험은 생성기 14 × 씨앗 8 을 다 돈다 — 다른 레인이 같은 PC 에서 돌 때를 대비해 한도만 넉넉히(단언은 그대로).
vi.setConfig({ testTimeout: 180_000 });
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SortKeyColumn, DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import { GENS, mulberry32, rowsOf } from '../../wg-helpers/sort-data.js';
import { legacySortIndexes } from '../../wg-helpers/legacy-controls.js';
import { GN, newOrder, permutation, sameArray, valuesOf, SORT_SEEDS } from './wg-sort-kit.js';

const G = (id: string) => GENS.find(g => g.id === id)!;

function diffAll(dir: 'asc' | 'desc', startOf: (n: number, seed: number) => number[]): string[] {
  const bad: string[] = [];
  for (const g of GENS) {
    for (const seed of SORT_SEEDS) {
      const rows = rowsOf(valuesOf(g, seed), seed);
      const start = startOf(rows.length, seed);
      const got = newOrder(rows, start, [{ field: 'f', dir }]);
      const want = legacySortIndexes(rows, start, [{ field: 'f', dir }]);
      if (!sameArray(got, want)) bad.push(`${g.id}/${seed}`);
    }
  }
  return bad;
}

describe('U-ORD ComparisonOrderer (R1)', () => {
  it('U-ORD-01 대조 asc — 씨앗 8 × G01~G14, start 0..n−1', () => {
    expect(diffAll('asc', n => Array.from({ length: n }, (_, i) => i))).toEqual([]);
  });

  it('U-ORD-02 대조 desc — 같은 값은 출발 순서, null 맨 뒤', () => {
    expect(diffAll('desc', n => Array.from({ length: n }, (_, i) => i))).toEqual([]);
    // 눈으로 읽을 수 있는 작은 판: null/undefined 는 맨 뒤에 출발 순서대로
    const rows = [{ f: null }, { f: 'b' }, { f: undefined }, { f: 'a' }, { f: 'b' }];
    expect(newOrder(rows, [0, 1, 2, 3, 4], [{ field: 'f', dir: 'desc' }])).toEqual([1, 4, 3, 0, 2]);
  });

  it('U-ORD-03 안정성 — G09(같은 값 8종 × 1만), 같은 값끼리 start 순서 그대로', () => {
    for (const seed of SORT_SEEDS) {
      const rows = rowsOf(valuesOf(G('G09'), seed), seed);
      const start = permutation(rows.length, mulberry32(seed));
      const pos = new Int32Array(rows.length);
      start.forEach((r, p) => { pos[r] = p; });
      for (const dir of ['asc', 'desc'] as const) {
        const got = newOrder(rows, start, [{ field: 'f', dir }]);
        for (let k = 1; k < got.length; k++) {
          const a = got[k - 1]!, b = got[k]!;
          if (rows[a].f === rows[b].f) expect(pos[a]! < pos[b]!).toBe(true);
        }
      }
    }
  });

  it('U-ORD-04 출발 순서가 직전 표시 순서 — 무작위 순열 start(S-11), 전 생성기 대조 + S-11 고정값', () => {
    expect(diffAll('asc', (n, seed) => permutation(n, mulberry32(seed ^ 0xabc)))).toEqual([]);
    expect(diffAll('desc', (n, seed) => permutation(n, mulberry32(seed ^ 0xdef)))).toEqual([]);
    // G01·G03 은 「같음인데 값이 다른」 쌍(10/'10', NaN)이 있어 출발 순서가 결과에 드러나는 자료(T0 L19 NOTES)
    for (const id of ['G01', 'G03']) {
      const rows = rowsOf(valuesOf(G(id), 42), 42);
      const ident = rows.map((_, i) => i);
      const perm = permutation(rows.length, mulberry32(9));
      const fromIdent = newOrder(rows, ident, [{ field: 'f', dir: 'asc' }]);
      const fromPerm = newOrder(rows, perm, [{ field: 'f', dir: 'asc' }]);
      expect(sameArray(fromIdent, fromPerm), `${id}: 출발이 달라도 결과가 같다면 이 자료가 규칙을 못 잡는다`).toBe(false);
      expect(fromPerm).toEqual(legacySortIndexes(rows, perm, [{ field: 'f', dir: 'asc' }]));
    }
    const first = newOrder(GN, [0, 1, 2, 3, 4, 5], [{ field: 'n', dir: 'desc' }]);
    expect(first.map(i => GN[i]!.id)).toEqual([0, 5, 3, 4, 1, 2]);
    expect(newOrder(GN, first, [{ field: 'g', dir: 'asc' }]).map(i => GN[i]!.id)).toEqual([5, 3, 1, 0, 4, 2]);
  });

  it('U-ORD-05 여러 키 [g asc, n desc](S-12) → [5,3,1,0,4,2]', () => {
    expect(newOrder(GN, [0, 1, 2, 3, 4, 5], [{ field: 'g', dir: 'asc' }, { field: 'n', dir: 'desc' }])).toEqual([5, 3, 1, 0, 4, 2]);
  });

  it('U-ORD-06 accepts — 아무 키든 true', () => {
    const o = new ComparisonOrderer();
    const col = SortKeyColumn.build('f', [1, 'a'], DEFAULT_SORT_COMPARATOR, true);
    const fake = { field: 'x', kind: 'string' as const, cacheable: true, compare: () => 0, stringKeyAt: () => 'x' };
    expect(o.accepts([col], 2)).toBe(true);
    expect(o.accepts([fake, col], 100000)).toBe(true);
    expect(o.accepts([], 0)).toBe(true);
    expect(typeof o.id).toBe('string');
  });

  it('U-ORD-07 반환 꼴 — Int32Array, 길이 = start, start 의 순열', () => {
    const rows = rowsOf(G('G01').make(7777), 7777);
    const start = rows.map((_, i) => i);
    const col = SortKeyColumn.build('f', rows.map(r => r.f), DEFAULT_SORT_COMPARATOR, true);
    const out = new ComparisonOrderer().order(start, [col], ['asc']);
    expect(out).toBeInstanceOf(Int32Array);
    expect(out.length).toBe(2000);
    expect(Array.from(out).sort((a, b) => a - b)).toEqual(start);
  });

  it('U-ORD-08 빈 입력 → 길이 0', () => {
    const col = SortKeyColumn.build('f', [], DEFAULT_SORT_COMPARATOR, true);
    expect(new ComparisonOrderer().order([], [col], ['asc']).length).toBe(0);
    expect(new ComparisonOrderer().order([], [], []).length).toBe(0);
  });

  it('U-ORD-09 부분 집합 start [0,2,3] → {0,2,3} 의 순열(지운 행이 되살아나지 않음)', () => {
    const rows = [{ f: 'd' }, { f: 'a' }, { f: 'c' }, { f: 'b' }];
    const got = newOrder(rows, [0, 2, 3], [{ field: 'f', dir: 'asc' }]);
    expect(got).toEqual([3, 2, 0]);
    expect(got).toEqual(legacySortIndexes(rows, [0, 1, 2, 3], [{ field: 'f', dir: 'asc' }], i => i === 1));
  });

  it('U-ORD-10 start 를 고치지 않음 — Object.freeze(start) 에서 던지지 않음', () => {
    const rows = rowsOf(valuesOf(G('G13'), 1), 1);
    const start = Object.freeze(rows.map((_, i) => i).reverse());
    const copy = start.slice();
    const col = SortKeyColumn.build('f', rows.map(r => r.f), DEFAULT_SORT_COMPARATOR, true);
    expect(() => new ComparisonOrderer().order(start, [col], ['asc'])).not.toThrow();
    expect(start).toEqual(copy);
  });

  it('U-ORD-11 여러 키 무작위 — 씨앗 8 × 생성기 짝 20 × 방향 4조합 == 대조군', () => {
    const firsts = ['G09', 'G02', 'G05'];
    const pairs = Array.from({ length: 20 }, (_, p) => [firsts[p % 3]!, GENS[(p * 5 + 1) % GENS.length]!.id] as const);
    const dirsSet = [['asc', 'asc'], ['asc', 'desc'], ['desc', 'asc'], ['desc', 'desc']] as const;
    const bad: string[] = [];
    let runs = 0;
    for (const [a, b] of pairs) {
      for (const seed of SORT_SEEDS) {
        const va = valuesOf(G(a), seed), vb = valuesOf(G(b), seed ^ 0x9e37);
        const n = Math.min(va.length, vb.length, 2000);
        const rows = Array.from({ length: n }, (_, i) => ({ id: i, a: va[i], b: vb[i] }));
        const start = permutation(n, mulberry32(seed + 5));
        for (const [da, db] of dirsSet) {
          const list = [{ field: 'a', dir: da }, { field: 'b', dir: db }];
          runs++;
          if (!sameArray(newOrder(rows, start, list), legacySortIndexes(rows, start, list))) bad.push(`${a}+${b}/${seed}/${da}${db}`);
        }
      }
    }
    expect(runs).toBe(20 * SORT_SEEDS.length * 4);
    expect(bad).toEqual([]);
  });

  // ─── 검토 반영(REVIEW_CODE_R1 T-6 · S-6) — 검토자의 깨 보기 P-SRT-03·P-SRT-07 을 옮김 ───
  it('U-ORD-12 (T-6/S-6 · P-SRT-03) 앞 키가 NaN 인 쌍은 뒤 키를 안 봄 — 2키 정렬 1,000행 == 옛 사본', () => {
    // 옛 고리: 비교 결과가 0 이 아니면(NaN 포함) 그 자리에서 반환 → NaN 쌍은 둘째 키를 안 본다(설계 Q-27).
    const rnd = mulberry32(9);
    const rows = Array.from({ length: 1000 }, (_, i) => ({ a: rnd() < 0.3 ? NaN : Math.floor(rnd() * 5), b: i % 7 }));
    const start = rows.map((_, i) => i);
    for (const [da, db] of [['asc', 'desc'], ['desc', 'asc'], ['asc', 'asc']] as const) {
      const list = [{ field: 'a', dir: da }, { field: 'b', dir: db }];
      expect(newOrder(rows, start, list)).toEqual(legacySortIndexes(rows, start, list));
    }
  });

  it('U-ORD-13 (T-6 · P-SRT-07) 정의 밖 방향 「DESC」 — 옛 식(asc 가 아니면 뒤집음)과 같음', () => {
    const rows = [{ a: 3 }, { a: 1 }, { a: 2 }, { a: 1 }];
    for (const dir of ['DESC', 'Asc', ''] as any[]) {
      const list = [{ field: 'a', dir }];
      expect(newOrder(rows, [0, 1, 2, 3], list)).toEqual(legacySortIndexes(rows, [0, 1, 2, 3], list));
    }
    expect(newOrder(rows, [0, 1, 2, 3], [{ field: 'a', dir: 'DESC' as any }])).toEqual([0, 2, 1, 3]);
  });
});
