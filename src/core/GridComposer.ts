import { DataLayer } from './DataLayer.js';
import { FlatRowModel } from './FlatRowModel.js';
import { RowManager } from './RowManager.js';
import { ColumnLayout } from './ColumnLayout.js';
import { FormulaController } from './FormulaController.js';
import { RecalcCoordinator } from './formula/RecalcCoordinator.js';
import { CellEditManager } from './CellEditManager.js';
import { ExportManager } from './ExportManager.js';
import { FooterManager } from './FooterManager.js';
import { KeyboardManager } from './KeyboardManager.js';
import { SortFilterManager } from './SortFilterManager.js';
import { FindBarManager } from './FindBarManager.js';
import { CellEventHandler } from './CellEventHandler.js';
import { RangeSelectionManager } from './RangeSelectionManager.js';
import { GroupTreeManager } from './GroupTreeManager.js';
import { DetailManager } from './DetailManager.js';
import { ChartManager } from './ChartManager.js';
import { OverrideKernel } from './OverrideKernel.js';
import { localeRegistry, LocaleRegistry } from './i18n/LocaleRegistry.js';
import type { GridRenderer } from './GridRenderer.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { Pagination } from './Pagination.js';
import type { WorksheetManager } from './WorksheetManager.js';
import type { GridOptions } from './types.js';

/** OpenGrid 의 rowId 영속 필드(파사드와 동일 상수). */
const ROW_ID_FIELD = '_ogRowId';

/**
 * R8(§3.1 C2, §3.3): GridComposer 가 조립하며 접근하는 OpenGrid 의 내부 표면.
 *
 * OpenGrid 의 private 필드/메서드를 구조적으로 미러링한다. 여기 열거된 멤버만이 컴포저가
 * 조립 중 대입·참조하는 대상이며, 잘못된 이름/타입의 대입은 이 인터페이스로 인해 컴파일
 * 타임에 잡힌다(순수 `any` host 보다 안전). `_mount` 본체(renderer/vs/pagination 등 DOM
 * 배선)는 여전히 OpenGrid 가 소유하며, 컴포저는 mount 단계에서 `_mount()` 를 호출만 한다.
 */
export interface ComposerHost<T extends Record<string, any> = any> {
  _container: HTMLElement;
  _options: Required<GridOptions<T>>;
  _data: DataLayer<T>;
  _flatModel: FlatRowModel;
  _rowMgr: RowManager<T>;
  _colLayout: ColumnLayout<T>;
  _formula: FormulaController<T>;
  _recalc: RecalcCoordinator;
  _editMgr: CellEditManager<T>;
  _exportMgr: ExportManager<T>;
  _footerMgr: FooterManager<T>;
  _kbdMgr: KeyboardManager<T>;
  _sfMgr: SortFilterManager<T>;
  _findMgr: FindBarManager<T>;
  _cellEvt: CellEventHandler<T>;
  _rangeMgr: RangeSelectionManager<T>;
  _grpMgr: GroupTreeManager<T>;
  _detailMgr: DetailManager<T>;
  _chartMgr: ChartManager;
  _ovk: OverrideKernel;
  /** i18n: per-instance 로케일 오버라이드 child(전역 localeRegistry 의 child). 미지정 시 null → 전역 직행. */
  _locales: LocaleRegistry | null;
  // ── mount 단계에서 채워지는(늦은-null) 협력자 — 조립 시엔 lazy 클로저로만 참조 ──
  _renderer: GridRenderer | null;
  _vs: VirtualScroll | null;
  _pagination: Pagination | null;
  _wsManager: WorksheetManager<T> | null;
  _colWidths: number[];
  _formulaDirtySeeds: Set<string>;
  // ── 조립된 매니저 deps 클로저가 위임하는 파사드 메서드 ──
  emit(event: string, ...args: any[]): any;
  on(event: string, cb: (...args: any[]) => void): any;
  off(event: string, cb: (...args: any[]) => void): any;
  _announce(msg: string): void;
  /** i18n: 메시지 해석(인스턴스 오버라이드 우선 → 활성 로케일 → ko → 키). / i18n: resolve a message. */
  t(key: string, params?: Record<string, string | number>): string;
  _doRender(startIndex: number, endIndex: number): void;
  _visRange(): [number, number];
  _renderHeader(): void;
  _setFocusCell(ri: number, ci: number): void;
  _handleRowDrop(fromIndex: number, toIndex: number): void;
  _handleCellKeyEvt(name: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent): void;
  writeCell(rowIndex: number, field: string, value: any): void;
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number;
  getDisplayValue(rowIndex: number, field: string): string;
  getMaskEnabled(field: string): boolean;
  hasCellFormula(rowIndex: number, field: string): boolean;
  getCellFormula(rowIndex: number, field: string): string | null;
  setCellFormula(rowIndex: number, field: string, formula: string): void;
  clearCellFormula(rowIndex: number, field: string): void;
  /** override 커널 배선 후 컴포저가 단 1회 호출(구조적 순서 관문). */
  _mount(): void;
}

