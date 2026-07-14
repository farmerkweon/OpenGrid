/**
 * DD-06 §2.9 — 차트타입 SPI 정식 정의처(REQ-T6-073·크로스컷 §1.A/§2-f). 순수·헤드리스.
 * / DD-06 §2.9 — the canonical definition of the chart-type SPI (REQ-T6-073). Pure & headless.
 *
 * DD-10 §2.5 가 `IChartRenderer.draw(model, DrawPort)` 로 가리켰으나 정식 정의처는 여기다. `DrawPort`
 * 개념은 폐기하고 DD-06 의 `ChartScene`/`ChartGeometry` 기반으로 정본화한다 — 커스텀 타입도 scene 을
 * 타므로 3타깃 파리티·hit-test·export·provenance·정직성 불변식을 **공짜로 상속**(우회 불가).
 * 레지스트리는 DD-10 `IRegistry<IChartRenderer,string>` 동형 어댑터(C1, 재구현 금지) — TypedRegistry 위임.
 * / DD-10 pointed at `IChartRenderer.draw(model, DrawPort)` but the canonical home is here. The
 * `DrawPort` notion is dropped in favor of DD-06's `ChartScene`/`ChartGeometry` — custom types ride
 * the scene, inheriting 3-target parity, hit-test, export, provenance, and honesty invariants for
 * free. The registry is a DD-10 `IRegistry` homomorphic adapter (no reimplementation) over TypedRegistry.
 */

import type { ChartDataModel, ChartRenderSpec } from './types.js';
import type { ChartGeometry } from './geometry.js';
import type { DrawPrim } from './scene.js';
import { TypedRegistry } from '../extension/Registry.js';
import type { RegisterOptions, RegisterResult } from '../extension/Registry.js';

/**
 * 차트타입 렌더러 SPI — 순수. 공유 기하 → 자기 타입의 DrawPrim 기여(surface 미접촉, humble 유지).
 * `buildChartScene` 이 타입별로 이 renderer 를 호출해 prims 를 조립한다(Strategy).
 * / Chart-type renderer SPI — pure. Shared geometry → this type's DrawPrim contribution (never
 * touches a surface). buildChartScene calls it per type to assemble prims (Strategy).
 */
export interface IChartRenderer {
  /** 타입 키('bar'|'line'|…|커스텀). / Type key. */
  readonly type: string;
  /** 기하 힌트(정직성 §9.3 불변식). / Geometry hints (honesty invariants). */
  readonly geometryHints?: { forceZeroBaseline?: boolean; radialLinearOnly?: boolean };
  /** 공유 기하+색스냅샷 → 이 타입의 원시 드로우명령. DOM/canvas 미참조(불변식1). / Shared geometry → prims. */
  toPrims(model: ChartDataModel, spec: ChartRenderSpec, geo: ChartGeometry): readonly DrawPrim[];
}

/** SPI 이름·버전(peer 검증). / SPI name/version (peer verification). */
export const CHART_TYPE_SPI = { name: 'IChartRenderer', version: '1' } as const;

/**
 * 차트타입 레지스트리(§2.9) — DD-10 IRegistry 동형. resolve=lazy get, 미지 타입=null(→ unsupportedType
 * 배지, 조용한 폴백 금지 불변식4). 빌트인도 override 로 교체 가능(OCP).
 * / Chart-type registry (§2.9) — homomorphic to DD-10 IRegistry. resolve = lazy get; unknown type =
 * null (→ unsupportedType badge, no silent fallback). Built-ins are override-replaceable (OCP).
 */
export class ChartTypeRegistry {
  private _reg: TypedRegistry<IChartRenderer>;

  constructor() {
    this._reg = new TypedRegistry<IChartRenderer>({ spi: CHART_TYPE_SPI, duplicatePolicy: 'protect-builtin' });
  }

  /**
   * 렌더러 등록(정책 위임). / Register a renderer (policy delegated).
   * @param r - 차트타입 렌더러 / Chart-type renderer
   * @param opts - 등록 정책 메타(origin·override 등) / Registration policy meta
   * @returns 등록 결과(never-throw) / Registration result (never-throw)
   */
  register(r: IChartRenderer, opts?: RegisterOptions): RegisterResult {
    return this._reg.register(r.type, r, opts);
  }

  /**
   * 타입 → 렌더러(미등록 null → unsupportedType 배지). / Type → renderer (null when unregistered).
   * @param type - 차트타입 키 / Chart-type key
   * @returns 렌더러 또는 null / The renderer or null
   */
  resolve(type: string): IChartRenderer | null {
    return this._reg.get(type) ?? null;
  }

  /** 등록 키 목록. / Registered keys. */
  list(): string[] { return this._reg.list(); }
  /** 존재 여부. / Whether a type is registered. */
  has(type: string): boolean { return this._reg.has(type); }
}
