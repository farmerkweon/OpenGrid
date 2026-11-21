// ============================================================
// DD-15 §2.4·4.3 xlsx 채널 — 순수 SheetModel 접기(화면 진실) + 바이너리 인코더 주입 SPI
// / DD-15 §2.4 xlsx channel — pure SheetModel fold (screen truth) + injected binary-writer SPI.
// ------------------------------------------------------------
// 코어는 xlsx-js-style 를 번들에 넣지 않는다(하드제약 §7). 채널은 CellArtifact → SheetModel(값·스타일)로
// 순수 매핑만 하고, 실제 .xlsx 바이트 산출은 주입된 IWorkbookWriter(동적 import 어댑터)에 위임.
// 셀 값 = artifact.text, 채움색 = cf.fill.color(상류 확정, 재계산 금지) → WYSIWYG 골든 일치.
// SheetModel 은 헤드리스 골든 스냅샷으로 파리티 검증 가능(바이너리 없이).
// ============================================================

import type {
  CellArtifact, ChannelCapabilities, ExportResult, ExportRunCtx, HeaderArtifact, IArtifactSource, IByteSink,
  XlsxCellStyleSpec, XlsxRichTextRun,
} from '../types.js';
import { XLSX_CAPS } from './capabilities.js';

/** 순수 셀 모델(값 + 상류 확정 스타일). / Pure cell model (value + upstream-confirmed style). */
export interface SheetCell {
  /** 표시값(= CellArtifact.text). / Display value. */
  readonly value: string;
  /** number 타입일 때 수치(xlsx 셀 타입 매핑). / Numeric magnitude for number cells. */
  readonly num?: number;
  /** 채움색(= cf.fill.color, 상류 AA 보증). / Fill color from cf.fill. */
  readonly fill?: string;
  /** 채움 위 잉크색(= cf.inkColor). / Ink color from cf.inkColor. */
  readonly ink?: string;
  readonly align: 'left' | 'right' | 'center';
  /** 미리 등록한 스타일 번호(session.addStyle 반환값). 있으면 그대로 쓴다. / Pre-registered style index; used as-is when present. */
  readonly s?: number;
  /** 셀 스타일 명세(쓰기기가 등록·중복 제거). / Cell style spec (registered and de-duplicated by the writer). */
  readonly style?: XlsxCellStyleSpec;
  /** 셀 안 서식 조각(있으면 글자 대신 이 조각들을 쓴다). / In-cell rich-text runs (replace the plain text when present). */
  readonly runs?: ReadonlyArray<XlsxRichTextRun>;
  readonly rowSpan: number;
  readonly colSpan: number;
}

/** 병합 영역(0-based). / Merge region (0-based). */
export interface MergeRegion {
  readonly r: number; readonly c: number; readonly rs: number; readonly cs: number;
}

/** 순수 시트 모델 — 바이너리 없이 파리티 검증 가능. / Pure sheet model (parity-checkable without binary). */
export interface SheetModel {
  readonly sheetName: string;
  readonly header: ReadonlyArray<string>;
  readonly colWidthsPx: ReadonlyArray<number>;
  readonly rows: ReadonlyArray<ReadonlyArray<SheetCell>>;
  readonly merges: ReadonlyArray<MergeRegion>;
  /** provenance 시트 메모(있으면). / Provenance sheet note. */
  readonly provenanceNote?: string;
}

/** 바이너리 인코더 SPI(동적 import 어댑터 주입). / Binary-writer SPI (inject a dynamic-import adapter). */
export interface IWorkbookWriter {
  /** SheetModel → 바이트(sink 로 기록). / SheetModel → bytes (written to sink). */
  write(model: SheetModel, sink: IByteSink): Promise<number>;
}

/** 스트리밍 시트 개시 정보. / Streaming sheet init info. */
export interface XlsxStreamInit {
  readonly sheetName: string;
  readonly header: ReadonlyArray<string>;
  readonly colWidthsPx: ReadonlyArray<number>;
  /** false 면 머리글 행을 쓰지 않는다(기본 true). / false omits the header row (default true). */
  readonly includeHeader?: boolean;
}

