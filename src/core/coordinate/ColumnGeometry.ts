// ============================================================
// 컬럼 기하 — 표시 잎 컬럼의 폭·왼쪽 위치·전체 폭·고정 오른쪽 끝 / Column geometry
// 폭이 칸마다·자리마다 흩어져 있으면 너비 하나를 바꿀 때 전부 다시 그려야 한다.
// 그래서 폭·left·전체 폭은 이 객체 하나만 알고, 그리는 쪽·창 계산·범위 테두리는 여기에 묻는다.
// 부분합·이분 탐색은 이미 있는 ColumnMetrics(불변 값)를 그대로 쓰고, 값이 바뀔 때마다 새로 만든다.
// 바뀐 몫(GeometryChange)을 판 번호와 함께 남겨 두어, DOM 에 반영하는 쪽이 「지난번 이후 무엇이 바뀌었나」만 물을 수 있게 한다.
//
// Sole owner of leaf-column widths, lefts, total width and the frozen right edge. Prefix sums and
// binary search come from the existing immutable ColumnMetrics, rebuilt on every change. Each change
// is logged with a version so the DOM side can ask only for what changed since it last applied.
// ============================================================
import { px, leafColIndex, type Px, type LeafColIndex } from './types.js';
import { ColumnMetrics } from './ColumnMetrics.js';
import type { GeometryChange, IColumnGeometryWriter, IExtraColumns } from './geometryPorts.js';

/** 남겨 두는 변화 기록 수. 넘치면 가장 옛것부터 버리고, 그보다 옛 판을 물으면 「구조 변경」으로 답한다(처음부터 다시 깔면 늘 맞다). */
const HISTORY_CAP = 64;

const EMPTY_COLS: readonly LeafColIndex[] = Object.freeze([]);

/** 바뀐 것이 없을 때의 변화 몫(판마다 하나 — 같은 판이면 같은 객체를 돌려준다). */
function noneAt(version: number, count: number): GeometryChange {
  return Object.freeze({
    none: true, widthCols: EMPTY_COLS, leftFrom: leafColIndex(count),
    totalChanged: false, structural: false, version,
  });
}

/**
 * 컬럼 폭 상한(px). 1e308 같은 폭 둘이면 합이 Infinity 가 되어 「left 차 = 폭」이 깨지므로 큰 값에서 자른다.
 * 컬럼 수만 개를 더해도 정확히 셀 수 있는 크기라, 그리드가 실제로 내는 폭(수천~수천만 px)과는 닿지 않는다.
 */
const MAX_WIDTH = 1e15;

/**
 * 다시 계산된 폭 하나를 드는 규칙(생성자·reset). 0 이상 유한한 폭은 **그대로** 든다 — 0·소수 포함, 하한·반올림 없음.
 * 남는 폭이 없는 flex 컬럼, 폭 0 컨테이너에서 다시 센 폭, 사용자가 준 `width: 0` 은 지금도 0px 로 그려지고
 * 그 뒤 컬럼이 그 자리에 붙는다. 여기서 1 로 올리면 그 뒤가 1px 씩 밀린다.
 * 음수·NaN·무한대는 0(누적 합이 거꾸로 가거나 NaN 이 퍼지지 않게), 상한을 넘으면 상한.
 * 최소 폭은 사용자가 끌어서 정하는 길(resize)에만 있다.
 *
 * Recomputed widths: any finite width ≥ 0 is kept as is (zero and fractions included) so zero-width columns still
 * render at 0px; negatives/NaN/±Infinity become 0 and huge values are capped. The minimum width applies only to resize.
 */
function sanitize(w: number): Px {
  return px(Number.isFinite(w) && w > 0 ? Math.min(MAX_WIDTH, w) : 0);
}

/** 고정 수를 [0, count] 정수로. 숫자가 아니면 0. */
function clampFrozen(n: number, count: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), count)) : 0;
}

function sameExtra(a: IExtraColumns, b: IExtraColumns): boolean {
  if (a === b) return true;
  if (a.ids.length !== b.ids.length) return false;
  for (let i = 0; i < a.ids.length; i++) {
    const id = a.ids[i]!;
    if (id !== b.ids[i] || a.widthOf(id) !== b.widthOf(id)) return false;
  }
  return true;
}

