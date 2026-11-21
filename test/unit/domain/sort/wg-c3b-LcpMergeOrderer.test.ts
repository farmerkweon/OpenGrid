// @vitest-environment node
/**
 * 걸음 C3b — 공통 머리말 병합 정렬(LcpMergeOrderer)과 표본 판정(SortCostEstimate.meanCommonPrefix·pickOrderer)
 * (TEST_DESIGN_NEW §2-16 U-ORD-LCP-01~12 · §2-18 U-EST-05~15 · DF-06 의 C3b 판 · 지연 청크 「전 = 후」).
 * 대조군 = legacy-controls 의 옛 비교자로 Array.sort 한 색인.
 */
import { describe, it, expect, vi } from 'vitest';
import { LcpMergeOrderer } from '../../../../src/core/domain/sort/LcpMergeOrderer.js';
import { SortCostEstimate } from '../../../../src/core/domain/sort/SortCostEstimate.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SortKeyColumn, DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import { SortKeyStore } from '../../../../src/core/domain/sort/SortKeyStore.js';
import { SyncSortRunner } from '../../../../src/core/domain/sort/SyncSortRunner.js';
import { Sorter } from '../../../../src/core/domain/sort/Sorter.js';
import { DataLayer } from '../../../../src/core/DataLayer.js';
import { GENS, SEEDS, mulberry32 } from '../../wg-helpers/sort-data.js';
import { legacySortIndexes } from '../../wg-helpers/legacy-controls.js';
import { FakeRowSource, permutation } from './wg-sort-kit.js';

vi.setConfig({ testTimeout: 300_000 });
const D = DEFAULT_SORT_COMPARATOR;
const lcp = new LcpMergeOrderer();
const keyOf = (v: unknown[]) => SortKeyColumn.build('f', v, D, true);
const run = (v: unknown[], dir: 'asc' | 'desc', start?: number[]) => Array.from(lcp.order(start ?? v.map((_, i) => i), [keyOf(v)], [dir]));
const legacy = (v: unknown[], dir: 'asc' | 'desc', start?: number[]) => legacySortIndexes(v.map(f => ({ f })), start ?? v.map((_, i) => i), [{ field: 'f', dir }]);
const word = (r: () => number, n: number) => { let s = ''; for (let i = 0; i < n; i++) s += 'abcdefghij'[Math.floor(r() * 10)]; return s; };
const G = (id: string) => GENS.find(g => g.id === id)!;
const STR_GENS = ['G04', 'G05', 'G06', 'G07', 'G08', 'G10', 'G14'];
const withNulls = (v: unknown[], seed: number) => { const r = mulberry32(seed); return v.map(x => (r() < 0.02 ? null : x)); };

