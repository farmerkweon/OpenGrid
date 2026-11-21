import type { AppearanceResolver } from '../../AppearanceResolver.js';
import type { ColumnDef, SortItem } from '../../types.js';
import type { RenderOptions, RendererCallbacks } from '../../GridRenderer.js';
import { _el, _style } from '../dom.js';
import type { ResizeHandleBinder } from './ResizeHandleBinder.js';
import type { ExtraColumnId, IColumnGeometry } from '../../coordinate/geometryPorts.js';
import type { LeafColIndex } from '../../coordinate/types.js';
import type { IGeometryApplier, IHeaderSortIndicator } from '../ports.js';

/**
 * 머리글 표(여분 th·잎/묶음 th·정렬과 필터 표시·aria·키보드 이동·끌어 옮기기·너비 손잡이)를 만드는 객체.
 * 머리글을 그리는 일을 렌더러 앞면에서 떼어 내 한 곳에 두려고 만들었다. 지금은 부를 때마다 머리글 표를 통째로 다시 만든다.
 * 너비 손잡이의 동작은 `ResizeHandleBinder` 에 맡긴다.
 *
 * Builds the header table (extra ths, leaf/group ths, sort and filter marks, aria, keyboard moves, drag reorder,
 * width handles). Split out of the renderer facade so header painting lives in one place. For now each call rebuilds
 * the whole header table. Width-handle behaviour is delegated to `ResizeHandleBinder`.
 */
export class HeaderView {
  constructor(
    private readonly _header: HTMLElement,
    private readonly _ap: AppearanceResolver,
    private readonly _cbs: RendererCallbacks,
    private readonly _resize: ResizeHandleBinder,
    private readonly _tr: (key: string, params?: Record<string, string | number>) => string,
  ) {
    // 경계 양쪽 손잡이 영역은 머리글 요소에 단 위임 듣개 하나가 맡는다(th 마다 붙이지 않음). 폭은 컬럼 기하에 묻는다.
    //
    // One delegated listener on the header element owns the grip zone on both sides of each boundary (not one per th);
    // widths are asked of the column geometry.
    this._resize.bindHeader(this._header, (leaf) => (this._geometry ? this._geometry.widthOf(leaf as LeafColIndex) : NaN));
  }

  private _geometry: IColumnGeometry | null = null;

  /**
   * 컬럼 기하를 받는다(그리드가 한 번 넘겨 준다). 머리글의 폭·고정 left·전체 폭은 이 기하에 묻는다 —
   * 같은 계산을 머리글이 따로 들고 있으면 본문·푸터와 어긋나기 때문이다. 받기 전에는 그리지 않는 것으로 본다.
   *
   * Receives the column geometry once from the grid. Header widths, frozen lefts and total width are asked of it so
   * the header can never drift from body and footer. The view is not painted before this is called.
   */
  setGeometry(geometry: IColumnGeometry): void {
    this._geometry = geometry;
  }

  /** 머리글 table 의 오른쪽 끝 여백(px) — 0 이면 아무것도 안 씀. */
  private _gutter = 0;
  private _table: HTMLElement | null = null;

  /**
   * 본문 세로 스크롤바 폭만큼의 끝 여백을 받는다 — 머리글의 가로 스크롤 끝이 본문 끝과 같아져 오른쪽 끝까지 긁어도 선이 맞는다.
   * 0 이면 여백을 두지 않는다(스크롤바가 없는·겹쳐 뜨는 환경의 DOM 은 그대로). 다시 그릴 때도 같은 값을 쓴다.
   *
   * Receives the end gutter (the body's vertical scrollbar width) so the header can scroll as far right as the body.
   * Zero writes nothing (DOM unchanged where scrollbars take no space); repaints reuse the value.
   */
  setEndGutter(px: number): void {
    if (px === this._gutter) return;
    this._gutter = px;
    if (this._table) this._table.style.marginRight = px > 0 ? `${px}px` : '0px';
  }

  private _applier: IGeometryApplier | null = null;
  private _sort: IHeaderSortIndicator | null = null;

  /**
   * 정렬 표시만 고치는 객체를 받는다(그리드가 한 번 넘겨 준다). 정렬이 바뀔 때 머리글을 통째로 다시 만들지 않고
   * 그 객체가 화살표·클래스·aria 만 고치게, 그릴 때마다 잎 칸을 묶어 준다. 받기 전에는 묶지 않고 그리기만 한다.
   *
   * Receives the sort-indicator object; each paint binds the leaf cells to it so a sort change patches only the arrow,
   * class and aria instead of rebuilding the header. Without it, painting simply skips binding.
   */
  setSortIndicator(sort: IHeaderSortIndicator): void {
    this._sort = sort;
  }
  /** 머리글 한 판의 리스너 묶음 — 다시 그리거나 지울 때 한 번에 뗀다(떼어 낸 th 에 콜백이 남지 않게). */
  private _listeners = new AbortController();

