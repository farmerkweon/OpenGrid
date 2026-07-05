import type { OverrideKernel } from './OverrideKernel.js';
import type { TriggerManager } from './TriggerManager.js';
import type {
  StrategySlot,
  StrategyMap,
  OverrideLayerFn,
  OverrideCallOptions,
  OverridePoints,
  TriggerHandler,
} from './types.js';

/**
 * R11(§4 T3, §3.1 C7): 커널 위 **타입드 확장점 레지스트리**.
 *
 * `OverrideKernel` 은 실행 엔진(가역·host-agnostic·0줄소스, 불가침 — 한 줄도 안 건드린다).
 * 이 레지스트리는 그 위에 얹는 **타입드 정면**으로, 확장 표면을 명시·타입·발견가능하게 만든다.
 * 확대의 부담이 "코어 편집(하드코딩 게이트 추가)" 에서 "데이터 등록" 으로 이동한다(A4).
 *
 * 3범주(§4.1): (a) strategy 슬롯(값·계산) · (b) 컴포넌트 registry(렌더훅 포함) · (c) lifecycle hook.
 * 이중구조(T-ζ): "SemVer 보증 카탈로그"(타입드 좁은 문) + "best-effort 임의 인터셉트 탈출구"(UC-11,
 * 넓은 문). 문서·타입에서 둘을 명확히 분리하되 넓은 문을 닫지 않는다.
 * / R11 (§4 T3, §3.1 C7): a **typed extension-point registry** layered on top of the kernel.
 *
 * `OverrideKernel` is the execution engine (reversible, host-agnostic, zero source lines,
 * untouchable — not a single line of it is modified). This registry is the **typed facade**
 * placed on top of it, making the extension surface explicit, typed, and discoverable. The
 * burden of extending the grid shifts from "editing core (adding a hardcoded gate)" to
 * "registering data" (A4).
 *
 * Three categories (§4.1): (a) strategy slots (value/computation) · (b) component registries
 * (including render hooks) · (c) lifecycle hooks. Dual structure (T-ζ): a "SemVer-guaranteed
 * catalog" (the typed narrow door) plus a "best-effort arbitrary intercept escape hatch"
 * (UC-11, the wide door). Docs and types keep the two clearly separated without ever closing
 * the wide door.
 */

/**
 * 렌더 참여 훅(§4.2). 렌더층이 셀마다 참조하는 교체가능 지점.
 *  - `gate()` : 미설정(등록 override/strategy 없음)이면 false → 렌더층이 resolve 를 호출조차 안 함(제로코스트).
 *  - `resolve(rowIndex, field)` : 게이트 통과 시 렌더층에 줄 값(표시문자열/클래스/aria 등). null=미참여.
 * 첫 등록 항목 = 기존 `getDisplayValue` 표시텍스트 동작(동일 출력 → 회귀0). 이후 새 훅은 등록만으로 열린다.
 * / A render-participation hook (§4.2). A swappable point the render layer consults per cell.
 *  - `gate()`: `false` when unconfigured (no override/strategy registered) — the render layer
 *    won't even call `resolve` (zero cost).
 *  - `resolve(rowIndex, field)`: the value to hand to the render layer once the gate passes
 *    (display string/class/aria, etc.). `null` = does not participate.
 * The first registered entry is the existing `getDisplayValue` display-text behavior (same
 * output — zero regression). Any new hook opens up simply by registering.
 */
export interface RenderHook<R = string> {
  /** 훅 식별자(등록/조회 키). / Hook identifier (registration/lookup key). */
  readonly id: string;
  /** 이 훅이 현재 활성인지. / Whether this hook is currently active. */
  gate(): boolean;
  /** 게이트 통과 시의 셀 값 해석. / Resolve the cell value once the gate passes. */
  resolve(rowIndex: number, field: string): R | null;
}

/**
 * 렌더훅 레지스트리(§4.2). 하드코딩 게이트 1개를 데이터 구동 훅 목록으로 일반화.
 * 등록순 보존(첫 항목=표시텍스트). 렌더층은 이름을 하드코딩하지 않고 `resolve(id,…)` 로 순회 참조한다.
 * / The render-hook registry (§4.2). Generalizes a single hardcoded gate into a
 * data-driven list of hooks. Registration order is preserved (the first entry is the
 * display-text hook). The render layer never hardcodes names — it consults hooks by
 * iterating and calling `resolve(id, …)`.
 */
export class RenderHookRegistry {
  private _order: string[] = [];
  private _hooks = new Map<string, RenderHook<any>>();

  /**
   * 훅을 등록한다(신규 id 는 등록순 끝에 추가, 기존 id 는 갱신). / Register a hook (a new id
   * is appended to registration order; an existing id is updated in place).
   *
   * @param hook - 등록할 렌더훅 / The render hook to register
   */
  register(hook: RenderHook<any>): void {
    if (!this._hooks.has(hook.id)) this._order.push(hook.id);
    this._hooks.set(hook.id, hook);
  }