/**
 * 표시 잎 컬럼의 폭·left·전체 폭·고정 오른쪽 끝의 유일한 주인.
 * 불변: leftOf(0) = extra.width() · leftOf(i+1) − leftOf(i) = widthOf(i) · totalWidth() = leftOf(count) ·
 *       값이 바뀌면 version 이 1 오르고, 안 바뀌면 change.none(판 그대로).
 * 반올림의 주인: 끌어서 정한 폭(resize)은 정수 px 로 든다(Math.round). 화면 배율 125%·150% 에서는 포인터 좌표가
 * 소수라 제스처가 소수 폭을 내는데, 그것을 그대로 들면 머리글(표 흐름)과 본문(기하 위치)이 서로 다르게 반올림해
 * 1px 어긋난다. 반올림을 여기 한 곳에서 해 두면 두 쪽이 같은 정수를 본다. 생성자·reset 이 받는 폭은 그대로 든다.
 *
 * Sole owner of column geometry. Version bumps by one on every real change; no-ops return change.none.
 * Widths set by resize are rounded to whole px here (single owner of rounding); constructor/reset keep values as given.
 */
export class ColumnGeometry implements IColumnGeometryWriter {
  private _metrics!: ColumnMetrics;
  private _widths!: readonly Px[];
  private _extra!: IExtraColumns;
  private _offset = 0;
  private _version = 0;
  private _none: GeometryChange;
  /** _history[k] = 판 _base + k + 1 로 넘어간 변화. */
  private readonly _history: GeometryChange[] = [];
  private _base = 0;

  /**
   * @param widths 표시 잎 순서의 폭(px). 복사해서 쥔다 — 바깥 배열을 나중에 고쳐도 기하는 그대로. / copied
   * @param extra 여분 컬럼 / extra columns
   * @param frozenCount 왼쪽 고정 잎 컬럼 수 / left-frozen leaf count
   */
  constructor(widths: readonly number[], extra: IExtraColumns, frozenCount: number) {
    this._install(widths.map(sanitize), extra, frozenCount);
    this._none = noneAt(this._version, this.count);
  }

  get version(): number { return this._version; }
  get count(): number { return this._metrics.count; }
  get frozenCount(): number { return this._metrics.frozenLeft; }
  get extra(): IExtraColumns { return this._extra; }

  /** 정수가 아닌 번호(NaN 포함)·범위 밖이면 0. */
  widthOf(ci: LeafColIndex): Px {
    return Number.isInteger(ci) ? this._metrics.widthOf(ci) : px(0);
  }

  /** 범위 밖은 끝으로 자르고, 숫자가 아닌 번호는 0 번으로 본다(NaN 이 퍼지지 않게). */
  leftOf(ci: LeafColIndex): Px {
    return px(this._offset + this._metrics.leftOf(Number.isFinite(ci) ? ci : leafColIndex(0)));
  }

  /** [ci, ci+span) 폭의 합. 끝을 넘으면 끝에서 자르고, span ≤ 0 이면 0. / Clipped at the end; 0 for span ≤ 0. */
  spanWidth(ci: LeafColIndex, span: number): Px {
    if (!(span > 0) || !Number.isFinite(ci)) return px(0);
    const n = this.count;
    const from = Math.min(n, Math.max(0, Math.floor(ci)));
    const to = Math.min(n, from + Math.floor(span));
    return px(this._metrics.leftOf(leafColIndex(to)) - this._metrics.leftOf(leafColIndex(from)));
  }

  totalWidth(): Px {
    return px(this._offset + this._metrics.totalWidth());
  }

  frozenRight(): Px {
    return px(this._offset + this._metrics.frozenWidth());
  }

  /** 내용 x → 그 x 를 담는 잎 컬럼. 여분 구역·음수면 0, 끝을 넘으면 count−1, 컬럼이 없으면 0. */
  colAt(x: Px): LeafColIndex {
    return this._metrics.colAt(px(x - this._offset));
  }

  /** 읽기 전용(얼린) 폭 배열 — 바뀔 때마다 새 배열이라 받아 둔 쪽의 값은 그 판 그대로다. */
  widths(): readonly number[] {
    return this._widths;
  }