  /**
   * 머리글 리스너를 모두 떼고 손잡이 객체도 정리한다. 그리드를 지운 뒤 남은 th 에 사건이 와도 콜백이 불리지 않게.
   *
   * Detach every header listener and the handle binder, so events on leftover ths never reach callbacks after destroy.
   */
  destroy(): void {
    this._listeners.abort();
    this._resize.destroy();
  }

  /**
   * 기하 px 를 DOM 에 쓰는 객체를 받는다. 머리글은 폭을 품은 자리(잎 칸 폭·고정 칸 left·표 전체 폭)를 여기에 등록해,
   * 컬럼 폭이 바뀔 때 머리글을 다시 만들지 않고 그 자리만 고칠 수 있게 한다. 받기 전에는 등록 없이 그리기만 한다.
   *
   * Receives the geometry applier. The header registers its width-bearing spots so a width change can patch them
   * instead of rebuilding the header. Without it, painting simply skips registration.
   */
  setApplier(applier: IGeometryApplier): void {
    this._applier = applier;
  }

  private _t(key: string, params?: Record<string, string | number>): string {
    return this._tr(key, params);
  }

  /**
   * 지금 그려진 머리글 영역의 실제 높이(px). 줄바꿈 머리글로 늘어난 높이를 배치에 되돌릴 때 쓴다.
   *
   * The actual height (px) of the currently rendered header, used to feed height grown by header wrapping back into layout.
   */
  height(): number {
    return this._header.offsetHeight;
  }

