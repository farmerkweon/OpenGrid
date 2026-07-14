/**
 * SubgridCache — F2 임베드 서브그리드(디테일 인스턴스) 생명주기 관리 (헤드리스, DOM 비접촉).
 * / SubgridCache — lifecycle management for F2 embedded subgrids (detail instances) (headless, no DOM contact).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §3.1(DetailEntry: host/instance/built),
 *    §5(Mount-once + detached 캐시 + 편집중 skip-rebuild — MCCONNELL-04 해소),
 *    §5(5)(collapse: cache!==true 면 destroy, cache:true 면 host 캐시 유지)
 * / Contract basis:
 *  - 11_design_F2_v2.md §3.1 (DetailEntry: host/instance/built), §5 (mount-once + detached cache +
 *    skip-rebuild while editing — resolves review item MCCONNELL-04), §5(5) (collapse: destroy when cache!==true,
 *    keep host cached when cache:true)
 *
 * 핵심 의미론(§5 "핵심 통찰"): `_body.innerHTML=''`(GridRenderer 매 렌더 teardown, CON-2)는
 * "삭제"가 아니라 "분리"다. 이 클래스는 그 통찰을 **mount-once ≠ detach ≠ delete** 3단계로
 * 모델링한다:
 *   1) mount-once  — rowId 당 `adapter.create` 는 정확히 1회만 호출(getOrCreate).
 *   2) detach/reattach — 매 렌더 teardown/재조립을 생존(파괴 아님, DOM 이동일 뿐).
 *   3) destroy     — collapse(cache:false) 또는 그리드 destroy 시에만 실제 정리.
 * / Core semantics (§5 "key insight"): `_body.innerHTML=''` (GridRenderer teardown every render, CON-2) is
 * "detach", not "delete". This class models that insight as three stages **mount-once ≠ detach ≠ delete**:
 *   1) mount-once      — `adapter.create` is called exactly once per rowId (getOrCreate).
 *   2) detach/reattach — survives every-render teardown/reassembly (not destruction, just DOM movement).
 *   3) destroy         — real cleanup only on collapse(cache:false) or grid destroy.
 *
 * 이 클래스는 DOM 을 직접 만들거나 조작하지 않는다 — 호스트 생성(`hostFactory`)과 실제 마운트/해제
 * 동작은 전부 `SubgridAdapter` 주입 인터페이스 뒤로 위임한다(렌더 배선 단계가 실 DOM/자식 OpenGrid를
 * 연결). §5(4) 편집중 skip-rebuild 훅 자리는 `isEditing()` 로 자리만 마련해 둔다(Phase1 배선 대상).
 * / This class never creates or manipulates DOM directly — host creation (`hostFactory`) and the actual
 * mount/unmount actions are all delegated behind the injected `SubgridAdapter` interface (the render-wiring stage
 * connects real DOM / child OpenGrid). The §5(4) skip-rebuild-while-editing hook slot is only stubbed via
 * `isEditing()` (a Phase-1 wiring target).
 */

/** 서브그리드(또는 임의 렌더러 산출물) 생명주기 훅 — DOM 조작은 이 어댑터 구현체 책임. / Lifecycle hooks for a subgrid (or any renderer output) — DOM manipulation is this adapter implementation's responsibility. */
export interface SubgridAdapter<T = any> {
  /** rowId 당 정확히 1회 호출(§5 mount-once). host 는 영속 div(재렌더 생존, DetailManager.getDetailHost 산출물). / Called exactly once per rowId (§5 mount-once). host is a persistent div (survives re-render, output of DetailManager.getDetailHost). */
  create(rowId: string, host: HTMLElement): T;
  /** teardown 직전: host 를 문서에서 분리하되 instance 는 파괴하지 않는다(§5 "분리≠삭제"). / Just before teardown: detach the host from the document but do not destroy the instance (§5 "detach ≠ delete"). */
  detach(instance: T, host: HTMLElement): void;
  /** 재조립 시: 동일 host/instance 를 새 패널 wrapper 에 재부착. / On reassembly: reattach the same host/instance to the new panel wrapper. */
  reattach(instance: T, host: HTMLElement): void;
  /** collapse(cache:false) 또는 그리드 destroy 시에만 호출 — 실제 정리(EC-9). / Called only on collapse(cache:false) or grid destroy — real cleanup (EC-9). */
  destroy(instance: T, host: HTMLElement): void;
}

