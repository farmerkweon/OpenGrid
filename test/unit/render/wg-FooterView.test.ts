// @vitest-environment jsdom
// 넓은 그리드 새 그물 — FooterView 단위 시험(테스트 설계서 §2-38 U-FV-01·06, 걸음 R3).
//
// U-FV-01: 새 FooterManager(→ FooterValues + FooterView)의 render 결과 DOM 이 옛 FooterManager.render 와 바이트까지 같다.
//   대조군 = 아래 legacyRender — 걸음 전 사본(steps/R3/L30/pre/src/core/FooterManager.ts render 156~236행)을 글자 그대로 옮기고
//   값 계산만 legacyFooterValues(wg-helpers/legacy-controls.ts, T0 사본)로 바꾼 것. 그리드 전체 장면(GD-09)은 wg-golden-dom 이 따로 본다.
// U-FV-06: destroy → follower.unfollow 1번.
import { describe, it, expect } from 'vitest';
import { FooterManager } from '../../../src/core/FooterManager.js';
import { FooterView } from '../../../src/core/render/FooterView.js';
import { FooterValues } from '../../../src/core/domain/footer/FooterValues.js';
import type { IScrollFollower } from '../../../src/core/render/ports.js';
import { legacyFooterValues } from '../wg-helpers/legacy-controls.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';

/** 그리드가 넘길 기하와 같은 꼴: 실효 폭(저장 폭 ?? 기본 100) · 옵션의 여분 컬럼(디테일 펼침 칸 포함 가능). */
// 걸음 C5 부터 막대 끝에 채움 칸(.og-footer-fill — 본문 전체 폭까지)이 붙는다. 옛 render 와 맞댈 때는 그 칸을 뺀다(채움 칸 자체는 wg-c5-FooterView 가 본다).
const withoutFill = (c: HTMLElement) => { const k = c.cloneNode(true) as HTMLElement; k.querySelectorAll('.og-footer-fill').forEach((e) => e.remove()); return k.innerHTML; };
const geoFor = (opts: any, widths: readonly (number | undefined)[] | null, n = 4) =>
  new ColumnGeometry(Array.from({ length: n }, (_, i) => widths?.[i] ?? 100), ExtraColumns.fromOptions({ ...opts, detailExpanderCol: !!opts?.detailOn }), 0);

/** 옛 FooterManager.render 사본(값 계산만 T0 사본으로). */
function legacyRender(d: { getContainer(): HTMLElement; getOptions(): any; getColLayout(): any; getColWidths(): any; getData(): any[]; customOp?: any }): void {
  const container = d.getContainer();
  const old = container.querySelector('.og-footer-bar');
  old?.remove();

  const opts = d.getOptions();
  const footerDefs = opts.footer;
  if (!footerDefs || footerDefs.length === 0) return;

  const leaves = d.getColLayout().visibleLeaves;
  const widths = d.getColWidths() ?? leaves.map((l: any) => l.width ?? 100);
  const valMap = new Map(
    legacyFooterValues(d.getOptions().footer, d.getData(), d.customOp ?? null).map((v: any) => [v._field, v])
  );

  const bar = document.createElement('div');
  bar.className = 'og-footer-bar';
  bar.style.cssText = [
    'display:flex;align-items:stretch;',
    `min-height:${opts.footerHeight}px;`,
    'border-top:2px solid var(--og-primary,#1976d2);',
    'background:var(--og-header-bg,#f5f5f5);',
    'overflow:hidden;flex-shrink:0;font-size:13px;font-weight:600;',
  ].join('');

  let extraW = 0;
  if (opts.stateColumn) extraW += 24;
  if (opts.draggable)   extraW += 18;
  if (opts.rowNumber)   extraW += 44;
  if (opts.checkColumn) extraW += 36;
  if (extraW > 0) {
    const spacer = document.createElement('div');
    spacer.style.cssText = `width:${extraW}px;flex-shrink:0;border-right:1px solid var(--og-border-color,#e0e0e0);`;
    bar.appendChild(spacer);
  }

  let leafCursor = 0;
  for (const def of footerDefs) {
    const colspan = Math.max(1, def.colspan ?? 1);
    let cellW = 0;
    for (let c = 0; c < colspan; c++) {
      cellW += widths[leafCursor + c] ?? 100;
    }
    const targetLeaf = leaves[leafCursor];
    leafCursor += colspan;

    const cell = document.createElement('div');
    cell.style.cssText = [
      `width:${cellW}px;min-width:${cellW}px;flex-shrink:0;`,
      'padding:4px 8px;box-sizing:border-box;overflow:hidden;',
      'border-right:1px solid var(--og-border-color,#e0e0e0);',
      'white-space:nowrap;text-overflow:ellipsis;',
    ].join('');

    const field = def.field;
    const val   = field ? valMap.get(field) : null;
    if (val) {
      const displayVal = val._formatted ?? String(val._value ?? '');
      const prefix = def.label ? `${def.label}: ` : '';
      cell.textContent = prefix + displayVal;
      cell.title = `${(def.op as string)?.toUpperCase() ?? ''} = ${displayVal}`;
      cell.style.color = 'var(--og-primary,#1976d2)';
      cell.style.textAlign = def.align ?? (targetLeaf?.type === 'number' ? 'right' : 'right');
    } else if (def.label) {
      cell.textContent = def.label;
      cell.style.textAlign = def.align ?? 'left';
      cell.style.color = 'var(--og-row-color,#212121)';
    }
    bar.appendChild(cell);
  }

  if (opts.footerPosition === 'top') {
    container.insertBefore(bar, container.firstChild);
  } else {
    container.appendChild(bar);
  }
}

