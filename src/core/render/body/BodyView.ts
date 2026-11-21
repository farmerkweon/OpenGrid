import type { AppearanceResolver } from '../../AppearanceResolver.js';
import type { RenderFrame, RendererCallbacks } from '../../GridRenderer.js';
import { _el } from '../dom.js';
import type { CellRegistry } from './CellRegistry.js';
import type { IColumnGeometry } from '../../coordinate/geometryPorts.js';
import type { IGeometryApplier } from '../ports.js';
import { createExtraCellPainters } from './ExtraCellPainters.js';
import { RowPainterTable } from './rows/RowPainterTable.js';
import { DataRowPainter } from './rows/DataRowPainter.js';
import { GroupRowPainter } from './rows/GroupRowPainter.js';
import { DetailRowPainter, DetailFillerRowPainter } from './rows/DetailRowPainter.js';
import type { BodyRowContext } from './rows/BodyRowContext.js';
import { ColumnPaintPlan } from './ColumnPaintPlan.js';
import { CellLocator } from './CellLocator.js';
import { BodyEventRouter } from './BodyEventRouter.js';
import { ColumnWindow } from '../../coordinate/ColumnWindow.js';
import type { IColumnWindow } from '../../coordinate/geometryPorts.js';
import type { RowWork, ColWork } from '../../domain/render/ports.js';
import { layoutOf } from './rows/WindowLayout.js';
import { BodyRowSet } from './BodyRowSet.js';
import { viewIndex } from '../../coordinate/types.js';

/**
 * 본문 DOM(행·칸·디테일 패널·빈 자료 안내)을 그리는 객체. 본문에 무엇이 그려져 있는지 아는 곳을 렌더러 앞면에서 떼어 냈다.
 * 지금은 부를 때마다 보이는 구간을 통째로 다시 만들고, 그린 칸은 칸 지도(`CellRegistry`)에 행 단위로 넣는다.
 * 행을 어떻게 그리는지는 행 종류마다 그리개가 맡고(종류 판정은 `RowPainterTable`), 이 객체는 구간을 돌며 맡기기만 한다.
 *
 * Paints the body DOM (rows, cells, detail panels, empty-data message). Split out of the renderer facade so the
 * knowledge of what is drawn in the body lives in one place. For now each call rebuilds the visible range as a whole
 * and puts the painted cells into the cell map (`CellRegistry`) row by row. How a row is drawn belongs to the
 * painter of its kind (kind lookup in `RowPainterTable`); this object walks the range and delegates.
 */
export class BodyView {
  /**
   * 행 종류 → 그리개(그리개는 여기서 한 번만 만든다 — 행마다 만들지 않음).
   *
   * Row kind → painter (painters are created once here, never per row).
   */
  private readonly _rows: RowPainterTable;

  /**
   * 행 밖 세로 병합 마스터 → 행 번호, 묶음 행 → 묶음 열쇠. 그릴 때마다 비우고 다시 채운다(떼어 낸 요소를 붙들지 않게).
   * 본문 이벤트 위임이 칸·묶음 행을 알아볼 때 읽는다.
   *
   * Row-spanning master → row index and group row → group key; cleared and refilled every paint (detached elements
   * are not retained). Read by the body event delegation to recognise cells and group rows.
   */
  private readonly _masters = new Map<HTMLElement, number>();
  private readonly _groupKeys = new Map<HTMLElement, string>();
  private readonly _treeIcons = new Map<Element, unknown>();
  /** 마지막 그리기의 묶음·나무 펴고 접기 콜백. / Group and tree toggle callbacks of the latest paint. */
  private _onGroupToggle: ((key: string) => void) | undefined;
  private _onTreeToggle: ((nodeId: any) => void) | undefined;
  /** 본문 마우스 이벤트를 한 곳에서 받는 객체. / Receives the body's mouse events in one place. */
  private readonly _events: BodyEventRouter;

