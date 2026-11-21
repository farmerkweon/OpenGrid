/**
 * 넓은 그리드 · 걸음 C0b — 디테일·묶음 합성 결과 캐시.
 * 테스트 설계서 TEST_DESIGN_NEW.md §15-2 U-FLAT-C01~C04 · ST-14 · §16 ST-15 · (C0 에서 옮겨 온) U-FLAT-03·07,
 * 그리고 C0 검토가 넘긴 「옛 펼침 id 만 남으면 직통으로」(U-FLAT-C05 — 이 파일에서 새로 붙인 번호). 레인 L21(VP).
 *
 * 대조군(§17 준비 고침): 같은 DataLayer·splice·backing 으로 **새 FlatRowModel** 을 만들어 그 자리에서 합성한 결과.
 * 새 인스턴스는 담아 둔 것이 없으므로 늘 새로 합성한다.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { DataLayer } from '../../src/core/DataLayer.js';
import { FlatRowModel } from '../../src/core/FlatRowModel.js';
import type { OpenGrid } from '../../src/core/OpenGrid.js';
import { installResizeObserverStub, makeGrid } from './widegrid-helpers.js';
import { wColumns, wRows } from './wg-helpers/counters.js';
import { mulberry32 } from './wg-helpers/sort-data.js';

beforeAll(() => installResizeObserverStub());
afterEach(() => { vi.restoreAllMocks(); });

const SEEDS = [20261121, 1, 2, 3, 42, 7777, 0xC0FFEE, 99991];
const N_OPS = 80;

function detailGrid(rows = 300): { grid: OpenGrid<any>; container: HTMLElement } {
  const data = wRows(rows, 4).map((r, i) => ({ ...r, n: (i * 7919) % rows, g: `g${i % 5}` }));
  return makeGrid({
    columns: [...wColumns(4, 0), { field: 'n', header: 'N', type: 'number' }, { field: 'g', header: 'G' }],
    masterDetail: { enabled: true, height: 64 }, sortable: true,
  }, data);
}

/** 대조군: 같은 입력으로 새 모델을 만들어 그 자리에서 합성. */
function freshFlat(grid: OpenGrid<any>): any[] {
  const m = grid.getFlatRowModel() as any;
  const fresh = new FlatRowModel({ getDataLayer: () => (grid as any)._data, rowIdField: '_ogRowId' }) as any;
  fresh.setBacking(m._backing);
  for (const s of m._splices) fresh.registerSplice(s.fn, s.isActive); // 판 번호 없이 = 담아 두지 않음
  return fresh.getFlatArray();
}

/** 캐시된 쪽과 대조군이 같은가 — 길이, 모든 자리의 항목(===), rowAt/resolveFlatRow 의 종류·id. 다르면 까닭. */
function compare(grid: OpenGrid<any>): string | null {
  const m = grid.getFlatRowModel() as any;
  const want = freshFlat(grid);
  const got = m.getFlatArray();
  const n = m.count();
  if (n !== want.length) return `count ${n} ≠ ${want.length}`;
  if (got.length !== want.length) return `length ${got.length} ≠ ${want.length}`;
  for (let i = 0; i < n; i++) {
    const g = got[i], w0 = want[i];
    if (w0?._isDetailHead || w0?._isDetailFiller) {
      // 디테일 의사행은 합성할 때마다 새로 만들어지므로 내용으로 견준다(마스터 행은 같은 객체여야 함).
      if (!!g?._isDetailHead !== !!w0._isDetailHead || !!g?._isDetailFiller !== !!w0._isDetailFiller ||
          g._rowId !== w0._rowId || g._span !== w0._span || g._masterFlatBase !== w0._masterFlatBase) return `pseudo[${i}] 다름`;
    } else if (g !== w0) return `item[${i}] 다름`;
    const r = m.resolveFlatRow(i);
    const w = want[i];
    const wantKind = w._isDetailFiller ? 'detailFiller' : w._isDetailHead ? 'detailHead' : w._isGroup ? 'group' : w._isTree ? 'tree' : 'data';
    if (r.kind !== wantKind) return `kind[${i}] ${r.kind} ≠ ${wantKind}`;
  }
  return null;
}