const LEAVES = [{ field: 'a', type: 'number', width: 90 }, { field: 'b', type: 'text' }, { field: 'c', type: 'number', width: 70 }, { field: 'd' }];
const DATA = [{ a: 1, b: 'x', c: 2.5, d: 10 }, { a: '4', b: null, c: 7, d: '#REF' }, { a: null, b: 'y', c: -3.25, d: 20 }];

type Scene = { name: string; opts: any; widths: number[] | null; customOp?: any };
const SCENES: Scene[] = [
  { name: '기본(합계·평균·개수)', opts: { footerHeight: 32, footer: [{ field: 'a', op: 'sum' }, { field: 'b', op: 'count' }, { field: 'c', op: 'avg', format: '#,##0.00' }] }, widths: [120, 120, 120, 120] },
  { name: '여분 컬럼 전부 + 라벨 + 맞춤', opts: { footerHeight: 40, stateColumn: true, draggable: true, rowNumber: true, checkColumn: true, footer: [{ label: '합계', colspan: 2 }, { field: 'c', op: 'max', label: '최대', align: 'center' }, { field: 'd', op: 'min', format: '₩#,##0' }] }, widths: [100, 80, 60, 50] },
  { name: '위에 둠 + 폭 배열 없음(잎 width·100)', opts: { footerHeight: 28, footerPosition: 'top', footer: [{ field: 'a', op: 'SUM', format: '0.0원' }, { field: 'zz', op: 'median' }, { label: '끝' }] }, widths: null },
  { name: '정의 없음', opts: { footerHeight: 32, footer: [] }, widths: [120] },
  // 검토 R3-4: COUNT 는 형식을 무시한다(지금 동작 — 공개 getFooterData 에 드러남). 이 장면이 없으면 「COUNT 에 형식 적용」 돌연변이가 산다.
  { name: 'COUNT + format(형식 무시)', opts: { footerHeight: 32, footer: [{ field: 'c', op: 'count', format: '0.00' }, { field: 'a', op: 'COUNT', format: '₩#,##0.0' }] }, widths: [120, 120, 120, 120] },
  { name: '사용자 summaryOp', opts: { footerHeight: 32, rowNumber: true, footer: [{ field: 'a', op: 'median' }, { field: 'c', op: 'sum' }] }, widths: [120, 120, 120, 120],
    customOp: (op: string, nums: any[]) => (op === 'MEDIAN' ? nums.length * 100 : null) },
];

function containerWithBody(): HTMLElement {
  const c = document.createElement('div');
  c.innerHTML = '<div class="og-header"></div><div class="og-body-wrap"></div>';
  return c;
}

