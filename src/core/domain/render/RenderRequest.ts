// ============================================================
// 그리기 요청(불변 값) / Render request (immutable value)
// 상태를 바꾸는 쪽은 「무엇이 바뀌었나」만 이 값으로 알리고, 무엇을 다시 그릴지는 계획 쪽이 혼자 정한다.
// 한 프레임에 여러 곳에서 낸 요청은 merge 로 하나가 된다 — 들어온 순서와 묶는 순서가 그리는 일을 바꾸지 않게
// 「바뀐 것」 쪽은 교환·결합 법칙을 지키고, 「어디로」 쪽(명시 행 범위·새 포커스 칸)만 나중 요청이 이긴다.
//
// Producers state only what changed; the planner decides what to redraw. Merging is commutative and
// associative for the "what changed" parts; only explicit rows and the new focus cell are last-wins.
// ============================================================
import { Change, type ChangeMask, type CellKey, type CellPos, type ExplicitRows, type IRenderRequest, type RequestDetail } from './ports.js';
import { viewIndex } from '../../coordinate/types.js';

const NO_CELLS: readonly CellKey[] = Object.freeze([]);

/** (행, 필드) 순서. 칸 목록의 정규형이 이 순서다. */
function cellOrder(x: CellKey, y: CellKey): number {
  return x.ri !== y.ri ? x.ri - y.ri : x.field < y.field ? -1 : x.field > y.field ? 1 : 0;
}

function frozenCell(c: CellKey): CellKey {
  return Object.isFrozen(c) ? c : Object.freeze({ ri: c.ri, field: c.field });
}

/** 이미 정규형(오름차순·중복 없음·얼림)인가 — O(k) 한 번 훑기. */
function isCanonical(cells: readonly CellKey[]): boolean {
  if (!Object.isFrozen(cells)) return false;
  for (let i = 0; i < cells.length; i++) {
    if (!Object.isFrozen(cells[i])) return false;
    if (i > 0 && cellOrder(cells[i - 1]!, cells[i]!) >= 0) return false;
  }
  return true;
}

/**
 * 칸 목록을 (행, 필드) 순으로 정렬하고 겹친 것을 지운 얼린 사본 — 같은 집합이면 늘 같은 배열이 되게.
 * 이미 정규형인 얼린 배열은 그대로 돌려준다(합친 결과를 다시 정렬하지 않게).
 *
 * Sorted, de-duplicated, frozen copy; an already canonical frozen array is returned as is.
 */
function canonicalCells(cells: readonly CellKey[]): readonly CellKey[] {
  if (cells.length === 0) return NO_CELLS;
  if (isCanonical(cells)) return cells;
  const all = cells.slice().sort(cellOrder);
  const out: CellKey[] = [];
  for (let i = 0; i < all.length; i++) {
    const c = all[i]!;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.ri === c.ri && prev.field === c.field) continue;
    out.push(frozenCell(c));
  }
  return Object.freeze(out);
}

/**
 * 이미 정규형인 두 칸 목록의 합집합(선형 병합, O(a+b)). 한쪽이 비면 다른 쪽 배열을 그대로 돌려준다 —
 * 칸 요청 수천 개를 차례로 합쳐도 매번 다시 정렬하지 않게.
 */
function unionCells(a: readonly CellKey[], b: readonly CellKey[]): readonly CellKey[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const out: CellKey[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = a[i];
    const y = b[j];
    const d = x === undefined ? 1 : y === undefined ? -1 : cellOrder(x, y);
    if (d <= 0) i++;
    if (d >= 0) j++;
    out.push(d <= 0 ? x! : y!);
  }
  return Object.freeze(out);
}

function frozenRows(rows: ExplicitRows): ExplicitRows {
  if (rows === null || rows === 'clear' || Object.isFrozen(rows)) return rows;
  return Object.freeze({ start: rows.start, end: rows.end });
}

function frozenPos(p: CellPos | null): CellPos | null {
  if (p === null || Object.isFrozen(p)) return p;
  return Object.freeze({ ri: p.ri, ci: p.ci });
}

function minOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

/**
 * 「무엇이 바뀌었나」 비트 묶음 + 세부. 상태 변경 한 번에 하나 만들고, 스케줄러가 한 프레임 동안 합친다.
 * merge — 교환·결합: changes(OR) · cells(합집합) · widthChangedFrom(작은 쪽) · sync(OR).
 *         나중이 이김: rows · focusTo (null 은 상대를 이기지 못함).
 *
 * Bit set of what changed plus details. merge is commutative/associative except for rows/focusTo (last non-null wins).
 */
