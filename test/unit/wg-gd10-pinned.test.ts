/**
 * GD-10(조건부 서식) 골든의 찍는 시점이 못 박혔는지 — L19(TEST), 2026-11-21 GD-10 흔들림 규명(steps/R5678/TEST/GD10.md).
 *
 * 원인: setData 가 예약한 스크롤 rAF 그리기(창 30행)와, CF 지연 청크 import 뒤의 visRange 그리기(59행)가 경주한다.
 * 마지막 그리기가 DOM 을 정한다. 청크가 이미 실려 있으면(같은 파일 두 번째 그림 · 다른 시험 파일이 먼저 실음)
 * CF 쪽이 먼저 끝나 rAF 30행이 마지막이 되어 골든(59행)과 달라졌다. 장면이 CF 를 걸기 전에 rAF 그리기를 먼저 끝내게
 * 고쳤다(scenes.ts sceneGD10). 이 시험은 가장 나쁜 조건 둘(청크 미리 실음 · 같은 파일에서 세 번 그림)에서 골든과 같은지 본다.
 *
 * 걸음 C7(그리는 범위를 세로 창 하나로) 뒤: 두 그리기가 같은 범위(30행)라 경주가 없어졌다(설계 §17-5). 골든 GD-10 을 30행으로 다시 찍었고,
 * 순서 못 박기(tick(1))를 뺀 판도 같은 바이트여야 한다 — 아래 「못 박기 없는 판」 시험.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sceneGD10, installSceneEnv, disposeScene, makeSceneContainer, tick, cols, rows } from './wg-helpers/scenes.js';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { goldenSnapshot, unformatGolden } from './wg-helpers/dom-snapshot.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const GOLDEN = path.resolve(__dirname, '__golden__/wg/GD-10.html');
let restore: () => void;
beforeAll(async () => {
  restore = installSceneEnv();
  await import('../../src/core/cf/index.js'); // 다른 파일이 CF 청크를 먼저 실은 상황(흔들림이 나던 조건)
});
afterAll(() => restore());

describe('GD-10 찍는 시점 못 박음', () => {
  for (const k of [1, 2, 3]) {
    it(`GD-10 CF 청크가 이미 실린 채 ${k}번째 그림 — 골든과 바이트로 같다(본문 30행)`, async () => {
      const s = await sceneGD10();
      try {
        expect(s.container.querySelectorAll('.og-body .og-row').length).toBe(30);
        expect(goldenSnapshot(s.container) === unformatGolden(fs.readFileSync(GOLDEN, 'utf8'))).toBe(true);
      } finally { disposeScene(s); }
    });
  }
});

/** 순서 못 박기 없는 GD-10 — scenes.ts sceneGD10 에서 setConditionalFormat 앞의 tick(1) 만 뺀 꼴(나머지 글자 같음). */
async function sceneGD10Unpinned(): Promise<{ grid: OpenGrid<any>; container: HTMLElement }> {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, {
    rowHeight: 32, headerHeight: 40,
    columns: cols().map(c => (c.field === 'c3' || c.field === 'c4' ? { ...c, type: 'number' } : c)),
  } as any);
  grid.setData(rows(120, 8, (r, o) => { o.c3 = (r * 37) % 101; o.c4 = (r * 53) % 97; }));
  await (grid as any).setConditionalFormat([
    { id: 'gd10-bar', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'c3' }, priority: 0 },
    { id: 'gd10-scale', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'scale', mode: 'discrete', bands: 5 }, scope: { columnId: 'c4' }, priority: 1 },
  ]);
  await tick();
  return { grid, container };
}

describe('GD-10 순서 못 박기 없는 판(C7 뒤 경주 없음 — 설계 §17-5)', () => {
  for (const k of [1, 2]) {
    it(`GD-10 못 박기 없이 ${k}번째 그림(CF 청크 실림) — 골든과 바이트로 같다(본문 30행)`, async () => {
      const s = await sceneGD10Unpinned();
      try {
        expect(s.container.querySelectorAll('.og-body .og-row').length).toBe(30);
        expect(goldenSnapshot(s.container) === unformatGolden(fs.readFileSync(GOLDEN, 'utf8'))).toBe(true);
      } finally { disposeScene(s); }
    });
  }
});
