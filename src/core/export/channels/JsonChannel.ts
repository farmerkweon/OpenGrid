// ============================================================
// DD-15 §2.4 JSON 채널 — 행별 객체(field→표시값) 스트리밍 + provenance 사이드카
// / DD-15 §2.4 JSON channel — per-row objects (field→display text) + provenance sidecar.
// ------------------------------------------------------------
// 화면 진실 = CellArtifact.text. NDJSON 아닌 단일 배열이되 청크 단위로 스트리밍(대괄호 프레이밍).
// provenance 는 래핑 객체의 `_provenance` 로 동행(고지 누락 0). 채널은 raw 미접근.
// ============================================================

import { StreamPump } from '../StreamPump.js';
import type {
  ExportResult, ExportRunCtx, HeaderArtifact, IArtifactSource, IByteSink, RowArtifact,
} from '../types.js';
import { JSON_CAPS } from './capabilities.js';

/** JSON 채널 옵션. / JSON channel options. */
export interface JsonChannelOptions {
  /** field 키 사용(false면 헤더 텍스트 키). / Use field keys (false ⇒ header text keys). */
  readonly useFieldKeys?: boolean;
  /** provenance 를 `_provenance` 로 래핑(기본 true). / Wrap provenance under `_provenance`. */
  readonly includeProvenance?: boolean;
  /** 원값(rawText) 우선. / Prefer rawText. */
  readonly preserveRaw?: boolean;
}

/** JSON 직렬화 전략. / JSON serialization strategy. */
export class JsonChannel {
  readonly id = 'json' as const;
  readonly capabilities = JSON_CAPS;

  constructor(private readonly opts: JsonChannelOptions = {}) {}

  async write(source: IArtifactSource, sink: IByteSink, ctx?: ExportRunCtx): Promise<ExportResult> {
    const preserveRaw = this.opts.preserveRaw === true;
    const header = source.projectHeader();
    const leaf: ReadonlyArray<HeaderArtifact> = header[header.length - 1] ?? [];
    const keys = leaf.map(h => (this.opts.useFieldKeys === false ? h.text : h.field));

    const wrap = this.opts.includeProvenance !== false && ctx?.provenance;
    await sink.write(wrap ? '{"rows":[' : '[');

    let first = true;
    const encodeChunk = (rows: ReadonlyArray<RowArtifact>): string => {
      let out = '';
      for (const r of rows) {
        const obj: Record<string, string> = {};
        const visible = r.cells.filter(c => !c.hidden);
        visible.forEach((c, i) => {
          const key = keys[i] ?? `col${i}`;
          obj[key] = preserveRaw && c.rawText !== undefined ? c.rawText : c.text;
        });
        out += (first ? '' : ',') + JSON.stringify(obj);
        first = false;
      }
      return out;
    };

    const pump = new StreamPump();
    // pump 가 close 를 부르므로, 닫힘 전 마감 브래킷을 별도 sink 로 밀 수 없다 →
    // 대신 마감은 encodeChunk 스트림 종료 후 직접 처리(아래) 위해 pump 를 close 없이 쓰지 않는다.
    // 여기서는 배열 종료를 위해 wrap 여부에 따라 done 청크 뒤 후행을 채널이 직접 기록.
    const result = await pumpWithSuffix(pump, source, encodeChunk, sink, ctx, () => {
      const suffix = wrap
        ? `],"_provenance":${ctx!.provenance!.render('json').text}}`
        : ']';
      return suffix;
    });
    return result;
  }
}

/**
 * StreamPump 를 감싸 마지막 close 직전에 채널별 접미(배열 종료·래퍼)를 기록.
 * / Wraps StreamPump to write a channel suffix right before close.
 */
async function pumpWithSuffix(
  pump: StreamPump,
  source: IArtifactSource,
  encodeChunk: (rows: ReadonlyArray<RowArtifact>) => string,
  sink: IByteSink,
  ctx: ExportRunCtx | undefined,
  suffix: () => string,
): Promise<ExportResult> {
  // pump 는 close 를 호출하므로, close 를 가로채 suffix 를 먼저 기록. / Intercept close to emit suffix first.
  const realClose = sink.close.bind(sink);
  let suffixWritten = false;
  const proxy: IByteSink = {
    write: sink.write.bind(sink),
    abort: sink.abort.bind(sink),
    get desiredSize() { return sink.desiredSize; },
    close: async () => {
      if (!suffixWritten) { suffixWritten = true; await sink.write(suffix()); }
      await realClose();
    },
  };
  return pump.pump(source.projectRows(), encodeChunk, proxy, ctx, source.totalRows());
}
