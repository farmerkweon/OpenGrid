/**
 * DD-06 — 다운샘플 정직성 계량(§2.7·REQ-T6-809·UC-4). 순수·헤드리스.
 * / DD-06 — downsample honesty metrics (§2.7·REQ-T6-809·UC-4). Pure & headless.
 *
 * 현 `downsampleModel`(downsample.ts)은 엔벨로프 강제로 극값을 보존하나 **정량 보고가 없다**. 이
 * 모듈은 원본↔축약 모델을 비교해 계약 산출물 `DownsampleReport` 를 **비파괴로** 산출한다
 * (downsample.ts 무수정 — 병렬 개발 규율). 게이트: 극값 보존율 100%·특징 검출율 ≥95%·표시 편차 ≤1px.
 * / `downsampleModel` preserves extrema via forced envelopes but emits no quantitative report.
 * This module compares original↔reduced models to produce the contract artifact `DownsampleReport`
 * non-destructively (downsample.ts untouched). Gate: extrema 100% · feature ≥95% · deviation ≤1px.
 */

import type { ChartDataModel, ChartType } from './types.js';

/** 다운샘플 정직성 보고(§2.7). / Downsample honesty report (§2.7). */
export interface DownsampleReport {
  /** 원본 포인트 수(배지 N). / Original point count (badge N). */
  readonly from: number;
  /** 축약 포인트 수(배지 M). / Reduced point count (badge M). */
  readonly to: number;
  /** 전역 min/max 정확 보존(100% 게이트). / Exact global min/max preserved. */
  readonly extremaPreserved: boolean;
  /** series 별 극값 보존. / Per-series extrema preservation. */
  readonly perSeriesExtrema: ReadonlyArray<{ minKept: boolean; maxKept: boolean }>;
  /** 로컬 특징(피크/급증) 검출율(≥0.95 게이트). / Local-feature detection rate. */
  readonly featureDetectRate: number;
  /** 표시 편차(≤1px 게이트). / Max display deviation in px. */
  readonly maxDisplayDeviationPx: number;
}

function nums(data: ReadonlyArray<number | null>): number[] {
  return data.filter((v): v is number => v != null && !Number.isNaN(v));
}
function extentOf(data: ReadonlyArray<number | null>): { min: number; max: number } | null {
  const n = nums(data);
  return n.length ? { min: Math.min(...n), max: Math.max(...n) } : null;
}

/** 원본 series 의 로컬 극점(엄격 피크/골) 인덱스. / Strict local peak/trough indices of a series. */
function localFeatures(data: ReadonlyArray<number | null>): number[] {
  const out: number[] = [];
  for (let i = 1; i < data.length - 1; i++) {
    const p = data[i - 1], c = data[i], n = data[i + 1];
    if (p == null || c == null || n == null) continue;
    if ((c > p && c > n) || (c < p && c < n)) out.push(i);
  }
  return out;
}

/**
 * 원본↔축약 비교로 정직성 보고를 계량한다(line/area 대상). bar/pie(버킷 집계)는 값이 변형되므로
 * 극값 계량이 무의미 → from/to 만 채우고 featureDetectRate=1(집계는 다른 정직성 축, 배지가 고지).
 * / Quantify the honesty report by comparing original↔reduced (for line/area). For bar/pie (bucket
 * aggregation) values change, so extrema metrics are moot → fill from/to only, featureDetectRate=1
 * (aggregation is a different honesty axis, disclosed by the badge).
 *
 * @param original - 원본 모델 / Original model
 * @param reduced - 축약 모델 / Reduced model
 * @param type - 차트 타입 / Chart type
 * @param size - 표시 편차 계량용 크기(선택, 기본 480×300) / Size for display-deviation metric (default 480×300)
 * @returns 다운샘플 보고 / The downsample report
 */
