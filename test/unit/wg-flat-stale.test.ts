/**
 * 넓은 그리드 · C0 뒤 보강 — 「먼저 읽어 둔 뒤 바꾸고 다시 읽기」(코드 검토 REVIEW_CODE_C0_S0.md C0-3·C0-4). L19(TEST).
 *
 * 까닭: wg-flat-c0 의 U-FLAT-08·09·15 는 그리드를 만든 뒤 **첫 접근이 정렬·필터 뒤**라, 원천이 첫 호출 때의
 * 배열을 붙잡아 두는 결함(검토의 MUT=stale)을 못 잡았다(U-FLAT-10 하나만 잡음). 다음 걸음 C0b 가 바로 그 캐시를
 * 넣으므로 이 파일이 C0b 의 첫 방어선이다.
 *
 * C0-3: 두 장면(디테일 옵션 켬 · 펼친 행 0 = 직통 원천 / 펼친 행 1 = 합성 원천) × 조작 열
 *       (정렬·필터·행 추가 끝/중간·행 삭제·행 옮김·setData·디테일 펼침·펼침→정렬→접힘·필터 풀기).
 *       조작 전에 count·rowAt·rowIdOfFlat·resolveFlatRow·flatIndexOfRowId 를 한 바퀴 읽어 「붙잡을」 기회를 주고,
 *       조작 뒤 같은 것을 대조군과 맞댄다. 대조군 = 직통이면 DataLayer.getData()(지금 표시 순서 새 배열),
 *       합성이면 FlatRowModel 의 합성 함수를 그 자리에서 새로 부른 결과(원천 객체를 거치지 않음).
 *       자기시험 ST-40: 원천 인스턴스를 「첫 호출 배열을 붙잡는 판」으로 감싸면 빨개진다.
 * C0-4: 수식 빈 저장소 빠른 길이 풀리는 순간 — 수식 넣기 **전에** 한 번 묻고, 넣은 뒤 다시 묻기.
 *       불변식: 모든 칸에서 (getFormulaMeta !== null) === hasCellFormula. 순간: setCellFormula · 편집기에 '=…' 입력 ·
 *       setData(수식 글자 든 자료) · 범위 붙여넣기(Ctrl+V) · undo(). 자기시험 ST-41: 빈 판정을 첫 호출에 굳힌 판.
 *
 * 내부 접근(진단): grid.getFlatRowModel()(공개) 의 `_direct`·`_composed`·`_compose`, grid._formula, grid._recalc.store.
 * C0b 에서 이 이름이 바뀌면 자기시험이 「못 찾음」으로 빨개진다 — 그때 이 파일의 접근만 새 이름으로 옮긴다.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installResizeObserverStub, makeContainer } from './widegrid-helpers.js';
import { injectBodyWrap, frames } from './wg-helpers/counters.js';

beforeAll(() => installResizeObserverStub());
afterEach(() => { vi.restoreAllMocks(); });
vi.setConfig({ testTimeout: 30_000 });

const ID = '_ogRowId';
const rows = (n: number, tag = 'r') => Array.from({ length: n }, (_, i) => ({ c0: `${tag}${i}`, n: (i * 7) % n, t: i % 3 }));
const COLS = [{ field: 'c0', header: 'C0' }, { field: 'n', header: 'N', type: 'number' }, { field: 't', header: 'T' }];

function mk(expanded: boolean): OpenGrid<any> {
  const container = makeContainer(1200, 640);
  const grid = new OpenGrid<any>(container, { columns: COLS, sortable: true, masterDetail: { enabled: true, height: 64 } } as any);
  grid.setData(rows(40));
  if (expanded) grid.expandRow(3);
  return grid;
}
function dispose(grid: OpenGrid<any>): void {
  const c = (grid as any)._container as HTMLElement | undefined;
  try { grid.destroy(); } catch { /* 이미 정리 */ }
  c?.remove();
}

/** 모든 공개 읽기 길을 한 바퀴 — 원천이 무엇이든 붙잡을 기회를 준다. */
function readAll(grid: OpenGrid<any>): void {
  const m = grid.getFlatRowModel() as any;
  const n = m.count();
  for (let i = 0; i < n; i++) { m.rowAt(i); m.rowIdOfFlat(i); m.resolveFlatRow(i); }
  m.getFlatArray();
  const id = m.rowIdOfFlat(0);
  if (id) m.flatIndexOfRowId(id);
}