describe('C3b U-ORD-LCP LcpMergeOrderer', () => {
  for (const dir of ['asc', 'desc'] as const) {
    it(`U-ORD-LCP-0${dir === 'asc' ? 1 : 2} 같은 순서 ${dir} — 씨앗 8 × 문자열 생성기 7(null 2%) == 대조군`, () => {
      const bad: string[] = [];
      for (const id of STR_GENS) for (const seed of SEEDS) {
        const v = withNulls(G(id).make(seed), seed);
        if (keyOf(v).kind !== 'string') { bad.push(`${id}/${seed} kind ${keyOf(v).kind}`); continue; }
        const start = permutation(v.length, mulberry32(seed + 1));
        const got = run(v, dir, start), want = legacy(v, dir, start);
        if (got.some((x, i) => x !== want[i])) bad.push(`${id}/${seed}`);
      }
      expect(bad).toEqual([]);
    });
  }
  it('U-ORD-LCP-03 안정성(전부 같은 4,000자 1,000개) — 결과 === start (asc·desc)', () => {
    const s = 'x'.repeat(4000);
    const v = Array.from({ length: 1000 }, () => s.split('').join(''));
    const start = permutation(1000, mulberry32(3));
    expect(run(v, 'asc', start)).toEqual(start);
    expect(run(v, 'desc', start)).toEqual(start);
  });
  it('U-ORD-LCP-04 안정성(같은 값 덩이 — G09) — 같은 값끼리 start 순서', () => {
    const v = G('G09').make(5);
    const start = permutation(v.length, mulberry32(9));
    for (const dir of ['asc', 'desc'] as const) expect(run(v, dir, start)).toEqual(legacy(v, dir, start));
  });
  it('U-ORD-LCP-05 null 30% — asc 앞·desc 뒤, start 순서', () => {
    const r = mulberry32(11);
    const v = Array.from({ length: 3000 }, () => (r() < 0.3 ? (r() < 0.5 ? null : undefined) : 'p' + word(r, 5)));
    const start = permutation(v.length, r);
    for (const dir of ['asc', 'desc'] as const) expect(run(v, dir, start)).toEqual(legacy(v, dir, start));
  });
  it('U-ORD-LCP-06 코드 단위 순서 — [\'\\uFFFF\',\'😀\',\'\',\'a\']', () => {
    const v = ['\uFFFF', '\u{1F600}', '', 'a'];
    expect(run(v, 'asc')).toEqual(legacy(v, 'asc'));
    expect(run(v, 'asc').map(i => v[i])).toEqual(['', 'a', '\u{1F600}', '\uFFFF']);
  });
  it('U-ORD-LCP-07 블록 경계 — 공통 63·64·65·255·256·257·511·512·513 + 꼬리 a/b', () => {
    const r = mulberry32(13);
    const v: string[] = [];
    for (const L of [63, 64, 65, 255, 256, 257, 511, 512, 513]) {
      const head = word(r, L);
      v.push(head + 'b', head + 'a', head + 'b' + word(r, 3), head);
    }
    const start = permutation(v.length, r);
    for (const dir of ['asc', 'desc'] as const) expect(run(v, dir, start)).toEqual(legacy(v, dir, start));
  });
  it('U-ORD-LCP-08 앞부분이 같은 짧은 글 — 짧은 쪽이 앞', () => {
    const X = word(mulberry32(17), 3900);
    const v = ['abcd', 'abc', X + 'z', X];
    expect(run(v, 'asc').map(i => v[i])).toEqual(['abc', 'abcd', X, X + 'z']);
    expect(run(v, 'desc')).toEqual(legacy(v, 'desc'));
  });
  it('U-ORD-LCP-09 빈 글자 — \'\' 가 맨 앞(null 다음)', () => {
    const v = ['b', '', null, 'a', ''];
    expect(run(v, 'asc')).toEqual(legacy(v, 'asc'));
    expect(run(v, 'asc').map(i => v[i])).toEqual([null, '', '', 'a', 'b']);
  });
  it('U-ORD-LCP-10 작은 n — 0·1·2·3·1,024·1,025', () => {
    for (const n of [0, 1, 2, 3, 1024, 1025]) {
      const r = mulberry32(n + 1);
      const v = Array.from({ length: n }, () => 'k' + word(r, 2));
      const start = permutation(n, r);
      for (const dir of ['asc', 'desc'] as const) expect(run(v, dir, start)).toEqual(legacy(v, dir, start));
    }
  });
  it('U-ORD-LCP-11 accepts — string 1개 / number / general / string 2개 / ranked', () => {
    expect(lcp.accepts([keyOf(['a'])], 1)).toBe(true);
    expect(lcp.accepts([keyOf([1])], 1)).toBe(false);
    expect(lcp.accepts([keyOf([1, 'a'])], 2)).toBe(false);
    expect(lcp.accepts([keyOf(['a']), keyOf(['b'])], 1)).toBe(false);
    expect(lcp.accepts([{ field: 'f', kind: 'ranked', cacheable: true, compare: () => 0, stringKeyAt: () => null }], 1)).toBe(false);
  });
  it('U-ORD-LCP-12 start 를 안 고침(freeze) · 결과는 순열', () => {
    const v = ['c', 'a', 'b', null];
    const start = Object.freeze([3, 1, 0, 2]) as unknown as number[];
    const out = Array.from(lcp.order(start, [keyOf(v)], ['asc']));
    expect([...out].sort()).toEqual([0, 1, 2, 3]);
  });
  it('DF-06(C3b) 무작위 대조 — 섞인 글·빈 글자·서로게이트·같은 값 많음 200벌 == ComparisonOrderer == 대조군', () => {
    const r = mulberry32(2026);
    const ALPH = ['a', 'b', '', '\uD83D', '\uDE00', '가', 'Z', ' '];
    for (let t = 0; t < 200; t++) {
      const n = Math.floor(r() * 600);
      const head = word(r, Math.floor(r() * 300));
      const v = Array.from({ length: n }, () => (r() < 0.05 ? null : (r() < 0.5 ? head : '') + Array.from({ length: Math.floor(r() * 4) }, () => ALPH[Math.floor(r() * ALPH.length)]).join('')));
      const start = permutation(n, r);
      const dir = r() < 0.5 ? 'asc' : 'desc';
      const want = legacy(v, dir, start);
      expect(run(v, dir, start)).toEqual(want);
      expect(Array.from(new ComparisonOrderer().order(start, [keyOf(v)], [dir]))).toEqual(want);
    }
  });
});

