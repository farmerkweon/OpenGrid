/**
 * 걸음 C8 검토 C-07(다시 한 판) — 끄는 동안 실제 강제 배치(RenderController.syncHeaderLayout) 횟수 ≤ 머리글 높이가 바뀐 프레임 수.
 * 가짜 포트(wg-c1-merge C8-SCH-06)만으로는 「주인이 비교한다」는 뜻을 못 지키므로 진짜 RenderController·스케줄러로 센다. L19(TEST).
 * jsdom 에는 배치가 없어 머리글 높이를 잴 수 없다 → 렌더러 인스턴스의 getHeaderHeight 만 「줄바꿈 컬럼 폭으로 정해지는 높이」로 갈음
 * (폭이 40px 줄 때마다 한 줄 17px 늘어남 — 실제 Chromium 잼 c07_wraphead.json 의 68→85→…→186 과 같은 꼴). 나머지는 전부 진짜.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installResizeObserverStub } from './widegrid-helpers.js';
import { mkW, disposeW, th, fire, frames } from './wg-helpers/counters.js';

vi.setConfig({ testTimeout: 30_000 });
beforeAll(() => installResizeObserverStub());

const LONG = '줄바꿈 머리글 — 좁히면 줄이 늘어나는 긴 제목';

async function scene() {
  const columns = Array.from({ length: 10 }, (_, i) => ({ field: `c${i}`, header: i === 1 ? LONG : `H${i}`, width: 300, ...(i === 1 ? { headerWrap: true } : {}) }));
  const s = await mkW({ cols: 10, rendererEvery: 0, columns });
  const g: any = s.grid;
  const rd = g._renderer;
  const rc = g._render;
  const headTh = () => th(s.container, LONG);
  const heightNow = () => 68 + 17 * Math.max(0, Math.floor((300 - parseFloat(headTh().style.width)) / 40));
  rd.getHeaderHeight = () => heightNow();
  // 마운트 때의 맞춤은 jsdom 높이(0)로 했으므로, 갈음한 높이로 한 번 맞춰 둔다(실제 브라우저에선 마운트가 진짜 높이를 잰 상태 — 셈 전).
  rc.syncHeaderLayout();
  await frames(1);
  let sync = 0;
  const origSync = rc.syncHeaderLayout.bind(rc);
  rc.syncHeaderLayout = () => { sync++; return origSync(); };
  return { s, g, rc, headTh, heightNow, syncCount: () => sync };
}

describe('C-07 끄는 동안 실제 syncHeaderLayout ≤ 머리글 높이가 바뀐 프레임 수(진짜 RenderController)', () => {
  it('C7-REAL-01 준비: 줄바꿈 머리글이 있다고 주인이 답한다(이 화면이 C-07 이 다루는 길)', async () => {
    const { s, rc } = await scene();
    try { expect(rc.hasWrappedHeader()).toBe(true); } finally { disposeW(s); }
  });

  it('C7-REAL-02 H1 을 4px 씩 30번 좁히는 동안: 프레임마다 syncHeaderLayout ≤ 1 · 합 ≤ 높이가 바뀐 프레임 수 · 높이가 바뀌면 맞춤이 따라옴(≥ 1)', async () => {
    const { s, headTh, heightNow, syncCount } = await scene();
    try {
      const h = headTh().querySelector('.og-resize-handle')!;
      fire(h, 'mousedown', { clientX: 1000 });
      await frames(1);
      const base = syncCount();
      let prevH = heightNow();
      let changed = 0;
      const perFrame: number[] = [];
      for (let k = 1; k <= 30; k++) {
        const before = syncCount();
        fire(document, 'mousemove', { clientX: 1000 - k * 4 });
        await frames(1);
        perFrame.push(syncCount() - before);
        const hNow = heightNow();
        if (hNow !== prevH) changed++;
        prevH = hNow;
      }
      const during = syncCount() - base;
      fire(document, 'mouseup', { clientX: 1000 - 120 });
      await frames(3);
      expect(changed, '이 끌기에서 높이가 실제로 바뀌는 프레임이 있다(시험이 빈 판이 아님)').toBeGreaterThanOrEqual(2);
      expect(Math.max(...perFrame), '프레임마다 강제 배치 ≤ 1').toBeLessThanOrEqual(1);
      expect(during, `끄는 동안 syncHeaderLayout ${during} ≤ 높이 바뀐 프레임 ${changed}`).toBeLessThanOrEqual(changed);
      expect(during, '높이가 바뀌면 맞춤이 따라온다').toBeGreaterThanOrEqual(1);
    } finally { disposeW(s); }
  });

  it('C7-REAL-03 높이가 안 바뀌는 끌기(넓히기 — 줄 수 그대로): 끄는 동안 syncHeaderLayout 0', async () => {
    const { s, headTh, syncCount } = await scene();
    try {
      const h = headTh().querySelector('.og-resize-handle')!;
      fire(h, 'mousedown', { clientX: 1000 });
      await frames(1);
      const base = syncCount();
      for (let k = 1; k <= 10; k++) { fire(document, 'mousemove', { clientX: 1000 + k * 10 }); await frames(1); }
      const during = syncCount() - base;
      fire(document, 'mouseup', { clientX: 1100 });
      await frames(2);
      expect(during).toBe(0);
    } finally { disposeW(s); }
  });
});
