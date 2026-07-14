// ============================================================
// DD-02 §2.3 뷰 순열 — model ↔ view 단일 매핑 / DD-02 §2.3 view permutation
// filter/sort/group 결과 배열만 주입받아 model↔view 를 매핑. 값 의미는 모름. 순수.
// 불변식: toView(toModel(v)) === v. 역인덱스 1회 구축(딥링크 id 사고 구조적 봉쇄).
// ============================================================
import { modelIndex, viewIndex, type ModelIndex, type ViewIndex } from './types.js';

/**
 * model↔view 순열. 미필터면 항등(null). 순수 불변.
 * / model↔view permutation; identity when null. Pure & immutable.
 */
export class ViewPermutation {
  private readonly _viewOrder: readonly number[] | null;
  private readonly _modelTotal: number;
  private readonly _reverse: ReadonlyMap<number, number> | null; // model → view

  /**
   * @param viewOrder viewOrder[v] = m; null = 항등 / identity when null
   * @param modelTotal 원본 행 총수 / total model rows
   */
  constructor(viewOrder: readonly ModelIndex[] | null, modelTotal: number) {
    this._modelTotal = Math.max(0, Math.floor(modelTotal));
    if (viewOrder === null) {
      this._viewOrder = null;
      this._reverse = null;
    } else {
      this._viewOrder = viewOrder as readonly number[];
      const rev = new Map<number, number>();
      for (let v = 0; v < viewOrder.length; v++) rev.set(viewOrder[v]!, v);
      this._reverse = rev;
    }
  }

  /** 가시(view) 행 총수. / Total visible rows. */
  get viewCount(): number {
    return this._viewOrder === null ? this._modelTotal : this._viewOrder.length;
  }

  /** v → m. 항등이면 그대로. / view → model. */
  toModel(view: ViewIndex): ModelIndex {
    if (this._viewOrder === null) return modelIndex(view);
    return modelIndex(this._viewOrder[view] ?? -1);
  }

  /** m → v(숨김/필터아웃이면 -1). 역인덱스 O(1). / model → view (-1 if hidden). */
  toView(model: ModelIndex): ViewIndex | -1 {
    if (this._viewOrder === null) {
      return model >= 0 && model < this._modelTotal ? viewIndex(model) : -1;
    }
    const v = this._reverse!.get(model);
    return v === undefined ? -1 : viewIndex(v);
  }

  /** model 이 현재 가시인지. / Whether a model row is currently visible. */
  isVisible(model: ModelIndex): boolean {
    return this.toView(model) !== -1;
  }
}
