/**
 * DetailManager — F2 마스터/디테일 배선(모듈 경계는 헤드리스 코어 소비만, 재구현 금지).
 * / DetailManager — F2 master/detail wiring (module boundary: consumes the headless core only;
 * never reimplement it).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §3.1(모듈 책임), §3.2(단방향 합성
 *    체인 — group/tree → detail splice → FlatRowModel), §5(mount-once/skip-rebuild/포커스복원),
 *    §6(공개 API), §7(정렬/필터/그룹/트리 상호작용)
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C0.3(FlatRowModel 은 baseline
 *    인프라 — DetailManager 는 registerSplice 로 detail head/filler 를 등록할 뿐 소유하지 않는다)
 * / Contract basis:
 *  - 11_design_F2_v2.md §3.1 (module responsibility), §3.2 (one-way composition chain —
 *    group/tree → detail splice → FlatRowModel), §5 (mount-once / skip-rebuild / focus restore),
 *    §6 (public API), §7 (sort/filter/group/tree interaction)
 *  - 15_cross_contracts.md C0.3 (FlatRowModel is baseline infra — DetailManager only *registers*
 *    detail head/filler rows via registerSplice; it does not own the model)
 *
 * 소비하는 헤드리스 코어(src/core/detail/*, 재구현 금지):
 *  - DetailState   : 펼침 상태(Set<rowId>) + maxDepth/expandMultiple 규칙
 *  - spliceDetails : 상류 flat 에 head/filler 의사행 삽입(순수 함수)
 *  - SubgridCache  : mount-once + detach≠delete 서브그리드/host 생명주기
 *  - DetailGlyph   : 글리프/aria 상수(GridRenderer 가 직접 소비, 이 파일은 재노출만)
 * / Headless core consumed (src/core/detail/*, never reimplement):
 *  - DetailState   : expanded-state (Set<rowId>) + maxDepth/expandMultiple rules
 *  - spliceDetails : inserts head/filler pseudo-rows into the upstream flat list (pure function)
 *  - SubgridCache  : mount-once + detach≠delete lifecycle for subgrids/hosts
 *  - DetailGlyph   : glyph/aria constants (consumed directly by GridRenderer; this file only re-exports)
 */

import { DetailState } from './detail/DetailState.js';
import { spliceDetails } from './detail/DetailSplice.js';
import { SubgridCache, type SubgridAdapter } from './detail/SubgridCache.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { FlatRowModel } from './FlatRowModel.js';

/** expandRow/collapseRow/toggleRow/isRowExpanded/getDetailInstance 공통 인자(§6.2, C0.2).
 * / Common argument shape for expandRow/collapseRow/toggleRow/isRowExpanded/getDetailInstance (§6.2, C0.2). */
export type DetailRowRef = number | { id: string };

/**
 * DetailManager 가 OpenGrid 서브시스템을 읽기 위해 주입받는 클로저 묶음. / Closures injected into
 * DetailManager so it can read OpenGrid subsystem state without owning it directly.
 */
export interface DetailManagerDeps<T extends Record<string, any> = any> {
  /** this._options — masterDetail.* 를 이 안에서 읽는다(옵션 자체는 항상 최신값 참조).
   * / this._options — reads masterDetail.* from it (always the latest option values). */
  getOptions: () => any;
  /** Phase 0 baseline. registerSplice 로 detail splice 를 등록하고, count()/resolveFlatRow 로
   *  rowIndex↔rowId 를 해소한다(F2 는 이 모델의 "소유자"가 아니라 "등록자" — C0.3 정정).
   * / Phase 0 baseline. Registers the detail splice via registerSplice, and resolves
   *  rowIndex↔rowId through count()/resolveFlatRow (F2 is a "registrant" of this model,
   *  not its "owner" — C0.3 correction). */
  getFlatModel: () => FlatRowModel;
  /** 가상 스크롤 인스턴스(마운트 전이면 null). / Virtual scroll instance (null before mount). */
  getVs: () => VirtualScroll | null;
  /** DataLayer 가 부여한 stable id 필드값(OpenGrid 의 ROW_ID_FIELD). / The stable id field value assigned by DataLayer (OpenGrid's ROW_ID_FIELD). */
  getRowId: (row: T) => string;
  /** stable rowId → 현재 행(삭제됐으면 undefined). DataLayer.getRowById 위임. / stable rowId → current row (undefined if deleted). Delegates to DataLayer.getRowById. */
  getRowById: (rowId: string) => T | undefined;
  /** group/tree rebuild 와 동일한 관용구 — 전체(0..n-1) 재렌더. / Same idiom as group/tree rebuild — re-renders the full (0..n-1) range. */
  doRenderFull: (n: number) => void;
  /** 그리드 이벤트 발행. / Emit a grid event. */
  emit: (ev: string, payload: any) => void;
  /** aria-live 영역에 메시지를 공지. / Announce a message via the aria-live region. */
  announce: (msg: string) => void;
  /** i18n: 깊이 한계/펼침·접힘 announce 메시지 해석. / i18n: resolve depth-limit & expand/collapse announces. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 이 그리드 인스턴스의 중첩 깊이(0=최상위, 부모가 자식 생성 시 depth+1 주입). / Nesting depth of this grid instance (0 = top level; a parent injects depth+1 when creating a child). */
  getDepth: () => number;
  /** masterDetail.renderer 의 DetailRenderApi.grid 에 실어줄 인스턴스. / Instance handed to DetailRenderApi.grid inside masterDetail.renderer. */
  getGridInstance: () => any;
  /** masterDetail.subgridOptions(§5 ②) 소비 — 순환 import 회피 위해 OpenGrid.ts 가 주입. / Consumes masterDetail.subgridOptions (§5 ②) — injected by OpenGrid.ts to avoid a circular import. */
  createSubgrid?: (host: HTMLElement, subgridOptions: any, depth: number) => any;
}

