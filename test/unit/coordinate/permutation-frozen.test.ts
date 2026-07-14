// DD-02 순열·프리즌 팬 — model↔view 항등·팬 분류·오프셋
import { describe, it, expect } from 'vitest';
import { ViewPermutation } from '../../../src/core/coordinate/ViewPermutation.js';
import { FrozenPanes } from '../../../src/core/coordinate/FrozenPanes.js';
import { RowMetrics } from '../../../src/core/coordinate/RowMetrics.js';
import { ColumnMetrics } from '../../../src/core/coordinate/ColumnMetrics.js';
import { px, modelIndex, viewIndex, leafColIndex } from '../../../src/core/coordinate/types.js';

describe('ViewPermutation — model↔view 불변식', () => {
  it('항등(null) — toView(toModel(v))===v', () => {
    const perm = new ViewPermutation(null, 100);
    expect(perm.viewCount).toBe(100);
    for (const v of [0, 1, 50, 99]) {
      expect(perm.toModel(viewIndex(v))).toBe(v);
      expect(perm.toView(perm.toModel(viewIndex(v)))).toBe(v);
    }
    expect(perm.toView(modelIndex(100))).toBe(-1); // 범위 밖
  });

  it('필터·정렬 순열 — 역인덱스 O(1)', () => {
    // model 5개 중 3개만 가시(2,4,0 순서)
    const order = [modelIndex(2), modelIndex(4), modelIndex(0)];
    const perm = new ViewPermutation(order, 5);
    expect(perm.viewCount).toBe(3);
    expect(perm.toModel(viewIndex(0))).toBe(2);
    expect(perm.toModel(viewIndex(1))).toBe(4);
    expect(perm.toModel(viewIndex(2))).toBe(0);
    // toView(toModel(v))===v
    for (let v = 0; v < 3; v++) {
      expect(perm.toView(perm.toModel(viewIndex(v)))).toBe(v);
    }
    // 필터아웃된 model → -1(죽은 링크 정직 폴백)
    expect(perm.toView(modelIndex(1))).toBe(-1);
    expect(perm.toView(modelIndex(3))).toBe(-1);
    expect(perm.isVisible(modelIndex(4))).toBe(true);
    expect(perm.isVisible(modelIndex(3))).toBe(false);
  });
});

describe('FrozenPanes — 팬 분류·오프셋', () => {
  const fp = new FrozenPanes({ rows: 2, cols: 1 });

  it('paneOf 4팬 분류', () => {
    expect(fp.paneOf(viewIndex(0), leafColIndex(0))).toBe('frozen-corner');
    expect(fp.paneOf(viewIndex(0), leafColIndex(3))).toBe('frozen-top');
    expect(fp.paneOf(viewIndex(5), leafColIndex(0))).toBe('frozen-left');
    expect(fp.paneOf(viewIndex(5), leafColIndex(3))).toBe('body');
  });

  it('topOffset = 상단 고정 2행 높이', () => {
    const rm = new RowMetrics({ rowHeight: px(30), total: 100 });
    expect(fp.topOffset(rm)).toBe(60);
  });

  it('leftOffset = 좌측 고정 1열 폭', () => {
    const cm = new ColumnMetrics([px(90), px(50), px(50)], 1);
    expect(fp.leftOffset(cm)).toBe(90);
  });

  it('고정 0 → 전부 body', () => {
    const none = new FrozenPanes({ rows: 0, cols: 0 });
    expect(none.paneOf(viewIndex(0), leafColIndex(0))).toBe('body');
  });
});
