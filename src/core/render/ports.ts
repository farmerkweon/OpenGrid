// ============================================================
// 그리기(DOM) 쪽 협력 계약 / DOM-side collaboration contracts
// 형만 둔다. 그리기 객체끼리는 이 파일과 계산 쪽 ports 의 I* 인터페이스에만 기대고, 서로의 구체 클래스에 기대지 않는다.
// 이 파일은 계산 쪽(coordinate/·domain/)을 가져다 쓰지만, 계산 쪽은 이 파일을 모른다(arch:check 가 지킨다).
//
// Types only. DOM-side objects depend on these I* ports (and the headless ports), never on each other's concrete classes.
// ============================================================
import type {
  IColumnGeometry, IColumnWindow, IColumnWindowPolicy, ICellTextPolicy, GeometryChange, ViewportBox, RowSpan,
} from '../coordinate/geometryPorts.js';
import type {
  IRenderRequest, IRenderPlan, IRenderPlanner, DrawnState, NextState, RowWork, ColWork,
} from '../domain/render/ports.js';

/** 프레임 시계(rAF 를 감싼 포트 — 시험에서 가짜 시계). */
export interface FramePort {
  request(cb: () => void): number;
  cancel(id: number): void;
}

// ── 칸 지도 ───────────────────────────────────────────────────────
/** 지금 DOM 에 붙은 칸 요소의 유일한 지도(기존 _cellMap). 떼면 지도에서도 지운다. */
export interface ICellRegistry {
  set(ri: number, ci: number, el: HTMLElement): void;
  get(ri: number, ci: number): HTMLElement | undefined;
  /** 컬럼 ci 의 지금 그려진 칸들(행 순서 무관). 매 프레임 이것을 묻는다(누를 때 목록을 붙들지 않음 → 끄는 도중 행이 바뀌어도 맞음). */
  cellsOfColumn(ci: number): Iterable<HTMLElement>;
  dropRow(ri: number): void;
  dropColumn(ri: number, ci: number): void;
  clear(): void;
  readonly size: number;
}

// ── 기하 → DOM px ─────────────────────────────────────────────────
/** 'w' = width, 'wm' = +min-width, 'wmm' = +max-width (지금 코드가 쓰는 조합 그대로). */
export type WidthProps = 'w' | 'wm' | 'wmm';
export type ProjectionScope = 'header' | 'body' | 'footer';

/**
 * 기하에서 나온 px 를 DOM 에 쓰는 유일한 객체. 칸 요소는 ICellRegistry 에 묻고, 칸이 아닌 자리만 스스로 기억한다.
 * 불변: applyChange 뒤 살아 있는 모든 폭 자리의 px == 기하 값(시험: 「applyChange 결과 == 처음부터 그린 결과」).
 * 컬럼별 「마지막에 쓴 폭」을 기억해 같으면 쓰지 않는다(칸 객체 없이).
 * 이 객체를 부르는 것은 RenderScheduler(프레임당 한 번)와 처음 그리는 그리개뿐 — 너비 조절 binder 는 직접 부르지 않는다.
 * / Sole writer of geometry-derived px into the DOM.
 */
export interface IGeometryApplier {
  /** 쓰기 + 등록(새 코드는 이것만). 칸 요소는 등록하지 않고 쓰기만(지도는 ICellRegistry). */
  writeCellWidth(el: HTMLElement, ci: number, p: WidthProps): void;
  /** 등록만(동작을 바꾸지 않는 옮기기 동안 cssText 글자 순서를 그대로 두려고 — 값은 이미 쓰여 있음). */
  trackHeaderCell(th: HTMLElement, ci: number, p: WidthProps): void;
  /** extraPx: 기하가 모르는 몫을 더함(마지막 컬럼을 넘는 병합의 넘은 컬럼 × 기본 폭 등). 기본 0. */
  trackSpan(el: HTMLElement, ci: number, span: number, p: WidthProps, s: ProjectionScope, extraPx?: number): void;
  /**
   * 행 하나로 칸 여럿 등록: row 의 자식 [firstChild, firstChild + (to − from)] 가 컬럼 [from, to] 의 칸 폭 자리.
   * 칸 지도 밖 칸이 컬럼마다 있는 행(묶음 행 등)을 칸마다 등록하지 않으려고.
   */
  trackRowCells(row: HTMLElement, firstChild: number, from: number, to: number, p: WidthProps, s: ProjectionScope): void;
  /** 세로 병합 마스터처럼 행 밖에 있는 absolute 요소의 left. */
  trackLeft(el: HTMLElement, ci: number, s: ProjectionScope): void;
  trackTotal(el: HTMLElement, prop: 'width' | 'minWidth', s: ProjectionScope): void;
  trackExtra(el: HTMLElement, s: ProjectionScope): void;
  /** 가상화 빈칸: [from, to] 컬럼 폭의 합. */
  trackGap(el: HTMLElement, from: number, to: number, s: ProjectionScope, extraPx?: number): void;
  /** CF 데이터 막대: ratio × spanWidth. 등록하는 쪽은 CFRenderBridge. */
  trackBar(el: HTMLElement, ci: number, span: number, ratio: number): void;
  untrack(el: HTMLElement): void;
  release(s: ProjectionScope): void;
  /**
   * 바뀐 컬럼의 칸(ICellRegistry)·th·병합·빈칸·막대, 오른쪽 고정 칸 left, 전체 폭 자리만 다시 쓴다.
   * skipScope 'body': 본문 칸(칸 지도)·본문 등록 자리를 건너뛴다 — 같은 프레임에 행을 통째로 다시 그려 곧 버릴 칸에 px 를 먼저 쓰지 않으려고
   * (머리글·푸터는 그대로 씀). 넘긴 쪽이 그 프레임에 본문을 기하로 다시 그릴 책임을 진다.
   * skipScope 'body' skips body cells and body spots — for frames that rebuild the rows anyway (header/footer still written).
   */
  applyChange(change: GeometryChange, opts?: { skipScope?: 'body' }): void;
}