interface CacheEntry<T> {
  host: HTMLElement;
  instance: T;
  attached: boolean;
}

/** remove() 정책 옵션. / Policy options for remove(). */
export interface RemoveOptions {
  /** masterDetail.cache. true 면 destroy 대신 detach 만 하고 entry 를 유지(재펼침 시 재사용, §5(5)). / masterDetail.cache. When true, only detaches (no destroy) and keeps the entry for reuse on re-expand (§5(5)). */
  cache?: boolean;
}

/**
 * rowId → 디테일 인스턴스/host 캐시. mount-once/detach/destroy 3단계 생명주기를 강제한다.
 * / rowId → detail instance/host cache. Enforces the three-stage mount-once/detach/destroy lifecycle.
 *
 * @typeParam T - 서브그리드 인스턴스 타입 / Subgrid instance type
 */
export class SubgridCache<T = any> {
  private _entries = new Map<string, CacheEntry<T>>();

  /**
   * @param adapter - 실제 DOM 마운트/해제를 담당하는 어댑터 / Adapter responsible for the actual DOM mount/unmount
   */
  constructor(private adapter: SubgridAdapter<T>) {}

  /** 캐시된 entry 수. / Number of cached entries. */
  get size(): number { return this._entries.size; }

  /**
   * rowId 에 대한 entry 존재 여부. / Whether an entry exists for the rowId.
   * @param rowId - stable rowId / stable rowId
   * @returns entry 존재 여부 / Whether an entry exists
   */
  has(rowId: string): boolean { return this._entries.has(rowId); }

  /**
   * 최초 펼침: `hostFactory()` 로 영속 host 를 만들고 `adapter.create` 를 **정확히 1회** 호출한다.
   * 이미 캐시돼 있으면(재펼침, cache:true 로 남아있던 entry) 기존 entry 를 그대로 반환 — create
   * 재호출 없음(mount-once 보장의 핵심 단언 지점).
   * / First expand: creates a persistent host via `hostFactory()` and calls `adapter.create` **exactly once**.
   * If already cached (re-expand, an entry kept via cache:true) returns the existing entry as-is — no create
   * re-call (the key assertion point of the mount-once guarantee).
   *
   * @param rowId - stable rowId / stable rowId
   * @param hostFactory - 영속 host 요소 생성 팩토리 / Factory that creates the persistent host element
   * @returns { host, instance } 쌍 / The { host, instance } pair
   */
  getOrCreate(rowId: string, hostFactory: () => HTMLElement): { host: HTMLElement; instance: T } {
    const existing = this._entries.get(rowId);
    if (existing) {
      existing.attached = true;
      return existing;
    }
    const host = hostFactory();
    const instance = this.adapter.create(rowId, host);
    const entry: CacheEntry<T> = { host, instance, attached: true };
    this._entries.set(rowId, entry);
    return entry;
  }

  /**
   * 매 renderBody 재조립 시: 이미 분리돼 있던 entry 만 재부착(파괴됐던 적 없음, §5 핵심 통찰).
   * / On each renderBody reassembly: reattach only entries that were detached (never destroyed, §5 key insight).
   * @param rowId - stable rowId / stable rowId
   * @returns 재부착이 실제로 일어났는지 여부 / Whether a reattach actually occurred
   */
  reattach(rowId: string): boolean {
    const entry = this._entries.get(rowId);
    if (!entry || entry.attached) return false;
    this.adapter.reattach(entry.instance, entry.host);
    entry.attached = true;
    return true;
  }

  /**
   * teardown 직전 분리 표시. entry 는 Map 에 남아 GC 되지 않는다(참조 유지 = 생존, §5 핵심 통찰).
   * / Mark as detached just before teardown. The entry remains in the Map and is not GC'd (keeping the reference = survival, §5 key insight).
   * @param rowId - stable rowId / stable rowId
   * @returns 분리가 실제로 일어났는지 여부 / Whether a detach actually occurred
   */
  detach(rowId: string): boolean {
    const entry = this._entries.get(rowId);
    if (!entry || !entry.attached) return false;
    this.adapter.detach(entry.instance, entry.host);
    entry.attached = false;
    return true;
  }

