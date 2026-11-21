/**
 * §0-4 대조군 사본이 지금 코드와 같은 값을 내는지 — T0 에서 한 번 단언(이후 사본은 고치지 않는다).
 * 여분 컬럼 폭 합 · 고정 컬럼 left 누적 · 전체 폭 · recalcWidths 입력 폭 · 푸터 값 · 높이 판정. jsdom.
 * 정렬 비교자 사본은 wg-sort-oracle.test.ts 가 맡는다.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { installResizeObserverStub, makeGrid, wideColumns, wideRows, settle } from './widegrid-helpers.js';
import { ColumnLayout } from '../../src/core/ColumnLayout.js';
import { FooterManager } from '../../src/core/FooterManager.js';
import { RenderController } from '../../src/core/RenderController.js';
import {
  legacyExtraWidth, legacyExtraWidthWithoutDetail, legacyFrozenLeft, legacyTotalColWidth,
  legacyRecalcWidthsInput, legacyFooterValues, legacyViewportHeight,
} from './wg-helpers/legacy-controls.js';

// 다른 레인이 같은 PC 에서 테스트·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다(C0 때 NR-05 가 두 번 시간 초과).
// 단언은 그대로 두고 시간 한도만 넉넉히. 더 긴 한도를 따로 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

// 증거 파일은 명시할 때만 쓴다(평소 실행이 T0 증거를 덮어쓰지 않게): WG_WRITE_EVIDENCE=1 또는 WG_T0_RECORD=1.
// 쓰는 곳은 WG_EVID_DIR(있으면) 아니면 T0 증거 폴더.
const WRITE_EVID = process.env.WG_WRITE_EVIDENCE === '1' || process.env.WG_T0_RECORD === '1';
const EVID = process.env.WG_EVID_DIR ? resolve(process.env.WG_EVID_DIR) : resolve(__dirname, '../../sessions/widegrid-perf-2026-11/steps/T0/L19/evidence');
const LOG: Record<string, any> = {};
beforeAll(() => installResizeObserverStub());
afterAll(() => {
  if (!WRITE_EVID) return;
  mkdirSync(EVID, { recursive: true });
  writeFileSync(resolve(EVID, 'controls-legacy.json'), JSON.stringify(LOG, null, 2), 'utf8');
});

const px = (s: string) => (s === '' ? NaN : parseFloat(s));
const detail = { enabled: true, renderer: (_r: any, h: HTMLElement) => { h.textContent = 'D'; } };

/** 여분 컬럼 조합 16가지 × 디테일 켬/끔 */
const COMBOS: Array<Record<string, any>> = [];
for (let m = 0; m < 16; m++) {
  for (const d of [false, true]) {
    COMBOS.push({
      stateColumn: !!(m & 1), draggable: !!(m & 2), rowNumber: !!(m & 4), checkColumn: !!(m & 8),
      ...(d ? { masterDetail: detail } : {}),
    });
  }
}
const label = (o: Record<string, any>) => ['stateColumn', 'draggable', 'rowNumber', 'checkColumn'].filter(k => o[k]).join('+') + (o.masterDetail ? '+detail' : '') || 'none';

function leafWidths(container: HTMLElement, n: number): number[] {
  const ths = Array.from(container.querySelectorAll<HTMLElement>('.og-header-cell:not(.og-extra-col)'));
  return ths.slice(0, n).map(t => px(t.style.width));
}

