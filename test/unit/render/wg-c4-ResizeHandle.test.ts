// 넓은 그리드 새 그물 — 걸음 C4 의 머리글 손잡이 몫(테스트 설계서 §2-27 U-RHB-06·07·14~19·H2·H3 · §17-3 U-RHB-34 · §17-11 U-RHB-35 · §2-26 U-HV-06).
// 놓은 뒤 따라오는 click 하나를 정렬로 넘기지 않고, 이웃 th 왼쪽 6px(앞 컬럼 손잡이)를 잡아도 앞 컬럼이 끌린다.
// 머리글 DOM 은 그대로여야 한다(맞는 영역은 머리글 위임 듣개의 입력 판정 — 새 요소·스타일 규칙 없음, 골든은 wg-golden-dom).
// jsdom 은 배치가 없어 MouseEvent.offsetX = clientX — 그래서 clientX 를 「th 왼쪽에서 잰 x」로 쓴다(각 th 폭 100).
import { describe, it, expect, beforeAll } from 'vitest';
import { installResizeObserverStub, makeGrid, settle, headerCellByText, mouse, pick } from '../widegrid-helpers.js';
import { HeaderView } from '../../../src/core/render/header/HeaderView.js';
import { RESIZE_HIT_HALF_PX } from '../../../src/core/domain/resize/ResizeHitZone.js';

beforeAll(() => installResizeObserverStub());

const COLS = [
  { field: 'k', header: 'K', width: 100 },
  { field: 'v', header: 'V', width: 100, resizable: false },
  { field: 'w', header: 'W', width: 100 },
  { field: 'x', header: 'X', width: 100 },
];
const DATA = [{ k: 'b', v: 1, w: 'x', x: 3 }, { k: 'c', v: 2, w: 'y', x: 1 }, { k: 'a', v: 3, w: 'z', x: 2 }];

const handleOf = (c: HTMLElement, h: string) => headerCellByText(c, h).querySelector<HTMLElement>('.og-resize-handle');
const R = (g: any) => g._renderer;

async function setup() {
  const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
  await settle();
  const sorts: any[] = [];
  grid.on('sortChange', (e: any) => sorts.push(e));
  const commits: Array<[number, number]> = [];
  const cbs = R(grid)._cbs;
  const orig = cbs.onColResize;
  cbs.onColResize = (ci: number, w: number) => { commits.push([ci, w]); orig(ci, w); };
  return { grid, container, sorts, commits };
}
function dragHandle(handle: HTMLElement, dx: number) {
  mouse(handle, 'mousedown', { clientX: 100 });
  if (dx) mouse(document, 'mousemove', { clientX: 100 + dx });
  mouse(document, 'mouseup', { clientX: 100 + dx });
}