/** 스트리밍 쓰기 세션(행 청크 단위). / Streaming write session (row-chunk granularity). */
export interface IXlsxStreamSession {
  /** 행 청크 추가(sink 쓰기를 await = 백프레셔). / Append a row chunk (awaits sink writes). */
  appendRows(rows: ReadonlyArray<ReadonlyArray<SheetCell>>, merges?: ReadonlyArray<MergeRegion>): Promise<void>;
  /** 스타일 등록 후 번호 반환(같은 조합은 같은 번호). / Register a style and return its index (equal combos share one). */
  addStyle?(spec: XlsxCellStyleSpec): number;
  /** 마무리(총 바이트 반환). sink.close 는 호출자 몫. / Finish; returns total bytes (caller closes sink). */
  finish(): Promise<number>;
  /** 중단(이후 쓰기 없음). / Abort. */
  abort(): void;
}

/** 스트리밍 가능한 쓰기기 SPI. / Streaming-capable writer SPI. */
export interface IStreamingWorkbookWriter extends IWorkbookWriter {
  openStream(init: XlsxStreamInit, sink: IByteSink): Promise<IXlsxStreamSession>;
}

/** xlsx 채널 옵션. / xlsx channel options. */
export interface XlsxChannelOptions {
  readonly sheetName?: string;
  readonly includeProvenance?: boolean;
  /** 스트리밍: false 면 머리글 행 제외(기본 true). / Streaming: false omits the header row (default true). */
  readonly includeHeader?: boolean;
}

/** xlsx 직렬화 전략(순수 접기 + 주입 인코더). / xlsx serialization strategy (pure fold + injected writer). */
export class XlsxChannel {
  readonly id = 'xlsx' as const;
  readonly capabilities: ChannelCapabilities = XLSX_CAPS;

  constructor(
    private readonly writer: IWorkbookWriter,
    private readonly opts: XlsxChannelOptions = {},
  ) {}

  /** 순수: 소스 → SheetModel(파리티 골든 대상). / Pure: source → SheetModel (parity golden target). */
  async buildModel(source: IArtifactSource, ctx?: ExportRunCtx): Promise<SheetModel> {
    const header = source.projectHeader();
    const leaf: ReadonlyArray<HeaderArtifact> = header[header.length - 1] ?? [];
    const rows: SheetCell[][] = [];
    const merges: MergeRegion[] = [];

    let rowIdx = 0; // 데이터 행 0-base(헤더 제외). / data-row 0-base (excludes header).
    for await (const chunk of source.projectRows()) {
      for (const r of chunk.rows) {
        const cells: SheetCell[] = [];
        let colIdx = 0;
        for (const c of r.cells) {
          if (c.hidden) { colIdx++; continue; }
          const cell = toSheetCell(c);
          if (c.rowSpan > 1 || c.colSpan > 1) {
            // +1: 헤더 행 오프셋. / +1 for the header row offset.
            merges.push({ r: rowIdx + 1, c: colIdx, rs: c.rowSpan, cs: c.colSpan });
          }
          cells.push(cell);
          colIdx++;
        }
        rows.push(cells);
        rowIdx++;
      }
      if (chunk.done) break;
    }

    const model: {
      sheetName: string; header: string[]; colWidthsPx: number[];
      rows: SheetCell[][]; merges: MergeRegion[]; provenanceNote?: string;
    } = {
      sheetName: this.opts.sheetName ?? 'Sheet1',
      header: leaf.map(h => h.text),
      colWidthsPx: leaf.map(h => h.widthPx),
      rows,
      merges,
    };
    if (this.opts.includeProvenance !== false && ctx?.provenance) {
      const block = ctx.provenance.render('xlsx');
      if (block.text) model.provenanceNote = block.text;
    }
    return model;
  }

  async write(source: IArtifactSource, sink: IByteSink, ctx?: ExportRunCtx): Promise<ExportResult> {
    const model = await this.buildModel(source, ctx);
    const bytes = await this.writer.write(model, sink);
    await sink.close();
    return { bytesWritten: bytes, rowsWritten: model.rows.length, aborted: false };
  }