  /**
   * id 로 등록된 훅을 조회한다. / Look up a registered hook by id.
   *
   * @param id - 훅 식별자 / Hook identifier
   * @returns 등록된 훅, 없으면 undefined / The registered hook, or `undefined`
   */
  get(id: string): RenderHook<any> | undefined {
    return this._hooks.get(id);
  }

  /**
   * id 가 등록되어 있는지 확인한다. / Check whether an id is registered.
   *
   * @param id - 훅 식별자 / Hook identifier
   * @returns 등록 여부 / Whether it is registered
   */
  has(id: string): boolean {
    return this._hooks.has(id);
  }

  /** 등록순 훅 id 목록(첫 항목=표시텍스트). / Registered hook ids in registration order (the first entry is display-text). */
  ids(): string[] {
    return [...this._order];
  }

  /**
   * 훅 해석. 미등록이거나 게이트가 닫혀 있으면 resolve 를 **호출하지 않고** null 반환(제로코스트 보존).
   * / Resolve a hook. If unregistered or its gate is closed, `resolve` is **not called** and
   * `null` is returned (preserving zero cost).
   *
   * @param id - 훅 식별자 / Hook identifier
   * @param rowIndex - 대상 행 인덱스 / Target row index
   * @param field - 대상 컬럼 field 명 / Target column field name
   * @returns 해석된 값, 미참여 시 null / The resolved value, or `null` if it does not participate
   */
  resolve(id: string, rowIndex: number, field: string): any {
    const hook = this._hooks.get(id);
    if (!hook || !hook.gate()) return null;
    return hook.resolve(rowIndex, field);
  }

  /** 게이트가 열린(활성) 훅 id — 렌더층 스윕/디버깅용. / Ids of hooks whose gate is open (active) — for render-layer sweeps/debugging. */
  activeIds(): string[] {
    return this._order.filter((id) => this._hooks.get(id)!.gate());
  }
}

/** 단일 커밋 초크포인트(C5 MutationService)가 트리거로 감싸는 변경 연산.
 * / A mutation operation wrapped in a trigger by the single commit chokepoint (C5 MutationService). */
export type MutationOp = 'setData' | 'insertRow' | 'deleteRow' | 'writeCell';

/** 카탈로그(매니페스트) 엔트리 — R-3d "지원 확장점 카탈로그" 산출물.
 * / A catalog (manifest) entry — the R-3d "supported extension point catalog" artifact. */
export interface ExtensionCatalogEntry {
  /** 확장점 이름. / Extension point name. */
  readonly name: string;
  /** 확장점 범주. / Extension point category. */
  readonly category: 'strategy' | 'renderHook' | 'lifecycle' | 'override' | 'escapeHatch';
  /** 사람이 읽는 시그니처 문자열. / Human-readable signature string. */
  readonly signature: string;
}

/**
 * ExtensionPointRegistry 의 의존성 계약. / Dependency contract for ExtensionPointRegistry.
 */
export interface ExtensionRegistryDeps {
  /** 실행 엔진(불가침). 레지스트리는 소유·위임할 뿐 내부를 건드리지 않는다.
   * / The execution engine (untouchable). The registry only owns and delegates to it —
   * it never reaches into its internals. */
  kernel: OverrideKernel;
  /** before/after 취소가능 훅을 부착할 커밋 초크포인트의 TriggerManager(늦은-null 견딤).
   * / The commit chokepoint's TriggerManager, to which cancelable before/after hooks are
   * attached (tolerates late-null). */
  getTrigMgr: () => TriggerManager;
}

/**
 * R11 확장점 레지스트리. / R11 extension-point registry.
 *
 * `OverrideKernel` 실행 엔진 위에 얹는 타입드 정면으로, strategy 슬롯·렌더훅·lifecycle 훅·
 * override 카탈로그를 하나의 등록 표면으로 노출한다(§4.1~§4.3).
 * / The typed facade layered on top of the `OverrideKernel` execution engine, exposing
 * strategy slots, render hooks, lifecycle hooks, and the override catalog as a single
 * registration surface (§4.1–§4.3).
 */
export class ExtensionPointRegistry<T = any> {
  private _deps: ExtensionRegistryDeps;
  private _renderHooks = new RenderHookRegistry();

  constructor(deps: ExtensionRegistryDeps) {
    this._deps = deps;
  }

  // ── (b) 컴포넌트 registry — 렌더훅(§4.2) ────────────────────
  /** 렌더훅 레지스트리. / The render-hook registry. */
  get renderHooks(): RenderHookRegistry {
    return this._renderHooks;
  }

