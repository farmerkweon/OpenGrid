import type { GridRenderer, DetailRenderContext } from './GridRenderer.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { Pagination } from './Pagination.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { DataLayer } from './DataLayer.js';
import type { FlatRowModel } from './FlatRowModel.js';
import type { MergeEngine } from './MergeEngine.js';
import type { SortFilterManager } from './SortFilterManager.js';
import type { RowManager } from './RowManager.js';
import type { CellEditManager } from './CellEditManager.js';
import type { GroupTreeManager } from './GroupTreeManager.js';
import type { DetailManager } from './DetailManager.js';
import type { RangeSelectionManager } from './RangeSelectionManager.js';
import type { GridOptions, CellRange } from './types.js';
import { ExtraColumns } from './coordinate/ExtraColumns.js';
import { ColumnGeometry } from './coordinate/ColumnGeometry.js';
import type { IColumnGeometry, GeometryChange, IColumnWindow, GridShape } from './coordinate/geometryPorts.js';
import { ColumnWindowPolicy } from './coordinate/ColumnWindowPolicy.js';
import { ScrollObserver } from './render/ScrollObserver.js';
import { HorizontalReveal } from './render/HorizontalReveal.js';
import { RangeRectCalculator } from './coordinate/RangeRectCalculator.js';
import { leafColIndex } from './coordinate/types.js';
import { RenderRequest } from './domain/render/RenderRequest.js';
import { Change, type IRenderRequest } from './domain/render/ports.js';

/**
 * R5(§3.1 C4, §6-R5): 렌더 루프의 유일 진입점. `OpenGrid` God object 에서
 * `_onResize`/`_recalcWidths`/`_renderHeader`/`_syncHeaderLayout`/`_doRender`/`_visRange`
 * (+ 전용 헬퍼 `_paginationHeight`)를 **동작 불변**으로 옮긴 것.
 *
 * 스트랭글러 원칙(A2): 협력자(GridRenderer/VirtualScroll/Pagination 등)는 여전히
 * `OpenGrid._mount` 가 생성·소유하며, 여기에는 `*Deps` 클로저 역전 패턴으로 **주입**만 된다.
 * 값(컬럼폭·옵션 등)은 늦은-null / 재할당(worksheet 전환 시 colLayout 교체)을 견디도록
 * 전부 getter 클로저로 읽는다. `fallbackViewportHeight` 클램프 시맨틱과 RenderFrame 구성은
 * 원본과 1:1 동일하다(회귀 0).
 * / Dependency contract for the sole entry point of the render loop (R5, §3.1 C4, §6-R5),
 * moving `_onResize`/`_recalcWidths`/`_renderHeader`/`_syncHeaderLayout`/`_doRender`/`_visRange`
 * (plus the private helper `_paginationHeight`) out of the `OpenGrid` God object
 * with **behavior unchanged**.
 *
 * Strangler principle (A2): collaborators (GridRenderer/VirtualScroll/Pagination, etc.) are
 * still created and owned by `OpenGrid._mount`; they are only **injected** here via the
 * `*Deps` closure-inversion pattern. Values (column widths, options, etc.) are all read
 * through getter closures so they tolerate late-null / reassignment (colLayout swap on
 * worksheet switch). The `fallbackViewportHeight` clamp semantics and RenderFrame construction
 * are 1:1 identical to the original (zero regression).
 */
export interface RenderControllerDeps<T extends Record<string, any> = any> {
  getContainer: () => HTMLElement;
  getOptions: () => Required<GridOptions<T>>;
  getRenderer: () => GridRenderer | null;
  getVs: () => VirtualScroll | null;
  getPagination: () => Pagination | null;
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getFlatModel: () => FlatRowModel;
  getMergeEngine: () => MergeEngine;
  getColWidths: () => number[];
  setColWidths: (widths: number[]) => void;
  /** 사용자가 직접 조절한 컬럼폭(리사이즈 시 보존 대상). / User-resized column widths (preserved across recalcWidths). */
  getUserWidths: () => Map<string, number>;
  getSfMgr: () => SortFilterManager<T>;
  getRowMgr: () => RowManager<T>;
  getEditMgr: () => CellEditManager<T>;
  getGrpMgr: () => GroupTreeManager<T>;
  getDetailMgr: () => DetailManager<T>;
  getRangeMgr: () => RangeSelectionManager<T>;
  /** F2: detail 렌더 컨텍스트 조립(비활성 시 undefined). / F2: build the detail render context (undefined when inactive). */
  buildDetailRenderContext: () => DetailRenderContext | undefined;
  /**
   * 그리기 요청을 낸다(그리드의 요청 입구로). 크기 바뀜 뒤 본문 그리기도 이 입구를 지나 다른 요청과 같은 길로 센다.
   *
   * Submit a render request to the grid's single entry, so the body repaint after a resize takes the same path as every other request.
   */
  submitRender: (req: IRenderRequest) => void;
}

