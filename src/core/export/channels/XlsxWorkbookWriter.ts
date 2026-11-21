// ============================================================
// 스트리밍 .xlsx 쓰기기 — Zip(fflate)·스타일 등록소·시트 조립기를 합성해 쓴다(상속 없음).
// / Streaming .xlsx writer — composes fflate Zip, a styles registry and a sheet builder (no inheritance).
// ------------------------------------------------------------
// 전 행을 메모리에 쌓지 않는다: 시트 XML 을 행 청크 단위로 ZIP 엔트리에 밀어 넣고, 나오는 바이트를 즉시
// sink 로 흘린다(sink.write 를 await = 백프레셔). 셀마다 인라인 문자열(sharedStrings 없음).
// 스타일은 등록소가 고유 조합만 모아 styles.xml 로 한 번에 쓴다. 압축·CRC·ZIP 틀은 fflate 의 Zip + ZipDeflate 가 맡는다.
// 4GB 이상 항목(ZIP64)은 지원하지 않는다. 이 모듈 전체가 지연 청크 — 코어 번들엔 넣지 말고 동적 import 할 것.
// ============================================================

import { Zip, ZipDeflate } from 'fflate';
import type { IByteSink } from '../types.js';
import type { IStreamingWorkbookWriter, IXlsxStreamSession, SheetModel, XlsxStreamInit } from './XlsxChannel.js';
import { SheetXmlBuilder } from './XlsxSheetXml.js';
import { StylesRegistry } from './XlsxStylesRegistry.js';
import { NS, XML_HEAD, xmlEscape } from './XlsxXml.js';

export { xmlEscape };

/** 쓰기기 옵션. / Writer options. */
export interface XlsxWorkbookWriterOptions {
  /** deflate 수준(0 = 저장만, 기본 6). 0~9 밖의 값은 6 으로 본다. / Deflate level (0 = stored; default 6). Values outside 0..9 are treated as 6. */
  readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
  /** 스트림마다 쓸 스타일 등록소 공급자(주입, 기본 새 등록소). / Per-stream styles registry factory (injected; default a fresh registry). */
  readonly createStyles?: (() => StylesRegistry) | undefined;
}

const ENC = new TextEncoder();

/** ZIP 고정 시각(2026-01-01, 재현 가능한 바이트). / Fixed ZIP timestamp for reproducible bytes. */
const ZIP_MTIME = new Date(2026, 0, 1, 0, 0, 0);

const CONTENT_TYPES = XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS = XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WB_RELS = XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

function workbookXml(sheetName: string): string {
  // 시트명: 31자·금지문자([]:*?/\) 제한. / Sheet name limits.
  const name = xmlEscape(sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1');
  return XML_HEAD +
    `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

/** 스트리밍 xlsx 쓰기기. / Streaming xlsx writer. */
export class XlsxWorkbookWriter implements IStreamingWorkbookWriter {
  constructor(private readonly opts: XlsxWorkbookWriterOptions = {}) {}

  /** SheetModel → 바이트(소형 경로도 같은 스트리밍 엔진 사용). / Model path reuses the streaming engine. */
  async write(model: SheetModel, sink: IByteSink): Promise<number> {
    const s = await this.openStream(
      { sheetName: model.sheetName, header: model.header, colWidthsPx: model.colWidthsPx }, sink,
    );
    await s.appendRows(model.rows, model.merges);
    return s.finish();
  }

  async openStream(init: XlsxStreamInit, sink: IByteSink): Promise<IXlsxStreamSession> {
    const lv = this.opts.level;
    const level = (typeof lv === 'number' && Number.isInteger(lv) && lv >= 0 && lv <= 9 ? lv : 6) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    const styles = (this.opts.createStyles ?? (() => new StylesRegistry()))();
    const sheetXml = new SheetXmlBuilder(init, styles);
    const out = new ZipOutput(sink);

    for (const [name, xml] of [
      ['[Content_Types].xml', CONTENT_TYPES], ['_rels/.rels', ROOT_RELS],
      ['xl/workbook.xml', workbookXml(init.sheetName)], ['xl/_rels/workbook.xml.rels', WB_RELS],
    ] as const) await out.putWhole(name, xml, level);

    const sheet = out.open('xl/worksheets/sheet1.xml', level);
    sheet.push(ENC.encode(sheetXml.head()), false);
    await out.flush();

    return {
      appendRows: async (rows, rowMerges) => {
        const xml = sheetXml.rows(rows, rowMerges);
        if (xml !== '') sheet.push(ENC.encode(xml), false);
        await out.flush();
      },
      addStyle: (spec) => styles.add(spec),
      finish: async () => {
        sheet.push(ENC.encode(sheetXml.tail()), true);
        await out.putWhole('xl/styles.xml', styles.toXml(), level); // 모든 셀을 본 뒤 한 번에. / once all cells are seen
        return out.end();
      },
      abort: () => out.discard(), // 이후 쓰기 없음(호출자가 sink.abort). / no further writes (caller aborts the sink)
    };
  }
}

/** fflate Zip 을 sink 에 잇는 출력부: 큐 + 백프레셔 + 오류 전파. / fflate Zip → sink: queue, backpressure, error surfacing. */
class ZipOutput {
  private readonly pending: Uint8Array[] = [];
  private total = 0;
  private failure: unknown;
  private readonly zip: Zip;

  constructor(private readonly sink: IByteSink) {
    // fflate 콜백(동기): 바이트를 쌓고, 오류는 다음 flush 에서 던진다. / sync callback: queue bytes, surface errors at next flush.
    this.zip = new Zip((err, data) => {
      if (err) { this.failure ??= err; return; }
      if (data.length > 0) { this.pending.push(data); this.total += data.length; }
      if (this.total > 0xFFFFFFFF) this.failure ??= new Error('xlsx too large (ZIP64 unsupported)');
    });
  }

  /** 엔트리를 연다(이후 push 로 채운다). / Open an entry to fill with push(). */
  open(name: string, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): ZipDeflate {
    const f = new ZipDeflate(name, { level });
    f.mtime = ZIP_MTIME;
    this.zip.add(f);
    return f;
  }

  /** 작은 엔트리를 통째로 쓴다. / Write a small entry in one go. */
  async putWhole(name: string, xml: string, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): Promise<void> {
    this.open(name, level).push(ENC.encode(xml), true);
    await this.flush();
  }

  /** 쌓인 바이트를 순서대로 await write. / Drain queued bytes with awaited writes. */
  async flush(): Promise<void> {
    while (this.pending.length > 0) await this.sink.write(this.pending.shift()!);
    if (this.failure) throw this.failure;
  }

  /** 중앙 디렉터리까지 내보내고 총 바이트를 돌려준다. / Emit the central directory; return total bytes. */
  async end(): Promise<number> {
    this.zip.end();
    await this.flush();
    return this.total;
  }

  /** 남은 출력을 버린다. / Drop queued output. */
  discard(): void { this.pending.length = 0; }
}