  /** 부모 renderBody 진입 시 전체 teardown 흉내(호출자가 skip-rebuild 대상은 미리 걸러 호출). / Mimic a full teardown on parent renderBody entry (the caller pre-filters skip-rebuild targets before calling). */
  detachAll(): void {
    for (const rowId of this._entries.keys()) this.detach(rowId);
  }

  /**
   * collapse 시 정책 분기(§5(5)): `cache:true` 면 destroy 없이 detach 만(재펼침 시 getOrCreate 가
   * 재사용). 기본(`cache` 미지정/false)이면 `adapter.destroy` 후 entry 제거(EC-9 누수 차단).
   * / Policy branch on collapse (§5(5)): with `cache:true`, only detaches without destroy (getOrCreate reuses it on
   * re-expand). By default (`cache` unset/false), calls `adapter.destroy` then removes the entry (EC-9 leak prevention).
   * @param rowId - stable rowId / stable rowId
   * @param opts - cache 유지 여부 옵션 / Option for whether to keep the cache
   */
  remove(rowId: string, opts: RemoveOptions = {}): void {
    const entry = this._entries.get(rowId);
    if (!entry) return;
    if (opts.cache) {
      if (entry.attached) this.adapter.detach(entry.instance, entry.host);
      entry.attached = false;
      return;
    }
    this.adapter.destroy(entry.instance, entry.host);
    this._entries.delete(rowId);
  }

  /** rowId 의 인스턴스 반환(없으면 undefined). / Return the instance for rowId (undefined if none). */
  getInstance(rowId: string): T | undefined { return this._entries.get(rowId)?.instance; }
  /** rowId 의 host 요소 반환(없으면 undefined). / Return the host element for rowId (undefined if none). */
  getHost(rowId: string): HTMLElement | undefined { return this._entries.get(rowId)?.host; }
  /** rowId 가 현재 부착 상태인지 여부. / Whether rowId is currently attached. */
  isAttached(rowId: string): boolean { return this._entries.get(rowId)?.attached === true; }

  /**
   * §5(4) 편집중 skip-rebuild 훅 자리(Phase1, FR-8/NFR-2). 렌더 배선 단계에서 자식 인스턴스가
   * `isEditing()` 같은 판정을 노출하면 `isEditingFn` 으로 주입해 teardown 대상에서 제외(hoist)할지
   * 판단하는 데 쓴다. 헤드리스 단계에서는 판정 위임만 제공하고 실제 hoist/원복 로직은 GridRenderer
   * 배선이 담당한다.
   * / §5(4) skip-rebuild-while-editing hook slot (Phase 1, FR-8/NFR-2). At the render-wiring stage, if the child
   * instance exposes a predicate like `isEditing()`, inject it via `isEditingFn` to decide whether to exclude
   * (hoist) it from teardown. In the headless stage this only provides predicate delegation; the actual
   * hoist/restore logic belongs to the GridRenderer wiring.
   *
   * @param rowId - stable rowId / stable rowId
   * @param isEditingFn - 인스턴스 편집중 판정 콜백(미주입 시 항상 false) / Callback deciding whether the instance is editing (always false if not injected)
   * @returns 편집중 여부 / Whether it is editing
   */
  isEditing(rowId: string, isEditingFn?: (instance: T) => boolean): boolean {
    if (!isEditingFn) return false;
    const entry = this._entries.get(rowId);
    return !!entry && isEditingFn(entry.instance);
  }

  /** 부모 destroy(EC-9) 또는 collapseAllDetails 시: 남은 전 인스턴스 정리, 누수 차단. / On parent destroy (EC-9) or collapseAllDetails: clean up all remaining instances, prevent leaks. */
  destroyAll(): void {
    for (const entry of this._entries.values()) {
      this.adapter.destroy(entry.instance, entry.host);
    }
    this._entries.clear();
  }
}
