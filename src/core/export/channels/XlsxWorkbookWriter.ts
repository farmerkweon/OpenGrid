// ============================================================
// 스트리밍 .xlsx 쓰기기 — 자체 증분 Deflate + 자체 ZIP 프레이밍 + 인라인 문자열 + 고정 styles
// / Streaming .xlsx writer — own incremental Deflate + own ZIP framing + inline strings + fixed styles.
// ------------------------------------------------------------
// 전 행을 메모리에 쌓지 않는다: 시트 XML 을 행 청크 단위로 ZIP 엔트리에 밀어 넣고, 나오는 바이트를 즉시
// sink 로 흘린다(sink.write 를 await = 백프레셔). 이름표(sharedStrings)를 쓰지 않고 셀마다 인라인 문자열.
// 스타일은 작은 고정 styles.xml 의 s= 인덱스(머리글·줄무늬)만 참조 — 셀별 스타일 객체 없음.
// 설치된 fflate(0.3.x)에는 스트리밍 Zip 이 없고 스트리밍 Deflate 는 청크 분할 시 깨진 스트림을 낸다(실측).
// 그래서 ZIP 컨테이너(국소 헤더·데이터 설명자·중앙 디렉터리)와 증분 deflate 를 여기서 직접 쓴다.
// 4GB 이상 항목(ZIP64)은 지원하지 않는다. 이 모듈 전체가 지연 청크 — 코어 번들엔 넣지 말고 동적 import 할 것.
// ============================================================

import type { IByteSink } from '../types.js';
import type {
  IStreamingWorkbookWriter, IXlsxStreamSession, MergeRegion, SheetCell, SheetModel, XlsxStreamInit,
} from './XlsxChannel.js';

/** 쓰기기 옵션. / Writer options. */
export interface XlsxWorkbookWriterOptions {
  /** deflate 수준(0 = 저장만, 기본 6). / Deflate level (0 = stored; default 6). */
  readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

const ENC = new TextEncoder();

/** ZIP 고정 시각(2026-01-01 00:00, 재현 가능한 바이트). / Fixed DOS timestamp for reproducible bytes. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

let CRC_TABLE: Uint32Array | undefined;
/** 증분 CRC-32. / Incremental CRC-32. */
function crc32(data: Uint8Array, prev: number): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = ~prev >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xFF]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** 스타일 인덱스(styles.xml 과 일치). / Style indexes (match styles.xml). */
const S_DEFAULT = 0;
const S_HEADER = 1;
const S_STRIPE = 2;


// ─────────────────────────────────────────────────────────────
// 증분 raw deflate — 고정 허프만 + 해시 LZ77. 청크마다 sync flush(빈 저장 블록)로 바이트 정렬하므로
// 청크를 어떻게 쪼개 밀어도 이어 붙인 스트림이 유효하다(설치된 fflate 0.3.x 스트리밍 Deflate 는 그렇지 않음).
// / Incremental raw deflate: fixed Huffman + hash LZ77, byte-aligned per chunk via sync flush.
// ─────────────────────────────────────────────────────────────
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
  4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const PIECE = 65536; // 한 고정 블록이 덮는 입력 크기(창 = 블록 안). / input bytes per fixed block.
const HASH_BITS = 15;

let LIT_CODE: Uint16Array | undefined; // 비트 뒤집힌 코드. / bit-reversed codes
let LIT_LEN: Uint8Array | undefined;
let LEN_IDX: Uint8Array | undefined;
let DIST_IDX: Uint8Array | undefined;

function rev(code: number, n: number): number {
  let r = 0;
  for (let i = 0; i < n; i++) { r = (r << 1) | (code & 1); code >>= 1; }
  return r;
}

