// ============================================================
// 그리기 스케줄러 / Render scheduler
// 상태를 바꾸는 쪽은 「무엇이 바뀌었나」를 요청으로 내기만 하고, 언제·무엇을 그릴지는 여기(언제)와 계획 객체(무엇)가 정한다.
// 지금은 그리기 길이 하나뿐이라(본문 통째 다시 그리기) 계획의 행 일만 그 길로 넘긴다 — 계획이 「통째」만 답하는 동안
// 그리는 횟수·범위가 옛 호출과 똑같다. 그리기 객체(본문·머리글·푸터·기하 투영)가 이 객체에 물리면 계획의 나머지 칸도
// 여기서 나눠 준다.
//
// Producers only submit "what changed"; this object decides when, the planner decides what. For now the only paint path
// is the legacy full body repaint, so only the plan's row work is forwarded to it — as long as the planner answers
// "full rebuild" the number and range of paints equal the old direct calls.
// ============================================================
import { ColumnWindow } from '../coordinate/ColumnWindow.js';
import type { GridShape, IColumnWindow, RowSpan, ViewportBox, WindowQuery } from '../coordinate/geometryPorts.js';
import type { ColWork, DrawnState, ExplicitRows, IRenderPlan, IRenderPlanner, IRenderRequest, NextState, RowWork } from '../domain/render/ports.js';
import { RenderRequestAccumulator } from '../domain/render/RenderRequest.js';
import type { IColumnGeometry } from '../coordinate/geometryPorts.js';
import type { FramePort, IFooterView, IGeometryApplier, IHeaderSortIndicator, IRangeOverlay, IRenderScheduler, IScrollObserver } from './ports.js';

/**
 * 옛 그리기 길 — 본문을 행 범위로 통째 다시 그리는 함수와, 「보이는 범위」를 묻는 함수.
 * 끝 번호는 포함(지금 `_doRender(시작, 끝)` 과 같은 뜻), `(0, −1)` 은 본문 비우기.
 *
 * Legacy paint path: full body repaint over an inclusive row range, plus the current visible range.
 */
export interface LegacyPaintPort {
  /**
   * `columns` = 그릴 가로 창(가로 창을 쓰지 않으면 넘기지 않음 — 받는 쪽은 전 컬럼). `rowWork` = `'diff'` 면 행 차분
   * (남는 행은 그대로 두고 들어온 행만 만들고 나간 행만 뗌 — 남는 행의 창 옮김까지 함께), 없으면 그 범위를 통째로.
   *
   * `columns` = column window (omitted = all columns); `rowWork: 'diff'` asks for a row diff (keep remaining rows,
   * create entering, remove leaving — including the window shift of remaining rows); omitted = full repaint of the range.
   */
  paintRows(startIndex: number, endIndex: number, columns?: IColumnWindow, rowWork?: 'diff'): void;
  visibleRows(): readonly [number, number];
}

/**
 * 스케줄러 협력자 — 그리기 객체가 하나씩 물릴 때마다 칸이 자란다(없는 칸은 옛 그리기 길이 맡음).
 *
 * Collaborators; a slot is added as each paint object is wired in (missing slots are still handled by the legacy path).
 */
