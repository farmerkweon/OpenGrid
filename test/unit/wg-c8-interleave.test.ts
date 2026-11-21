/**
 * 걸음 C8 코드 검토 C-05 — 「끄는 중 다른 그리기가 끼어도 폭이 한 가지」. L19(TEST).
 * 돌연변이 M1(setUserWidth 가 계산 결과 날 배열을 안 쓰고 기하에만 씀 — 설계 §17-1 의 핵심을 깬 판)이 그물 141개를 다 지나갔다.
 * 겉으로는 드러난다: 끄는 중 setData 가 끼면 머리글 170 · 본문 칸 120(어긋남). 그것을 시험으로 — 끼어드는 그리기 넷
 * (setData · orderBy · setFilter · 컨테이너 크기 변화) 각각에서:
 *   끄는 중: 머리글 th 폭 == 본문 칸 폭 == 푸터 칸 폭 == 끄던 폭
 *   놓은 뒤: 저장된 사용자 폭 == 머리글 == 본문 칸 == 푸터 칸 == 시작 폭 + 끈 양
 * (검토 재현 review/tmp_c/tree/test/unit/zz-review-c8.test.ts P8 을 바탕으로. BODY 의 실제 입력 e2e wg-c6-real-input 과 이름이 겹치지 않음.)
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installResizeObserverStub } from './widegrid-helpers.js';
import { mkW, disposeW, th, fire, frames, bodyCell } from './wg-helpers/counters.js';

vi.setConfig({ testTimeout: 30_000 });
beforeAll(() => installResizeObserverStub());

const W = (el: HTMLElement) => parseFloat(el.style.width);
/** 푸터에서 c3 합계 칸(정의: 라벨 3칸 묶음 + c3 count) — 앞 빈칸(여분 컬럼 몫)이 없으니 둘째 자식. */
const footerC3 = (c: HTMLElement) => {
  const bar = c.querySelector('.og-footer-bar') as HTMLElement;
  const cells = Array.from(bar.children).filter(x => !(x as HTMLElement).classList.contains('og-footer-fill')) as HTMLElement[];
  return cells[1]!;
};

type Interleave = { name: string; run: (g: any, container: HTMLElement) => void; holdsDragWidth?: boolean };
const INTERLEAVES: Interleave[] = [
  { name: 'setData', holdsDragWidth: true, run: g => g.setData(g.getData().slice(0, 500)) },
  { name: 'orderBy', holdsDragWidth: true, run: g => g.orderBy([{ field: 'c1', dir: 'desc' }]) },
  { name: 'setFilter', holdsDragWidth: true, run: g => g.setFilter('c1', [{ operator: 'contains', value: 'r1' }]) },
  {
    name: '컨테이너 크기 변화', run: (g, c) => {
      c.getBoundingClientRect = () => ({ width: 900, height: 640, top: 0, left: 0, right: 900, bottom: 640, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
      g.resize();
    },
  },
];

describe('C-05 끄는 중 다른 그리기가 끼어도 머리글 == 본문 == 푸터 폭, 놓은 뒤 사용자 폭 == 그 폭', () => {
  for (const it2 of INTERLEAVES) {
    it(`C8-MIX ${it2.name}: 끄는 중 끼어듦 → 셋이 같은 폭 · 놓은 뒤 저장 폭 == 화면 == 시작 + 70`, async () => {
      const s = await mkW({ cols: 10, rendererEvery: 0, options: { footer: [{ label: '합계', colspan: 3 }, { field: 'c3', op: 'count' }] } });
      const g: any = s.grid;
      try {
        const start = W(th(s.container, 'H3'));
        expect(start).toBeGreaterThan(0);
        const h = th(s.container, 'H3').querySelector('.og-resize-handle')!;
        fire(h, 'mousedown', { clientX: 100 });
        fire(document, 'mousemove', { clientX: 150 });
        await frames(1);
        it2.run(g, s.container);
        await frames(1);
        const mid = { th: W(th(s.container, 'H3')), cell: W(bodyCell(s.container, 0, 3)), footer: W(footerC3(s.container)) };
        expect(mid.cell, `끄는 중 본문 칸 == 머리글 (${JSON.stringify(mid)})`).toBe(mid.th);
        expect(mid.footer, `끄는 중 푸터 칸 == 머리글 (${JSON.stringify(mid)})`).toBe(mid.th);
        // 끄던 폭 유지(시작 + 50): setData·orderBy·setFilter 에서 단언. 컨테이너 크기 변화는 끄는 중 폭이 다시 계산된 폭으로
        // 돌아가는 것(잼 2026-11-21: 170 → 120)을 여기서는 단언하지 않는다 — 놓은 뒤 단언(저장 폭 == 화면 == 시작 + 70)이 잡는다.
        // 2026-11-21 지금 src: setFilter·크기 변화는 끌기가 끊겨 놓은 뒤 단언에서 빨강(user undefined) — 로그 WARN GEO·STR. 고치면 둘 다 초록.
        if (it2.holdsDragWidth) expect(mid.th, '끄는 중 폭 = 시작 + 50').toBe(start + 50);
        fire(document, 'mousemove', { clientX: 170 });
        fire(document, 'mouseup', { clientX: 170 });
        await frames(3);
        const want = start + 70;
        const out = { user: g._userWidths.get('c3'), th: W(th(s.container, 'H3')), cell: W(bodyCell(s.container, 0, 3)), footer: W(footerC3(s.container)) };
        expect(out, '놓은 뒤').toEqual({ user: want, th: want, cell: want, footer: want });
      } finally { disposeW(s); }
    });
  }
});
