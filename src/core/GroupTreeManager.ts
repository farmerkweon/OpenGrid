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

export interface GroupTreeDeps<T extends Record<string, any>> {
  getData: () => T[];
  getDataLayer: () => DataLayer<T>;
  getOptions: () => any;
  getVs: () => VirtualScroll | null;
  doRenderFull: (totalRows: number) => void;
  doRender: () => void;
  /** Phase 2: OverrideKernel.getStrategy 주입(슬롯 groupKeyFn 도달용). */
  getStrategy?: <F extends Function>(slot: string, fallback: F) => F;
  /**
   * Phase 0(C0.3): FlatRowModel 의 baseline backing 등록점. group/tree 진입 시 자기
   * flat 배열(`_groupFlatRows`/`_treeFlatRows`)로 교체하고, 해제 시 null(plain 복귀)로 되돌린다.
   */
  setFlatBacking: (provider: (() => Array<any>) | null) => void;
  /**
   * F2(11_design_F2_v2.md §3.2 R3 "flat 소유 경합" 해소): setFlatBacking 직후 이 값을 조회해
   * VirtualScroll.setTotalRows/doRenderFull 에 넘긴다. FlatRowModel.count() 는 방금 교체한
   * backing 위에 DetailManager 가 등록한 detail splice 까지 합성한 "최종" 총 행수이므로,
   * GroupTreeManager 는 자기 배열 길이(`_groupFlatRows.length` 등)를 직접 쓰지 않는다
   * (detail 활성 시 그 값은 실제보다 작아 스크롤/렌더 범위가 잘린다).
   */
  getFlatCount: () => number;
}

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
  get isGroupMode(): boolean { return this._isGroupMode; }
  get isTreeMode(): boolean { return this._isTreeMode; }
  get groupFlatRows(): Array<GroupRow<T> | T> { return this._groupFlatRows; }
  get treeFlatRows(): TreeNode<T>[] { return this._treeFlatRows; }

  // ─── 그룹 ─────────────────────────────────────────────────
  groupBy(fields: string[]): void {
    this._groupFields = fields;
    this._groupExpandedKeys.clear();
    this._isGroupMode = fields.length > 0;
    this.rebuildGroups();
  }

  clearGroup(): void {
    this._groupFields = [];
    this._groupExpandedKeys.clear();
    this._isGroupMode = false;
    this._groupFlatRows = [];
    this._d.setFlatBacking(null);
    this._d.getVs()?.setTotalRows(this._d.getFlatCount());
    this._d.doRender();
  }

  expandAll(): void {
    if (!this._isGroupMode) return;
    const groups = buildGroups(this._d.getData(), this._groupFields, this._getSummaryDefs(), undefined, undefined, this._groupKeyFn());
    collectAllKeys(groups).forEach(k => this._groupExpandedKeys.add(k));
    this.rebuildGroups();
  }

  /** Phase 2 슬롯 #5: groupKeyFn resolver. default = undefined(→ GroupEngine 가 row[field] 사용). */
  private _groupKeyFn(): ((row: T, remainingFields: string[]) => any) | undefined {
    return this._d.getStrategy
      ? this._d.getStrategy('groupKeyFn', undefined as any)
      : undefined;
  }

  collapseAll(): void {
    this._groupExpandedKeys.clear();
    if (this._isGroupMode) this.rebuildGroups();
  }

  handleGroupToggle(groupKey: string): void {
    if (this._groupExpandedKeys.has(groupKey)) {
      this._groupExpandedKeys.delete(groupKey);
    } else {
      this._groupExpandedKeys.add(groupKey);
    }
    this.rebuildGroups();
  }

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

  disableTree(): void {
    this._isTreeMode = false;
    this._treeRoots  = [];
    this._treeFlatRows = [];
    this._treeExpandedKeys.clear();
    this._d.setFlatBacking(null);
    this._d.getVs()?.setTotalRows(this._d.getFlatCount());
    this._d.doRender();
  }

  expandNodes(ids: any | any[], open = true): void {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const id of arr) {
      if (open) this._treeExpandedKeys.add(id);
      else      this._treeExpandedKeys.delete(id);
    }
    if (this._isTreeMode) this.rebuildTree();
  }

  expandAllNodes(): void {
    if (!this._isTreeMode) return;
    collectAllTreeIds(this._treeRoots).forEach(id => this._treeExpandedKeys.add(id));
    this.rebuildTree();
  }

  collapseAllNodes(): void {
    if (!this._isTreeMode) return;
    this._treeExpandedKeys.clear();
    this.rebuildTree();
  }

  handleTreeToggle(nodeId: any): void {
    toggleTreeNode(this._treeExpandedKeys, nodeId);
    this.rebuildTree();
  }

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