  /**
   * 머리글 표를 통째로 다시 그린다(머리글 칸 표·잎·정렬 목록·옵션을 받아서). 폭은 받은 `widths` 가 아니라 기하에 묻는다 —
   * 인자는 부르는 쪽 서명을 지키려고 남겨 둔 것이고 기하와 같은 값이다.
   *
   * Rebuild the whole header table. Widths are asked of the geometry; the `widths` argument is kept for the caller's
   * signature and carries the same values.
   */
  paint(
    headerRows: any[][],
    leaves: ColumnDef[],
    widths: readonly number[],
    sortList: SortItem[],
    opts: RenderOptions
  ): void {
    this._header.innerHTML = '';
    // 옛 th 의 리스너를 한 번에 떼고 새 묶음을 연다. 손잡이 객체도 옛 손잡이를 잊는다(진행 중인 끌기 상태는 그대로).
    //
    // Drop the old ths' listeners at once and open a new group; the handle binder forgets old handles (an ongoing gesture stays).
    this._listeners.abort();
    this._listeners = new AbortController();
    const signal = this._listeners.signal;
    this._resize.clear(signal);
    // 옛 칸의 정렬 표시 묶음도 푼다. / Release the old cells' sort-indicator bindings too.
    this._sort?.release();
    // 머리글을 통째로 다시 만드니 옛 칸의 등록을 먼저 푼다(떼어 낸 요소를 붙잡지 않게).
    //
    // The header is rebuilt from scratch, so release the old cells' registrations first (never retain detached elements).
    const applier = this._applier;
    applier?.release('header');
    const ap = this._ap; // R12a: 스타일 결정 초크포인트(값은 오늘과 동일 = byte-identical)
    const frozenCount: number = opts._frozenCount ?? 0;
    // 폭·left·전체 폭은 컬럼 기하에 묻는다(여분 칸 — 디테일 펼침 칸 포함 — 의 켜짐·폭·순서도 기하의 여분 값이 안다).
    // 머리글 table 은 기하의 전체 폭으로 고정해 본문과 가로 정렬을 맞춘다.
    //
    // Widths, lefts and total width come from the column geometry (including which extra columns are on); the header
    // table is pinned to the geometry's total width so it lines up with the body.
    const geo = this._geometry!;
    const extra = geo.extra;
    const totalColWidth = geo.totalWidth();

    // 헤더 div 배경 — 테이블이 totalColWidth보다 짧아도 헤더 영역 전체에 배경 유지
    this._header.style.background = 'var(--og-header-bg,#f5f5f5)';

    const table = _el('table', 'og-header-table') as HTMLTableElement;
    table.setAttribute('role', 'presentation');
    // host isolation: margin/border-spacing 을 인라인으로도 0 고정 → 호스트 table{} 차단.
    // (og-header-table 클래스로 base.css 규칙도 적용되나, 인라인으로 이중 방어)
    table.style.cssText = `table-layout:fixed;border-collapse:collapse;border-spacing:0;margin:0;width:${totalColWidth}px;background:var(--og-header-bg,#f5f5f5);`;
    applier?.trackTotal(table, 'width', 'header');
    // 본문 세로 스크롤바만큼 끝 여백(있을 때만) — 머리글 가로 스크롤 끝 == 본문 끝. / End gutter only when non-zero.
    if (this._gutter > 0) table.style.marginRight = `${this._gutter}px`;
    this._table = table;

    // 엑스트라 컬럼 헤더
    const extraRows = headerRows.length;
    const addExtraCol = (tr: HTMLElement, id: ExtraColumnId, label: string, extraClass = '') => {
      const w = extra.widthOf(id);
      const th = _el('th', `og-header-cell og-extra-col ${extraClass}`);
      th.setAttribute('rowspan', String(extraRows));
      th.textContent = label;
      _style(th, {
        width: `${w}px`, minWidth: `${w}px`, textAlign: 'center',
        borderRight: ap.border(),
        borderBottom: ap.border(),
        // host isolation: extra 컬럼 th 도 호스트 th{} 침범 차단 (border/line-height)
        borderTop: '0', borderLeft: '0', lineHeight: 'normal', verticalAlign: 'middle',
        padding: '0', fontSize: '11px', color: '#999',
        userSelect: 'none', boxSizing: 'border-box',
        background: 'var(--og-header-bg,#f5f5f5)',
      });
      if (frozenCount > 0) {
        th.style.position = 'sticky';
        th.style.left = `${extra.leftOf(id)}px`;
        th.style.zIndex = '4';
      }
      tr.appendChild(th);
    };
    // 체크 칸 머리글만 모양이 다르다(전체 선택 상자).
    //
    // Only the check column header looks different (select-all box).
    const addCheckCol = (tr: HTMLElement) => {
      const w = extra.widthOf('check');
      const th = _el('th', 'og-header-cell og-extra-col');
      th.setAttribute('rowspan', String(extraRows));
      th.style.cssText = `width:${w}px;min-width:${w}px;text-align:center;border-right:${ap.border()};border-bottom:${ap.border()};border-top:0;border-left:0;line-height:normal;vertical-align:middle;background:var(--og-header-bg,#f5f5f5);box-sizing:border-box;`;
      if (frozenCount > 0) {
        th.style.position = 'sticky';
        th.style.left = `${extra.leftOf('check')}px`;
        th.style.zIndex = '4';
      }
      const allChk = document.createElement('input');
      allChk.type = 'checkbox';
      allChk.setAttribute('aria-label', this._t('row.selectAllAria'));
      allChk.style.cssText = 'width:16px;height:16px;';
      allChk.addEventListener('change', () => this._cbs.onAllCheck(allChk.checked), { signal });
      th.appendChild(allChk);
      tr.appendChild(th);
    };
    // 여분 칸 종류 → 머리글 칸 그리기. 켜진 것과 순서(state→drag→rowNumber→check→detail)는 extra.ids 가 안다.
    //
    // Extra column kind → header cell painter; which are on and their order come from extra.ids.
    const paintExtra: Readonly<Record<ExtraColumnId, (tr: HTMLElement) => void>> = {
      state: (tr) => addExtraCol(tr, 'state', ''),
      drag: (tr) => addExtraCol(tr, 'drag', ''),
      rowNumber: (tr) => addExtraCol(tr, 'rowNumber', 'No'),
      check: addCheckCol,
      detail: (tr) => addExtraCol(tr, 'detail', '', 'og-detail-toggle-col'),
    };

    for (let ri = 0; ri < headerRows.length; ri++) {
      const tr = _el('tr', 'og-header-row') as HTMLTableRowElement;
      // 테이블 행의 height 는 사실상 '최소 높이'로 동작한다(내용이 더 크면 행이 늘어남).
      // 따라서 줄바꿈 헤더는 height 를 넘어 자동 확장되고, 줄바꿈 없는 헤더는 기존과 동일하게 유지된다.
      tr.style.height = `${opts.headerHeight}px`;

      if (ri === 0) {
        for (const id of extra.ids) paintExtra[id](tr);
      }

      for (const cell of (headerRows[ri] ?? [])) {
        const th = _el('th', 'og-header-cell') as HTMLTableHeaderCellElement;
        const col: ColumnDef = cell.column;
        if (cell.colSpan > 1) th.colSpan = cell.colSpan;
        if (cell.rowSpan > 1) th.rowSpan = cell.rowSpan;

        // 너비: leaf 컬럼만
        const leafIdx = cell.colSpan === 1 ? leaves.findIndex(l => l.field === col.field) : -1;
        if (cell.colSpan === 1) {
          const w = leafIdx >= 0 ? geo.widthOf(leafIdx as LeafColIndex) : (col.width ?? opts.defaultColumnWidth);
          th.style.width = `${w}px`;
          th.style.minWidth = `${w}px`;
          if (leafIdx >= 0) applier?.trackHeaderCell(th, leafIdx, 'wm');
        }

        const sortInfo = sortList.find(s => s.field === col.field);
        const sortable = col.sortable !== false && opts.sortable && cell.colSpan === 1;

        // ARIA + 키보드 접근성
        th.setAttribute('role', 'columnheader');
        th.setAttribute('scope', 'col');
        if (sortable) {
          // 「정렬 가능」 표시 — CSS 가 인라인 cursor 대신 이 클래스로 가려낸다(정렬된 칸의 og-sorted 와 같은 가족).
          // / "Sortable" marker — CSS keys off this class rather than the inline cursor (same family as og-sorted).
          th.classList.add('og-sortable');
          th.setAttribute('aria-sort', sortInfo ? (sortInfo.dir === 'asc' ? 'ascending' : 'descending') : 'none');
          // 정렬 가능한 헤더는 키보드로 접근 가능 (roving tabindex: 첫 번째만 0)
          th.tabIndex = leafIdx === 0 ? 0 : -1;
          th.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this._cbs.onHeaderClick(col.field, e.shiftKey);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const next = th.nextElementSibling as HTMLElement;
              if (next?.tagName === 'TH') next.focus();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const prev = th.previousElementSibling as HTMLElement;
              if (prev?.tagName === 'TH') prev.focus();
            }
          }, { signal });
        }

