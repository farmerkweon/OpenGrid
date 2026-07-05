/**
 * RangeSelectionManager — F1 배선 계층. 헤드리스 코어(src/core/range/*)를 실제 OpenGrid
 * 서브시스템(FlatRowModel/ColumnLayout/DataLayer/GridRenderer/CellEditManager)에 연결한다.
 * / RangeSelectionManager — F1 wiring layer. Connects the headless core (src/core/range/*) to
 * the real OpenGrid subsystems (FlatRowModel/ColumnLayout/DataLayer/GridRenderer/CellEditManager).
 *
 * 계약 근거: docs/design/grid-features-2026-07/11_design_F1_v2.md, 15_cross_contracts.md.
 * 이 파일은 core/range/*(RangeModel/FillEngine/ClipboardCodec/RangeQuery)를 "소비"만 하고
 * 재구현하지 않는다(태스크 지시).
 * / Contract basis: 11_design_F1_v2.md, 15_cross_contracts.md. This file only "consumes"
 * core/range/* (RangeModel/FillEngine/ClipboardCodec/RangeQuery) and never reimplements it
 * (per task directive).
 *
 * F3(수식) 배선(C3): _commitFill()의 FillPlanContext.hasCellFormula/offsetFormula 는
 * grid.hasCellFormula/grid.offsetFormula(F3 제공, RecalcCoordinator 소비)에 연결돼 있다.
 * 소스가 수식인 셀 복제는 값 write 가 아니라 setCellFormulaByRowId(→ grid.setCellFormula)
 * 경유로 커밋한다(C3.1).
 * / F3 (formula) wiring (C3): in _commitFill(), FillPlanContext.hasCellFormula/offsetFormula are
 * wired to grid.hasCellFormula/grid.offsetFormula (provided by F3, backed by RecalcCoordinator).
 * Duplicating a cell whose source holds a formula is committed via setCellFormulaByRowId
 * (→ grid.setCellFormula), not as a value write (C3.1).
 */
import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { GridRenderer } from './GridRenderer.js';
import type { CellEditManager } from './CellEditManager.js';
import type { FlatRowModel } from './FlatRowModel.js';
import type { GridOptions } from './types.js';

import { RangeModel } from './range/RangeModel.js';
import {
  buildFillPlan, ctrlFillSourceTarget,
  type FillPlanContext,
} from './range/FillEngine.js';
import {
  rangeToTSV, parseTSV, buildPastePlan,
  type ClipboardQueryContext, type PastePlanContext,
} from './range/ClipboardCodec.js';
import { getRangeValues, getRangeStats, type RangeStats, type RangeQueryContext } from './range/RangeQuery.js';
import type { CellRange, Direction, FillAxis, FillMode, FillPreview, RangeModelHost } from './range/types.js';

/**
 * RangeSelectionManager 가 OpenGrid 서브시스템을 읽고 쓰기 위해 주입받는 클로저 묶음.
 * / Closures injected into RangeSelectionManager so it can read and write OpenGrid subsystem
 * state without owning it directly.
 */
export interface RangeSelectionDeps<T extends Record<string, any>> {
  getOptions: () => Required<GridOptions<T>>;
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getFlatModel: () => FlatRowModel;
  getRenderer: () => GridRenderer | null;
  getEditMgr: () => CellEditManager<T>;
  /** 포커스 셀을 이동. / Move the focused cell. */
  setFocusCell: (ri: number, ci: number) => void;
  /** 배치 경유 셀 쓰기(재렌더 ≤1회, C2.1). / Batched cell write (at most one re-render, C2.1). */
  writeCells: (patches: Array<{ rowIndex: number; field: string; value: any }>) => number;
  /** 셀의 화면 표시 텍스트(포맷 적용). / The cell's display text (formatted). */
  getDisplayValue: (ri: number, field: string) => string;
  /** 그리드 이벤트 발행. / Emit a grid event. */
  emit: (event: string, ...args: any[]) => void;
  /** 현재 가시 범위를 재렌더. / Re-render the currently visible range. */
  doRender: () => void;
  /** aria-live 영역에 메시지를 공지. / Announce a message via the aria-live region. */
  announce: (msg: string) => void;
  /** i18n: 범위 선택/채우기 announce·aria 해석. / i18n: resolve range selection/fill announce & aria. */
  t: (key: string, params?: Record<string, string | number>) => string;
  // C3(15_cross_contracts.md, F3 제공): fill 커밋 시 수식 합동 3규칙(FillEngine.FillPlanContext) 연결.
  // / C3 (15_cross_contracts.md, provided by F3): wires the 3 formula-merge rules
  // (FillEngine.FillPlanContext) used when committing a fill.
  hasCellFormula?: (rowId: string, field: string) => boolean;
  offsetFormula?: (rowId: string, field: string, dRow: number, dCol: number) => string;
  setCellFormulaByRowId?: (rowId: string, field: string, formula: string) => void;
}