let _autoHeightWarned = false;

/**
 * F2 마스터/디테일 매니저. / F2 master/detail manager.
 *
 * 행 펼침 상태(DetailState)를 소유하고, FlatRowModel 합성 체인 끝에 detail head/filler 의사행을
 * 등록(registerSplice)하며, 펼쳐진 행마다 서브그리드/커스텀 렌더러 host 를 mount-once 로
 * 생명주기 관리(SubgridCache)한다. / Owns the row expand/collapse state (DetailState), registers
 * detail head/filler pseudo-rows at the tail of the FlatRowModel composition chain
 * (registerSplice), and manages the mount-once lifecycle of each expanded row's
 * subgrid/custom-renderer host (SubgridCache).
 */
export class DetailManager<T extends Record<string, any> = any> {
  private _d: DetailManagerDeps<T>;
  private _state: DetailState;
  private _cache: SubgridCache<any>;
  /** rowId → 영속 host div(mount-once, renderBody teardown 생존 — §5 핵심 통찰). */
  private _hosts = new Map<string, HTMLElement>();
  /** FR-9(HANMS-08): collapse 직전 패널 내부에 포커스가 있었는지 rowId 로 기억. */
  private _focusPendingRestore: string | null = null;

  constructor(deps: DetailManagerDeps<T>) {
    this._d = deps;
    const opts = this._mdOpts();
    this._state = new DetailState({
      maxDepth: opts.maxDepth ?? 2,
      expandMultiple: opts.expandMultiple ?? true,
      depth: deps.getDepth(),
    });
    const adapter: SubgridAdapter<any> = {
      create: (rowId, host) => this._buildInstance(rowId, host),
      detach: (_instance, host) => { host.remove(); },
      // 실제 DOM 재부착은 GridRenderer 가 getPanelHost() 반환값을 panel 에 appendChild 하는
      // 순간 일어난다(§5 "innerHTML='' 는 분리일 뿐" — 이동 자체가 reattach). 여기선 no-op.
      reattach: () => { /* GridRenderer 가 host 를 새 패널에 appendChild 한다 */ },
      destroy: (instance, host) => {
        try { instance?.destroy?.(); } catch { /* 자식 destroy 실패는 부모 정리를 막지 않는다 */ }
        host.remove();
      },
    };
    this._cache = new SubgridCache(adapter);
    // C0.3 정정: F2 는 baseline FlatRowModel 의 "등록자" — 합성 체인 마지막 단계에 detail
    // splice 를 끼운다. group/tree 가 setBacking 한 결과 위에서 동작(§3.2).
    deps.getFlatModel().registerSplice((flat) => this._splice(flat));

    const heightMode = opts.heightMode;
    if (heightMode === 'auto' && !_autoHeightWarned) {
      _autoHeightWarned = true;
      console.warn(
        "[OpenGrid] masterDetail.heightMode:'auto' 는 Spike-B(가변높이 VirtualScroll) 통과 전까지 " +
        "미공개 기능입니다. 'fixed' 로 동작합니다(11_design_F2_v2.md §2.2/C12.2).",
      );
    }
  }

