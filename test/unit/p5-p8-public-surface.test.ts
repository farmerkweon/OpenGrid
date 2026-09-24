/**
 * 공개 형·공개 API 보강(P5~P8) — 인스턴스 형의 빠진 메서드, 형 정의 결함, 페이지 크기·찾기 바, 접근성 도구.
 *
 * Public type and API additions (P5–P8): missing instance-type methods, type-definition fixes,
 * page size and find bar, accessibility helpers.
 *
 * 형 항목은 이 파일을 tsc 로 검사해 확인한다(`@ts-expect-error` 는 오류가 나야 통과).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/index';
import {
  KeyboardInteractionModel, LiveRegionController, VisualEquivRegistry, strokeFromEvent,
} from '../../src/a11y/index';
import type {
  OpenGridInstance, SortEvent, SelectionEvent, FilterEvent, MergeCell, PrintOptions,
  ColumnDef, ColumnOrGroup, GridOptions,
} from '../../src/index';

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { document.body.innerHTML = ''; });

interface Row { name: string; qty: number; q1?: number; q2?: number }

function host(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '600px';
  el.style.height = '400px';
  // jsdom 은 크기를 0 으로 돌려줘 레이아웃을 건너뛴다 — 크기를 준다.
  el.getBoundingClientRect = () => ({ width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ name: `r${i}`, qty: i }));
/** jsdom 은 크기가 0 이라 첫 렌더가 늦는다 — 셀 요소가 필요한 테스트는 동기 렌더를 강제한다. */
const renderNow = (g: any) => g._doRender(...g._visRange());

describe('P5 — OpenGridInstance 형', () => {
  it('T9-01 인스턴스 형으로 받은 값에서 빠졌던 12개 메서드를 부를 수 있다', () => {
    const grid: OpenGridInstance<Row> = new OpenGrid<Row>(host(), { columns: [{ field: 'name', header: '이름' }] });
    const names: Array<keyof OpenGridInstance<Row>> = [
      'reorderRow', 'autoMerge', 'mergeCells', 'clearMerge', 'enableTree', 'disableTree',
      'expandAllNodes', 'collapseAllNodes', 'appendRows', 'prependRows', 'setIcon', 'renderIcon',
    ];
    for (const n of names) expect(typeof grid[n], n).toBe('function');
    const merge: MergeCell[] = [{ row: 0, col: 0, rowSpan: 2 }];
    grid.setData(rows(3));
    grid.mergeCells(merge);
    grid.clearMerge();
    grid.destroy();
  });

  it('T9-02 이벤트 형을 index 에서 가져올 수 있다', () => {
    const s: SortEvent = { field: 'name', dir: 'asc', sortList: [] };
    const sel: SelectionEvent<Row> = { rows: [], rowIndexes: [] };
    const f: FilterEvent = { field: 'name', filterItems: [], allFilters: {} };
    expect([s.field, sel.rows.length, f.field]).toEqual(['name', 0, 'name']);
  });
});

describe('P6 — 형 정의 결함', () => {
  it('T9-03 PrintOptions.footerText', () => {
    const o: PrintOptions = { title: 't', footerText: '출력 2026-09-24' };
    expect(o.footerText).toBe('출력 2026-09-24');
  });

  it('T9-04 crossGridMapping 은 받는 쪽 모양의 행을 돌려줄 수 있다', () => {
    const opts: GridOptions<Row> = {
      columns: [{ field: 'name', header: '이름' }],
      crossGridMapping: (r) => ({ title: r.name, count: r.qty }),
    };
    expect(typeof opts.crossGridMapping).toBe('function');
  });

  it('T9-05 등록한 렌더러 이름을 renderer 에 쓸 수 있고 실제로 그린다', () => {
    OpenGrid.registerRenderer('p8-stars', () => ({
      render: (ctx: any) => { const el = document.createElement('span'); el.textContent = '★'.repeat(Number(ctx.value) || 0); return el; },
    }));
    const cols: ColumnDef<Row>[] = [
      { field: 'name', header: '이름' },
      { field: 'qty', header: '별', renderer: 'p8-stars' },
    ];
    const cols2: ColumnDef<Row>[] = [{ field: 'qty', header: '별', renderer: { type: 'p8-stars' } }];
    const g: any = new OpenGrid<Row>(host(), { columns: cols });
    g.setData([{ name: 'a', qty: 3 }]);
    renderNow(g);
    expect(g._renderer.getCellEl(0, 1)?.textContent).toContain('★★★');
    expect(cols2.length).toBe(1);
    g.destroy();
  });

  it('T9-06 묶음 컬럼은 field 없이 쓸 수 있고 머리글이 보인다', () => {
    const columns: ColumnOrGroup<Row>[] = [
      { field: 'name', header: '이름' },
      { header: '매출', children: [{ field: 'q1', header: '1분기' }, { field: 'q2', header: '2분기' }] },
    ];
    const el = host();
    const g = new OpenGrid<Row>(el, { columns });
    const heads = Array.from(el.querySelectorAll('.og-header-cell')).map(th => th.textContent?.trim());
    expect(heads).toContain('매출');
    expect(g.getColumnDefs().map(c => c.field)).toEqual(['name', 'q1', 'q2']);
    g.destroy();
  });

  it('T9-07 (음성) 잎 컬럼에서 field 를 빠뜨리면 형 오류다', () => {
    // @ts-expect-error — 잎 컬럼(자식 없음)은 field 가 필수다.
    const bad: ColumnDef<Row> = { header: '이름' };
    expect(bad.header).toBe('이름');
  });
});