        // 고정 컬럼 sticky
        // sticky left = 기하의 leftOf(여분 폭을 포함한 내용 좌표).
        //
        // Sticky left = geometry leftOf (content coordinate including extra columns).
        if (leafIdx >= 0 && leafIdx < frozenCount) {
          th.classList.add('og-frozen');
          if (leafIdx === frozenCount - 1) th.classList.add('og-frozen-last');
          th.style.left = `${geo.leftOf(leafIdx as LeafColIndex)}px`;
          applier?.trackLeft(th, leafIdx, 'header');
        }

        // 헤더 줄바꿈 여부: col.headerWrap 또는 header 문자열에 명시적 '\n' 이 있으면 줄바꿈한다.
        const headerText = col.header ?? col.field;
        const hasExplicitBreak = typeof headerText === 'string' && headerText.indexOf('\n') >= 0;
        const headerWrap = col.headerWrap === true || hasExplicitBreak;

        _style(th, {
          padding: '4px 8px', boxSizing: 'border-box',
          // host isolation: 헤더 <th> 의 모든 시각 속성을 인라인으로 고정한다.
          // 임베드 호스트(WordPress 등)가 `.entry-content th`/`.fn-post-content th`(특이도 0,2,1)로
          // 배경·글자·라인높이·보더·폰트크기를 덮어써도 인라인(최고 우선순위)이 이긴다.
          // (var 참조라 setTheme 시 자동 반영. text-align/padding 은 그리드 의도값 유지)
          background: 'var(--og-header-bg)', color: 'var(--og-header-color)',
          lineHeight: headerWrap ? '1.3' : 'normal', verticalAlign: 'middle',
          fontSize: 'var(--og-font-size)',
          textAlign: col.headerAlign ?? 'center',
          borderTop: '0', borderLeft: '0',
          borderRight: ap.border(),
          borderBottom: ap.border(),
          userSelect: 'none', cursor: sortable ? 'pointer' : 'default',
          // 줄바꿈 컬럼: nowrap+ellipsis 대신 여러 줄 허용(word-break). 미설정 컬럼은 기존 동작 유지.
          whiteSpace: headerWrap ? 'normal' : 'nowrap',
          overflow: headerWrap ? 'visible' : 'hidden',
          textOverflow: headerWrap ? 'clip' : 'ellipsis',
          wordBreak: headerWrap ? 'break-word' : 'normal',
          position: 'relative',
        });

