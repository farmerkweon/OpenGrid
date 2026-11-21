// ============================================================
// 비교 정렬로 순서 매기기 / Ordering by comparison sort
//
// 출발 순서(직전 표시 순서)에서 키 열들로 안정 정렬한 순서를 낸다. 옛 정렬과 「한 칸도 다르지 않은」
// 결과를 내는 것이 이 클래스의 첫째 책임이다. 그래서 일부러 옛 코드와 같은 길을 밟는다:
//  - 출발 배열을 보통 배열로 베껴 Array.prototype.sort 에 넘긴다(형식화 배열의 sort 는 엔진 안 구현이
//    달라, 비교 결과가 일관되지 않는 값 — NaN 이 섞인 숫자 등 — 에서 순서가 갈릴 수 있다).
//  - 키 고리도 옛 고리와 같다: 비교 결과가 0 이 아니면(NaN 포함) 그 자리에서 방향을 입혀 돌려주고,
//    전부 0 이면 0. NaN 이 나온 쌍은 다음 키를 보지 않는 것까지 같아야 순서가 같다.
// 정렬 알고리즘은 비교 결과의 차례에만 기대므로, 같은 엔진·같은 입력·같은 비교 결과면 바이트까지 같다.
//
// Produces the stable order of the start array (previous display order) under the given key columns.
// Matching the legacy order exactly is its first job, so it deliberately follows the legacy path:
// copy the start into a plain array and use Array.prototype.sort (typed-array sort is a different
// engine routine and may diverge when the comparator is inconsistent, e.g. NaN), and use the same
// key loop — a non-zero result (NaN included) returns immediately with the direction applied,
// so a NaN pair never consults the next key. Same engine + same input + same comparisons = same bytes.
// ============================================================
import type { ISortKeyColumn, ISortOrderer, SortDir } from './ports.js';

/**
 * 안정 비교 정렬. 어떤 키 열이든 받는 기본 순서 매기기다(다른 전략이 거절할 때 늘 남는 자리).
 *
 * Stable comparison sort; the default orderer that accepts every key column.
 */
export class ComparisonOrderer implements ISortOrderer {
  readonly id = 'comparison';

  accepts(_keys: readonly ISortKeyColumn[], _rowCount: number): boolean {
    return true;
  }

  order(start: readonly number[], keys: readonly ISortKeyColumn[], dirs: readonly SortDir[]): Int32Array {
    // 출발 배열은 표시 순서의 주인이 들고 있는 것이라 제자리에서 고치지 않는다.
    // The start array belongs to the display-order owner; never sort it in place.
    const idx = start.slice();
    const m = keys.length;
    if (m > 0) {
      idx.sort((a, b) => {
        for (let k = 0; k < m; k++) {
          const c = keys[k]!.compare(a, b);
          if (c !== 0) return dirs[k] === 'asc' ? c : -c;
        }
        return 0;
      });
    }
    return Int32Array.from(idx);
  }
}
