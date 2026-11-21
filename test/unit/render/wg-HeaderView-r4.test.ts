// 넓은 그리드 새 그물 — 걸음 R4 의 머리글 몫(테스트 설계서 §2-26 U-HV-07 · §9 AR-01·02 의 머리글 파일판).
// 머리글의 폭·고정 left·여분 칸 left·표 전체 폭이 컬럼 기하(ColumnGeometry·ExtraColumns)에서 나오는지,
// 그리고 그 값이 지금 화면 값과 같은지(골든 DOM 바이트 비교는 wg-golden-dom 이 따로 맡음).
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { installSceneEnv, makeSceneContainer, tick, disposeScene, cols, rows } from '../wg-helpers/scenes.js';
import { OpenGrid } from '../../../src/core/OpenGrid.js';

let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());
afterEach(() => vi.restoreAllMocks());

function mount(options: Record<string, any>) {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, { rowHeight: 32, headerHeight: 40, columns: cols(), ...options } as any);
  grid.setData(rows(30));
  return { grid, container };
}
const leafThs = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.og-header-table th.og-header-cell:not(.og-extra-col)'));
const extraThs = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.og-header-table th.og-extra-col'));

describe('HeaderView — 걸음 R4 (머리글 폭은 컬럼 기하에서)', () => {
  it('U-HV-07 고정 th left 는 기하에서 — frozen 2 + 여분 80 → th0·th1 left = leftOf(0)·leftOf(1) = 80·200', async () => {
    const spy = vi.spyOn(ColumnGeometry.prototype, 'leftOf');
    const s = mount({ frozenColumns: 2, rowNumber: true, checkColumn: true });
    await tick();
    const ths = leafThs(s.container);
    expect(ths[0]!.style.left).toBe('80px');
    expect(ths[1]!.style.left).toBe('200px');
    expect(ths[2]!.style.left).toBe('');
    const g = new ColumnGeometry(new Array(8).fill(120), ExtraColumns.fromOptions({ rowNumber: true, checkColumn: true }), 2);
    expect(ths[0]!.style.left).toBe(`${g.leftOf(0 as any)}px`);
    expect(ths[1]!.style.left).toBe(`${g.leftOf(1 as any)}px`);
    // 머리글이 따로 세지 않고 기하에 물었다
    expect(spy).toHaveBeenCalled();
    disposeScene(s);
  });

  it('R4-HV-a 여분 칸 sticky left 와 폭 = ExtraColumns(여분 전부 + 고정)', async () => {
    const s = mount({
      frozenColumns: 1, stateColumn: true, draggable: true, rowNumber: true, checkColumn: true,
      masterDetail: { enabled: true, height: 40, renderer: () => {} },
    });
    await tick();
    const e = ExtraColumns.fromOptions({ stateColumn: true, draggable: true, rowNumber: true, checkColumn: true, detailExpanderCol: true });
    const ths = extraThs(s.container);
    expect(ths.map(t => t.style.width)).toEqual(e.ids.map(id => `${e.widthOf(id)}px`));
    expect(ths.map(t => t.style.left)).toEqual(e.ids.map(id => `${e.leftOf(id)}px`));
    expect(ths.map(t => t.style.left)).toEqual(['0px', '24px', '42px', '86px', '122px']);
    expect(leafThs(s.container)[0]!.style.left).toBe('150px');
    disposeScene(s);
  });

  it('R4-HV-b 표 전체 폭 = totalWidth (디테일 펼침 칸 28 포함 — 머리글은 H-4 를 안 탐)', async () => {
    const spy = vi.spyOn(ColumnGeometry.prototype, 'totalWidth');
    const s = mount({ rowNumber: true, masterDetail: { enabled: true, height: 40, renderer: () => {} } });
    await tick();
    const table = s.container.querySelector<HTMLElement>('.og-header-table')!;
    expect(table.style.width).toBe(`${44 + 28 + 8 * 120}px`);
    expect(spy).toHaveBeenCalled();
    disposeScene(s);
  });

  it('R4-HV-c 잎 th 폭 = widthOf (cssText 앞머리 그대로 — appearance-resolver 단언과 같은 꼴)', async () => {
    const spy = vi.spyOn(ColumnGeometry.prototype, 'widthOf');
    const s = mount({ columns: cols(3).map((c, i) => ({ ...c, width: [100, 150.5, 80][i] })) });
    await tick();
    const ths = leafThs(s.container);
    expect(ths.map(t => t.style.width)).toEqual(['100px', '150.5px', '80px']);
    expect(ths[0]!.style.cssText.startsWith('width: 100px; min-width: 100px;')).toBe(true);
    expect(spy).toHaveBeenCalled();
    disposeScene(s);
  });

  it('AR-01·02(머리글 파일) 여분 폭 상수 합·고정 left 누적 코드 0', () => {
    const src = readFileSync(resolve(__dirname, '../../../src/core/render/header/HeaderView.ts'), 'utf8');
    expect(src.match(/(?:\+=|\+)\s*(?:24|18|44|36|28)\b/g) ?? []).toEqual([]);
    expect(src.match(/stateColumn\s*\?\s*\d+|rowNumber\s*\?\s*\d+/g) ?? []).toEqual([]);
    expect(src.match(/left\s*\+=\s*[^;]*(?:width|Width)|frozenLeft|stickyLeft\s*\+=/g) ?? []).toEqual([]);
    expect(src.match(/DETAIL_COL_W|_extraW|leftOff\b|extraHeaderLeft/g) ?? []).toEqual([]);
  });
});
