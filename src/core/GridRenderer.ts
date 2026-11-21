import { DataLayer } from './DataLayer.js';
import { RowDragDrop } from './RowDragDrop.js';
import { MergeEngine } from './MergeEngine.js';
import { AppearanceResolver, ThemeContext } from './AppearanceResolver.js';
import { t as _globalT } from './i18n/LocaleRegistry.js';
import { _el, _style } from './render/dom.js';
import { CellRegistry } from './render/body/CellRegistry.js';
import { ResizeHandleBinder, type ResizeBinderPorts } from './render/header/ResizeHandleBinder.js';
import { HeaderView } from './render/header/HeaderView.js';
import { BodyView } from './render/body/BodyView.js';
import { ScrollLeftFollower } from './render/ScrollFollower.js';
import { GeometryApplier } from './render/GeometryApplier.js';
import { ScrollbarGutter } from './render/ScrollbarGutter.js';
import type { ColumnDef, SortItem, CellRange, GridOptions, FilterItem } from './types.js';
import type { IColumnGeometry, IColumnWindow } from './coordinate/geometryPorts.js';
import type { IScrollFollower, IHeaderSortIndicator, IGeometryApplier } from './render/ports.js';

// ─── RenderOptions ────────────────────────────────────────
/**
 * R9(§6-R9 / §2.5 R-4a): 렌더러가 소비하는 opts 타입. 공개 GridOptions(생성 시 기본값 병합
 * 완료 = Required) 위에, 렌더 파이프라인이 매 프레임 주입하는 내부 증강 필드(언더스코어 접두)를
 * 얹은 것. 내부 필드는 렌더 파이프라인에서만 채워지며 공개 API 가 아니다(값은 항상 매니저 최신값).
 * / R9 (§6-R9 / §2.5 R-4a): the opts type the renderer consumes. On top of the public GridOptions
 * (defaults already merged at construction = Required), it adds internal augmentation fields
 * (underscore-prefixed) injected each frame by the render pipeline. The internal fields are filled
 * only by the render pipeline and are not public API (values are always the manager's latest).
 * @internal
 */
export interface RenderOptions extends Required<GridOptions> {
  /** ColumnLayout.frozenCount — 고정 컬럼 수(헤더/본문 좌측 오프셋 계산). / Frozen column count (header/body left-offset calc). */
  _frozenCount?: number;
  /** 활성 필터 — 필터 아이콘 활성 표시용. / Active filters — to mark the filter icon active. */
  _activeFilters?: Record<string, FilterItem[]>;
  /** DnD 핸들에 넘길 총 행수. / Total row count passed to the DnD handle. */
  _totalRows?: number;
  /** 포커스 셀 — 포커스 셀 하이라이트. / The focus cell — for focus-cell highlighting. */
  _focusCell?: { ri: number; ci: number } | null;
  /** 범위 선택 rect 하이라이트 재적용 재료(비-'cells' 모드면 없음). / Rects to re-apply range-selection highlight (absent outside 'cells' mode). */
  _rangeRects?: CellRange[];
}

// ─── RenderFrame ──────────────────────────────────────────
/**
 * R3(§6-R3 / §2.5 R-4b): renderBody 의 위치 인자 묶음을 단일 파라미터 객체로.
 * R9: opts 필드 타입 복원(any → RenderOptions). 나머지 필드는 기존 위치 인자의 타입 그대로.
 * / R3 (§6-R3 / §2.5 R-4b): renderBody's positional arguments gathered into a single parameter
 * object. R9: opts field typed as RenderOptions (was any); the remaining fields keep the types of
 * the former positional arguments.
 * @internal
 */
