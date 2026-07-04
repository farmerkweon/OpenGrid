/**
 * R11 — typed ExtensionPointRegistry over the (unchanged) OverrideKernel.
 *
 * Proves the broadened extension surface WITHOUT touching OverrideKernel internals:
 *  - RenderHookRegistry generalizes the single hard-coded getDisplayText gate; the FIRST hook
 *    reproduces the getDisplayValue display-text behavior identically (regression 0), and unset
 *    hooks stay zero-cost (gate short-circuits before resolve).
 *  - NEW render hooks beyond display-text (cellClass, ariaLabel) that the render layer consults
 *    only if registered — with consuming tests (DeMarco M9b: no phantom extension points).
 *  - Typed strategy slots, typed OverridePoints<T> override overload + preserved string escape
 *    hatch (UC-11), MutationHook before/after on the MutationService commit chokepoint.
 *  - Reversibility (restore/restoreAll) unchanged.
 *
 * Design refs: 90_final_design.md §4 (T3), §6-R11, §3.1 C7.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';
import {
  RenderHookRegistry,
  ExtensionPointRegistry,
  type RenderHook,
} from '../../src/core/ExtensionPointRegistry';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const columns = [
  { field: 'name', header: '이름', width: 120 },
  { field: 'salary', header: '급여', width: 100, type: 'number' as const },
];
const sample = [
  { name: '홍길동', salary: 5000000 },
  { name: '김철수', salary: 4200000 },
];

function makeGrid() {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  const g = new OpenGrid(el, { columns, height: 400 });
  g.setData(sample.map((r) => ({ ...r })));
  return g;
}

// ─── RenderHookRegistry (unit) ────────────────────────────
describe('RenderHookRegistry: generalized render hooks (§4.2)', () => {
  const mkHook = (id: string, gated: () => boolean, value: string): RenderHook => ({
    id,
    gate: gated,
    resolve: () => value,
  });

  it('preserves registration order (first registered = display-text slot)', () => {
    const reg = new RenderHookRegistry();
    reg.register(mkHook('displayText', () => true, 'a'));
    reg.register(mkHook('cellClass', () => true, 'b'));
    reg.register(mkHook('ariaLabel', () => true, 'c'));
    expect(reg.ids()).toEqual(['displayText', 'cellClass', 'ariaLabel']);
  });

  it('unset/gated-off hook is zero-cost: resolve is NOT invoked, returns null', () => {
    const reg = new RenderHookRegistry();
    let called = 0;
    reg.register({ id: 'x', gate: () => false, resolve: () => { called++; return 'v'; } });
    expect(reg.resolve('x', 0, 'f')).toBeNull();
    expect(reg.resolve('missing', 0, 'f')).toBeNull();
    expect(called).toBe(0); // gate short-circuited before resolve — zero cost preserved
  });

  it('gated-on hook resolves; activeIds reflects only open gates', () => {
    const reg = new RenderHookRegistry();
    let open = false;
    reg.register({ id: 'g', gate: () => open, resolve: () => 'live' });
    expect(reg.activeIds()).toEqual([]);
    open = true;
    expect(reg.resolve('g', 1, 'f')).toBe('live');
    expect(reg.activeIds()).toEqual(['g']);
  });
});

// ─── render hook #1: displayText = identical to getDisplayValue (regression 0) ───
describe('displayText render hook: identical to getDisplayValue (§4.2, regression 0)', () => {
  it('unset → zero-cost null; set strategy → matches getDisplayValue exactly', () => {
    const g = makeGrid();
    // No override/strategy → gate closed → null (same as the old getDisplayText ternary "else null").
    expect(g.extensions.resolveRenderHook('displayText', 0, 'salary')).toBeNull();

    g.override.strategy('displayFormatter', (v: any, f: string) =>
      f === 'salary' && v != null ? `₩${Number(v).toLocaleString('ko-KR')}` : v == null ? '' : String(v),
    );
    // Hook resolve is exactly getDisplayValue — byte-identical output.
    expect(g.extensions.resolveRenderHook('displayText', 0, 'salary')).toBe(g.getDisplayValue(0, 'salary'));
    expect(g.extensions.resolveRenderHook('displayText', 0, 'salary')).toBe('₩5,000,000');
    g.destroy();
  });

  it('the render layer (GridRenderer) is wired to resolve via the registry', () => {
    const g = makeGrid();
    g.override.strategy('displayFormatter', (v: any) => `D:${v}`);
    // The exact callback GridRenderer invokes per cell for the display-text channel.
    const cbs = (g as any)._renderer._cbs;
    expect(cbs.resolveRenderHook('displayText', 1, 'name')).toBe('D:김철수');
    g.destroy();
  });
});

// ─── render hook #2 (NEW): cellClass ──────────────────────
describe('NEW render hook: cellClass (§4.2 — proves generalization)', () => {
  it('unset → zero-cost null; set cellClassResolver strategy → resolves the class', () => {
    const g = makeGrid();
    expect(g.extensions.resolveRenderHook('cellClass', 0, 'salary')).toBeNull();

    g.override.strategy('cellClassResolver', (v: any, f: string) =>
      f === 'salary' && Number(v) >= 5000000 ? 'og-cell--high' : null,
    );
    expect(g.extensions.resolveRenderHook('cellClass', 0, 'salary')).toBe('og-cell--high');
    expect(g.extensions.resolveRenderHook('cellClass', 1, 'salary')).toBeNull(); // predicate false
    // The render layer's per-cell callback consults the same registry hook.
    const cbs = (g as any)._renderer._cbs;
    expect(cbs.resolveRenderHook('cellClass', 0, 'salary')).toBe('og-cell--high');
    g.destroy();
  });
});

// ─── render hook #3 (NEW): ariaLabel ──────────────────────
describe('NEW render hook: ariaLabel (§4.2)', () => {
  it('unset → null; set ariaLabelResolver strategy → resolves the label', () => {
    const g = makeGrid();
    expect(g.extensions.resolveRenderHook('ariaLabel', 0, 'name')).toBeNull();
    g.override.strategy('ariaLabelResolver', (v: any, f: string) => `${f} 값 ${v}`);
    expect(g.extensions.resolveRenderHook('ariaLabel', 0, 'name')).toBe('name 값 홍길동');
    g.destroy();
  });
});

// ─── typed strategy slots (§4.1 (a)) ──────────────────────
describe('typed strategy slots (§4.1) — no Function/any at the call site', () => {
  it('registry.strategy is typed and getStrategy falls back when unset (runtime unchanged)', () => {
    const g = makeGrid();
    const fallback = (v: any) => `FB:${v}`;
    // Unset → fallback returned (zero-cost getStrategy contract).
    expect(g.extensions.getStrategy('cellClassResolver', fallback)('z', 'f', {})).toBe('FB:z');
    g.extensions.strategy('sortComparator', (a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(g.extensions.hasStrategy('sortComparator')).toBe(true);
    g.destroy();
  });
});

// ─── typed override manifest + escape hatch (§4.3, T-ζ) ────
describe('typed OverridePoints manifest + escape hatch (§4.3)', () => {
  it('typed override("getDisplayValue") wraps like super (orig callable)', () => {
    const g = makeGrid();
    g.override('getDisplayValue', (orig: any, ri: number, f: string) => `X:${orig(ri, f)}`);
    expect(g.getDisplayValue(0, 'name')).toBe('X:홍길동');
    g.destroy();
  });

  it('escape hatch: string override of an arbitrary method still works (UC-11, wide door open)', () => {
    const g = makeGrid();
    // 'getRowAt' is NOT in the typed OverridePoints catalog → string escape-hatch path.
    g.override('getRowAt', (orig: any, ri: number) => ({ ...orig(ri), _wrapped: true }));
    expect((g.getRowAt(0) as any)._wrapped).toBe(true);
    g.destroy();
  });

  it('reversibility unchanged: restore + restoreAll return original behavior', () => {
    const g = makeGrid();
    g.override('getDisplayValue', (orig: any, ri: number, f: string) => `Y:${orig(ri, f)}`);
    expect(g.getDisplayValue(0, 'name')).toBe('Y:홍길동');
    g.restore('getDisplayValue');
    expect(g.getDisplayValue(0, 'name')).toBe('홍길동');

    g.override.strategy('displayFormatter', (v: any) => `Z:${v}`);
    expect(g.extensions.hasStrategy('displayFormatter')).toBe(true);
    g.restoreAll();
    expect(g.extensions.hasStrategy('displayFormatter')).toBe(false); // strategy cleared by restoreAll
    expect(g.getDisplayValue(0, 'name')).toBe('홍길동');
    g.destroy();
  });
});

// ─── MutationHook before/after (§4.1 (c), UC-10) ──────────
describe('MutationHook before/after on the commit chokepoint (§4.1)', () => {
  it('before hook can CANCEL a mutation (writeCell becomes a no-op)', () => {
    const g = makeGrid();
    g.extensions.beforeMutation('writeCell', (ctx) => ctx.cancel());
    g.writeCell(0, 'name', 'CHANGED');
    expect(g.getRowAt(0).name).toBe('홍길동'); // cancelled → unchanged
    g.destroy();
  });

  it('after hook OBSERVES a completed mutation', () => {
    const g = makeGrid();
    let seen = 0;
    g.extensions.afterMutation('writeCell', () => { seen++; });
    g.writeCell(0, 'name', 'OK');
    expect(g.getRowAt(0).name).toBe('OK');
    expect(seen).toBe(1);
    g.destroy();
  });
});

// ─── manifest / catalog (§4.3 R-3d) ───────────────────────
describe('extension catalog manifest (§4.3 R-3d)', () => {
  it('catalogs typed extension points across all categories; render hooks derived from registrations', () => {
    const g = makeGrid();
    const cat = g.extensions.catalog();
    const byCat = (c: string) => cat.filter((e) => e.category === c).map((e) => e.name);

    // render hook entries are DERIVED from actual registrations (no phantom points, M9b).
    expect(byCat('renderHook')).toEqual(['displayText', 'cellClass', 'ariaLabel']);
    expect(byCat('strategy')).toContain('cellClassResolver');
    expect(byCat('strategy')).toContain('ariaLabelResolver');
    expect(byCat('lifecycle')).toEqual(['before:mutation', 'after:mutation']);
    expect(byCat('escapeHatch')).toEqual(['override(name,fn)']);
    // ≥ 8 typed extension points catalogued (M9).
    expect(cat.length).toBeGreaterThanOrEqual(8);
    g.destroy();
  });

  it('ExtensionPointRegistry sits over the kernel without a paint — construct standalone', () => {
    // Registry is host-agnostic over the kernel: it can be built with just a kernel + trigMgr getter.
    const reg = new ExtensionPointRegistry({
      kernel: { strategy() {}, getStrategy: (_s: string, fb: any) => fb, hasStrategy: () => false, override() {} } as any,
      getTrigMgr: () => ({ add() {}, remove() {} }) as any,
    });
    reg.registerRenderHook({ id: 'displayText', gate: () => false, resolve: () => null });
    expect(reg.catalog().some((e) => e.category === 'renderHook' && e.name === 'displayText')).toBe(true);
  });
});