describe('C4 — 놓은 뒤 click 삼키기', () => {
  it('U-RHB-06 0px 놓기 — commit 0 · 따라오는 click 은 정렬 안 됨(RZ-07)', async () => {
    const s = await setup();
    const th = headerCellByText(s.container, 'K');
    dragHandle(handleOf(s.container, 'K')!, 0);
    mouse(th, 'click');
    expect(s.commits).toEqual([]);
    expect(s.sorts.length).toBe(0);
    expect(pick(s.grid.getData(), 'k')).toEqual(['b', 'c', 'a']);
  });

  it('U-RHB-07 click 은 하나만 삼킴 — 끌어 놓기 → click(삼킴) → click(정렬)(RU-05 의 같은 작업판)', async () => {
    const s = await setup();
    dragHandle(handleOf(s.container, 'K')!, 30);
    expect(s.commits.length).toBe(1);
    mouse(headerCellByText(s.container, 'K'), 'click');
    expect(s.sorts.length).toBe(0);
    mouse(headerCellByText(s.container, 'K'), 'click');
    expect(s.sorts.length).toBe(1);
    expect(pick(s.grid.getData(), 'k')).toEqual(['a', 'b', 'c']);
  });

  it('U-RHB-18 손잡이에 합성 click(누름 없음) — 정렬 안 됨(RU-02)', async () => {
    const s = await setup();
    mouse(handleOf(s.container, 'K')!, 'click');
    expect(s.sorts.length).toBe(0);
  });

  it('U-RHB-19 · U-RHB-34 머리글 밖에서 놓음(click 안 옴) → 다음 프레임 뒤 다른 머리글 click 은 정렬됨', async () => {
    const s = await setup();
    dragHandle(handleOf(s.container, 'K')!, 30);   // mouseup 은 document 에 — 머리글 click 은 안 옴
    await settle();                                 // 놓은 뒤 다음 rAF 에 「놓음」이 끝남
    const w = headerCellByText(s.container, 'W');
    mouse(w, 'mousedown', { clientX: 500, offsetX: 50 } as any);
    mouse(w, 'mouseup', { clientX: 500 });
    mouse(w, 'click', { clientX: 500 });
    expect(s.sorts.length).toBe(1);
  });

  it('U-RHB-35 놓은 뒤 rAF 한 번 → expireSwallow 1번 (같은 작업의 click 은 삼킴, rAF 뒤 click 은 정렬)', async () => {
    const s = await setup();
    const g = R(s.grid)._resize._gesture;
    let expired = 0;
    const orig = g.expireSwallow.bind(g);
    g.expireSwallow = () => { expired++; orig(); };
    dragHandle(handleOf(s.container, 'K')!, 30);
    expect(expired).toBe(0);
    await new Promise(r => requestAnimationFrame(() => r(undefined)));
    expect(expired).toBe(1);
    mouse(headerCellByText(s.container, 'K'), 'click');
    expect(s.sorts.length).toBe(1);
  });
});

describe('C4 — 이웃 th 왼쪽 6px 「앞 컬럼 손잡이」', () => {
  it('U-RHB-14 · U-RHB-H2 컬럼 X 의 왼쪽 6px 에서 누르고 끌면 앞 컬럼(W) 이 끌린다', async () => {
    const s = await setup();
    const x = headerCellByText(s.container, 'X');
    mouse(x, 'mousedown', { clientX: 3 });          // jsdom: offsetX = clientX (배치 없음) — 3 < 6
    mouse(document, 'mousemove', { clientX: 43 });
    mouse(document, 'mouseup', { clientX: 43 });
    expect(s.commits.length).toBe(1);
    expect(s.commits[0]![0]).toBe(2);                // W 의 잎 번호(K0·V1·W2·X3)
  });

  it('U-RHB-15 앞 컬럼 손잡이 자리 click(움직임 없음) — 정렬 안 됨', async () => {
    const s = await setup();
    const x = headerCellByText(s.container, 'X');
    mouse(x, 'mousedown', { clientX: 2 });
    mouse(x, 'mouseup', { clientX: 2 });
    mouse(x, 'click', { clientX: 2 });
    expect(s.sorts.length).toBe(0);
    expect(s.commits).toEqual([]);
  });

  it('U-RHB-H3 손잡이 밖(왼쪽 6px 바깥)에서 누름 — 끌기 아님, click 은 정렬됨', async () => {
    const s = await setup();
    const x = headerCellByText(s.container, 'X');
    mouse(x, 'mousedown', { clientX: RESIZE_HIT_HALF_PX + 1 });  // 경계에서 7px — 밖
    mouse(document, 'mousemove', { clientX: 80 });
    mouse(x, 'mouseup', { clientX: 80 });
    mouse(x, 'click', { clientX: 80 });
    expect(s.commits).toEqual([]);
    expect(s.sorts.length).toBe(1);
  });

  it('U-RHB-16 첫 잎 컬럼(앞은 여분 th) — 앞 컬럼 손잡이 없음', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true, rowNumber: true }, DATA);
    await settle();
    let n = 0; grid.on('sortChange', () => n++);
    const commits: number[] = [];
    const cbs = R(grid)._cbs; const o = cbs.onColResize; cbs.onColResize = (ci: number, w: number) => { commits.push(ci); o(ci, w); };
    const k = headerCellByText(container, 'K');
    mouse(k, 'mousedown', { clientX: 1 });
    mouse(document, 'mousemove', { clientX: 41 });
    mouse(k, 'mouseup', { clientX: 41 });
    mouse(k, 'click', { clientX: 41 });
    expect(commits).toEqual([]);
    expect(n).toBe(1);
  });

  it('U-RHB-17 resizable:false 컬럼(V) — 자기 손잡이 없음 · 뒤 컬럼(W) 의 앞 컬럼 손잡이도 없음', async () => {
    const s = await setup();
    expect(handleOf(s.container, 'V')).toBeNull();
    const w = headerCellByText(s.container, 'W');
    mouse(w, 'mousedown', { clientX: 1 });
    mouse(document, 'mousemove', { clientX: 61 });
    mouse(w, 'mouseup', { clientX: 61 });
    mouse(w, 'click', { clientX: 61 });
    expect(s.commits).toEqual([]);
    expect(s.sorts.length).toBe(1);
  });

  it('C4-HV-a 머리글 DOM 에 새 요소·클래스 없음 — th 안 손잡이는 지금처럼 하나뿐', async () => {
    const s = await setup();
    const ths = Array.from(s.container.querySelectorAll<HTMLElement>('.og-header-table th'));
    for (const th of ths) expect(th.querySelectorAll('.og-resize-handle').length).toBeLessThanOrEqual(1);
    expect(s.container.querySelector('.og-header-table')!.innerHTML).not.toMatch(/lead|grip/i);
  });
});