export interface RenderFrame {
  /** 가시 구간 시작 flat 행 인덱스. / First visible flat row index. */
  startIndex: number;
  /** 가시 구간 끝 flat 행 인덱스. / Last visible flat row index. */
  endIndex: number;
  /** 행 데이터 소스. / Row data source. */
  data: DataLayer<any>;
  /** 리프 컬럼 정의 배열. / Leaf column definitions. */
  leaves: ColumnDef[];
  /** 리프 컬럼별 너비(px, 읽기 전용 — 그리는 쪽은 기하에 묻는다). / Per-leaf column widths (px, read-only — painters ask the geometry). */
  widths: readonly number[];
  /** 렌더 옵션(내부 증강 포함). / Render options (with internal augmentation). */
  opts: RenderOptions;
  /** 가상 스크롤 상단 오프셋(px). / Virtual-scroll top offset (px). */
  offsetY: number;
  /** 전체 스크롤 높이(px). / Total scroll height (px). */
  totalHeight: number;
  /** 선택된 행 집합. / Set of selected rows. */
  selectedRows: Set<number>;
  /** 체크된 행 집합. / Set of checked rows. */
  checkedRows: Set<number>;
  /** 그룹/트리 플랫 행(그룹핑 시). / Grouped/tree flat rows (when grouping). */
  groupFlatRows?: Array<any> | null;
  /** 그룹 접기/펴기 콜백. / Group collapse/expand callback. */
  onGroupToggle?: ((key: string) => void) | undefined;
  /** 트리 노드 접기/펴기 콜백. / Tree-node collapse/expand callback. */
  onTreeToggle?: ((nodeId: any) => void) | undefined;
  /** opts 위에 병합할 추가 옵션(DnD 총행수 등). / Extra options merged over opts (e.g. DnD total rows). */
  extraOpts?: Record<string, any>;
  /** 셀 병합 엔진(있으면). / Cell-merge engine (if any). */
  mergeEngine?: MergeEngine | undefined;
  /** 마스터/디테일 렌더 배선(F2, 비활성 시 undefined). / Master/detail render wiring (F2; undefined when disabled). */
  detailApi?: DetailRenderContext | undefined;
  /** 이번에 그릴 컬럼 창(없으면 전 컬럼). / Column window to paint this time (absent = all columns). */
  columns?: IColumnWindow | undefined;
  /** 'diff' 이면 세로로 겹치는 행은 그대로 두고 들어온 행만 만들고 나간 행만 뗀다(없으면 통째). / 'diff' keeps overlapping rows and only adds/removes rows that enter/leave (absent = rebuild). */
  rowWork?: 'diff';
}

// ─── RendererCallbacks ────────────────────────────────────
/**
 * 렌더러가 상위(RenderController/OpenGrid)로 이벤트를 되돌리고 상태를 질의하는 콜백 묶음.
 * 매 렌더 최신값으로 채워진다.
 * / The callback bundle through which the renderer sends events back to and queries state from the
 * host (RenderController/OpenGrid). Filled with the latest values each render.
 * @internal
 */
export interface RendererCallbacks {
  onHeaderClick: (field: string, shiftKey: boolean) => void;
  onCellClick: (ri: number, ci: number, e: MouseEvent) => void;
  onCellDblClick: (ri: number, ci: number, e: MouseEvent) => void;
  onCellMouseOver: (ri: number, ci: number, e: MouseEvent) => void;
  onCellMouseOut: (ri: number, ci: number, e: MouseEvent) => void;
  onCellMouseDown: (ri: number, ci: number, e: MouseEvent) => void;
  onCellMouseUp: (ri: number, ci: number, e: MouseEvent) => void;
  onCellMouseMove: (ri: number, ci: number, e: MouseEvent) => void;
  onRowCheck: (ri: number, checked: boolean) => void;
  onAllCheck: (checked: boolean) => void;
  onColResize: (colIndex: number, newWidth: number) => void;
  onFilterIconClick: (field: string, anchorEl: HTMLElement) => void;
  getDndManager: () => RowDragDrop | null;
  onColDragStart: (colIndex: number) => void;
  onColDrop: (toIndex: number) => void;
  getColDragIdx: () => number | null;
  // override/strategy 활성 시 string, 미등록이면 null → 기존 경로 폴백
  // / string when override/strategy is active, null when unregistered → falls back to the default path
  getDisplayText?: (rowIndex: number, field: string) => string | null;
  // R11(§4.2): 렌더훅 레지스트리 진입점. 채널별(displayText/cellClass/ariaLabel …) 등록된 훅을
  // 게이트와 함께 해석한다(미등록/게이트닫힘 → null, 제로코스트). 하드코딩 분기 대신 데이터 구동.
  // / R11 (§4.2): entry point to the render-hook registry. Resolves per-channel (displayText/
  // cellClass/ariaLabel …) registered hooks together with their gate (unregistered/gate-closed →
  // null, zero-cost). Data-driven instead of hardcoded branching.
  resolveRenderHook?: (channel: string, rowIndex: number, field: string) => any;
  // R1b: 렌더러측 Number/Date 가 ctx.value 위에 적용할 per-instance displayFormatter 전략. 미설정 시 null → 기본 포맷.
  // / R1b: the per-instance displayFormatter strategy the renderer-side Number/Date applies over ctx.value. null when unset → default format.
  getDisplayFormatter?: () => ((value: any, field: string, row: any) => string | null) | null;
  // F3(§7.4/§7.5/§7.6, C7): 셀 수식 메타(마커/에러 툴팁/aria-label). 없으면 null.
  // / F3 (§7.4/§7.5/§7.6, C7): cell formula meta (marker/error tooltip/aria-label). null when none.
  getFormulaMeta?: (rowIndex: number, field: string) => { src: string; error: string | null; approx: boolean } | null;
  // i18n: 렌더 컨텍스트 로케일 해석기(OpenGrid 가 주입, 미주입 시 전역 t 폴백). 인스턴스 로케일 우선.
  // / i18n: the render-context locale resolver (injected by OpenGrid; falls back to global t when unset). Instance locale wins.
  t?: (key: string, params?: Record<string, string | number>) => string;
  // DD-05 S2c-1(CF): 조건부서식 셀 적용 훅. CF 미배선/미설정이면 미제공 또는 즉시 return → 셀 DOM 변화0(byte-identical).
  // 셀 내용 렌더 후 호출된다(데이터바/히트맵/아이콘셋/잉크/aria 텍스트 쌍둥이 적용). w/h 는 병합 반영 셀 크기.
  // / DD-05 S2c-1 (CF): conditional-format cell-apply hook. Unwired/unset → absent or early-return → zero cell-DOM change (byte-identical).
  // 일곱째 track: 막대를 만들면 (막대, 비율) 을 알려 폭 자리로 등록하게 한다(선택 — 안 주면 등록 없음).
  // / Seventh track: when a bar is built, report (bar, ratio) so it is registered as a width spot (optional — none means no registration).
  applyCF?: (cellEl: HTMLElement, rowIndex: number, field: string, value: unknown, cellW: number, cellH: number, track?: (bar: HTMLElement, ratio: number) => void) => void;
}

