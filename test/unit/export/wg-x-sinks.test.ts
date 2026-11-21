import { describe, it, expect, vi } from 'vitest';
import {
  FileSystemByteSink, BlobDownloadByteSink, pickExcelSink, canUseFileSystemAccess, XLSX_MIME,
} from '../../../src/core/export/index';

describe('BlobDownloadByteSink', () => {
  it('청크 누적·바이트 셈·close 때 Blob 한 번 전달', async () => {
    const download = vi.fn();
    const s = new BlobDownloadByteSink({ fileName: 'a.xlsx', download });
    await s.write(new Uint8Array([1, 2, 3]));
    await s.write('가');
    expect(s.bytesWritten).toBe(6);
    expect(s.desiredSize).toBeGreaterThan(0);
    await s.close();
    await s.close();
    expect(download).toHaveBeenCalledTimes(1);
    const [blob, name] = download.mock.calls[0];
    expect(name).toBe('a.xlsx');
    expect(blob.size).toBe(6);
    expect(blob.type).toBe(XLSX_MIME);
  });
  it('abort 뒤 write 거부·다운로드 없음', async () => {
    const download = vi.fn();
    const s = new BlobDownloadByteSink({ download });
    s.abort();
    await expect(s.write('x')).rejects.toThrow();
    await s.close();
    expect(download).not.toHaveBeenCalled();
  });
  it('desiredSize 는 highWaterMark 기준', async () => {
    const s = new BlobDownloadByteSink({ highWaterMark: 10, download: () => {} });
    await s.write(new Uint8Array(4));
    expect(s.desiredSize).toBe(6);
  });
});

describe('FileSystemByteSink', () => {
  it('write/close/abort 를 writable 로 위임', async () => {
    const w = { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    const s = new FileSystemByteSink(w, 100);
    await s.write(new Uint8Array(10));
    expect(w.write).toHaveBeenCalledTimes(1);
    expect(s.desiredSize).toBe(100);
    await s.close();
    expect(w.close).toHaveBeenCalledTimes(1);
    const w2 = { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    const s2 = new FileSystemByteSink(w2);
    s2.abort('x');
    expect(w2.abort).toHaveBeenCalledWith('x');
    await expect(s2.write('a')).rejects.toThrow();
  });
  it('기록 중엔 desiredSize 감소, 끝나면 회복', async () => {
    let release!: () => void;
    const w = { write: vi.fn(() => new Promise<void>(r => { release = r; })), close: vi.fn(async () => {}) };
    const s = new FileSystemByteSink(w, 100);
    const p = s.write(new Uint8Array(30));
    expect(s.desiredSize).toBe(70);
    release();
    await p;
    expect(s.desiredSize).toBe(100);
  });
  it('abort 미지원 writable 도 안 터짐', () => {
    const s = new FileSystemByteSink({ write: async () => {}, close: async () => {} });
    expect(() => s.abort()).not.toThrow();
  });
});

describe('pickExcelSink', () => {
  it('jsdom 기본(picker 없음) → blob', async () => {
    expect(canUseFileSystemAccess()).toBe(false);
    const c = pickExcelSink({ download: () => {} });
    expect(c.kind).toBe('blob');
    expect(await c.create()).toBeInstanceOf(BlobDownloadByteSink);
  });
  it('picker 있으면 fs, off 면 blob', async () => {
    const writable = { write: async () => {}, close: async () => {} };
    const picker = vi.fn(async (_o: unknown) => ({ createWritable: async () => writable }));
    const env = { showSaveFilePicker: picker };
    expect(canUseFileSystemAccess({ env })).toBe(true);
    expect(pickExcelSink({ env, fsAccess: 'off' }).kind).toBe('blob');
    const c = pickExcelSink({ env, fileName: 'b.xlsx' });
    expect(c.kind).toBe('fs');
    expect(picker).not.toHaveBeenCalled();
    expect(await c.create()).toBeInstanceOf(FileSystemByteSink);
    expect(picker).toHaveBeenCalledTimes(1);
    expect((picker.mock.calls[0][0] as { suggestedName: string }).suggestedName).toBe('b.xlsx');
  });
});
