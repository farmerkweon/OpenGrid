import { describe, it, expect } from 'vitest';
import {
  buildTree, flattenTree, toggleTreeNode, collectAllTreeIds, isTreeNode,
} from '../../src/core/TreeEngine.js';

interface Row {
  id: number;
  parentId: number | null;
  name: string;
}

const opts = { idField: 'id', parentIdField: 'parentId' };

const flat: Row[] = [
  { id: 1, parentId: null, name: 'Root A' },
  { id: 2, parentId: null, name: 'Root B' },
  { id: 3, parentId: 1,    name: 'Child A1' },
  { id: 4, parentId: 1,    name: 'Child A2' },
  { id: 5, parentId: 3,    name: 'Grandchild A1-1' },
];

describe('TreeEngine', () => {
  describe('buildTree', () => {
    it('루트 노드 2개 생성', () => {
      const roots = buildTree(flat, opts);
      expect(roots).toHaveLength(2);
    });

    it('루트 노드의 _isTree = true', () => {
      const roots = buildTree(flat, opts);
      expect(roots[0]!._isTree).toBe(true);
    });

    it('자식 노드 연결', () => {
      const roots = buildTree(flat, opts);
      const rootA = roots.find(r => r._treeId === 1)!;
      expect(rootA.children).toHaveLength(2);
    });

    it('손자 노드 연결', () => {
      const roots = buildTree(flat, opts);
      const rootA = roots.find(r => r._treeId === 1)!;
      const childA1 = rootA.children.find(c => c._treeId === 3)!;
      expect(childA1.children).toHaveLength(1);
      expect(childA1.children[0]!._treeId).toBe(5);
    });

    it('_depth 할당 - 루트=0, 자식=1, 손자=2', () => {
      const roots = buildTree(flat, opts);
      const rootA = roots.find(r => r._treeId === 1)!;
      expect(rootA._depth).toBe(0);
      expect(rootA.children[0]!._depth).toBe(1);
      expect(rootA.children[0]!.children[0]!._depth).toBe(2);
    });

    it('_hasChildren - 자식 있는 노드만 true', () => {
      const roots = buildTree(flat, opts);
      const rootA = roots.find(r => r._treeId === 1)!;
      const rootB = roots.find(r => r._treeId === 2)!;
      expect(rootA._hasChildren).toBe(true);
      expect(rootB._hasChildren).toBe(false);
    });

    it('_childCount - 전체 하위 행 수', () => {
      const roots = buildTree(flat, opts);
      const rootA = roots.find(r => r._treeId === 1)!;
      // A1 + A2 + A1-1 = 3
      expect(rootA._childCount).toBe(3);
    });

    it('data 필드에 원본 행 저장', () => {
      const roots = buildTree(flat, opts);
      expect(roots[0]!.data.name).toBe('Root A');
    });

    it('expandOnLoad=true 이면 모든 노드 _expanded=true', () => {
      const roots = buildTree(flat, { ...opts, expandOnLoad: true });
      const rootA = roots.find(r => r._treeId === 1)!;
      expect(rootA._expanded).toBe(true);
      expect(rootA.children[0]!._expanded).toBe(true);
    });

    it('expandedKeys 로 특정 노드만 펼침', () => {
      const expanded = new Set<any>([1]);
      const roots = buildTree(flat, opts, expanded);
      const rootA = roots.find(r => r._treeId === 1)!;
      expect(rootA._expanded).toBe(true);
      expect(roots.find(r => r._treeId === 2)!._expanded).toBe(false);
    });
  });

  describe('flattenTree', () => {
    it('접힌 루트: 루트만 반환', () => {
      const roots = buildTree(flat, opts); // 모두 접힘
      const result = flattenTree(roots);
      expect(result).toHaveLength(2); // Root A, Root B만
    });

    it('루트A 펼치면 A + A1 + A2 = 3행', () => {
      const expanded = new Set<any>([1]);
      const roots = buildTree(flat, opts, expanded);
      const result = flattenTree(roots);
      expect(result).toHaveLength(4); // Root A, Child A1, Child A2, Root B
    });

    it('루트A + A1 펼치면 5행 전체', () => {
      const expanded = new Set<any>([1, 3]);
      const roots = buildTree(flat, opts, expanded);
      const result = flattenTree(roots);
      expect(result).toHaveLength(5);
    });

    it('flattenTree 항목은 모두 _isTree=true', () => {
      const expanded = new Set<any>([1, 3]);
      const roots = buildTree(flat, opts, expanded);
      const result = flattenTree(roots);
      expect(result.every(n => n._isTree)).toBe(true);
    });
  });

  describe('toggleTreeNode', () => {
    it('펼침 상태 추가', () => {
      const keys = new Set<any>();
      toggleTreeNode(keys, 1);
      expect(keys.has(1)).toBe(true);
    });

    it('이미 있으면 제거 (토글)', () => {
      const keys = new Set<any>([1]);
      toggleTreeNode(keys, 1);
      expect(keys.has(1)).toBe(false);
    });
  });

  describe('collectAllTreeIds', () => {
    it('모든 노드 id 수집', () => {
      const roots = buildTree(flat, opts);
      const ids = collectAllTreeIds(roots);
      expect(ids.sort()).toEqual([1, 2, 3, 4, 5].sort());
    });
  });

  describe('isTreeNode', () => {
    it('TreeNode 타입가드 - true', () => {
      const roots = buildTree(flat, opts);
      expect(isTreeNode(roots[0])).toBe(true);
    });

    it('일반 객체 - false', () => {
      expect(isTreeNode({ id: 1 })).toBe(false);
    });

    it('null - false', () => {
      expect(isTreeNode(null)).toBe(false);
    });
  });
});
