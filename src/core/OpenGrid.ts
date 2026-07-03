import { EventEmitter } from './EventEmitter.js';
import { DataLayer } from './DataLayer.js';
import { VirtualScroll } from './VirtualScroll.js';
import { ColumnLayout } from './ColumnLayout.js';
import { FilterPanel } from './FilterPanel.js';
import { GridRenderer } from './GridRenderer.js';
import type { RendererCallbacks, DetailRenderContext } from './GridRenderer.js';
import { DetailManager } from './DetailManager.js';
import { getDetailGlyph } from './detail/DetailGlyph.js';
import { RowManager } from './RowManager.js';
import { CellEditManager } from './CellEditManager.js';
import { isToggleCol } from './CellTypeRegistry.js';
import { FilterSelectPanel } from './FilterSelect.js';
import type { FilterSelectConfig } from './FilterSelect.js';
import { Pagination } from './Pagination.js';
import { RowDragDrop } from './RowDragDrop.js';
import { MergeEngine, type MergeCell } from './MergeEngine.js';
import { createRenderer, setDisplayFormatterResolver } from './renderers/CellRenderer.js';
import { ContextMenuManager, DEFAULT_CONTEXT_ITEMS } from './ContextMenu.js';
import { WorksheetManager } from './WorksheetManager.js';
import { ExportManager } from './ExportManager.js';
import { FooterManager } from './FooterManager.js';
import { KeyboardManager } from './KeyboardManager.js';
import { FindBarManager } from './FindBarManager.js';
import { GroupTreeManager } from './GroupTreeManager.js';
import { FlatRowModel } from './FlatRowModel.js';
import type { FlatRowRef } from './FlatRowModel.js';
import { SortFilterManager } from './SortFilterManager.js';
import { CellEventHandler } from './CellEventHandler.js';
import { RangeSelectionManager } from './RangeSelectionManager.js';
import { ChartManager } from './ChartManager.js';
import type { ChartInstance } from './ChartManager.js';
import type { ChartConfig } from './chart/types.js';
import { TriggerManager } from './TriggerManager.js';
import {
  openCrossGridMapper, buildTransform, buildMappingScript, sameSchema,
  type FieldInfo,
} from './CrossGridMapper.js';
import { crossGridRegistry } from './CrossGridRegistry.js';
import { OverrideKernel } from './OverrideKernel.js';
import type { OverrideLayer } from './OverrideKernel.js';
import { RecalcCoordinator, type RecalcSummary } from './formula/RecalcCoordinator.js';
import { cellKey, parseCellKey, type FormulaErrorCode, type FormulaGridAccessor } from './formula/types.js';
import type {
  GridOptions, OpenGridInstance, ColumnDef,
  SortItem, FilterItem, ExportOptions,
  EditEvent, Position, GridDropEvent, GridMappingEvent,
  TriggerContext, TriggerHandler, TriggerEvent,
  OverrideApi, OverrideCallOptions,
  CellRange, RangeStats,
} from './types.js';

/** formulaRecalc 이벤트의 large 플래그 임계(Spike-A §8 교훈 — 누적체인 폐포 폭증 신호). */
const FORMULA_LARGE_RECALC_THRESHOLD = 500;

const ROW_ID_FIELD = '_ogRowId';

