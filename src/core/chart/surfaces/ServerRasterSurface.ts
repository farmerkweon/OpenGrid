/**
 * DD-06 — 서버 PNG surface(§2.3·RT-803, R.1 헤드리스 하드제약 수정본).
 * / DD-06 — server PNG surface (§2.3·RT-803; R.1 headless hard-constraint fix).
 *
 * ⚠️ 헤드리스/번들 하드제약(§7·SPK-2): 코어는 **SVG 문자열만 1급 보장**(경량). PNG 픽셀화는
 * 무거운 lib 의존이라 코어에 내장하지 않는다 — `IRasterizer` 를 **주입**받아 위임한다.
 * 미주입 상태에서 `toPNG()` 호출은 명시적 throw(조용한 폴백 금지, 불변식4) → SVG 경로로 유도.
 * / The core guarantees only the SVG string as first-class (lightweight). PNG rasterization pulls
 * heavy deps, so it is NOT embedded — an `IRasterizer` is injected and delegated to. Calling
 * `toPNG()` without one throws explicitly (no silent fallback, invariant 4) → steer to SVG.
 */

import type { ChartScene, RenderSurface } from '../scene.js';

/** 주입형 래스터라이저 SPI(옵트인 애드온). scene 또는 SVG→PNG. / Injected rasterizer SPI (opt-in add-on). */
export interface IRasterizer {
  /** scene 을 PNG 바이트로 래스터화(sharp/pngjs/resvg 등 호스트 제공). / Rasterize scene → PNG bytes. */
  rasterize(scene: ChartScene): Uint8Array;
}

/**
 * 서버 PNG surface — DOM/canvas 전역 없이 동작. rasterizer 미주입 시 toPNG()=throw.
 * / Server PNG surface — works with no DOM/canvas globals. If no rasterizer, toPNG() throws.
 */
export class ServerRasterSurface implements RenderSurface {
  readonly kind = 'server' as const;
  private _rasterizer: IRasterizer | undefined;
  private _scene: ChartScene | null = null;

  /**
   * @param rasterizer - 주입 래스터라이저(없으면 PNG 미산출) / Injected rasterizer (no PNG without it)
   */
  constructor(rasterizer?: IRasterizer) {
    this._rasterizer = rasterizer;
  }

  paint(scene: ChartScene): void {
    this._scene = scene; // 순수 보관 — PNG 는 toPNG() 시 위임 산출.
  }

  /**
   * 주입 rasterizer 로 PNG 산출(코어 미내장). 미주입/미paint 시 throw(불변식4).
   * / Produce PNG via the injected rasterizer (not embedded in core). Throws if not injected / not painted.
   * @returns PNG 바이트 / PNG bytes
   */
  toPNG(): Uint8Array {
    if (!this._scene) throw new Error('ServerRasterSurface.toPNG: paint(scene) must be called first');
    if (!this._rasterizer) {
      throw new Error(
        'ServerRasterSurface.toPNG: no IRasterizer injected. The core guarantees only SVG output ' +
        '(SvgSurface.toString()); inject a rasterizer (sharp/pngjs/resvg) for PNG.',
      );
    }
    return this._rasterizer.rasterize(this._scene);
  }
}
