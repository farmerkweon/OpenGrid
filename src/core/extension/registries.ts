// ============================================================
// DD-10 §5.3 파라미터화 레지스트리 인스턴스/팩토리 / parameterized registry factories
// ------------------------------------------------------------
// "1추상 + N인스턴스"(REQ-T4-801)의 N인스턴스. 각 확장점은 TypedRegistry 를 자기 값 타입으로
// 파라미터화한 얇은 팩토리. SPI 정본이 착지한 확장점(셀렌더러=DD-03·포맷터=DD-04)은 그 타입을
// import 하고, 검증기(IValidator)는 DD-10 소유. 미착지 SPI(차트·함수·커맨드·CF·데이터소스)는
// 값 타입을 호출측이 지정하는 제네릭 팩토리로 둔다(additive·비허구). 헤드리스.
// ============================================================

import { TypedRegistry } from './Registry.js';
import type { IValidator } from './IExtension.js';
import type { ICellRenderer } from '../render/CellRenderRequest.js';
import type { IFormatter } from '../format/types.js';

/**
 * 셀타입 레지스트리(ICellRenderer, DD-03 정본). 미등록 셀타입은 dev 물음표 플레이스홀더로
 * require 폴백(never-throw). / Cell-type registry (ICellRenderer; DD-03 canonical).
 *
 * @param placeholder - 미등록 셀타입 dev 플레이스홀더(선택) / Dev placeholder for unregistered cell types (optional)
 */
export function createCellTypeRegistry<T = any>(
  placeholder?: (key: string) => ICellRenderer<T>,
): TypedRegistry<ICellRenderer<T>> {
  const cfg: {
    spi: { name: string; version: string };
    duplicatePolicy: 'protect-builtin';
    placeholder?: (key: string) => ICellRenderer<T>;
  } = { spi: { name: 'ICellRenderer', version: '1' }, duplicatePolicy: 'protect-builtin' };
  if (placeholder) cfg.placeholder = placeholder;
  return new TypedRegistry<ICellRenderer<T>>(cfg);
}

/**
 * 확장 포맷터 레지스트리(IFormatter, DD-04 정본). 기존 format/FormatterRegistry 와 별개의
 * IRegistry 동형 인스턴스(어댑트는 adapters.ts). / Formatter extension registry (IFormatter; DD-04 canonical).
 */
export function createFormatterRegistry(): TypedRegistry<IFormatter> {
  return new TypedRegistry<IFormatter>({
    spi: { name: 'IFormatter', version: '1' },
    duplicatePolicy: 'protect-builtin',
  });
}

/**
 * 검증기 레지스트리(IValidator, DD-10 소유). 다중 적용 가능 = orderedApply 로 순서 결정.
 * / Validator registry (IValidator; DD-10-owned). Multi-apply via orderedApply.
 */
export function createValidatorRegistry(): TypedRegistry<IValidator> {
  return new TypedRegistry<IValidator>({ spi: { name: 'IValidator', version: '1' } });
}

/**
 * SPI 정본 미착지 확장점(차트타입·수식함수·커맨드·CF규칙·데이터소스·export채널)용 제네릭 팩토리.
 * 값 타입 V 를 호출측이 지정한다(소유 DD 착지 시 그 타입으로 교체). / Generic factory for
 * extension points whose canonical SPI has not yet landed.
 *
 * @param spiName - SPI 이름(peer 버저닝) / SPI name (peer versioning)
 * @param version - SPI 현재 major / Current SPI major
 * @param duplicatePolicy - 중복 정책(기본 protect-builtin) / Duplicate policy (default protect-builtin)
 */
export function createExtensionRegistry<V>(
  spiName: string,
  version = '1',
  duplicatePolicy: 'last-wins' | 'explicit-override' | 'protect-builtin' = 'protect-builtin',
): TypedRegistry<V> {
  return new TypedRegistry<V>({ spi: { name: spiName, version }, duplicatePolicy });
}
