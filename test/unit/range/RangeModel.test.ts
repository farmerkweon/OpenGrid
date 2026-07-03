import { describe, it, expect, beforeEach } from 'vitest';
import { RangeModel, normalize } from '../../../src/core/range/RangeModel.js';
import type { FlatRowRefLike, RangeModelHost } from '../../../src/core/range/types.js';

/** RangeModelHost(C0.3 계약 모양)의 헤드리스 테스트 더블. order[i] = flat index i의 rowId. */
class FakeHost implements RangeModelHost {
  fields: string[];
  order: (string | null)[];
  constructor(fields: string[], order: (string | null)[]) {
    this.fields = fields;
    this.order = order;
  }
  count(): number {
    return this.order.length;
  }
  resolveFlatRow(flatIndex: number): FlatRowRefLike {
    const id = this.order[flatIndex];
    if (id == null) return { kind: 'detailFiller' };
    return { kind: 'data', rowId: id };
  }
  flatIndexOfRowId(rowId: string): number {
    return this.order.indexOf(rowId);
  }
  rowIdOfFlat(flatIndex: number): string | null {
    return this.order[flatIndex] ?? null;
  }
  visibleFields(): string[] {
    return this.fields;
  }
}

describe('normalize (§2.3)', () => {
  it('정방향 드래그를 그대로 rect로', () => {
    expect(normalize({ ri: 1, ci: 1 }, { ri: 3, ci: 4 })).toEqual({
      startRow: 1, endRow: 3, startCol: 1, endCol: 4,
    });
  });

  it('역방향 드래그(anchor > focus)도 min/max로 정규화', () => {
    expect(normalize({ ri: 5, ci: 6 }, { ri: 2, ci: 1 })).toEqual({
      startRow: 2, endRow: 5, startCol: 1, endCol: 6,
    });
  });
});

describe('RangeModel — 드래그 선택(UC-1)', () => {
  let host: FakeHost;
  let model: RangeModel;

  beforeEach(() => {
    host = new FakeHost(['a', 'b', 'c', 'd'], ['r0', 'r1', 'r2', 'r3']);
    model = new RangeModel(host);
  });

  it('beginDrag→updateFocus→endDrag: 드래그 경로의 min/max로 정규화된 1개 rect', () => {
    model.beginDrag(3, 2);
    model.updateFocus(1, 0);
    model.endDrag();
    expect(model.getRangeSelection()).toEqual([{ startRow: 1, endRow: 3, startCol: 0, endCol: 2 }]);
  });

  it('1셀 미만 이동(같은 셀에서 up) = 단일 셀 선택', () => {
    model.beginDrag(1, 1);
    model.endDrag();
    expect(model.getActiveRange()).toEqual({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 });
  });

  it('클릭(FR-1): 1×1 앵커', () => {
    model.click(2, 1);
    expect(model.getRangeSelection().length).toBe(1);
    expect(model.getActiveRange()).toEqual({ startRow: 2, endRow: 2, startCol: 1, endCol: 1 });
  });

  it('선택 없을 때 getActiveRange는 null', () => {
    expect(model.getActiveRange()).toBeNull();
    expect(model.getRangeSelection()).toEqual([]);
  });
});

describe('RangeModel — Shift 확장(UC-2/UC-3)', () => {
  let host: FakeHost;
  let model: RangeModel;

  beforeEach(() => {
    host = new FakeHost(['a', 'b', 'c'], ['r0', 'r1', 'r2', 'r3', 'r4']);
    model = new RangeModel(host);
  });

  it('Shift+클릭: anchor 불변, focus만 이동', () => {
    model.click(1, 0);
    model.shiftClickExtend(3, 2);
    expect(model.getAnchor()).toEqual({ ri: 1, ci: 0 });
    expect(model.getFocus()).toEqual({ ri: 3, ci: 2 });
    expect(model.getActiveRange()).toEqual({ startRow: 1, endRow: 3, startCol: 0, endCol: 2 });
  });

  it('anchor 없을 때 Shift+클릭은 새 anchor 설정(UC-2 예외)', () => {
    model.shiftClickExtend(2, 1);
    expect(model.getActiveRange()).toEqual({ startRow: 2, endRow: 2, startCol: 1, endCol: 1 });
  });

  it('Shift+Arrow 10회 연속: anchor 불변 + 격자 경계 clamp', () => {
    model.click(2, 1);
    for (let i = 0; i < 10; i++) model.extendFocus('down');
    expect(model.getAnchor()).toEqual({ ri: 2, ci: 1 });
    expect(model.getFocus().ri).toBe(4); // count()-1 = 4에서 clamp
    for (let i = 0; i < 10; i++) model.extendFocus('up');
    expect(model.getFocus().ri).toBe(0);
    for (let i = 0; i < 10; i++) model.extendFocus('right');
    expect(model.getFocus().ci).toBe(2); // visibleFields.length-1 = 2에서 clamp
    for (let i = 0; i < 10; i++) model.extendFocus('left');
    expect(model.getFocus().ci).toBe(0);
  });
});

