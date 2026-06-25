import { DataLayer } from './DataLayer.js';
import { RowDragDrop } from './RowDragDrop.js';
import { MergeEngine } from './MergeEngine.js';
import { createRenderer } from './renderers/CellRenderer.js';
import type { ColumnDef, SortItem, TreeNodeIconDef } from './types.js';

// ─── RendererCallbacks ────────────────────────────────────
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
}

// ─── GridRenderer ─────────────────────────────────────────
export class GridRenderer {
  private _root: HTMLElement;
  private _header: HTMLElement;
  private _bodyWrap: HTMLElement;
  private _body: HTMLElement;
  private _opts: any;
  private _cbs: RendererCallbacks;
  // rowIndex → {colIndex → cellEl} 맵
  private _cellMap: Map<number, Map<number, HTMLElement>> = new Map();

  get bodyWrapper() { return this._bodyWrap; }

  constructor(root: HTMLElement, opts: any, cbs: RendererCallbacks) {
    this._root = root;
    this._opts = opts;
    this._cbs = cbs;

    this._header = _el('div', 'og-header');
    // host isolation: border:0 로 4변 폭을 먼저 0 으로 못박는다. WordPress 전역 스타일
    //   `:where([style*="border-color"]){border-style:solid}` 이 인라인의 var(--og-border-color)
    //   문자열에 매칭되어, 폭 미지정 변에 medium(3px) 기본 보더를 강제하는 것을 차단(헤더 좌/우/상 굵은선 방지).
    this._header.style.cssText = `flex-shrink:0;overflow-x:auto;overflow-y:hidden;border:0;border-bottom:1px solid var(--og-border-color,#e0e0e0);scrollbar-width:none;`;

    this._bodyWrap = _el('div', 'og-body-wrapper');
    this._bodyWrap.style.cssText = `flex:1;overflow:auto;position:relative;`;
    this._bodyWrap.style.setProperty('--scrollbar-size', '8px');

    this._body = _el('div', 'og-body');
    this._body.style.cssText = `position:relative;`;
    this._bodyWrap.appendChild(this._body);

    root.appendChild(this._header);
    root.appendChild(this._bodyWrap);

    // 헤더 가로 스크롤 동기화
    this._bodyWrap.addEventListener('scroll', () => {
      this._header.scrollLeft = this._bodyWrap.scrollLeft;
    }, { passive: true });
  }

  updateSize(totalHeight: number, headerHeight: number): void {
    this._bodyWrap.style.height = `${totalHeight - headerHeight}px`;
  }

  /** 현재 렌더된 헤더 영역의 실제 높이(px). 헤더 줄바꿈으로 늘어난 높이를 레이아웃에 반영할 때 사용. */
  getHeaderHeight(): number {
    return this._header.offsetHeight;
  }

