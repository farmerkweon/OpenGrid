// @vitest-environment node
/**
 * 넓은 그리드 새 그물 — RenderPlanner · RenderPlan 단위 시험.
 * 테스트 설계서 §2-8 U-PLN-01~36(12·15 삭제) + §2-40 U-PLN-37~40 + §14 U-PLN-41 + §17-3 U-PLN-42 + §17-11 U-PLN-43~51.
 * 기대의 정본 = 설계서 §14-2 「계획 규칙 표」(줄 번호를 각 시험 이름 끝에 적음). 두 축 표기(rows × cols).
 *
 * 준비: D0 = 그려 둔 상태 {rows [100,140), 창 [11,32]/50, pinned 없음, focus 없음, diffBlocked false, coverWidths 전부 ∞}.
 *       N0 = 다음 상태 {rows [100,140), 같은 창, 폭 50×180, 기하 판 5(반영한 판 4 — 반영할 기하가 있음)}.
 * 규칙 묶음: 기본 시험은 일곱 묶음을 모두 켠 「최종 표」(ALL_ON). 생성자 기본값은 전부 끔(= 모든 요청 → 통째, R7 의 출발점).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RenderPlanner } from '../../../../src/core/domain/render/RenderPlanner.js';
import { RenderRequest } from '../../../../src/core/domain/render/RenderRequest.js';
import { ColumnWindow } from '../../../../src/core/coordinate/ColumnWindow.js';
import {
  Change, type DrawnState, type NextState, type IRenderPlan, type PlannerFeatures, type RequestDetail, type CellPos,
} from '../../../../src/core/domain/render/ports.js';
import type { RowSpan, WindowSegment } from '../../../../src/core/coordinate/geometryPorts.js';
import type { LeafColIndex, ViewIndex } from '../../../../src/core/coordinate/types.js';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_ON: PlannerFeatures = {
  sortIndicatorOnly: true, footerGating: true, scrollSkip: true, geometryOnly: true,
  columnWindow: true, rowDiff: true, smallUpdates: true,
};
const ALL_OFF: PlannerFeatures = {
  sortIndicatorOnly: false, footerGating: false, scrollSkip: false, geometryOnly: false,
  columnWindow: false, rowDiff: false, smallUpdates: false,
};
const off = (k: keyof PlannerFeatures): PlannerFeatures => ({ ...ALL_ON, [k]: false });

const rs = (s: number, e: number): RowSpan => ({ start: s as ViewIndex, end: e as ViewIndex });
const win = (from: number, to: number, n = 50) =>
  ColumnWindow.of([{ from: from as LeafColIndex, to: to as LeafColIndex } as WindowSegment], n);
const pos = (ri: number, ci: number): CellPos => ({ ri, ci });
const req = (mask: number, d?: Partial<RequestDetail>) => RenderRequest.of(mask, d);

const W0 = win(11, 32);
const D0: DrawnState = {
  rows: rs(100, 140),
  columns: W0,
  pinned: { editRow: null, editCol: null, focusRow: null },
  focus: null,
  diffBlocked: false,
  coverWidths: new Array<number>(50).fill(Infinity),
};
const N0: NextState = {
  rows: rs(100, 140),
  columns: W0,
  columnWidths: new Array<number>(50).fill(180),
  geometryVersion: 5,
  appliedGeometryVersion: 4,
};
const drawn = (o: Partial<DrawnState> = {}): DrawnState => ({ ...D0, ...o });
const next = (o: Partial<NextState> = {}): NextState => ({ ...N0, ...o });

const P = new RenderPlanner({ features: ALL_ON });

/** 판정용 모양(계획의 일 칸만). */
const shape = (p: IRenderPlan) => ({
  rows: p.rows, cols: p.cols, header: p.header, footer: p.footer, geometry: p.geometry, overlay: p.overlay,
  refillColumns: [...p.refillColumns], rowStateRows: [...p.rowStateRows], focus: p.focus, cells: [...p.cells], empty: p.empty,
});
const EMPTY = {
  rows: 'none', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: false,
  refillColumns: [], rowStateRows: [], focus: null, cells: [], empty: true,
};
const plan = (r: RenderRequest, d: DrawnState = D0, n: NextState = N0, p = P) => shape(p.plan(r, d, n));
const range = (s: number, e: number) => Array.from({ length: e - s }, (_, i) => s + i);

