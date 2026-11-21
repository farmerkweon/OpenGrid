// ============================================================
// 묶음(그룹) 머리 행 그리개 / Group header row painter
// 묶음 행은 여분 컬럼 자리를 칸 하나로 합쳐 편집 상태 배지를 보이고, 자료 컬럼마다 소계 또는 묶음 이름을 그린다.
// 폭은 컬럼 기하에 묻는다.
//
// A group row merges the extra-column area into one cell showing edit-state badges, and draws a subtotal or the
// group label per data column. Widths come from the column geometry.
// ============================================================
import type { AppearanceResolver } from '../../../AppearanceResolver.js';
import { _el } from '../../dom.js';
import { leafColIndex } from '../../../coordinate/types.js';
import type { BodyRowContext, BodyRowPainter } from './BodyRowContext.js';
import { paintGap } from './WindowLayout.js';

/**
 * 묶음 머리 행 하나를 그린다(누르면 펼침/접힘).
 *
 * Paints one group header row (click toggles it).
 */
export class GroupRowPainter implements BodyRowPainter {
  readonly kind = 'group' as const;

  constructor(
    private readonly _ap: AppearanceResolver,
    private readonly _tr: (key: string, params?: Record<string, string | number>) => string,
  ) {}

  private _t(key: string, params?: Record<string, string | number>): string {
    return this._tr(key, params);
  }

  paint(ri: number, flatItem: any, ctx: BodyRowContext): HTMLElement | null {
    const { opts, startIndex, offsetY, auto, applier } = ctx;
    const ap = this._ap;
    const extraW = ctx.extraWidth;

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
      `border:0;border-bottom:${ap.divider()};`,
    ].join('');
    rowEl.setAttribute('role', 'row');
    rowEl.setAttribute('aria-expanded', g._expanded ? 'true' : 'false');
    rowEl.setAttribute('aria-rowindex', String(ri + 1));
    rowEl.setAttribute('aria-level', String(g._depth + 1));

    // ── extra 컬럼 영역 (stateColumn/draggable/rowNumber/checkColumn) — 폭은 여분 컬럼 합 ──────
    // stateColumn 자리: 편집 상태 배지 표시
    if (extraW > 0) {
      const stCell = _el('div', 'og-group-state-cell');
      stCell.style.cssText = [
        `width:${extraW}px;min-width:${extraW}px;flex-shrink:0;`,
        'display:flex;align-items:center;justify-content:center;',
        'font-size:10px;font-weight:700;gap:2px;',
        `border-right:${ap.border()};`,
      ].join('');
      const st = g._states ?? { added: 0, edited: 0, removed: 0 };
      if (st.added > 0)   { const b = _el('span'); b.textContent=`+${st.added}`; b.style.cssText=`color:var(--og-row-added-bg,#2e7d32);background:#e8f5e9;padding:1px 3px;border-radius:${ap.radius(3)};`; stCell.appendChild(b); }
      if (st.edited > 0)  { const b = _el('span'); b.textContent=`M${st.edited}`; b.style.cssText=`color:#e65100;background:#fff8e1;padding:1px 3px;border-radius:${ap.radius(3)};`; stCell.appendChild(b); }
      if (st.removed > 0) { const b = _el('span'); b.textContent=`D${st.removed}`; b.style.cssText=`color:var(--og-row-removed-bg,#c62828);background:#ffebee;padding:1px 3px;border-radius:${ap.radius(3)};`; stCell.appendChild(b); }
      applier?.trackExtra(stCell, 'body');
      rowEl.appendChild(stCell);
    }

    // ── 컬럼별 셀 — 창 차례(칸 구간·빈칸)대로. 창이 전 컬럼이면 컬럼 0 부터 끝까지(걸음 전과 같은 DOM) ──
    this._columns(rowEl, g, ctx);

