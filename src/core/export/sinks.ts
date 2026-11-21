// ============================================================
// DD-15 §2.4·4.3 바이트 싱크 구현군(SPI) — 헤드리스 결정론 테스트용 메모리 싱크 포함
// / DD-15 §2.4 byte sink implementations (SPI) incl. a headless memory sink for tests.
// ------------------------------------------------------------
// 실 다운로드/저장/업로드는 shell(브라우저 download·FS-Access·서버 Writable)이 소유(경계 밖).
// 코어는 결정론 테스트를 위한 순수 메모리 싱크만 내장 — 채널·펌프를 jsdom 없이 단위검증.
// ============================================================

import type { IByteSink } from './types.js';

/** UTF-8 인코더(문자열 청크 → 바이트 길이 산정). / UTF-8 encoder for byte accounting. */
const ENC = new TextEncoder();

/**
 * 메모리 버퍼 싱크(헤드리스 테스트). desiredSize 는 highWaterMark - 누적바이트.
 * / In-memory buffer sink (headless tests); desiredSize = highWaterMark − buffered bytes.
 */
export class MemoryByteSink implements IByteSink {
  private readonly _chunks: Array<Uint8Array | string> = [];
  private _bytes = 0;
  private _closed = false;
  private _aborted = false;
  private _abortReason?: string;

  constructor(private readonly _highWaterMark = 8 * 1024 * 1024) {}

  write(chunk: Uint8Array | string): Promise<void> {
    if (this._closed || this._aborted) {
      return Promise.reject(new Error('sink closed/aborted'));
    }
    this._chunks.push(chunk);
    this._bytes += typeof chunk === 'string' ? ENC.encode(chunk).length : chunk.length;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this._closed = true;
    return Promise.resolve();
  }

  abort(reason?: string): void {
    this._aborted = true;
    if (reason !== undefined) this._abortReason = reason;
  }

  get desiredSize(): number {
    return this._highWaterMark - this._bytes;
  }

  // ── 테스트 조회 헬퍼(계약 외, 결정론 검증용) ──
  /** 누적 문자열(문자열 청크 결합). / Concatenated string of written chunks. */
  toString(): string {
    return this._chunks
      .map(c => (typeof c === 'string' ? c : new TextDecoder().decode(c)))
      .join('');
  }
  get bytesWritten(): number { return this._bytes; }
  get closed(): boolean { return this._closed; }
  get aborted(): boolean { return this._aborted; }
  get abortReason(): string | undefined { return this._abortReason; }
}

/**
 * 다운로드 유틸 싱크 어댑터(소규모/폴백 경로). 주입된 download 콜백으로 전량 위임.
 * / Download-util sink adapter (small/fallback path); delegates the whole payload to a callback.
 */
export class DownloadByteSink implements IByteSink {
  private _buf = '';
  private _bytes = 0;
  private _closed = false;

  constructor(
    private readonly _download: (payload: string) => void,
    private readonly _highWaterMark = Number.POSITIVE_INFINITY,
  ) {}

  write(chunk: Uint8Array | string): Promise<void> {
    const s = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    this._buf += s;
    this._bytes += ENC.encode(s).length;
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (!this._closed) { this._closed = true; this._download(this._buf); }
    return Promise.resolve();
  }

  abort(): void { this._closed = true; }

  get desiredSize(): number { return this._highWaterMark - this._bytes; }
}

// ============================================================
// 엑셀 스트리밍 싱크 — 디스크 직접 기록 / Blob 폴백 / 선택기
// / Excel streaming sinks — direct-to-disk, Blob fallback, selector.
// ============================================================

/** 엑셀 기본 MIME. / Default xlsx MIME type. */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 청크의 바이트 길이. / Byte length of a chunk. */
function byteLen(chunk: Uint8Array | string): number {
  return typeof chunk === 'string' ? ENC.encode(chunk).length : chunk.length;
}

/** FileSystemWritableFileStream 의 필요한 최소 모양(주입용). / Minimal shape of a writable file stream. */
export interface IWritableLike {
  write(data: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void> | void;
}

/**
 * 디스크 직접 기록 싱크(File System Access). 호출부가 `showSaveFilePicker().createWritable()` 결과를 넘긴다.
 * desiredSize = highWaterMark − 아직 기록 끝나지 않은 바이트(기록이 끝나면 회복).
 * / Direct-to-disk sink; wraps a writable. desiredSize = highWaterMark − in-flight bytes.
 */
export class FileSystemByteSink implements IByteSink {
  private _pending = 0;
  private _closed = false;
  private _aborted = false;

  constructor(
    private readonly _writable: IWritableLike,
    private readonly _highWaterMark = 8 * 1024 * 1024,
  ) {}

  async write(chunk: Uint8Array | string): Promise<void> {
    if (this._closed || this._aborted) throw new Error('sink closed/aborted');
    const n = byteLen(chunk);
    this._pending += n;
    try {
      await this._writable.write(chunk);
    } finally {
      this._pending -= n;
    }
  }

  async close(): Promise<void> {
    if (this._closed || this._aborted) return;
    this._closed = true;
    await this._writable.close();
  }

