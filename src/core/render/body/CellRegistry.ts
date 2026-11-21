import type { ICellRegistry } from '../ports.js';

/**
 * 지금 본문 DOM 에 붙어 있는 칸 요소의 유일한 지도(행 번호 → 컬럼 번호 → 칸 요소).
 * 칸을 찾는 길(`GridRenderer.getCellEl`, 편집·범위 선택)과 칸을 그리는 쪽이 같은 지도를 보게 하려고 한 객체에 모았다.
 * 행 지도를 통째로 넣는 `setRow` 는 「행을 다 그린 뒤에야 그 행의 칸이 지도에 보인다」는 지금 시점을 지키려고 둔다.
 *
 * The single map of cell elements currently attached to the body DOM (row index → column index → cell element).
 * Kept in one object so the lookup path (`GridRenderer.getCellEl`, editing, range selection) and the painting side
 * see the same map. `setRow` replaces a whole row map so a row's cells become visible only after the row is fully
 * painted, which is the existing timing.
 */
export class CellRegistry implements ICellRegistry {
  private readonly _rows: Map<number, Map<number, HTMLElement>> = new Map();

  /** 칸 하나를 넣는다(같은 자리에 있던 요소는 바뀐다). / Put one cell (replaces any element at the same spot). */
  set(ri: number, ci: number, el: HTMLElement): void {
    let row = this._rows.get(ri);
    if (!row) {
      row = new Map();
      this._rows.set(ri, row);
    }
    row.set(ci, el);
  }

  /** 한 행의 칸 지도를 통째로 넣는다(옛 행 지도는 버린다). / Replace a whole row's cell map. */
  setRow(ri: number, cols: Map<number, HTMLElement>): void {
    this._rows.set(ri, cols);
  }

  get(ri: number, ci: number): HTMLElement | undefined {
    return this._rows.get(ri)?.get(ci);
  }

  *cellsOfColumn(ci: number): Iterable<HTMLElement> {
    for (const row of this._rows.values()) {
      const el = row.get(ci);
      if (el) yield el;
    }
  }

  dropRow(ri: number): void {
    this._rows.delete(ri);
  }

  dropColumn(ri: number, ci: number): void {
    this._rows.get(ri)?.delete(ci);
  }

  clear(): void {
    this._rows.clear();
  }

  get size(): number {
    let n = 0;
    for (const row of this._rows.values()) n += row.size;
    return n;
  }
}