export class RenderRequest implements IRenderRequest {
  /** 할 일 없는 요청(합치기의 항등원). / The no-op request (identity of merge). */
  static readonly NONE: RenderRequest = new RenderRequest(0, NO_CELLS, null, null, null, false);

  /**
   * 보이는 범위를 그 자리에서 통째로 다시 그리라는 요청 — 불변 값이라 하나를 나눠 쓴다(부를 때마다 새로 만들지 않음).
   *
   * Sync full repaint of the visible range; immutable, so one shared value.
   */
  static readonly REPAINT_VISIBLE: RenderRequest = new RenderRequest(Change.All, NO_CELLS, null, null, null, true);

  /**
   * 본문을 비우라는 요청(자료를 모두 지운 뒤) — 하나를 나눠 쓴다.
   *
   * Sync request that empties the body (after all data is cleared); one shared value.
   */
  static readonly REPAINT_CLEAR: RenderRequest = new RenderRequest(Change.All, NO_CELLS, null, null, 'clear', true);

  /**
   * 행 선택·체크 상태만 바뀌었다는 요청(값은 그대로) — 하나를 나눠 쓴다. 푸터 값 같은 내용 일은 계획이 거른다.
   *
   * Sync request saying only row selection/check state changed (values unchanged); one shared value. Content work such as footer values is filtered by the plan.
   */
  static readonly ROW_STATE: RenderRequest = new RenderRequest(Change.RowState, NO_CELLS, null, null, null, true);

  /**
   * 세로 창 쪽 요청 둘(sync 아님 — 다음 프레임에 하나로 합쳐짐, 범위는 그릴 때 세로 창에 물음):
   * `SCROLLED` 는 스크롤 위치만 바뀜(푸터 값 같은 내용 일은 계획이 거름), `WINDOW_CHANGED` 는 행 수·행 높이·보이는 높이가 바뀜.
   *
   * Two vertical-window requests (not sync — merged into the next frame; the range is asked at paint time):
   * `SCROLLED` = only the scroll position changed, `WINDOW_CHANGED` = row count / row height / viewport height changed.
   */
  static readonly SCROLLED: RenderRequest = new RenderRequest(Change.RowsScrolled, NO_CELLS, null, null, null, false);
  static readonly WINDOW_CHANGED: RenderRequest = new RenderRequest(Change.All, NO_CELLS, null, null, null, false);

  readonly changes: ChangeMask;
  readonly detail: Readonly<RequestDetail>;

  private constructor(
    changes: ChangeMask,
    cells: readonly CellKey[],
    focusTo: CellPos | null,
    widthChangedFrom: number | null,
    rows: ExplicitRows,
    sync: boolean,
  ) {
    this.changes = changes;
    this.detail = Object.freeze({ cells, focusTo, widthChangedFrom, rows, sync });
    Object.freeze(this);
  }

  /**
   * 요청을 만든다. 모르는 비트(정의 밖·음수·정수 아님)는 RangeError — 조용히 버리면 그 원인으로는 아무것도 안 그려진다.
   * 세부에 넘긴 배열·객체는 얼린 사본으로 든다.
   *
   * Unknown bits throw RangeError; detail arrays/objects are copied and frozen.
   */
  static of(changes: ChangeMask, detail?: Partial<RequestDetail>): RenderRequest {
    if (!Number.isInteger(changes) || changes < 0 || (changes & ~Change.All) !== 0) {
      throw new RangeError(`RenderRequest: unknown change bits ${changes}`);
    }
    return new RenderRequest(
      changes,
      canonicalCells(detail?.cells ?? NO_CELLS),
      frozenPos(detail?.focusTo ?? null),
      detail?.widthChangedFrom ?? null,
      frozenRows(detail?.rows ?? null),
      detail?.sync ?? false,
    );
  }

  /**
   * 행 범위 [start, endInclusive] 를 그 자리에서 통째로 다시 그리라는 요청. 끝을 포함하는 옛 그리기 범위(묶음 펼침의
   * 전 행 `0..n−1` 등)를 반열림으로 바꿔 담는다 — 값을 자르지 않으므로 `(0, −1)`·`start > end` 도 그대로 지나간다.
   *
   * Sync full repaint of rows [start, endInclusive]; converts the inclusive end to half-open without clamping.
   */
  static rowsInclusive(start: number, endInclusive: number): RenderRequest {
    return RenderRequest.of(Change.All, { sync: true, rows: { start: viewIndex(start), end: viewIndex(endInclusive + 1) } });
  }

