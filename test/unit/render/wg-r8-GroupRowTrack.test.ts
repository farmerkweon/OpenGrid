/**
 * 검토 F-07 — 묶음 행 50컬럼 화면 한 번 그리기의 본문 등록 수.
 * 칸마다 등록(50컬럼 × 보이는 묶음 행)이면 뜨거운 길에 칸마다 객체가 생긴다 → 행 하나에 등록 하나.
 * 등록 수는 표준 출력 `[F-07]` 줄로 남긴다(전·후 비교용).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { installSceneEnv, makeSceneContainer, tick, disposeScene, cols, rows, ROW_H, HEADER_H } from '../wg-helpers/scenes.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

async function groupScene(expandAll: boolean) {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, { rowHeight: ROW_H, headerHeight: HEADER_H, columns: cols(50), rowNumber: true } as any);
  grid.setData(rows(600, 50, (r, o) => { o.c0 = `g${r % 20}`; }));
  grid.groupBy(['c0']);
  await tick();
  if (expandAll) {
    for (let k = 0; k < 20; k++) {
      const el = Array.from(container.querySelectorAll<HTMLElement>('.og-group-row')).find(e => e.getAttribute('aria-expanded') === 'false');
      if (!el) break;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
    }
  }
  (grid as any)._doRender(...(grid as any)._visRange());
  await tick(1);
  return { grid, container };
}

describe('F-07 묶음 행 등록 수', () => {
  for (const expandAll of [false, true]) {
    it(`F-07 묶음 행 50컬럼 (${expandAll ? '전부 펼침' : '전부 접힘'}) — 묶음 행 하나에 본문 등록 하나`, async () => {
      const s = await groupScene(expandAll);
      try {
        const a = (s.grid as any)._renderer._applier;
        const groupRows = s.container.querySelectorAll('.og-group-row').length;
        const groupCells = s.container.querySelectorAll('.og-group-cell').length;
        const body = a.trackedCount('body');
        // eslint-disable-next-line no-console
        console.log(`[F-07] ${expandAll ? 'expanded' : 'collapsed'} dataRows=${s.container.querySelectorAll('.og-row').length} groupRows=${groupRows} groupCells=${groupCells} bodyTracked=${body}`);
        expect(groupRows).toBeGreaterThan(0);
        // 등록 자리 px == 기하 값(묶음 칸까지 — 행 등록이어도 칸 하나하나가 맞아야 한다)
        for (const p of a.projections('body')) expect((p.el.style as any)[p.prop], p.el.className).toBe(p.value);
        // 행 하나에 등록 하나(묶음 여분 자리는 칸이 아니라 행의 첫 자식이라 같은 행 등록에 든다) + 본문 min-width 1
        expect(body).toBeLessThanOrEqual(groupRows * 2 + 1);
      } finally { disposeScene(s); }
    });
  }
});
