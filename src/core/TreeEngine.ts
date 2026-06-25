export interface TreeNode<T = any> {
  _isTree: true;
  _treeId: any;
  _treeParentId: any;
  _depth: number;
  _expanded: boolean;
  _hasChildren: boolean;
  _childCount: number;
  // 탐색기 스타일 트리 라인 렌더링용 메타
  _isLastChild: boolean;       // true → └─  /  false → ├─
  _ancestorHasMore: boolean[]; // [d] = true → 깊이 d 조상에 형제가 더 있어 │ 라인 표시
  data: T;
  children: TreeNode<T>[];
}

export type TreeItem<T> = TreeNode<T>;

export function isTreeNode<T>(item: any): item is TreeNode<T> {
  return item != null && item._isTree === true;
}

export interface TreeBuildOptions {
  idField: string;
  parentIdField: string;
  expandOnLoad?: boolean;
}

/**
 * flat 데이터를 트리 구조로 변환.
 * parentId가 null/undefined/''인 행이 루트 노드.
 */
export function buildTree<T extends Record<string, any>>(
  data: T[],
  opts: TreeBuildOptions,
  expandedKeys: Set<any> = new Set()
): TreeNode<T>[] {
  const { idField, parentIdField, expandOnLoad = false } = opts;

  const nodeMap = new Map<any, TreeNode<T>>();
  const roots: TreeNode<T>[] = [];

  // 1단계: 모든 노드 생성
  for (const row of data) {
    const id = row[idField];
    const node: TreeNode<T> = {
      _isTree: true,
      _treeId: id,
      _treeParentId: row[parentIdField],
      _depth: 0,
      _expanded: expandOnLoad || expandedKeys.has(id),
      _hasChildren: false,
      _childCount: 0,
      _isLastChild: false,
      _ancestorHasMore: [],
      data: row,
      children: [],
    };
    nodeMap.set(id, node);
  }

  // 2단계: 부모-자식 연결
  for (const node of nodeMap.values()) {
    const pid = node._treeParentId;
    const isRoot = pid == null || pid === '' || !nodeMap.has(pid);
    if (isRoot) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(pid)!;
      parent.children.push(node);
      parent._hasChildren = true;
    }
  }

  // 3단계: 깊이 설정 + childCount
  function assignDepth(nodes: TreeNode<T>[], depth: number): void {
    for (const n of nodes) {
      n._depth = depth;
      n._childCount = _countDescendants(n);
      assignDepth(n.children, depth + 1);
    }
  }
  assignDepth(roots, 0);

  // 4단계: 탐색기 라인 메타 (_isLastChild, _ancestorHasMore)
  // parentHasMoreChain[d] = true → 깊이 d 위치에서 아직 형제가 남아있음 → │ 라인
  function assignLineMeta(nodes: TreeNode<T>[], parentHasMoreChain: boolean[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const isLast = i === nodes.length - 1;
      node._isLastChild    = isLast;
      node._ancestorHasMore = parentHasMoreChain;
      if (node.children.length > 0) {
        // 자식에게 전달: 이 노드가 마지막이 아니면 자식들 가이드에 │ 표시
        assignLineMeta(node.children, [...parentHasMoreChain, !isLast]);
      }
    }
  }
  assignLineMeta(roots, []);

  return roots;
}

function _countDescendants<T>(node: TreeNode<T>): number {
  let count = node.children.length;
  for (const child of node.children) count += _countDescendants(child);
  return count;
}

/**
 * 트리를 화면에 표시할 flat 배열로 변환.
 * 접힌 노드(_expanded=false)의 자식은 제외.
 */
export function flattenTree<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  const result: TreeNode<T>[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node._expanded && node.children.length > 0) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

/** 특정 id 노드의 펼침 상태 토글 */
export function toggleTreeNode<T>(
  expandedKeys: Set<any>,
  nodeId: any
): void {
  if (expandedKeys.has(nodeId)) {
    expandedKeys.delete(nodeId);
  } else {
    expandedKeys.add(nodeId);
  }
}

/** 모든 노드 id 수집 */
export function collectAllTreeIds<T>(nodes: TreeNode<T>[]): any[] {
  const ids: any[] = [];
  for (const n of nodes) {
    ids.push(n._treeId);
    if (n.children.length) ids.push(...collectAllTreeIds(n.children));
  }
  return ids;
}
