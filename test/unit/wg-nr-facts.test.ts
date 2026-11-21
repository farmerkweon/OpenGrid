/**
 * T0 사실 재기 — 테스트 설계서에서 기대가 `T0_FACTS.<번호>` 인 줄 가운데 jsdom 으로 잴 수 있는 것. L19.
 * 각 테스트는 「지금 값」을 재서 evidence/t0-facts-jsdom.json 에 쓰고, 지금 값 그대로를 단언한다(뒤 걸음의 기대값 출처).
 * 시간(ms)은 기록만 하고 단언하지 않는다(IMPL_RULES 11 — 시간에 기대는 단언 금지).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { installResizeObserverStub, makeGrid, settle, pick } from './widegrid-helpers.js';
import { DataLayer } from '../../src/core/DataLayer.js';
import { mkW, disposeW, frames, wColumns, wRows, th, fire, bodyCell } from './wg-helpers/counters.js';
import { legacySortIndexes, legacySortCompare } from './wg-helpers/legacy-controls.js';
import { mulberry32 } from './wg-helpers/sort-data.js';

// 다른 레인이 같은 PC 에서 테스트·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다(C0 때 NR-05 가 두 번 시간 초과).
// 단언은 그대로 두고 시간 한도만 넉넉히. 더 긴 한도를 따로 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

// 증거 파일은 명시할 때만 쓴다(평소 실행이 T0 증거를 덮어쓰지 않게): WG_WRITE_EVIDENCE=1 또는 WG_T0_RECORD=1.
// 쓰는 곳은 WG_EVID_DIR(있으면) 아니면 T0 증거 폴더.
const WRITE_EVID = process.env.WG_WRITE_EVIDENCE === '1' || process.env.WG_T0_RECORD === '1';
const EVID = process.env.WG_EVID_DIR ? resolve(process.env.WG_EVID_DIR) : resolve(__dirname, '../../sessions/widegrid-perf-2026-11/steps/T0/L19/evidence');
const FILE = resolve(EVID, 't0-facts-jsdom.json');
function save(key: string, val: any): void {
  if (!WRITE_EVID) return;
  mkdirSync(EVID, { recursive: true });
  const cur = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  cur[key] = val;
  writeFileSync(FILE, JSON.stringify(cur, null, 2), 'utf8');
}
beforeAll(() => installResizeObserverStub());
afterAll(() => { vi.restoreAllMocks(); });

describe('T0_FACTS — 그리기 길', () => {
  it('U-FLAT-02 100행 × 50컬럼 한 번 그리기에서 지금 코드가 부르는 DataLayer.getData 횟수(directHits 기준값)', async () => {
    const s = await mkW({ rows: 100, cols: 50, rendererEvery: 0 });
    const spy = vi.spyOn(DataLayer.prototype, 'getData');
    // ⓐ 스크롤 rAF 길(VirtualScroll.onRender)
    spy.mockClear();
    // C7(스크롤 「같으면 안 그림」) 뒤: 한 행(32px)은 위아래 여유 안이라 그리지 않음 → 여유 밖(10행)으로 옮겨 그리기 1회.
    s.wrap.scrollTo(32 * 10, null);
    await frames(1);
    const viaScroll = { getData: spy.mock.calls.length, renderBody: s.c.read().renderBody, rows: s.container.querySelectorAll('.og-body [role="row"]').length };
    // ⓑ 통째 길(_doRender(...visRange)) — writeCell 이 이 길을 부른다(잼 NR-11)
    s.c.reset(); spy.mockClear();
    s.grid.writeCell(0, 'c0', 'r0c0');
    const viaWindow = { getData: spy.mock.calls.length, renderBody: s.c.read().renderBody, rows: s.container.querySelectorAll('.og-body [role="row"]').length };
    spy.mockRestore();
    // T0: viaWindow 2,953 = 칸 2,950(59행 × 50) + writeCell 자기 길의 3번(잼). C0 뒤: 칸 0 + writeCell 길 1
    const fact = { viaScroll, viaWindow, perCell: viaScroll.getData / (viaScroll.rows * 50) };
    save('U-FLAT-02', fact);
    // C7(그리는 범위를 세로 창 하나로): 통째 길의 그린 행 59 → 30. 스크롤 양은 위아래 여유 밖(10행)으로 — 한 행이면 「같으면 안 그림」으로 0회.
    // T0 값: viaScroll getData 1,500 · viaWindow 2,953 · perCell 1 → 걸음 C0 뒤 0 · 1(writeCell 자기 길) · 0 (줄기만 함). T0 값은 T0_FACTS.json 에 그대로.
    expect(fact).toEqual({ viaScroll: { getData: 0, renderBody: 1, rows: 30 }, viaWindow: { getData: 1, renderBody: 1, rows: 30 }, perCell: 0 });
    disposeW(s);
  });
});

describe('T0_FACTS — 편집', () => {
  it('I-ED-06 창 밖 칸 편집을 시작하는 공개 메서드가 있는가 — 없음(OpenGrid 공개 메서드 이름 전수)', () => {
    const { grid, container } = makeGrid({ columns: [{ field: 'a', header: 'A' }] }, [{ a: 1 }]);
    const proto = Object.getPrototypeOf(grid);
    const names = Object.getOwnPropertyNames(proto).filter(k => k !== 'constructor' && !k.startsWith('_') && typeof (proto as any)[k] === 'function');
    const editStarters = names.filter(n => /^(start|begin|open)?(cell)?edit(or|ing)?(cell)?$/i.test(n) || /^(startEdit|beginEdit|editCell|openEditor|startEditing)$/.test(n));
    save('I-ED-06', { exists: editStarters.length > 0, found: editStarters, publicMethodCount: names.length, nearest: names.filter(n => /jumpTo|focus|activate/i.test(n)) });
    expect(editStarters).toEqual([]);
    grid.destroy(); container.remove();
  });

  it('I-ED-05 편집 중 다른 머리글 click → 편집이 끝나는가 · 값이 저장되는가(지금 값)', async () => {
    const { grid, container } = makeGrid({
      columns: [{ field: 'a', header: 'A', editable: true }, { field: 'b', header: 'B', editable: true }],
      sortable: true, editable: true,
    }, [{ a: 'x2', b: 2 }, { a: 'x1', b: 1 }, { a: 'x3', b: 3 }], { width: 800, height: 400 });
    await settle();
    (grid as any)._doRender(...(grid as any)._visRange());
    const cell = container.querySelector<HTMLElement>('[role="row"][aria-rowindex="1"] [role="gridcell"][aria-colindex="1"]')!;
    fire(cell, 'dblclick');
    await settle();
    const input = container.querySelector<HTMLInputElement>('.og-editing input, .og-editing textarea');
    const opened = !!input;
    if (input) { input.value = 'EDITED'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    fire(th(container, 'B'), 'click');
    await settle();
    const stillOpen = !!container.querySelector('.og-editing input, .og-editing textarea');
    const lenBefore = 3;
    const raw = grid.getData();
    const data = raw.map((r: any) => ({ a: r.a, b: r.b }));
    const savedAnywhere = data.some(r => r.a === 'EDITED');
    const fact = { lenBefore, lenAfter: raw.length, sourceA: grid.getSourceRows().map((r: any) => r.a), editorOpened: opened, editorOpenAfterHeaderClick: stillOpen, valueSaved: savedAnywhere, orderAfter: pick(data, 'b'), sortList: (grid as any)._sfMgr?.sortList ?? null };
    save('I-ED-05', fact);
    expect({ editorOpened: fact.editorOpened, editorOpenAfterHeaderClick: fact.editorOpenAfterHeaderClick, valueSaved: fact.valueSaved, orderAfter: fact.orderAfter })
      .toEqual(I_ED_05);
    grid.destroy(); container.remove();
  });
});

describe('T0_FACTS — 정렬', () => {
  it('U-STORE-16 수식 칸이 있는 열을 정렬하면 지금 코드는 무엇으로 비교하나(원문 값 / 계산 값)', () => {
    const { grid, container } = makeGrid({
      columns: [{ field: 'a', header: 'A', type: 'number', editable: true }, { field: 'f', header: 'F', type: 'number', editable: true }],
      sortable: true,
    }, [{ a: 5, f: 1 }, { a: 1, f: 50 }, { a: 3, f: 75 }]); // 원문 f 순서와 계산 f 순서가 갈리게(원문 1 → 계산 80)
    // f 열 첫 행(flat0)에 =A1*2 (A1 = 5 → 10), 그 뒤 A1 을 40 으로 → 80
    grid.setCellFormula(0, 'f', '=A1*2');
    grid.writeCell(0, 'a', 40);
    const rawF = grid.getSourceRows().map((r: any) => r.f);
    const shownF = [0, 1, 2].map(i => { const v: any = grid.readCell(i, 'f'); return typeof v?.toNumber === 'function' ? v.toNumber() : v; });
    grid.orderBy('f', 'asc');
    const got = grid.getData().map((r: any) => r.a);
    const byRaw = legacySortIndexes(rawF.map(f => ({ f })), [0, 1, 2], [{ field: 'f', dir: 'asc' }]);
    const byShown = legacySortIndexes(shownF.map(f => ({ f })), [0, 1, 2], [{ field: 'f', dir: 'asc' }]);
    const aBefore = [40, 1, 3];
    const fact = { rawF, shownF, orderA: got, matchesRawRowValue: JSON.stringify(got) === JSON.stringify(byRaw.map(i => aBefore[i])), matchesComputed: JSON.stringify(got) === JSON.stringify(byShown.map(i => aBefore[i])) };
    save('U-STORE-16', fact);
    expect({ matchesRawRowValue: fact.matchesRawRowValue, matchesComputed: fact.matchesComputed }).toEqual(U_STORE_16);
    grid.destroy(); container.remove();
  });

  it('U-EST-03 n=10만 옛 비교자 Array.sort 시간 순서(숫자·글자·섞임) — 기록만(시간 단언 없음)', () => {
    const n = 100000;
    const r = mulberry32(20261121);
    const nums = Array.from({ length: n }, () => Math.floor(r() * 1e6));
    const strs = Array.from({ length: n }, () => 'k' + Math.floor(r() * 1e9).toString(36) + 'x'.repeat(20));
    const mixed = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? Math.floor(r() * 1e6) : i % 3 === 1 ? 'm' + Math.floor(r() * 1e9).toString(36) : null));
    const time = (vals: any[]) => {
      const ts: number[] = [];
      for (let k = 0; k < 5; k++) {
        const idx = vals.map((_, i) => i);
        const t0 = performance.now();
        idx.sort((a, b) => legacySortCompare(vals[a], vals[b]));
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      return +ts[2]!.toFixed(1);
    };
    const fact = { env: 'node(vitest jsdom 프로세스) · 5번 중앙값 ms · 옛 비교자 그대로', number: time(nums), string: time(strs), general: time(mixed) };
    const order = Object.entries({ number: fact.number, string: fact.string, general: fact.general }).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    save('U-EST-03', { ...fact, slowToFast: order });
    expect(order.length).toBe(3);
  }, 120000);
});

// 지금 값(잰 뒤 채움 — 2026-11-21 T0)
// jsdom: click 만 보냄(mousedown·blur 없음) → 편집기가 본문 다시 그리기에 지워지며 값이 버려진다. 실제 Chromium 값은 e2e wg-nr-baseline 「I-ED-05c」.
const I_ED_05 = { editorOpened: true, editorOpenAfterHeaderClick: false, valueSaved: false, orderAfter: [1, 2, 3] };
const U_STORE_16 = { matchesRawRowValue: false, matchesComputed: true }; // 정렬은 수식 계산 값을 본다(원문 자료 f=1 이 아니라 계산 80)

void wColumns; void wRows; void bodyCell;