/**
 * 렌더 루프의 유일 진입점. / Sole entry point of the render loop.
 *
 * 리사이즈·헤더/본문 렌더·뷰포트 높이 동기화·가시 범위 계산을 담당한다(R5).
 * / Handles resize, header/body rendering, viewport-height sync, and visible-range
 * computation (R5).
 */
export class RenderController<T extends Record<string, any> = any> {
  private _deps: RenderControllerDeps<T>;
  private _autoHeightWarned = false;
  // 마지막으로 머리글 높이를 맞출 때 잰 값(처음엔 모름). / Header height measured at the last fit (unknown at first).
  private _headerMeasured = -1;
  // 컬럼 기하(폭·왼쪽 위치·전체 폭) — 그리드마다 하나. 그리는 쪽은 이것에 묻는다.
  // / Column geometry (width, left, total) — one per grid; painters ask it.
  private readonly _geometry = new ColumnGeometry([], ExtraColumns.fromOptions(null), 0);
  // 가로 창 정책(같은 기하에 묻는다)과 본문 상자의 스크롤 관찰자 — 그리드마다 하나. / Column-window policy and body scroll observer — one per grid.
  private readonly _windowPolicy = new ColumnWindowPolicy(this._geometry, ColumnWindowPolicy.defaultRules());
  private _scroll: ScrollObserver | null = null;
  // 「이 컬럼이 보이게」 가로 이동과 범위 테두리 좌표 — 둘 다 같은 기하에 묻는다. / Horizontal reveal and range-rect math, both over the same geometry.
  private _reveal: HorizontalReveal | null = null;
  private readonly _rangeRects = new RangeRectCalculator(this._geometry);

  /** 가로 창 정책. / The column-window policy. */
  get windowPolicy(): ColumnWindowPolicy {
    return this._windowPolicy;
  }

  /** 본문 상자의 스크롤 관찰자(렌더러가 없으면 null). / The body box scroll observer (null without a renderer). */
  get scroll(): ScrollObserver | null {
    return this._scroll;
  }

  /**
   * 가로 창 규칙이 묻는 이 그리드의 모양 — 자동 높이·보이는 폭·병합 유무·사용자 옵션.
   *
   * The grid shape the column-window rules ask about — auto height, visible width, merges, user option.
   */
  shape(): GridShape {
    const options = this._deps.getOptions();
    return {
      autoHeight: options.autoHeight === true,
      viewportWidth: this._scroll?.box.width ?? 0,
      mergeEmpty: this._deps.getMergeEngine().isEmpty,
      virtualColumns: options.virtualColumns !== false,
    };
  }

  /**
   * 컬럼 ci 가 보이게 가로로 옮긴다(이미 보이거나 보이는 폭을 모르면 그대로). 기하에 묻고 스크롤 관찰자로만 옮긴다 — DOM 읽기 없음.
   *
   * Scroll horizontally so column ci is visible (no-op when already visible or the width is unknown). Asks the geometry and
   * moves only through the scroll observer — no DOM reads.
   */
  revealColumn(ci: number): void {
    const scroll = this._scroll;
    if (scroll === null || ci < 0 || ci >= this._geometry.count) return;
    (this._reveal ??= new HorizontalReveal(scroll, this._geometry)).reveal(ci);
  }