  /**
   * 지금 본문에 그려 둔 컬럼 창 — 이것을 아는 곳은 이 객체 하나다(스케줄러가 다음 창과 견줘 옮길지 정한다). 아직 안 그렸으면 null.
   *
   * The column window currently drawn — only this object knows it (the scheduler compares it with the next window).
   */
  private readonly _drawn: { columns: IColumnWindow | null; diffBlocked: boolean } = { columns: null, diffBlocked: true };
  /**
   * 그려 둔 창과, 그려 둔 행으로는 세로 행 차분을 못 하는지(세로 병합·묶음·나무·디테일·autoHeight 가 있으면 참 — 아직 안 그렸어도 참).
   *
   * The drawn window and whether the drawn rows rule out a vertical row diff (merges, group, tree, detail, autoHeight; true before any paint).
   */
  get drawn(): { readonly columns: IColumnWindow | null; readonly diffBlocked: boolean } { return this._drawn; }
  /** 지금 DOM 에 있는 자료 행(행 번호 → 요소). / Data rows currently in the DOM (row index → element). */
  private readonly _rowSet = new BodyRowSet();
  /**
   * 행마다 그릴 때의 상태 열쇠(행 상태·선택·체크·포커스 칸·범위 칸) — 남는 행이 지금 프레임과 다르면 그 행만 다시 만든다.
   *
   * Per-row state key at paint time; a staying row whose key differs from the current frame is repainted alone.
   */
  private readonly _rowKeys = new Map<number, string>();
  /** 편집 중이라 창 밖으로 나가도 떼지 않는 행(없으면 null). / Row kept while editing even when it leaves the range. */
  private _editRow: number | null = null;
  /** 마지막으로 그린 행 범위(끝 포함). / Last painted row range (inclusive). */
  private _start = 0;
  private _end = -1;
  /** 마지막 통째 그리기의 문맥과 프레임(창 옮김·다시 그리기에 다시 씀). / Context and frame of the last full paint. */
  private _ctx: BodyRowContext | null = null;
  private _frame: RenderFrame | null = null;
  private readonly _dataRows: DataRowPainter;
  private readonly _groupRows: GroupRowPainter;
  /**
   * 창에서 나간 칸을 뗄 때: 위임이 그 칸에 걸어 둔 한 번짜리 듣개를 풀고, 칸 안 조건부 서식 막대의 폭 등록과 나무 아이콘 지도 몫을 푼다.
   *
   * When a cell leaves the window: drop the delegation's one-shot listener on it, its CF bar registration and its tree-icon entry.
   */
  private readonly _onRemoveCell = (cell: HTMLElement): void => {
    this._events.forget(cell);
    const bar = cell.firstElementChild;
    if (bar && bar.classList.contains('og-cf-bar')) this._applier?.untrack(bar as HTMLElement);
    if (this._treeIcons.size > 0) this._forgetIcons(cell);
  };

  /** 그 요소 안 나무 아이콘을 아이콘 지도에서 지운다. / Removes the tree icons inside the element from the icon map. */
  private _forgetIcons(el: Element): void {
    const icons = el.getElementsByClassName('og-tree-node-icon--toggle');
    for (let i = 0; i < icons.length; i++) this._treeIcons.delete(icons[i]!);
  }

  constructor(
    private readonly _body: HTMLElement,
    private readonly _ap: AppearanceResolver,
    private readonly _cbs: RendererCallbacks,
    private readonly _cellMap: CellRegistry,
    private readonly _tr: (key: string, params?: Record<string, string | number>) => string,
  ) {
    const extras = createExtraCellPainters(_cbs, _tr);
    this._dataRows = new DataRowPainter(_ap, _cbs, _cellMap, _tr, extras);
    this._groupRows = new GroupRowPainter(_ap, _tr);
    this._rows = new RowPainterTable([
      this._dataRows,
      this._groupRows,
      new DetailRowPainter(_ap),
      new DetailFillerRowPainter(),
    ]);
    this._events = new BodyEventRouter(_body, new CellLocator(_body, this._masters), _cbs, {
      otherRowClick: (top) => {
        const key = this._groupKeys.get(top);
        if (key !== undefined) this._onGroupToggle?.(key);
      },
      treeToggle: (target) => {
        if (!this._treeIcons.has(target as Element)) return false;
        this._onTreeToggle?.(this._treeIcons.get(target as Element));
        return true;
      },
    });
  }

