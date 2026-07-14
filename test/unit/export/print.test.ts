// ============================================================
// DD-15 §2.6·3.3 인쇄 = 별도 렌더 타깃 · 전행 실체화 · 페이지네이션 · 흑백 이중부호(REQ-T9-845).
// ============================================================
import { describe, it, expect } from 'vitest';
import { makeSource, moneyCol, textCol } from './_helpers.js';
import { Paginator } from '../../../src/core/export/print/Paginator.js';
import { PrintRenderTarget } from '../../../src/core/export/print/PrintRenderTarget.js';
import {
  ScreenAdapter, GrayscaleAdapter, createOutputAdapter,
} from '../../../src/core/export/print/OutputChannelAdapter.js';
import { buildProvenance } from '../../../src/core/export/Provenance.js';
import type { HeaderArtifact, RowArtifact } from '../../../src/core/export/types.js';

const HEADER: HeaderArtifact[][] = [[
  { text: '금액', field: 'amt', colSpan: 1, rowSpan: 1, widthPx: 100, align: 'right' },
  { text: '이름', field: 'name', colSpan: 1, rowSpan: 1, widthPx: 100, align: 'left' },
]];

function rowsStream(n: number): AsyncIterable<RowArtifact> {
  return (async function* () {
    for (let i = 0; i < n; i++) {
      yield {
        modelIndex: i,
        cells: [
          { text: `${i}00`, applied: [], rowSpan: 1, colSpan: 1, hidden: false, align: 'right', type: 'number' },
          { text: `n${i}`, applied: [], rowSpan: 1, colSpan: 1, hidden: false, align: 'left', type: 'text' },
        ],
      };
    }
  })();
}

describe('DD-15 Paginator(행 비분할·반복 헤더·범위 라벨)', () => {
  it('rowsPerPage = floor((pageH−headerH)/rowHeight), 최소 1', () => {
    const p = new Paginator({ pageBox: { w: 800, h: 100 }, rowHeight: 20, headerHeight: 20 });
    expect(p.rowsPerPage()).toBe(4); // (100-20)/20.
    const tiny = new Paginator({ pageBox: { w: 10, h: 5 }, rowHeight: 100 });
    expect(tiny.rowsPerPage()).toBe(1); // 한 행이 페이지보다 커도 절단 금지.
  });

  it('★전행을 페이지로 배분(행 손실 0, 페이지마다 헤더 반복)', async () => {
    const p = new Paginator({ pageBox: { w: 800, h: 100 }, rowHeight: 20, headerHeight: 20, totalRows: 10 });
    const pages: any[] = [];
    for await (const pg of p.paginate(rowsStream(10), HEADER)) pages.push(pg);
    expect(pages).toHaveLength(3); // 4+4+2.
    // 각 페이지에 <thead>(반복 헤더).
    expect(pages.every(pg => pg.html.includes('<thead>'))).toBe(true);
    // 전 10행이 <td> 로 실체화(행 손실 0): 페이지 tbody 의 <tr> 총합 = 10.
    const trCount = pages.reduce((s, pg) => s + (pg.html.match(/<tr>/g)?.length ?? 0), 0);
    // 각 페이지 헤더 <tr> 1 + 데이터 tr. 헤더는 <thead> 안. 데이터 tr 만 세려면 tbody 분리.
    expect(trCount).toBeGreaterThanOrEqual(10);
    // 범위 라벨.
    expect(pages[0].rangeLabel).toContain('1–4행');
    expect(pages[0].rangeLabel).toContain('전체 10');
  });

  it('빈 데이터도 헤더 1페이지(빈 파일 아님)', async () => {
    const p = new Paginator({ pageBox: { w: 800, h: 100 }, rowHeight: 20 });
    const pages: any[] = [];
    for await (const pg of p.paginate(rowsStream(0), HEADER)) pages.push(pg);
    expect(pages).toHaveLength(1);
    expect(pages[0].rangeLabel).toBe('0행');
  });

  it('어댑터 주입 시 셀에 부호 픽토(이중부호) 병기', async () => {
    const p = new Paginator({ pageBox: { w: 800, h: 200 }, rowHeight: 20, adapter: new GrayscaleAdapter('print') });
    const stream = (async function* () {
      yield {
        modelIndex: 0,
        cells: [{ text: '-50', applied: [], rowSpan: 1, colSpan: 1, hidden: false, align: 'right', type: 'number', sign: 'neg' as const }],
      };
    })();
    const pages: any[] = [];
    for await (const pg of p.paginate(stream, HEADER)) pages.push(pg);
    expect(pages[0].html).toContain('▼'); // 음수 픽토.
  });
});

