// ============================================================
// DD-15 §3.1 WYSIWYG 파리티 — export 값 = 화면 진실(DisplayFormatter.format 동일 결과). REQ-T3-803.
// ============================================================
import { describe, it, expect } from 'vitest';
import { CTX, makeSource, moneyCol, abbrevCol, textCol, collectRows } from './_helpers.js';
import { CsvChannel } from '../../../src/core/export/channels/CsvChannel.js';
import { MemoryByteSink } from '../../../src/core/export/sinks.js';

describe('DD-15 WYSIWYG 파리티(export = 화면 진실)', () => {
  it('CellArtifact.text = DisplayFormatter.format(...).text 동일 호출(재포맷 금지)', async () => {
    const rows = [{ amt: 1234, name: 'A' }, { amt: -50, name: 'B' }];
    const cols = [moneyCol('amt', '금액'), textCol('name', '이름')];
    const { formatter, source } = makeSource(rows, cols);

    const projected = await collectRows(source);
    // 직접 포맷 호출과 아티팩트가 byte-identical.
    const direct0 = formatter.format({ raw: 1234, field: 'amt', row: rows[0] }, cols[0]!.spec, CTX).text;
    expect(projected[0].cells[0].text).toBe(direct0);
    // 통화 서식이 실제로 걸렸다(raw 1234 ≠ 표시값).
    expect(projected[0].cells[0].text).not.toBe('1234');
    expect(projected[0].cells[0].text).toContain('1,234');
  });

  it('CSV 채널은 raw 가 아니라 CellArtifact.text 를 직렬화(축약 표기 파리티)', async () => {
    const rows = [{ big: 12000 }];
    const cols = [abbrevCol('big', '값')];
    const { formatter, source } = makeSource(rows, cols);

    const sink = new MemoryByteSink();
    await new CsvChannel({ bom: false, includeProvenance: false }).write(source, sink);
    const out = sink.toString();

    const displayText = formatter.format({ raw: 12000, field: 'big', row: rows[0] }, cols[0]!.spec, CTX).text;
    // 축약된 표시값(예 "12K")이 CSV 에 그대로 — raw 12000 재조회가 아님.
    expect(out).toContain(displayText);
    expect(displayText).not.toBe('12000');
  });

  it('preserveRaw 옵션 시 rawText(원값) 로 직렬화(값 보존 export)', async () => {
    const rows = [{ big: 12000 }];
    const cols = [abbrevCol('big', '값')];
    const { source } = makeSource(rows, cols);
    const sink = new MemoryByteSink();
    await new CsvChannel({ bom: false, includeProvenance: false, preserveRaw: true, includeHeader: false })
      .write(source, sink);
    // 축약 원값 rawText = "12000".
    expect(sink.toString().trim()).toBe('12000');
  });

  it('cf VisualSpec 는 상류 인스턴스 그대로 동행(재계산 없음)', async () => {
    const visual = {
      layer: 'background' as const, fill: { color: '#ff0000', ratio: 0.8 },
      inkColor: '#ffffff', ariaSummary: '80%',
    };
    const { source } = makeSource([{ amt: 100 }], [moneyCol('amt', '금액')], {
      cfFor: () => visual,
    });
    const rows = await collectRows(source);
    // 동일 인스턴스(참조 동일) — 채널이 상류 확정 색을 그대로 각인.
    expect(rows[0].cells[0].cf).toBe(visual);
    expect(rows[0].cells[0].cf.inkColor).toBe('#ffffff');
  });

  it('includeCF:false 면 cf 미투영(CSV 등 색 미표현 채널)', async () => {
    const visual = { layer: 'background' as const, inkColor: '#000', ariaSummary: '' };
    const { source } = makeSource([{ amt: 100 }], [moneyCol('amt', '금액')], { cfFor: () => visual });
    const rows = await collectRows(source, { includeCF: false });
    expect(rows[0].cells[0].cf).toBeUndefined();
  });
});
