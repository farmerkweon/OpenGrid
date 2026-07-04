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
import type { GridOptions } from './types.js';

/**
 * R5(§3.1 C4, §6-R5): 렌더 루프의 유일 진입점. `OpenGrid` God object 에서
 * `_onResize`/`_recalcWidths`/`_renderHeader`/`_syncHeaderLayout`/`_doRender`/`_visRange`
 * (+ 전용 헬퍼 `_visCount`/`_paginationHeight`)를 **동작 불변**으로 옮긴 것.
 *
 * 스트랭글러 원칙(A2): 협력자(GridRenderer/VirtualScroll/Pagination 등)는 여전히
 * `OpenGrid._mount` 가 생성·소유하며, 여기에는 `*Deps` 클로저 역전 패턴으로 **주입**만 된다.
 * 값(컬럼폭·옵션 등)은 늦은-null / 재할당(worksheet 전환 시 colLayout 교체)을 견디도록
 * 전부 getter 클로저로 읽는다. `fallbackViewportHeight` 클램프 시맨틱과 RenderFrame 구성은
 * 원본과 1:1 동일하다(회귀 0).
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
  getUserWidths: () => Map<string, number>;
  getSfMgr: () => SortFilterManager<T>;
  getRowMgr: () => RowManager<T>;
  getEditMgr: () => CellEditManager<T>;
  getGrpMgr: () => GroupTreeManager<T>;
  getDetailMgr: () => DetailManager<T>;
  getRangeMgr: () => RangeSelectionManager<T>;
  buildDetailRenderContext: () => DetailRenderContext | undefined;
  renderFooterEl: () => void;
}

export class RenderController<T extends Record<string, any> = any> {
  private _deps: RenderControllerDeps<T>;
  private _autoHeightWarned = false;

  constructor(deps: RenderControllerDeps<T>) {
    this._deps = deps;
  }

  private _paginationHeight(): number {
    return this._deps.getOptions().pagination ? 38 : 0;
  }

  onResize(): void {
    const { width } = this._deps.getContainer().getBoundingClientRect();
    if (!width) return;
    this.recalcWidths(width);
    // renderHeader() 가 헤더를 그린 뒤 실제 헤더 높이를 측정해 본문/뷰포트 높이를 동기화한다
    // (headerWrap/'\n' 로 헤더가 늘어나도 본문 영역이 침범당하지 않도록).
    this.renderHeader();
    this.doRender(...this.visRange());
  }

  recalcWidths(totalWidth: number): void {
    const colLayout = this._deps.getColLayout();
    const options = this._deps.getOptions();
    const widths = colLayout.computeWidths(
      totalWidth
        - (options.stateColumn ? 24 : 0)
        - (options.draggable   ? 18 : 0)
        - (options.rowNumber   ? 44 : 0)
        - (options.checkColumn ? 36 : 0),
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

  // 헤더(컬럼 제목 행)를 다시 그린다
  renderHeader(): void {
    const renderer = this._deps.getRenderer();
    const colLayout = this._deps.getColLayout();
    const sfMgr = this._deps.getSfMgr();
    const options = this._deps.getOptions();
    renderer?.renderHeader(
      colLayout.buildHeaderCells(),
      colLayout.visibleLeaves,
      this._deps.getColWidths(),
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
   */
  syncHeaderLayout(): void {
    const renderer = this._deps.getRenderer();
    const vs = this._deps.getVs();
    if (!renderer || !vs) return;
    const options = this._deps.getOptions();
    const { height } = this._deps.getContainer().getBoundingClientRect();
    if (!height) return;
    const measured = renderer.getHeaderHeight();
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

  doRender(startIndex: number, endIndex: number): void {
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
      widths: this._deps.getColWidths(),
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
    });
    // 데이터가 바뀌면 푸터 합계도 다시 계산한다
    if (options.footer?.length) this._deps.renderFooterEl();
    // F1(§4.3): 매 렌더 뒤 오버레이(테두리/핸들/프리뷰) 재측정·복원(QA-2 재렌더 생존).
    this._deps.getRangeMgr().repaint();
  }

  // 현재 화면에 보이는 행 범위를 반환한다
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
    const r = this._deps.getVs()?.getVisibleRange();
    return [r?.startIndex ?? 0, Math.min((r?.endIndex ?? 30) + this._visCount() + 5, total - 1)];
  }

  private _visCount(): number {
    const options = this._deps.getOptions();
    const h = this._deps.getContainer().getBoundingClientRect().height;
    return Math.ceil((h - options.headerHeight - this._paginationHeight()) / options.rowHeight) + 5;
  }
}
