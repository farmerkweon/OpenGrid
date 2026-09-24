/**
 * Y1~Y6 · S1 — 이벤트 이름별 인자 형, CFRule·SummaryOp·OverrideLayerFn 공개 형, 화면 순서의 행,
 * 그리고 한 번도 나오지 않던 scroll 이벤트.
 *
 * Y1–Y6 · S1 — per-event argument types, public CFRule/SummaryOp/OverrideLayerFn types, row at a flat
 * (screen-order) index, and the scroll event that was never emitted.
 *
 * 형 항목은 이 파일을 tsc 로 검사해 확인한다(`@ts-expect-error` 는 오류가 나야 통과).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/index';
import type {
  CFRule, OverrideLayerFn, OverrideCallOptions, SummaryOp, SummaryOpName, GridEventMap,
  RowCheckEvent, FormulaRecalcEvent,
} from '../../src/index';

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { document.body.innerHTML = ''; });

interface Row { id?: number; parentId?: number | null; name: string; qty: number; dept?: string }

function host(): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const cols = [{ field: 'name' as const, header: '이름' }, { field: 'qty' as const, header: '수량' }];

describe('Y1 — grid.on() 이벤트 이름별 인자 형', () => {
  it('T14-01·04 이름으로 인자 형이 정해지고, rowCheck 인자가 실제로 맞다', () => {
    const g = new OpenGrid<Row>(host(), { columns: cols, checkColumn: true });
    g.setData([{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }]);
    const seen: RowCheckEvent<Row>[] = [];
    g.on('rowCheck', (e) => { seen.push(e); });                // e: RowCheckEvent<Row>
    g.on('cellClick', (e) => e.rowIndex + e.columnIndex);       // e: CellEvent<Row>
    g.on('formulaRecalc', (e: FormulaRecalcEvent) => e.cycles);
    g.on('sortChange', (e) => e.sortList.length);
    g.on('ready', (grid) => grid.getData());
    (g as any)._handleRowCheck(1, true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ rowIndex: 1, checked: true });
    g.destroy();
  });

  it('T14-02 (음성) 이름과 맞지 않는 인자 필드는 형 오류', () => {
    const g = new OpenGrid<Row>(host(), { columns: cols });
    // @ts-expect-error — cellClick 인자(CellEvent)에는 cycles 가 없다.
    g.on('cellClick', (e) => e.cycles);
    g.destroy();
  });

  it('T14-03 (호환) 표에 없는 이름·string 변수도 그대로 쓸 수 있다', () => {
    const g = new OpenGrid<Row>(host(), { columns: cols });
    const name: string = 'myCustomEvent';
    const fn = vi.fn();
    g.on('myCustomEvent', (x: unknown) => fn(x));
    g.on(name, fn);
    g.emit('myCustomEvent', 7);
    expect(fn).toHaveBeenCalledWith(7);
    const map: Partial<GridEventMap<Row>> = {};
    expect(map).toEqual({});
    g.destroy();
  });
});

describe('Y2·Y3·Y6 — 공개 형', () => {
  it('T14-05 CFRule 로 규칙을 적어 setConditionalFormat 에 넘긴다', async () => {
    const rule: CFRule = {
      id: 'big', when: { type: 'compare', op: '>', a: 1 }, encode: { kind: 'bar' },
      scope: { columnId: 'qty' }, priority: 1,
    };
    const g = new OpenGrid<Row>(host(), { columns: cols });
    g.setData([{ name: 'a', qty: 3 }]);
    await expect(g.setConditionalFormat([rule])).resolves.not.toThrow();
    g.destroy();
  });

  it('T14-06 슬롯으로 만든 op 이름을 footer 에 쓸 수 있다', () => {
    const builtin: SummaryOp = 'SUM';
    const custom: SummaryOpName = 'MEDIAN';
    const g = new OpenGrid<Row>(host(), { columns: cols, footer: [{ field: 'qty', op: custom }, { field: 'name', op: builtin }] });
    g.destroy();
  });

  it('T14-09 OverrideLayerFn 으로 레이어를 적는다', () => {
    const layer: OverrideLayerFn = (orig, ...a) => `[${orig(...a)}]`;
    const opts: OverrideCallOptions = { reentrant: false };
    const g = new OpenGrid<Row>(host(), { columns: cols });
    g.setData([{ name: 'kim', qty: 1 }]);
    g.override('getDisplayValue', layer, opts);
    expect(g.getDisplayValue(0, 'name')).toBe('[kim]');
    g.destroy();
  });
});

describe('Y5 — 화면 순서의 행', () => {
  it('T14-07 트리 모드에서 getFlatRow 는 노드의 데이터 행, 범위 밖은 null', () => {
    const g = new OpenGrid<Row>(host(), { columns: cols, treeId: 'id', treeParentId: 'parentId' } as any);
    g.setData([{ id: 1, parentId: null, name: '루트', qty: 0 }, { id: 2, parentId: 1, name: '자식', qty: 1 }]);
    g.enableTree();
    const row: Row | null = g.getFlatRow(0);
    expect(row?.name).toBe('루트');
    expect(g.getFlatRow(99)).toBeNull();
    g.destroy();
  });

  it('T14-08 그룹 모드의 그룹 머리 줄은 null, 그 아래 줄은 데이터 행', () => {
    const g = new OpenGrid<Row>(host(), { columns: cols });
    g.setData([{ name: 'a', qty: 1, dept: 'X' }, { name: 'b', qty: 2, dept: 'Y' }]);
    g.groupBy(['dept']);
    g.expandAll(); // 그룹은 접힌 채 시작한다
    expect(g.getFlatRow(0)).toBeNull();
    expect(g.getFlatRow(1)?.name).toBe('a');
    g.destroy();
  });
});

describe('S1 — scroll 이벤트', () => {
  it('T14-10 본문을 스크롤하면 onScroll 과 grid.on("scroll") 이 한 번씩, 스크롤 위치와 함께', () => {
    const onScroll = vi.fn();
    const g: any = new OpenGrid<Row>(host(), { columns: cols, onScroll });
    const sub = vi.fn();
    g.on('scroll', sub);
    const body: HTMLElement = g._renderer.bodyWrapper;
    body.scrollTop = 0;
    body.dispatchEvent(new Event('scroll'));
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub.mock.calls[0][0]).toMatchObject({ scrollTop: 0, scrollLeft: 0, isAtTop: true });
    g.destroy();
  });
});
