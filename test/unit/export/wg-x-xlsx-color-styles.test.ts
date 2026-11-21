// ============================================================
// 스트리밍 xlsx 셀 컬러링 — 스타일 등록소 + SheetJS(독립 파서) 왕복. 채움색·글자색·굵기·숫자 서식.
// / Streaming-xlsx cell coloring: style registry + SheetJS round trip (fill, font color, bold, number format).
// ============================================================
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter.js';
import { StylesRegistry } from '../../../src/core/export/channels/XlsxStylesRegistry.js';
import type { IByteSink, XlsxCellStyleSpec } from '../../../src/core/export/types.js';

class BytesSink implements IByteSink {
  chunks: Uint8Array[] = [];
  write(c: Uint8Array | string): Promise<void> {
    this.chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
    return Promise.resolve();
  }
  close(): Promise<void> { return Promise.resolve(); }
  abort(): void { /* 없음 */ }
  get desiredSize(): number { return 1 << 30; }
  bytes(): Uint8Array {
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(n); let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

type C = { value: string; num?: number; align: 'left' | 'right'; rowSpan: number; colSpan: number; style?: XlsxCellStyleSpec; s?: number };
const cell = (value: string, num?: number, style?: XlsxCellStyleSpec): C =>
  ({ value, ...(num !== undefined ? { num } : {}), align: num !== undefined ? 'right' : 'left', rowSpan: 1, colSpan: 1, ...(style ? { style } : {}) });

async function build(rows: C[][], header: string[], pre?: (add: (s: XlsxCellStyleSpec) => number) => void) {
  const sink = new BytesSink();
  const s = await new XlsxWorkbookWriter({}).openStream({ sheetName: 'S', header, colWidthsPx: header.map(() => 90) }, sink);
  pre?.(s.addStyle!);
  for (let o = 0; o < rows.length; o += 400) await s.appendRows(rows.slice(o, o + 400));
  await s.finish();
  return sink.bytes();
}
const readWb = (b: Uint8Array) => XLSX.read(b, { type: 'array', cellStyles: true });
const at = (b: Uint8Array, ref: string) => readWb(b).Sheets['S']![ref] as any;

// 공개판 SheetJS 는 글꼴(.s.font)을 읽어 주지 않는다 → 채움은 SheetJS 로, 글꼴은 표준 OOXML 을 직접 따라가 확인한다
// (셀 s → cellXfs[s].fontId → fonts[fontId]). / Community SheetJS does not surface fonts: fills via SheetJS, fonts by walking OOXML.
function fontOf(b: Uint8Array, ref: string): { bold: boolean; italic: boolean; rgb?: string } {
  const files = unzipSync(b);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
  const styles = strFromU8(files['xl/styles.xml']!);
  const sIdx = Number(new RegExp('<c r="' + ref + '"(?: s="(\\d+)")?').exec(sheet)![1] ?? 0);
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1]!.match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  const fontId = Number(/fontId="(\d+)"/.exec(xfs[sIdx]!)![1]);
  const fonts = /<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(styles)![1]!.match(/<font>[\s\S]*?<\/font>/g)!;
  const f = fonts[fontId]!;
  return { bold: f.includes('<b/>'), italic: f.includes('<i/>'), rgb: /<color rgb="([0-9A-F]{8})"/.exec(f)?.[1] };
}

describe('StylesRegistry', () => {
  it('같은 조합은 같은 번호(중복 제거), 다른 조합은 다른 번호', () => {
    const r = new StylesRegistry();
    const a = r.add({ fill: { rgb: 'FF0000' } });
    expect(r.add({ fill: { rgb: 'FF0000' } })).toBe(a);
    expect(r.add({ fill: { rgb: '#ff0000' } })).toBe(a); // 표기만 다른 같은 색
    expect(r.add({ fill: { rgb: '0000FF' } })).not.toBe(a);
    const n = r.size;
    r.add({ fill: { rgb: 'FF0000' } });
    expect(r.size).toBe(n);
  });
  it('xml 에 글꼴 색·굵기·숫자 서식이 들어간다', () => {
    const r = new StylesRegistry();
    r.add({ font: { bold: true, color: { rgb: 'FF336699' } }, numFmt: '#,##0.000' });
    const x = r.toXml();
    expect(x).toContain('<color rgb="FF336699"/>');
    expect(x).toContain('<b/>');
    expect(x).toContain('formatCode="#,##0.000"');
    expect(x).toContain('applyFont="1"');
  });
});

describe('셀 컬러링 왕복(SheetJS)', () => {
  it('빨강·파랑 채움, 굵게, 숫자 서식 각 한 셀', async () => {
    const rows = [[
      cell('빨강', undefined, { fill: { rgb: 'FF0000' } }),
      cell('파랑', undefined, { fill: { rgb: '0000FF' } }),
      cell('굵게', undefined, { font: { bold: true } }),
      cell('1234.5', 1234.5, { numFmt: '#,##0.00' }),
    ]];
    const b = await build(rows, ['a', 'b', 'c', 'd']);
    expect(at(b, 'A2').s.fgColor.rgb).toBe('FF0000');
    expect(at(b, 'B2').s.fgColor.rgb).toBe('0000FF');
    expect(fontOf(b, 'C2').bold).toBe(true);
    expect(at(b, 'D2').z).toBe('#,##0.00');
    expect(at(b, 'D2').v).toBe(1234.5);
  });

  it('글자색이 다른 두 셀이 각자 색으로 읽히고, 같은 색은 한 서식을 공유한다', async () => {
    const rows = [[
      cell('가', undefined, { font: { color: { rgb: 'FF336699' } } }),
      cell('나', undefined, { font: { color: { rgb: 'FFCC0000' } } }),
      cell('다', undefined, { font: { color: { rgb: 'FF336699' } } }),
    ]];
    const b = await build(rows, ['a', 'b', 'c']);
    expect(fontOf(b, 'A2').rgb).toBe('FF336699');
    expect(fontOf(b, 'B2').rgb).toBe('FFCC0000');
    expect(fontOf(b, 'C2').rgb).toBe('FF336699');
    const xml = strFromU8(unzipSync(b)['xl/styles.xml']!);
    expect(xml.match(/rgb="FF336699"/g)!.length).toBe(1);
  });

  it('채움+글자색 조합과 미리 등록한 번호(s)가 모두 적용된다', async () => {
    let idx = -1;
    const b = await build([[cell('조합', undefined, { fill: { rgb: 'FFFF00' }, font: { color: { rgb: 'FF0000FF' }, italic: true } }), { ...cell('사전'), s: 0 }]],
      ['a', 'b'], (add) => { idx = add({ fill: { rgb: '00FF00' } }); });
    expect(idx).toBeGreaterThan(2);
    const a2 = at(b, 'A2');
    expect(a2.s.fgColor.rgb).toBe('FFFF00');
    expect(fontOf(b, 'A2')).toEqual({ bold: false, italic: true, rgb: 'FF0000FF' });
    expect(fontOf(b, 'B2').rgb).toBeUndefined(); // s:0 = 기본 서식
  });

  it('10행×3열 번갈아 색이 SheetJS 로 번갈아 읽힌다', async () => {
    const rows: C[][] = Array.from({ length: 10 }, (_, r) => [0, 1, 2].map(c =>
      cell(`r${r}c${c}`, undefined, { fill: { rgb: (r + c) % 2 === 0 ? 'FF0000' : '0000FF' } })));
    const b = await build(rows, ['a', 'b', 'c']);
    for (let r = 0; r < 10; r++) for (let c = 0; c < 3; c++) {
      expect(at(b, `${'ABC'[c]}${r + 2}`).s.fgColor.rgb).toBe((r + c) % 2 === 0 ? 'FF0000' : '0000FF');
    }
  });

  it('스타일 없는 셀은 기존 줄무늬 그대로, 채움색이 없는 스타일은 줄무늬 위에 얹힌다', async () => {
    const b = await build([[cell('x')], [cell('y', undefined, { font: { bold: true } })]], ['a']);
    const wb = readWb(b);
    expect(wb.Sheets['S']!['A2']!.v).toBe('x');
    expect(fontOf(b, 'A3').bold).toBe(true);
    expect((wb.Sheets['S']!['A3'] as any).s.fgColor.rgb).toBe('F5F7FA'); // 줄무늬 채움 유지
    expect(fontOf(b, 'A2').bold).toBe(false);
  });
});
