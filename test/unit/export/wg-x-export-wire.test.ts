// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportManager } from '../../../src/core/ExportManager';
import { ExportProgressView } from '../../../src/core/export/ExportProgressView';

const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

function makeMgr(rows: number, over: Record<string, unknown> = {}) {
  const data = Array.from({ length: rows }, (_, i) => ({ a: i, b: 'r' + i }));
  const cols = [
    { field: 'a', header: 'A', type: 'number' },
    { field: 'b', header: 'B', type: 'string' },
  ];
  const writeStreaming = vi.fn(async (src: any, _sink: any, ctx: any) => {
    let done = 0;
    const total = src.totalRows();
    for await (const ch of src.projectRows()) {
      if (ctx?.signal?.aborted) return { bytesWritten: 0, rowsWritten: done, aborted: true };
      done += ch.rows.length;
      ctx?.onProgress?.(done, total);
    }
    return { bytesWritten: 1, rowsWritten: done, aborted: false };
  });
  const sink = { write: vi.fn(), close: vi.fn(), abort: vi.fn(), desiredSize: 1 };
  const pick = vi.fn(() => ({ kind: 'blob' as const, create: async () => sink }));
  const mgr = new ExportManager<any>({
    getData: () => data,
    getColLayout: () => ({ visibleLeaves: cols, getColumnIndex: (f: string) => cols.findIndex(c => c.field === f) }) as any,
    getColWidths: () => [80, 120],
    getOptions: () => ({}),
    getContainer: () => document.body,
    getMaskEnabled: () => false,
    getWsManager: () => null,
    loadStreamModules: async () => ({ pickExcelSink: pick as any, createChannel: () => ({ writeStreaming }) }),
    ...over,
  } as any);
  return { mgr, writeStreaming, pick };
}

