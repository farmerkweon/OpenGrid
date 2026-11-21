// @vitest-environment node
/**
 * 걸음 R2 — DataLayer.applySort 를 Sorter 에 맡긴 뒤 (TEST_DESIGN_NEW §2-22 U-DL-04~06 · §17-3 U-DL-09).
 * 더함(L28): 빼내기로 겉동작이 안 바뀌었음을 보이는 경우 — 키를 읽는 행 범위(KR-*)와 사용자 비교자 호출(CMP-*).
 * 대조군 = test/unit/wg-helpers/legacy-controls.ts(옛 applySort 사본, 읽기만).
 */
import { describe, it, expect, vi } from 'vitest';
import { DataLayer } from '../../src/core/DataLayer.js';
import { GENS, SEEDS, rowsOf } from './wg-helpers/sort-data.js';
import { legacySortIndexes, type LegacySortItem } from './wg-helpers/legacy-controls.js';

vi.setConfig({ testTimeout: 180_000 });

type Cmp = (a: any, b: any, f: string, d: 'asc' | 'desc') => number;
const ids = (dl: DataLayer) => dl.getData().map((r: any) => r.id);
function layer(rows: any[], cmp?: Cmp): DataLayer {
  const dl = new DataLayer();
  if (cmp) dl.setStrategyResolver(((slot: string, fb: any) => (slot === 'sortComparator' ? cmp : fb)) as any);
  dl.setData(rows);
  return dl;
}