describe('P7 — 페이지 크기·찾기 바', () => {
  it('T9-08 setPageSize 는 페이지당 행 수를 바꾸고 1쪽으로 간다', () => {
    const g = new OpenGrid<Row>(host(), { columns: [{ field: 'name', header: '이름' }], pagination: true, pageSize: 10 });
    g.setData(rows(20));
    const onPage = vi.fn();
    g.on('pageChange', onPage);
    g.setPageSize(5);
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage.mock.calls[0][0]).toMatchObject({ page: 1, pageSize: 5 });
    g.destroy();
  });

  it('T9-09 1 미만·정수 아님은 RangeError', () => {
    const g = new OpenGrid<Row>(host(), { columns: [{ field: 'name', header: '이름' }], pagination: true });
    expect(() => g.setPageSize(0)).toThrow(RangeError);
    expect(() => g.setPageSize(2.5)).toThrow(RangeError);
    g.destroy();
  });

  it('T9-10 페이징이 없으면 아무것도 하지 않는다', () => {
    const g = new OpenGrid<Row>(host(), { columns: [{ field: 'name', header: '이름' }] });
    expect(() => g.setPageSize(5)).not.toThrow();
    g.destroy();
  });

  it('T9-11 openFindBar 는 찾기 바를 열고 closeFindBar 는 닫고 거른 것을 푼다', () => {
    const el = host();
    const g = new OpenGrid<Row>(el, { columns: [{ field: 'name', header: '이름' }] });
    g.setData(rows(5));
    const bar = () => el.querySelector('.og-find-bar') as HTMLElement | null;
    g.openFindBar();
    expect(bar()?.hidden).toBe(false);
    g.closeFindBar();
    expect(bar()?.hidden).toBe(true);
    expect(g.getData().length).toBe(5);
    g.destroy();
  });
});

describe('P8 — 접근성 도구 공개 + 셀 aria-label', () => {
  it('T9-12 open-grid/a11y 에서 세 도구와 strokeFromEvent 를 가져올 수 있다', () => {
    expect(typeof KeyboardInteractionModel).toBe('function');
    expect(typeof LiveRegionController).toBe('function');
    expect(typeof VisualEquivRegistry).toBe('function');
    expect(typeof strokeFromEvent).toBe('function');
  });

  it('T9-12b 메인 진입점(open-grid)에는 접근성 도구가 없다 — 쓰지 않는 사용자에게 배송되지 않게', async () => {
    const main: Record<string, unknown> = await import('../../src/index');
    for (const name of ['KeyboardInteractionModel', 'LiveRegionController', 'VisualEquivRegistry', 'strokeFromEvent']) {
      expect(main[name], name).toBeUndefined();
    }
  });

  it('T9-13 KeyboardEvent 를 그대로 넘겨 단축키 명령을 찾는다', () => {
    const keys = new KeyboardInteractionModel();
    keys.register({ mode: '*', pattern: 'Ctrl+C', commandId: 'copy' });
    const e = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
    expect(keys.resolve('nav', strokeFromEvent(e))).toBe('copy');
  });

  it('T9-14 LiveRegionController 는 announce 하나만 가진 render 로 동작한다', () => {
    const announce = vi.fn();
    const timers: Array<() => void> = [];
    const live = new LiveRegionController({
      render: { announce },
      schedule: (fn) => { timers.push(fn); return timers.length; },
      cancel: () => {},
    });
    live.enqueue({ channel: 'polite', priority: 1, mergeKey: 'sort', messageKey: 'first' });
    live.enqueue({ channel: 'polite', priority: 1, mergeKey: 'sort', messageKey: 'second' });
    timers.forEach(fn => fn());
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('polite', 'second');
  });

  it('T9-15 컬럼 ariaLabel 함수가 셀 aria-label 이 된다', () => {
    const equiv = new VisualEquivRegistry();
    equiv.register({ kind: 'trend', describe: (v: unknown) => `최근 값 ${(v as number[])[(v as number[]).length - 1]}` });
    const g: any = new OpenGrid<any>(host(), {
      columns: [{ field: 'trend', header: '추세', ariaLabel: (v: number[]) => equiv.describe('trend', v) }],
    });
    g.setData([{ trend: [1, 2, 7] }]);
    renderNow(g);
    expect(g._renderer.getCellEl(0, 0)?.getAttribute('aria-label')).toBe('최근 값 7');
    g.destroy();
  });

  it('T9-16 ariaLabel 문자열은 그대로, 없으면 「머리글: 값」', () => {
    const g: any = new OpenGrid<Row>(host(), {
      columns: [{ field: 'name', header: '이름', ariaLabel: '고정 설명' }, { field: 'qty', header: '수량' }],
    });
    g.setData([{ name: 'a', qty: 3 }]);
    renderNow(g);
    expect(g._renderer.getCellEl(0, 0)?.getAttribute('aria-label')).toBe('고정 설명');
    expect(g._renderer.getCellEl(0, 1)?.getAttribute('aria-label')).toBe('수량: 3');
    g.destroy();
  });
});
