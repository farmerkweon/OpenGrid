/**
 * DD-06 — 색 외 구분 텍스처의 **순수 기하**(§9.2 형태언어). 세 타깃 공유.
 * / DD-06 — pure geometry of the redundant (non-color) texture (§9.2). Shared by all targets.
 *
 * 현 `CanvasAdapter.paintPattern` 의 흰 오버레이 로직을 좌표 계산만 남겨 추출한다. Canvas/SVG/
 * server 가 **같은 선분·점 좌표**를 각자 방식으로 래스터화하므로, 텍스처까지 파리티가 유지된다
 * (scene 은 rect+pattern 만 담고, 타깃별 재계산 없이 이 헬퍼가 유일한 텍스처 진실원).
 * / Extracted from `CanvasAdapter.paintPattern`, keeping only coordinate math. Canvas/SVG/server
 * rasterize the **same segments/dots** in their own way, so texture stays in parity — this helper
 * is the single texture SSOT; targets do not recompute.
 */

import type { SeriesPattern } from '../scene.js';

/** 오버레이 선분 [x1,y1,x2,y2]. / Overlay line segment. */
export type OverlaySeg = readonly [number, number, number, number];
/** 오버레이 점 [cx,cy,r]. / Overlay dot. */
export type OverlayDot = readonly [number, number, number];

/** 텍스처 오버레이 결과(선분·점). / Texture overlay result (segments + dots). */
export interface PatternOverlay { readonly segs: readonly OverlaySeg[]; readonly dots: readonly OverlayDot[]; }

const STEP = 5;
const DOT_R = 1;

/**
 * 사각형 안의 색약 안전 텍스처 좌표(§9.2). solid/undefined → 빈 오버레이.
 * / Colorblind-safe texture coordinates inside a rect. solid/undefined → empty overlay.
 *
 * @param x - 사각형 좌상단 x / Rect top-left x
 * @param y - 사각형 좌상단 y / Rect top-left y
 * @param w - 너비 / Width
 * @param h - 높이 / Height
 * @param pattern - 패턴 종류 / Pattern kind
 * @returns 텍스처 선분·점 좌표 / Texture segments and dots
 */
export function patternOverlay(x: number, y: number, w: number, h: number, pattern: SeriesPattern | undefined): PatternOverlay {
  if (!pattern || pattern === 'solid' || w <= 0 || h <= 0) return { segs: [], dots: [] };
  const segs: OverlaySeg[] = [];
  const dots: OverlayDot[] = [];
  if (pattern === 'hatch' || pattern === 'cross') {
    for (let d = -h; d < w; d += STEP) segs.push([x + d, y + h, x + d + h, y]);
  }
  if (pattern === 'cross') {
    for (let d = 0; d < w + h; d += STEP) segs.push([x + d, y, x + d - h, y + h]);
  }
  if (pattern === 'dot') {
    for (let yy = y + STEP; yy < y + h; yy += STEP) {
      for (let xx = x + STEP; xx < x + w; xx += STEP) dots.push([xx, yy, DOT_R]);
    }
  }
  return { segs, dots };
}

/** line/area 대시 배열(현 CanvasAdapter.dashFor 와 동일). / Line dash array (matches CanvasAdapter.dashFor). */
export function dashFor(pattern: SeriesPattern | undefined): number[] {
  switch (pattern) {
    case 'hatch': return [6, 3];
    case 'dot': return [2, 3];
    case 'cross': return [8, 3, 2, 3];
    default: return [];
  }
}