  /** 비트 가운데 하나라도 있나. / True if any of the given bits is set. */
  has(mask: ChangeMask): boolean {
    return (this.changes & mask) !== 0;
  }

  /** 합치기 규칙은 누적기 하나가 안다 — 값 둘을 합치는 것도 누적기에 차례로 더해 얼린다. / Merging delegates to the accumulator. */
  merge(other: IRenderRequest): RenderRequest {
    return new RenderRequestAccumulator().add(this).add(other).freeze();
  }
}

/**
 * 요청 합치기 규칙의 유일한 주인 — 고칠 수 있는 누적기. 한 프레임 동안 들어오는 요청을 새 값 없이 더해 두었다가
 * `freeze()` 로 요청 하나를 얼린다(스케줄러가 프레임마다 하나 들고 쓴다; `RenderRequest.merge` 도 이것을 쓴다).
 * 규칙: 비트 OR · 칸 합집합 · `widthChangedFrom` 작은 쪽 · `sync` OR(교환·결합) / `rows`·`focusTo` 는 null 아닌 마지막.
 * 칸: 정규형 배열 둘까지는 그대로 들고 있다가 선형 병합, 셋째부터는 (행, 필드) 열쇠 Map 에 모아 얼릴 때 한 번 정렬 —
 * 값 둘 합치기는 정렬 0, 한 프레임 칸 요청 수천 개도 더하기마다 O(1).
 *
 * Sole owner of the merge rules: a mutable accumulator that adds requests without allocating per add and
 * freezes one request at the end. Up to two canonical cell arrays are linearly merged; beyond that a keyed Map is used.
 */
export class RenderRequestAccumulator {
  private _mask: ChangeMask = 0;
  private _focusTo: CellPos | null = null;
  private _widthFrom: number | null = null;
  private _rows: ExplicitRows = null;
  private _sync = false;
  private _pending = false;
  private _cellsA: readonly CellKey[] = NO_CELLS;
  private _cellsB: readonly CellKey[] = NO_CELLS;
  private _map: Map<string, CellKey> | null = null;

  /** 더한 요청이 하나라도 있나(비트가 0 인 요청도 「있음」). / Whether anything was added since the last freeze. */
  get pending(): boolean {
    return this._pending;
  }

  add(req: IRenderRequest): this {
    const d = req.detail;
    this._pending = true;
    this._mask |= req.changes;
    if (d.focusTo !== null) this._focusTo = d.focusTo;
    if (d.rows !== null) this._rows = d.rows;
    this._widthFrom = minOrNull(this._widthFrom, d.widthChangedFrom);
    this._sync = this._sync || d.sync;
    if (d.cells.length > 0) this._addCells(req instanceof RenderRequest ? d.cells : canonicalCells(d.cells));
    return this;
  }

  /** 쌓인 것을 요청 하나로 얼리고 비운다. / Freezes the accumulated request and resets. */
  freeze(): RenderRequest {
    const req = RenderRequest.of(this._mask, {
      cells: this._frozenCells(),
      focusTo: this._focusTo,
      widthChangedFrom: this._widthFrom,
      rows: this._rows,
      sync: this._sync,
    });
    this.clear();
    return req;
  }

  /** 버린다(그리드를 지울 때). / Drops everything accumulated. */
  clear(): void {
    this._mask = 0;
    this._focusTo = null;
    this._widthFrom = null;
    this._rows = null;
    this._sync = false;
    this._pending = false;
    this._cellsA = NO_CELLS;
    this._cellsB = NO_CELLS;
    this._map = null;
  }

  private _addCells(cells: readonly CellKey[]): void {
    if (this._map === null) {
      if (this._cellsA.length === 0) { this._cellsA = cells; return; }
      if (this._cellsB.length === 0) { this._cellsB = cells; return; }
      this._map = new Map();
      this._put(this._cellsA);
      this._put(this._cellsB);
      this._cellsA = NO_CELLS;
      this._cellsB = NO_CELLS;
    }
    this._put(cells);
  }

  private _put(cells: readonly CellKey[]): void {
    const m = this._map!;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      m.set(`${c.ri}\u0000${c.field}`, c);
    }
  }

  private _frozenCells(): readonly CellKey[] {
    if (this._map !== null) return canonicalCells([...this._map.values()]);
    return unionCells(this._cellsA, this._cellsB);
  }
}