export interface RenderSchedulerStartDeps {
  readonly planner: IRenderPlanner;
  readonly paint: LegacyPaintPort;
  /** 푸터 막대(있으면 계획의 footer 일을 여기서 시킴). / Footer bar; when present the plan's footer work runs here. */
  readonly footer?: IFooterView;
  /**
   * 머리글 정렬 표시(있으면 계획의 `header: 'sortIndicator'` 를 여기서 — 머리글을 다시 만들지 않고 화살표·aria-sort 만).
   * 지금 정렬 목록은 `sortList` 로 묻는다(둘이 함께 있어야 실행).
   *
   * Header sort marks; when present the plan's `header: 'sortIndicator'` patches arrows/aria-sort here (no header rebuild).
   */
  readonly sort?: IHeaderSortIndicator;
  readonly sortList?: () => readonly { readonly field: string; readonly dir: 'asc' | 'desc' }[];
  /**
   * 기하와 그 투영(있으면 계획의 `geometry` 를 여기서 — 등록해 둔 폭 자리에만 px 를 씀, 본문을 다시 만들지 않음).
   * 둘이 함께 있어야 실행. 스케줄러가 「마지막으로 DOM 에 반영한 기하 판」을 든다.
   * 값 대신 「지금 것을 돌려주는 함수」도 받는다 — 스케줄러는 그리드를 붙이기(마운트) 전에 생기고 기하·투영은 그 뒤에 생기므로
   * (아직 없으면 null → 그 일을 건너뜀). 쓰는 몫만 받는다(판 번호·폭 목록·바뀐 몫 / 바뀐 몫 반영).
   *
   * Geometry and its projector, or functions returning the current ones (they appear after the scheduler, at mount;
   * null skips the work). Only the members the scheduler uses are required.
   */
  readonly geometry?: Late<Pick<IColumnGeometry, 'version' | 'widths' | 'changesSince'>>;
  readonly applier?: Late<Pick<IGeometryApplier, 'applyChange'>>;
  /**
   * 줄바꿈 머리글이면 기하를 반영한 프레임마다 부른다 — 머리글 높이를 재어 달라졌을 때만 본문 자리를 맞추는 일은 그 주인 몫
   * (높이 기준을 한 곳만 들어야 머리글을 다른 길로 다시 그려도 기준이 낡지 않는다).
   *
   * Called once per geometry frame for wrapping headers; comparing the header height with the last laid-out one is the
   * owner's job (one baseline, so a header redrawn by another path never leaves it stale).
   */
  readonly headerLayout?: () => void;  /** 머리글이 줄바꿈되나(아니면 높이를 묻지 않음 — 끄는 프레임마다 배치를 강제하지 않게). / Whether the header wraps. */
  readonly headerWraps?: () => boolean;
  /**
   * 범위 덧그림. 행을 다시 그리지 않는 계획(폭만 바뀜 등)에서 계획의 `overlay` 를 여기서 — 행을 다시 그리는 계획은 옛 그리기 길이
   * 이미 덧그림을 고친다. 고를 범위가 없으면 덧그림 쪽이 바로 돌아간다.
   *
   * Range overlay; runs the plan's `overlay` for plans without row work (the legacy row path already repaints it).
   */
  readonly overlay?: IRangeOverlay;
  /**
   * 가로 창(넷이 다 있어야 씀 — 하나라도 없으면 전 컬럼으로 그려 지금과 같다).
   * `window` = 창 정책의 프레임 입구(그려 둔 창을 둘지·새로 셀지), `scroll` = 이벤트에서 이미 읽은 가로 위치·보이는 폭,
   * `shape` = 창 규칙의 입력(자동 높이·병합·옵션), `body` = 그려 둔 창을 아는 본문과 「창만 옮기기」.
   * `pinnedColumns` = 화면 밖이어도 그릴 컬럼(편집 중·포커스 — 없으면 빈 목록).
   *
   * Column window; used only when all four are present, otherwise every column is painted exactly as before.
   */
  readonly window?: Late<WindowEntry>;
  readonly scroll?: Late<Pick<IScrollObserver, 'box'>>;
  readonly shape?: () => GridShape;
  readonly body?: Late<BodyWindowPort>;
  readonly pinnedColumns?: () => readonly number[];
}

/** 값, 또는 지금 값을 돌려주는 함수(아직 없으면 null). / A value, or a function returning the current one (null = not yet). */
export type Late<T extends object> = T | (() => T | null);

/** 창 정책의 프레임 입구. / The window policy's per-frame entry. */
export interface WindowEntry {
  next(drawn: IColumnWindow | null, q: WindowQuery, shape: GridShape): IColumnWindow;
}

/** 본문 쪽 창 몫: 그려 둔 창과 「창만 옮기기」. / The body's window share: drawn window and window-only update. */
export interface BodyWindowPort {
  /**
   * 그려 둔 창과, 그려 둔 행에 행 차분을 막는 종류(세로 병합·묶음·나무·디테일·자동 높이)가 있는지 — 본문만 안다.
   * `diffBlocked` 를 주지 않으면 막힘으로 본다(통째 — 안전한 쪽).
   *
   * Drawn window, and whether the drawn rows block a row diff; a missing `diffBlocked` counts as blocked.
   */
  readonly drawn: { readonly columns: IColumnWindow | null; readonly diffBlocked?: boolean };
  update(next: NextState, rows: RowWork, cols: ColWork): void;
}

const NOTHING = (): null => null;
/** 값이든 함수든 「지금 것을 돌려주는 함수」 하나로. / Normalises a value or a getter into a getter. */
function late<T extends object>(v: Late<T> | undefined): () => T | null {
  return v === undefined ? NOTHING : typeof v === 'function' ? (v as () => T | null) : () => v;
}

