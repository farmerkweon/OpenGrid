/**
 * R5678 코드 검토(REVIEW_CODE_R5678.md)의 TEST 몫 — F-05 의 지금 만들 수 있는 번호 · F-02 의도한 차이 못 박기. L19(TEST).
 *  - AR-21(R7): 스케줄러가 남의 구체 클래스(그리기 부품·관리자·앞면)에 기대지 않음 — import 는 포트 형 + 헤드리스 값 객체만.
 *  - U-CP-09(R8): applyCF 일곱 인자(옛 여섯 차례 + 일곱째 track 함수) · 막대 폭 = mergedWidth × ratio px · track 이 막대마다 1번.
 *  - F-02(R7, 총괄이 「의도한 차이」로 받음): destroy 뒤 공개 API 를 불러도 사용자 렌더러·cellStyle 이 안 불린다
 *    (걸음 앞에는 떼어 낸 DOM 에 그리며 불렸다 — 검토 맞대기 A/late-*).
 * (NR-15b 는 wg-r7-callsites.test.ts.)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { SCENES, installSceneEnv, disposeScene, makeSceneContainer, tick, cols, rows } from './wg-helpers/scenes.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = path.resolve(__dirname, '../..');
let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

// ─── AR-21 ─────────────────────────────────────────────────────────────
/** import 줄들에서 「값으로」 가져오는 경로만(import type 은 형이라 뺌). */
function valueImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)) if (!m[1]) out.push(m[2]!);
  return out;
}
const FORBIDDEN = /(GridRenderer|OpenGrid|RenderController|GridComposer|HeaderView|BodyView|FooterView|RangeSelectionManager|Manager|\/render\/(header|body)\/)/;
// 지금 값으로 가져오는 헤드리스 값 객체(포트 밖) — 줄어드는 것만 허용
const ALLOWED_VALUE_IMPORTS = ['../coordinate/ColumnWindow.js', '../domain/render/RenderRequest.js'];

describe('AR-21 스케줄러 의존은 포트만', () => {
  it('AR-21 RenderScheduler.ts 가 그리기 부품·관리자·앞면 구체 클래스를 import 하지 않음(0) · 값 import 는 헤드리스 값 객체 둘 이하', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/core/render/RenderScheduler.ts'), 'utf8');
    const all = [...src.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]!);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter(p => FORBIDDEN.test(p))).toEqual([]);
    const vals = valueImports(src);
    expect(vals.filter(p => !ALLOWED_VALUE_IMPORTS.includes(p))).toEqual([]);
  });
  it('AR-21 자기시험 — 금지 import 를 일부러 넣은 글은 잡힌다', () => {
    const bad = "import { HeaderView } from './header/HeaderView.js';\nimport type { IRenderPlan } from '../domain/render/ports.js';\nimport { RangeSelectionManager } from '../RangeSelectionManager.js';";
    const all = [...bad.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]!);
    expect(all.filter(p => FORBIDDEN.test(p)).length).toBe(2);
    expect(valueImports(bad)).toEqual(['./header/HeaderView.js', '../RangeSelectionManager.js']);
  });
});

// ─── U-CP-09 ───────────────────────────────────────────────────────────
describe('U-CP-09 applyCF 일곱 인자 · 막대 폭 · track 막대마다 1번', () => {
  it('U-CP-09 GD-10(CF 막대) 다시 그리기 한 번 — 인자 차례·막대 px·track 횟수', async () => {
    const s = await SCENES.find(x => x.id === 'GD-10')!.make();
    try {
      const cbs = (s.grid as any)._renderer._cbs;
      const orig = cbs.applyCF;
      expect(typeof orig).toBe('function');
      const calls: any[][] = [];
      const tracked = new Map<HTMLElement, number>();
      cbs.applyCF = (...a: any[]) => {
        calls.push(a);
        const t = a[6];
        const wrapped = typeof t === 'function' ? (bar: HTMLElement, ratio: number) => { tracked.set(bar, (tracked.get(bar) ?? 0) + 1); (bar as any).__ratio = ratio; t(bar, ratio); } : t;
        return orig(a[0], a[1], a[2], a[3], a[4], a[5], wrapped);
      };
      (s.grid as any)._doRender(...(s.grid as any)._visRange());
      cbs.applyCF = orig;
      expect(calls.length).toBeGreaterThan(0);
      for (const a of calls) {
        expect(a.length).toBe(7);
        expect(a[0]).toBeInstanceOf(HTMLElement);         // cellEl
        expect(typeof a[1]).toBe('number');               // ri
        expect(typeof a[2]).toBe('string');               // field
        expect(typeof a[4]).toBe('number');               // mergedWidth
        expect(typeof a[5]).toBe('number');               // mergedHeight
      }
      const bars = Array.from(s.container.querySelectorAll<HTMLElement>('.og-body .og-cf-bar'));
      expect(bars.length).toBeGreaterThan(0);
      expect(bars.every(b => tracked.get(b) === 1)).toBe(true);   // 막대마다 track 1번
      expect(tracked.size).toBe(bars.length);
      // 막대 폭 = mergedWidth × ratio(0~1 로 자름) px — 막대가 든 칸의 applyCF 인자에서
      for (const a of calls) {
        const bar = (a[0] as HTMLElement).querySelector<HTMLElement>('.og-cf-bar');
        if (!bar) continue;
        const ratio = Math.max(0, Math.min(1, (bar as any).__ratio));
        expect(bar.style.width).toBe(`${ratio * a[4]}px`);
      }
    } finally { disposeScene(s); }
  });
});

// ─── F-02 ──────────────────────────────────────────────────────────────
describe('F-02 destroy 뒤 늦은 공개 API 호출 — 사용자 렌더러·cellStyle 0회(의도한 차이, R7)', () => {
  it('F-02 destroy 뒤 activate·orderBy·setData·writeCell + 2틱 → 렌더러 호출 0 · cellStyle 호출 0 · 던지지 않음', async () => {
    let rend = 0, style = 0;
    OpenGrid.registerRenderer('wg-f02-count', () => ({ render: (ctx: any) => { rend++; const s = document.createElement('span'); s.textContent = String(ctx.value ?? ''); return s; } }) as any);
    const c = makeSceneContainer();
    const columns = cols(4).map((x, i) => (i === 0 ? { ...x, renderer: 'wg-f02-count' } : i === 1 ? { ...x, cellStyle: () => { style++; return {}; } } : x));
    const g = new OpenGrid<any>(c, { rowHeight: 32, headerHeight: 40, columns, sortable: true } as any);
    g.setData(rows(50, 4));
    await tick(2);
    expect(rend, '살아 있을 때는 렌더러가 불린다(계수기 살아 있음)').toBeGreaterThan(0);
    expect(style, '살아 있을 때는 cellStyle 이 불린다').toBeGreaterThan(0);
    g.destroy();
    rend = 0; style = 0;
    expect(() => {
      g.activate(3);
      g.orderBy('c1', 'desc');
      g.setData(rows(30, 4));
      g.writeCell(2, 'c0', 'late');
    }).not.toThrow();
    await tick(2);
    expect({ rend, style }).toEqual({ rend: 0, style: 0 });
    c.remove();
  });
});
