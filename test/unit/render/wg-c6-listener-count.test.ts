/**
 * C6 — 본문 한 번 그리기에서 addEventListener 가 몇 번 불리나 · 그 그리기에 걸린 시간(jsdom).
 * 보통 실행: 지금 src 에서 칸·행 대상 호출 0 을 단언한다(U-CP-02 · AR-04 실행판).
 * `WG_SRC=<src 사본> WG_C6_COUNT_OUT=<json>` 로 돌리면 그 src 로 숫자만 적는다(걸음 전·후 맞대기 — steps/C6/L35/tools/count.mjs).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installSceneEnv, makeSceneContainer, tick } from '../wg-helpers/scenes.js';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = process.env.WG_SRC ? path.resolve(process.env.WG_SRC) : path.join(ROOT, 'src');
const OUT = process.env.WG_C6_COUNT_OUT;

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

async function grid50() {
  const { OpenGrid } = await import(/* @vite-ignore */ path.join(SRC, 'core/OpenGrid.ts'));
  const container = makeSceneContainer();
  const columns = Array.from({ length: 50 }, (_, i) => ({ field: `c${i}`, header: `H${i}`, width: 120 }));
  const data = Array.from({ length: 3000 }, (_, r) => {
    const o: any = {};
    for (let c = 0; c < 50; c++) o[`c${c}`] = `r${r}c${c} ` + 'x'.repeat(200);
    return o;
  });
  const grid = new OpenGrid(container, { columns, rowHeight: 32, headerHeight: 40, rowNumber: true, checkColumn: true });
  grid.setData(data);
  await tick();
  return { grid, container };
}

describe('C6 본문 한 번 그리기의 리스너 붙이기', () => {
  it('U-CP-02 · AR-04(실행) 칸·행 대상 addEventListener 0 — 숫자 기록', async () => {
    const { grid, container } = await grid50();
    const proto = EventTarget.prototype as any;
    const orig = proto.addEventListener;
    const by = { total: 0, cell: 0, row: 0, body: 0, other: 0 };
    proto.addEventListener = function (this: any, ...a: any[]) {
      by.total++;
      const el = this as Element;
      if (el?.classList?.contains?.('og-cell') && el.getAttribute?.('role') === 'gridcell') by.cell++;
      else if (el?.classList?.contains?.('og-row') || el?.classList?.contains?.('og-group-row')) by.row++;
      else if (el?.classList?.contains?.('og-body')) by.body++;
      else by.other++;
      return orig.apply(this, a);
    };
    let paintMs: number[] = [];
    try {
      for (let k = 0; k < 10; k++) {
        const t0 = performance.now();
        (grid as any)._doRender(...(grid as any)._visRange());
        paintMs.push(performance.now() - t0);
      }
    } finally {
      proto.addEventListener = orig;
    }
    const cells = container.querySelectorAll('.og-body .og-cell[role=gridcell]').length;
    const rows = container.querySelectorAll('.og-body .og-row').length;
    paintMs = paintMs.sort((a, b) => a - b);
    const perPaint = { total: by.total / 10, cell: by.cell / 10, row: by.row / 10, body: by.body / 10, other: by.other / 10 };
    const result = { cells, rows, perPaint, paintMsMedian: paintMs[5], paintMsMin: paintMs[0] };
    // eslint-disable-next-line no-console
    console.log('[C6-COUNT]', JSON.stringify(result));
    try { grid.destroy(); } catch { /* 이미 치움 */ }
    container.remove();
    if (OUT) { fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); return; }
    expect(cells).toBeGreaterThan(100);
    expect(perPaint.cell).toBe(0);
    expect(perPaint.row).toBe(0);
    expect(perPaint.body).toBe(0); // 본문 위임 리스너는 뷰를 만들 때 한 번 — 그릴 때마다 다시 붙이지 않는다
  });
});