  abort(reason?: string): void {
    if (this._aborted) return;
    this._aborted = true;
    try {
      const r = this._writable.abort?.(reason);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch { /* 중단 중 오류는 무시 / ignore errors while aborting */ }
  }

  get desiredSize(): number { return this._highWaterMark - this._pending; }
}

/** Blob 다운로드 옵션. / Blob download options. */
export interface BlobDownloadOptions {
  fileName?: string;
  mime?: string;
  highWaterMark?: number | undefined;
  /** 결과 Blob 전달 콜백(미지정 시 `<a download>` 클릭). / Receives the Blob (default: anchor click). */
  download?: ((blob: Blob, fileName: string) => void) | undefined;
}

/**
 * 폴백 싱크: 조각을 모아 close 때 Blob→objectURL→`<a download>`. 압축 바이트만 보유.
 * / Fallback sink: collects pieces, downloads as a Blob on close.
 */
export class BlobDownloadByteSink implements IByteSink {
  private readonly _parts: Uint8Array[] = [];
  private _bytes = 0;
  private _closed = false;
  private _aborted = false;
  private readonly _fileName: string;
  private readonly _mime: string;
  private readonly _hwm: number;
  private readonly _download?: ((blob: Blob, fileName: string) => void) | undefined;

  constructor(opts: BlobDownloadOptions = {}) {
    this._fileName = opts.fileName ?? 'export.xlsx';
    this._mime = opts.mime ?? XLSX_MIME;
    this._hwm = opts.highWaterMark ?? 1024 * 1024 * 1024;
    this._download = opts.download;
  }

  write(chunk: Uint8Array | string): Promise<void> {
    if (this._closed || this._aborted) return Promise.reject(new Error('sink closed/aborted'));
    const u8 = typeof chunk === 'string' ? ENC.encode(chunk) : chunk;
    this._parts.push(u8);
    this._bytes += u8.length;
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (this._closed || this._aborted) return Promise.resolve();
    this._closed = true;
    const blob = new Blob(this._parts as BlobPart[], { type: this._mime });
    this._parts.length = 0;
    if (this._download) this._download(blob, this._fileName);
    else BlobDownloadByteSink._anchorDownload(blob, this._fileName);
    return Promise.resolve();
  }

  abort(): void {
    this._aborted = true;
    this._parts.length = 0;
  }

  get desiredSize(): number { return this._hwm - this._bytes; }
  get bytesWritten(): number { return this._bytes; }

  private static _anchorDownload(blob: Blob, fileName: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 선택기 옵션. / Selector options. */
export interface PickExcelSinkOptions {
  fileName?: string;
  mime?: string;
  /** 'off' 면 File System Access 를 쓰지 않는다(기본 'auto'). / 'off' blocks FS-Access. */
  fsAccess?: 'auto' | 'off';
  highWaterMark?: number;
  /** Blob 경로의 다운로드 콜백. / Download callback for the Blob path. */
  download?: BlobDownloadOptions['download'];
  /** 판정 대상 환경(테스트용, 기본 window). / Environment to probe (tests; default window). */
  env?: unknown;
}

/** pickExcelSink 결과. / Result of pickExcelSink. */
export interface ExcelSinkChoice {
  readonly kind: 'fs' | 'blob';
  /** 싱크 생성. 'fs' 는 저장 대화상자를 연다(사용자 취소 시 reject, 호출부가 처리). / Creates the sink; 'fs' opens the picker. */
  create(): Promise<IByteSink>;
}

/** 순수 판정: File System Access 를 쓸 수 있고 막지 않았나. / Pure check: is FS-Access usable and not blocked. */
export function canUseFileSystemAccess(opts: PickExcelSinkOptions = {}): boolean {
  if (opts.fsAccess === 'off') return false;
  const env = opts.env !== undefined ? opts.env : (typeof window !== 'undefined' ? window : undefined);
  return !!env && typeof (env as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

/**
 * 엑셀 싱크 선택기. 사용: `const sink = await pickExcelSink({ fileName: 'a.xlsx' }).create();`
 * 이후 스트리밍 쓰기(`writeStreaming(source, sink, ctx)`)에 넘긴다. 'fs' 는 사용자 제스처 안에서 create() 를 호출해야 한다.
 * / Usage: `const sink = await pickExcelSink({ fileName }).create()`, then pass it to the streaming writer.
 * For 'fs', call create() inside a user gesture.
 */
export function pickExcelSink(opts: PickExcelSinkOptions = {}): ExcelSinkChoice {
  const fileName = opts.fileName ?? 'export.xlsx';
  const mime = opts.mime ?? XLSX_MIME;
  if (canUseFileSystemAccess(opts)) {
    const env = (opts.env !== undefined ? opts.env : window) as {
      showSaveFilePicker(o: unknown): Promise<{ createWritable(): Promise<IWritableLike> }>;
    };
    return {
      kind: 'fs',
      async create(): Promise<IByteSink> {
        const handle = await env.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'Excel', accept: { [mime]: ['.xlsx'] } }],
        });
        return new FileSystemByteSink(await handle.createWritable(), opts.highWaterMark);
      },
    };
  }
  return {
    kind: 'blob',
    create: () => Promise.resolve(new BlobDownloadByteSink({
      fileName, mime, highWaterMark: opts.highWaterMark, download: opts.download,
    })),
  };
}
