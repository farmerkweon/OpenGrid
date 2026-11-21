/**
 * 넓은 그리드 · 걸음 C0 — 자료 원천(직통 / 합성)과 수식 빈 저장소 빠른 길.
 * 테스트 설계서 TEST_DESIGN_NEW.md §2-21 U-FLAT-*(C0 몫: 01·02·04~06·08~17 — 03·07 의 「한 번만 만듦」은 C0b),
 * NR-14, ST-10, ST-22, §15-3 의 C0 줄. 레인 L21(VP).
 *
 * 「옛 결과」 기준: 고치기 전 코드(src 깨끗한 상태)로 이 파일을 `WG_FLAT_RECORD=1` 로 한 번 돌려
 * `__golden__/wg/wg-flat-c0.pre.json` 에 적어 두었다(행 id 는 실행마다 달라질 수 있어 행 글자로 바꿔 적는다).
 * 보통 실행은 그 파일을 읽어 대조만 한다.
 *
 * U-FLAT-02 는 U-FLAT-11 과 동시에 성립할 수 없어 02a/02b 로 나눴다(로그 WARN 경우변경, steps/C0/L21/NOTES.md §5):
 * 그리기 중 칸마다 FlatRowModel 을 부르는 길이 `getFormulaMeta` 하나뿐이라, 빈 저장소 빠른 길이 먹으면 그리기 중 직통 횟수는 0 이다.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { DataLayer } from '../../src/core/DataLayer.js';
import { FlatRowModel } from '../../src/core/FlatRowModel.js';
import { installResizeObserverStub, makeContainer, makeGrid } from './widegrid-helpers.js';
import { injectBodyWrap, frames, wColumns, wRows, mkW, disposeW } from './wg-helpers/counters.js';
import { mulberry32 } from './wg-helpers/sort-data.js';

const RECORD = process.env.WG_FLAT_RECORD === '1';
const PRE_FILE = resolve(__dirname, '__golden__/wg/wg-flat-c0.pre.json');
const T0 = JSON.parse(readFileSync(resolve(__dirname, '__golden__/wg/T0_FACTS.json'), 'utf8'));
const pre: Record<string, any> = existsSync(PRE_FILE) ? JSON.parse(readFileSync(PRE_FILE, 'utf8')) : {};

/** 고치기 전 값이면 적고, 아니면 적어 둔 값과 대조한다. */
function againstPre(key: string, now: unknown): void {
  if (RECORD) {
    pre[key] = now;
    writeFileSync(PRE_FILE, JSON.stringify(pre, null, 1) + '\n', 'utf8');
    return;
  }
  expect(pre[key], `기준 ${key} 가 ${PRE_FILE} 에 없음`).toBeDefined();
  expect(now).toEqual(pre[key]);
}

/** 진단 접근자 — 직통 원천이 행을 내준 횟수(@internal). 없으면(고치기 전) undefined. */
function hits(m: any): number { return m.directHits; }

beforeAll(() => installResizeObserverStub());
afterEach(() => { vi.restoreAllMocks(); });

/** 행 하나를 사람이 읽는 글자로(행 id 는 실행마다 다를 수 있다). */
function label(item: any): string {
  if (item == null) return '∅';
  if (item._isDetailHead) return `H:${item._span}`;
  if (item._isDetailFiller) return 'F';
  if (item._isGroup) return `G:${item._groupValue ?? item.value ?? ''}:${item._childCount ?? item.count ?? ''}`;
  if (item._isTree) return `T:${item.data?.name ?? ''}:${item._depth ?? item.depth ?? ''}`;
  return `D:${item.c0 ?? item.name ?? ''}`;
}
function refLabel(grid: OpenGrid<any>, i: number): string {
  const m = grid.getFlatRowModel();
  const ref = m.resolveFlatRow(i);
  const row = ref.rowId != null ? (grid as any)._data.getRowById(ref.rowId) : null;
  return `${ref.kind}|${row ? (row.c0 ?? row.name ?? '') : ''}|${ref.displayIndex ?? ''}|${ref.dataIndex ?? ''}`;
}
function allRefs(grid: OpenGrid<any>): string[] {
  const n = grid.getFlatRowModel().count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(refLabel(grid, i));
  return out;
}

