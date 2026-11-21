// ============================================================
// 자료 행의 여분 칸(상태·끌기 손잡이·행번호·체크·디테일 펼침) 그리개 / Extra-cell painters for data rows
// 여분 칸마다 내용이 다르지만 「고정 컬럼이면 sticky + left + 배경」은 같다. 칸 종류를 조건문으로 가르지 않고
// 칸 종류마다 그리개 하나를 두어, 자료 행 그리개는 켜진 여분 컬럼 순서대로 그리개를 부르기만 한다.
// 폭·left 는 여분 컬럼 값(ExtraColumns)에만 묻는다.
//
// One painter per extra-cell kind instead of an if-ladder; the data-row painter just calls them in the order of
// the enabled extra columns. Widths and lefts are asked of the extra-column value only.
// ============================================================
import type { RendererCallbacks } from '../../GridRenderer.js';
import { _detailExpanderButton } from '../../GridRenderer.js';
import { _el } from '../dom.js';
import type { ExtraColumnId } from '../../coordinate/geometryPorts.js';
import type { BodyRowContext } from './rows/BodyRowContext.js';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * 여분 칸 하나의 내용과 고정 위치를 그린다. 그리기 한 번에 칸 하나씩 행에 붙인다(붙일 것이 없으면 아무것도 안 함).
 *
 * Paints one extra cell (content + sticky position) and appends it to the row; does nothing when there is nothing to draw.
 */
export interface ExtraCellPainter {
  readonly id: ExtraColumnId;
  paint(row: HTMLElement, ri: number, rowData: any, ctx: BodyRowContext): void;
}

/**
 * 고정 컬럼이 있으면 여분 칸을 왼쪽에 붙든다(지금 인라인 스타일 순서 그대로: position → left → z-index → background).
 *
 * Pins an extra cell to the left when there are frozen columns (inline style order as today: position → left → z-index → background).
 */
function stick(el: HTMLElement, left: number, ctx: BodyRowContext): void {
  if (ctx.frozenCount > 0) {
    el.style.position = 'sticky';
    el.style.left = `${left}px`;
    el.style.zIndex = '2';
    el.style.background = ctx.bg;
  }
}

const STATE_ICONS: Record<string, string> = { added: '✚', edited: '✎', removed: '✖', none: '' };
const STATE_COLORS: Record<string, string> = { added: '#2e7d32', edited: '#bf360c', removed: '#c62828', none: '' };

/** 행 상태 기호 칸(맨 앞). / Row-state glyph cell (first). */
class StateCellPainter implements ExtraCellPainter {
  readonly id = 'state' as const;
  paint(row: HTMLElement, _ri: number, _rowData: any, ctx: BodyRowContext): void {
    const stCell = _el('div', 'og-cell og-col-state');
    stCell.textContent = STATE_ICONS[ctx.rowState] ?? '';
    stCell.style.color = STATE_COLORS[ctx.rowState] ?? '';
    stCell.title = ctx.rowState;
    stick(stCell, ctx.extraLeft.state, ctx);
    row.appendChild(stCell);
  }
}

/**
 * 행 끌기 손잡이. 끌기 관리자가 없으면(마운트 뒤 옵션만 켠 경우) 그리지 않는다 — 그때 뒤 칸이 당겨지는 폭은
 * 자료 행 그리개가 ctx.dragGap 으로 정해 둔다.
 *
 * Row drag handle; not drawn without a drag manager (the following cells' shift is ctx.dragGap).
 */
class DragCellPainter implements ExtraCellPainter {
  readonly id = 'drag' as const;
  paint(row: HTMLElement, ri: number, _rowData: any, ctx: BodyRowContext): void {
    const dnd = ctx.dnd;
    if (!dnd) return;
    const handle = dnd.attachHandle(row, ri, ctx.opts._totalRows ?? ctx.endIndex + 1);
    stick(handle, ctx.extraLeft.drag, ctx);
    row.appendChild(handle);
  }
}

/** 행 번호 칸(1부터). / Row-number cell (1-based). */
class RowNumberCellPainter implements ExtraCellPainter {
  readonly id = 'rowNumber' as const;
  paint(row: HTMLElement, ri: number, _rowData: any, ctx: BodyRowContext): void {
    const numCell = _el('div', 'og-cell og-col-rownum');
    numCell.textContent = String(ri + 1);
    stick(numCell, ctx.extraLeft.rowNumber - ctx.dragGap, ctx);
    row.appendChild(numCell);
  }
}

/** 행 체크 칸. / Row checkbox cell. */
class CheckCellPainter implements ExtraCellPainter {
  readonly id = 'check' as const;
  constructor(private readonly _cbs: RendererCallbacks, private readonly _t: Translate) {}
  paint(row: HTMLElement, ri: number, _rowData: any, ctx: BodyRowContext): void {
    const chkCell = _el('div', 'og-cell og-col-check');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = ctx.checkedRows.has(ri);
    chk.setAttribute('aria-label', this._t('row.selectAria', { n: ri + 1 }));
    chk.addEventListener('click', (e) => e.stopPropagation());
    chk.addEventListener('change', (e) => {
      e.stopPropagation();
      this._cbs.onRowCheck(ri, chk.checked);
    });
    chkCell.appendChild(chk);
    stick(chkCell, ctx.extraLeft.check - ctx.dragGap, ctx);
    row.appendChild(chkCell);
  }
}

/**
 * 디테일 펼침 단추 칸. 묶음·나무 머리가 아닌 자료 행(나무 노드 포함)에만 붙는다. 펼침 상태는 행의 aria-expanded 에도 단다.
 *
 * Detail expander cell for data rows (tree nodes included); also sets the row's aria-expanded.
 */
class DetailCellPainter implements ExtraCellPainter {
  readonly id = 'detail' as const;
  paint(row: HTMLElement, ri: number, rowData: any, ctx: BodyRowContext): void {
    if (!ctx.detailColOn) return;
    const detailApi = ctx.detailApi!;
    const dCell = _el('div', 'og-cell og-col-detail-toggle');
    dCell.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;';
    const rid = detailApi.getRowId(rowData);
    const expanded = !!rid && detailApi.isExpanded(rid);
    const glyphInfo = detailApi.getGlyph(expanded);
    const btn = _detailExpanderButton(glyphInfo, rid, ri, detailApi);
    dCell.appendChild(btn);
    stick(dCell, ctx.extraLeft.detail - ctx.dragGap, ctx);
    const w = ctx.detailWidth;
    dCell.style.width = `${w}px`;
    dCell.style.minWidth = `${w}px`;
    row.appendChild(dCell);
    if (rid) row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
}

/**
 * 다섯 그리개를 여분 컬럼 이름으로 찾는 표(BodyView 당 한 번 만든다).
 *
 * Table of the five painters keyed by extra-column id (built once per body view).
 */
export function createExtraCellPainters(cbs: RendererCallbacks, t: Translate): Readonly<Record<ExtraColumnId, ExtraCellPainter>> {
  return Object.freeze({
    state: new StateCellPainter(),
    drag: new DragCellPainter(),
    rowNumber: new RowNumberCellPainter(),
    check: new CheckCellPainter(cbs, t),
    detail: new DetailCellPainter(),
  });
}