export class OpenGrid<T extends Record<string, any> = any>
  extends EventEmitter
  implements OpenGridInstance<T>
{
  private _container: HTMLElement;
  private _options: Required<GridOptions<T>>;
  private _data: DataLayer<T>;
  private _colLayout: ColumnLayout<T>;
  private _vs: VirtualScroll | null = null;
  private _ro: ResizeObserver | null = null;
  private _renderer: GridRenderer | null = null;
  private _sfMgr!: SortFilterManager<T>;
  private _rowMgr!: RowManager<T>;
  private _editMgr!: CellEditManager<T>;
  private _trigMgr = new TriggerManager();
  private _destroyed = false;
  private _autoHeightWarned = false;
  private _colWidths: number[] = [];
  /** 사용자가 헤더 드래그로 직접 조절한 컬럼 폭 (field 기준). _recalcWidths 가 덮어쓰지 않도록 보존 */
  private _userWidths = new Map<string, number>();
  private _filterPanel: FilterPanel | null = null;
  private _filterSelect: FilterSelectPanel | null = null;
  private _pagination: Pagination | null = null;
  private _dnd: RowDragDrop | null = null;
  private _mergeEngine: MergeEngine = new MergeEngine();
  private _liveRegion: HTMLElement | null = null;
  private _ctxMenu: ContextMenuManager | null = null;
  private _cmHandler:    ((e: MouseEvent)    => void) | null = null;
  private _cmKbdHandler: ((e: KeyboardEvent) => void) | null = null;
  private _wsManager: WorksheetManager<T> | null = null;
  // 분리된 매니저들
  private _exportMgr!: ExportManager<T>;
  private _footerMgr!: FooterManager<T>;
  private _kbdMgr!: KeyboardManager<T>;
  private _findMgr!: FindBarManager<T>;
  private _grpMgr!: GroupTreeManager<T>;
  private _cellEvt!: CellEventHandler<T>;
  /** F1: 범위 선택 + 채우기 핸들 배선 관리자(11_design_F1_v2.md). */
  private _rangeMgr!: RangeSelectionManager<T>;
  /** F2: 마스터/디테일 배선(11_design_F2_v2.md). 헤드리스 코어(core/detail/*)를 소비. */
  private _detailMgr!: DetailManager<T>;
  /** F4: 그리드 데이터 통합 차트 오케스트레이터(11_design_F4_v2.md). 헤드리스 chart/* 소비. */
  private _chartMgr!: ChartManager;
  /** Phase 0(C0.3): flat/visual index ↔ data 리졸버. 어떤 기능도 켜지지 않아도 항상 존재. */
  private _flatModel!: FlatRowModel;
  /** F3: 셀 수식 헤드리스 오케스트레이터(core/formula/* 소비, 재구현 아님). 항상 존재(헤드리스라 유휴 비용 0). */
  private _recalc!: RecalcCoordinator;
  /** F3(C2): writeCell 단건 쓰기가 쌓아두는 dirty seed. endBatch/즉시 flush 시 onValuesChanged 1회로 소비. */
  private _formulaDirtySeeds: Set<string> = new Set();

  // ── Phase 0(C2.1): 배치 쓰기 — beginBatch/endBatch 로 render·dataChange 를 coalesce ──
  /** reentrant 카운터. 0 초과면 배치 중(writeCell 이 render/dataChange 를 지연). */
  private _batchDepth = 0;
  /** 배치 구간 중 실제 쓰기가 1건이라도 있었는지(빈 배치는 endBatch 에서 아무 것도 안 함). */
  private _batchDirty = false;

  // grid.override() 확장 커널 (생성자 말미에 초기화)
  private _ovk!: OverrideKernel;
  /** 공개 override API (호출가능 + .strategy). 생성자 말미에 부착. */
  override!: OverrideApi<T>;

  // ── grid.override() 정적 전역 레지스트리 ──────────────────
  /** 정적 전역 override 레이어 (모든 신규 인스턴스에 생성자 말미 적용). */
  private static _defaultOverrides: Array<[string, OverrideLayer, OverrideCallOptions]> = [];
  /** 정적 전역 strategy 슬롯. */
  private static _defaultStrategies: Array<[string, Function]> = [];

  /** 정적: 모든 신규 그리드에 적용될 override 레이어 등록. */
  static defaultOverride(name: string, fn: OverrideLayer, opts: OverrideCallOptions = {}): typeof OpenGrid {
    OpenGrid._defaultOverrides.push([name, fn, opts]);
    return OpenGrid;
  }

  /** 정적 전역 defaults 네임스페이스 (strategy 슬롯). */
  static defaults = {
    strategy(slot: string, fn: Function): typeof OpenGrid {
      OpenGrid._defaultStrategies.push([slot, fn]);
      return OpenGrid;
    },
  };

  constructor(container: string | HTMLElement, options: GridOptions<T>) {
    super();
    const el = typeof container === 'string'
      ? (document.querySelector(container) as HTMLElement)
      : container;
    if (!el) throw new Error(`OpenGrid: container not found: ${container}`);
    this._container = el;

    this._options = {
      height: '100%', width: '100%',
      rowHeight: 32, headerHeight: 34, footerHeight: 30,
      autoHeight: false, fillWidth: false, defaultColumnWidth: 100,
      editable: false, editMode: 'dblclick', history: true, historySize: 100,
      selection: 'single', clipboard: true,
      sortable: true, multiSort: true, filterable: true, defaultSort: [],
      frozenColumns: 0, frozenRows: 0,
      rowNumber: false, stateColumn: false, checkColumn: false, draggable: false, crossGrid: false, crossGridMapping: 'auto',
      mergeCells: false, groupBy: [], summary: undefined as any,
      treeMode: 'auto', treeId: 'id', treeParentId: 'parentId', expandOnLoad: false,
      pagination: false, pageSize: 50,
      footer: undefined as any, footerPosition: 'bottom',
      theme: 'default', cssVars: {}, ariaLabel: 'OPEN_GRID 데이터 그리드',
      ...options
    } as Required<GridOptions<T>>;

    this._data = new DataLayer<T>(ROW_ID_FIELD);
    // Phase 0(C0.3): baseline FlatRowModel — group/tree 등 어떤 기능도 켜지지 않아도 존재.
    this._flatModel = new FlatRowModel({
      getDataLayer: () => this._data,
      rowIdField: ROW_ID_FIELD,
    });
    this._rowMgr = new RowManager<T>(this._data);
    this._colLayout = new ColumnLayout<T>(this._options.columns, this._options.frozenColumns);

    // F3(11_design_F3_v2.md/15_cross_contracts.md): 헤드리스 재계산 오케스트레이터.
    // accessor 는 FlatRowModel(C0.3)+ColumnLayout.visibleLeaves(C1)+DataLayer(rowId 기반, C0.5)
    // 로만 "화면/데이터"를 본다 — RecalcCoordinator/FormulaGraph/FormulaEvaluator 자체는 미수정.
    this._recalc = new RecalcCoordinator({
      accessor: this._buildFormulaAccessor(),
      setComputedValue: (rowId, field, value) => this._data.setComputedValueByRowId(rowId, field, value),
      onFormulaError: (rowId, field, error) => this._handleFormulaError(rowId, field, error),
      refMode: (this._options as any).formula?.refMode ?? 'stable',
      divisionPrecision: (this._options as any).formula?.divisionPrecision ?? 30,
    });

    this._editMgr = new CellEditManager<T>({
      data: this._data,
      colLayout: this._colLayout,
      getRenderer: () => this._renderer,
      getContainer: () => this._container,
      getOptions: () => this._options,
      emit: (ev, ...args) => this.emit(ev, ...args),
      doRender: () => this._doRender(...this._visRange()),
      announce: (msg) => this._announce(msg),
      writeCell: (ri, field, value) => this.writeCell(ri, field, value),
      scrollToRow: (ri) => this._vs?.scrollToRow(ri),
      getVisibleLeaves: () => this._colLayout.visibleLeaves,
      hasCellFormula: (ri, field) => this.hasCellFormula(ri, field),
      getCellFormula: (ri, field) => this.getCellFormula(ri, field),
      setCellFormula: (ri, field, formula) => this.setCellFormula(ri, field, formula),
      clearCellFormula: (ri, field) => this.clearCellFormula(ri, field),
    });

    this._exportMgr = new ExportManager<T>({
      getData: () => this._data.getData(),
      getColLayout: () => this._colLayout,
      getColWidths: () => this._colWidths,
      getOptions: () => this._options,
      getContainer: () => this._container,
      getMaskEnabled: (field) => this.getMaskEnabled(field),
      getWsManager: () => this._wsManager,
      getStrategy: (slot, fb) => this._ovk.getStrategy(slot, fb),
    });
    this._footerMgr = new FooterManager<T>({
      getData: () => this._data.getData(),
      getColLayout: () => this._colLayout,
      getColWidths: () => this._colWidths,
      getOptions: () => this._options,
      getContainer: () => this._container,
      getStrategy: (slot, fb) => this._ovk.getStrategy(slot, fb),
    });
    this._kbdMgr = new KeyboardManager<T>({
      getEditMgr: () => this._editMgr,
      getRowMgr: () => this._rowMgr,
      getData: () => this._data,
      getColLayout: () => this._colLayout,
      getOptions: () => this._options,
      setFocusCell: (ri, ci) => this._setFocusCell(ri, ci),
      handleRowDrop: (from, to) => this._handleRowDrop(from, to),
      doRender: () => this._doRender(...this._visRange()),
      announce: (msg) => this._announce(msg),
      emit: (ev, ...args) => this.emit(ev, ...args),
      visRange: () => this._visRange(),
      handleCellKeyEvt: (name, e) => this._handleCellKeyEvt(name, e),
      writeCells: (patches) => this.writeCells(patches),
      getRangeHooks: () => this._rangeMgr,
    });
    this._sfMgr = new SortFilterManager<T>({
      getData: () => this._data,
      getColLayout: () => this._colLayout,
      getFindFilter: () => this._findMgr.findFilter,
      getVs: () => this._vs,
      getPagination: () => this._pagination,
      getOptions: () => this._options,
      renderHeader: () => this._renderHeader(),
      doRender: () => this._doRender(...this._visRange()),
      announce: (msg) => this._announce(msg),
      emit: (ev, ...args) => this.emit(ev, ...args),
      onReproject: () => this._rangeMgr.reproject(),
    });
    this._findMgr = new FindBarManager<T>({
      getColLayout: () => this._colLayout,
      getData: () => this._data,
      getFilters: () => this._sfMgr.filters,
      getVs: () => this._vs,
      getPagination: () => this._pagination,
      doRender: () => this._doRender(...this._visRange()),
    });
    this._cellEvt = new CellEventHandler<T>({
      getData: () => this._data,
      getColLayout: () => this._colLayout,
      getOptions: () => this._options,
      getEditMgr: () => this._editMgr,
      getRowMgr: () => this._rowMgr,
      emit: (ev, ...args) => this.emit(ev, ...args),
      writeCell: (ri, field, val) => this.writeCell(ri, field, val),
      doRender: () => this._doRender(...this._visRange()),
      getContainer: () => this._container,
      onCellsClick: (ri, ci, shift) => this._rangeMgr.handleClick(ri, ci, shift),
      rangeMouseDown: (ri, ci, e) => this._rangeMgr.handleCellMouseDown(ri, ci, e),
      rangeMouseMove: (ri, ci, e) => this._rangeMgr.handleCellMouseMove(ri, ci, e),
      rangeMouseUp: (ri, ci, e) => this._rangeMgr.handleCellMouseUp(ri, ci, e),
    });
    // F1: 범위 선택 + 채우기 핸들(11_design_F1_v2.md). 헤드리스 코어(core/range/*)를 소비.
    this._rangeMgr = new RangeSelectionManager<T>({
      getOptions: () => this._options,
      getData: () => this._data,
      getColLayout: () => this._colLayout,
      getFlatModel: () => this._flatModel,
      getRenderer: () => this._renderer,
      getEditMgr: () => this._editMgr,
      setFocusCell: (ri, ci) => this._setFocusCell(ri, ci),
      writeCells: (patches) => this.writeCells(patches),
      getDisplayValue: (ri, field) => this.getDisplayValue(ri, field),
      emit: (ev, ...args) => this.emit(ev, ...args),
      doRender: () => this._doRender(...this._visRange()),
      announce: (msg) => this._announce(msg),
      // C3(15_cross_contracts.md): F3 이 제공하는 hasCellFormula/offsetFormula/setCellFormula 를
      // fill 커밋 경로(FillEngine.FillPlanContext)에 연결한다.
      hasCellFormula: (rowId, field) => this._recalc.hasCellFormula(rowId, field),
      offsetFormula: (rowId, field, dRow, dCol) => this._recalc.offsetFormula(rowId, field, dRow, dCol),
      setCellFormulaByRowId: (rowId, field, formula) => this._setCellFormulaByRowId(rowId, field, formula),
    });
    this._grpMgr = new GroupTreeManager<T>({
      getData: () => this._data.getData(),
      getDataLayer: () => this._data,
      getOptions: () => this._options,
      getVs: () => this._vs,
      doRenderFull: (n) => this._doRender(0, n - 1),
      doRender: () => this._doRender(...this._visRange()),
      getStrategy: (slot, fb) => this._ovk.getStrategy(slot, fb),
      setFlatBacking: (provider) => this._flatModel.setBacking(provider),
      getFlatCount: () => this._flatModel.count(),
    });
    // F2(11_design_F2_v2.md §3.1/C0.3): DetailManager 는 FlatRowModel 의 "등록자" — group/tree
    // 가 setBacking 한 산출물 위에 detail splice 를 끼운다(합성 체인 마지막 단계, §3.2).
    this._detailMgr = new DetailManager<T>({
      getOptions: () => this._options,
      getFlatModel: () => this._flatModel,
      getVs: () => this._vs,
      getRowId: (row) => (row as any)[ROW_ID_FIELD],
      getRowById: (rowId) => this._data.getRowById(rowId),
      doRenderFull: (n) => this._doRender(0, n - 1),
      emit: (ev, payload) => this.emit(ev, payload),
      announce: (msg) => this._announce(msg),
      getDepth: () => (this._options as any)._detailDepth ?? 0,
      getGridInstance: () => this,
      // 순환 import 회피: DetailManager.ts 는 OpenGrid 를 모르고, 이 클로저만 주입받는다.
      createSubgrid: (host, subgridOptions, depth) =>
        new OpenGrid(host, { ...subgridOptions, _detailDepth: depth } as any),
    });
    // F4(11_design_F4_v2.md §6/C5): 통합 차트 오케스트레이터. 그리드 상태는 전부 주입 클로저로
    // 읽고(CN-1 가상DOM 미접근), range 는 FlatRowModel(C0.3)로 pseudo-row 를 걸러 스냅샷한다.
    this._chartMgr = new ChartManager({
      getContainer: () => this._container,
      getOptions: () => this._options,
      getAllRows: () => this._data.getData(),
      getSelectedRows: () => this._rowMgr.getSelections(),
      getCheckedRows: () => this._rowMgr.getChecked().map(c => c.row),
      getVisibleColumns: () => this._colLayout.visibleLeaves.map(c => ({
        field: c.field, header: c.header, type: c.type as string | undefined,
      })),
      getFlatModel: () => this._flatModel,
      getRowById: (rowId) => this._data.getRowById(rowId) as Record<string, any> | undefined,
      getActiveRange: () => this._rangeMgr.getActiveRange(),
      on: (ev, cb) => { this.on(ev, cb); },
      off: (ev, cb) => { this.off(ev, cb); },
      emit: (ev, ...args) => this.emit(ev, ...args),
      announce: (msg) => this._announce(msg),
    });

    // ── grid.override() 확장 커널 부착 (★mount 전 — 초기 렌더의 footer/그룹/strategy 슬롯이
    //    매니저 deps의 getStrategy 클로저를 통해 this._ovk 를 참조하므로, _ovk 선생성이 필수다.
    //    이전엔 mount 이후 생성하여 summary 푸터가 있는 그리드가 초기화 중
    //    "Cannot read properties of undefined (reading 'getStrategy')" 로 깨졌다.) ──
    this._ovk = new OverrideKernel(this, { strict: this._options.overrideStrict ?? true });
    // Phase 2: DataLayer(슬롯 sortComparator/filterPredicate) + 렌더러(displayFormatter) strategy 배선.
    this._data.setStrategyResolver((slot, fb) => this._ovk.getStrategy(slot, fb));
    setDisplayFormatterResolver((v, f, row) =>
      this._ovk.getStrategy('displayFormatter', null as any)?.(v, f, row) ?? null,
    );

    this._mount();
    this._bindOptionEvents();

    if (this._options.defaultSort?.length) {
      this._sfMgr.initSort(this._options.defaultSort);
    }

    this.override = Object.assign(
      (name: string, fn: OverrideLayer, opts?: OverrideCallOptions) => this._ovk.override(name, fn, opts) as any,
      { strategy: (slot: string, fn: Function) => this._ovk.strategy(slot, fn) as any },
    ) as OverrideApi<T>;

    // destroy 순수 래핑(94 §2.2 채택안2): 원본 본문 0줄 수정, 최외곽에서 restoreAll 보장.
    const _origDestroy = this.destroy.bind(this);
    this.destroy = () => { try { _origDestroy(); } finally { this._ovk.restoreAll(); } };

    // 정적 전역 defaults 1회 적용(첫 렌더 후, 깜빡임 방지).
    for (const [slot, fn] of OpenGrid._defaultStrategies) this._ovk.strategy(slot, fn);
    for (const [name, fn, opts] of OpenGrid._defaultOverrides) this._ovk.override(name, fn, opts);

    requestAnimationFrame(() => {
      this.emit('ready', this);
      this._options.onReady?.(this);
    });
  }

  // ── grid.override() 위임 메서드 ──────────────────────────
  restore(name: string): this { this._ovk.restore(name); return this; }
  restoreAll(): this { this._ovk.restoreAll(); return this; }
  hasOverride(name: string): boolean { return this._ovk.hasOverride(name); }
  getOverrideNames(): string[] { return this._ovk.getOverrideNames(); }
  getStrategy<F extends Function>(slot: string, fallback: F): F { return this._ovk.getStrategy(slot, fallback); }
  private _mount(): void {
    this._container.classList.add('og-container');
    const h = this._options.height;
    const w = this._options.width;
    this._container.style.height = typeof h === 'number' ? `${h}px` : String(h);
    this._container.style.width  = typeof w === 'number' ? `${w}px` : String(w);
    this._container.style.display = 'flex';
    this._container.style.flexDirection = 'column';
    this._container.style.overflow = 'hidden';
    this._container.style.boxSizing = 'border-box';
    this._container.style.border = '1px solid var(--og-border-color, #e0e0e0)';
    this._container.style.fontFamily = 'var(--og-font-family, -apple-system, sans-serif)';
    this._container.style.fontSize = 'var(--og-font-size, 13px)';
    this._container.setAttribute('data-og-theme', this._options.theme);

    for (const [k, v] of Object.entries(this._options.cssVars))
      this._container.style.setProperty(k, v);

    this._renderer = new GridRenderer(this._container, this._options, {
      onHeaderClick:     (field, shiftKey) => this._handleSortClick(field, shiftKey),
      onCellClick:       (ri, ci, e) => this._handleCellClick(ri, ci, e),
      onCellDblClick:    (ri, ci, e) => this._handleCellDblClick(ri, ci, e),
      onCellMouseOver:   (ri, ci, e) => this._handleCellMouseOver(ri, ci, e),
      onCellMouseOut:    (ri, ci, e) => this._handleCellMouseOut(ri, ci, e),
      onCellMouseDown:   (ri, ci, e) => this._handleCellMouseDown(ri, ci, e),
      onCellMouseUp:     (ri, ci, e) => this._handleCellMouseUp(ri, ci, e),
      onCellMouseMove:   (ri, ci, e) => this._handleCellMouseMove(ri, ci, e),
      onRowCheck:        (ri, checked) => this._handleRowCheck(ri, checked),
      onAllCheck:        (checked) => this._handleAllCheck(checked),
      onColResize:       (ci, w) => this._handleColResize(ci, w),
      onFilterIconClick: (field, anchorEl) => this._handleFilterIconClick(field, anchorEl),
      getDndManager:     () => this._dnd,
      onColDragStart:    (ci) => { this._editMgr.dragColIdx = ci; },
      onColDrop:         (toIdx) => {
        if (this._editMgr.dragColIdx !== null && this._editMgr.dragColIdx !== toIdx) {
          this._reorderColumn(this._editMgr.dragColIdx, toIdx);
        }
        this._editMgr.dragColIdx = null;
      },
      getColDragIdx:     () => this._editMgr.dragColIdx,
      getDisplayText: (ri, field) =>
        (this.hasOverride("getDisplayValue") || this._ovk.hasStrategy("displayFormatter"))
          ? this.getDisplayValue(ri, field)
          : null,
      // F3(§7.4/C7/C8.3): 마커·에러 툴팁·aria-label 을 위한 셀별 수식 메타(없으면 null).
      getFormulaMeta: (ri, field) => this._getFormulaMeta(ri, field),
    });
    // F1(§4.3, C6): bodyWrap 자식으로 범위선택 오버레이 1회 부착(renderBody 파괴 회피).
    this._rangeMgr.mount(this._renderer.bodyWrapper);

    this._filterPanel = new FilterPanel(
      this._container,
      (field, items) => this.setFilter(field, items),
      (field) => this.resetFilter(field)
    );
    // 웹 접근성 속성 설정 (role, aria 레이블, 행/열 수 알림)
    // ?묎렐?? role, aria-label, aria-rowcount, aria-colcount
    this._container.setAttribute('role', 'grid');
    this._container.setAttribute('aria-label', this._options.ariaLabel ?? this._options.cssVars?.['aria-label'] ?? 'OPEN_GRID 데이터 그리드');
    this._container.setAttribute('aria-rowcount', '0');
    this._container.setAttribute('aria-colcount', String(this._options.columns.filter(c => !c.hidden).length));
    // aria-live 영역(C8.1 공용 announce 인프라): 스크린리더에게 상태 변화를 알린다.
    // ⚠️ 호스트 CSS 격리 하드 제약(baseline §Q5): 시각 숨김은 클래스에 기대지 않고
    // 인라인 스타일로 강제한다(호스트 페이지 전역 CSS가 .og-live-region 을 깨뜨려도 안전).
    // 클래스는 하위호환/테마 목적으로 유지하되 실제 은닉은 인라인 스타일이 담당한다.
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('aria-live', 'polite');
    this._liveRegion.setAttribute('aria-atomic', 'true');
    this._liveRegion.className = 'og-live-region';
    Object.assign(this._liveRegion.style, {
      position: 'absolute', width: '1px', height: '1px', margin: '-1px',
      padding: '0', overflow: 'hidden', clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap', border: '0',
    });
    // 그리드 루트(container) 내부에 부착 — F1~F4 announce() 가 공유하는 단일 리전(C8.1).
    this._container.appendChild(this._liveRegion);
    // 키보드로 그리드를 조작할 수 있도록 tabIndex 설정
    this._container.tabIndex = 0;
    this._container.addEventListener('keydown',  (e) => this._handleKeyDown(e));
    this._container.addEventListener('keyup',    (e) => this._handleCellKeyEvt('cellKeyUp', e));
    this._container.addEventListener('keypress', (e) => this._handleCellKeyEvt('cellKeyPress', e));

    this._vs = new VirtualScroll(this._renderer.bodyWrapper, {
      rowHeight: this._options.rowHeight,
      onRender: (s, e) => this._doRender(s, e),
    });

    // 그리드↔그리드 드래그용 레지스트리 등록 (bodyWrapper 기준)
    crossGridRegistry.register(this._renderer.bodyWrapper, this);

    if (this._options.draggable) {
      this._dnd = new RowDragDrop(
        this._renderer.bodyWrapper,
        this._options.rowHeight,
        (from, to) => this._handleRowDrop(from, to),
        this._options.crossGrid ? {
          resolveTarget: (x, y) => {
            const g = crossGridRegistry.resolveAt(x, y, this);
            if (!g || !g._options.crossGrid) return null;
            return { bodyEl: g._crossBodyEl(), rowHeight: g._options.rowHeight, totalRows: g._data.rowCount };
          },
          onCrossDrop: (fromIndex, targetBodyEl, targetIndex) =>
            this._handleCrossGridDrop(fromIndex, targetBodyEl, targetIndex),
        } : undefined,
        (fromIndex) => this._dragRowSet(fromIndex).length,
      );
    }
    // 스크롤 영역, 페이징 바 등 하단 UI 초기화
    // ?섏씠吏?UI (?듭뀡?먯꽌 pagination:true???뚮쭔)
    if (this._options.pagination) {
      this._pagination = new Pagination(
        this._container,
        this._options.pageSize,
        (e) => {
          this.emit('pageChange', e);
          this._doRender(...this._visRange());
        }
      );
    }
    // 찾기 바 초기화 (헤더 위에 삽입)
    this._findMgr.init(this._container);
    // 오른쪽 클릭 메뉴 초기화
    this._initContextMenu();
    // 워크시트(탭) 초기화
    if (this._options.worksheets?.length) {
      this._initWorksheets();
    }

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this._container);
    this._onResize();
  }

  private _initContextMenu(): void {
    const opt = this._options.contextMenu;
    if (opt === false) return;

    // 기존 핸들러 제거 — setOptions 재호출 시 중복 등록 방지
    if (this._cmHandler)    this._container.removeEventListener('contextmenu', this._cmHandler);
    if (this._cmKbdHandler) this._container.removeEventListener('keydown',     this._cmKbdHandler);
    this._cmHandler = this._cmKbdHandler = null;

    this._ctxMenu = new ContextMenuManager(this._container, {
      onSortAsc:  () => {
        const active = this._colLayout.visibleLeaves[0];
        if (active) this.orderBy(active.field, 'asc');
      },
      onSortDesc: () => {
        const active = this._colLayout.visibleLeaves[0];
        if (active) this.orderBy(active.field, 'desc');
      },
      onFind:    () => this._findMgr.open(),
      onExcel:   () => this.exportExcel(),
      onCsv:     () => this.exportCsv(),
      onPrint:   () => this.print(),
    });

    this._cmHandler = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.og-cell');
      if (!cell) return;
      e.preventDefault();

      const colIdx = Number(cell.dataset.colIndex ?? -1);
      const col = this._colLayout.visibleLeaves[colIdx];

      if (col && this._ctxMenu) {
        this._ctxMenu['_actions'].onSortAsc  = () => this.orderBy(col.field, 'asc');
        this._ctxMenu['_actions'].onSortDesc = () => this.orderBy(col.field, 'desc');
      }

      // 사용자 정의 메뉴는 단독 표시 (기본 메뉴와 합치지 않음)
      const customItems = Array.isArray(opt) ? opt : undefined;
      this._ctxMenu?.open(e, customItems);
    };
    this._container.addEventListener('contextmenu', this._cmHandler);

    this._cmKbdHandler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        const rect = this._container.getBoundingClientRect();
        const fakeEvent = { clientX: rect.left + 80, clientY: rect.top + 40 } as MouseEvent;
        this._ctxMenu?.open(fakeEvent);
      }
    };
    this._container.addEventListener('keydown', this._cmKbdHandler);
  }
  // openContextMenu / closeContextMenu 공개 API
  openContextMenu(e: MouseEvent, items?: import('./types').ContextMenuItem[]): void {
    this._ctxMenu?.open(e, items);
  }
  closeContextMenu(): void {
    this._ctxMenu?.close();
  }
  setFilterSelect(config: FilterSelectConfig | null): void {
    this._filterSelect?.destroy();
    this._filterSelect = null;
    if (!config) return;
    if (!this._container.id) {
      this._container.id = `og-${Math.random().toString(36).slice(2, 7)}`;
    }
    this._filterSelect = new FilterSelectPanel(
      this._container, config,
      (field, items) => this.setFilter(field, items),
      (field?)       => this.resetFilter(field),
      this._container.id
    );
  }
  // 옵션을 런타임에 바꿀 때 호출 (contextMenu 재초기화, groupBy 재구성 등)
  setOptions(opts: Partial<GridOptions<T>>): void {
    Object.assign(this._options, opts);
    if ('contextMenu' in opts) {
      this._ctxMenu?.destroy();
      this._ctxMenu = null;
      this._initContextMenu();
    }
    // groupBy / summary 변경 시 그룹 재구성
    if ('groupBy' in opts || 'summary' in opts) {
      const fields = (opts.groupBy ?? []) as string[];
      if (fields.length > 0) {
        this._grpMgr.groupBy(fields);
      } else {
        this.clearGroup();
      }
      return;
    }
    this._renderHeader();
    this._doRender(...this._visRange());
  }

  /**
   * 컬럼 마스킹 ON/OFF 전환.
   * enabled=true  → 마스킹 적용 (기본 상태)
   * enabled=false → 컬럼 전체 마스킹 해제 (원문 표시)
   */
  setMaskEnabled(field: string, enabled: boolean): void {
    const col = this._colLayout.getColumnByField(field) as any;
    if (!col) return;
    if (enabled) {
      // 마스킹 재활성화: 해제 상태 초기화
      col._maskRevealed = false;
      (col._maskRevealedRows as Set<number> | undefined)?.clear();
    } else {
      // 전체 해제
      col._maskRevealed = true;
    }
    this._doRender(...this._visRange());
  }

  /** 현재 컬럼 마스킹 활성 여부 반환. true=마스킹 중, false=해제됨 */
  getMaskEnabled(field: string): boolean {
    const col = this._colLayout.getColumnByField(field) as any;
    if (!col) return false;
    return col._maskRevealed !== true;
  }
  private _initWorksheets(): void {
    const sheets = this._options.worksheets!;
    this._wsManager = new WorksheetManager<T>(
      this._container,
      (_name, state) => this._loadWorksheetState(state),
    );
    for (const sheet of sheets) {
      this._wsManager.add(sheet.name, sheet.columns ?? this._options.columns, sheet.data ?? []);
    }
  }

  // 탭(워크시트) 전환 시 데이터·컬럼을 화면에 반영한다.
  // 핵심(Why): _data.setData 만으로는 가상 스크롤(_vs)의 총 행수가 갱신되지 않아
  //   _visRange 가 빈 범위를 돌려줘 행이 렌더되지 않는다(데이터 미표시 버그).
  //   공개 setData 와 동일하게 _vs.setTotalRows + aria + 컬럼폭 재계산까지 수행한다.
  private _loadWorksheetState(state: import('./types').WorksheetState<T>): void {
    this._rowMgr.reset();
    this._data.setData(state.data);
    this._colLayout = new ColumnLayout<T>(
      state.columns.length ? state.columns : this._options.columns,
      this._options.frozenColumns,
    );
    this._vs?.setTotalRows(this._data.rowCount);
    this._pagination?.setTotalRows(this._data.rowCount);
    this._container.setAttribute('aria-rowcount', String(this._data.rowCount));
    this._container.setAttribute('aria-colcount', String(this._colLayout.visibleLeaves.length));
    // 시트마다 컬럼 구성이 다를 수 있으므로 폭을 재계산한 뒤 헤더·본문을 다시 그린다
    const { width } = this._container.getBoundingClientRect();
    if (width) this._recalcWidths(width);
    this._renderHeader();
    this._doRender(...this._visRange());
  }

  addWorksheet(name: string, columns?: import('./types').ColumnDef<T>[], data?: T[]): void {
    if (!this._wsManager) {
      this._wsManager = new WorksheetManager<T>(
        this._container,
        (_n, state) => this._loadWorksheetState(state),
      );
    }
    this._wsManager.add(name, columns ?? this._options.columns, data ?? []);
  }

  removeWorksheet(name: string): void {
    this._wsManager?.remove(name);
  }

  switchWorksheet(name: string): void {
    this._wsManager?.switch(name);
  }

  renameWorksheet(oldName: string, newName: string): void {
    this._wsManager?.rename(oldName, newName);
  }

  getWorksheet(name: string): import('./types').WorksheetState<T> | undefined {
    return this._wsManager?.get(name);
  }

  getWorksheetNames(): string[] {
    return this._wsManager?.getNames() ?? [];
  }

  exportSheetsExcel(filename?: string): void { this._exportMgr.exportSheetsExcel(filename); }

  private _paginationHeight(): number {
    return this._options.pagination ? 38 : 0;
  }

  private _onResize(): void {
    const { width } = this._container.getBoundingClientRect();
    if (!width) return;
    this._recalcWidths(width);
    // _renderHeader() 가 헤더를 그린 뒤 실제 헤더 높이를 측정해 본문/뷰포트 높이를 동기화한다
    // (headerWrap/'\n' 로 헤더가 늘어나도 본문 영역이 침범당하지 않도록).
    this._renderHeader();
    this._doRender(...this._visRange());
  }

  private _recalcWidths(totalWidth: number): void {
    this._colWidths = this._colLayout.computeWidths(
      totalWidth
        - (this._options.stateColumn ? 24 : 0)
        - (this._options.draggable   ? 18 : 0)
        - (this._options.rowNumber   ? 44 : 0)
        - (this._options.checkColumn ? 36 : 0),
      this._options.defaultColumnWidth
    );
    // 사용자가 직접 조절한 폭은 보존 (리사이즈 후 재계산으로 원복되는 문제 방지)
    if (this._userWidths.size) {
      this._colLayout.visibleLeaves.forEach((leaf, i) => {
        const w = this._userWidths.get(leaf.field);
        if (w != null) this._colWidths[i] = w;
      });
    }
  }
  // 헤더(컬럼 제목 행)를 다시 그린다
  private _renderHeader(): void {
    this._renderer?.renderHeader(
      this._colLayout.buildHeaderCells(),
      this._colLayout.visibleLeaves,
      this._colWidths,
      this._sfMgr.sortList,
      { ...this._options, _activeFilters: this._sfMgr.filters, _frozenCount: this._colLayout.frozenCount }
    );
    // 헤더 줄바꿈(headerWrap/'\n')으로 헤더가 늘어나면 본문 영역 높이를 다시 맞춰 침범을 막는다.
    this._syncHeaderLayout();
  }

  /**
   * 렌더된 헤더의 실제 높이를 측정해 본문(bodyWrap) 높이와 뷰포트 높이에 반영한다.
   * 줄바꿈이 없는 헤더는 측정 높이가 headerHeight 이하라 기존 고정 동작과 동일하다.
   */
  private _syncHeaderLayout(): void {
    if (!this._renderer || !this._vs) return;
    const { height } = this._container.getBoundingClientRect();
    if (!height) return;
    const measured = this._renderer.getHeaderHeight();
    const headerH = measured > this._options.headerHeight ? measured : this._options.headerHeight;
    this._renderer.updateSize(height - this._paginationHeight(), headerH);
    let vpHeight = height - headerH - this._paginationHeight();
    // 옵트인 뷰포트 안전장치(fallbackViewportHeight). 기본 undefined = OFF = 이 아래 로직 건너뜀 → 기존 동작 불변.
    // "언바운드" 감지: 윈도잉 뷰포트 높이가 전체 콘텐츠 높이(totalRows×rowHeight) 이상이면
    // 컨테이너가 오버플로 스크롤 제약 없이 전 콘텐츠를 다 보여주는 상태다(=확정 높이 부재로 스페이서에
    // 맞춰 부푼 폭주 경로). 이때만 뷰포트 높이를 폴백값으로 클램프해 ResizeObserver 되먹임 루프를 끊는다.
    // 바운드 컨테이너(측정<전체)는 조건에 걸리지 않아 무영향(회귀 0). 클램프 후 재측정에서도 스페이서·
    // 컨테이너 크기는 그대로지만 렌더 행 수가 폴백 기준으로 고정되어 루프가 더는 부풀지 않고 수렴한다.
    const fallback = this._options.fallbackViewportHeight;
    if (fallback && fallback > 0) {
      const totalContentHeight = this._vs.getTotalHeight();
      if (vpHeight >= totalContentHeight && vpHeight > fallback) {
        vpHeight = fallback;
      }
    }
    this._vs.setViewportHeight(vpHeight);
  }
  private _doRender(startIndex: number, endIndex: number): void {
    if (!this._renderer || !this._vs) return;
    const range = this._vs.getVisibleRange();
    // autoHeight(비가상): 행을 플로우로 쌓으므로 offsetY/totalHeight 절대배치를 쓰지 않는다.
    // 스크롤 등으로 부분 범위가 들어와도 전체를 렌더(가상화 안 함)해 행 누락을 막는다.
    const auto = this._options.autoHeight === true;
    if (auto) {
      [startIndex, endIndex] = this._visRange();
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
    const groupTreeActive = this._grpMgr.isGroupMode || this._grpMgr.isTreeMode;
    const flatRows = (groupTreeActive || this._detailMgr.isActive)
      ? this._flatModel.getFlatArray()
      : null;
    this._renderer.renderBody(
      startIndex, endIndex,
      this._data,
      this._colLayout.visibleLeaves,
      this._colWidths,
      this._options,
      auto ? 0 : range.offsetY,
      auto ? 0 : this._vs.getTotalHeight(),
      this._rowMgr.selectedRows,
      this._rowMgr.checkedRows,
      flatRows,
      (groupKey) => this._grpMgr.handleGroupToggle(groupKey),
      this._grpMgr.isTreeMode ? (nodeId) => this._grpMgr.handleTreeToggle(nodeId) : undefined,
      {
        _totalRows: this._data.rowCount, _frozenCount: this._colLayout.frozenCount, _focusCell: this._editMgr.focusCell,
        // M-6(§4.2, F1): 범위 선택 면 하이라이트 클래스 재적용 재료.
        ...this._rangeMgr.getOverlayExtraOpts(),
      },
      this._mergeEngine,
      this._buildDetailRenderContext(),
    );
    // 데이터가 바뀌면 푸터 합계도 다시 계산한다
    if (this._options.footer?.length) this._renderFooterEl();
    // F1(§4.3): 매 렌더 뒤 오버레이(테두리/핸들/프리뷰) 재측정·복원(QA-2 재렌더 생존).
    this._rangeMgr.repaint();
  }

  /** F2(§4.5/§6.1): masterDetail.enabled 아니면 undefined(GridRenderer 는 기존 경로 그대로). */
  private _buildDetailRenderContext(): DetailRenderContext | undefined {
    if (!this._detailMgr.enabled) return undefined;
    const opts = (this._options as any).masterDetail ?? {};
    return {
      toggleMode: opts.toggle ?? 'expander-col',
      ariaLabel: opts.ariaLabel ?? '상세 내용',
      getRowId: (row: any) => row?.[ROW_ID_FIELD],
      isExpanded: (rowId: string) => this._detailMgr.isExpandedId(rowId),
      onToggle: (_rowIndex: number, rowId: string) => this._detailMgr.toggleRow({ id: rowId }),
      getGlyph: (expanded: boolean) => getDetailGlyph(expanded),
      getPanelHost: (rowId: string) => this._detailMgr.getPanelHost(rowId),
      onBeforeTeardown: () => this._detailMgr.onBeforeTeardown(),
    };
  }

  private _handleGroupToggle(groupKey: string): void { this._grpMgr.handleGroupToggle(groupKey); }

  // 현재 화면에 보이는 행 범위를 반환한다
  private _visRange(): [number, number] {
    if (this._options.pagination && this._pagination) {
      const { start, end } = this._pagination.getRange();
      return [start, end];
    }
    // F2(C0.3): FlatRowModel.count() 는 group/tree backing + detail splice 까지 합성된 최종
    // 총 행수 — plain/group/tree/detail 모든 조합에서 이 하나로 정확하다(detail 비활성이면
    // 기존 this._data.rowCount 와 동치).
    const total = this._flatModel.count();
    // autoHeight(비가상): 가상화하지 않고 전체 행을 렌더 (높이가 행마다 다르므로 범위 계산 불가)
    if (this._options.autoHeight) {
      return [0, total - 1];
    }
    const r = this._vs?.getVisibleRange();
    return [r?.startIndex ?? 0, Math.min((r?.endIndex ?? 30) + this._visCount() + 5, total - 1)];
  }

  private _visCount(): number {
    const h = this._container.getBoundingClientRect().height;
    return Math.ceil((h - this._options.headerHeight - this._paginationHeight()) / this._options.rowHeight) + 5;
  }
  private _handleSortClick(field: string, shiftKey: boolean): void { this._sfMgr.handleSortClick(field, shiftKey); }

  private _isToggleCol(col: ColumnDef<T>): boolean { return isToggleCol(col); }
  private _handleCellClick(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellClick(ri, ci, e); }
  private _handleCellDblClick(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellDblClick(ri, ci, e); }
  private _handleCellMouseOver(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseOver(ri, ci, e); }
  private _handleCellMouseOut(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseOut(ri, ci, e); }
  private _handleCellMouseDown(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseDown(ri, ci, e); }
  private _handleCellMouseUp(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseUp(ri, ci, e); }
  private _handleCellMouseMove(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseMove(ri, ci, e); }
  private _handleCellKeyEvt(name: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent): void { this._cellEvt.handleCellKeyEvt(name, e); }

  private _handleRowCheck(rowIndex: number, checked: boolean): void {
    this._rowMgr.check(rowIndex, checked);
    this._doRender(...this._visRange());
    this.emit('rowCheck', { rowIndex, checked, row: this._data.getRowByIndex(rowIndex) });
  }

  private _handleFilterIconClick(field: string, anchorEl: HTMLElement): void {
    if (this._filterPanel?.isOpen) {
      this._filterPanel.close();
      return;
    }
    const current = this._sfMgr.filters[field] ?? [];
    this._filterPanel?.open(field, anchorEl, current);
  }

  private _handleAllCheck(checked: boolean): void {
    this._rowMgr.checkAll(checked, this._data.rowCount);
    this._doRender(...this._visRange());
    this.emit('allCheck', { checked });
  }
  private _handleRowDrop(fromIndex: number, toIndex: number): void {
    this._data.moveRow(fromIndex, toIndex);
    this._doRender(...this._visRange());
    this.emit('rowDrop', { fromIndex, toIndex });
    this._options.onRowDrop?.({ fromIndex, toIndex });
  }

  // ── 크로스그리드 내부 헬퍼 ──
  /** 드래그/셔틀이 참조하는 바디 엘리먼트 (레지스트리 해석용) */
  _crossBodyEl(): HTMLElement { return this._renderer!.bodyWrapper; }
  /** fromIndex 를 잡고 드래그할 때 함께 이동할 행 집합 (다중선택에 포함되면 선택 전체) */
  private _dragRowSet(fromIndex: number): number[] {
    const sel = [...this._rowMgr.selectedRows];
    return (sel.length > 1 && sel.includes(fromIndex))
      ? sel.sort((a, b) => a - b)
      : [fromIndex];
  }

  /** 드래그 드롭 어댑터 → 공개 moveRowsTo 로 위임 */
  private _handleCrossGridDrop(fromIndex: number, targetBodyEl: HTMLElement, targetIndex: number): void {
    const targetGrid = crossGridRegistry.get(targetBodyEl) as OpenGrid<T> | undefined;
    if (!targetGrid || targetGrid === this) return;
    void this.moveRowsTo(targetGrid, this._dragRowSet(fromIndex), targetIndex);
  }

  /**
   * 이 그리드의 행들을 다른 그리드로 이동(move)한다. 드래그·화살표 셔틀 공통 경로.
   * 3단계 이벤트(before→after→complete)와 crossGridMapping(필드 매핑)을 적용한다.
   * @param targetGrid  대상 그리드
   * @param sourceIndexes 이동할 (표시)행 인덱스들
   * @param targetIndex 대상에서 삽입 위치 (생략 시 맨 끝에 추가)
   * @returns 이동 성공 true, 취소/무효 false
   */
  async moveRowsTo(
    target: OpenGridInstance<T>,
    sourceIndexes: number[],
    targetIndex?: number,
  ): Promise<boolean> {
    const targetGrid = target as OpenGrid<T>;
    if (!targetGrid || targetGrid === this || !sourceIndexes.length) return false;
    const idxAsc = [...new Set(sourceIndexes)].sort((a, b) => a - b);
    const at = targetIndex ?? targetGrid._data.rowCount;

    // 행 데이터 복사 (내부 id 제거 → 타깃이 새 id 부여)
    let rows = idxAsc.map(i => {
      const r = { ...(this._data.getRowByIndex(i) as any) };
      delete r[ROW_ID_FIELD];
      return r as T;
    });

    // 필드 매핑 (스키마가 다른 그리드 간 이동)
    const transform = await this._resolveCrossTransform(targetGrid);
    if (transform === false) return false;          // 매핑 모달 취소
    if (transform) rows = rows.map(r => transform(r) as T);

    const evt: GridDropEvent<T> = {
      sourceGrid: this, targetGrid, rows, sourceIndexes: idxAsc, targetIndex: at,
    };

    // ① 변경전 (양쪽). false 반환 또는 cancel=true 면 중단
    if (this._fireGridDropBefore(evt) === false || evt.cancel) return false;
    if (targetGrid._fireGridDropBefore(evt) === false || evt.cancel) return false;

    // 이동: 타깃에 순서대로 삽입 → 소스에서 내림차순 제거
    rows.forEach((row, k) => targetGrid.insertRow(row as Partial<T>, at + k));
    [...idxAsc].sort((a, b) => b - a).forEach(i => this.deleteRow(i));

    // ② 변경후
    this._fireGridDropAfter(evt);
    targetGrid._fireGridDropAfter(evt);
    // ③ 완료시 (insert/delete 가 이미 양쪽 재렌더)
    this._fireGridDropComplete(evt);
    targetGrid._fireGridDropComplete(evt);
    return true;
  }

  /** 체크된 행을 다른 그리드로 이동 (화살표 셔틀용). 체크 없으면 무시. */
  async moveCheckedTo(target: OpenGridInstance<T>): Promise<boolean> {
    const indexes = this._rowMgr.getChecked().map(c => c.rowIndex);
    if (!indexes.length) return false;
    this._rowMgr.uncheckAll();
    return this.moveRowsTo(target, indexes);
  }

  /**
   * 크로스그리드 이동의 행 변환 함수를 결정한다.
   * 반환: null=변환 불필요(그대로) / 함수=변환 적용 / false=매핑 모달 취소(이동 중단)
   */
  private async _resolveCrossTransform(targetGrid: OpenGrid<T>): Promise<((src: any) => any) | null | false> {
    const mode = this._options.crossGridMapping;
    if (typeof mode === 'function') return mode as (src: any) => any;
    if (mode !== 'interactive') return null;     // 'auto' → 그대로 복사

    const srcInfos: FieldInfo[] = this._colLayout.visibleLeaves.map(c => ({ field: c.field, header: c.header }));
    const tgtInfos: FieldInfo[] = targetGrid._colLayout.visibleLeaves.map(c => ({ field: c.field, header: c.header }));
    if (sameSchema(srcInfos.map(f => f.field), tgtInfos.map(f => f.field))) return null; // 스키마 동일 → 모달 불필요

    const result = await openCrossGridMapper(srcInfos, tgtInfos);
    if (!result) return false;                   // 취소
    const mapEvt: GridMappingEvent<T> = {
      sourceGrid: this, targetGrid,
      mapping: result.mapping, script: result.script,
    };
    this.emit('gridDropMapping', mapEvt);
    this._options.onGridDropMapping?.(mapEvt);
    // 콘솔에도 출력 — 개발자가 바로 복사해 baking 하도록
    console.log('[OpenGrid] cross-grid mapping script:\n' + buildMappingScript(result.mapping));
    return buildTransform(result.mapping);
  }

  private _fireGridDropBefore(e: GridDropEvent<T>): boolean | void {
    this.emit('gridDropBefore', e);
    return this._options.onGridDropBefore?.(e);
  }
  private _fireGridDropAfter(e: GridDropEvent<T>): void {
    this.emit('gridDropAfter', e);
    this._options.onGridDropAfter?.(e);
  }
  private _fireGridDropComplete(e: GridDropEvent<T>): void {
    this.emit('gridDropComplete', e);
    this._options.onGridDropComplete?.(e);
  }
  /** 행을 드롭으로 이동할 때 실행된다 */
  /** ???꾩튂 ?대룞 */
  reorderRow(fromIndex: number, toIndex: number): void {
    this._data.moveRow(fromIndex, toIndex);
    this._doRender(...this._visRange());
  }
  private _handleColResize(colIndex: number, newWidth: number): void {
    if (this._colWidths[colIndex] !== undefined) {
      this._colWidths[colIndex] = newWidth;
    }
    // 사용자가 조절한 폭을 field 기준으로 기억 → 이후 재계산(_recalcWidths)에서 보존
    const leaf = this._colLayout.visibleLeaves[colIndex];
    if (leaf) this._userWidths.set(leaf.field, newWidth);
    this._renderHeader();                 // 헤더 폭도 즉시 동기화
    this._doRender(...this._visRange());
  }
  private _handleKeyDown(e: KeyboardEvent): void { this._kbdMgr.handleKeyDown(e); }

  private _setFocusCell(ri: number, ci: number): void {
    this._rowMgr.selectSingle(ri);
    this._editMgr.setFocusCell(ri, ci);
  }
  // 스크린리더에게 텍스트를 읽어준다 (aria-live)
  private _announce(msg: string): void {
    if (!this._liveRegion) return;
    this._liveRegion.textContent = '';
    setTimeout(() => { if (this._liveRegion) this._liveRegion.textContent = msg; }, 50);
  }

  private _bindOptionEvents(): void {
    if (this._options.onCellClick) this.on('cellClick', this._options.onCellClick);
    if (this._options.onCellDblClick) this.on('cellDblClick', this._options.onCellDblClick);
    if (this._options.onRowClick) this.on('rowClick', this._options.onRowClick);
    if (this._options.onEditStart) this.on('editStart', this._options.onEditStart);
    if (this._options.onEditEnd) this.on('editEnd', this._options.onEditEnd);
    if (this._options.onSortChange) this.on('sortChange', this._options.onSortChange);
    if (this._options.onFilterChange) this.on('filterChange', this._options.onFilterChange);
    if (this._options.onScroll) this.on('scroll', this._options.onScroll);
    if (this._options.onDataChange) this.on('dataChange', this._options.onDataChange);
    if (this._options.onSelectionChange) this.on('selectionChange', this._options.onSelectionChange);
    // Sprint 35 ?좉퇋
    if (this._options.onRowDblClick)    this.on('rowDblClick',    this._options.onRowDblClick);
    if (this._options.onRowMouseOver)   this.on('rowMouseOver',   this._options.onRowMouseOver);
    if (this._options.onRowMouseOut)    this.on('rowMouseOut',    this._options.onRowMouseOut);
    if (this._options.onRowMouseDown)   this.on('rowMouseDown',   this._options.onRowMouseDown);
    if (this._options.onRowMouseUp)     this.on('rowMouseUp',     this._options.onRowMouseUp);
    if (this._options.onRowMouseMove)   this.on('rowMouseMove',   this._options.onRowMouseMove);
    if (this._options.onCellMouseOver)  this.on('cellMouseOver',  this._options.onCellMouseOver);
    if (this._options.onCellMouseOut)   this.on('cellMouseOut',   this._options.onCellMouseOut);
    if (this._options.onCellMouseDown)  this.on('cellMouseDown',  this._options.onCellMouseDown);
    if (this._options.onCellMouseUp)    this.on('cellMouseUp',    this._options.onCellMouseUp);
    if (this._options.onCellMouseMove)  this.on('cellMouseMove',  this._options.onCellMouseMove);
    if (this._options.onCellKeyDown)    this.on('cellKeyDown',    this._options.onCellKeyDown);
    if (this._options.onCellKeyUp)      this.on('cellKeyUp',      this._options.onCellKeyUp);
    if (this._options.onCellKeyPress)   this.on('cellKeyPress',   this._options.onCellKeyPress);
    // F2(C5.1 on* 버킷)
    if (this._options.onRowExpand)      this.on('rowExpand',      this._options.onRowExpand);
    if (this._options.onRowCollapse)    this.on('rowCollapse',    this._options.onRowCollapse);
  }
  setData(data: T[]): void {
    const ctx = this._trigMgr.mkCtx('setData', [data]);
    if (!this._trigMgr.exec('before:setData', ctx)) return;
    this._rowMgr.reset();
    this._data.setData(data);
    // F3(§9 E11): setData 는 rowId 를 재발급하므로 stable-id 앵커에 묶인 기존 수식은 전량
    // 무효(MVP, rowId 재바인딩은 P2) — 오케스트레이터를 새로 만들어 사이드카/그래프를 비운다.
    this._formulaDirtySeeds.clear();
    this._recalc = new RecalcCoordinator({
      accessor: this._buildFormulaAccessor(),
      setComputedValue: (rowId, field, value) => this._data.setComputedValueByRowId(rowId, field, value),
      onFormulaError: (rowId, field, error) => this._handleFormulaError(rowId, field, error),
      refMode: (this._options as any).formula?.refMode ?? 'stable',
      divisionPrecision: (this._options as any).formula?.divisionPrecision ?? 30,
    });
    this._applyFilters();
    if (this._grpMgr.isTreeMode) {
      this._grpMgr.rebuildTree();
    } else if (this._grpMgr.isGroupMode) {
      this._grpMgr.rebuildGroups();
    } else {
      this._vs?.setTotalRows(this._flatModel.count());
    }
    this._container.setAttribute('aria-rowcount', String(this._data.rowCount));
    this._container.setAttribute('aria-colcount', String(this._colLayout.visibleLeaves.length));
    this._announce(`${this._data.rowCount}행 데이터 로드됨`);
    this.emit('dataChange', this._data.getData());
    ctx.result = data.length;
    this._trigMgr.exec('after:setData', ctx);
  }

  getData(): T[] { return this._data.getData(); }
  getSourceRows(): T[] { return this._data.getOriginalData(); }

  pushData(data: T[]): void {
    const combined = [...this._data.getAllData(), ...data];
    this._data.setData(combined);
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
  }

  prefixData(data: T[]): void {
    const combined = [...data, ...this._data.getAllData()];
    this._data.setData(combined);
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
  }

  clearData(): void {
    this._rowMgr.reset();
    this._data.clearData();
    this._vs?.setTotalRows(0);
    this._pagination?.setTotalRows(0);
    this._doRender(0, -1);
    this.emit('dataChange', []);
  }

  insertRow(item: Partial<T>, position: Position = 'last'): void {
    const ctx = this._trigMgr.mkCtx('insertRow', [item, position]);
    if (!this._trigMgr.exec('before:insertRow', ctx)) return;
    const pos = position === 'before' ? 0
      : position === 'after' ? this._data.rowCount
      : position as any;
    this._data.addRow(item, pos);
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
    this._doRender(...this._visRange());
    this.emit('dataChange', this._data.getData());
    this._options.onDataChange?.(this._data.getData());
    ctx.result = { rowCount: n, item };
    this._trigMgr.exec('after:insertRow', ctx);
  }

  pushRow(items: Partial<T> | Partial<T>[]): void {
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(it => this._data.addRow(it, 'last'));
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
    this._doRender(...this._visRange());
    this.emit('dataChange', this._data.getData());
    this._options.onDataChange?.(this._data.getData());
  }

  /** @deprecated 하위호환 alias → pushRow */
  appendRows(items: Partial<T> | Partial<T>[]): void { this.pushRow(items); }

  unshiftRow(items: Partial<T> | Partial<T>[]): void {
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(it => this._data.addRow(it, 'first'));
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
    this._doRender(...this._visRange());
    this.emit('dataChange', this._data.getData());
    this._options.onDataChange?.(this._data.getData());
  }

  /** @deprecated 하위호환 alias → unshiftRow */
  prependRows(items: Partial<T> | Partial<T>[]): void { this.unshiftRow(items); }

  deleteRow(rowIndex: number | number[]): void {
    const ctx = this._trigMgr.mkCtx('deleteRow', [rowIndex]);
    const idxArr = Array.isArray(rowIndex) ? [...rowIndex] : [rowIndex];
    ctx.extra = { rows: idxArr.map(i => this._data.getRowByIndex(i)) };
    if (!this._trigMgr.exec('before:deleteRow', ctx)) return;
    const idxs = idxArr.sort((a, b) => b - a);
    // F3-R28/MCCONNELL-02(P0): 삭제되는 rowId 를 먼저 확보(제거 후엔 flat index 로 되짚을 수 없다) →
    // 삭제 완료 후 그 rowId 를 deps 로 가진 수식들을 #REF 로 무효화(자연 귀결, invalidateRow).
    const removedRowIds = idxs
      .map(i => (this._data.getRowByIndex(i) as any)?.[ROW_ID_FIELD] as string | undefined)
      .filter((id): id is string => id != null);
    idxs.forEach(i => this._data.removeRow(i));
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
    for (const rowId of removedRowIds) this._afterRecalc(this._recalc.invalidateRow(rowId), { skipRender: true });
    this._doRender(...this._visRange());
    this.emit('dataChange', this._data.getData());
    this._options.onDataChange?.(this._data.getData());
    ctx.result = { deleted: idxs.length, rowCount: n };
    this._trigMgr.exec('after:deleteRow', ctx);
  }

  deleteById(_ids: string[]): void { /* 異뷀썑 援ы쁽 */ }

  readCell(rowIndex: number, field: string): any {
    return this._data.getCellValue(rowIndex, field);
  }
  getDisplayValue(rowIndex: number, field: string): string {
    const val = this.readCell(rowIndex, field);
    // Phase 2 슬롯 #3: displayFormatter(본문 1줄 — C1 최소 침습 예외). default = 현행(null→'', else String).
    const fmt = this._ovk.getStrategy(
      'displayFormatter',
      (v: any, _f: string, _row: any): string => (v == null ? '' : String(v)),
    );
    return fmt(val, field, this._data.getRowByIndex(rowIndex));
  }

  writeCell(rowIndex: number, field: string, value: any): void {
    const old = this.readCell(rowIndex, field);
    const ctx = this._trigMgr.mkCtx('writeCell', [rowIndex, field, value]);
    ctx.extra = { oldValue: old, rowIndex, field };
    if (!this._trigMgr.exec('before:writeCell', ctx)) return;
    this._data.updateCell(rowIndex, field, value);
    const row = this._data.getRowByIndex(rowIndex);
    const col = this._colLayout.getColumnByField(field);
    const ci = this._colLayout.getColumnIndex(field);
    const evt: EditEvent<T> = { type: 'editEnd', rowIndex, columnIndex: ci, field, oldValue: old, newValue: value, row: row as T, column: col as any };
    this.emit('editEnd', evt);
    this._options.onEditEnd?.(evt);
    // F3(C2/§8.5): 값이 바뀐 셀을 dirty seed 로 적립 — 배치 중이면 endBatch 에서, 아니면
    // 아래에서 즉시 onValuesChanged([key]) 1회로 소비한다(수식 셀 자신의 값 직접 덮어쓰기 포함).
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind === 'data' && ref.rowId) this._formulaDirtySeeds.add(cellKey(ref.rowId, field));
    // Phase 0(C2.1): 배치 중이면 render·dataChange 를 coalesce — endBatch 에서 1회만 발생시킨다.
    if (this._batchDepth > 0) {
      this._batchDirty = true;
    } else {
      this._flushFormulaRecalc();
      this.emit('dataChange', this._data.getData());
      this._options.onDataChange?.(this._data.getData());
      this._doRender(...this._visRange());
    }
    ctx.result = { rowIndex, field, oldValue: old, newValue: value };
    this._trigMgr.exec('after:writeCell', ctx);
  }

  getRowAt(rowIndex: number): T { return this._data.getRowByIndex(rowIndex) as T; }

  // ── Phase 0 인프라 ──────────────────────────────────────

  /** flat/visual index ↔ data 리졸버(C0.3). F1/F3/F4 는 이 모델만 경유해야 한다. */
  getFlatRowModel(): FlatRowModel { return this._flatModel; }

  /**
   * 배치 쓰기 시작(C2.1). 이후 writeCell 호출들은 render/dataChange 를 지연·coalesce 한다.
   * 중첩 호출은 카운팅(reentrant) — 가장 바깥 endBatch 에서만 실제로 flush 된다.
   */
  beginBatch(): void { this._batchDepth++; }

  /**
   * 배치 종료(C2.1). 카운터가 0 이 되는 시점에 한해 배치 중 발생한 쓰기가 있으면
   * _doRender 1회 + dataChange 1회를 발생시킨다(둘 다 0회 또는 1회 — 폭주 차단).
   * 향후 F3 재계산 훅 지점: 아래 flush 블록 안에 RecalcCoordinator.onValuesChanged(dirtyKeys)
   * 1회 호출을 끼워 넣는다(Phase 0 시점엔 미구현 — 계약 §C2.1 참조).
   */
  endBatch(): void {
    if (this._batchDepth === 0) return; // 불균형 호출 방어
    this._batchDepth--;
    if (this._batchDepth === 0 && this._batchDirty) {
      this._batchDirty = false;
      // F3(C2.1): 배치 중 쌓인 dirty seed 전체를 여기서 1회 onValuesChanged 로 소비(R×C fill = 1패스).
      this._flushFormulaRecalc();
      this.emit('dataChange', this._data.getData());
      this._options.onDataChange?.(this._data.getData());
      this._doRender(...this._visRange());
    }
  }

  // ── F3: 재계산 배치 소비 + formulaRecalc 표면화(§C2.2, §5.3) ────────────
  /** writeCell 이 적립한 dirty seed 를 1회 onValuesChanged 로 소비하고 formulaRecalc 를 emit. */
  private _flushFormulaRecalc(): void {
    if (this._formulaDirtySeeds.size === 0) return;
    const seeds = [...this._formulaDirtySeeds];
    this._formulaDirtySeeds.clear();
    this._afterRecalc(this._recalc.onValuesChanged(seeds), { skipRender: true });
  }

  /**
   * RecalcCoordinator 호출 결과를 표면화: formulaError 는 onFormulaError 콜백에서 이미 개별
   * emit 되므로 여기선 배치당 1회 formulaRecalc 만 emit(C2.2 개명, `recalc`→`formulaRecalc`).
   * Spike-A §8 교훈: 폐포가 큰 재계산은 large 플래그로 표시(가이드 문서화/모니터링용).
   */
  private _afterRecalc(summary: RecalcSummary, opts: { skipRender?: boolean } = {}): void {
    if (summary.changed.length > 0 || summary.cycles > 0) {
      const evt = {
        changed: summary.changed,
        cycles: summary.cycles,
        ms: summary.ms,
        large: summary.changed.length > FORMULA_LARGE_RECALC_THRESHOLD,
      };
      this.emit('formulaRecalc', evt);
      (this._options as any).formula?.onFormulaRecalc?.(evt);
    }
    if (!opts.skipRender) this._doRender(...this._visRange());
  }

  private _handleFormulaError(rowId: string, field: string, error: FormulaErrorCode): void {
    const rowIndex = this._flatModel.flatIndexOfRowId(rowId);
    const evt = { rowIndex, field, error };
    this.emit('formulaError', evt);
    (this._options as any).formula?.onFormulaError?.(evt);
    this._announce(`${field} 셀 오류: ${this._formulaErrorMessageKo(error)}`);
  }

  private _formulaErrorMessageKo(error: FormulaErrorCode): string {
    switch (error) {
      case '#REF': return '참조 대상이 삭제됨';
      case '#CYCLE': return '순환 참조';
      case '#VALUE': return '숫자가 아닌 값에 산술 연산';
      case '#DIV0': return '0으로 나눔';
      case '#NAME': return '알 수 없는 함수/이름';
      case '#NUM': return '수치 도메인 오류';
      default: return '수식 오류';
    }
  }

  /** F3 accessor(C0/C0.5/C1) — FlatRowModel + ColumnLayout.visibleLeaves + DataLayer(rowId 기반)만 본다. */
  private _buildFormulaAccessor(): FormulaGridAccessor {
    return {
      visibleFields: () => this._colLayout.visibleLeaves.map(c => c.field as string),
      rowIdAtFlat: (flatIndex) => {
        const ref = this._flatModel.resolveFlatRow(flatIndex);
        return ref.kind === 'data' ? (ref.rowId ?? null) : null;
      },
      flatIndexOfRowId: (rowId) => this._flatModel.flatIndexOfRowId(rowId),
      displayedRowIds: () => {
        const out: string[] = [];
        const n = this._flatModel.count();
        for (let i = 0; i < n; i++) {
          const ref = this._flatModel.resolveFlatRow(i);
          if (ref.kind === 'data' && ref.rowId) out.push(ref.rowId);
        }
        return out;
      },
      getCellValue: (rowId, field) => this._data.getCellValueByRowId(rowId, field),
      hasRow: (rowId) => this._data.hasRow(rowId),
      hasField: (field) => this._colLayout.getColumnByField(field) != null,
    };
  }

  // ── F3: 공개 API(§8.2) — rowIndex 는 flat(C0), 내부 즉시 stable rowId 로 정규화 ──────
  setCellFormula(rowIndex: number, field: string, formula: string): void {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    this._setCellFormulaByRowId(ref.rowId, field, formula, rowIndex);
  }

  private _setCellFormulaByRowId(rowId: string, field: string, formula: string, rowIndexHint?: number): void {
    const rowIndex = rowIndexHint ?? this._flatModel.flatIndexOfRowId(rowId);
    const oldFormula = this._recalc.getCellFormula(rowId, field);
    const summary = this._recalc.setCellFormula(rowId, field, formula);
    const evt = { rowIndex, field, formula, oldFormula };
    this.emit('formulaChange', evt);
    (this._options as any).formula?.onFormulaChange?.(evt);
    this._afterRecalc(summary);
  }

  getCellFormula(rowIndex: number, field: string): string | null {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    return this._recalc.getCellFormula(ref.rowId, field);
  }

  hasCellFormula(rowIndex: number, field: string): boolean {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    return ref.kind === 'data' && !!ref.rowId && this._recalc.hasCellFormula(ref.rowId, field);
  }

  clearCellFormula(rowIndex: number, field: string): void {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    const dependents = this._recalc.clearCellFormula(ref.rowId, field);
    if (dependents.length) this._afterRecalc(this._recalc.onValuesChanged(dependents));
    else this._doRender(...this._visRange());
  }

  getCellError(rowIndex: number, field: string): FormulaErrorCode | null {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    return this._recalc.getCellError(ref.rowId, field);
  }

  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return [];
    return this._recalc.getDependents(ref.rowId, field)
      .map(({ rowId, field: f }) => ({ rowIndex: this._flatModel.flatIndexOfRowId(rowId), field: f }));
  }

  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return [];
    return this._recalc.graph.getPrecedents(cellKey(ref.rowId, field))
      .map(parseCellKey)
      .map(({ rowId, field: f }) => ({ rowIndex: this._flatModel.flatIndexOfRowId(rowId), field: f }));
  }

  recalculate(): void { this._afterRecalc(this._recalc.recalculateAll()); }

  recalculateCell(rowIndex: number, field: string): void {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    this._afterRecalc(this._recalc.onValuesChanged([cellKey(ref.rowId, field)]));
  }

  /** C3(F1 fill 전용): srcRowId/srcField 수식의 상대축만 dRow/dCol 오프셋한 새 수식 원문. */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    return this._recalc.offsetFormula(srcRowId, srcField, dRow, dCol);
  }

  /** F3 렌더 배선(§4.4/C7, §7.4/§7.5/§7.6) — 셀 수식 메타(없으면 null). */
  private _getFormulaMeta(rowIndex: number, field: string): { src: string; error: FormulaErrorCode | null; approx: boolean } | null {
    const ref = this._flatModel.resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    const cell = this._recalc.store.getFormula(ref.rowId, field);
    if (!cell) return null;
    return { src: cell.src, error: cell.error, approx: !!cell.approx };
  }

  /**
   * beginBatch+루프+endBatch 래퍼(C2.1). patches 의 rowIndex 는 flat index — 대상이
   * FlatRowModel.resolveFlatRow 로 해소해 kind!=='data' (group/tree/detail 의사행)이면
   * 쓰기 전에 skip 한다(C0.3 쓰기 안전, filler 에 writeCell 절대 금지).
   * 건너뛴 셀 수를 반환하고, 1건이라도 있으면 announce + 'writeCellsSkip' 이벤트로 표면화한다.
   */
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number {
    this.beginBatch();
    let skipped = 0;
    for (const p of patches) {
      const ref: FlatRowRef = this._flatModel.resolveFlatRow(p.rowIndex);
      if (ref.kind !== 'data') { skipped++; continue; }
      this.writeCell(p.rowIndex, p.field, p.value);
    }
    this.endBatch();
    if (skipped > 0) {
      this._announce(`쓰기 대상이 아닌 셀 ${skipped}개를 건너뛰었습니다`);
      this.emit('writeCellsSkip', { skipped, total: patches.length });
    }
    return skipped;
  }

  // ── F1: 범위 선택 + 채우기 핸들(11_design_F1_v2.md §6.2, C4) ────────────
  getRangeSelection(): CellRange[] { return this._rangeMgr.getRangeSelection(); }
  getActiveRange(): CellRange | null { return this._rangeMgr.getActiveRange(); }
  setRangeSelection(range: CellRange | CellRange[]): void { this._rangeMgr.setRangeSelection(range); }
  clearRangeSelection(): void { this._rangeMgr.clearRangeSelection(); }
  getRangeValues(): any[][] { return this._rangeMgr.getRangeValues(); }
  getRangeStats(): RangeStats | null { return this._rangeMgr.getRangeStats(); }
  fillRange(source: CellRange, target: CellRange, mode: 'copy' | 'series' = 'copy'): void {
    this._rangeMgr.fillRange(source, target, mode);
  }

  // ── F4: 그리드 데이터 통합 차트(11_design_F4_v2.md §6, C5) ──────────────
  createChart(config: ChartConfig): ChartInstance { return this._chartMgr.createChart(config); }
  getCharts(): ChartInstance[] { return this._chartMgr.getCharts(); }
  destroyCharts(): void { this._chartMgr.destroyCharts(); }

  getChanges(): { added: T[]; edited: T[]; removed: T[] } { return this._data.getChanges(); }
  getEditedRows(): T[] { return this._data.getEditedRows(); }
  getChangedRows(): T[] { return this._data.getChangedRows(); }  // ?섏쐞 ?명솚
  getChangedColumns(): Array<{ row: T; fields: string[]; diff: Array<{ field: string; oldValue: any; newValue: any }> }> {
    return this._data.getChangedColumns();
  }
  getAddedRows(): T[] { return this._data.getAddedRows(); }
  getRemovedRows(): T[] { return this._data.getRemovedRows(); }
  getOriginalRow(rowIndex: number): T | undefined { return this._data.getOriginalRow(rowIndex); }
  getRowsWithState(stateField: string): T[] { return this._data.getRowsWithState(stateField); }
  undo(): void {}
  redo(): void {}
  clearHistory(): void {}
  getColumnDefs(): ColumnDef<T>[] { return this._colLayout.visibleLeaves; }
  getAllColumnDefs(): ColumnDef<T>[] { return this._colLayout.leaves; }
  getColumnCount(): number { return this._colLayout.visibleLeaves.length; }
  applyColumns(columns: ColumnDef<T>[]): void {
    const ctx = this._trigMgr.mkCtx('applyColumns', [columns]);
    if (!this._trigMgr.exec('before:applyColumns', ctx)) return;
    this._colLayout.setColumns(columns);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader();
    this._doRender(...this._visRange());
    ctx.result = { columnCount: columns.length };
    this._trigMgr.exec('after:applyColumns', ctx);
  }
  insertColumn(colDef: ColumnDef<T>, position?: Position): void {
    this._colLayout.addColumn(colDef, position as any);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  deleteColumn(field: string): void {
    this._colLayout.removeColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    // F3-R28(P0): 열 삭제 → 그 field 를 deps 로 가진 수식들이 자연 #REF 귀결(accessor.hasField=false).
    this._afterRecalc(this._recalc.invalidateField(field), { skipRender: true });
    this._renderHeader(); this._doRender(...this._visRange());
  }

  private _reorderColumn(fromIdx: number, toIdx: number): void {
    const leaves = this._colLayout.visibleLeaves.map(l => l as ColumnDef<T>);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= leaves.length || toIdx >= leaves.length) return;
    const reordered = [...this._options.columns];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    this._options.columns = reordered;
    this.applyColumns(reordered);
    this._options.onColumnReorder?.({ fromIndex: fromIdx, toIndex: toIdx, field: moved.field ?? '' });
  }
  hideColumn(field: string | string[]): void {
    this._colLayout.hideColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  showColumn(field: string | string[]): void {
    this._colLayout.showColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  getColumnIndex(field: string): number { return this._colLayout.getColumnIndex(field); }
  getFieldAt(idx: number): string { return this._colLayout.getColumnByIndex(idx)?.field ?? ''; }
  getColValues(field: string, _all = false): any[] { return this._data.getData().map(r => r[field]); }
  getUniqueValues(field: string, all = false): any[] { return [...new Set(this.getColValues(field, all))]; }
  setColWidths(_widths: number[]): void {}
  calcColWidths(_fitToGrid = false): number[] { return []; }
  getSelections(): T[] { return this._rowMgr.getSelections(); }
  getActiveRow(): number { return this._rowMgr.getActiveRow(); }
  activate(index: number): void { this._rowMgr.activate(index); this._doRender(...this._visRange()); }
  deselect(): void { this._rowMgr.deselect(); this._doRender(...this._visRange()); }
  getChecked(): Array<{ row: T; rowIndex: number }> { return this._rowMgr.getChecked(); }
  getAllChecked(): T[] { return this._rowMgr.getAllChecked(); }
  checkById(_ids: string[]): void {}
  addCheckById(_ids: string[]): void {}
  checkByValue(field: string, values: any[]): void {
    this._rowMgr.checkByValue(field, values);
    this._doRender(...this._visRange());
  }
  uncheckById(_ids: string[]): void {}
  uncheckAll(): void { this._rowMgr.uncheckAll(); this._doRender(...this._visRange()); }
  orderBy(fieldOrList: string | SortItem[], dir: 'asc' | 'desc' = 'asc'): void {
    const ctx = this._trigMgr.mkCtx('orderBy', [fieldOrList, dir]);
    if (!this._trigMgr.exec('before:orderBy', ctx)) return;
    this._sfMgr.sort(fieldOrList, dir);
    this._recalcRangeBearingFormulas();
    ctx.result = { sortList: this._sfMgr.sortList };
    this._trigMgr.exec('after:orderBy', ctx);
  }
  resetOrder(): void { this._sfMgr.resetSort(); this._recalcRangeBearingFormulas(); }
  setFilter(field: string, filterItems: FilterItem[]): void {
    const ctx = this._trigMgr.mkCtx('setFilter', [field, filterItems]);
    if (!this._trigMgr.exec('before:setFilter', ctx)) return;
    this._sfMgr.setFilter(field, filterItems);
    this._recalcRangeBearingFormulas();
    ctx.result = { field, filteredCount: this._data.rowCount };
    this._trigMgr.exec('after:setFilter', ctx);
  }
  resetFilter(field?: string): void { this._sfMgr.resetFilter(field); this._recalcRangeBearingFormulas(); }

  /** F3-R13/MCCONNELL-03(P0): 정렬/필터 후 범위-보유(hasRangeRef) 수식 전부 dirty(§3.5). */
  private _recalcRangeBearingFormulas(): void {
    this._afterRecalc(this._recalc.recalcRangeBearing());
  }
  getFilterState(): Record<string, FilterItem[]> { return this._sfMgr.getFilterState(); }
  restoreFilter(state: Record<string, FilterItem[]>): void { this._sfMgr.restoreFilter(state); }
  private _applyFilters(): void { this._sfMgr.applyFilters(); }
  freeze(n: number): void { this._colLayout.setFrozen(n); this._renderHeader(); this._doRender(...this._visRange()); }
  /** ?섎룞 蹂묓빀: [{row, col, rowSpan?, colSpan?}] */
  mergeCells(cells: MergeCell[]): void {
    this._mergeEngine.applyMergeCells(cells);
    this._doRender(...this._visRange());
  }
  /** 자동 병합: 지정 필드 컬럼에서 연속 같은 값을 rowSpan으로 묶는다 */
  /** ?먮룞 蹂묓빀: 吏??field 而щ읆?먯꽌 ?곗냽 媛숈? 媛믪쓣 rowSpan */
  autoMerge(fields: string[]): void {
    const leaves = this._colLayout.visibleLeaves;
    const colIndexes: number[] = [];
    const fieldNames: string[] = [];
    for (const f of fields) {
      const ci = leaves.findIndex(l => l.field === f);
      if (ci >= 0) { colIndexes.push(ci); fieldNames.push(f); }
    }
    this._mergeEngine.applyAutoMerge(this._data.getData(), colIndexes, fieldNames);
    this._doRender(...this._visRange());
  }

  /** 蹂묓빀 ?댁젣 */
  clearMerge(): void {
    this._mergeEngine.clear();
    this._doRender(...this._visRange());
  }
  freezeRows(_n: number): void {}
  groupBy(fields: string[]): void {
    const ctx = this._trigMgr.mkCtx('groupBy', [fields]);
    if (!this._trigMgr.exec('before:groupBy', ctx)) return;
    this._grpMgr.groupBy(fields);
    ctx.result = { fields };
    this._trigMgr.exec('after:groupBy', ctx);
  }
  clearGroup(): void { this._grpMgr.clearGroup(); }
  expandAll(): void { this._grpMgr.expandAll(); }
  collapseAll(): void { this._grpMgr.collapseAll(); }
  enableTree(): void { this._grpMgr.enableTree(); }
  disableTree(): void { this._grpMgr.disableTree(); }
  expandNodes(ids: any | any[], open = true): void { this._grpMgr.expandNodes(ids, open); }
  expandAllNodes(): void { this._grpMgr.expandAllNodes(); }
  collapseAllNodes(): void { this._grpMgr.collapseAllNodes(); }

  // ── F2: 마스터/디테일(11_design_F2_v2.md §6.2) ────────────────────────
  expandRow(rowRef: number | { id: string }): void { this._detailMgr.expandRow(rowRef); }
  collapseRow(rowRef: number | { id: string }): void { this._detailMgr.collapseRow(rowRef); }
  toggleRow(rowRef: number | { id: string }): void { this._detailMgr.toggleRow(rowRef); }
  isRowExpanded(rowRef: number | { id: string }): boolean { return this._detailMgr.isRowExpanded(rowRef); }
  collapseAllDetails(): void { this._detailMgr.collapseAllDetails(); }
  getDetailInstance<D = any>(rowRef: number | { id: string }): D | undefined { return this._detailMgr.getDetailInstance<D>(rowRef); }
  resyncPanelWidths(): void { this._detailMgr.resyncPanelWidths(); }
  addTreeRow(_item: Partial<T>, _pid: string, _pos?: Position): void {}
  exportExcel(options?: ExportOptions | string): void { this._exportMgr.exportExcel(options); }
  exportCsv(options?: ExportOptions | string): void { this._exportMgr.exportCsv(options); }
  exportJson(options?: ExportOptions | string): void { this._exportMgr.exportJson(options); }
  print(options?: { title?: string; excludeFields?: string[] }): void { this._exportMgr.print(options); }

  toArray(keyValue = true): any[] {
    const data = this._data.getData();
    if (keyValue) return data;
    const cols = this._colLayout.visibleLeaves;
    return data.map(row => cols.map(c => row[c.field]));
  }
  jumpToRow(rowIndex: number): void {
    this._rowMgr.selectSingle(rowIndex);
    this._vs?.scrollToRow(rowIndex);
    this._doRender(...this._visRange());
  }
  jumpToCol(_field: string): void {}
  getScrollPos(): { x: number; y: number } {
    return { x: this._renderer?.bodyWrapper.scrollLeft ?? 0, y: this._renderer?.bodyWrapper.scrollTop ?? 0 };
  }
  setFooter(fd: any[]): void {
    this._options.footer = fd as any;
    this._renderFooterEl();
  }
  getFooterData(): any[] { return this._footerMgr.computeValues(); }
  getFooterValue(field: string): any {
    return this._footerMgr.computeValues().find((r: any) => r._field === field)?._value ?? null;
  }
  private _renderFooterEl(): void { this._footerMgr.render(); }

  resize(w?: number, h?: number): void {
    if (w) this._container.style.width = `${w}px`;
    if (h) this._container.style.height = `${h}px`;
    this._onResize();
  }
  setTheme(theme: string): void { this._container.setAttribute('data-og-theme', theme); }
  setThemeVar(k: string, v: string): void { this._container.style.setProperty(k, v); }
  addTrigger(event: TriggerEvent | string, handler: TriggerHandler): this {
    this._trigMgr.add(event, handler); return this;
  }
  removeTrigger(event: TriggerEvent | string, handler: TriggerHandler): this {
    this._trigMgr.remove(event, handler); return this;
  }
  clearTriggers(event?: TriggerEvent | string): this {
    this._trigMgr.clear(event); return this;
  }
  private _mkCtx(operation: string, args: any[]): TriggerContext { return this._trigMgr.mkCtx(operation, args); }
  private _trig(event: string, ctx: TriggerContext): boolean { return this._trigMgr.exec(event, ctx); }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._renderer) crossGridRegistry.unregister(this._renderer.bodyWrapper);
    this._trigMgr.clear();
    this._ro?.disconnect();
    this._vs?.destroy();
    this._chartMgr?.destroyCharts();   // F4: 열린 차트 패널·구독 누수 방지(§5.2)
    this._detailMgr?.destroy();
    this._filterPanel?.destroy();
    this._dnd?.destroy();
    if (this._cmHandler)    this._container.removeEventListener('contextmenu', this._cmHandler);
    if (this._cmKbdHandler) this._container.removeEventListener('keydown',     this._cmKbdHandler);
    this._cmHandler = this._cmKbdHandler = null;
    this._ctxMenu?.destroy();
    this._wsManager?.destroy();
    this._renderer?.destroy();
    this._liveRegion?.remove();
    this._liveRegion = null;
    this._container.innerHTML = '';
    this._container.classList.remove('og-container');
    this.removeAllListeners();
  }
}