/** 크기를 주입한 그리드(그리기 확인용). */
async function sizedGrid(options: Record<string, any>, data: any[]): Promise<{ grid: OpenGrid<any>; container: HTMLElement }> {
  const container = makeContainer(1200, 640);
  const grid = new OpenGrid<any>(container, options as any);
  injectBodyWrap(container, 1200, 640);
  grid.setData(data);
  await frames(3);
  return { grid, container };
}
function drawnRows(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="row"][aria-rowindex]')).map(r => {
    const c0 = r.querySelector('[role="gridcell"][aria-colindex="1"]')?.textContent ?? '';
    const c1 = r.querySelector('[role="gridcell"][aria-colindex="2"]')?.textContent ?? '';
    return `${r.getAttribute('aria-rowindex')}|${c0}|${c1}`;
  });
}

// ─── 검사 함수(자기시험이 같은 함수를 망가뜨린 판에서 부른다) ────────────────
/** U-FLAT-01 의 판정. 통과면 null, 아니면 까닭. */
function checkFlat01(): string | null {
  const { grid, container } = makeGrid({ columns: wColumns(5, 0) }, wRows(1000, 5));
  try {
    const m = grid.getFlatRowModel() as any;
    const dl = (grid as any)._data as DataLayer<any>;
    const h0 = hits(m);
    for (let i = 0; i < 1000; i++) m.resolveFlatRow(i);
    const d = hits(m) - h0;
    if (d !== 1000) return `directHits Δ=${d}`;
    if (m.count() !== dl.rowCount) return `count ${m.count()} ≠ ${dl.rowCount}`;
    for (let i = 0; i < 1000; i++) if (m.rowAt(i) !== dl.getRowByIndex(i)) return `rowAt(${i}) !== getRowByIndex`;
    return null;
  } finally { grid.destroy(); container.remove(); }
}

/** U-FLAT-02b 의 판정: 창 밖 칸에 수식 1개(저장소만 비지 않게) — 스크롤 그리기 1회에 getData 0 · directHits = T0. */
async function checkFlat02b(): Promise<{ getData: number; direct: number; rows: number; entering: number }> {
  const s = await mkW({ rows: 100, cols: 50, rendererEvery: 0 });
  try {
    s.grid.setCellFormula(99, 'c49', '=1+2');
    await frames(2);
    const spy = vi.spyOn(DataLayer.prototype, 'getData');
    const m = s.grid.getFlatRowModel() as any;
    spy.mockClear();
    const h0 = hits(m);
    const rowIdx = () => new Set(Array.from(s.container.querySelectorAll('.og-body [role="row"]')).map(r => r.getAttribute('aria-rowindex')));
    const before = rowIdx();
    // C7(스크롤 「같으면 안 그림」) 뒤: 한 행(32px)은 위아래 여유(5행) 안이라 그리지 않는다 → 여유 밖(10행)으로 옮겨 그리기 1회를 낸다.
    s.wrap.scrollTo(32 * 10, null);
    await frames(1);
    const after = rowIdx();
    const entering = [...after].filter(x => !before.has(x)).length;
    const out = { getData: spy.mock.calls.length, direct: (hits(m) ?? NaN) - (h0 ?? NaN), rows: s.container.querySelectorAll('.og-body [role="row"]').length, entering };
    spy.mockRestore();
    return out;
  } finally { disposeW(s); }
}

