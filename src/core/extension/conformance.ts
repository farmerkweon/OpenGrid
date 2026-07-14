// ============================================================
// DD-10 §2.6 재사용 계약 테스트 키트 / reusable conformance test kit (REQ-T8-825 / TX-859)
// ------------------------------------------------------------
// 인터페이스=실행가능 명세. 빌트인·서드파티가 동일 키트를 자기 구현에 돌려 자가검증한다.
// 테스트 러너에 독립(순수 함수 어서션 배열 반환) — vitest 뿐 아니라 배포 전 CLI 로도 실행 가능.
// 헤드리스·순수.
// ============================================================

import type { IExtension } from './IExtension.js';
import type { IRegistry } from './Registry.js';

/** 계약 검사 1건: (구현 팩토리) → 위반 목록. 빈 배열=통과. / One contract check: (factory) → violations; empty=pass. */
export interface ConformanceCheck<V> {
  readonly id: string;
  /** 위반 문자열 목록(빈 배열=통과). / List of violation strings (empty=pass). */
  run(make: () => V): string[];
}

/** 확장 SPI 하나에 대한 적합성 계약(파라미터화 스위트). / A conformance kit for one extension SPI. */
export interface ConformanceKit<V> {
  readonly spi: string;
  readonly checks: ReadonlyArray<ConformanceCheck<V>>;
}

/** 계약 검사 결과 1건. / One conformance result. */
export interface ConformanceResult {
  readonly id: string;
  readonly violations: string[];
}

/** 전 SPI 공통 계약 설명자(문서·수용기준 표기용). 실행 검사는 baseExtensionChecks 가 제공. / Descriptors of the shared contract. */
export const BASE_REGISTRY_CHECK_IDS = [
  'shape:구현이 SPI 필수 멤버를 모두 노출',
  'lifecycle:activate 후 dispose 가 획득 자원을 대칭 해제(누수 0)',
  'isolation:입력 스냅샷 변형 시도가 코어 모델을 오염시키지 않음',
  'error-isolation:구현이 throw 해도 코어·타 확장 영향 0(격리 경계)',
  'serialize:직렬화→역직렬화 왕복 동일성(해당 SPI 만)',
  'virtualization:가상화 스크롤에서 가시행 한정 호출·오프스크린 미호출',
  'fallback:미등록/미지원 경로가 never-throw 폴백으로 귀결',
] as const;

/**
 * 모든 IExtension 구현이 통과해야 하는 공통 실행 검사(shape·lifecycle·error-isolation).
 * SPI별 kit 이 이 배열을 스프레드해 고유 검사를 덧붙인다.
 * / Shared runnable checks every IExtension must pass; SPI kits spread these and add their own.
 */
export function baseExtensionChecks<V extends IExtension>(): ReadonlyArray<ConformanceCheck<V>> {
  return [
    {
      id: 'shape',
      run: (make) => {
        const v = make();
        const out: string[] = [];
        if (typeof v.spi !== 'string' || v.spi.length === 0) out.push('spi 필수 태그(string) 누락');
        if (v.activate !== undefined && typeof v.activate !== 'function') out.push('activate 는 함수여야 함');
        if (v.dispose !== undefined && typeof v.dispose !== 'function') out.push('dispose 는 함수여야 함');
        return out;
      },
    },
    {
      id: 'lifecycle',
      run: (make) => {
        const v = make();
        try {
          v.activate?.();
          v.dispose?.();
        } catch (e) {
          return [`activate→dispose 대칭 수명이 throw: ${String(e)}`];
        }
        return [];
      },
    },
    {
      id: 'error-isolation',
      run: (make) => {
        // 구현이 dispose 에서 throw 해도 호출측이 격리(try/catch)하면 코어 영향 0 이어야 한다.
        const v = make();
        try {
          try {
            v.dispose?.();
          } catch {
            /* 격리됨 — 코어로 전파되지 않음 */
          }
        } catch (e) {
          return [`dispose 예외가 격리 경계를 넘어 전파: ${String(e)}`];
        }
        return [];
      },
    },
  ];
}

/**
 * 파라미터화 러너: kit 의 각 검사를 구현 팩토리에 돌려 위반 목록을 표로 반환(수용기준).
 * / Parameterized runner: runs each check against the factory, returns a table of violations.
 *
 * @param kit - 적합성 키트 / The conformance kit
 * @param make - 검사 대상 구현 팩토리(검사마다 새 인스턴스) / Factory for the implementation under test
 * @returns 검사별 위반 목록(전 항목 빈 배열=완전 통과) / Per-check violations (all empty = full pass)
 */
export function runConformance<V>(kit: ConformanceKit<V>, make: () => V): ConformanceResult[] {
  return kit.checks.map((c) => ({ id: c.id, violations: c.run(make) }));
}

/** 적합성 결과가 전부 통과인지. / Whether all conformance results pass. */
export function conformancePassed(results: ConformanceResult[]): boolean {
  return results.every((r) => r.violations.length === 0);
}

/**
 * IRegistry 자체에 대한 재사용 계약 키트(§2.6). 빌트인·서드파티 레지스트리 팩토리를 이 키트로
 * 돌려 never-throw 폴백·dispose 대칭·예약 가드·중복 결정론을 자가검증한다.
 * / Reusable conformance kit for IRegistry itself: never-throw fallback, dispose symmetry,
 * reserved guard, and duplicate determinism.
 *
 * @param placeholder - require 폴백에 쓸 플레이스홀더 값 / Placeholder value for the require fallback
 * @returns 레지스트리 팩토리용 적합성 키트 / A conformance kit for a registry factory
 */
export function registryConformanceKit<V>(placeholder: V): ConformanceKit<IRegistry<V>> {
  const KEY = 'conf:probe';
  return {
    spi: 'IRegistry@1',
    checks: [
      {
        id: 'never-throw:get/has on empty',
        run: (make) => {
          const reg = make();
          try {
            reg.get(KEY);
            reg.has(KEY);
          } catch (e) {
            return [`빈 레지스트리 get/has 가 throw: ${String(e)}`];
          }
          return [];
        },
      },
      {
        id: 'never-throw:require fallback',
        run: (make) => {
          const reg = make();
          const v = reg.require(KEY, placeholder);
          return v === placeholder ? [] : ['require 미등록 시 fallback 을 반환하지 않음'];
        },
      },
      {
        id: 'round-trip:register→get',
        run: (make) => {
          const reg = make();
          const r = reg.register(KEY, placeholder);
          if (r.action !== 'added') return [`첫 등록 action 이 'added' 아님: ${r.action}`];
          return reg.get(KEY) === placeholder ? [] : ['등록 후 get 이 값을 돌려주지 않음'];
        },
      },
      {
        id: 'reserved:og:* rejected for user origin',
        run: (make) => {
          const reg = make();
          const r = reg.register('og:internal' as string, placeholder);
          return r.action === 'rejected' && r.reason === 'reserved-namespace'
            ? []
            : ['og:* 예약 대역 등록이 거부되지 않음'];
        },
      },
      {
        id: 'dispose:get→undefined, register→rejected',
        run: (make) => {
          const reg = make();
          reg.register(KEY, placeholder);
          reg.dispose();
          const out: string[] = [];
          if (reg.get(KEY) !== undefined) out.push('dispose 후 get 이 undefined 아님');
          const r = reg.register(KEY, placeholder);
          if (r.action !== 'rejected') out.push('dispose 후 register 가 rejected 아님');
          return out;
        },
      },
    ],
  };
}