  /**
   * 범위 선택 테두리 사각형을 칸 요소 없이 기하와 행 번호로 셈한다(본문 상자 보이는 왼쪽 위 기준). 보이는 상자를 모르면 null.
   *
   * The range-selection border rectangle from geometry and row numbers, without cell elements (relative to the body box's
   * visible top-left). Null when the visible box is unknown.
   */
  rangeRect(range: CellRange): { left: number; top: number; width: number; height: number } | null {
    const scroll = this._scroll;
    const g = this._geometry;
    if (scroll === null || range.endCol >= g.count || range.startCol < 0) return null;
    return this._rangeRects.rect(
      { startRow: range.startRow, endRow: range.endRow, startCol: leafColIndex(range.startCol), endCol: leafColIndex(range.endCol) },
      { top: scroll.scrollTop, left: scroll.box.scrollLeft },
      this._deps.getOptions().rowHeight,
      0,
    );
  }

  /** 스크롤 관찰자를 놓는다(그리드를 없앨 때). / Release the scroll observer (on grid destroy). */
  destroy(): void {
    this._scroll?.destroy();
    this._scroll = null;
  }

  /** 그리는 쪽(머리글·본문·푸터)이 묻는 컬럼 기하. / The column geometry painters (header/body/footer) ask. */
  get geometry(): IColumnGeometry {
    return this._geometry;
  }

  /**
   * 지금 입력에 맞춘 컬럼 기하(읽기 포트). 그리는 쪽(푸터 등)이 그릴 때마다 이것을 부른다 — 조립하는 쪽이 맞추는 일을 직접 부르지 않게.
   *
   * The column geometry aligned to current inputs (read port). Painters such as the footer call this each paint, so the composer never calls the alignment itself.
   */
  currentGeometry(): IColumnGeometry {
    return this.syncGeometry();
  }

  /**
   * 기하를 지금 입력에 맞추고 돌려준다 — 폭 계산 결과(빈 자리는 기본 폭, 그리는 쪽이 쓰던 값과 같음)·여분 컬럼 옵션·고정 수.
   * 값이 같으면 판을 올리지 않는다. 머리글·본문을 그리기 직전과 푸터가 기하를 물을 때 불린다.
   *
   * Align the geometry to the current inputs — computed widths (gaps filled with the default width, as painters did),
   * extra-column options and the frozen count — and return it. Same values keep the version. Called right before
   * header/body painting and when the footer asks for the geometry.
   */
  /**
   * 지금 옵션의 여분 컬럼(상태·끌기·행번호·체크·디테일 펼침 칸). 폭 배분과 기하가 같은 값을 쓰게 한 곳에서 만든다 — 디테일 펼침 칸은
   * 디테일이 켜져 있고 토글 방식이 펼침 칸일 때만.
   *
   * Extra columns for the current options (state, drag, row number, check, detail expander). Built in one place so width
   * allocation and the geometry use the same value — the detail expander only when detail is on with the expander-column toggle.
   */
  private _extraColumns(): ExtraColumns {
    const options = this._deps.getOptions();
    const md = options.masterDetail;
    return ExtraColumns.fromOptions({
      stateColumn: options.stateColumn,
      draggable: options.draggable,
      rowNumber: options.rowNumber,
      checkColumn: options.checkColumn,
      detailExpanderCol: !!md?.enabled && (md?.toggle ?? 'expander-col') === 'expander-col',
    });
  }

  syncGeometry(): ColumnGeometry {
    const options = this._deps.getOptions();
    const colLayout = this._deps.getColLayout();
    const raw = this._deps.getColWidths();
    const dflt = options.defaultColumnWidth;
    this._geometry.reset(
      colLayout.visibleLeaves.map((_, i) => raw[i] ?? dflt),
      this._extraColumns(),
      colLayout.frozenCount,
    );
    return this._geometry;
  }

  constructor(deps: RenderControllerDeps<T>) {
    this._deps = deps;
    // 그리는 쪽이 같은 컬럼 기하에 묻게 한 번 넘긴다(렌더러는 이 객체보다 먼저 만들어진다).
    // / Hand the painters the one column geometry, once (the renderer is created before this object).
    // 렌더러 대역(높이 판정만 보는 것 등)에는 이 메서드가 없을 수 있어 있을 때만 부른다. / Stand-ins may lack it, so call only if present.
    deps.getRenderer()?.setGeometry?.(this._geometry);
    // 스크롤 관찰자는 본문 상자를 듣고 요청 입구로 낸다(렌더러 대역에는 상자가 없을 수 있어 있을 때만).
    // / The scroll observer listens to the body box and submits to the request entry (only when a real box exists).
    const box = deps.getRenderer()?.bodyWrapper;
    if (box) this._scroll = new ScrollObserver(box, { submit: (req) => deps.submitRender(req) });
  }

