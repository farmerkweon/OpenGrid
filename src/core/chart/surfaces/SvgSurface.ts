/**
 * DD-06 — client 벡터 & 서버 공용 surface(§2.3·RT-803). DrawPrim → SVG 문자열.
 * / DD-06 — client-vector & server-shared surface (§2.3·RT-803). Translates DrawPrim → SVG string.
 *
 * DOM 없이 문자열만 조립하므로 서버(Node/Deno/Bun)에서 재사용된다(RT-803 "DOM/canvas 전역 없이").
 * 인라인 presentation attribute 만 사용 → 외부 CSS 침투 차단(host isolation, class 무의존).
 * 색약 텍스처는 `patternOverlay`(scene 과 동일 좌표)로 그려 세 타깃 파리티를 유지한다.
 * / Assembles a string with no DOM, so it is reusable on servers (RT-803). Uses only inline
 * presentation attributes → blocks external CSS (host isolation, class-free). Colorblind textures
 * use `patternOverlay` (same coordinates as the scene) to keep the three targets in parity.
 */

import type { ChartScene, DrawPrim, RenderSurface, SeriesPattern } from '../scene.js';
import { patternOverlay } from './pattern-overlay.js';

const ANCHOR: Record<string, string> = { start: 'start', center: 'middle', end: 'end' };
const DOMBASE: Record<string, string> = { top: 'text-before-edge', middle: 'central', bottom: 'text-after-edge' };

/** XML 특수문자 이스케이프(정직한 텍스트 삽입). / Escape XML special chars. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}
function num(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''); }

/**
 * scene 을 SVG 문자열로 래스터화하는 humble surface. `paint(scene)` 후 `toString()` 으로 완성 마크업.
 * provenance(§9.4)는 `<title>/<desc>` 로 동행한다(REQ-T6-811).
 * / Humble surface that rasterizes a scene into an SVG string. After `paint(scene)`, `toString()`
 * yields the full markup. Provenance travels along in `<title>/<desc>` (REQ-T6-811).
 */
export class SvgSurface implements RenderSurface {
  readonly kind = 'svg' as const;
  private _dpr: number;
  private _out = '';

  /** @param opts.dpr - viewBox 배율(선택, 기본 1) / viewBox scale (optional, default 1) */
  constructor(opts: { dpr?: number } = {}) {
    this._dpr = opts.dpr && opts.dpr > 0 ? opts.dpr : 1;
  }

  paint(scene: ChartScene): void {
    const w = scene.width, h = scene.height;
    const pw = Math.round(w * this._dpr), ph = Math.round(h * this._dpr);
    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" ` +
      `viewBox="0 0 ${num(w)} ${num(h)}" role="img" aria-label="${esc(scene.meta.a11yTable?.caption ?? '')}">`,
    );
    parts.push(`<title>${esc(scene.meta.a11yTable?.caption ?? '')}</title>`);
    parts.push(`<desc>${esc(this._desc(scene))}</desc>`);
    parts.push(`<rect x="0" y="0" width="${num(w)}" height="${num(h)}" fill="${esc(scene.bg)}"/>`);
    for (const p of scene.prims) this._prim(parts, p);
    parts.push('</svg>');
    this._out = parts.join('');
  }

  /** 완성 <svg> 마크업(RT-803 서버 SVG 출력). / Full <svg> markup (RT-803 server SVG output). */
  toString(): string { return this._out; }

  private _desc(scene: ChartScene): string {
    const m = scene.meta;
    const bits: string[] = [];
    if (m.sampled) bits.push(`sampled ${m.sampledFrom ?? '?'}→${m.sampledTo ?? '?'}`);
    if (m.aggregatedOp) bits.push(`aggregate:${m.aggregatedOp}`);
    if (m.negativesAbsInPie) bits.push('negatives-abs-in-pie');
    if (m.pieReducedToFirst) bits.push('pie-first-series');
    return bits.join('; ');
  }

  private _prim(out: string[], p: DrawPrim): void {
    switch (p.k) {
      case 'rect': {
        out.push(`<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" fill="${esc(p.fill)}"/>`);
        this._overlay(out, p.x, p.y, p.w, p.h, p.pattern);
        break;
      }
      case 'line':
        out.push(`<line x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}" stroke="${esc(p.stroke)}" stroke-width="${num(p.width)}"/>`);
        break;
      case 'polyline': {
        const pts = p.pts.map(pt => `${num(pt[0])},${num(pt[1])}`).join(' ');
        const dash = p.dash && p.dash.length ? ` stroke-dasharray="${p.dash.map(num).join(',')}"` : '';
        out.push(`<polyline points="${pts}" fill="none" stroke="${esc(p.stroke)}" stroke-width="${num(p.width)}"${dash}/>`);
        break;
      }
      case 'circle':
        out.push(`<circle cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(p.r)}" fill="${esc(p.fill)}"/>`);
        break;
      case 'arc':
        out.push(`<path d="${this._arcPath(p.cx, p.cy, p.r, p.a0, p.a1)}" fill="${esc(p.fill)}"/>`);
        break;
      case 'text':
        out.push(
          `<text x="${num(p.x)}" y="${num(p.y)}" fill="${esc(p.fill)}" ` +
          `text-anchor="${ANCHOR[p.align] ?? 'start'}" dominant-baseline="${DOMBASE[p.baseline] ?? 'central'}" ` +
          `font="${esc(p.font)}">${esc(p.s)}</text>`,
        );
        break;
    }
  }

  private _overlay(out: string[], x: number, y: number, w: number, h: number, pattern: SeriesPattern | undefined): void {
    if (!pattern || pattern === 'solid') return;
    const ov = patternOverlay(x, y, w, h, pattern);
    if (!ov.segs.length && !ov.dots.length) return;
    const clip = `og-clip-${Math.round(x)}-${Math.round(y)}-${Math.round(w)}-${Math.round(h)}`;
    out.push(`<clipPath id="${clip}"><rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"/></clipPath>`);
    out.push(`<g clip-path="url(#${clip})">`);
    for (const s of ov.segs) out.push(`<line x1="${num(s[0])}" y1="${num(s[1])}" x2="${num(s[2])}" y2="${num(s[3])}" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>`);
    for (const d of ov.dots) out.push(`<circle cx="${num(d[0])}" cy="${num(d[1])}" r="${num(d[2])}" fill="rgba(255,255,255,0.6)"/>`);
    out.push('</g>');
  }

  /** 파이 슬라이스 path(중심→호→닫기). / Pie-slice path (center → arc → close). */
  private _arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${num(cx)} ${num(cy)} L ${num(x0)} ${num(y0)} A ${num(r)} ${num(r)} 0 ${large} 1 ${num(x1)} ${num(y1)} Z`;
  }
}
