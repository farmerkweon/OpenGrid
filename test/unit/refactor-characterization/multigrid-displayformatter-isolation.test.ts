/**
 * R0 CHARACTERIZATION → R1 FIXED — P0 defect: module-global displayFormatter resolver (DIP violation).
 * STATUS: fixed in R1 (module global removed; displayFormatter now flows per-instance via
 * getDisplayValue → RenderContext.displayValue). The narrative below documents the original defect.
 *
 * Evidence: CellRenderer.ts:33-41 declares a MODULE-LEVEL mutable `_displayFormatterResolver`.
 * Every OpenGrid constructor overwrites it (OpenGrid.ts:347) with a closure over THAT grid's
 * `this._ovk`. On a multi-grid page, the LAST-constructed grid's resolver wins for the renderer
 * -side format path (`formatNumber`/`formatDate`, CellRenderer.ts:93-96,146-149) used by ALL grids.
 *
 * There are TWO formatter paths and they behave differently:
 *   (a) per-instance SAFE path — OpenGrid.getDisplayValue (OpenGrid.ts:1211) reads `this._ovk`
 *       directly → correctly isolated per grid. Reached only when the grid itself has an override
 *       or a `displayFormatter` strategy (the getDisplayText gate at OpenGrid.ts:423-426).
 *   (b) renderer-side MODULE-GLOBAL path — `formatNumber`/`formatDate` consult the single module
 *       global. Reached when a grid falls back to its cell renderer's own formatting (no override/
 *       strategy on THAT grid). This path LEAKS across grids.
 *
 * Reproduction fidelity (honest): the leak is reproduced at the exported module-function level —
 * which is exactly the code a NumberCellRenderer/DateCellRenderer executes during paint. A full
 * DOM paint reproduction is unreliable under jsdom (no layout → VirtualScroll windowing is
 * degenerate), so we assert on the module functions + the per-instance safe path directly.
 *
 * Design refs: 90_final_design.md §2.7 R-6a/R-6b, §3.3 (DIP fix), A3; 00_current_architecture.md
 *   §3.4-2, §6 P0-2.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid';
import { formatNumber, formatDate } from '../../../src/core/renderers/CellRenderer';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

afterEach(() => {
  // R1: renderer-side module global removed — no resolver reset needed.
  document.body.innerHTML = '';
});

const columns = [
  { field: 'name',   header: 'name', width: 120 },
  { field: 'salary', header: 'salary', width: 100, type: 'number' as const },
];
const sample = [
  { name: 'A', salary: 100 },
  { name: 'B', salary: 200 },
];

function makeGrid() {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  return new OpenGrid(el, { columns, height: 400 });
}

describe('R0/R1: multi-grid displayFormatter isolation (P0 module-global defect → fixed)', () => {
  it('R1 FIXED: renderer-side formatNumber/formatDate are pure — no cross-grid leak', () => {
    const gridA = makeGrid();
    gridA.setData(sample.map(r => ({ ...r })));
    gridA.override.strategy('displayFormatter', (v: any) => `A:${v}`);

    const gridB = makeGrid();
    gridB.setData(sample.map(r => ({ ...r })));
    gridB.override.strategy('displayFormatter', (v: any) => `B:${v}`);

    // R1: the module global is gone. formatNumber/formatDate are pure — a grid's custom
    // formatter no longer leaks into the shared renderer-side format functions.
    expect(formatNumber(100, '#,##0', undefined, undefined, 'salary', {})).toBe('100');
    expect(formatDate('2024-01-02', 'yyyy-MM-dd', 'name', {})).toBe('2024-01-02');

    // The per-instance SAFE path (getDisplayValue) stays correctly isolated per grid.
    expect(gridA.getDisplayValue(0, 'salary')).toBe('A:100');
    expect(gridB.getDisplayValue(0, 'salary')).toBe('B:100');

    gridA.destroy();
    gridB.destroy();
  });

  // R1 DONE: flipped it.fails -> it (module global removed; the default-format assertion now holds).
  // A grid with NO custom formatter must render numbers with the DEFAULT format, unaffected by any
  // other grid on the page.
  it('a plain grid must NOT inherit another grid\'s displayFormatter (number path)', () => {
    const gridA = makeGrid();            // no strategy → should use default number formatting
    gridA.setData(sample.map(r => ({ ...r })));

    const gridB = makeGrid();            // constructed last → owns the module global
    gridB.setData(sample.map(r => ({ ...r })));
    gridB.override.strategy('displayFormatter', (v: any) => `B:${v}`);

    // Grid A's cell renderer path — must be the plain default, NOT 'B:100'.
    expect(formatNumber(100, '#,##0', undefined, undefined, 'salary', {})).toBe('100');

    gridA.destroy();
    gridB.destroy();
  });

  // R1 DONE: flipped it.fails -> it.
  it('a plain grid must NOT inherit another grid\'s displayFormatter (date path)', () => {
    const gridA = makeGrid();
    gridA.setData(sample.map(r => ({ ...r })));

    const gridB = makeGrid();
    gridB.setData(sample.map(r => ({ ...r })));
    gridB.override.strategy('displayFormatter', (v: any) => `B:${v}`);

    // Grid A's date rendering must be the plain default, NOT 'B:2024-01-02'.
    expect(formatDate('2024-01-02', 'yyyy-MM-dd', 'name', {})).toBe('2024-01-02');

    gridA.destroy();
    gridB.destroy();
  });
});
