// ============================================================
// DD-15 §2.6 인쇄 렌더 타깃 — 전행 실체화 + 페이지네이션(가상스크롤 우회, REQ-T9-845/805)
// / DD-15 §2.6 print render target — full-row materialization + pagination (bypasses virtual scroll).
// ------------------------------------------------------------
// source.projectRows(전 범위) → adapter 잉크 → paginator 페이지 스트림. 화면 밖 행 전량 포함(전량 순회).
// 스트리밍 페이지네이션이라 전 DOM 을 한 번에 만들지 않음(과거 502,049노드 사고의 인쇄판 재발 방지).
// provenance 는 각 페이지 푸터에 동행(흑백 픽토). 순수·헤드리스(페이지 HTML 문자열만; window 는 shell 소유).
// ============================================================

import type { IArtifactProvenance, IArtifactSource, RowArtifact, RowRange } from '../types.js';
import type { IOutputChannelAdapter } from './OutputChannelAdapter.js';
import type { IPaginator, PrintPage } from './Paginator.js';

/** PrintRenderTarget 협력자. / Print render target collaborators. */
export interface PrintRenderDeps {
  /** 전 모델행 투영(가시행 아님). / Full-row projection source. */
  readonly source: IArtifactSource;
  /** 흑백/이중부호 출력 어댑터. / Mono/dual-encoding output adapter. */
  readonly adapter: IOutputChannelAdapter;
  /** 페이지 배분 SPI(교체 가능). / Page distribution SPI (replaceable). */
  readonly paginator: IPaginator;
  /** 변환 provenance(페이지 푸터 동행). / Transform provenance (page footer). */
  readonly provenance?: IArtifactProvenance;
}

/** render 옵션. / render options. */
export interface PrintRenderOptions {
  /** 인쇄 범위(미지정 = 전체). / Print range (undefined = all). */
  readonly range?: RowRange;
  /** 문서 제목. / Document title. */
  readonly title?: string;
  /** 진행률(대용량). / Progress (large data). */
  readonly onProgress?: (done: number, total: number) => void;
}

/**
 * 전 논리행을 실체화해 페이지네이션된 인쇄 페이지를 스트림 생성(§2.6).
 * / Materializes all logical rows into a stream of paginated print pages.
 */
export class PrintRenderTarget {
  constructor(private readonly deps: PrintRenderDeps) {}

  /** 인쇄 페이지 async 스트림. / Async stream of print pages. */
  async *render(opts: PrintRenderOptions = {}): AsyncIterable<PrintPage> {
    const total = this.deps.source.totalRows(opts.range);
    let done = 0;

    const rowStream = this._rowStream(opts.range, () => {
      done++;
      opts.onProgress?.(done, total);
    });

    const header = this.deps.source.projectHeader(opts.range ? { range: opts.range } : {});
    const footer = this.deps.provenance?.render('print').text ?? '';

    for await (const page of this.deps.paginator.paginate(rowStream, header)) {
      yield footer
        ? { ...page, html: `${page.html}<div class="og-print-provenance">${footer}</div>` }
        : page;
    }
  }

  /** 전체 인쇄 문서 조립(모든 페이지 결합). shell 이 print window 에 write. / Assemble the full print doc. */
  async renderDocument(opts: PrintRenderOptions = {}): Promise<string> {
    const title = opts.title ?? 'OPEN_GRID';
    const border = this.deps.adapter.borderStyle();
    const pages: string[] = [];
    for await (const page of this.render(opts)) {
      pages.push(`<section class="og-print-page">${page.html}</section>`);
    }
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escHtml(title)}</title>
<style>
  @page{margin:0;}
  body{font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;margin:0;padding:1cm;color:#111;}
  .og-print-page{page-break-after:always;}
  .og-print-table{border-collapse:collapse;width:100%;}
  .og-print-table th,.og-print-table td{border:${border.widthPx}px ${border.style} ${border.color};padding:5px 8px;white-space:nowrap;}
  .og-print-table th{font-weight:600;}
  .og-print-glyph{font-weight:700;}
  .og-print-pageno,.og-print-provenance{font-size:10px;color:#444;margin-top:6px;}
</style></head><body>
${pages.join('\n')}
</body></html>`;
  }

  private async *_rowStream(range: RowRange | undefined, onRow: () => void): AsyncIterable<RowArtifact> {
    const projOpts = range ? { range } : {};
    for await (const chunk of this.deps.source.projectRows(projOpts)) {
      for (const r of chunk.rows) { onRow(); yield r; }
      if (chunk.done) break;
    }
  }
}

function escHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
