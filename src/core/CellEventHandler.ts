import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { CellEditManager } from './CellEditManager.js';
import type { RowManager } from './RowManager.js';
import { isToggleCol } from './CellTypeRegistry.js';
import { evaluateFormula } from './FormulaEngine.js';
import { OGDecimal } from './OGDecimal.js';

/**
 * {@link CellEventHandler} 의존성 주입 계약. / Dependency-injection contract for {@link CellEventHandler}.
 *
 * DOM 셀 이벤트를 그리드 선택/편집/범위선택 서브시스템에 연결하는 데 필요한
 * 접근 함수와 배선 훅을 호스트 그리드가 제공한다.
 * / The host grid supplies the accessors and wiring hooks needed to route DOM
 * cell events into the selection/edit/range-selection subsystems.
 */
export interface CellEventDeps<T extends Record<string, any>> {
  /** 현재 데이터 레이어 조회. / Look up the current data layer. */
  getData: () => DataLayer<T>;
  /** 현재 컬럼 레이아웃 조회. / Look up the current column layout. */
  getColLayout: () => ColumnLayout<T>;
  /** 현재 그리드 옵션 조회. / Look up the current grid options. */
  getOptions: () => any;
  /** 셀 편집 매니저 조회. / Look up the cell edit manager. */
  getEditMgr: () => CellEditManager<T>;
  /** 행 선택/체크 매니저 조회. / Look up the row selection/check manager. */
  getRowMgr: () => RowManager<T>;
  /** 그리드 이벤트를 발행한다. / Emit a grid event. */
  emit: (event: string, ...args: any[]) => void;
  /** 셀 값을 기록한다(토글/라디오 컬럼 등에서 사용). / Write a cell value (used by toggle/radio columns, etc.). */
  writeCell: (ri: number, field: string, value: any) => void;
  /** 바디를 다시 그린다. / Re-render the body. */
  doRender: () => void;
  /** 그리드 컨테이너 엘리먼트 조회. / Look up the grid container element. */
  getContainer: () => HTMLElement;
  // ── F1: 범위 선택(selection:'cells') 배선 훅(M-1) ──────────────
  /** 'cells' 모드 클릭/Shift+클릭 위임 — RangeSelectionManager.handleClick 로 연결
   * / Delegates 'cells'-mode click/Shift+click — wired to `RangeSelectionManager.handleClick`. */
  onCellsClick?: (ri: number, ci: number, shiftKey: boolean) => void;
  /** 범위 드래그 선택 상태머신(§3.1) — RangeSelectionManager.handleCellMouseDown/Move/Up 로 연결
   * / Range drag-select state machine (§3.1) — wired to `RangeSelectionManager.handleCellMouseDown/Move/Up`. */
  rangeMouseDown?: (ri: number, ci: number, e: MouseEvent) => void;
  /** {@link rangeMouseDown} 참조 — 드래그 이동 단계. / See {@link rangeMouseDown} — the drag-move phase. */
  rangeMouseMove?: (ri: number, ci: number, e: MouseEvent) => void;
  /** {@link rangeMouseDown} 참조 — 드래그 종료 단계. / See {@link rangeMouseDown} — the drag-end phase. */
  rangeMouseUp?: (ri: number, ci: number, e: MouseEvent) => void;
}

/**
 * 셀 DOM 이벤트(클릭·더블클릭·마우스·키)를 라우팅하는 핸들러. / Routes cell DOM events (click, double-click, mouse, key) to the right subsystem.
 *
 * 선택 모드(`single`/`multiple`/`row`/`cells`)에 따라 행/범위 선택을 위임하고,
 * 토글·라디오 컬럼 값 반영, 편집 시작, 그리고 공개 셀/행 이벤트(`cellClick` 등)
 * 발행까지 한 곳에서 처리한다.
 * / Delegates row/range selection based on the selection mode (`single`/`multiple`/
 * `row`/`cells`), applies toggle/radio column values, kicks off editing, and emits
 * the public cell/row events (`cellClick`, etc.) — all in one place.
 */
export class CellEventHandler<T extends Record<string, any> = any> {
  private _d: CellEventDeps<T>;

  constructor(deps: CellEventDeps<T>) {
    this._d = deps;
  }