describe('C4 — 입력 판정 손잡이 영역(총괄 판정: CSS 가상 요소 대신)', () => {
  it('C4-HZ-a 오른쪽 경계 영역 — 손잡이 요소(4px) 밖이어도 경계에서 6px 안이면 그 컬럼(W) 이 끌림', async () => {
    const s = await setup();
    const w = headerCellByText(s.container, 'W');
    mouse(w, 'mousedown', { clientX: 94 });          // 폭 100, 오른쪽 경계까지 6
    mouse(document, 'mousemove', { clientX: 134 });
    mouse(document, 'mouseup', { clientX: 134 });
    mouse(w, 'click', { clientX: 134 });
    expect(s.commits.length).toBe(1);
    expect(s.commits[0]![0]).toBe(2);
    expect(s.sorts.length).toBe(0);
  });

  it('C4-HZ-b 커서 — 영역 위 mousemove 면 그 th 인라인 cursor col-resize, 벗어나면 원래 값(pointer)으로 · 머리글 나가면 되돌림', async () => {
    const s = await setup();
    const x = headerCellByText(s.container, 'X');
    const before = x.style.cursor;
    expect(before).toBe('pointer');
    mouse(x, 'mousemove', { clientX: 3 });
    expect(x.style.cursor).toBe('col-resize');
    mouse(x, 'mousemove', { clientX: 50 });
    expect(x.style.cursor).toBe(before);
    mouse(x, 'mousemove', { clientX: 97 });
    expect(x.style.cursor).toBe('col-resize');
    const header = s.container.querySelector('.og-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    expect(x.style.cursor).toBe(before);
  });

  it('C4-HZ-c 고정 칸 경계 — 고정 컬럼(K·V 고정 2) 다음 칸 W 의 왼쪽은 V 가 끌 수 없어 손잡이 아님, X 의 왼쪽은 W', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true, frozenColumns: 2 }, DATA);
    await settle();
    const commits: number[] = [];
    const cbs = R(grid)._cbs; const o = cbs.onColResize; cbs.onColResize = (ci: number, w: number) => { commits.push(ci); o(ci, w); };
    const x = headerCellByText(container, 'X');
    mouse(x, 'mousedown', { clientX: 2 });
    mouse(document, 'mousemove', { clientX: 42 });
    mouse(document, 'mouseup', { clientX: 42 });
    expect(commits).toEqual([2]);
    grid.destroy();
  });

  it('C4-HZ-d 묶음 머리글 — 아래 줄 잎 칸 경계는 손잡이 영역 · 묶음 칸(colspan) 안에서는 입력 판정 안 함(옛 손잡이 요소만)', async () => {
    const cols = [{ header: 'G', children: [{ field: 'a', header: 'A', width: 100 }, { field: 'b', header: 'B', width: 100 }] }, { field: 'c', header: 'C', width: 100 }];
    const { grid, container } = makeGrid({ columns: cols, sortable: true }, [{ a: 1, b: 2, c: 3 }]);
    await settle();
    const commits: number[] = [];
    const cbs = R(grid)._cbs; const o = cbs.onColResize; cbs.onColResize = (ci: number, w: number) => { commits.push(ci); o(ci, w); };
    const b = headerCellByText(container, 'B');
    mouse(b, 'mousedown', { clientX: 1 });           // B 의 왼쪽 = A 의 손잡이
    mouse(document, 'mousemove', { clientX: 41 });
    mouse(document, 'mouseup', { clientX: 41 });
    expect(commits).toEqual([0]);
    await settle();
    const g = headerCellByText(container, 'G');
    mouse(g, 'mousedown', { clientX: 99 });           // 묶음 칸 — 입력 판정 대상 아님
    mouse(document, 'mouseup', { clientX: 99 });
    expect(commits).toEqual([0]);
    grid.destroy();
  });

  it('C4-HZ-e 머리글 축 플러그인(정렬 가능 칸 모양을 바꾸는 머리글 프리셋)에서도 같은 판정', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    // 머리글 축 프리셋은 컨테이너 속성(data-og-header)으로 CSS 를 켠다 — 판정은 DOM 구조만 보므로 속성이 붙어도 같아야 한다
    (container.querySelector('.og-container') ?? container).setAttribute('data-og-header', 'pill');
    const commits: number[] = [];
    const cbs = R(grid)._cbs; const o = cbs.onColResize; cbs.onColResize = (ci: number, w: number) => { commits.push(ci); o(ci, w); };
    const x = headerCellByText(container, 'X');
    mouse(x, 'mousedown', { clientX: 4 });
    mouse(document, 'mousemove', { clientX: 44 });
    mouse(document, 'mouseup', { clientX: 44 });
    expect(commits).toEqual([2]);
    grid.destroy();
  });
});

