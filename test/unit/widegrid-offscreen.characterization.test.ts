/**
 * [특성 테스트] 화면 밖 컬럼에 닿는 공개 동작 — 가로 가상화(화면 밖 칸을 안 만들기)가 깨뜨릴 수 있는 것.
 *
 * 기준: 50컬럼 × 폭 120 = 6000px 짜리 표를 600px 컨테이너에 띄운다. 화면에 들어오는 건 앞쪽 4~5컬럼뿐.
 * 잡으려는 깨짐: 화면 밖 칸이 DOM 에 없어졌을 때
 *   - 키보드 포커스 이동(→, End, Ctrl+End, Tab)이 끝 컬럼에 닿지 못하거나 엉뚱한 값을 복사
 *   - 편집 시작이 화면 밖 칸에서 안 되거나 다른 컬럼 이름으로 나감
 *   - 범위 선택·복사·내보내기·찾기·푸터 합계가 「그려진 칸」만 보고 계산되어 값이 빠짐
 *   - 병합·디테일 행이 화면 밖 컬럼에서 끊김
 *
 * 관찰 수단은 DOM 이 아니라 공개 결과뿐이다: 클립보드에 쓰인 글자(Ctrl+C), editStart 이벤트 인자,
 * getRangeValues(), rangeCopy 이벤트, 내려받기 파일 내용, getData() 길이, getFooterValue(), readCell().
 * 그래서 가로 가상화로 화면 밖 칸이 DOM 에서 사라져도 이 테스트는 그대로 통과해야 한다.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installResizeObserverStub, installClipboardSpy, captureDownloads, makeGrid, settle, key,
  wideColumns, wideRows,
} from './widegrid-helpers.js';

beforeAll(() => installResizeObserverStub());

const COLS = 50;
const ROWS = 5;
let clip: { writes: string[] };
beforeEach(() => { clip = installClipboardSpy(); });

async function wide(extra: Record<string, any> = {}) {
  const r = makeGrid({ columns: wideColumns(COLS), ...extra }, wideRows(ROWS, COLS));
  await settle();
  return r;
}

/** 포커스 칸의 값을 Ctrl+C 로 꺼낸다(포커스 칸 → 클립보드 경로는 공개 동작). */
async function copyFocused(container: HTMLElement): Promise<string | undefined> {
  const before = clip.writes.length;
  key(container, 'c', { ctrlKey: true });
  await settle();
  return clip.writes.length > before ? clip.writes[clip.writes.length - 1] : undefined;
}

describe('키보드 포커스 이동이 화면 밖 컬럼까지 닿는다(K-01~K-07)', () => {
  it('K-01 첫 → 는 (0,0) 칸에 포커스', async () => {
    const { container } = await wide();
    key(container, 'ArrowRight');
    expect(await copyFocused(container)).toBe('r0c0');
  });

  it('K-02 → 를 49번 더 누르면 마지막(화면 밖) 컬럼 c49', async () => {
    const { container } = await wide();
    key(container, 'ArrowRight');
    for (let i = 0; i < COLS - 1; i++) key(container, 'ArrowRight');
    expect(await copyFocused(container)).toBe('r0c49');
  });

  it('K-03 마지막 컬럼에서 → 는 다음 행 첫 컬럼으로 넘어간다', async () => {
    const { container } = await wide();
    key(container, 'ArrowRight');
    key(container, 'End');
    key(container, 'ArrowRight');
    expect(await copyFocused(container)).toBe('r1c0');
  });

  it('K-04 End 는 같은 행의 마지막 컬럼(화면 밖)', async () => {
    const { container } = await wide();
    key(container, 'ArrowDown'); // (0,0)
    key(container, 'ArrowDown'); // (1,0)
    key(container, 'End');
    expect(await copyFocused(container)).toBe('r1c49');
  });

  it('K-05 Ctrl+End 는 마지막 행·마지막 컬럼', async () => {
    const { container } = await wide();
    key(container, 'End', { ctrlKey: true });
    expect(await copyFocused(container)).toBe(`r${ROWS - 1}c49`);
  });

  it('K-06 Tab 을 연달아 누르면 화면 밖 컬럼을 하나씩 지나 다음 행으로 넘어간다', async () => {
    const { container } = await wide();
    key(container, 'Tab'); // 포커스 없음 → (0,0)
    for (let i = 0; i < 10; i++) key(container, 'Tab');
    expect(await copyFocused(container)).toBe('r0c10');
    for (let i = 0; i < COLS - 10; i++) key(container, 'Tab');
    expect(await copyFocused(container)).toBe('r1c0');
  });

  it('K-07 Shift+Tab 은 첫 컬럼에서 앞 행 마지막(화면 밖) 컬럼으로', async () => {
    const { container } = await wide();
    key(container, 'ArrowDown');
    key(container, 'ArrowDown'); // (1,0)
    key(container, 'Tab', { shiftKey: true });
    expect(await copyFocused(container)).toBe('r0c49');
  });

  it('K-08 Home 은 화면 밖 컬럼에서 첫 컬럼으로 돌아온다', async () => {
    const { container } = await wide();
    key(container, 'End', { ctrlKey: true });
    key(container, 'Home');
    expect(await copyFocused(container)).toBe(`r${ROWS - 1}c0`);
  });

  it('K-09 cellKeyDown 은 포커스가 있을 때만, 「누르기 전」 포커스 칸의 field·value 로 나온다(화면 밖 칸 포함)', async () => {
    const { grid, container } = await wide();
    const ev: any[] = [];
    grid.on('cellKeyDown', (e: any) => ev.push([e.key, e.field, e.columnIndex, e.value]));
    key(container, 'ArrowRight'); // 포커스 없음 → 이벤트 없음, (0,0) 으로
    key(container, 'End');        // (0,0) 에서 누름
    key(container, 'Tab');        // (0,49) 에서 누름
    expect(ev).toEqual([['End', 'c0', 0, 'r0c0'], ['Tab', 'c49', 49, 'r0c49']]);
  });
});