describe('RenderPlanner — 표 줄별 (U-PLN-01~41)', () => {
  it('U-PLN-01 NONE → 빈 계획 (§14-2 줄 1)', () => {
    expect(plan(RenderRequest.NONE)).toEqual(EMPTY);
  });

  it('U-PLN-02 All, 첫 그림 (줄 2)', () => {
    expect(plan(req(Change.All), drawn({ rows: null, columns: null }))).toMatchObject({
      rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'values', geometry: true, overlay: true, empty: false,
    });
  });

  it('U-PLN-03 All, D0·N0 (줄 2)', () => {
    expect(plan(req(Change.All))).toMatchObject({
      rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'values', geometry: true, overlay: true,
    });
  });

  it('U-PLN-04 RowsScrolled 같은 범위 → 빈 계획 (줄 10)', () => {
    expect(plan(req(Change.RowsScrolled))).toEqual(EMPTY);
  });

  it('U-PLN-05 RowsScrolled [103,143) — C11 뒤 diff / C11 전 rebuild (줄 11)', () => {
    const n = next({ rows: rs(103, 143) });
    expect(plan(req(Change.RowsScrolled), D0, n)).toMatchObject({
      rows: 'diff', cols: 'none', header: 'none', footer: 'none', geometry: false,
    });
    expect(plan(req(Change.RowsScrolled), D0, n, new RenderPlanner({ features: off('rowDiff') }))).toMatchObject({
      rows: 'rebuild', cols: 'none', header: 'none', footer: 'none',
    });
  });

  it('U-PLN-06 바뀐 행 19/40 = 47.5% → diff (줄 11)', () => {
    expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(119, 159) }))).toMatchObject({ rows: 'diff', cols: 'none' });
  });

  it('U-PLN-07 바뀐 행 20/40 = 50% → rebuild (줄 11, 절반 이상)', () => {
    expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(120, 160) }))).toMatchObject({ rows: 'rebuild', cols: 'none' });
  });

  it('U-PLN-08 안 겹치는 점프 → rebuild (줄 11)', () => {
    expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(5000, 5040) }))).toMatchObject({ rows: 'rebuild', cols: 'none' });
    // 문턱이 1 을 넘어도(생성자는 0 보다 큰 값을 받음) 안 겹치는 점프는 차분하지 않음(검토 §5-2 등가 돌연변이 정리)
    const loose = new RenderPlanner({ features: ALL_ON, diffMaxRatio: 2 });
    expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(5000, 5040) }), loose)).toMatchObject({ rows: 'rebuild' });
    expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(130, 170) }), loose)).toMatchObject({ rows: 'diff' });
  });

  it('U-PLN-09 diffBlocked → rebuild (줄 11)', () => {
    expect(plan(req(Change.RowsScrolled), drawn({ diffBlocked: true }), next({ rows: rs(103, 143) })))
      .toMatchObject({ rows: 'rebuild', cols: 'none' });
  });

  it('U-PLN-10 ColsScrolled, 창 같음 → 빈 계획 (줄 12)', () => {
    expect(plan(req(Change.ColsScrolled), D0, next({ columns: win(11, 32) }))).toEqual(EMPTY);
  });

  it('U-PLN-11 ColsScrolled, 창 옮김 → cols shift (줄 13)', () => {
    expect(plan(req(Change.ColsScrolled), D0, next({ columns: win(14, 35) }))).toMatchObject({
      rows: 'none', cols: 'shift', header: 'none', footer: 'none', geometry: false, overlay: true, empty: false,
    });
  });

  // 경우변경(검토 W-4, 총괄 채택): 줄 14 에 overlay 를 더함 — 끄는 동안 범위 테두리가 폭을 따라와야 한다.
  it('U-PLN-13 ColWidth, 창 그대로 → 기하 + 덧그림 (줄 14)', () => {
    expect(plan(req(Change.ColWidth, { widthChangedFrom: 12 }))).toEqual({
      ...EMPTY, geometry: true, overlay: true, empty: false,
    });
  });

  it('U-PLN-14 ColWidth, 좁혀서 창 바뀜 → 기하 + shift (줄 14)', () => {
    expect(plan(req(Change.ColWidth, { widthChangedFrom: 12 }), D0, next({ columns: win(11, 34) }))).toMatchObject({
      geometry: true, rows: 'none', cols: 'shift', header: 'none', footer: 'none',
    });
  });

  it('U-PLN-16 RowOrder (줄 8)', () => {
    expect(plan(req(Change.RowOrder))).toMatchObject({
      rows: 'rebuild', cols: 'none', header: 'sortIndicator', footer: 'none', overlay: true,
    });
  });

  it('U-PLN-17 SortIndicator 단독 (줄 9)', () => {
    expect(plan(req(Change.SortIndicator))).toEqual({ ...EMPTY, header: 'sortIndicator', empty: false });
  });

  it('U-PLN-18 RowSet (줄 7)', () => {
    expect(plan(req(Change.RowSet))).toMatchObject({ rows: 'rebuild', cols: 'none', footer: 'values', header: 'none' });
  });

  it('U-PLN-19 RowState → 그려 둔 행 전부 (줄 16, Q-21)', () => {
    expect(plan(req(Change.RowState))).toEqual({ ...EMPTY, rowStateRows: range(100, 140), empty: false });
  });

  it('U-PLN-20 Focus — from 은 drawn.focus, to 는 req.focusTo (줄 17, Q-15)', () => {
    const p = plan(req(Change.Focus, { focusTo: pos(102, 12) }), drawn({ focus: pos(101, 12) }));
    expect(p).toEqual({ ...EMPTY, focus: { from: pos(101, 12), to: pos(102, 12) }, empty: false });
  });

  it('U-PLN-21 CellValue 한 칸 (줄 15)', () => {
    const cells = [{ ri: 101, field: 'c12' }];
    expect(plan(req(Change.CellValue, { cells }))).toEqual({ ...EMPTY, cells, footer: 'values', empty: false });
  });

  it('U-PLN-22 CellValue 안 그려진 행 → cells 그대로(BodyView 가 무시) (줄 15)', () => {
    const cells = [{ ri: 9000, field: 'c12' }];
    expect(plan(req(Change.CellValue, { cells }))).toMatchObject({ cells, footer: 'values', rows: 'none', cols: 'none' });
  });

  it('U-PLN-23 Range → overlay (줄 18, Q-23)', () => {
    expect(plan(req(Change.Range))).toEqual({ ...EMPTY, overlay: true, empty: false });
  });

  it('U-PLN-24 Columns (줄 5)', () => {
    expect(plan(req(Change.Columns))).toMatchObject({
      rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'rebuild', geometry: true, overlay: true,
    });
  });

  it('U-PLN-25 Viewport, 창 바뀜·행 같음 → 기하 + shift (줄 6)', () => {
    expect(plan(req(Change.Viewport), D0, next({ columns: win(11, 40) }))).toMatchObject({
      geometry: true, rows: 'none', cols: 'shift', header: 'none', footer: 'none',
    });
  });

  it('U-PLN-26 Appearance (줄 5)', () => {
    expect(plan(req(Change.Appearance))).toMatchObject({
      rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'rebuild', geometry: true,
    });
  });

  it('U-PLN-27 RowOrder|RowSet → 푸터 values (줄 7·8, 줄 19 rebuild>values>none)', () => {
    expect(plan(req(Change.RowOrder | Change.RowSet))).toMatchObject({ footer: 'values', rows: 'rebuild', cols: 'none' });
  });

  it('U-PLN-28 RowOrder|SortIndicator → 머리글 sortIndicator (줄 8·9)', () => {
    expect(plan(req(Change.RowOrder | Change.SortIndicator))).toMatchObject({ header: 'sortIndicator' });
  });

  it('U-PLN-29 Columns|SortIndicator → 머리글 rebuild 하나 (줄 19)', () => {
    expect(plan(req(Change.Columns | Change.SortIndicator))).toMatchObject({ header: 'rebuild' });
  });

  it('U-PLN-30 RowSet|Focus|RowState|CellValue → 통째가 작은 일을 덮음 (줄 19)', () => {
    const r = req(Change.RowSet | Change.Focus | Change.RowState | Change.CellValue, {
      focusTo: pos(1, 1), cells: [{ ri: 101, field: 'c1' }],
    });
    expect(plan(r, drawn({ focus: pos(1, 0) }))).toMatchObject({
      rows: 'rebuild', cols: 'none', focus: null, rowStateRows: [], cells: [], refillColumns: [],
    });
  });

  it('U-PLN-31 첫 그림 전 RowsScrolled → rebuild', () => {
    expect(plan(req(Change.RowsScrolled), drawn({ rows: null }))).toMatchObject({ rows: 'rebuild', cols: 'none' });
  });

  it('U-PLN-32 행 0개 RowSet → rebuild · 푸터 values', () => {
    expect(plan(req(Change.RowSet), drawn({ rows: rs(0, 0) }), next({ rows: rs(0, 0) }))).toMatchObject({
      rows: 'rebuild', cols: 'none', footer: 'values',
    });
  });

  it('U-PLN-33 같은 입력 두 번·얼린 입력 → 같은 계획, 던지지 않음', () => {
    const d = Object.freeze(drawn({ focus: Object.freeze(pos(1, 1)) }));
    const n = Object.freeze(next({ rows: rs(103, 143), columns: win(14, 35) }));
    const r = req(Change.RowsScrolled | Change.ColsScrolled | Change.Focus, { focusTo: pos(2, 2) });
    const a = P.plan(r, d, n);
    const b = P.plan(r, d, n);
    expect(shape(a)).toEqual(shape(b));
    expect(a.next).toBe(b.next);
  });

  it('U-PLN-34 결과는 얼린 값 · plan.next 는 받은 next', () => {
    const n = next({ columns: win(10, 33) });
    const p = P.plan(req(Change.ColWidth | Change.RowState | Change.CellValue, { cells: [{ ri: 101, field: 'x' }] }),
      drawn({ coverWidths: new Array<number>(50).fill(100) }), n);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.refillColumns)).toBe(true);
    expect(Object.isFrozen(p.rowStateRows)).toBe(true);
    expect(Object.isFrozen(p.cells)).toBe(true);
    expect(p.next).toBe(n);
    expect(Object.isFrozen(n)).toBe(false); // 입력을 얼리지 않는다(남의 값을 고치지 않음)
    const f = P.plan(req(Change.Focus, { focusTo: pos(3, 3) }), D0, N0);
    expect(Object.isFrozen(f.focus)).toBe(true);
  });

  it('U-PLN-37 대각선 — rows diff + cols shift (줄 11+13, 검토 K2)', () => {
    expect(plan(req(Change.RowsScrolled | Change.ColsScrolled), D0, next({ rows: rs(103, 143), columns: win(14, 35) })))
      .toMatchObject({ rows: 'diff', cols: 'shift', header: 'none', footer: 'none' });
  });

  it('U-PLN-38 명시 범위 요청 (줄 3·4, 검토 K1)', () => {
    const all = rs(0, 5000);
    const p = P.plan(req(Change.All, { rows: all }), D0, next({ rows: all }));
    expect(p.rows).toBe('rebuild');
    expect(p.next.rows).toEqual(all);
    const c = P.plan(req(Change.All, { rows: 'clear' }), D0, next({ rows: 'clear' }));
    expect(c.rows).toBe('clear');
    expect(c.cols).toBe('none');
    expect(c.next.rows).toBe('clear');
  });

  it('U-PLN-39 끄는 중 다시 채우기는 계획이 정함 (줄 14, 검토 K3)', () => {
    const cover = new Array<number>(50).fill(Infinity);
    cover[12] = 1916.6;
    const widths = new Array<number>(50).fill(180);
    widths[12] = 1920;
    const n = next({ columns: win(10, 33), columnWidths: widths });
    expect(plan(req(Change.ColWidth, { widthChangedFrom: 12 }), drawn({ coverWidths: cover }), n)).toMatchObject({
      geometry: true, cols: 'shift', rows: 'none', refillColumns: [12],
    });
    const widths2 = [...widths];
    widths2[12] = 1916;
    expect(plan(req(Change.ColWidth, { widthChangedFrom: 12 }), drawn({ coverWidths: cover }), next({ columns: win(10, 33), columnWidths: widths2 })))
      .toMatchObject({ refillColumns: [] });
    // 창 밖 컬럼은 다시 채우지 않음
    const cover2 = new Array<number>(50).fill(Infinity);
    cover2[45] = 100;
    expect(plan(req(Change.ColWidth, { widthChangedFrom: 45 }), drawn({ coverWidths: cover2 }), next({ columnWidths: widths })))
      .toMatchObject({ refillColumns: [] });
  });

  it('U-PLN-40 푸터는 부르는 때만 (모든 비트 하나씩, 검토 K4)', () => {
    const bits = Object.entries(Change).filter(([k]) => k !== 'All');
    for (const [name, bit] of bits) {
      const d: Partial<RequestDetail> = bit === Change.CellValue ? { cells: [{ ri: 101, field: 'a' }] }
        : bit === Change.Focus ? { focusTo: pos(101, 1) } : {};
      const f = P.plan(req(bit, d), D0, next({ rows: rs(103, 143), columns: win(14, 35) })).footer;
      const want = name === 'RowSet' || name === 'CellValue' ? 'values' : name === 'Columns' || name === 'Appearance' ? 'rebuild' : 'none';
      expect([name, f]).toEqual([name, want]);
    }
    expect(P.plan(req(Change.All), D0, N0).footer).toBe('values');
  });

  it('U-PLN-41 기하 판이 반영한 판과 같으면 geometry false', () => {
    const same = next({ geometryVersion: 4, appliedGeometryVersion: 4 });
    expect(P.plan(req(Change.ColWidth, { widthChangedFrom: 3 }), D0, same).geometry).toBe(false);
    expect(P.plan(req(Change.Viewport), D0, same).geometry).toBe(false);
    expect(P.plan(req(Change.All), D0, same).geometry).toBe(false);
    // 줄 14 에 overlay 가 더해져(검토 W-4) 빈 계획이 아니라 덧그림만 남는다
    expect(shape(P.plan(req(Change.ColWidth, { widthChangedFrom: 3 }), D0, same))).toEqual({ ...EMPTY, overlay: true, empty: false });
    expect(P.plan(req(Change.Viewport), D0, same).empty).toBe(false); // Viewport 줄도 overlay
    expect(P.plan(req(Change.ColWidth, { widthChangedFrom: 3 }), D0, N0).geometry).toBe(true);
  });

  it('검토 W-4 ColWidth 는 덧그림을 다시(범위 테두리 left·width 가 폭을 따라옴)', () => {
    expect(P.plan(req(Change.ColWidth, { widthChangedFrom: 3 }), D0, N0).overlay).toBe(true);
    expect(P.plan(req(Change.ColWidth), D0, next({ columns: win(11, 34) })).overlay).toBe(true);
  });

  it('검토 T-3 다시 채우기 경계 — 폭 == 덮는 폭이면 다시 채우지 않음(넘을 때만)', () => {
    const cover = new Array<number>(50).fill(Infinity);
    cover[12] = 300;
    const widths = new Array<number>(50).fill(180);
    widths[12] = 300;
    expect(plan(req(Change.ColWidth), drawn({ coverWidths: cover }), next({ columnWidths: widths }))).toMatchObject({ refillColumns: [] });
    widths[12] = 300.5;
    expect(plan(req(Change.ColWidth), drawn({ coverWidths: cover }), next({ columnWidths: [...widths] }))).toMatchObject({ refillColumns: [12] });
  });

  it('검토 W-10 포커스 지우기(새 칸 없음, 그려 둔 칸 있음) → 작은 갱신 { from, to: null }', () => {
    const p = plan(req(Change.Focus, { focusTo: null }), drawn({ focus: pos(101, 12) }));
    expect(p).toEqual({ ...EMPTY, focus: { from: pos(101, 12), to: null }, empty: false });
    // 그려 둔 칸도 새 칸도 없으면 일 없음
    expect(plan(req(Change.Focus, { focusTo: null }))).toEqual(EMPTY);
    // smallUpdates 를 끄면 통째
    expect(plan(req(Change.Focus, { focusTo: null }), drawn({ focus: pos(101, 12) }), N0, new RenderPlanner({ features: off('smallUpdates') })).rows).toBe('rebuild');
  });
});