  /**
   * 스트리밍 쓰기: 전 행을 적재하지 않고 청크 단위로 writer 에 흘린다(머리글 먼저).
   * 취소(ctx.signal)·진척(ctx.onProgress)·백프레셔(sink.write await) 지원. 기존 write 는 불변.
   * / Streaming write: flows row chunks to the writer without materializing all rows.
   */
  async writeStreaming(source: IArtifactSource, sink: IByteSink, ctx?: ExportRunCtx): Promise<ExportResult> {
    const w = this.writer as Partial<IStreamingWorkbookWriter>;
    if (typeof w.openStream !== 'function') throw new Error('xlsx writer does not support streaming');
    const header = source.projectHeader();
    const leaf: ReadonlyArray<HeaderArtifact> = header[header.length - 1] ?? [];
    const total = source.totalRows();
    const session = await w.openStream({
      sheetName: this.opts.sheetName ?? 'Sheet1',
      header: leaf.map(h => h.text),
      colWidthsPx: leaf.map(h => h.widthPx),
      ...(this.opts.includeHeader === false ? { includeHeader: false } : {}),
    }, sink);
    const headerRows = this.opts.includeHeader === false ? 0 : 1;

    let rowsWritten = 0;
    let aborted = false;
    try {
      for await (const chunk of source.projectRows()) {
        if (ctx?.signal?.aborted) { aborted = true; break; }
        if (chunk.rows.length > 0) {
          const rows: SheetCell[][] = [];
          const merges: MergeRegion[] = [];
          for (const r of chunk.rows) {
            const cells: SheetCell[] = [];
            let colIdx = 0;
            for (const c of r.cells) {
              if (c.hidden) { colIdx++; continue; }
              if (c.rowSpan > 1 || c.colSpan > 1) {
                merges.push({ r: rowsWritten + rows.length + headerRows, c: colIdx, rs: c.rowSpan, cs: c.colSpan });
              }
              cells.push(toSheetCell(c));
              colIdx++;
            }
            rows.push(cells);
          }
          await session.appendRows(rows, merges);
          rowsWritten += rows.length;
          ctx?.onProgress?.(rowsWritten, total);
          // 진척바가 그려지도록 청크마다 메인스레드를 한 번 양보. / yield once per chunk so progress UI can paint.
          await new Promise<void>(res => setTimeout(res, 0));
        }
        if (ctx?.signal?.aborted) { aborted = true; break; }
        if (chunk.done) break;
      }
    } catch (e) {
      session.abort();
      sink.abort('error');
      throw e;
    }
    if (!aborted && ctx?.signal?.aborted) aborted = true; // finish/close 직전 취소 한 번 더 확인
    if (aborted) {
      session.abort();
      sink.abort('cancelled');
      return { bytesWritten: 0, rowsWritten, aborted: true };
    }
    const bytes = await session.finish();
    await sink.close();
    return { bytesWritten: bytes, rowsWritten, aborted: false };
  }
}

/** CellArtifact → SheetCell(buildModel·writeStreaming 공용 매핑). / Shared cell mapping. */
function toSheetCell(c: CellArtifact): SheetCell {
  const cell: {
    value: string; align: SheetCell['align']; rowSpan: number; colSpan: number;
    num?: number; fill?: string; ink?: string; style?: XlsxCellStyleSpec; runs?: ReadonlyArray<XlsxRichTextRun>;
  } = { value: c.text, align: c.align, rowSpan: c.rowSpan, colSpan: c.colSpan };
  if (c.type === 'number' || c.type === 'currency' || c.type === 'money' || c.type === 'percent') {
    // rawText 가 있으면 그것만 Number() — 정규식 재파싱은 rawText 없는 소스의 폴백일 뿐(지수표기를 깨뜨린다).
    // 비유한(NaN/Infinity)은 숫자 셀로 쓰지 않고 텍스트로 남긴다(조용한 0 금지).
    // / With rawText use Number() only; regex scrape is a fallback for sources without it. Non-finite stays text.
    let n = NaN;
    if (c.rawText !== undefined) n = Number(c.rawText);
    else { const s = c.text.replace(/[^\d.-]/g, ''); if (s !== '') n = Number(s); }
    if (Number.isFinite(n)) cell.num = n;
  }
  if (c.xlsxStyle) cell.style = c.xlsxStyle;
  if (c.xlsxRuns) cell.runs = c.xlsxRuns;
  if (c.cf?.fill) cell.fill = c.cf.fill.color;
  if (c.cf) cell.ink = c.cf.inkColor;
  return cell;
}
