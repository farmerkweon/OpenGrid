/**
 * 셀 병합 관리 엔진.
 *
 * 두 가지 병합 방식 지원:
 *  1. 동적 병합: mergeCells([{row, col, rowSpan, colSpan}])
 *  2. 자동 병합: 같은 필드에 같은 값이 연속되면 자동으로 rowSpan
 */

export interface MergeCell {
  row: number;       // display row index (0-based)
  col: number;       // leaf column index (0-based)
  rowSpan?: number;  // 1 이상 (기본 1)
  colSpan?: number;  // 1 이상 (기본 1)
}

export interface MergeInfo {
  rowSpan: number;
  colSpan: number;
  hidden: boolean;   // 병합으로 숨겨진 셀 (렌더링 생략)
}

export class MergeEngine {
  // (row, col) → MergeInfo
  private _map: Map<string, MergeInfo> = new Map();

  private static _key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  /** 수동 병합 정의 목록으로 맵 구성 */
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
   * 자동 병합: 지정 컬럼 인덱스 목록에 대해 연속 같은 값을 rowSpan으로 병합.
   * data: 현재 표시 순서의 행 배열, colIndexes: 자동병합할 leaf 컬럼 인덱스
   * fields: colIndexes[i] 에 대응하는 field 이름
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

  /** 셀 병합 정보 조회. 없으면 null */
  getInfo(row: number, col: number): MergeInfo | null {
    return this._map.get(MergeEngine._key(row, col)) ?? null;
  }

  /** 병합 맵 초기화 */
  clear(): void {
    this._map.clear();
  }

  get isEmpty(): boolean {
    return this._map.size === 0;
  }
}
