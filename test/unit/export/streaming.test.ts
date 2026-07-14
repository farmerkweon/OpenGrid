// ============================================================
// DD-15 §2.5·3.2 스트리밍·백프레셔·진행·취소(REQ-T9-810). 전량 순회 청크(REQ-T3-805).
// ============================================================
import { describe, it, expect } from 'vitest';
import { StreamPump, STREAM_DEFAULTS, shouldStream } from '../../../src/core/export/StreamPump.js';
import type { IByteSink, RowArtifact, RowChunk } from '../../../src/core/export/types.js';

function chunkOf(n: number, start = 0): RowChunk {
  const rows: RowArtifact[] = [];
  for (let i = 0; i < n; i++) rows.push({ modelIndex: start + i, cells: [] });
  return { rows, done: false };
}

async function* streamOf(chunks: RowChunk[]): AsyncIterable<RowChunk> {
  for (const c of chunks) yield c;
}

/** desiredSize 를 추적하는 계측 sink — write 마다 drain 대기 횟수 카운트. */
class BackpressureSink implements IByteSink {
  writes = 0;
  drains = 0;
  private _pending = 0;
  constructor(private _hwm: number, private _drainAfter: number) {}
  write(chunk: Uint8Array | string): Promise<void> {
    this.writes++;
    this._pending += typeof chunk === 'string' ? chunk.length : chunk.length;
    if (this.desiredSize <= 0) {
      this.drains++;
      // drain: 버퍼 비움(소비 완료 시뮬).
      this._pending = 0;
    }
    return Promise.resolve();
  }
  close(): Promise<void> { return Promise.resolve(); }
  abort(): void {}
  get desiredSize(): number { return this._hwm - this._pending; }
}

describe('DD-15 StreamPump(백프레셔·진행·취소)', () => {
  it('전 청크를 순회해 sink 로 흘리고 rowsWritten 집계', async () => {
    const sink = new BackpressureSink(1_000_000, 999);
    const progress: Array<[number, number]> = [];
    const res = await new StreamPump().pump(
      streamOf([chunkOf(3), chunkOf(2), { rows: [], done: true }]),
      rows => 'x'.repeat(rows.length),
      sink,
      { onProgress: (d, t) => progress.push([d, t]) },
      5,
    );
    expect(res.rowsWritten).toBe(5);
    expect(res.aborted).toBe(false);
    // 진행률이 청크마다 보고(누적 3 → 5).
    expect(progress).toEqual([[3, 5], [5, 5]]);
  });

  it('★백프레셔: desiredSize<=0 이면 write 가 drain(생산-소비 결합)', async () => {
    // hwm 아주 작게 → 매 write 가 즉시 drain 트리거.
    const sink = new BackpressureSink(1, 0);
    await new StreamPump().pump(
      streamOf([chunkOf(1), chunkOf(1), { rows: [], done: true }]),
      () => 'AAAA', // 4바이트 > hwm 1 → desiredSize 음수.
      sink,
      undefined,
      2,
    );
    expect(sink.drains).toBeGreaterThan(0); // 백프레셔가 실제로 발동.
  });

  it('취소 신호 시 abort 후 중단(aborted=true)', async () => {
    const ctrl = new AbortController();
    const sink = new BackpressureSink(1_000_000, 999);
    let seen = 0;
    async function* cancelStream(): AsyncIterable<RowChunk> {
      yield chunkOf(2);
      seen++;
      ctrl.abort();
      yield chunkOf(2);
    }
    const res = await new StreamPump().pump(
      cancelStream(),
      rows => 'x'.repeat(rows.length),
      sink,
      { signal: ctrl.signal },
      4,
    );
    expect(res.aborted).toBe(true);
    expect(seen).toBe(1);
  });

  it('shouldStream: 임계(행수/바이트) 초과 시 스트리밍 강제', () => {
    expect(shouldStream(STREAM_DEFAULTS.streamRowThreshold)).toBe(true);
    expect(shouldStream(100)).toBe(false);
    expect(shouldStream(100, STREAM_DEFAULTS.streamByteThreshold)).toBe(true);
    expect(shouldStream(100, 1024)).toBe(false);
  });
});