describe('C4 — 정렬 표시 객체 묶음(SORT 요청)', () => {
  it('C4-HV-c 다시 그릴 때 release 1번 뒤 잎 th 마다 bind(field, sortable) — 묶음 칸·여분 칸은 안 묶음, 머리글 DOM 그대로', async () => {
    const cols = [{ header: 'G', children: [{ field: 'a', header: 'A', width: 100 }, { field: 'b', header: 'B', width: 100, sortable: false }] }, { field: 'c', header: 'C', width: 100 }];
    const { grid, container } = makeGrid({ columns: cols, sortable: true, rowNumber: true }, [{ a: 1, b: 2, c: 3 }]);
    await settle();
    const hv = R(grid)._headerView;
    const calls: string[] = [];
    hv.setSortIndicator({
      bind: (th: HTMLElement, field: string, sortable: boolean) => { calls.push(`bind:${field}:${sortable}:${th.tagName}`); },
      update: () => {}, setPressed: () => {}, setBusy: () => {},
      release: () => { calls.push('release'); },
    });
    const before = container.querySelector('.og-header')!.innerHTML;
    (grid as any)._renderHeader();
    expect(calls[0]).toBe('release');
    expect(calls.slice(1).sort()).toEqual(['bind:a:true:TH', 'bind:b:false:TH', 'bind:c:true:TH']);
    expect(container.querySelector('.og-header')!.innerHTML).toBe(before);
    grid.destroy();
  });
});

describe('C4 — HeaderView.destroy (U-HV-06)', () => {
  it('U-HV-06 destroy 뒤 th 에 click·keydown → 머리글 콜백 0', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const r = R(grid);
    const hv: HeaderView = r._headerView;
    const th = container.querySelector('th.og-sortable') as HTMLElement;
    let calls = 0;
    r._cbs.onHeaderClick = () => { calls++; };
    hv.destroy();
    th.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    th.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(calls).toBe(0);
    grid.destroy();
  });

  it('C4-HV-b 다시 그린 뒤 옛 th 의 리스너는 죽음 — 옛 th click 은 콜백 0, 새 th click 은 1', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const r = R(grid);
    const oldTh = container.querySelector('th.og-sortable') as HTMLElement;
    let calls = 0;
    r._cbs.onHeaderClick = () => { calls++; };
    (grid as any)._renderHeader();
    oldTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(calls).toBe(0);
    (container.querySelector('th.og-sortable') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(calls).toBe(1);
    grid.destroy();
  });
});