  /** @internal */
  private _paginationHeight(): number {
    return this._deps.getOptions().pagination ? 38 : 0;
  }

  /**
   * 컨테이너 리사이즈에 반응해 폭 재계산 → 헤더 재렌더 → 본문 재렌더를 수행한다.
   * / Responds to a container resize: recalculates widths, re-renders the header, then
   * re-renders the body.
   */
  onResize(): void {
    const { width } = this._deps.getContainer().getBoundingClientRect();
    if (!width) return;
    this.recalcWidths(width);
    // renderHeader() 가 헤더를 그린 뒤 실제 헤더 높이를 측정해 본문/뷰포트 높이를 동기화한다
    // (headerWrap/'\n' 로 헤더가 늘어나도 본문 영역이 침범당하지 않도록).
    this.renderHeader();
    this.syncViewportWidth();
    this._deps.submitRender(RenderRequest.REPAINT_VISIBLE);
  }

  /**
   * 본문 상자의 보이는 폭을 스크롤 관찰자에 넘긴다(가로 창·보이게 옮기기의 원천 — 같은 값이면 아무 일 없음).
   * 크기가 바뀔 때와 세로 스크롤바가 생기거나 없어질 때 부른다.
   *
   * Hand the body box's visible width to the scroll observer (source of the column window and of reveal; no-op when unchanged).
   * Called on resize and when the vertical scrollbar appears or disappears.
   */
  syncViewportWidth(): void {
    const box = this._deps.getRenderer()?.bodyWrapper;
    if (box) this._scroll?.setWidth(box.clientWidth);
  }

  /**
   * 전체 폭에서 고정 UI 요소(state/드래그/행번호/체크 컬럼)를 뺀 뒤 컬럼폭을 재계산한다.
   * 사용자가 직접 조절한 폭은 보존한다.
   * / Recalculate column widths from the total width minus fixed UI elements (state/drag/
   * row-number/check columns). User-resized widths are preserved.
   *
   * @param totalWidth - 컨테이너 전체 폭(px) / Total container width in px
   */
  recalcWidths(totalWidth: number): void {
    const colLayout = this._deps.getColLayout();
    const options = this._deps.getOptions();
    // 여분 컬럼 폭은 기하와 같은 여분 컬럼 값에 묻는다(디테일 펼침 칸 포함) — 머리글·본문·푸터와 같은 폭을 빼야 가로로 넘치지 않는다.
    // / Ask the same extra-columns value as the geometry (detail expander included) — subtracting the width header, body and footer use avoids horizontal overflow.
    const widths = colLayout.computeWidths(
      totalWidth - this._extraColumns().width(),
      options.defaultColumnWidth
    );
    // 사용자가 직접 조절한 폭은 보존 (리사이즈 후 재계산으로 원복되는 문제 방지)
    const userWidths = this._deps.getUserWidths();
    if (userWidths.size) {
      colLayout.visibleLeaves.forEach((leaf, i) => {
        const w = userWidths.get(leaf.field);
        if (w != null) widths[i] = w;
      });
    }
    this._deps.setColWidths(widths);
  }

  /**
   * 너비 조절을 놓은 뒤(렌더러 콜백 onColResize 를 거쳐 옴): 사용자 폭으로 기억한다(필드 이름 열쇠 — 다음 폭 재계산에서도 남게).
   * 놓기 길에서는 손잡이가 이미 같은 폭을 쓰고 그리기 요청을 냈으므로 여기서는 기억만 한다. 폭이 지금과 다를 때(손잡이를 잇기 전
   * 길이나 직접 부름)만 폭을 쓰고 폭 자리 고치기를 요청한다 — 머리글·본문을 다시 만들지 않는다.
   *
   * After a width-resize release (arriving through the renderer callback onColResize): remember it as a user width (keyed by
   * field, so recalculation keeps it). On the release path the handle has already written the same width and submitted the
   * repaint request, so this only remembers. Only when the width differs (the pre-wiring path or a direct call) does it write
   * the width and request a width-spot patch — header and body are never rebuilt.
   *
   * @param colIndex - 표시 잎 컬럼 번호 / Visible leaf column index
   * @param newWidth - 새 폭(px) / New width (px)
   */
  commitColumnWidth(colIndex: number, newWidth: number): void {
    const g = this.syncGeometry();
    if (colIndex < g.count && g.widthOf(leafColIndex(colIndex)) !== Math.round(newWidth)) {
      this.setUserWidth(colIndex, newWidth);
      this._deps.submitRender(RenderRequest.of(Change.ColWidth, { sync: true, widthChangedFrom: colIndex }));
    }
    // 사용자가 조절한 폭을 field 기준으로 기억 → 이후 재계산(_recalcWidths)에서 보존
    const leaf = this._deps.getColLayout().visibleLeaves[colIndex];
    if (leaf) this._deps.getUserWidths().set(leaf.field, Math.round(newWidth));
  }

