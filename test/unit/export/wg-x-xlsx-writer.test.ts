// ============================================================
// 엑셀 스트리밍 writer — 유효 zip·파리티·취소·진척·백프레셔
// / Streaming xlsx writer: valid zip, SheetModel parity, cancel, progress, backpressure.
// ============================================================
import { describe, it, expect } from 'vitest';
import { inflateSync, strFromU8 } from 'fflate';
import { XlsxChannel } from '../../../src/core/export/channels/XlsxChannel.js';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter.js';
import type { IByteSink, IArtifactSource, RowChunk } from '../../../src/core/export/types.js';
import { makeSource, textCol, numCol } from './_helpers.js';

/** 바이트 그대로 모으는 싱크(MemoryByteSink 는 문자열 복호화라 zip 에 부적합). */
class BytesSink implements IByteSink {
  chunks: Uint8Array[] = [];
  closed = false;
  aborted = false;
  write(chunk: Uint8Array | string): Promise<void> {
    this.chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    return Promise.resolve();
  }
  close(): Promise<void> { this.closed = true; return Promise.resolve(); }
  abort(): void { this.aborted = true; }
  get desiredSize(): number { return 1 << 30; }
  bytes(): Uint8Array {
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

/** 중앙 디렉터리(크기·CRC)를 읽는 zip 판독기 — 설치된 fflate unzipSync 는 국소 헤더 크기를 써서 데이터 설명자 zip 을 못 읽는다. */
function unzipSync(buf: Uint8Array): Record<string, Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = buf.length - 22;
  while (dv.getUint32(e, true) !== 0x06054b50) e--;
  const n = dv.getUint16(e + 10, true);
  let o = dv.getUint32(e + 16, true);
  const out: Record<string, Uint8Array> = {};
  for (let i = 0; i < n; i++) {
    expect(dv.getUint32(o, true)).toBe(0x02014b50);
    const crc = dv.getUint32(o + 16, true), cs = dv.getUint32(o + 20, true), us = dv.getUint32(o + 24, true);
    const nl = dv.getUint16(o + 28, true), off = dv.getUint32(o + 42, true);
    const name = strFromU8(buf.subarray(o + 46, o + 46 + nl));
    expect(dv.getUint32(off, true)).toBe(0x04034b50);
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = inflateSync(buf.subarray(start, start + cs));
    expect(raw.length).toBe(us);
    let c = ~0 >>> 0;
    for (const b of raw) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
    expect(~c >>> 0).toBe(crc);
    out[name] = raw;
    o += 46 + nl + dv.getUint16(o + 30, true) + dv.getUint16(o + 32, true);
  }
  return out;
}

function data(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `이름 <${i}> & "q"`, qty: i * 3 }));
}
const cols = [textCol('name', '이름'), numCol('qty', '수량')];