/** OpenGrid 만 알아야 하는 재귀/전역 배선을 컴포저에 주입(컴포저의 OpenGrid 역-import 회피). */
export interface ComposerHooks {
  /** F2 서브그리드 재귀 생성(DetailManager createSubgrid). `new OpenGrid(host, {..,_detailDepth})`. */
  createSubgrid: (host: HTMLElement, subgridOptions: any, depth: number) => any;
}

// ── Phased Builder 위상정렬 토큰 — 각 단계 산출물이 다음 단계의 매개변수 타입이 되어
//    구성 순서(특히 override 커널 → mount)를 함수 시그니처로 강제한다(§3.3-1). ──
export interface CoreServicesToken { readonly _phase: 'core'; }
export interface FormulaServicesToken { readonly _phase: 'formula'; }
export interface ManagerRegistryToken { readonly _phase: 'managers'; }
export interface OverrideKernelToken { readonly _phase: 'ovk'; }
export interface MountedViewToken { readonly _phase: 'mounted'; }

/** compose() 산출물 핸들. 모든 협력자는 host 에 대입되며, 이 핸들은 완료 표식이다. */
export interface GridRuntime {
  readonly mounted: MountedViewToken;
}

/**
 * R8: 컴포지션 루트 / Phased Builder(§6-R8, §3.1 C2, §3.3).
 *
 * 생성자에 융합돼 있던 객체그래프 조립을 외재화한다. 각 build* 단계는 직전 단계의 산출
 * 토큰을 매개변수로 요구하므로, 구성 순서 — 특히 `_ovk`(OverrideKernel) 생성이 `_mount()`
 * 보다 먼저여야 한다는 불변식 — 이 **함수 시그니처의 위상정렬**로 강제된다: `mount(ovk)` 는
 * `buildOverrideKernel()` 가 낸 토큰 없이는 호출 자체가 컴파일되지 않는다.
 *
 * 협력자 생성 순서는 기존 생성자와 바이트 동일(회귀0): core → formula/recalc → 11 매니저
 * → override 커널 → mount. R2 런타임 가드는 belt-and-suspenders 로 유지된다.
 */
export class GridComposer {
  static compose<T extends Record<string, any>>(
    host: ComposerHost<T>,
    container: string | HTMLElement,
    rawOptions: GridOptions<T>,
    hooks: ComposerHooks,
  ): GridRuntime {
    const core = GridComposer.buildCoreServices(host, container, rawOptions);
    const formula = GridComposer.buildFormula(host, core);
    const managers = GridComposer.buildManagers(host, core, formula, hooks);
    const ovk = GridComposer.buildOverrideKernel(host, managers);
    const mounted = GridComposer.mount(host, ovk);
    return { mounted };
  }

