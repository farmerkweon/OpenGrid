/**
 * 걸음 C8 (본문 몫) — 끄는 동안 본문을 다시 만들지 않고 등록해 둔 폭 자리에만 px 를 쓴다.
 * 그래서 「한 컬럼 폭을 바꾸고 applyChange 만 한 본문 DOM」 == 「그 폭으로 처음부터 그린 본문 DOM」(바이트)이어야 한다(U-GP 본문판).
 * 장면: 골든 15장면 + 병합(가로·세로·끝을 넘는 가로)·묶음+여분·디테일+고정+여분·CF 막대. 장면마다 컬럼 몇 개를 바꿔 본다.
 * 머리글은 GEO 몫이라 여기서는 기록만(표준 출력 `[C8-HDR]`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { SCENES, installSceneEnv, disposeScene, makeSceneContainer, tick, cols, rows, type Scene } from '../wg-helpers/scenes.js';
import { maskRowIds } from '../wg-helpers/dom-snapshot.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

type Made = { grid: OpenGrid<any>; container: HTMLElement };

async function mountExtra(options: Record<string, any>, n = 120, after?: (g: any) => any): Promise<Made> {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns: cols(), ...options } as any);
  grid.setData(rows(n, 8, (r, o) => { o.c0 = ['A', 'B', 'C'][r % 3]; o.c3 = (r * 37) % 101; }));
  await tick();
  if (after) { await after(grid); await tick(); }
  return { grid, container };
}

const EXTRA: Array<{ id: string; make: () => Promise<Made> }> = [
  { id: 'X-merge3', make: () => mountExtra({}, 120, g => g.mergeCells([{ row: 0, col: 1, colSpan: 3 }, { row: 2, col: 4, rowSpan: 3 }, { row: 5, col: 2, rowSpan: 2, colSpan: 2 }])) },
  { id: 'X-merge-past-end', make: () => mountExtra({ defaultColumnWidth: 77 }, 120, g => g.mergeCells([{ row: 0, col: 6, colSpan: 4 }])) },
  { id: 'X-group-extras', make: () => mountExtra({ stateColumn: true, rowNumber: true, checkColumn: true }, 120, g => g.groupBy(['c0'])) },
  { id: 'X-detail-frozen-extras', make: () => mountExtra({ frozenColumns: 2, rowNumber: true, checkColumn: true,
    masterDetail: { enabled: true, height: 64, renderer: (row: any, host: HTMLElement) => { host.textContent = `d ${row.c0}`; } } }, 120, g => g.expandRow(1)) },
  { id: 'X-frozen-merge', make: () => mountExtra({ frozenColumns: 3, rowNumber: true }, 120, g => g.mergeCells([{ row: 1, col: 1, rowSpan: 3 }, { row: 0, col: 2, colSpan: 3 }])) },
];

function bodyHtml(c: HTMLElement): string {
  return maskRowIds(c.querySelector('.og-body')!.outerHTML);
}
function headerHtml(c: HTMLElement): string {
  return maskRowIds(c.querySelector('.og-header')?.outerHTML ?? '');
}

/** 처음 달라지는 자리 앞뒤 120자. */
function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `@${i}\n  applied: …${a.slice(Math.max(0, i - 120), i + 120)}…\n  fresh:   …${b.slice(Math.max(0, i - 120), i + 120)}…`;
}

async function check(m: Made, ci: number): Promise<{ body: string | null; header: string | null }> {
  const g = m.grid as any;
  // 같은 그리기 길로 한 번 그려 행 범위를 맞춘다(장면이 마지막에 쓴 길과 _visRange 길은 범위가 다를 수 있음).
  g._doRender(...g._visRange());
  await tick(1);
  const geo = g._render.geometry;
  const applier = g._renderer._applier;
  const w = geo.widthOf(ci) + 37;
  applier.applyChange(geo.resize(ci, w));
  const appliedBody = bodyHtml(m.container);
  const appliedHeader = headerHtml(m.container);
  // 그 폭으로 처음부터: 날 배열을 같은 값으로 두고 머리글·본문을 통째로 다시 그린다.
  g._colWidths[ci] = w;
  g._renderHeader();
  g._doRender(...g._visRange());
  const freshBody = bodyHtml(m.container);
  const freshHeader = headerHtml(m.container);
  return {
    body: appliedBody === freshBody ? null : firstDiff(appliedBody, freshBody),
    header: appliedHeader === freshHeader ? null : firstDiff(appliedHeader, freshHeader),
  };
}

const ALL: Array<{ id: string; make: () => Promise<Made> }> = [
  ...SCENES.map(s => ({ id: s.id, make: () => s.make() as Promise<Scene> })),
  ...EXTRA,
];

describe('C8 본문 — applyChange 만 한 DOM == 그 폭으로 처음부터 그린 DOM', () => {
  for (const sc of ALL) {
    for (const ci of [0, 2, 5, 7]) {
      it(`C8-AP ${sc.id} 컬럼 ${ci} +37px`, async () => {
        const m = await sc.make();
        try {
          const r = await check(m, ci);
          // eslint-disable-next-line no-console
          if (r.header) console.log(`[C8-HDR] ${sc.id} ci=${ci} ${r.header.slice(0, 400)}`);
          expect(r.body, `${sc.id} ci=${ci} 본문이 다르다 ${r.body ?? ''}`).toBeNull();
        } finally { disposeScene(m); }
      }, 30_000);
    }
  }
});
