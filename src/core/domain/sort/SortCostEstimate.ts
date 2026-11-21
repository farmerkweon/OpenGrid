// ============================================================
// 정렬이 얼마나 걸릴지 어림 / Sort cost estimate
//
// 「나눠서 할까, 한 번에 할까」를 고르는 근거만 낸다. 틀려도 정렬 결과는 같고 늦게 끝날 뿐이라
// 정교할 필요는 없다 — 비교 정렬의 n·log2(n) 에 키 종류마다 한 번 비교하는 값어치를 곱한다.
// 값어치는 Node 에서 10만 행을 옛 비교자로 정렬해 잰 시간의 크기(숫자 ≈ 20ms)를 바탕으로 잡았고,
// 종류 사이의 차례(섞인 값 > 글자 > 숫자)는 섞인 열을 숫자만큼 싸게 보지 않으려는 쪽으로 정했다.
// 글자 키는 길수록 비교가 비싸므로 표본 몇 개의 평균 길이를 더 본다(4,000자 열이 짧은 열처럼 보이지 않게).
// 보관된 등수로 정렬하면 정수 비교라 숫자 키 값어치로 본다.
//
// Produces only the basis for "slice or run at once". Being wrong changes nothing but finishing time,
// so it is deliberately coarse: n·log2(n) times a per-comparison weight for each key kind.
// Weights follow the magnitude measured in Node for 100k rows with the legacy comparator (numbers ≈ 20ms);
// the ordering between kinds (general > string > number) keeps mixed columns from looking as cheap as numbers.
// String keys also look at the mean length of a few samples so a 4,000-char column is not mistaken for a short one.
// Sorting by retained ranks is an integer comparison, so it is costed like a number key.
// ============================================================
import type { ISortCostEstimate, ISortKeyColumn, ISortOrderer } from './ports.js';
import { commonPrefix } from './commonPrefix.js';

/** 머리말을 기억하는 순서 매기기의 이름표. / Id of the prefix-aware orderer. */
const PREFIX_ORDERER_ID = 'lcpMerge';
/** 머리말 판정 표본 수 — 판정 비용이 행 수와 무관하도록 고정. / Fixed sample size for the prefix check. */
const PREFIX_SAMPLES = 1024;
/** 표본 이웃 평균 공통 머리말이 이 길이를 넘으면 머리말 기억 정렬. / Mean neighbour prefix above which it pays off. */
const PREFIX_THRESHOLD = 64;

/** 한 비교의 값어치(ms / (n·log2 n)) — 키 종류별. / Per-comparison weight by key kind. */
const NUMBER_WEIGHT = 1.2e-5;
const GENERAL_WEIGHT = 3.0e-5;
const STRING_BASE_WEIGHT = 2.0e-5;
const STRING_PER_CHAR_WEIGHT = 1.0e-7;
/** 글자 길이 표본 수 — 판정 비용이 행 수와 무관하도록 고정. / Fixed sample count, independent of row count. */
const LENGTH_SAMPLES = 64;
/** 이 시간을 넘으면 나누는 쪽을 권한다(머리글 누름 기준). / Default slicing threshold in ms. */
const DEFAULT_THRESHOLD_MS = 100;

/** 표본 몇 개로 본 글자 키의 평균 길이(문자열 키가 아니면 0). */
function meanKeyLength(key: ISortKeyColumn, rowCount: number): number {
  const samples = Math.min(LENGTH_SAMPLES, rowCount);
  if (samples === 0) return 0;
  const step = rowCount / samples;
  let total = 0;
  for (let s = 0; s < samples; s++) {
    const k = key.stringKeyAt(Math.floor(s * step));
    if (k !== null) total += k.length;
  }
  return total / samples;
}

/** 키 종류 → 한 비교 값어치. 종류를 조건문으로 가르지 않고 표로 찾는다. */
const WEIGHT_OF: Readonly<Record<ISortKeyColumn['kind'], (key: ISortKeyColumn, rowCount: number) => number>> = {
  number: () => NUMBER_WEIGHT,
  ranked: () => NUMBER_WEIGHT,
  general: () => GENERAL_WEIGHT,
  string: (key, rowCount) => STRING_BASE_WEIGHT + STRING_PER_CHAR_WEIGHT * meanKeyLength(key, rowCount),
};

/**
 * 정렬 시간 어림(값 객체). 만들 때 한 번 셈하고 바뀌지 않는다.
 *
 * Immutable sort-time estimate, computed once at construction.
 */
