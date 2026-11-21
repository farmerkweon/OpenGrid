/**
 * 걸음 C3 — 등수 보관 뒤 값·행이 바뀌어도 재정렬 순서가 옳다 (TEST_DESIGN_NEW §2-14 U-STORE-10~20 · DF-07).
 * 대조군 = 옛 applySort 사본(legacySortIndexes) 에 「지금 자료 + 지금 표시 순서」를 그대로 넣은 결과.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DataLayer } from '../../src/core/DataLayer';
import { OpenGrid } from '../../src/core/OpenGrid';
import { legacySortIndexes } from './wg-helpers/legacy-controls';
import { mulberry32 } from './wg-helpers/sort-data';

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

type Spec = { field: string; dir: 'asc' | 'desc' };
/** 대조군으로 기대 순서를 내고, 실제 applySort 결과와 견준다(행 객체 동일성으로). */
function sortAndCheck(dl: DataLayer, specs: Spec[]) {
  const rows = dl.rows as any[];
  const start = Array.from(dl.displayOrder());
  const want = legacySortIndexes(rows, start, specs).map(i => rows[i]);
  dl.applySort(specs);
  expect(dl.getData()).toEqual(want);
  for (let k = 0; k < want.length; k++) expect(dl.getData()[k]).toBe(want[k]);
}
const F = (dir: 'asc' | 'desc' = 'asc', field = 'f'): Spec[] => [{ field, dir }];
function base() {
  const dl = new DataLayer();
  dl.setData(['b', 'd', 'a', 'e', 'c'].map((f, i) => ({ i, f })));
  sortAndCheck(dl, F());
  sortAndCheck(dl, F());
  return dl;
}
const fs = (dl: DataLayer) => dl.getData().map((r: any) => r.f);

