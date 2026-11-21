import type { RowSpan } from '../../coordinate/geometryPorts.js';

/**
 * 지금 본문 DOM 에 있는 행 요소를 행 번호로 기억하는 곳(행 번호 하나에 행 요소 하나). 세로 스크롤에서 남는 행·들어온 행·나간 행을
 * 가르는 셈도 여기서 한다 — 무엇이 그려져 있는지 아는 곳이 하나로 남게.
 *
 * Remembers the row elements currently in the body DOM by row index (one element per index). It also computes which
 * rows stay, enter and leave on a vertical scroll, so the knowledge of what is drawn stays in one place.
 */
export class BodyRowSet {
  private readonly _rows = new Map<number, HTMLElement>();

  get size(): number { return this._rows.size; }

  has(ri: number): boolean { return this._rows.has(ri); }

  get(ri: number): HTMLElement | undefined { return this._rows.get(ri); }

  add(ri: number, el: HTMLElement): void { this._rows.set(ri, el); }

  remove(ri: number): HTMLElement | undefined {
    const el = this._rows.get(ri);
    this._rows.delete(ri);
    return el;
  }

  /**
   * 다음 범위(반열림)로 갈 때 들어올 행 번호와 나갈 행 번호(둘 다 오름차순). keep 에 든 행은 범위 밖이어도 나가지 않는다.
   *
   * Row indices entering and leaving for the next (half-open) span, both ascending; rows in keep never leave.
   */
  diff(next: RowSpan, keep: readonly number[]): { enter: number[]; leave: number[] } {
    const enter: number[] = [];
    const leave: number[] = [];
    for (let ri = next.start as number; ri < (next.end as number); ri++) if (!this._rows.has(ri)) enter.push(ri);
    for (const ri of this._rows.keys()) {
      if (ri >= next.start && ri < next.end) continue;
      if (keep.indexOf(ri) >= 0) continue;
      leave.push(ri);
    }
    leave.sort((a, b) => a - b);
    return { enter, leave };
  }

  /** 행 번호 오름차순으로 돈다. / Iterates in ascending row index order. */
  forEach(fn: (ri: number, el: HTMLElement) => void): void {
    const keys = Array.from(this._rows.keys()).sort((a, b) => a - b);
    for (const ri of keys) fn(ri, this._rows.get(ri)!);
  }

  clear(): void { this._rows.clear(); }
}
