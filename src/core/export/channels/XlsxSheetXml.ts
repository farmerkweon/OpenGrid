// ============================================================
// 시트 XML 조립기 — 머리·행·꼬리 문자열만 만든다(ZIP·압축과 무관, 순수). 스타일 번호는 주입받은 등록소로 얻는다.
// / Sheet XML builder: produces head / row / tail strings only (no ZIP, no compression). Style indexes come from an injected registry.
// ============================================================

import type { MergeRegion, SheetCell, XlsxStreamInit } from './XlsxChannel.js';
import type { XlsxCellStyleSpec, XlsxRichTextRun } from '../types.js';
import type { StylesRegistry } from './XlsxStylesRegistry.js';
import { STRIPE_RGB } from './XlsxStylesRegistry.js';
import { RichTextRunEntry } from './XlsxRichTextRun.js';
import { NS, XML_HEAD, colName, xmlEscape } from './XlsxXml.js';

/** 스타일 번호(등록소 미리 등록분과 일치). / Style indexes (match the registry's pre-registered ones). */
const S_DEFAULT = 0;
const S_HEADER = 1;
const S_STRIPE = 2;

/** 시트 XML 조립기. / Sheet XML builder. */
export class SheetXmlBuilder {
  private nextRow: number;
  private readonly merges: MergeRegion[] = [];
  private readonly writeHeader: boolean;

  constructor(private readonly init: XlsxStreamInit, private readonly styles: StylesRegistry) {
    this.writeHeader = init.header.length > 0 && init.includeHeader !== false;
    this.nextRow = this.writeHeader ? 2 : 1; // 1-base 시트 행 번호. / 1-based sheet row number.
  }

  /** 시트 머리(열 너비·머리글 행 포함). / Sheet head (column widths + header row). */
  head(): string {
    const { init } = this;
    let s = XML_HEAD + `<worksheet xmlns="${NS}">`;
    if (init.colWidthsPx.length > 0) {
      s += '<cols>' + init.colWidthsPx.map((w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.round((w / 7) * 100) / 100)}" customWidth="1"/>`,
      ).join('') + '</cols>';
    }
    s += '<sheetData>';
    if (this.writeHeader) {
      s += '<row r="1">' + init.header.map((h, i) => cellXml(`${colName(i)}1`, S_HEADER, undefined, h)).join('') + '</row>';
    }
    return s;
  }

  /** 행 청크 → XML(빈 청크면 빈 문자열). / Row chunk → XML (empty string for an empty chunk). */
  rows(rows: ReadonlyArray<ReadonlyArray<SheetCell>>, rowMerges?: ReadonlyArray<MergeRegion>): string {
    let xml = '';
    for (const cells of rows) {
      const stripe = this.nextRow % 2 === 1 ? S_STRIPE : S_DEFAULT; // 데이터 둘째 줄마다. / every other data row
      xml += `<row r="${this.nextRow}">`;
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c]!;
        xml += cellXml(`${colName(c)}${this.nextRow}`, this.styleIndex(cell, stripe), cell.num, cell.value, cell.runs);
      }
      xml += '</row>';
      this.nextRow++;
    }
    if (rowMerges) for (const m of rowMerges) this.merges.push(m);
    return xml;
  }

  /** 시트 꼬리(병합 영역 포함). / Sheet tail (with merge regions). */
  tail(): string {
    let s = '</sheetData>';
    if (this.merges.length > 0) {
      s += `<mergeCells count="${this.merges.length}">` + this.merges.map(m =>
        `<mergeCell ref="${colName(m.c)}${m.r + 1}:${colName(m.c + m.cs - 1)}${m.r + m.rs}"/>`,
      ).join('') + '</mergeCells>';
    }
    return s + '</worksheet>';
  }

  /** 셀 → 스타일 번호(미리 준 번호 > 명세 > 색 필드 > 줄무늬). / Cell → style index. */
  private styleIndex(cell: SheetCell, stripe: number): number {
    if (cell.s !== undefined) return cell.s;
    let spec: XlsxCellStyleSpec | undefined = cell.style;
    if (!spec && cell.fill) {
      spec = cell.ink ? { fill: { rgb: cell.fill }, font: { color: { rgb: cell.ink } } } : { fill: { rgb: cell.fill } };
    }
    if (!spec) return stripe;
    if (!spec.fill && stripe === S_STRIPE) spec = { ...spec, fill: { rgb: STRIPE_RGB } }; // 줄무늬 위에 얹는다. / layer over the stripe
    return this.styles.add(spec);
  }
}

function cellXml(ref: string, s: number, num: number | undefined, text: string, runs?: ReadonlyArray<XlsxRichTextRun>): string {
  const st = s === S_DEFAULT ? '' : ` s="${s}"`;
  if (num !== undefined) return `<c r="${ref}"${st} t="n"><v>${num}</v></c>`;
  if (runs && runs.length > 0) {
    const entries = RichTextRunEntry.fromAll(runs);
    if (entries.length > 0) return `<c r="${ref}"${st} t="inlineStr"><is>${entries.map(e => e.toXml()).join('')}</is></c>`;
  }
  if (text === '') return `<c r="${ref}"${st}/>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}