describe('C3b U-EST 표본 판정', () => {
  const long = (n: number, L: number, seed: number) => { const r = mulberry32(seed); const head = word(mulberry32(7), L); return Array.from({ length: n }, () => head + word(r, 100)); };
  it('U-EST-05 결정적 — 같은 자료 두 번 같은 값', () => {
    const v = G('G14').make(1); const k = keyOf(v); const st = v.map((_, i) => i);
    expect(SortCostEstimate.meanCommonPrefix(k, st)).toBe(SortCostEstimate.meanCommonPrefix(k, st));
  });
  it('U-EST-06 긴 머리말(G10) ≥ 3,000', () => {
    const v = G('G10').make(1);
    expect(SortCostEstimate.meanCommonPrefix(keyOf(v), v.map((_, i) => i))).toBeGreaterThanOrEqual(3000);
  });
  it('U-EST-07 보통 글(200~260자 무작위) < 5', () => {
    const r = mulberry32(5);
    const v = Array.from({ length: 5000 }, () => { let s = ''; const L = 200 + Math.floor(r() * 60); for (let i = 0; i < L; i++) s += String.fromCharCode(97 + Math.floor(r() * 26)); return s; });
    expect(SortCostEstimate.meanCommonPrefix(keyOf(v), v.map((_, i) => i))).toBeLessThan(5);
  });
  it('U-EST-08 머리말 묶음 여럿(G14) ≥ 64', () => {
    const v = G('G14').make(2);
    expect(SortCostEstimate.meanCommonPrefix(keyOf(v), v.map((_, i) => i))).toBeGreaterThanOrEqual(64);
  });
  it('U-EST-09·10 문턱 — 공통 64자 → Comparison / 65자 → Lcp', () => {
    for (const [L, want] of [[64, 'comparison'], [65, 'lcpMerge']] as const) {
      const head = 'h'.repeat(L);
      const v = Array.from({ length: 2000 }, (_, i) => head + String.fromCharCode(0x4e00 + i) + 'tail');
      const got = SortCostEstimate.pickOrderer([new ComparisonOrderer(), lcp], [keyOf(v)], v.map((_, i) => i));
      expect(got.id).toBe(want);
    }
  });
  it('U-EST-11 숫자 열 → Comparison(Lcp accepts false)', () => {
    const v = Array.from({ length: 3000 }, (_, i) => i);
    expect(SortCostEstimate.pickOrderer([lcp, new ComparisonOrderer()], [keyOf(v)], v.map((_, i) => i)).id).toBe('comparison');
  });
  it('U-EST-12 정렬기 목록 순서와 무관 — [Lcp, Comparison] / [Comparison, Lcp]', () => {
    for (const v of [long(3000, 3900, 1), G('G05').make(1)]) {
      const st = v.map((_, i) => i);
      const a = SortCostEstimate.pickOrderer([lcp, new ComparisonOrderer()], [keyOf(v)], st).id;
      const b = SortCostEstimate.pickOrderer([new ComparisonOrderer(), lcp], [keyOf(v)], st).id;
      expect(a).toBe(b);
    }
  });
  it('U-EST-13 표본 비용 — 10만 행, stringKeyAt 호출 ≤ 2,048', () => {
    const v = Array.from({ length: 100000 }, (_, i) => 'r' + (i * 7919 % 100003));
    const k = keyOf(v);
    let calls = 0;
    const spyKey = { ...k, field: k.field, kind: k.kind, cacheable: true, compare: (i: number, j: number) => k.compare(i, j), stringKeyAt: (i: number) => { calls++; return k.stringKeyAt(i); } };
    SortCostEstimate.meanCommonPrefix(spyKey as any, v.map((_, i) => i));
    expect(calls).toBeLessThanOrEqual(2048);
    expect(calls).toBeGreaterThan(0);
  });
  it('U-EST-14 1,024 보다 적은 행 — 표본 = 전부(겹치지 않음), 던지지 않음', () => {
    const v = Array.from({ length: 300 }, (_, i) => 'same' + String(i).padStart(3, '0'));
    const k = keyOf(v);
    let calls = 0; const seen = new Set<number>();
    const spyKey = { field: 'f', kind: 'string' as const, cacheable: true, compare: k.compare.bind(k), stringKeyAt: (i: number) => { calls++; seen.add(i); return k.stringKeyAt(i); } };
    const m = SortCostEstimate.meanCommonPrefix(spyKey, v.map((_, i) => i));
    expect(seen.size).toBe(300);
    expect(calls).toBe(300);
    expect(m).toBeGreaterThanOrEqual(4);
  });
  it('U-EST-13b 표본에 같은 행이 두 번 들지 않음(행 3,000 · 1,024 뽑기)', () => {
    const v = Array.from({ length: 3000 }, (_, i) => 'r' + i);
    const k = keyOf(v); const seen: number[] = [];
    const spyKey = { field: 'f', kind: 'string' as const, cacheable: true, compare: k.compare.bind(k), stringKeyAt: (i: number) => { seen.push(i); return k.stringKeyAt(i); } };
    SortCostEstimate.meanCommonPrefix(spyKey, v.map((_, i) => i));
    expect(seen.length).toBe(1024);
    expect(new Set(seen).size).toBe(1024);
  });
  it('U-EST-15 빈 열 — 0 · Comparison', () => {
    const k = keyOf([]);
    expect(SortCostEstimate.meanCommonPrefix(keyOf(['a']), [])).toBe(0);
    expect(SortCostEstimate.pickOrderer([lcp, new ComparisonOrderer()], [k], []).id).toBe('comparison');
  });
});

