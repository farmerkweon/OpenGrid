// ============================================================
// 컬럼 창 정책 / Column window policy
// 지금 어느 컬럼을 본문 DOM 으로 둘지 정하는 유일한 곳. 넓은 그리드에서 화면 밖 컬럼의 칸까지 만들면 가로 한 걸음마다
// 수천 칸을 새로 만들게 되므로, 보이는 범위 양옆에 픽셀 여유를 둔 구간만 그리게 한다. 컬럼 폭·위치는 직접 알지 않고
// 기하 포트에 묻는다(폭의 주인은 하나).
//
// Sole owner of "which columns live in the body DOM now". Draws only the visible range plus a pixel margin
// on each side; widths and positions are asked from the geometry port, never stored here.
// ============================================================
import { px, leafColIndex, type Px, type LeafColIndex } from './types.js';
import type {
  IColumnGeometry, IColumnWindow, IColumnWindowPolicy, GridShape, WindowQuery, WindowRule, WindowSegment,
} from './geometryPorts.js';
import type { IWindowingPort } from './ports.js';
import { ColumnWindow } from './ColumnWindow.js';

/** 기존 포트 호환 호출이 쓰는 모양 — 그 포트는 폭 말고는 아무것도 넘겨주지 않는다. */
const PORT_SHAPE_BASE = { autoHeight: false, mergeEmpty: true, virtualColumns: true } as const;
const NO_PINNED: readonly LeafColIndex[] = Object.freeze([]);

/**
 * 가로 가상화 정책. 「창을 써도 되나」는 조건문이 아니라 규칙 목록이 답한다 — 규칙 하나라도 false 면 전 컬럼.
 * 창 = 고정 컬럼 구간 + 보이는 범위 양옆으로 `max(minMarginPx, 보이는 폭 × marginRatio)` px 를 더한 연속 구간 하나
 * (꼭 넣을 컬럼이 밖에 있으면 그 컬럼까지 넓힌 껍질). 그려 둔 창이 「보이는 범위 + 여유의 절반」을 아직 덮는 동안은
 * 창을 바꾸지 않는다(이력) — 스크롤 몇 px 마다 끝 칸을 붙였다 뗐다 하지 않게.
 * 가로 좌표는 기하의 내용 좌표(여분 칸 왼쪽 끝 = 0)이고, 스크롤 값도 같은 원점으로 받는다.
 *
 * Window = frozen segment + one contiguous segment spanning the visible range plus a pixel margin on each side
 * (hull-widened to include pinned columns). Hysteresis: a drawn window is kept while it still covers the
 * visible range plus half the margin. x is the geometry content coordinate (left edge of extra columns = 0).
 */
export class ColumnWindowPolicy implements IColumnWindowPolicy, Pick<IWindowingPort, 'horizontalWindow'> {
  private readonly _geometry: IColumnGeometry;
  private readonly _rules: readonly WindowRule[];
  private readonly _minMargin: number;
  private readonly _ratio: number;
  /** 같은 컬럼 수의 전 컬럼 창은 하나만 만들어 돌려쓴다(스크롤마다 새 값을 만들지 않게). */
  private _full: ColumnWindow | null = null;
  /** `next` 가 본 직전 스크롤 값(나아가는 방향·속도). 처음엔 모름(NaN). / Previous scroll seen by `next`. */
  private _lastScroll = NaN;

  constructor(
    geometry: IColumnGeometry,
    rules: readonly WindowRule[],
    opts?: { minMarginPx?: number; marginRatio?: number },
  ) {
    this._geometry = geometry;
    this._rules = Object.freeze([...rules]);
    this._minMargin = ColumnWindowPolicy._nonNegative(opts?.minMarginPx, 400);
    this._ratio = ColumnWindowPolicy._nonNegative(opts?.marginRatio, 0.5);
  }

  /**
   * 기본 규칙 넷. 서로 모르고 순서도 상관없다. 전 컬럼으로 그리는 경우는 자동 높이(화면 밖 긴 칸이 행 높이를 정함) ·
   * 폭 모름(숨은 컨테이너 등 — 지금처럼 전 칸) · 병합(가려진 칸 자리를 지금 모양 그대로 지키려고) · 사용자가 끔.
   * 줄바꿈 칸은 행 높이가 옵션 값이라 규칙에 없다 — 줄바꿈 + 고정 행 높이에서도 창을 쓴다.
   * 「병합이 있나」는 모양의 `mergeEmpty` 하나만 본다 — 그 값을 병합 원천에서 읽어 채우는 일은 모양을 만드는 쪽 몫
   * (원천이 둘이면 어긋날 때 어느 쪽이 맞는지 정책이 모른다).
   *
   * Four independent, order-free rules. Wrapped cells with a fixed row height keep the window on.
   * Merge presence is read from `GridShape.mergeEmpty` only.
   */
  static defaultRules(): readonly WindowRule[] {
    return Object.freeze([
      Object.freeze<WindowRule>({ id: 'autoHeight', allowsWindow: (s: GridShape) => !s.autoHeight }),
      Object.freeze<WindowRule>({ id: 'unknownWidth', allowsWindow: (s: GridShape) => s.viewportWidth > 0 }),
      Object.freeze<WindowRule>({ id: 'mergeActive', allowsWindow: (s: GridShape) => s.mergeEmpty }),
      Object.freeze<WindowRule>({ id: 'optOut', allowsWindow: (s: GridShape) => s.virtualColumns }),
    ]);
  }