/** 대조군: 원천 객체를 거치지 않고 지금 상태에서 새로 만든 flat 항목 배열. */
function freshItems(grid: OpenGrid<any>): any[] {
  const m = grid.getFlatRowModel() as any;
  const dm = (grid as any)._detailMgr;
  const composed = !!m._backing || (Array.isArray(m._splices) && m._splices.some((s: any) => s.isActive()));
  void dm;
  return composed ? m._compose() : (grid as any)._data.getData();
}
/** 행 비교 열쇠 — 데이터 행은 객체 그 자체(같은 객체여야), 디테일 의사행은 합성마다 새 객체라 뜻(종류·행 id·폭)으로. */
const objIds = new WeakMap<object, number>(); let objSeq = 0;
function key(it: any): string {
  if (it == null) return '∅';
  if (it._isDetailHead) return `H:${it._rowId}:${it._span}`;
  if (it._isDetailFiller) return `F:${it._rowId}`;
  if (!objIds.has(it)) objIds.set(it, ++objSeq);
  return `D:${objIds.get(it)}`;
}
const isPseudo = (it: any) => it == null || it._isDetailFiller === true || it._isDetailHead === true || it._isGroup === true;

/** 다시 읽은 값이 대조군과 같은지. 같으면 null, 다르면 첫 차이를 글로. */
function checkFresh(grid: OpenGrid<any>): string | null {
  const m = grid.getFlatRowModel() as any;
  const items = freshItems(grid);
  if (m.count() !== items.length) return `count ${m.count()} ≠ ${items.length}`;
  const arr = m.getFlatArray();
  if (arr.length !== items.length) return `getFlatArray 길이 ${arr.length} ≠ ${items.length}`;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const wantRow = isPseudo(it) ? null : it;
    if (m.rowAt(i) !== wantRow) return `rowAt(${i})`;
    const wantId = isPseudo(it) ? null : (it[ID] ?? null);
    if (m.rowIdOfFlat(i) !== wantId) return `rowIdOfFlat(${i})`;
    const k = m.resolveFlatRow(i).kind;
    const wantKind = it?._isDetailFiller ? 'detailFiller' : it?._isDetailHead ? 'detailHead' : 'data';
    if (k !== wantKind) return `resolveFlatRow(${i}).kind ${k} ≠ ${wantKind}`;
    if (key(arr[i]) !== key(it)) return `getFlatArray[${i}]`;
  }
  for (let i = 0; i < items.length; i += 7) {
    const id = isPseudo(items[i]) ? null : items[i][ID];
    if (id && m.flatIndexOfRowId(id) !== i) return `flatIndexOfRowId(${i})`;
  }
  return null;
}

type Op = { name: string; run: (g: OpenGrid<any>) => void; pre?: (g: OpenGrid<any>) => void };
const OPS: Op[] = [
  { name: '정렬 orderBy(n desc)', run: g => g.orderBy('n', 'desc') },
  { name: '필터 setFilter(t = 1)', run: g => g.setFilter('t', [{ operator: '=', value: 1 } as any]) },
  // insertRow(…, 'first') 는 지금 코드에 결함이 있어 뺐다(DataLayer.addRow 'first' — 새 행이 두 번 보이고 끝 행이 사라짐, 로그 WARN).
  { name: '행 추가 insertRow(last)', run: g => g.insertRow({ c0: 'NEW', n: -1, t: 0 }, 'last' as any) },
  { name: '행 추가 insertRow(5)', run: g => g.insertRow({ c0: 'NEW5', n: -5, t: 1 }, 5 as any) },
  { name: '행 삭제 deleteRow(0)', run: g => g.deleteRow(0) },
  { name: '행 옮김 reorderRow(0→10)', run: g => g.reorderRow(0, 10) },
  { name: 'setData(새 30행)', run: g => g.setData(rows(30, 's')) },
  { name: '디테일 펼침 expandRow(20)', run: g => g.expandRow(20) }, // 20 = 장면 B 의 펼친 행(3) 자리와 겹치지 않는 데이터 행
  // 접힘: 합성 상태에서 순서를 바꾼 뒤 직통으로 돌아온다(직통 원천이 펼치기 전 배열을 붙잡고 있으면 옛 순서가 나온다).
  { name: '디테일 펼침→정렬→접힘 collapseAllDetails()', run: g => { g.expandRow(5); readAll(g); g.orderBy('n', 'desc'); (g as any).collapseAllDetails(); } },
  // 필터 풀기: 필터가 걸린 상태에서 먼저 읽어 두고(pre) 푼다 — 붙잡은 배열이면 걸린 때의 행만 남는다.
  { name: '필터 걸린 채 읽고 풀기 resetFilter()', pre: g => g.setFilter('t', [{ operator: '=', value: 2 } as any]), run: g => g.resetFilter() },
];
const SCENES = [{ name: '펼친 행 0(직통)', expanded: false }, { name: '펼친 행 1(합성)', expanded: true }];