describe('exportExcel 스트리밍 라우팅', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('auto + 소형 → 스트리밍 안 탐', async () => {
    const { mgr, writeStreaming } = makeMgr(10);
    mgr.exportExcel({ filename: 'x' });
    await flush();
    expect(writeStreaming).not.toHaveBeenCalled();
  });
  it('stream:off → 대량이어도 스트리밍 안 탐', async () => {
    const { mgr, writeStreaming } = makeMgr(50_000);
    mgr.exportExcel({ stream: 'off' });
    await flush();
    expect(writeStreaming).not.toHaveBeenCalled();
  });
  it('auto + 5만행 → 스트리밍', async () => {
    const { mgr, writeStreaming } = makeMgr(50_000);
    mgr.exportExcel({ filename: 'x' });
    await flush(20);
    expect(writeStreaming).toHaveBeenCalledTimes(1);
  });
  it('force → 소형도 스트리밍, 진척 단조증가, 끝나면 진척바 닫힘, 숫자 셀 타입', async () => {
    const { mgr, writeStreaming, pick } = makeMgr(4500);
    const seen: number[] = [];
    const onAfter = vi.fn();
    mgr.exportExcel({ stream: 'force', filename: 'big', onProgress: (d) => seen.push(d), onAfter });
    await flush(20);
    expect(writeStreaming).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledWith({ fileName: 'big.xlsx' });
    expect(seen.length).toBeGreaterThan(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(seen[seen.length - 1]).toBe(4500);
    expect(document.querySelector('.og-export-progress')).toBeNull();
    expect(onAfter).toHaveBeenCalledTimes(1);
  });
  it('signal.abort → aborted 로 끝나고 onAfter 없음', async () => {
    const { mgr, writeStreaming } = makeMgr(6000);
    const ac = new AbortController();
    const onAfter = vi.fn();
    ac.abort();
    mgr.exportExcel({ stream: 'force', signal: ac.signal, onAfter });
    await flush(20);
    const r = await writeStreaming.mock.results[0]!.value;
    expect(r.aborted).toBe(true);
    expect(onAfter).not.toHaveBeenCalled();
    expect(document.querySelector('.og-export-progress')).toBeNull();
  });
  it('취소 단추 → abort', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const { mgr, writeStreaming } = makeMgr(10, {
      loadStreamModules: async () => ({
        pickExcelSink: () => ({ kind: 'blob', create: async () => ({}) }),
        createChannel: () => ({ writeStreaming: async (_s: any, _k: any, ctx: any) => { await gate; return { bytesWritten: 0, rowsWritten: 0, aborted: !!ctx.signal.aborted }; } }),
      }),
    });
    mgr.exportExcel({ stream: 'force' });
    await flush();
    const btn = document.querySelector('.og-export-progress__cancel') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    release();
    await flush();
    expect(document.querySelector('.og-export-progress')).toBeNull();
    expect(writeStreaming).not.toHaveBeenCalled();
  });
  it('저장창 AbortError → 조용히 취소(에러 아님)', async () => {
    const onError = vi.fn();
    const { mgr, writeStreaming } = makeMgr(10, {
      loadStreamModules: async () => ({
        pickExcelSink: () => ({ kind: 'fs', create: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } }),
        createChannel: () => ({ writeStreaming: vi.fn() }),
      }),
    });
    mgr.exportExcel({ stream: 'force', onError });
    await flush();
    expect(onError).not.toHaveBeenCalled();
    expect(writeStreaming).not.toHaveBeenCalled();
    expect(document.querySelector('.og-export-progress')).toBeNull();
  });
  it('SecurityError → Blob 폴백', async () => {
    const calls: unknown[] = [];
    const sink = { write: vi.fn(), close: vi.fn(), abort: vi.fn(), desiredSize: 1 };
    const ws = vi.fn(async () => ({ bytesWritten: 1, rowsWritten: 0, aborted: false }));
    const { mgr } = makeMgr(10, {
      loadStreamModules: async () => ({
        pickExcelSink: (o: any) => { calls.push(o.fsAccess); return { kind: 'fs', create: async () => { if (o.fsAccess !== 'off') throw Object.assign(new Error('s'), { name: 'SecurityError' }); return sink; } }; },
        createChannel: () => ({ writeStreaming: ws }),
      }),
    });
    mgr.exportExcel({ stream: 'force' });
    await flush();
    expect(calls).toEqual([undefined, 'off']);
    expect(ws).toHaveBeenCalledTimes(1);
  });
  it('쓰기 오류 → 진척바 오류 표시 + onError', async () => {
    const onError = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mgr } = makeMgr(10, {
      loadStreamModules: async () => ({
        pickExcelSink: () => ({ kind: 'blob', create: async () => ({}) }),
        createChannel: () => ({ writeStreaming: async () => { throw new Error('boom'); } }),
      }),
    });
    mgr.exportExcel({ stream: 'force', onError });
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.og-export-progress')?.textContent).toContain('boom');
    spy.mockRestore();
  });
});

describe('ExportProgressView', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('update/close 와 접근성 속성', () => {
    const v = new ExportProgressView();
    const root = document.querySelector('.og-export-progress')!;
    expect(root.getAttribute('role')).toBe('dialog');
    v.update(50, 200);
    expect(document.querySelector('.og-export-progress__text')!.textContent).toContain('50 / 200');
    expect(document.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('25');
    expect(document.querySelector('.og-export-progress__text')!.getAttribute('aria-live')).toBe('polite');
    v.close(); v.close();
    expect(document.querySelector('.og-export-progress')).toBeNull();
  });
  it('fail 은 오류 문구, 취소 콜백, i18n 주입', () => {
    const onCancel = vi.fn();
    const v = new ExportProgressView({ onCancel, t: (k) => '[' + k + ']' });
    (document.querySelector('.og-export-progress__cancel') as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalled();
    expect(document.querySelector('.og-export-progress__cancel')!.textContent).toBe('[export.cancel]');
    v.fail('x');
    expect(document.querySelector('.og-export-progress__text')!.textContent).toContain('x');
    v.close();
  });
});
