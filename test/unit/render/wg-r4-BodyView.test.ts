/**
 * 걸음 R4 — 본문 뷰(BodyView)의 폭 계산이 컬럼 기하 질문으로 바뀌었는가.
 * 테스트 설계서 §10-1 R4 줄: GD 바이트 같음(wg-golden-dom 이 맡음) · AR-01·02·03(여기서는 본문 파일 몫) +
 * 본문 쪽 대조(옛 공식 사본 legacy-controls 와 실제 DOM 값이 같은가 — U-GEO-24·U-EXT-09 의 본문판).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenGrid } from '../../../src/core/OpenGrid.js';
import { installSceneEnv, makeSceneContainer, tick, disposeScene, cols, rows, ROW_H, HEADER_H } from '../wg-helpers/scenes.js';
import { legacyFrozenLeft, legacyTotalColWidth, legacyExtraWidth } from '../wg-helpers/legacy-controls.js';

const ROOT = path.resolve(__dirname, '../../..');
const BODY_DIR = path.join(ROOT, 'src/core/render/body');
const PRE_BODY = path.join(ROOT, 'sessions/widegrid-perf-2026-11/steps/R4/L35/pre/src/core/render/body/BodyView.ts');

/** 주석만 지운다(문자열 안 // 는 이 파일들에 URL 이 없어 단순 처리로 충분). */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const AR01 = [/(?:\+=|\+)\s*(?:24|18|44|36|28)\b/g, /stateColumn\s*\?\s*\d+/g, /rowNumber\s*\?\s*\d+/g];
const AR02 = [/left\s*\+=\s*[^;]*(?:width|Width)/g, /frozenLeft|stickyLeft\s*\+=/g];
const AR03 = [/\bwidths\s*\[/g];
/** 이름을 바꿔 피하는 누적도 잡는다(옛 extraBodyLeft·frozenLeftOff·leftOff·_ew). */
const LOCAL_ACC = [/\b(?:extraBodyLeft|frozenLeftOff|leftOff|_ew|extraW)\s*\+=/g, /DETAIL_COL_W/g];

function count(src: string, res: RegExp[]): number {
  return res.reduce((n, re) => n + (strip(src).match(re)?.length ?? 0), 0);
}

function bodyFiles(): string[] {
  return fs.readdirSync(BODY_DIR).filter(f => f.endsWith('.ts')).map(f => path.join(BODY_DIR, f));
}

describe('R4 본문 — 폭 지식이 본문 파일에 남지 않음 (AR 본문 몫)', () => {
  it('AR-01 render/body/* 에 여분 폭 상수 더하기 0', () => {
    for (const f of bodyFiles()) expect(count(fs.readFileSync(f, 'utf8'), AR01), f).toBe(0);
  });
  it('AR-02 render/body/* 에 고정 left 누적 0', () => {
    for (const f of bodyFiles()) expect(count(fs.readFileSync(f, 'utf8'), AR02), f).toBe(0);
  });
  it('AR-03 render/body/* 에 widths[ 직접 읽기 0', () => {
    for (const f of bodyFiles()) expect(count(fs.readFileSync(f, 'utf8'), AR03), f).toBe(0);
  });
  it('AR-01·02 덤 — 옛 지역 누적 이름·디테일 폭 상수 0', () => {
    for (const f of bodyFiles()) expect(count(fs.readFileSync(f, 'utf8'), LOCAL_ACC), f).toBe(0);
  });
  it('AR 대조군 — 같은 정규식이 걸음 전 사본에서는 잡는다(검사기가 살아 있음)', () => {
    if (!fs.existsSync(PRE_BODY)) return; // 사본이 없는 판(정리 뒤)에서는 대조군 생략
    const pre = fs.readFileSync(PRE_BODY, 'utf8');
    expect(count(pre, AR01)).toBeGreaterThan(0);
    expect(count(pre, AR03)).toBeGreaterThan(0);
    expect(count(pre, LOCAL_ACC)).toBeGreaterThan(0);
  });
});

// ─── 실제 그리드 길: 본문 DOM 값 = 옛 공식 사본 ─────────────────────────
let restore: () => void;
beforeAll(() => { restore = installSceneEnv(); });
afterAll(() => restore());

function px(s: string): number { return parseFloat(s); }

async function mount(options: Record<string, any>, data = rows(40)) {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, { rowHeight: ROW_H, headerHeight: HEADER_H, ...options } as any);
  grid.setData(data);
  await tick();
  return { grid, container };
}

const WIDTHS = [120, 90, 133, 75, 120, 120, 120, 120];
function colsW(): Array<Record<string, any>> {
  return cols().map((c, i) => ({ ...c, width: WIDTHS[i] }));
}