  /**
   * 렌더훅 등록(코어 편집 없이 렌더층 참여 지점 추가 — OCP).
   * / Register a render hook (adds a render-layer participation point without editing
   * core — OCP).
   *
   * @param hook - 등록할 렌더훅 / The render hook to register
   * @example
   * registry.registerRenderHook({
   *   id: 'myBadge',
   *   gate: () => true,
   *   resolve: (rowIndex, field) => (field === 'status' ? 'badge-on' : null),
   * });
   */
  registerRenderHook(hook: RenderHook<any>): void {
    this._renderHooks.register(hook);
  }

  /**
   * 렌더층이 매 셀 호출 — 미등록/게이트닫힘이면 제로코스트 null.
   * / Called by the render layer for every cell — zero-cost `null` when unregistered or the
   * gate is closed.
   *
   * @param id - 렌더훅 식별자 / Render hook identifier
   * @param rowIndex - 대상 행 인덱스 / Target row index
   * @param field - 대상 컬럼 field 명 / Target column field name
   * @returns 해석된 값, 미참여 시 null / The resolved value, or `null` if it does not participate
   */
  resolveRenderHook(id: string, rowIndex: number, field: string): any {
    return this._renderHooks.resolve(id, rowIndex, field);
  }

  // ── (a) strategy 슬롯 — 값·계산(§4.1) ──────────────────────
  /**
   * 타입드 슬롯 등록(SemVer 보증 카탈로그). 런타임은 커널 문자열 기반(하위호환).
   * / Register a typed slot (SemVer-guaranteed catalog). At runtime it is still
   * string-keyed via the kernel (backward compatible).
   *
   * @param slot - strategy 슬롯 이름 / Strategy slot name
   * @param fn - 슬롯 구현 함수 / The slot implementation function
   * @example
   * registry.strategy('displayFormatter', (value, field, row) => String(value).toUpperCase());
   */
  strategy<K extends StrategySlot>(slot: K, fn: StrategyMap[K]): void;
  strategy(slot: string, fn: Function): void;
  strategy(slot: string, fn: Function): void {
    this._deps.kernel.strategy(slot, fn);
  }

  /**
   * 슬롯 조회(미등록 시 fallback — 매니저 read API, 제로코스트 철학 보존).
   * / Look up a slot (falls back when unregistered — manager read API, preserving the
   * zero-cost philosophy).
   *
   * @param slot - strategy 슬롯 이름 / Strategy slot name
   * @param fallback - 미등록 시 사용할 기본 함수 / Default function used when unregistered
   * @returns 등록된 함수 또는 fallback / The registered function, or the fallback
   */
  getStrategy<F extends Function>(slot: string, fallback: F): F {
    return this._deps.kernel.getStrategy(slot, fallback);
  }

  /**
   * 슬롯 등록 여부를 확인한다. / Check whether a slot is registered.
   *
   * @param slot - strategy 슬롯 이름 / Strategy slot name
   * @returns 등록 여부 / Whether it is registered
   */
  hasStrategy(slot: string): boolean {
    return this._deps.kernel.hasStrategy(slot);
  }

  // ── override — 타입드 카탈로그 + 탈출구(§4.3, T-ζ) ──────────
  /** 타입드 오버로드: 좁은 "지원됨" 카탈로그(IDE 발견). / Typed overload: the narrow "supported" catalog (IDE-discoverable). */
  override<K extends keyof OverridePoints<T>>(name: K, fn: OverrideLayerFn, opts?: OverrideCallOptions): void;
  /** 탈출구(UC-11): 임의 메서드 best-effort 인터셉트 — 넓은 문은 닫지 않는다. / Escape hatch (UC-11): best-effort intercept of an arbitrary method — the wide door stays open. */
  override(name: string, fn: OverrideLayerFn, opts?: OverrideCallOptions): void;
  /**
   * 메서드 오버라이드 레이어를 부착한다. / Attach a method-override layer.
   *
   * @param name - 오버라이드할 메서드 이름(카탈로그 항목 또는 임의 이름) / Method name to
   *   override (a catalog entry, or an arbitrary name)
   * @param fn - 원본 호출(`orig`)을 감싸는 오버라이드 함수 / The override function wrapping
   *   the original call (`orig`)
   * @param opts - 호출 옵션(우선순위 등) / Call options (priority, etc.)
   * @example
   * registry.override('getDisplayValue', (orig, rowIndex, field) => {
   *   const v = orig(rowIndex, field);
   *   return v === '' ? '—' : v;
   * });
   */
  override(name: string, fn: OverrideLayerFn, opts: OverrideCallOptions = {}): void {
    this._deps.kernel.override(name, fn as any, opts);
  }

