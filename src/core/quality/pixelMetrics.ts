// ============================================================
// DD-13 §2.5 픽셀 계량 커널 — 이미지 일반 지표의 단일 소유(DD-13) (REQ-TX-826)
// / DD-13 §2.5 Pixel-metric kernel — single owner (DD-13) of image metrics.
// 순수 함수(DOM 무관, 헤드리스). DD-06 chart/parity.ts 는 이를 재구현하지 않고 import·소비.
// ΔE 근사식은 palette.colorDistance(RGB 유클리드) 재사용(스파이크 S5 게이트 결정 대상).
// ============================================================

import { colorDistance } from '../chart/palette.js';

/**
 * 픽셀 버퍼(브라우저 ImageData 구조 호환, 헤드리스에서도 사용). RGBA row-major.
 * / Pixel buffer (structurally compatible with browser ImageData; headless-usable). RGBA row-major.
 */
export interface ImageLike {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>; // RGBA * width * height
}

/** 두 버퍼가 동일 규격(픽셀 비교 가능)인지. / Same dimensions (comparable). */
function sameDims(a: ImageLike, b: ImageLike): boolean {
  return a.width === b.width && a.height === b.height && a.data.length === b.data.length;
}

/**
 * 변경 픽셀 비율([0,1]). 규격 불일치는 1(전부 변경). tolerance=채널 절대차 허용(기본 0).
 * / Ratio of changed pixels ([0,1]). Dimension mismatch → 1. tolerance = per-channel abs diff allowance.
 */
export function changedPixelRatio(a: ImageLike, b: ImageLike, tolerance = 0): number {
  if (!sameDims(a, b)) return 1;
  const px = a.width * a.height;
  if (px === 0) return 0;
  let changed = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const dr = Math.abs(a.data[o]! - b.data[o]!);
    const dg = Math.abs(a.data[o + 1]! - b.data[o + 1]!);
    const db = Math.abs(a.data[o + 2]! - b.data[o + 2]!);
    const da = Math.abs(a.data[o + 3]! - b.data[o + 3]!);
    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) changed++;
  }
  return changed / px;
}

/** Rec.709 상대 휘도(0..255 입력). / Rec.709 luma (0..255 input). */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 구조 유사도 SSIM([0,1]) — 휘도 채널 전역 단일 창 근사. 동일 이미지=1, 규격 불일치=0.
 * / Structural similarity (global single-window approximation over luma). Identical=1, mismatch=0.
 */
export function ssim(a: ImageLike, b: ImageLike): number {
  if (!sameDims(a, b)) return 0;
  const px = a.width * a.height;
  if (px === 0) return 1;
  const L = 255;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;

  let sx = 0, sy = 0;
  const xs = new Float64Array(px);
  const ys = new Float64Array(px);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const x = luma(a.data[o]!, a.data[o + 1]!, a.data[o + 2]!);
    const y = luma(b.data[o]!, b.data[o + 1]!, b.data[o + 2]!);
    xs[i] = x; ys[i] = y; sx += x; sy += y;
  }
  const mux = sx / px;
  const muy = sy / px;

  let vx = 0, vy = 0, cxy = 0;
  for (let i = 0; i < px; i++) {
    const dx = xs[i]! - mux;
    const dy = ys[i]! - muy;
    vx += dx * dx; vy += dy * dy; cxy += dx * dy;
  }
  vx /= px; vy /= px; cxy /= px;

  const num = (2 * mux * muy + C1) * (2 * cxy + C2);
  const den = (mux * mux + muy * muy + C1) * (vx + vy + C2);
  return den === 0 ? 1 : num / den;
}

/**
 * 최대 색차(ΔE 근사, RGB 유클리드). 규격 불일치는 최대치(441). 차트/그래픽 스냅샷 판정.
 * / Max color difference (ΔE approximation, RGB Euclidean). Mismatch → max (441).
 */
export function maxDeltaE(a: ImageLike, b: ImageLike): number {
  if (!sameDims(a, b)) return 441; // sqrt(3*255^2)
  const px = a.width * a.height;
  let max = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const d = colorDistance(
      { r: a.data[o]!, g: a.data[o + 1]!, b: a.data[o + 2]! },
      { r: b.data[o]!, g: b.data[o + 1]!, b: b.data[o + 2]! },
    );
    if (d > max) max = d;
  }
  return max;
}
