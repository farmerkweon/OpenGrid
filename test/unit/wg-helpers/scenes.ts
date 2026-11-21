/**
 * 넓은 그리드 새 그물 — 골든 DOM 장면 GD-01~GD-15 (테스트 설계서 §4-2).
 * 다른 레인이 같은 장면을 쓸 수 있게 장면마다 함수 하나(`sceneGD01()` …)와 표 `SCENES` 를 내보낸다.
 *
 * 공통(설계서 §4-2): jsdom, 컨테이너 1,200×640, 자료는 결정적(`r{행}c{컬럼}`), 테마 기본, 그린 뒤 3 틱.
 * jsdom 은 배치가 없으므로 크기를 두 군데에 주입한다.
 *   ① 컨테이너 getBoundingClientRect = 1,200×640 (기존 header-wrap.test.ts·widegrid-helpers 와 같은 방식 —
 *      지금 코드는 이것만 읽는다: RenderController.onResize/syncHeaderLayout/_visCount).
 *   ② 본문 상자(.og-body-wrapper) clientWidth/clientHeight/getBoundingClientRect = 1,200 × (640 − headerHeight).
 *      지금 코드는 읽지 않지만, 뒤 걸음(가로 창 길)이 읽기 시작해도 같은 장면이 같은 크기를 보게 하려고
 *      **처음부터** 깐다(ST-34 — 주입을 빼먹은 판을 막는 몫). HTMLElement.prototype 에 게터를 덧씌우고,
 *      .og-body-wrapper 가 아닌 요소는 원래 게터로 넘긴다. installSceneEnv() 가 돌려준 함수로 되돌린다.
 *
 * 설계서와 다르게 정한 것(문서 steps/T0/L18/NOTES.md 에 같은 글):
 *   - 「행 12개」와 「8컬럼 × 120」이 겹쳐 적혀 있다 → 자료 행 수는 장면 칸에 적힌 수(기본 120, GD-14 는 200)로 읽었다.
 *   - 푸터 합계·CF 는 숫자가 있어야 뜻이 있다 → GD-09·GD-10 만 c3(·c4) 를 숫자(`(r*37)%101`, `(r*53)%97`)로 둔다.
 *   - 묶음(GD-06·14)은 c0 이 그룹 열쇠이므로 c0 = 'A'/'B'/'C'(r%3).
 *   - CF 「글자색 규칙」: 지금 엔진은 규칙의 style(color) 칸을 칸에 칠하지 않는다(직렬화만). 글자색을 바꾸는 것은
 *     인코더의 inkColor 다 → 막대(c3) + 색 단계 scale(c4, 배경 + 잉크색)로 찍었다.
 */
import { OpenGrid } from '../../../src/core/OpenGrid.js';

export const SCENE_W = 1200;
export const SCENE_H = 640;
export const HEADER_H = 40;
export const ROW_H = 32;

export interface Scene {
  id: string;
  grid: OpenGrid<any>;
  container: HTMLElement;
  /** 빈 DOM 을 사진으로 찍지 않게 — 장면마다 최소값. */
  min: { rows: number; cells: number; text: number };
}

// ─── 환경 ───────────────────────────────────────────────────────────

let _envDepth = 0;
let _restore: (() => void) | null = null;

/**
 * ResizeObserver 자리 채움 + 본문 상자 크기 주입. 돌려준 함수로 되돌린다(중첩 호출 허용).
 * 본문 상자 높이는 그 그리드의 머리글 높이 옵션을 몰라도 되게 SCENE_H − HEADER_H 로 둔다
 * (모든 장면이 headerHeight 40 — 머리글이 늘어나는 GD-11·12 도 옵션 값은 40).
 */
export function installSceneEnv(bodyW = SCENE_W, bodyH = SCENE_H - HEADER_H): () => void {
  if (_envDepth++ === 0) {
    const g = globalThis as any;
    const prevRO = g.ResizeObserver;
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    const proto = HTMLElement.prototype as any;
    const own = (k: string) => Object.getOwnPropertyDescriptor(proto, k);
    const saved = { cw: own('clientWidth'), ch: own('clientHeight'), gbr: own('getBoundingClientRect') };
    const base = (k: 'clientWidth' | 'clientHeight') => Object.getOwnPropertyDescriptor(Element.prototype, k)!;
    const isBW = (el: any) => !!el?.classList?.contains?.('og-body-wrapper');
    Object.defineProperty(proto, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) { return isBW(this) ? bodyW : base('clientWidth').get!.call(this); },
    });
    Object.defineProperty(proto, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) { return isBW(this) ? bodyH : base('clientHeight').get!.call(this); },
    });
    const origGBR = Element.prototype.getBoundingClientRect;
    Object.defineProperty(proto, 'getBoundingClientRect', {
      configurable: true, writable: true,
      value(this: HTMLElement) {
        if (isBW(this)) {
          return { width: bodyW, height: bodyH, top: HEADER_H, left: 0, right: bodyW, bottom: HEADER_H + bodyH, x: 0, y: HEADER_H, toJSON() { return {}; } } as DOMRect;
        }
        return origGBR.call(this);
      },
    });
    _restore = () => {
      for (const [k, d] of [['clientWidth', saved.cw], ['clientHeight', saved.ch], ['getBoundingClientRect', saved.gbr]] as const) {
        if (d) Object.defineProperty(proto, k, d); else delete proto[k];
      }
      g.ResizeObserver = prevRO;
    };
  }
  return () => {
    if (--_envDepth === 0 && _restore) { _restore(); _restore = null; }
  };
}