describe('R2 DataLayer 정렬 맡기기', () => {
  it('U-DL-04 applySort 서명·결과 — S-01·S-12 고정값 + G01~G14 × 씨앗 8 사슬(asc→desc→g asc+f desc→해제) == 대조군', () => {
    const MIXED = ['나', 'b', 'A', '가', '', null, undefined, '10', '9', 10, 9, 'a'].map((k, id) => ({ id, k }));
    const d1 = layer(MIXED);
    expect(d1.applySort([{ field: 'k', dir: 'asc' }])).toBeUndefined();
    expect(ids(d1)).toEqual([5, 6, 4, 7, 9, 8, 10, 2, 11, 1, 3, 0]);
    const GN = [{ id: 0, g: 'B', n: 3 }, { id: 1, g: 'A', n: 1 }, { id: 2, g: 'B', n: 1 }, { id: 3, g: 'A', n: 2 }, { id: 4, g: 'B', n: 2 }, { id: 5, g: 'A', n: 3 }];
    const d2 = layer(GN);
    d2.applySort([{ field: 'g', dir: 'asc' }, { field: 'n', dir: 'desc' }]);
    expect(ids(d2)).toEqual([5, 3, 1, 0, 4, 2]);

    const CHAIN: Array<LegacySortItem[]> = [[{ field: 'f', dir: 'asc' }], [{ field: 'f', dir: 'desc' }], [{ field: 'g', dir: 'asc' }, { field: 'f', dir: 'desc' }], []];
    const bad: string[] = [];
    for (const g of GENS) for (const seed of SEEDS) {
      const rows = rowsOf(g.make(seed), seed);
      const dl = layer(rows);
      let prev = rows.map((_, i) => i);
      for (const list of CHAIN) {
        dl.applySort(list as any);
        const want = legacySortIndexes(rows, prev, list);
        const got = ids(dl);
        if (got.length !== want.length || got.some((x: number, i: number) => x !== want[i])) bad.push(`${g.id}/${seed}/${list.length}`);
        prev = want;
      }
    }
    expect(bad).toEqual([]);
  });

  it('U-DL-05 IRowSource.rows 는 복사 아님 — 두 번 읽어 같은 참조', () => {
    const dl = layer([{ a: 1 }, { a: 2 }]);
    expect(dl.rows).toBe(dl.rows);
    expect(dl.rows.length).toBe(2);
    expect(dl.rows).toBe((dl as any)._data);
  });

  it('U-DL-06 displayOrder — 삭제 표시 행 2개는 없음, 정렬 결과에도 없음', () => {
    const rows = [{ id: 0, f: 'c' }, { id: 1, f: 'a' }, { id: 2, f: 'd' }, { id: 3, f: 'b' }, { id: 4, f: 'e' }];
    const dl = layer(rows);
    dl.removeRow(1); // 기존 행 → 삭제 표시(soft)
    dl.removeRow(2); // 지금 표시 위치 2 = 원래 3? removeRow 뒤 표시 순서는 그대로 남음
    const shown = dl.displayOrder();
    const removedIds = rows.map((_, i) => i).filter(i => !shown.includes(i));
    expect(removedIds.length).toBe(2);
    dl.applySort([{ field: 'f', dir: 'asc' }]);
    const after = ids(dl);
    for (const r of removedIds) expect(after).not.toContain(rows[r]!.id);
  });

  it('U-DL-09 applyOrder — [2,0,1] 이면 displayOrder [2,0,1] · 길이 다르면 RangeError', () => {
    const dl = layer([{ f: 1 }, { f: 2 }, { f: 3 }]);
    dl.applyOrder(Int32Array.from([2, 0, 1]));
    expect(Array.from(dl.displayOrder())).toEqual([2, 0, 1]);
    expect(() => dl.applyOrder(Int32Array.from([0, 1]))).toThrow(RangeError);
    expect(Array.from(dl.displayOrder())).toEqual([2, 0, 1]); // 던진 뒤 그대로
  });

  it('KR-01 키를 읽는 행 범위 = 옛 범위 — 필터로 숨은 행·지운 행의 게터는 안 불림, 보이는 행은 키마다 1번', () => {
    const rows = Array.from({ length: 6 }, (_, id) => ({ id, f: 'v' + (5 - id), g: id % 2 }));
    const dl = layer(rows);
    dl.removeRow(0); // 원래 0 삭제 표시(removeRow 는 표시 순서를 원 자료 순서로 되돌림 — 지금 동작)
    dl.applyFilter({ g: [{ operator: '=', value: 0 }] as any }); // 남은 0·2·4 가운데 2·4 만 보임
    const reads = new Map<number, number>();
    (dl as any)._data.forEach((r: any, i: number) => {
      let v = r.f;
      Object.defineProperty(r, 'f', { get() { reads.set(i, (reads.get(i) ?? 0) + 1); return v; }, set(x) { v = x; }, configurable: true, enumerable: true });
    });
    dl.applySort([{ field: 'f', dir: 'asc' }, { field: 'f', dir: 'desc' }]);
    expect([...reads.keys()].sort()).toEqual([2, 4]); // 옛 코드: _displayIndexes.filter(notRemoved) 의 행만
    expect(reads.get(2)).toBe(2); // 키 둘 → 행마다 2번(옛 코드와 같은 횟수)
    expect(reads.get(4)).toBe(2);
  });

  // KR-02 는 걸음 전에도 있는 면(getData)만 읽는다 — 걸음 전 사본에도 그대로 돌려 같은 동작임을 보이려고(R2 검토 R2-5).
  it('KR-02 빈 행 자리 — 숨은 자리는 안 던짐, 정렬할 자리면 옛 코드처럼 TypeError 이고 표시 순서는 그대로', () => {
    const rows = Array.from({ length: 4 }, (_, id) => ({ id, f: 'v' + (3 - id), g: id % 2 }));
    const dl = layer(rows);
    dl.applyFilter({ g: [{ operator: '=', value: 0 }] as any }); // 0·2 보임
    (dl as any)._data[1] = null; // 숨은 자리
    expect(() => dl.applySort([{ field: 'f', dir: 'asc' }])).not.toThrow();
    expect(ids(dl)).toEqual([2, 0]);
    const before = ids(dl);
    (dl as any)._data[1] = rows[1];
    // 정렬할 자리를 비움: 옛 코드는 row[s.field] 에서 TypeError
    const hold = (dl as any)._data[2];
    (dl as any)._data[2] = null;
    expect(() => dl.applySort([{ field: 'f', dir: 'desc' }])).toThrow(TypeError);
    (dl as any)._data[2] = hold;
    expect(ids(dl)).toEqual(before);
    // 던진 뒤에도 다음 정렬은 정상(옛 코드와 같은 결과)
    dl.applySort([{ field: 'f', dir: 'desc' }]);
    expect(ids(dl)).toEqual([0, 2]);
  });

  it('KR-03 던져도 고정 출발 순서가 남지 않음(새 메서드 displayOrder — 걸음 전 사본엔 없음)', () => {
    // f 에 같은 값이 있어 「어디서 출발하나」가 결과를 가른다(g 로 먼저 정렬한 순서 ≠ 넣은 순서).
    const rows = Array.from({ length: 4 }, (_, id) => ({ id, f: id < 2 ? 'x' : 'y', g: id }));
    const dl = layer(rows);
    dl.applySort([{ field: 'g', dir: 'desc' }]);
    const before = Array.from(dl.displayOrder());
    const hold = (dl as any)._data[2];
    (dl as any)._data[2] = null;
    expect(() => dl.applySort([{ field: 'f', dir: 'desc' }])).toThrow(TypeError);
    (dl as any)._data[2] = hold;
    // 숨은 출발 상태 필드는 설계 §17-4(C2)로 없어졌다(출발 순서는 인자). 없어진 이름을 글자로 보는 대신 동작으로 단언한다:
    // 던진 정렬은 표시 순서를 안 바꾸고, 다음 정렬은 「그 순서」에서 출발한다(낡은 출발 순서가 남지 않음).
    expect(Array.from(dl.displayOrder())).toEqual(before);
    dl.applySort([{ field: 'f', dir: 'desc' }]);
    const want = legacySortIndexes(rows, before, [{ field: 'f', dir: 'desc' }]);
    expect(want, '출발 순서가 결과를 가르는 자료여야 함').not.toEqual(legacySortIndexes(rows, [0, 1, 2, 3], [{ field: 'f', dir: 'desc' }]));
    expect(Array.from(dl.displayOrder())).toEqual(want);
  });

  it('CMP-01 사용자 비교자 — 호출 차례·횟수·인자(a, b, field, dir)·this 가 옛 정렬과 똑같음(G01·G03·G09 × 씨앗 2 × 여러 키, 방향 빠진 목록 포함)', () => {
    const LISTS: any[][] = [[{ field: 'g', dir: 'desc' }, { field: 'f', dir: 'asc' }], [{ field: 'g' }, { field: 'f', dir: 'asc' }]];
    for (const list of LISTS) for (const gid of ['G01', 'G03', 'G09']) for (const seed of SEEDS.slice(0, 2)) {
      const rows = rowsOf(GENS.find(g => g.id === gid)!.make(seed), seed);
      const logNew: string[] = [], logOld: string[] = [];
      const base = (a: any, b: any) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
      const mk = (log: string[]): Cmp => function (this: unknown, a, b, f, d) {
        const who = this === undefined ? 'undef' : String((this as any)?.constructor?.name ?? typeof this);
        log.push(`${String(a)}|${String(b)}|${f}|${String(d)}|this:${who}`);
        return base(a, b);
      };
      const dl = layer(rows, mk(logNew));
      dl.applySort(list as any);
      const want = legacySortIndexes(rows, rows.map((_, i) => i), list, () => false, mk(logOld));
      expect(ids(dl)).toEqual(want);
      expect(logNew.length).toBe(logOld.length);
      expect(logNew).toEqual(logOld);
    }
  });

  it('CMP-03 (R2-1) 사용자 비교자 안의 this 는 undefined — 안쪽 객체가 새어 나가지 않음', () => {
    const seen = new Set<unknown>();
    const fn = function (this: unknown, a: any, b: any) { seen.add(this); return a < b ? -1 : a > b ? 1 : 0; };
    const dl = layer([{ id: 0, f: 'c' }, { id: 1, f: 'a' }, { id: 2, f: 'b' }], fn as any);
    dl.applySort([{ field: 'f', dir: 'asc' }]);
    expect(ids(dl)).toEqual([1, 2, 0]);
    expect([...seen]).toEqual([undefined]);
  });

  it('CMP-04 (R2-2) 정렬 목록에 dir 이 없으면 비교자 넷째 인자도 undefined, 순서는 옛것처럼 내림차순', () => {
    const dirs = new Set<unknown>();
    const fn = (a: any, b: any, _f: string, d: any) => { dirs.add(d); return a < b ? -1 : a > b ? 1 : 0; };
    const rows = [{ id: 0, f: 'b' }, { id: 1, f: 'c' }, { id: 2, f: 'a' }];
    const dl = layer(rows, fn);
    dl.applySort([{ field: 'f' } as any]);
    expect([...dirs]).toEqual([undefined]);
    expect(ids(dl)).toEqual(legacySortIndexes(rows, [0, 1, 2], [{ field: 'f' } as any], () => false, fn));
    expect(ids(dl)).toEqual([1, 0, 2]);
  });

  it('CMP-02 사용자 비교자가 던지면 예외가 호출자에게 감(삼키지 않음), 표시 순서 그대로', () => {
    const dl = layer([{ id: 0, f: 'b' }, { id: 1, f: 'a' }], () => { throw new Error('boom'); });
    expect(() => dl.applySort([{ field: 'f', dir: 'asc' }])).toThrow('boom');
    expect(ids(dl)).toEqual([0, 1]);
  });
});