  /**
   * 본문 리스너를 뗀다(그리드를 지울 때).
   *
   * Detaches the body listeners (when the grid is destroyed).
   */
  destroy(): void {
    this._events.destroy();
    this._masters.clear();
    this._groupKeys.clear();
    this._treeIcons.clear();
  }

  /**
   * 컬럼 폭·왼쪽 위치·전체 폭·여분 칸 폭을 묻는 곳. 그리드가 하나 쥔 기하 객체를 한 번 넘겨받아 든다.
   * 폭을 이 뷰 안에서 다시 더하지 않고 기하에 묻게 해야, 폭을 아는 곳이 하나로 남는다.
   *
   * Where column widths, lefts, total width and extra-cell widths are asked. The grid hands over its
   * single geometry object once; asking it (instead of re-summing here) keeps one owner of widths.
   */
  private _geometry!: IColumnGeometry;

  /**
   * 기하 객체를 넘겨받는다(그리기 전에 한 번). 그리드가 그리기 직전마다 같은 객체를 지금 폭으로 맞춰 둔다.
   *
   * Receive the geometry object (once, before painting). The grid keeps that same object in sync before each paint.
   */
  setGeometry(geometry: IColumnGeometry): void {
    this._geometry = geometry;
  }

  /**
   * 기하에서 나온 px 를 DOM 에 쓰는 객체. 본문은 칸이 아닌 폭 자리를 여기에 기억시키기만 한다(칸은 칸 지도가 안다).
   *
   * Writer of geometry-derived px. The body only registers its non-cell width spots here (cells live in the cell map).
   */
  private _applier: IGeometryApplier | undefined;

  /**
   * 폭 쓰는 객체를 넘겨받는다(그리기 전에 한 번 — 기하가 바뀌면 다시).
   *
   * Receive the width writer (once before painting; again when the geometry is replaced).
   */
  setApplier(applier: IGeometryApplier): void {
    this._applier = applier;
  }

  private _t(key: string, params?: Record<string, string | number>): string {
    return this._tr(key, params);
  }

  /**
   * 그려진 칸 요소(없으면 undefined — 보이는 구간 밖이거나 병합으로 가려진 칸).
   *
   * The painted cell element (undefined when outside the visible range or hidden by a merge).
   */
  cell(ri: number, ci: number): HTMLElement | undefined {
    return this._cellMap.get(ri, ci);
  }

