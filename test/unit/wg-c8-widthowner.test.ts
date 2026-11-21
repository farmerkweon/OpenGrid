/**
 * 걸음 C8(실시간 너비 조절) — TEST 몫 둘(steps/C8/COMMON.md). L19(TEST).
 *  C8-OWN-01 구조: src/core 에서 기하(geometry)의 `.resize(`·`.reset(` 를 부르는 곳은 RenderController.ts 뿐
 *            (폭을 쓰는 주인이 하나 — 다른 곳이 기하에 직접 쓰면 다음 그리기의 맞춤이 덮어써 폭이 사라진다, 검토 R4-5).
 *  C8-OWN-02 동작: 끄는 중 컨테이너 크기가 바뀌어 폭 다시 계산이 끼어들어도, 손 뗀 뒤 사용자 폭이 저장돼 있고 그 폭으로 그려진다
 *            (그리고 그 뒤 크기가 또 바뀌어도 사용자 폭이 남는다).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installResizeObserverStub } from './widegrid-helpers.js';
import { mkW, disposeW, th, fire, frames, bodyCell } from './wg-helpers/counters.js';

vi.setConfig({ testTimeout: 30_000 });
beforeAll(() => installResizeObserverStub());

const ROOT = path.resolve(__dirname, '../..');
const walk = (d: string): string[] => fs.readdirSync(d).flatMap(n => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');
/** 받는 쪽 이름에 geo(geometry·_geometry·getGeometry() 등)가 든 `.resize(`·`.reset(` 부르기. 주석 줄은 뺌. */
const GEO_WRITE = /\b\w*geo\w*(\(\))?\??\.(resize|reset)\(/i;
function geoWrites(text: string): number {
  let n = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) continue;
    if (GEO_WRITE.test(line)) n++;
  }
  return n;
}

describe('C8-OWN-01 기하에 쓰는 곳은 RenderController 하나', () => {
  it('C8-OWN-01 src/core 에서 기하 .resize(·.reset( 를 부르는 파일 = RenderController.ts 뿐', () => {
    const by: Record<string, number> = {};
    for (const f of walk(path.join(ROOT, 'src/core'))) {
      const n = geoWrites(fs.readFileSync(f, 'utf8'));
      if (n) by[rel(f)] = n;
    }
    expect(Object.keys(by)).toEqual(['src/core/RenderController.ts']);
    expect(by['src/core/RenderController.ts']).toBeGreaterThan(0);
  });
  it('C8-OWN-01 자기시험 — 다른 이름·꼴로 기하에 쓰는 줄을 잡고, 기하 아닌 resize·reset 은 안 잡는다', () => {
    expect(geoWrites('    this._geometry.resize(ci, w);')).toBe(1);
    expect(geoWrites('    this._d.getGeometry().reset(widths, extra, 0);')).toBe(1);
    expect(geoWrites('    geo?.resize(leafColIndex(2), 140);')).toBe(1);
    expect(geoWrites('    adapter.resize(rec.renderSize.width, rec.renderSize.height);\n    this._rowMgr.reset();')).toBe(0);
    expect(geoWrites('   * this._geometry.reset(…) 는 여기서만')).toBe(0);
  });
});

describe('C8-OWN-02 끄는 중 다시 계산이 끼어들어도 사용자 폭이 남는다', () => {
  it('C8-OWN-02 H3 를 +80 끄는 중 컨테이너 1,200 → 900 으로 바뀌어 폭 다시 계산 → 손 뗀 뒤 H3·c3 칸 폭 = 시작 폭 + 80, 사용자 폭 저장 · 뒤에 또 크기가 바뀌어도 그대로', async () => {
    const s = await mkW({ cols: 10, rendererEvery: 0 });
    const g: any = s.grid;
    const startW = parseFloat(th(s.container, 'H3').style.width);
    expect(startW).toBeGreaterThan(0);
    const handle = th(s.container, 'H3').querySelector('.og-resize-handle')!;
    fire(handle, 'mousedown', { clientX: 100 });
    fire(document, 'mousemove', { clientX: 140 });
    await frames(1);
    // 끄는 중 크기 바뀜 → 폭 다시 계산(recalcWidths) 이 끼어듦
    s.container.getBoundingClientRect = () => ({ width: 900, height: 640, top: 0, left: 0, right: 900, bottom: 640, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    g.resize();
    await frames(1);
    fire(document, 'mousemove', { clientX: 180 });
    fire(document, 'mouseup', { clientX: 180 });
    await frames(3);
    const want = startW + 80;
    expect(g._userWidths.get('c3'), '사용자 폭이 저장돼야').toBe(want);
    expect(parseFloat(th(s.container, 'H3').style.width)).toBe(want);
    expect(parseFloat(bodyCell(s.container, 0, 3).style.width)).toBe(want);
    // 뒤에 크기가 또 바뀌어 다시 계산해도 사용자 폭은 남는다
    s.container.getBoundingClientRect = () => ({ width: 1500, height: 640, top: 0, left: 0, right: 1500, bottom: 640, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    g.resize();
    await frames(3);
    expect(parseFloat(th(s.container, 'H3').style.width)).toBe(want);
    expect(parseFloat(bodyCell(s.container, 0, 3).style.width)).toBe(want);
    disposeW(s);
  });
});