    // 누르면 펴고 접는다 — click 은 본문 위임이 받아 이 열쇠로 부른다(행마다 리스너를 붙이지 않는다).
    // Click toggles the group — the body delegation receives it and uses this key (no per-row listener).
    ctx.groupKeys.set(rowEl, groupKey);
    return rowEl;
  }

  /**
   * 창이 바뀔 때: 묶음 행의 컬럼 몫(여분 자리 뒤)만 걷어 새 창으로 다시 놓는다. 묶음 행은 화면에 적고 칸에 상태가 없어
   * (편집기·사용자 렌더러 없음) 컬럼 몫을 통째로 다시 놓아도 같은 창으로 그린 것과 같다. 행 요소는 그대로.
   *
   * On a window change, replaces only the column part (after the extra spot) with the new window. Group rows are few
   * and their cells hold no state, so re-laying the column part equals painting with the new window. The row stays.
   */
  shift(rowEl: HTMLElement, flatItem: any, ctx: BodyRowContext): void {
    const applier = ctx.applier;
    applier?.untrack(rowEl);
    const keep = ctx.extraWidth > 0 ? 1 : 0;
    while (rowEl.children.length > keep) {
      const el = rowEl.lastElementChild as HTMLElement;
      applier?.untrack(el);
      el.remove();
    }
    this._columns(rowEl, flatItem, ctx);
  }

  /**
   * 컬럼 칸과 빈칸을 창 차례대로 붙이고 폭 자리를 기억시킨다. 마지막 칸 구간은 행 하나로 등록하고(칸이 컬럼 순서대로 하나씩
   * 붙으므로), 그 앞 구간(고정 컬럼)은 칸마다 — 등록기는 한 행에 행 등록을 하나만 들므로. 빈칸은 빈칸 등록.
   * 묶음 이름은 창과 무관하게 「소계가 없는 첫 컬럼」에 둔다(전 컬럼을 그릴 때와 같은 칸). 그 컬럼이 창 밖이면 행의 aria-label 로 읽히게 한다.
   *
   * Appends cells and gaps in window order and registers width spots: the last run as one row registration, earlier
   * runs (frozen) per cell, gaps as gaps. The label column is fixed regardless of the window.
   */
  private _columns(rowEl: HTMLElement, g: any, ctx: BodyRowContext): void {
    const { leaves, applier } = ctx;
    const ap = this._ap;
    const geo = ctx.geometry;
    let labelCol = -1;
    for (let ci = 0; ci < leaves.length; ci++) {
      if (!(g._summaryFmt !== undefined && leaves[ci]!.field in (g._summaryFmt ?? {}))) { labelCol = ci; break; }
    }
    const pieces = ctx.layout.pieces;
    let lastRun = -1;
    for (let p = 0; p < pieces.length; p++) if (!pieces[p]!.gap) lastRun = p;
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p]!;
      if (piece.gap) { rowEl.appendChild(paintGap(piece.from, piece.to, ctx)); continue; }
      const firstCell = rowEl.children.length;
      for (let ci = piece.from; ci <= piece.to; ci++) {
        const col = leaves[ci]!;
        const w   = geo.widthOf(leafColIndex(ci));
        const hasSummary = g._summaryFmt !== undefined && col.field in (g._summaryFmt ?? {});

      const cell = _el('div', 'og-group-cell');
      cell.style.cssText = [
        `width:${w}px;min-width:${w}px;flex-shrink:0;`,
        `padding:${ap.cellPadding()};box-sizing:border-box;overflow:hidden;`,
        `border-right:${ap.border()};`,
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
      } else if (ci === labelCol) {
        // 맨 첫 번째 비-소계 컬럼에 그룹 레이블 배치
        const arrow = _el('span', 'og-group-arrow');
        arrow.textContent = g._expanded ? '▾ ' : '▸ ';
        arrow.style.cssText = 'color:var(--og-primary,#1976d2);margin-right:4px;flex-shrink:0;';
        cell.appendChild(arrow);

        const lbl = _el('span', 'og-group-label');
        lbl.textContent = this._t('group.badge', { label: g._groupLabel, count: g._childCount });
        lbl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;font-weight:600;';
        cell.appendChild(lbl);
        cell.style.gap = '0';
      }
      // 소계도 없고 첫 번째도 아닌 열: 빈 셀 (간격 유지)


        if (p !== lastRun) applier?.trackSpan(cell, ci, 1, 'wm', 'body');
        rowEl.appendChild(cell);
      }
      if (p === lastRun) applier?.trackRowCells(rowEl, firstCell, piece.from, piece.to, 'wm', 'body');
    }
    // 이름 컬럼이 창 밖이면 이름 칸이 DOM 에 없으므로 행에 이름·건수를 단다(창 안이면 달지 않음 — 전 컬럼 DOM 그대로)
    // When the label column is outside the window the label cell is absent, so the row carries name and count instead.
    if (labelCol >= 0 && !ctx.columns.contains(leafColIndex(labelCol))) {
      rowEl.setAttribute('aria-label', this._t('group.badge', { label: g._groupLabel, count: g._childCount }));
    } else if (rowEl.hasAttribute('aria-label')) rowEl.removeAttribute('aria-label');
  }
}
