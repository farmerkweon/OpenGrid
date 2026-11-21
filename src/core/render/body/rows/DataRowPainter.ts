// ============================================================
// 자료 행(나무 노드 포함) 그리개 / Data-row painter (tree nodes included)
// 행 요소·여분 칸·자료 칸을 만든다. 여분 칸은 켜진 여분 컬럼 순서대로 여분 칸 그리개에 맡기고,
// 폭·left 는 컬럼 기하에 묻는다. 세로 병합 마스터 칸은 행 밖(본문 바로 아래)에 붙는다.
//
// Builds the row element, its extra cells (delegated to the extra-cell painters in column order) and data cells;
// widths and lefts come from the column geometry. Row-spanning master cells go to the body level, outside the row.
// ============================================================
import type { AppearanceResolver } from '../../../AppearanceResolver.js';
import type { TreeNodeIconDef, CellRange } from '../../../types.js';
import type { RendererCallbacks } from '../../../GridRenderer.js';
import { _el } from '../../dom.js';
import type { CellRegistry } from '../CellRegistry.js';
import { leafColIndex } from '../../../coordinate/types.js';
import type { ExtraColumnId } from '../../../coordinate/geometryPorts.js';
import type { ExtraCellPainter } from '../ExtraCellPainters.js';
import type { BodyRowContext, BodyRowPainter } from './BodyRowContext.js';
import type { IColumnWindow } from '../../../coordinate/geometryPorts.js';
import { paintGap, reuseGap } from './WindowLayout.js';

/** 교차 행 배경 두 값(짝·홀). / Alternating row backgrounds (even, odd). */
const ROW_BG = 'var(--og-row-bg,#fff)';
const ROW_ALT_BG = 'var(--og-row-alt-bg,#fafafa)';

// F3(§6/C11): 에러코드 → 카탈로그 키(hover 툴팁/aria-live 공용). i18n: FormulaController 와 동일한
// formulaError.* 키로 통합(중복 맵 해소) — 실제 문구는 활성 로케일에서 t() 로 해석한다.
const _FORMULA_ERROR_KEY: Record<string, string> = {
  '#ERR': 'formulaError.err',
  '#REF': 'formulaError.ref',
  '#CYCLE': 'formulaError.cycle',
  '#DIV0': 'formulaError.div0',
  '#NAME': 'formulaError.name',
  '#VALUE': 'formulaError.value',
  '#NUM': 'formulaError.num',
};

/**
 * 자료 행 하나를 그린다. 자료가 없으면(합성 배열 끝 너머 등) 그리지 않는다.
 *
 * Paints one data row; returns null when there is no row data.
 */
export class DataRowPainter implements BodyRowPainter {
  readonly kind = 'data' as const;

  constructor(
    private readonly _ap: AppearanceResolver,
    private readonly _cbs: RendererCallbacks,
    private readonly _cellMap: CellRegistry,
    private readonly _tr: (key: string, params?: Record<string, string | number>) => string,
    private readonly _extras: Readonly<Record<ExtraColumnId, ExtraCellPainter>>,
  ) {}

  private _t(key: string, params?: Record<string, string | number>): string {
    return this._tr(key, params);
  }

  /** 렌더러에 넘기는 낱말 해석(그리개당 하나 — 칸마다 함수를 만들지 않으려고). / Translator handed to renderers (one per painter). */
  private readonly _tFn = (key: string, params?: Record<string, string | number>): string => this._tr(key, params);

