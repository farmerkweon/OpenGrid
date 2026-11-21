// @vitest-environment jsdom
// 넓은 그리드 새 그물 — 푸터 폭을 컬럼 기하에 묻기(걸음 R4 의 EDGE 몫, 테스트 설계서 §10-1 R4 줄: GD 바이트 같음·H-4 보존).
//
// 판정 두 갈래:
//  ① 같은 입력이면 옛 render 와 바이트까지 같다(H-4 — 디테일 펼침 칸 28px 를 여분 칸에서 빼먹는 지금 위치 그대로).
//  ② 폭 지식의 출처가 기하다 — 기하와 저장 폭이 일부러 다르면 막대는 기하 값을 쓴다(저장 폭은 「값이 있나」만 본다).
// U-FV-05(폭은 투영으로·paint 0)는 GeometryApplier 가 생기는 뒤 걸음 몫이라 여기 없음(로그 WARN 경우변경).
import { describe, it, expect } from 'vitest';
import { FooterManager } from '../../../src/core/FooterManager.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { legacyFooterValues, legacyExtraWidthWithoutDetail } from '../wg-helpers/legacy-controls.js';

const LEAVES = [{ field: 'a', type: 'number' }, { field: 'b' }, { field: 'c', type: 'number' }];
const DATA = [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }];

/** 옛 render 의 폭 몫만 떼어 낸 대조(칸 폭 배열·여분 칸 폭) — 걸음 전 FooterView 사본과 같은 식. */
function legacyWidths(opts: any, stored: any[] | null, leaves: any[], defs: any[]) {
  const widths = stored ?? leaves.map((l: any) => l.width ?? 100);
  const extraW = legacyExtraWidthWithoutDetail(opts);
  let cursor = 0;
  const cells = defs.map((d: any) => {
    const span = Math.max(1, d.colspan ?? 1);
    let w = 0;
    for (let c = 0; c < span; c++) w += widths[cursor + c] ?? 100;
    cursor += span;
    return w;
  });
  return { extraW, cells };
}

function render(opts: any, stored: any[] | null, geo: ColumnGeometry, counter?: { n: number }) {
  const c = document.createElement('div');
  const mgr = new FooterManager({
    getData: () => DATA as any[], getColLayout: () => ({ visibleLeaves: LEAVES }) as any,
    getColWidths: () => stored as any, getOptions: () => opts, getContainer: () => c,
    getGeometry: () => { if (counter) counter.n++; return geo; },
  });
  mgr.render();
  const bar = c.querySelector('.og-footer-bar') as HTMLElement | null;
  // 채움 칸(.og-footer-fill, 걸음 C5)은 폭 맞대기에서 뺀다. / The C5 filler is excluded.
  const kids = bar ? (Array.from(bar.children) as HTMLElement[]).filter((k) => !k.classList.contains('og-footer-fill')) : [];
  const hasSpacer = kids.length > 0 && kids[0]!.textContent === '' && !kids[0]!.style.padding;
  return { mgr, bar, spacer: hasSpacer ? parseFloat(kids[0]!.style.width) : 0, cells: kids.slice(hasSpacer ? 1 : 0).map((k) => parseFloat(k.style.width)) };
}
const geo = (widths: number[], o: any) => new ColumnGeometry(widths, ExtraColumns.fromOptions(o), 0);

