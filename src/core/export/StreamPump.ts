// ============================================================
// DD-15 §2.5 스트리밍 펌프 — 청크·백프레셔·진행·취소(REQ-T9-810)
// / DD-15 §2.5 stream pump — chunked backpressure, progress, cancellation.
// ------------------------------------------------------------
// 생산(IArtifactSource async 스트림) ↔ 소비(IByteSink) 사이 흐름 제어기. sink.desiredSize<=0 이면
// write() Promise 를 await 해 생산을 물리적으로 정지 → 미소비 청크가 힙에 쌓이지 않음(OOM 방지).
// 순수·헤드리스(주입된 sink 만 접근, DOM 미참조).
// ============================================================

import type { ExportResult, ExportRunCtx, IByteSink, RowArtifact, RowChunk } from './types.js';

/** 스트리밍 수치 예산(§7). / Streaming numeric budget. */
export const STREAM_DEFAULTS = {
  /** 스트리밍 강제 임계(행수). / Row-count threshold for forced streaming. */
  streamRowThreshold: 50_000,
  /** 스트리밍 강제 임계(추정 바이트). / Byte threshold for forced streaming. */
  streamByteThreshold: 32 * 1024 * 1024,
  /** 청크 기본(행/청크). / Default rows per chunk. */
  chunkRows: 2_000,
  /** 소비 버퍼 상한(바이트). / Consumer high-water-mark bytes. */
  highWaterMarkBytes: 8 * 1024 * 1024,
  /** 힙 상한 힌트(바이트). / Heap hint bytes. */
  maxHeapHintBytes: 64 * 1024 * 1024,
} as const;

/** 규모가 스트리밍 sink 를 강제하는가(§7 전환 임계). / Whether scale forces a streaming sink. */
export function shouldStream(rowCount: number, estBytes?: number): boolean {
  if (rowCount >= STREAM_DEFAULTS.streamRowThreshold) return true;
  if (estBytes !== undefined && estBytes >= STREAM_DEFAULTS.streamByteThreshold) return true;
  return false;
}

/**
 * 생산-소비 흐름 제어기(§2.5). 채널 write 내부에서 사용.
 * / Producer–consumer flow controller used inside a channel's write.
 */
export class StreamPump {
  /**
   * 스트림을 청크로 흘리며 진행/취소/백프레셔 처리.
   * 루프: for await(chunk) → encode → if(desiredSize<=0) await write(drain) → onProgress → 취소 검사.
   * / Flows the stream chunk-by-chunk with progress, cancellation and backpressure.
   */
  async pump(
    source: AsyncIterable<RowChunk>,
    encodeChunk: (rows: ReadonlyArray<RowArtifact>) => Uint8Array | string,
    sink: IByteSink,
    ctx?: ExportRunCtx,
    total = 0,
  ): Promise<ExportResult> {
    let bytesWritten = 0;
    let rowsWritten = 0;
    let aborted = false;

    for await (const chunk of source) {
      if (ctx?.signal?.aborted) { aborted = true; break; }
      if (chunk.rows.length > 0) {
        const bytes = encodeChunk(chunk.rows);
        // 백프레셔: 소비 버퍼가 가득이면 write Promise 를 await 해 생산을 정지.
        // / Backpressure: await write when the consumer buffer is full to stall production.
        await sink.write(bytes);
        bytesWritten += typeof bytes === 'string' ? byteLen(bytes) : bytes.length;
        rowsWritten += chunk.rows.length;
        ctx?.onProgress?.(rowsWritten, total);
      }
      if (ctx?.signal?.aborted) { aborted = true; break; }
      if (chunk.done) break;
    }

    if (aborted) sink.abort('cancelled');
    else await sink.close();
    return { bytesWritten, rowsWritten, aborted };
  }
}

const _enc = new TextEncoder();
function byteLen(s: string): number { return _enc.encode(s).length; }