/**
 * F2(§4/§5, C6/C10): renderBody 가 detail head/filler 분기·expander 셀을 그릴 때 소비하는 배선
 * 콜백 묶음. 매 렌더 새로 만들어 넘긴다(옵션/상태는 항상 DetailManager 최신값). masterDetail.enabled
 * 가 아니면 undefined.
 * / F2 (§4/§5, C6/C10): the wiring-callback bundle renderBody consumes when drawing detail
 * head/filler branches and the expander cell. Rebuilt and passed each render (options/state are
 * always DetailManager's latest). undefined unless masterDetail.enabled.
 * @internal
 */
export interface DetailRenderContext {
  /** 토글 위치 모드(전용 컬럼 vs 첫 셀). / Toggle placement mode (dedicated column vs first cell). */
  toggleMode: 'expander-col' | 'first-cell';
  /** 디테일 패널 aria-label. / Detail-panel aria-label. */
  ariaLabel: string;
  /** 행 → rowId 해소. / Resolve a row to its rowId. */
  getRowId: (row: any) => string;
  /** rowId 가 펼쳐졌는가. / Whether the rowId is expanded. */
  isExpanded: (rowId: string) => boolean;
  /** 토글 클릭 처리. / Handle a toggle click. */
  onToggle: (rowIndex: number, rowId: string) => void;
  /** 확장 상태별 글리프·라벨·title. / Glyph/label/title per expanded state. */
  getGlyph: (expanded: boolean) => { glyph: string; ariaLabel: string; title: string };
  /** rowId 의 영속 패널 host 요소. / The persistent panel host element for a rowId. */
  getPanelHost: (rowId: string) => HTMLElement;
  /** renderBody 매 호출 시작(teardown 직전) — 편집중 host hoist + 나머지 detach(§5). / Start of each renderBody call (just before teardown) — hoist the editing host, detach the rest (§5). */
  onBeforeTeardown: () => void;
}

// ─── GridRenderer ─────────────────────────────────────────
/**
 * 그리드의 DOM 렌더러. 루트에 헤더·본문 래퍼를 마운트하고, 가상 스크롤 프레임마다 헤더/본문 셀을
 * 다시 그린다. 스타일 결정은 AppearanceResolver(R12a C10) 한 곳을 경유하고, host-isolation 을 위해
 * load-bearing 스타일은 인라인으로 쓴다. 상위 상태 접근·이벤트 반환은 전부 RendererCallbacks 경유.
 * / The grid's DOM renderer. Mounts the header and body wrapper into the root and repaints
 * header/body cells for each virtual-scroll frame. Style decisions route through the single
 * AppearanceResolver (R12a C10), and load-bearing styles are written inline for host isolation.
 * All host-state access and event return goes through RendererCallbacks.
 * @internal
 */
