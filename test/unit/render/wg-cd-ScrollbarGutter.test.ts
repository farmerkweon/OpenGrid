// 넓은 그리드 새 그물 — 오른쪽 끝 머리글·본문 어긋남(본문 세로 스크롤바 폭) 고침의 GEO 몫.
//  U-SG-01 모자란 폭 = 머리글 보이는 폭 − 본문 보이는 폭(음수면 0) · 바뀌었을 때만 알림 · 0 → 8 → 0
//  U-SG-02 머리글 끝 여백 0(스크롤바 없음·jsdom) — 머리글 table style 이 그대로(margin-right 없음)
//  U-SG-03 끝 여백 8 — table margin-right 8px, 다시 그려도 유지 · 0 으로 돌아가면 0px
import { describe, it, expect, beforeAll } from 'vitest';
import { ScrollbarGutter } from '../../../src/core/render/ScrollbarGutter.js';
import { installResizeObserverStub, makeGrid, settle } from '../widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const box = (cw: number) => { const e = document.createElement('div'); Object.defineProperty(e, 'clientWidth', { configurable: true, get: () => cw }); return e; };

describe('ScrollbarGutter', () => {
  it('U-SG-01 모자란 폭 = 머리글 − 본문 보이는 폭 · 바뀔 때만 알림', () => {
    let bodyW = 790;
    const body = document.createElement('div');
    Object.defineProperty(body, 'clientWidth', { configurable: true, get: () => bodyW });
    const header = box(798);
    const got: number[] = [];
    const g = new ScrollbarGutter(body, header, px => got.push(px));
    g.measure(); g.measure();
    expect(got).toEqual([8]);
    bodyW = 798; g.measure();
    bodyW = 805; g.measure();                       // 본문이 더 넓으면 0
    expect(got).toEqual([8, 0]);
    expect(g.px).toBe(0);
    g.destroy();
  });
});

const COLS = Array.from({ length: 8 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
const DATA = Array.from({ length: 5 }, (_, r) => Object.fromEntries(COLS.map((c, k) => [c.field, `r${r}c${k}`])));
const table = (c: HTMLElement) => c.querySelector<HTMLElement>('.og-header-table')!;

describe('HeaderView 끝 여백', () => {
  it('U-SG-02 여백 0 이면 머리글 table style 에 margin-right 가 없음(지금 DOM 그대로)', async () => {
    const { grid, container } = makeGrid({ columns: COLS }, DATA);
    await settle();
    expect(table(container).getAttribute('style')).not.toMatch(/margin-right|margin: 0px \d/);
    expect(table(container).style.margin).toBe('0px');
    grid.destroy();
  });

  it('U-SG-03 여백 8 → table margin-right 8px · 다시 그려도 유지 · 0 으로 돌아가면 0px', async () => {
    const { grid, container } = makeGrid({ columns: COLS, sortable: true }, DATA);
    await settle();
    const hv = (grid as any)._renderer._headerView;
    hv.setEndGutter(8);
    expect(table(container).style.marginRight).toBe('8px');
    grid.setFilter('c1', [{ operator: 'contains', value: 'r1' }]);   // 머리글 다시 그림
    await settle();
    expect(table(container).style.marginRight).toBe('8px');
    hv.setEndGutter(0);
    expect(table(container).style.marginRight).toBe('0px');
    grid.destroy();
  });
});