describe('U-EXT-09·U-GEO-24 대조군 — 여분 폭 합 · 전체 폭 · 고정 left (GridRenderer 자리)', () => {
  it('CTL-EXT-01 머리글 표 width · 본문 min-width = legacyTotalColWidth (32조합)', () => {
    const rows: any[] = [];
    for (const o of COMBOS) {
      const { grid, container } = makeGrid({ columns: wideColumns(6, 110), ...o }, wideRows(5, 6), { width: 1200, height: 400 });
      const w = leafWidths(container, 6);
      const table = container.querySelector<HTMLElement>('.og-header-table')!;
      const body = container.querySelector<HTMLElement>('.og-body')!;
      const want = legacyTotalColWidth(w, 6, { ...o, defaultColumnWidth: 100 }, !!o.masterDetail);
      rows.push({ combo: label(o), widths: w, header: px(table.style.width), body: px(body.style.minWidth), legacy: want });
      expect(px(table.style.width), label(o)).toBe(want);
      expect(px(body.style.minWidth), label(o)).toBe(want);
      grid.destroy(); container.remove();
    }
    LOG['CTL-EXT-01'] = rows;
  });

  it('CTL-FRZ-01 고정 컬럼(frozenColumns 3) 머리글 th left · 본문 칸 left = legacyFrozenLeft (32조합)', async () => {
    const rows: any[] = [];
    for (const o of COMBOS) {
      const { grid, container } = makeGrid({ columns: wideColumns(6, 110), frozenColumns: 3, ...o }, wideRows(5, 6), { width: 1200, height: 400 });
      await settle();
      const w = leafWidths(container, 6);
      const ths = Array.from(container.querySelectorAll<HTMLElement>('.og-header-cell:not(.og-extra-col)'));
      for (let i = 0; i < 3; i++) {
        const want = legacyFrozenLeft(w, { ...o, defaultColumnWidth: 100 }, !!o.masterDetail, i);
        const cell = container.querySelector<HTMLElement>(`[role="row"][aria-rowindex="1"] [role="gridcell"][aria-colindex="${i + 1}"]`)!;
        rows.push({ combo: label(o), i, th: px(ths[i]!.style.left), cell: px(cell.style.left), legacy: want });
        expect(px(ths[i]!.style.left), `${label(o)} th ${i}`).toBe(want);
        expect(px(cell.style.left), `${label(o)} cell ${i}`).toBe(want);
      }
      grid.destroy(); container.remove();
    }
    LOG['CTL-FRZ-01'] = rows;
  });

  it('CTL-FRZ-02 세로 병합 마스터 칸 left = legacyFrozenLeft 공통식 (rowNumber+checkColumn+detail)', async () => {
    const o = { rowNumber: true, checkColumn: true, masterDetail: detail };
    const { grid, container } = makeGrid({ columns: wideColumns(6, 110), ...o }, wideRows(6, 6), { width: 1200, height: 400 });
    (grid as any).mergeCells?.([{ row: 1, col: 2, rowSpan: 3, colSpan: 1 }]);
    (grid as any).refresh?.();
    await settle();
    const w = leafWidths(container, 6);
    const master = Array.from(container.querySelectorAll<HTMLElement>('.og-body [role="gridcell"]')).find(c => c.style.position === 'absolute');
    LOG['CTL-FRZ-02'] = { found: !!master, left: master ? px(master.style.left) : null, legacy: legacyFrozenLeft(w, { ...o, defaultColumnWidth: 100 }, true, 2) };
    if (master) expect(px(master.style.left)).toBe(legacyFrozenLeft(w, { ...o, defaultColumnWidth: 100 }, true, 2));
    else LOG['CTL-FRZ-02'].note = '병합 공개 수단을 이 이름으로 못 찾음 — 이 줄은 기록만(L18 GD-05 장면이 같은 자리를 지킴)';
    grid.destroy(); container.remove();
  });
});