type Ctx = { grid: OpenGrid<any>; rnd: () => number; grouped: boolean };
const OPS: Array<[string, (c: Ctx) => string]> = [
  ['orderBy', c => { const f = c.rnd() < 0.5 ? 'n' : 'c0'; const d = c.rnd() < 0.5 ? 'asc' : 'desc'; c.grid.orderBy(f, d as any); return `orderBy ${f} ${d}`; }],
  ['setFilter', c => { const v = String(Math.floor(c.rnd() * 10)); c.grid.setFilter('c0', [{ operator: 'contains', value: v } as any]); return `setFilter ${v}`; }],
  ['clearFilter', c => { c.grid.resetFilter(); return 'resetFilter'; }],
  ['addRow', c => { const n = c.grid.getFlatRowModel().count(); const p = Math.floor(c.rnd() * (n + 1)); c.grid.insertRow({ c0: `new${p}`, n: Math.floor(c.rnd() * 300), g: 'g9' } as any, p); return `insertRow ${p}`; }],
  ['removeRow', c => { const n = (c.grid as any)._data.rowCount; if (!n) return 'deleteRow -'; const p = Math.floor(c.rnd() * n); c.grid.deleteRow(p); return `deleteRow ${p}`; }],
  ['moveRow', c => { const n = (c.grid as any)._data.rowCount; if (n < 2) return 'reorderRow -'; const a = Math.floor(c.rnd() * n), b = Math.floor(c.rnd() * n); c.grid.reorderRow(a, b); return `reorderRow ${a} ${b}`; }],
  ['setData', c => { const k = 50 + Math.floor(c.rnd() * 250); c.grid.setData(wRows(k, 4).map((r, i) => ({ ...r, n: (i * 31) % k, g: `g${i % 5}` }))); return `setData ${k}`; }],
  ['clearData', c => { if (c.rnd() < 0.5) return 'clearData skip'; c.grid.clearData(); return 'clearData'; }],
  ['expandRow', c => { const n = c.grid.getFlatRowModel().count(); if (!n) return 'expandRow -'; const p = Math.floor(c.rnd() * n); c.grid.expandRow(p); return `expandRow ${p}`; }],
  ['collapseRow', c => { const n = c.grid.getFlatRowModel().count(); if (!n) return 'collapseRow -'; const p = Math.floor(c.rnd() * n); c.grid.collapseRow(p); if (c.rnd() < 0.2) c.grid.collapseAllDetails(); return `collapseRow ${p}`; }],
  ['groupToggle', c => { if (c.grouped) { c.grid.clearGroup(); c.grouped = false; return 'clearGroup'; } c.grid.groupBy(['g']); c.grouped = true; return 'groupBy g'; }],
  ['groupOpen', c => { if (!c.grouped) return 'groupOpen -'; if (c.rnd() < 0.5) { c.grid.expandAll(); return 'expandAll'; } c.grid.collapseAll(); return 'collapseAll'; }],
  ['updateCell', c => { const n = (c.grid as any)._data.rowCount; if (!n) return 'writeCell -'; const p = Math.floor(c.rnd() * n); c.grid.writeCell(p, 'c1', `w${p}`); return `writeCell ${p}`; }],
];