  paint(ri: number, flatItem: any, ctx: BodyRowContext): HTMLElement | null {
    const { opts, startIndex, offsetY, selectedRows, auto } = ctx;
    // 행 값(자료·나무 노드·행 상태·고정 칸 배경)은 창 옮김과 같은 한 곳에서 / Row values from the same place as a window shift
    if (!this._rowValues(ri, flatItem, ctx)) return null;
    const rowData = ctx.rowData;
    const rowState = ctx.rowState;

    const rowEl = _el('div', 'og-row');
    rowEl.setAttribute('role', 'row');
    rowEl.setAttribute('aria-rowindex', String(ri + 1));
    if (!auto) {
      const top = offsetY + (ri - startIndex) * opts.rowHeight;
      rowEl.style.top    = `${top}px`;
      rowEl.style.height = `${opts.rowHeight}px`;
    }

    // 교차 행 배경 — 가상스크롤에서 :nth-child는 DOM 위치 기반이라 ri 기준으로 인라인 설정
    rowEl.style.background = ri % 2 === 0 ? ROW_BG : ROW_ALT_BG;

    // 상태/선택 CSS 클래스 부착 — !important 로 인라인 background 오버라이드
    if (rowState === 'added')   rowEl.classList.add('og-state-added');
    if (rowState === 'edited')  rowEl.classList.add('og-state-edited');
    if (rowState === 'removed') rowEl.classList.add('og-state-removed');
    if (selectedRows.has(ri))   rowEl.classList.add('og-selected');
    rowEl.setAttribute('aria-selected', selectedRows.has(ri) ? 'true' : 'false');


    const colMap = new Map<number, HTMLElement>();

    // 여분 칸(상태 → 끌기 → 행번호 → 체크 → 디테일 펼침) — 행마다 바뀌는 값을 문맥에 담고 켜진 순서대로 맡긴다.
    // 끌기 옵션은 켜졌는데 끌기 관리자가 없으면(마운트 뒤 옵션만 켠 경우) 손잡이를 그리지 않으므로, 뒤따르는
    // 여분 칸의 고정 left 를 끌기 칸 폭만큼 당긴다 — 손잡이 없이 그리던 지금 자리를 그대로 지킨다.
    // Extra cells in column order; per-row values go into the context. With draggable on but no drag manager
    // (option turned on after mount) no handle is drawn and later extra cells shift left by the drag width, as today.
    const dnd = this._cbs.getDndManager();
    ctx.dnd = dnd;
    ctx.dragGap = opts.draggable && !dnd ? ctx.dragWidth : 0;
    const ids = ctx.extraIds;
    for (let k = 0; k < ids.length; k++) this._extras[ids[k]!].paint(rowEl, ri, rowData, ctx);

    // 데이터 컬럼
    ctx.extraCount = rowEl.childElementCount;
    this._paintColumns(rowEl, ri, ctx, colMap);

    this._cellMap.setRow(ri, colMap);
    return rowEl;
  }
  /**
   * 창 차례(칸 구간·빈칸)대로 자료 칸을 행에 붙인다. 창이 전 컬럼이면 컬럼 0 부터 끝까지 — 걸음 전과 같은 DOM.
   * 오른쪽 빈칸이 있을 때만 그 앞 칸에 `og-cell--last` 를 단다(창이 전 컬럼이면 달지 않음).
   *
   * Appends the data cells in window order (runs and gaps). A full window is columns 0..n-1 — the same DOM as before.
   * `og-cell--last` goes on the cell before the right gap only when there is one.
   */
  private _paintColumns(rowEl: HTMLElement, ri: number, ctx: BodyRowContext, colMap: Map<number, HTMLElement>): void {
    const pieces = ctx.layout.pieces;
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p]!;
      if (piece.gap) rowEl.appendChild(paintGap(piece.from, piece.to, ctx));
      else for (let ci = piece.from; ci <= piece.to; ci++) this._cell(rowEl, ri, ci, ctx, colMap);
    }
    const last = ctx.layout.lastBeforeGap;
    if (last >= 0) colMap.get(last)?.classList.add('og-cell--last');
  }

  /**
   * 창이 바뀔 때 행을 다시 만들지 않고 칸만 고친다: 나간 컬럼 칸을 떼고(지도에서도), 빈칸을 다시 놓고, 들어온 컬럼 칸만 새로 만들어
   * 제자리에 끼운다. 그대로인 칸은 손대지 않는다(편집기·포커스·사용자 렌더러가 단 리스너가 산다). 들어온 칸은 늘 새로 그린다.
   * `ctx.layout`·`ctx.columns` 는 이미 새 창이다. 행마다 새 배열·함수를 만들지 않는다.
   *
   * On a window change, fixes only the cells: removes cells of columns that left (and from the map), re-places the
   * gaps and creates only the entering cells in place. Kept cells are untouched; entering cells are always fresh.
   */
  shift(rowEl: HTMLElement, ri: number, flatItem: any, from: IColumnWindow, ctx: BodyRowContext, onRemove: (cell: HTMLElement) => void): void {
    if (!this._rowValues(ri, flatItem, ctx)) return;
    const map = this._cellMap;
    // ① 나간 컬럼 칸 떼기 / remove cells of columns that left
    const to = ctx.columns;
    const segs = from.segments;
    for (let k = 0; k < segs.length; k++) {
      for (let ci = segs[k]!.from; ci <= segs[k]!.to; ci++) {
        if (to.contains(leafColIndex(ci))) continue;
        const el = map.get(ri, ci);
        if (el) { onRemove(el); el.remove(); map.dropColumn(ri, ci); }
      }
    }
    // ② 옛 빈칸은 떼어 두었다가 다시 쓰고(행마다 새로 만들지 않음), 옛 마지막 칸 표시는 걷는다
    // Detach old gaps for reuse (no new gap per row) and drop the old last-cell marker.
    const applier = ctx.applier;
    const pool = this._gapPool;
    pool.length = 0;
    for (let el: Element | null = rowEl.children[ctx.extraCount] ?? null; el; ) {
      const next: Element | null = el.nextElementSibling;
      if (el.classList.contains('og-col-gap')) { pool.push(el as HTMLElement); el.remove(); }
      else el.classList.remove('og-cell--last');
      el = next;
    }
    let pi = 0;
    // ③ 새 차례대로: 있는 칸은 커서만 옮기고, 들어온 칸·빈칸은 커서 뒤에 끼운다 / walk the new order
    let cursor: Element | null = ctx.extraCount > 0 ? rowEl.children[ctx.extraCount - 1] ?? null : null;
    const pieces = ctx.layout.pieces;
    const buf = this._buf;
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p]!;
      if (piece.gap) {
        const gap = pi < pool.length ? reuseGap(pool[pi++]!, piece.from, piece.to, ctx) : paintGap(piece.from, piece.to, ctx);
        rowEl.insertBefore(gap, cursor ? cursor.nextSibling : rowEl.firstChild);
        cursor = gap;
        continue;
      }
      for (let ci = piece.from; ci <= piece.to; ci++) {
        const have = map.get(ri, ci);
        if (have) { cursor = have; continue; }
        this._cell(buf, ri, ci, ctx, null);
        const made = buf.firstChild as Element | null;
        rowEl.insertBefore(buf, cursor ? cursor.nextSibling : rowEl.firstChild);
        if (made) cursor = made;
      }
    }
    // 다시 쓰지 못한 옛 빈칸은 등록을 푼다 / unregister leftover old gaps
    for (; pi < pool.length; pi++) applier?.untrack(pool[pi]!);
    pool.length = 0;
    const last = ctx.layout.lastBeforeGap;
    if (last >= 0) map.get(ri, last)?.classList.add('og-cell--last');
  }

  /** 창 옮김에서 떼어 둔 빈칸(그리개당 하나를 돌려씀 — 행마다 배열을 만들지 않음). / Gap pool, one per painter. */
  private readonly _gapPool: HTMLElement[] = [];

  /** 창 옮김에서 칸을 잠깐 받는 그릇(그리개당 하나 — 칸마다 만들지 않음). / Scratch fragment, one per painter. */
  private readonly _buf = document.createDocumentFragment();

  /**
   * 행 하나의 값(자료·나무 노드·행 상태·고정 칸 배경)을 문맥에 담는다. 자료가 없으면 false.
   *
   * Puts one row's values (data, tree node, row state, sticky background) into the context; false without data.
   */
  private _rowValues(ri: number, flatItem: any, ctx: BodyRowContext): boolean {
    const { data, groupFlatRows, selectedRows } = ctx;
    const isTreeRow = flatItem && (flatItem as any)._isTree === true;
    const treeNode: any | null = isTreeRow ? (flatItem as any) : null;
    const rowData = treeNode ? treeNode.data : (groupFlatRows ? flatItem : data.getRowByIndex(ri));
    if (!rowData) return false;
    const rowState = isTreeRow ? 'none' : data.getRowState(ri);
    let bg = ri % 2 === 0 ? ROW_BG : ROW_ALT_BG;
    if (rowState === 'added')   bg = 'var(--og-row-added-bg,#e8f5e9)';
    if (rowState === 'edited')  bg = 'var(--og-row-edited-bg,#fff8e1)';
    if (rowState === 'removed') bg = 'var(--og-row-removed-bg,#ffebee)';
    if (selectedRows.has(ri))   bg = 'var(--og-row-selected-bg,#bbdefb)';
    ctx.rowData = rowData;
    ctx.treeNode = treeNode;
    ctx.rowState = rowState;
    ctx.bg = bg;
    return true;
  }

  /**
   * 컬럼 하나의 칸(또는 병합으로 가려진 자리채움)을 만들어 target 에 붙인다. 행 값은 문맥에서 읽는다.
   * 지도: colMap 을 주면 거기에(행을 다 그린 뒤 통째로 넣음), 없으면 칸 지도에 바로.
   *
   * Builds one column's cell (or merge placeholder) into target, reading row values from the context.
   */
  private _cell(target: ParentNode, ri: number, ci: number, ctx: BodyRowContext, colMap: Map<number, HTMLElement> | null): void {
    const { opts, leaves, startIndex, offsetY, selectedRows, mergeEngine, frozenCount, frag, applier } = ctx;
    const ap = this._ap;
    const geo = ctx.geometry;
    const nCols = geo.count;
    const rowData = ctx.rowData;
    const rowState = ctx.rowState as ReturnType<typeof ctx.data.getRowState>;
    const bg = ctx.bg;
    const treeNode = ctx.treeNode;
    const col = leaves[ci]!;
    const lci = leafColIndex(ci);
    const w = geo.widthOf(lci);
    const isEditable = opts.editable && col.editable !== false;
    const isFirstCol = ci === 0;

    // 셀 병합 처리
    const mergeInfo = mergeEngine && !mergeEngine.isEmpty
      ? mergeEngine.getInfo(ri, ci)
      : null;
    if (mergeInfo?.hidden) {
      // 병합 하위 셀: flex 공간만 차지하는 투명 placeholder (컬럼 정렬 보존)
      const ph = _el('div', 'og-cell og-cell--merge-ph');
      ph.style.cssText = `width:${w}px;min-width:${w}px;flex-shrink:0;visibility:hidden;box-sizing:border-box;`;
      applier?.trackSpan(ph, ci, 1, 'wm', 'body');
      target.appendChild(ph);
      return;
    }

    const cellEl = _el('div', 'og-cell');
    cellEl.setAttribute('role', 'gridcell');
    cellEl.setAttribute('aria-colindex', String(ci + 1));

    // rowSpan 적용: 여러 행 높이만큼 절대 위치로 늘림
    const rs = mergeInfo?.rowSpan ?? 1;
    const cs = mergeInfo?.colSpan ?? 1;
    const mergedHeight = rs > 1 ? rs * opts.rowHeight : opts.rowHeight;
    // colSpan 시 width 합산 — 기하가 아는 컬럼 몫은 기하에 묻고, 마지막 컬럼을 넘어선 몫은
    // 지금처럼 기본 폭으로 센다(병합 지정이 컬럼 수를 넘을 수 있다).
    // colSpan width: the geometry answers for existing columns; any span past the last column counts the
    // default width as today (a merge may be declared past the column count).
    let mergedWidth: number = w;
    // 가로 병합 칸은 기하의 [ci, ci+cs) 폭 합으로 다시 쓰이게 기억시킨다. 마지막 컬럼을 넘는 병합은 넘은 몫을 기본 폭으로
    // 세므로(지금 동작) 그 몫을 덧붙일 px 로 함께 기억시킨다 — 덮는 컬럼을 끌어도 그 칸이 옛 폭으로 남지 않게.
    // 그 칸의 조건부 서식 막대는 덧붙일 몫을 받을 자리가 없어 기억시키지 않는다(막대 폭은 다음 통째 그리기에서 맞음).
    // Horizontal merges are registered for the geometry span; a merge past the last column counts the excess at the
    // default width (today's behaviour), so that excess is registered as extra px. Its CF bar is not registered.
    let spanTracked = true;
    if (cs > 1) {
      mergedWidth = geo.spanWidth(lci, cs);
      const past = ci + cs - nCols;
      const extraPx = past > 0 ? past * opts.defaultColumnWidth : 0;
      if (past > 0) { mergedWidth += extraPx; spanTracked = false; }
      applier?.trackSpan(cellEl, ci, cs, 'wmm', 'body', extraPx);
    }

    const hPad = treeNode && isFirstCol ? 0 : 8;

    // 고정 컬럼 sticky — left 는 여분 폭을 포함한 기하 좌표
    const isFrozenCell = ci < frozenCount;
    if (isFrozenCell) {
      cellEl.classList.add('og-frozen-cell');
      if (ci === frozenCount - 1) cellEl.classList.add('og-frozen-last');
    }

    // frozen 셀: sticky 특성상 배경 필요 → bg 적용. 일반 셀: 행에서 상속
    const cellBg = isFrozenCell ? bg : 'inherit';
    cellEl.style.width    = `${mergedWidth}px`;
    cellEl.style.minWidth = `${mergedWidth}px`;
    cellEl.style.maxWidth = `${mergedWidth}px`;
    if (rs > 1) cellEl.style.height = `${mergedHeight}px`;
    if (isFrozenCell) cellEl.style.background = bg;
    if (treeNode && isFirstCol) cellEl.style.padding = '0';
    cellEl.style.overflow = 'hidden';
    if (rs > 1) {
      // rowSpan 마스터셀: body 기준 absolute 위치 (flex flow 밖)
      cellEl.style.height     = `${mergedHeight}px`;
      cellEl.style.position   = 'absolute';
      cellEl.style.zIndex     = '3';
      // 마스터셀에 명시적 배경색 필요(하단 행 덮기)
      cellEl.style.background = (bg && bg !== 'inherit') ? bg : 'var(--og-row-bg, #fff)';
      // host isolation: 미지정 변 폭 0 명시 (WP :where([style*=border-color]) 의 3px 강제 차단)
      cellEl.style.borderTop = '0';
      cellEl.style.borderLeft = '0';
      // R12a: 이 사이트만 폴백에 공백(`, #e0e0e0`)이 있는 레거시 표기 — byte-identical 보존을 위해
      //   ap.border()(무공백)로 통일하지 않고 원문 그대로 둔다(R12b 스킨 토큰화 시 흡수).
      cellEl.style.borderBottom = `1px solid var(--og-border-color, #e0e0e0)`;
    } else if (isFrozenCell) {
      cellEl.style.position = 'sticky';
      cellEl.style.left     = `${geo.leftOf(lci)}px`;
      cellEl.style.zIndex   = '1';
    }
    if (col.type === 'number' || col.align === 'right') cellEl.classList.add('og-cell--right');
    else if (col.align === 'center') cellEl.classList.add('og-cell--center');
    if (isEditable) cellEl.classList.add('og-cell--editable');
    // 줄바꿈(wrap): nowrap+ellipsis 대신 여러 줄 표시 (rowHeight를 키워 함께 사용)
    if (col.wrap) cellEl.classList.add('og-cell--wrap');

    // ── ARIA + 포커스 셀 ───────────────────────
    if (!isEditable) cellEl.setAttribute('aria-readonly', 'true');
    if (cs > 1) cellEl.setAttribute('aria-colspan', String(cs));
    if (rs > 1) cellEl.setAttribute('aria-rowspan', String(rs));
    // 포커스 셀 표시 (og-cell-focused 클래스 + tabIndex for programmatic focus)
    const isFocused = opts._focusCell?.ri === ri && opts._focusCell?.ci === ci;
    if (isFocused) {
      cellEl.classList.add('og-cell-focused');
      cellEl.tabIndex = -1;
    }
    // M-2/M-6(§4.2, F1): 범위 선택 면 하이라이트 — renderBody 클래스 재적용(가상스크롤/frozen/merged 자연 상속).
    // opts._rangeRects 가 없으면(비-'cells' 모드) 기존 렌더와 동일(회귀 0).
    const rangeRects: CellRange[] | undefined = opts._rangeRects;
    if (rangeRects?.some(r => ri >= r.startRow && ri <= r.endRow && ci >= r.startCol && ci <= r.endCol)) {
      cellEl.classList.add('og-range-selected');
      cellEl.style.background = 'var(--og-range-bg, rgba(25,118,210,0.12))';
    }
    // 셀 접근성 레이블: col.ariaLabel(문자열|함수)이 있으면 그것, 없으면 「헤더명: 값」
    // / Cell accessible label: col.ariaLabel (string|function) when given, else "header: value".
    const _rawVal = rowData ? rowData[col.field] : null;
    const _aria = col.ariaLabel;
    cellEl.setAttribute('aria-label', _aria == null
      ? `${col.header}: ${_rawVal == null ? '' : String(_rawVal)}`
      : typeof _aria === 'function' ? String(_aria(_rawVal, rowData as any) ?? '') : String(_aria));

    // 툴팁(native title): col.tooltip(문자열|함수) 우선, 없고 opts.tooltips 면 셀 값 자동 노출
    if (col.tooltip != null) {
      cellEl.title = typeof col.tooltip === 'function'
        ? String(col.tooltip(_rawVal, rowData as any) ?? '')
        : String(col.tooltip);
    } else if (opts.tooltips && _rawVal != null && _rawVal !== '') {
      cellEl.title = String(_rawVal);
    }

    // ── F3(§7.4/§7.5/§7.6, C7/C8.3/C10 R-FORMULA-MARKER) ──────────────
    // 수식 메타가 있으면: aria-label 재작성(수식+값) · 에러 한국어 툴팁 · 마커(기본 ON,
    // formula.cellMarker:false 로만 끔) · 근사(≈) 표식. 전부 호스트 CSS 격리(인라인 스타일).
    const _formulaMeta = this._cbs.getFormulaMeta?.(ri, col.field) ?? null;
    if (_formulaMeta) {
      const displayVal = _rawVal == null ? this._t('cell.emptyValue') : String(_rawVal);
      if (_formulaMeta.error) {
        const errKey = _FORMULA_ERROR_KEY[_formulaMeta.error];
        const errMsg = errKey ? this._t(errKey) : this._t('formulaError.fallback');
        cellEl.setAttribute('aria-label', this._t('formula.ariaError', { src: _formulaMeta.src, message: errMsg }));
        cellEl.title = `${_formulaMeta.error} — ${errMsg}`;
        cellEl.style.color = 'var(--og-formula-error-color, #c62828)';
      } else {
        const approxTxt = _formulaMeta.approx ? this._t('formula.approxSuffix') : '';
        cellEl.setAttribute('aria-label', this._t('formula.ariaValue', { src: _formulaMeta.src, value: displayVal, approx: approxTxt }));
        cellEl.title = `${_formulaMeta.src}${approxTxt}`;
      }
      if (opts.formula?.cellMarker !== false) {
        cellEl.classList.add('og-formula-cell');
        // 코너 삼각형 마커 — 클래스 의존 없이 인라인 배경 그라디언트로 직접 그린다(F3-R36).
        const markerColor = _formulaMeta.error
          ? 'var(--og-formula-error-color, #c62828)'
          : 'var(--og-formula-marker-color, #1976d2)';
        const prevBg = cellEl.style.background || cellEl.style.backgroundColor;
        cellEl.style.backgroundImage =
          `linear-gradient(135deg, ${markerColor} 0 6px, transparent 6px)`;
        cellEl.style.backgroundRepeat = 'no-repeat';
        cellEl.style.backgroundPosition = 'top right';
        cellEl.style.backgroundSize = '8px 8px';
        if (prevBg) cellEl.style.backgroundColor = prevBg;
      }
    }

    // ── R11(§4.2): 렌더훅 레지스트리 참여 — 등록된 셀 클래스/aria 훅이 있으면 셀에 적용 ──
    // (미등록/게이트닫힘이면 resolveRenderHook 이 null → 제로코스트. 표시텍스트 훅과 같은 어휘.)
    const _hookClass = this._cbs.resolveRenderHook?.('cellClass', ri, col.field);
    if (_hookClass) cellEl.className += ' ' + _hookClass;
    const _hookAria = this._cbs.resolveRenderHook?.('ariaLabel', ri, col.field);
    if (_hookAria != null) cellEl.setAttribute('aria-label', String(_hookAria));

    // ── 트리 첫 컬럼: 탐색기 스타일 렌더링 ──────────────
    let _treeRenderTarget: HTMLElement = cellEl;

    if (treeNode && isFirstCol) {
      const treeCell = _el('div', 'og-tree-cell');

      // ① 조상 가이드 라인 (│ or 空白) — 깊이만큼 반복
      const hasMoreChain: boolean[] = treeNode._ancestorHasMore ?? [];
      for (let d = 0; d < treeNode._depth; d++) {
        const guide = _el('span', 'og-tree-guide');
        if (hasMoreChain[d]) guide.classList.add('og-tree-guide--line');
        treeCell.appendChild(guide);
      }

      // ② 연결선 (depth > 0 만) : ├─  또는  └─
      if (treeNode._depth > 0) {
        const conn = _el('span', 'og-tree-connector');
        conn.classList.add(
          treeNode._isLastChild ? 'og-tree-connector--last' : 'og-tree-connector--mid'
        );
        treeCell.appendChild(conn);
      }

      // ③ 토글 래퍼 — branch: 정렬 스페이서(빈 칸), leaf: 원형 점
      const toggleWrap = _el('span', 'og-tree-toggle-wrap');
      if (!treeNode._hasChildren) {
        const dot = _el('span', 'og-tree-leaf-dot');
        toggleWrap.appendChild(dot);
      }
      treeCell.appendChild(toggleWrap);

      // ④ 노드 아이콘 — branch: 폴더(클릭 토글), leaf: 파일
      const nodeIcon = document.createElement('i');
      if (treeNode._hasChildren) {
        const iconCls = _resolveTreeIcon(col.treeNodeIcon, rowData, true, treeNode._expanded);
        nodeIcon.className = treeNode._expanded
          ? `${iconCls} og-tree-node-icon og-tree-node-icon--branch og-tree-node-icon--open og-tree-node-icon--toggle`
          : `${iconCls} og-tree-node-icon og-tree-node-icon--branch og-tree-node-icon--toggle`;
        nodeIcon.setAttribute('role', 'button');
        nodeIcon.setAttribute('tabindex', '0');
        nodeIcon.setAttribute('aria-expanded', treeNode._expanded ? 'true' : 'false');
        nodeIcon.setAttribute('aria-label', this._t(treeNode._expanded ? 'tree.collapse' : 'tree.expand'));
        // 누르기·Enter/Space 는 본문 위임이 받아 이 노드 번호로 펴고 접는다(아이콘마다 리스너를 붙이지 않는다).
        // Click and Enter/Space are received by the body delegation and toggle this node (no per-icon listeners).
        ctx.treeIcons.set(nodeIcon, treeNode._treeId);
      } else {
        const iconCls = _resolveTreeIcon(col.treeNodeIcon, rowData, false, false);
        nodeIcon.setAttribute('aria-hidden', 'true');
        nodeIcon.className = `${iconCls} og-tree-node-icon og-tree-node-icon--leaf`;
      }
      treeCell.appendChild(nodeIcon);

      cellEl.appendChild(treeCell);
      _treeRenderTarget = treeCell;
    }

    // 사용자 정의 cellStyle
    if (col.cellStyle) {
      const val = rowData[col.field];
      const s = typeof col.cellStyle === 'function' ? col.cellStyle(val, rowData as any, ri) : col.cellStyle;
      Object.assign(cellEl.style, s);
    }

    // 렌더러 사용 — 트리 첫 컬럼은 treeCell 안에 추가, 그 외는 cellEl에 추가
    const renderer = ctx.plans[ci]!.renderer();
    const rendered = renderer.render({
      value: rowData[col.field], row: rowData, rowIndex: ri,
      column: col as any, colIndex: ci,
      isSelected: selectedRows.has(ri), rowState,
      displayValue: (this._cbs.resolveRenderHook?.('displayText', ri, col.field)
        ?? this._cbs.getDisplayText?.(ri, col.field)) ?? null,
      displayFormatter: this._cbs.getDisplayFormatter?.() ?? null,
      // C7(15_cross_contracts.md/F3-R14): 셀 수식 있으면 렌더러가 ColumnDef.formula 재평가를 skip.
      hasCellFormula: _formulaMeta != null,
      // i18n: 셀 렌더러(마스킹/라디오/바코드) 가 인스턴스 로케일로 aria/tooltip 을 해석하도록 주입.
      t: this._tFn,
    });
    _treeRenderTarget.appendChild(rendered);

    // ── DD-05 S2c-1(CF): 조건부서식 적용 훅 — 셀 내용 렌더 후 데이터바/히트맵/아이콘셋/잉크 적용.
    // 미배선/미설정이면 콜백 미제공 또는 즉시 return → 셀 DOM 변화0(byte-identical·제로코스트).
    ctx.cellCi = ci;
    ctx.cellSpan = cs;
    this._cbs.applyCF?.(cellEl, ri, col.field, rowData ? rowData[col.field] : undefined, mergedWidth, mergedHeight, spanTracked ? ctx.trackBar : undefined);

    // 칸·행 마우스 이벤트는 본문 한 곳(BodyEventRouter)이 받는다 — 칸마다 리스너를 붙이지 않는다.
    // Cell and row mouse events are received in one place on the body (BodyEventRouter); no per-cell listeners.

    if (colMap) colMap.set(ci, cellEl); else this._cellMap.set(ri, ci, cellEl);

    if (rs > 1) {
      // ① 마스터 행의 flex에 투명 placeholder 삽입 → 컬럼 너비 보존
      const ph = document.createElement('div');
      ph.style.cssText = [
        `width:${w}px;min-width:${w}px;height:${opts.rowHeight}px;`,
        'flex-shrink:0;box-sizing:border-box;',
        `border-right:${ap.border()};`,
      ].join('');
      applier?.trackSpan(ph, ci, 1, 'wm', 'body');
      target.appendChild(ph);

      // ② 마스터셀은 body 기준 absolute — left 는 여분 폭을 포함한 기하 좌표
      const rowTop = offsetY + (ri - startIndex) * opts.rowHeight;
      cellEl.style.left = `${geo.leftOf(lci)}px`;
      cellEl.style.top  = `${rowTop}px`;
      applier?.trackLeft(cellEl, ci, 'body');
      ctx.masters.set(cellEl, ri);  // 행 밖이라 aria-rowindex 가 없다 — 위임이 행 번호를 여기서 읽는다
      frag.appendChild(cellEl);   // rowEl이 아닌 body 레벨에 직접 부착
    } else {
      target.appendChild(cellEl);
    }
  }
}

// ─── 트리 노드 아이콘 해석 ────────────────────────────────
function _resolveTreeIcon(
  def: TreeNodeIconDef | ((row: Record<string, any>, hasChildren: boolean, expanded: boolean) => string) | undefined,
  row: Record<string, any>,
  hasChildren: boolean,
  expanded: boolean
): string {
  let icon: string;
  if (!def) {
    icon = hasChildren ? (expanded ? 'bi-folder2-open' : 'bi-folder2') : 'bi-file-earmark';
  } else if (typeof def === 'function') {
    icon = def(row, hasChildren, expanded);
  } else {
    if (hasChildren) {
      icon = expanded ? (def.branchOpen ?? 'bi-folder2-open') : (def.branch ?? 'bi-folder2');
    } else {
      icon = def.leaf ?? 'bi-file-earmark';
    }
  }
  return icon.startsWith('bi ') ? icon : `bi ${icon}`;
}