  private _mdOpts(): any {
    return this._d.getOptions()?.masterDetail ?? {};
  }

  /** masterDetail.enabled 여부(옵션 자체 — 펼침 개수와 무관). / Whether masterDetail.enabled is set (the option itself — independent of how many rows are expanded). */
  get enabled(): boolean {
    return this._mdOpts().enabled === true;
  }

  /** §3.2 v2: "isActive" = 기능 on + 실제 펼침 ≥1(FlatRowModel 합성/렌더 분기 판단용).
   * / §3.2 v2: "isActive" = feature on AND at least one row expanded (used to branch
   *  FlatRowModel composition/rendering). */
  get isActive(): boolean {
    return this.enabled && this._state.size > 0;
  }

  /** 현재 설정된 최대 중첩 깊이. / Currently configured maximum nesting depth. */
  get maxDepth(): number { return this._state.maxDepth; }

  // ── rowRef(C0.2 flat index | stable id) 해소 ──────────────────────
  private _resolveRowId(ref: DetailRowRef): string | null {
    if (typeof ref === 'number') {
      const r = this._d.getFlatModel().resolveFlatRow(ref);
      return (r.kind === 'data' || r.kind === 'tree') ? (r.rowId ?? null) : null;
    }
    return ref?.id ?? null;
  }

  /** stable rowId 기준 펼침 여부. / Whether the row is expanded, keyed by stable rowId.
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @returns 펼쳐져 있으면 true / True if the row is expanded
   */
  isExpandedId(rowId: string): boolean {
    return this._state.isExpanded(rowId);
  }

  /** rowRef(flat index 또는 stable id) 기준 펼침 여부. / Whether the row is expanded, keyed by rowRef (flat index or stable id).
   *
   * @param ref - flat index 또는 `{ id }` 형태의 행 참조(C0.2) / Row reference as a flat index or `{ id }` (C0.2)
   * @returns 펼쳐져 있으면 true / True if the row is expanded
   */
  isRowExpanded(ref: DetailRowRef): boolean {
    const id = this._resolveRowId(ref);
    return id != null && this._state.isExpanded(id);
  }

  // ── 공개 토글 API(§6.2, FR-5/FR-6/FR-10) ──────────────────────────
  /**
   * 지정 행을 펼친다. / Expand the given row.
   *
   * maxDepth 초과면 렌더러 진입 전에 거부하고(자식 패널 미생성) announce 로 알린다(CON-4/FR-10).
   * / If maxDepth would be exceeded, the expansion is rejected before reaching the renderer
   * (no child panel is created) and the rejection is announced (CON-4/FR-10).
   *
   * @param ref - flat index 또는 `{ id }` 형태의 행 참조 / Row reference as a flat index or `{ id }`
   */
  expandRow(ref: DetailRowRef): void {
    if (!this.enabled) return;
    const id = this._resolveRowId(ref);
    if (id == null || this._state.isExpanded(id)) return;
    const ok = this._state.expand(id);
    if (!ok) {
      // CON-4/FR-10: maxDepth 초과 — 렌더러 진입 전 거부, 자식 패널 미생성.
      this._d.announce(this._d.t('detail.depthLimitOpen', { max: this._state.maxDepth }));
      return;
    }
    this._afterToggle(id, 'expanded');
  }

  /**
   * 지정 행을 접는다. / Collapse the given row.
   *
   * @param ref - flat index 또는 `{ id }` 형태의 행 참조 / Row reference as a flat index or `{ id }`
   */
  collapseRow(ref: DetailRowRef): void {
    const id = this._resolveRowId(ref);
    if (id == null || !this._state.isExpanded(id)) return;
    // FR-9/HANMS-08: detach 전에 포커스가 패널 내부였는지 기록(afterToggle 이후 렌더 재구성 시 복원).
    const host = this._hosts.get(id);
    if (host && document.activeElement && host.contains(document.activeElement)) {
      this._focusPendingRestore = id;
    }
    this._state.collapse(id);
    this._releaseInstance(id);
    this._afterToggle(id, 'collapsed');
  }

  /**
   * 펼침/접힘 상태를 반전한다. / Toggle the row's expanded/collapsed state.
   *
   * @param ref - flat index 또는 `{ id }` 형태의 행 참조 / Row reference as a flat index or `{ id }`
   */
  toggleRow(ref: DetailRowRef): void {
    const id = this._resolveRowId(ref);
    if (id == null) return;
    if (this._state.isExpanded(id)) this.collapseRow(ref);
    else this.expandRow(ref);
  }