  /**
   * 프레임마다 부르는 입구: 그려 둔 창을 그대로 둘지(모양이 창을 허용하고 이력상 아직 덮음) 새로 셀지를 한 번에 답한다.
   * 새로 셀 때는 직전 프레임에서 움직인 만큼 나아가는 쪽 여유를 더 넓힌다 — 빠르게 긁어도 다음 프레임 자리가 이미 그려져
   * 있게. 뒤쪽은 기본 여유 그대로라 방향을 바꿔도 빈 칸이 생기지 않는다. 더하는 몫은 보이는 폭 한 장까지.
   * 움직임 이력은 이 입구만 쓴다(`compute`·`covers` 는 같은 입력에 늘 같은 답).
   *
   * Per-frame entry: keep the drawn window (shape allows it and it still covers) or compute a new one whose
   * leading margin grows with the last frame's movement. Only this entry keeps movement history.
   */
  next(drawn: IColumnWindow | null, q: WindowQuery, shape: GridShape): IColumnWindow {
    const width = ColumnWindowPolicy._width(q);
    const now = this._scroll(q, width);
    const prev = this._lastScroll;
    this._lastScroll = now;
    if (drawn !== null && !drawn.full && this._allows(shape) && this.covers(drawn, q)) return drawn;
    return this._window(q, shape, Number.isNaN(prev) ? 0 : now - prev);
  }

  compute(q: WindowQuery, shape: GridShape): ColumnWindow {
    return this._window(q, shape, 0);
  }

  private _window(q: WindowQuery, shape: GridShape, dx: number): ColumnWindow {
    const g = this._geometry;
    const count = g.count;
    if (count === 0 || !this._allows(shape)) return this._fullWindow(count);

    const frozen = g.frozenCount;
    const width = ColumnWindowPolicy._width(q);
    const scrollLeft = this._scroll(q, width);
    const margin = this._margin(width);
    const lead = Math.min(Math.abs(dx) * 2, width);
    let from = this._col(scrollLeft - margin - (dx < 0 ? lead : 0), count);
    const to = this._col(scrollLeft + width + margin + (dx > 0 ? lead : 0), count);
    if (from < frozen) from = frozen;

    // 구간 = 고정 + 보이는 구간 + 꼭 넣을 컬럼(편집 중·포커스)마다 따로 한 칸짜리 토막(사이는 빈칸). 보이는 구간을 그
    // 컬럼까지 이어 넓히면 멀리 있는 칸 하나를 누른 것만으로 거의 전 컬럼을 그리게 되므로 따로 둔다. 고정 구간 안·보이는
    // 구간 안·없는 번호는 토막을 만들 까닭이 없다.
    // Segments: frozen + visible range + one single-column segment per pinned column outside it (gaps between),
    // so that focusing a far cell does not stretch the window over almost every column.
    const segs: WindowSegment[] = [];
    if (frozen > 0) segs.push({ from: leafColIndex(0), to: leafColIndex(frozen - 1) });
    if (from <= to) segs.push({ from: leafColIndex(from), to: leafColIndex(to) });
    const pinned = q.pinned;
    for (let i = 0; i < pinned.length; i++) {
      const p = pinned[i]!;
      if (!Number.isInteger(p) || p < frozen || p >= count || (p >= from && p <= to)) continue;
      ColumnWindowPolicy._insertColumn(segs, p);
    }
    const w = ColumnWindow.of(segs, count);
    return w.full ? this._fullWindow(count) : w;
  }

