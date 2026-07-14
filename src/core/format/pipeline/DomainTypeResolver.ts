// ============================================================
// DD-04 ② 도메인타입 해석 / DD-04 ② domain-type resolver
// 설계: DD-04 §2.3 · REQ-T2-009
// valueMap(열거형) 우선 → 도메인타입 확정 + 로케일 숫자 지시 산출.
// ============================================================

import type {
  ColumnFormatSpec, DomainDirective, DomainKind, IDomainTypeResolver,
  InterpretedValue, NumberDirective,
} from '../types.js';

/** DD-01 ValueKind → 표시 DomainKind 매핑(spec.domain 미확정 시 폴백). / Map DD-01 ValueKind to a display DomainKind. */
const VALUEKIND_TO_DOMAIN: Record<string, DomainKind> = {
  money: 'money',
  delta: 'delta',
  percent: 'percent',
  percentagePoint: 'percent',
  growthRate: 'percent',
  ratio: 'number',
  number: 'number',
  quantity: 'number',
  text: 'text',
  missing: 'missing',
  error: 'text',
};

/** spec 에서 로케일 숫자 지시 산출. / Build a locale number directive from the spec. */
function numberDirective(spec: ColumnFormatSpec, domain: DomainKind): NumberDirective {
  const d: { minFraction?: number; maxFraction?: number; grouping: boolean } = {
    grouping: domain === 'number' || domain === 'currency' || domain === 'money' || domain === 'percent',
  };
  if (spec.precision != null) { d.minFraction = spec.precision; d.maxFraction = spec.precision; }
  return d;
}

/**
 * 기본 도메인타입 해석기. valueMap 최우선, 그 다음 spec.domain, 폴백은 valueKind 추론.
 * / Default resolver. valueMap wins; then spec.domain; falls back to inferring from valueKind.
 */
export class DomainTypeResolver implements IDomainTypeResolver {
  resolve(v: InterpretedValue, spec: ColumnFormatSpec): DomainDirective {
    // valueMap(열거형) — 도메인타입보다 우선 / value map wins over domain type
    if (spec.valueMap) {
      const key = v.text ?? (v.magnitude != null ? String(v.magnitude) : '');
      const mapped = spec.valueMap[key];
      if (mapped !== undefined) return { domain: spec.domain, valueMapped: mapped };
    }

    // 도메인 확정: spec.domain 이 지시하되, 값객체가 money/delta 면 통화·부호를 살린다.
    let domain: DomainKind = spec.domain;
    if (domain == null || (domain === 'number' && (v.valueKind === 'money' || v.valueKind === 'delta'))) {
      domain = VALUEKIND_TO_DOMAIN[v.valueKind] ?? 'number';
    }

    const currency = spec.currency ?? v.currency;
    const out: DomainDirective = { domain, number: numberDirective(spec, domain) };
    const withCur = currency !== undefined ? { ...out, currency } : out;
    return spec.mask !== undefined ? { ...withCur, maskDef: spec.mask } : withCur;
  }
}