describe('FooterView — U-FV (R3)', () => {
  for (const sc of SCENES) {
    it(`U-FV-01 paint = 옛 render, 바이트 같음 — ${sc.name} (두 번 그려도 막대 하나)`, () => {
      const mk = () => containerWithBody();
      const cNew = mk();
      const cOld = mk();
      const getStrategy = sc.customOp
        ? (<F extends Function>(slot: string, fb: F): F => (slot === 'summaryOp' ? (sc.customOp as F) : fb))
        : undefined;
      const mgr = new FooterManager({
        getData: () => DATA as any[], getColLayout: () => ({ visibleLeaves: LEAVES }) as any,
        getColWidths: () => sc.widths as any, getOptions: () => sc.opts, getContainer: () => cNew, getGeometry: () => geoFor(sc.opts, sc.widths),
        ...(getStrategy ? { getStrategy } : {}),
      });
      const legacyDeps = { getData: () => DATA, getColLayout: () => ({ visibleLeaves: LEAVES }), getColWidths: () => sc.widths,
        getOptions: () => sc.opts, getContainer: () => cOld, customOp: sc.customOp };
      mgr.render(); legacyRender(legacyDeps);
      expect(withoutFill(cNew)).toBe(cOld.innerHTML);
      mgr.render(); legacyRender(legacyDeps);
      expect(withoutFill(cNew)).toBe(cOld.innerHTML);
      expect(cNew.querySelectorAll('.og-footer-bar').length).toBe(sc.opts.footer.length ? 1 : 0);
      // computeValues 이음새 모양 그대로
      expect(mgr.computeValues()).toEqual(legacyFooterValues(sc.opts.footer, DATA, sc.customOp ?? null));
    });
  }

  it('U-FV-01 덤 — fmtNum(공개 이름)은 FooterValues.format 에 맡기고 옛 글자와 같음', () => {
    const mgr = new FooterManager({ getData: () => [], getColLayout: () => ({ visibleLeaves: [] }) as any,
      getColWidths: () => [], getOptions: () => ({}), getContainer: () => document.createElement('div'), getGeometry: () => geoFor({}, [], 0) });
    for (const [v, f] of [[1234567.891, undefined], [-1234.5, '#,##0.00'], [99, '₩#,##0'], [-7.25, '0.0원'], [1234.5, '2']] as Array<[number, string | undefined]>) {
      expect(mgr.fmtNum(v, f)).toBe(legacyFooterValues([{ field: 'x', op: 'sum', format: f }], [{ x: v }])[0]._formatted);
    }
  });

  it('U-FV-01 덤(검토 R3-4) — COUNT 결과 글자는 형식을 안 탐: 3 → "3"(0.00 아님)', () => {
    const c = containerWithBody();
    const mgr = new FooterManager({ getData: () => DATA as any[], getColLayout: () => ({ visibleLeaves: LEAVES }) as any,
      getColWidths: () => [120, 120, 120, 120], getOptions: () => ({ footerHeight: 32, footer: [{ field: 'c', op: 'count', format: '0.00' }] }),
      getContainer: () => c, getGeometry: () => geoFor({}, [120, 120, 120, 120]) });
    expect(mgr.computeValues()).toEqual([{ _field: 'c', _value: 3, _formatted: '3' }]);
    mgr.render();
    expect(c.querySelector('.og-footer-bar')!.textContent).toBe('3');
  });

  it('U-FV-01 덤(검토 R3-1) — 그리기 한 번에 옵션 읽기 2번 · 원천 읽기 1번(옛 render 와 같음)', () => {
    const c = containerWithBody();
    let optReads = 0, dataReads = 0;
    const opts = { footerHeight: 32, footer: [{ field: 'a', op: 'sum' }, { field: 'c', op: 'avg' }] };
    const mgr = new FooterManager({ getData: () => { dataReads++; return DATA as any[]; }, getColLayout: () => ({ visibleLeaves: LEAVES }) as any,
      getColWidths: () => [120, 120, 120, 120], getOptions: () => { optReads++; return opts; }, getContainer: () => c, getGeometry: () => geoFor({}, [120, 120, 120, 120]) });
    mgr.render();
    expect(optReads).toBe(2);
    expect(dataReads).toBe(1);
    // 대조: 옛 render 사본도 같은 횟수
    let lo = 0, ld = 0;
    legacyRender({ getData: () => { ld++; return DATA; }, getColLayout: () => ({ visibleLeaves: LEAVES }), getColWidths: () => [120, 120, 120, 120],
      getOptions: () => { lo++; return opts; }, getContainer: () => containerWithBody() });
    expect([optReads, dataReads]).toEqual([lo, ld]);
  });

  it('U-FV-06 destroy → follower.unfollow 1번(그린 막대), 그 뒤 다시 풀지 않음', () => {
    const c = containerWithBody();
    const calls: string[] = [];
    let followed: HTMLElement | null = null;
    const follower: IScrollFollower = {
      follow: (el) => { calls.push('follow'); followed = el; },
      unfollow: (el) => { calls.push('unfollow'); expect(el).toBe(followed); },
      sync: () => {}, destroy: () => {},
    };
    const values = new FooterValues();
    const view = new FooterView({
      container: () => c, options: () => ({ footerHeight: 30, footer: [{ field: 'a', op: 'sum' }] }),
      leaves: () => LEAVES, geometry: () => geoFor({}, [120, 120, 120, 120]), widths: () => [120, 120, 120, 120], values: () => values.compute([{ field: 'a', op: 'sum' }], { rows: () => DATA }), follower,
    });
    view.paint();
    expect(calls).toEqual(['follow']);
    expect(followed).toBe(c.querySelector('.og-footer-bar'));
    view.destroy();
    expect(calls).toEqual(['follow', 'unfollow']);
    view.destroy();
    expect(calls.filter((x) => x === 'unfollow').length).toBe(1);
  });

  it('(덤) 다시 그리면 옛 막대를 풀고 새 막대를 맡김 · updateValues 는 지금은 paint 와 같음', () => {
    const c = containerWithBody();
    const calls: string[] = [];
    const follower: IScrollFollower = { follow: () => calls.push('follow'), unfollow: () => calls.push('unfollow'), sync: () => {}, destroy: () => {} };
    const view = new FooterView({
      container: () => c, options: () => ({ footerHeight: 30, footer: [{ field: 'a', op: 'sum' }] }),
      leaves: () => LEAVES, geometry: () => geoFor({}, null), widths: () => null, values: () => new FooterValues().compute([{ field: 'a', op: 'sum' }], { rows: () => DATA }), follower,
    });
    view.paint();
    view.updateValues();
    expect(calls).toEqual(['follow', 'unfollow', 'follow']);
    expect(c.querySelectorAll('.og-footer-bar').length).toBe(1);
  });
});
