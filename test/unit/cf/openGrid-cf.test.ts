// ============================================================
// DD-05 S2c-1 CF 코어 배선 — OpenGrid ↔ cf/ 엔진 ↔ CFRenderBridge 왕복(jsdom).
// setConditionalFormat 로 데이터바/히트맵/아이콘셋이 실제 셀 DOM 에 칠해지는지, 그리고 미설정 시
// byte-identical(og-cf-* 부재)·해제 시 잔재 제거·재렌더 시 중복 미적층을 검증한다.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid';
import type { CFRule } from '../../../src/core/cf/index.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  const grid = new OpenGrid(container, {
    columns: [
      { field: 'name', header: '이름', width: 120 },
      { field: 'amount', header: '금액', width: 120, type: 'number' },
    ],
    height: 400,
    ...extraOpts,
  });
  return { grid, container };
}

const sample = [
  { name: 'A', amount: 0 },
  { name: 'B', amount: 50 },
  { name: 'C', amount: 100 },
];

/** jsdom 은 실레이아웃이 없어 _onResize 가 조기 return → 셀 DOM 이 지연된다. 동기 강제 렌더. */
function renderNow(grid: OpenGrid<any>): void {
  (grid as any)._doRender(...(grid as any)._visRange());
}

function cellEl(grid: OpenGrid<any>, ri: number, ci: number): HTMLElement {
  const el = (grid as any)._renderer.getCellEl(ri, ci);
  if (!el) throw new Error(`cell (${ri},${ci}) not rendered`);
  return el;
}

// amount 컬럼(index 1) 에 데이터바(0기준) — compare>=min 은 전 행 발화.
const barRule: CFRule = {
  id: 'bar', when: { type: 'compare', op: '>=', a: 0 },
  encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'amount' }, priority: 0,
};
// 히트맵(scale) — 연속/이산 채움.
const scaleRule: CFRule = {
  id: 'hm', when: { type: 'compare', op: '>=', a: 0 },
  encode: { kind: 'scale', mode: 'discrete', bands: 5 }, scope: { columnId: 'amount' }, priority: 0,
};
// 아이콘셋 — 색+형태 이중부호화.
const iconRule: CFRule = {
  id: 'ic', when: { type: 'compare', op: '>=', a: 0 },
  encode: { kind: 'icon', setId: 'arrows', steps: 3 }, scope: { columnId: 'amount' }, priority: 0,
};

describe('DD-05 S2c-1 CF 코어 배선 — 데이터바', () => {
  it('데이터바 규칙 → 셀에 .og-cf-bar 존재·width 비율 반영·inkColor 적용', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    await grid.setConditionalFormat([barRule]);
    renderNow(grid);

    // amount=100(최대) 셀 → ratio 1 → width == cellW(셀 폭).
    const top = cellEl(grid, 2, 1);
    const bar = top.querySelector('.og-cf-bar') as HTMLElement;
    expect(bar).toBeTruthy();
    const cellW = parseFloat(top.style.width);
    expect(cellW).toBeGreaterThan(0);
    expect(parseFloat(bar.style.width)).toBeCloseTo(cellW, 5); // ratio 1 → 전체 폭
    // 채움 위 텍스트 잉크(AA 결과) 가 셀 color 로 적용.
    expect(top.style.color).toBeTruthy();

    // amount=50 → ratio 0.5 → width 절반.
    const mid = cellEl(grid, 1, 1);
    const midBar = mid.querySelector('.og-cf-bar') as HTMLElement;
    expect(parseFloat(midBar.style.width)).toBeCloseTo(cellW / 2, 5);
  });
});

describe('DD-05 S2c-1 CF 코어 배선 — 히트맵(scale)', () => {
  it('히트맵 규칙 → 셀 backgroundColor 적용', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    await grid.setConditionalFormat([scaleRule]);
    renderNow(grid);

    const top = cellEl(grid, 2, 1);
    expect(top.style.backgroundColor).toBeTruthy();
    // scale 은 막대가 아니라 전체 채움 → .og-cf-bar 없음.
    expect(top.querySelector('.og-cf-bar')).toBeNull();
  });
});