// ── 가로 위치 따라가기 ──────────────────────────────────────
/** 본문 가로 위치를 머리글·푸터가 따라가는 일의 주인. 지금 구현은 scrollLeft 를 옮겨 쓰고, sticky 방식으로 바꿔도 이 포트는 그대로. */
export interface IScrollFollower {
  follow(el: HTMLElement): void;
  unfollow(el: HTMLElement): void;
  /** scroll 이벤트에서 한 번 — 쓰기만, 읽기 없음. */
  sync(scrollLeft: number): void;
  destroy(): void;
}

/** 「이 컬럼이 보이게」 가로 스크롤. 기하에 묻고 scrollLeft 만 쓴다. */
export interface IHorizontalReveal {
  revealColumn(ci: number): void;
}

/** 스크롤·크기 입력을 읽는 유일한 곳(DOM 읽기는 여기서만 — arch:check 가 기계로 지킨다). 읽은 값은 요청으로 낸다. */
export interface IScrollObserver {
  readonly box: ViewportBox;
  readonly scrollTop: number;
  destroy(): void;
}

// ── 머리글 ──────────────────────────────────────────────────────────
/** 머리글의 정렬 표시(화살표·og-sorted·aria-sort·눌림 og-sorting·진행 막대·aria-busy)만 고친다. 머리글을 다시 만들지 않는다. */
export interface IHeaderSortIndicator {
  bind(th: HTMLElement, field: string, sortable: boolean): void;
  /** 끝나는 프레임에 한 번(바뀐 th 만). */
  update(sortList: readonly { readonly field: string; readonly dir: 'asc' | 'desc' }[]): void;
  /** 누른 프레임에 눌림 표시. */
  setPressed(field: string | null): void;
  /** 300ms 지나도 진행 중이면 true(막대 서서히 나타남, aria-busy). */
  setBusy(field: string, busy: boolean, nextDir?: 'asc' | 'desc'): void;
  release(): void;
}

/** 스케줄러가 머리글에 시키는 일(구현 HeaderView). */
export interface IHeaderView {
  /** 머리글 표 통째로(컬럼 구성·테마 변경 — 지금 renderHeader 와 같은 일). */
  paintAll(): void;
  /** 머리글 높이(px). 줄바꿈 머리글이면 기하 반영 뒤 한 번 읽는다(강제 배치 1회 허용). */
  height(): number;
}

// ── 푸터·범위 덧그림 ───────────────────────────────────────────────
/** 스케줄러가 푸터에 시키는 일(구현 FooterView). 값 계산은 IFooterValues(헤드리스). */
export interface IFooterView {
  /** 푸터 막대를 통째로(정의 변경). */
  paint(): void;
  /** 값만 다시 계산·표시(RenderPlan.footer === 'values'). */
  updateValues(): void;
}

/**
 * 범위 선택 테두리 다시 그리기(구현: RangeSelectionManager 의 repaint 를 감싼 어댑터). 좌표는 IRangeRectCalculator.
 * 그려 둔 칸의 `og-range-selected` 클래스 고치기도 여기서(계획의 overlay 하나가 둘 다 뜻함).
 */
export interface IRangeOverlay {
  repaint(): void;
}

// ── 본문 ────────────────────────────────────────────────────────
export type RowKind = 'data' | 'group' | 'detail-head' | 'detail-filler';

/** 행 그리개가 받는 문맥(그리기 한 번에 하나 — 행·칸마다 만들지 않음). */
export interface RowPaintContext {
  readonly columns: IColumnWindow;
  readonly geometry: IColumnGeometry;
  readonly cells: ICellRegistry;
  readonly applier: IGeometryApplier;
}