  /**
   * 셀 클릭을 처리한다: 선택 모드 적용, 토글/라디오 값 반영, `cellClick`/`rowClick`
   * 이벤트 발행, 필요 시 편집 시작까지 수행한다.
   * / Handles a cell click: applies the selection mode, updates toggle/radio values,
   * emits `cellClick`/`rowClick`, and starts editing when appropriate.
   *
   * @param rowIndex - 클릭된 행의 flat index / Flat index of the clicked row
   * @param colIndex - 클릭된 컬럼 인덱스(행 헤더 등은 -1일 수 있음) / Clicked column index (may be -1 for row-header-like clicks)
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellClick(rowIndex: number, colIndex: number, e: MouseEvent): void {
    const opts = this._d.getOptions();
    const rowMgr = this._d.getRowMgr();
    const editMgr = this._d.getEditMgr();

    if (opts.selection === 'single' || opts.selection === 'row') {
      rowMgr.selectSingle(rowIndex);
    } else if (opts.selection === 'multiple') {
      if (e.ctrlKey || e.metaKey) {
        rowMgr.selectToggle(rowIndex);
      } else {
        rowMgr.selectSingle(rowIndex);
      }
    } else if (opts.selection === 'cells' && colIndex >= 0) {
      // FR-1(M-1): 'cells' 모드 — 1×1 앵커/Shift 확장은 RangeSelectionManager 가 소유.
      this._d.onCellsClick?.(rowIndex, colIndex, e.shiftKey);
    }

    const row = this._d.getData().getRowByIndex(rowIndex);
    const col = this._d.getColLayout().visibleLeaves[colIndex];

    if (row && col) {
      const colEditable = col.editable !== false && (col.editable !== undefined || opts.editable);
      if (isToggleCol(col) && colEditable) {
        const curVal = (row as any)[col.field];
        this._d.writeCell(rowIndex, col.field as unknown as string, !curVal);
      }

      if ((col.type as string) === 'radio') {
        const grp = (col as any).group;
        for (const c of this._d.getColLayout().visibleLeaves) {
          if ((c.type as string) === 'radio' && c.field !== col.field &&
              (!grp || (c as any).group === grp)) {
            this._d.getData().updateCell(rowIndex, c.field, false);
          }
        }
        this._d.writeCell(rowIndex, col.field as any, true);
      }

      let cellValue = (row as any)[col.field];
      if (cellValue === undefined && (col as any).formula) {
        try {
          const prec = (col as any).formulaPrecision ?? 30;
          const result = evaluateFormula((col as any).formula, row as any, prec);
          cellValue = result instanceof OGDecimal
            ? ((col as any).precision != null ? result.toFixed((col as any).precision) : result.toString())
            : String(result);
        } catch {}
      }
      const evt = {
        type: 'cellClick', rowIndex, columnIndex: colIndex,
        field: col.field, value: cellValue, row, column: col,
        target: e.target as HTMLElement, originalEvent: e,
      };
      this._d.emit('cellClick', evt);
      opts.onCellClick?.(evt);

      const rowEvt = { type: 'rowClick', rowIndex, row, target: e.target as HTMLElement, originalEvent: e };
      this._d.emit('rowClick', rowEvt);
      opts.onRowClick?.(rowEvt);

      const isSelectCol = (col.type as string) === 'select';
      const alreadyEditing = editMgr.activeEditor != null &&
        editMgr.editCell?.ri === rowIndex && editMgr.editCell?.ci === colIndex;
      if (!alreadyEditing && (opts.editMode === 'click' || isSelectCol) && !isToggleCol(col)) {
        editMgr.startEdit(rowIndex, colIndex, e);
      }
    }

    if (editMgr.activeEditor && editMgr.editCell?.ri === rowIndex && editMgr.editCell?.ci === colIndex) {
      return;
    }

    // 'cells' 모드는 RangeSelectionManager.handleClick(onCellsClick 경유)이 이미
    // doRender + selectionChange/rangeChange 를 처리했다(중복 emit 방지, M-1 회귀 격리).
    if (opts.selection === 'cells') return;

    this._d.doRender();
    this._d.emit('selectionChange', {
      rows: rowMgr.getSelections(),
      rowIndexes: [...rowMgr.selectedRows],
    });
    opts.onSelectionChange?.({ rows: rowMgr.getSelections(), rowIndexes: [...rowMgr.selectedRows], cells: [] });
  }

  /**
   * 셀 더블클릭을 처리한다: `cellDblClick`/`rowDblClick` 발행, `editMode:'dblclick'` 이면 편집 시작.
   * / Handles a cell double-click: emits `cellDblClick`/`rowDblClick`, and starts editing
   * when `editMode` is `'dblclick'`.
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param colIndex - 대상 컬럼 인덱스 / Target column index
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellDblClick(rowIndex: number, colIndex: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(rowIndex);
    const col = this._d.getColLayout().visibleLeaves[colIndex];
    if (!row || !col) return;

    const opts = this._d.getOptions();
    const evt = {
      type: 'cellDblClick', rowIndex, columnIndex: colIndex,
      field: col.field, value: row[col.field], row, column: col,
      target: e.target as HTMLElement, originalEvent: e,
    };
    this._d.emit('cellDblClick', evt);
    opts.onCellDblClick?.(evt);

    const rowEvt = { type: 'rowDblClick', rowIndex, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowDblClick', rowEvt);
    opts.onRowDblClick?.(rowEvt);

    if (opts.editMode === 'dblclick') this._d.getEditMgr().startEdit(rowIndex, colIndex, e);
  }

  /**
   * 마우스 오버: `cellMouseOver`/`rowMouseOver` 이벤트를 발행한다. / Mouse-over: emits `cellMouseOver`/`rowMouseOver`.
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param ci - 대상 컬럼 인덱스 / Target column index
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellMouseOver(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseOver', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseOver', cellEvt);
    opts.onCellMouseOver?.(cellEvt);
    const rowEvt = { type: 'rowMouseOver', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseOver', rowEvt);
    opts.onRowMouseOver?.(rowEvt);
  }

  /**
   * 마우스 아웃: `cellMouseOut`/`rowMouseOut` 이벤트를 발행한다. / Mouse-out: emits `cellMouseOut`/`rowMouseOut`.
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param ci - 대상 컬럼 인덱스 / Target column index
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellMouseOut(ri: number, ci: number, e: MouseEvent): void {
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseOut', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseOut', cellEvt);
    opts.onCellMouseOut?.(cellEvt);
    const rowEvt = { type: 'rowMouseOut', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseOut', rowEvt);
    opts.onRowMouseOut?.(rowEvt);
  }

  /**
   * 마우스 다운: 범위 드래그 선택 상태머신을 먼저 위임한 뒤 `cellMouseDown`/`rowMouseDown` 을 발행한다.
   * / Mouse-down: delegates to the range drag-select state machine first, then emits
   * `cellMouseDown`/`rowMouseDown`.
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param ci - 대상 컬럼 인덱스 / Target column index
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellMouseDown(ri: number, ci: number, e: MouseEvent): void {
    this._d.rangeMouseDown?.(ri, ci, e); // §3.1 드래그 선택 상태머신(no-op if selection!=='cells')
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseDown', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseDown', cellEvt);
    opts.onCellMouseDown?.(cellEvt);
    const rowEvt = { type: 'rowMouseDown', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseDown', rowEvt);
    opts.onRowMouseDown?.(rowEvt);
  }

  /**
   * 마우스 업: 범위 드래그 선택 종료를 위임한 뒤 `cellMouseUp`/`rowMouseUp` 을 발행한다.
   * / Mouse-up: delegates the drag-select end, then emits `cellMouseUp`/`rowMouseUp`.
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param ci - 대상 컬럼 인덱스 / Target column index
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellMouseUp(ri: number, ci: number, e: MouseEvent): void {
    this._d.rangeMouseUp?.(ri, ci, e);
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseUp', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseUp', cellEvt);
    opts.onCellMouseUp?.(cellEvt);
    const rowEvt = { type: 'rowMouseUp', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseUp', rowEvt);
    opts.onRowMouseUp?.(rowEvt);
  }

  /**
   * 마우스 이동: 범위 드래그 확장을 위임한 뒤 `cellMouseMove`/`rowMouseMove` 를 발행한다.
   * / Mouse-move: delegates the drag-select extension, then emits `cellMouseMove`/`rowMouseMove`.
   *
   * @param ri - 대상 행의 flat index / Flat index of the target row
   * @param ci - 대상 컬럼 인덱스 / Target column index
   * @param e - 원본 마우스 이벤트 / The originating mouse event
   */
  handleCellMouseMove(ri: number, ci: number, e: MouseEvent): void {
    this._d.rangeMouseMove?.(ri, ci, e);
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const cellEvt = { type: 'cellMouseMove', rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('cellMouseMove', cellEvt);
    opts.onCellMouseMove?.(cellEvt);
    const rowEvt = { type: 'rowMouseMove', rowIndex: ri, row, target: e.target as HTMLElement, originalEvent: e };
    this._d.emit('rowMouseMove', rowEvt);
    opts.onRowMouseMove?.(rowEvt);
  }

  /**
   * 현재 포커스 셀에 대한 키보드 이벤트를 공개 이벤트로 발행한다(편집 중이거나 포커스 셀이 없으면 무시).
   * / Emits a public event for a keyboard action on the currently focused cell
   * (no-op while editing or when there is no focus cell).
   *
   * @param eventName - 발행할 이벤트 종류 / Which event kind to emit
   * @param e - 원본 키보드 이벤트 / The originating keyboard event
   */
  handleCellKeyEvt(eventName: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent): void {
    const editMgr = this._d.getEditMgr();
    if (!editMgr.focusCell || editMgr.activeEditor) return;
    const { ri, ci } = editMgr.focusCell;
    const row = this._d.getData().getRowByIndex(ri);
    const col = this._d.getColLayout().visibleLeaves[ci];
    if (!row || !col) return;
    const opts = this._d.getOptions();
    const evt = { type: eventName, rowIndex: ri, columnIndex: ci, field: col.field, value: (row as any)[col.field], row, column: col as any, key: e.key, target: this._d.getContainer(), originalEvent: e };
    this._d.emit(eventName, evt);
    if (eventName === 'cellKeyDown') opts.onCellKeyDown?.(evt as any);
    else if (eventName === 'cellKeyUp') opts.onCellKeyUp?.(evt as any);
    else opts.onCellKeyPress?.(evt as any);
  }
}
