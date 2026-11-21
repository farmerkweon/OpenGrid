/**
 * 폭 0 칸 장면 — R4 코드 검토 R4-1(폭이 1 미만인 칸을 기하가 1 로 잘라 0px → 1px, 뒤 컬럼 left·전체 폭이 1px 밀림).
 * GEO 레인이 「기하 재설정은 0 이상 폭을 그대로 듦(걸음 전 동작 유지)」으로 고쳤다. 다시는 안 바뀌게 골든으로 못 박는다. L19(TEST).
 *
 * 기대 바이트는 **걸음 전 판**(review/tmp_r4/pre/src)에서 뜬 것:
 *   WG_ZW_RECORD=1 OG_SWAP_SRC=<repo>/sessions/widegrid-perf-2026-11/review/tmp_r4/pre/src \
 *     npx vitest run --config sessions/widegrid-perf-2026-11/steps/R5678/TEST/vitest.swap.config.mjs test/unit/wg-zero-width.test.ts
 * 평소 실행은 비교만(골든이 없으면 실패 — 자동 저장 안 함).
 *
 * ZW-01: flex 컬럼이 남는 폭 0 을 받음(고정 폭 합 > 컨테이너) — flex 하나는 끝, 하나는 가운데.
 * ZW-02: 사용자가 width: 0 을 준 컬럼(가운데) + 고정 컬럼 2개(그 칸 뒤의 left 가 밀리지 않아야 함).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installSceneEnv, makeSceneContainer, tick } from './wg-helpers/scenes.js';
import { goldenSnapshot, formatGolden, unformatGolden, compareSnapshots } from './wg-helpers/dom-snapshot.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const DIR = path.resolve(__dirname, '__golden__/wg');
const RECORD = process.env.WG_ZW_RECORD === '1';
let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

const rows = (n: number, ncol: number) => Array.from({ length: n }, (_, r) => Object.fromEntries(Array.from({ length: ncol }, (_, c) => [`c${c}`, `r${r}c${c}`])));

async function scene(columns: any[], extra: Record<string, any> = {}): Promise<{ grid: OpenGrid<any>; container: HTMLElement }> {
  const container = makeSceneContainer();   // 1200 × 640
  const grid = new OpenGrid<any>(container, { columns, rowHeight: 32, headerHeight: 40, ...extra } as any);
  grid.setData(rows(40, columns.length));
  await tick();
  return { grid, container };
}

const SCENES: Array<{ id: string; make: () => Promise<{ grid: OpenGrid<any>; container: HTMLElement }>; zeroCells: number }> = [
  {
    id: 'ZW-01',
    // 고정 폭 합 7 × 200 = 1,400 > 1,200 → flex 둘이 남는 폭 0 을 받음(가운데 c3 · 끝 c8)
    make: () => scene([
      ...[0, 1, 2].map(i => ({ field: `c${i}`, header: `H${i}`, width: 200 })),
      { field: 'c3', header: 'H3', flex: 1 },
      ...[4, 5, 6, 7].map(i => ({ field: `c${i}`, header: `H${i}`, width: 200 })),
      { field: 'c8', header: 'H8', flex: 1 },
    ]),
    zeroCells: 2,
  },
  {
    id: 'ZW-02',
    make: () => scene([
      { field: 'c0', header: 'H0', width: 120 },
      { field: 'c1', header: 'H1', width: 120 },
      { field: 'c2', header: 'H2', width: 0 },
      { field: 'c3', header: 'H3', width: 120 },
      { field: 'c4', header: 'H4', width: 120 },
    ], { frozenColumns: 2, rowNumber: true }),
    zeroCells: 1,
  },
];

describe('ZW 폭 0 칸 골든(걸음 전 판에서 뜬 바이트)', () => {
  for (const s of SCENES) {
    it(`${s.id} 지금 그린 container.innerHTML 이 걸음 전 골든과 바이트로 같다(폭 0 칸이 0px 그대로)`, async () => {
      const { grid, container } = await s.make();
      try {
        // 장면이 정말 폭 0 칸을 가졌나(헛장면 방지) — 머리글 잎 th 가운데 width 0px 인 수
        const zero = Array.from(container.querySelectorAll<HTMLElement>('.og-header-cell:not(.og-extra-col)')).filter(t => t.style.width === '0px').length;
        const raw = goldenSnapshot(container);
        const file = path.join(DIR, `${s.id}.html`);
        if (RECORD) { fs.writeFileSync(file, formatGolden(raw), 'utf8'); console.log(`[WG_ZW_RECORD] ${s.id} zero=${zero} bytes=${raw.length}`); }
        expect(zero, `${s.id} 폭 0 머리글 칸 수`).toBe(s.zeroCells);
        expect(fs.existsSync(file), `${s.id} 골든 없음 — 걸음 전 판에서 WG_ZW_RECORD=1 로 떠야 함`).toBe(true);
        const golden = unformatGolden(fs.readFileSync(file, 'utf8'));
        const d = compareSnapshots(formatGolden(golden), formatGolden(raw));
        expect(d.same, `${s.id} 골든과 다르다 — ${d.line} 째 줄\n${d.context}`).toBe(true);
      } finally { grid.destroy(); container.remove(); }
    });
  }
});
