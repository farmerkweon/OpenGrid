// ============================================================
// 대조군(총괄) — 자체 판독기가 아니라 독립 파서 SheetJS(xlsx)로 writer 산출물을 읽어
// 「실제로 열리는 .xlsx 인가」를 검증한다. (검증엔 대조군을 둔다)
// / Control group: parse the streaming writer's output with an INDEPENDENT reader (SheetJS),
//   not the writer's own zip reader, to prove the file really opens.
// ============================================================
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter.js';
import type { IByteSink } from '../../../src/core/export/types.js';

class BytesSink implements IByteSink {
  chunks: Uint8Array[] = [];
  closed = false; aborted = false;
  write(c: Uint8Array | string): Promise<void> {
    this.chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
    return Promise.resolve();
  }
  close(): Promise<void> { this.closed = true; return Promise.resolve(); }
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

async function build(level: 0 | 1 | 6, rows: Array<Array<ReturnType<typeof cell>>>, header: string[]) {
  const w = new XlsxWorkbookWriter({ level });
  const sink = new BytesSink();
  const s = await w.openStream({ sheetName: 'Sheet1', header, colWidthsPx: header.map(() => 90) }, sink);
  // 여러 청크로 쪼개 append(청크 경계 deflate 무결성 포함)
  for (let o = 0; o < rows.length; o += 37) await s.appendRows(rows.slice(o, o + 37));
  await s.finish();
  return sink.bytes();
}

describe('대조군: SheetJS(독립 파서)가 스트리밍 writer 산출물을 읽는다', () => {
  for (const level of [0, 1, 6] as const) {
    it(`level ${level}: 한글·특수문자·숫자 셀이 SheetJS 로 왕복된다`, async () => {
      const header = ['이름', '수량', '비고'];
      const input = [
        [cell('가나다 <a> & "q"'), cell('10', 10), cell('line1')],
        [cell('éàü 한글 émix'), cell('0', 0), cell('공백  유지')],
        [cell('x'.repeat(300)), cell('-42', -42), cell('탭\t제거확인')],
      ];
      const bytes = await build(level, input, header);

      // 독립 파서로 읽기
      const wb = XLSX.read(bytes, { type: 'array' });
      expect(wb.SheetNames.length).toBe(1);
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });

      // 머리글
      expect(aoa[0]).toEqual(header);
      // 값 왕복(문자열은 제어문자 제거 반영)
      expect(aoa[1]![0]).toBe('가나다 <a> & "q"');
      expect(aoa[1]![1]).toBe(10);
      expect(aoa[2]![0]).toBe('éàü 한글 émix');
      expect(aoa[2]![1]).toBe(0);
      expect(aoa[3]![0]).toBe('x'.repeat(300));
      expect(aoa[3]![1]).toBe(-42);
      // 숫자 셀은 숫자 타입으로 읽혀야 함
      expect(typeof aoa[1]![1]).toBe('number');
    });
  }

  it('여러 청크(대량)도 SheetJS 로 전부 읽힌다 — 청크 경계 무결성', async () => {
    const header = ['a', 'b'];
    const N = 5000;
    const input = Array.from({ length: N }, (_, i) => [cell('행' + i + '_값'), cell(String(i), i)]);
    const bytes = await build(6, input, header);
    const wb = XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });
    expect(aoa.length).toBe(N + 1); // 머리글 + N
    expect(aoa[1]![0]).toBe('행0_값');
    expect(aoa[N]![0]).toBe('행' + (N - 1) + '_값');
    expect(aoa[N]![1]).toBe(N - 1);
  });
});