/** 크기를 가진 컨테이너(①). */
export function makeSceneContainer(width = SCENE_W, height = SCENE_H): HTMLElement {
  const c = document.createElement('div');
  c.style.width = `${width}px`;
  c.style.height = `${height}px`;
  c.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() { return {}; },
  }) as DOMRect;
  document.body.appendChild(c);
  return c;
}

/** 한 틱 = 매크로태스크 + rAF + 매크로태스크. 설계서 「그린 뒤 FF 3 tick」을 실제 타이머 3 틱으로. */
export async function tick(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => requestAnimationFrame(() => r(undefined)));
    await new Promise(r => setTimeout(r, 0));
  }
}

/** 장면을 다 쓰고 나서 치운다(리스너·rAF 정리 + DOM 에서 뗌). */
export function disposeScene(s: { grid: OpenGrid<any>; container: HTMLElement }): void {
  try { s.grid.destroy(); } catch { /* 이미 치움 */ }
  s.container.remove();
}

// ─── 자료 ───────────────────────────────────────────────────────────

export function cols(n = 8, width = 120): Array<Record<string, any>> {
  return Array.from({ length: n }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width }));
}

export function rows(n: number, ncol = 8, patch?: (r: number, o: Record<string, any>) => void): Array<Record<string, any>> {
  return Array.from({ length: n }, (_, r) => {
    const o: Record<string, any> = {};
    for (let c = 0; c < ncol; c++) o[`c${c}`] = `r${r}c${c}`;
    patch?.(r, o);
    return o;
  });
}

const BASE_OPTS = { rowHeight: ROW_H, headerHeight: HEADER_H };

function mount(options: Record<string, any>, data: Array<Record<string, any>>): { grid: OpenGrid<any>; container: HTMLElement } {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, { ...BASE_OPTS, ...options } as any);
  grid.setData(data);
  return { grid, container };
}

function groupRowEls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.og-group-row'));
}

/**
 * 묶음 행 가운데 앞에서부터 k 개만 펼친다(지금 코드: 처음엔 모두 접힘, 묶음 행 click 이 펼침/접힘).
 * 앞 그룹을 먼저 펼치면 뒤 그룹 행이 그린 범위 밖으로 밀려 click 할 요소가 없다 → 뒤에서부터 펼친다.
 */
async function expandFirstGroups(container: HTMLElement, k: number): Promise<void> {
  for (let i = 0; i < k; i++) {
    const collapsed = groupRowEls(container).filter(el => el.getAttribute('aria-expanded') === 'false');
    const target = collapsed[k - 1 - i];
    if (!target) throw new Error('펼칠 묶음 행이 없다');
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(1);
  }
}

// ─── 장면 ───────────────────────────────────────────────────────────

const STD_MIN = { rows: 15, cells: 15 * 8, text: 15 * 8 * 4 };

/** GD-01 기본 — 8컬럼 × 120. */
export async function sceneGD01(): Promise<Scene> {
  const m = mount({ columns: cols() }, rows(120));
  await tick();
  return { id: 'GD-01', ...m, min: STD_MIN };
}

/** GD-02 여분 컬럼 전부 — 상태·끌기·행번호·체크·디테일 펼침 단추, 행 2 수정·행 5 추가. */
export async function sceneGD02(): Promise<Scene> {
  const m = mount({
    columns: cols(), editable: true,
    stateColumn: true, draggable: true, rowNumber: true, checkColumn: true,
    masterDetail: { enabled: true, height: 64, renderer: (row: any, host: HTMLElement) => { host.textContent = `detail ${row.c0}`; } },
  }, rows(120));
  m.grid.writeCell(2, 'c1', '수정됨');
  m.grid.insertRow({ c0: 'new-c0', c1: 'new-c1', c2: 'new-c2', c3: 'new-c3', c4: 'new-c4', c5: 'new-c5', c6: 'new-c6', c7: 'new-c7' }, 5);
  await tick();
  return { id: 'GD-02', ...m, min: STD_MIN };
}

