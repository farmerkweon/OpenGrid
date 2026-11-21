// @vitest-environment jsdom
// 셀 안 서식 조각(rich text runs) — 쓰기기·값 객체·ExportManager 배선. 값은 SheetJS(독립 파서), 조각 서식은 OOXML 직접 확인.
// / Rich-text runs: writer, value object and ExportManager wiring. Values via SheetJS, per-run font via OOXML (community SheetJS hides fonts).
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter.js';
import { RichTextRunEntry } from '../../../src/core/export/channels/XlsxRichTextRun.js';
import { ExportManager } from '../../../src/core/ExportManager';
import { XlsxChannel } from '../../../src/core/export/channels/XlsxChannel';
import type { IByteSink, XlsxRichTextRun } from '../../../src/core/export/types.js';

class BytesSink implements IByteSink {
  chunks: Uint8Array[] = [];
  write(c: Uint8Array | string): Promise<void> { this.chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c); return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
  abort(): void { /* 없음 */ }
  get desiredSize(): number { return 1 << 30; }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.chunks.reduce((a, c) => a + c.length, 0)); let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

type C = { value: string; num?: number; align: 'left'; rowSpan: number; colSpan: number; runs?: XlsxRichTextRun[] };
const cell = (value: string, runs?: XlsxRichTextRun[]): C => ({ value, align: 'left', rowSpan: 1, colSpan: 1, ...(runs ? { runs } : {}) });

async function build(rows: C[][], header: string[]) {
  const sink = new BytesSink();
  const s = await new XlsxWorkbookWriter({}).openStream({ sheetName: 'S', header, colWidthsPx: header.map(() => 90) }, sink);
  await s.appendRows(rows);
  await s.finish();
  return sink.bytes();
}
const sheetXml = (b: Uint8Array) => strFromU8(unzipSync(b)['xl/worksheets/sheet1.xml']!);
/** 셀의 <r> 조각들을 {text,rgb,bold} 로 푼다. / Parse a cell's <r> runs. */
function runsOf(b: Uint8Array, ref: string): Array<{ text: string; rgb?: string; bold: boolean }> {
  const cx = new RegExp('<c r="' + ref + '"[^>]*>([\\s\\S]*?)</c>').exec(sheetXml(b))![1]!;
  return (cx.match(/<r>[\s\S]*?<\/r>/g) ?? []).map(r => ({
    text: /<t[^>]*>([\s\S]*?)<\/t>/.exec(r)![1]!,
    rgb: /<color rgb="([0-9A-F]{8})"/.exec(r)?.[1],
    bold: r.includes('<b/>'),
  }));
}

describe('RichTextRunEntry', () => {
  it('빈 글자는 버리고, 서식 없는 조각은 rPr 없이, 있는 조각은 rPr 와 함께 쓴다', () => {
    expect(RichTextRunEntry.from({ text: '' })).toBeUndefined();
    expect(RichTextRunEntry.from({ text: '가' })!.toXml()).toBe('<r><t xml:space="preserve">가</t></r>');
    const x = RichTextRunEntry.from({ text: 'a<b', style: { color: { rgb: '#c62828' }, bold: true, size: 12 } })!.toXml();
    expect(x).toBe('<r><rPr><rFont val="Calibri"/><b/><color rgb="FFC62828"/><sz val="12"/></rPr><t xml:space="preserve">a&lt;b</t></r>');
    expect(RichTextRunEntry.fromAll([{ text: '' }, { text: 'x' }]).length).toBe(1);
  });
});

