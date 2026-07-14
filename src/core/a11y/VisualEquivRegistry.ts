// ============================================================
// DD-12 §2.5 시각 인코딩 텍스트 등가 게이트 / visual-encoding text-equivalent gate
// ------------------------------------------------------------
// 설계 근거(Why): 스파크/차트/데이터바/델타/아이콘셋이 텍스트 등가 provider 를 등록하는 계약
//   (REQ-T9-825). 신규 시각 컴포넌트가 provider 없이 낭독을 시도하면 게이트가 거부/신호한다("흐름
//   구멍 차단"). DD-10 `IRegistry<V>` 동형(전역+child+never-throw)을 재사용하고 재구현하지 않는다
//   (C1) — `TypedRegistry` 위에 도메인 파사드만 얹는다.
// / Design: contract for spark/chart/databar/delta/iconset to register a text-equivalent provider
//   (REQ-T9-825). A visual component announcing without a registered provider is gated. Reuses the
//   DD-10 `IRegistry<V>` engine (global + child + never-throw); no reimplementation (C1).
// ============================================================

import { TypedRegistry } from '../extension/Registry.js';
import type { RegisterOptions, RegisterResult } from '../extension/Registry.js';

/**
 * 시각 인코딩 종류 → 텍스트 등가 provider. `describe` 는 시각 모델을 받아 낭독 문자열을 산출한다
 * (헤드리스 순수 — DOM 미참조). 차트는 기존 `chart/a11y.chartAriaLabel` 을 감싸 등록할 수 있다.
 * / A text-equivalent provider for a visual-encoding kind. `describe` produces the spoken string
 *   from a visual model (headless/pure). Charts can wrap `chart/a11y.chartAriaLabel`.
 */
export interface VisualEquivProvider<M = unknown> {
  /** 'chart' | 'sparkline' | 'databar' | 'delta' | 'iconset' … / Visual-encoding kind. */
  readonly kind: string;
  /** 시각 모델 → 낭독 텍스트. / Visual model → spoken text. */
  describe(model: M): string;
}

/** SPI 태그(peer 검증·진화). / SPI tag (peer verification / evolution). */
const VISUAL_EQUIV_SPI = { name: 'IVisualEquivProvider', version: '1' } as const;

/**
 * 텍스트 등가 provider 등록 게이트. `TypedRegistry` 를 감싸 도메인 API 를 제공한다(재구현 0, C1).
 * / The text-equivalent provider gate. Wraps `TypedRegistry` with a domain API (no reimplementation).
 */
export class VisualEquivRegistry {
  private readonly _reg: TypedRegistry<VisualEquivProvider>;
  private readonly _onWarn: ((msg: string) => void) | undefined;

  constructor(onWarn?: (msg: string) => void) {
    const cfg: { spi: typeof VISUAL_EQUIV_SPI; onWarn?: (msg: string) => void } = { spi: VISUAL_EQUIV_SPI };
    if (onWarn !== undefined) cfg.onWarn = onWarn;
    this._reg = new TypedRegistry<VisualEquivProvider>(cfg);
    this._onWarn = onWarn;
  }

  /** provider 등록(정책 적용, never-throw). / Register a provider (policy-applied, never-throw). */
  register(provider: VisualEquivProvider, opts?: RegisterOptions): RegisterResult {
    return this._reg.register(provider.kind, provider, opts);
  }

  /** 등록 여부(게이트 판정 — 미등록 시 CI 실패의 근거). / Whether the kind is registered (CI-gate basis). */
  has(kind: string): boolean { return this._reg.has(kind); }

  get(kind: string): VisualEquivProvider | undefined { return this._reg.get(kind); }

  /** 등록된 종류 목록. / Registered kinds. */
  list(): string[] { return this._reg.list(); }

  /**
   * 텍스트 등가 산출(never-throw). 미등록 종류면 빈 문자열 + 경고(침묵 금지·게이트 신호).
   * / Produce the text equivalent (never-throw). Unregistered kind → empty string + warning.
   */
  describe(kind: string, model: unknown): string {
    const p = this._reg.get(kind);
    if (!p) {
      // 침묵 금지 — 미등록 종류의 낭독 시도는 "흐름 구멍" 신호(게이트 근거). / Not silent: signal the gap.
      this._onWarn?.(`[VisualEquivRegistry] describe("${kind}"): 미등록 시각 인코딩 — 텍스트 등가 provider 없음(빈 문자열 반환). / no text-equivalent provider registered.`);
      return '';
    }
    return p.describe(model);
  }

  /** 플러그인 단위 일괄 해제. / Batch dispose by plugin. */
  disposePlugin(pluginId: string): number { return this._reg.disposePlugin(pluginId); }

  dispose(): void { this._reg.dispose(); }
}