describe('화면 밖 칸에서 편집 시작(E-01~E-02) — 편집을 시작하는 공개 메서드는 없어 키보드로 연다', () => {
  it('E-01 End 로 화면 밖 컬럼에 가서 Enter → editStart 의 field·columnIndex 가 c49·49', async () => {
    const { grid, container } = await wide({ editable: true });
    const evts: any[] = [];
    grid.on('editStart', (e: any) => evts.push({ field: e.field, columnIndex: e.columnIndex, rowIndex: e.rowIndex }));
    key(container, 'ArrowDown'); // (0,0)
    key(container, 'End');
    key(container, 'Enter');
    await settle();
    expect(evts).toEqual([{ field: 'c49', columnIndex: 49, rowIndex: 0 }]);
  });

  it('E-02 화면 밖 칸을 writeCell 로 바꾸면 readCell·getDisplayValue 가 새 값', async () => {
    const { grid } = await wide();
    grid.writeCell(3, 'c49', '바뀜');
    expect(grid.readCell(3, 'c49')).toBe('바뀜');
    expect(grid.getDisplayValue(3, 'c49')).toBe('바뀜');
  });
});

describe('화면 밖까지 걸친 범위 선택과 복사(R-01~R-03)', () => {
  it('R-01 0행~1행 × c0~c49 범위의 getRangeValues 는 50칸짜리 두 줄', async () => {
    const { grid } = await wide({ selection: 'cells' });
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: COLS - 1 });
    const v = grid.getRangeValues();
    expect(v.length).toBe(2);
    expect(v[0]!.length).toBe(COLS);
    expect(v[0]![49]).toBe('r0c49');
    expect(v[1]![0]).toBe('r1c0');
  });

  it('R-02 그 범위를 Ctrl+C 하면 클립보드는 TSV(탭 49개 × 2줄), rangeCopy 이벤트 글자와 같다', async () => {
    const { grid, container } = await wide({ selection: 'cells' });
    const copies: any[] = [];
    grid.on('rangeCopy', (e: any) => copies.push(e));
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 45, endCol: COLS - 1 });
    key(container, 'c', { ctrlKey: true });
    await settle();
    const expected = ['r0c45\tr0c46\tr0c47\tr0c48\tr0c49', 'r1c45\tr1c46\tr1c47\tr1c48\tr1c49'];
    expect(clip.writes.at(-1)!.split(/\r?\n/).filter(Boolean)).toEqual(expected);
    expect(copies.length).toBe(1);
    expect(copies[0].text).toBe(clip.writes.at(-1));
    expect(copies[0].range).toEqual({ startRow: 0, endRow: 1, startCol: 45, endCol: 49 });
  });

  it('R-03 getRangeStats 는 화면 밖 숫자 칸까지 센다(2행×50열, 값=100×행+열)', async () => {
    const cols = wideColumns(COLS).map(c => ({ ...c, type: 'number' }));
    const data = Array.from({ length: ROWS }, (_, r) => Object.fromEntries(cols.map((c, ci) => [c.field, r * 100 + ci])));
    const { grid } = makeGrid({ columns: cols, selection: 'cells' }, data);
    await settle();
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: COLS - 1 });
    expect(grid.getRangeStats()).toMatchObject({ count: 100, sum: '7450', min: '0', max: '149' });
  });

  it('R-04 글자 칸만 있는 범위의 getRangeStats 는 null 이다', async () => {
    const { grid } = await wide({ selection: 'cells' });
    grid.setRangeSelection({ startRow: 0, endRow: 1, startCol: 0, endCol: COLS - 1 });
    expect(grid.getRangeStats()).toBeNull();
  });
});