describe('rich text 셀 왕복', () => {
  it('한 셀 3조각(색 다름·굵게 섞음): 연결 문자열 · 조각별 색·굵기', async () => {
    const runs: XlsxRichTextRun[] = [
      { text: '앞 ' }, { text: '바람', style: { color: { rgb: 'FFC62828' }, bold: true } },
      { text: ' 사이 ' }, { text: 'river', style: { color: { rgb: 'FF1565C0' } } },
    ];
    const b = await build([[cell('앞 바람 사이 river', runs)]], ['a']);
    const ws = XLSX.read(b, { type: 'array', cellStyles: true }).Sheets['S']! as any;
    expect(ws['A2'].v).toBe('앞 바람 사이 river'); // SheetJS 가 조각을 이어 읽는다
    const got = runsOf(b, 'A2');
    expect(got.map(g => g.text).join('')).toBe('앞 바람 사이 river');
    expect(got[1]).toEqual({ text: '바람', rgb: 'FFC62828', bold: true });
    expect(got[3]).toEqual({ text: 'river', rgb: 'FF1565C0', bold: false });
    expect(got[0]!.rgb).toBeUndefined();
  });

  it('10행 번갈아: 짝수 행만 조각, 나머지는 일반 문자열 경로 그대로', async () => {
    const rows: C[][] = Array.from({ length: 10 }, (_, r) => [r % 2 === 0
      ? cell(`행${r}`, [{ text: '행', style: { color: { rgb: 'FF336699' } } }, { text: String(r) }])
      : cell(`행${r}`)]);
    const b = await build(rows, ['a']);
    const ws = XLSX.read(b, { type: 'array' }).Sheets['S']! as any;
    for (let r = 0; r < 10; r++) {
      expect(ws['A' + (r + 2)].v).toBe(`행${r}`);
      expect(runsOf(b, 'A' + (r + 2)).length).toBe(r % 2 === 0 ? 2 : 0);
    }
  });

  it('조각이 전부 빈 글자면 일반 셀로 쓴다', async () => {
    const b = await build([[cell('그대로', [{ text: '' }])]], ['a']);
    expect((XLSX.read(b, { type: 'array' }).Sheets['S'] as any)['A2'].v).toBe('그대로');
  });
});

describe('ExportManager 배선: ColumnDef.cellRuns', () => {
  it('열 cellRuns 결과가 스트리밍 xlsx 셀 조각으로 나온다', async () => {
    const WORDS = ['바람', '고양이'];
    const COL = ['#c62828', '#1565c0'];
    const data = [{ t: '바람 불어 고양이 운다' }, { t: '아무것도 없음' }];
    const cols = [{
      field: 't', header: 'T', type: 'string',
      cellRuns: (v: string) => {
        const out: XlsxRichTextRun[] = []; let last = 0;
        const re = new RegExp('(' + WORDS.join('|') + ')', 'g'); let m: RegExpExecArray | null;
        while ((m = re.exec(v))) {
          if (m.index > last) out.push({ text: v.slice(last, m.index) });
          out.push({ text: m[0], style: { color: { rgb: COL[WORDS.indexOf(m[0])]! }, bold: true } });
          last = m.index + m[0].length;
        }
        if (last < v.length) out.push({ text: v.slice(last) });
        return out.some(r => r.style) ? out : null;
      },
    }];
    const sink = new BytesSink();
    const mgr = new ExportManager<any>({
      getData: () => data,
      getColLayout: () => ({ visibleLeaves: cols, getColumnIndex: () => 0 }) as any,
      getColWidths: () => [200], getOptions: () => ({}), getContainer: () => document.body,
      getMaskEnabled: () => false, getWsManager: () => null,
      loadStreamModules: async () => ({
        pickExcelSink: () => ({ kind: 'blob', create: async () => sink as any }),
        createChannel: (o: any) => new XlsxChannel(new XlsxWorkbookWriter({}), o),
      }),
    } as any);
    mgr.exportExcel({ stream: 'force' });
    for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));
    const b = sink.bytes();
    expect((XLSX.read(b, { type: 'array' }).Sheets['Sheet1'] as any)['A2'].v).toBe('바람 불어 고양이 운다');
    const got = runsOf(b, 'A2');
    expect(got.map(g => g.rgb)).toEqual(['FFC62828', undefined, 'FF1565C0', undefined]);
    expect(runsOf(b, 'A3').length).toBe(0); // cellRuns 가 null → 일반 셀
    expect((XLSX.read(b, { type: 'array' }).Sheets['Sheet1'] as any)['A3'].v).toBe('아무것도 없음');
  });
});