  renderHeader(
    headerRows: any[][],
    leaves: ColumnDef[],
    widths: number[],
    sortList: SortItem[],
    opts: any
  ): void {
    this._header.innerHTML = '';
    const frozenCount: number = opts._frozenCount ?? 0;

    // 헤더·바디 정렬을 위해 총 컬럼 너비를 계산 — 헤더 table은 이 너비로 고정
    let _extraW = 0;
    if (opts.stateColumn) _extraW += 24;
    if (opts.draggable)   _extraW += 18;
    if (opts.rowNumber)   _extraW += 44;
    if (opts.checkColumn) _extraW += 36;
    const totalColWidth = _extraW + leaves.reduce((s: number, _: any, i: number) => s + (widths[i] ?? opts.defaultColumnWidth), 0);

    // 헤더 div 배경 — 테이블이 totalColWidth보다 짧아도 헤더 영역 전체에 배경 유지
    this._header.style.background = 'var(--og-header-bg,#f5f5f5)';

    const table = _el('table', 'og-header-table') as HTMLTableElement;
    table.setAttribute('role', 'presentation');
    // host isolation: margin/border-spacing 을 인라인으로도 0 고정 → 호스트 table{} 차단.
    // (og-header-table 클래스로 base.css 규칙도 적용되나, 인라인으로 이중 방어)
    table.style.cssText = `table-layout:fixed;border-collapse:collapse;border-spacing:0;margin:0;width:${totalColWidth}px;background:var(--og-header-bg,#f5f5f5);`;

    // 엑스트라 컬럼 헤더
    const extraRows = headerRows.length;
    let extraHeaderLeft = 0;
    const addExtraCol = (tr: HTMLElement, w: number, label: string, extraClass = '') => {
      const th = _el('th', `og-header-cell og-extra-col ${extraClass}`);
      th.setAttribute('rowspan', String(extraRows));
      th.textContent = label;
      _style(th, {
        width: `${w}px`, minWidth: `${w}px`, textAlign: 'center',
        borderRight: '1px solid var(--og-border-color,#e0e0e0)',
        borderBottom: '1px solid var(--og-border-color,#e0e0e0)',
        // host isolation: extra 컬럼 th 도 호스트 th{} 침범 차단 (border/line-height)
        borderTop: '0', borderLeft: '0', lineHeight: 'normal', verticalAlign: 'middle',
        padding: '0', fontSize: '11px', color: '#999',
        userSelect: 'none', boxSizing: 'border-box',
        background: 'var(--og-header-bg,#f5f5f5)',
      });
      if (frozenCount > 0) {
        th.style.position = 'sticky';
        th.style.left = `${extraHeaderLeft}px`;
        th.style.zIndex = '4';
      }
      extraHeaderLeft += w;
      tr.appendChild(th);
    };

    for (let ri = 0; ri < headerRows.length; ri++) {
      const tr = _el('tr', 'og-header-row') as HTMLTableRowElement;
      // 테이블 행의 height 는 사실상 '최소 높이'로 동작한다(내용이 더 크면 행이 늘어남).
      // 따라서 줄바꿈 헤더는 height 를 넘어 자동 확장되고, 줄바꿈 없는 헤더는 기존과 동일하게 유지된다.
      tr.style.height = `${opts.headerHeight}px`;

      if (ri === 0) {
        // 컬럼 순서: stateColumn → draggable → rowNumber → checkColumn
        if (opts.stateColumn) addExtraCol(tr, 24, '');
        if (opts.draggable)   addExtraCol(tr, 18, '');
        if (opts.rowNumber)   addExtraCol(tr, 44, 'No');
        if (opts.checkColumn) {
          const th = _el('th', 'og-header-cell og-extra-col');
          th.setAttribute('rowspan', String(extraRows));
          th.style.cssText = `width:36px;min-width:36px;text-align:center;border-right:1px solid var(--og-border-color,#e0e0e0);border-bottom:1px solid var(--og-border-color,#e0e0e0);border-top:0;border-left:0;line-height:normal;vertical-align:middle;background:var(--og-header-bg,#f5f5f5);box-sizing:border-box;`;
          if (frozenCount > 0) {
            th.style.position = 'sticky';
            th.style.left = `${extraHeaderLeft}px`;
            th.style.zIndex = '4';
          }
          extraHeaderLeft += 36;
          const allChk = document.createElement('input');
          allChk.type = 'checkbox';
          allChk.setAttribute('aria-label', '전체 행 선택');
          allChk.style.cssText = 'width:16px;height:16px;';
          allChk.addEventListener('change', () => this._cbs.onAllCheck(allChk.checked));
          th.appendChild(allChk);
          tr.appendChild(th);
        }
      }

      for (const cell of (headerRows[ri] ?? [])) {
        const th = _el('th', 'og-header-cell') as HTMLTableHeaderCellElement;
        const col: ColumnDef = cell.column;
        if (cell.colSpan > 1) th.colSpan = cell.colSpan;
        if (cell.rowSpan > 1) th.rowSpan = cell.rowSpan;

        // 너비: leaf 컬럼만
        const leafIdx = cell.colSpan === 1 ? leaves.findIndex(l => l.field === col.field) : -1;
        if (cell.colSpan === 1) {
          const w = leafIdx >= 0 ? (widths[leafIdx] ?? opts.defaultColumnWidth) : (col.width ?? opts.defaultColumnWidth);
          th.style.width = `${w}px`;
          th.style.minWidth = `${w}px`;
        }

        const sortInfo = sortList.find(s => s.field === col.field);
        const sortable = col.sortable !== false && opts.sortable && cell.colSpan === 1;

        // ARIA + 키보드 접근성
        th.setAttribute('role', 'columnheader');
        th.setAttribute('scope', 'col');
        if (sortable) {
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
          });
        }

        // 고정 컬럼 sticky
        if (leafIdx >= 0 && leafIdx < frozenCount) {
          let leftOff = 0;
          // extra 컬럼 순서와 동일하게: stateColumn → draggable → rowNumber → checkColumn
          if (opts.stateColumn) leftOff += 24;
          if (opts.draggable)   leftOff += 18;
          if (opts.rowNumber)   leftOff += 44;
          if (opts.checkColumn) leftOff += 36;
          for (let i = 0; i < leafIdx; i++) leftOff += widths[i] ?? opts.defaultColumnWidth;
          th.classList.add('og-frozen');
          if (leafIdx === frozenCount - 1) th.classList.add('og-frozen-last');
          th.style.left = `${leftOff}px`;
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
          borderRight: '1px solid var(--og-border-color,#e0e0e0)',
          borderBottom: '1px solid var(--og-border-color,#e0e0e0)',
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
          const hasFilter = opts._activeFilters?.[col.field]?.length > 0;
          filterIcon.textContent = hasFilter ? '⊿' : '▿';
          filterIcon.title = '필터';
          filterIcon.style.cssText = 'margin-left:3px;cursor:pointer;font-size:10px;opacity:0.6;';
          if (hasFilter) filterIcon.classList.add('og-filter-icon--active');
          filterIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this._cbs.onFilterIconClick(col.field, filterIcon);
          });
          th.appendChild(filterIcon);
        }

        // 컬럼 리사이즈 핸들
        if (col.resizable !== false) {
          const resizer = _el('div', 'og-resize-handle');
          resizer.style.cssText = `position:absolute;right:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:1;`;
          th.appendChild(resizer);
          const capturedLeafIdx = leafIdx;
          _addResizer(resizer, th, (w) => {
            if (capturedLeafIdx >= 0) this._cbs.onColResize(capturedLeafIdx, w);
          });
        }

        // 컬럼 드래그 리오더
        if (opts.columnReorder && leafIdx >= 0 && cell.colSpan === 1) {
          th.draggable = true;
          th.addEventListener('dragstart', (e) => {
            this._cbs.onColDragStart(leafIdx);
            th.classList.add('og-col-dragging');
            e.dataTransfer?.setData('text/plain', String(leafIdx));
          });
          th.addEventListener('dragend', () => {
            th.classList.remove('og-col-dragging');
            this._header.querySelectorAll('.og-col-drop-over').forEach(el => el.classList.remove('og-col-drop-over'));
          });
          th.addEventListener('dragover', (e) => {
            e.preventDefault();
            const fromIdx = this._cbs.getColDragIdx();
            if (fromIdx !== null && fromIdx !== leafIdx) {
              this._header.querySelectorAll('.og-col-drop-over').forEach(el => el.classList.remove('og-col-drop-over'));
              th.classList.add('og-col-drop-over');
            }
          });
          th.addEventListener('dragleave', () => {
            th.classList.remove('og-col-drop-over');
          });
          th.addEventListener('drop', (e) => {
            e.preventDefault();
            th.classList.remove('og-col-drop-over');
            this._cbs.onColDrop(leafIdx);
          });
        }

        if (sortable) {
          th.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('og-resize-handle')) return;
            this._cbs.onHeaderClick(col.field, e.shiftKey);
          });
        }

        tr.appendChild(th);
      }
      table.appendChild(tr);
    }
    this._header.appendChild(table);
  }

  renderBody(
    startIndex: number, endIndex: number,
    data: DataLayer<any>,
    leaves: ColumnDef[],
    widths: number[],
    opts: any,
    offsetY: number,
    totalHeight: number,
    selectedRows: Set<number>,
    checkedRows: Set<number>,
    groupFlatRows: Array<any> | null = null,
    onGroupToggle?: (key: string) => void,
    onTreeToggle?: (nodeId: any) => void,
    extraOpts: Record<string, any> = {},
    mergeEngine?: MergeEngine
  ): void {
    // opts에 extraOpts 병합 (DnD _totalRows 등)
    if (Object.keys(extraOpts).length) opts = { ...opts, ...extraOpts };
    this._body.innerHTML = '';
    this._cellMap.clear();
    // autoHeight(비가상): 행을 플로우로 쌓아 높이 자동. 그 외: 고정 rowHeight 절대배치.
    const auto: boolean = opts.autoHeight === true;
    this._body.classList.toggle('og-autoheight', auto);
    this._body.style.height = auto ? '' : `${totalHeight}px`;
    const frozenCount: number = opts._frozenCount ?? 0;

    // 바디 최소 너비를 totalColWidth로 설정 — 헤더 table과 너비 동기화 (수평 스크롤 영역 확보)
    {
      let _ew = 0;
      if (opts.stateColumn) _ew += 24;
      if (opts.draggable)   _ew += 18;
      if (opts.rowNumber)   _ew += 44;
      if (opts.checkColumn) _ew += 36;
      const _totalCW = _ew + leaves.reduce((s: number, _: any, i: number) => s + (widths[i] ?? opts.defaultColumnWidth), 0);
      this._body.style.minWidth = `${_totalCW}px`;
    }

    if (endIndex < startIndex) return;

    const frag = document.createDocumentFragment();
    for (let ri = startIndex; ri <= endIndex; ri++) {
      // 그룹/트리 모드: flatRow 배열 사용
      const flatItem = groupFlatRows ? groupFlatRows[ri] : null;
      const isGroupRow = flatItem && (flatItem as any)._isGroup === true;
      const isTreeRow = flatItem && (flatItem as any)._isTree === true;

      if (isGroupRow) {
        const g = flatItem as any;
        const groupKey = `__${g._groupField}:${g._groupValue}`;
        const rowEl = _el('div', 'og-group-row');
        const top = offsetY + (ri - startIndex) * opts.rowHeight;
        rowEl.style.cssText = [
          auto ? '' : `top:${top}px;height:${opts.rowHeight}px;`,
          'display:flex;align-items:stretch;cursor:pointer;',
          `padding-left:${4 + g._depth * 12}px;`,
          'background:var(--og-header-bg,#f5f5f5);',
          // host isolation: border:0 선행 (WP :where([style*=border-color]) 의 3px 강제 차단)
          'border:0;border-bottom:1px solid var(--og-border-color,#e0e0e0);',
        ].join('');
        rowEl.setAttribute('role', 'row');
        rowEl.setAttribute('aria-expanded', g._expanded ? 'true' : 'false');
        rowEl.setAttribute('aria-rowindex', String(ri + 1));
        rowEl.setAttribute('aria-level', String(g._depth + 1));

        // ── extra 컬럼 영역 (stateColumn/draggable/rowNumber/checkColumn) ──────
        let extraW = 0;
        if (opts.stateColumn) extraW += 24;
        if (opts.draggable)   extraW += 18;
        if (opts.rowNumber)   extraW += 44;
        if (opts.checkColumn) extraW += 36;

        // stateColumn 자리: 편집 상태 배지 표시
        if (extraW > 0) {
          const stCell = _el('div', 'og-group-state-cell');
          stCell.style.cssText = [
            `width:${extraW}px;min-width:${extraW}px;flex-shrink:0;`,
            'display:flex;align-items:center;justify-content:center;',
            'font-size:10px;font-weight:700;gap:2px;',
            'border-right:1px solid var(--og-border-color,#e0e0e0);',
          ].join('');
          const st = g._states ?? { added: 0, edited: 0, removed: 0 };
          if (st.added > 0)   { const b = _el('span'); b.textContent=`+${st.added}`; b.style.cssText='color:var(--og-row-added-bg,#2e7d32);background:#e8f5e9;padding:1px 3px;border-radius:3px;'; stCell.appendChild(b); }
          if (st.edited > 0)  { const b = _el('span'); b.textContent=`M${st.edited}`; b.style.cssText='color:#e65100;background:#fff8e1;padding:1px 3px;border-radius:3px;'; stCell.appendChild(b); }
          if (st.removed > 0) { const b = _el('span'); b.textContent=`D${st.removed}`; b.style.cssText='color:var(--og-row-removed-bg,#c62828);background:#ffebee;padding:1px 3px;border-radius:3px;'; stCell.appendChild(b); }
          rowEl.appendChild(stCell);
        }

        // ── 컬럼별 셀 ─────────────────────────────────────────────────────────
        let labelPlaced = false;
        for (let ci = 0; ci < leaves.length; ci++) {
          const col = leaves[ci]!;
          const w   = widths[ci] ?? opts.defaultColumnWidth;
          const hasSummary = g._summaryFmt !== undefined && col.field in (g._summaryFmt ?? {});

          const cell = _el('div', 'og-group-cell');
          cell.style.cssText = [
            `width:${w}px;min-width:${w}px;flex-shrink:0;`,
            'padding:2px 8px;box-sizing:border-box;overflow:hidden;',
            'border-right:1px solid var(--og-border-color,#e0e0e0);',
            'display:flex;align-items:center;',
            'white-space:nowrap;text-overflow:ellipsis;',
          ].join('');

          if (hasSummary) {
            // 소계 값 — 숫자 컬럼은 우측 정렬
            const fmt = g._summaryFmt[col.field];
            cell.textContent = fmt !== '' ? fmt : '-';
            cell.style.justifyContent = 'flex-end';
            cell.style.color = 'var(--og-primary,#1976d2)';
            cell.style.fontWeight = '600';
          } else if (!labelPlaced) {
            // 맨 첫 번째 비-소계 컬럼에 그룹 레이블 배치
            labelPlaced = true;
            const arrow = _el('span', 'og-group-arrow');
            arrow.textContent = g._expanded ? '▾ ' : '▸ ';
            arrow.style.cssText = 'color:var(--og-primary,#1976d2);margin-right:4px;flex-shrink:0;';
            cell.appendChild(arrow);

            const lbl = _el('span', 'og-group-label');
            lbl.textContent = `${g._groupLabel}  (${g._childCount}건)`;
            lbl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;font-weight:600;';
            cell.appendChild(lbl);
            cell.style.gap = '0';
          }
          // 소계도 없고 첫 번째도 아닌 열: 빈 셀 (간격 유지)

          rowEl.appendChild(cell);
        }

        rowEl.addEventListener('click', () => onGroupToggle?.(groupKey));
        frag.appendChild(rowEl);
        continue;
      }

      // 일반 데이터 행 (트리 노드 포함)
      const treeNode: any | null = isTreeRow ? (flatItem as any) : null;
      const rowData = treeNode ? treeNode.data : (groupFlatRows ? flatItem : data.getRowByIndex(ri));
      if (!rowData) continue;
      const rowState = (isTreeRow || isGroupRow) ? 'none' : data.getRowState(ri);

      const rowEl = _el('div', 'og-row');
      rowEl.setAttribute('role', 'row');
      rowEl.setAttribute('aria-rowindex', String(ri + 1));
      if (!auto) {
        const top = offsetY + (ri - startIndex) * opts.rowHeight;
        rowEl.style.top    = `${top}px`;
        rowEl.style.height = `${opts.rowHeight}px`;
      }

      // 교차 행 배경 — 가상스크롤에서 :nth-child는 DOM 위치 기반이라 ri 기준으로 인라인 설정
      let bg = ri % 2 === 0 ? 'var(--og-row-bg,#fff)' : 'var(--og-row-alt-bg,#fafafa)';
      rowEl.style.background = bg;

      // 상태/선택 CSS 클래스 부착 — !important 로 인라인 background 오버라이드
      if (rowState === 'added')   rowEl.classList.add('og-state-added');
      if (rowState === 'edited')  rowEl.classList.add('og-state-edited');
      if (rowState === 'removed') rowEl.classList.add('og-state-removed');
      if (selectedRows.has(ri))   rowEl.classList.add('og-selected');
      rowEl.setAttribute('aria-selected', selectedRows.has(ri) ? 'true' : 'false');

      // frozen 셀 배경용 bg — 상태행은 상태 색으로 덮어쓰기
      if (rowState === 'added')   bg = 'var(--og-row-added-bg,#e8f5e9)';
      if (rowState === 'edited')  bg = 'var(--og-row-edited-bg,#fff8e1)';
      if (rowState === 'removed') bg = 'var(--og-row-removed-bg,#ffebee)';
      if (selectedRows.has(ri))   bg = 'var(--og-row-selected-bg,#bbdefb)';

      // 행 레벨 클릭 (rowNumber·stateColumn 등 extra 컬럼 포함) → 선택 처리
      const localRowRi = ri;
      rowEl.addEventListener('click', (e) => { this._cbs.onCellClick(localRowRi, -1, e); });

      const colMap = new Map<number, HTMLElement>();

      // extra 컬럼 순서: stateColumn → draggable → rowNumber → checkColumn
      let extraBodyLeft = 0;

      // 상태 컬럼 (맨 앞)
      if (opts.stateColumn) {
        const stCell = _el('div', 'og-cell og-col-state');
        const icons: Record<string, string> = { added: '✚', edited: '✎', removed: '✖', none: '' };
        const colors: Record<string, string> = { added: '#2e7d32', edited: '#bf360c', removed: '#c62828', none: '' };
        stCell.textContent = icons[rowState] ?? '';
        stCell.style.color = colors[rowState] ?? '';
        stCell.title = rowState;
        if (frozenCount > 0) {
          stCell.style.position = 'sticky';
          stCell.style.left = `${extraBodyLeft}px`;
          stCell.style.zIndex = '2';
          stCell.style.background = bg;
        }
        extraBodyLeft += 24;
        rowEl.appendChild(stCell);
      }

      // 드래그 핸들
      const dnd = this._cbs.getDndManager();
      if (opts.draggable && dnd) {
        const handle = dnd.attachHandle(rowEl, ri, opts._totalRows ?? endIndex + 1);
        if (frozenCount > 0) {
          handle.style.position = 'sticky';
          handle.style.left = `${extraBodyLeft}px`;
          handle.style.zIndex = '2';
          handle.style.background = bg;
        }
        extraBodyLeft += 18;
        rowEl.appendChild(handle);
      }

      // 행 번호 컬럼
      if (opts.rowNumber) {
        const numCell = _el('div', 'og-cell og-col-rownum');
        numCell.textContent = String(ri + 1);
        if (frozenCount > 0) {
          numCell.style.position = 'sticky';
          numCell.style.left = `${extraBodyLeft}px`;
          numCell.style.zIndex = '2';
          numCell.style.background = bg;
        }
        extraBodyLeft += 44;
        rowEl.appendChild(numCell);
      }

      // 체크박스 컬럼
      if (opts.checkColumn) {
        const chkCell = _el('div', 'og-cell og-col-check');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = checkedRows.has(ri);
        chk.setAttribute('aria-label', `${ri + 1}행 선택`);
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          this._cbs.onRowCheck(ri, chk.checked);
        });
        chkCell.appendChild(chk);
        if (frozenCount > 0) {
          chkCell.style.position = 'sticky';
          chkCell.style.left = `${extraBodyLeft}px`;
          chkCell.style.zIndex = '2';
          chkCell.style.background = bg;
        }
        extraBodyLeft += 36;
        rowEl.appendChild(chkCell);
      }

      // 데이터 컬럼
      for (let ci = 0; ci < leaves.length; ci++) {
        const col = leaves[ci]!;
        const w = widths[ci] ?? opts.defaultColumnWidth;
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
          rowEl.appendChild(ph);
          continue;
        }

        const cellEl = _el('div', 'og-cell');
        cellEl.setAttribute('role', 'gridcell');
        cellEl.setAttribute('aria-colindex', String(ci + 1));

        // rowSpan 적용: 여러 행 높이만큼 절대 위치로 늘림
        const rs = mergeInfo?.rowSpan ?? 1;
        const cs = mergeInfo?.colSpan ?? 1;
        const mergedHeight = rs > 1 ? rs * opts.rowHeight : opts.rowHeight;
        // colSpan 시 width 합산
        let mergedWidth = w;
        if (cs > 1) {
          for (let dc = 1; dc < cs; dc++) {
            mergedWidth += widths[ci + dc] ?? opts.defaultColumnWidth;
          }
        }

        const hPad = treeNode && isFirstCol ? 0 : 8;

        // 고정 컬럼 sticky
        const isFrozenCell = ci < frozenCount;
        let frozenLeftOff = 0;
        if (isFrozenCell) {
          // extra 컬럼 순서: stateColumn → draggable → rowNumber → checkColumn
          if (opts.stateColumn) frozenLeftOff += 24;
          if (opts.draggable)   frozenLeftOff += 18;
          if (opts.rowNumber)   frozenLeftOff += 44;
          if (opts.checkColumn) frozenLeftOff += 36;
          for (let i = 0; i < ci; i++) frozenLeftOff += widths[i] ?? opts.defaultColumnWidth;
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
          cellEl.style.borderBottom = `1px solid var(--og-border-color, #e0e0e0)`;
        } else if (isFrozenCell) {
          cellEl.style.position = 'sticky';
          cellEl.style.left     = `${frozenLeftOff}px`;
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
        // 셀 접근성 레이블 (헤더명: 값)
        const _rawVal = rowData ? rowData[col.field] : null;
        cellEl.setAttribute('aria-label', `${col.header}: ${_rawVal == null ? '' : String(_rawVal)}`);

        // 툴팁(native title): col.tooltip(문자열|함수) 우선, 없고 opts.tooltips 면 셀 값 자동 노출
        if (col.tooltip != null) {
          cellEl.title = typeof col.tooltip === 'function'
            ? String(col.tooltip(_rawVal, rowData as any) ?? '')
            : String(col.tooltip);
        } else if (opts.tooltips && _rawVal != null && _rawVal !== '') {
          cellEl.title = String(_rawVal);
        }

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
            nodeIcon.setAttribute('aria-label', treeNode._expanded ? '접기' : '펼치기');
            nodeIcon.addEventListener('click', (e: MouseEvent) => {
              e.stopPropagation();
              onTreeToggle?.(treeNode._treeId);
            });
            nodeIcon.addEventListener('keydown', (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onTreeToggle?.(treeNode._treeId);
              }
            });
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
        const renderer = createRenderer(col);
        const rendered = renderer.render({
          value: rowData[col.field], row: rowData, rowIndex: ri,
          column: col as any, colIndex: ci,
          isSelected: selectedRows.has(ri), rowState
        });
        _treeRenderTarget.appendChild(rendered);

        // 이벤트
        const localRi = ri, localCi = ci;
        cellEl.addEventListener('click',     (e) => { e.stopPropagation(); this._cbs.onCellClick(localRi, localCi, e); });
        cellEl.addEventListener('dblclick',  (e) => { e.stopPropagation(); this._cbs.onCellDblClick(localRi, localCi, e); });
        cellEl.addEventListener('mouseover', (e) => { e.stopPropagation(); this._cbs.onCellMouseOver(localRi, localCi, e); });
        cellEl.addEventListener('mouseout',  (e) => { e.stopPropagation(); this._cbs.onCellMouseOut(localRi, localCi, e); });
        cellEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this._cbs.onCellMouseDown(localRi, localCi, e); });
        cellEl.addEventListener('mouseup',   (e) => { e.stopPropagation(); this._cbs.onCellMouseUp(localRi, localCi, e); });
        cellEl.addEventListener('mousemove', (e) => { e.stopPropagation(); this._cbs.onCellMouseMove(localRi, localCi, e); });

        colMap.set(ci, cellEl);

        if (rs > 1) {
          // ① 마스터 행의 flex에 투명 placeholder 삽입 → 컬럼 너비 보존
          const ph = document.createElement('div');
          ph.style.cssText = [
            `width:${w}px;min-width:${w}px;height:${opts.rowHeight}px;`,
            'flex-shrink:0;box-sizing:border-box;',
            'border-right:1px solid var(--og-border-color,#e0e0e0);',
          ].join('');
          rowEl.appendChild(ph);

          // ② 마스터셀은 body 기준 absolute — top/left 정밀 계산
          let leftOff = 0;
          if (opts.stateColumn) leftOff += 24;
          if (opts.draggable)   leftOff += 18;
          if (opts.rowNumber)   leftOff += 44;
          if (opts.checkColumn) leftOff += 36;
          for (let pc = 0; pc < ci; pc++) leftOff += widths[pc] ?? opts.defaultColumnWidth;
          const rowTop = offsetY + (ri - startIndex) * opts.rowHeight;
          cellEl.style.left = `${leftOff}px`;
          cellEl.style.top  = `${rowTop}px`;
          frag.appendChild(cellEl);   // rowEl이 아닌 body 레벨에 직접 부착
        } else {
          rowEl.appendChild(cellEl);
        }
      }

      this._cellMap.set(ri, colMap);
      frag.appendChild(rowEl);
    }

    // 빈 데이터 메시지
    if (data.rowCount === 0) {
      const empty = _el('div', 'og-empty-message');
      empty.textContent = '데이터가 없습니다.';
      empty.style.cssText = `width:100%;`;
      frag.appendChild(empty);
    }

    this._body.appendChild(frag);
  }

  getCellEl(rowIndex: number, colIndex: number): HTMLElement | undefined {
    return this._cellMap.get(rowIndex)?.get(colIndex);
  }

  destroy(): void {
    this._root.innerHTML = '';
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

// ─── DOM 유틸 ─────────────────────────────────────────────
export function _el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

export function _style(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}

export function _downloadText(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── 컬럼 리사이즈 헬퍼 ──────────────────────────────────
function _addResizer(handle: HTMLElement, th: HTMLElement, onChange: (w: number) => void): void {
  let startX = 0, startW = 0;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    startX = e.clientX;
    startW = th.offsetWidth;

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(40, startW + ev.clientX - startX);
      th.style.width = `${w}px`;
      th.style.minWidth = `${w}px`;
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onChange(Math.max(40, startW + ev.clientX - startX));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
