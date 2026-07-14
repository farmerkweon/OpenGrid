// DD-02 CoordinateKernel — 배치·hitTest·윈도잉·스냅샷(노드클램프)·스크롤타깃
import { describe, it, expect } from 'vitest';
import { CoordinateKernel } from '../../../src/core/coordinate/CoordinateKernel.js';
import { RowMetrics } from '../../../src/core/coordinate/RowMetrics.js';
import { ColumnMetrics } from '../../../src/core/coordinate/ColumnMetrics.js';
import { ViewPermutation } from '../../../src/core/coordinate/ViewPermutation.js';
import { FrozenPanes } from '../../../src/core/coordinate/FrozenPanes.js';
import { NodeBudget } from '../../../src/core/coordinate/NodeBudget.js';
import { MergeSourceAdapter, EMPTY_MERGE_SOURCE } from '../../../src/core/coordinate/MergeSourceAdapter.js';
import { MergeEngine } from '../../../src/core/MergeEngine.js';
import { px, viewIndex, leafColIndex } from '../../../src/core/coordinate/types.js';

function makeKernel(opts: {
  rows?: number;
  merge?: MergeEngine;
  frozenRows?: number;
  frozenCols?: number;
  maxNodes?: number;
  overscan?: number;
} = {}): CoordinateKernel {
  const rows = new RowMetrics({ rowHeight: px(20), total: opts.rows ?? 1000 });
  const cols = new ColumnMetrics([px(100), px(100), px(100), px(100)], opts.frozenCols ?? 0);
  const perm = new ViewPermutation(null, opts.rows ?? 1000);
  const frozen = new FrozenPanes({ rows: opts.frozenRows ?? 0, cols: opts.frozenCols ?? 0 });
  const merges = opts.merge ? new MergeSourceAdapter(opts.merge) : EMPTY_MERGE_SOURCE;
  const budget = new NodeBudget({ maxNodes: opts.maxNodes ?? 5000, overscan: opts.overscan ?? 5 });
  return new CoordinateKernel({ perm, rows, cols, frozen, merges, budget, overscan: opts.overscan ?? 5 });
}

describe('CoordinateKernel — placeCell(기본·merge·frozen)', () => {
  it('기본 셀 사각형', () => {
    const k = makeKernel();
    const p = k.placeCell(viewIndex(3), leafColIndex(2));
    expect(p.rect.x).toBe(200);
    expect(p.rect.y).toBe(60);
    expect(p.rect.w).toBe(100);
    expect(p.rect.h).toBe(20);
    expect(p.rowSpan).toBe(1);
    expect(p.hidden).toBe(false);
    expect(p.pane).toBe('body');
  });

  it('merge 앵커 셀 → 사각형 확대', () => {
    const me = new MergeEngine();
    me.applyMergeCells([{ row: 1, col: 1, rowSpan: 2, colSpan: 2 }]);
    const k = makeKernel({ merge: me });
    const anchor = k.placeCell(viewIndex(1), leafColIndex(1));
    expect(anchor.rowSpan).toBe(2);
    expect(anchor.colSpan).toBe(2);
    expect(anchor.rect.w).toBe(200); // 2열
    expect(anchor.rect.h).toBe(40);  // 2행
    expect(anchor.hidden).toBe(false);
    // 삼켜진 셀 → hidden
    const swallowed = k.placeCell(viewIndex(2), leafColIndex(2));
    expect(swallowed.hidden).toBe(true);
  });

  it('frozen 팬 분류 반영', () => {
    const k = makeKernel({ frozenRows: 1, frozenCols: 1 });
    expect(k.placeCell(viewIndex(0), leafColIndex(0)).pane).toBe('frozen-corner');
    expect(k.placeCell(viewIndex(5), leafColIndex(2)).pane).toBe('body');
  });
});

describe('CoordinateKernel — hitTest(merge 앵커 흡수)', () => {
  it('픽셀 → (view,col)', () => {
    const k = makeKernel();
    const hit = k.hitTest(px(250), px(65));
    expect(hit).not.toBeNull();
    expect(hit!.view).toBe(3);  // y=65 → row 3 (60..80)
    expect(hit!.col).toBe(2);   // x=250 → col 2 (200..300)
  });

  it('범위 밖 → null', () => {
    const k = makeKernel({ rows: 10 });
    expect(k.hitTest(px(-5), px(10))).toBeNull();
    expect(k.hitTest(px(10), px(999999))).toBeNull();
  });

  it('은폐 셀 클릭 → 앵커 셀 반환', () => {
    const me = new MergeEngine();
    me.applyMergeCells([{ row: 1, col: 1, rowSpan: 2, colSpan: 2 }]);
    const k = makeKernel({ merge: me });
    // (view2,col2) 는 hidden → 앵커 (1,1) 로 흡수
    const hit = k.hitTest(px(250), px(50)); // x=250→col2, y=50→row2
    expect(hit!.view).toBe(1);
    expect(hit!.col).toBe(1);
  });
});

