// @vitest-environment jsdom
// EXLFIX — 코드 검토(REVIEW_EXCEL §B) 반영 시험. 독립 파서 SheetJS 로 되읽어 값 변조를 잡는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { ExportManager } from '../../../src/core/ExportManager';
import { ExportProgressView } from '../../../src/core/export/ExportProgressView';
import { XlsxChannel } from '../../../src/core/export/channels/XlsxChannel';
import { XlsxWorkbookWriter } from '../../../src/core/export/channels/XlsxWorkbookWriter';

const flush = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

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

function realMgr(values: unknown[], kind: 'blob' | 'fs' = 'blob') {
  const data = values.map((v, i) => ({ a: v, b: 'r' + i }));
  const cols = [{ field: 'a', header: 'A', type: 'number' }, { field: 'b', header: 'B', type: 'string' }];
  const sink = new BytesSink();
  const mgr = new ExportManager<any>({
    getData: () => data,
    getColLayout: () => ({ visibleLeaves: cols, getColumnIndex: (f: string) => cols.findIndex(c => c.field === f) }) as any,
    getColWidths: () => [80, 120], getOptions: () => ({}), getContainer: () => document.body,
    getMaskEnabled: () => false, getWsManager: () => null,
    loadStreamModules: async () => ({
      pickExcelSink: () => ({ kind, create: async () => sink as any }),
      createChannel: (o: any) => new XlsxChannel(new XlsxWorkbookWriter({}), o),
    }),
  } as any);
  return { mgr, sink };
}

describe('B1 지수·비유한 숫자 — 스트리밍 값 변조 금지', () => {
  it('1e21·1e-7·-3.5e-8·큰 정수·NaN 이 SheetJS 로 정확히 되읽힌다', async () => {
    const vals = [1e21, 1e-7, -3.5e-8, 12345678901234567890, NaN, 42, 0];
    const { mgr, sink } = realMgr(vals);
    mgr.exportExcel({ stream: 'force' });
    await flush(30);
    const wb = XLSX.read(sink.bytes(), { type: 'array' });
    const aoa = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true });
    const got = aoa.slice(1).map(r => r[0]);
    expect(got[0]).toBe(1e21);
    expect(got[1]).toBe(1e-7);
    expect(got[2]).toBe(-3.5e-8);
    expect(got[3]).toBe(12345678901234567890);
    expect(got[4]).not.toBe(0);           // NaN 이 조용히 0 이 되면 안 된다
    expect(typeof got[4]).toBe('string'); // 텍스트로 남는다
    expect(got[5]).toBe(42);
    expect(got[6]).toBe(0);
  });
});

describe('B2 includeHeader:false — 스트리밍도 머리글 제외', () => {
  it('false 면 첫 행이 데이터, 기본은 머리글 포함', async () => {
    const a = realMgr([7, 8]);
    a.mgr.exportExcel({ stream: 'force', includeHeader: false });
    await flush(30);
    const r1 = XLSX.utils.sheet_to_json<any[]>(XLSX.read(a.sink.bytes(), { type: 'array' }).Sheets['Sheet1']!, { header: 1, raw: true });
    expect(r1.length).toBe(2);
    expect(r1[0]![0]).toBe(7);
    const b = realMgr([7, 8]);
    b.mgr.exportExcel({ stream: 'force' });
    await flush(30);
    const r2 = XLSX.utils.sheet_to_json<any[]>(XLSX.read(b.sink.bytes(), { type: 'array' }).Sheets['Sheet1']!, { header: 1, raw: true });
    expect(r2.length).toBe(3);
    expect(r2[0]![0]).toBe('A');
  });
});

describe('B4 onAfter', () => {
  it('Blob 경로는 실제 xlsx 바이트가 든 Blob 을 준다', async () => {
    const { mgr } = realMgr([1, 2, 3]);
    const onAfter = vi.fn();
    mgr.exportExcel({ stream: 'force', onAfter });
    await flush(30);
    expect(onAfter).toHaveBeenCalledTimes(1);
    const blob = onAfter.mock.calls[0]![0] as Blob;
    expect(blob.size).toBeGreaterThan(100);
  });
  it('FS 경로는 빈 Blob 을 넘기지 않는다(부르지 않음)', async () => {
    const { mgr } = realMgr([1, 2, 3], 'fs');
    const onAfter = vi.fn();
    mgr.exportExcel({ stream: 'force', onAfter });
    await flush(30);
    expect(onAfter).not.toHaveBeenCalled();
  });
});

describe('B5 진척바 포커스·Esc', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('열 때 취소 단추에 포커스, Esc → onCancel, Tab 은 가둔다', () => {
    const onCancel = vi.fn();
    new ExportProgressView({ onCancel });
    const btn = document.querySelector('.og-export-progress__cancel') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.querySelector('.og-export-progress')!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    document.querySelector('.og-export-progress')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.og-export-progress')!.getAttribute('role')).toBe('dialog');
  });
});

describe('B9 finish 직전 취소', () => {
  it('마지막 청크 뒤 abort 면 aborted 로 끝나고 sink.abort', async () => {
    const ac = new AbortController();
    const sink = new BytesSink(); const abortSpy = vi.spyOn(sink, 'abort');
    const src: any = {
      projectHeader: () => [[{ text: 'A', field: 'a', colSpan: 1, rowSpan: 1, widthPx: 80, align: 'left' }]],
      totalRows: () => 1, dataState: () => 'ready',
      projectRows: async function* () {
        yield { rows: [{ modelIndex: 0, cells: [{ text: 'x', applied: [], rowSpan: 1, colSpan: 1, hidden: false, align: 'left', type: 'text' }] }], done: false };
        ac.abort();
        yield { rows: [], done: true };
      },
    };
    const r = await new XlsxChannel(new XlsxWorkbookWriter({}), {}).writeStreaming(src, sink as any, { signal: ac.signal });
    expect(r.aborted).toBe(true);
    expect(abortSpy).toHaveBeenCalled();
  });
});
