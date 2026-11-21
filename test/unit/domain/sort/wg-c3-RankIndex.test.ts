// @vitest-environment node
/**
 * 걸음 C3 — 등수 보관 RankIndex · RankedKeyColumn · SortKeyStore 보관 (TEST_DESIGN_NEW §2-13 U-RANK · §2-14 U-STORE-01~08 · U-SRT-08 · U-EST-04).
 * 가짜 원천(FakeRowSource) 위에서 — 공개 API 쪽(U-STORE-10~20 · DF-07)은 wg-c3-sort-store.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RankIndex, RankedKeyColumn } from '../../../../src/core/domain/sort/RankIndex.js';
import { SortKeyColumn, DEFAULT_SORT_COMPARATOR } from '../../../../src/core/domain/sort/SortKeyColumn.js';
import { SortKeyStore } from '../../../../src/core/domain/sort/SortKeyStore.js';
import { ComparisonOrderer } from '../../../../src/core/domain/sort/ComparisonOrderer.js';
import { SortCostEstimate } from '../../../../src/core/domain/sort/SortCostEstimate.js';
import { Sorter } from '../../../../src/core/domain/sort/Sorter.js';
import { SyncSortRunner } from '../../../../src/core/domain/sort/SyncSortRunner.js';
import { legacySortIndexes } from '../../wg-helpers/legacy-controls.js';
import { FakeRowSource, makeSorter } from './wg-sort-kit.js';

const D = DEFAULT_SORT_COMPARATOR;
const rowsOf = (vals: unknown[]) => vals.map(f => ({ f }));
function rankOf(vals: unknown[], dir: 'asc' | 'desc' = 'asc') {
  const key = SortKeyColumn.build('f', vals, D, true);
  const sorted = new ComparisonOrderer().order(vals.map((_, i) => i), [key], [dir]);
  return RankIndex.fromSorted('f', key, sorted, dir, vals);
}
afterEach(() => vi.restoreAllMocks());

describe('C3 U-RANK RankIndex', () => {
  it('U-RANK-01 같은 값 같은 등수 · 작은 값 작은 등수 (asc·desc 로 매겨도 같음)', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const r = rankOf(['b', 'a', 'b', 'c'], dir);
      expect(r.compare(0, 2)).toBe(0);
      expect(r.compare(1, 0)).toBeLessThan(0);
      expect(r.compare(3, 0)).toBeGreaterThan(0);
    }
  });
  it('U-RANK-02 만든 rows 그대로 → fresh', () => {
    const vals = ['b', 'a', 'b', 'c'];
    expect(rankOf(vals).isFreshFor(rowsOf(vals))).toBe(true);
  });
  it('U-RANK-03 값 바뀜 → stale', () => {
    const vals = ['b', 'a', 'b', 'c']; const rows = rowsOf(vals);
    const r = rankOf(vals); rows[1]!.f = 'z';
    expect(r.isFreshFor(rows)).toBe(false);
  });
  it('U-RANK-04 행 객체만 바뀜(값 같음) → fresh', () => {
    const vals = ['b', 'a', 'b', 'c']; const rows = rowsOf(vals);
    const r = rankOf(vals); rows[1] = { ...rows[1]! };
    expect(r.isFreshFor(rows)).toBe(true);
  });
  it('U-RANK-05·06 행 수가 늘거나 줄면 stale', () => {
    const vals = ['b', 'a', 'b', 'c'];
    const r = rankOf(vals);
    expect(r.isFreshFor([...rowsOf(vals), { f: 'd' }])).toBe(false);
    expect(r.isFreshFor(rowsOf(vals).slice(0, 3))).toBe(false);
  });
  it('U-RANK-07 숫자 [3,1,2] → compare(1,2) < 0', () => {
    expect(rankOf([3, 1, 2]).compare(1, 2)).toBeLessThan(0);
  });
  it('U-RANK-08 NaN 열 → isFreshFor false(=== 로 늘 낡음), 저장소는 보관하지 않고 정렬 결과 = 대조군', () => {
    const vals = [NaN, 1, NaN];
    const key = SortKeyColumn.build('f', vals, D, true);
    const r = RankIndex.fromSorted('f', key, [0, 2, 1], 'asc', vals);
    expect(r.isFreshFor(rowsOf(vals))).toBe(false);
    const src = new FakeRowSource(rowsOf(vals));
    const s = makeSorter(src);
    expect(s.sortNow([{ field: 'f', dir: 'asc' }], D)).toEqual(legacySortIndexes(rowsOf(vals), [0, 1, 2], [{ field: 'f', dir: 'asc' }]));
    expect(s.sortNow([{ field: 'f', dir: 'asc' }], D)).toEqual(legacySortIndexes(rowsOf(vals), [0, 1, 2], [{ field: 'f', dir: 'asc' }]));
  });
  it('U-RANK-09 O(n) 한 번 읽기 — 10만 행 Proxy, isFreshFor 한 번에 행 읽기 10만 번 · true', () => {
    const vals = Array.from({ length: 100000 }, (_, i) => 'k' + (i % 977));
    const r = rankOf(vals);
    let reads = 0;
    const rows = vals.map(f => new Proxy({ f }, { get(t: any, p) { if (p === 'f') reads++; return t[p]; } }));
    expect(r.isFreshFor(rows)).toBe(true);
    expect(reads).toBe(100000);
  });
  it('U-RANK-10 start 를 주면 그 행만 보고, 등수가 없는 행이 끼면 stale', () => {
    const vals = ['b', 'a', 'c', 'd'];
    const key = SortKeyColumn.build('f', vals, D, true);
    const r = RankIndex.fromSorted('f', key, [1, 0, 2], 'asc', vals); // 3번 행은 정렬에 없었음
    expect(r.isFreshFor(rowsOf(vals), [0, 1, 2])).toBe(true);
    expect(r.isFreshFor(rowsOf(vals), [0, 3])).toBe(false);
  });
  it('U-RANK-12 같은 행 번호가 정렬 결과에 두 번 나와도(addRow first 뒤 표시 순서 — 기존 동작) asc·desc 모두 등수가 값 차례와 같음', () => {
    const vals = [5, 1, 9, 5];
    const key = SortKeyColumn.build('f', vals, D, true);
    for (const dir of ['asc', 'desc'] as const) {
      const start = [0, 1, 2, 0, 3];
      const sorted = new ComparisonOrderer().order(start, [key], [dir]);
      const r = RankIndex.fromSorted('f', key, sorted, dir, vals);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) expect(Math.sign(r.compare(i, j))).toBe(Math.sign(key.compare(i, j)));
    }
  });
  it('U-RANK-11 RankedKeyColumn — kind ranked · stringKeyAt null · 정렬 결과 = 원 키 열', () => {
    const vals = ['q', null, 'a', 'q', '', 'b', undefined, 'a'];
    const key = SortKeyColumn.build('f', vals, D, true);
    const col = new RankedKeyColumn(rankOf(vals, 'desc'));
    expect(col.kind).toBe('ranked');
    expect(col.field).toBe('f');
    expect(col.stringKeyAt(0)).toBeNull();
    const start = [5, 3, 1, 7, 0, 2, 6, 4];
    for (const dir of ['asc', 'desc'] as const) {
      expect(Array.from(new ComparisonOrderer().order(start, [col], [dir]))).toEqual(Array.from(new ComparisonOrderer().order(start, [key], [dir])));
    }
  });
});

describe('C3 U-STORE SortKeyStore 보관(가짜 원천)', () => {
  const spec = (dir: 'asc' | 'desc' = 'asc', field = 'f') => ({ field, dir });
  it('U-STORE-01 두 번째는 재사용 — build 1번 / 정렬을 거치면 두 번째는 ranked', () => {
    const rows = rowsOf(['c', 'a', 'b']);
    const src = new FakeRowSource(rows); const st = new SortKeyStore(src);
    const spy = vi.spyOn(SortKeyColumn, 'build');
    st.keyColumnFor(spec(), D, [0, 1, 2]); st.keyColumnFor(spec(), D, [0, 1, 2]);
    expect(spy).toHaveBeenCalledTimes(1);
    const s = makeSorter(new FakeRowSource(rows));
    const spy2 = vi.spyOn(SortKeyColumn, 'build'); spy2.mockClear();
    s.sortNow([spec()], D); s.sortNow([spec('desc')], D);
    expect(spy2).toHaveBeenCalledTimes(1);
  });
  it('U-STORE-02 직접 고친 뒤 → build 2번, 새 값 기준', () => {
    const rows = rowsOf(['e', 'd', 'c', 'b', 'a', 'z']);
    const src = new FakeRowSource(rows); const s = makeSorter(src);
    const spy = vi.spyOn(SortKeyColumn, 'build');
    s.sortNow([spec()], D);
    rows[5]!.f = '0';
    const got = s.sortNow([spec()], D);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(got[0]).toBe(5);
  });
  it('U-STORE-03 객체 값 열(Date) 두 번 → build 2번(보관 안 함)', () => {
    const rows = [new Date(3), new Date(1), new Date(2)].map(f => ({ f }));
    const s = makeSorter(new FakeRowSource(rows));
    const spy = vi.spyOn(SortKeyColumn, 'build');
    s.sortNow([spec()], D); s.sortNow([spec()], D);
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('U-STORE-04 clear 뒤 → build 2번', () => {
    const src = new FakeRowSource(rowsOf(['b', 'a'])); const st = new SortKeyStore(src);
    const spy = vi.spyOn(SortKeyColumn, 'build');
    st.keyColumnFor(spec(), D, [0, 1]); st.clear(); st.keyColumnFor(spec(), D, [0, 1]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('U-STORE-05 필드별 — f 와 g 번갈아 각 1번씩만', () => {
    const rows = [{ f: 2, g: 'x' }, { f: 1, g: 'y' }];
    const st = new SortKeyStore(new FakeRowSource(rows));
    const spy = vi.spyOn(SortKeyColumn, 'build');
    for (let k = 0; k < 3; k++) { st.keyColumnFor(spec('asc', 'f'), D, [0, 1]); st.keyColumnFor(spec('asc', 'g'), D, [0, 1]); }
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('U-STORE-06 비교자가 다르면 보관 등수 안 씀 — 사용자 비교자 결과, 방향을 읽는 비교자 asc→desc 도 대조군과 같음', () => {
    const rows = rowsOf(['ccc', 'a', 'bb', 'dddd']);
    const s = makeSorter(new FakeRowSource(rows));
    s.sortNow([spec()], D); s.sortNow([spec('desc')], D);
    const byLen = (a: any, b: any) => String(a).length - String(b).length;
    expect(s.sortNow([spec()], byLen)).toEqual([1, 2, 0, 3]);
    const dirAware = (a: any, b: any, _f: string, dir: any) => (dir === 'desc' ? 0 : String(a) < String(b) ? -1 : 1);
    for (const d of ['asc', 'desc'] as const) {
      expect(s.sortNow([spec(d)], dirAware)).toEqual(legacySortIndexes(rows, [0, 1, 2, 3], [spec(d)], () => false, dirAware));
    }
  });
  it('U-STORE-07 오름·내림 공유 — asc 뒤 desc, build 1번', () => {
    const s = makeSorter(new FakeRowSource(rowsOf([3, 1, 2])));
    const spy = vi.spyOn(SortKeyColumn, 'build');
    s.sortNow([spec('asc')], D); s.sortNow([spec('desc')], D);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('U-STORE-08 메모리 풀기 — 10만 행 등수 만든 뒤 clear() → 보관 수 0', () => {
    const src = new FakeRowSource(rowsOf(Array.from({ length: 100000 }, (_, i) => i % 1000)));
    const st = new SortKeyStore(src);
    st.keyColumnFor(spec(), D, src.order);
    expect(st.size).toBe(1);
    st.clear();
    expect(st.size).toBe(0);
  });
  it('U-SRT-08 등수 재사용 — 같은 spec 두 번, 두 번째의 원천 행 읽기 = 낡음 검사 1회분(n)뿐, ranked 키', () => {
    let reads = 0;
    const rows = Array.from({ length: 2000 }, (_, i) => new Proxy({ f: 'v' + ((i * 37) % 501) }, { get(t: any, p) { if (p === 'f') reads++; return t[p]; } }));
    const src = new FakeRowSource(rows); const st = new SortKeyStore(src);
    const s = new Sorter(src, st, [new ComparisonOrderer()], new SyncSortRunner());
    s.sortNow([spec()], D);
    reads = 0;
    s.sortNow([spec('desc')], D);
    expect(reads).toBe(2000);
    expect(st.keyColumnFor(spec(), D, src.order).kind).toBe('ranked');
  });
  it('U-EST-04 보관 등수로 정렬하면 비용 추정이 작다(ranked = 숫자 값어치)', () => {
    const key = SortKeyColumn.build('f', Array.from({ length: 1000 }, (_, i) => 'x'.repeat(200) + i), D, true);
    const ranked = new RankedKeyColumn(rankOf(['a', 'b']));
    expect(SortCostEstimate.of(100000, [ranked], false).expectedMs).toBeLessThan(SortCostEstimate.of(100000, [key], false).expectedMs);
  });
});
