/**
 * DD-06 — 서버 헤드리스 렌더 진입점(RT-803·§2.5). DOM/canvas/window 전역 미참조.
 * / DD-06 — server headless render entry (RT-803·§2.5). References no DOM/canvas/window global.
 *
 * 그리드·window 없이 `renderChartServer(spec, model, size)` 만으로 SVG 문자열·scene·provenance 를
 * 산출한다(UC-2). 내부는 클라이언트와 **동일** computeChartGeometry+buildChartScene → 바이트 동일
 * scene(파리티 골든 대상). PNG 는 `opts.rasterizer` 주입 시에만(§2.3 헤드리스 결정, 코어 경량).
 * / Produces the SVG string, scene, and provenance from `renderChartServer(spec, model, size)`
 * alone — no grid/window (UC-2). Internals use the SAME geometry+scene as the client → a
 * byte-identical scene (parity golden). PNG only when `opts.rasterizer` is injected (lightweight core).
 */

import type { ChartDataModel, ChartRenderSpec } from './types.js';
import { computeChartGeometry } from './geometry.js';
import { buildChartScene, type ChartScene } from './scene.js';
import { SvgSurface } from './surfaces/SvgSurface.js';
import { ServerRasterSurface, type IRasterizer } from './surfaces/ServerRasterSurface.js';
import { buildProvenance, type ChartProvenance, type ProvenanceExtra } from './provenance.js';

/** 서버 렌더 옵션. / Server render options. */
export interface ServerRenderOptions {
  /** PNG 픽셀화 주입(없으면 png 미산출, SVG 1급). / PNG rasterizer injection (no png without it). */
  rasterizer?: IRasterizer;
  /** DPR(서버 스케일). 기본 1. / DPR (server scale). Default 1. */
  dpr?: number;
  /** 숨긴 series 인덱스. / Hidden series indices. */
  hidden?: ReadonlySet<number>;
  /** 절단축·엔진/타입 폴백 배지 플래그. / Truncated-axis / engine-type fallback badge flags. */
  provenance?: ProvenanceExtra;
}

/** 서버 렌더 결과(§2.5). png 는 rasterizer 주입 시에만. / Server render result. png only with a rasterizer. */
export interface ServerRenderResult {
  readonly scene: ChartScene;
  readonly svg: string;
  readonly png?: Uint8Array;
  readonly provenance: ChartProvenance;
}

/**
 * 서버 헤드리스 렌더 — SVG·scene·provenance 항상 산출, PNG 는 opt-in. 클라이언트와 동일 scene.
 * / Server headless render — always yields SVG/scene/provenance; PNG is opt-in. Same scene as client.
 *
 * @param spec - 렌더 스펙(타입·테마·포맷) / Render spec (type, theme, format)
 * @param model - 차트 데이터 모델 / Chart data model
 * @param size - 렌더 크기 / Render size
 * @param opts - rasterizer·dpr·hidden·provenance(선택) / rasterizer·dpr·hidden·provenance (optional)
 * @returns scene·svg·(png?)·provenance / scene·svg·(png?)·provenance
 */
export function renderChartServer(
  spec: ChartRenderSpec,
  model: ChartDataModel,
  size: { width: number; height: number },
  opts: ServerRenderOptions = {},
): ServerRenderResult {
  const hidden = opts.hidden ?? new Set<number>();
  const geo = computeChartGeometry(model, spec, size, hidden);
  const scene = buildChartScene(model, spec, geo, hidden);

  const svgSurface = new SvgSurface(opts.dpr !== undefined ? { dpr: opts.dpr } : {});
  svgSurface.paint(scene);
  const svg = svgSurface.toString();

  const provenance = buildProvenance(model.meta, opts.provenance ?? {});

  let png: Uint8Array | undefined;
  if (opts.rasterizer) {
    const raster = new ServerRasterSurface(opts.rasterizer);
    raster.paint(scene);
    png = raster.toPNG();
  }

  return png !== undefined ? { scene, svg, png, provenance } : { scene, svg, provenance };
}
