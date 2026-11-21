/**
 * 「몇 번 그렸나」 세는 수단 — 테스트 설계서 TEST_DESIGN_NEW.md §0-5 · §3 NR 판정 수단(TR-03).
 *
 * 판정용(구현에 기대지 않는 셋):
 *   ② 사용자 렌더러 호출 수 — 공개 수단 OpenGrid.registerRenderer 로 등록한 렌더러가 부를 때마다 쌓는다.
 *   ③ 본문·머리글 MutationObserver childList 추가·제거 노드 수 (style 속성 변경은 따로 셈).
 *   ④ 머리글 th 요소 동일성(===) — WeakSet 에 넣어 두고 나중에 같은 요소인지 본다.
 *   (+) 푸터 사용자 summaryOp 호출 수 — 공개 수단 grid.override.strategy('summaryOp', fn).
 * 진단용(보조 — 어느 길이 불렸나 기록만):
 *   ① GridRenderer.prototype.renderBody / renderHeader 감싸기 호출 수.
 *
 * 이 파일은 L19(T0) 소유. jsdom 전용(배치가 없으므로 bodyWrap 크기·스크롤 값은 주입한다).
 */
import { vi, type MockInstance } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { GridRenderer } from '../../../src/core/GridRenderer.js';
import { makeContainer } from '../widegrid-helpers.js';

/** 등록 이름 — 이 렌더러를 쓴 컬럼의 칸이 그려질 때마다 rendererLog 에 쌓인다. */
export const COUNT_RENDERER = 'wg-nr-count';
export const rendererLog: Array<{ ri: number; field: string }> = [];
let registered = false;

/** 세는 렌더러를 한 번만 등록한다(전역 등록부). 내용은 글자 하나 담은 span — 사용자 렌더러의 가장 흔한 꼴. */
export function registerCountRenderer(): void {
  if (registered) return;
  registered = true;
  OpenGrid.registerRenderer(COUNT_RENDERER, () => ({
    render: (ctx: any) => {
      rendererLog.push({ ri: ctx.rowIndex, field: ctx.column?.field });
      const s = document.createElement('span');
      s.className = 'wg-nr-r';
      s.textContent = ctx.value == null ? '' : String(ctx.value);
      return s;
    },
  }) as any);
}

export interface Counts {
  /** ② 사용자 렌더러 호출 수 */
  renderer: number;
  /** ② 칸별 호출 수의 최댓값(같은 칸이 몇 번 불렸나) */
  rendererMaxPerCell: number;
  /** ③ 본문 childList 추가 노드 수 / 제거 노드 수 */
  bodyAdded: number;
  bodyRemoved: number;
  /** ③ 본문에 붙은 노드를 자손까지 센 수(조각 하나로 붙이면 childList 기록은 행 수뿐이라 칸 수는 이것으로 본다) */
  bodyAddedDeep: number;
  /** 본문 style·class 속성 변경 기록 수(허용 — 따로 셈) */
  bodyAttr: number;
  /** ③ 머리글 childList 추가 / 제거 */
  headerAdded: number;
  headerRemoved: number;
  /** ① 진단 — 프로토타입 감싸기 */
  renderBody: number;
  renderHeader: number;
  /** 푸터 사용자 summaryOp 호출 수 */
  summaryOp: number;
}

/**
 * 한 그리드에 붙는 계수기 묶음. reset() 뒤의 조작만 센다.
 * 쓰는 법: const c = new NrCounters(grid, container); c.reset(); <조작>; await settle(); const n = c.read();
 */
export class NrCounters {
  private _bodyMo: MutationObserver;
  private _headMo: MutationObserver;
  private _bodyAdded = 0; private _bodyRemoved = 0; private _bodyAttr = 0; private _bodyDeep = 0;
  private _headAdded = 0; private _headRemoved = 0;
  private _rbSpy: MockInstance;
  private _rhSpy: MockInstance;
  private _rb0 = 0; private _rh0 = 0;
  private _log0 = 0;
  private _thSeen = new WeakSet<Element>();
  summaryOpCalls = 0;
  private _sum0 = 0;
  readonly body: HTMLElement;
  readonly header: HTMLElement;