  /**
   * 폭 입력의 주인이 컬럼 하나의 폭을 바꾼다: 정수로 만든 뒤 계산 결과 배열(자리가 있을 때만)과 기하에 같은 값을 쓰고 기하의 바뀐 몫을 돌려준다.
   * 너비 조절이 폭을 바꾸는 유일한 길 — 기하에 직접 쓰는 곳은 이것과 syncGeometry 의 reset 둘뿐이라, 다음 맞춤이 끈 폭을 덮지 않는다.
   *
   * The width owner changes one column: round to an integer, write the same value to the computed-width array (if the slot
   * exists) and the geometry, and return the geometry change. The only way resizing changes a width — the geometry is written
   * only here and in syncGeometry's reset, so the next alignment never overwrites a dragged width.
   *
   * @param ci - 표시 잎 컬럼 번호 / Visible leaf column index
   * @param width - 새 폭(px) / New width (px)
   * @returns 기하의 바뀐 몫 / The geometry change
   */
  setUserWidth(ci: number, width: number): GeometryChange {
    const w = Math.round(width);
    const raw = this._deps.getColWidths();
    if (raw[ci] === undefined) {
      // 계산 결과 배열이 아직 비었으면(컨테이너 폭 0 으로 폭 계산이 안 돈 그리드) 잎 수만큼 기본 폭으로 채운다 —
      // 그래야 다음 맞춤이 끈 폭을 기본 폭으로 덮지 않는다.
      // / If the computed array is still empty (width never computed because the container had no width), fill it with the
      // default width for every leaf, so the next alignment does not overwrite the dragged width.
      const dflt = this._deps.getOptions().defaultColumnWidth;
      const n = this._deps.getColLayout().visibleLeaves.length;
      for (let i = 0; i < n; i++) if (raw[i] === undefined) raw[i] = dflt;
    }
    if (raw[ci] !== undefined) raw[ci] = w;
    this.syncGeometry();
    return this._geometry.resize(leafColIndex(ci), w);
  }

  /**
   * 줄바꿈 머리글이 하나라도 있나(머리글 높이를 다시 재야 하는지). 「줄바꿈 켬」 또는 제목에 줄바꿈 문자가 있는 표시 잎.
   *
   * Whether any visible leaf header wraps (headerWrap on, or a newline in its title) — i.e. whether the header height must be re-measured.
   */
  hasWrappedHeader(): boolean {
    return this._deps.getColLayout().visibleLeaves.some((c) => {
      const text = c.header ?? c.field;
      return c.headerWrap === true || (typeof text === 'string' && text.indexOf('\n') >= 0);
    });
  }

  /**
   * 헤더(컬럼 제목 행)를 다시 그린다. / Re-render the header (column title row).
   */
  renderHeader(): void {
    const renderer = this._deps.getRenderer();
    const colLayout = this._deps.getColLayout();
    const sfMgr = this._deps.getSfMgr();
    const options = this._deps.getOptions();
    renderer?.renderHeader(
      colLayout.buildHeaderCells(),
      colLayout.visibleLeaves,
      this.syncGeometry().widths(),
      sfMgr.sortList,
      { ...options, _activeFilters: sfMgr.filters, _frozenCount: colLayout.frozenCount }
    );
    // 헤더 줄바꿈(headerWrap/'\n')으로 헤더가 늘어나면 본문 영역 높이를 다시 맞춰 침범을 막는다.
    this.syncHeaderLayout();
  }

