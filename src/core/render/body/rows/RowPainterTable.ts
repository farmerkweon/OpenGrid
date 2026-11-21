// ============================================================
// 행 종류 판정과 종류별 그리개 찾기 / Row-kind resolution and painter lookup
// 묶음·디테일 머리·디테일 채움·자료 행을 가르는 조건 사다리를 이 표 하나에 모은다. 본문은 「무슨 종류냐」를 묻고
// 그 종류의 그리개에게 맡길 뿐, 종류마다 다른 그리기를 직접 하지 않는다.
//
// Gathers the group / detail-head / detail-filler / data branching into one table. The body view asks for the
// kind and hands the row to that kind's painter instead of branching on kinds itself.
// ============================================================
import type { RowKind } from '../../ports.js';
import type { BodyRowPainter } from './BodyRowContext.js';

/**
 * 행 종류 → 그리개 표. 종류마다 그리개 하나(인스턴스는 BodyView 가 한 번 만든다).
 *
 * Row kind → painter table; one painter per kind, created once by the body view.
 */
export class RowPainterTable {
  private readonly _byKind = new Map<RowKind, BodyRowPainter>();

  constructor(painters: readonly BodyRowPainter[]) {
    for (const p of painters) this._byKind.set(p.kind, p);
  }

  /**
   * 합성 행 배열의 한 칸이 어떤 종류의 행인가. 합성 배열이 없을 때(null)·끝을 넘은 칸(undefined)은 자료 행으로 본다 —
   * 자료 행 그리개가 자료를 못 찾으면 그리지 않는다. 판정 순서는 채움 → 디테일 머리 → 묶음 → 자료(나무 노드 포함).
   *
   * Which kind of row a composed item is. null/undefined count as data (the data painter skips missing rows).
   */
  kindOf(item: unknown): RowKind {
    const it = item as any;
    if (it) {
      if (it._isDetailFiller === true) return 'detail-filler';
      if (it._isDetailHead === true) return 'detail-head';
      if (it._isGroup === true) return 'group';
    }
    return 'data';
  }

  /**
   * 그 종류의 그리개. 모르는 종류면 던진다 — 행이 소리 없이 사라지는 것보다 낫다.
   *
   * The painter for a kind; throws on an unknown kind rather than silently dropping rows.
   */
  painterFor(kind: RowKind): BodyRowPainter {
    const p = this._byKind.get(kind);
    if (!p) throw new Error(`[OpenGrid] no row painter for kind: ${String(kind)}`);
    return p;
  }
}
