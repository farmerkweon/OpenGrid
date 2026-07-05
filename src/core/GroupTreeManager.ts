import { DataLayer } from './DataLayer.js';
import { VirtualScroll } from './VirtualScroll.js';
import {
  buildGroups, flattenGroups, collectAllKeys,
  type GroupRow, type SummaryDef,
} from './GroupEngine.js';
import {
  buildTree, flattenTree, toggleTreeNode, collectAllTreeIds,
  type TreeNode,
} from './TreeEngine.js';

/**
 * {@link GroupTreeManager} 의존성 주입 계약. / Dependency-injection contract for {@link GroupTreeManager}.
 *
 * 그룹/트리 재구성에 필요한 데이터·렌더·백킹 배선 훅을 호스트 그리드가 제공한다.
 * / The host grid supplies the data/render/backing-wiring hooks needed to rebuild
 * groups and trees.
 */
export interface GroupTreeDeps<T extends Record<string, any>> {
  /** 현재 원본 행 배열 조회. / Look up the current raw row array. */
  getData: () => T[];
  /** 현재 데이터 레이어 조회. / Look up the current data layer. */
  getDataLayer: () => DataLayer<T>;
  /** 현재 그리드 옵션 조회. / Look up the current grid options. */
  getOptions: () => any;
  /** 가상 스크롤 인스턴스 조회(없으면 `null`). / Look up the virtual-scroll instance (or `null`). */
  getVs: () => VirtualScroll | null;
  /** 전체 재계산 렌더(총 행수 갱신 포함). / Full re-render including a total-row-count refresh. */
  doRenderFull: (totalRows: number) => void;
  /** 바디를 다시 그린다. / Re-render the body. */
  doRender: () => void;
  /** Phase 2: OverrideKernel.getStrategy 주입(슬롯 groupKeyFn 도달용).
   * / Phase 2: injected `OverrideKernel.getStrategy` (reaches the `groupKeyFn` slot). */
  getStrategy?: <F extends Function>(slot: string, fallback: F) => F;
  /**
   * Phase 0(C0.3): FlatRowModel 의 baseline backing 등록점. group/tree 진입 시 자기
   * flat 배열(`_groupFlatRows`/`_treeFlatRows`)로 교체하고, 해제 시 null(plain 복귀)로 되돌린다.
   * / Phase 0 (C0.3): registration point for `FlatRowModel`'s baseline backing. Swapped
   * to this manager's own flat array (`_groupFlatRows`/`_treeFlatRows`) on entering
   * group/tree mode, and reset to `null` (plain mode) on exit.
   *
   * @param provider - flat 행 배열을 반환하는 함수, 해제 시 `null` / Function returning the flat row array, or `null` to detach
   */
  setFlatBacking: (provider: (() => Array<any>) | null) => void;
  /**
   * F2(11_design_F2_v2.md §3.2 R3 "flat 소유 경합" 해소): setFlatBacking 직후 이 값을 조회해
   * VirtualScroll.setTotalRows/doRenderFull 에 넘긴다. FlatRowModel.count() 는 방금 교체한
   * backing 위에 DetailManager 가 등록한 detail splice 까지 합성한 "최종" 총 행수이므로,
   * GroupTreeManager 는 자기 배열 길이(`_groupFlatRows.length` 등)를 직접 쓰지 않는다
   * (detail 활성 시 그 값은 실제보다 작아 스크롤/렌더 범위가 잘린다).
   * / F2 (11_design_F2_v2.md §3.2 R3, resolving the "flat ownership contention" issue):
   * queried right after `setFlatBacking` and passed to `VirtualScroll.setTotalRows`/
   * `doRenderFull`. `FlatRowModel.count()` is the "final" total row count — it composites
   * the backing just swapped in with any detail splices `DetailManager` has registered —
   * so `GroupTreeManager` never uses its own array length (`_groupFlatRows.length`, etc.)
   * directly (with detail active, that length is smaller than the real total and would
   * truncate the scroll/render range).
   *
   * @returns 합성된 최종 총 행수 / The composited final total row count
   */
  getFlatCount: () => number;
}

/**
 * 그룹핑과 트리 모드를 함께 관리하는 매니저. / Manages both grouping and tree (parent/child) modes.
 *
 * 그룹/트리는 상호 배타적이며, 둘 다 원본 데이터를 하나의 "flat 배열"로 펼쳐
 * {@link GroupTreeDeps.setFlatBacking} 을 통해 가상 스크롤의 백킹으로 등록한다.
 * / Grouping and tree mode are mutually exclusive; both flatten the source data into
 * a single "flat array" and register it as the virtual-scroll backing via
 * {@link GroupTreeDeps.setFlatBacking}.
 */