describe('RenderPlanner — 규칙 묶음 (U-PLN-42~51)', () => {
  it('U-PLN-42 rowDiff:false → 05·06 입력이 rebuild', () => {
    const p = new RenderPlanner({ features: { rowDiff: false } });
    const p2 = new RenderPlanner({ features: off('rowDiff') });
    for (const pl of [p, p2]) {
      expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(103, 143) }), pl)).toMatchObject({ rows: 'rebuild', cols: 'none' });
      expect(plan(req(Change.RowsScrolled), D0, next({ rows: rs(119, 159) }), pl)).toMatchObject({ rows: 'rebuild', cols: 'none' });
    }
  });

  // 묶음마다 대표 요청(설계 §17-11) — [요청, drawn, next]
  const REP: Record<keyof PlannerFeatures, [RenderRequest, DrawnState, NextState]> = {
    sortIndicatorOnly: [req(Change.RowOrder), D0, N0],
    footerGating: [req(Change.RowSet), D0, N0],
    scrollSkip: [req(Change.RowsScrolled), D0, N0],
    geometryOnly: [req(Change.ColWidth, { widthChangedFrom: 12 }), D0, N0],
    columnWindow: [req(Change.ColsScrolled), D0, next({ columns: win(14, 35) })],
    rowDiff: [req(Change.RowsScrolled), D0, next({ rows: rs(103, 143) })],
    smallUpdates: [req(Change.Focus, { focusTo: pos(102, 12) }), drawn({ focus: pos(101, 12) }), N0],
  };
  const NUM: Record<keyof PlannerFeatures, string> = {
    sortIndicatorOnly: '43', footerGating: '44', scrollSkip: '45', geometryOnly: '46', columnWindow: '47', rowDiff: '48', smallUpdates: '49',
  };
  for (const k of Object.keys(REP) as (keyof PlannerFeatures)[]) {
    it(`U-PLN-${NUM[k]} ${k} 끈 판 — 대표 요청이 통째로 떨어지고 다른 묶음 줄은 그대로`, () => {
      const pl = new RenderPlanner({ features: off(k) });
      const [r, d, n] = REP[k];
      const got = plan(r, d, n, pl);
      expect(got.rows).toBe('rebuild');
      expect(got.cols).toBe('none');
      if (k === 'footerGating') expect(got.footer).toBe('values'); // 끄면 지금처럼 그릴 때마다 계산
      if (k === 'sortIndicatorOnly') {
        expect(got).toMatchObject({ header: 'rebuild', footer: 'values' }); // 끄면 지금처럼 머리글 통째·푸터 계산
        expect(plan(req(Change.SortIndicator), D0, N0, pl)).toMatchObject({ rows: 'rebuild', header: 'rebuild' });
      }
      if (k === 'scrollSkip') expect(plan(req(Change.ColsScrolled), D0, N0, pl).rows).toBe('rebuild');
      if (k === 'columnWindow') {
        expect(plan(req(Change.Viewport), D0, next({ columns: win(11, 40) }), pl).rows).toBe('rebuild');
        expect(plan(req(Change.ColWidth, { widthChangedFrom: 12 }), D0, next({ columns: win(11, 34) }), pl).rows).toBe('rebuild');
      }
      if (k === 'smallUpdates') {
        for (const [rr, dd] of [
          [req(Change.RowState), D0], [req(Change.Range), D0], [req(Change.CellValue, { cells: [{ ri: 101, field: 'a' }] }), D0],
        ] as const) expect(plan(rr, dd, N0, pl).rows).toBe('rebuild');
      }
      // 다른 묶음의 대표 요청은 최종 표와 같은 계획
      for (const other of Object.keys(REP) as (keyof PlannerFeatures)[]) {
        if (other === k) continue;
        if (k === 'footerGating') continue; // 푸터 묶음을 끄면 rebuild 줄마다 푸터 값이 붙는다(모든 줄의 푸터 칸) — 아래에서 따로 봄
        const [r2, d2, n2] = REP[other];
        expect([other, plan(r2, d2, n2, pl)]).toEqual([other, plan(r2, d2, n2, P)]);
      }
      if (k === 'footerGating') {
        for (const other of Object.keys(REP) as (keyof PlannerFeatures)[]) {
          if (other === k) continue;
          const [r2, d2, n2] = REP[other];
          const a = plan(r2, d2, n2, pl);
          const b = plan(r2, d2, n2, P);
          expect([other, { ...a, footer: 'x' }]).toEqual([other, { ...b, footer: 'x' }]);
        }
      }
    });
  }

  it('U-PLN-50 전부 끔(R7 출발점 · 생성자 기본값) — 04~41 의 모든 요청 → rows rebuild', () => {
    const cover = new Array<number>(50).fill(Infinity);
    cover[12] = 1916.6;
    const cases: [RenderRequest, DrawnState, NextState][] = [
      [req(Change.RowsScrolled), D0, N0],
      [req(Change.RowsScrolled), D0, next({ rows: rs(103, 143) })],
      [req(Change.RowsScrolled), D0, next({ rows: rs(119, 159) })],
      [req(Change.RowsScrolled), D0, next({ rows: rs(5000, 5040) })],
      [req(Change.RowsScrolled), drawn({ diffBlocked: true }), next({ rows: rs(103, 143) })],
      [req(Change.ColsScrolled), D0, N0],
      [req(Change.ColsScrolled), D0, next({ columns: win(14, 35) })],
      [req(Change.ColWidth, { widthChangedFrom: 12 }), D0, N0],
      [req(Change.ColWidth, { widthChangedFrom: 12 }), D0, next({ columns: win(11, 34) })],
      [req(Change.RowOrder), D0, N0],
      [req(Change.SortIndicator), D0, N0],
      [req(Change.RowSet), D0, N0],
      [req(Change.RowState), D0, N0],
      [req(Change.Focus, { focusTo: pos(102, 12) }), drawn({ focus: pos(101, 12) }), N0],
      [req(Change.CellValue, { cells: [{ ri: 101, field: 'c12' }] }), D0, N0],
      [req(Change.Range), D0, N0],
      [req(Change.Columns), D0, N0],
      [req(Change.Viewport), D0, next({ columns: win(11, 40) })],
      [req(Change.Appearance), D0, N0],
      [req(Change.RowsScrolled | Change.ColsScrolled), D0, next({ rows: rs(103, 143), columns: win(14, 35) })],
      [req(Change.All, { rows: rs(0, 5000) }), D0, next({ rows: rs(0, 5000) })],
      [req(Change.ColWidth, { widthChangedFrom: 12 }), drawn({ coverWidths: cover }), next({ columns: win(10, 33) })],
      [req(Change.ColWidth, { widthChangedFrom: 3 }), D0, next({ geometryVersion: 4, appliedGeometryVersion: 4 })],
    ];
    for (const pl of [new RenderPlanner(), new RenderPlanner({ features: ALL_OFF })]) {
      cases.forEach(([r, d, n], i) => {
        const got = plan(r, d, n, pl);
        expect([i, got.rows, got.cols]).toEqual([i, 'rebuild', 'none']);
      });
      // 비우기 요청은 비우기 그대로(줄 3 — 묶음과 무관)
      expect(plan(req(Change.All, { rows: 'clear' }), D0, next({ rows: 'clear' }), pl).rows).toBe('clear');
      // 빈 요청은 여전히 빈 계획(줄 1)
      expect(plan(RenderRequest.NONE, D0, N0, pl)).toEqual(EMPTY);
    }
  });

  it('검토 T-1 R7 출발점(묶음 전부 끔)의 푸터 — 행 일이 있으면 지금처럼 그릴 때마다 values', () => {
    const r7 = new RenderPlanner();
    // 스크롤(scrollSkip 꺼짐 → rebuild): 푸터 values — 지금 코드는 그릴 때마다 푸터를 다시 계산(H-5)
    expect(plan(req(Change.RowsScrolled), D0, N0, r7)).toMatchObject({ rows: 'rebuild', footer: 'values' });
    expect(plan(req(Change.ColWidth, { widthChangedFrom: 3 }), D0, N0, r7)).toMatchObject({ rows: 'rebuild', footer: 'values' });
    expect(plan(req(Change.Range), D0, N0, r7)).toMatchObject({ rows: 'rebuild', footer: 'values' });
    // 같은 요청에 footerGating 만 켜면 none(부르는 때를 줄임)
    const gated = new RenderPlanner({ features: { footerGating: true } });
    expect(plan(req(Change.RowsScrolled), D0, N0, gated)).toMatchObject({ rows: 'rebuild', footer: 'none' });
    // 행 일이 없으면(빈 요청) 푸터도 없음
    expect(plan(RenderRequest.NONE, D0, N0, r7).footer).toBe('none');
  });

  it('U-PLN-51 detail.rows 범위 → rebuild · clear → clear (줄 3·4)', () => {
    const r = rs(0, 300);
    for (const bit of [Change.Focus, Change.RowsScrolled, Change.RowSet, Change.SortIndicator]) {
      const d: Partial<RequestDetail> = { rows: r, ...(bit === Change.Focus ? { focusTo: pos(1, 1) } : {}) };
      const p = P.plan(req(bit, d), D0, next({ rows: r }));
      expect([bit, p.rows, p.cols]).toEqual([bit, 'rebuild', 'none']);
      expect(p.next.rows).toEqual(r);
      const c = P.plan(req(bit, { rows: 'clear' }), D0, next({ rows: 'clear' }));
      expect([bit, c.rows]).toEqual([bit, 'clear']);
    }
  });
});