/** U-FLAT-08 의 판정: 필터 뒤 count = 걸러진 수, 행 맞음. sabotage 는 자기시험이 이 그리드의 모델을 망가뜨릴 때만 쓴다. */
function checkFlat08(sabotage?: (model: any) => void): string | null {
  const { grid, container } = makeGrid({ columns: wColumns(3, 0) }, wRows(200, 3));
  try {
    sabotage?.(grid.getFlatRowModel());
    grid.setFilter('c0', [{ operator: 'contains', value: '1' } as any]);
    const m = grid.getFlatRowModel();
    const dl = (grid as any)._data as DataLayer<any>;
    if (dl.rowCount >= 200) return '필터가 안 걸림(장면 전제)';
    if (m.count() !== dl.rowCount) return `count ${m.count()} ≠ ${dl.rowCount}`;
    for (let i = 0; i < m.count(); i++) if (m.rowAt(i) !== dl.getRowByIndex(i)) return `rowAt(${i})`;
    return null;
  } finally { grid.destroy(); container.remove(); }
}

const DETAIL_ROWS = () => wRows(300, 10).map((r, i) => ({ ...r, c1: (i * 7919) % 300 }));
const DETAIL_OPTS = () => ({ columns: wColumns(10, 0), masterDetail: { enabled: true, height: 64 }, sortable: true });

/** U-FLAT-17 의 장면: 디테일 펼친 행 2개 → orderBy → setFilter → addRow → removeRow → moveRow → setData, 단계마다 그려진 행. */
async function detailSequence(): Promise<Record<string, { rows: string[]; refs: string[] }>> {
  const { grid, container } = await sizedGrid(DETAIL_OPTS(), DETAIL_ROWS());
  const out: Record<string, { rows: string[]; refs: string[] }> = {};
  const snap = async (k: string) => { await frames(2); out[k] = { rows: drawnRows(container), refs: allRefs(grid).slice(0, 60) }; };
  try {
    // expandRow 의 숫자는 화면 위치(flat index) — r0 을 펼치면 디테일 2줄이 flat 1·2 를 차지해 r3 은 flat 5(N-8).
    grid.expandRow(0); grid.expandRow(5);
    await snap('expanded');
    grid.orderBy('c1', 'desc'); await snap('afterOrderBy');
    grid.setFilter('c0', [{ operator: 'contains', value: '1' } as any]); await snap('afterFilter');
    grid.insertRow({ c0: 'NEW1', c1: 999 } as any, 0); await snap('afterAddRow');
    grid.deleteRow(1); await snap('afterRemoveRow');
    grid.reorderRow(0, 3); await snap('afterMoveRow');
    grid.setData(wRows(50, 10).map((r, i) => ({ ...r, c1: i }))); await snap('afterSetData');
    return out;
  } finally { grid.destroy(); container.remove(); }
}

