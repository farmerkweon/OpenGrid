/**
 * F4 — 툴팁/포인터 히트테스트 (§8.3). 순수 기하, DOM/GPU 비의존.
 *
 * 계약 근거: 11_design_F4_v2.md §8.3(어댑터가 각 포인트 bbox/중심 유지, 포인터 좌표→최근접
 * 포인트 해소), §10 hittest.spec(합성 좌표 → ChartPoint assert). bar=사각형 contains,
 * line=최근접 x → 그 category 내 최근접 y.
 *
 * 어댑터(CanvasAdapter)가 렌더 중 각 데이터포인트의 `PointGeom`을 누적하고, mousemove/포커스
 * 시 이 모듈로 히트 대상을 찾는다. GPU/canvas 실측이 아니라 순수 좌표 계산이므로 jsdom 에서도
 * 검증 가능하다(픽셀 무관, MCCONNELL-05).
 */

import type { ChartType } from './types.js';

/** 렌더된 데이터포인트 하나의 기하. bar=사각형(x,y,w,h), line/marker=중심(cx,cy). */
export interface PointGeom {
  seriesIndex: number;
  categoryIndex: number;
  /** 사각형 좌상단(bar). line 은 마커 bbox 좌상단으로도 채울 수 있다. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 중심 좌표(line 마커 최근접용, bar 도 중심 계산해 채운다). */
  cx: number;
  cy: number;
}

/** bar: 포인터가 사각형 내부인 포인트. 여러 개면 첫 매치. */
function hitBar(geoms: readonly PointGeom[], px: number, py: number): PointGeom | null {
  for (const g of geoms) {
    const left = Math.min(g.x, g.x + g.w);
    const right = Math.max(g.x, g.x + g.w);
    const top = Math.min(g.y, g.y + g.h);
    const bottom = Math.max(g.y, g.y + g.h);
    if (px >= left && px <= right && py >= top && py <= bottom) return g;
  }
  return null;
}

/** line: 최근접 x(category) → 그 category 열의 series 중 최근접 y. */
function hitLine(geoms: readonly PointGeom[], px: number, py: number): PointGeom | null {
  if (!geoms.length) return null;
  // 1) 최근접 categoryIndex 를 x 로 해소.
  let bestCat = -1, bestDx = Infinity;
  for (const g of geoms) {
    const dx = Math.abs(g.cx - px);
    if (dx < bestDx) { bestDx = dx; bestCat = g.categoryIndex; }
  }
  // 2) 그 category 의 포인트들 중 최근접 y.
  let best: PointGeom | null = null, bestDy = Infinity;
  for (const g of geoms) {
    if (g.categoryIndex !== bestCat) continue;
    const dy = Math.abs(g.cy - py);
    if (dy < bestDy) { bestDy = dy; best = g; }
  }
  return best;
}

/**
 * 포인터 좌표(px,py)에 해당하는 데이터포인트 기하를 찾는다(§8.3).
 * - bar/bar-*: 사각형 contains(미스면 null → 툴팁 숨김).
 * - line/area: 최근접 x → 최근접 y(항상 하나 반환, 미스 개념 없음).
 */
export function hitTest(
  geoms: readonly PointGeom[],
  px: number,
  py: number,
  type: ChartType
): PointGeom | null {
  if (!geoms.length) return null;
  if (type === 'line' || type === 'area') return hitLine(geoms, px, py);
  return hitBar(geoms, px, py);
}
