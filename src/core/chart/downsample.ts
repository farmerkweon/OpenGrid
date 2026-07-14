/**
 * F4 — 다운샘플/집계 (§8.2 / NFR-2 / REQ-20). 순수 함수, DOM/그리드 비의존.
 * / F4 — downsampling/aggregation (§8.2 / NFR-2 / REQ-20). Pure functions, DOM/grid-agnostic.
 *
 * 계약 근거: 11_design_F4_v2.md §8.2(line/area=LTTB+min/max 엔벨로프 정확 보존,
 * bar/pie=인접 category 버킷 집계), §C(sampled/sampledFrom/To → 배지), §10 downsample.spec
 * (series.data.length ≤ maxPoints && max/min(down)==max/min(orig)).
 * / Contract basis: §8.2 (line/area = LTTB + exact min/max envelope preservation; bar/pie =
 * adjacent-category bucket aggregation), §C (sampled/sampledFrom/To → badge), and the
 * downsample spec (series.data.length ≤ maxPoints && max/min(down) == max/min(orig)).
 *
 * LTTB = Largest-Triangle-Three-Buckets(Steinarsson 2013). 시각적 형태 보존 다운샘플의
 * 표준. 본 구현은 여기에 **엔벨로프 강제 보존**을 더한다 — 각 series 의 argmin/argmax 인덱스를
 * 반드시 선택 집합에 포함시켜, 다운샘플 후에도 각 series 의 극값(min/max)이 정확히 살아남는다.
 * / LTTB = Largest-Triangle-Three-Buckets (Steinarsson 2013), the standard shape-preserving
 * downsample. This implementation adds **forced envelope preservation** — each series's
 * argmin/argmax index is always kept in the selection set, so every series's extrema (min/max)
 * survive exactly after downsampling.
 */

import type { ChartDataModel, ChartSeries, ChartType } from './types.js';
import { buildA11yTable, type ChartNumberFormat } from './a11y.js';

/** line/area 계열(LTTB 대상). 그 외(bar 등)는 인접 category 버킷 집계. */
function isLineLike(type: ChartType): boolean {
  return type === 'line' || type === 'area';
}

function numericOf(v: number | null): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}

/** series 데이터에서 최소/최대값의 인덱스(엔벨로프). null 은 건너뛴다. */
function envelopeIndices(data: Array<number | null>): number[] {
  let minI = -1, maxI = -1, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = numericOf(data[i]!);
    if (v == null) continue;
    if (v < minV) { minV = v; minI = i; }
    if (v > maxV) { maxV = v; maxI = i; }
  }
  const out: number[] = [];
  if (minI >= 0) out.push(minI);
  if (maxI >= 0) out.push(maxI);
  return out;
}

/**
 * LTTB 코어 — x(=category index 0..n-1)·y(대표값) 에서 threshold 개 인덱스를 고른다.
 * 항상 첫/마지막을 포함한다. threshold>=n 이면 전 인덱스 반환.
 * / LTTB core — pick `threshold` indices from x (= category index 0..n-1) and y (representative
 * values). Always includes the first and last; returns all indices when threshold ≥ n.
 *
 * @param y - 대표값 배열(null 은 0 취급) / Representative-value array (null treated as 0)
 * @param threshold - 목표 선택 개수 / Target number of picks
 * @returns 오름차순 선택 인덱스 배열 / Ascending array of selected indices
 */
export function lttbIndices(y: Array<number | null>, threshold: number): number[] {
  const n = y.length;
  if (threshold >= n || threshold <= 2) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const yv = (i: number): number => numericOf(y[i]!) ?? 0;
  const sampled: number[] = [0];
  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    // 다음 버킷 평균점
    let avgX = 0, avgY = 0;
    const avgStart = Math.floor((i + 1) * bucketSize) + 1;
    let avgEnd = Math.floor((i + 2) * bucketSize) + 1;
    avgEnd = Math.min(avgEnd, n);
    const avgCount = avgEnd - avgStart;
    for (let j = avgStart; j < avgEnd; j++) { avgX += j; avgY += yv(j); }
    if (avgCount > 0) { avgX /= avgCount; avgY /= avgCount; }
    // 현재 버킷에서 삼각형 최대 넓이 점
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1;
    const ax = a, ay = yv(a);
    let maxArea = -1, maxIdx = rangeStart;
    for (let j = rangeStart; j < rangeEnd && j < n; j++) {
      const area = Math.abs((ax - avgX) * (yv(j) - ay) - (ax - j) * (avgY - ay)) * 0.5;
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    sampled.push(maxIdx);
    a = maxIdx;
  }
  sampled.push(n - 1);
  return sampled;
}

/** 다운샘플 결과. / Downsample result. */
export interface DownsampleResult {
  /** 축약된(또는 원본) 차트 데이터 모델. / The downsampled (or original) chart data model. */
  model: ChartDataModel;
  /** true 면 축약이 일어났다(배지 §C). / true when downsampling occurred (badge §C). */
  sampled: boolean;
}

/** 다운샘플 옵션(a11y 테이블 재생성용). / Downsample options (for a11y-table regeneration). */
export interface DownsampleOptions {
  /** a11y 캡션 제목. / a11y caption title. */
  title?: string | undefined;
  /** 셀 값 포맷터. / Cell value formatter. */
  numberFormat?: ChartNumberFormat | undefined;
}

