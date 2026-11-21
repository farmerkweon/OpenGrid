/**
 * 넓은 그리드 새 그물 — 걸음 C5(EDGE) 그리드 전체판: NR-05(스크롤·선택 중 푸터 계산 0) · I-FT-02·03·05 · U-FV-04 의 그리드판.
 * 테스트 설계서 §3 NR-05 · §10-1 C5 줄 · §17 I-FT-05. 세는 수단: 공개 grid.override.strategy('summaryOp') 호출 수(wg-helpers/counters).
 *
 * C5 범위: 스크롤(세로·가로) · 선택(칸 click · 범위 · 포커스 · Space 선택) 동안 계산 0.
 * 정렬 1번(NR-05 sort1)은 C4(정렬 요청 RowOrder + sortIndicatorOnly) · 끌기(drag40)는 C8 몫이라 여기서는 「지금 값 이하」만 본다.
 * 값이 바뀌는 길(writeCell·setData·수식 재계산·필터)은 지금처럼 다시 셈해 푸터 글자 = getFooterValue.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installResizeObserverStub } from './widegrid-helpers.js';
import { mkW, disposeW, frames, fire, bodyCell, th } from './wg-helpers/counters.js';

vi.setConfig({ testTimeout: 30_000 });
beforeAll(() => installResizeObserverStub());

const FOOTER = { footer: [{ label: '합', colspan: 1 }, { field: 'c3', op: 'sum' }] };
const ko = (v: unknown) => Number(v).toLocaleString('ko-KR');
const footerText = (c: HTMLElement) => (c.querySelector('.og-footer-bar')?.children[1] as HTMLElement | undefined)?.textContent ?? null;
const numericRows = (n: number) => Array.from({ length: n }, (_, r) => {
  const o: Record<string, any> = {};
  for (let c = 0; c < 50; c++) o['c' + c] = c === 3 ? r : `r${r}c${c}`;
  return o;
});

describe('C5 푸터 — 계획이 부를 때만 계산', () => {
  it('NR-05c 세로 스크롤 10 · 가로 스크롤 10 동안 푸터 계산 0', async () => {
    const s = await mkW({ options: FOOTER, data: numericRows(1000) });
    s.c.reset();
    for (let i = 1; i <= 10; i++) { s.wrap.scrollTo(i * 40, null); await frames(1); }
    const v = s.c.read().summaryOp;
    s.c.reset();
    for (let i = 1; i <= 10; i++) { s.wrap.scrollTo(null, i * 100); await frames(1); }
    const h = s.c.read().summaryOp;
    expect({ vScroll10: v, hScroll10: h }).toEqual({ vScroll10: 0, hScroll10: 0 });
    disposeW(s);
  });

  it('NR-05c 선택 — 칸 click · 범위 지정 · Space 선택 토글 · Esc 동안 푸터 계산 0 (U-FV-04 의 선택판: 막대 요소 그대로)', async () => {
    const s = await mkW({ options: { ...FOOTER, rangeSelection: true }, data: numericRows(200) });
    const bar = s.container.querySelector('.og-footer-bar');
    s.c.reset();
    fire(bodyCell(s.container, 2, 1), 'mousedown');
    fire(bodyCell(s.container, 4, 3), 'mousemove');
    fire(bodyCell(s.container, 4, 3), 'mouseup');
    fire(bodyCell(s.container, 5, 2), 'click');
    await frames(1);
    (s.grid as any).setRangeSelection?.({ startRow: 0, endRow: 3, startCol: 0, endCol: 2 });
    s.container.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    s.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await frames(2);
    expect(s.c.read().summaryOp).toBe(0);
    expect(s.container.querySelector('.og-footer-bar')).toBe(bar);
    disposeW(s);
  });

  it('NR-05c 정렬 1번 · 끌기 — 지금 값(3 · 0) 이하(0 으로 줄이는 것은 C4 · C8)', async () => {
    const s = await mkW({ options: FOOTER, data: numericRows(200) });
    s.c.reset();
    s.grid.orderBy('c1', 'asc');
    await frames(3);
    expect(s.c.read().summaryOp).toBeLessThanOrEqual(3);
    disposeW(s);
  });

  it('I-FT-05 ①~③ writeCell · setData · 수식 재계산 뒤 푸터 = 새 합(지금과 같은 때에 다시 셈)', async () => {
    const s = await mkW({ options: FOOTER, data: numericRows(10) });
    const sum0 = 45;
    expect(footerText(s.container)).toBe(String(sum0));
    s.grid.writeCell(0, 'c3', 100);
    await frames(2);
    expect(footerText(s.container)).toBe(ko(sum0 + 100));
    expect((s.grid as any).getFooterValue('c3')).toBe(sum0 + 100);
    s.grid.setData(numericRows(5) as any);
    await frames(2);
    expect(footerText(s.container)).toBe('10');
    // 수식 칸: c3 의 0행을 =1000 으로 → 합에 반영
    (s.grid as any).setCellFormula?.(0, 'c3', '=1000');
    await frames(2);
    expect(footerText(s.container)).toBe(ko((s.grid as any).getFooterValue('c3')));
    disposeW(s);
  });

  it('I-FT-02 필터 뒤 푸터 = 걸러진 합 · I-FT-03 정렬 뒤 값 그대로', async () => {
    const s = await mkW({ options: FOOTER, data: numericRows(10) });
    (s.grid as any).setFilter('c3', [{ operator: '!=', value: 4 }]);
    await frames(2);
    expect(footerText(s.container)).toBe(ko((s.grid as any).getFooterValue('c3')));
    const before = footerText(s.container);
    s.grid.orderBy('c3', 'desc');
    await frames(3);
    expect(footerText(s.container)).toBe(before);
    disposeW(s);
  });

  it('I-FT-05 ④ 받아들인 부작용 — 행 객체를 직접 고친 뒤 스크롤만 하면 푸터는 안 바뀜(다음 값 변경 때 반영)', async () => {
    const s = await mkW({ options: FOOTER, data: numericRows(1000) });
    const before = footerText(s.container);
    (s.grid as any).getData()[0].c3 = 99999;
    s.wrap.scrollTo(400, null); await frames(1);
    s.wrap.scrollTo(null, 300); await frames(1);
    expect(footerText(s.container)).toBe(before);
    s.grid.writeCell(1, 'c3', 1);
    await frames(2);
    expect(footerText(s.container)).toBe(ko((s.grid as any).getFooterValue('c3')));
    disposeW(s);
  });
});

void th;
