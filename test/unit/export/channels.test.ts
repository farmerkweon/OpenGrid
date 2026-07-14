// ============================================================
// DD-15 §2.4 채널 직렬화 — CSV/JSON/XML/Xlsx. 값=화면 진실, provenance 동행, 병합 hidden 생략.
// ============================================================
import { describe, it, expect } from 'vitest';
import { makeSource, moneyCol, textCol, numCol } from './_helpers.js';
import { CsvChannel } from '../../../src/core/export/channels/CsvChannel.js';
import { JsonChannel } from '../../../src/core/export/channels/JsonChannel.js';
import { XmlChannel } from '../../../src/core/export/channels/XmlChannel.js';
import { XlsxChannel } from '../../../src/core/export/channels/XlsxChannel.js';
import type { IWorkbookWriter, SheetModel } from '../../../src/core/export/channels/XlsxChannel.js';
import { MemoryByteSink } from '../../../src/core/export/sinks.js';
import { ChannelRegistry } from '../../../src/core/export/ChannelRegistry.js';
import { buildProvenance } from '../../../src/core/export/Provenance.js';
import type { IByteSink } from '../../../src/core/export/types.js';

const ROWS = [{ amt: 1000, name: 'A,B' }, { amt: 2000, name: 'C' }];
const COLS = [moneyCol('amt', '금액'), textCol('name', '이름')];

describe('DD-15 CSV 채널', () => {
  it('BOM + 헤더 + 인용 처리(콤마 포함 필드)', async () => {
    const { source } = makeSource(ROWS, COLS);
    const sink = new MemoryByteSink();
    await new CsvChannel({ includeProvenance: false }).write(source, sink);
    const out = sink.toString();
    expect(out.startsWith('﻿')).toBe(true); // BOM.
    expect(out).toContain('금액,이름'); // 헤더(인용 불요).
    expect(out).toContain('"A,B"'); // 콤마 인용.
  });

  it('provenance 주석행 프리앰블 동행', async () => {
    const { source } = makeSource(ROWS, COLS);
    const sink = new MemoryByteSink();
    const prov = buildProvenance({ transforms: [{ source: 'format', kind: 'abbreviate', detail: '축약' }] });
    await new CsvChannel({ bom: false }).write(source, sink, { provenance: prov });
    expect(sink.toString().split('\n')[0]!.startsWith('# ')).toBe(true);
  });

  it('병합 hidden 셀은 직렬화 생략', async () => {
    // 콤마 없는 텍스트 데이터(포맷 콤마 오염 방지).
    const rows = [{ a: 'x', b: 'y' }, { a: 'p', b: 'q' }];
    const cols = [textCol('a', 'A'), textCol('b', 'B')];
    const { source } = makeSource(rows, cols, {
      placeFor: (_r, c) => (c === 1 ? { rowSpan: 1, colSpan: 1, hidden: true } : undefined),
    });
    const sink = new MemoryByteSink();
    await new CsvChannel({ bom: false, includeProvenance: false, includeHeader: false }).write(source, sink);
    // 두번째 컬럼(b) 이 숨김 → 각 행에 셀 1개뿐(콤마 없음).
    for (const line of sink.toString().trim().split('\n')) expect(line.includes(',')).toBe(false);
  });
});

describe('DD-15 JSON 채널', () => {
  it('field 키 객체 배열 + provenance 래핑', async () => {
    const { source } = makeSource(ROWS, COLS);
    const sink = new MemoryByteSink();
    const prov = buildProvenance({ transforms: [{ source: 'cf', kind: 'clamp', detail: 'c' }] });
    await new JsonChannel().write(source, sink, { provenance: prov });
    const parsed = JSON.parse(sink.toString());
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toHaveProperty('amt');
    expect(parsed.rows[0]).toHaveProperty('name');
    expect(parsed._provenance.badges).toHaveLength(1);
  });

  it('provenance 없으면 순수 배열', async () => {
    const { source } = makeSource(ROWS, COLS);
    const sink = new MemoryByteSink();
    await new JsonChannel({ includeProvenance: false }).write(source, sink);
    const parsed = JSON.parse(sink.toString());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });
});

describe('DD-15 XML 채널', () => {
  it('prolog + 루트/행/필드 요소 + 이스케이프', async () => {
    const rows = [{ amt: 5, name: 'a<b' }];
    const { source } = makeSource(rows, [numCol('amt', 'A'), textCol('name', 'N')]);
    const sink = new MemoryByteSink();
    await new XmlChannel({ includeProvenance: false }).write(source, sink);
    const out = sink.toString();
    expect(out).toContain('<?xml version="1.0"');
    expect(out).toContain('<rows>');
    expect(out).toContain('</rows>');
    expect(out).toContain('<name>a&lt;b</name>');
  });
});

describe('DD-15 xlsx 채널(순수 SheetModel + 주입 인코더 SPI)', () => {
  it('SheetModel 값=표시값, 채움색=cf.fill.color(재계산 없음)', async () => {
    const visual = { layer: 'background' as const, fill: { color: '#ff0000', ratio: 0.5 }, inkColor: '#ffffff', ariaSummary: '' };
    const { source } = makeSource(ROWS, COLS, { cfFor: (_r, col) => (col.field === 'amt' ? visual : undefined) });
    const ch = new XlsxChannel({ write: async () => 0 } as IWorkbookWriter);
    const model = await ch.buildModel(source);
    expect(model.header).toEqual(['금액', '이름']);
    expect(model.rows[0]![0]!.fill).toBe('#ff0000');
    expect(model.rows[0]![0]!.ink).toBe('#ffffff');
    expect(model.rows[0]![0]!.num).toBe(1000); // 원값 수치 유지.
  });

  it('병합 스팬을 merges 영역으로(헤더 오프셋 +1)', async () => {
    const { source } = makeSource(ROWS, COLS, {
      placeFor: (r, c) => (r === 0 && c === 0 ? { rowSpan: 2, colSpan: 1, hidden: false } : undefined),
    });
    const ch = new XlsxChannel({ write: async () => 0 } as IWorkbookWriter);
    const model = await ch.buildModel(source);
    expect(model.merges).toContainEqual({ r: 1, c: 0, rs: 2, cs: 1 });
  });

  it('주입 인코더로 바이트 위임(코어 미내장)', async () => {
    let captured: SheetModel | undefined;
    const writer: IWorkbookWriter = {
      write: async (m: SheetModel, sink: IByteSink) => { captured = m; await sink.write('xlsxbytes'); return 9; },
    };
    const { source } = makeSource(ROWS, COLS);
    const sink = new MemoryByteSink();
    const res = await new XlsxChannel(writer).write(source, sink);
    expect(captured?.rows).toHaveLength(2);
    expect(res.bytesWritten).toBe(9);
    expect(sink.toString()).toBe('xlsxbytes');
  });
});

describe('DD-15 ChannelRegistry(DD-10 IRegistry 동형)', () => {
  it('등록/조회 + 미등록 never-throw(undefined)', () => {
    const reg = new ChannelRegistry();
    const csv = new CsvChannel();
    reg.register(csv);
    expect(reg.get('csv')).toBe(csv);
    expect(reg.get('pdf')).toBeUndefined();
    expect(reg.has('csv')).toBe(true);
  });

  it('override(동일 id last-wins) — C1 본문무수정 채널 교체', () => {
    const reg = new ChannelRegistry();
    reg.register(new CsvChannel());
    const custom = new CsvChannel({ bom: false });
    reg.override(custom);
    expect(reg.get('csv')).toBe(custom);
  });
});
