// ============================================================
// 공통 머리말을 기억하는 병합 정렬 / LCP-aware merge sort
//
// 4,000자 글 가운데 앞 3,900자가 같은 열을 보통 비교 정렬로 정렬하면, 비교할 때마다 같은 머리말 3,900자를
// 처음부터 다시 훑는다. 이 정렬은 이웃끼리 「몇 글자까지 같은가」(공통 머리말 길이)를 들고 병합하므로,
// 이미 아는 만큼은 다시 읽지 않는다 — 같은 순서를 몇 배 빠르게 낸다.
// 공통 머리말이 짧은 자료(보통 글)에서는 오히려 느리므로 늘 쓰지 않는다: 정렬 비용 어림(SortCostEstimate)이
// 표본을 보고 이 전략을 고를 때만 쓴다. 드물게 타는 길이라 처음 필요해질 때 따로 내려받는 조각(지연 청크)에 둔다.
//
// 순서 규칙은 옛 비교자와 같다: 빈 값(null/undefined)이 앞(내림차순이면 뒤), 나머지는 UTF-16 코드 단위 사전순,
// 같은 값은 출발 순서 그대로(안정). 안정 정렬의 결과는 하나뿐이라 비교 정렬과 바이트까지 같다.
//
// Sorting 4,000-char strings that share a 3,900-char prefix with a comparison sort rescans that prefix on
// every comparison. This merge sort carries each neighbour's longest common prefix, so known characters are
// never re-read — the same order, several times faster. It is slower on short-prefix data, so it is used only
// when SortCostEstimate picks it from a sample, and it ships in a lazily loaded chunk.
// Ordering matches the legacy comparator (empties first — last when descending — then UTF-16 code units,
// equal keys keep the start order); a stable sort's result is unique, so it equals the comparison sort byte for byte.
// ============================================================
import type { ISortKeyColumn, ISortOrderer, SortDir } from './ports.js';
import { commonPrefix } from './commonPrefix.js';

// 이 조각(지연 청크)을 받은 쪽이 「이 전략을 쓸지」도 같이 고를 수 있게 비용 어림을 함께 내보낸다.
// The chunk also carries the cost estimate, so whoever loads it can decide when to use this strategy.
export { SortCostEstimate } from './SortCostEstimate.js';

/**
 * 문자열 키 하나로 정렬하는 안정 병합 정렬. 이웃 공통 머리말 배열(H)을 들고 아래→위로 병합한다.
 *
 * Stable merge sort on a single string key; merges bottom-up while carrying the neighbour LCP array.
 */
export class LcpMergeOrderer implements ISortOrderer {
  readonly id = 'lcpMerge';

  /** 문자열 키 열 하나일 때만(숫자·섞인 열·등수·여러 키는 비교 정렬). */
  accepts(keys: readonly ISortKeyColumn[], _rowCount: number): boolean {
    return keys.length === 1 && keys[0]!.kind === 'string';
  }

  order(start: readonly number[], keys: readonly ISortKeyColumn[], dirs: readonly SortDir[]): Int32Array {
    const key = keys[0]!;
    const desc = dirs[0] !== 'asc';
    const n = start.length;
    const empties: number[] = [];
    const rows: number[] = [];
    const text: string[] = [];
    for (let k = 0; k < n; k++) {
      const i = start[k]!;
      const s = key.stringKeyAt(i);
      if (s === null) empties.push(i);
      else { rows.push(i); text.push(s); }
    }
    const sorted = this._sort(text, desc);
    const out = new Int32Array(n);
    let o = 0;
    if (!desc) for (let k = 0; k < empties.length; k++) out[o++] = empties[k]!;
    for (let k = 0; k < sorted.length; k++) out[o++] = rows[sorted[k]!]!;
    if (desc) for (let k = 0; k < empties.length; k++) out[o++] = empties[k]!;
    return out;
  }

  /** text 의 자리 번호를 정렬해 돌려준다(같은 글은 자리 순서). / Sorts positions of text; ties keep position order. */
  private _sort(text: readonly string[], desc: boolean): Int32Array {
    const n = text.length;
    let src = new Int32Array(n), dst = new Int32Array(n);
    let H = new Int32Array(n), H2 = new Int32Array(n);
    for (let i = 0; i < n; i++) src[i] = i;
    const sgn = desc ? -1 : 1;
    let lcp = 0;
    // 두 글을 h 글자 다음부터 견준다 — 부호를 돌려주고 공통 머리말 길이는 lcp 에 남긴다.
    const cmpFrom = (a: string, b: string, h: number): number => {
      const k = commonPrefix(a, b, h);
      lcp = k;
      if (k === a.length) return k === b.length ? 0 : -sgn;
      if (k === b.length) return sgn;
      return (a.charCodeAt(k) - b.charCodeAt(k)) * sgn;
    };
    // 한 칸짜리 덩이에서 바로 병합한다(이웃 공통 머리말은 0 에서 시작). 덩이를 삽입 정렬로 먼저 묶으면 머리말을 모르는 비교가
    // 몇 배로 늘어 같은 머리말 자료에서 1.5~1.7배 느렸다(잰 값 — 덩이 16·4·2·1).
    // Merge straight from one-element runs; insertion-sorting runs first multiplies prefix-blind comparisons (measured 1.5–1.7× slower).
    // 아래→위 병합. 「마지막으로 내보낸 글」과 더 길게 같은 쪽이 먼저다(오름·내림 공통) —
    //    둘이 같은 길이로 같을 때만 그 다음 글자부터 실제로 견준다.
    for (let w = 1; w < n; w *= 2) {
      for (let lo = 0; lo < n; lo += 2 * w) {
        const mid = lo + w < n ? lo + w : n, hi = lo + 2 * w < n ? lo + 2 * w : n;
        let i = lo, j = mid, o = lo;
        if (mid >= hi) { for (; i < hi; i++, o++) { dst[o] = src[i]!; H2[o] = H[i]!; } continue; }
        let h1 = 0, h2 = 0;
        while (i < mid && j < hi) {
          let left: boolean;
          if (h1 > h2) left = true;
          else if (h1 < h2) left = false;
          else {
            left = cmpFrom(text[src[i]!]!, text[src[j]!]!, h1) <= 0;
            if (left) h2 = lcp; else h1 = lcp;
          }
          if (left) { dst[o] = src[i]!; H2[o] = o === lo ? 0 : h1; o++; i++; h1 = i < mid ? H[i]! : 0; }
          else { dst[o] = src[j]!; H2[o] = o === lo ? 0 : h2; o++; j++; h2 = j < hi ? H[j]! : 0; }
        }
        if (i < mid) { dst[o] = src[i]!; H2[o] = h1; o++; i++; for (; i < mid; i++, o++) { dst[o] = src[i]!; H2[o] = H[i]!; } }
        if (j < hi) { dst[o] = src[j]!; H2[o] = h2; o++; j++; for (; j < hi; j++, o++) { dst[o] = src[j]!; H2[o] = H[j]!; } }
      }
      let t = src; src = dst; dst = t;
      t = H; H = H2; H2 = t;
    }
    return src;
  }
}