  /**
   * 렌더된 헤더의 실제 높이를 측정해 본문(bodyWrap) 높이와 뷰포트 높이에 반영한다.
   * 줄바꿈이 없는 헤더는 측정 높이가 headerHeight 이하라 기존 고정 동작과 동일하다.
   * (public: OpenGrid 가 `_syncHeaderLayout` 위임으로 노출 — 특성화 테스트가 직접 호출한다.)
   * / Measures the rendered header's actual height and applies it to the body (bodyWrap)
   * height and viewport height. Headers without wrapping measure at or below `headerHeight`,
   * so existing fixed-height behavior is unchanged. (Public: `OpenGrid` exposes this via a
   * `_syncHeaderLayout` delegate — characterization tests call it directly.)
   */
  /**
   * 머리글 높이를 한 번 재어, 마지막으로 맞춘 높이와 다를 때만 본문 높이를 다시 맞춘다(줄바꿈 머리글을 끄는 프레임마다 불림).
   * 「달라졌나」의 기준은 여기 하나 — 머리글을 다른 길로 다시 그려도 그 길의 맞춤이 기준을 함께 고친다.
   *
   * Measure the header height once and re-fit the body only when it differs from the last fitted height (called on each
   * resize frame with wrapped headers). The single baseline lives here, so re-painting the header elsewhere also refreshes it.
   */
  relayoutHeaderIfChanged(): void {
    const renderer = this._deps.getRenderer();
    if (renderer && renderer.getHeaderHeight() !== this._headerMeasured) this.syncHeaderLayout();
  }

  syncHeaderLayout(): void {
    const renderer = this._deps.getRenderer();
    const vs = this._deps.getVs();
    if (!renderer || !vs) return;
    const options = this._deps.getOptions();
    const { height } = this._deps.getContainer().getBoundingClientRect();
    if (!height) return;
    const measured = renderer.getHeaderHeight();
    this._headerMeasured = measured;
    const headerH = measured > options.headerHeight ? measured : options.headerHeight;
    renderer.updateSize(height - this._paginationHeight(), headerH);
    let vpHeight = height - headerH - this._paginationHeight();
    // 옵트인 뷰포트 안전장치(fallbackViewportHeight). 기본 undefined = OFF = 이 아래 로직 건너뜀 → 기존 동작 불변.
    // "언바운드" 감지: 윈도잉 뷰포트 높이가 전체 콘텐츠 높이(totalRows×rowHeight) 이상이면
    // 컨테이너가 오버플로 스크롤 제약 없이 전 콘텐츠를 다 보여주는 상태다(=확정 높이 부재로 스페이서에
    // 맞춰 부푼 폭주 경로). 이때만 뷰포트 높이를 폴백값으로 클램프해 ResizeObserver 되먹임 루프를 끊는다.
    // 바운드 컨테이너(측정<전체)는 조건에 걸리지 않아 무영향(회귀 0). 클램프 후 재측정에서도 스페이서·
    // 컨테이너 크기는 그대로지만 렌더 행 수가 폴백 기준으로 고정되어 루프가 더는 부풀지 않고 수렴한다.
    const fallback = options.fallbackViewportHeight;
    if (fallback && fallback > 0) {
      const totalContentHeight = vs.getTotalHeight();
      if (vpHeight >= totalContentHeight && vpHeight > fallback) {
        vpHeight = fallback;
      }
    }
    vs.setViewportHeight(vpHeight);
  }