export class GroupTreeManager<T extends Record<string, any> = any> {
  private _groupFields: string[] = [];
  private _groupExpandedKeys: Set<string> = new Set();
  private _groupFlatRows: Array<GroupRow<T> | T> = [];
  private _isGroupMode = false;
  private _treeRoots: TreeNode<T>[] = [];
  private _treeFlatRows: TreeNode<T>[] = [];
  private _treeExpandedKeys: Set<any> = new Set();
  private _isTreeMode = false;
  private _d: GroupTreeDeps<T>;

  constructor(deps: GroupTreeDeps<T>) {
    this._d = deps;
  }

  // ─── 상태 접근자 ─────────────────────────────────────────
  /** 그룹 모드 활성 여부. / Whether group mode is active. */
  get isGroupMode(): boolean { return this._isGroupMode; }
  /** 트리 모드 활성 여부. / Whether tree mode is active. */
  get isTreeMode(): boolean { return this._isTreeMode; }
  /** 현재 펼쳐진 그룹 flat 행 배열(그룹 헤더/요약/데이터 행 혼합). / Current flattened group rows (mix of group header/summary/data rows). */
  get groupFlatRows(): Array<GroupRow<T> | T> { return this._groupFlatRows; }
  /** 현재 펼쳐진 트리 flat 노드 배열(펼침 상태 반영). / Current flattened tree nodes (reflects expand/collapse state). */
  get treeFlatRows(): TreeNode<T>[] { return this._treeFlatRows; }

  // ─── 그룹 ─────────────────────────────────────────────────
  /**
   * 지정 필드로 그룹핑을 시작(또는 재설정)한다. / Start (or reset) grouping by the given fields.
   *
   * @param fields - 그룹 기준 필드명 배열(순서대로 중첩). 빈 배열이면 그룹 해제 / Fields to group by, in nesting order; an empty array disables grouping
   */
  groupBy(fields: string[]): void {
    this._groupFields = fields;
    this._groupExpandedKeys.clear();
    this._isGroupMode = fields.length > 0;
    this.rebuildGroups();
  }

  /** 그룹핑을 해제하고 평면 모드로 복귀한다. / Disable grouping and return to flat mode. */
  clearGroup(): void {
    this._groupFields = [];
    this._groupExpandedKeys.clear();
    this._isGroupMode = false;
    this._groupFlatRows = [];
    this._d.setFlatBacking(null);
    this._d.getVs()?.setTotalRows(this._d.getFlatCount());
    this._d.doRender();
  }

  /** 모든 그룹을 펼친다(그룹 모드가 아니면 무시). / Expand every group (no-op outside group mode). */
  expandAll(): void {
    if (!this._isGroupMode) return;
    const groups = buildGroups(this._d.getData(), this._groupFields, this._getSummaryDefs(), undefined, undefined, this._groupKeyFn());
    collectAllKeys(groups).forEach(k => this._groupExpandedKeys.add(k));
    this.rebuildGroups();
  }

  /** Phase 2 슬롯 #5: groupKeyFn resolver. default = undefined(→ GroupEngine 가 row[field] 사용).
   * / Phase 2 slot #5: groupKeyFn resolver. Default `undefined` (falls back to
   * `GroupEngine` using `row[field]`).
   * @internal */
  private _groupKeyFn(): ((row: T, remainingFields: string[]) => any) | undefined {
    return this._d.getStrategy
      ? this._d.getStrategy('groupKeyFn', undefined as any)
      : undefined;
  }

  /** 모든 그룹을 접는다. / Collapse every group. */
  collapseAll(): void {
    this._groupExpandedKeys.clear();
    if (this._isGroupMode) this.rebuildGroups();
  }

  /**
   * 특정 그룹의 펼침/접힘을 토글한다. / Toggle a single group's expand/collapse state.
   *
   * @param groupKey - 대상 그룹의 키 / Key of the target group
   */
  handleGroupToggle(groupKey: string): void {
    if (this._groupExpandedKeys.has(groupKey)) {
      this._groupExpandedKeys.delete(groupKey);
    } else {
      this._groupExpandedKeys.add(groupKey);
    }
    this.rebuildGroups();
  }

  /**
   * 현재 그룹 필드/펼침 상태로 flat 행 배열을 재계산하고 렌더한다. / Recompute the flat row array from the current group fields/expand state and render.
   */
  rebuildGroups(): void {
    const data = this._d.getData();
    const dl   = this._d.getDataLayer();
    const getState = (row: any): string => {
      const idx = data.indexOf(row);
      return idx >= 0 ? dl.getRowState(idx) : 'none';
    };
    const groups = buildGroups(data, this._groupFields, this._getSummaryDefs(), this._groupExpandedKeys, getState, this._groupKeyFn());
    this._groupFlatRows = flattenGroups(groups);
    this._d.setFlatBacking(() => this._groupFlatRows);
    const n = this._d.getFlatCount();
    this._d.getVs()?.setTotalRows(n);
    this._d.doRenderFull(n);
  }