describe('RenderPlanner — 성질·표 크기 (U-PLN-35·36)', () => {
  it('U-PLN-35 성질 무작위 — 씨앗 8 × 2,000', () => {
    const BITS = Object.entries(Change).filter(([k]) => k !== 'All').map(([, v]) => v);
    const WINS = [win(11, 32), win(14, 35), win(0, 15), ColumnWindow.full(50)];
    const SPANS = [rs(100, 140), rs(103, 143), rs(120, 160), rs(0, 0), rs(5000, 5040)];
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(seed);
      const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
      for (let k = 0; k < 2000; k++) {
        let mask = 0;
        if (rnd() < 0.05) mask = Change.All;
        else for (const b of BITS) if (rnd() < 0.15) mask |= b;
        const r = req(mask, {
          cells: [{ ri: 100 + Math.floor(rnd() * 40), field: 'f' }],
          focusTo: pos(Math.floor(rnd() * 200), Math.floor(rnd() * 50)),
          widthChangedFrom: Math.floor(rnd() * 50),
          sync: rnd() < 0.5,
        });
        const cover = Array.from({ length: 50 }, () => (rnd() < 0.2 ? 150 + rnd() * 100 : Infinity));
        const d = drawn({
          rows: rnd() < 0.1 ? null : pick(SPANS), columns: rnd() < 0.1 ? null : pick(WINS),
          diffBlocked: rnd() < 0.3, focus: rnd() < 0.5 ? pos(1, 1) : null, coverWidths: cover,
        });
        const n = next({ rows: pick(SPANS), columns: pick(WINS), appliedGeometryVersion: rnd() < 0.5 ? 4 : 5 });
        const p = P.plan(r, d, n);
        const ctx = `seed ${seed} #${k} mask ${mask}`;
        // ① changes 0 → empty
        if (mask === 0) expect([ctx, p.empty]).toEqual([ctx, true]);
        // ② Columns|Appearance → header rebuild
        if (mask & (Change.Columns | Change.Appearance)) expect([ctx, p.header]).toEqual([ctx, 'rebuild']);
        // ③ rows rebuild/clear → 작은 일 비움 · cols none(rev2 두 축)
        if (p.rows === 'rebuild' || p.rows === 'clear') {
          expect([ctx, p.focus, p.cells.length, p.rowStateRows.length, p.refillColumns.length, p.cols]).toEqual([ctx, null, 0, 0, 0, 'none']);
        }
        // ④ RowSet|CellValue|Columns|Appearance 가 없으면 푸터 none
        if (!(mask & (Change.RowSet | Change.CellValue | Change.Columns | Change.Appearance))) expect([ctx, p.footer]).toEqual([ctx, 'none']);
        // ⑤ RowSet|RowOrder|Columns|Appearance(All 포함) 가 없고 행·창이 drawn 과 같으면 rows none
        const sameRows = d.rows !== null && d.rows !== 'clear' && d.rows.start === (n.rows as RowSpan).start && d.rows.end === (n.rows as RowSpan).end;
        const sameCols = d.columns !== null && d.columns.equals(n.columns);
        if (!(mask & (Change.RowSet | Change.RowOrder | Change.Columns | Change.Appearance)) && sameRows && sameCols) {
          expect([ctx, p.rows]).toEqual([ctx, 'none']);
        }
        // 덧: empty 면 모든 일이 비어 있음
        if (p.empty) expect(shape(p)).toEqual(EMPTY);
      }
    }
  });

  it('U-PLN-36 표는 모듈 안 데이터 · 줄 ≤ 20 · 원소에 함수 없음 (AR-15)', async () => {
    const src = readFileSync(resolve(__dirname, '../../../../src/core/domain/render/RenderPlanner.ts'), 'utf8');
    const start = src.indexOf('const PLAN_TABLE');
    expect(start).toBeGreaterThan(-1);
    const open = src.indexOf('[', src.indexOf('=', start));
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(open, end + 1).replace(/\/\/[^\n]*/g, '');
    const rows = (body.match(/\bbit\s*:/g) ?? []).length;
    expect(rows).toBeGreaterThanOrEqual(10);
    expect(rows).toBeLessThanOrEqual(20);
    expect(body).not.toMatch(/=>|\bfunction\b/);
    // 내보내지 않음
    expect(src).not.toMatch(/export\s+(const|let|var)\s+PLAN_TABLE/);
    const mod: Record<string, unknown> = await import('../../../../src/core/domain/render/RenderPlanner.js');
    expect(Object.keys(mod)).not.toContain('PLAN_TABLE');
  });
});
