/**
 * DD-06 §2.8 — 외부 엔진 seam(REQ-T6-808). SRI/CSP/격리/미로드 폴백 계약. 헤드리스.
 * / DD-06 §2.8 — external-engine seam (REQ-T6-808). SRI/CSP/isolation/not-loaded-fallback. Headless.
 *
 * `engine:'chartjs'|'echarts'` 위임 경계. lazy 로드 시도 → 성공 시 ChartAdapter, 실패/미로드 시 null
 * (→ builtin 폴백 + `engineFallback` 배지, 조용한 폴백 금지 불변식4). SRI 불일치·미제공 시 로드 거부.
 * 실제 스크립트 로딩은 host 가 주입(`loader`) — 코어는 외부 lib 를 편입하지 않는다(번들 하드제약).
 * DD-10 IRegistry 동형 어댑터(C1) — 스펙 저장은 TypedRegistry 위임.
 * / Delegation boundary for `engine:'chartjs'|'echarts'`. Lazy load → ChartAdapter on success, null
 * on failure/not-loaded (→ builtin fallback + `engineFallback` badge). SRI missing/mismatch → load
 * refused. Actual script loading is host-injected (`loader`); the core embeds no external lib.
 * Homomorphic to DD-10 IRegistry (C1); spec storage delegates to TypedRegistry.
 */

import type { ChartAdapter } from '../types.js';
import { TypedRegistry } from '../../extension/Registry.js';

/** 외부 엔진 스펙. / External engine spec. */
export interface ExternalEngineSpec {
  /** 엔진 id. / Engine id. */
  id: 'chartjs' | 'echarts' | string;
  /** CDN/self-host URL. / CDN or self-host URL. */
  url: string;
  /** integrity 해시(공급망 게이트) — 없으면 로드 거부. / integrity hash; missing → load refused. */
  sri: string;
  /** window 전역명(미로드 감지). / window global name (not-loaded detection). */
  globalName: string;
}

/** 엔진 로더(host 주입) — 스펙 → 어댑터(실패 null). / Engine loader (host-injected). */
export type EngineLoader = (spec: ExternalEngineSpec) => Promise<ChartAdapter | null>;

/** SRI 해시 형식 검증(sha256/384/512-base64). / Validate SRI hash format. */
export function isValidSri(sri: string): boolean {
  return /^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(sri.trim());
}

/** 엔진 해소 결과(조용한 폴백 금지 — 사유를 값으로). / Engine resolution result (reason as value). */
export interface EngineResolveResult {
  /** 해소된 어댑터(실패 시 null → builtin 폴백). / Resolved adapter (null → builtin fallback). */
  readonly adapter: ChartAdapter | null;
  /** 폴백 사유(engineFallback 배지 근거). / Fallback reason (basis for engineFallback badge). */
  readonly reason?: 'not-registered' | 'invalid-sri' | 'load-failed';
}

/**
 * 외부 엔진 레지스트리(§2.8) — DD-10 IRegistry 동형. register 는 SRI 형식을 게이트하고, resolve 는
 * 주입 loader 로 lazy 로드해 실패를 값으로 고지한다(조용한 폴백 금지).
 * / External-engine registry — homomorphic to DD-10 IRegistry. register gates SRI format; resolve
 * lazy-loads via the injected loader and reports failure as a value (no silent fallback).
 */
export class ChartEngineRegistry {
  private _reg: TypedRegistry<ExternalEngineSpec>;
  private _loader: EngineLoader | undefined;

  /** @param loader - host 주입 스크립트 로더(없으면 항상 load-failed → builtin) / Host-injected loader */
  constructor(loader?: EngineLoader) {
    this._reg = new TypedRegistry<ExternalEngineSpec>({ duplicatePolicy: 'last-wins' });
    this._loader = loader;
  }

  /**
   * 엔진 스펙 등록 — SRI 형식 불량은 거부(공급망 게이트). / Register an engine spec; bad SRI is refused.
   * @param spec - 외부 엔진 스펙 / External engine spec
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  register(spec: ExternalEngineSpec): boolean {
    if (!spec.sri || !isValidSri(spec.sri)) return false;
    return this._reg.register(spec.id, spec).ok;
  }

  /**
   * lazy 로드 시도 — 성공 시 어댑터, 실패/미로드/미등록 시 null + 사유(→ builtin 폴백 + 배지).
   * / Lazy load — adapter on success; null + reason on failure/not-loaded/unregistered.
   * @param id - 엔진 id / Engine id
   * @returns 어댑터 또는 null + 폴백 사유 / Adapter or null + fallback reason
   */
  async resolve(id: string): Promise<EngineResolveResult> {
    const spec = this._reg.get(id);
    if (!spec) return { adapter: null, reason: 'not-registered' };
    if (!isValidSri(spec.sri)) return { adapter: null, reason: 'invalid-sri' };
    if (!this._loader) return { adapter: null, reason: 'load-failed' };
    try {
      const adapter = await this._loader(spec);
      return adapter ? { adapter } : { adapter: null, reason: 'load-failed' };
    } catch {
      return { adapter: null, reason: 'load-failed' };
    }
  }

  /** 등록 키 목록. / Registered keys. */
  list(): string[] { return this._reg.list(); }
  /** 존재 여부. / Whether an engine is registered. */
  has(id: string): boolean { return this._reg.has(id); }
}
