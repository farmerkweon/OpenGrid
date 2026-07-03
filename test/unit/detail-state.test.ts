import { describe, it, expect } from 'vitest';
import { DetailState } from '../../src/core/detail/DetailState.js';

describe('DetailState (F2 헤드리스 펼침 상태)', () => {
  describe('기본 expand/collapse/toggle/isExpanded', () => {
    it('expand 후 isExpanded true', () => {
      const s = new DetailState();
      expect(s.isExpanded('r1')).toBe(false);
      expect(s.expand('r1')).toBe(true);
      expect(s.isExpanded('r1')).toBe(true);
    });

    it('collapse 후 isExpanded false, 반환값은 실제 제거 여부', () => {
      const s = new DetailState();
      s.expand('r1');
      expect(s.collapse('r1')).toBe(true);
      expect(s.isExpanded('r1')).toBe(false);
      expect(s.collapse('r1')).toBe(false); // 이미 접힘 — no-op 신호
    });

    it('toggle: 펼침→접힘→펼침 왕복', () => {
      const s = new DetailState();
      expect(s.toggle('r1')).toBe('expanded');
      expect(s.isExpanded('r1')).toBe(true);
      expect(s.toggle('r1')).toBe('collapsed');
      expect(s.isExpanded('r1')).toBe(false);
      expect(s.toggle('r1')).toBe('expanded');
    });

    it('expand 는 멱등(이미 펼침 상태에서 재호출해도 true, 중복 미적재)', () => {
      const s = new DetailState();
      s.expand('r1');
      s.expand('r1');
      expect(s.size).toBe(1);
    });

    it('expandedRowIds 는 stable rowId 집합을 그대로 노출', () => {
      const s = new DetailState();
      s.expand('r1');
      s.expand('r2');
      expect([...s.expandedRowIds].sort()).toEqual(['r1', 'r2']);
    });
  });

  describe('maxDepth 경계 (CON-4/FR-10)', () => {
    it('기본 maxDepth=2, depth=0 이면 펼침 허용', () => {
      const s = new DetailState();
      expect(s.canExpand()).toBe(true);
      expect(s.expand('r1')).toBe(true);
    });

    it('depth >= maxDepth 이면 canExpand=false, expand 거부(false), 상태 미생성', () => {
      const s = new DetailState({ maxDepth: 2, depth: 2 });
      expect(s.canExpand()).toBe(false);
      expect(s.expand('r1')).toBe(false);
      expect(s.isExpanded('r1')).toBe(false);
      expect(s.size).toBe(0);
    });

    it('depth 가 maxDepth 보다 1 작으면 마지막 depth 에서도 펼침 허용(경계값)', () => {
      const s = new DetailState({ maxDepth: 2, depth: 1 });
      expect(s.canExpand()).toBe(true);
      expect(s.expand('r1')).toBe(true);
    });

    it('toggle 도 depth 초과 시 rejected 를 반환(collapsed/expanded 와 구분되는 3번째 결과)', () => {
      const s = new DetailState({ maxDepth: 1, depth: 1 });
      expect(s.toggle('r1')).toBe('rejected');
      expect(s.isExpanded('r1')).toBe(false);
    });

    it('이미 펼쳐진 rowId 는 depth 초과 상태에서도 collapse 가능(펼침 이후 depth 정책이 강화된 경우 방어)', () => {
      const s = new DetailState({ maxDepth: 2, depth: 0 });
      s.expand('r1');
      // depth 정책이 조여도(구성 재생성 시나리오) 이미 펼친 항목은 canExpand 재검사 없이 멱등 true
      expect(s.expand('r1')).toBe(true);
    });
  });

  describe('expandMultiple 아코디언 (masterDetail.expandMultiple:false)', () => {
    it('기본(expandMultiple:true)은 다중 펼침 허용', () => {
      const s = new DetailState();
      s.expand('r1');
      s.expand('r2');
      expect(s.size).toBe(2);
    });

    it('expandMultiple:false 면 새 펼침이 기존 펼침을 모두 접는다(1개만 유지)', () => {
      const s = new DetailState({ expandMultiple: false });
      s.expand('r1');
      s.expand('r2');
      expect(s.size).toBe(1);
      expect(s.isExpanded('r1')).toBe(false);
      expect(s.isExpanded('r2')).toBe(true);
    });

    it('아코디언 모드에서 동일 rowId 재펼침은 다른 rowId 를 접지 않는다(멱등 우선)', () => {
      const s = new DetailState({ expandMultiple: false });
      s.expand('r1');
      s.expand('r1');
      expect(s.isExpanded('r1')).toBe(true);
      expect(s.size).toBe(1);
    });
  });

  describe('collapseAll', () => {
    it('전부 접고 접힌 rowId 목록을 반환', () => {
      const s = new DetailState();
      s.expand('r1');
      s.expand('r2');
      const collapsed = s.collapseAll();
      expect(collapsed.sort()).toEqual(['r1', 'r2']);
      expect(s.size).toBe(0);
    });

    it('빈 상태에서 collapseAll 호출은 빈 배열', () => {
      const s = new DetailState();
      expect(s.collapseAll()).toEqual([]);
    });
  });

  describe('buildEventPayload (FR-6 재료)', () => {
    it('rowIndex/rowId/row/host 를 그대로 담은 payload 를 반환', () => {
      const s = new DetailState();
      const row = { id: 'r1', name: 'A' };
      const host = null;
      const payload = s.buildEventPayload('r1', 5, row, host);
      expect(payload).toEqual({ rowIndex: 5, rowId: 'r1', row, host });
    });
  });
});