  changesSince(version: number): GeometryChange {
    if (version === this._version) return this._none;
    // 모르는 판(앞날이거나, 기록을 넘을 만큼 옛날) → 처음부터 다시 깔게 한다.
    if (!(version >= this._base && version < this._version)) return this._structuralChange();
    const from = version - this._base;
    if (from === this._history.length - 1) return this._history[from]!;
    let leftFrom = this.count;
    let total = false;
    for (let k = from; k < this._history.length; k++) {
      const h = this._history[k]!;
      if (h.structural) return this._structuralChange();
      if (h.totalChanged) total = true;
      if (h.leftFrom < leftFrom) leftFrom = h.leftFrom;
    }
    const set = new Set<number>();
    for (let k = from; k < this._history.length; k++) for (const c of this._history[k]!.widthCols) set.add(c);
    const cols = Array.from(set).sort((a, b) => a - b).map(leafColIndex);
    return Object.freeze({
      none: false, widthCols: Object.freeze(cols), leftFrom: leafColIndex(leftFrom),
      totalChanged: total, structural: false, version: this._version,
    });
  }

  reset(widths: readonly number[], extra: IExtraColumns, frozenCount: number): GeometryChange {
    const next = widths.map(sanitize);
    const frozen = clampFrozen(frozenCount, next.length);
    const structural = next.length !== this.count || frozen !== this.frozenCount || !sameExtra(extra, this._extra);
    const oldTotal = this.totalWidth();
    if (structural) {
      this._install(next, extra, frozenCount);
      return this._commit(this._structuralBody(this.totalWidth() !== oldTotal));
    }
    const cols: LeafColIndex[] = [];
    for (let i = 0; i < next.length; i++) if (next[i] !== this._widths[i]) cols.push(leafColIndex(i));
    // 같은 값의 다른 extra 인스턴스면 그 참조만 갈아 끼운다(값이 같으니 판은 그대로).
    this._extra = extra;
    if (cols.length === 0) return this._none;
    this._install(next, extra, frozenCount);
    return this._commit({
      widthCols: Object.freeze(cols), leftFrom: leafColIndex(cols[0]! + 1),
      totalChanged: this.totalWidth() !== oldTotal, structural: false,
    });
  }

  /**
   * 컬럼 하나의 폭. 끄는 동안 입력마다 불린다. 폭은 정수 px 로 반올림해 [1, 상한] 으로 자르고, 숫자가 아니면 아무것도 안 한다.
   * 번호가 범위 밖·정수 아님이면 RangeError — 배열 밖에 써서 컬럼 수가 늘어나는 일을 막는다.
   *
   * Called per input while dragging. Rounded to whole px and clamped to [1, max]; non-finite is a no-op;
   * bad index throws RangeError.
   */
  resize(ci: LeafColIndex, width: number): GeometryChange {
    if (!Number.isInteger(ci) || ci < 0 || ci >= this.count) {
      throw new RangeError(`column index out of range: ${ci} (count ${this.count})`);
    }
    if (!Number.isFinite(width)) return this._none;
    const w = Math.min(MAX_WIDTH, Math.max(1, Math.round(width)));
    if (w === this._widths[ci]) return this._none;
    const next = this._widths.slice();
    next[ci] = px(w);
    this._install(next, this._extra, this.frozenCount);
    return this._commit({
      widthCols: Object.freeze([ci]), leftFrom: leafColIndex(ci + 1), totalChanged: true, structural: false,
    });
  }

  // ── 안쪽 ──────────────────────────────────────────────────────
  private _install(widths: Px[], extra: IExtraColumns, frozenCount: number): void {
    this._widths = Object.freeze(widths);
    this._metrics = new ColumnMetrics(widths, clampFrozen(frozenCount, widths.length));
    this._extra = extra;
    this._offset = extra.width();
  }

  private _commit(body: Omit<GeometryChange, 'none' | 'version'>): GeometryChange {
    this._version++;
    const ch: GeometryChange = Object.freeze({ none: false, ...body, version: this._version });
    this._history.push(ch);
    if (this._history.length > HISTORY_CAP) {
      this._history.shift();
      this._base++;
    }
    this._none = noneAt(this._version, this.count);
    return ch;
  }

  private _structuralBody(totalChanged: boolean): Omit<GeometryChange, 'none' | 'version'> {
    const n = this.count;
    const cols: LeafColIndex[] = new Array(n);
    for (let i = 0; i < n; i++) cols[i] = leafColIndex(i);
    return { widthCols: Object.freeze(cols), leftFrom: leafColIndex(0), totalChanged, structural: true };
  }

  private _structuralChange(): GeometryChange {
    return Object.freeze({ none: false, ...this._structuralBody(true), version: this._version });
  }
}
