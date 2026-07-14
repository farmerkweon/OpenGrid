/**
 * DD-06 — 무결성 메타(provenance) 데이터 모델·배지 SSOT(§9.4·REQ-T6-810/811/812).
 * / DD-06 — integrity meta (provenance) data model & badge SSOT (§9.4·REQ-T6-810/811/812).
 *
 * 변환 이력(다운샘플·집계·절댓값·절단축·엔진폴백·미지원타입)의 **단일 데이터 모델**. 산발 각주
 * 금지 — canvas 화면·SVG `<desc>`·서버 PNG 사이드카·export 캡션이 전부 이 모델을 소비한다.
 * 배지 텍스트는 로케일 `t` 를 주입받아 해석하되, M/N 정확성은 이 순수 모델에서 계량한다.
 * / A single data model for the transform lineage. No scattered footnotes — canvas, SVG `<desc>`,
 * the server PNG sidecar, and export captions all consume this model. Badge text is resolved via
 * an injected locale `t`, while M/N accuracy is quantified here in the pure model.
 */

import type { ChartDataModelMeta } from './types.js';

/** 배지 종류(§9.4 통일 문법). / Badge kind (§9.4 unified grammar). */
export type BadgeKind =
  | 'sampled' | 'aggregated' | 'negativesAbsInPie' | 'pieReducedToFirst'
  | 'truncatedAxis' | 'engineFallback' | 'unsupportedType';

/** 무결성 배지 한 건(위치·형태·상호작용은 렌더 계층, 여기선 데이터). / One integrity badge (data only). */
export interface ProvenanceBadge {
  readonly kind: BadgeKind;
  /** 배지 M(표시)/N(원본) — sampled 에서 채워짐(REQ-T6-810). / Badge M(shown)/N(source). */
  readonly m?: number;
  readonly n?: number;
  /** 로케일 키(t 해석). / Locale key (resolved by t). */
  readonly key: string;
  /** 로케일 파라미터. / Locale params. */
  readonly params?: Readonly<Record<string, string | number>>;
}

/** 차트 provenance(scene.meta 동행). / Chart provenance (travels with scene.meta). */
export interface ChartProvenance {
  readonly badges: readonly ProvenanceBadge[];
  /** 정상(무왜곡) 차트는 배지 0개(§9.3.4 게이트). / An honest (undistorted) chart has 0 badges. */
  readonly clean: boolean;
}

/** 추가 변환 플래그(meta 에 없는 절단축·엔진/타입 폴백). / Extra transform flags not in meta. */
export interface ProvenanceExtra {
  /** line y축 절단(min≠0 opt-in) — 배지 강제(§9.3.1). / Truncated line y-axis (opt-in). */
  truncatedAxis?: boolean;
  /** 외부 엔진 미로드 → builtin 폴백(REQ-T6-812). / External engine fallback. */
  engineFallback?: boolean;
  /** 미지원 차트타입 → builtin 폴백(REQ-T6-812). / Unsupported chart type fallback. */
  unsupportedType?: boolean;
}

/**
 * meta(+extra) → provenance 배지 모델. 순수·결정론. 변형이 없으면 clean=true(배지 0).
 * / meta (+extra) → provenance badge model. Pure & deterministic. clean=true (0 badges) when nothing transformed.
 *
 * @param meta - 차트 데이터 모델 메타 / Chart data model meta
 * @param extra - 절단축·엔진/타입 폴백 플래그(선택) / Truncated-axis / engine-type fallback flags (optional)
 * @returns provenance 배지 모델 / Provenance badge model
 */
export function buildProvenance(meta: ChartDataModelMeta, extra: ProvenanceExtra = {}): ChartProvenance {
  const badges: ProvenanceBadge[] = [];
  if (meta.sampled) {
    const b: { kind: BadgeKind; m?: number; n?: number; key: string; params?: Record<string, string | number> } = {
      kind: 'sampled', key: 'chart.badge.sampled', params: { m: meta.sampledTo ?? 0, n: meta.sampledFrom ?? 0 },
    };
    if (meta.sampledTo !== undefined) b.m = meta.sampledTo;
    if (meta.sampledFrom !== undefined) b.n = meta.sampledFrom;
    badges.push(b);
  }
  if (meta.aggregatedOp) {
    badges.push({ kind: 'aggregated', key: 'chart.badge.aggregated', params: { op: meta.aggregatedOp } });
  }
  if (meta.negativesAbsInPie) {
    badges.push({ kind: 'negativesAbsInPie', key: 'chart.badge.negativesAbsInPie' });
  }
  if (meta.pieReducedToFirst) {
    badges.push({ kind: 'pieReducedToFirst', key: 'chart.badge.pieReducedToFirst' });
  }
  if (extra.truncatedAxis) badges.push({ kind: 'truncatedAxis', key: 'chart.badge.truncatedAxis' });
  if (extra.engineFallback) badges.push({ kind: 'engineFallback', key: 'chart.badge.engineFallback' });
  if (extra.unsupportedType) badges.push({ kind: 'unsupportedType', key: 'chart.badge.unsupportedType' });
  return { badges, clean: badges.length === 0 };
}

/**
 * 배지 → 표시 문자열(로케일 t 주입). 산발 각주 대신 이 함수를 전 표면 공유(§9.4).
 * / Badge → display string (inject locale t). Shared by all surfaces instead of scattered footnotes.
 *
 * @param badge - 배지 / The badge
 * @param t - 로케일 해석기(키·파라미터 → 문자열). 미주입 시 폴백 영문 / Locale resolver; English fallback when absent
 * @returns 표시 문자열 / Display string
 */
export function badgeText(badge: ProvenanceBadge, t?: (key: string, params?: Record<string, string | number>) => string): string {
  if (t) return t(badge.key, badge.params as Record<string, string | number> | undefined);
  // 폴백(로케일 미주입 서버/테스트) — 정직한 영문 요약.
  switch (badge.kind) {
    case 'sampled': return `Showing ${badge.m ?? '?'} of ${badge.n ?? '?'} points (downsampled)`;
    case 'aggregated': return `Aggregated (${badge.params?.['op'] ?? ''})`;
    case 'negativesAbsInPie': return 'Negatives shown as absolute values';
    case 'pieReducedToFirst': return 'Pie uses the first series only';
    case 'truncatedAxis': return 'Y-axis does not start at zero';
    case 'engineFallback': return 'External engine unavailable — built-in fallback';
    case 'unsupportedType': return 'Unsupported chart type — fell back to built-in';
    default: return badge.key;
  }
}