/** 정규화된 rangeSelection 옵션(§6.1 기본값). / Normalized rangeSelection options (§6.1 defaults). */
interface ResolvedRangeOptions {
  fillHandle: boolean;
  multiRange: boolean;
  autoScrollEdge: number;
  seriesFill: boolean;
  enabledInTreeGroup: boolean;
  fillOverwriteFormula: boolean;
}

/**
 * F1 범위 선택 + 채우기 매니저. / F1 range selection + fill manager.
 *
 * 포인터 드래그·클릭·Shift+화살표로 셀 범위를 선택하고, 채우기 핸들 드래그/Ctrl+D·R 로 값·수식을
 * 복제하며, 탭 구분 텍스트 복사/붙여넣기(TSV)까지 담당한다. 선택 모델 자체는 헤드리스
 * `RangeModel`(core/range/*)이 소유하고, 이 클래스는 DOM 이벤트·오버레이 렌더·그리드 배선만
 * 책임진다. / Handles cell-range selection via pointer drag, click, and Shift+Arrow; duplicates
 * values/formulas via fill-handle drag or Ctrl+D/R; and drives tab-separated (TSV) copy/paste.
 * The selection model itself is owned by the headless `RangeModel` (core/range/*); this class is
 * responsible only for DOM events, overlay rendering, and grid wiring.
 */
export class RangeSelectionManager<T extends Record<string, any> = any> {
  private _d: RangeSelectionDeps<T>;
  private _model: RangeModel;

  // 드래그 상태
  private _isDragging = false;

  // 채우기 핸들 드래그 상태
  private _fillDragSource: CellRange | null = null;
  private _fillDragStart: { x: number; y: number } | null = null;
  private _fillPreview: FillPreview | null = null;
  private _handlePointerId: number | null = null;

  // autoscroll
  private _autoScrollRAF: number | null = null;
  private _autoScrollVX = 0;
  private _autoScrollVY = 0;

  // 오버레이 DOM
  private _overlayEl: HTMLElement | null = null;
  private _borderEl: HTMLElement | null = null;
  private _previewEl: HTMLElement | null = null;
  private _handleEl: HTMLElement | null = null;
  private _mountedWrap: HTMLElement | null = null;

  constructor(deps: RangeSelectionDeps<T>) {
    this._d = deps;
    const host: RangeModelHost = {
      count: () => this._d.getFlatModel().count(),
      resolveFlatRow: (i) => this._d.getFlatModel().resolveFlatRow(i),
      flatIndexOfRowId: (id) => this._d.getFlatModel().flatIndexOfRowId(id),
      rowIdOfFlat: (i) => this._d.getFlatModel().rowIdOfFlat(i),
      visibleFields: () => this._d.getColLayout().visibleLeaves.map(l => l.field),
    };
    this._model = new RangeModel(host);
  }

  // ── 옵션/게이트 ────────────────────────────────────────────
  /** 범위 선택 기능이 켜져 있는지. / Whether range selection is enabled.
   * @returns 켜져 있으면 true / True if enabled */
  isEnabled(): boolean {
    const opts = this._d.getOptions() as any;
    return opts.rangeSelection?.enabled ?? (opts.selection === 'cells');
  }

  private _rangeOpts(): ResolvedRangeOptions {
    const rs = (this._d.getOptions() as any).rangeSelection;
    return {
      fillHandle: rs?.fillHandle ?? true,
      multiRange: rs?.multiRange ?? false,
      autoScrollEdge: rs?.autoScrollEdge ?? 24,
      seriesFill: rs?.seriesFill ?? true,
      enabledInTreeGroup: rs?.enabledInTreeGroup ?? false,
      fillOverwriteFormula: rs?.fillOverwriteFormula ?? false,
    };
  }

  private _editorActive(): boolean {
    return this._d.getEditMgr().activeEditor != null; // C9: 편집 중이면 에디터 우선
  }

