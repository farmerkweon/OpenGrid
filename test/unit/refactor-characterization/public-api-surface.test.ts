/**
 * R0 CHARACTERIZATION — public API surface freeze (DeMarco M2b: "0 deletions").
 *
 * Enumerates the public method names on a constructed OpenGrid instance (own + full prototype
 * chain, excluding `_`-prefixed privates and the constructor, functions only), sorts them, and
 * asserts against the committed snapshot __fixtures__/public_api_surface.txt.
 *
 * Purpose: the refactor's safety line (90_final_design.md §2.8 R-7c, §5 M2b; charter safety line)
 * requires the public npm contract to shrink by ZERO. Every later increment (façade delegation,
 * ISP split, controller extraction) must keep this green — a removed method fails here immediately.
 * Growth (new methods) is allowed but must be a DELIBERATE snapshot update, so this also catches
 * accidental surface changes in review.
 *
 * NOTE: the snapshot intentionally includes inherited EventEmitter methods (on/off/once/emit/
 * removeAllListeners/listenerCount) and the ctor-assigned own function props (override/destroy) —
 * they are all part of the observable public surface.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenGrid } from '../../../src/core/OpenGrid';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function publicSurfaceOf(instance: any): string[] {
  const names = new Set<string>();
  let obj: any = instance;
  while (obj && obj !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(obj)) names.add(k);
    obj = Object.getPrototypeOf(obj);
  }
  return [...names]
    .filter(n => !n.startsWith('_'))
    .filter(n => n !== 'constructor')
    .filter(n => typeof instance[n] === 'function')
    .sort();
}

describe('R0: public API surface snapshot (freeze — 0 deletions)', () => {
  it('constructed OpenGrid exposes exactly the committed public method set', () => {
    const el = document.createElement('div');
    el.style.width = '600px';
    el.style.height = '400px';
    document.body.appendChild(el);
    const grid = new OpenGrid(el, {
      columns: [{ field: 'name', header: 'name', width: 120 }],
      height: 400,
    });

    const actual = publicSurfaceOf(grid);

    // vitest runs with cwd = project root; keep the path cwd-relative (jsdom import.meta.url is
    // not a file: URL under the vite transform).
    const fixturePath = resolve(
      process.cwd(),
      'test/unit/refactor-characterization/__fixtures__/public_api_surface.txt',
    );
    const expected = readFileSync(fixturePath, 'utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    // Deletions (methods that vanished vs snapshot) are the safety-line violation — surface must
    // never shrink. Report them explicitly for a clear failure message.
    const deletions = expected.filter(n => !actual.includes(n));
    expect(deletions).toEqual([]);

    // Full equality also pins accidental ADDITIONS — a new public method requires a deliberate
    // snapshot update (and a matching M2b review note).
    expect(actual).toEqual(expected);

    grid.destroy();
  });
});