describe('FooterView 폭 = 기하 질문 (R4, EDGE)', () => {
  // 걸음 C15 로 새 뜻: 예전 판은 H-4(디테일 펼침 칸 28px 를 빼먹은 여분 칸 122)를 지금 동작으로 못 박았다 — 이제 본문과 같은 여분 폭.
  it('R4-FT-01 [C15] 디테일 펼침 칸이 켜지면 여분 칸 = 머리글·본문과 같은 여분 폭(상태+끌기+행번호+체크+디테일 = 150) · 칸 폭은 그대로', () => {
    const opts = { footerHeight: 30, stateColumn: true, draggable: true, rowNumber: true, checkColumn: true, footer: [{ field: 'a', op: 'sum' }, { field: 'c', op: 'sum', colspan: 2 }] };
    const g = geo([120, 130, 140], { ...opts, detailExpanderCol: true });
    expect(g.extra.width()).toBe(150);
    const r = render(opts, [120, 130, 140], g);
    expect(r.spacer).toBe(g.extra.width());
    expect(r.spacer).toBe(150);
    expect(r.cells).toEqual(legacyWidths(opts, [120, 130, 140], LEAVES, opts.footer).cells);
    expect(r.cells).toEqual([120, 270]);
    // 디테일 칸이 없으면 예전 값 그대로(122) — 디테일을 안 켠 그리드는 한 바이트도 안 바뀜
    expect(render(opts, [120, 130, 140], geo([120, 130, 140], opts)).spacer).toBe(legacyWidths(opts, [120, 130, 140], LEAVES, opts.footer).extraW);
  });

  it('R4-FT-02 폭 값의 출처는 기하 — 저장 폭과 다른 기하를 주면 막대는 기하 값을 씀(저장 폭은 「값이 있나」만)', () => {
    const opts = { footerHeight: 30, footer: [{ field: 'a', op: 'sum' }, { field: 'b', op: 'sum' }, { field: 'c', op: 'sum' }] };
    const r = render(opts, [120, 130, 140], geo([200, 210, 220], {}));
    expect(r.cells).toEqual([200, 210, 220]);
  });

  it('R4-FT-03 여분 칸 폭의 출처도 기하 — 옵션에 없는 행번호가 기하에 있으면 44px 칸', () => {
    const opts = { footerHeight: 30, footer: [{ field: 'a', op: 'sum' }] };
    expect(render(opts, [120, 130, 140], geo([120, 130, 140], { rowNumber: true })).spacer).toBe(44);
    expect(render(opts, [120, 130, 140], geo([120, 130, 140], {})).spacer).toBe(0);
  });

  it('R4-FT-04 저장 폭이 없는 잎은 100px(기하의 기본 폭이 무엇이든) — 빈 배열 · 구멍 · null 원소', () => {
    const opts = { footerHeight: 30, footer: [{ field: 'a', op: 'sum' }, { field: 'b', op: 'sum' }, { field: 'c', op: 'sum' }] };
    const g = geo([150, 150, 150], {});
    expect(render(opts, [], g).cells).toEqual([100, 100, 100]);
    const holey: any[] = [120]; holey[2] = 140;
    expect(render(opts, holey, g).cells).toEqual(legacyWidths(opts, holey, LEAVES, opts.footer).cells.map((w, i) => (holey[i] == null ? w : 150)));
    expect(render(opts, [120, null, 140], g).cells).toEqual([150, 100, 150]);
  });

  it('R4-FT-05 폭 배열 자체가 없으면 잎의 width(없으면 100) — 지금 동작', () => {
    const opts = { footerHeight: 30, footer: [{ field: 'a', op: 'sum' }, { field: 'b', op: 'sum' }] };
    const c = document.createElement('div');
    const leaves = [{ field: 'a', width: 77 }, { field: 'b' }];
    new FooterManager({ getData: () => DATA as any[], getColLayout: () => ({ visibleLeaves: leaves }) as any, getColWidths: () => null as any,
      getOptions: () => opts, getContainer: () => c, getGeometry: () => geo([999, 999], {}) }).render();
    const cells = Array.from(c.querySelector('.og-footer-bar')!.children).filter((k) => !k.classList.contains('og-footer-fill')).map((k) => (k as HTMLElement).style.width);
    expect(cells).toEqual(['77px', '100px']);
  });

  it('R4-FT-06 합쳐 그리기가 마지막 잎을 넘으면 넘친 몫은 100px(옛 식과 같음)', () => {
    const opts = { footerHeight: 30, footer: [{ label: '합계', colspan: 2 }, { field: 'c', op: 'sum', colspan: 3 }] };
    const stored = [120, 130, 140];
    const r = render(opts, stored, geo(stored, {}));
    expect(r.cells).toEqual(legacyWidths(opts, stored, LEAVES, opts.footer).cells);
    expect(r.cells).toEqual([250, 340]);
  });

  it('R4-FT-07 그리기 한 번에 getGeometry 1번 · 값 계산(computeValues·fmtNum)은 0번 · 정의가 없으면 0번', () => {
    const counter = { n: 0 };
    const opts = { footerHeight: 30, footer: [{ field: 'a', op: 'sum' }] };
    const r = render(opts, [120, 130, 140], geo([120, 130, 140], {}), counter);
    expect(counter.n).toBe(1);
    expect(r.mgr.computeValues()).toEqual(legacyFooterValues(opts.footer, DATA));
    r.mgr.fmtNum(1234, '#,##0');
    expect(counter.n).toBe(1);
    const none = { n: 0 };
    render({ footerHeight: 30, footer: [] }, [120], geo([120], {}), none);
    expect(none.n).toBe(0);
  });
});