  // ── 조회 API(C4/§6.2) ──────────────────────────────────────
  /** 현재 범위 선택이 있는지. / Whether there is an active range selection. */
  hasSelection(): boolean { return this._model.hasSelection; }
  /** 현재 선택된 모든 범위(multiRange 지원 시 다건). / All currently selected ranges (multiple when multiRange is enabled). */
  getRangeSelection(): CellRange[] { return this._model.getRangeSelection(); }
  /** 마지막(활성) 범위. 없으면 `null`. / The last (active) range, or `null` if none. */
  getActiveRange(): CellRange | null { return this._model.getActiveRange(); }
  /** 채우기 핸들 드래그 중인 미리보기 범위. 없으면 `null`. / The fill preview range while dragging the fill handle, or `null`. */
  getFillPreview(): FillPreview | null { return this._fillPreview; }

  /** 활성 범위의 셀 값들을 2차원 배열로 반환(범위 없으면 빈 배열).
   * / Return the active range's cell values as a 2D array (empty array if no active range). */
  getRangeValues(): any[][] {
    const rect = this.getActiveRange();
    if (!rect) return [];
    return getRangeValues(rect, this._queryCtx());
  }

  /** 활성 범위의 합계/평균 등 통계(범위 없으면 `null`).
   * / Statistics (sum/average/etc.) for the active range, or `null` if none. */
  getRangeStats(): RangeStats | null {
    const rect = this.getActiveRange();
    if (!rect) return null;
    return getRangeStats(rect, this._queryCtx());
  }

  private _queryCtx(): RangeQueryContext {
    return {
      fieldAt: (ci) => this._d.getColLayout().visibleLeaves[ci]?.field,
      getCellValue: (ri, field) => this._d.getData().getCellValue(ri, field),
    };
  }