describe('R4 본문 — DOM 값이 옛 공식과 같다 (U-GEO-24·U-EXT-09 본문판)', () => {
  const combos: Array<Record<string, boolean>> = [
    {}, { rowNumber: true }, { stateColumn: true, checkColumn: true },
    { stateColumn: true, draggable: true, rowNumber: true, checkColumn: true },
  ];
  for (const ex of combos) {
    it(`R4-BODY-01 고정 칸 sticky left · 여분 칸 left · 본문 min-width (${Object.keys(ex).join('+') || '여분 없음'})`, async () => {
      const m = await mount({ columns: colsW(), frozenColumns: 3, ...ex });
      try {
        const body = m.container.querySelector<HTMLElement>('.og-body')!;
        expect(px(body.style.minWidth)).toBe(legacyTotalColWidth(WIDTHS, 8, ex, false));
        const row = m.container.querySelector<HTMLElement>('.og-row')!;
        const cells = Array.from(row.querySelectorAll<HTMLElement>('.og-cell[role=gridcell]'));
        for (let i = 0; i < 3; i++) {
          expect(cells[i]!.style.position).toBe('sticky');
          expect(px(cells[i]!.style.left)).toBe(legacyFrozenLeft(WIDTHS, ex, false, i));
        }
        expect(cells[3]!.style.left).toBe('');
        // 여분 칸 left: 옛 누적(state 0 → +24 → +18 → +44 → +36)
        const order: Array<[string, number, boolean | undefined]> = [
          ['.og-col-state', 24, ex.stateColumn], ['.og-drag-handle', 18, ex.draggable],
          ['.og-col-rownum', 44, ex.rowNumber], ['.og-col-check', 36, ex.checkColumn],
        ];
        let acc = 0;
        for (const [sel, w, on] of order) {
          if (!on) continue;
          const el = row.querySelector<HTMLElement>(sel);
          if (el) expect(px(el.style.left), sel).toBe(acc);
          acc += w;
        }
        expect(acc).toBe(legacyExtraWidth(ex, false));
      } finally { disposeScene(m); }
    });
  }

  it('R4-BODY-02 가로 병합 폭 = 옛 합 · 세로 병합 마스터 left = 옛 누적', async () => {
    const ex = { rowNumber: true, checkColumn: true };
    const m = await mount({ columns: colsW(), ...ex });
    try {
      m.grid.mergeCells([{ row: 0, col: 1, colSpan: 3 }, { row: 2, col: 2, rowSpan: 3 }]);
      await tick();
      const c01 = m.container.querySelector<HTMLElement>('.og-cell[aria-colspan="3"]')!;
      expect(px(c01.style.width)).toBe(WIDTHS[1]! + WIDTHS[2]! + WIDTHS[3]!);
      const master = m.container.querySelector<HTMLElement>('.og-cell[aria-rowspan="3"]')!;
      expect(master.style.position).toBe('absolute');
      expect(px(master.style.left)).toBe(legacyFrozenLeft(WIDTHS, ex, false, 2));
    } finally { disposeScene(m); }
  });

  it('R4-BODY-03 가로 병합이 마지막 컬럼을 넘으면 넘은 몫은 기본 폭(지금 동작 그대로)', async () => {
    const m = await mount({ columns: colsW(), defaultColumnWidth: 77 });
    try {
      m.grid.mergeCells([{ row: 0, col: 6, colSpan: 4 }]);
      await tick();
      const c = m.container.querySelector<HTMLElement>('.og-cell[aria-colspan="4"]')!;
      expect(px(c.style.width)).toBe(WIDTHS[6]! + WIDTHS[7]! + 77 + 77);
    } finally { disposeScene(m); }
  });

  it('R4-BODY-04 마운트 뒤 draggable 만 켜면(끌기 관리자 없음) 손잡이 없이 뒤 여분 칸 left 가 당겨진 지금 자리', async () => {
    const m = await mount({ columns: colsW(), frozenColumns: 1, stateColumn: true, rowNumber: true });
    try {
      m.grid.setOptions({ draggable: true } as any);
      await tick();
      const row = m.container.querySelector<HTMLElement>('.og-row')!;
      expect(row.querySelector('.og-drag-handle')).toBeNull();
      expect(px(row.querySelector<HTMLElement>('.og-col-rownum')!.style.left)).toBe(24);
    } finally { disposeScene(m); }
  });

  it('R4-BODY-05 묶음 행 여분 자리 칸 폭 = 여분 합', async () => {
    const ex = { stateColumn: true, rowNumber: true };
    const data = rows(30, 8, (r, o) => { o.c0 = `g${r % 3}`; });
    const m = await mount({ columns: colsW(), ...ex }, data);
    m.grid.groupBy(['c0']);
    await tick();
    try {
      const st = m.container.querySelector<HTMLElement>('.og-group-state-cell')!;
      expect(px(st.style.width)).toBe(legacyExtraWidth(ex, false));
      const gc = Array.from(m.container.querySelector('.og-group-row')!.querySelectorAll<HTMLElement>('.og-group-cell'));
      expect(gc.map(e => px(e.style.width))).toEqual(WIDTHS);
    } finally { disposeScene(m); }
  });
});