/** 한 장면·한 조작: 먼저 읽기 → 조작 → 다시 읽어 대조. */
function runCase(expanded: boolean, op: Op, mutate?: (g: OpenGrid<any>) => void): string | null {
  const g = mk(expanded);
  try {
    op.pre?.(g);
    if (mutate) mutate(g);
    readAll(g);
    op.run(g);
    return checkFresh(g);
  } finally { dispose(g); }
}

/** 돌연변이(검토 MUT=stale): 원천 인스턴스가 첫 호출의 배열을 붙잡아 계속 그것으로 답한다. */
function holdFirstArray(g: OpenGrid<any>): void {
  const m = g.getFlatRowModel() as any;
  const d = m._direct, c = m._composed;
  if (!d || !c) throw new Error('원천 인스턴스(_direct/_composed)를 못 찾음 — C0b 에서 이름이 바뀌었으면 이 자기시험의 접근을 옮길 것');
  const dl = (g as any)._data;
  let hd: any[] | null = null, hc: any[] | null = null;
  const D = () => (hd ??= dl.getData());
  const C = () => (hc ??= m._compose());
  vi.spyOn(d, 'count').mockImplementation(() => D().length);
  vi.spyOn(d, 'itemAt').mockImplementation((i: any) => D()[i]);
  vi.spyOn(d, 'array').mockImplementation(() => D());
  vi.spyOn(c, 'count').mockImplementation(() => C().length);
  vi.spyOn(c, 'itemAt').mockImplementation((i: any) => C()[i]);
  vi.spyOn(c, 'array').mockImplementation(() => C());
}

describe('C0-3 먼저 읽어 둔 뒤 바꾸고 다시 읽기 — 낡은 값이 없다', () => {
  for (const sc of SCENES) for (const op of OPS) {
    it(`STALE ${sc.name} · ${op.name}: 다시 읽은 값 == 새로 만든 대조군`, () => {
      expect(runCase(sc.expanded, op)).toBeNull();
    });
  }
});

describe('ST-40 자기시험 — 원천이 첫 배열을 붙잡는 판이면 위 시험이 빨개진다', () => {
  it('ST-40 붙잡는 판: 두 장면 × 열 조작 가운데 대조군과 달라지는 경우를 센다(모든 조작이 적어도 한 장면에서 빨개져야)', () => {
    const red: Record<string, string[]> = {};
    for (const op of OPS) for (const sc of SCENES) {
      const r = runCase(sc.expanded, op, holdFirstArray);
      if (r) (red[op.name] ??= []).push(`${sc.name}: ${r}`);
    }
    const missed = OPS.map(o => o.name).filter(n => !red[n]);
    expect(missed, `붙잡는 판을 못 잡은 조작: ${missed.join(', ')}`).toEqual([]);
    // 되돌린 뒤 다시 초록
    vi.restoreAllMocks();
    for (const op of OPS) for (const sc of SCENES) expect(runCase(sc.expanded, op)).toBeNull();
  });
});

// ─── C0-4 수식 빈 저장소 빠른 길이 풀리는 순간 ────────────────────────────────────
const FCOLS = [{ field: 'c0', header: 'A', editable: true }, { field: 'c1', header: 'B', editable: true }, { field: 'c2', header: 'C', editable: true }];
const frows = () => Array.from({ length: 10 }, (_, i) => ({ c0: i, c1: i * 10, c2: `x${i}` }));

async function fgrid(extra: Record<string, any> = {}, data = frows()): Promise<OpenGrid<any>> {
  const container = makeContainer(1200, 640);
  const grid = new OpenGrid<any>(container, { columns: FCOLS, editable: true, clipboard: true, ...extra } as any);
  injectBodyWrap(container, 1200, 640);
  grid.setData(data);
  await frames(2);
  return grid;
}
const meta = (g: OpenGrid<any>, r: number, f: string) => (g as any)._formula.getFormulaMeta(r, f);
/** 모든 칸에서 (meta !== null) === hasCellFormula. 어긋난 칸 목록. */
function metaMismatch(g: OpenGrid<any>): string[] {
  const bad: string[] = [];
  const n = (g as any)._data.rowCount;
  for (let r = 0; r < n; r++) for (const f of ['c0', 'c1', 'c2']) {
    if ((meta(g, r, f) !== null) !== g.hasCellFormula(r, f)) bad.push(`${r}:${f}`);
  }
  return bad;
}
function formulaCount(g: OpenGrid<any>): number {
  const n = (g as any)._data.rowCount; let k = 0;
  for (let r = 0; r < n; r++) for (const f of ['c0', 'c1', 'c2']) if (g.hasCellFormula(r, f)) k++;
  return k;
}
/** 빈 판정을 첫 호출에 굳힌 판(검토 MUT=fmlsticky). */
function freezeEmpty(g: OpenGrid<any>): void {
  const store = (g as any)._recalc?.store;
  if (!store || typeof store.size !== 'function') throw new Error('수식 저장소(_recalc.store.size)를 못 찾음');
  const orig = store.size.bind(store);
  let first: number | null = null;
  vi.spyOn(store, 'size').mockImplementation(() => (first ??= orig()));
}