// ─── 경우 ─────────────────────────────────────────────────────────────
describe('C0 직통 원천 — U-FLAT', () => {
  it('U-FLAT-01 기본은 직통: resolveFlatRow 1,000번 → directHits 정확히 1,000 · count = rowCount · rowAt === getRowByIndex', () => {
    expect(checkFlat01()).toBeNull();
  });

  it('U-FLAT-02a 수식 0개 · 100행×50컬럼 스크롤 그리기 1회: getData 0 · resolveFlatRow 0(빈 저장소 빠른 길)', async () => {
    const s = await mkW({ rows: 100, cols: 50, rendererEvery: 0 });
    const spy = vi.spyOn(DataLayer.prototype, 'getData');
    const rs = vi.spyOn(FlatRowModel.prototype, 'resolveFlatRow');
    spy.mockClear(); rs.mockClear();
    s.wrap.scrollTo(32, null);
    await frames(1);
    const n = { getData: spy.mock.calls.length, resolve: rs.mock.calls.length, rows: s.container.querySelectorAll('.og-body [role="row"]').length };
    disposeW(s);
    expect(n.rows).toBe(T0['U-FLAT-02'].value.detail.viaScroll.rows);
    expect(n.getData).toBe(0);
    expect(n.resolve).toBe(0);
  });

  it('U-FLAT-02b 켰는데 안 탐: 창 밖 수식 1개 · 스크롤 그리기 1회 → getData 0 그리고 directHits = T0_FACTS.U-FLAT-02', async () => {
    const n = await checkFlat02b();
    expect(n.rows).toBe(T0['U-FLAT-02'].value.detail.viaScroll.rows);
    expect(n.getData).toBe(0);
    // 걸음 CE(행 차분) 뒤: 남는 행의 칸은 다시 그리지 않으므로 직통 원천을 타는 칸 = 들어온 행 × 50컬럼(잼: 행 0~29 → 5~34, 들어온 5행 × 50 = 250).
    // 예전 기대 = T0 directHitsPerRender 1,500(그린 30행 전부 × 50). 「켰는데 안 탐」의 뜻(getData 0 · 직통으로 읽음)은 그대로, 칸 수만 들어온 행 몫으로.
    expect(n.entering, '스크롤로 들어온 행이 있다(그리기 1회의 전제)').toBeGreaterThan(0);
    expect(n.direct).toBe(n.entering * 50);
    expect(n.direct).toBeLessThan(T0['U-FLAT-02'].value.directHitsPerRender);
  });

  it('U-FLAT-03(C0판) 디테일 펼침 → 합성: 직통 안 탐 · 결과 = 합성 배열(지금 길 그대로)', () => {
    const { grid, container } = makeGrid(DETAIL_OPTS(), DETAIL_ROWS());
    const m = grid.getFlatRowModel() as any;
    grid.expandRow(3);
    const arr = m.getFlatArray();
    const h0 = hits(m);
    const n = m.count();
    for (let i = 0; i < n; i++) m.resolveFlatRow(i);
    expect(hits(m) - h0).toBe(0);
    expect(n).toBe(300 + 2);
    expect(arr[4]._isDetailHead).toBe(true);
    for (let i = 0; i < n; i++) expect(m.rowAt(i)).toBe(arr[i]?._isDetailHead || arr[i]?._isDetailFiller ? null : arr[i]);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-04 다 접음 → 직통 복귀: directHits 가 다시 늘어남', () => {
    const { grid, container } = makeGrid(DETAIL_OPTS(), DETAIL_ROWS());
    const m = grid.getFlatRowModel() as any;
    grid.expandRow(3);
    const h0 = hits(m);
    m.resolveFlatRow(0);
    expect(hits(m) - h0).toBe(0);
    grid.collapseRow({ id: m.rowIdOfFlat(3) } as any);
    expect(m.count()).toBe(300);
    const h1 = hits(m);
    for (let i = 0; i < 10; i++) m.resolveFlatRow(i);
    expect(hits(m) - h1).toBe(10);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-05 묶음 모드: 합성(직통 안 탐) · 결과 = 고치기 전', () => {
    const data = wRows(40, 3).map((r, i) => ({ ...r, g: `g${i % 4}` }));
    const { grid, container } = makeGrid({ columns: [...wColumns(3, 0), { field: 'g', header: 'G' }] }, data);
    grid.groupBy(['g']);
    const m = grid.getFlatRowModel() as any;
    const h0 = hits(m);
    const collapsed = allRefs(grid);
    grid.expandAll();
    const expanded = allRefs(grid);
    const items = m.getFlatArray().map(label);
    if (!RECORD) expect(hits(m) - h0).toBe(0);
    againstPre('U-FLAT-05', { collapsed, expanded, items });
    grid.destroy(); container.remove();
  });

  it('U-FLAT-06 나무 모드: 합성(직통 안 탐) · 결과 = 고치기 전', () => {
    const tree = [
      { id: 1, parentId: null, name: '루트' }, { id: 2, parentId: 1, name: '자식1' },
      { id: 3, parentId: 1, name: '자식2' }, { id: 4, parentId: 2, name: '손주' }, { id: 5, parentId: null, name: '둘째 루트' },
    ];
    const { grid, container } = makeGrid({ columns: [{ field: 'name', header: '이름' }], treeId: 'id', treeParentId: 'parentId' }, tree);
    grid.enableTree();
    const m = grid.getFlatRowModel() as any;
    const h0 = hits(m);
    const refs = allRefs(grid);
    grid.expandAllNodes();
    const refsExpanded = allRefs(grid);
    const items = m.getFlatArray().map(label);
    if (!RECORD) expect(hits(m) - h0).toBe(0);
    againstPre('U-FLAT-06', { refs, refsExpanded, items });
    grid.destroy(); container.remove();
  });

  it('U-FLAT-08 필터 뒤: count = 걸러진 수, 행 맞음(직통)', () => {
    expect(checkFlat08()).toBeNull();
  });

  it('U-FLAT-09 정렬 뒤: rowAt(0) = 정렬 뒤 첫 행(표시 순서)', () => {
    const data = wRows(50, 2).map((r, i) => ({ ...r, n: (i * 37) % 50 }));
    const { grid, container } = makeGrid({ columns: [...wColumns(2, 0), { field: 'n', header: 'N', type: 'number' }], sortable: true }, data);
    grid.orderBy('n', 'desc');
    const m = grid.getFlatRowModel();
    expect((m.rowAt(0) as any).n).toBe(49);
    expect(m.resolveFlatRow(0).displayIndex).toBe(0);
    const dl = (grid as any)._data as DataLayer<any>;
    for (let i = 0; i < 50; i++) expect(m.rowAt(i)).toBe(dl.getRowByIndex(i));
    grid.destroy(); container.remove();
  });

  it('U-FLAT-10 행 추가·삭제 뒤: count·행 맞음', () => {
    const { grid, container } = makeGrid({ columns: wColumns(2, 0) }, wRows(20, 2));
    const m = grid.getFlatRowModel();
    const dl = (grid as any)._data as DataLayer<any>;
    grid.insertRow({ c0: 'ADD', c1: 'x' } as any, 5);
    expect(m.count()).toBe(21);
    expect((m.rowAt(5) as any).c0).toBe('ADD');
    grid.deleteRow(0);
    expect(m.count()).toBe(20);
    expect((m.rowAt(4) as any).c0).toBe('ADD');
    for (let i = 0; i < 20; i++) expect(m.rowAt(i)).toBe(dl.getRowByIndex(i));
    expect(m.rowAt(20)).toBeNull();
    expect(m.rowAt(-1)).toBeNull();
    grid.destroy(); container.remove();
  });

  it('U-FLAT-11 수식 없으면 빠른 길: getFormulaMeta 1만 번 모두 null · resolveFlatRow 0번', () => {
    const { grid, container } = makeGrid({ columns: wColumns(5, 0) }, wRows(100, 5));
    const fc = (grid as any)._formula;
    const rs = vi.spyOn(FlatRowModel.prototype, 'resolveFlatRow');
    let nonNull = 0;
    for (let k = 0; k < 10000; k++) if (fc.getFormulaMeta(k % 100, `c${k % 5}`) !== null) nonNull++;
    expect(nonNull).toBe(0);
    expect(rs).toHaveBeenCalledTimes(0);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-12 수식 있으면: 그 칸 meta 정상, 다른 칸 null(고치기 전과 같음)', () => {
    const { grid, container } = makeGrid({ columns: wColumns(3, 0) }, wRows(10, 3));
    grid.setCellFormula(2, 'c1', '=1+2');
    const fc = (grid as any)._formula;
    const metas: any[] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 3; c++) metas.push(fc.getFormulaMeta(r, `c${c}`));
    expect(metas.filter(x => x !== null).length).toBe(1);
    expect(fc.getFormulaMeta(2, 'c1')?.src).toBeTruthy();
    againstPre('U-FLAT-12', metas);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-13 마지막 수식 지움 → 저장소 비고 빠른 길 복귀', () => {
    const { grid, container } = makeGrid({ columns: wColumns(3, 0) }, wRows(10, 3));
    grid.setCellFormula(2, 'c1', '=1+2');
    const fc = (grid as any)._formula;
    const rs = vi.spyOn(FlatRowModel.prototype, 'resolveFlatRow');
    rs.mockClear();
    fc.getFormulaMeta(0, 'c0');
    expect(rs.mock.calls.length).toBeGreaterThan(0); // 저장소가 차 있으면 지금 길(행 해석)
    grid.clearCellFormula(2, 'c1');
    expect((grid as any)._recalc.store.size()).toBe(0);
    rs.mockClear();
    for (let k = 0; k < 100; k++) expect(fc.getFormulaMeta(k % 10, 'c1')).toBeNull();
    expect(rs).toHaveBeenCalledTimes(0);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-14 splice 활성: 디테일 펼친 행 0 / 1 / 다시 0 → false / true / false (그리고 원천이 그에 따라 바뀜)', () => {
    const { grid, container } = makeGrid(DETAIL_OPTS(), DETAIL_ROWS());
    const dm = (grid as any)._detailMgr;
    const m = grid.getFlatRowModel() as any;
    const viaDirect = () => { const h = hits(m); m.resolveFlatRow(0); return hits(m) - h === 1; };
    expect(dm.isActive).toBe(false); expect(viaDirect()).toBe(true);
    grid.expandRow(3);
    expect(dm.isActive).toBe(true); expect(viaDirect()).toBe(false);
    grid.collapseRow(3);
    expect(dm.isActive).toBe(false); expect(viaDirect()).toBe(true);
    grid.destroy(); container.remove();
  });

  it('U-FLAT-15 행 id 짝 대조: 무작위 1,000개 색인의 rowIdOfFlat·flatIndexOfRowId = 고치기 전', () => {
    const data = wRows(2000, 2).map((r, i) => ({ ...r, n: (i * 7919) % 2000 }));
    const { grid, container } = makeGrid({ columns: [...wColumns(2, 0), { field: 'n', header: 'N', type: 'number' }], sortable: true }, data);
    grid.orderBy('n', 'asc');
    grid.setFilter('c0', [{ operator: 'contains', value: '3' } as any]);
    const m = grid.getFlatRowModel();
    const dl = (grid as any)._data as DataLayer<any>;
    const rnd = mulberry32(20261121);
    const n = m.count();
    const pairs: string[] = [];
    for (let k = 0; k < 1000; k++) {
      const i = Math.floor(rnd() * (n + 20)) - 10; // 범위 밖도 섞음
      const id = m.rowIdOfFlat(i);
      const row = id != null ? dl.getRowById(id) : null;
      pairs.push(`${i}|${row ? row.c0 : '∅'}|${id != null ? m.flatIndexOfRowId(id) : 'x'}`);
    }
    againstPre('U-FLAT-15', { n, pairs });
    grid.destroy(); container.remove();
  });

  it('U-FLAT-16 · NR-14 행 수 무관(단위판): 3만 / 10만 행 그리기 1회 — getData 0 · 원천 접근 수 같음', async () => {
    const res: Record<number, { getData: number; byIndex: number; idLookup: number }> = {};
    for (const rows of [30000, 100000]) {
      const s = await mkW({ rows, cols: 50, rendererEvery: 0 });
      const g = vi.spyOn(DataLayer.prototype, 'getData');
      const b = vi.spyOn(DataLayer.prototype, 'getRowByIndex');
      const d = vi.spyOn(DataLayer.prototype, 'getDataIndexByRowId');
      g.mockClear(); b.mockClear(); d.mockClear();
      s.wrap.scrollTo(32 * 10, null);
      await frames(1);
      res[rows] = { getData: g.mock.calls.length, byIndex: b.mock.calls.length, idLookup: d.mock.calls.length };
      g.mockRestore(); b.mockRestore(); d.mockRestore();
      disposeW(s);
    }
    expect(res[30000]!.getData).toBe(0);
    expect(res[100000]!.getData).toBe(0);
    expect(res[100000]).toEqual(res[30000]);
  }, 180000);

  // 걸음 C1 때 「C7 전 임시」(앞 행 = 고치기 전 + 뒤 여유 행 ≤ 59)로 풀어 두었던 것을 C7(그리는 범위 하나로) 뒤 다시 조였다:
  // 해석(refs)은 모든 단계에서, 그려진 행은 moveRow 를 뺀 모든 단계에서 고치기 전과 완전히 같음.
  // moveRow 단계만 예외(잼, 2026-11-21): 고치기 전에는 reorderRow 가 통째 길(visRange, 화면 아래 여유 포함 55행)로 그렸고,
  // C7 이 그 길의 범위를 세로 창(30행)으로 모아 **줄었다**(R7-CALL A/reorderRow 59→30 과 같은 까닭). 그 단계는
  // 「고치기 전 행의 앞쪽과 글자 그대로 같고, 수는 고치기 전 이하」로 본다(느는 쪽은 여전히 빨강). 로그 WARN 으로 WIN 에 알림.
  it('U-FLAT-17 [C7 뒤 다시 조임] 디테일 켠 그리드 정렬·필터·addRow·removeRow·moveRow·setData 뒤 그려진 행 = 고치기 전(moveRow 만 앞쪽 같음·수 이하)', async () => {
    const seq = await detailSequence();
    expect(seq.expanded!.rows.length).toBeGreaterThan(0);
    if (RECORD) { againstPre('U-FLAT-17', seq); return; }
    const P = pre['U-FLAT-17'] as Record<string, { rows: string[]; refs: string[] }>;
    expect(P, 'U-FLAT-17 고치기 전 기록 없음').toBeDefined();
    expect(Object.keys(seq).sort()).toEqual(Object.keys(P).sort());
    for (const k of Object.keys(P)) {
      expect(seq[k]!.refs, `${k} 해석`).toEqual(P[k]!.refs);
      if (k !== 'afterMoveRow') { expect(seq[k]!.rows, `${k} 그려진 행`).toEqual(P[k]!.rows); continue; }
      const now = seq[k]!.rows, was = P[k]!.rows;
      expect(now.length, 'afterMoveRow 그려진 행 수 ≤ 고치기 전').toBeLessThanOrEqual(was.length);
      expect(now, 'afterMoveRow 앞쪽이 고치기 전과 같아야').toEqual(was.slice(0, now.length));
      expect(now.length).toBeGreaterThan(0);
    }
  }, 60000);
});

