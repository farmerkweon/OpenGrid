// DD-14 §7 arch:check 정적 적합성 함수 — 의존방향·헤드리스 전역 위반 탐지.
// negative test(일부러 심은 위반)로 규칙 민감도 상시 검증(§8 리스크5).
import { describe, it, expect } from 'vitest';
import { archCheck, formatViolations } from '../../../src/core/host/archCheck.js';

describe('DD-14 archCheck (REQ-TX-845 / T6-804 / §7.1)', () => {
  it('clean core file → 0 violations', () => {
    const v = archCheck([
      {
        path: 'src/core/coordinate/CoordinateKernel.ts',
        content: `import type { Px } from './types.js';\nexport class K { place() { return 1; } }\n`,
      },
    ]);
    expect(v).toEqual([]);
  });

  it('NEGATIVE: core importing react is flagged (core-imports-framework)', () => {
    const v = archCheck([
      {
        path: 'src/core/OpenGrid.ts',
        content: `import { useEffect } from 'react';\nexport const x = 1;\n`,
      },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('core-imports-framework');
    expect(v[0].line).toBe(1);
  });

  it('NEGATIVE: core importing a framework adapter path is flagged', () => {
    const v = archCheck([
      {
        path: 'src/core/GridRenderer.ts',
        content: `import { Foo } from '../vue/OpenGrid.vue';\n`,
      },
    ]);
    expect(v.some((x) => x.rule === 'core-imports-framework')).toBe(true);
  });

  it('NEGATIVE: DOM global in a headless dir is flagged (headless-dom-global)', () => {
    const v = archCheck([
      {
        path: 'src/core/coordinate/RowMetrics.ts',
        content: `export function bad() { return document.body.clientHeight; }\n`,
      },
    ]);
    expect(v.some((x) => x.rule === 'headless-dom-global')).toBe(true);
  });

  it('NEGATIVE: getComputedStyle in headless core is flagged', () => {
    const v = archCheck([
      {
        path: 'src/core/coordinate/ResizeGovernor.ts',
        content: `export function m(el) { return getComputedStyle(el).height; }\n`,
      },
    ]);
    expect(v.some((x) => x.rule === 'getcomputedstyle-scope')).toBe(true);
  });

  it('NEGATIVE: aria-* setAttribute in core/a11y is flagged (a11y-aria-write)', () => {
    const v = archCheck([
      {
        path: 'src/core/a11y/AccessibilityAdapter.ts',
        content: `export function bad(el) { el.setAttribute('aria-label', 'x'); }\n`,
      },
    ]);
    expect(v.some((x) => x.rule === 'a11y-aria-write')).toBe(true);
  });

  it('DOM global inside a comment is NOT flagged (comment stripping)', () => {
    const v = archCheck([
      {
        path: 'src/core/coordinate/RowMetrics.ts',
        content: `// this reads the document box downstream\n/* window sizing */\nexport const x = 1;\n`,
      },
    ]);
    expect(v).toEqual([]);
  });

  it('NEGATIVE(§7.1 확장): getComputedStyle in appearance core is flagged', () => {
    const v = archCheck([
      {
        path: 'src/core/appearance/TokenAxis.ts',
        content: `export function bad(el) { return getComputedStyle(el).color; }\n`,
      },
    ]);
    expect(v.some((x) => x.rule === 'getcomputedstyle-scope')).toBe(true);
  });

  it('NEGATIVE(§7.1 확장): canvas symbol in chart core is flagged', () => {
    const v = archCheck([
      {
        path: 'src/core/chart/scene.ts',
        content: `export function bad(c: HTMLCanvasElement) { return c.getContext('2d'); }\n`,
      },
    ]);
    expect(v.some((x) => x.rule === 'headless-dom-global')).toBe(true);
  });

  it('boundary adapter CanvasAdapter.ts is exempt (유일 canvas 렌더 어댑터)', () => {
    const v = archCheck([
      {
        path: 'src/core/chart/CanvasAdapter.ts',
        content: `export function m() { const c = document.createElement('canvas'); return getComputedStyle(c); }\n`,
      },
    ]);
    expect(v).toEqual([]);
  });

  it('boundary adapter ResolvedAppearanceSnapshot.ts is exempt (유일 getComputedStyle 접점)', () => {
    const v = archCheck([
      {
        path: 'src/core/appearance/ResolvedAppearanceSnapshot.ts',
        content: `export function snap(el) { return window.getComputedStyle(el as Element); }\n`,
      },
    ]);
    expect(v).toEqual([]);
  });

  it('boundary dir (src/core/host) is exempt from headless + framework rules', () => {
    const v = archCheck([
      {
        path: 'src/core/host/GridHostDriver.ts',
        content: `const RE = /document|window/;\nfunction mount(el: HTMLElement) { return el; }\n`,
      },
    ]);
    expect(v).toEqual([]);
  });

  it('type-only comment mention of framework is not a runtime import', () => {
    const v = archCheck([
      {
        path: 'src/core/types.ts',
        content: `// works with react and vue\nexport interface GridOptions {}\n`,
      },
    ]);
    expect(v).toEqual([]);
  });

  it('formatViolations reports OK when clean and a list when not', () => {
    expect(formatViolations([])).toContain('OK');
    const v = archCheck([
      { path: 'src/core/x.ts', content: `import 'react';\nimport { a } from 'react';\n` },
    ]);
    expect(formatViolations(v)).toContain('FAILED');
  });
});