  /** 펼쳐진 모든 행을 접는다(변경 없으면 no-op). / Collapse every currently expanded row (no-op if none are expanded). */
  collapseAllDetails(): void {
    const ids = this._state.collapseAll();
    if (ids.length === 0) return;
    for (const id of ids) this._releaseInstance(id);
    this._rebuildAndRender();
    for (const id of ids) {
      this._d.emit('rowCollapse', {
        rowIndex: this._d.getFlatModel().flatIndexOfRowId(id),
        rowId: id, row: this._d.getRowById(id), host: null,
      });
    }
    this._d.announce(this._d.t('detail.collapsedAllAnnounce'));
  }

  /**
   * 펼쳐진 행의 서브그리드/커스텀 렌더러 인스턴스를 조회한다. / Look up the subgrid or custom-renderer
   * instance mounted for an expanded row.
   *
   * @param ref - flat index 또는 `{ id }` 형태의 행 참조 / Row reference as a flat index or `{ id }`
   * @returns 마운트된 인스턴스, 없으면 `undefined` / The mounted instance, or `undefined`
   */
  getDetailInstance<D = any>(ref: DetailRowRef): D | undefined {
    const id = this._resolveRowId(ref);
    if (id == null) return undefined;
    return this._cache.getInstance(id) as D | undefined;
  }

  /** FR-11 공개 계약 — 실제로는 리사이즈 이후 발생하는 통상 재렌더가 panel width 를 최신
   *  totalColWidth 로 이미 재계산하므로(§4.3 GridRenderer 가 매 렌더 폭을 새로 그린다), 여기선
   *  강제 재렌더 1회로 계약을 만족시킨다(중복 상태 없이 단일 진실원 유지).
   * / FR-11 public contract — in practice, the normal re-render that follows a resize already
   *  recomputes panel width against the latest totalColWidth (§4.3: GridRenderer redraws width on
   *  every render), so this simply forces one re-render to satisfy the contract (no duplicate
   *  state; single source of truth is preserved). */
  resyncPanelWidths(): void {
    if (!this.isActive) return;
    this._rebuildAndRender();
  }

  // ── 서브그리드/렌더러 콘텐츠(mount-once, §5) ──────────────────────
  /** GridRenderer 가 detailHead 를 그릴 때 호출 — 영속 host 를 최초 1회만 만들고 이후 재사용.
   * / Called by GridRenderer when it draws a detailHead — creates the persistent host only
   *  once and reuses it thereafter.
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @returns 재사용 가능한 host div / A reusable host div
   */
  getPanelHost(rowId: string): HTMLElement {
    let host = this._hosts.get(rowId);
    if (!host) {
      host = document.createElement('div');
      host.className = 'og-detail-host';
      host.style.cssText = 'width:100%;height:100%;box-sizing:border-box;overflow:auto;';
      this._hosts.set(rowId, host);
    }
    // mount-once: adapter.create 는 이 rowId 에 대해 정확히 1회만 호출된다(SubgridCache 보장).
    this._cache.getOrCreate(rowId, () => host!);
    if (this._focusPendingRestore === rowId) {
      // 방금 collapse 된 rowId 를 재사용할 리 없음(정상 경로에서 host 는 collapse 시 release
      // 되므로 도달 안 함) — 방어적으로만 초기화.
      this._focusPendingRestore = null;
    }
    return host;
  }

  private _buildInstance(rowId: string, host: HTMLElement): any {
    const opts = this._mdOpts();
    const row = this._d.getRowById(rowId);
    const depth = this._d.getDepth();
    const api = {
      grid: this._d.getGridInstance(),
      rowId,
      depth,
      collapse: () => this.collapseRow({ id: rowId }),
      refresh: () => { try { this._cache.getInstance(rowId)?.refresh?.(); } catch { /* noop */ } },
    };
    if (typeof opts.renderer === 'function') {
      const ret = opts.renderer(row, host, api);
      if (ret instanceof HTMLElement && ret !== host) host.appendChild(ret);
      return { destroy: () => {} };
    }
    if (opts.subgridOptions) {
      if (depth + 1 > this._state.maxDepth) {
        this._d.announce(this._d.t('detail.depthLimitSubgrid', { max: this._state.maxDepth }));
        return { destroy: () => {} };
      }
      if (this._d.createSubgrid) return this._d.createSubgrid(host, opts.subgridOptions, depth + 1);
    }
    return { destroy: () => {} };
  }

