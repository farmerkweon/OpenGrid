// ============================================================
// DD-15 §2.6·4.2 인쇄 레이아웃 SPI — 페이지 배분(행 비분할·반복 헤더·페이지 라벨)
// / DD-15 §2.6 print layout SPI — page distribution (no row split, repeated header, page labels).
// ------------------------------------------------------------
// IPaginator 는 OCP seam: 용지방향·N-up·커스텀 헤더반복은 이 포트 재구현으로 개방. Paginator 는 기본 구현.
// 행 중간 절단 금지, 페이지마다 헤더 반복, "3–58행 / 전체 12,300" 범위 라벨. 순수·헤드리스(문자열만).
// ============================================================

import type { HeaderArtifact, RowArtifact } from '../types.js';
import type { IOutputChannelAdapter } from './OutputChannelAdapter.js';

/** 인쇄 페이지 산출(어댑터 잉크 적용 완료). / A rendered print page. */
export interface PrintPage {
  readonly pageNo: number;
  readonly totalPagesHint?: number;
  /** 이 페이지의 인쇄 HTML(문자열). / This page's print HTML. */
  readonly html: string;
  /** "3–58행 / 전체 12,300". / Row-range label. */
  readonly rangeLabel: string;
}

/** 페이지 배분 계약(SPI). / Page distribution contract (SPI). */
export interface IPaginator {
  paginate(
    rows: AsyncIterable<RowArtifact>,
    header: ReadonlyArray<ReadonlyArray<HeaderArtifact>>,
  ): AsyncIterable<PrintPage>;
}

/** Paginator 구성. / Paginator options. */
export interface PaginatorOptions {
  /** 페이지 박스(px). / Page box in px. */
  readonly pageBox: { readonly w: number; readonly h: number };
  /** 행 높이(px). / Row height in px. */
  readonly rowHeight: number;
  /** 헤더 반복(기본 true). / Repeat header per page (default true). */
  readonly repeatHeader?: boolean;
  /** 헤더 높이(px, 페이지당 rows 산정에서 차감). / Header height (px). */
  readonly headerHeight?: number;
  /** 전체 행수(범위 라벨 분모, 없으면 누적치). / Total rows (denominator). */
  readonly totalRows?: number;
  /** 색→흑백 잉크 어댑터(선택; 미주입 시 원문 표시값). / Ink adapter (optional). */
  readonly adapter?: IOutputChannelAdapter;
}

/** HTML 텍스트 이스케이프. / HTML text escaping. */
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 기본 페이지 분할 — 반복 헤더·행 경계 비분할·페이지 번호(§2.6).
 * 페이지당 행수 = floor((pageH − headerH) / rowHeight), 최소 1(행 비분할 보장).
 * / Default paginator; rows-per-page = floor((pageH − headerH)/rowHeight), min 1.
 */
export class Paginator implements IPaginator {
  constructor(private readonly opts: PaginatorOptions) {}

  /** 페이지당 데이터 행수(최소 1 — 한 행이 페이지보다 커도 절단 안 함). / Rows per page (min 1). */
  rowsPerPage(): number {
    const headerH = this.opts.repeatHeader === false ? 0 : (this.opts.headerHeight ?? this.opts.rowHeight);
    const usable = this.opts.pageBox.h - headerH;
    return Math.max(1, Math.floor(usable / this.opts.rowHeight));
  }

  async *paginate(
    rows: AsyncIterable<RowArtifact>,
    header: ReadonlyArray<ReadonlyArray<HeaderArtifact>>,
  ): AsyncIterable<PrintPage> {
    const per = this.rowsPerPage();
    const repeatHeader = this.opts.repeatHeader !== false;
    const headerHtml = this._headerHtml(header);

    let page: RowArtifact[] = [];
    let pageNo = 0;
    let firstRowOfPage = 1; // 1-base 인간용. / 1-base for humans.
    let emittedRows = 0;

    for await (const row of rows) {
      page.push(row);
      if (page.length >= per) {
        pageNo++;
        yield this._emit(pageNo, page, firstRowOfPage, repeatHeader ? headerHtml : '');
        emittedRows += page.length;
        firstRowOfPage = emittedRows + 1;
        page = [];
      }
    }
    // 잔여(마지막 페이지) — 빈 데이터면 헤더만 1페이지. / Trailing page (header-only if empty).
    if (page.length > 0 || pageNo === 0) {
      pageNo++;
      yield this._emit(pageNo, page, firstRowOfPage, repeatHeader ? headerHtml : '');
    }
  }

  private _emit(pageNo: number, rows: RowArtifact[], firstRow: number, headerHtml: string): PrintPage {
    const lastRow = firstRow + rows.length - 1;
    const total = this.opts.totalRows;
    const rangeLabel = rows.length === 0
      ? '0행'
      : total !== undefined
        ? `${firstRow}–${lastRow}행 / 전체 ${total.toLocaleString()}`
        : `${firstRow}–${lastRow}행`;

    const body = rows.map(r => this._rowHtml(r)).join('');
    const html =
      `<table class="og-print-table">` +
      (headerHtml ? `<thead>${headerHtml}</thead>` : '') +
      `<tbody>${body}</tbody></table>` +
      `<div class="og-print-pageno">p.${pageNo} · ${rangeLabel}</div>`;

    const page: { pageNo: number; html: string; rangeLabel: string } = { pageNo, html, rangeLabel };
    return page;
  }

  private _headerHtml(header: ReadonlyArray<ReadonlyArray<HeaderArtifact>>): string {
    return header
      .map(hrow =>
        `<tr>${hrow.map(h => `<th colspan="${h.colSpan}" rowspan="${h.rowSpan}">${esc(h.text)}</th>`).join('')}</tr>`,
      )
      .join('');
  }

  private _rowHtml(r: RowArtifact): string {
    const adapter = this.opts.adapter;
    const tds = r.cells
      .filter(c => !c.hidden)
      .map(c => {
        const text = adapter ? adapter.expandTruncation(c) : (c.rawText ?? c.text);
        const attrs: string[] = [`style="text-align:${c.align}"`];
        if (c.rowSpan > 1) attrs.push(`rowspan="${c.rowSpan}"`);
        if (c.colSpan > 1) attrs.push(`colspan="${c.colSpan}"`);
        // 색+형태 이중부호: 어댑터 잉크 glyph 병기(흑백 생존). / dual-encoding glyph.
        let glyphPrefix = '';
        if (adapter) {
          const dec = adapter.ink(c.cf, c.sign !== undefined ? { sign: c.sign } : {});
          if (dec.glyph) glyphPrefix = `<span class="og-print-glyph">${dec.glyph}</span> `;
        }
        return `<td ${attrs.join(' ')}>${glyphPrefix}${esc(text)}</td>`;
      })
      .join('');
    return `<tr>${tds}</tr>`;
  }
}