function initTables(): void {
  if (LIT_CODE) return;
  const lc = new Uint16Array(288); const ll = new Uint8Array(288);
  for (let v = 0; v < 288; v++) {
    let code: number; let n: number;
    if (v < 144) { code = 0x30 + v; n = 8; } else if (v < 256) { code = 0x190 + (v - 144); n = 9; }
    else if (v < 280) { code = v - 256; n = 7; } else { code = 0xC0 + (v - 280); n = 8; }
    lc[v] = rev(code, n); ll[v] = n;
  }
  const li = new Uint8Array(259);
  for (let l = 3; l <= 258; l++) { let i = 28; while (LEN_BASE[i]! > l) i--; li[l] = i; }
  const di = new Uint8Array(32769);
  for (let d = 1; d <= 32768; d++) { let i = 29; while (DIST_BASE[i]! > d) i--; di[d] = i; }
  LIT_LEN = ll; LEN_IDX = li; DIST_IDX = di; LIT_CODE = lc;
}

/** 입력 청크 → 바이트 정렬된 deflate 조각(마지막 빈 블록은 finishDeflate). / Chunk → byte-aligned deflate bytes. */
function deflateChunk(data: Uint8Array, level: number): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);
  if (level === 0) return storedBlocks(data);
  initTables();
  const lc = LIT_CODE!; const ll = LIT_LEN!; const li = LEN_IDX!; const di = DIST_IDX!;
  const maxChain = level >= 6 ? 24 : level >= 3 ? 8 : 3;
  let out = new Uint8Array(Math.ceil(data.length * 1.2) + 64);
  let op = 0; let acc = 0; let nb = 0;
  const put = (v: number, n: number): void => {
    acc |= v << nb; nb += n;
    while (nb >= 8) { out[op++] = acc & 255; acc >>>= 8; nb -= 8; }
  };
  const head = new Int32Array(1 << HASH_BITS);
  const prev = new Int32Array(PIECE);
  for (let base = 0; base < data.length; base += PIECE) {
    const end = Math.min(base + PIECE, data.length);
    if (op + (end - base) * 1.2 + 64 > out.length) {
      const bigger = new Uint8Array(Math.ceil(out.length * 1.5) + (end - base) * 2); bigger.set(out); out = bigger;
    }
    head.fill(-1);
    put(0, 1); put(1, 2); // BFINAL=0, BTYPE=01
    let i = base;
    while (i < end) {
      let bestLen = 0; let bestDist = 0;
      if (i + 2 < end) {
        const h = ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & ((1 << HASH_BITS) - 1);
        let cand = head[h]!; let chain = maxChain;
        const maxL = Math.min(258, end - i);
        while (cand >= 0 && chain-- > 0 && i - cand <= 32768) {
          let l = 0;
          while (l < maxL && data[cand + l] === data[i + l]) l++;
          if (l > bestLen) { bestLen = l; bestDist = i - cand; if (l === maxL) break; }
          cand = prev[cand - base]!;
        }
        prev[i - base] = head[h]!; head[h] = i;
      }
      if (bestLen >= 3) {
        const lcIdx = li[bestLen]!; const sym = 257 + lcIdx;
        put(lc[sym]!, ll[sym]!);
        if (LEN_EXTRA[lcIdx]! > 0) put(bestLen - LEN_BASE[lcIdx]!, LEN_EXTRA[lcIdx]!);
        const dIdx = di[bestDist]!;
        put(rev(dIdx, 5), 5);
        if (DIST_EXTRA[dIdx]! > 0) put(bestDist - DIST_BASE[dIdx]!, DIST_EXTRA[dIdx]!);
        // 매치 안쪽 위치도 해시에 등록. / index positions inside the match
        const stop = i + bestLen;
        i++;
        while (i < stop) {
          if (i + 2 < end) {
            const h2 = ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & ((1 << HASH_BITS) - 1);
            prev[i - base] = head[h2]!; head[h2] = i;
          }
          i++;
        }
      } else {
        const b = data[i]!;
        put(lc[b]!, ll[b]!);
        i++;
      }
    }
    put(lc[256]!, ll[256]!); // 블록 끝. / end of block
  }
  // sync flush: 빈 저장 블록(BFINAL=0,BTYPE=00) → 바이트 정렬. / empty stored block to byte-align
  put(0, 3);
  if (nb > 0) { out[op++] = acc & 255; acc = 0; nb = 0; }
  out[op++] = 0; out[op++] = 0; out[op++] = 255; out[op++] = 255;
  return out.slice(0, op);
}

