// ============================================================
// fflate 기반 스트리밍 writer 왕복 시험 — fflate unzipSync(ZIP 무결성·CRC) + SheetJS(독립 파서) 로 읽는다.
// / Round-trip tests for the fflate-based streaming writer: unzipSync (ZIP integrity/CRC) + SheetJS (independent parser).
// ============================================================
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter.js';
import type { IByteSink } from '../../../src/core/export/types.js';

class BytesSink implements IByteSink {
  chunks: Uint8Array[] = [];
  aborted = false;
  failAfter = Infinity;
  write(c: Uint8Array | string): Promise<void> {
    if (this.chunks.length >= this.failAfter) return Promise.reject(new Error('sink-fail'));
    this.chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
    return Promise.resolve();
  }
  close(): Promise<void> { return Promise.resolve(); }
  abort(): void { this.aborted = true; }
  get desiredSize(): number { return 1 << 30; }
  bytes(): Uint8Array {
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(n); let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

const cell = (value: string, num?: number) =>
  ({ value, num, align: (num !== undefined ? 'right' : 'left') as 'left' | 'right', rowSpan: 1, colSpan: 1 });
type Row = Array<ReturnType<typeof cell>>;

async function build(level: number | undefined, rows: Row[], header: string[], step = 500, sink = new BytesSink()) {
  const w = new XlsxWorkbookWriter(level === undefined ? {} : { level: level as any });
  const s = await w.openStream({ sheetName: 'Sheet1', header, colWidthsPx: header.map(() => 90) }, sink);
  for (let o = 0; o < rows.length; o += step) await s.appendRows(rows.slice(o, o + step));
  const total = await s.finish();
  return { bytes: sink.bytes(), total };
}

const read = (bytes: Uint8Array) => {
  const wb = XLSX.read(bytes, { type: 'array' });
  return XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true });
};

describe('fflate writer 왕복', () => {
  it('한글·큰 수(1e21)·200자 한 행이 unzipSync + SheetJS 로 왕복된다', async () => {
    const rows: Row[] = [[cell('안녕하세요'), cell('1e21', 1e21), cell('가'.repeat(200))]];
    const { bytes, total } = await build(6, rows, ['이름', '값', '긴글']);
    expect(total).toBe(bytes.length);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('xl/worksheets/sheet1.xml');
    expect(Object.keys(files)).toContain('[Content_Types].xml');
    const aoa = read(bytes);
    expect(aoa[0]).toEqual(['이름', '값', '긴글']);
    expect(aoa[1]![0]).toBe('안녕하세요');
    expect(aoa[1]![1]).toBe(1e21);
    expect(aoa[1]![2]).toBe('가'.repeat(200));
  });

  it('5,000행 다중 청크가 전부 읽힌다', async () => {
    const rows: Row[] = Array.from({ length: 5000 }, (_, i) => [cell('행' + i), cell(String(i), i)]);
    const { bytes } = await build(6, rows, ['a', 'b'], 700);
    const aoa = read(bytes);
    expect(aoa.length).toBe(5001);
    expect(aoa[5000]![0]).toBe('행4999');
    expect(aoa[5000]![1]).toBe(4999);
  });

  it('0행·1행 시트도 유효하다', async () => {
    expect(read((await build(6, [], ['a', 'b'])).bytes)[0]).toEqual(['a', 'b']);
    const one = read((await build(6, [[cell('x'), cell('7', 7)]], ['a', 'b'])).bytes);
    expect(one.length).toBe(2);
    expect(one[1]).toEqual(['x', 7]);
  });

  it('수준 0 > 6 > 9 순으로 바이트 수가 줄고 모두 유효하다', async () => {
    const rows: Row[] = Array.from({ length: 3000 }, (_, i) => [cell('고객 ' + (i % 50)), cell(String(i * 3), i * 3), cell('서울시 강남구 테헤란로 ' + (i % 20))]);
    const sizes: number[] = [];
    for (const lv of [0, 6, 9]) {
      const { bytes } = await build(lv, rows, ['a', 'b', 'c']);
      expect(read(bytes).length).toBe(3001);
      sizes.push(bytes.length);
    }
    expect(sizes[0]!).toBeGreaterThan(sizes[1]!);
    expect(sizes[1]!).toBeGreaterThanOrEqual(sizes[2]!);
  });

  it('범위 밖 수준은 6 과 같은 바이트를 낸다', async () => {
    const rows: Row[] = Array.from({ length: 300 }, (_, i) => [cell('v' + i), cell(String(i), i)]);
    const six = (await build(6, rows, ['a', 'b'])).bytes;
    for (const bad of [-1, 10, 3.5, Number.NaN]) {
      expect((await build(bad, rows, ['a', 'b'])).bytes).toEqual(six);
    }
    expect((await build(undefined, rows, ['a', 'b'])).bytes).toEqual(six);
  });

  it('sink 쓰기 실패가 appendRows 에서 전파된다', async () => {
    const sink = new BytesSink(); sink.failAfter = 7;
    const w = new XlsxWorkbookWriter({});
    await expect((async () => {
      const s = await w.openStream({ sheetName: 'S', header: ['a'], colWidthsPx: [90] }, sink);
      await s.appendRows([[cell('x')]]);
    })()).rejects.toThrow('sink-fail');
  });

  it('abort 후 finish 없이도 예외 없이 끝난다', async () => {
    const sink = new BytesSink();
    const s = await new XlsxWorkbookWriter({}).openStream({ sheetName: 'S', header: ['a'], colWidthsPx: [90] }, sink);
    await s.appendRows([[cell('x')]]);
    expect(() => s.abort()).not.toThrow();
  });
});