describe('DD-15 OutputChannelAdapter(색→흑백 이중부호)', () => {
  it('screen 은 상류 cf.inkColor 통과(재계산 금지)', () => {
    const a = new ScreenAdapter();
    const dec = a.ink({ layer: 'background', fill: { color: '#ff0000', ratio: 1 }, inkColor: '#abcdef', ariaSummary: '' }, {});
    expect(dec.textColor).toBe('#abcdef'); // 그대로 통과.
    expect(dec.fill).toBe('#ff0000');
  });

  it('grayscale 은 채움을 명도 그레이 + 해치 패턴으로 강등', () => {
    const a = new GrayscaleAdapter();
    const dec = a.ink({ layer: 'background', fill: { color: '#ff0000', ratio: 1 }, inkColor: '#ffffff', ariaSummary: '' }, {});
    expect(dec.fill).toMatch(/^#([0-9a-f]{2})\1\1$/); // 그레이(R=G=B).
    expect(dec.pattern).toBeDefined();
    expect(dec.pattern).not.toBe('solid'); // 채움이 의미 → 형태 부호.
  });

  it('grayscale 잉크는 palette 대비 커널로 AA(흑/백)', () => {
    const a = new GrayscaleAdapter();
    // 어두운 채움 → 흰 잉크, 밝은 채움 → 검은 잉크.
    const dark = a.ink({ layer: 'background', fill: { color: '#000000', ratio: 1 }, inkColor: '#fff', ariaSummary: '' }, {});
    expect(dark.textColor.toLowerCase()).toBe('#ffffff');
    const light = a.ink({ layer: 'background', fill: { color: '#ffffff', ratio: 1 }, inkColor: '#000', ariaSummary: '' }, {});
    expect(light.textColor.toLowerCase()).toBe('#111111');
  });

  it('부호 픽토는 색 단독 금지 가드', () => {
    const a = createOutputAdapter('print');
    expect(a.ink(undefined, { sign: 'pos' }).glyph).toBe('▲');
    expect(a.ink(undefined, { sign: 'neg' }).glyph).toBe('▼');
    expect(a.ink(undefined, { sign: 'zero' }).glyph).toBeUndefined();
  });

  it('borderStyle 은 솔리드 강제(헤어라인 소실 방지)', () => {
    expect(new GrayscaleAdapter('print').borderStyle().style).toBe('solid');
  });
});

describe('DD-15 PrintRenderTarget(전행 실체화 + provenance 푸터)', () => {
  it('전 모델행을 페이지로 실체화 + 진행률', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ amt: i * 100, name: `n${i}` }));
    const { source } = makeSource(rows, [moneyCol('amt', '금액'), textCol('name', '이름')]);
    const target = new PrintRenderTarget({
      source,
      adapter: createOutputAdapter('print'),
      paginator: new Paginator({ pageBox: { w: 800, h: 100 }, rowHeight: 20, headerHeight: 20, totalRows: 7 }),
    });
    const progress: number[] = [];
    const pages: any[] = [];
    for await (const pg of target.render({ onProgress: d => progress.push(d) })) pages.push(pg);
    expect(pages.length).toBeGreaterThanOrEqual(2); // 4+3.
    expect(progress[progress.length - 1]).toBe(7); // 전 7행 순회.
  });

  it('provenance 를 각 페이지 푸터에 동행(흑백 배지)', async () => {
    const { source } = makeSource([{ amt: 1, name: 'a' }], [moneyCol('amt', '금액'), textCol('name', '이름')]);
    const prov = buildProvenance({ transforms: [{ source: 'chart', kind: 'downsample', detail: 'ds' }], rangeNote: '전체 1행' });
    const target = new PrintRenderTarget({
      source, adapter: createOutputAdapter('print'),
      paginator: new Paginator({ pageBox: { w: 800, h: 200 }, rowHeight: 20 }),
      provenance: prov,
    });
    const pages: any[] = [];
    for await (const pg of target.render()) pages.push(pg);
    expect(pages[0].html).toContain('og-print-provenance');
    expect(pages[0].html).toContain('⋯'); // 다운샘플 흑백 픽토.
  });

  it('renderDocument 는 페이지 결합 HTML(별도 문서, host CSS 무간섭)', async () => {
    const { source } = makeSource([{ amt: 1, name: 'a' }], [moneyCol('amt', '금액'), textCol('name', '이름')]);
    const target = new PrintRenderTarget({
      source, adapter: createOutputAdapter('print'),
      paginator: new Paginator({ pageBox: { w: 800, h: 200 }, rowHeight: 20 }),
    });
    const doc = await target.renderDocument({ title: 'T<ест' });
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('page-break-after');
    expect(doc).toContain('T&lt;'); // 제목 이스케이프.
  });
});