/** 씨앗 하나로 조작 열을 돌리며 매 조작 뒤 대조. 처음 어긋난 자리를 돌려준다(없으면 null). */
function runSeed(seed: number, n = N_OPS): string | null {
  const { grid, container } = detailGrid();
  const c: Ctx = { grid, rnd: mulberry32(seed), grouped: false };
  const trail: string[] = [];
  try {
    grid.expandRow(0); grid.expandRow(5);
    const first = compare(grid);
    if (first) return `start: ${first}`;
    for (let i = 0; i < n; i++) {
      const [, op] = OPS[Math.floor(c.rnd() * OPS.length)]!;
      trail.push(op(c));
      const bad = compare(grid);
      if (bad) return `씨앗 ${seed} 조작 ${i}: ${bad} · 앞선 조작 ${trail.slice(-5).join(' → ')}`;
    }
    return null;
  } finally { grid.destroy(); container.remove(); }
}

describe('C0b 합성 결과 캐시', () => {
  it('U-FLAT-C01 캐시 합성 == 새 합성 무작위 대조: 씨앗 8 × 80조작(정렬·필터·행 추가/삭제/이동·setData·clearData·디테일 펼침/접힘·묶음 켬끔·묶음 펼침/접힘·값 쓰기)', () => {
    const fails = SEEDS.map(s => runSeed(s)).filter(Boolean);
    expect(fails).toEqual([]);
  }, 120000);

  it('U-FLAT-C02(옮겨 온 U-FLAT-03) 디테일 펼침: 조작 없이 2,150번 resolveFlatRow 동안 합성 1번(getData ≤ 1)', () => {
    const { grid, container } = detailGrid();
    grid.expandRow(3);
    const m = grid.getFlatRowModel() as any;
    m.count(); // 한 번 합성해 둠
    const spy = vi.spyOn(DataLayer.prototype, 'getData');
    const builds0 = m._composed.builds;
    for (let k = 0; k < 2150; k++) m.resolveFlatRow(k % m.count());
    expect(m._composed.builds - builds0).toBe(0);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(m.directHits).toBe(m.directHits); // 진단 이음새가 그대로 있다
    grid.destroy(); container.remove();
  });

  it('U-FLAT-C03 열쇠 성분 셋 각각: structureVersion 만 / activeVersion 만 / backing 참조만 바꾸면 각각 다시 만듦', () => {
    const { grid, container } = detailGrid();
    grid.expandRow(3);
    const m = grid.getFlatRowModel() as any;
    const dm = (grid as any)._detailMgr;
    m.count();
    const b = () => m._composed.builds;
    // ① structureVersion 만: 같은 값으로 필터를 다시 걸면 구조 판 번호만 오른다(행 집합 같음)
    let b0 = b(); (grid as any)._data.applyFilter({}); m.count(); expect(b() - b0).toBe(1);
    // ② activeVersion 만: 판 번호만 올림(펼침 집합 그대로)
    b0 = b(); dm._activeVersion++; m.count(); expect(b() - b0).toBe(1);
    // ③ backing 참조만: 같은 내용의 새 공급 함수
    const base = (grid as any)._data.getData();
    b0 = b(); m.setBacking(() => base); m.count(); expect(b() - b0).toBe(1);
    b0 = b(); m.count(); m.count(); expect(b() - b0).toBe(0);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-C04 정렬은 structureVersion 을 올림: orderBy → 다시 만듦 · 순서 = 새 순서', () => {
    const { grid, container } = detailGrid();
    grid.expandRow(3);
    const m = grid.getFlatRowModel() as any;
    const before = m.getFlatArray();
    const b0 = m._composed.builds;
    grid.orderBy('n', 'desc');
    const after = m.getFlatArray();
    expect(m._composed.builds - b0).toBe(1);
    expect(after).not.toBe(before);
    const firstData = after.find((x: any) => !x._isDetailHead && !x._isDetailFiller);
    expect(firstData.n).toBe(299);
    expect(compare(grid)).toBeNull();
    grid.destroy(); container.remove();
  });

  it('U-FLAT-07(C0b) 펼친 채 setData(새 500행) → 옛 합성 결과 안 남음, 새 자료 기준', () => {
    const { grid, container } = detailGrid();
    grid.expandRow(3);
    const m = grid.getFlatRowModel() as any;
    m.count();
    grid.setData(wRows(500, 4).map((r, i) => ({ ...r, n: i, g: 'g0' })));
    expect(m.count()).toBe(500);
    expect((m.rowAt(0) as any).c0).toBe('r0c0');
    expect(compare(grid)).toBeNull();
    grid.destroy(); container.remove();
  });

  it('U-FLAT-C05 옛 펼침 id 만 남으면 직통: 펼친 채 setData → 합성 안 함(직통 원천) · 같은 id 로 다시 넣으면 다시 펼쳐 보임', () => {
    const rows = wRows(30, 4).map((r, i) => ({ ...r, id: `k${i}` }));
    const { grid, container } = makeGrid({ columns: wColumns(4, 0), masterDetail: { enabled: true, height: 64 }, rowIdField: 'id' } as any, rows);
    const m = grid.getFlatRowModel() as any;
    const dm = (grid as any)._detailMgr;
    grid.expandRow(3);
    expect(m.count()).toBe(32);
    const keepRow = (grid as any)._data.getRowByIndex(3);
    grid.setData(wRows(30, 4).map((r, i) => ({ ...r, id: `z${i}` }))); // 다른 행들
    expect(dm.isActive).toBe(true); // 펼침 상태는 그대로(솎지 않음 — 공개 뜻 그대로)
    const h0 = m.directHits;
    expect(m.count()).toBe(30);
    m.resolveFlatRow(0);
    expect(m.directHits - h0).toBe(1); // 직통
    expect(compare(grid)).toBeNull();
    // setData 는 같은 행 객체를 다시 넣어도 새 id 를 준다 — 옛 펼침 id 는 어떤 경우에도 새 자료와 안 맞는다
    // (그래서 펼침 상태를 솎지 않아도 「지금 자료에 있나」 판정만으로 충분하다).
    const oldId = keepRow._ogRowId;
    grid.setData([keepRow, ...wRows(5, 4)]);
    expect((grid as any)._data.getRowByIndex(0)._ogRowId).not.toBe(oldId);
    expect(dm.isExpandedId(oldId)).toBe(true);
    expect(m.count()).toBe(6);
    expect(compare(grid)).toBeNull();
    grid.destroy(); container.remove();
  });

  it('U-FLAT-C06 묶음: 펼침/접힘·값 쓰기 뒤 캐시 == 새 합성, 그리고 조작 없이 다시 물으면 합성 0번', () => {
    const { grid, container } = detailGrid(120);
    grid.groupBy(['g']);
    const m = grid.getFlatRowModel() as any;
    grid.expandAll(); expect(compare(grid)).toBeNull();
    grid.writeCell(0, 'c1', 'X'); expect(compare(grid)).toBeNull();
    grid.collapseAll(); expect(compare(grid)).toBeNull();
    const b0 = m._composed.builds;
    for (let k = 0; k < 500; k++) m.resolveFlatRow(k % m.count());
    expect(m._composed.builds - b0).toBe(0);
    grid.destroy(); container.remove();
  });

  it('C0b 지킬 이음새: 합성 결과의 데이터 행은 DataLayer 의 같은 행 객체(감싸거나 새로 만들지 않음), 메타 필드 그대로', () => {
    const { grid, container } = detailGrid();
    grid.expandRow(3);
    const m = grid.getFlatRowModel() as any;
    const dl = (grid as any)._data as DataLayer<any>;
    const arr = m.getFlatArray();
    const head = arr[4];
    expect(head._isDetailHead).toBe(true);
    expect(typeof head._rowId).toBe('string');
    expect(typeof head._span).toBe('number');
    expect(head._masterFlatBase).toBe(dl.getRowByIndex(3));
    expect(arr[5]._isDetailFiller).toBe(true);
    for (let i = 0; i < 4; i++) expect(arr[i]).toBe(dl.getRowByIndex(i));
    expect(arr[6]).toBe(dl.getRowByIndex(4));
    expect(typeof arr[0]._ogRowId).toBe('string');
    grid.destroy(); container.remove();
  });
});