  /** Phase A: 컨테이너 해석 + 옵션 정규화 + 코어 서비스(DataLayer/FlatRowModel/RowManager/ColumnLayout). */
  private static buildCoreServices<T extends Record<string, any>>(
    host: ComposerHost<T>,
    container: string | HTMLElement,
    options: GridOptions<T>,
  ): CoreServicesToken {
    const el = typeof container === 'string'
      ? (document.querySelector(container) as HTMLElement)
      : container;
    if (!el) throw new Error(`OpenGrid: container not found: ${container}`);
    host._container = el;

    host._options = {
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
      theme: 'default', skin: 'default', cssVars: {}, ariaLabel: 'OPEN_GRID 데이터 그리드',
      ...options
    } as Required<GridOptions<T>>;

    host._data = new DataLayer<T>(ROW_ID_FIELD);
    // Phase 0(C0.3): baseline FlatRowModel — group/tree 등 어떤 기능도 켜지지 않아도 존재.
    host._flatModel = new FlatRowModel({
      getDataLayer: () => host._data,
      rowIdField: ROW_ID_FIELD,
    });
    host._rowMgr = new RowManager<T>(host._data);
    host._colLayout = new ColumnLayout<T>(host._options.columns, host._options.frozenColumns);

    // i18n(I18N_DESIGN.md §3.2): locale/messages 지정 시에만 per-instance child 지연 생성 —
    // 미지정 사용자는 전역 localeRegistry 로 직행(추가 상태 0, ko byte-identical). messages 는
    // child 오버라이드로 기록하고 locale 은 setActive(never-throw), lang 속성으로 SR 발음을 맞춘다.
    if (options.locale || options.messages) {
      const child = localeRegistry.child();
      if (options.messages) child.applyOverrides(options.messages);
      if (options.locale) {
        child.setActive(options.locale);
        host._container.setAttribute('lang', child.meta().intlLocale);
      }
      host._locales = child;
    } else {
      host._locales = null;
    }

    return { _phase: 'core' };
  }

  /** Phase B: F3 수식 컨트롤러 + RecalcCoordinator(헤드리스 재계산 오케스트레이터). */
  private static buildFormula<T extends Record<string, any>>(
    host: ComposerHost<T>,
    _core: CoreServicesToken,
  ): FormulaServicesToken {
    // R7(§3.1 C9): F3 수식 컨트롤러 배선. RecalcCoordinator 는 여전히 OpenGrid 가 소유·재생성하며
    // (setData 시 rowId 재발급 대응), 컨트롤러에는 getter 클로저로 지연 주입된다(재할당 견딤).
    host._formula = new FormulaController<T>({
      getData: () => host._data,
      getColLayout: () => host._colLayout,
      getFlatModel: () => host._flatModel,
      getRecalc: () => host._recalc,
      getDirtySeeds: () => host._formulaDirtySeeds,
      getOptions: () => host._options,
      emit: (event, payload) => { host.emit(event, payload); },
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
      doRenderWindow: () => host._doRender(...host._visRange()),
    });

    // F3(11_design_F3_v2.md/15_cross_contracts.md): 헤드리스 재계산 오케스트레이터.
    // accessor 는 FlatRowModel(C0.3)+ColumnLayout.visibleLeaves(C1)+DataLayer(rowId 기반, C0.5)
    // 로만 "화면/데이터"를 본다 — RecalcCoordinator/FormulaGraph/FormulaEvaluator 자체는 미수정.
    host._recalc = new RecalcCoordinator({
      accessor: host._formula.buildAccessor(),
      setComputedValue: (rowId, field, value) => host._data.setComputedValueByRowId(rowId, field, value),
      onFormulaError: (rowId, field, error) => host._formula.handleFormulaError(rowId, field, error),
      refMode: (host._options as any).formula?.refMode ?? 'stable',
      divisionPrecision: (host._options as any).formula?.divisionPrecision ?? 30,
    });

    return { _phase: 'formula' };
  }