export class GridRenderer {
  private _root: HTMLElement;
  private _header: HTMLElement;
  private _bodyWrap: HTMLElement;
  private _body: HTMLElement;
  private _opts: RenderOptions;
  // 불변 조건: _cbs 는 생성 뒤 다른 객체로 갈아 끼우지 않는다(속성만 바꾼다). 머리글·본문 그리개와 너비 손잡이가
  // 생성 때 받은 이 같은 객체를 쥐고, 부를 때마다 그 속성을 읽는다.
  // / Invariant: _cbs is never replaced after construction (only its properties change). The header/body painters and
  // the width handles hold this same object from construction and read its properties at call time.
  private readonly _cbs: RendererCallbacks;
  // R12a(C10): 스타일 해결 단일 초크포인트. 인라인 격리는 유지하고 "무엇을 인라인할지" 결정만 경유.
  private _ap: AppearanceResolver;
  // rowIndex → {colIndex → cellEl} 맵
  private _cellMap: CellRegistry = new CellRegistry();
  // 머리글 너비 손잡이. 시작 폭 읽기(배치를 강제하는 DOM 읽기)는 그리는 길 파일 밖인 여기서 넘긴다.
  // / Header width handles. The start-width read (a layout-forcing DOM read) is supplied from here, outside the paint-path files.
  private _resize: ResizeHandleBinder;
  // 머리글 표를 그리는 객체 — renderHeader 는 여기에 맡긴다. / Header painter — renderHeader delegates here.
  private _headerView: HeaderView;
  // 본문을 그리는 객체 — renderBody 는 여기에 맡긴다. / Body painter — renderBody delegates here.
  private _bodyView: BodyView;
  // 본문 가로 위치를 따라가는 객체(머리글이 따라감). 뒤에 푸터·스크롤 입력 주인도 같은 객체를 받으므로 필드로 둔다.
  // / Follower of the body's horizontal position (the header follows). A field because the footer and the scroll-input owner will share it.
  private readonly _follower = new ScrollLeftFollower();
  // 기하 px 를 DOM 에 쓰는 객체 — 기하를 받을 때 만든다. / Geometry-to-DOM writer, created when the geometry arrives.
  private _applier: GeometryApplier | null = null;
  // 오른쪽 끝 여백(본문 세로 스크롤바 폭)과 그 값을 받을 푸터 쪽 입구. / End gutter (vertical scrollbar width) and the footer-side sink for it.
  private _gutter: ScrollbarGutter | null = null;
  private _gutterSink: ((px: number) => void) | null = null;

  /**
   * 본문 가로 위치를 따라가는 객체(읽기만). 푸터 막대처럼 본문과 같이 가로로 움직여야 하는 요소가 같은 객체에 붙는다.
   *
   * The follower of the body's horizontal position (read-only). Elements that must scroll with the body, such as the footer bar, attach to the same object.
   */
  get follower(): IScrollFollower { return this._follower; }

  /**
   * 기하 px 를 DOM 에 쓰는 객체(읽기만 — 기하를 받기 전엔 null). 스케줄러·푸터가 같은 객체로 폭 자리를 고친다.
   *
   * The geometry-to-DOM writer (read-only; null before the geometry arrives). The scheduler and the footer patch width spots through it.
   */
  get applier(): IGeometryApplier | null { return this._applier; }

  /**
   * 본문 그리개(읽기만). 스케줄러가 가로 창이 바뀐 프레임에 이것에 「창 옮김」을 시킨다.
   *
   * The body painter (read-only). The scheduler asks it to shift the column window in frames where the window changes.
   */
  get bodyView(): BodyView { return this._bodyView; }

  /**
   * 오른쪽 끝 여백 값을 받을 입구를 둔다(푸터 막대가 머리글과 같은 여백을 갖게). 이미 잰 값이 있으면 바로 한 번 넘긴다.
   *
   * Register the sink for the end-gutter value (so the footer bar gets the same gutter as the header); an already measured value is passed once right away.
   */
  onEndGutter(fn: (px: number) => void): void {
    this._gutterSink = fn;
    if (this._gutter?.px) fn(this._gutter.px);
  }