  // ─── 트리 ─────────────────────────────────────────────────
  /**
   * 트리 모드를 활성화한다(그룹 모드와 배타). / Enable tree mode (mutually exclusive with group mode).
   *
   * `expandOnLoad` 옵션이 켜져 있으면 전체 노드를 펼친 상태로 시작한다.
   * / If the `expandOnLoad` option is on, starts with every node expanded.
   */
  enableTree(): void {
    this._isTreeMode  = true;
    this._isGroupMode = false;
    const opts = this._d.getOptions();
    if (opts.expandOnLoad) {
      const temp = buildTree(this._d.getData(), {
        idField: opts.treeId,
        parentIdField: opts.treeParentId,
      });
      collectAllTreeIds(temp).forEach(id => this._treeExpandedKeys.add(id));
    }
    this.rebuildTree();
  }

  /** 트리 모드를 해제하고 평면 모드로 복귀한다. / Disable tree mode and return to flat mode. */
  disableTree(): void {
    this._isTreeMode = false;
    this._treeRoots  = [];
    this._treeFlatRows = [];
    this._treeExpandedKeys.clear();
    this._d.setFlatBacking(null);
    this._d.getVs()?.setTotalRows(this._d.getFlatCount());
    this._d.doRender();
  }

  /**
   * 지정 노드(들)를 펼치거나 접는다. / Expand or collapse the given node(s).
   *
   * @param ids - 대상 노드 id, 또는 id 배열 / A single node id, or an array of node ids
   * @param open - `true` 면 펼침, `false` 면 접힘(기본 `true`) / `true` to expand, `false` to collapse (default `true`)
   */
  expandNodes(ids: any | any[], open = true): void {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const id of arr) {
      if (open) this._treeExpandedKeys.add(id);
      else      this._treeExpandedKeys.delete(id);
    }
    if (this._isTreeMode) this.rebuildTree();
  }

  /** 모든 트리 노드를 펼친다(트리 모드가 아니면 무시). / Expand every tree node (no-op outside tree mode). */
  expandAllNodes(): void {
    if (!this._isTreeMode) return;
    collectAllTreeIds(this._treeRoots).forEach(id => this._treeExpandedKeys.add(id));
    this.rebuildTree();
  }

  /** 모든 트리 노드를 접는다(트리 모드가 아니면 무시). / Collapse every tree node (no-op outside tree mode). */
  collapseAllNodes(): void {
    if (!this._isTreeMode) return;
    this._treeExpandedKeys.clear();
    this.rebuildTree();
  }

  /**
   * 특정 트리 노드의 펼침/접힘을 토글한다. / Toggle a single tree node's expand/collapse state.
   *
   * @param nodeId - 대상 노드 id / Id of the target node
   */
  handleTreeToggle(nodeId: any): void {
    toggleTreeNode(this._treeExpandedKeys, nodeId);
    this.rebuildTree();
  }

  /**
   * 현재 펼침 상태로 트리를 재구성하고 flat 행 배열을 갱신한다. / Rebuild the tree from the current expand state and refresh the flat row array.
   */
  rebuildTree(): void {
    const opts = this._d.getOptions();
    this._treeRoots = buildTree(this._d.getData(), {
      idField: opts.treeId,
      parentIdField: opts.treeParentId,
      expandOnLoad: opts.expandOnLoad,
    }, this._treeExpandedKeys);
    this._treeFlatRows = flattenTree(this._treeRoots);
    this._d.setFlatBacking(() => this._treeFlatRows);
    const n = this._d.getFlatCount();
    this._d.getVs()?.setTotalRows(n);
    this._d.doRenderFull(n);
  }

  // ─── 내부 헬퍼 ───────────────────────────────────────────
  /** @internal */
  private _getSummaryDefs(): SummaryDef[] {
    const s = this._d.getOptions().summary;
    if (!s) return [];
    if (s.rows && s.rows.length > 0) {
      return s.fields.flatMap((f: string) =>
        s.rows!.map((r: any) => ({ field: f, op: r.op, format: r.format }))
      );
    }
    const ops = Array.isArray(s.ops) ? s.ops : (s.ops ? [s.ops] : ['SUM']);
    return s.fields.map((f: string) => ({ field: f, op: ops[0] ?? 'SUM', format: (s as any).format }));
  }
}
