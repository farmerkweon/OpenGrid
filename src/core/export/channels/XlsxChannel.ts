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
  ChannelCapabilities, ExportResult, ExportRunCtx, HeaderArtifact, IArtifactSource, IByteSink,
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

/** xlsx 채널 옵션. / xlsx channel options. */
export interface XlsxChannelOptions {
  readonly sheetName?: string;
  readonly includeProvenance?: boolean;
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
          const cell: {
            value: string; align: SheetCell['align']; rowSpan: number; colSpan: number;
            num?: number; fill?: string; ink?: string;
          } = {
            value: c.text,
            align: c.align,
            rowSpan: c.rowSpan,
            colSpan: c.colSpan,
          };
          if (c.type === 'number' || c.type === 'currency' || c.type === 'money' || c.type === 'percent') {
            const n = Number(c.rawText ?? c.text.replace(/[^\d.-]/g, ''));
            if (Number.isFinite(n)) cell.num = n;
          }
          if (c.cf?.fill) cell.fill = c.cf.fill.color;
          if (c.cf) cell.ink = c.cf.inkColor;
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
}
