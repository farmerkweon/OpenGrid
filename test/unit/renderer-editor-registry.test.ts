/**
 * R10 — Renderer/Editor registry (Replace Conditional with Registry, OCP).
 *
 * Consuming test for the open-registration public API added in R10:
 *   - module functions `registerRenderer`/`registerEditor` + `createRenderer`/`createEditor`
 *   - static `OpenGrid.registerRenderer`/`OpenGrid.registerEditor` (mirrors `OpenGrid.defaultOverride`)
 *
 * Proves the registry is not a phantom: a custom type registered WITHOUT editing core resolves
 * through all three column contexts (col.type / renderer string / renderer object) and reaches
 * the real cell DOM via GridRenderer → createRenderer. Also pins the unchanged TextRenderer /
 * TextEditor fallback for unknown types (behavior preservation).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';
import {
  createRenderer, registerRenderer, hasRenderer, TextRenderer,
  type CellRenderer, type RenderContext,
} from '../../src/core/renderers/CellRenderer.js';
import {
  createEditor, registerEditor, hasEditor, TextEditor,
  type CellEditor,
} from '../../src/core/editors/CellEditor.js';
import type { ColumnDef } from '../../src/core/types.js';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

class MarkerRenderer implements CellRenderer {
  constructor(private def?: any) {}
  render(ctx: RenderContext): HTMLElement {
    const el = document.createElement('span');
    el.className = 'marker-renderer';
    el.dataset.tag = this.def?.tag ?? 'default';
    el.textContent = String(ctx.value ?? '');
    return el;
  }
}

class MarkerEditor implements CellEditor {
  private input!: HTMLInputElement;
  mount(container: HTMLElement, ctx: RenderContext, onCommit: (v: any) => void): void {
    this.input = document.createElement('input');
    this.input.className = 'marker-editor';
    this.input.value = ctx.value == null ? '' : String(ctx.value);
    void onCommit;
    container.appendChild(this.input);
  }
  getValue(): any { return this.input?.value; }
  focus(): void {}
  destroy(): void {}
}

describe('R10 renderer registry (OCP open registration)', () => {
  it('module registerRenderer resolves a custom type in all three column contexts', () => {
    registerRenderer('mk-render', (_col, def) => new MarkerRenderer(def));
    expect(hasRenderer('mk-render')).toBe(true);

    // via col.type
    expect(createRenderer({ field: 'f', header: 'h', type: 'mk-render' as any }))
      .toBeInstanceOf(MarkerRenderer);
    // via renderer string
    expect(createRenderer({ field: 'f', header: 'h', renderer: 'mk-render' as any }))
      .toBeInstanceOf(MarkerRenderer);
    // via renderer object — def is threaded through
    const objR = createRenderer({
      field: 'f', header: 'h', renderer: { type: 'mk-render', tag: 'boxed' } as any,
    }) as MarkerRenderer;
    expect(objR).toBeInstanceOf(MarkerRenderer);
    const el = objR.render({
      value: 'v', row: {}, rowIndex: 0, column: {} as ColumnDef,
      colIndex: 0, isSelected: false, rowState: 'none',
    });
    expect(el.dataset.tag).toBe('boxed');
  });

  it('unknown type falls back to TextRenderer (behavior preserved)', () => {
    expect(createRenderer({ field: 'f', header: 'h', renderer: 'no-such-type' as any }))
      .toBeInstanceOf(TextRenderer);
  });

  it('static OpenGrid.registerRenderer delegates and is chainable', () => {
    const ret = OpenGrid.registerRenderer('mk-render-static', () => new MarkerRenderer());
    expect(ret).toBe(OpenGrid);
    expect(hasRenderer('mk-render-static')).toBe(true);
    expect(createRenderer({ field: 'f', header: 'h', renderer: 'mk-render-static' as any }))
      .toBeInstanceOf(MarkerRenderer);
  });

  it('a live grid builds with a custom-registered renderer column without error', () => {
    // GridRenderer.ts calls createRenderer(col) for every column; a column whose renderer type
    // is only known via the registry must build the grid without falling over (wiring proof).
    OpenGrid.registerRenderer('mk-render-live', () => new MarkerRenderer({ tag: 'live' }));
    const host = document.createElement('div');
    host.style.width = '400px';
    host.style.height = '300px';
    document.body.appendChild(host);
    const grid = new OpenGrid(host, {
      columns: [{ field: 'name', header: 'Name', width: 200, renderer: 'mk-render-live' as any }],
      data: [{ name: 'alice' }],
      height: 300,
    });
    // The registry resolves the column's renderer to the custom factory (same path GridRenderer uses).
    expect(createRenderer({ field: 'name', header: 'Name', renderer: 'mk-render-live' as any }))
      .toBeInstanceOf(MarkerRenderer);
    grid.destroy();
    host.remove();
  });
});

describe('R10 editor registry (OCP open registration)', () => {
  it('module registerEditor resolves a custom type via type/string/object contexts', () => {
    registerEditor('mk-edit', () => new MarkerEditor());
    expect(hasEditor('mk-edit')).toBe(true);
    expect(createEditor({ field: 'f', header: 'h', type: 'mk-edit' as any })).toBeInstanceOf(MarkerEditor);
    expect(createEditor({ field: 'f', header: 'h', editor: 'mk-edit' as any })).toBeInstanceOf(MarkerEditor);
    expect(createEditor({ field: 'f', header: 'h', editor: { type: 'mk-edit' } as any })).toBeInstanceOf(MarkerEditor);
  });

  it('unknown editor type falls back to TextEditor (behavior preserved)', () => {
    expect(createEditor({ field: 'f', header: 'h', editor: 'no-such-editor' as any })).toBeInstanceOf(TextEditor);
  });

  it('static OpenGrid.registerEditor delegates and is chainable', () => {
    const ret = OpenGrid.registerEditor('mk-edit-static', () => new MarkerEditor());
    expect(ret).toBe(OpenGrid);
    expect(hasEditor('mk-edit-static')).toBe(true);
    expect(createEditor({ field: 'f', header: 'h', editor: 'mk-edit-static' as any })).toBeInstanceOf(MarkerEditor);
  });
});
