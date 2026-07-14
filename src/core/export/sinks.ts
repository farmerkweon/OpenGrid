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
