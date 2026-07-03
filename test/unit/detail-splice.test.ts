import { describe, it, expect } from 'vitest';
import {
  spliceDetails,
  type DetailHeadItem,
  type DetailFillerItem,
} from '../../src/core/detail/DetailSplice.js';

interface Row { id: string; name: string; }

function isHead(x: any): x is DetailHeadItem { return x && x._isDetailHead === true; }
function isFiller(x: any): x is DetailFillerItem { return x && x._isDetailFiller === true; }

const getRowId = (r: Row) => r.id;

describe('spliceDetails (F2 헤드리스 flat 스플라이스)', () => {
  describe('기본 정확성', () => {
    it('펼침 0개면 항등(내용 동일, 새 배열)', () => {
      const base: Row[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      const out = spliceDetails(base, { expandedRowIds: new Set(), getRowId, rowHeight: 30 });
      expect(out).toEqual(base);
      expect(out).not.toBe(base);
    });

    it('1개 펼침: head 1 + filler(span-1) 이 마스터 직후 삽입, height=90/rowHeight=30 → span=3', () => {
      const base: Row[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      const out = spliceDetails(base, {
        expandedRowIds: new Set(['a']),
        getRowId, rowHeight: 30, height: 90,
      });
      // [a, head(a), filler(a), filler(a), b]
      expect(out).toHaveLength(5);
      expect(out[0]).toBe(base[0]);
      expect(isHead(out[1]) && out[1]._rowId === 'a' && out[1]._span === 3).toBe(true);
      expect(isFiller(out[2]) && out[2]._rowId === 'a').toBe(true);
      expect(isFiller(out[3]) && out[3]._rowId === 'a').toBe(true);
      expect(out[4]).toBe(base[1]);
    });

    it('EC-10 비배수 양자화: height=100/rowHeight=30 → span=ceil(100/30)=4', () => {
      const base: Row[] = [{ id: 'a', name: 'A' }];
      const out = spliceDetails(base, { expandedRowIds: new Set(['a']), getRowId, rowHeight: 30, height: 100 });
      expect(isHead(out[1]) && out[1]._span === 4).toBe(true);
      expect(out).toHaveLength(1 + 4); // head+3 filler
    });

    it('getSlotCount 콜백이 지정되면 height 대신 이를 사용', () => {
      const base: Row[] = [{ id: 'a', name: 'A' }];
      const out = spliceDetails(base, {
        expandedRowIds: new Set(['a']),
        getRowId, rowHeight: 30, height: 999,
        getSlotCount: () => 2,
      });
      expect(isHead(out[1]) && out[1]._span === 2).toBe(true);
      expect(out).toHaveLength(3);
    });
  });

  describe('여러 개 동시 펼침(N개)', () => {
    it('펼쳐진 각 마스터 뒤에 독립적으로 head+filler 삽입', () => {
      const base: Row[] = [
        { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
        { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
      ];
      const out = spliceDetails(base, {
        expandedRowIds: new Set(['a', 'c']),
        getRowId, rowHeight: 30, height: 30, // span=1 → head만, filler 없음
      });
      // [a, head(a), b, c, head(c), d]
      expect(out).toHaveLength(6);
      expect(isHead(out[1]) && out[1]._rowId === 'a').toBe(true);
      expect(out[2]).toBe(base[1]);
      expect(out[3]).toBe(base[2]);
      expect(isHead(out[4]) && out[4]._rowId === 'c').toBe(true);
      expect(out[5]).toBe(base[3]);
    });
  });

  describe('group/tree 상류와의 합성(§7 — 그룹 헤더 제외, 트리 데이터 행 허용)', () => {
    it('_isGroup 항목은 마스터 후보에서 제외(detail 미부착)', () => {
      const groupHeader = { _isGroup: true, _groupField: 'cat', _groupValue: 'x' };
      const dataRow: Row = { id: 'a', name: 'A' };
      const base = [groupHeader, dataRow];
      const out = spliceDetails(base, { expandedRowIds: new Set(['a']), getRowId, rowHeight: 30, height: 30 });
      // groupHeader 뒤에는 삽입되지 않고, dataRow 뒤에만 head 삽입
      expect(out[0]).toBe(groupHeader);
      expect(out[1]).toBe(dataRow);
      expect(isHead(out[2]) && out[2]._rowId === 'a').toBe(true);
      expect(out).toHaveLength(3);
    });

    it('_isTree 노드는 .data 를 통해 rowId 를 해소해 detail 부착 허용', () => {
      const treeNode = { _isTree: true, data: { id: 't1', name: 'Tree Row' } as Row };
      const base = [treeNode];
      const out = spliceDetails(base, { expandedRowIds: new Set(['t1']), getRowId, rowHeight: 30, height: 30 });
      expect(out[0]).toBe(treeNode);
      expect(isHead(out[1]) && out[1]._rowId === 't1' && out[1]._masterFlatBase === treeNode).toBe(true);
    });

    it('이미 detail 의사행인 항목은 재적용하지 않는다(멱등/방어)', () => {
      const head: DetailHeadItem = { _isDetailHead: true, _rowId: 'a', _span: 1 };
      const base = [head as any];
      const out = spliceDetails(base, { expandedRowIds: new Set(['a']), getRowId: (r: any) => r?.id, rowHeight: 30 });
      expect(out).toEqual([head]);
    });
  });

  describe('stable-id 보존(FR-4 — 정렬 시뮬 후에도 펼침 앵커가 같은 rowId 를 가리킴)', () => {
    it('baseFlat 순서가 바뀌어도(정렬 흉내) 동일 rowId 뒤에 head 가 따라간다', () => {
      const rows: Row[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
      const expandedRowIds = new Set(['b']);
      const before = spliceDetails(rows, { expandedRowIds, getRowId, rowHeight: 30, height: 30 });
      const beforeHeadIdx = before.findIndex(isHead);
      expect((before[beforeHeadIdx - 1] as Row).id).toBe('b');

      // "정렬"을 흉내: 배열을 역순으로 재구성(같은 rowId 세트, 다른 순서)
      const sorted = [...rows].reverse();
      const after = spliceDetails(sorted, { expandedRowIds, getRowId, rowHeight: 30, height: 30 });
      const afterHeadIdx = after.findIndex(isHead);
      expect((after[afterHeadIdx - 1] as Row).id).toBe('b'); // 여전히 b 뒤
      expect((after[afterHeadIdx] as DetailHeadItem)._rowId).toBe('b');
    });
  });

  describe('filler kind 판별(쓰기 안전 재료, C0.3)', () => {
    it('filler 항목은 _isDetailFiller=true 만 갖고 실데이터 필드가 섞이지 않는다', () => {
      const base: Row[] = [{ id: 'a', name: 'A' }];
      const out = spliceDetails(base, { expandedRowIds: new Set(['a']), getRowId, rowHeight: 30, height: 90 });
      const filler = out.find(isFiller) as DetailFillerItem;
      expect(filler).toBeDefined();
      expect(Object.keys(filler).sort()).toEqual(['_isDetailFiller', '_rowId']);
      // head 와 filler 는 서로 다른 kind 로 명확히 구분되어야 함(F1 fill/paste skip 판별 전제)
      const head = out.find(isHead)!;
      expect(isFiller(head)).toBe(false);
      expect(isHead(filler)).toBe(false);
    });
  });

  describe('maxDetailDepth 는 이 함수의 관심사가 아님(DetailState 가 이미 거른 rowId 만 들어온다는 계약)', () => {
    it('expandedRowIds 에 존재하면 depth 검증 없이 그대로 스플라이스(호출자 책임 분리 확인용)', () => {
      const base: Row[] = [{ id: 'a', name: 'A' }];
      const out = spliceDetails(base, { expandedRowIds: new Set(['a']), getRowId, rowHeight: 30, height: 30 });
      expect(out.some(isHead)).toBe(true);
    });
  });
});
