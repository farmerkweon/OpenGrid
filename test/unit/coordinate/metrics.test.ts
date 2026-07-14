// DD-02 축 메트릭 — 좌표 왕복변환·부분합·autoHeight override
import { describe, it, expect } from 'vitest';
import { RowMetrics } from '../../../src/core/coordinate/RowMetrics.js';
import { ColumnMetrics } from '../../../src/core/coordinate/ColumnMetrics.js';
import { px, viewIndex, leafColIndex } from '../../../src/core/coordinate/types.js';

describe('RowMetrics — 균일 높이 O(1)', () => {
  const rm = new RowMetrics({ rowHeight: px(32), total: 1000 });

  it('topOf / heightOf', () => {
    expect(rm.topOf(viewIndex(0))).toBe(0);
    expect(rm.topOf(viewIndex(10))).toBe(320);
    expect(rm.heightOf(viewIndex(5))).toBe(32);
  });

  it('totalHeight', () => {
    expect(rm.totalHeight()).toBe(32000);
  });

  it('indexAt 왕복: topOf(indexAt(y)) <= y', () => {
    for (const y of [0, 15, 31, 32, 33, 999, 31999]) {
      const v = rm.indexAt(px(y));
      expect(rm.topOf(v)).toBeLessThanOrEqual(y);
      expect(rm.topOf(viewIndex(v + 1))).toBeGreaterThan(y);
    }
  });

  it('indexAt 클램프(범위 밖)', () => {
    expect(rm.indexAt(px(-100))).toBe(0);
    expect(rm.indexAt(px(9_999_999))).toBe(999);
  });

  it('total=0 안전', () => {
    const empty = new RowMetrics({ rowHeight: px(32), total: 0 });
    expect(empty.totalHeight()).toBe(0);
    expect(empty.indexAt(px(100))).toBe(0);
  });
});

describe('RowMetrics — autoHeight override 부분합', () => {
  it('applyMeasured: 특정 행 높이 확대 반영', () => {
    const base = new RowMetrics({ rowHeight: px(20), total: 10 });
    const rm = base.applyMeasured(new Map([[viewIndex(2), px(60)], [viewIndex(5), px(50)]]));

    // 원본 불변(불변성)
    expect(base.heightOf(viewIndex(2))).toBe(20);

    expect(rm.heightOf(viewIndex(2))).toBe(60);
    expect(rm.heightOf(viewIndex(5))).toBe(50);
    // topOf(3) = 0..2 합 = 20+20+60 = 100
    expect(rm.topOf(viewIndex(3))).toBe(100);
    // topOf(6) = 100 + 20(v3) + 20(v4) + 50(v5) = 190
    expect(rm.topOf(viewIndex(6))).toBe(190);
    // totalHeight = 10*20 + (60-20) + (50-20) = 200 + 40 + 30 = 270
    expect(rm.totalHeight()).toBe(270);
  });

  it('override 상태에서도 indexAt 왕복 정합', () => {
    const rm = new RowMetrics({ rowHeight: px(20), total: 10 }).applyMeasured(
      new Map([[viewIndex(2), px(60)], [viewIndex(5), px(50)]])
    );
    for (let v = 0; v < 10; v++) {
      const top = rm.topOf(viewIndex(v));
      expect(rm.indexAt(px(top))).toBe(v);
      expect(rm.indexAt(px(top + rm.heightOf(viewIndex(v)) - 1))).toBe(v);
    }
  });

  it('setTotal 새 불변 인스턴스', () => {
    const rm = new RowMetrics({ rowHeight: px(10), total: 5 });
    const rm2 = rm.setTotal(8);
    expect(rm.total).toBe(5);
    expect(rm2.total).toBe(8);
    expect(rm2.totalHeight()).toBe(80);
  });
});

describe('ColumnMetrics — 부분합 index↔pixel', () => {
  const cm = new ColumnMetrics([px(100), px(50), px(80), px(120)], 1);

  it('leftOf / widthOf / totalWidth', () => {
    expect(cm.leftOf(leafColIndex(0))).toBe(0);
    expect(cm.leftOf(leafColIndex(1))).toBe(100);
    expect(cm.leftOf(leafColIndex(3))).toBe(230);
    expect(cm.widthOf(leafColIndex(2))).toBe(80);
    expect(cm.totalWidth()).toBe(350);
    expect(cm.count).toBe(4);
  });

  it('colAt 왕복: leftOf(colAt(x)) <= x', () => {
    for (const x of [0, 99, 100, 101, 229, 349]) {
      const c = cm.colAt(px(x));
      expect(cm.leftOf(c)).toBeLessThanOrEqual(x);
    }
    expect(cm.colAt(px(0))).toBe(0);
    expect(cm.colAt(px(100))).toBe(1);
    expect(cm.colAt(px(149))).toBe(1); // col1 = [100,150)
    expect(cm.colAt(px(150))).toBe(2); // col2 = [150,230)
    expect(cm.colAt(px(230))).toBe(3);
  });

  it('frozenLeft / frozenWidth', () => {
    expect(cm.frozenLeft).toBe(1);
    expect(cm.frozenWidth()).toBe(100);
  });
});