  /**
   * 너비 손잡이에 실시간 조절 포트(폭 쓰기·스케줄러·놓음 알림·기하)를 한 번 넘긴다. 넘긴 뒤로 끄는 동안 폭은 요청으로만 반영된다.
   *
   * Hand the width handles the live-resize ports (width writer, scheduler, release sink, geometry) once; afterwards drags reach the screen only through requests.
   *
   * @param ports - 실시간 조절 포트 / Live-resize ports
   */
  connectResize(ports: ResizeBinderPorts): void {
    this._resize.connect(ports);
  }

  /**
   * 놓은 폭을 렌더러 콜백(onColResize)으로 넘긴다 — 손잡이를 실시간 조절에 이은 뒤에도 놓기 한 번에 콜백 한 번이 지금처럼 불리게.
   *
   * Forward a released width to the renderer callback (onColResize), so the callback still fires once per release after live resize is wired.
   */
  commitColumnResize(ci: number, width: number): void {
    this._cbs.onColResize(ci, width);
  }

  /** 본문 스크롤 래퍼 요소(스크롤/뷰포트 계산 접근용). / The body scroll-wrapper element (for scroll/viewport calculations). */
  get bodyWrapper() { return this._bodyWrap; }

  /** i18n: 렌더 로케일 해석기 — cbs.t(인스턴스 로케일) 우선, 미주입 시 전역 t. / i18n: cbs.t (instance locale) first, global t otherwise. */
  private _t(key: string, params?: Record<string, string | number>): string {
    return this._cbs.t ? this._cbs.t(key, params) : _globalT(key, params);
  }

  /**
   * 루트에 헤더·본문 래퍼를 마운트하고 헤더-본문 가로 스크롤을 동기화한다.
   * / Mount the header and body wrapper into the root and sync header–body horizontal scroll.
   *
   * @param root - 렌더러가 채울 컨테이너 요소 / Container element the renderer fills
   * @param opts - 렌더 옵션(기본값 병합 완료) / Render options (defaults already merged)
   * @param cbs - 이벤트/상태 콜백 묶음 / Event/state callback bundle
   * @param appearance - 스타일 결정 resolver(미주입 시 테마 컨텍스트로 생성) / Style-decision resolver (created from the theme context if not injected)
   */
  constructor(root: HTMLElement, opts: RenderOptions, cbs: RendererCallbacks, appearance?: AppearanceResolver) {
    this._root = root;
    this._opts = opts;
    this._cbs = cbs;
    this._resize = new ResizeHandleBinder(
      (th) => th.offsetWidth,
      (leafIdx, w) => cbs.onColResize(leafIdx, w),
    );
    // 컴포지션 루트(OpenGrid)가 주입. 직접 생성(테스트 등) 시 테마 컨텍스트로 기본 resolver.
    this._ap = appearance ?? new AppearanceResolver(new ThemeContext(opts.theme ?? 'default'));

    this._header = _el('div', 'og-header');
    // host isolation: border:0 로 4변 폭을 먼저 0 으로 못박는다. WordPress 전역 스타일
    //   `:where([style*="border-color"]){border-style:solid}` 이 인라인의 var(--og-border-color)
    //   문자열에 매칭되어, 폭 미지정 변에 medium(3px) 기본 보더를 강제하는 것을 차단(헤더 좌/우/상 굵은선 방지).
    this._header.style.cssText = `flex-shrink:0;overflow-x:auto;overflow-y:hidden;border:0;border-bottom:${this._ap.divider()};scrollbar-width:none;`;
    this._headerView = new HeaderView(this._header, this._ap, this._cbs, this._resize, (k, p) => this._t(k, p));

    this._bodyWrap = _el('div', 'og-body-wrapper');
    this._bodyWrap.style.cssText = `flex:1;overflow:auto;position:relative;`;
    this._bodyWrap.style.setProperty('--scrollbar-size', '8px');

    this._body = _el('div', 'og-body');
    this._body.style.cssText = `position:relative;`;
    this._bodyWrap.appendChild(this._body);
    this._bodyView = new BodyView(this._body, this._ap, this._cbs, this._cellMap, (k, p) => this._t(k, p));

    root.appendChild(this._header);
    root.appendChild(this._bodyWrap);

    // 헤더 가로 스크롤 동기화 — 본문 가로 위치를 머리글이 따라가게 따라가기 객체에 맡긴다.
    // / Header horizontal scroll sync — delegated to the follower so the header tracks the body's horizontal position.
    this._follower.follow(this._header);
    this._follower.listenTo(this._bodyWrap);
    // 본문 세로 스크롤바 폭만큼 머리글(과 푸터) 오른쪽 끝에 여백을 둔다 — 가로로 끝까지 긁어도 세 줄 끝이 맞게. 폭은 크기 관찰 때만 잰다.
    // / Add the body's vertical scrollbar width as an end gutter to the header (and footer), so all three line up at full horizontal scroll. Measured only on resize observation.
    this._gutter = new ScrollbarGutter(this._bodyWrap, this._header, (px) => { this._headerView.setEndGutter(px); this._gutterSink?.(px); });
  }