/** GD-03 고정 컬럼 — frozenColumns 2 + rowNumber. */
export async function sceneGD03(): Promise<Scene> {
  const m = mount({ columns: cols(), frozenColumns: 2, rowNumber: true }, rows(120));
  await tick();
  return { id: 'GD-03', ...m, min: STD_MIN };
}

/** GD-04 가로 병합 — row0 c1 colSpan 3. */
export async function sceneGD04(): Promise<Scene> {
  const m = mount({ columns: cols() }, rows(120));
  m.grid.mergeCells([{ row: 0, col: 1, colSpan: 3 }]);
  await tick();
  return { id: 'GD-04', ...m, min: STD_MIN };
}

/** GD-05 세로 병합 — row1 c2 rowSpan 3. */
export async function sceneGD05(): Promise<Scene> {
  const m = mount({ columns: cols() }, rows(120));
  m.grid.mergeCells([{ row: 1, col: 2, rowSpan: 3 }]);
  await tick();
  return { id: 'GD-05', ...m, min: STD_MIN };
}

/** GD-06 묶음 — groupBy c0(3그룹), 하나 펼침. */
export async function sceneGD06(): Promise<Scene> {
  const m = mount({ columns: cols() }, rows(120, 8, (r, o) => { o.c0 = ['A', 'B', 'C'][r % 3]; }));
  m.grid.groupBy(['c0']);
  await tick();
  await expandFirstGroups(m.container, 1);
  await tick();
  return { id: 'GD-06', ...m, min: { rows: 15, cells: 15 * 8, text: 15 * 8 * 3 } };
}

/** GD-07 나무 — 2단(뿌리 12 × 자식 9), 전부 펼침. */
export async function sceneGD07(): Promise<Scene> {
  const data = rows(120, 8, (r, o) => {
    o.id = `n${r}`;
    o.pid = r % 10 === 0 ? null : `n${r - (r % 10)}`;
  });
  const m = mount({ columns: cols(), treeMode: 'flat', treeId: 'id', treeParentId: 'pid' }, data);
  m.grid.enableTree();
  m.grid.expandAllNodes();
  await tick();
  return { id: 'GD-07', ...m, min: STD_MIN };
}

/** GD-08 디테일 — 펼침 단추 컬럼 + 행 1 펼침. */
export async function sceneGD08(): Promise<Scene> {
  const m = mount({
    columns: cols(),
    masterDetail: { enabled: true, height: 64, renderer: (row: any, host: HTMLElement) => { host.textContent = `detail ${row.c0}`; } },
  }, rows(120));
  m.grid.expandRow(1);
  await tick();
  return { id: 'GD-08', ...m, min: STD_MIN };
}

/** GD-09 푸터 — [{label:'합계',colspan:3},{field:'c3',op:'sum'}], c3 숫자. */
export async function sceneGD09(): Promise<Scene> {
  const m = mount({
    columns: cols().map(c => (c.field === 'c3' ? { ...c, type: 'number' } : c)),
    footer: [{ label: '합계', colspan: 3 }, { field: 'c3', op: 'sum' }],
  }, rows(120, 8, (r, o) => { o.c3 = (r * 37) % 101; }));
  await tick();
  return { id: 'GD-09', ...m, min: { rows: 15, cells: 15 * 8, text: 15 * 7 * 4 } };
}

/** GD-10 CF — 막대(c3) + 색 단계(c4, 배경·잉크색). */
export async function sceneGD10(): Promise<Scene> {
  const m = mount({
    columns: cols().map(c => (c.field === 'c3' || c.field === 'c4' ? { ...c, type: 'number' } : c)),
  }, rows(120, 8, (r, o) => { o.c3 = (r * 37) % 101; o.c4 = (r * 53) % 97; }));
  // 찍는 시점 못 박기(L19, GD-10 흔들림): setData 가 예약한 스크롤 rAF 그리기(창 30행)를 먼저 끝낸 뒤 CF 를 건다.
  // 그러지 않으면 CF 지연 청크 import 가 rAF 보다 빨리 끝나는 때(같은 파일 두 번째·다른 파일이 청크를 먼저 실은 때)
  // rAF 그리기(30행)가 마지막이 되어 골든(CF 그리기 = visRange 59행이 마지막)과 달라진다. 기대 바이트는 그대로.
  // C7 뒤(그리는 범위가 세로 창 하나): 두 그리기가 같은 30행이라 경주가 없다 — 골든을 30행으로 다시 찍었고 못 박기 없는 판도 같다(wg-gd10-pinned). 이 줄은 해가 없어 둔다.
  await tick(1);
  await (m.grid as any).setConditionalFormat([
    { id: 'gd10-bar', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'c3' }, priority: 0 },
    { id: 'gd10-scale', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'scale', mode: 'discrete', bands: 5 }, scope: { columnId: 'c4' }, priority: 1 },
  ]);
  await tick();
  return { id: 'GD-10', ...m, min: { rows: 15, cells: 15 * 8, text: 15 * 6 * 4 } };
}