  /** §5(4) skip-rebuild(FR-8/NFR-2, MCCONNELL-04 → Phase1 승격): renderBody teardown 직전
   *  호출된다. 편집 중인 host 는 detach 자체를 회피(document.body 로 hoist, 연결 유지 → blur
   *  없음) 하고, 그 외는 정상 detach(연결 끊음, 참조는 Map 이 쥐고 있어 파괴 아님).
   * / §5(4) skip-rebuild (FR-8/NFR-2, MCCONNELL-04 → promoted to Phase1): called immediately
   *  before renderBody teardown. A host that is currently being edited avoids detach altogether
   *  (hoisted into document.body, staying connected → no blur); every other host is detached
   *  normally (disconnected, but not destroyed — the Map still holds the reference). */
  onBeforeTeardown(): void {
    for (const [rowId, host] of this._hosts) {
      if (!this._cache.isAttached(rowId)) continue;
      if (this.isEditing(rowId)) {
        document.body.appendChild(host); // 연결 유지된 채 이동 → 포커스/caret 보존
        continue;
      }
      this._cache.detach(rowId);
    }
  }

  /** 서브그리드/커스텀 렌더러 인스턴스가 현재 편집 중인지 여부. / Whether the subgrid/custom-renderer
   * instance for a row is currently being edited.
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @returns 편집 중이면 true / True if currently being edited
   */
  isEditing(rowId: string): boolean {
    const instance = this._cache.getInstance(rowId);
    return !!instance && typeof instance.isEditing === 'function' && !!instance.isEditing();
  }

  /** collapse 직후 렌더가 끝난 뒤 호출 — FR-9: 패널 내부에 포커스가 있었으면 해당 마스터 행의
   *  expander 로 복원한다. GridRenderer 가 expander 엘리먼트를 렌더한 다음 프레임에 호출.
   * / Called right after the render that follows a collapse — FR-9: if focus had been inside the
   *  panel, restore it to that master row's expander. GridRenderer calls this on the frame after
   *  it renders the expander element.
   *
   * @returns 포커스를 복원해야 할 행의 stable id, 없으면 `null` / Stable id of the row whose focus
   *  should be restored, or `null`
   */
  consumePendingFocusRestore(): string | null {
    const id = this._focusPendingRestore;
    this._focusPendingRestore = null;
    return id;
  }

  private _releaseInstance(rowId: string): void {
    const opts = this._mdOpts();
    this._cache.remove(rowId, { cache: opts.cache === true });
    if (opts.cache !== true) this._hosts.delete(rowId);
  }

  // ── flat splice(§3.2/§4.1) ────────────────────────────────────────
  private _splice(flat: any[]): any[] {
    if (!this.isActive) return flat;
    const opts = this._mdOpts();
    const rowHeight = this._d.getOptions()?.rowHeight ?? 32;
    const spliceOpts: Parameters<typeof spliceDetails>[1] = {
      expandedRowIds: this._state.expandedRowIds,
      getRowId: (row: any) => this._d.getRowId(row),
      rowHeight,
      height: opts.height ?? 200,
    };
    if (typeof opts.detailRowCount === 'number') {
      const slotCount = opts.detailRowCount;
      spliceOpts.getSlotCount = () => slotCount;
    }
    return spliceDetails(flat, spliceOpts);
  }

  // ── 상태변경 후처리(rebuild+render+emit+announce, §6.3) ───────────
  private _afterToggle(rowId: string, kind: 'expanded' | 'collapsed'): void {
    this._rebuildAndRender();
    const fm = this._d.getFlatModel();
    const rowIndex = fm.flatIndexOfRowId(rowId);
    const host = kind === 'expanded' ? (this._hosts.get(rowId) ?? null) : null;
    const payload = { rowIndex, rowId, row: this._d.getRowById(rowId), host };
    this._d.emit(kind === 'expanded' ? 'rowExpand' : 'rowCollapse', payload);
    this._d.announce(this._d.t(kind === 'expanded' ? 'detail.expandedAnnounce' : 'detail.collapsedAnnounce'));
  }

  private _rebuildAndRender(): void {
    const total = this._d.getFlatModel().count();
    this._d.getVs()?.setTotalRows(total);
    this._d.doRenderFull(total);
  }

  /** 모든 서브그리드/커스텀 렌더러 인스턴스를 파괴하고 host 캐시를 비운다.
   * / Destroy every subgrid/custom-renderer instance and clear the host cache. */
  destroy(): void {
    this._cache.destroyAll();
    this._hosts.clear();
  }
}
