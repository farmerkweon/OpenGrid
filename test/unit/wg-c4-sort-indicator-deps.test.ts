// @vitest-environment node
/**
 * 걸음 C4(SORT 몫) — SortFilterDeps.sortIndicator: 있으면 정렬 때 머리글을 다시 만들지 않고 표시 객체에 알림, 없으면 지금처럼 renderHeader.
 */
import { describe, it, expect, vi } from 'vitest';
import { SortFilterManager } from '../../src/core/SortFilterManager';
import { DataLayer } from '../../src/core/DataLayer';

function mk(withInd: boolean) {
  const dl = new DataLayer();
  dl.setData([{ f: 'b' }, { f: 'a' }]);
  const renderHeader = vi.fn();
  const ind = { bind: vi.fn(), update: vi.fn(), setPressed: vi.fn(), setBusy: vi.fn(), release: vi.fn() };
  const m = new SortFilterManager({
    getData: () => dl, getColLayout: () => ({}) as any, getFindFilter: () => '', getVs: () => null, getPagination: () => null,
    getOptions: () => ({ sortable: true, multiSort: false }), renderHeader, submitRender: vi.fn(), announce: vi.fn(),
    t: (k: string) => k, emit: vi.fn(), ...(withInd ? { sortIndicator: ind } : {}),
  } as any);
  return { m, renderHeader, ind, dl };
}

describe('C4 SortFilterDeps.sortIndicator', () => {
  it('C4-SFM-01 표시 객체가 있으면 머리글 클릭·sort·resetSort 모두 update(목록) 한 번씩, renderHeader 0', () => {
    const { m, renderHeader, ind, dl } = mk(true);
    m.handleSortClick('f', false);
    expect(ind.update).toHaveBeenLastCalledWith([{ field: 'f', dir: 'asc' }]);
    m.sort('f', 'desc');
    expect(ind.update).toHaveBeenLastCalledWith([{ field: 'f', dir: 'desc' }]);
    m.resetSort();
    expect(ind.update).toHaveBeenLastCalledWith([]);
    expect(ind.update).toHaveBeenCalledTimes(3);
    expect(renderHeader).toHaveBeenCalledTimes(0);
    expect(dl.getData().map((r: any) => r.f)).toEqual(['b', 'a']);
  });
  it('C4-SFM-02 표시 객체가 없으면 지금처럼 renderHeader(배선 전 동작)', () => {
    const { m, renderHeader } = mk(false);
    m.handleSortClick('f', false); m.sort('f', 'desc'); m.resetSort();
    expect(renderHeader).toHaveBeenCalledTimes(3);
  });
});