// ─── 자기시험 ───────────────────────────────────────────────────────────
describe('C0 자기시험', () => {
  it('ST-10 원천 고르기를 「splice 등록 0개면 직통」으로 망가뜨리면 U-FLAT-01·02 가 빨개진다', async () => {
    if (RECORD) return;
    const proto = FlatRowModel.prototype as any;
    const orig = proto._source;
    expect(typeof orig).toBe('function');
    // 탐침 함정 흉내: 활성 여부 대신 「등록 수」로 고른다(디테일 관리자가 splice 를 늘 등록하므로 직통을 못 탐).
    vi.spyOn(proto, '_source').mockImplementation(function (this: any) {
      return !this._backing && this._splices.length === 0 ? this._direct : this._composed;
    });
    expect(checkFlat01()).not.toBeNull();
    const n = await checkFlat02b();
    expect(n.getData === 0 && n.direct === T0['U-FLAT-02'].value.directHitsPerRender).toBe(false);
    vi.restoreAllMocks();
    expect(checkFlat01()).toBeNull();
  }, 60000);

  it('ST-22 직통 원천이 필터 전 count 를 돌려주면 U-FLAT-08 이 빨개진다', () => {
    if (RECORD) return;
    // 원천 클래스는 모듈 밖에 내보내지 않으므로, 그 그리드의 직통 원천 인스턴스를 감싸 필터 전 행 수를 돌려주게 한다.
    let wrapped = 0;
    expect(checkFlat08((m) => {
      const direct = m._direct;
      expect(typeof direct?.count).toBe('function');
      vi.spyOn(direct, 'count').mockImplementation(() => direct._dl().totalRowCount);
      wrapped++;
    })).not.toBeNull();
    expect(wrapped).toBe(1);
    vi.restoreAllMocks();
    expect(checkFlat08()).toBeNull();
  });
});