describe('RangeModel — 정체성(rowId 집합×field 집합) & 재투영(C0.5, §2.5)', () => {
  it('단일 rect 시 getRangeSelection().length === 1(FR-2)', () => {
    const host = new FakeHost(['a', 'b'], ['r0', 'r1', 'r2']);
    const model = new RangeModel(host);
    model.click(0, 0);
    expect(model.getRangeSelection().length).toBe(1);
  });

  it('정렬 시뮬레이션 후에도 rowId 집합 보존(재투영 = 해제 아님)', () => {
    const host = new FakeHost(['a', 'b'], ['r0', 'r1', 'r2', 'r3']);
    const model = new RangeModel(host);
    model.beginDrag(1, 0);
    model.updateFocus(2, 1);
    model.endDrag(); // 선택: r1,r2 × a,b
    expect(model.getIdentity().rowIds).toEqual(['r1', 'r2']);

    // 정렬 시뮬레이션: 순서가 뒤집힘 → r1은 flat 2, r2는 flat 1
    host.order = ['r3', 'r2', 'r1', 'r0'];
    model.reproject();

    expect(model.getIdentity().rowIds).toEqual(['r1', 'r2']); // 정체성 자체는 불변
    expect(model.getProjectedFlatRows()).toEqual([1, 2]); // 새 flat 위치로 재투영
  });

  it('정렬로 불연속 flat 위치가 되어도 rowId 집합은 유지되고 projected는 실제 위치만 반환', () => {
    const host = new FakeHost(['a'], ['r0', 'r1', 'r2', 'r3', 'r4']);
    const model = new RangeModel(host);
    model.beginDrag(1, 0);
    model.updateFocus(3, 0);
    model.endDrag(); // 선택: r1,r2,r3

    // 불연속하게 재배치: r1→flat0, r2→flat4, r3→flat2 (사이에 r0,r4 낌)
    host.order = ['r1', 'r0', 'r3', 'r4', 'r2'];
    model.reproject();

    expect(model.getIdentity().rowIds).toEqual(['r1', 'r2', 'r3']);
    expect(model.getProjectedFlatRows()).toEqual([0, 2, 4]); // 불연속 허용, 정렬된 실제 위치
  });

  it('화면 밖으로 사라진 행(필터아웃)은 정체성엔 남고 투영에서만 제외', () => {
    const host = new FakeHost(['a'], ['r0', 'r1', 'r2', 'r3']);
    const model = new RangeModel(host);
    model.beginDrag(1, 0);
    model.updateFocus(2, 0);
    model.endDrag(); // r1,r2 선택

    host.order = ['r0', 'r2', 'r3']; // r1 필터아웃
    model.reproject();

    expect(model.getIdentity().rowIds).toEqual(['r1', 'r2']); // 모델 유지
    expect(model.getProjectedFlatRows()).toEqual([1]); // r2만 투영(현재 flat=1), r1 제외
  });
});

describe('RangeModel — setRect/clear(API 재료, §6.2)', () => {
  it('setRect로 외부에서 rect 직접 지정 + 정체성 스냅샷', () => {
    const host = new FakeHost(['a', 'b'], ['r0', 'r1', 'r2']);
    const model = new RangeModel(host);
    model.setRect({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
    expect(model.getActiveRange()).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 });
    expect(model.getIdentity().rowIds).toEqual(['r0', 'r1']);
  });

  it('clear 후 getActiveRange는 null, 정체성도 비움', () => {
    const host = new FakeHost(['a'], ['r0', 'r1']);
    const model = new RangeModel(host);
    model.click(0, 0);
    model.clear();
    expect(model.getActiveRange()).toBeNull();
    expect(model.getIdentity()).toEqual({ rowIds: [], fields: [] });
  });
});