  /**
   * 본문 보이는 구간을 통째로 다시 그린다(칸 지도도 비우고 다시 채운다).
   *
   * Rebuild the visible body range as a whole (the cell map is cleared and refilled too).
   */
  rebuildWindow(frame: RenderFrame): void {
    if (frame.rowWork === 'diff' && this._canDiff(frame)) { this._diffRows(frame); return; }
    // R3: 위치 인자 → 파라미터 객체. opts 는 아래에서 재할당되므로 let 지역, 나머지는 구조분해.
    const {
      startIndex, endIndex, data,
      totalHeight,
      groupFlatRows = null, onGroupToggle, onTreeToggle,
      extraOpts = {}, mergeEngine, detailApi,
    } = frame;
    // 본문을 통째로 다시 그리므로 옛 등록을 먼저 푼다(떼어 낸 요소를 붙들지 않게).
    // The whole body is repainted, so release old registrations first (so detached elements are not retained).
    const applier = this._applier;
    applier?.release('body');
    let opts = frame.opts;
    // opts에 extraOpts 병합 (DnD _totalRows 등)
    if (Object.keys(extraOpts).length) opts = { ...opts, ...extraOpts };
    // F2(§5 skip-rebuild): teardown(아래 innerHTML='') 전에 편집중 host 를 hoist, 나머지는 detach.
    detailApi?.onBeforeTeardown();
    this._body.innerHTML = '';
    this._cellMap.clear();
    this._rowSet.clear();
    this._rowKeys.clear();
    this._masters.clear();
    this._groupKeys.clear();
    this._treeIcons.clear();
    this._onGroupToggle = onGroupToggle;
    this._onTreeToggle = onTreeToggle;
    // autoHeight(비가상): 행을 플로우로 쌓아 높이 자동. 그 외: 고정 rowHeight 절대배치.
    const auto: boolean = opts.autoHeight === true;
    this._body.classList.toggle('og-autoheight', auto);
    this._body.style.height = auto ? '' : `${totalHeight}px`;
    const frozenCount: number = opts._frozenCount ?? 0;
    // F2(§4.3/§6.1): 전용 expander 컬럼(toggle:'first-cell' 이면 별도 컬럼 없이 첫 셀에 얹음). 켜졌나의 원천은 여분 컬럼 값 하나
    // (폭·자리를 정하는 그 값) — 디테일 배선이 있을 때만 그 칸을 그린다.
    // F2: the dedicated expander column; whether it is on comes from the extra-column value alone (the one that sets its
    // width and place) — the cell is drawn only when detail wiring exists.
    const geo = this._geometry;
    const extra = geo.extra;
    const detailColOn = !!detailApi && extra.widthOf('detail') > 0;
    // 이번에 그릴 컬럼 창(없으면 전 컬럼 — 걸음 전과 같은 DOM).
    // The column window for this paint (absent = all columns, the same DOM as before).
    const columns = frame.columns ?? ColumnWindow.full(geo.count);
    this._drawn.columns = columns;
    this._drawn.diffBlocked = auto || groupFlatRows !== null || !!(mergeEngine && !mergeEngine.isEmpty);
    this._frame = frame;
    this._ctx = null;
    this._start = startIndex;
    this._end = endIndex;

    // 바디 최소 너비를 totalColWidth로 설정 — 헤더 table과 너비 동기화 (수평 스크롤 영역 확보)
    const totalColWidth = geo.totalWidth();
    this._body.style.minWidth = `${totalColWidth}px`;
    applier?.trackTotal(this._body, 'minWidth', 'body');

    if (endIndex < startIndex) return;

    const frag = document.createDocumentFragment();
    const ctx = this._context(frame, opts, columns, auto, frozenCount, detailColOn, totalColWidth, frag);
    const rows = this._rows;
    // F2(EC-3 뷰포트 상단 걸침): head 가 startIndex 위에 있고 span 이 startIndex 를 덮는 경우
    // 백스캔으로 먼저 그린다(merge master 와 동형의 잠재 버그 — 디테일은 span 이 커서 명시 구현).
    if (groupFlatRows && detailApi) {
      for (let bi = startIndex - 1; bi >= 0; bi--) {
        const it: any = groupFlatRows[bi];
        if (it && it._isDetailFiller === true) continue;
        if (it && it._isDetailHead === true) {
          if (bi + it._span - 1 >= startIndex) {
            const panel = rows.painterFor('detail-head').paint(bi, it, ctx);
            if (panel) frag.appendChild(panel);
          }
        }
        break;
      }
    }
    for (let ri = startIndex; ri <= endIndex; ri++) {
      // 그룹/트리 모드: flatRow 배열 사용
      const flatItem = groupFlatRows ? groupFlatRows[ri] : null;
      const rowEl = rows.painterFor(rows.kindOf(flatItem)).paint(ri, flatItem, ctx);
      if (rowEl) {
        frag.appendChild(rowEl);
        if (!this._drawn.diffBlocked) {
          this._rowSet.add(ri, rowEl);
          this._rowKeys.set(ri, this._stateKey(ri, ctx, ctx.rowState));
        }
      }
    }

    // 빈 데이터 메시지
    if (data.rowCount === 0) {
      const empty = _el('div', 'og-empty-message');
      empty.textContent = this._t('grid.emptyMessage');
      empty.style.cssText = `width:100%;`;
      frag.appendChild(empty);
    }

    this._body.appendChild(frag);
  }

