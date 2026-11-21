// ============================================================
// 컬럼 하나를 그릴 때 칸마다 같은 준비물 / Per-column paint preparation shared by its cells
// 한 컬럼의 칸들은 같은 렌더러를 쓴다. 칸마다 렌더러 객체를 새로 만들지 않고 그리기 한 번에 컬럼당 한 번 만든다.
// 사용자가 등록한 렌더러 공장은 지금처럼 칸마다 부른다 — 사용자 코드가 보는 호출 수를 바꾸지 않으려는 것.
//
// The cells of one column use the same renderer; build it once per column per paint instead of once per cell.
// User-registered renderer factories are still called per cell, so the call count user code sees is unchanged.
// ============================================================
import { createRenderer, createBuiltinRenderer, type CellRenderer } from '../../renderers/CellRenderer.js';
import type { ColumnDef } from '../../types.js';

/**
 * 한 컬럼의 그리기 준비물(그리기 한 번에 컬럼당 하나).
 *
 * Paint preparation for one column (one per column per paint).
 */
export class ColumnPaintPlan {
  /** 내장 렌더러면 컬럼 칸들이 나눠 쓰는 인스턴스, 사용자 팩토리면 null. / Shared built-in renderer, or null for a user factory. */
  private readonly _shared: CellRenderer | null;

  constructor(private readonly _col: ColumnDef) {
    this._shared = createBuiltinRenderer(_col);
  }

  /**
   * 칸 하나에 쓸 렌더러 — 내장이면 나눠 쓰는 인스턴스, 사용자 팩토리면 이번 칸을 위해 새로 부른 것.
   *
   * The renderer for one cell — the shared built-in instance, or a fresh one from the user factory.
   */
  renderer(): CellRenderer {
    return this._shared ?? createRenderer(this._col);
  }
}
