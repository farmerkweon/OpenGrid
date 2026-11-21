/**
 * [특성 테스트] 사용자 렌더러로 「칸 안 일부 낱말에 색 입히기」 — 발주자 추가 지시 4.
 *
 * 공개 수단: OpenGrid.registerRenderer(이름, factory) + 컬럼 { renderer: 이름 }.
 * factory 는 { render(ctx) → HTMLElement } 를 돌려준다(src/core/renderers/CellRenderer.ts).
 *
 * 잡으려는 깨짐(행 재사용·가로 가상화·「내장 글자 칸만 빠른 길」을 넣다가):
 *  - 칸에 그려진 내용이 사용자 렌더러가 만든 그대로가 아님(글자만 남고 색 요소가 사라짐 등)
 *  - 정렬·너비 조절·화면 밖에서 다시 들어온 뒤 낡은 내용이 남거나 렌더러가 안 불림
 *  - 화면에 보이는 칸인데 렌더러가 한 번도 안 불림 → 실패
 * 렌더러 호출 횟수는 「지금 횟수 이하」만 단언한다(줄어드는 건 허용 — 빠른 길이 덜 부르는 건 좋은 일).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse } from './widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const WORDS = ['사과', '배', 'apple'];
type Call = { ri: number; ci: number; field: string; value: any };
const calls: Call[] = [];

/** 낱말에 색을 입히는 사용자 렌더러 — 실제 사용자가 쓰는 모양 그대로. */
function highlight(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'wg-hl-cell';
  const re = new RegExp(`(${WORDS.join('|')})`, 'g');
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index! > last) span.appendChild(document.createTextNode(text.slice(last, m.index)));
    const mark = document.createElement('mark');
    mark.className = 'wg-hl';
    mark.style.color = 'rgb(200, 0, 0)';
    mark.textContent = m[0];
    span.appendChild(mark);
    last = m.index! + m[0].length;
  }
  if (last < text.length) span.appendChild(document.createTextNode(text.slice(last)));
  return span;
}

OpenGrid.registerRenderer('widegrid-hl', () => ({
  render: (ctx: any) => {
    calls.push({ ri: ctx.rowIndex, ci: ctx.colIndex, field: ctx.column.field, value: ctx.value });
    return highlight(ctx.value == null ? '' : String(ctx.value));
  },
}));

const COLS = [
  { field: 'k', header: 'K', width: 100 },
  { field: 't', header: 'T', width: 200, renderer: 'widegrid-hl' },
];
const DATA = [
  { k: 3, t: '사과 한 개와 배 두 개' },
  { k: 1, t: 'apple 과 사과는 같다' },
  { k: 2, t: '색 없는 글' },
];

function cell(container: HTMLElement, ri: number, ci: number): HTMLElement | null {
  return container.querySelector(`[role="row"][aria-rowindex="${ri + 1}"] [role="gridcell"][aria-colindex="${ci + 1}"]`);
}
function marks(el: HTMLElement | null): string[] {
  return el ? Array.from(el.querySelectorAll('mark.wg-hl')).map(m => m.textContent ?? '') : [];
}

