// 넓은 그리드 새 그물 — applyChange(change, { skipScope: 'body' }): 행을 통째로 다시 그리는 프레임에서 본문 칸·본문 자리 쓰기를 건너뜀.
//  U-GP-SK-01 단위: 본문 등록 자리(칸 지도 칸·전체 폭·빈칸·병합·left·막대) 쓰기 0 · 머리글 th·푸터 자리는 새 값
//  U-GP-SK-02 실제 장면: 건너뛰고 행을 통째로 그린 DOM == 건너뛰지 않고 그린 DOM(폭 속성) · 건너뛴 호출 안에서 본문 쓰기 0
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GeometryApplier } from '../../../src/core/render/GeometryApplier.js';
import { CellRegistry } from '../../../src/core/render/body/CellRegistry.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { leafColIndex as L } from '../../../src/core/coordinate/types.js';
import { RenderRequest } from '../../../src/core/domain/render/RenderRequest.js';
import {
  installSceneEnv, disposeScene, tick, sceneGD01, sceneGD03, sceneGD08, sceneGD09, sceneGD10, type Scene,
} from '../wg-helpers/scenes.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

const el = (tag = 'div') => { const e = document.createElement(tag); document.body.appendChild(e); return e; };
const sized = (w: number, tag = 'div') => { const e = el(tag); e.style.width = `${w}px`; e.style.minWidth = `${w}px`; return e; };

async function writesOn(targets: Node[], fn: () => void): Promise<number> {
  const recs: MutationRecord[] = [];
  const mo = new MutationObserver(r => recs.push(...r));
  for (const t of targets) mo.observe(t, { attributes: true, attributeFilter: ['style'], subtree: true });
  fn();
  await Promise.resolve();
  recs.push(...mo.takeRecords());
  mo.disconnect();
  return recs.length;
}

describe('applyChange skipScope body — 단위', () => {
  it('U-GP-SK-01 본문 자리 쓰기 0 · 머리글 th·푸터 자리는 새 값', async () => {
    const g = new ColumnGeometry(new Array(12).fill(120), ExtraColumns.fromOptions({}), 0);
    const cells = new CellRegistry();
    const a = new GeometryApplier(g, cells);
    const th = sized(120, 'th'); a.trackHeaderCell(th, 2, 'wm');
    const foot = sized(120); a.trackSpan(foot, 2, 1, 'wm', 'footer');
    const cs = Array.from({ length: 5 }, (_, r) => { const c = sized(120); cells.set(r, 2, c); return c; });
    const total = el(); total.style.width = `${g.totalWidth()}px`; a.trackTotal(total, 'width', 'body');
    const gap = el(); gap.style.width = `${g.spanWidth(L(2), 8)}px`; a.trackGap(gap, 2, 9, 'body');
    const span = el(); span.style.width = `${g.spanWidth(L(1), 3)}px`; a.trackSpan(span, 1, 3, 'w', 'body');
    const bar = el(); bar.style.width = '60px'; a.trackBar(bar, 2, 1, 0.5);
    const v0 = g.version;
    g.resize(L(2), 200);
    const n = await writesOn([...cs, total, gap, span, bar], () => a.applyChange(g.changesSince(v0), { skipScope: 'body' }));
    expect(n).toBe(0);
    expect(th.style.width).toBe('200px');
    expect(foot.style.width).toBe('200px');
    // 안 건너뛰면 같은 몫이 본문에 쓰임(대조군)
    a.applyChange(g.changesSince(v0));
    expect(cs[0].style.width).toBe('200px');
    expect(total.style.width).toBe(`${g.totalWidth()}px`);
  });
});

/** 머리글·본문(앞 20행)·푸터의 폭 속성 목록. */
function widthDom(c: HTMLElement): string[] {
  const out: string[] = [];
  const walk = (n: Element, path: string) => {
    const ri = Number(n.getAttribute?.('aria-rowindex') ?? 0);
    if (ri > 20) return;
    const s = (n as HTMLElement).style;
    if (s) {
      const v = ['width', 'min-width', 'max-width', 'left'].map(p => s.getPropertyValue(p)).join('|');
      if (v !== '|||') out.push(`${path}${n.tagName}.${(n.className || '').toString().split(' ')[0]} ${v}`);
    }
    let i = 0;
    for (const ch of Array.from(n.children)) walk(ch, `${path}${i++}/`);
  };
  for (const sel of ['.og-header', '.og-body', '.og-footer']) { const e = c.querySelector(sel); if (e) walk(e, sel + ':'); }
  return out;
}

/** 컬럼 1 → 177 을 폭 주인에 쓰고 「통째 다시 그리기」 요청 — skip 이면 스케줄러의 applyChange 가 본문을 건너뛰게(스케줄러 한 줄을 흉내). */
async function run(make: () => Promise<Scene>, skip: boolean): Promise<{ dom: string[]; bodyWrites: number; calls: number }> {
  const s = await make();
  const grid: any = s.grid;
  const applier: GeometryApplier = grid._renderer._applier;
  const orig = applier.applyChange.bind(applier);
  let bodyWrites = 0, calls = 0;
  if (skip) {
    applier.applyChange = (c, _o) => {
      calls++;
      const body = s.container.querySelector('.og-body')!;
      const mo = new MutationObserver(() => {});
      mo.observe(body, { attributes: true, attributeFilter: ['style'], subtree: true });
      orig(c, { skipScope: 'body' });
      bodyWrites += mo.takeRecords().length;
      mo.disconnect();
    };
  }
  grid._render.setUserWidth(1, 177);
  grid._scheduler.submit(RenderRequest.REPAINT_VISIBLE);
  await tick();
  const dom = widthDom(s.container);
  disposeScene(s);
  return { dom, bodyWrites, calls };
}

const SCENES: [string, () => Promise<Scene>][] = [['GD-01', sceneGD01], ['GD-03', sceneGD03], ['GD-08', sceneGD08], ['GD-09', sceneGD09], ['GD-10', sceneGD10]];
describe('applyChange skipScope body — 실제 장면(통째 다시 그리기 프레임)', () => {
  for (const [id, make] of SCENES) {
    it(`U-GP-SK-02 ${id} 건너뛰고 통째 그린 DOM == 안 건너뛰고 그린 DOM · 건너뛴 호출 안 본문 쓰기 0`, async () => {
      const want = await run(make, false);
      const got = await run(make, true);
      expect(got.calls).toBeGreaterThan(0);
      expect(got.bodyWrites).toBe(0);
      expect(got.dom).toEqual(want.dom);
      expect(want.dom.some(l => l.includes('177px'))).toBe(true);           // 폭 바뀜이 실제로 그려졌음
    });
  }
});