export class SortCostEstimate implements ISortCostEstimate {
  private constructor(readonly expectedMs: number) {}

  /**
   * @param rowCount 정렬할 행 수 / rows to sort
   * @param keys 키 열(우선순위 순) / key columns in priority order
   * @param fresh 보관된 등수를 쓸 수 있는가 / whether retained ranks can be used
   */
  static of(rowCount: number, keys: readonly ISortKeyColumn[], fresh: boolean): SortCostEstimate {
    const n = Math.max(0, Math.floor(rowCount));
    if (n < 2 || keys.length === 0) return new SortCostEstimate(0);
    let weight = 0;
    for (const key of keys) weight += fresh ? NUMBER_WEIGHT : WEIGHT_OF[key.kind](key, n);
    return new SortCostEstimate(n * Math.log2(n) * weight);
  }

  prefersSlicing(thresholdMs: number = DEFAULT_THRESHOLD_MS): boolean {
    return this.expectedMs > thresholdMs;
  }

  /**
   * 문자열 키의 「표본을 정렬한 뒤 이웃끼리의 평균 공통 머리말 길이」. 무작위 두 글만 견주면 긴 머리말 묶음이
   * 여럿인 자료(묶음마다 다른 머리말)를 놓치므로, 표본을 먼저 정렬해 이웃을 본다.
   * 표본은 출발 순서를 1,024 칸으로 나눠 칸마다 하나(칸 안 자리는 고정 씨앗) — 같은 자료면 늘 같은 값이고,
   * 키를 읽는 횟수는 행 수와 무관하게 많아야 1,024 번이다. 빈 값은 건너뛴다.
   *
   * Mean common prefix of sorted-sample neighbours for a string key. Comparing random pairs misses data with
   * several long-prefix groups, so the sample is sorted first. One row per 1,024 equal slices of the start order
   * (fixed-seed offset inside each slice): deterministic, and at most 1,024 key reads whatever the row count.
   */
  static meanCommonPrefix(key: ISortKeyColumn, start: readonly number[]): number {
    const m = start.length;
    const take = m < PREFIX_SAMPLES ? m : PREFIX_SAMPLES;
    const sample: string[] = [];
    let seed = 0x9e3779b9;
    for (let s = 0; s < take; s++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      // 칸 [lo, hi) 는 정수 경계라 칸끼리 겹치지 않는다 — 같은 행을 두 번 뽑지 않음.
      // Integer slot bounds [lo, hi) never overlap, so no row is sampled twice.
      const lo = Math.floor((s * m) / take), hi = Math.floor(((s + 1) * m) / take);
      const at = lo + Math.floor((seed / 4294967296) * (hi - lo));
      const k = key.stringKeyAt(start[at]!);
      if (k !== null) sample.push(k);
    }
    if (sample.length < 2) return 0;
    // 내장 정렬(비교자 없음)은 UTF-16 코드 단위 순 — 옛 비교 규칙과 같은 차례로 이웃이 놓인다.
    // The comparator-less built-in sort orders by UTF-16 code units, the same order the legacy rule uses.
    sample.sort();
    let total = 0;
    for (let i = 1; i < sample.length; i++) total += commonPrefix(sample[i - 1]!, sample[i]!, 0);
    return total / (sample.length - 1);
  }

  /**
   * 순서 매기기 고르기: 받아 주는 것들 가운데 머리말 기억 정렬은 행이 표본 수 이상이고 표본 이웃 평균 공통 머리말이
   * 문턱(64자)을 넘을 때만, 아니면 그 밖의 첫 전략. 후보 목록의 차례와 무관하게 같은 것을 고른다.
   *
   * Orderer choice: the prefix-aware orderer only when there are at least sample-size rows and the sampled mean
   * neighbour prefix exceeds 64; otherwise the first other accepting orderer. Independent of candidate order.
   */
  static pickOrderer(orderers: readonly ISortOrderer[], keys: readonly ISortKeyColumn[], start: readonly number[]): ISortOrderer {
    let prefix: ISortOrderer | null = null, other: ISortOrderer | null = null;
    for (const o of orderers) {
      if (!o.accepts(keys, start.length)) continue;
      if (o.id === PREFIX_ORDERER_ID) prefix ??= o;
      else other ??= o;
    }
    if (prefix && (!other || (start.length >= PREFIX_SAMPLES && SortCostEstimate.meanCommonPrefix(keys[0]!, start) > PREFIX_THRESHOLD))) return prefix;
    if (!other) throw new Error('Sorter: no orderer accepts these keys');
    return other;
  }
}