/** level 0: 저장 블록(압축 없음). / level 0: stored blocks. */
function storedBlocks(data: Uint8Array): Uint8Array {
  const n = Math.ceil(data.length / 65535);
  const out = new Uint8Array(data.length + n * 5);
  let op = 0;
  for (let o = 0; o < data.length; o += 65535) {
    const l = Math.min(65535, data.length - o);
    out[op++] = 0; out[op++] = l & 255; out[op++] = l >> 8; out[op++] = ~l & 255; out[op++] = (~l >> 8) & 255;
    out.set(data.subarray(o, o + l), op); op += l;
  }
  return out;
}

/** 스트림 끝: 빈 최종 고정 블록. / Stream end: empty final fixed block. */
const DEFLATE_END = new Uint8Array([0x03, 0x00]);

/** XML 에서 허용되지 않는 제어문자 제거 + 특수문자 이스케이프. / Strip illegal control chars + escape. */
export function xmlEscape(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 0-base 열 → A, B, … AA. / 0-based column → letters. */
function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

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

const STYLES = XML_HEAD +
  `<styleSheet xmlns="${NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F7FA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function workbookXml(sheetName: string): string {
  // 시트명: 31자·금지문자([]:*?/\) 제한. / Sheet name limits.
  const name = xmlEscape(sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1');
  return XML_HEAD +
    `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function cellXml(ref: string, s: number, num: number | undefined, text: string): string {
  const st = s === S_DEFAULT ? '' : ` s="${s}"`;
  if (num !== undefined) return `<c r="${ref}"${st} t="n"><v>${num}</v></c>`;
  if (text === '') return `<c r="${ref}"${st}/>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
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
    const level = this.opts.level ?? 6;
    const pending: Uint8Array[] = [];
    let total = 0;
    const emit = (c: Uint8Array): void => { pending.push(c); total += c.length; };

    // 백프레셔: 쌓인 출력 바이트를 순서대로 await write. / Drain emitted bytes with awaited writes.
    const flush = async (): Promise<void> => {
      while (pending.length > 0) await sink.write(pending.shift()!);
    };

    interface Entry { nameBytes: Uint8Array; offset: number; crc: number; csize: number; usize: number }
    const entries: Entry[] = [];
    const mk = (name: string) => {
      const nameBytes = ENC.encode(name);
      const e: Entry = { nameBytes, offset: total, crc: 0, csize: 0, usize: 0 };
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0008, true);
      h.setUint16(8, 8, true); h.setUint16(10, DOS_TIME, true); h.setUint16(12, DOS_DATE, true);
      h.setUint16(26, nameBytes.length, true);
      emit(new Uint8Array(h.buffer)); emit(nameBytes);
      entries.push(e);
      return {
        push(data: Uint8Array, final: boolean): void {
          e.crc = crc32(data, e.crc); e.usize += data.length;
          if (e.usize > 0xFFFFFFFF || total > 0xFFFFFFFF) throw new Error('xlsx too large (ZIP64 unsupported)');
          const z = deflateChunk(data, level);
          if (z.length > 0) { e.csize += z.length; emit(z); }
          if (final) {
            e.csize += DEFLATE_END.length; emit(DEFLATE_END);
            const dd = new DataView(new ArrayBuffer(16));
            dd.setUint32(0, 0x08074b50, true); dd.setUint32(4, e.crc, true);
            dd.setUint32(8, e.csize, true); dd.setUint32(12, e.usize, true);
            emit(new Uint8Array(dd.buffer));
          }
        },
      };
    };
    const zip = {
      end(): void {
        const cdStart = total;
        for (const e of entries) {
          const c = new DataView(new ArrayBuffer(46));
          c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
          c.setUint16(8, 0x0008, true); c.setUint16(10, 8, true);
          c.setUint16(12, DOS_TIME, true); c.setUint16(14, DOS_DATE, true);
          c.setUint32(16, e.crc, true); c.setUint32(20, e.csize, true); c.setUint32(24, e.usize, true);
          c.setUint16(28, e.nameBytes.length, true); c.setUint32(42, e.offset, true);
          emit(new Uint8Array(c.buffer)); emit(e.nameBytes);
        }
        // push 이후 중앙디렉터리가 더해져 4GB 를 넘으면 setUint32 가 조용히 절삭 — 명시 오류. / explicit error instead of silent truncation.
        if (cdStart > 0xFFFFFFFF || total + 22 > 0xFFFFFFFF) throw new Error('xlsx too large (ZIP64 unsupported)');
        const eo = new DataView(new ArrayBuffer(22));
        eo.setUint32(0, 0x06054b50, true);
        eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
        eo.setUint32(12, total - cdStart, true); eo.setUint32(16, cdStart, true);
        emit(new Uint8Array(eo.buffer));
      },
    };
    const putSmall = async (name: string, xml: string): Promise<void> => {
      mk(name).push(ENC.encode(xml), true);
      await flush();
    };

    await putSmall('[Content_Types].xml', CONTENT_TYPES);
    await putSmall('_rels/.rels', ROOT_RELS);
    await putSmall('xl/workbook.xml', workbookXml(init.sheetName));
    await putSmall('xl/_rels/workbook.xml.rels', WB_RELS);
    await putSmall('xl/styles.xml', STYLES);

    const sheet = mk('xl/worksheets/sheet1.xml');
    const colCount = init.header.length;
    let head = XML_HEAD + `<worksheet xmlns="${NS}">`;
    if (init.colWidthsPx.length > 0) {
      head += '<cols>' + init.colWidthsPx.map((w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.round((w / 7) * 100) / 100)}" customWidth="1"/>`,
      ).join('') + '</cols>';
    }
    head += '<sheetData>';
    const writeHeader = colCount > 0 && init.includeHeader !== false;
    if (writeHeader) {
      head += '<row r="1">' + init.header.map((h, i) => cellXml(`${colName(i)}1`, S_HEADER, undefined, h)).join('') + '</row>';
    }
    sheet.push(ENC.encode(head), false);
    await flush();

    let nextRow = writeHeader ? 2 : 1; // 1-base 시트 행 번호. / 1-based sheet row number.
    const merges: MergeRegion[] = [];
    let ended = false;

    return {
      appendRows: async (rows, rowMerges) => {
        let xml = '';
        for (const cells of rows) {
          const stripe = nextRow % 2 === 1 ? S_STRIPE : S_DEFAULT; // 데이터 둘째 줄마다. / every other data row
          xml += `<row r="${nextRow}">`;
          for (let c = 0; c < cells.length; c++) {
            const cell: SheetCell = cells[c]!;
            xml += cellXml(`${colName(c)}${nextRow}`, stripe, cell.num, cell.value);
          }
          xml += '</row>';
          nextRow++;
        }
        if (rowMerges) for (const m of rowMerges) merges.push(m);
        if (xml !== '') sheet.push(ENC.encode(xml), false);
        await flush();
      },
      finish: async () => {
        let tail = '</sheetData>';
        if (merges.length > 0) {
          tail += `<mergeCells count="${merges.length}">` + merges.map(m =>
            `<mergeCell ref="${colName(m.c)}${m.r + 1}:${colName(m.c + m.cs - 1)}${m.r + m.rs}"/>`,
          ).join('') + '</mergeCells>';
        }
        tail += '</worksheet>';
        sheet.push(ENC.encode(tail), true);
        zip.end();
        ended = true;
        await flush();
        return total;
      },
      abort: () => {
        if (!ended) { ended = true; /* 이후 쓰기 없음 */ }
        pending.length = 0;
      },
    };
  }
}