describe('내보내기는 화면 밖 컬럼을 포함한다(X-01~X-02)', () => {
  it('X-01 exportCsv: 머리글 50개, 각 행 50칸, 마지막 칸이 c49 값', async () => {
    const { grid } = await wide();
    const dl = captureDownloads();
    try {
      grid.exportCsv('w.csv');
      expect(dl.files.length).toBe(1);
      const text = (await dl.files[0]!.text()).replace(/^﻿/, '');
      const lines = text.split('\n');
      expect(lines.length).toBe(ROWS + 1);
      expect(lines[0]!.split(',').length).toBe(COLS);
      expect(lines[0]!.split(',')[49]).toBe('"H49"');
      expect(lines[1]!.split(',')[49]).toBe('r0c49');
    } finally { dl.restore(); }
  });

  it('X-02 exportJson: 모든 행의 c49 가 들어 있다', async () => {
    const { grid } = await wide();
    const dl = captureDownloads();
    try {
      grid.exportJson('w.json');
      const rows = JSON.parse(await dl.files[0]!.text());
      expect(rows.map((r: any) => r.c49)).toEqual(['r0c49', 'r1c49', 'r2c49', 'r3c49', 'r4c49']);
    } finally { dl.restore(); }
  });
});

describe('찾기 바가 화면 밖 칸까지 찾는다(F-01)', () => {
  it('F-01 c49 에만 있는 글자로 찾으면 그 행 하나만 남는다', async () => {
    const data = wideRows(ROWS, COLS);
    data[3]!['c49'] = '숨은바늘';
    const { grid, container } = makeGrid({ columns: wideColumns(COLS) }, data);
    await settle();
    grid.openFindBar();
    const input = container.querySelector<HTMLInputElement>('.og-find-bar input')!;
    input.value = '숨은바늘';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(grid.getData().length).toBe(1);
    expect(grid.getData()[0]!['c49']).toBe('숨은바늘');
    grid.closeFindBar();
    expect(grid.getData().length).toBe(ROWS);
  });
});

describe('푸터 합계·병합·디테일 — 화면 밖 컬럼(M-01~M-04)', () => {
  it('M-01 화면 밖 컬럼 c49 의 푸터 합계 값', async () => {
    const cols = wideColumns(COLS).map((c, i) => (i === 49 ? { ...c, type: 'number' } : c));
    const data = wideRows(ROWS, COLS).map((r, i) => ({ ...r, c49: (i + 1) * 10 }));
    const { grid } = makeGrid({ columns: cols, footer: [{ field: 'c49', op: 'sum' }] }, data);
    await settle();
    expect(grid.getFooterValue('c49')).toBe(150);
  });

  it('M-02 화면 밖까지 가로로 걸친 병합(c2~c48)도 병합 시작 칸 값은 그대로, 가려진 칸 값도 readCell 로 읽힌다', async () => {
    const { grid } = await wide({ mergeCells: true });
    grid.mergeCells([{ row: 0, col: 2, colSpan: 47 }]);
    await settle();
    expect(grid.readCell(0, 'c2')).toBe('r0c2');
    expect(grid.readCell(0, 'c48')).toBe('r0c48');
  });

  it('M-03 병합이 화면 안 시작 칸이면 그 칸은 aria-colspan 으로 47칸을 덮는다고 알린다', async () => {
    const { grid, container } = await wide({ mergeCells: true });
    grid.mergeCells([{ row: 0, col: 2, colSpan: 47 }]);
    await settle();
    const cell = container.querySelector('[role="row"][aria-rowindex="1"] [role="gridcell"][aria-colindex="3"]');
    expect(cell?.getAttribute('aria-colspan')).toBe('47');
    expect(cell?.textContent).toBe('r0c2');
  });

  it('M-04 디테일 행: expandRow → isRowExpanded true, rowExpand 이벤트 1번(rowIndex 0)', async () => {
    const { grid } = await wide({ masterDetail: { enabled: true, height: 64, renderer: (_r: any, host: HTMLElement) => { host.textContent = 'detail'; } } });
    const ev: any[] = [];
    grid.on('rowExpand', (e: any) => ev.push(e.rowIndex));
    grid.expandRow(0);
    await settle();
    expect(grid.isRowExpanded(0)).toBe(true);
    expect(ev).toEqual([0]);
  });
});
