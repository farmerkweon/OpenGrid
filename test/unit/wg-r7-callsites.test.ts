/**
 * 걸음 R7 호출처의 그리기 범위 — R5678 코드 검토 F-04. L19(TEST).
 *
 * 돌연변이 M1(묶음 펼침의 명시 범위 {0,n} → 생략)·M2(clearData 의 'clear' → 생략)·M8(디테일 펼침 끝 total → total−1)은
 * 다음 프레임의 스크롤 그리기가 덮어 최종 DOM 이 같아서 그물 274개를 다 빠져나갔다. 「명시 범위를 그대로 옮긴다(rev2 K1)」를
 * 범위 자체로 지킨다:
 *  - 조작마다 동기 구간과 그 뒤 2틱 동안의 `_doRender(시작, 끝)` 인자(차례·깊이 포함)를 적어,
 *    **걸음 앞 판(steps/R4/frozen_after/src)에서 뜬 기대**(`__golden__/wg/r7-callsites.pre.json`)와 맞댄다.
 *  - 지금 코드에서는 그리기 요청 통로(`grid._scheduler.submit`)도 감싸 요청의 `rows`·`sync`·횟수를 적고,
 *    명시 범위가 요청에 실려 오는지 본다(옛 인자 → 요청: (0, n−1) ↔ rows {start:0,end:n} · clearData (0,−1) ↔ 'clear').
 *  - NR-15b: clearData 뒤 `.og-row` 0.
 * 기대 뜨기: WG_R7_RECORD=1 OG_SWAP_SRC=<repo>/sessions/widegrid-perf-2026-11/steps/R4/frozen_after/src \
 *   npx vitest run --config sessions/widegrid-perf-2026-11/steps/R5678/TEST/vitest.swap.config.mjs test/unit/wg-r7-callsites.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installSceneEnv, makeSceneContainer, tick, cols, rows } from './wg-helpers/scenes.js';

const FILE = path.resolve(__dirname, '__golden__/wg/r7-callsites.pre.json');
const RECORD = process.env.WG_R7_RECORD === '1';
let restore: () => void;
// 부하에 기대지 않게: 그리드 셋·조작 16개를 한 번에 돌리는 준비를 첫 시험이 아니라 beforeAll 에서(넉넉한 한도),
// 각 시험은 적어 둔 결과를 맞대기만 한다(첫 시험이 준비를 떠안아 5초에 걸리던 것 — 총괄 npm test 10:04).
vi.setConfig({ testTimeout: 30_000 });
beforeAll(async () => { restore = installSceneEnv(); await runAll(); }, 120_000);
afterAll(() => {
  restore();
  if (RECORD) fs.writeFileSync(FILE, JSON.stringify(REC, null, 1) + '\n', 'utf8');
});

// _doRender 감싸기(프로토타입 — 걸음 앞·뒤 둘 다 이 이름으로 본문 그리기에 들어간다: 지금은 요청 통로의 paintRows 가 부름)
let log: string[] = [];
let depth = 0;
const P: any = OpenGrid.prototype;
const origDo = P._doRender;
P._doRender = function (s: number, e: number) {
  log.push(`D(${s},${e})@${depth}`);
  depth++;
  try { return origDo.call(this, s, e); } finally { depth--; }
};
let reqs: string[] = [];
function watchRequests(g: any): void {
  const sch = g._scheduler;
  if (!sch || typeof sch.submit !== 'function') return;   // 걸음 앞 판에는 통로가 없다
  const orig = sch.submit.bind(sch);
  sch.submit = (req: any) => {
    const r = req?.detail?.rows ?? req?.rows;   // 계약: IRenderRequest.detail.rows (RowSpan | 'clear' | null)
    const rs = r == null ? 'null' : typeof r === 'string' ? r : `{${r.start},${r.end}}`;
    reqs.push(`${rs}${(req?.detail?.sync ?? req?.sync) ? ':sync' : ''}`);
    return orig(req);
  };
}

const REC: Record<string, { sync: string[]; async: string[] }> = {};
const NOW: Record<string, { sync: string[]; async: string[]; reqs: string[] }> = {};
async function step(key: string, fn: () => void): Promise<void> {
  log = []; reqs = [];
  fn();
  const sync = log.slice();
  const syncReqs = reqs.slice();
  await tick(2);
  REC[key] = { sync, async: log.slice(sync.length) };
  NOW[key] = { ...REC[key], reqs: syncReqs };
}

let ready: Promise<void> | null = null;
function runAll(): Promise<void> {
  ready ??= (async () => {
    // A: 평범한 그리드 400행
    {
      const c = makeSceneContainer();
      const g = new OpenGrid<any>(c, { rowHeight: 32, headerHeight: 40, columns: cols(), rowNumber: true } as any);
      g.setData(rows(400));
      await tick(2);
      watchRequests(g);
      await step('A/orderBy', () => g.orderBy([{ field: 'c2', dir: 'desc' }] as any));
      await step('A/setFilter', () => g.setFilter('c1', [{ operator: 'contains', value: 'r1' } as any]));
      await step('A/resetFilter', () => g.resetFilter());
      await step('A/writeCell', () => g.writeCell(3, 'c1', 'x'));
      await step('A/insertRow', () => g.insertRow({ c0: 'n', c1: 'n' } as any, 5));
      await step('A/deleteRow', () => g.deleteRow(2));
      await step('A/reorderRow', () => g.reorderRow(1, 4));
      await step('A/vscroll', () => { const bw = c.querySelector('.og-body-wrapper') as any; Object.defineProperty(bw, 'scrollTop', { configurable: true, value: 32 * 100 }); bw.dispatchEvent(new Event('scroll')); });
      await step('A/clearData', () => g.clearData());
      NOW['A/clearData'].reqs.push(`rowsAfter=${c.querySelectorAll('.og-row').length}`);
      g.destroy(); c.remove();
    }
    // G: 묶음
    {
      const c = makeSceneContainer();
      const g = new OpenGrid<any>(c, { rowHeight: 32, headerHeight: 40, columns: cols() } as any);
      g.setData(rows(300, 8, (r, o) => { o.c0 = ['A', 'B', 'C'][r % 3]; }));
      await tick(2);
      watchRequests(g);
      await step('G/groupBy', () => g.groupBy(['c0']));
      await step('G/clickGroup', () => (c.querySelector('.og-group-row') as HTMLElement).click());
      await step('G/expandAll', () => g.expandAll());
      await step('G/collapseAll', () => g.collapseAll());
      await step('G/clearGroup', () => g.clearGroup());
      g.destroy(); c.remove();
    }
    // D: 디테일
    {
      const c = makeSceneContainer();
      const g = new OpenGrid<any>(c, { rowHeight: 32, headerHeight: 40, columns: cols(), masterDetail: { enabled: true, height: 64, renderer: (row: any, host: HTMLElement) => { host.textContent = 'detail ' + row.c0; } } } as any);
      g.setData(rows(200));
      await tick(2);
      watchRequests(g);
      await step('D/expandRow1', () => g.expandRow(1));
      await step('D/collapseRow1', () => g.collapseRow(1));
      g.destroy(); c.remove();
    }
  })();
  return ready;
}

const PRE: Record<string, { sync: string[]; async: string[] }> = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const KEYS = ['A/orderBy', 'A/setFilter', 'A/resetFilter', 'A/writeCell', 'A/insertRow', 'A/deleteRow', 'A/reorderRow', 'A/vscroll', 'A/clearData',
  'G/groupBy', 'G/clickGroup', 'G/expandAll', 'G/collapseAll', 'G/clearGroup', 'D/expandRow1', 'D/collapseRow1'];

// 걸음 C1(같은 높이면 예약 안 함 + 같은 프레임 요청 합치기) 뒤 차례가 바뀐 조작 여섯 — 설계가 바꾸라 한 것(WIN NOTES steps/C1/L27).
// 그 여섯만 C1 기대(r7-callsites.c1.json)로 보고, 그리기 수가 걸음 앞보다 늘지 않았음을 함께 단언한다.
// 명시 범위 요청(묶음·디테일 펼침·clearData)은 합치지 않는다 → 그 조작들은 걸음 앞 기대 그대로(C7 에서 묶음·디테일이 바뀔 때 다시 옮김).
const C1_FILE = path.resolve(__dirname, '__golden__/wg/r7-callsites.c1.json');
const C1: Record<string, { sync: string[]; async: string[] }> = fs.existsSync(C1_FILE) ? JSON.parse(fs.readFileSync(C1_FILE, 'utf8')) : {};
const C1_CHANGED = ['A/orderBy', 'A/setFilter', 'A/resetFilter', 'A/insertRow', 'A/deleteRow', 'G/clearGroup'];
// 걸음 C7(그리는 범위를 세로 창 하나로 + 펼침의 명시 전 행 → 보이는 범위) 뒤 다시 바뀐 아홉 — r7-callsites.c7.json 이 이긴다.
const C7_FILE = path.resolve(__dirname, '__golden__/wg/r7-callsites.c7.json');
const C7: Record<string, { sync: string[]; async: string[] }> = fs.existsSync(C7_FILE) ? JSON.parse(fs.readFileSync(C7_FILE, 'utf8')) : {};
const C7_CHANGED = ['A/orderBy', 'A/writeCell', 'A/reorderRow', 'G/groupBy', 'G/clickGroup', 'G/expandAll', 'G/collapseAll', 'D/expandRow1', 'D/collapseRow1'];
// C7 뒤에도 걸음 앞 그대로여야 하는 명시 범위: clearData('clear') · 세로 스크롤 구간(VS onRender s,e).
const EXPLICIT_RANGE = ['A/clearData', 'A/vscroll'];

describe('F-04 관리자 호출처의 그리기 범위 = 걸음 앞 (C1 이 합친 여섯은 C1 기대)', () => {
  for (const k of KEYS) {
    const c7 = C7_CHANGED.includes(k);
    const changed = c7 || C1_CHANGED.includes(k);
    it(`R7-CALL ${k}: 동기 구간·2틱 뒤의 _doRender(시작,끝) 차례가 ${c7 ? 'C7 기대(범위 하나·펼침은 보이는 범위)' : changed ? 'C1 기대(같은 프레임 합치기)' : '걸음 앞 판'}와 같고 걸음 앞보다 그리기가 늘지 않음`, async () => {
      await runAll();
      if (RECORD) return;
      expect(PRE[k], `기대 ${k} 가 ${FILE} 에 없음`).toBeDefined();
      const now = { sync: NOW[k]!.sync, async: NOW[k]!.async };
      if (changed) {
        const want = c7 ? C7[k] : C1[k];
        expect(want, `기대 ${k} 가 ${c7 ? C7_FILE : C1_FILE} 에 없음`).toBeDefined();
        expect(now).toEqual(want);
        expect(now.sync.length + now.async.length).toBeLessThanOrEqual(PRE[k]!.sync.length + PRE[k]!.async.length);
      } else {
        expect(now).toEqual(PRE[k]);
      }
    });
  }

  it('R7-CALL 명시 범위 요청은 C1·C7 에서도 그대로 — clearData(clear)·세로 스크롤 구간이 걸음 앞 차례 그대로', async () => {
    await runAll();
    if (RECORD) return;
    for (const k of EXPLICIT_RANGE) expect({ sync: NOW[k]!.sync, async: NOW[k]!.async }, k).toEqual(PRE[k]);
    expect(EXPLICIT_RANGE.some(k => C1_CHANGED.includes(k) || C7_CHANGED.includes(k))).toBe(false);
  });

  it('R7-CALL 요청에 실리는 범위 — C7 뒤 묶음·디테일 펼침/접힘은 보이는 범위(null)·clearData 는 clear 그대로', async () => {
    await runAll();
    if (RECORD) return;
    if (!NOW['G/clickGroup']!.reqs.length) return;      // 요청 통로가 없는 판(걸음 앞)에서는 건너뜀
    for (const k of ['G/clickGroup', 'G/expandAll', 'D/expandRow1', 'D/collapseRow1']) {
      expect(NOW[k]!.reqs.some(r => /^\{0,\d+\}/.test(r)), `${k} 에 명시 전 행 범위가 남음`).toBe(false);
      expect(NOW[k]!.reqs.length, k).toBeGreaterThan(0);
    }
    expect(NOW['A/clearData']!.reqs).toContain('clear:sync');
  });

  it('NR-15b clearData 뒤 .og-row 0(지금과 같음 — R7 에서 \'clear\' 뜻이 안 바뀜)', async () => {
    await runAll();
    if (RECORD) return;
    expect(NOW['A/clearData']!.reqs).toContain('rowsAfter=0');
  });
});