describe('사용자 렌더러 — 그려진 내용(HL-01~HL-03)', () => {
  it('HL-01 칸 안에 사용자 렌더러가 만든 요소가 그대로 있다(색 입힌 낱말·나머지 글자)', async () => {
    calls.length = 0;
    const { container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    const c = cell(container, 0, 1)!;
    expect(marks(c)).toEqual(['사과', '배']);
    expect(c.textContent).toBe('사과 한 개와 배 두 개');
    expect((c.querySelector('mark.wg-hl') as HTMLElement).style.color).toBe('rgb(200, 0, 0)');
    expect(marks(cell(container, 1, 1))).toEqual(['apple', '사과']);
    expect(marks(cell(container, 2, 1))).toEqual([]);
  });

  it('HL-02 렌더러는 ctx 로 rowIndex·colIndex·column.field·value 를 받는다', async () => {
    calls.length = 0;
    makeGrid({ columns: COLS }, DATA);
    await settle();
    const first = calls.find(c => c.ri === 0)!;
    expect(first).toEqual({ ri: 0, ci: 1, field: 't', value: '사과 한 개와 배 두 개' });
  });

  it('HL-03 렌더러를 안 쓴 컬럼(k)에는 렌더러가 불리지 않는다', async () => {
    calls.length = 0;
    makeGrid({ columns: COLS }, DATA);
    await settle();
    expect(calls.every(c => c.field === 't')).toBe(true);
  });
});

describe('사용자 렌더러 — 다시 그린 뒤에도 그대로(HL-04~HL-06)', () => {
  it('HL-04 정렬 뒤 각 줄의 색 입힌 낱말이 그 줄의 새 값과 맞는다(낡은 내용이 안 남음)', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    grid.orderBy('k', 'asc');
    await settle();
    expect(cell(container, 0, 1)!.textContent).toBe('apple 과 사과는 같다');
    expect(marks(cell(container, 0, 1))).toEqual(['apple', '사과']);
    expect(marks(cell(container, 1, 1))).toEqual([]);
    expect(marks(cell(container, 2, 1))).toEqual(['사과', '배']);
  });

  it('HL-05 머리글 클릭 정렬 뒤에도 같다', async () => {
    const { container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    mouse(headerCellByText(container, 'K'), 'click');
    await settle();
    expect(marks(cell(container, 0, 1))).toEqual(['apple', '사과']);
  });

  it('HL-06 너비 조절(손잡이 끌어 놓기) 뒤에도 색 입힌 낱말이 그대로', async () => {
    const { container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    const handle = headerCellByText(container, 'T').querySelector('.og-resize-handle')!;
    mouse(handle, 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 180 });
    mouse(document, 'mouseup', { clientX: 180 });
    await settle();
    expect(marks(cell(container, 0, 1))).toEqual(['사과', '배']);
    expect(cell(container, 0, 1)!.textContent).toBe('사과 한 개와 배 두 개');
  });

  it('HL-07 writeCell 로 값을 바꾸면 색 입힌 낱말도 새 값 기준', async () => {
    const { grid, container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    grid.writeCell(2, 't', '배 와 apple');
    await settle();
    expect(marks(cell(container, 2, 1))).toEqual(['배', 'apple']);
  });
});

describe('사용자 렌더러 — 호출 횟수(HL-08~HL-10)', () => {
  // 지금 횟수(2026-11-21 실측). 줄어드는 것은 허용, 늘면 실패. 보이는 칸이 0번이면 실패.
  it('HL-08 처음 그릴 때: 보이는 칸마다 1번 이상, 칸마다 지금 1번 이하', async () => {
    calls.length = 0;
    const { container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    const per = new Map<number, number>();
    for (const c of calls) per.set(c.ri, (per.get(c.ri) ?? 0) + 1);
    for (let ri = 0; ri < DATA.length; ri++) {
      expect(cell(container, ri, 1)).not.toBeNull();
      expect(per.get(ri) ?? 0).toBeGreaterThanOrEqual(1);
      expect(per.get(ri)!).toBeLessThanOrEqual(HL08_MAX_PER_CELL);
    }
  });

  it('HL-09 정렬 1번에 칸마다 추가 호출은 지금 횟수 이하, 다시 그려진 보이는 칸은 1번 이상', async () => {
    const { grid } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    calls.length = 0;
    grid.orderBy('k', 'desc');
    await settle();
    const per = new Map<number, number>();
    for (const c of calls) per.set(c.ri, (per.get(c.ri) ?? 0) + 1);
    for (let ri = 0; ri < DATA.length; ri++) {
      expect(per.get(ri) ?? 0).toBeGreaterThanOrEqual(1);
      expect(per.get(ri)!).toBeLessThanOrEqual(HL09_MAX_PER_CELL);
    }
  });

  it('HL-10 너비 조절 1번에 칸마다 추가 호출은 지금 횟수 이하(0번도 허용 — 내용이 안 바뀌니까)', async () => {
    const { container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    calls.length = 0;
    const handle = headerCellByText(container, 'T').querySelector('.og-resize-handle')!;
    mouse(handle, 'mousedown', { clientX: 100 });
    mouse(document, 'mousemove', { clientX: 180 });
    mouse(document, 'mouseup', { clientX: 180 });
    await settle();
    const per = new Map<number, number>();
    for (const c of calls) per.set(c.ri, (per.get(c.ri) ?? 0) + 1);
    for (let ri = 0; ri < DATA.length; ri++) expect(per.get(ri) ?? 0).toBeLessThanOrEqual(HL10_MAX_PER_CELL);
    // 내용은 그대로여야 한다
    expect(marks(cell(container, 0, 1))).toEqual(['사과', '배']);
  });
});

// 지금 코드 실측값(설계서 §5 에 기록). 줄면 숫자를 낮춰도 된다.
const HL08_MAX_PER_CELL = 1; // 실측 1
const HL09_MAX_PER_CELL = 1; // [고침 C1] 실측 1 (orderBy 1번에 본문 1번 — 요청 합치기 + 바뀐 수식 없으면 재계산이 다시 안 그림. 테스트 설계서 §8-2 목표 ≤ 1 닿음) · T0 값 3
const HL10_MAX_PER_CELL = 2; // 실측 2 (손 뗀 뒤 본문을 2번 다시 그림)