interface WindowPorts {
  readonly window: () => WindowEntry | null;
  readonly scroll: () => Pick<IScrollObserver, 'box'> | null;
  readonly shape: () => GridShape;
  readonly body: () => BodyWindowPort | null;
  readonly pinned: (() => readonly number[]) | null;
}

/** rAF 를 감싼 프레임 시계. / requestAnimationFrame-backed frame clock. */
export const RAF_FRAME: FramePort = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * 창은 아직 쓰지 않는다 — 계획에 넘길 자리만(컬럼 0개 전 컬럼 창).
 *
 * The column window is not used yet; this is only the slot the plan needs (an empty full window).
 */
const NO_WINDOW = ColumnWindow.full(0);
const NO_WIDTHS: readonly number[] = Object.freeze([]);
const NO_PINNED: readonly number[] = Object.freeze([]);
const NO_BOX: ViewportBox = Object.freeze({ scrollLeft: 0, width: 0 });
/** 행을 통째 다시 그릴 계획에서 본문 폭 자리 쓰기를 건너뛰게 하는 선택. / Skip body width slots when rows are rebuilt. */
const SKIP_BODY = Object.freeze({ skipScope: 'body' as const });
const UNPINNED = Object.freeze({ editRow: null, editCol: null, focusRow: null });

/**
 * 요청을 모았다가 계획을 받아 실행하는 유일한 곳. 「할 일 결정」은 하지 않는다(계획 객체 몫).
 * - sync 요청: 쌓인 요청까지 합쳐 그 자리에서 한 번 실행(예약 프레임 취소) — 공개 API 의 「호출이 끝나면 DOM 이 맞음」.
 * - sync 아닌 요청: 합쳐 두고 다음 프레임에 한 번.
 * - 실행 중 들어온 요청: sync 아니면 다음 프레임으로. sync 면 안쪽으로 재귀하지 않고 지금 실행이 끝난 바로 뒤
 *   같은 호출 안에서 한 번 더(부른 쪽이 돌아올 때 DOM 이 맞음 · 재진입 없음).
 * - 쌓인 sync 아닌 요청(세로 스크롤 쪽)은 sync 요청이 오면 함께 얼려 한 번에 그린다 — 같은 프레임에 두 번 그리지 않게.
 * - 프레임에서 실행하다 던진 오류는 보고만 하고 다음 요청을 계속 받는다. sync 실행의 오류는 부른 쪽으로 그대로 던진다.
 * - 합치기 규칙은 요청 쪽 누적기(`RenderRequestAccumulator`)가 안다 — 여기서는 하나를 들고 더하기만 하고 실행할 때 얼린다.
 *
 * Single place that batches requests and runs the planner's plan. Sync requests flush everything now; others wait
 * for the next frame; mid-run requests never recurse (sync ones run again right after the current run, others next frame).
 * The merge rules belong to the request-side accumulator; this object only adds to one and freezes it per run.
 */
export class RenderScheduler implements IRenderScheduler {
  private readonly _frame: FramePort;
  private readonly _planner: IRenderPlanner;
  private readonly _paint: LegacyPaintPort;
  private readonly _footer: IFooterView | null;
  private readonly _sort: IHeaderSortIndicator | null;
  private readonly _geometry: () => Pick<IColumnGeometry, 'version' | 'widths' | 'changesSince'> | null;
  private readonly _applier: () => Pick<IGeometryApplier, 'applyChange'> | null;
  private readonly _headerLayout: (() => void) | null;
  private readonly _headerWraps: (() => boolean) | null;
  private readonly _overlay: IRangeOverlay | null;
  private readonly _win: WindowPorts | null;
  /** 마지막으로 DOM 에 반영한 기하 판(처음엔 지금 판 — 처음 그림이 그 판으로 그려짐). / Last geometry version projected to the DOM. */
  private _applied = 0;
  private readonly _sortList: (() => readonly { readonly field: string; readonly dir: 'asc' | 'desc' }[]) | null;
  private readonly _queue = new RenderRequestAccumulator();
  private _lastPlan: IRenderPlan | null = null;
  private _frameId: number | null = null;
  private _depth = 0;
  private _destroyed = false;
  /**
   * 그려 둔 행 범위(아직 안 그림·그리다 실패함 = null). 본문 객체가 물리면 그쪽이 그려 둔 상태의 주인이 된다.
   *
   * Row range drawn last (null = never drawn or the last paint threw). The body view takes this over once wired in.
   */
  private _drawnRows: RowSpan | 'clear' | null = null;
  /** 그리기를 시작한 차례 번호(안쪽 실행을 가려내려고). / Paint sequence number (to detect nested paints). */
  private _paintSeq = 0;
  /** 실행 중 sync 요청이 들어와 끝난 뒤 한 번 더 돌아야 함. / A sync request arrived mid-run; run again afterwards. */
  private _rerun = false;