  /**
   * 그리기 한 번의 문맥 — 행 그리개·여분 칸 그리개가 나눠 쓴다(행마다 바뀌는 칸은 자료 행 그리개가 채움).
   *
   * One context per paint, shared by the row and extra-cell painters (per-row fields filled by the data-row painter).
   */
  private _context(
    frame: RenderFrame, opts: any, columns: IColumnWindow, auto: boolean, frozenCount: number,
    detailColOn: boolean, totalColWidth: number, frag: DocumentFragment,
  ): BodyRowContext {
    const { startIndex, endIndex, data, leaves, offsetY, selectedRows, checkedRows, groupFlatRows = null, mergeEngine, detailApi } = frame;
    const geo = this._geometry;
    const extra = geo.extra;
    const applier = this._applier;
    const ctx: BodyRowContext = {
      opts, data, leaves, startIndex, endIndex, offsetY, selectedRows, checkedRows,
      groupFlatRows, mergeEngine, detailApi, detailColOn,
      auto, frozenCount, geometry: geo, totalColWidth, frag,
      columns, layout: layoutOf(columns),
      plans: leaves.map((col: any) => new ColumnPaintPlan(col)),
      masters: this._masters, groupKeys: this._groupKeys, treeIcons: this._treeIcons,
      extraIds: extra.ids,
      extraLeft: {
        state: extra.leftOf('state'), drag: extra.leftOf('drag'), rowNumber: extra.leftOf('rowNumber'),
        check: extra.leftOf('check'), detail: extra.leftOf('detail'),
      },
      extraWidth: extra.width(),
      dragWidth: extra.widthOf('drag'),
      detailWidth: extra.widthOf('detail'),
      applier, trackBar: undefined,
      rowState: 'none', bg: '', dnd: null, dragGap: 0, cellCi: 0, cellSpan: 1,
      rowData: null, treeNode: null, extraCount: 0,
    };
    this._ctx = ctx;
    // 막대 알림은 그리기당 하나 — 지금 그리는 칸의 번호·병합 폭을 문맥에서 읽는다(막대는 칸을 그리는 도중에만 생긴다).
    // One bar callback per paint; it reads the current cell's index/span from the context (bars only appear mid-cell).
    if (applier) ctx.trackBar = (bar, ratio) => applier.trackBar(bar, ctx.cellCi, ctx.cellSpan, ratio);
    return ctx;
  }

  /**
   * 행이 그려질 때의 상태 열쇠 — 행 상태·선택·체크·그 행의 포커스 칸·그 행에 걸친 범위 칸 구간. 같은 열쇠면 그 행 DOM 은 같다.
   *
   * State key of a row at paint time (row state, selection, check, focused cell, range spans on the row).
   */
  private _stateKey(ri: number, ctx: BodyRowContext, rowState?: string): string {
    const o = ctx.opts;
    const f = o._focusCell;
    let key = `${rowState ?? ctx.data.getRowState(ri)}|${ctx.selectedRows.has(ri) ? 1 : 0}|${ctx.checkedRows.has(ri) ? 1 : 0}|${f && f.ri === ri ? f.ci : -1}`;
    const rects = o._rangeRects as Array<{ startRow: number; endRow: number; startCol: number; endCol: number }> | undefined;
    if (rects) for (const r of rects) if (ri >= r.startRow && ri <= r.endRow) key += `|${r.startCol}-${r.endCol}`;
    return key;
  }

  /**
   * 세로 행 차분을 해도 되나 — 그려 둔 행이 막힌 종류가 아니고, 자료·컬럼 구성이 그대로고, 두 범위가 겹칠 때만.
   *
   * Whether a vertical row diff is allowed: drawn rows not blocked, same data and columns, overlapping ranges.
   */
  private _canDiff(frame: RenderFrame): boolean {
    const prev = this._frame;
    const ctx = this._ctx;
    if (!prev || !ctx || this._drawn.diffBlocked || this._rowSet.size === 0) return false;
    if (frame.data !== prev.data || frame.leaves.length !== prev.leaves.length) return false;
    if (frame.opts.rowHeight !== prev.opts.rowHeight) return false;
    if ((frame.groupFlatRows ?? null) !== null || frame.opts.autoHeight === true) return false;
    if (frame.mergeEngine && !frame.mergeEngine.isEmpty) return false;
    if (frame.endIndex < frame.startIndex) return false;
    const cols = this._drawn.columns;
    const next = frame.columns ?? ColumnWindow.full(this._geometry.count);
    if (!cols || cols.count !== next.count) return false;
    return Math.min(this._end, frame.endIndex) >= Math.max(this._start, frame.startIndex);
  }

