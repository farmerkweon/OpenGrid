// ============================================================
// DD-15 §2.4 CSV 채널 — 값 직렬화(화면 진실 = CellArtifact.text) + provenance 주석행
// / DD-15 §2.4 CSV channel — value serialization (screen truth = CellArtifact.text) + comment provenance.
// ------------------------------------------------------------
// 채널은 CellArtifact 필드만 읽는다: raw·row[field]·applyMask·Intl 직접 사용 없음(REQ-T3-803 경계).
// UTF-8 BOM + RFC4180 인용. cf/색은 CSV 표현 불가 → 매니페스트가 손실 고지(발산 아님). 스트리밍·백프레셔.
// ============================================================

import { StreamPump } from '../StreamPump.js';
import type {
  ExportResult, ExportRunCtx, HeaderArtifact, IArtifactSource, IByteSink, RowArtifact,
} from '../types.js';
import { CSV_CAPS } from './capabilities.js';

/** CSV 필드 인용(콤마/따옴표/개행 포함 시). / Quote a CSV field when needed (RFC4180). */
function csvField(v: string): string {
  if (v === '') return '';
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** CSV 채널 옵션. / CSV channel options. */
export interface CsvChannelOptions {
  /** 헤더 행 포함(기본 true). / Include header row (default true). */
  readonly includeHeader?: boolean;
  /** UTF-8 BOM 프리픽스(기본 true, Excel 한글). / Prefix UTF-8 BOM (default true). */
  readonly bom?: boolean;
  /** provenance 주석행 포함(기본 true). / Include provenance comment rows (default true). */
  readonly includeProvenance?: boolean;
  /** 값 대신 원값(rawText) 우선(값 보존 export). / Prefer rawText over display text. */
  readonly preserveRaw?: boolean;
}

/** CSV 직렬화 전략. / CSV serialization strategy. */
export class CsvChannel {
  readonly id = 'csv' as const;
  readonly capabilities = CSV_CAPS;

  constructor(private readonly opts: CsvChannelOptions = {}) {}

  async write(source: IArtifactSource, sink: IByteSink, ctx?: ExportRunCtx): Promise<ExportResult> {
    const includeHeader = this.opts.includeHeader !== false;
    const bom = this.opts.bom !== false;
    const preserveRaw = this.opts.preserveRaw === true;

    // 프리앰블: BOM + provenance 주석행 + 헤더. / Preamble: BOM + provenance comments + header.
    let preamble = bom ? '﻿' : '';
    if (this.opts.includeProvenance !== false && ctx?.provenance) {
      const block = ctx.provenance.render('csv');
      if (block.text) preamble += block.text + '\n';
    }
    if (includeHeader) {
      const header = source.projectHeader();
      const leaf: ReadonlyArray<HeaderArtifact> = header[header.length - 1] ?? [];
      preamble += leaf.map(h => csvField(h.text)).join(',') + '\n';
    }
    if (preamble) await sink.write(preamble);

    const encodeChunk = (rows: ReadonlyArray<RowArtifact>): string =>
      rows
        .map(r =>
          r.cells
            .filter(c => !c.hidden)
            .map(c => csvField(preserveRaw && c.rawText !== undefined ? c.rawText : c.text))
            .join(','),
        )
        .join('\n') + '\n';

    const pump = new StreamPump();
    return pump.pump(source.projectRows(), encodeChunk, sink, ctx, source.totalRows());
  }
}