/** GD-11 줄바꿈 머리글 — c0 머리글 '긴 머리글\n둘째 줄' + c1 headerWrap. */
export async function sceneGD11(): Promise<Scene> {
  const cs = cols();
  cs[0] = { ...cs[0], header: '긴 머리글\n둘째 줄' };
  cs[1] = { ...cs[1], header: '아주 긴 머리글 글자가 줄바꿈되는 칸', headerWrap: true };
  const m = mount({ columns: cs }, rows(120));
  await tick();
  return { id: 'GD-11', ...m, min: STD_MIN };
}

/** GD-12 다단 머리글 — G1(c0,c1)·G2(c2~c4). */
export async function sceneGD12(): Promise<Scene> {
  const c = cols();
  const m = mount({
    columns: [
      { header: 'G1', children: [c[0], c[1]] },
      { header: 'G2', children: [c[2], c[3], c[4]] },
      c[5], c[6], c[7],
    ],
  }, rows(120));
  await tick();
  return { id: 'GD-12', ...m, min: STD_MIN };
}

/** GD-13 짧은 wrap 칸 — rowHeight 72, c1 wrap, 글 「가나다 라마바」. */
export async function sceneGD13(): Promise<Scene> {
  const cs = cols().map(c => (c.field === 'c1' ? { ...c, wrap: true } : c));
  const m = mount({ columns: cs, rowHeight: 72 }, rows(120, 8, (_r, o) => { o.c1 = '가나다 라마바'; }));
  await tick();
  return { id: 'GD-13', ...m, min: { rows: 8, cells: 8 * 8, text: 8 * 8 * 4 } };
}

/** GD-14 묶음 펼침 전 행 — 묶음 모드 200행, 두 그룹 펼침. */
export async function sceneGD14(): Promise<Scene> {
  const m = mount({ columns: cols() }, rows(200, 8, (r, o) => { o.c0 = ['A', 'B', 'C'][r % 3]; }));
  m.grid.groupBy(['c0']);
  await tick();
  await expandFirstGroups(m.container, 2);
  await tick();
  return { id: 'GD-14', ...m, min: { rows: 15, cells: 15 * 8, text: 15 * 8 * 3 } };
}

/** GD-15 필터·정렬 표시 머리글. */
export async function sceneGD15(): Promise<Scene> {
  const cs = cols().map(c => {
    if (c.field === 'c3') return { ...c, filterable: false };
    if (c.field === 'c5') return { ...c, sortable: false };
    return c;
  });
  const m = mount({ columns: cs, filterable: true }, rows(120));
  m.grid.setFilter('c1', [{ operator: 'contains', value: 'r1' } as any]);
  m.grid.orderBy([{ field: 'c2', dir: 'desc' }, { field: 'c4', dir: 'asc' }] as any);
  await tick();
  return { id: 'GD-15', ...m, min: { rows: 15, cells: 15 * 8, text: 15 * 8 * 4 } };
}

export const SCENES: Array<{ id: string; make: () => Promise<Scene> }> = [
  { id: 'GD-01', make: sceneGD01 }, { id: 'GD-02', make: sceneGD02 }, { id: 'GD-03', make: sceneGD03 },
  { id: 'GD-04', make: sceneGD04 }, { id: 'GD-05', make: sceneGD05 }, { id: 'GD-06', make: sceneGD06 },
  { id: 'GD-07', make: sceneGD07 }, { id: 'GD-08', make: sceneGD08 }, { id: 'GD-09', make: sceneGD09 },
  { id: 'GD-10', make: sceneGD10 }, { id: 'GD-11', make: sceneGD11 }, { id: 'GD-12', make: sceneGD12 },
  { id: 'GD-13', make: sceneGD13 }, { id: 'GD-14', make: sceneGD14 }, { id: 'GD-15', make: sceneGD15 },
];

/** 장면의 크기 — 행 수(.og-row + .og-group-row), 칸 수(role=gridcell), 칸 글자 수, 머리글 칸 수, 바이트. */
export function sceneStats(container: HTMLElement): { rows: number; cells: number; text: number; headerCells: number; footerCells: number; bytes: number } {
  const body = container.querySelector('.og-body');
  const cells = body ? Array.from(body.querySelectorAll('[role="gridcell"]')) : [];
  return {
    rows: body ? body.querySelectorAll('.og-row, .og-group-row').length : 0,
    cells: cells.length,
    text: cells.reduce((s, c) => s + (c.textContent ?? '').length, 0),
    headerCells: container.querySelectorAll('.og-header-cell').length,
    footerCells: container.querySelectorAll('.og-footer-bar *').length,
    bytes: Buffer.byteLength(container.innerHTML, 'utf8'),
  };
}
