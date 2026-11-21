// @vitest-environment node
/**
 * U-SRT-01·02·07·09·10 (걸음 R1) — TEST_DESIGN_NEW §2-19. 가짜 IRowSource.
 * 03~06·11 은 C13(조각 실행기·지연 청크), 08 은 C3(등수 보관).
 * 더함: 「직전 표시 순서에서 출발」 사슬 대조(wg-sort-oracle 의 네 단계와 같은 차례)와 그 자기시험.
 */
import { describe, it, expect, vi } from 'vitest';

// 대조 시험은 생성기 14 × 씨앗 8 을 다 돈다 — 다른 레인이 같은 PC 에서 돌 때를 대비해 한도만 넉넉히(단언은 그대로).
vi.setConfig({ testTimeout: 180_000 });
import { Sorter } from '../../../../src/core/domain/sort/Sorter.js';
import { SortKeyStore } from '../../../../src/core/domain/sort/SortKeyStore.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SyncSortRunner } from '../../../../src/core/domain/sort/SyncSortRunner.js';
import { SortCostEstimate } from '../../../../src/core/domain/sort/SortCostEstimate.js';
import { DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import type { ISortKeyColumn, ISortKeyStore, ISortOrderer, SortSpec } from '../../../../src/core/domain/sort/ports.js';
import { GENS, rowsOf } from '../../wg-helpers/sort-data.js';
import { legacySortIndexes, type LegacySortItem } from '../../wg-helpers/legacy-controls.js';
import { FakeRowSource, GN, makeSorter, sameArray, valuesOf, SORT_SEEDS } from './wg-sort-kit.js';

const CHAIN: LegacySortItem[][] = [
  [{ field: 'f', dir: 'asc' }],
  [{ field: 'f', dir: 'desc' }],
  [{ field: 'g', dir: 'asc' }, { field: 'f', dir: 'desc' }],
];

/** 한 생성기·씨앗에서 Sorter 를 사슬로 돌려(결과를 다음 출발로) 대조군과 어긋난 단계 수. */
function chainMismatches(gi: number, seed: number, sorterOf: (src: FakeRowSource) => Sorter): number {
  const rows = rowsOf(valuesOf(GENS[gi]!, seed), seed);
  const src = new FakeRowSource(rows);
  const sorter = sorterOf(src);
  let prev = rows.map((_, i) => i);
  let bad = 0;
  for (const list of CHAIN) {
    const got = sorter.sortNow(list, DEFAULT_SORT_COMPARATOR);
    const want = legacySortIndexes(rows, prev, list);
    if (!sameArray(got, want)) bad++;
    src.order = got.slice();
    prev = want;
  }
  return bad;
}

describe('U-SRT Sorter (R1)', () => {
  it('U-SRT-01 sortNow 동기 — 행 2,000, displayOrder 0..n−1, 돌아온 배열 = 대조군', () => {
    for (const seed of SORT_SEEDS) {
      const rows = rowsOf(GENS[0]!.make(seed), seed);
      const src = new FakeRowSource(rows);
      const out = makeSorter(src).sortNow([{ field: 'f', dir: 'asc' }], DEFAULT_SORT_COMPARATOR);
      expect(Array.isArray(out)).toBe(true);
      expect(out).toEqual(legacySortIndexes(rows, rows.map((_, i) => i), [{ field: 'f', dir: 'asc' }]));
    }
  });

  it('U-SRT-01b 사슬 대조 — G01~G14 × 씨앗 8 × (f asc → f desc → g asc+f desc), 출발 = 직전 표시 순서', () => {
    const bad: string[] = [];
    for (let gi = 0; gi < GENS.length; gi++) for (const seed of SORT_SEEDS) {
      const n = chainMismatches(gi, seed, makeSorter);
      if (n) bad.push(`${GENS[gi]!.id}/${seed}:${n}`);
    }
    expect(bad).toEqual([]);
  });

  it('U-SRT-01c 자기시험 — 출발을 늘 넣은 순서로 하는 망가진 원천이면 G01·G03 에서 빨개짐', () => {
    // 원천이 직전 표시 순서를 무시하는 판(테스트 안 가짜 — 저장소 파일은 그대로)
    const broken = (src: FakeRowSource) => {
      const ident = src.rows.map((_, i) => i);
      const lying = { rows: src.rows, displayOrder: () => ident };
      return new Sorter(lying, new SortKeyStore(lying), [new ComparisonOrderer()], new SyncSortRunner());
    };
    let total = 0;
    for (const id of ['G01', 'G03']) {
      const gi = GENS.findIndex(g => g.id === id);
      for (const seed of SORT_SEEDS) total += chainMismatches(gi, seed, broken);
    }
    expect(total).toBeGreaterThan(0);
  });

  it('U-SRT-02 사용자 비교자(길이순) → general 키로 fn 순서, fn 에 (a, b, field, dir)', () => {
    const rows = [{ f: 'ccc' }, { f: 'a' }, { f: 'bb' }, { f: 'dd' }];
    const seen: string[] = [];
    const byLen = (a: unknown, b: unknown, field: string, dir: 'asc' | 'desc') => { seen.push(`${field}:${dir}`); return String(a).length - String(b).length; };
    const src = new FakeRowSource(rows);
    expect(makeSorter(src).sortNow([{ field: 'f', dir: 'asc' }], byLen)).toEqual([1, 2, 3, 0]);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seen)).toEqual(new Set(['f:asc']));
    seen.length = 0;
    expect(makeSorter(src).sortNow([{ field: 'f', dir: 'desc' }], byLen)).toEqual(legacySortIndexes(rows, [0, 1, 2, 3], [{ field: 'f', dir: 'desc' }], () => false, byLen));
    expect(new Set(seen)).toEqual(new Set(['f:desc']));
  });

  it('U-SRT-07 sortNow 는 늘 동기 — 추정이 아주 큰 자료에서도 돌아올 때 끝나 있음', () => {
    const n = 100000;
    const long = 'z'.repeat(4000);
    const src = new FakeRowSource(Array.from({ length: n }, (_, i) => ({ f: n - i })));
    const key: ISortKeyColumn = { field: 'f', kind: 'string', cacheable: true, compare: (i, j) => (src.rows[i] as any).f - (src.rows[j] as any).f, stringKeyAt: () => long };
    const store: ISortKeyStore = { keyColumnFor: () => key, clear: () => {} };
    expect(SortCostEstimate.of(n, [key], false).prefersSlicing(100)).toBe(true); // 「아주 큰」 자료임을 확인
    const out = new Sorter(src, store, [new ComparisonOrderer()], new SyncSortRunner()).sortNow([{ field: 'f', dir: 'asc' }], DEFAULT_SORT_COMPARATOR);
    expect(Array.isArray(out)).toBe(true);
    expect(typeof (out as any).then).toBe('undefined');
    expect(out.length).toBe(n);
    expect(out[0]).toBe(n - 1);
    expect(out[n - 1]).toBe(0);
  });

  it('U-SRT-09 spec 없음 — displayOrder 그대로(삭제 행 제외), 원천 배열의 사본', () => {
    const src = new FakeRowSource([{ f: 1 }, { f: 2 }, { f: 3 }, { f: 4 }], [3, 0, 2]); // 행 1 은 지워져 표시 순서에 없음
    const out = makeSorter(src).sortNow([], DEFAULT_SORT_COMPARATOR);
    expect(out).toEqual([3, 0, 2]);
    expect(out).not.toBe(src.order);
  });

  it('U-SRT-10 여러 spec(S-12) → [5,3,1,0,4,2]', () => {
    const specs: SortSpec[] = [{ field: 'g', dir: 'asc' }, { field: 'n', dir: 'desc' }];
    expect(makeSorter(new FakeRowSource(GN)).sortNow(specs, DEFAULT_SORT_COMPARATOR)).toEqual([5, 3, 1, 0, 4, 2]);
  });

  it('U-SRT-10b 지운 행을 뺀 표시 순서에서 출발 — 결과에 지운 행 없음, 대조군과 같음', () => {
    const rows = rowsOf(valuesOf(GENS[0]!, 42), 42);
    const removed = new Set([10, 20, 30]);
    const src = new FakeRowSource(rows, rows.map((_, i) => i).filter(i => !removed.has(i)));
    const got = makeSorter(src).sortNow(CHAIN[2]!, DEFAULT_SORT_COMPARATOR);
    expect(got).toEqual(legacySortIndexes(rows, rows.map((_, i) => i), CHAIN[2]!, i => removed.has(i)));
  });

  it('U-SRT-PICK (T-6/S-7) 둘 다 받아 주는 순서 매기기 둘 — 「첫」 후보만 쓰임', () => {
    const used: string[] = [];
    const mk = (id: string): ISortOrderer => ({
      id, accepts: () => true,
      order: (start, keys, dirs) => { used.push(id); return new ComparisonOrderer().order(start, keys, dirs); },
    });
    const refuse: ISortOrderer = { id: 'no', accepts: () => false, order: () => { used.push('no'); return new Int32Array(0); } };
    const src = new FakeRowSource(GN);
    new Sorter(src, new SortKeyStore(src), [mk('first'), mk('second')], new SyncSortRunner()).sortNow([{ field: 'n', dir: 'asc' }], DEFAULT_SORT_COMPARATOR);
    expect(used).toEqual(['first']);
    used.length = 0;
    new Sorter(src, new SortKeyStore(src), [refuse, mk('first'), mk('second')], new SyncSortRunner()).sortNow([{ field: 'n', dir: 'asc' }], DEFAULT_SORT_COMPARATOR);
    expect(used).toEqual(['first']); // 거절한 후보는 건너뛰고, 받아 주는 것 가운데 첫 것
    expect(() => new Sorter(src, new SortKeyStore(src), [refuse], new SyncSortRunner()).sortNow([{ field: 'n', dir: 'asc' }], DEFAULT_SORT_COMPARATOR)).toThrow();
  });

  it('U-SRT 생성자 — 순서 매기기 후보가 없으면 RangeError', () => {
    const src = new FakeRowSource([]);
    expect(() => new Sorter(src, new SortKeyStore(src), [], new SyncSortRunner())).toThrow(RangeError);
  });

  it('U-SRT sortInteractive(R1 판) — 한 번에 끝난 job, 결과 = sortNow', () => {
    const rows = rowsOf(valuesOf(GENS[2]!, 1), 1);
    const src = new FakeRowSource(rows);
    const s = makeSorter(src);
    const job = s.sortInteractive([{ field: 'f', dir: 'desc' }], DEFAULT_SORT_COMPARATOR);
    expect(job.done).toBe(true);
    expect(Array.from(job.settle())).toEqual(s.sortNow([{ field: 'f', dir: 'desc' }], DEFAULT_SORT_COMPARATOR));
  });
});
