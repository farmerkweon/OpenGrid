// ============================================================
// DD-02 §2.1 세로 축(행) 메트릭 / DD-02 §2.1 vertical (row) metrics
// 균일 높이면 곱셈 O(1); autoHeight override 존재 시 override 부분합으로 O(logK).
// 순수 — DOM/전역 미접근(REQ-TX-846 헤드리스).
// ============================================================
import { px, viewIndex, type Px, type ViewIndex } from './types.js';

/** 정렬된 override 위치 배열에서 pos < view 인 개수(lower bound). */
function lowerBound(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 세로 축(행) 메트릭. 균일/가변(autoHeight) 겸용. 순수 불변.
 * / Vertical row metrics; uniform and variable (autoHeight). Pure & immutable.
 */
export class RowMetrics {
  private readonly _rowHeight: number;
  private readonly _total: number;
  private readonly _overrides: ReadonlyMap<number, number>;

  // override 부분합 캐시(생성 시 1회 구축) — pos 오름차순 + (h-rowHeight) 누적.
  private readonly _pos: readonly number[];
  private readonly _prefDelta: readonly number[]; // _prefDelta[i] = Σ_{j<i}(h(pos_j)-rowHeight)
  private readonly _totalDelta: number;

  /**
   * @param opts.rowHeight 균일 행 높이(px) / uniform row height
   * @param opts.total 가시(view) 행 총수 / total visible rows
   * @param overrides autoHeight 측정 override(내부 재조립용, 선택) / measured overrides (internal)
   */
  constructor(opts: { rowHeight: Px; total: number }, overrides?: ReadonlyMap<number, number>) {
    this._rowHeight = Math.max(0, opts.rowHeight);
    this._total = Math.max(0, Math.floor(opts.total));
    this._overrides = overrides ?? new Map();

    const pos = [...this._overrides.keys()].filter(k => k >= 0 && k < this._total).sort((a, b) => a - b);
    const pref: number[] = new Array(pos.length + 1);
    pref[0] = 0;
    for (let i = 0; i < pos.length; i++) {
      const h = Math.max(0, this._overrides.get(pos[i]!)!);
      pref[i + 1] = pref[i]! + (h - this._rowHeight);
    }
    this._pos = pos;
    this._prefDelta = pref;
    this._totalDelta = pref[pos.length]!;
  }

  /** 가시(view) 행 총수. / Total visible rows. */
  get total(): number {
    return this._total;
  }

  /** 콘텐츠 전체 높이(spacer 산출용). / Total content height (for spacer). */
  totalHeight(): Px {
    return px(this._total * this._rowHeight + this._totalDelta);
  }

  /** 행 상단 y(부분합). / Row top y (prefix sum). */
  topOf(view: ViewIndex): Px {
    const v = this._clampView(view);
    const k = lowerBound(this._pos, v);
    return px(v * this._rowHeight + this._prefDelta[k]!);
  }

  /** 행 높이(override 우선). / Row height (override wins). */
  heightOf(view: ViewIndex): Px {
    const v = this._clampView(view);
    const o = this._overrides.get(v);
    return px(o !== undefined ? Math.max(0, o) : this._rowHeight);
  }

  /** y → view(이분탐색, 클램프). / y → view (binary search, clamped). */
  indexAt(y: Px): ViewIndex {
    if (this._total === 0) return viewIndex(0);
    const target = Math.max(0, y);
    // topOf 는 단조증가 → view 에 대해 이분탐색.
    let lo = 0;
    let hi = this._total - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.topOf(viewIndex(mid)) <= target) lo = mid;
      else hi = mid - 1;
    }
    return viewIndex(lo);
  }

  /** 측정 캐시 주입(되먹임 차단의 핵심) — 새 불변 인스턴스 반환. / Apply measured overrides; returns a new instance. */
  applyMeasured(overrides: ReadonlyMap<ViewIndex, Px>): RowMetrics {
    const merged = new Map<number, number>(this._overrides);
    for (const [k, v] of overrides) merged.set(k, v);
    return new RowMetrics({ rowHeight: px(this._rowHeight), total: this._total }, merged);
  }

  /** 총 행수 변경 — 새 불변 인스턴스 반환. / Change total; returns a new instance. */
  setTotal(total: number): RowMetrics {
    return new RowMetrics({ rowHeight: px(this._rowHeight), total }, this._overrides);
  }

  private _clampView(view: ViewIndex): number {
    if (this._total === 0) return 0;
    if (view < 0) return 0;
    if (view > this._total) return this._total; // topOf(total) = 콘텐츠 하단
    return Math.floor(view);
  }
}