  constructor(readonly grid: OpenGrid<any>, readonly container: HTMLElement) {
    const body = container.querySelector<HTMLElement>('.og-body');
    const header = container.querySelector<HTMLElement>('.og-header');
    if (!body || !header) throw new Error('NrCounters: .og-body / .og-header 를 못 찾음');
    this.body = body; this.header = header;
    this._bodyMo = new MutationObserver(recs => this._eatBody(recs));
    this._bodyMo.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    this._headMo = new MutationObserver(recs => this._eatHead(recs));
    this._headMo.observe(header, { childList: true, subtree: true });
    // 같은 프로토타입을 여러 계수기가 감싸도 되게, 이미 감싼 것이면 그대로 쓴다.
    this._rbSpy = isSpy(GridRenderer.prototype.renderBody)
      ? (GridRenderer.prototype.renderBody as any) : vi.spyOn(GridRenderer.prototype, 'renderBody');
    this._rhSpy = isSpy(GridRenderer.prototype.renderHeader)
      ? (GridRenderer.prototype.renderHeader as any) : vi.spyOn(GridRenderer.prototype, 'renderHeader');
    // 푸터 계산 세기: 사용자 summaryOp 가 null 을 돌려주면 기본 계산으로 넘어간다(동작 불변).
    (grid as any).override.strategy('summaryOp', () => { this.summaryOpCalls++; return null; });
  }

  private _eatBody(recs: MutationRecord[]): void {
    for (const r of recs) {
      if (r.type === 'childList') {
        this._bodyAdded += r.addedNodes.length; this._bodyRemoved += r.removedNodes.length;
        for (const n of Array.from(r.addedNodes)) this._bodyDeep += 1 + ((n as Element).querySelectorAll ? (n as Element).querySelectorAll('*').length : 0);
      }
      else this._bodyAttr++;
    }
  }
  private _eatHead(recs: MutationRecord[]): void {
    for (const r of recs) { this._headAdded += r.addedNodes.length; this._headRemoved += r.removedNodes.length; }
  }

  /** 지금까지 쌓인 것을 버리고 0 부터 센다. 머리글 th 도 지금 것을 「본 것」으로 등록한다. */
  reset(): void {
    this._eatBody(this._bodyMo.takeRecords());
    this._eatHead(this._headMo.takeRecords());
    this._bodyAdded = this._bodyRemoved = this._bodyAttr = this._bodyDeep = 0;
    this._headAdded = this._headRemoved = 0;
    this._rb0 = this._rbSpy.mock.calls.length;
    this._rh0 = this._rhSpy.mock.calls.length;
    this._log0 = rendererLog.length;
    this._sum0 = this.summaryOpCalls;
    this.markHeader();
  }

  /** 지금 머리글의 th 를 모두 「본 것」으로 등록한다(④). */
  markHeader(): void {
    for (const th of Array.from(this.header.querySelectorAll('th'))) this._thSeen.add(th);
  }

  /** ④ 지금 머리글 th 가운데 reset/markHeader 때와 같은 요소 수 / 전체 수. */
  headerIdentity(): { same: number; total: number } {
    const ths = Array.from(this.header.querySelectorAll('th'));
    return { same: ths.filter(t => this._thSeen.has(t)).length, total: ths.length };
  }

  read(): Counts {
    this._eatBody(this._bodyMo.takeRecords());
    this._eatHead(this._headMo.takeRecords());
    const per = new Map<string, number>();
    for (const e of rendererLog.slice(this._log0)) {
      const k = `${e.ri}:${e.field}`;
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    return {
      renderer: rendererLog.length - this._log0,
      rendererMaxPerCell: per.size ? Math.max(...per.values()) : 0,
      bodyAdded: this._bodyAdded, bodyRemoved: this._bodyRemoved, bodyAddedDeep: this._bodyDeep, bodyAttr: this._bodyAttr,
      headerAdded: this._headAdded, headerRemoved: this._headRemoved,
      renderBody: this._rbSpy.mock.calls.length - this._rb0,
      renderHeader: this._rhSpy.mock.calls.length - this._rh0,
      summaryOp: this.summaryOpCalls - this._sum0,
    };
  }

  dispose(): void {
    this._bodyMo.disconnect();
    this._headMo.disconnect();
  }
}

function isSpy(fn: any): boolean {
  return !!fn && typeof fn === 'function' && !!fn.mock && typeof fn.mockRestore === 'function';
}

/**
 * bodyWrap 에 크기·스크롤 값을 준다(jsdom 은 배치가 없어 늘 0 — 테스트 설계서 §2-23).
 * 돌려준 객체로 scrollTop/scrollLeft 를 바꾸고 scroll 이벤트를 낸다.
 */
export function injectBodyWrap(container: HTMLElement, w = 1200, h = 640): {
  el: HTMLElement;
  scrollTo(top: number | null, left: number | null): void;
} {
  const el = container.querySelector<HTMLElement>('.og-body-wrapper');
  if (!el) throw new Error('injectBodyWrap: .og-body-wrapper 를 못 찾음');
  let st = 0, sl = 0;
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => h });
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => h });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => st, set: (v: number) => { st = v; } });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => sl, set: (v: number) => { sl = v; } });
  return {
    el,
    scrollTo(top, left) {
      if (top != null) st = top;
      if (left != null) sl = left;
      el.dispatchEvent(new Event('scroll'));
    },
  };
}

