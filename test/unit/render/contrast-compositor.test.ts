// DD-03 §9.5.1 AA 텍스트색(REQ-T5-807) + §2.4 OverlayCompositor z-순서(REQ-T5-806) + CellApplier
import { describe, it, expect } from 'vitest';
import {
  contrastText, needsOutlineFallback, parseColor,
  OverlayCompositor, CellApplier,
} from '../../../src/core/render/index.js';
import type { PaintAccumulator, OverlayLayer } from '../../../src/core/render/index.js';
import { makeReq } from './_helpers.js';

describe('contrast — AA 텍스트색 자동선택', () => {
  it('어두운 배경 → 흰색, 밝은 배경 → 검정', () => {
    expect(contrastText('#000000')).toBe('#fff');
    expect(contrastText('#ffffff')).toBe('#000');
    expect(contrastText('#101010')).toBe('#fff');
    expect(contrastText('#f5f5f5')).toBe('#000');
  });

  it('#rgb 단축·rgb() 파싱', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(16, 16, 16)')).toEqual([16, 16, 16]);
    expect(parseColor('rgba(255,255,255,0.5)')).toEqual([255, 255, 255]);
  });

  it('var()/none/비리터럴 → null(기존 색 유지, 회귀 0)', () => {
    expect(contrastText('var(--og-row-bg,#fff)')).toBeNull();
    expect(contrastText('none')).toBeNull();
    expect(contrastText(null)).toBeNull();
    expect(contrastText(undefined)).toBeNull();
  });

  it('외곽선 폴백 판정 — AA 에선 리터럴 항상 false(흑/백 중 하나 충족), AAA 에선 중간명도 true', () => {
    // AA(4.5): 임의 배경도 흑 또는 백 중 하나가 항상 충족 → 폴백 불필요.
    expect(needsOutlineFallback('#808080')).toBe(false);
    // AAA(7:1) 강화 임계에서 중간명도 회색은 흑·백 모두 미달 → 외곽선 필요.
    expect(needsOutlineFallback('#808080', 7)).toBe(true);
    // 극단(검정)은 흰 텍스트로 AAA 도 충족 → 폴백 불필요.
    expect(needsOutlineFallback('#000000', 7)).toBe(false);
    // 비리터럴은 항상 false.
    expect(needsOutlineFallback('var(--x)', 7)).toBe(false);
  });
});

describe('OverlayCompositor — role→rank→z (z 하드코딩 0)', () => {
  function layer(role: OverlayLayer['role'], marker: string, ownsHit = false): OverlayLayer {
    return {
      role, ownsHit,
      build: () => { const d = document.createElement('div'); d.dataset.k = marker; return d; },
    };
  }

  it('rank 순으로 z-index 부여(선택 > range)', () => {
    const c = new OverlayCompositor();
    const el = document.createElement('div');
    c.compose(el, [layer('selection', 'sel'), layer('range', 'rng')]);
    const sel = el.querySelector('[data-k="sel"]') as HTMLElement;
    const rng = el.querySelector('[data-k="rng"]') as HTMLElement;
    expect(Number(sel.style.zIndex)).toBeGreaterThan(Number(rng.style.zIndex));
  });

  it('setRoleRank 로 스택 위치 재정의(OCP)', () => {
    const c = new OverlayCompositor();
    c.setRoleRank('range', 999);
    const el = document.createElement('div');
    c.compose(el, [layer('selection', 'sel'), layer('range', 'rng')]);
    const rng = el.querySelector('[data-k="rng"]') as HTMLElement;
    const sel = el.querySelector('[data-k="sel"]') as HTMLElement;
    expect(Number(rng.style.zIndex)).toBeGreaterThan(Number(sel.style.zIndex));
  });

  it('비-히트 오버레이는 pointer-events:none(값 클릭 투과)', () => {
    const c = new OverlayCompositor();
    const el = document.createElement('div');
    c.compose(el, [layer('selection', 'sel', false)]);
    const sel = el.querySelector('[data-k="sel"]') as HTMLElement;
    expect(sel.style.pointerEvents).toBe('none');
  });

  it('hitOwner: floating 만 소유', () => {
    const c = new OverlayCompositor();
    expect(c.hitOwner('floating')).toBe(true);
    expect(c.hitOwner('selection')).toBe(false);
  });
});

describe('CellApplier — 누적 → 인라인 DOM', () => {
  function emptyAcc(over: Partial<PaintAccumulator> = {}): PaintAccumulator {
    return {
      background: null, bgLayers: [], content: null, decorations: [], overlays: [],
      cellStyle: {}, classes: new Set(), aria: {}, trace: [], ...over,
    };
  }

  it('배경·클래스·aria 병합 인라인 적용', () => {
    const el = document.createElement('div');
    new CellApplier().apply(el, emptyAcc({
      background: '#123456',
      classes: new Set(['og-a', 'og-b']),
      aria: { 'aria-label': 'L' },
      content: () => { const s = document.createElement('span'); s.textContent = 'v'; return s; },
    }), makeReq());
    expect(el.style.background).toBe('rgb(18, 52, 86)');
    expect(el.classList.contains('og-a')).toBe(true);
    expect(el.getAttribute('aria-label')).toBe('L');
    expect(el.textContent).toBe('v');
  });

  it('content 부재 → raw String(value) 텍스트 폴백', () => {
    const el = document.createElement('div');
    new CellApplier().apply(el, emptyAcc(), makeReq({ value: 99 }));
    expect(el.textContent).toBe('99');
  });

  it('bgLayers z 오름차순 절대배치 자식', () => {
    const el = document.createElement('div');
    new CellApplier().apply(el, emptyAcc({
      bgLayers: [{ fill: '#aaa', z: 2, role: 'databar' }, { fill: '#bbb', z: 1, role: 'heatmap' }],
      content: () => document.createTextNode('x'),
    }), makeReq());
    const layers = el.querySelectorAll('.og-bg-layer');
    expect(layers).toHaveLength(2);
    expect((layers[0] as HTMLElement).style.zIndex).toBe('1'); // z 오름차순
  });
});
