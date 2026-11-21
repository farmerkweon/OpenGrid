// @vitest-environment jsdom
// 스트리밍 경로 배선: 열 cellStyle(정적·함수) + 숫자 서식이 xlsx 셀 스타일로 나온다. / Wiring: column cellStyle + numFmt reach the xlsx.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { ExportManager } from '../../../src/core/ExportManager';
import { XlsxChannel } from '../../../src/core/export/channels/XlsxChannel';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter';

const flush = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

class BytesSink {
  parts: Uint8Array[] = [];
  write(c: Uint8Array | string) { this.parts.push(typeof c === 'string' ? new TextEncoder().encode(c) : c); return Promise.resolve(); }
  close() { return Promise.resolve(); }
  abort() {}
  get desiredSize() { return 1 << 30; }
  bytes() {
    const out = new Uint8Array(this.parts.reduce((a, c) => a + c.length, 0)); let o = 0;
    for (const c of this.parts) { out.set(c, o); o += c.length; }
    return out;
  }
}

describe('스트리밍 셀 컬러링 배선', () => {
  it('정적·함수 cellStyle 과 숫자 서식이 셀에 반영된다', async () => {
    const data = [{ a: 1500.5, b: 'x' }, { a: 20, b: 'y' }, { a: 3, b: 'z' }];
    const cols = [
      { field: 'a', header: 'A', type: 'number', format: '#,##0.00', cellStyle: (v: number) => (v > 100 ? { backgroundColor: '#ff0000', color: '#ffffff', fontWeight: 'bold' } : {}) },
      { field: 'b', header: 'B', type: 'string', cellStyle: { backgroundColor: 'rgb(0, 0, 255)' } },
    ];
    const sink = new BytesSink();
    const mgr = new ExportManager<any>({
      getData: () => data,
      getColLayout: () => ({ visibleLeaves: cols, getColumnIndex: (f: string) => cols.findIndex(c => c.field === f) }) as any,
      getColWidths: () => [80, 120], getOptions: () => ({}), getContainer: () => document.body,
      getMaskEnabled: () => false, getWsManager: () => null,
      loadStreamModules: async () => ({
        pickExcelSink: () => ({ kind: 'blob', create: async () => sink as any }),
        createChannel: (o: any) => new XlsxChannel(new XlsxWorkbookWriter({ level: o.compressionLevel }), o),
      }),
    } as any);
    mgr.exportExcel({ stream: 'force', compressionLevel: 9 });
    await flush();
    const ws = XLSX.read(sink.bytes(), { type: 'array', cellStyles: true }).Sheets['Sheet1']! as any;
    expect(ws['A2'].s.fgColor.rgb).toBe('FF0000');
    expect(ws['A2'].z).toBe('#,##0.00');
    expect(ws['A2'].v).toBe(1500.5);
    expect(ws['A3'].s.fgColor.rgb).toBe('F5F7FA'); // 스타일 없는 행: 기본 줄무늬(셀 3행 = 홀수 시트행)
    expect(ws['B2'].s.fgColor.rgb).toBe('0000FF');
    expect(ws['B3'].s.fgColor.rgb).toBe('0000FF');
  });
});