// 걸음 C15(결함 H-4 고침, 설계 C15 줄 · STR 14:17 요청): 두 자리가 이제 디테일 펼침 칸 28 을 더한 여분 폭(= extra.width() = legacyExtraWidth(o, 디테일))을 쓴다.
// 예전 판은 「디테일 28 을 빼먹는」 옛 값(legacyRecalcWidthsInput · legacyExtraWidthWithoutDetail)을 지금 동작으로 못 박았다 — 대조군 함수는 옛 그대로 두고(기록) 기대만 옳은 값으로.
describe('대조군 — 디테일 28 을 더하는 두 자리(H-4 고침, C15)', () => {
  it('CTL-EXT-02 [C15] recalcWidths 가 computeWidths 에 넘기는 폭 = 전체 − 여분 폭(디테일 28 포함, 32조합)', () => {
    const rows: any[] = [];
    for (const o of COMBOS) {
      const spy = vi.spyOn(ColumnLayout.prototype, 'computeWidths');
      const { grid, container } = makeGrid({ columns: wideColumns(6, 110), ...o }, wideRows(3, 6), { width: 1200, height: 400 });
      const firstArg = spy.mock.calls.length ? spy.mock.calls[spy.mock.calls.length - 1]![0] : NaN;
      spy.mockRestore();
      const want = 1200 - legacyExtraWidth(o, !!o.masterDetail);
      rows.push({ combo: label(o), arg: firstArg, want, legacyH4: legacyRecalcWidthsInput(1200, o) });
      expect(firstArg, label(o)).toBe(want);
      grid.destroy(); container.remove();
    }
    LOG['CTL-EXT-02'] = rows;
  });

  it('CTL-EXT-03 [C15] 푸터 앞 빈칸 폭 = 여분 폭(디테일 켜면 28 포함 — 머리글 여분과 같음)', () => {
    const rows: any[] = [];
    for (const o of COMBOS) {
      const { grid, container } = makeGrid({ columns: wideColumns(4, 110), footer: [{ field: 'c0', op: 'count' }], ...o }, wideRows(3, 4), { width: 1200, height: 400 });
      const bar = container.querySelector<HTMLElement>('.og-footer-bar')!;
      const want = legacyExtraWidth(o, !!o.masterDetail);
      const first = bar.firstElementChild as HTMLElement;
      const spacerW = want > 0 ? px(first.style.width) : 0;
      rows.push({ combo: label(o), spacer: spacerW, want, legacyH4: legacyExtraWidthWithoutDetail(o) });
      expect(spacerW, label(o)).toBe(want);
      grid.destroy(); container.remove();
    }
    LOG['CTL-EXT-03'] = rows;
  });
});

describe('U-FTV-01 대조군 — 푸터 값(FooterManager.computeValues 사본)', () => {
  const DATA = [
    { a: 10, b: '2.5', c: null, d: '', e: '#REF', f: 'x' },
    { a: -3, b: '7.25', c: 4, d: 1e3, e: 5, f: 'y' },
    { a: 0.1, b: '0.2', c: undefined, d: '12', e: '#DIV0', f: null },
    { a: 1234567, b: '100', c: 0, d: -0.5, e: 2, f: 'z' },
  ];
  const DEFS = [
    { field: 'a', op: 'sum' }, { field: 'a', op: 'avg', format: '#,##0.00' }, { field: 'b', op: 'sum' },
    { field: 'c', op: 'count' }, { field: 'd', op: 'max' }, { field: 'd', op: 'min', format: '₩#,##0' },
    { field: 'e', op: 'sum' }, { field: 'f', op: 'count' }, { label: '라벨만', colspan: 2 },
    { field: 'a', op: 'SUM', format: '0.000' }, { field: 'a', op: 'median' },
  ];
  const mk = (defs: any[], data: any[], strategy?: any) => new FooterManager({
    getData: () => data, getColLayout: () => ({ visibleLeaves: [] }) as any, getColWidths: () => [],
    getOptions: () => ({ footer: defs }), getContainer: () => document.createElement('div'),
    ...(strategy ? { getStrategy: (_s: string, _fb: any) => strategy } : {}),
  } as any);

  it('CTL-FTV-01 기본 집계(sum·avg·count·max·min·형식·오류 토큰·빈 값·모르는 op) 사본 == 실제', () => {
    const real = mk(DEFS, DATA).computeValues();
    const copy = legacyFooterValues(DEFS, DATA);
    LOG['CTL-FTV-01'] = { real, copy };
    expect(copy).toEqual(real);
  });
  it('CTL-FTV-02 사용자 summaryOp(일부 op 만 가로챔) 사본 == 실제', () => {
    const custom = (op: string, nums: any[]) => (op === 'MEDIAN' ? nums.length * 100 : null);
    const real = mk(DEFS, DATA, custom).computeValues();
    const copy = legacyFooterValues(DEFS, DATA, custom);
    expect(copy).toEqual(real);
  });
  it('CTL-FTV-04 [사실] 숫자로 못 읽는 글자를 sum 하면 지금 코드는 던진다 — 사본도 같은 자리에서 던진다', () => {
    const bad = [{ b: 'abc' }, { b: '1' }]; // '1e2'·1e-300 같은 지수 표기도 같은 자리에서 던짐(잼, CTL-FTV-01 첫 판)
    let realErr = '', copyErr = '';
    try { mk([{ field: 'b', op: 'sum' }], bad).computeValues(); } catch (e: any) { realErr = String(e?.name); }
    try { legacyFooterValues([{ field: 'b', op: 'sum' }], bad); } catch (e: any) { copyErr = String(e?.name); }
    LOG['CTL-FTV-04'] = { realErr, copyErr };
    expect(realErr).not.toBe('');
    expect(copyErr).toBe(realErr);
  });
  it('CTL-FTV-03 빈 자료 · 정의 없음', () => {
    expect(legacyFooterValues(DEFS, [])).toEqual(mk(DEFS, []).computeValues());
    expect(legacyFooterValues([], DATA)).toEqual(mk([], DATA).computeValues());
    expect(legacyFooterValues(undefined, DATA)).toEqual(mk(undefined as any, DATA).computeValues());
  });
});