  /**
   * 그려 둔 창이 「보이는 범위 + 여유의 절반」을 px 로 아직 덮나. 덮으면 창을 바꾸지 않는다.
   * 컬럼 구성이 바뀐 창(컬럼 수가 다르거나 지금 고정 구간을 담지 않음)은 덮지 않는다 — 옛 번호가 새 구성에서 뜻이 달라지므로.
   * 전 컬럼 창은 늘 false: 그 창이 규칙 때문에 전 컬럼인지(자동 높이·폭 모름 …) 여기서는 모양을 모르므로 compute 에 맡긴다.
   * 규칙이 여전히 전 컬럼을 요구하면 compute 가 같은 전 컬럼 창 객체를 돌려주어 `equals` 가 바로 같다고 답한다.
   * 꼭 넣을 컬럼이 창 밖이면 덮지 않는다.
   *
   * Hysteresis test in pixels. A window built for another column layout never covers; a full window always
   * answers false so that compute (which returns the same cached full window) decides.
   */
  covers(drawn: IColumnWindow, q: WindowQuery): boolean {
    const g = this._geometry;
    const count = g.count;
    if (drawn.full || drawn.count !== count) return false;
    const segs = drawn.segments;
    const frozen = g.frozenCount;
    const first = segs[0];
    if (frozen > 0 && (first === undefined || first.from !== 0 || first.to < frozen - 1)) return false;

    const pinned = q.pinned;
    for (let i = 0; i < pinned.length; i++) {
      const p = pinned[i]!;
      if (Number.isInteger(p) && p >= frozen && p < count && !drawn.contains(p)) return false;
    }

    const width = ColumnWindowPolicy._width(q);
    const scrollLeft = this._scroll(q, width);
    const half = this._margin(width) / 2;
    const lo = g.leftOf(leafColIndex(0));
    const hi = g.totalWidth();
    let needRight = Math.min(scrollLeft + width + half, hi);
    let needLeft = Math.max(scrollLeft - half, lo);
    if (needRight < lo) needRight = lo;
    if (needLeft > needRight) needLeft = needRight;
    // 필요한 구간의 왼쪽 끝을 담는 구간(뒤에서부터 첫 번째)이 오른쪽 끝까지 덮어야 한다.
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]!;
      if (needLeft < g.leftOf(s.from)) continue;
      return needRight <= g.leftOf(leafColIndex(s.to + 1));
    }
    return false;
  }

  /**
   * 기존 포트 호환: 같은 규칙·같은 여유로 계산한 창의 껍질을 반열림 `{start, end}` 로 돌려준다.
   * 그 포트는 폭 말고는 모양을 모르므로 나머지 규칙 입력은 「허용」으로 둔다(폭 0 이면 여전히 전 컬럼).
   * 고정 컬럼이 있으면 껍질이 0 부터라 가상화 없는 넓은 집합(0..창 끝)이 된다 — 호환용일 뿐, 새 코드는 compute 를 쓴다.
   *
   * Legacy port: hull of the computed window as half-open {start, end}; with frozen columns the hull starts at 0.
   */
  horizontalWindow(scrollLeft: Px, viewportW: Px): { start: LeafColIndex; end: LeafColIndex } {
    const w = this.compute(
      { box: { scrollLeft, width: viewportW }, pinned: NO_PINNED },
      { ...PORT_SHAPE_BASE, viewportWidth: viewportW },
    );
    const segs = w.segments;
    if (segs.length === 0) return { start: leafColIndex(0), end: leafColIndex(0) };
    return { start: segs[0]!.from, end: leafColIndex(segs[segs.length - 1]!.to + 1) };
  }

  private _allows(shape: GridShape): boolean {
    const rules = this._rules;
    for (let i = 0; i < rules.length; i++) if (!rules[i]!.allowsWindow(shape)) return false;
    return true;
  }

  /** 보이는 폭: 유한한 양수가 아니면 0(모름). */
  private static _width(q: WindowQuery): number {
    const w = q.box.width;
    return Number.isFinite(w) && w > 0 ? w : 0;
  }

  /**
   * 스크롤 값을 브라우저처럼 [0, 전체 폭 − 보이는 폭] 에 묶는다. 컬럼을 숨기거나 좁힌 직후 관찰자가 든 값이 한 프레임
   * 낡아 끝 너머여도 실제로 보일 컬럼을 빠뜨리지 않게. 유한수가 아니면 0.
   */
  private _scroll(q: WindowQuery, width: number): number {
    const s = q.box.scrollLeft;
    if (!Number.isFinite(s) || s <= 0) return 0;
    const max = Math.max(0, this._geometry.totalWidth() - width);
    return s < max ? s : max;
  }

  /** 차례대로 놓인 겹침 없는 구간 목록에 컬럼 하나짜리 토막을 제자리에 끼운다(이미 담겨 있으면 그대로). / Inserts a one-column segment in order. */
  private static _insertColumn(segs: WindowSegment[], c: number): void {
    let i = 0;
    while (i < segs.length && segs[i]!.to < c) i++;
    if (i < segs.length && segs[i]!.from <= c) return;
    segs.splice(i, 0, { from: leafColIndex(c), to: leafColIndex(c) });
  }

  private _margin(width: number): number {
    return Math.max(this._minMargin, width * this._ratio);
  }

  /** 내용 x → 컬럼(기하에 물음). 음수·여분 구역은 0, 끝 너머는 마지막 컬럼. */
  private _col(x: number, count: number): number {
    const c = this._geometry.colAt(px(Math.max(0, x)));
    return c < 0 ? 0 : c >= count ? count - 1 : c;
  }

  private _fullWindow(count: number): ColumnWindow {
    const f = this._full;
    if (f !== null && f.count === count) return f;
    const made = ColumnWindow.full(count);
    this._full = made;
    return made;
  }

  private static _nonNegative(v: number | undefined, fallback: number): number {
    return v !== undefined && Number.isFinite(v) && v >= 0 ? v : fallback;
  }
}