  /**
   * 세로 행 차분: 나간 행만 떼고(지도·등록·듣개도 풂), 들어온 행만 새 창으로 만들어 제자리에 끼우고, 남는 행은 요소 그대로 둔다.
   * 남는 행의 상태가 이 프레임과 다르면 그 행만 다시 만들고, 창이 바뀌었으면(대각선) 남는 행은 끝 칸만 옮긴다. 편집 중인 행은 범위 밖이어도 남긴다.
   *
   * Vertical row diff: remove leaving rows only (with their map entries, registrations and listeners), build entering rows
   * with the new window in place, keep staying elements. A staying row whose state differs is repainted alone; on a
   * window change (diagonal scroll) staying rows only shift their edge cells. The row being edited stays even out of range.
   */
  private _diffRows(frame: RenderFrame): void {
    const from = this._drawn.columns!;
    const { startIndex, endIndex, totalHeight, extraOpts = {} } = frame;
    let opts = frame.opts;
    if (Object.keys(extraOpts).length) opts = { ...opts, ...extraOpts };
    const geo = this._geometry;
    const columns = frame.columns ?? ColumnWindow.full(geo.count);
    const height = `${totalHeight}px`;
    if (this._body.style.height !== height) this._body.style.height = height;
    const totalColWidth = geo.totalWidth();
    const minW = `${totalColWidth}px`;
    if (this._body.style.minWidth !== minW) this._body.style.minWidth = minW;
    const detailColOn = !!frame.detailApi && geo.extra.widthOf('detail') > 0;
    const frag = document.createDocumentFragment();
    // 남는 행의 끝 칸 옮김은 행 앞 여분 칸 수를 안다(여분 구성이 같아야 차분이 되므로 앞 문맥의 값 그대로)
    // Shifting staying rows needs the leading extra-cell count (same extras config, so the previous context's value).
    const extraCount = this._ctx?.extraCount ?? 0;
    const ctx = this._context(frame, opts, columns, false, opts._frozenCount ?? 0, detailColOn, totalColWidth, frag);
    ctx.extraCount = extraCount;
    this._frame = frame;
    this._start = startIndex;
    this._end = endIndex;
    this._onGroupToggle = frame.onGroupToggle;
    this._onTreeToggle = frame.onTreeToggle;

    const set = this._rowSet;
    const keep = this._editRow !== null ? [this._editRow] : [];
    const { enter, leave } = set.diff({ start: viewIndex(startIndex), end: viewIndex(endIndex + 1) }, keep);
    for (const ri of leave) this._dropRow(ri, set.remove(ri)!);

    const painter = this._dataRows;
    const shift = !from.equals(columns);
    const rh = opts.rowHeight;
    set.forEach((ri, el) => {
      // 편집 중인 행은 차분 중 다시 만들지 않는다 — 살아 있는 편집기 DOM 보존.
      // Never recreate the row being edited during a diff, to keep the live editor DOM.
      if (ri !== this._editRow && this._rowKeys.get(ri) !== this._stateKey(ri, ctx)) {
        this._dropRow(ri, el, true);
        const fresh = painter.paint(ri, null, ctx);
        if (fresh) { el.replaceWith(fresh); this._rowKeys.set(ri, this._stateKey(ri, ctx, ctx.rowState)); set.add(ri, fresh); }
        else { el.remove(); set.remove(ri); }
        return;
      }
      if (shift) painter.shift(el, ri, null, from, ctx, this._onRemoveCell);
      const top = `${frame.offsetY + (ri - startIndex) * rh}px`;
      if (el.style.top !== top) el.style.top = top;
    });

    // 들어온 행은 행 번호 차례 자리에 — 남는 행보다 위면 그 앞, 아래면 뒤
    // Entering rows go in row-index order: before the first staying row with a larger index, else at the end.
    const staying: number[] = [];
    set.forEach((ri) => { staying.push(ri); });
    let k = 0;
    for (const ri of enter) {
      while (k < staying.length && staying[k]! < ri) k++;
      const anchor = k < staying.length ? set.get(staying[k]!)! : null;
      const el = painter.paint(ri, null, ctx);
      if (!el) continue;
      this._body.insertBefore(el, anchor);
      set.add(ri, el);
      this._rowKeys.set(ri, this._stateKey(ri, ctx, ctx.rowState));
    }
    if (frag.firstChild) this._body.appendChild(frag);
    this._drawn.columns = columns;
  }