  /** Phase C: ~11 매니저(edit/export/footer/kbd/sortFilter/find/cellEvt/range/group/detail/chart). */
  private static buildManagers<T extends Record<string, any>>(
    host: ComposerHost<T>,
    _core: CoreServicesToken,
    _formula: FormulaServicesToken,
    hooks: ComposerHooks,
  ): ManagerRegistryToken {
    host._editMgr = new CellEditManager<T>({
      data: host._data,
      colLayout: host._colLayout,
      getRenderer: () => host._renderer,
      getContainer: () => host._container,
      getOptions: () => host._options,
      emit: (ev, ...args) => host.emit(ev, ...args),
      doRender: () => host._doRender(...host._visRange()),
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
      writeCell: (ri, field, value) => host.writeCell(ri, field, value),
      scrollToRow: (ri) => host._vs?.scrollToRow(ri),
      getVisibleLeaves: () => host._colLayout.visibleLeaves,
      hasCellFormula: (ri, field) => host.hasCellFormula(ri, field),
      getCellFormula: (ri, field) => host.getCellFormula(ri, field),
      setCellFormula: (ri, field, formula) => host.setCellFormula(ri, field, formula),
      clearCellFormula: (ri, field) => host.clearCellFormula(ri, field),
    });

    host._exportMgr = new ExportManager<T>({
      getData: () => host._data.getData(),
      getColLayout: () => host._colLayout,
      getColWidths: () => host._colWidths,
      getOptions: () => host._options,
      getContainer: () => host._container,
      getMaskEnabled: (field) => host.getMaskEnabled(field),
      getWsManager: () => host._wsManager,
      getStrategy: (slot, fb) => host._ovk.getStrategy(slot, fb),
      t: (key, params) => host.t(key, params),
      getMeta: () => (host._locales ?? localeRegistry).meta(),
    });
    host._footerMgr = new FooterManager<T>({
      getData: () => host._data.getData(),
      getColLayout: () => host._colLayout,
      getColWidths: () => host._colWidths,
      getOptions: () => host._options,
      getContainer: () => host._container,
      getStrategy: (slot, fb) => host._ovk.getStrategy(slot, fb),
    });
    host._kbdMgr = new KeyboardManager<T>({
      getEditMgr: () => host._editMgr,
      getRowMgr: () => host._rowMgr,
      getData: () => host._data,
      getColLayout: () => host._colLayout,
      getOptions: () => host._options,
      setFocusCell: (ri, ci) => host._setFocusCell(ri, ci),
      handleRowDrop: (from, to) => host._handleRowDrop(from, to),
      doRender: () => host._doRender(...host._visRange()),
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
      emit: (ev, ...args) => host.emit(ev, ...args),
      visRange: () => host._visRange(),
      handleCellKeyEvt: (name, e) => host._handleCellKeyEvt(name, e),
      writeCells: (patches) => host.writeCells(patches),
      getRangeHooks: () => host._rangeMgr,
    });
    host._sfMgr = new SortFilterManager<T>({
      getData: () => host._data,
      getColLayout: () => host._colLayout,
      getFindFilter: () => host._findMgr.findFilter,
      getVs: () => host._vs,
      getPagination: () => host._pagination,
      getOptions: () => host._options,
      renderHeader: () => host._renderHeader(),
      doRender: () => host._doRender(...host._visRange()),
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
      emit: (ev, ...args) => host.emit(ev, ...args),
      onReproject: () => host._rangeMgr.reproject(),
    });
    host._findMgr = new FindBarManager<T>({
      getColLayout: () => host._colLayout,
      getData: () => host._data,
      getFilters: () => host._sfMgr.filters,
      getVs: () => host._vs,
      getPagination: () => host._pagination,
      doRender: () => host._doRender(...host._visRange()),
      t: (key, params) => host.t(key, params),
    });
    host._cellEvt = new CellEventHandler<T>({
      getData: () => host._data,
      getColLayout: () => host._colLayout,
      getOptions: () => host._options,
      getEditMgr: () => host._editMgr,
      getRowMgr: () => host._rowMgr,
      emit: (ev, ...args) => host.emit(ev, ...args),
      writeCell: (ri, field, val) => host.writeCell(ri, field, val),
      doRender: () => host._doRender(...host._visRange()),
      getContainer: () => host._container,
      onCellsClick: (ri, ci, shift) => host._rangeMgr.handleClick(ri, ci, shift),
      rangeMouseDown: (ri, ci, e) => host._rangeMgr.handleCellMouseDown(ri, ci, e),
      rangeMouseMove: (ri, ci, e) => host._rangeMgr.handleCellMouseMove(ri, ci, e),
      rangeMouseUp: (ri, ci, e) => host._rangeMgr.handleCellMouseUp(ri, ci, e),
    });
    // F1: 범위 선택 + 채우기 핸들(11_design_F1_v2.md). 헤드리스 코어(core/range/*)를 소비.
    host._rangeMgr = new RangeSelectionManager<T>({
      getOptions: () => host._options,
      getData: () => host._data,
      getColLayout: () => host._colLayout,
      getFlatModel: () => host._flatModel,
      getRenderer: () => host._renderer,
      getEditMgr: () => host._editMgr,
      setFocusCell: (ri, ci) => host._setFocusCell(ri, ci),
      writeCells: (patches) => host.writeCells(patches),
      getDisplayValue: (ri, field) => host.getDisplayValue(ri, field),
      emit: (ev, ...args) => host.emit(ev, ...args),
      doRender: () => host._doRender(...host._visRange()),
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
      // C3(15_cross_contracts.md): F3 이 제공하는 hasCellFormula/offsetFormula/setCellFormula 를
      // fill 커밋 경로(FillEngine.FillPlanContext)에 연결한다.
      hasCellFormula: (rowId, field) => host._recalc.hasCellFormula(rowId, field),
      offsetFormula: (rowId, field, dRow, dCol) => host._recalc.offsetFormula(rowId, field, dRow, dCol),
      setCellFormulaByRowId: (rowId, field, formula) => host._formula.setCellFormulaByRowId(rowId, field, formula),
    });
    host._grpMgr = new GroupTreeManager<T>({
      getData: () => host._data.getData(),
      getDataLayer: () => host._data,
      getOptions: () => host._options,
      getVs: () => host._vs,
      doRenderFull: (n) => host._doRender(0, n - 1),
      doRender: () => host._doRender(...host._visRange()),
      getStrategy: (slot, fb) => host._ovk.getStrategy(slot, fb),
      setFlatBacking: (provider) => host._flatModel.setBacking(provider),
      getFlatCount: () => host._flatModel.count(),
    });
    // F2(11_design_F2_v2.md §3.1/C0.3): DetailManager 는 FlatRowModel 의 "등록자" — group/tree
    // 가 setBacking 한 산출물 위에 detail splice 를 끼운다(합성 체인 마지막 단계, §3.2).
    host._detailMgr = new DetailManager<T>({
      getOptions: () => host._options,
      getFlatModel: () => host._flatModel,
      getVs: () => host._vs,
      getRowId: (row) => (row as any)[ROW_ID_FIELD],
      getRowById: (rowId) => host._data.getRowById(rowId),
      doRenderFull: (n) => host._doRender(0, n - 1),
      emit: (ev, payload) => host.emit(ev, payload),
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
      getDepth: () => (host._options as any)._detailDepth ?? 0,
      getGridInstance: () => host,
      // 순환 import 회피: DetailManager.ts 는 OpenGrid 를 모르고, 이 클로저만 주입받는다.
      // (컴포저도 OpenGrid 를 역-import 하지 않도록 factory 를 hooks 로 받는다.)
      createSubgrid: (host2, subgridOptions, depth) => hooks.createSubgrid(host2, subgridOptions, depth),
    });
    // F4(11_design_F4_v2.md §6/C5): 통합 차트 오케스트레이터. 그리드 상태는 전부 주입 클로저로
    // 읽고(CN-1 가상DOM 미접근), range 는 FlatRowModel(C0.3)로 pseudo-row 를 걸러 스냅샷한다.
    host._chartMgr = new ChartManager({
      getContainer: () => host._container,
      getOptions: () => host._options,
      getAllRows: () => host._data.getData(),
      getSelectedRows: () => host._rowMgr.getSelections(),
      getCheckedRows: () => host._rowMgr.getChecked().map(c => c.row),
      getVisibleColumns: () => host._colLayout.visibleLeaves.map(c => ({
        field: c.field, header: c.header, type: c.type as string | undefined,
      })),
      getFlatModel: () => host._flatModel,
      getRowById: (rowId) => host._data.getRowById(rowId) as Record<string, any> | undefined,
      getActiveRange: () => host._rangeMgr.getActiveRange(),
      on: (ev, cb) => { host.on(ev, cb); },
      off: (ev, cb) => { host.off(ev, cb); },
      emit: (ev, ...args) => host.emit(ev, ...args),
      announce: (msg) => host._announce(msg),
      t: (key, params) => host.t(key, params),
    });

    return { _phase: 'managers' };
  }

