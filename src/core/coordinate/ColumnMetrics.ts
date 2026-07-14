// ============================================================
// DD-02 §2.1 가로 축(리프 컬럼) 메트릭 / DD-02 §2.1 horizontal (leaf column) metrics
// ColumnLayout.computeWidths 결과를 소유·부분합화. index↔pixel O(logN). 순수.
// ============================================================
import { px, leafColIndex, type Px, type LeafColIndex } from './types.js';

/** 부분합 배열에서 x 를 담는 컬럼 index(누적 좌측 x 이분탐색). */
function findCol(prefix: readonly number[], x: number): number {
  // prefix[i] = 컬럼 i 좌측 x. prefix[count] = totalWidth. x 를 담는 i 반환.
  const count = prefix.length - 1;
  if (count <= 0) return 0;
  let lo = 0;
  let hi = count - 1;
  const target = Math.max(0, x);
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (prefix[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * 가로 축(리프 컬럼) 메트릭. 부분합으로 O(logN) index↔pixel. 순수 불변.
 * / Horizontal leaf-column metrics; prefix sums for O(logN) index↔pixel. Pure & immutable.
 */
export class ColumnMetrics {
  private readonly _widths: readonly number[];
  private readonly _left: readonly number[]; // _left[i] = 컬럼 i 좌측 x, _left[count] = totalWidth
  private readonly _frozenLeft: number;

  /**
   * @param widths 표시 리프 순서의 너비(px) / per visible-leaf widths
   * @param frozenLeft 좌측 고정 리프 수 / left-frozen leaf count
   */
  constructor(widths: readonly Px[], frozenLeft: number) {
    const w = widths.map(x => Math.max(0, x));
    const left: number[] = new Array(w.length + 1);
    left[0] = 0;
    for (let i = 0; i < w.length; i++) left[i + 1] = left[i]! + w[i]!;
    this._widths = w;
    this._left = left;
    this._frozenLeft = Math.max(0, Math.min(Math.floor(frozenLeft), w.length));
  }

  /** 리프 컬럼 총수. / Total leaf columns. */
  get count(): number {
    return this._widths.length;
  }

  /** 전체 콘텐츠 폭. / Total content width. */
  totalWidth(): Px {
    return px(this._left[this._widths.length]!);
  }

  /** 컬럼 좌측 x(부분합). / Column left x (prefix sum). */
  leftOf(col: LeafColIndex): Px {
    const c = this._clampCol(col);
    return px(this._left[c]!);
  }

  /** 컬럼 너비. / Column width. */
  widthOf(col: LeafColIndex): Px {
    if (col < 0 || col >= this._widths.length) return px(0);
    return px(this._widths[Math.floor(col)]!);
  }

  /** x → col(이분탐색). / x → col (binary search). */
  colAt(x: Px): LeafColIndex {
    return leafColIndex(findCol(this._left, x));
  }

  /** 좌측 고정 리프 수. / Left-frozen leaf count. */
  get frozenLeft(): number {
    return this._frozenLeft;
  }

  /** 고정 팬 폭(첫 frozenLeft 합). / Frozen pane width (sum of first frozenLeft). */
  frozenWidth(): Px {
    return px(this._left[this._frozenLeft]!);
  }

  private _clampCol(col: LeafColIndex): number {
    if (col < 0) return 0;
    if (col > this._widths.length) return this._widths.length;
    return Math.floor(col);
  }
}