  /**
   * 그려 둔 행 하나를 뗀다: 칸 지도에서 지우고, 행과 그 안 요소의 폭 등록·한 번짜리 듣개를 푼다. keepEl 이면 DOM 에서는 떼지 않는다.
   *
   * Removes one drawn row: drops it from the cell map and unregisters the row and its descendants. keepEl leaves it in the DOM.
   */
  private _dropRow(ri: number, el: HTMLElement, keepEl = false): void {
    this._cellMap.dropRow(ri);
    this._rowKeys.delete(ri);
    const applier = this._applier;
    const all = el.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const d = all[i] as HTMLElement;
      applier?.untrack(d);
      if (d.getAttribute('role') === 'gridcell') this._events.forget(d);
    }
    applier?.untrack(el);
    if (this._treeIcons.size > 0) this._forgetIcons(el);
    if (!keepEl) el.remove();
  }

  /**
   * 편집·포커스가 쓰는 고정 — 편집 중인 행은 세로 차분에서 범위 밖이어도 떼지 않는다. 편집이 끝났는데 그 행이 범위 밖이면 그 자리에서 뗀다.
   *
   * Pin used by editing: the edited row survives a row diff out of range; when editing ends and it is out of range it is removed at once.
   */
  pin(p: { editRow?: number | null; editCol?: number | null; focusRow?: number | null }): void {
    if (!('editRow' in p)) return;
    const prev = this._editRow;
    const next = p.editRow ?? null;
    this._editRow = next;
    if (prev === null || prev === next) return;
    if (prev >= this._start && prev <= this._end) return;
    const el = this._rowSet.remove(prev);
    if (el) this._dropRow(prev, el);
  }

  /**
   * 계획을 실행한다. 행 축이 통째(rebuild·clear)면 마지막 프레임을 새 창으로 다시 그리고, 행은 그대로에 창만 바뀌면(shift)
   * 그려 둔 행마다 칸만 고친다 — 들어온 컬럼 칸만 만들고 나간 컬럼 칸만 뗀다(행은 다시 만들지 않음). 디테일 패널은 컬럼이 없어
   * 그대로다. 창이 같으면 아무것도 안 한다. 컬럼 구성이 바뀐 창이면(낡은 창) 통째로 다시 그린다.
   *
   * Executes a plan: a full row rebuild repaints the last frame with the new window; a pure window shift fixes only
   * the cells of each drawn row (create entering cells, remove leaving ones — rows are not rebuilt).
   */
  update(next: { readonly columns: IColumnWindow }, rows: RowWork, cols: ColWork): void {
    const to = next.columns;
    if (rows === 'rebuild' || rows === 'clear' || rows === 'diff') {
      if (this._frame) this.rebuildWindow({ ...this._frame, columns: to });
      return;
    }
    if (cols !== 'shift') return;
    const from = this._drawn.columns;
    const ctx = this._ctx;
    if (from && from.equals(to)) return;
    if (!from || !ctx || from.count !== to.count) {
      if (this._frame) this.rebuildWindow({ ...this._frame, columns: to });
      return;
    }
    ctx.columns = to;
    ctx.layout = layoutOf(to);
    const flat = ctx.groupFlatRows;
    for (let el = this._body.firstElementChild as HTMLElement | null; el; el = el.nextElementSibling as HTMLElement | null) {
      const cl = el.classList;
      if (cl.contains('og-row')) {
        const ri = Number(el.getAttribute('aria-rowindex')) - 1;
        this._dataRows.shift(el, ri, flat ? flat[ri] : null, from, ctx, this._onRemoveCell);
      } else if (cl.contains('og-group-row') && flat) {
        this._groupRows.shift(el, flat[Number(el.getAttribute('aria-rowindex')) - 1], ctx);
      }
    }
    this._drawn.columns = to;
  }
}