type Moment = { name: string; run: (g: OpenGrid<any>) => Promise<void>; expectFormula: boolean | null };
const MOMENTS: Moment[] = [
  { name: 'setCellFormula', expectFormula: true, run: async g => { g.setCellFormula(2, 'c1', '=1+2'); } },
  {
    name: '편집기에 =A1*2 입력 후 Enter', expectFormula: true, run: async g => {
      (g as any)._doRender(...(g as any)._visRange());
      const cell = (g as any)._container.querySelector('[role="row"][aria-rowindex="3"] [role="gridcell"][aria-colindex="2"]') as HTMLElement;
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      const input = (g as any)._container.querySelector('.og-editing input, .og-editing textarea') as HTMLInputElement;
      if (!input) throw new Error('편집기가 안 열림');
      input.value = '=A1*2';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await frames(1);
    },
  },
  { name: 'setData(수식 글자 든 자료)', expectFormula: null, run: async g => { g.setData(frows().map((r, i) => (i === 2 ? { ...r, c1: '=1+2' } : r))); await frames(1); } },
  {
    name: '범위 붙여넣기 Ctrl+V(=1+2)', expectFormula: null, run: async g => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.resolve('=1+2'), writeText: () => Promise.resolve() } });
      g.setRangeSelection({ startRow: 2, endRow: 2, startCol: 1, endCol: 1 } as any);
      const target = (g as any)._container.querySelector('.og-body-wrapper') ?? (g as any)._container;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
      await frames(2);
    },
  },
  { name: 'setCellFormula 뒤 undo()', expectFormula: true, run: async g => { g.setCellFormula(2, 'c1', '=1+2'); (g as any).undo(); } },
];

const FACTS: Record<string, any> = {};
describe('C0-4 빈 저장소 빠른 길 — 수식 넣기 전에 한 번 묻고, 넣은 뒤 다시 묻기', () => {
  for (const mo of MOMENTS) {
    it(`FML ${mo.name}: 먼저 물은 칸(null) → 순간 뒤 모든 칸 (meta≠null) == hasCellFormula`, async () => {
      const g = await fgrid({ selection: 'cells' });
      expect(meta(g, 2, 'c1')).toBeNull();   // 먼저 묻기 — 빈 저장소 빠른 길이 한 번 돎
      await mo.run(g);
      const bad = metaMismatch(g);
      FACTS[mo.name] = { formulas: formulaCount(g), meta21: meta(g, 2, 'c1'), cell21: (g as any)._data.getRowByIndex(2)?.c1 };
      expect(bad).toEqual([]);
      if (mo.expectFormula === true) expect(meta(g, 2, 'c1')?.src).toBeTruthy();
      dispose(g);
    });
  }
  it('FML 사실 기록 — 순간마다 수식 칸 수(setData·붙여넣기는 지금 코드가 수식으로 받는지 그대로 적음)', () => {
    // 이 시험은 앞 시험들이 남긴 사실을 읽기만 한다(단언은 앞 시험이 함). 콘솔에 남겨 증거 출력에 실린다.
    console.log('[C0-4 FACTS]', JSON.stringify(FACTS, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)));
    expect(Object.keys(FACTS).length).toBe(MOMENTS.length);
  });
});

describe('ST-41 자기시험 — 빈 판정을 첫 호출에 굳힌 판이면 위 시험이 빨개진다', () => {
  it('ST-41 setCellFormula · 편집기 입력 두 순간이 굳힌 판에서 어긋남을 낸다', async () => {
    for (const mo of MOMENTS.filter(m => m.expectFormula === true && !m.name.includes('undo'))) {
      const g = await fgrid({ selection: 'cells' });
      freezeEmpty(g);
      expect(meta(g, 2, 'c1')).toBeNull();
      await mo.run(g);
      expect(metaMismatch(g).length, mo.name).toBeGreaterThan(0);
      vi.restoreAllMocks();
      expect(metaMismatch(g), `${mo.name} 되돌린 뒤`).toEqual([]);
      dispose(g);
    }
  });
});