describe('C3b 지연 청크 — 오기 전 = 온 뒤 순서, orderBy 는 늘 동기', () => {
  const long = (n: number, seed: number) => { const r = mulberry32(seed); const head = word(mulberry32(7), 3900); return Array.from({ length: n }, () => { const v = r() < 0.03 ? null : head + word(r, 20); return { f: v, g: v }; }); };
  it('C3b-LAZY-01 청크 오기 전 클릭(로더가 아직 안 끝남) — 비교 정렬로 같은 순서, 온 뒤부터 lcpMerge', async () => {
    const rows = long(3000, 1);
    const src = new FakeRowSource(rows);
    let resolveLoad!: () => void;
    const gate = new Promise<void>(res => { resolveLoad = res; });
    const loader = vi.fn(async () => { await gate; return import('../../../../src/core/domain/sort/LcpMergeOrderer.js'); });
    const s = new Sorter(src, new SortKeyStore(src), [new ComparisonOrderer()], new SyncSortRunner(), { loadPrefixSort: loader });
    const spec = [{ field: 'f', dir: 'asc' as const }];
    const before = s.sortNow(spec, D, src.order);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(s.lastOrdererId).toBe('comparison');
    resolveLoad();
    await s.prefixSortReady;
    // 같은 컬럼을 다시 정렬하면 보관 등수(정수 비교)가 먼저라 머리말 정렬을 안 탄다 — 다른 컬럼(같은 값)으로 본다.
    const s2after = s.sortNow([{ field: 'g', dir: 'desc' }], D, src.order);
    expect(s.lastOrdererId).toBe('lcpMerge');
    expect(before).toEqual(legacySortIndexes(rows, src.order, spec));
    expect(s2after).toEqual(legacySortIndexes(rows, src.order, [{ field: 'g', dir: 'desc' }]));
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it('C3b-LAZY-02 무작위 대조 — 같은 자료 · 같은 출발에서 청크 전 결과 == 청크 뒤 결과(씨앗 4 × asc/desc)', async () => {
    for (const seed of [1, 2, 3, 4]) {
      const rows = long(2500, seed);
      const order = permutation(rows.length, mulberry32(seed));
      for (const dir of ['asc', 'desc'] as const) {
        const a = new FakeRowSource(rows, order), b = new FakeRowSource(rows, order);
        const never = new Sorter(a, new SortKeyStore(a), [new ComparisonOrderer()], new SyncSortRunner(), { loadPrefixSort: () => new Promise(() => {}) });
        const loaded = new Sorter(b, new SortKeyStore(b), [new ComparisonOrderer()], new SyncSortRunner(), { loadPrefixSort: () => import('../../../../src/core/domain/sort/LcpMergeOrderer.js') });
        loaded.sortNow([{ field: 'g', dir }], D, order); // 청크를 부르기만(다른 컬럼)
        await loaded.prefixSortReady;
        const x = never.sortNow([{ field: 'f', dir }], D, order);
        expect(never.lastOrdererId).toBe('comparison');
        const z = loaded.sortNow([{ field: 'f', dir }], D, order);
        expect(loaded.lastOrdererId).toBe('lcpMerge');
        expect(z).toEqual(x);
      }
    }
  });
  it('C3b-LAZY-03 DataLayer — 첫 정렬은 동기로 끝나고, 청크가 와도 순서가 바뀌지 않음(같은 정렬 다시 = 같은 순서)', async () => {
    const dl = new DataLayer();
    dl.setData(long(3000, 9));
    dl.applySort([{ field: 'f', dir: 'asc' }]);
    const first = dl.getData().map((r: any) => r._ogRowId);
    await (dl as any)._sorter.prefixSortReady;
    dl.applySort([]);
    dl.applySort([{ field: 'f', dir: 'asc' }]);
    expect(dl.getData().map((r: any) => r._ogRowId)).toEqual(first);
  });
  it('C3b-LAZY-04 짧은 표·숫자 열은 청크를 부르지 않음', () => {
    const src = new FakeRowSource(Array.from({ length: 5000 }, (_, i) => ({ f: i, s: 'a' + i })));
    const loader = vi.fn(() => import('../../../../src/core/domain/sort/LcpMergeOrderer.js'));
    const s = new Sorter(src, new SortKeyStore(src), [new ComparisonOrderer()], new SyncSortRunner(), { loadPrefixSort: loader });
    s.sortNow([{ field: 'f', dir: 'asc' }], D, src.order);
    const small = new FakeRowSource([{ s: 'b' }, { s: 'a' }]);
    new Sorter(small, new SortKeyStore(small), [new ComparisonOrderer()], new SyncSortRunner(), { loadPrefixSort: loader }).sortNow([{ field: 's', dir: 'asc' }], D, [0, 1]);
    expect(loader).toHaveBeenCalledTimes(0);
  });
  it('C3b-LAZY-05 로더가 실패하면 비교 정렬 그대로(던지지 않음)', async () => {
    const rows = long(2000, 4);
    const src = new FakeRowSource(rows);
    const s = new Sorter(src, new SortKeyStore(src), [new ComparisonOrderer()], new SyncSortRunner(), { loadPrefixSort: () => Promise.reject(new Error('offline')) });
    s.sortNow([{ field: 'f', dir: 'asc' }], D, src.order);
    await s.prefixSortReady;
    expect(s.sortNow([{ field: 'f', dir: 'desc' }], D, src.order)).toEqual(legacySortIndexes(rows, src.order, [{ field: 'f', dir: 'desc' }]));
    expect(s.lastOrdererId).toBe('comparison');
  });
});