describe('XlsxWorkbookWriter 스트리밍', () => {
  it('유효 zip: 필수 엔트리 + 인라인 문자열/숫자셀 + 행수', async () => {
    const { source } = makeSource(data(50), cols);
    const sink = new BytesSink();
    const ch = new XlsxChannel(new XlsxWorkbookWriter());
    const res = await ch.writeStreaming(source, sink);
    expect(res.aborted).toBe(false);
    expect(res.rowsWritten).toBe(50);
    expect(sink.closed).toBe(true);
    const files = unzipSync(sink.bytes());
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      expect(files[n], n).toBeDefined();
    }
    expect(files['xl/sharedStrings.xml']).toBeUndefined();
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect((sheet.match(/<row /g) ?? []).length).toBe(51); // 머리글 + 50
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('&lt;3&gt; &amp; &quot;q&quot;');
    expect(sheet).toMatch(/<c r="B3" s="\d+" t="n"><v>3<\/v><\/c>/);
  });

  it('파리티: 스트리밍 산출 셀 값 == buildModel SheetModel', async () => {
    const { source } = makeSource(data(20), cols);
    const ch = new XlsxChannel(new XlsxWorkbookWriter());
    const model = await ch.buildModel(source);
    const sink = new BytesSink();
    await ch.writeStreaming(source, sink);
    const sheet = strFromU8(unzipSync(sink.bytes())['xl/worksheets/sheet1.xml']);
    const rows = sheet.split('<row ').slice(1);
    model.rows.forEach((r, ri) => {
      r.forEach((cell, ci) => {
        const col = String.fromCharCode(65 + ci);
        const m = new RegExp(`<c r="${col}${ri + 2}"[^>]*>(.*?)</c>`).exec(rows[ri + 1]!);
        expect(m, `${col}${ri + 2}`).not.toBeNull();
        if (cell.num !== undefined) expect(m![1]).toBe(`<v>${cell.num}</v>`);
        else {
          const t = />([^<]*)<\/t>/.exec(m![1]!)![1]!
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          expect(t).toBe(cell.value);
        }
      });
    });
  });

  it('write(SheetModel) 경로도 같은 zip 산출', async () => {
    const { source } = makeSource(data(5), cols);
    const w = new XlsxWorkbookWriter();
    const model = await new XlsxChannel(w).buildModel(source);
    const sink = new BytesSink();
    const n = await w.write(model, sink);
    expect(n).toBe(sink.bytes().length);
    expect(strFromU8(unzipSync(sink.bytes())['xl/worksheets/sheet1.xml'])).toContain('<row ');
  });

  it('진척: 단조 증가, 마지막 done==total', async () => {
    const { source } = makeSource(data(95), cols);
    const seen: Array<[number, number]> = [];
    await new XlsxChannel(new XlsxWorkbookWriter()).writeStreaming(
      source, new BytesSink(), { onProgress: (d, t) => seen.push([d, t]) },
    );
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThanOrEqual(seen[i - 1]![0]);
    expect(seen[seen.length - 1]).toEqual([95, 95]);
  });

  /** 청크 3개로 쪼갠 가짜 소스(소비 지점 관찰). */
  function chunked(src: IArtifactSource, pulled: number[]): IArtifactSource {
    return {
      projectHeader: o => src.projectHeader(o),
      totalRows: r => src.totalRows(r),
      dataState: () => src.dataState(),
      projectRows: async function* (o) {
        let i = 0;
        for await (const c of src.projectRows({ ...o, chunkSize: 10 })) {
          pulled.push(i++);
          yield c as RowChunk;
        }
      },
    };
  }

  it('취소: 중간 abort → aborted:true + sink.abort', async () => {
    const { source } = makeSource(data(100), cols);
    const ac = new AbortController();
    const sink = new BytesSink();
    const res = await new XlsxChannel(new XlsxWorkbookWriter()).writeStreaming(
      chunked(source, []), sink,
      { signal: ac.signal, onProgress: d => { if (d >= 20) ac.abort(); } },
    );
    expect(res.aborted).toBe(true);
    expect(res.rowsWritten).toBeLessThan(100);
    expect(sink.aborted).toBe(true);
    expect(sink.closed).toBe(false);
  });

  it('백프레셔: desiredSize<=0 sink 의 write 가 풀리기 전엔 생산이 멈춘다', async () => {
    const { source } = makeSource(data(100), cols);
    const pulled: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    let writes = 0;
    const sink: IByteSink = {
      write: () => { writes++; return gate; },
      close: () => Promise.resolve(),
      abort: () => {},
      get desiredSize() { return -1; },
    };
    // level 0 = stored → 청크 즉시 방출(압축 지연 없음).
    const p = new XlsxChannel(new XlsxWorkbookWriter({ level: 0 })).writeStreaming(chunked(source, pulled), sink);
    await new Promise(r => setTimeout(r, 30));
    const stalledPulled = pulled.length;
    expect(writes).toBeGreaterThan(0);
    expect(stalledPulled).toBeLessThan(10);
    await new Promise(r => setTimeout(r, 30));
    expect(pulled.length).toBe(stalledPulled); // 정지 유지
    release();
    const res = await p;
    expect(res.rowsWritten).toBe(100);
    expect(pulled.length).toBeGreaterThanOrEqual(10);
  });

  it('대량·임의 청크 분할에도 스트림이 유효(자체 deflate 왕복) + 압축됨 + 제어문자 제거', async () => {
    for (const level of [0, 1, 6] as const) {
      for (const batch of [1, 37, 5000]) {
        const w = new XlsxWorkbookWriter({ level });
        const sink = new BytesSink();
        const s = await w.openStream({ sheetName: 'S', header: ['a', 'b'], colWidthsPx: [90, 90] }, sink);
        let seed = 7;
        const all: any[] = [];
        for (let i = 0; i < 20000; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          all.push([
            { value: 'k' + (seed % 977) + 'é한', align: 'left', rowSpan: 1, colSpan: 1 },
            { value: String(seed), num: seed, align: 'right', rowSpan: 1, colSpan: 1 },
          ]);
        }
        for (let o = 0; o < all.length; o += batch) await s.appendRows(all.slice(o, o + batch));
        const total = await s.finish();
        const sheet = strFromU8(unzipSync(sink.bytes())['xl/worksheets/sheet1.xml']);
        expect((sheet.match(/<row /g) ?? []).length).toBe(20001);
        expect(sheet).not.toMatch(/[]/);
        expect(sheet).toContain('é한');
        expect(total).toBe(sink.bytes().length);
        if (level >= 1 && batch === 5000) expect(total).toBeLessThan(sheet.length / 2);
      }
    }
  });

  it('writer 가 스트리밍 미지원이면 writeStreaming 은 명시적 오류', async () => {
    const { source } = makeSource(data(1), cols);
    const ch = new XlsxChannel({ write: async () => 0 });
    await expect(ch.writeStreaming(source, new BytesSink())).rejects.toThrow();
  });
});