  // ── 포인터 드래그(UC-1, §3.1) ────────────────────────────────
  /**
   * 셀 위 마우스 다운 — 드래그 선택을 시작한다(UC-1). / Mouse-down on a cell — begins drag selection (UC-1).
   *
   * @param ri - 시작 행 인덱스 / Starting row index
   * @param ci - 시작 열 인덱스 / Starting column index
   * @param e - 원본 마우스 이벤트(Ctrl/Meta=추가선택, Shift=확장) / Original mouse event (Ctrl/Meta = additive, Shift = extend)
   */
  handleCellMouseDown(ri: number, ci: number, e: MouseEvent): void {
    if (!this.isEnabled() || this._editorActive()) return;
    if (ri < 0 || ci < 0) return;
    this._model.beginDrag(ri, ci, { additive: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    this._isDragging = true;
    this._d.setFocusCell(ri, ci);
    this._d.doRender();
    // 셀 영역 밖에서 마우스를 놓아도 드래그가 종료되도록 document 레벨 폴백(R-2류 방지).
    // GridRenderer 의 셀별 mouseup 과 중복 실행되어도 _isDragging 가드로 1회만 반영된다.
    const onDocUp = () => {
      document.removeEventListener('mouseup', onDocUp);
      this.handleCellMouseUp(-1, -1, e);
    };
    document.addEventListener('mouseup', onDocUp);
  }

  /**
   * 드래그 중 셀 위 마우스 이동 — 범위를 갱신하고 가장자리 근처면 자동 스크롤한다.
   * / Mouse move over a cell while dragging — updates the range and auto-scrolls near edges.
   *
   * @param ri - 현재 행 인덱스 / Current row index
   * @param ci - 현재 열 인덱스 / Current column index
   * @param e - 원본 마우스 이벤트(자동 스크롤 거리 계산용) / Original mouse event (used to compute auto-scroll distance)
   */
  handleCellMouseMove(ri: number, ci: number, e: MouseEvent): void {
    if (this._isDragging) {
      if (ri >= 0 && ci >= 0) {
        this._model.updateFocus(ri, ci);
        this._d.doRender();
      }
      this._maybeAutoscroll(e);
    }
  }

  /** 드래그 종료 — 자동 스크롤 정지 + 선택 확정 + 이벤트 발행. 셀 밖 mouseup(document 폴백)도 이 경로를 탄다.
   * / End the drag — stops auto-scroll, finalizes the selection, and emits events. A mouseup
   * outside any cell (document-level fallback) also flows through this path. */
  handleCellMouseUp(_ri: number, _ci: number, _e: MouseEvent): void {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._stopAutoscroll();
    this._model.endDrag();
    this._afterModelChange(true);
  }

  // ── 클릭 / Shift+클릭(UC-2, §3.2, M-1) ───────────────────────
  /**
   * 셀 클릭 처리 — 일반 클릭은 단일 셀 선택, Shift+클릭은 활성 범위를 확장한다(UC-2).
   * / Handle a cell click — a plain click selects a single cell; Shift+click extends the active range (UC-2).
   *
   * @param ri - 클릭된 행 인덱스 / Clicked row index
   * @param ci - 클릭된 열 인덱스 / Clicked column index
   * @param shiftKey - Shift 키가 눌려 있었는지 / Whether the Shift key was held
   */
  handleClick(ri: number, ci: number, shiftKey: boolean): void {
    if (!this.isEnabled() || this._editorActive()) return;
    if (shiftKey) this._model.shiftClickExtend(ri, ci);
    else this._model.click(ri, ci);
    const focus = this._model.getFocus();
    this._d.setFocusCell(focus.ri, focus.ci);
    this._afterModelChange(true);
  }

  // ── Shift+Arrow(UC-3, §3.3) ───────────────────────────────────
  /**
   * Shift+화살표로 활성 범위를 방향으로 확장한다(UC-3). / Extend the active range in a direction via Shift+Arrow (UC-3).
   *
   * @param dir - 확장 방향 / Direction to extend
   */
  extendFocus(dir: Direction): void {
    if (!this.isEnabled()) return;
    if (!this._model.hasSelection) return;
    this._model.extendFocus(dir);
    const focus = this._model.getFocus();
    this._d.setFocusCell(focus.ri, focus.ci);
    this._afterModelChange(true);
  }

  /** 범위 선택을 해제한다(선택 없으면 no-op). / Clear the range selection (no-op if nothing is selected). */
  clear(): void {
    if (!this._model.hasSelection) return;
    this._model.clear();
    this._afterModelChange(true);
  }
  /** `clear()` 별칭(공개 API 명명 일관성). / Alias for `clear()` (public API naming consistency). */
  clearRangeSelection(): void { this.clear(); }

  /**
   * 범위 선택을 프로그램적으로 지정한다(§6.2 공개 API). / Programmatically set the range selection (§6.2 public API).
   *
   * @param range - 지정할 범위(배열이면 첫 요소만 사용) / Range to set (if an array, only the first element is used)
   * @example
   * grid.setRangeSelection({ startRow: 0, endRow: 2, startCol: 0, endCol: 1 });
   */
  setRangeSelection(range: CellRange | CellRange[]): void {
    const r = Array.isArray(range) ? range[0] : range;
    if (!r) { this.clear(); return; }
    this._model.setRect(r);
    const focus = this._model.getFocus();
    this._d.setFocusCell(focus.ri, focus.ci);
    this._afterModelChange(true);
  }

  /** applySort/applyFilter 직후 호출(C0.5, §2.5) — 선택은 rowId 집합 기준으로 재투영(해제 아님).
   * / Called right after applySort/applyFilter (C0.5, §2.5) — re-projects the selection by its
   * rowId set instead of clearing it. */
  reproject(): void {
    if (!this._model.hasSelection) return;
    this._model.reproject();
    const range = this._model.getActiveRange();
    this._d.emit('rangeChange', { range });
    (this._d.getOptions() as any).onRangeChange?.({ range });
  }

  private _afterModelChange(emit: boolean): void {
    this._d.doRender();
    if (!emit) return;
    const cells = this._model.getRangeSelection();
    const range = this._model.getActiveRange();
    const opts = this._d.getOptions() as any;
    this._d.emit('selectionChange', { rows: [], rowIndexes: [], cells });
    opts.onSelectionChange?.({ rows: [], rowIndexes: [], cells });
    this._d.emit('rangeChange', { range });
    opts.onRangeChange?.({ range });
    this._announceSelection();
  }

  private _announceSelection(): void {
    const r = this.getActiveRange();
    if (!r) return;
    const rows = r.endRow - r.startRow + 1;
    const cols = r.endCol - r.startCol + 1;
    this._d.announce(this._d.t('range.selectionAnnounce', { r1: r.startRow + 1, c1: r.startCol + 1, r2: r.endRow + 1, c2: r.endCol + 1, n: rows * cols }));
  }

  // ── 키보드 채우기(UR-5, Ctrl+D/R, §3.3, C9) ───────────────────
  /**
   * Ctrl+D(아래로 채우기)/Ctrl+R(오른쪽으로 채우기) 키보드 단축키(UR-5, §3.3).
   * / Ctrl+D (fill down) / Ctrl+R (fill right) keyboard shortcuts (UR-5, §3.3).
   *
   * @param axis - 채우기 방향 / Fill direction
   */
  ctrlFill(axis: 'down' | 'right'): void {
    if (!this.isEnabled()) return;
    const rect = this.getActiveRange();
    if (!rect) return;
    const st = ctrlFillSourceTarget(rect, axis);
    if (!st) return;
    this._commitFill(st.source, st.target, axis, 'copy');
  }

  /** 공개 API(§6.2): source→target 채우기. axis 는 두 rect 의 상대 위치로 추론한다.
   * / Public API (§6.2): fill from source to target. The axis is inferred from the two rects'
   * relative position.
   *
   * @param source - 채우기 원본 범위 / Source range to fill from
   * @param target - 채우기 대상 범위 / Target range to fill into
   * @param mode - 채우기 모드(기본 'copy') / Fill mode (default 'copy')
   * @example
   * grid.fillRange(
   *   { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
   *   { startRow: 1, endRow: 3, startCol: 0, endCol: 0 },
   *   'series',
   * );
   */
  fillRange(source: CellRange, target: CellRange, mode: FillMode = 'copy'): void {
    let axis: FillAxis;
    if (target.startRow < source.startRow) axis = 'up';
    else if (target.endRow > source.endRow) axis = 'down';
    else if (target.startCol < source.startCol) axis = 'left';
    else axis = 'right';
    this._commitFill(source, target, axis, mode);
  }

  private _isEditable(rowId: string, field: string): boolean {
    const col = this._d.getColLayout().getColumnByField(field) as any;
    if (!col) return false;
    if (col.editable === false) return false;
    const opts = this._d.getOptions();
    if (typeof col.editable === 'function') {
      const ri = this._d.getFlatModel().flatIndexOfRowId(rowId);
      const row = ri >= 0 ? this._d.getData().getRowByIndex(ri) : undefined;
      return row ? !!col.editable(row as T, ri) : false;
    }
    return col.editable !== undefined ? true : !!(opts as any).editable;
  }

  private _commitFill(source: CellRange, target: CellRange, axis: FillAxis, mode: FillMode): void {
    const rs = this._rangeOpts();
    const effectiveMode: FillMode = rs.seriesFill ? mode : 'copy';
    const ctx: FillPlanContext = {
      resolveFlatRow: (ri) => this._d.getFlatModel().resolveFlatRow(ri),
      fieldAt: (ci) => this._d.getColLayout().visibleLeaves[ci]?.field,
      getCellValue: (ri, field) => this._d.getData().getCellValue(ri, field),
      isEditable: (rowId, field) => this._isEditable(rowId, field),
      // C3(F3 제공): 소스=수식 → offsetFormula, 대상=수식(소스=값) → skip 판정에 hasCellFormula 사용.
      // (exactOptionalPropertyTypes: 선택적 dep 을 항상-정의된 함수로 감싸 명시적 undefined 대입을 피한다.)
      hasCellFormula: (rowId, field) => this._d.hasCellFormula?.(rowId, field) ?? false,
      offsetFormula: (rowId, field, dRow, dCol) => this._d.offsetFormula?.(rowId, field, dRow, dCol) ?? '',
      overwriteFormula: rs.fillOverwriteFormula,
    };
    const plan = buildFillPlan(source, target, axis, effectiveMode, ctx);

    const written: Array<{ rowIndex: number; field: string; oldValue: any; newValue: any }> = [];
    const patches: Array<{ rowIndex: number; field: string; value: any }> = [];
    const formulaItems: Array<{ rowId: string; field: string; formula: string }> = [];
    for (const item of plan.items) {
      if (item.action === 'value') {
        const oldValue = this._d.getData().getCellValue(item.rowIndex, item.field);
        written.push({ rowIndex: item.rowIndex, field: item.field, oldValue, newValue: item.value });
        patches.push({ rowIndex: item.rowIndex, field: item.field, value: item.value });
      } else if (item.action === 'setFormula' && item.formula != null) {
        const ref = this._d.getFlatModel().resolveFlatRow(item.rowIndex);
        if (ref.kind === 'data' && ref.rowId) {
          formulaItems.push({ rowId: ref.rowId, field: item.field, formula: item.formula });
          written.push({ rowIndex: item.rowIndex, field: item.field, oldValue: this._d.getData().getCellValue(item.rowIndex, item.field), newValue: item.formula });
        }
      }
    }

    const evt: any = { source, target, mode: effectiveMode, written, skippedFormula: plan.skippedFormula, cancel: false };
    this._d.emit('rangeFill', evt);
    (this._d.getOptions() as any).onRangeFill?.(evt);
    if (evt.cancel) return;

    if (patches.length) this._d.writeCells(patches); // C2.1: 배치 경유, _doRender ≤1회
    // C3.1: 소스가 수식인 셀 복제 — setCellFormula 경유(값 write 아님, §C3).
    for (const fi of formulaItems) this._d.setCellFormulaByRowId?.(fi.rowId, fi.field, fi.formula);

    if (plan.skippedFormula > 0) this._d.announce(this._d.t('range.formulaPreserved', { count: plan.skippedFormula }));
    const otherSkips = plan.items.filter(i => i.action === 'skip' && i.reason !== 'formula-preserved').length;
    if (otherSkips > 0) this._d.announce(this._d.t('range.fillSkipped', { count: otherSkips }));
  }

  // ── 클립보드(UR-4/UC-6, §5, M-4/M-5) ──────────────────────────
  /** KeyboardManager._copyToClipboard 가 소비. 범위 없으면 null(호출측이 기존 경로로 폴백).
   * / Consumed by KeyboardManager._copyToClipboard. Returns null when there is no active range
   * (the caller falls back to its existing path).
   *
   * @returns 활성 범위의 TSV 텍스트, 없으면 `null` / TSV text for the active range, or `null`
   */
  copyText(): string | null {
    const rect = this.getActiveRange();
    if (!rect) return null;
    const ctx: ClipboardQueryContext = {
      fieldAt: (ci) => this._d.getColLayout().visibleLeaves[ci]?.field,
      getCellValue: (ri, field) => this._d.getData().getCellValue(ri, field),
      getDisplayText: (ri, field) => this._d.getDisplayValue(ri, field),
    };
    const text = rangeToTSV(rect, ctx);
    this._d.emit('rangeCopy', { range: rect, text });
    (this._d.getOptions() as any).onRangeCopy?.({ range: rect, text });
    return text;
  }

  /** KeyboardManager._pasteFromClipboard 가 소비. true = 처리함(배치 경유), false = 범위 없음(폴백).
   * / Consumed by KeyboardManager._pasteFromClipboard.
   *
   * @param text - 붙여넣을 TSV 텍스트 / TSV text to paste
   * @returns 처리했으면 true(배치 경유), 활성 범위가 없으면 false(호출측 폴백)
   *  / True if handled (batched write); false if there is no active range (caller falls back)
   */
  pasteText(text: string): boolean {
    const rect = this.getActiveRange();
    if (!rect) return false;
    const block = parseTSV(text);
    const ctx: PastePlanContext = {
      resolveFlatRow: (ri) => this._d.getFlatModel().resolveFlatRow(ri),
      fieldAt: (ci) => this._d.getColLayout().visibleLeaves[ci]?.field,
      isEditable: (rowId, field) => this._isEditable(rowId, field),
    };
    const plan = buildPastePlan(block, rect, ctx);
    const patches = plan
      .filter(p => p.action === 'value')
      .map(p => ({ rowIndex: p.rowIndex, field: p.field, value: p.value }));
    this._d.writeCells(patches);
    return true;
  }

  // ── autoscroll(HANMS, §3.1) ────────────────────────────────
  private _maybeAutoscroll(e: MouseEvent): void {
    const renderer = this._d.getRenderer();
    if (!renderer) return;
    const wrap = renderer.bodyWrapper;
    const rect = wrap.getBoundingClientRect();
    const edge = this._rangeOpts().autoScrollEdge;
    let vx = 0, vy = 0;
    const distTop = e.clientY - rect.top;
    const distBottom = rect.bottom - e.clientY;
    const distLeft = e.clientX - rect.left;
    const distRight = rect.right - e.clientX;
    if (distTop < edge) vy = -this._scrollSpeed(edge - distTop);
    else if (distBottom < edge) vy = this._scrollSpeed(edge - distBottom);
    if (distLeft < edge) vx = -this._scrollSpeed(edge - distLeft);
    else if (distRight < edge) vx = this._scrollSpeed(edge - distRight);
    if (vx === 0 && vy === 0) { this._stopAutoscroll(); return; }
    this._autoScrollVX = vx;
    this._autoScrollVY = vy;
    if (this._autoScrollRAF == null) this._runAutoscroll();
  }

  private _scrollSpeed(depth: number): number { return Math.max(2, Math.min(20, depth)); }

  private _runAutoscroll(): void {
    const renderer = this._d.getRenderer();
    if (!renderer) { this._autoScrollRAF = null; return; }
    renderer.bodyWrapper.scrollTop += this._autoScrollVY;
    renderer.bodyWrapper.scrollLeft += this._autoScrollVX;
    this._autoScrollRAF = requestAnimationFrame(() => this._runAutoscroll());
  }

  private _stopAutoscroll(): void {
    if (this._autoScrollRAF != null) { cancelAnimationFrame(this._autoScrollRAF); this._autoScrollRAF = null; }
    this._autoScrollVX = 0;
    this._autoScrollVY = 0;
  }

  // ── 오버레이(§4.3, C6) ─────────────────────────────────────
  /** bodyWrap 자식으로 오버레이 1회 생성(renderBody 파괴 회피, CON-3 해법).
   * / Creates the overlay once as a child of bodyWrap (avoids renderBody teardown; the CON-3 fix).
   *
   * @param bodyWrap - 그리드 바디 래퍼 엘리먼트 / The grid body wrapper element
   */
  mount(bodyWrap: HTMLElement): void {
    if (this._mountedWrap === bodyWrap) return;
    this._mountedWrap = bodyWrap;

    const overlay = document.createElement('div');
    overlay.className = 'og-range-overlay';
    overlay.style.cssText = 'position:sticky;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:6;';

    const border = document.createElement('div');
    border.className = 'og-range-border';
    border.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid var(--og-range-border,#1976d2);pointer-events:none;display:none;';

    const preview = document.createElement('div');
    preview.className = 'og-range-fill-preview';
    preview.style.cssText = 'position:absolute;box-sizing:border-box;border:1px dashed var(--og-range-border,#1976d2);pointer-events:none;display:none;';

    const handle = document.createElement('div');
    handle.className = 'og-range-fill-handle';
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', this._d.t('range.fillHandleAria'));
    // background-color(shorthand 아님) — base.css 의 @media(pointer:coarse) background-clip:content-box
    // 확대 히트박스 트릭을 인라인 shorthand 리셋이 깨뜨리지 않도록 한다(C8.4).
    handle.style.cssText = 'position:absolute;display:none;pointer-events:auto;background-color:var(--og-fill-handle-bg,#1976d2);';
    handle.addEventListener('pointerdown', (e) => this._onHandlePointerDown(e));

    overlay.appendChild(border);
    overlay.appendChild(preview);
    overlay.appendChild(handle);
    bodyWrap.insertBefore(overlay, bodyWrap.firstChild);
    bodyWrap.addEventListener('scroll', () => this.repaint(), { passive: true });

    this._overlayEl = overlay;
    this._borderEl = border;
    this._previewEl = preview;
    this._handleEl = handle;
  }

  /** _doRender 매 호출 뒤 실행(M-6 통합점) — 코너 셀 실측 → 연속 테두리/핸들/프리뷰 갱신(QA-2, CON-4).
   * / Runs after every _doRender call (M-6 integration point) — measures the corner cells and
   * updates the contiguous border/handle/preview overlay (QA-2, CON-4). */
  repaint(): void {
    if (!this._overlayEl) return;
    const renderer = this._d.getRenderer();
    const rect = this.getActiveRange();
    if (!renderer || !rect) { this._hideOverlay(); return; }

    const wrapRect = renderer.bodyWrapper.getBoundingClientRect();
    const startEl = renderer.getCellEl(rect.startRow, rect.startCol);
    const endEl = renderer.getCellEl(rect.endRow, rect.endCol);
    if (!startEl || !endEl) { this._hideOverlay(); return; }

    const r1 = startEl.getBoundingClientRect();
    const r2 = endEl.getBoundingClientRect();
    const left = Math.min(r1.left, r2.left) - wrapRect.left;
    const top = Math.min(r1.top, r2.top) - wrapRect.top;
    const right = Math.max(r1.right, r2.right) - wrapRect.left;
    const bottom = Math.max(r1.bottom, r2.bottom) - wrapRect.top;

    Object.assign(this._borderEl!.style, {
      display: 'block', left: `${left}px`, top: `${top}px`,
      width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px`,
    });

    if (this._rangeOpts().fillHandle) {
      Object.assign(this._handleEl!.style, { display: 'block', left: `${right}px`, top: `${bottom}px` });
    } else {
      this._handleEl!.style.display = 'none';
    }

    if (this._fillPreview) {
      const t = this._fillPreview.target;
      const tsEl = renderer.getCellEl(t.startRow, t.startCol);
      const teEl = renderer.getCellEl(t.endRow, t.endCol);
      if (tsEl && teEl) {
        const tr1 = tsEl.getBoundingClientRect();
        const tr2 = teEl.getBoundingClientRect();
        const pl = Math.min(tr1.left, tr2.left) - wrapRect.left;
        const pt = Math.min(tr1.top, tr2.top) - wrapRect.top;
        const pr = Math.max(tr1.right, tr2.right) - wrapRect.left;
        const pb = Math.max(tr1.bottom, tr2.bottom) - wrapRect.top;
        Object.assign(this._previewEl!.style, {
          display: 'block', left: `${pl}px`, top: `${pt}px`,
          width: `${Math.max(0, pr - pl)}px`, height: `${Math.max(0, pb - pt)}px`,
        });
        return;
      }
    }
    this._previewEl!.style.display = 'none';
  }

  private _hideOverlay(): void {
    if (this._borderEl) this._borderEl.style.display = 'none';
    if (this._handleEl) this._handleEl.style.display = 'none';
    if (this._previewEl) this._previewEl.style.display = 'none';
  }

  /** OpenGrid._doRender 가 renderBody extraOpts 로 전달(M-6).
   * / Passed by OpenGrid._doRender as renderBody's extraOpts (M-6).
   *
   * @returns 현재 선택 범위들을 담은 렌더 옵션 조각 / A render-options fragment carrying the current selected ranges
   */
  getOverlayExtraOpts(): { _rangeRects: CellRange[] } {
    return { _rangeRects: this._model.getRangeSelection() };
  }

  // ── 채우기 핸들 드래그(UC-4/5, §3.4) ───────────────────────────
  private _resolveCellAtPoint(x: number, y: number): { ri: number; ci: number } | null {
    const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) as HTMLElement | null : null;
    const cellEl = el?.closest('.og-cell') as HTMLElement | null;
    const rowEl = cellEl?.closest('.og-row') as HTMLElement | null;
    if (!cellEl || !rowEl) return null;
    const ciAttr = cellEl.getAttribute('aria-colindex');
    const riAttr = rowEl.getAttribute('aria-rowindex');
    if (ciAttr == null || riAttr == null) return null;
    return { ri: Number(riAttr) - 1, ci: Number(ciAttr) - 1 };
  }

  private _onHandlePointerDown(e: PointerEvent): void {
    const rect = this.getActiveRange();
    if (!rect) return;
    e.stopPropagation();
    e.preventDefault();
    this._handlePointerId = e.pointerId;
    try { this._handleEl?.setPointerCapture(e.pointerId); } catch { /* jsdom 등 미지원 환경 방어 */ }
    this._fillDragSource = rect;
    this._fillDragStart = { x: e.clientX, y: e.clientY };
    const onMove = (ev: PointerEvent) => this._onHandlePointerMove(ev);
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this._onHandlePointerUp(ev);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  private _onHandlePointerMove(e: PointerEvent): void {
    const source = this._fillDragSource;
    const start = this._fillDragStart;
    if (!source || !start) return;
    const target = this._resolveCellAtPoint(e.clientX, e.clientY);
    if (!target) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const vertical = Math.abs(dy) >= Math.abs(dx);

    let axis: FillAxis;
    let targetRect: CellRange;
    if (vertical) {
      if (target.ri > source.endRow) {
        axis = 'down';
        targetRect = { startRow: source.endRow + 1, endRow: target.ri, startCol: source.startCol, endCol: source.endCol };
      } else if (target.ri < source.startRow) {
        axis = 'up';
        targetRect = { startRow: target.ri, endRow: source.startRow - 1, startCol: source.startCol, endCol: source.endCol };
      } else { this._fillPreview = null; this.repaint(); return; }
    } else {
      if (target.ci > source.endCol) {
        axis = 'right';
        targetRect = { startRow: source.startRow, endRow: source.endRow, startCol: source.endCol + 1, endCol: target.ci };
      } else if (target.ci < source.startCol) {
        axis = 'left';
        targetRect = { startRow: source.startRow, endRow: source.endRow, startCol: target.ci, endCol: source.startCol - 1 };
      } else { this._fillPreview = null; this.repaint(); return; }
    }

    const rs = this._rangeOpts();
    const baseMode: FillMode = rs.seriesFill ? 'series' : 'copy';
    const ctrlForced = e.ctrlKey || e.metaKey;
    const mode: FillMode = ctrlForced ? (baseMode === 'series' ? 'copy' : 'series') : baseMode;
    this._fillPreview = { source, target: targetRect, axis, mode };
    this.repaint();
  }

  private _onHandlePointerUp(_e: PointerEvent): void {
    const preview = this._fillPreview;
    this._fillDragSource = null;
    this._fillDragStart = null;
    this._fillPreview = null;
    this._handlePointerId = null;
    if (preview) this._commitFill(preview.source, preview.target, preview.axis, preview.mode);
    this.repaint();
  }
}