describe('CoordinateKernel — rectOfRange', () => {
  it('역방향 좌표도 정규화된 사각형', () => {
    const k = makeKernel();
    const r = k.rectOfRange({ view: viewIndex(5), col: leafColIndex(3) }, { view: viewIndex(2), col: leafColIndex(1) });
    expect(r.x).toBe(100); // col1
    expect(r.y).toBe(40);  // row2
    expect(r.w).toBe(300); // col1..3
    expect(r.h).toBe(80);  // row2..5 (4행)
  });
});

describe('CoordinateKernel — 윈도잉·스냅샷', () => {
  it('verticalWindow overscan 반영·반열림', () => {
    const k = makeKernel({ rows: 1000, overscan: 5 });
    // scrollTop=200(row10), viewportH=200(10행) → 대략 row10..row20 + overscan
    const range = k.verticalWindow(px(200), px(200));
    expect(range.start).toBe(5);   // 10 - 5
    expect(range.end).toBeGreaterThan(20);
    expect(range.start).toBeLessThan(range.end); // 반열림 유효
  });

  it('snapshot — 예산 내 정상', () => {
    const k = makeKernel({ rows: 1000 });
    const snap = k.snapshot({ top: px(0), left: px(0) }, { h: px(400), w: px(400) });
    expect(snap.nodeBudget.withinBudget).toBe(true);
    expect(snap.clamped.nodes).toBe(false);
    expect(snap.clamped.viewport).toBe(false);
    expect(snap.offsetY).toBe(0);
    expect(snap.totalHeight).toBe(20000);
  });

  it('snapshot — 노드 예산 초과 시 세로 윈도 클램프(전행 폭주 차단)', () => {
    // maxNodes 작게 + 전행 윈도 유도(큰 뷰포트로 전 10만행 노출 시도)
    const k = makeKernel({ rows: 100_000, maxNodes: 200, overscan: 0 });
    const snap = k.snapshot({ top: px(0), left: px(0) }, { h: px(3_000_000), w: px(400) });
    const windowRows = snap.range.end - snap.range.start;
    const cols = snap.colRange.end - snap.colRange.start;
    // 클램프로 노드수 예산 이하
    expect(windowRows * cols).toBeLessThanOrEqual(200);
    expect(snap.clamped.nodes).toBe(true);
    expect(snap.nodeBudget.withinBudget).toBe(false);
  });

  it('snapshot — 언바운드/0 뷰포트 방어(clamped.viewport)', () => {
    const k = makeKernel({ rows: 100_000 });
    const snap = k.snapshot({ top: px(0), left: px(0) }, { h: px(Infinity), w: px(400) });
    expect(snap.clamped.viewport).toBe(true);
    // 무한 뷰포트인데도 윈도는 유한(전행 아님)
    expect(snap.range.end - snap.range.start).toBeLessThan(100_000);
  });
});

describe('CoordinateKernel — scrollTopFor·model↔view', () => {
  it('scrollTopFor: 위/아래/이미보임', () => {
    const k = makeKernel({ rows: 1000 });
    // 대상이 위쪽 → 대상 상단
    expect(k.scrollTopFor(viewIndex(10), px(200), px(500))).toBe(200);
    // 대상이 아래쪽 → 하단 정렬(bottom - viewportH)
    expect(k.scrollTopFor(viewIndex(50), px(200), px(0))).toBe(1020 - 200); // top1000 h20 bottom1020
    // 이미 보임 → cur 유지
    expect(k.scrollTopFor(viewIndex(12), px(200), px(200))).toBe(200);
  });

  it('toModel/toView 위임(항등)', () => {
    const k = makeKernel({ rows: 10 });
    expect(k.toModel(viewIndex(3))).toBe(3);
    expect(k.toView(k.toModel(viewIndex(3)))).toBe(3);
  });
});