  /**
   * 본문 래퍼 높이를 전체 높이에서 헤더 높이를 뺀 값으로 설정한다.
   * / Set the body wrapper's height to the total height minus the header height.
   *
   * @param totalHeight - 그리드 전체 높이(px) / Total grid height (px)
   * @param headerHeight - 헤더 높이(px) / Header height (px)
   */
  updateSize(totalHeight: number, headerHeight: number): void {
    this._bodyWrap.style.height = `${totalHeight - headerHeight}px`;
  }

  /**
   * 머리글의 정렬 표시만 고치는 객체를 머리글 그리개에 넘긴다(그리드마다 하나). 첫 머리글을 그리기 전에 한 번.
   *
   * Hand the header painter the object that patches only sort marks (one per grid). Once, before the first header paint.
   *
   * @param sort - 정렬 표시 객체 / The sort-indicator object
   */
  setSortIndicator(sort: IHeaderSortIndicator): void {
    this._headerView.setSortIndicator(sort);
  }

  /**
   * 머리글·본문 그리개에 컬럼 기하를 넘긴다(그리드마다 하나 — 폭·왼쪽 위치·전체 폭은 여기에 묻는다). 마운트 때 한 번.
   * / Hand the header/body painters the column geometry (one per grid — they ask it for width, left and total). Once at mount.
   *
   * @param geometry - 컬럼 기하 / The column geometry
   */
  setGeometry(geometry: IColumnGeometry): void {
    this._headerView.setGeometry(geometry);
    this._bodyView.setGeometry(geometry);
    // 기하 px 를 DOM 에 쓰는 객체도 같은 기하·칸 지도로 만들어 두 그리개에 넘긴다(지금은 폭 자리를 등록만 한다).
    // / Build the geometry-to-DOM writer over the same geometry and cell map and hand it to both painters (for now they only register width spots).
    this._applier = new GeometryApplier(geometry, this._cellMap);
    this._headerView.setApplier(this._applier);
    this._bodyView.setApplier(this._applier);
  }

  /**
   * 현재 렌더된 헤더 영역의 실제 높이(px). 헤더 줄바꿈으로 늘어난 높이를 레이아웃에 반영할 때 사용.
   * / The actual height (px) of the currently rendered header. Used to reflect height grown by
   * header wrapping back into layout.
   *
   * @returns 헤더 offsetHeight(px) / The header offsetHeight (px)
   */
  getHeaderHeight(): number {
    return this._headerView.height();
  }

  /**
   * 헤더 영역을 다시 그린다 — 다단 헤더 행·정렬/필터 아이콘·리사이저·컬럼 재정렬·고정 컬럼
   * 오프셋을 반영한다. 매 호출 헤더 innerHTML 을 재구성한다.
   * / Repaint the header — reflecting multi-row headers, sort/filter icons, resizers, column
   * reordering, and frozen-column offsets. Rebuilds the header innerHTML each call.
   *
   * @param headerRows - 다단 헤더 셀 행렬 / Multi-row header cell matrix
   * @param leaves - 리프 컬럼 정의 / Leaf column definitions
   * @param widths - 리프 컬럼 너비(px) / Leaf column widths (px)
   * @param sortList - 활성 정렬 항목 / Active sort items
   * @param opts - 렌더 옵션(고정 컬럼 수·필터 등) / Render options (frozen count, filters, …)
   */
  renderHeader(
    headerRows: any[][],
    leaves: ColumnDef[],
    widths: readonly number[],
    sortList: SortItem[],
    opts: RenderOptions
  ): void {
    this._headerView.paint(headerRows, leaves, widths, sortList, opts);
  }