        // 헤더 툴팁: col.tooltip(문자열) 우선, 없으면 헤더 텍스트 — 잘린 헤더 가독성 보조
        th.title = (typeof col.tooltip === 'string' ? col.tooltip : headerText) ?? '';

        const label = _el('span');
        if (headerWrap) {
          // 줄바꿈 허용: '\n' 을 <br> 로 분할 렌더. label 도 nowrap/ellipsis 해제.
          label.style.cssText = 'overflow:visible;text-overflow:clip;white-space:normal;word-break:break-word;';
          const parts = String(headerText).split('\n');
          parts.forEach((part, i) => {
            if (i > 0) label.appendChild(document.createElement('br'));
            label.appendChild(document.createTextNode(part));
          });
        } else {
          label.textContent = headerText;
          label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        }
        th.appendChild(label);

        // 정렬 아이콘
        if (sortInfo) {
          th.classList.add('og-sorted');
          const icon = _el('span', 'og-sort-icon');
          icon.textContent = sortInfo.dir === 'asc' ? ' ↑' : ' ↓';
          th.appendChild(icon);
        }

        // 필터 아이콘 (leaf 컬럼 + filterable)
        const filterable = col.filterable !== false && opts.filterable && cell.colSpan === 1;
        if (filterable) {
          const filterIcon = _el('span', 'og-filter-icon');
          const hasFilter = (opts._activeFilters?.[col.field]?.length ?? 0) > 0;
          filterIcon.textContent = hasFilter ? '⊿' : '▿';
          filterIcon.title = this._t('grid.filterTooltip');
          filterIcon.style.cssText = 'margin-left:3px;cursor:pointer;font-size:10px;opacity:0.6;';
          if (hasFilter) filterIcon.classList.add('og-filter-icon--active');
          filterIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this._cbs.onFilterIconClick(col.field, filterIcon);
          }, { signal });
          th.appendChild(filterIcon);
        }

        // 컬럼 리사이즈 핸들
        if (col.resizable !== false) {
          const resizer = _el('div', 'og-resize-handle');
          resizer.style.cssText = `position:absolute;right:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:1;`;
          th.appendChild(resizer);
          this._resize.attach(resizer, th, leafIdx, leafIdx >= 0 ? col.field : undefined);
        }
        if (leafIdx >= 0 && cell.colSpan === 1) this._resize.leaf(th, leafIdx);
        // 정렬 표시 객체는 지금 그려진 방향을 칸에서 읽으므로 화살표·클래스를 붙인 뒤에 묶는다.
        // The sort indicator reads the drawn direction from the cell, so bind after the arrow and class are in place.
        if (cell.colSpan === 1) this._sort?.bind(th, col.field, sortable);

        // 컬럼 드래그 리오더
        if (opts.columnReorder && leafIdx >= 0 && cell.colSpan === 1) {
          th.draggable = true;
          th.addEventListener('dragstart', (e) => {
            this._cbs.onColDragStart(leafIdx);
            th.classList.add('og-col-dragging');
            e.dataTransfer?.setData('text/plain', String(leafIdx));
          }, { signal });
          th.addEventListener('dragend', () => {
            th.classList.remove('og-col-dragging');
            this._header.querySelectorAll('.og-col-drop-over').forEach(el => el.classList.remove('og-col-drop-over'));
          }, { signal });
          th.addEventListener('dragover', (e) => {
            e.preventDefault();
            const fromIdx = this._cbs.getColDragIdx();
            if (fromIdx !== null && fromIdx !== leafIdx) {
              this._header.querySelectorAll('.og-col-drop-over').forEach(el => el.classList.remove('og-col-drop-over'));
              th.classList.add('og-col-drop-over');
            }
          }, { signal });
          th.addEventListener('dragleave', () => {
            th.classList.remove('og-col-drop-over');
          }, { signal });
          th.addEventListener('drop', (e) => {
            e.preventDefault();
            th.classList.remove('og-col-drop-over');
            this._cbs.onColDrop(leafIdx);
          }, { signal });
        }

        if (sortable) {
          th.addEventListener('click', (e) => {
            // 손잡이를 놓은 뒤 따라온 click 하나는 정렬이 아니다. / The click right after a handle release is not a sort.
            if (this._resize.shouldSwallowClick(e)) return;
            if ((e.target as HTMLElement).classList.contains('og-resize-handle')) return;
            this._cbs.onHeaderClick(col.field, e.shiftKey);
          }, { signal });
        }

        tr.appendChild(th);
      }
      table.appendChild(tr);
    }
    this._header.appendChild(table);
  }
}
