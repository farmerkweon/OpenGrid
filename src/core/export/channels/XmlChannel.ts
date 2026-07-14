// ============================================================
// DD-15 §2.4 XML 채널 — 행/셀 요소 직렬화(화면 진실 = CellArtifact.text) + provenance 주석
// / DD-15 §2.4 XML channel — row/cell element serialization + comment provenance.
// ------------------------------------------------------------
// 채널은 CellArtifact 필드만 읽는다(raw 미접근). 대용량은 청크 스트리밍(전체 문자열 일괄 금지).
// XmlConverter(SAP 등 검증된 직렬화) 재사용 배선은 통합 TODO — 본 채널은 순수 요소 매핑.
// ============================================================

import { StreamPump } from '../StreamPump.js';
import type {
  ExportResult, ExportRunCtx, HeaderArtifact, IArtifactSource, IByteSink, RowArtifact,
} from '../types.js';
import { XML_CAPS } from './capabilities.js';

/** XML 텍스트 이스케이프. / XML text escaping. */
function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** XML 채널 옵션. / XML channel options. */
export interface XmlChannelOptions {
  /** 루트 요소명(기본 rows). / Root element name. */
  readonly rootTag?: string;
  /** 행 요소명(기본 row). / Row element name. */
  readonly rowTag?: string;
  /** field 를 요소명으로(false면 <cell name="field">). / Use field as element name. */
  readonly fieldAsTag?: boolean;
  /** provenance 주석 포함. / Include provenance comment. */
  readonly includeProvenance?: boolean;
  readonly preserveRaw?: boolean;
}

/** XML 직렬화 전략. / XML serialization strategy. */
export class XmlChannel {
  readonly id = 'xml' as const;
  readonly capabilities = XML_CAPS;

  constructor(private readonly opts: XmlChannelOptions = {}) {}

  async write(source: IArtifactSource, sink: IByteSink, ctx?: ExportRunCtx): Promise<ExportResult> {
    const root = this.opts.rootTag ?? 'rows';
    const rowTag = this.opts.rowTag ?? 'row';
    const fieldAsTag = this.opts.fieldAsTag !== false;
    const preserveRaw = this.opts.preserveRaw === true;

    const header = source.projectHeader();
    const leaf: ReadonlyArray<HeaderArtifact> = header[header.length - 1] ?? [];
    const fields = leaf.map(h => h.field);

    let prolog = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    if (this.opts.includeProvenance !== false && ctx?.provenance) {
      const block = ctx.provenance.render('xml');
      if (block.text) prolog += `<!--\n${block.text}\n-->\n`;
    }
    prolog += `<${root}>\n`;
    await sink.write(prolog);

    const encodeChunk = (rows: ReadonlyArray<RowArtifact>): string =>
      rows
        .map(r => {
          const visible = r.cells.filter(c => !c.hidden);
          const inner = visible
            .map((c, i) => {
              const field = fields[i] ?? `col${i}`;
              const val = xmlEscape(preserveRaw && c.rawText !== undefined ? c.rawText : c.text);
              return fieldAsTag
                ? `<${field}>${val}</${field}>`
                : `<cell name="${xmlEscape(field)}">${val}</cell>`;
            })
            .join('');
          return `  <${rowTag}>${inner}</${rowTag}>`;
        })
        .join('\n') + '\n';

    const realClose = sink.close.bind(sink);
    let closed = false;
    const proxy: IByteSink = {
      write: sink.write.bind(sink),
      abort: sink.abort.bind(sink),
      get desiredSize() { return sink.desiredSize; },
      close: async () => {
        if (!closed) { closed = true; await sink.write(`</${root}>\n`); }
        await realClose();
      },
    };

    const pump = new StreamPump();
    return pump.pump(source.projectRows(), encodeChunk, proxy, ctx, source.totalRows());
  }
}
