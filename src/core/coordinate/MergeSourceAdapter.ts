// ============================================================
// DD-02 §2.2/4.3 병합 어댑터 / DD-02 merge adapter
// 기존 MergeEngine.getInfo/isEmpty 를 IMergeSource 계약으로 무변경 래핑. 순수.
// ============================================================
import type { MergeEngine } from '../MergeEngine.js';
import type { IMergeSource } from './ports.js';
import type { ViewIndex, LeafColIndex } from './types.js';

/**
 * MergeEngine → IMergeSource 어댑터(내부 무변경). / Adapter wrapping MergeEngine as IMergeSource.
 */
export class MergeSourceAdapter implements IMergeSource {
  constructor(private readonly _engine: MergeEngine) {}

  getInfo(view: ViewIndex, col: LeafColIndex): { rowSpan: number; colSpan: number; hidden: boolean } | null {
    return this._engine.getInfo(view, col);
  }

  get isEmpty(): boolean {
    return this._engine.isEmpty;
  }
}

/** 병합이 전혀 없는 빈 소스(균일 fast-path). / Empty merge source (uniform fast-path). */
export const EMPTY_MERGE_SOURCE: IMergeSource = {
  getInfo: () => null,
  isEmpty: true,
};