export function analyzeDownsample(
  original: ChartDataModel,
  reduced: ChartDataModel,
  type: ChartType,
  size: { width: number; height: number } = { width: 480, height: 300 },
): DownsampleReport {
  const from = original.categories.length;
  const to = reduced.categories.length;
  const isLineLike = type === 'line' || type === 'area';

  if (!isLineLike) {
    return { from, to, extremaPreserved: true, perSeriesExtrema: original.series.map(() => ({ minKept: true, maxKept: true })), featureDetectRate: 1, maxDisplayDeviationPx: 0 };
  }

  // 축약값 집합(정확 보존은 값 존재로 확인 — LTTB+엔벨로프는 원본 값을 그대로 옮긴다).
  const perSeriesExtrema = original.series.map((s, si) => {
    const oExt = extentOf(s.data);
    const rSet = new Set(nums(reduced.series[si]?.data ?? []));
    if (!oExt) return { minKept: true, maxKept: true };
    return { minKept: rSet.has(oExt.min), maxKept: rSet.has(oExt.max) };
  });
  const extremaPreserved = perSeriesExtrema.every(e => e.minKept && e.maxKept);

  // 특징 검출율 — 첫 series 의 로컬 극점 중 축약에 살아남은 비율.
  const repr = original.series[0]?.data ?? [];
  const feats = localFeatures(repr);
  let detected = 0;
  if (feats.length) {
    const keptVals = new Set(nums(reduced.series[0]?.data ?? []));
    for (const i of feats) if (keptVals.has(repr[i] as number)) detected++;
  }
  const featureDetectRate = feats.length ? detected / feats.length : 1;

  // 표시 편차 — 원본 각 x 에서 (축약 폴리라인 선형보간 값) 대비 픽셀 수직차의 최대(첫 series).
  const maxDisplayDeviationPx = maxDeviationPx(original, reduced, size);

  return { from, to, extremaPreserved, perSeriesExtrema, featureDetectRate, maxDisplayDeviationPx };
}

/** 첫 series 기준, 원본점 대비 축약 폴리라인 선형보간의 최대 픽셀 수직편차. */
function maxDeviationPx(original: ChartDataModel, reduced: ChartDataModel, size: { width: number; height: number }): number {
  const o = original.series[0]?.data ?? [];
  const r = reduced.series[0]?.data ?? [];
  const oNums = nums(o);
  if (oNums.length < 2 || r.length < 2) return 0;
  const min = Math.min(...oNums), max = Math.max(...oNums);
  const span = max - min || 1;
  const plotH = Math.max(1, size.height - 60); // PLOT_PAD.top+bottom 근사(=60)
  const n = original.categories.length;

  // 축약 인덱스(원본 카테고리 라벨 위치)로 x 매핑: 축약 카테고리는 원본 순서 부분집합이므로 라벨 매칭.
  const labelToOrig = new Map<string, number>();
  original.categories.forEach((c, i) => { if (!labelToOrig.has(c)) labelToOrig.set(c, i); });
  const kept: Array<{ x: number; v: number }> = [];
  reduced.categories.forEach((c, ri) => {
    const oi = labelToOrig.get(c);
    const v = r[ri];
    if (oi !== undefined && v != null && !Number.isNaN(v)) kept.push({ x: oi, v });
  });
  if (kept.length < 2) return 0;
  kept.sort((a, b) => a.x - b.x);

  let maxDev = 0;
  const toPx = (v: number): number => plotH - ((v - min) / span) * plotH;
  for (let i = 0; i < n; i++) {
    const ov = o[i];
    if (ov == null || Number.isNaN(ov)) continue;
    // 축약 폴리라인에서 x=i 의 보간값.
    let interp: number | null = null;
    for (let k = 0; k < kept.length - 1; k++) {
      const a = kept[k]!, b = kept[k + 1]!;
      if (i >= a.x && i <= b.x) {
        const t = b.x === a.x ? 0 : (i - a.x) / (b.x - a.x);
        interp = a.v + (b.v - a.v) * t;
        break;
      }
    }
    if (interp == null) continue;
    maxDev = Math.max(maxDev, Math.abs(toPx(ov) - toPx(interp)));
  }
  return maxDev;
}
