/**
 * 걸음 R5 — 본문 행 종류 분기 → RowPainterTable + 행 그리개, 여분 칸 if 다섯 → ExtraCellPainter.
 * 테스트 설계서 §10-1 R5 줄: U-ROW-01~07·09 · U-XCP-01~07 · GD-06·07·08 같음.
 * (U-ROW-04~07 은 골든 사진 대조 — wg-golden-dom 과 같은 비교를 이 걸음 번호로 다시 건다.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RowPainterTable } from '../../../src/core/render/body/rows/RowPainterTable.js';
import type { BodyRowContext, BodyRowPainter } from '../../../src/core/render/body/rows/BodyRowContext.js';
import { createExtraCellPainters } from '../../../src/core/render/body/ExtraCellPainters.js';
import { ColumnGeometry } from '../../../src/core/coordinate/ColumnGeometry.js';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import { SCENES, installSceneEnv, disposeScene } from '../wg-helpers/scenes.js';
import { goldenSnapshot, unformatGolden } from '../wg-helpers/dom-snapshot.js';

const ROOT = path.resolve(__dirname, '../../..');
const GOLDEN_DIR = path.join(ROOT, 'test/unit/__golden__/wg');

function painter(kind: any): BodyRowPainter {
  return { kind, paint: () => null };
}

describe('U-ROW — 행 종류 표', () => {
  const table = new RowPainterTable([painter('data'), painter('group'), painter('detail-head'), painter('detail-filler')]);

  it('U-ROW-01 kindOf: 자료 / 묶음 / 디테일 머리 / 디테일 채움 (+ 합성 배열 없음·끝 너머 = 자료, 나무 노드 = 자료)', () => {
    expect(table.kindOf({ c0: 'x' })).toBe('data');
    expect(table.kindOf({ _isGroup: true })).toBe('group');
    expect(table.kindOf({ _isDetailHead: true, _span: 2 })).toBe('detail-head');
    expect(table.kindOf({ _isDetailFiller: true })).toBe('detail-filler');
    expect(table.kindOf(null)).toBe('data');
    expect(table.kindOf(undefined)).toBe('data');
    expect(table.kindOf({ _isTree: true, data: {} })).toBe('data');
    // 참거짓이 아니라 === true 로 본다(지금 코드와 같음)
    expect(table.kindOf({ _isGroup: 1 })).toBe('data');
  });

  it('U-ROW-02 종류별 하나: painterFor 두 번이 같은 인스턴스', () => {
    expect(table.painterFor('data')).toBe(table.painterFor('data'));
    expect(table.painterFor('group')).not.toBe(table.painterFor('data'));
  });

  it('U-ROW-09 없는 종류는 던진다', () => {
    expect(() => table.painterFor('x' as any)).toThrow(/no row painter/);
  });
});

// ─── 실제 그리드 길 ─────────────────────────────────────────────
let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

function scene(id: string) {
  const s = SCENES.find(x => x.id === id);
  if (!s) throw new Error(id);
  return s.make;
}

describe('U-ROW-04~07 — 행 그리개로 옮긴 뒤 골든 사진과 바이트 같음', () => {
  const cases: Array<[string, string]> = [
    ['U-ROW-04', 'GD-01'], ['U-ROW-04', 'GD-02'], ['U-ROW-04', 'GD-03'],
    ['U-ROW-05', 'GD-06'], ['U-ROW-06', 'GD-07'], ['U-ROW-07', 'GD-08'],
  ];
  for (const [no, id] of cases) {
    it(`${no} ${id} 사진 == 골든`, async () => {
      const s = await scene(id)();
      try {
        const golden = unformatGolden(fs.readFileSync(path.join(GOLDEN_DIR, `${id}.html`), 'utf8'));
        expect(goldenSnapshot(s.container) === golden).toBe(true);
      } finally { disposeScene(s); }
    });
  }
});

describe('U-ROW-03 — 멱등: 같은 행·자료·문맥으로 두 번 그리면 같은 DOM', () => {
  for (const id of ['GD-02', 'GD-06', 'GD-07', 'GD-08']) {
    it(`U-ROW-03 ${id} 의 모든 종류 그리개`, async () => {
      const s = await scene(id)();
      try {
        const table: RowPainterTable = (s.grid as any)._renderer._bodyView._rows;
        const seen: Array<{ p: BodyRowPainter; ri: number; item: any; ctx: BodyRowContext; html: string }> = [];
        for (const kind of ['data', 'group', 'detail-head'] as const) {
          const p = table.painterFor(kind);
          const orig = p.paint.bind(p);
          (p as any).paint = (ri: number, item: any, ctx: BodyRowContext) => {
            const el = orig(ri, item, ctx);
            if (el) seen.push({ p, ri, item, ctx: { ...ctx }, html: el.outerHTML });
            return el;
          };
        }
        (s.grid as any)._doRender(...(s.grid as any)._visRange());
        expect(seen.length).toBeGreaterThan(0);
        for (const { p, ri, item, ctx, html } of seen.slice(0, 12)) {
          const again = p.paint(ri, item, { ...ctx, frag: document.createDocumentFragment() });
          expect(again!.outerHTML, `${id} ${p.kind} 행 ${ri}`).toBe(html);
        }
      } finally { disposeScene(s); }
    });
  }
});

// ─── 여분 칸 그리개(단위) ─────────────────────────────────────────
type CtxOver = Partial<BodyRowContext>;
function ctxOf(over: CtxOver = {}, extraOpts: Record<string, boolean> = {}): BodyRowContext {
  const extra = ExtraColumns.fromOptions({ stateColumn: true, draggable: true, rowNumber: true, checkColumn: true, detailExpanderCol: true, ...extraOpts });
  return {
    opts: { _totalRows: 100 } as any, data: null as any, leaves: [], startIndex: 0, endIndex: 9, offsetY: 0,
    selectedRows: new Set(), checkedRows: new Set(), groupFlatRows: null,
    mergeEngine: undefined, detailApi: undefined, detailColOn: false, auto: false, frozenCount: 0,
    geometry: new ColumnGeometry([120, 120], extra, 0), totalColWidth: 0, frag: document.createDocumentFragment(),
    extraIds: extra.ids,
    extraLeft: { state: extra.leftOf('state'), drag: extra.leftOf('drag'), rowNumber: extra.leftOf('rowNumber'), check: extra.leftOf('check'), detail: extra.leftOf('detail') },
    extraWidth: extra.width(), dragWidth: extra.widthOf('drag'), detailWidth: extra.widthOf('detail'),
    applier: undefined, trackBar: undefined,
    rowState: 'none', bg: 'red', dnd: null, dragGap: 0, cellCi: 0, cellSpan: 1, ...over,
  };
}
const cbs: any = { onRowCheck: () => {} };
const tr = (k: string, p?: Record<string, string | number>) => `${k}:${p ? JSON.stringify(p) : ''}`;

describe('U-XCP — 여분 칸 그리개', () => {
  const P = createExtraCellPainters(cbs, tr);

  it('U-XCP-01 상태 칸: added/edited/removed/none 기호·색·title·클래스', () => {
    const exp: Record<string, [string, string]> = {
      added: ['✚', 'rgb(46, 125, 50)'], edited: ['✎', 'rgb(191, 54, 12)'], removed: ['✖', 'rgb(198, 40, 40)'], none: ['', ''],
    };
    for (const st of Object.keys(exp)) {
      const row = document.createElement('div');
      P.state.paint(row, 0, {}, ctxOf({ rowState: st }));
      const c = row.firstElementChild as HTMLElement;
      expect(c.className).toBe('og-cell og-col-state');
      expect(c.textContent).toBe(exp[st]![0]);
      expect(c.style.color).toBe(exp[st]![1]);
      expect(c.title).toBe(st);
      expect(c.style.position).toBe('');
    }
  });

  it('U-XCP-02 끌기 손잡이: attachHandle(row, ri, _totalRows) 결과를 붙임 · 관리자 없으면 안 그림', () => {
    const calls: any[] = [];
    const h = document.createElement('div'); h.className = 'og-drag-handle';
    const dnd: any = { attachHandle: (row: HTMLElement, ri: number, total: number) => { calls.push([row, ri, total]); return h; } };
    const row = document.createElement('div');
    P.drag.paint(row, 3, {}, ctxOf({ dnd }));
    expect(calls).toEqual([[row, 3, 100]]);
    expect(row.firstElementChild).toBe(h);
    const row2 = document.createElement('div');
    P.drag.paint(row2, 3, {}, ctxOf({ dnd: null }));
    expect(row2.childElementCount).toBe(0);
    // _totalRows 가 없으면 endIndex + 1
    const row3 = document.createElement('div');
    P.drag.paint(row3, 1, {}, ctxOf({ dnd, opts: {} as any, endIndex: 41 }));
    expect(calls[1][2]).toBe(42);
  });

  it('U-XCP-03 행번호: 행 0·99 → "1"·"100"', () => {
    for (const [ri, txt] of [[0, '1'], [99, '100']] as const) {
      const row = document.createElement('div');
      P.rowNumber.paint(row, ri, {}, ctxOf());
      const c = row.firstElementChild as HTMLElement;
      expect(c.className).toBe('og-cell og-col-rownum');
      expect(c.textContent).toBe(txt);
    }
  });

  it('U-XCP-04 체크: 체크됨/안 됨 · aria-label · change 가 onRowCheck(ri, checked)', () => {
    const got: any[] = [];
    const Pc = createExtraCellPainters({ onRowCheck: (ri: number, v: boolean) => got.push([ri, v]) } as any, tr);
    for (const on of [true, false]) {
      const row = document.createElement('div');
      Pc.check.paint(row, 5, {}, ctxOf({ checkedRows: new Set(on ? [5] : []) }));
      const box = row.querySelector('input') as HTMLInputElement;
      expect(row.firstElementChild!.className).toBe('og-cell og-col-check');
      expect(box.type).toBe('checkbox');
      expect(box.checked).toBe(on);
      expect(box.getAttribute('aria-label')).toBe('row.selectAria:{"n":6}');
      box.checked = !on;
      box.dispatchEvent(new Event('change'));
    }
    expect(got).toEqual([[5, false], [5, true]]);
  });

  it('U-XCP-05 디테일 토글: 펼침/접힘 글리프 · 행 aria-expanded · 폭 = 디테일 컬럼 폭 · 디테일 칸 꺼짐이면 안 그림', () => {
    for (const expanded of [true, false]) {
      const detailApi: any = {
        getRowId: (r: any) => r.id, isExpanded: () => expanded, onToggle: () => {},
        getGlyph: (e: boolean) => ({ glyph: e ? '▾' : '▸', ariaLabel: e ? 'close' : 'open', title: 't' }),
      };
      const row = document.createElement('div');
      P.detail.paint(row, 2, { id: 'r7' }, ctxOf({ detailApi, detailColOn: true }));
      const c = row.firstElementChild as HTMLElement;
      expect(c.className).toBe('og-cell og-col-detail-toggle');
      expect(c.querySelector('.og-detail-expander')!.textContent).toBe(expanded ? '▾' : '▸');
      expect(row.getAttribute('aria-expanded')).toBe(expanded ? 'true' : 'false');
      expect(c.style.width).toBe('28px');
      expect(c.style.minWidth).toBe('28px');
    }
    const row = document.createElement('div');
    P.detail.paint(row, 2, { id: 'r7' }, ctxOf({ detailColOn: false }));
    expect(row.childElementCount).toBe(0);
  });

  it('U-XCP-06 고정 left: 다섯 다 켬 + 고정 → 0·24·42·86·122 = ExtraColumns.leftOf(id), z-index 2, 배경 = 행 배경', () => {
    const h = document.createElement('div');
    const ctx = ctxOf({
      frozenCount: 1, dnd: { attachHandle: () => h } as any, detailColOn: true,
      detailApi: { getRowId: () => 'a', isExpanded: () => false, onToggle: () => {}, getGlyph: () => ({ glyph: '▸', ariaLabel: '', title: '' }) } as any,
    });
    const row = document.createElement('div');
    for (const id of ctx.geometry.extra.ids) P[id].paint(row, 0, {}, ctx);
    const kids = Array.from(row.children) as HTMLElement[];
    expect(kids.map(k => k.style.left)).toEqual(['0px', '24px', '42px', '86px', '122px']);
    expect(ctx.geometry.extra.ids.map(id => `${ctx.geometry.extra.leftOf(id)}px`)).toEqual(kids.map(k => k.style.left));
    for (const k of kids) {
      expect(k.style.position).toBe('sticky');
      expect(k.style.zIndex).toBe('2');
      expect(k.style.background).toBe('red');
    }
  });

  it('U-XCP-06 덤: 손잡이를 못 그린 행은 뒤 칸 left 를 끌기 폭만큼 당긴다(dragGap)', () => {
    const ctx = ctxOf({ frozenCount: 1, dragGap: 18 });
    const row = document.createElement('div');
    P.rowNumber.paint(row, 0, {}, ctx);
    P.check.paint(row, 0, {}, ctx);
    expect(Array.from(row.children).map(k => (k as HTMLElement).style.left)).toEqual(['24px', '68px']);
  });

  it('U-XCP-07 그리개 파일에 여분 폭 숫자 글자 0 (24·18·44·36·28)', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const dir = path.join(ROOT, 'src/core/render/body');
    const files = [path.join(dir, 'ExtraCellPainters.ts'), path.join(dir, 'BodyView.ts'),
      ...fs.readdirSync(path.join(dir, 'rows')).map(f => path.join(dir, 'rows', f))];
    for (const f of files) {
      const hits = strip(fs.readFileSync(f, 'utf8')).match(/\b(?:24|18|44|36|28)\b/g) ?? [];
      expect(hits, f).toEqual([]);
    }
    // 대조군: 같은 검사가 옛 꼴을 잡는다
    expect(('let w = 0; w += 24;').match(/\b(?:24|18|44|36|28)\b/g)).not.toBeNull();
  });
});
