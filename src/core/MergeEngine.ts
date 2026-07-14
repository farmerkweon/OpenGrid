/**
 * 셀 병합 관리 엔진. / Cell-merge management engine.
 *
 * 두 가지 병합 방식 지원 / Supports two merge modes:
 *  1. 동적 병합 / Explicit merge: applyMergeCells([{row, col, rowSpan, colSpan}])
 *  2. 자동 병합 / Auto merge: 같은 필드에 같은 값이 연속되면 자동으로 rowSpan
 *     / consecutive equal values in a field collapse into a rowSpan automatically
 */

/** 병합 대상 셀 정의(기준 셀). / A cell to merge (the anchor cell). */
export interface MergeCell {
  /** 표시 행 인덱스(0-base). / Display row index (0-based). */
  row: number;
  /** 리프 컬럼 인덱스(0-base). / Leaf column index (0-based). */
  col: number;
  /** 세로 병합 칸 수(1 이상, 기본 1). / Vertical span count (>=1, default 1). */
  rowSpan?: number;
  /** 가로 병합 칸 수(1 이상, 기본 1). / Horizontal span count (>=1, default 1). */
  colSpan?: number;
}

/** 특정 (row,col) 셀의 병합 결과 정보. / Resolved merge info for a specific (row,col) cell. */
export interface MergeInfo {
  /** 세로 병합 칸 수. / Vertical span count. */
  rowSpan: number;
  /** 가로 병합 칸 수. / Horizontal span count. */
  colSpan: number;
  /** 병합으로 숨겨진 셀(렌더링 생략). / Cell hidden by a merge (skipped in rendering). */
  hidden: boolean;
}

/**
 * 병합 맵 계산·조회를 담당하는 엔진. / Engine that computes and serves the merge map.
 *
 * @example
 * const merge = new MergeEngine();
 * merge.applyMergeCells([{ row: 0, col: 1, rowSpan: 2 }]);
 * merge.getInfo(0, 1); // { rowSpan: 2, colSpan: 1, hidden: false }
 */
export class MergeEngine {
  // (row, col) → MergeInfo
  private _map: Map<string, MergeInfo> = new Map();

  private static _key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  /**
   * 수동 병합 정의 목록으로 맵 구성. / Build the merge map from an explicit list of merge cells.
   *
   * 각 기준 셀은 span 을 갖고, 병합에 삼켜진 하위 셀은 `hidden:true` 로 표시된다.
   * / Each anchor cell keeps its span; cells swallowed by the merge are marked `hidden:true`.
   *
   * @param cells - 병합할 셀 정의 목록 / List of cells to merge
   */
  applyMergeCells(cells: MergeCell[]): void {
    this._map.clear();
    for (const mc of cells) {
      const rs = Math.max(1, mc.rowSpan ?? 1);
      const cs = Math.max(1, mc.colSpan ?? 1);
      // 기준 셀
      this._map.set(MergeEngine._key(mc.row, mc.col), {
        rowSpan: rs, colSpan: cs, hidden: false,
      });
      // 병합된 하위 셀 — hidden:true
      for (let r = 0; r < rs; r++) {
        for (let c = 0; c < cs; c++) {
          if (r === 0 && c === 0) continue;
          this._map.set(MergeEngine._key(mc.row + r, mc.col + c), {
            rowSpan: 1, colSpan: 1, hidden: true,
          });
        }
      }
    }
  }

  /**
   * 자동 병합: 지정 컬럼에서 연속 같은 값을 rowSpan 으로 병합.
   * / Auto merge: collapse consecutive equal values in the given columns into rowSpans.
   *
   * @param data - 현재 표시 순서의 행 배열 / Rows in current display order
   * @param colIndexes - 자동 병합할 leaf 컬럼 인덱스 목록 / Leaf column indexes to auto-merge
   * @param fields - colIndexes[i] 에 대응하는 field 이름 / Field names matching each `colIndexes[i]`
   */
  applyAutoMerge(
    data: Record<string, any>[],
    colIndexes: number[],
    fields: string[]
  ): void {
    this._map.clear();
    for (let ci = 0; ci < colIndexes.length; ci++) {
      const col = colIndexes[ci]!;
      const field = fields[ci]!;
      let spanStart = 0;

      for (let ri = 1; ri <= data.length; ri++) {
        const prevVal = data[ri - 1]?.[field];
        const curVal  = ri < data.length ? data[ri]?.[field] : undefined;

        if (ri === data.length || curVal !== prevVal) {
          const span = ri - spanStart;
          if (span > 1) {
            this._map.set(MergeEngine._key(spanStart, col), {
              rowSpan: span, colSpan: 1, hidden: false,
            });
            for (let r = spanStart + 1; r < ri; r++) {
              this._map.set(MergeEngine._key(r, col), {
                rowSpan: 1, colSpan: 1, hidden: true,
              });
            }
          }
          spanStart = ri;
        }
      }
    }
  }

  /**
   * 셀 병합 정보 조회. / Look up merge info for a cell.
   *
   * @param row - 표시 행 인덱스 / Display row index
   * @param col - 리프 컬럼 인덱스 / Leaf column index
   * @returns 병합 정보, 없으면 null / Merge info, or null if the cell is not merged
   */
  getInfo(row: number, col: number): MergeInfo | null {
    return this._map.get(MergeEngine._key(row, col)) ?? null;
  }

  /** 병합 맵 초기화. / Clear the merge map. */
  clear(): void {
    this._map.clear();
  }

  /** 병합 맵이 비었는지 여부. / Whether the merge map is empty. */
  get isEmpty(): boolean {
    return this._map.size === 0;
  }
}
