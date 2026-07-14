/**
 * F4 — 툴팁/포인터 히트테스트 (§8.3). 순수 기하, DOM/GPU 비의존.
 * / F4 — tooltip/pointer hit-testing (§8.3). Pure geometry, DOM/GPU-agnostic.
 *
 * 계약 근거: 11_design_F4_v2.md §8.3(어댑터가 각 포인트 bbox/중심 유지, 포인터 좌표→최근접
 * 포인트 해소), §10 hittest.spec(합성 좌표 → ChartPoint assert). bar=사각형 contains,
 * line=최근접 x → 그 category 내 최근접 y.
 * / Contract basis: §8.3 (the adapter keeps each point's bbox/center; resolve pointer coords →
 * nearest point) and the hittest spec (synthetic coords → ChartPoint assert). bar = rectangle
 * contains; line = nearest x → nearest y within that category.
 *
 * 어댑터(CanvasAdapter)가 렌더 중 각 데이터포인트의 `PointGeom`을 누적하고, mousemove/포커스
 * 시 이 모듈로 히트 대상을 찾는다. GPU/canvas 실측이 아니라 순수 좌표 계산이므로 jsdom 에서도
 * 검증 가능하다(픽셀 무관).
 * / The adapter (CanvasAdapter) accumulates each data point's `PointGeom` during render and uses
 * this module on mousemove/focus to find the hit target. Because it is pure coordinate math
 * rather than actual GPU/canvas measurement, it is verifiable even in jsdom (pixel-independent).
 */

import type { ChartType } from './types.js';

/**
 * 렌더된 데이터포인트 하나의 기하. bar=사각형(x,y,w,h), line/marker=중심(cx,cy).
 * / Geometry of one rendered data point. bar = rectangle (x,y,w,h); line/marker = center (cx,cy).
 */
export interface PointGeom {
  /** 시리즈 인덱스. / Series index. */
  seriesIndex: number;
  /** 카테고리 인덱스. / Category index. */
  categoryIndex: number;
  /** 사각형 좌상단 x(bar). line 은 마커 bbox 좌상단으로도 채울 수 있다. / Rect top-left x (bar); line may fill it with the marker bbox top-left. */
  x: number;
  /** 사각형 좌상단 y. / Rect top-left y. */
  y: number;
  /** 사각형 너비. / Rect width. */
  w: number;
  /** 사각형 높이. / Rect height. */
  h: number;
  /** 중심 x(line 마커 최근접용, bar 도 중심 계산해 채운다). / Center x (for line-marker nearest; bar also fills its center). */
  cx: number;
  /** 중심 y. / Center y. */
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
 * / Find the data-point geometry at pointer coords (px,py) (§8.3).
 * - bar/bar-*: rectangle contains (null on miss → tooltip hidden).
 * - line/area: nearest x → nearest y (always returns one; no "miss" concept).
 *
 * @param geoms - 렌더된 포인트 기하 배열 / Array of rendered point geometry
 * @param px - 포인터 x(geom 좌표계) / Pointer x (geom coordinate space)
 * @param py - 포인터 y(geom 좌표계) / Pointer y (geom coordinate space)
 * @param type - 차트 종류(bar vs line/area 분기) / Chart type (bar vs line/area branch)
 * @returns 히트된 PointGeom, 없으면 null / The hit PointGeom, or null if none
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