/** 프레임 셋을 넘긴다(테스트 설계서의 「FF 3 tick」에 해당 — 지금 코드는 진짜 rAF 를 쓰므로 실제 프레임을 기다린다). */
export async function frames(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => (globalThis.requestAnimationFrame ?? ((f: any) => setTimeout(f, 16)))(r as any));
  }
  await new Promise(r => setTimeout(r, 0));
}

// ─── NR 장면과 조작 ───────────────────────────────────────────
/*
 * W 장면: 1,000행 × 50컬럼(c0..c49, 폭 120), 짝수 컬럼은 세는 렌더러(COUNT_RENDERER), 홀수 컬럼은 내장 글자 칸.
 * 컨테이너 1,200×640, 정렬 켬. 만든 뒤 bodyWrap 에 1,200×640 과 스크롤 값을 주입한다(§2-23).
 * 값은 `r{행}c{열}` — 결정적. L18 장면(test/unit/wg-helpers/scenes.ts, L18 소유)과는 따로 둔다.
 */
export interface WScene {
  grid: OpenGrid<any>;
  container: HTMLElement;
  c: NrCounters;
  wrap: ReturnType<typeof injectBodyWrap>;
  rows: number;
  cols: number;
}

export function wColumns(cols: number, rendererEvery = 2, extra: Record<number, any> = {}): any[] {
  return Array.from({ length: cols }, (_, i) => ({
    field: `c${i}`, header: `H${i}`, width: 120,
    ...(rendererEvery > 0 && i % rendererEvery === 0 ? { renderer: COUNT_RENDERER } : {}),
    ...(extra[i] ?? {}),
  }));
}

export function wRows(rows: number, cols: number): Array<Record<string, any>> {
  return Array.from({ length: rows }, (_, r) => {
    const o: Record<string, any> = {};
    for (let c = 0; c < cols; c++) o[`c${c}`] = `r${r}c${c}`;
    return o;
  });
}

export async function mkW(opts: {
  rows?: number; cols?: number; rendererEvery?: number; options?: Record<string, any>;
  data?: Array<Record<string, any>>; columns?: any[];
} = {}): Promise<WScene> {
  registerCountRenderer();
  const rows = opts.rows ?? 1000;
  const cols = opts.cols ?? 50;
  const container = makeContainer(1200, 640);
  const grid = new OpenGrid<any>(container, {
    columns: opts.columns ?? wColumns(cols, opts.rendererEvery ?? 2),
    sortable: true,
    ...(opts.options ?? {}),
  } as any);
  const wrap = injectBodyWrap(container, 1200, 640);
  const c = new NrCounters(grid, container);
  grid.setData(opts.data ?? wRows(rows, cols));
  await frames(3);
  c.reset();
  return { grid, container, c, wrap, rows, cols };
}

export function disposeW(s: WScene): void {
  s.c.dispose();
  try { s.grid.destroy(); } catch { /* 이미 정리됨 */ }
  s.container.remove();
}

/** 머리글 잎 칸(보이는 제목 글자로) */
export function th(container: HTMLElement, text: string): HTMLElement {
  const ths = Array.from(container.querySelectorAll<HTMLElement>('.og-header-cell'));
  const t = ths.find(x => (x.querySelector('span')?.textContent ?? '').trim() === text);
  if (!t) throw new Error(`header ${text} not found`);
  return t;
}

export function fire(target: EventTarget, type: string, init: Partial<MouseEventInit> = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 손잡이를 눌러 steps 걸음 끈다(놓지 않음). 돌려준 release() 로 놓는다. */
export function dragHandle(container: HTMLElement, headerText: string, dx: number, steps: number): { release: () => void } {
  const handle = th(container, headerText).querySelector('.og-resize-handle');
  if (!handle) throw new Error('resize handle not found');
  const x0 = 100;
  fire(handle, 'mousedown', { clientX: x0 });
  for (let i = 1; i <= steps; i++) fire(document, 'mousemove', { clientX: x0 + Math.round((dx * i) / steps) });
  return { release: () => fire(document, 'mouseup', { clientX: x0 + dx }) };
}

export function bodyCell(container: HTMLElement, ri: number, ci: number): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[role="row"][aria-rowindex="${ri + 1}"] [role="gridcell"][aria-colindex="${ci + 1}"]`);
  if (!el) throw new Error(`cell ${ri},${ci} not found`);
  return el;
}

/** 본문 노드 수 — 전체 / 사용자 렌더러가 만든 요소(.wg-nr-r 과 그 자손)를 뺀 수(검토 M5). */
export function bodyNodeCount(body: HTMLElement): { all: number; withoutRenderer: number; cells: number } {
  const all = body.querySelectorAll('*').length;
  const rendererMade = body.querySelectorAll('.wg-nr-r, .wg-nr-r *').length;
  const cells = body.querySelectorAll('[role="gridcell"]').length;
  return { all, withoutRenderer: all - rendererMade, cells };
}