  constructor(frame: FramePort, deps: RenderSchedulerStartDeps) {
    this._frame = frame;
    this._planner = deps.planner;
    this._paint = deps.paint;
    this._footer = deps.footer ?? null;
    this._sort = deps.sort ?? null;
    this._geometry = late(deps.geometry);
    this._applier = late(deps.applier);
    this._headerLayout = deps.headerLayout ?? null;
    this._headerWraps = deps.headerWraps ?? null;
    this._overlay = deps.overlay ?? null;
    this._win = deps.window && deps.scroll && deps.shape && deps.body
      ? { window: late(deps.window), scroll: late(deps.scroll), shape: deps.shape, body: late(deps.body), pinned: deps.pinnedColumns ?? null }
      : null;
    this._applied = this._geometry()?.version ?? 0;
    this._sortList = deps.sortList ?? null;
  }

  get lastPlan(): IRenderPlan | null {
    return this._lastPlan;
  }

  /** 지금 실행 중인 깊이(0 = 실행 중 아님). 진단용. / Current run depth (diagnostics). */
  get depth(): number {
    return this._depth;
  }

  submit(req: IRenderRequest): void {
    if (this._destroyed) return;
    if (req.detail.sync && req.detail.rows !== null && this._depth === 0 && this._queue.pending) {
      // 명시 범위를 가진 sync 요청(전 행·비우기)은 쌓인 sync 아닌 요청과 합치지 않는다 — 합치면 범위 하나만 남아
      // 「지금 전 행을 그리고, 다음 프레임에 보이는 범위로 줄인다」가 「전 행이 그대로 남음」이 된다. 쌓인 것은 제 프레임에.
      // A sync request with an explicit range is not merged with pending non-sync ones (one range would survive and the
      // next-frame trim to the visible range would be lost); the pending ones keep their frame.
      this._run(req);
      return;
    }
    this._queue.add(req);
    if (req.detail.sync) {
      this._cancelFrame();
      this._run();
    } else {
      this._schedule();
    }
  }

  flushNow(): void {
    if (this._destroyed || !this._queue.pending) return;
    this._cancelFrame();
    this._run();
  }

  destroy(): void {
    this._cancelFrame();
    this._destroyed = true;
    this._queue.clear();
  }

  private _schedule(): void {
    if (this._frameId !== null) return;
    this._frameId = this._frame.request(() => {
      this._frameId = null;
      if (this._destroyed || !this._queue.pending) return;
      try {
        this._run();
      } catch (e) {
        // 프레임에서 난 오류는 받을 쪽이 없다 — 알리고 다음 요청을 계속 받는다.
        // An error inside a frame has no caller to receive it: report it and keep accepting requests.
        console.error('[OpenGrid] render frame failed', e);
      }
    });
  }

  private _cancelFrame(): void {
    if (this._frameId === null) return;
    this._frame.cancel(this._frameId);
    this._frameId = null;
  }

  /**
   * 쌓인 요청을 한 번 얼려 계획을 받고 실행한다.
   *
   * Freezes the accumulated request once, asks the planner and runs the plan.
   */
  private _run(only?: IRenderRequest): void {
    if (this._depth > 0) {
      // 실행 중 들어온 sync 요청: 안쪽으로 재귀하지 않고 지금 실행이 끝난 바로 뒤 같은 호출 안에서 한 번 더 돈다.
      // A sync request arriving mid-run does not recurse; it runs once more right after the current run, in the same call.
      this._rerun = true;
      return;
    }
    this._depth++;
    try {
      // `only` = 쌓인 것과 합치지 않고 그 자리에서 할 요청 하나(명시 범위 sync). 그 뒤 도는 차례는 쌓인 것.
      // `only` = one request run now without the queue (explicit-range sync); later passes take the queue.
      let req = only;
      do {
        this._rerun = false;
        const r = req ?? this._queue.freeze();
        req = undefined;
        const plan = this._planner.plan(r, this._drawn(), this._next(r.detail.rows));
        this._lastPlan = plan;
        this._execute(plan);
      } while (this._rerun && this._queue.pending);
    } finally {
      this._depth--;
      this._rerun = false;
    }
  }

