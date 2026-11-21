/**
 * GD-01~GD-15 골든 DOM 사진 (테스트 설계서 §4-2) · ST-08 (§4-3) · 정규화 자기 확인.
 *
 * - 평소 실행은 **비교만** 한다. 골든 파일이 없으면 실패한다(처음 돌릴 때 자동 저장하지 않는다 —
 *   틀린 화면이 조용히 새 골든이 되는 길을 막는다).
 * - 저장은 명시 명령으로만: `WG_GOLDEN_UPDATE=1 npx vitest run test/unit/wg-golden-dom.test.ts`
 *   (동작 변경 걸음에서 다시 찍는 사람은 TEST 레인뿐 — 설계서 D2. 다시 찍으면 __golden__/wg/CHANGES.md 에 diff.)
 * - 사진마다 행·칸·글자 최소값을 단언한다(빈 DOM 을 골든으로 찍는 사고 방지).
 * - 같은 장면을 두 번 그려 사진이 같은지(결정적인지)도 본다.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GridRenderer } from '../../src/core/GridRenderer.js';
import { SCENES, installSceneEnv, disposeScene, sceneStats, sceneGD01 } from './wg-helpers/scenes.js';
import { goldenSnapshot, formatGolden, unformatGolden, compareSnapshots, maskRowIds } from './wg-helpers/dom-snapshot.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const GOLDEN_DIR = path.resolve(__dirname, '__golden__/wg');
const UPDATE = process.env.WG_GOLDEN_UPDATE === '1';

let restoreEnv: () => void;
beforeAll(() => { restoreEnv = installSceneEnv(); });
afterAll(() => { restoreEnv(); });

function goldenPath(id: string): string { return path.join(GOLDEN_DIR, `${id}.html`); }

describe('GD — 골든 DOM 사진(지금 코드 == 저장한 사진)', () => {
  for (const { id, make } of SCENES) {
    it(`${id} 지금 그린 container.innerHTML 이 저장한 골든과 바이트로 같다`, async () => {
      const s = await make();
      try {
        const st = sceneStats(s.container);
        // 빈 DOM 방지 — 주입이 먹어서 행·칸·글자가 실제로 그려졌는가.
        expect(st.rows, `${id} 행 수`).toBeGreaterThanOrEqual(s.min.rows);
        expect(st.cells, `${id} 칸 수`).toBeGreaterThanOrEqual(s.min.cells);
        expect(st.text, `${id} 칸 글자 수`).toBeGreaterThanOrEqual(s.min.text);
        expect(st.headerCells, `${id} 머리글 칸 수`).toBeGreaterThan(0);

        const raw = goldenSnapshot(s.container);
        const file = goldenPath(id);
        if (UPDATE) {
          fs.mkdirSync(GOLDEN_DIR, { recursive: true });
          fs.writeFileSync(file, formatGolden(raw), 'utf8');
          // eslint-disable-next-line no-console
          console.log(`[WG_GOLDEN_UPDATE] ${id} 저장 bytes=${st.bytes} rows=${st.rows} cells=${st.cells} text=${st.text} header=${st.headerCells} footer=${st.footerCells}`);
        }
        expect(fs.existsSync(file), `${id} 골든 파일이 없다 — WG_GOLDEN_UPDATE=1 로 명시 저장해야 한다: ${file}`).toBe(true);
        const golden = unformatGolden(fs.readFileSync(file, 'utf8'));
        const d = compareSnapshots(formatGolden(golden), formatGolden(raw));
        expect(d.same, `${id} 골든과 다르다 — ${d.line} 째 줄\n${d.context}`).toBe(true);
        expect(raw === golden).toBe(true);
      } finally {
        disposeScene(s);
      }
    });
  }

  for (const { id, make } of SCENES) {
    it(`${id} 같은 장면을 두 번 그리면 사진이 같다(결정적)`, async () => {
      const a = await make();
      const ra = goldenSnapshot(a.container);
      disposeScene(a);
      const b = await make();
      const rb = goldenSnapshot(b.container);
      disposeScene(b);
      const d = compareSnapshots(formatGolden(ra), formatGolden(rb));
      expect(d.same, `${id} 두 번 그린 사진이 다르다 — ${d.line} 째 줄\n${d.context}`).toBe(true);
    });
  }
});

describe('골든 형식 — 되돌릴 수 있다(정보 손실 0)', () => {
  it('formatGolden → unformatGolden 이 원문과 바이트로 같다(줄바꿈 글자 포함)', () => {
    const raw = '<div a="1" style="b: 2;">x\ny &lt;z&gt;</div><span class="q p">t</span>';
    expect(unformatGolden(formatGolden(raw))).toBe(raw);
  });
  it('행 id 순번만 다시 매기고 같은 id 의 짝은 남긴다', () => {
    expect(maskRowIds('id="og-detail-og-r-71" aria-controls="og-detail-og-r-71" x="og-r-9"'))
      .toBe('id="og-detail-og-r-@1" aria-controls="og-detail-og-r-@1" x="og-r-@2"');
  });
});

describe('ST-08 — 머리글 th style 두 줄 순서를 바꾼 판은 GD-01 이 잡는다', () => {
  it('ST-08 renderHeader 뒤 잎 th 의 style 앞 두 선언 순서를 맞바꾸면 GD-01 사진이 골든과 달라진다', async () => {
    const orig = GridRenderer.prototype.renderHeader;
    const spy = vi.spyOn(GridRenderer.prototype, 'renderHeader').mockImplementation(function (this: any, ...args: any[]) {
      const r = (orig as any).apply(this, args);
      const ths = (this._header as HTMLElement).querySelectorAll<HTMLElement>('th.og-header-cell');
      ths.forEach(th => {
        const decls = th.style.cssText.split(';').map(x => x.trim()).filter(Boolean);
        if (decls.length >= 2) {
          [decls[0], decls[1]] = [decls[1]!, decls[0]!];
          th.style.cssText = decls.join('; ') + ';';
        }
      });
      return r;
    });
    let s;
    try {
      s = await sceneGD01();
      const raw = goldenSnapshot(s.container);
      const golden = unformatGolden(fs.readFileSync(goldenPath('GD-01'), 'utf8'));
      expect(spy).toHaveBeenCalled();
      const d = compareSnapshots(formatGolden(golden), formatGolden(raw));
      // eslint-disable-next-line no-console
      console.log(`[ST-08] GD-01 판정=${d.same ? '같다(놓침)' : '다르다(잡음)'} line=${d.line}\n${d.context}`);
      expect(d.same).toBe(false);
    } finally {
      if (s) disposeScene(s);
      spy.mockRestore();
    }
  });
});
