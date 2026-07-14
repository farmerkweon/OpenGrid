/** 트리 노드 — 원본 행 데이터에 계층·펼침·라인 렌더 메타를 얹은 래퍼. / A tree node — wraps a row with hierarchy, expansion, and line-render metadata. */
export interface TreeNode<T = any> {
  /** 트리 노드 판별 플래그(항상 true). / Tree-node discriminant flag (always true). */
  _isTree: true;
  /** 노드 id(idField 값). / Node id (value of `idField`). */
  _treeId: any;
  /** 부모 노드 id(parentIdField 값). / Parent node id (value of `parentIdField`). */
  _treeParentId: any;
  /** 트리 깊이(루트 0). / Tree depth (root is 0). */
  _depth: number;
  /** 펼침 여부. / Whether the node is expanded. */
  _expanded: boolean;
  /** 자식 보유 여부. / Whether the node has children. */
  _hasChildren: boolean;
  /** 하위 전체(후손) 노드 수. / Total descendant node count. */
  _childCount: number;
  // 탐색기 스타일 트리 라인 렌더링용 메타 / Metadata for explorer-style tree-line rendering
  /** true → └─ / false → ├─. / true → └─, false → ├─. */
  _isLastChild: boolean;
  /** [d]=true → 깊이 d 조상에 형제가 더 있어 │ 라인 표시. / `[d]=true` → an ancestor at depth d has more siblings, so draw a │ line. */
  _ancestorHasMore: boolean[];
  /** 원본 행 데이터. / The original row data. */
  data: T;
  /** 자식 노드 배열. / Child nodes. */
  children: TreeNode<T>[];
}

/** 트리 항목 별칭(=TreeNode). / Tree item alias (= TreeNode). */
export type TreeItem<T> = TreeNode<T>;

/**
 * 값이 트리 노드인지 판별하는 타입 가드. / Type guard: whether a value is a tree node.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param item - 검사할 값 / Value to test
 * @returns 트리 노드이면 true / true if the value is a tree node
 */
export function isTreeNode<T>(item: any): item is TreeNode<T> {
  return item != null && item._isTree === true;
}

/** 트리 빌드 옵션. / Options for building a tree. */
export interface TreeBuildOptions {
  /** 노드 id 필드명. / Field name holding the node id. */
  idField: string;
  /** 부모 id 필드명. / Field name holding the parent id. */
  parentIdField: string;
  /** 로드 시 전체 펼침 여부(기본 false). / Whether to expand all on load (default false). */
  expandOnLoad?: boolean;
}

/**
 * flat 데이터를 트리 구조로 변환. / Convert flat data into a tree structure.
 *
 * parentId가 null/undefined/'' 또는 미존재인 행이 루트 노드가 된다. 깊이·후손 수·
 * 탐색기 라인 메타(_isLastChild, _ancestorHasMore)를 함께 계산한다.
 * / Rows whose parentId is null/undefined/'' or missing become root nodes. Also computes depth,
 *   descendant counts, and explorer line metadata (_isLastChild, _ancestorHasMore).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param data - flat 행 배열 / Flat rows
 * @param opts - id/parentId 필드 및 펼침 옵션 / id/parentId fields and expand option
 * @param expandedKeys - 펼침 상태 노드 id 집합 / Set of expanded node ids
 * @returns 루트 노드 배열 / Array of root nodes
 * @example
 * const roots = buildTree(rows, { idField: 'id', parentIdField: 'pid' });
 * const flat = flattenTree(roots); // 화면 표시용 / for on-screen display
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
 * 트리를 화면에 표시할 flat 배열로 변환. / Flatten a tree into a display array.
 *
 * 접힌 노드(_expanded=false)의 자식은 제외. / Children of collapsed nodes (_expanded=false) are excluded.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param nodes - 루트 노드 배열 / Root nodes
 * @returns 펼침 상태에 따른 표시 노드 배열 / Visible nodes according to expansion state
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

/**
 * 특정 id 노드의 펼침 상태 토글. / Toggle the expansion state of a node id.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param expandedKeys - 펼침 상태 집합(제자리 변경) / Set of expanded ids (mutated in place)
 * @param nodeId - 토글할 노드 id / Node id to toggle
 */
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

/**
 * 모든 노드 id 수집(전체 펼침/접기 등에 사용). / Collect every node id (used for expand-all/collapse-all).
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @param nodes - 루트 노드 배열 / Root nodes
 * @returns 후손 포함 전체 노드 id 배열 / All node ids including descendants
 */
export function collectAllTreeIds<T>(nodes: TreeNode<T>[]): any[] {
  const ids: any[] = [];
  for (const n of nodes) {
    ids.push(n._treeId);
    if (n.children.length) ids.push(...collectAllTreeIds(n.children));
  }
  return ids;
}
