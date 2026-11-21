// @vitest-environment node
/**
 * 걸음 C2 — 숫자·문자열 키 열 (TEST_DESIGN_NEW §2-11 U-SKC 의 C2 몫 · §(뒤) U-SKC-19 · DF-06 · U-ORD-11 의 C2 판).
 * 대조군 = test/unit/wg-helpers/legacy-controls.ts(옛 비교자·옛 applySort 사본, 읽기만).
 * R1 몫(03·04·05·10·12·14)은 wg-SortKeyColumn.test.ts 가 그대로 지킨다(C2 뒤에도 초록이어야 함).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SortKeyColumn, NumberKeyColumn, StringKeyColumn, GeneralKeyColumn, DEFAULT_SORT_COMPARATOR,
} from '../../../../src/core/domain/sort/SortKeyColumn.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SortKeyStore } from '../../../../src/core/domain/sort/SortKeyStore.js';
import { OverrideKernel } from '../../../../src/core/OverrideKernel.js';
import { DataLayer } from '../../../../src/core/DataLayer.js';
import { GENS, SEEDS, mulberry32 } from '../../wg-helpers/sort-data.js';
import { legacySortCompare, legacySortIndexes } from '../../wg-helpers/legacy-controls.js';
import { FakeRowSource, permutation } from './wg-sort-kit.js';

vi.setConfig({ testTimeout: 180_000 });

const D = DEFAULT_SORT_COMPARATOR;
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const order = (values: unknown[], dir: 'asc' | 'desc', start?: number[]) => {
  const col = SortKeyColumn.build('f', values, D, true);
  return Array.from(new ComparisonOrderer().order(start ?? values.map((_, i) => i), [col], [dir]));
};
const legacy = (values: unknown[], dir: 'asc' | 'desc', start?: number[]) =>
  legacySortIndexes(values.map(f => ({ f })), start ?? values.map((_, i) => i), [{ field: 'f', dir }]);

describe('C2 SortKeyColumn — 숫자·문자열 전략', () => {
  it('U-SKC-01 숫자 열 + 기본 비교자 → number, cacheable', () => {
    const c = SortKeyColumn.build('f', [3, 1, 2], D, true);
    expect(c.kind).toBe('number');
    expect(c).toBeInstanceOf(NumberKeyColumn);
    expect(c.cacheable).toBe(true);
    expect(order([3, 1, 2], 'asc')).toEqual([1, 2, 0]);
  });

  it('U-SKC-02 글자 열 → string, cacheable', () => {
    const c = SortKeyColumn.build('f', ['b', 'a'], D, true);
    expect(c.kind).toBe('string');
    expect(c).toBeInstanceOf(StringKeyColumn);
    expect(c.cacheable).toBe(true);
  });

  it('U-SKC-06 전부 null/undefined — 모든 쌍 0, 던지지 않음', () => {
    const v = [null, undefined, null];
    const c = SortKeyColumn.build('f', v, D, true);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(c.compare(i, j)).toBe(0);
    expect(order(v, 'asc')).toEqual(legacy(v, 'asc'));
  });

  it('U-SKC-07·19 NaN 섞인 숫자 → general, 정렬 결과 = 옛 비교자 Array.sort(G03 씨앗 8 · asc/desc · 무작위 출발)', () => {
    expect(SortKeyColumn.build('f', [3, NaN, 1], D, true).kind).toBe('general');
    expect(order([3, NaN, 1], 'asc')).toEqual(legacy([3, NaN, 1], 'asc'));
    const g03 = GENS.find(g => g.id === 'G03')!;
    for (const seed of SEEDS) {
      const v = g03.make(seed);
      const start = permutation(v.length, mulberry32(seed + 9));
      for (const dir of ['asc', 'desc'] as const) expect(order(v, dir, start)).toEqual(legacy(v, dir, start));
    }
  });

  it('U-SKC-08 −0·0·±Infinity — 옛 비교자와 부호 같음, 같은 부호 Infinity 둘이면 general', () => {
    const v = [0, -0, Infinity, -Infinity, 5];
    const c = SortKeyColumn.build('f', v, D, true);
    expect(c.kind).toBe('number');
    for (let i = 0; i < v.length; i++) for (let j = 0; j < v.length; j++) {
      expect(sign(c.compare(i, j))).toBe(sign(legacySortCompare(v[i], v[j])));
    }
    expect(c.compare(0, 1)).toBe(0);
    expect(SortKeyColumn.build('f', [Infinity, 1, Infinity], D, true).kind).toBe('general');
    expect(SortKeyColumn.build('f', [-Infinity, 1, -Infinity], D, true).kind).toBe('general');
    const two = [Infinity, 1, Infinity, -Infinity, -Infinity, null];
    expect(order(two, 'desc')).toEqual(legacy(two, 'desc'));
  });

  it('U-SKC-09 type:number 인데 글자 [\'3\',\'100\',\'20\'] → string, 결과 [1,2,0](S-06)', () => {
    const v = ['3', '100', '20'];
    expect(SortKeyColumn.build('f', v, D, true).kind).toBe('string');
    expect(order(v, 'asc')).toEqual([1, 2, 0]);
  });

  it('U-SKC-11 stringKeyAt — string 열 String(값)·빈 값 null / number 열 null / general 열 null', () => {
    const s = SortKeyColumn.build('f', ['b', true, null], D, true);
    expect([s.stringKeyAt(0), s.stringKeyAt(1), s.stringKeyAt(2)]).toEqual(['b', 'true', null]);
    expect(SortKeyColumn.build('f', [1, 2], D, true).stringKeyAt(0)).toBeNull();
    expect(SortKeyColumn.build('f', [1, 'a'], D, true).stringKeyAt(0)).toBeNull();
  });

  it('U-SKC-13 키는 한 번만 뽑음 — 값 배열(Proxy) 읽기 build 중 n번, compare 동안 0번', () => {
    for (const make of [(i: number) => (i * 7919) % 10007, (i: number) => 'k' + ((i * 7919) % 10007)]) {
      const raw = Array.from({ length: 10000 }, (_, i) => make(i));
      let reads = 0;
      const prox = new Proxy(raw, { get(t, p, r) { if (typeof p === 'string' && /^\d+$/.test(p)) reads++; return Reflect.get(t, p, r); } });
      const col = SortKeyColumn.build('f', prox, D, true);
      expect(reads).toBe(10000);
      reads = 0;
      new ComparisonOrderer().order(raw.map((_, i) => i), [col], ['asc']);
      expect(reads).toBe(0);
    }
  });

  it('U-SKC-15 참거짓 — 옛 규칙(\'false\' < \'true\') 그대로', () => {
    const v = [true, false, true, null];
    expect(SortKeyColumn.build('f', v, D, true).kind).toBe('string');
    expect(order(v, 'asc')).toEqual(legacy(v, 'asc'));
    expect(order(v, 'asc')).toEqual([3, 1, 0, 2]);
  });

  it('U-SKC-16 Symbol 섞인 열 — general, 던지지 않음, 옛 규칙과 같음', () => {
    const v = [Symbol('b'), 'a', Symbol('a'), null];
    expect(SortKeyColumn.build('f', v, D, true).kind).toBe('general');
    expect(order(v, 'asc')).toEqual(legacy(v, 'asc'));
  });

  it('U-SKC-17 toString 객체 — general, \'a\' 가 앞', () => {
    const v = [{ toString: () => 'z' }, 'a'];
    const c = SortKeyColumn.build('f', v, D, true);
    expect(c).toBeInstanceOf(GeneralKeyColumn);
    expect(order(v, 'asc')).toEqual([1, 0]);
  });

  it('U-SKC-18 기본 비교자 판별 — OverrideKernel.getStrategy 가 돌려준 기본 함수 === DEFAULT_SORT_COMPARATOR → 빠른 길', () => {
    const k = new OverrideKernel({} as any);
    const got = k.getStrategy('sortComparator', D);
    expect(got).toBe(D);
    const src = new FakeRowSource([{ f: 2 }, { f: 1 }]);
    expect(new SortKeyStore(src).keyColumnFor({ field: 'f', dir: 'asc' }, got, [0, 1]).kind).toBe('number');
    k.strategy('sortComparator', (a: any, b: any) => a - b);
    const user = k.getStrategy('sortComparator', D);
    expect(user).not.toBe(D);
    expect(new SortKeyStore(src).keyColumnFor({ field: 'f', dir: 'asc' }, user, [0, 1]).kind).toBe('general');
  });

  it('DF-06(C2) 결과 대조 — 씨앗 8 × 생성기 14 × asc·desc × 무작위 출발: 새 키 열 정렬 == 옛 비교자 Array.sort', () => {
    const bad: string[] = [];
    for (const g of GENS) for (const seed of SEEDS) {
      const v = g.make(seed);
      const start = permutation(v.length, mulberry32(seed ^ 0x5a5a));
      for (const dir of ['asc', 'desc'] as const) {
        const got = order(v, dir, start), want = legacy(v, dir, start);
        if (got.length !== want.length || got.some((x, i) => x !== want[i])) bad.push(`${g.id}/${seed}/${dir}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('C2-RND 무작위 숫자·글자 열(null·−0·Infinity 하나·같은 값 많음) 200벌 × 두 키 == 옛 applySort 사본, 빠른 길을 실제로 탐', () => {
    const r = mulberry32(777);
    const kinds = new Set<string>();
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(r() * 400);
      const numeric = r() < 0.5;
      const rows = Array.from({ length: n }, (_, i) => {
        const x = r();
        const a = x < 0.08 ? null : x < 0.12 ? undefined : numeric ? (x < 0.14 ? -0 : Math.floor(r() * 30) - 10) : 'w' + Math.floor(r() * 25);
        return { id: i, a, b: Math.floor(r() * 5) };
      });
      if (numeric && n > 3) rows[2]!.a = Infinity as any;
      const start = permutation(n, r);
      const specs = [{ field: 'a', dir: r() < 0.5 ? 'asc' : 'desc' }, { field: 'b', dir: r() < 0.5 ? 'asc' : 'desc' }] as const;
      const src = new FakeRowSource(rows, start);
      const store = new SortKeyStore(src);
      const keys = specs.map(s => store.keyColumnFor(s, D, start));
      kinds.add(keys[0]!.kind);
      const got = Array.from(new ComparisonOrderer().order(start, keys, specs.map(s => s.dir)));
      expect(got).toEqual(legacySortIndexes(rows, start, specs as any));
    }
    expect([...kinds].sort()).toEqual(['number', 'string']);
  });
});

describe('C2 출발 순서를 인자로 (DESIGN §17-4 · 계약 v4)', () => {
  it('C2-START-01 keyColumnFor 는 넘긴 start 의 행만 읽고 원천 displayOrder 를 부르지 않음', () => {
    const rows = [{ f: 3 }, { f: 1 }, { f: 2 }, { f: 0 }];
    const src = new FakeRowSource(rows, [0, 1, 2, 3]);
    const col = new SortKeyStore(src).keyColumnFor({ field: 'f', dir: 'asc' }, D, [2, 0]);
    expect(src.displayOrderCalls).toBe(0);
    expect(col.compare(2, 0)).toBeLessThan(0);
  });

  it('C2-START-02 DataLayer.applySort 는 표시 순서를 정렬당 한 번 뽑아 넘김 — 숨은 상태 _sortStart 없음, 정렬 중 displayOrder 를 안 부름', () => {
    const dl = new DataLayer();
    dl.setData([{ f: 'b' }, { f: 'a' }, { f: 'c' }]);
    expect('_sortStart' in dl).toBe(false);
    const spy = vi.spyOn(dl, 'displayOrder');
    dl.applySort([{ field: 'f', dir: 'asc' }]);
    expect(spy).toHaveBeenCalledTimes(0);
    expect(dl.getData().map((r: any) => r.f)).toEqual(['a', 'b', 'c']);
  });

  it('C2-START-03 방향이 빠진 정렬 목록 — 사용자 비교자에 dir undefined 그대로', () => {
    const dl = new DataLayer();
    const seen: unknown[] = [];
    dl.setStrategyResolver(((slot: string, fb: any) => (slot === 'sortComparator' ? (a: any, b: any, _f: string, d: unknown) => { seen.push(d); return a < b ? -1 : a > b ? 1 : 0; } : fb)) as any);
    dl.setData([{ f: 2 }, { f: 1 }, { f: 3 }]);
    dl.applySort([{ field: 'f' } as any]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(d => d === undefined)).toBe(true);
  });

  it('C2-START-04 재진입 — 비교자 안에서 applySort 를 불러도 바깥 정렬 결과가 이김(옛 동작과 같음)', () => {
    const dl = new DataLayer();
    let inner = 0;
    dl.setStrategyResolver(((slot: string, fb: any) => (slot === 'sortComparator' ? (a: any, b: any, f: string) => {
      if (f === 'f' && inner++ === 0) dl.applySort([{ field: 'g', dir: 'desc' }]);
      return a < b ? -1 : a > b ? 1 : 0;
    } : fb)) as any);
    dl.setData([{ f: 'b', g: 1 }, { f: 'a', g: 2 }, { f: 'c', g: 3 }]);
    dl.applySort([{ field: 'f', dir: 'asc' }]);
    expect(dl.getData().map((r: any) => r.f)).toEqual(['a', 'b', 'c']);
  });
});
