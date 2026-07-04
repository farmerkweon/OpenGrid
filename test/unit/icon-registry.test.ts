/**
 * R12c — IconRegistry(계약 C13) + Bootstrap Icons(MIT) 임베드 + 서드파티 라이선스 테스트.
 *
 * 검증:
 *  1) render(role) 는 role 에 매핑된 아이콘 path 를 담은 <svg viewBox="0 0 16 16"> 를 반환.
 *  2) 스킨 토큰 결합: fill="currentColor" + stroke-linejoin:var(--og-icon-corner, …).
 *  3) 미지원 role 은 안전 폴백(빈 svg) — never throw.
 *  4) register/setIcon 오버라이드가 해석을 갈아끼운다(멀티그리드 격리 = child 레지스트리).
 *  5) 마스킹 눈(mask.reveal) 은 기존 커스텀 글리프와 시각 동일(두 path + 흰 동공).
 *  6) BOOTSTRAP_ICON_COUNT >= 60.
 *  7) THIRD_PARTY_LICENSES.txt 에 "Bootstrap Icons" + "MIT" 고지 존재(출하물 동봉).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  IconRegistry, iconRegistry, renderIcon, DEFAULT_ICON_ROLES,
} from '../../src/core/IconRegistry.js';
import { BOOTSTRAP_ICONS, BOOTSTRAP_ICON_COUNT, ICON_VIEWBOX } from '../../src/core/icons/bootstrap-icons.js';
import { OpenGrid } from '../../src/core/OpenGrid.js';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
});

function makeGrid(opts: any = {}) {
  const c = document.createElement('div');
  c.style.width = '600px'; c.style.height = '400px';
  c.getBoundingClientRect = () => ({ width:600, height:400, top:0, left:0, right:600, bottom:400, x:0, y:0, toJSON(){return {};} }) as DOMRect;
  document.body.appendChild(c);
  const g = new OpenGrid(c, {
    data: [{ a: 1, b: 'x' }],
    columns: [{ field: 'a', header: 'A', width: 100 }, { field: 'b', header: 'B', width: 120 }],
    ...opts,
  });
  return { grid: g, el: c };
}

// ─── 1) render(role) → svg with mapped path ────────────────
describe('R12c — render(role) 매핑 path 렌더', () => {
  it('sort.asc → sort-up glyph path 를 담은 svg', () => {
    const svg = iconRegistry.render('sort.asc') as string;
    expect(svg).toContain('<svg');
    expect(svg).toContain(`viewBox="${ICON_VIEWBOX}"`);
    // sort-up 글리프의 고유 path 시작
    expect(svg).toContain('M3.5 12.5');
  });
  it('filter → funnel path', () => {
    expect(iconRegistry.render('filter') as string).toContain('M1.5 1.5A.5.5 0 0 1 2 1h12');
  });
  it('row.delete → trash3(휴지통) path', () => {
    expect(iconRegistry.render('row.delete') as string).toContain('M6.5 1h3');
  });
  it('편의 renderIcon() 정적도 동일 결과', () => {
    expect(renderIcon('sort.asc')).toBe(iconRegistry.render('sort.asc'));
  });
  it('size 옵션 → width/height 속성', () => {
    const svg = iconRegistry.render('filter', { size: 13 }) as string;
    expect(svg).toContain('width="13"');
    expect(svg).toContain('height="13"');
  });
  it('title 옵션 → <title> + role="img"', () => {
    const svg = iconRegistry.render('filter', { title: '필터' }) as string;
    expect(svg).toContain('<title>필터</title>');
    expect(svg).toContain('role="img"');
  });
  it('el 옵션 → SVGElement 반환', () => {
    const el = iconRegistry.render('filter', { el: true }) as SVGElement;
    expect(el).toBeTruthy();
    expect(el.tagName.toLowerCase()).toBe('svg');
  });
});

// ─── 2) 스킨 토큰 결합 ───────────────────────────────────────
describe('R12c — 스킨 토큰(--og-icon-*) 결합', () => {
  it('fill="currentColor" (presentation attr — 자식 fill 보존)', () => {
    expect(iconRegistry.render('filter') as string).toContain('fill="currentColor"');
  });
  it('stroke-linejoin 이 --og-icon-corner 토큰을 참조', () => {
    expect(iconRegistry.render('filter') as string).toContain('stroke-linejoin:var(--og-icon-corner, miter)');
  });
});

// ─── 3) 미지원 role 안전 폴백 ────────────────────────────────
describe('R12c — 미지원 role 안전 폴백(never throw)', () => {
  it('알 수 없는 role → 빈 svg, throw 없음', () => {
    let out = '';
    expect(() => { out = iconRegistry.render('does.not.exist') as string; }).not.toThrow();
    expect(out).toContain('<svg');
    expect(out).toContain(`viewBox="${ICON_VIEWBOX}"`);
    // 폴백은 글리프 본문이 없음(path 미포함)
    expect(out).not.toContain('<path');
  });
  it('has() 는 미등록 role 에 false', () => {
    expect(iconRegistry.has('does.not.exist')).toBe(false);
    expect(iconRegistry.has('sort.asc')).toBe(true);
  });
});

// ─── 4) register / setIcon 오버라이드 ────────────────────────
describe('R12c — register/setIcon 오버라이드', () => {
  it('register(role, key) 가 아이콘 key 로 교체', () => {
    const reg = new IconRegistry(DEFAULT_ICON_ROLES);
    reg.register('sort.asc', 'arrow-up'); // sort-up → arrow-up 로 교체
    expect(reg.render('sort.asc') as string).toContain('M8 15a.5.5 0 0 0 .5-.5V2.707'); // arrow-up path
  });
  it('register(role, rawSvg) 가 원시 SVG 본문으로 교체', () => {
    const reg = new IconRegistry(DEFAULT_ICON_ROLES);
    reg.register('custom.x', '<path d="M1 1h14v14H1z"/>');
    expect(reg.render('custom.x') as string).toContain('M1 1h14v14H1z');
  });
  it('child 레지스트리 오버라이드가 부모(전역)를 가리되 격리', () => {
    const child = iconRegistry.child();
    child.register('filter', 'search'); // 이 child 만 filter→search
    expect(child.render('filter') as string).toContain('M11.742 10.344'); // search path
    // 전역은 불변
    expect(iconRegistry.render('filter') as string).toContain('M1.5 1.5A.5.5 0 0 1 2 1h12');
  });
  it('grid.setIcon 이 per-instance 로 교체 + iconResolver 슬롯 표면화(R11)', () => {
    const { grid } = makeGrid();
    grid.setIcon('filter', '<path d="M2 2h12v12H2z"/>');
    expect(grid.renderIcon('filter') as string).toContain('M2 2h12v12H2z');
    // 다른 role 은 여전히 전역 폴백
    expect(grid.renderIcon('sort.asc') as string).toContain('M3.5 12.5');
    // R11 확장점 슬롯으로 표면화됨(발견가능)
    expect(grid.extensions.hasStrategy('iconResolver')).toBe(true);
    grid.destroy();
  });
});

// ─── 5) mask.reveal 시각 동일(행동 보존) ─────────────────────
describe('R12c — mask.reveal 글리프(마스킹 셀 행동 보존)', () => {
  it('두 path + 흰 동공(fill="#fff")', () => {
    const svg = iconRegistry.render('mask.reveal', { size: 13 }) as string;
    expect(svg).toContain('M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8z');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('width="13"');
  });
});

// ─── 6) 임베드 아이콘 수 ─────────────────────────────────────
describe('R12c — 임베드 아이콘 수', () => {
  it('BOOTSTRAP_ICON_COUNT >= 60', () => {
    expect(BOOTSTRAP_ICON_COUNT).toBeGreaterThanOrEqual(60);
    expect(BOOTSTRAP_ICON_COUNT).toBe(Object.keys(BOOTSTRAP_ICONS).length);
  });
  it('eye-reveal(커스텀 글리프) 포함', () => {
    expect(Object.prototype.hasOwnProperty.call(BOOTSTRAP_ICONS, 'eye-reveal')).toBe(true);
  });
});

// ─── 7) THIRD_PARTY_LICENSES.txt 고지 ────────────────────────
describe('R12c — 서드파티 라이선스 고지(출하물)', () => {
  it('THIRD_PARTY_LICENSES.txt 에 "Bootstrap Icons" + MIT 블록 존재', () => {
    const txt = readFileSync(resolve(process.cwd(), 'THIRD_PARTY_LICENSES.txt'), 'utf8');
    expect(txt).toContain('Bootstrap Icons');
    expect(txt).toContain('MIT License');
    expect(txt).toContain('The MIT License (MIT)');
    expect(txt).toContain('Copyright (c) 2019-2024 The Bootstrap Authors');
    expect(txt).toContain('1.13.1');
  });
});