/**
 * `ChartDataModel`을 maxPoints 이하로 축약한다(§8.2). categories/series 를 함께 줄여
 * 정합을 유지하고, meta.sampled/sampledFrom/sampledTo 를 채운다(배지 §C). a11yTable 은
 * 축약된 데이터로 재생성해 모델 자기정합을 유지한다(§B.4: 셀 수 == categories×(series+1)).
 * / Downsample a `ChartDataModel` to at most maxPoints (§8.2). categories and series are reduced
 * together to stay consistent, and meta.sampled/sampledFrom/sampledTo are filled (badge §C). The
 * a11yTable is regenerated from the reduced data to keep the model self-consistent
 * (§B.4: cell count == categories×(series+1)).
 *
 * - line/area: 공유 인덱스 LTTB + 각 series 엔벨로프(argmin/argmax) 강제 포함 → 극값 정확 보존.
 * - 그 외(bar): 인접 category 를 균등 버킷으로 묶어 대표(첫 category 라벨) + 값 합산.
 * / - line/area: shared-index LTTB plus each series's forced envelope (argmin/argmax) → exact
 *   extrema preservation.
 * - otherwise (bar): group adjacent categories into even buckets with a representative (first
 *   category label) and summed values.
 *
 * @param model - 축약 대상 모델 / Model to downsample
 * @param maxPoints - 목표 상한 포인트 수 / Target maximum point count
 * @param type - 차트 종류(line/area vs 그 외 분기) / Chart type (line/area vs otherwise branch)
 * @param opts - a11y 재생성용 제목·포맷터(선택) / Title/formatter for a11y regeneration (optional)
 * @returns 축약 모델 + 축약 여부 / The (possibly) downsampled model plus whether it was sampled
 */
export function downsampleModel(
  model: ChartDataModel,
  maxPoints: number,
  type: ChartType,
  opts: DownsampleOptions = {}
): DownsampleResult {
  const n = model.categories.length;
  if (!Number.isFinite(maxPoints) || maxPoints <= 0 || n <= maxPoints) {
    return { model, sampled: false };
  }

  let categories: string[];
  let series: ChartSeries[];

  if (isLineLike(type)) {
    // 대표값 = 첫 series(없으면 0). 형태 선택은 대표로, 극값은 엔벨로프로 보정.
    const repr = model.series[0]?.data ?? new Array(n).fill(0);
    const forced = new Set<number>([0, n - 1]);
    for (const s of model.series) for (const idx of envelopeIndices(s.data)) forced.add(idx);

    const selected = new Set<number>(forced);
    // 남은 예산을 LTTB 형태점으로 채운다(엔벨로프 우선, 총 maxPoints 상한 엄수).
    const picks = lttbIndices(repr, maxPoints);
    for (const idx of picks) {
      if (selected.size >= maxPoints) break;
      selected.add(idx);
    }
    // 엔벨로프가 예산을 넘겼다면(series 多) 첫/마지막+극값만 유지하며 상한 안에서 정리.
    let indices = [...selected].sort((x, y) => x - y);
    if (indices.length > maxPoints) {
      // 라운드로빈 배분(코드리뷰 Minor): series 순서를 순환하며 한 번에 하나씩 미채택 엔벨로프
      // 인덱스를 채택한다. 인덱스 오름차순으로 전부 모아 slice(0, maxPoints) 하면 뒤쪽 인덱스에
      // 극값이 있는 series 가 통째로 잘려나가므로, 각 series 가 최소 1개(예산이 허용하는 한
      // argmin/argmax)씩 균등하게 남도록 우선 채택한다.
      const keep = new Set<number>([0, n - 1]);
      const perSeriesEnvelopes = model.series.map(s => envelopeIndices(s.data));
      let added = true;
      while (added && keep.size < maxPoints) {
        added = false;
        for (const env of perSeriesEnvelopes) {
          if (keep.size >= maxPoints) break;
          const idx = env.find(i => !keep.has(i));
          if (idx !== undefined) { keep.add(idx); added = true; }
        }
      }
      indices = [...keep].sort((x, y) => x - y).slice(0, maxPoints);
    }

    categories = indices.map(i => model.categories[i]!);
    series = model.series.map(s => ({
      ...s,
      data: indices.map(i => s.data[i]!),
    }));
  } else {
    // bar/pie: 인접 category 균등 버킷 집계(합산). 라벨=버킷 첫 category(+ 범위 표기).
    const buckets = maxPoints;
    const per = n / buckets;
    categories = [];
    const bucketRanges: Array<[number, number]> = [];
    for (let b = 0; b < buckets; b++) {
      const start = Math.floor(b * per);
      const end = Math.min(Math.floor((b + 1) * per), n);
      if (start >= end) continue;
      bucketRanges.push([start, end]);
      const first = model.categories[start]!;
      const last = model.categories[end - 1]!;
      categories.push(end - start > 1 ? `${first}…${last}` : first);
    }
    series = model.series.map(s => ({
      ...s,
      data: bucketRanges.map(([start, end]) => {
        let sum = 0, any = false;
        for (let i = start; i < end; i++) {
          const v = numericOf(s.data[i]!);
          if (v != null) { sum += v; any = true; }
        }
        return any ? sum : null;
      }),
    }));
  }

  const newModel: ChartDataModel = {
    categories,
    series,
    meta: {
      ...model.meta,
      sampled: true,
      sampledFrom: n,
      sampledTo: categories.length,
      a11yTable: buildA11yTable(
        { categories, series },
        { title: opts.title, numberFormat: opts.numberFormat }
      ),
    },
  };

  return { model: newModel, sampled: true };
}