  /**
   * Phase D: grid.override() 확장 커널 부착(★mount 전 — 초기 렌더의 footer/그룹/strategy 슬롯이
   * 매니저 deps 의 getStrategy 클로저를 통해 host._ovk 를 참조하므로, _ovk 선생성이 필수다).
   *
   * 이 단계의 산출 토큰(OverrideKernelToken)이 mount() 의 매개변수라서, mount 는 이 단계
   * 없이는 호출 자체가 불가능하다(§3.3-1 위상정렬 = R2 상처주석의 구조적 대체).
   */
  private static buildOverrideKernel<T extends Record<string, any>>(
    host: ComposerHost<T>,
    _managers: ManagerRegistryToken,
  ): OverrideKernelToken {
    host._ovk = new OverrideKernel(host, { strict: host._options.overrideStrict ?? true });
    // Phase 2: DataLayer(슬롯 sortComparator/filterPredicate) strategy 배선.
    // R1(DIP): 렌더러측 displayFormatter 모듈전역 제거 — displayFormatter 는 이제 per-instance
    //          안전경로(getDisplayValue → GridRenderer 가 ctx.displayValue 로 주입)로만 흐른다.
    host._data.setStrategyResolver((slot, fb) => host._ovk.getStrategy(slot, fb));

    // R2: _ovk-before-_mount 순서 불변식의 런타임 봉인(belt-and-suspenders). R8 이후로는 mount 가
    //     이 토큰을 매개변수로 요구해 구조적으로 강제되지만, 명시 실패 메시지는 유지한다.
    if (host._ovk == null) {
      throw new Error(
        '[OpenGrid] 초기화 순서 위반: OverrideKernel(_ovk)은 _mount() 이전에 생성돼야 합니다 — ' +
        '매니저 strategy 슬롯(footer/group 등)이 초기 렌더에서 _ovk.getStrategy 를 참조합니다.',
      );
    }

    return { _phase: 'ovk' };
  }

  /** Phase E: 배선 완료 후 단 1회 mount(§3.3-2). ovk 토큰 없이는 호출 불가 → 순서 구조적 강제. */
  private static mount<T extends Record<string, any>>(
    host: ComposerHost<T>,
    _ovk: OverrideKernelToken,
  ): MountedViewToken {
    host._mount();
    return { _phase: 'mounted' };
  }
}
