/**
 * DetailManager — F2 마스터/디테일 배선(모듈 경계는 헤드리스 코어 소비만, 재구현 금지).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §3.1(모듈 책임), §3.2(단방향 합성
 *    체인 — group/tree → detail splice → FlatRowModel), §5(mount-once/skip-rebuild/포커스복원),
 *    §6(공개 API), §7(정렬/필터/그룹/트리 상호작용)
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C0.3(FlatRowModel 은 baseline
 *    인프라 — DetailManager 는 registerSplice 로 detail head/filler 를 등록할 뿐 소유하지 않는다)
 *
 * 소비하는 헤드리스 코어(src/core/detail/*, 재구현 금지):
 *  - DetailState   : 펼침 상태(Set<rowId>) + maxDepth/expandMultiple 규칙
 *  - spliceDetails : 상류 flat 에 head/filler 의사행 삽입(순수 함수)
 *  - SubgridCache  : mount-once + detach≠delete 서브그리드/host 생명주기
 *  - DetailGlyph   : 글리프/aria 상수(GridRenderer 가 직접 소비, 이 파일은 재노출만)
 */

import { DetailState } from './detail/DetailState.js';
import { spliceDetails } from './detail/DetailSplice.js';
import { SubgridCache, type SubgridAdapter } from './detail/SubgridCache.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { FlatRowModel } from './FlatRowModel.js';

/** expandRow/collapseRow/toggleRow/isRowExpanded/getDetailInstance 공통 인자(§6.2, C0.2). */
export type DetailRowRef = number | { id: string };

export interface DetailManagerDeps<T extends Record<string, any> = any> {
  /** this._options — masterDetail.* 를 이 안에서 읽는다(옵션 자체는 항상 최신값 참조). */
  getOptions: () => any;
  /** Phase 0 baseline. registerSplice 로 detail splice 를 등록하고, count()/resolveFlatRow 로
   *  rowIndex↔rowId 를 해소한다(F2 는 이 모델의 "소유자"가 아니라 "등록자" — C0.3 정정). */
  getFlatModel: () => FlatRowModel;
  getVs: () => VirtualScroll | null;
  /** DataLayer 가 부여한 stable id 필드값(OpenGrid 의 ROW_ID_FIELD). */
  getRowId: (row: T) => string;
  /** stable rowId → 현재 행(삭제됐으면 undefined). DataLayer.getRowById 위임. */
  getRowById: (rowId: string) => T | undefined;
  /** group/tree rebuild 와 동일한 관용구 — 전체(0..n-1) 재렌더. */
  doRenderFull: (n: number) => void;
  emit: (ev: string, payload: any) => void;
  announce: (msg: string) => void;
  /** i18n: 깊이 한계/펼침·접힘 announce 메시지 해석. / i18n: resolve depth-limit & expand/collapse announces. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 이 그리드 인스턴스의 중첩 깊이(0=최상위, 부모가 자식 생성 시 depth+1 주입). */
  getDepth: () => number;
  /** masterDetail.renderer 의 DetailRenderApi.grid 에 실어줄 인스턴스. */
  getGridInstance: () => any;
  /** masterDetail.subgridOptions(§5 ②) 소비 — 순환 import 회피 위해 OpenGrid.ts 가 주입. */
  createSubgrid?: (host: HTMLElement, subgridOptions: any, depth: number) => any;
}

let _autoHeightWarned = false;

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

  /** masterDetail.enabled 여부(옵션 자체 — 펼침 개수와 무관). */
  get enabled(): boolean {
    return this._mdOpts().enabled === true;
  }

  /** §3.2 v2: "isActive" = 기능 on + 실제 펼침 ≥1(FlatRowModel 합성/렌더 분기 판단용). */
  get isActive(): boolean {
    return this.enabled && this._state.size > 0;
  }

  get maxDepth(): number { return this._state.maxDepth; }

  // ── rowRef(C0.2 flat index | stable id) 해소 ──────────────────────
  private _resolveRowId(ref: DetailRowRef): string | null {
    if (typeof ref === 'number') {
      const r = this._d.getFlatModel().resolveFlatRow(ref);
      return (r.kind === 'data' || r.kind === 'tree') ? (r.rowId ?? null) : null;
    }
    return ref?.id ?? null;
  }

  isExpandedId(rowId: string): boolean {
    return this._state.isExpanded(rowId);
  }

  isRowExpanded(ref: DetailRowRef): boolean {
    const id = this._resolveRowId(ref);
    return id != null && this._state.isExpanded(id);
  }

  // ── 공개 토글 API(§6.2, FR-5/FR-6/FR-10) ──────────────────────────
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

  toggleRow(ref: DetailRowRef): void {
    const id = this._resolveRowId(ref);
    if (id == null) return;
    if (this._state.isExpanded(id)) this.collapseRow(ref);
    else this.expandRow(ref);
  }

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

  getDetailInstance<D = any>(ref: DetailRowRef): D | undefined {
    const id = this._resolveRowId(ref);
    if (id == null) return undefined;
    return this._cache.getInstance(id) as D | undefined;
  }

  /** FR-11 공개 계약 — 실제로는 리사이즈 이후 발생하는 통상 재렌더가 panel width 를 최신
   *  totalColWidth 로 이미 재계산하므로(§4.3 GridRenderer 가 매 렌더 폭을 새로 그린다), 여기선
   *  강제 재렌더 1회로 계약을 만족시킨다(중복 상태 없이 단일 진실원 유지). */
  resyncPanelWidths(): void {
    if (!this.isActive) return;
    this._rebuildAndRender();
  }

  // ── 서브그리드/렌더러 콘텐츠(mount-once, §5) ──────────────────────
  /** GridRenderer 가 detailHead 를 그릴 때 호출 — 영속 host 를 최초 1회만 만들고 이후 재사용. */
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
   *  없음) 하고, 그 외는 정상 detach(연결 끊음, 참조는 Map 이 쥐고 있어 파괴 아님). */
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

  isEditing(rowId: string): boolean {
    const instance = this._cache.getInstance(rowId);
    return !!instance && typeof instance.isEditing === 'function' && !!instance.isEditing();
  }

  /** collapse 직후 렌더가 끝난 뒤 호출 — FR-9: 패널 내부에 포커스가 있었으면 해당 마스터 행의
   *  expander 로 복원한다. GridRenderer 가 expander 엘리먼트를 렌더한 다음 프레임에 호출. */
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

  destroy(): void {
    this._cache.destroyAll();
    this._hosts.clear();
  }
}