describe('C3 U-STORE 재정렬 정확성(공개·준공개 길)', () => {
  it('U-STORE-10 updateCell 뒤 재정렬 → [b,c,d,e,z]', () => {
    const dl = base();
    dl.updateCell(0, 'f', 'z'); // 표시 0행 = 'a'
    sortAndCheck(dl, F());
    expect(fs(dl)).toEqual(['b', 'c', 'd', 'e', 'z']);
  });
  it('U-STORE-12 addRow 뒤 (last·first·숫자 위치)', () => {
    for (const pos of ['last', 'first', 2] as const) {
      const dl = base();
      dl.addRow({ f: 'aa' } as any, pos);
      sortAndCheck(dl, F());
      sortAndCheck(dl, F('desc'));
    }
  });
  it('U-STORE-13 removeRow 뒤 — 지운 행 없음', () => {
    const dl = base();
    const gone = dl.removeRow(1);
    sortAndCheck(dl, F('desc'));
    expect(dl.getData()).not.toContain(gone);
  });
  it('U-STORE-14 moveRow 뒤 — 정렬 해제 → moveRow(0→4) → 정렬', () => {
    const dl = base();
    dl.applySort([]);
    dl.moveRow(0, 4);
    sortAndCheck(dl, F());
    sortAndCheck(dl, F('desc'));
  });
  it('U-STORE-15 setData 뒤 같은 길이 다른 값', () => {
    const dl = base();
    dl.setData(['q', 'w', 'e', 'r', 't'].map((f, i) => ({ i, f })));
    sortAndCheck(dl, F());
  });
  it('U-STORE-16 수식 결과(계산값 기록) 바뀐 뒤', () => {
    const dl = new DataLayer();
    dl.setData([3, 1, 2, 5].map((n, i) => ({ i, n })));
    sortAndCheck(dl, F('asc', 'n'));
    const id = (dl.getRowByIndex(0) as any)._ogRowId;
    dl.setComputedValueByRowId(id, 'n', 99);
    sortAndCheck(dl, F('asc', 'n'));
    expect(dl.getData().map((r: any) => r.n)).toEqual([2, 3, 5, 99]);
  });
  it('U-STORE-17 Date 제자리 수정 뒤', () => {
    const dl = new DataLayer();
    dl.setData([2001, 1999, 2010].map((y, i) => ({ i, d: new Date(Date.UTC(y, 0, 1)) })));
    sortAndCheck(dl, F('asc', 'd'));
    (dl.getData()[2] as any).d.setUTCFullYear(1990);
    sortAndCheck(dl, F('asc', 'd'));
    // 순서 기대는 대조군 그대로(옛 규칙은 String(Date) 사전순 — 요일 글자순이라 연도순이 아님, 이번 판 안 고침).
    expect(dl.getData().some((r: any) => r.d.getUTCFullYear() === 1990)).toBe(true);
  });
  it('U-STORE-18 공개 행 객체 직접 수정 뒤', () => {
    const dl = base();
    (dl.getData()[2] as any).f = 'zz';
    sortAndCheck(dl, F());
    expect(fs(dl).at(-1)).toBe('zz');
  });
  it('U-STORE-19 clearData → setData 뒤', () => {
    const dl = base();
    dl.clearData();
    dl.setData(['m', 'k', 'l'].map((f, i) => ({ i, f })));
    sortAndCheck(dl, F());
  });
  it('U-STORE-20 정렬 뒤 필터 — 지금처럼 원래 순서(S-23 그대로)', () => {
    const dl = new DataLayer();
    dl.setData([{ f: 'a' }, { f: 'b' }, { f: 'c' }]);
    dl.applySort(F('desc'));
    dl.applySort(F('desc'));
    dl.applyFilter({ f: [{ operator: '!=', value: 'zzz' }] } as any);
    expect(fs(dl)).toEqual(['a', 'b', 'c']);
  });
  it('U-STORE-11 writeCell(공개 API) 뒤 orderBy', () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const g = new OpenGrid(el, { columns: [{ field: 'f', header: 'F', width: 100 }], height: 300 });
    g.setData(['b', 'd', 'a', 'e', 'c'].map(f => ({ f })));
    g.orderBy('f', 'asc'); g.orderBy('f', 'asc');
    g.writeCell(0, 'f', '0');
    g.orderBy('f', 'desc'); g.orderBy('f', 'asc');
    expect(g.getData().map((r: any) => r.f)).toEqual(['0', 'b', 'c', 'd', 'e']);
    g.destroy();
  });
  it('DF-07 등수 보관 정렬 == 보관 없이 정렬 — 씨앗 8 × (정렬 → 무작위 변이 1개 → 정렬) 50번', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = mulberry32(seed);
      const dl = new DataLayer();
      dl.setData(Array.from({ length: 60 }, (_, i) => ({ i, f: 'w' + Math.floor(r() * 15), n: Math.floor(r() * 9) - 3 })));
      for (let t = 0; t < 50; t++) {
        const field = r() < 0.5 ? 'f' : 'n';
        sortAndCheck(dl, [{ field, dir: r() < 0.5 ? 'asc' : 'desc' }, { field: field === 'f' ? 'n' : 'f', dir: 'asc' }]);
        const op = Math.floor(r() * 7), n = dl.rowCount;
        if (op === 0 && n) dl.updateCell(Math.floor(r() * n), field, field === 'f' ? 'w' + Math.floor(r() * 15) : Math.floor(r() * 9));
        else if (op === 1) dl.addRow({ i: 1000 + t, f: 'w' + Math.floor(r() * 15), n: 0 } as any, r() < 0.5 ? 'last' : 'first');
        else if (op === 2 && n > 1) dl.removeRow(Math.floor(r() * n));
        else if (op === 3 && n > 1) dl.moveRow(Math.floor(r() * n), Math.floor(r() * n));
        else if (op === 4 && n) (dl.getData()[Math.floor(r() * n)] as any)[field] = field === 'f' ? 'w' + Math.floor(r() * 15) : Math.floor(r() * 9);
        else if (op === 5) dl.applyFilter(r() < 0.5 ? {} : ({ n: [{ operator: '>', value: -2 }] } as any));
        else if (op === 6) dl.applySort([]);
      }
    }
  });
});
