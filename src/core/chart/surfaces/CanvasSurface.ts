/**
 * DD-06 — client 래스터 surface(§2.3). DrawPrim → ctx 명령 1:1 번역(humble, 판단 없음).
 * / DD-06 — client raster surface (§2.3). Translates DrawPrim → ctx commands 1:1 (humble; no judgment).
 *
 * 현 `CanvasAdapter._paint` 의 순수 번역부만 이관한다. ctx=null(jsdom) 이면 no-op — scene·기하는
 * 이미 완성돼 있으므로 단위테스트는 로직/기하만 assert 한다(픽셀 무관).
 * / Only the pure translation of `CanvasAdapter._paint` is moved here. ctx=null (jsdom) → no-op;
 * scene/geometry are already complete, so unit tests assert logic/geometry only (pixel-independent).
 */

import type { ChartScene, DrawPrim, RenderSurface, SeriesPattern } from '../scene.js';
import { patternOverlay } from './pattern-overlay.js';

type Ctx = {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number): void; closePath(): void;
  fill(): void; stroke(): void; fillRect(x: number, y: number, w: number, h: number): void;
  fillText(s: string, x: number, y: number): void; save(): void; restore(): void; clip(): void;
  rect(x: number, y: number, w: number, h: number): void;
  setLineDash(d: number[]): void;
  fillStyle: string; strokeStyle: string; lineWidth: number; font: string;
  textAlign: string; textBaseline: string;
};

const ALIGN: Record<string, string> = { start: 'left', center: 'center', end: 'right' };

/**
 * canvas 2D 로 scene 을 래스터화한다. constructor 에 canvas·dpr 을 주입받고, paint 시 ctx 를
 * 해소한다(없으면 no-op). / Rasterizes a scene onto a canvas 2D context. Injects canvas/dpr;
 * resolves the ctx at paint time (no-op if absent).
 */
export class CanvasSurface implements RenderSurface {
  readonly kind = 'canvas' as const;
  private _canvas: { width: number; height: number; getContext?: (id: string) => Ctx | null };
  private _dpr: number;

  /**
   * @param canvas - 렌더 대상 canvas(주입) / Target canvas (injected)
   * @param dpr - devicePixelRatio(호스트 주입, 헤드리스 순수) / devicePixelRatio (host-injected, headless-pure)
   */
  constructor(canvas: { width: number; height: number; getContext?: (id: string) => Ctx | null }, dpr = 1) {
    this._canvas = canvas;
    this._dpr = dpr > 0 ? dpr : 1;
  }

  paint(scene: ChartScene): void {
    const dpr = this._dpr;
    this._canvas.width = Math.floor(scene.width * dpr);
    this._canvas.height = Math.floor(scene.height * dpr);
    const ctx = this._canvas.getContext ? this._canvas.getContext('2d') : null;
    if (!ctx) return; // jsdom — 기하/DOM 이미 준비됨
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, scene.width, scene.height);
    // 배경.
    ctx.fillStyle = scene.bg;
    ctx.fillRect(0, 0, scene.width, scene.height);
    for (const p of scene.prims) this._prim(ctx, p);
  }

  private _prim(ctx: Ctx, p: DrawPrim): void {
    switch (p.k) {
      case 'rect': {
        ctx.fillStyle = p.fill;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        this._overlay(ctx, p.x, p.y, p.w, p.h, p.pattern);
        break;
      }
      case 'line': {
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.width; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        break;
      }
      case 'polyline': {
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.width; ctx.setLineDash(p.dash ? [...p.dash] : []);
        ctx.beginPath();
        p.pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1])));
        ctx.stroke(); ctx.setLineDash([]);
        break;
      }
      case 'circle': {
        ctx.fillStyle = p.fill; ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'arc': {
        ctx.fillStyle = p.fill;
        ctx.beginPath(); ctx.moveTo(p.cx, p.cy); ctx.arc(p.cx, p.cy, p.r, p.a0, p.a1); ctx.closePath(); ctx.fill();
        break;
      }
      case 'text': {
        ctx.fillStyle = p.fill; ctx.font = p.font;
        ctx.textAlign = ALIGN[p.align] ?? 'left'; ctx.textBaseline = p.baseline;
        ctx.fillText(p.s, p.x, p.y);
        break;
      }
    }
  }

  private _overlay(ctx: Ctx, x: number, y: number, w: number, h: number, pattern: SeriesPattern | undefined): void {
    if (!pattern || pattern === 'solid') return;
    const ov = patternOverlay(x, y, w, h, pattern);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    for (const s of ov.segs) { ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const d of ov.dots) { ctx.beginPath(); ctx.arc(d[0], d[1], d[2], 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
