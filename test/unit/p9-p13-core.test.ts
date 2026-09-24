/**
 * P9~P13 — 밀도가 행 높이를 바꾼다 · 질감을 칠하는 CSS · 「정렬 가능」 표시 클래스 ·
 * sortChange 이벤트 모양 하나로 · 셀 클릭이 키보드 포커스 칸이 된다.
 *
 * P9–P13 — density drives row height, CSS that paints texture, a "sortable" marker class,
 * one sortChange shape on every path, and a clicked cell becomes the keyboard focus cell.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { OpenGrid } from '../../src/core/OpenGrid';

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { document.body.innerHTML = ''; });

interface Row { name: string; qty: number }
const rows = (): Row[] => [{ name: 'a', qty: 3 }, { name: 'b', qty: 1 }, { name: 'c', qty: 2 }];

function makeGrid(extra: Record<string, unknown> = {}): any {
  const el = document.createElement('div');
  // jsdom 은 크기를 0 으로 돌려줘 레이아웃을 건너뛴다 — 크기를 준다.
  el.getBoundingClientRect = () => ({ width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
  document.body.appendChild(el);
  const g: any = new OpenGrid<Row>(el, {
    columns: [{ field: 'name', header: '이름' }, { field: 'qty', header: '수량' }],
    sortable: true, height: 400, ...extra,
  } as any);
  g.setData(rows());
  return g;
}
const css = (name: string) => readFileSync(resolve(process.cwd(), 'src/styles', name), 'utf8');

describe('P12 — sortChange 모양이 모든 길에서 같다', () => {
  it('T11-01 머리글 클릭·orderBy(필드)·orderBy(목록) 이벤트 키가 같다', () => {
    const g = makeGrid({ multiSort: true });
    const seen: Array<Record<string, unknown>> = [];
    g.on('sortChange', (e: Record<string, unknown>) => seen.push(e));
    g._handleSortClick('qty', false);
    g.orderBy('name', 'desc');
    g.orderBy([{ field: 'qty', dir: 'asc' }]);
    expect(seen.map(e => Object.keys(e).sort())).toEqual([
      ['dir', 'field', 'sortList'], ['dir', 'field', 'sortList'], ['dir', 'field', 'sortList'],
    ]);
    g.destroy();
  });

  it('T11-02 orderBy(필드, 방향) 은 그 필드·방향을 알린다', () => {
    const g = makeGrid();
    const on = vi.fn();
    g.on('sortChange', on);
    g.orderBy('qty', 'desc');
    expect(on.mock.calls[0][0]).toMatchObject({ field: 'qty', dir: 'desc' });
    g.destroy();
  });

  it('T11-03 머리글을 눌러 그 컬럼 정렬이 풀리면 dir 이 없다', () => {
    const g = makeGrid();
    const seen: Array<Record<string, unknown>> = [];
    g.on('sortChange', (e: Record<string, unknown>) => seen.push(e));
    g._handleSortClick('qty', false); // asc
    g._handleSortClick('qty', false); // desc
    g._handleSortClick('qty', false); // 해제
    const last = seen[seen.length - 1]!;
    expect(last.field).toBe('qty');
    expect('dir' in last).toBe(false);
    expect(last.sortList).toEqual([]);
    g.destroy();
  });

  it('T11-04 정렬 뒤 resetOrder 는 빈 목록으로 한 번 알린다', () => {
    const g = makeGrid();
    g.orderBy('qty', 'asc');
    const on = vi.fn();
    g.on('sortChange', on);
    g.resetOrder();
    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.calls[0][0]).toEqual({ sortList: [] });
    g.destroy();
  });

  it('T11-05 (대조군) 정렬이 없을 때 resetOrder 는 조용하다', () => {
    const g = makeGrid();
    const on = vi.fn();
    g.on('sortChange', on);
    g.resetOrder();
    expect(on).not.toHaveBeenCalled();
    g.destroy();
  });
});

describe('P13 — 셀 클릭이 키보드 포커스 칸이 된다', () => {
  it('T11-06·07 셀을 누른 뒤 누른 키가 그 칸의 cellKeyDown 으로 온다', () => {
    const g = makeGrid();
    const onKey = vi.fn();
    g.on('cellKeyDown', onKey);
    g._handleCellClick(1, 1, new MouseEvent('click'));
    expect(g._editMgr.focusCell).toEqual({ ri: 1, ci: 1 });
    g._handleCellKeyEvt('cellKeyDown', new KeyboardEvent('keydown', { key: 'a' }));
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onKey.mock.calls[0][0]).toMatchObject({ rowIndex: 1, field: 'qty' });
    g.destroy();
  });
});

describe('P9 — 밀도가 보통 모드 행 높이를 바꾼다', () => {
  it('T11-08 setDensity(compact) → 행 높이 28(옵션·가상 스크롤)', () => {
    const g = makeGrid();
    g.setDensity('compact');
    expect(g._options.rowHeight).toBe(28);
    expect(g._vs.rowHeight).toBe(28);
    g.destroy();
  });

  it('T11-09 기본 밀도로 돌아가면 사용자가 정한 행 높이로', () => {
    const g = makeGrid({ rowHeight: 40 });
    g.setDensity('gallery');
    expect(g._options.rowHeight).toBe(56);
    g.setDensity('default');
    expect(g._options.rowHeight).toBe(40);
    g.destroy();
  });

  it('T11-10 setRowHeight 는 값을 적용하고, 1 미만·유한수 아님은 RangeError', () => {
    const g = makeGrid({ draggable: true });
    g.setRowHeight(24);
    expect(g._options.rowHeight).toBe(24);
    expect(g._vs.rowHeight).toBe(24);
    expect(g._dnd._rowHeight).toBe(24);
    g.setDensity('default');
    expect(g._options.rowHeight).toBe(24); // 사용자가 정한 값은 setRowHeight 의 마지막 값
    expect(() => g.setRowHeight(0)).toThrow(RangeError);
    expect(() => g.setRowHeight(Number.NaN)).toThrow(RangeError);
    g.destroy();
  });
});

describe('P10 — 질감을 칠하는 CSS', () => {
  it('T11-11 base.css 가 질감을 크롬에만 칠한다', () => {
    const base = css('base.css');
    const m = /\/\* ── 질감 축[\s\S]*?\n\}\n/.exec(base);
    expect(m, '질감 규칙 블록').not.toBeNull();
    const block = m![0];
    expect(block).toContain('[data-og-texture] .og-header-cell');
    expect(block).toContain('background-image: var(--og-texture-bg) !important');
    expect(block).not.toMatch(/\.og-cell\b|\.og-row\b|\.og-body/); // 데이터 칸 뒤에는 칠하지 않는다
  });

  it('T11-11b 내장 질감 레시피는 잉크가 정의되지 않아도 유효하다(기본 잉크를 var 폴백으로 품는다)', async () => {
    const { BUILTIN_TEXTURES } = await import('../../src/core/appearance/TextureRegistry');
    for (const [, delta] of BUILTIN_TEXTURES) {
      const bg = String(delta['--og-texture-bg'] ?? '');
      expect(bg).not.toMatch(/var\(--og-texture-ink\)/);        // 폴백 없는 참조는 잉크가 없으면 무효 값
      expect(bg).toContain('var(--og-texture-ink, 0, 0, 0)');
    }
  });

  it('T11-12 (대조군) 테마 27종 색 파일은 이 작업에서 바뀌지 않았다', () => {
    const diff = execSync('git diff --stat HEAD -- src/styles/themes.css', { cwd: process.cwd() }).toString().trim();
    expect(diff).toBe('');
  });
});

describe('P11 — 「정렬 가능」 표시 클래스', () => {
  it('T11-13 정렬 가능한 머리글 칸에만 og-sortable', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    document.body.appendChild(el);
    const g = new OpenGrid<Row>(el, {
      columns: [{ field: 'name', header: '이름' }, { field: 'qty', header: '수량', sortable: false }],
      sortable: true,
    });
    const cells = Array.from(el.querySelectorAll<HTMLElement>('.og-header-cell'))
      .filter(th => th.textContent?.includes('이름') || th.textContent?.includes('수량'));
    const byText = (t: string) => cells.find(th => th.textContent?.includes(t))!;
    expect(byText('이름').classList.contains('og-sortable')).toBe(true);
    expect(byText('수량').classList.contains('og-sortable')).toBe(false);
    g.destroy();
  });

  it('T11-14 header.css 는 인라인 cursor 대신 og-sortable 클래스로 가려낸다', () => {
    const header = css('header.css');
    expect(header).not.toMatch(/\[style\*="cursor/);
    expect(header).toContain('.og-header-cell.og-sortable::after');
  });
});