/** 행 종류 하나를 그린다(종류별 객체 — BodyView 당 하나씩). 같은 행·자료·창이면 같은 DOM(멱등). */
export interface IRowPainter<TItem = unknown> {
  readonly kind: RowKind;
  paint(ri: number, item: TItem, ctx: RowPaintContext): HTMLElement | null;
  /** 창이 바뀔 때 행 끝 칸만 붙이고 떼고 빈칸 폭을 고친다. */
  shiftWindow(row: HTMLElement, ri: number, item: TItem, prev: IColumnWindow, next: IColumnWindow, ctx: RowPaintContext): void;
}

/**
 * 본문 DOM 의 주인 — 무엇이 그려져 있는지(행·칸·창·잘린 칸 덮는 폭)를 유일하게 안다. 계획을 실행하는 작은 연산을 준다.
 * 행·창 두 축을 한 번에 받는 update 하나 — 순서는 「행 차분(나간 행 떼기·들어온 행은 새 창으로 만들기) → 남은 행만 창 옮김」.
 * 쓰는 쪽별로 좁힌 포트: 스케줄러는 IBodyView 전부, 편집은 IBodyPin, binder 는 아무것도 안 씀.
 * / Sole owner of the body DOM and of what is currently drawn.
 */
export interface IBodyView extends IBodyPin {
  readonly drawn: DrawnState;
  update(next: NextState, rows: RowWork, cols: ColWork): void;
  refreshCells(keys: readonly { readonly ri: number; readonly ci: number }[]): void;
  /** to 가 null 이면 옛 포커스 칸 표시만 지운다. */
  moveFocus(from: { ri: number; ci: number } | null, to: { ri: number; ci: number } | null): void;
  repaintRowState(ris: readonly number[]): void;
  refillColumns(cis: readonly number[]): void;
  cell(ri: number, ci: number): HTMLElement | undefined;
}
/** 편집·포커스가 쓰는 좁은 포트. */
export interface IBodyPin {
  pin(p: { editRow?: number | null; editCol?: number | null; focusRow?: number | null }): void;
}

// ── 스케줄러 ──────────────────────────────────────────────────────
/** 세로 창의 원천(VirtualScroll 이 구현). */
export interface IRowsSource {
  getVisibleRange(): RowSpan;
}

/** 스케줄러 협력자 — 모두 포트. NextState 는 스케줄러가 rows·window·geometry 에 물어 만든다. */
export interface RenderSchedulerDeps {
  readonly planner: IRenderPlanner;
  readonly body: IBodyView;
  readonly header: IHeaderView;
  readonly sort: IHeaderSortIndicator;
  readonly footer: IFooterView | null;
  readonly overlay: IRangeOverlay;
  readonly applier: IGeometryApplier;
  readonly geometry: IColumnGeometry;
  readonly window: IColumnWindowPolicy;
  readonly rows: IRowsSource;
  readonly scroll: IScrollObserver;
}

/**
 * 요청을 모아 프레임당 한 번, 계획이 말하는 최소 일만 실행하는 유일한 곳.
 * 불변: 본문·기하 DOM 쓰기는 프레임당 많아야 한 번(끄는 동안도) · sync 요청은 쌓인 것까지 합쳐 즉시 한 번(예약 프레임 취소) ·
 *       실행 중 요청은 다음 프레임(재진입 없음). 할 일 결정은 하지 않는다(Planner).
 * / Batches requests and runs the planner's minimal work at most once per frame.
 */
export interface IRenderScheduler {
  submit(req: IRenderRequest): void;
  flushNow(): void;
  /** 시험·진단용. */
  readonly lastPlan: IRenderPlan | null;
  destroy(): void;
}

// ── 칸 그리개 의존 ──────────────────
/**
 * 기존 RendererCallbacks 의 부분집합. 구현 시 `Pick<RendererCallbacks, 이 키들>` 로 바꿔 끼운다(키 이름·뜻은 지금 그대로).
 */
export interface CellCallbacksLike {
  getRowState?(ri: number): string;
  getFormulaMeta?(ri: number, field: string): { src: string; error: string | null; approx: boolean } | null;
  /**
   * 지금 호출 `applyCF?.(cellEl, ri, col.field, value, mergedWidth, mergedHeight)` 의 여섯 인자 그대로 +
   * 일곱째 `track` 을 더하기만. 동작을 바꾸지 않는 동안 막대는 여전히 mergedWidth 로 px 를 쓰고, track 은 등록만 한다.
   */
  applyCF?(cellEl: HTMLElement, ri: number, field: string, value: unknown, mergedWidth: number, mergedHeight: number,
    track?: (bar: HTMLElement, ratio: number) => void): void;
}
export interface CellPainterDeps {
  readonly callbacks: CellCallbacksLike;
  readonly text: ICellTextPolicy;
  readonly applier: IGeometryApplier;
}

// ── 페이지 쪽 보이는 구간 ────────────────────────────────────────
export interface IPageScrollObserver {
  attach(): void;
  detach(): void;
  readonly attached: boolean;
}