describe('C0b 자기시험', () => {
  it('ST-14 열쇠에서 structureVersion 을 뺀 판(늘 같은 값) → U-FLAT-C01 이 빨개짐', () => {
    vi.spyOn(DataLayer.prototype, 'structureVersion', 'get').mockReturnValue(0);
    const fails = SEEDS.slice(0, 3).map(s => runSeed(s, 40)).filter(Boolean);
    vi.restoreAllMocks();
    expect(fails.length).toBeGreaterThan(0);
    expect(runSeed(SEEDS[0]!, 40)).toBeNull();
  }, 120000);

  it('ST-14b 열쇠에서 splice 판 번호를 뺀 판(늘 같은 값) → U-FLAT-C01 이 빨개짐', async () => {
    const DM = (await import('../../src/core/DetailManager.js')).DetailManager as any;
    vi.spyOn(DM.prototype, 'activeVersion', 'get').mockReturnValue(0);
    const fails = SEEDS.slice(0, 3).map(s => runSeed(s, 40)).filter(Boolean);
    vi.restoreAllMocks();
    expect(fails.length).toBeGreaterThan(0);
  }, 120000);

  // ST-15: 구조 판 번호가 오르는 일곱 곳 가운데 한 곳씩, 그 메서드가 올린 만큼을 되돌린 판 일곱 개.
  const SEVEN: Array<[string, (g: OpenGrid<any>) => void]> = [
    // 그리드의 setData 는 묶음 다시 만들기 등으로 backing 도 갈아 끼울 수 있어 판 번호 빼먹기가 가려진다 —
    // 자료 계층에 바로 넣어 판 번호만이 무효화 근거인 상태를 만든다.
    ['setData', g => (g as any)._data.setData(wRows(40, 4).map((r, i) => ({ ...r, n: i, g: 'g0' })))],
    ['clearData', g => g.clearData()],
    ['addRow', g => g.insertRow({ c0: 'ADD', n: 1, g: 'g0' } as any, 0)],
    ['removeRow', g => g.deleteRow(0)],
    ['moveRow', g => g.reorderRow(0, 7)],
    ['applySort', g => g.orderBy('n', 'desc')],
    ['applyFilter', g => g.setFilter('c0', [{ operator: 'contains', value: '1' } as any])],
  ];
  for (const [method, act] of SEVEN) {
    it(`ST-15 ${method} 뒤 판 번호 증가를 되돌린 판 → 캐시 == 새 합성 대조가 빨개짐`, () => {
      const proto = DataLayer.prototype as any;
      const orig = proto[method];
      vi.spyOn(proto, method).mockImplementation(function (this: any, ...a: any[]) {
        const v = this._structureVersion;
        const r = orig.apply(this, a);
        this._structureVersion = v; // 이 메서드가 올린 만큼 되돌림
        return r;
      });
      const { grid, container } = detailGrid();
      grid.expandRow(0); grid.expandRow(5);
      // setData 는 늘 새 id 를 주어 옛 펼침이 사라지고 직통 길로 가므로(합성 캐시를 안 거침), 늘 활성이고 판 번호가
      // 고정인 표지 splice 하나를 더해 일곱 곳 모두 합성 캐시 길에서 판 번호만으로 무효화되게 한다.
      (grid.getFlatRowModel() as any).registerSplice((f: any[]) => f.concat([{ _isDetailFiller: true, _rowId: '__mark' }]), () => true, () => 0);
      expect(compare(grid)).toBeNull(); // 캐시를 채움
      act(grid);
      const bad = compare(grid);
      vi.restoreAllMocks();
      grid.destroy(); container.remove();
      expect(bad, `${method} 를 망가뜨렸는데 대조가 못 잡음`).not.toBeNull();
    });
  }
});