  /**
   * 다음 상태를 만드는 유일한 곳: 행은 요청의 명시 범위, 없으면 지금 보이는 범위 하나(세로 창 범위 — 끝 포함 → 반열림).
   * 범위는 요청을 낸 때가 아니라 그릴 때 묻는다(그 사이에 바뀐 보이는 높이·행 수가 들어가게).
   *
   * Sole builder of the next state: explicit rows, else the single visible range (the vertical window, inclusive →
   * half-open), asked at paint time rather than at submit time.
   */
  private _next(rows: ExplicitRows): NextState {
    let span: RowSpan | 'clear';
    if (rows === null) {
      const [s, e] = this._paint.visibleRows();
      span = { start: s, end: e + 1 } as RowSpan;
    } else {
      span = rows;
    }
    const g = this._geometry();
    const columns = this._nextColumns();
    return g === null || this._applier() === null
      ? { rows: span, columns, columnWidths: NO_WIDTHS, geometryVersion: 0, appliedGeometryVersion: 0 }
      : { rows: span, columns, columnWidths: g.widths(), geometryVersion: g.version, appliedGeometryVersion: this._applied };
  }

  /**
   * 다음 창: 창 정책의 프레임 입구에 그려 둔 창·가로 위치·꼭 넣을 컬럼·모양을 넘긴다(그대로 둘지·새로 셀지는 정책이 정함 —
   * 그대로면 같은 객체라 계획이 「창 일 0」을 낸다). 창을 쓰지 않으면 늘 같은 「없음」 창.
   *
   * Next window from the policy's per-frame entry (the same object back means no window work); a fixed empty window otherwise.
   */
  private _nextColumns(): IColumnWindow {
    const w = this._win;
    const policy = w === null ? null : w.window();
    if (w === null || policy === null) return NO_WINDOW;
    const pinned = w.pinned === null ? NO_PINNED : w.pinned();
    const box = w.scroll()?.box ?? NO_BOX;
    return policy.next(this._drawnColumns(), { box, pinned: pinned as WindowQuery['pinned'] }, w.shape());
  }

  /** 본문이 그려 둔 창(창을 안 쓰면 늘 같은 「없음」 창, 본문이 아직 없으면 null). / Window drawn by the body. */
  private _drawnColumns(): IColumnWindow | null {
    const w = this._win;
    return w === null ? NO_WINDOW : w.body()?.drawn.columns ?? null;
  }

  private _drawn(): DrawnState {
    // 창은 아직 쓰지 않으므로 그려 둔 창 = 다음 창 자리(같은 값) — 폭만 바뀐 계획이 「창이 바뀜 → 통째」로 떨어지지 않게.
    // No column window yet: the drawn window equals the next-state slot, so width-only plans do not fall back to a rebuild.
    const diffBlocked = this._win?.body()?.drawn.diffBlocked ?? true;
    return { rows: this._drawnRows, columns: this._drawnColumns(), pinned: UNPINNED, focus: null, diffBlocked, coverWidths: NO_WIDTHS };
  }

  /**
   * 계획을 실행한다: 행 일은 옛 그리기 길로, 정렬 표시·푸터 일은 그 포트가 있으면 그리로. 머리글 통째·덧그림 칸은 옛 길이
   * 지금처럼 맡으므로(본문 다시 그리기가 범위 덧그림을 함께 하고, 머리글 통째는 부르는 쪽이 그림) 기록(lastPlan)만 한다.
   * 「그려 둔 범위」는 그린 뒤에 적는다 — 그리다 던지면 무엇이 그려져 있는지 모르므로 null.
   *
   * Runs the plan: row work through the legacy paint path, sort-mark and footer work through their ports when present;
   * full header and overlay cells are only recorded. The drawn range is recorded after painting (null if the paint throws).
   */
  private _execute(plan: IRenderPlan): void {
    this._executeGeometry(plan);
    this._executeRows(plan);
    this._executeCols(plan);
    this._executeHeader(plan);
    this._executeFooter(plan);
    this._executeOverlay(plan);
  }