  // ── (c) lifecycle hook — MutationHook before/after(§4.1, UC-10) ──
  /**
   * 취소가능 before 훅. 단일 커밋 초크포인트(C5 MutationService)가 이미 제공하는 `before:{op}`
   * 트리거를 **타입드로 표면화**할 뿐 메커니즘을 재배선하지 않는다. 핸들러가 `ctx.cancel()` 하면 변경 취소.
   * / A cancelable before-hook. Merely **surfaces as typed** the `before:{op}` trigger already
   * provided by the single commit chokepoint (C5 MutationService) — it does not rewire the
   * mechanism. If the handler calls `ctx.cancel()`, the mutation is cancelled.
   *
   * @param op - 대상 변경 연산 / Target mutation operation
   * @param handler - 취소 가능한 before 핸들러 / Cancelable before handler
   * @example
   * registry.beforeMutation('deleteRow', (ctx) => {
   *   if (!confirm('삭제할까요?')) ctx.cancel();
   * });
   */
  beforeMutation(op: MutationOp, handler: TriggerHandler): void {
    this._deps.getTrigMgr().add(`before:${op}`, handler);
  }

  /**
   * 관찰(취소불가) after 훅 — 커밋 완료 후 `after:{op}` 트리거를 타입드로 표면화.
   * / An observation-only (non-cancelable) after-hook — surfaces the `after:{op}` trigger,
   * fired once the commit completes, as typed.
   *
   * @param op - 대상 변경 연산 / Target mutation operation
   * @param handler - 관찰용 after 핸들러 / Observation-only after handler
   */
  afterMutation(op: MutationOp, handler: TriggerHandler): void {
    this._deps.getTrigMgr().add(`after:${op}`, handler);
  }

  /**
   * 등록한 MutationHook 해제. / Remove a previously registered MutationHook.
   *
   * @param when - 'before' 또는 'after' / `'before'` or `'after'`
   * @param op - 대상 변경 연산 / Target mutation operation
   * @param handler - 제거할 핸들러(등록 시와 동일 참조) / Handler to remove (same reference used at registration)
   */
  offMutation(when: 'before' | 'after', op: MutationOp, handler: TriggerHandler): void {
    this._deps.getTrigMgr().remove(`${when}:${op}`, handler);
  }

  // ── 매니페스트(§4.3 R-3d) — 지원 확장점 카탈로그 산출물 ──────
  /**
   * 타입드 확장점 카탈로그. render 훅 항목은 실제 등록분(`renderHooks.ids()`)에서 유도 —
   * 유령 확장점(등록 없는 카탈로그 엔트리) 금지(DeMarco M9b).
   * / The typed extension-point catalog. Render-hook entries are derived from the actual
   * registrations (`renderHooks.ids()`) — no phantom extension points (catalog entries with
   * no registration) are allowed (DeMarco M9b).
   *
   * @returns 확장점 카탈로그 엔트리 배열 / Array of extension-point catalog entries
   */
  catalog(): ExtensionCatalogEntry[] {
    const strategy: ExtensionCatalogEntry[] = (
      [
        ['sortComparator', '(a,b,field,dir)=>number'],
        ['filterPredicate', '(value,fi,field)=>boolean'],
        ['displayFormatter', '(value,field,row)=>string'],
        ['cellSerializer', '(value,col,row)=>any'],
        ['groupKeyFn', '(row,remainingFields)=>any'],
        ['summaryOp', '(op,nums,field)=>number|null'],
        ['cellClassResolver', '(value,field,row)=>string|null'],
        ['ariaLabelResolver', '(value,field,row)=>string|null'],
        ['skinResolver', '(skinId)=>SkinTokenDelta|null'],
      ] as const
    ).map(([name, signature]) => ({ name, category: 'strategy' as const, signature }));

    const renderHooks: ExtensionCatalogEntry[] = this._renderHooks.ids().map((id) => ({
      name: id,
      category: 'renderHook' as const,
      signature: '(rowIndex,field)=>value|null',
    }));

    const lifecycle: ExtensionCatalogEntry[] = [
      { name: 'before:mutation', category: 'lifecycle', signature: '(ctx)=>void — cancelable' },
      { name: 'after:mutation', category: 'lifecycle', signature: '(ctx)=>void — observe' },
    ];

    const overrides: ExtensionCatalogEntry[] = [
      { name: 'getDisplayValue', category: 'override', signature: '(orig,rowIndex,field)=>string' },
      { name: 'readCell', category: 'override', signature: '(orig,rowIndex,field)=>any' },
    ];

    const escapeHatch: ExtensionCatalogEntry[] = [
      { name: 'override(name,fn)', category: 'escapeHatch', signature: 'best-effort arbitrary method wrap (UC-11)' },
    ];

    return [...strategy, ...renderHooks, ...lifecycle, ...overrides, ...escapeHatch];
  }
}
