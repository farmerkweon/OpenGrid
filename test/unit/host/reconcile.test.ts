// DD-14 §2.4 reconcile — 구조 vs in-place 분류(4어댑터 공통 SSOT, REQ-T8-006).
import { describe, it, expect } from 'vitest';
import { reconcile, STRUCTURAL_KEYS } from '../../../src/core/host/reconcile.js';
import type { GridOptions } from '../../../src/core/types.js';

const base = { columns: [{ field: 'a' }] } as unknown as GridOptions;

describe('DD-14 reconcile (REQ-T8-006 상태 승계)', () => {
  it('data-only patch → surface (no recreate)', () => {
    const p = reconcile(base, { data: [{ a: 1 }] });
    expect(p.recreate).toBe(false);
    expect(p.data).toBe(true);
    expect(p.theme).toBe(false);
  });

  it('theme/skin patch → surface (no recreate) — live theming, state kept', () => {
    const p = reconcile(base, { theme: 'dark', skin: 'stitch' });
    expect(p.recreate).toBe(false);
    expect(p.theme).toBe(true);
    expect(p.skin).toBe(true);
  });

  it('columns patch → recreate (structural)', () => {
    const p = reconcile(base, { columns: [{ field: 'b' }] as any });
    expect(p.recreate).toBe(true);
  });

  it('structural option key → recreate', () => {
    for (const key of STRUCTURAL_KEYS) {
      const p = reconcile(base, { options: { [key]: true } as any });
      expect(p.recreate, `key=${key}`).toBe(true);
    }
  });

  it('non-structural option key → surface options (no recreate)', () => {
    const p = reconcile(base, { options: { sortable: true } as any });
    expect(p.recreate).toBe(false);
    expect(p.options).toBe(true);
  });

  it('empty patch → all false', () => {
    const p = reconcile(base, {});
    expect(p).toEqual({ recreate: false, data: false, theme: false, skin: false, options: false });
  });

  it('is a pure deterministic function (same input → same output)', () => {
    const patch = { data: [{ a: 2 }], theme: 'x' };
    expect(reconcile(base, patch)).toEqual(reconcile(base, patch));
  });
});
