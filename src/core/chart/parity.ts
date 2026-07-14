/**
 * DD-06 — 1급 파리티: scene 계산 동일성(§2.6). `sceneEquals` 만 소유.
 * / DD-06 — first-class parity: scene computational identity (§2.6). Owns only `sceneEquals`.
 *
 * "세 타깃이 바이트 동일 scene 을 소비하는가"의 구조적 증명. deep-equal 이 깨지면 = 어느 타깃이
 * 자기 기하를 재계산 중(파리티 원죄, 불변식2) → 리뷰 차단.
 * / A structural proof that "the three targets consume a byte-identical scene". A broken deep-equal
 * means some target is recomputing its own geometry (parity original sin, invariant 2) → review block.
 *
 * ⚠️ 픽셀 계량(SSIM·ΔE) 은 DD-13 `VisualRegressionHarness` 소유 — 여기서 재구현 금지(§2.6 분업).
 * / Pixel metrics (SSIM·ΔE) are owned by DD-13's VisualRegressionHarness — not reimplemented here.
 */

import type { ChartScene, DrawPrim } from './scene.js';

/** 부동소수 비교 허용오차(결정론 계산이라 사실상 0, 방어적). / Float tolerance (effectively 0 for deterministic math). */
const EPS = 1e-9;

function eqNum(a: number, b: number): boolean {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return Math.abs(a - b) <= EPS;
}

function eqPrim(a: DrawPrim, b: DrawPrim): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'rect': {
      const y = b as Extract<DrawPrim, { k: 'rect' }>;
      return eqNum(a.x, y.x) && eqNum(a.y, y.y) && eqNum(a.w, y.w) && eqNum(a.h, y.h) && a.fill === y.fill && a.pattern === y.pattern;
    }
    case 'line': {
      const y = b as Extract<DrawPrim, { k: 'line' }>;
      return eqNum(a.x1, y.x1) && eqNum(a.y1, y.y1) && eqNum(a.x2, y.x2) && eqNum(a.y2, y.y2) && a.stroke === y.stroke && eqNum(a.width, y.width);
    }
    case 'polyline': {
      const y = b as Extract<DrawPrim, { k: 'polyline' }>;
      if (a.stroke !== y.stroke || !eqNum(a.width, y.width)) return false;
      if (a.pts.length !== y.pts.length) return false;
      for (let i = 0; i < a.pts.length; i++) if (!eqNum(a.pts[i]![0], y.pts[i]![0]) || !eqNum(a.pts[i]![1], y.pts[i]![1])) return false;
      const da = a.dash ?? [], db = y.dash ?? [];
      return da.length === db.length && da.every((v, i) => eqNum(v, db[i]!));
    }
    case 'circle': {
      const y = b as Extract<DrawPrim, { k: 'circle' }>;
      return eqNum(a.cx, y.cx) && eqNum(a.cy, y.cy) && eqNum(a.r, y.r) && a.fill === y.fill;
    }
    case 'arc': {
      const y = b as Extract<DrawPrim, { k: 'arc' }>;
      return eqNum(a.cx, y.cx) && eqNum(a.cy, y.cy) && eqNum(a.r, y.r) && eqNum(a.a0, y.a0) && eqNum(a.a1, y.a1) && a.fill === y.fill && a.pattern === y.pattern;
    }
    case 'text': {
      const y = b as Extract<DrawPrim, { k: 'text' }>;
      return eqNum(a.x, y.x) && eqNum(a.y, y.y) && a.s === y.s && a.fill === y.fill && a.align === y.align && a.baseline === y.baseline && a.font === y.font;
    }
    default: return false;
  }
}

/**
 * 두 scene 의 1급 파리티(그리기 명령 동일성)를 판정한다. surface(=래스터화 백엔드)는 무관 —
 * 동일 (model,spec,size) 에서 나온 scene 이면 백엔드가 달라도 반드시 동일해야 한다.
 * / Decide first-class parity (draw-command identity) of two scenes. The surface (raster backend)
 * is irrelevant — scenes from identical (model,spec,size) must be equal regardless of backend.
 *
 * @param a - scene A / Scene A
 * @param b - scene B / Scene B
 * @returns 동일하면 true / true if identical
 */
export function sceneEquals(a: ChartScene, b: ChartScene): boolean {
  if (!eqNum(a.width, b.width) || !eqNum(a.height, b.height) || a.bg !== b.bg) return false;
  if (a.prims.length !== b.prims.length) return false;
  for (let i = 0; i < a.prims.length; i++) if (!eqPrim(a.prims[i]!, b.prims[i]!)) return false;
  return true;
}