describe('DD-05 S2c-1 CF 코어 배선 — 아이콘셋(색+형태)', () => {
  it('아이콘셋 규칙 → .og-cf-icon 존재·shape 글리프·tint 색', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    await grid.setConditionalFormat([iconRule]);
    renderNow(grid);

    // 최대(100) → 상위 형태(▲), 최소(0) → 하위 형태(▼) — 형태만으로 상/하위 판독.
    const top = cellEl(grid, 2, 1);
    const bot = cellEl(grid, 0, 1);
    const topIcon = top.querySelector('.og-cf-icon') as HTMLElement;
    const botIcon = bot.querySelector('.og-cf-icon') as HTMLElement;
    expect(topIcon).toBeTruthy();
    expect(botIcon).toBeTruthy();
    expect(topIcon.textContent).toBe('▲');
    expect(botIcon.textContent).toBe('▼');
    // tint 색이 아이콘에 적용(색 부호), 형태와 독립.
    expect(topIcon.style.color).toBeTruthy();
    expect(topIcon.textContent).not.toBe(botIcon.textContent);
  });
});

describe('DD-05 S2c-1 CF 코어 배선 — 접근성 텍스트 쌍둥이', () => {
  it('ariaSummary 가 셀 aria-label 에 반영', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    await grid.setConditionalFormat([barRule]);
    renderNow(grid);

    const top = cellEl(grid, 2, 1);
    const label = top.getAttribute('aria-label') ?? '';
    // 기존 라벨(헤더: 값) 유지 + CF 요약(막대/값) append.
    expect(label).toContain('금액');
    expect(label).toContain('막대');
  });
});

describe('DD-05 S2c-1 CF 코어 배선 — additive(byte-identical)·해제·재렌더 안전', () => {
  it('CF 미설정 → 셀에 og-cf-* 없음(byte-identical)', () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    renderNow(grid);
    const top = cellEl(grid, 2, 1);
    expect(top.querySelector('.og-cf-bar')).toBeNull();
    expect(top.querySelector('.og-cf-icon')).toBeNull();
    expect(top.style.backgroundColor).toBe('');
  });

  it('setConditionalFormat([]) → CF 해제(잔재 제거)', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    await grid.setConditionalFormat([barRule]);
    renderNow(grid);
    expect(cellEl(grid, 2, 1).querySelector('.og-cf-bar')).toBeTruthy();

    await grid.setConditionalFormat([]);
    renderNow(grid);
    // 해제 후 재렌더된 셀에 CF 잔재 없음.
    expect(cellEl(grid, 2, 1).querySelector('.og-cf-bar')).toBeNull();
    expect((grid as any)._cf).toBeNull();
  });

  it('재렌더 시 CF 잔재가 중복 적층되지 않는다', async () => {
    const { grid } = makeGrid();
    grid.setData(sample);
    await grid.setConditionalFormat([barRule]);
    renderNow(grid);
    renderNow(grid);
    renderNow(grid);
    // 여러 번 렌더해도 셀당 막대 1개.
    expect(cellEl(grid, 2, 1).querySelectorAll('.og-cf-bar').length).toBe(1);
  });

  it('conditionalFormat 옵션 배선 → 첫 렌더 후 채색', async () => {
    const { grid } = makeGrid({ conditionalFormat: [barRule] });
    grid.setData(sample);
    // 옵션 경유 setConditionalFormat 는 동적 import 라 마이크로태스크 플러시 후 채색.
    await new Promise(r => setTimeout(r, 0));
    renderNow(grid);
    expect(cellEl(grid, 2, 1).querySelector('.og-cf-bar')).toBeTruthy();
  });
});
