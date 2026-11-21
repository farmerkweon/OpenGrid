/**
 * R4 코드 검토 R4-9(시험 구멍) — 돌연변이 M4b(본문 그리기가 기하를 맞추지 않고 낡은 기하로 그림)·M8(빈 폭을 기본 폭 대신 100 으로)이
 * 그물에서 살아남았다. 그 둘을 죽이는 장면 둘. L19(TEST).
 *
 * R4-9a: 컨테이너 폭 0(폭 재기가 일찍 끝나 폭 배열이 빈 채) + defaultColumnWidth 77(≠ 100) + 병합이 끝을 넘음.
 *        모든 칸 폭은 기본 폭 77 에서 와야 하고, 끝을 넘은 병합은 넘은 몫도 기본 폭으로 더한다.
 * R4-9b: 폭 다시 재기(recalcWidths) 뒤 본문 그리기(_doRender)만 불러도 본문이 새 폭으로 그려진다(머리글은 안 부름).
 * 기대 값은 걸음 전 코드(review/tmp_r4/pre/src)에서도 같다 — steps/R5678/TEST/R4-9.md.
 * 내부 접근(진단, 지킬 이음새): grid._render.recalcWidths · grid._doRender · grid._visRange · grid._colWidths.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installResizeObserverStub, makeContainer, settle } from './widegrid-helpers.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => installResizeObserverStub());

const cols = (n: number) => Array.from({ length: n }, (_, i) => ({ field: `c${i}`, header: `H${i}` }));
const data = (rows: number, n: number) => Array.from({ length: rows }, (_, r) => Object.fromEntries(Array.from({ length: n }, (_, c) => [`c${c}`, `r${r}c${c}`])));
const px = (s: string) => parseFloat(s);
const leafThWidths = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.og-header-cell:not(.og-extra-col)')).map(t => px(t.style.width));
const rowCellWidths = (c: HTMLElement, ri: number) => Array.from(c.querySelectorAll<HTMLElement>(`.og-body [role="row"][aria-rowindex="${ri + 1}"] [role="gridcell"]`)).map(x => px(x.style.width));

describe('R4-9 빈 폭 채우기 · 그리기 전 기하 맞춤', () => {
  it('R4-9a 컨테이너 폭 0 · defaultColumnWidth 77 · 병합이 끝을 넘음 — 칸 폭 77, 병합 폭 = 77 × 덮는 칸 수(넘은 몫 포함)', async () => {
    const container = makeContainer(0, 400);
    const grid = new OpenGrid<any>(container, { columns: cols(6), defaultColumnWidth: 77 } as any);
    grid.setData(data(20, 6));
    grid.mergeCells([{ row: 1, col: 4, colSpan: 4 }]);   // c4·c5 + 끝을 넘은 둘
    await settle();
    // 폭 0 컨테이너에서는 크기 바뀜 처리가 일찍 끝나 머리글이 안 그려진다 — 머리글·본문을 이음새로 한 번 그림(폭 배열은 빈 채)
    (grid as any)._renderHeader();
    (grid as any)._doRender(...(grid as any)._visRange());
    expect((grid as any)._colWidths?.length ?? 0, '폭 배열이 비어 있어야 이 장면이 뜻을 가짐').toBe(0);
    expect(leafThWidths(container)).toEqual([77, 77, 77, 77, 77, 77]);
    expect(rowCellWidths(container, 0)).toEqual([77, 77, 77, 77, 77, 77]);
    expect(rowCellWidths(container, 1)).toEqual([77, 77, 77, 77, 77 * 4]);
    expect(px((container.querySelector('.og-body') as HTMLElement).style.minWidth)).toBe(77 * 6);
    grid.destroy(); container.remove();
  });

  it('R4-9b recalcWidths 뒤 본문 그리기(_doRender)만 불러도 본문 칸이 새 폭 — 머리글을 다시 안 그려도', async () => {
    const container = makeContainer(1200, 400);
    // flex 컬럼이라 다시 잰 전체 폭(600)에 따라 폭이 바뀐다
    const grid = new OpenGrid<any>(container, { columns: cols(6).map(x => ({ ...x, flex: 1 })) } as any);
    grid.setData(data(20, 6));
    await settle();
    (grid as any)._doRender(...(grid as any)._visRange());
    const before = rowCellWidths(container, 0);
    (grid as any)._render.recalcWidths(600);            // 폭만 다시 잼(머리글·본문 안 그림)
    const now = [...(grid as any)._colWidths] as number[];
    expect(now).not.toEqual(before);                     // 폭이 실제로 바뀌어야 시험이 뜻을 가짐
    (grid as any)._doRender(...(grid as any)._visRange()); // 본문만
    expect(rowCellWidths(container, 0)).toEqual(now);
    grid.destroy(); container.remove();
  });
});