  /**
   * 본문 가시 구간을 다시 그린다 — 그룹/트리 행·상태/선택 배경·고정 컬럼·셀 병합·마스터/디테일
   * 패널·수식 메타를 반영하고, rowIndex→colIndex→cellEl 맵을 재구성한다(getCellEl 근거).
   * / Repaint the visible body range — reflecting group/tree rows, state/selection backgrounds,
   * frozen columns, cell merges, master/detail panels, and formula meta, and rebuilding the
   * rowIndex→colIndex→cellEl map (the basis for getCellEl).
   *
   * @param frame - 렌더 프레임(구간·데이터·컬럼·상태·배선) / The render frame (range, data, columns, state, wiring)
   */
  renderBody(frame: RenderFrame): void {
    this._bodyView.rebuildWindow(frame);
  }

  /**
   * 마지막 renderBody 가 만든 셀 요소를 조회한다(맵 미스면 undefined — 가시 구간 밖이거나 병합 은닉).
   * / Look up a cell element from the last renderBody (undefined on map miss — outside the visible
   * range or hidden by a merge).
   *
   * @param rowIndex - flat 행 인덱스 / Flat row index
   * @param colIndex - 리프 컬럼 인덱스 / Leaf column index
   * @returns 셀 요소 또는 undefined / The cell element, or undefined
   */
  getCellEl(rowIndex: number, colIndex: number): HTMLElement | undefined {
    return this._cellMap.get(rowIndex, colIndex);
  }

  /**
   * 렌더러가 마운트한 DOM 을 전부 제거해 루트를 비운다.
   * / Remove all DOM the renderer mounted, emptying the root.
   */
  destroy(): void {
    // 본문 상자의 scroll 듣개를 떼어, 지운 그리드를 닫힘이 붙들지 않게 한다.
    //
    // Detach the body box's scroll listener so closures no longer hold the destroyed grid.
    this._follower.destroy();
    this._gutter?.destroy();
    // 머리글 th 의 듣개도 풀어, 지운 뒤 머리글 콜백이 불리지 않게 한다. / Release header listeners so no header callback fires after destroy.
    this._headerView.destroy();
    // 본문 위임 듣개도 뗀다. / Detach the body delegation listeners too.
    this._bodyView.destroy();
    this._root.innerHTML = '';
  }
}

// ─── 디테일 펼침 단추 ─────────────────────────────────────
/**
 * 디테일 펼침 단추(F2 §4.5) 하나를 만든다. 기존 시험이 이 파일의 글자에서 단추의 시각 크기(min-width/min-height)를
 * 읽어 터치 히트 영역을 확인하므로, 본문 그리기를 옮긴 뒤에도 단추를 만드는 줄은 이 파일에 둔다.
 * / Build one detail expander button (F2 §4.5). An existing test reads the button's visual size from this file's text
 * to check the touch hit area, so the lines that build it stay in this file after body painting moved out.
 * @internal
 */
export function _detailExpanderButton(
  glyphInfo: { glyph: string; ariaLabel: string; title: string },
  rid: string, ri: number, detailApi: DetailRenderContext,
): HTMLElement {
  const btn = _el('span', 'og-detail-expander');
  btn.textContent = glyphInfo.glyph;
  btn.title = glyphInfo.title;
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', glyphInfo.ariaLabel);
  if (rid) btn.setAttribute('aria-controls', `og-detail-${rid}`);
  btn.style.cssText = 'cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:22px;min-height:22px;user-select:none;line-height:1;';
  const localRid = rid, localRi = ri;
  const doToggle = (e: Event) => { e.stopPropagation(); if (localRid) detailApi.onToggle(localRi, localRid); };
  btn.addEventListener('click', doToggle);
  btn.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(e); }
  });
  return btn;
}

// ─── DOM 유틸 ─────────────────────────────────────────────
// _el·_style 의 몸통은 render/dom.ts(잎 모듈). 기존 import 경로를 지키려고 여기서 다시 내보낸다.
// / _el·_style live in render/dom.ts (a leaf module); re-exported here to keep existing import paths.
export { _el, _style };

/**
 * 문자열 내용을 파일로 다운로드시킨다(Blob URL 생성 후 즉시 해제).
 * / Trigger a file download of string content (creates then immediately revokes a Blob URL).
 * @internal
 */
export function _downloadText(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