describe('U-VHJ-06·07 대조군 — 높이 판정(syncHeaderLayout 사본)', () => {
  function realSync(p: { containerHeight: number; measured: number; headerHeight: number; pagination: boolean; fallback?: number; total: number }) {
    let bodyWrapH: number | null = null, vpH: number | null = null;
    const rc = new RenderController({
      getRenderer: () => ({ getHeaderHeight: () => p.measured, updateSize: (t: number, h: number) => { bodyWrapH = t - h; } }) as any,
      getVs: () => ({ getTotalHeight: () => p.total, setViewportHeight: (v: number) => { vpH = v; } }) as any,
      getOptions: () => ({ headerHeight: p.headerHeight, pagination: p.pagination, fallbackViewportHeight: p.fallback }) as any,
      getContainer: () => ({ getBoundingClientRect: () => ({ height: p.containerHeight, width: 800 }) }) as any,
    } as any);
    rc.syncHeaderLayout();
    return bodyWrapH === null && vpH === null ? null : { bodyWrapHeight: bodyWrapH, viewportHeight: vpH };
  }
  const CASES = [
    { containerHeight: 640, measured: 30, headerHeight: 36, pagination: false, total: 32000 },
    { containerHeight: 640, measured: 58, headerHeight: 36, pagination: false, total: 32000 },
    { containerHeight: 640, measured: 36, headerHeight: 36, pagination: true, total: 32000 },
    { containerHeight: 5000, measured: 36, headerHeight: 36, pagination: false, fallback: 400, total: 3200 },
    { containerHeight: 5000, measured: 36, headerHeight: 36, pagination: false, fallback: 400, total: 99999 },
    { containerHeight: 300, measured: 36, headerHeight: 36, pagination: false, fallback: 400, total: 100 },
    { containerHeight: 0, measured: 36, headerHeight: 36, pagination: false, total: 100 },
  ];
  it('CTL-VHJ-01 일곱 경우(줄바꿈 머리글·페이지·폴백 클램프 켬/안 걸림·높이 0) 사본 == 실제', () => {
    const rows = CASES.map(c => ({
      c, real: realSync(c),
      copy: legacyViewportHeight({ containerHeight: c.containerHeight, measuredHeaderHeight: c.measured, headerHeight: c.headerHeight, pagination: c.pagination, fallbackViewportHeight: c.fallback, totalContentHeight: c.total }),
    }));
    LOG['CTL-VHJ-01'] = rows;
    for (const r of rows) expect(r.copy, JSON.stringify(r.c)).toEqual(r.real);
  });
});