  /**
   * 지정 범위의 본문 행을 렌더한다(autoHeight 활성 시 범위 인자를 무시하고 전체 행을 렌더).
   * / Render body rows within the given range (when autoHeight is active, the range
   * arguments are ignored and all rows are rendered).
   *
   * @param startIndex - 렌더 시작 flat index / Starting flat index to render
   * @param endIndex - 렌더 끝 flat index / Ending flat index to render
   */
  doRender(startIndex: number, endIndex: number, columns?: IColumnWindow, rowWork?: 'diff'): void {
    const renderer = this._deps.getRenderer();
    const vs = this._deps.getVs();
    if (!renderer || !vs) return;
    const options = this._deps.getOptions();
    const range = vs.getVisibleRange();
    // autoHeight(비가상): 행을 플로우로 쌓으므로 offsetY/totalHeight 절대배치를 쓰지 않는다.
    // 스크롤 등으로 부분 범위가 들어와도 전체를 렌더(가상화 안 함)해 행 누락을 막는다.
    const auto = options.autoHeight === true;
    if (auto) {
      [startIndex, endIndex] = this.visRange();
      // 대용량 가드: autoHeight 는 전 행을 렌더(비가상)하므로 행이 많으면 느려진다(1회 경고).
      if (!this._autoHeightWarned && endIndex - startIndex + 1 > 2000) {
        this._autoHeightWarned = true;
        console.warn(
          `[OpenGrid] autoHeight 는 가상 스크롤이 아니라 전 행(${endIndex - startIndex + 1}행)을 렌더합니다. ` +
          '행이 많으면 고정 rowHeight(가상 스크롤) 사용을 권장합니다.');
      }
    }
    // F2(§3.2): group/tree 활성 이거나 detail 활성(펼침≥1)이면 FlatRowModel 의 최종 합성 배열
    // (backing+splice, detail head/filler 포함)을 렌더러에 넘긴다. 둘 다 비활성인 그리드는
    // 기존과 동일하게 null(무비용, data.getRowByIndex 경로)을 유지한다(회귀 0/성능 보존).
    const grpMgr = this._deps.getGrpMgr();
    const groupTreeActive = grpMgr.isGroupMode || grpMgr.isTreeMode;
    const flatRows = (groupTreeActive || this._deps.getDetailMgr().isActive)
      ? this._deps.getFlatModel().getFlatArray()
      : null;
    const colLayout = this._deps.getColLayout();
    const data = this._deps.getData();
    const rowMgr = this._deps.getRowMgr();
    renderer.renderBody({
      startIndex,
      endIndex,
      data,
      leaves: colLayout.visibleLeaves,
      widths: this.syncGeometry().widths(),
      opts: options,
      offsetY: auto ? 0 : range.offsetY,
      totalHeight: auto ? 0 : vs.getTotalHeight(),
      selectedRows: rowMgr.selectedRows,
      checkedRows: rowMgr.checkedRows,
      groupFlatRows: flatRows,
      onGroupToggle: (groupKey) => grpMgr.handleGroupToggle(groupKey),
      onTreeToggle: grpMgr.isTreeMode ? (nodeId) => grpMgr.handleTreeToggle(nodeId) : undefined,
      extraOpts: {
        _totalRows: data.rowCount, _frozenCount: colLayout.frozenCount, _focusCell: this._deps.getEditMgr().focusCell,
        // M-6(§4.2, F1): 범위 선택 면 하이라이트 클래스 재적용 재료.
        ...this._deps.getRangeMgr().getOverlayExtraOpts(),
      },
      mergeEngine: this._deps.getMergeEngine(),
      detailApi: this._deps.buildDetailRenderContext(),
      columns,
      ...(rowWork === undefined ? null : { rowWork }),
    });
    // F1(§4.3): 매 렌더 뒤 오버레이(테두리/핸들/프리뷰) 재측정·복원(QA-2 재렌더 생존).
    this._deps.getRangeMgr().repaint();
  }

  /**
   * 현재 화면에 보이는 행 범위를 반환한다. / Return the currently visible row range.
   *
   * @returns `[시작, 끝]` flat index 쌍 / `[start, end]` flat index pair
   */
  visRange(): [number, number] {
    const options = this._deps.getOptions();
    const pagination = this._deps.getPagination();
    if (options.pagination && pagination) {
      const { start, end } = pagination.getRange();
      return [start, end];
    }
    // F2(C0.3): FlatRowModel.count() 는 group/tree backing + detail splice 까지 합성된 최종
    // 총 행수 — plain/group/tree/detail 모든 조합에서 이 하나로 정확하다(detail 비활성이면
    // 기존 this._data.rowCount 와 동치).
    const total = this._deps.getFlatModel().count();
    // autoHeight(비가상): 가상화하지 않고 전체 행을 렌더 (높이가 행마다 다르므로 범위 계산 불가)
    if (options.autoHeight) {
      return [0, total - 1];
    }
    // 세로 창(가상 스크롤)의 범위 그대로 — 위아래 여유 행은 세로 창이 이미 넣는다. 범위 식을 하나로 두어 길마다 그리는 행이 달라지지 않게.
    // / The vertical window's range as is — it already adds overscan rows. One range formula so every path paints the same rows.
    const r = this._deps.getVs()?.getVisibleRange();
    return [r?.startIndex ?? 0, Math.min(r?.endIndex ?? 30, total - 1)];
  }
}