  /**
   * 기하 일: 마지막으로 반영한 판 이후 바뀐 몫을 투영에 한 번 넘긴다(등록 자리에만 px — 읽기 0). 행을 다시 그리는 계획이어도
   * 먼저 한다(머리글·푸터 자리는 행 다시 그리기가 안 고침) — 다만 그때 본문 자리는 곧 새로 그려 버려지므로 건너뛰게 한다.
   * 줄바꿈 머리글이면 그 뒤 자리 맞춤 주인을 한 번 부른다(높이가 마지막으로 맞춘 값과 다를 때만 맞추는 것은 그쪽 몫).
   *
   * Geometry work: hand the change since the last projected version to the applier once (tracked slots only, no reads);
   * body slots are skipped when rows are about to be rebuilt. For wrapping headers, the layout owner is called once and
   * relayouts only when the height differs from the last laid-out one.
   */
  private _executeGeometry(plan: IRenderPlan): void {
    const geometry = this._geometry();
    const applier = this._applier();
    if (!plan.geometry || geometry === null || applier === null) return;
    const change = geometry.changesSince(this._applied);
    this._applied = change.version;
    if (change.none) return;
    applier.applyChange(change, plan.rows === 'rebuild' || plan.rows === 'clear' ? SKIP_BODY : undefined);
    if (this._headerLayout !== null && (this._headerWraps === null || this._headerWraps())) this._headerLayout();
  }

  /** 덧그림: 행을 다시 그리지 않는 계획에서만(행 다시 그리기는 옛 길이 덧그림까지 고침). / Overlay only when no row work. */
  private _executeOverlay(plan: IRenderPlan): void {
    if (plan.overlay && plan.rows === 'none' && this._overlay !== null) this._overlay.repaint();
  }

  /**
   * 머리글 일: 정렬 표시만이면(`sortIndicator`) 표시 객체에 지금 정렬 목록을 알린다(바뀐 칸만 고침 — 같은 목록이면 일 0).
   * 머리글 통째(`rebuild`)는 아직 옛 길(부르는 쪽의 renderHeader)이 맡는다.
   *
   * Header work: `sortIndicator` notifies the indicator with the current sort list (only changed cells are patched);
   * a full header rebuild is still done by the legacy path.
   */
  private _executeHeader(plan: IRenderPlan): void {
    const sort = this._sort;
    const list = this._sortList;
    if (plan.header === 'sortIndicator' && sort !== null && list !== null) sort.update(list());
  }

  /**
   * 창 일: 행은 그대로 두고 창만 옮긴다(들어온 컬럼 칸만 만들고 나간 컬럼 칸만 뗌 — 본문 쪽 몫). 계획은 창이 실제로
   * 달라졌을 때만, 그리고 행을 새로 그리지 않을 때만 이 일을 낸다(새로 그리면 이미 새 창으로 그려짐).
   *
   * Window work: move the window without touching rows; planned only when the window really changed and rows are not rebuilt.
   */
  private _executeCols(plan: IRenderPlan): void {
    // 행 차분은 남는 행의 창 옮김까지 한 번에 한다(같은 행을 두 번 만지지 않게). / A row diff already shifts remaining rows.
    if (plan.cols === 'shift' && plan.rows !== 'diff') this._win?.body()?.update(plan.next, 'none', 'shift');
  }

  private _executeRows(plan: IRenderPlan): void {
    const next = plan.next.rows;
    if (plan.rows === 'none') return;
    const target: RowSpan | 'clear' = plan.rows === 'clear' || next === 'clear' ? 'clear' : next;
    const seq = ++this._paintSeq;
    this._drawnRows = null;
    if (target === 'clear') this._paint.paintRows(0, -1);
    else if (this._win === null) this._paint.paintRows(target.start, target.end - 1);
    else if (plan.rows === 'diff') this._paint.paintRows(target.start, target.end - 1, plan.next.columns, 'diff');
    else this._paint.paintRows(target.start, target.end - 1, plan.next.columns);
    // 그리는 도중 안쪽 실행(sync 재귀)이 있었으면 그쪽이 마지막으로 그린 것 — 덮어쓰지 않는다.
    // If a nested (re-entrant sync) paint ran meanwhile, it painted last; keep its record.
    if (this._paintSeq === seq) this._drawnRows = target;
  }

  /**
   * 푸터 일은 행 일 뒤에, 행 일이 없어도 계획대로: 막대 다시 → paint, 값만 → updateValues. 푸터 포트가 없으면 옛 길이 맡는다.
   *
   * Footer work runs after the row work, even when there is none: rebuild → paint, values → updateValues.
   */
  private _executeFooter(plan: IRenderPlan): void {
    const footer = this._footer;
    if (footer === null) return;
    if (plan.footer === 'rebuild') footer.paint();
    else if (plan.footer === 'values') footer.updateValues();
  }
}
