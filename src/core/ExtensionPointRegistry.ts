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
 */

/**
 * 렌더 참여 훅(§4.2). 렌더층이 셀마다 참조하는 교체가능 지점.
 *  - `gate()` : 미설정(등록 override/strategy 없음)이면 false → 렌더층이 resolve 를 호출조차 안 함(제로코스트).
 *  - `resolve(rowIndex, field)` : 게이트 통과 시 렌더층에 줄 값(표시문자열/클래스/aria 등). null=미참여.
 * 첫 등록 항목 = 기존 `getDisplayValue` 표시텍스트 동작(동일 출력 → 회귀0). 이후 새 훅은 등록만으로 열린다.
 */
export interface RenderHook<R = string> {
  readonly id: string;
  gate(): boolean;
  resolve(rowIndex: number, field: string): R | null;
}

/**
 * 렌더훅 레지스트리(§4.2). 하드코딩 게이트 1개를 데이터 구동 훅 목록으로 일반화.
 * 등록순 보존(첫 항목=표시텍스트). 렌더층은 이름을 하드코딩하지 않고 `resolve(id,…)` 로 순회 참조한다.
 */
export class RenderHookRegistry {
  private _order: string[] = [];
  private _hooks = new Map<string, RenderHook<any>>();

  register(hook: RenderHook<any>): void {
    if (!this._hooks.has(hook.id)) this._order.push(hook.id);
    this._hooks.set(hook.id, hook);
  }

  get(id: string): RenderHook<any> | undefined {
    return this._hooks.get(id);
  }

  has(id: string): boolean {
    return this._hooks.has(id);
  }

  /** 등록순 훅 id 목록(첫 항목=표시텍스트). */
  ids(): string[] {
    return [...this._order];
  }

  /**
   * 훅 해석. 미등록이거나 게이트가 닫혀 있으면 resolve 를 **호출하지 않고** null 반환(제로코스트 보존).
   */
  resolve(id: string, rowIndex: number, field: string): any {
    const hook = this._hooks.get(id);
    if (!hook || !hook.gate()) return null;
    return hook.resolve(rowIndex, field);
  }

  /** 게이트가 열린(활성) 훅 id — 렌더층 스윕/디버깅용. */
  activeIds(): string[] {
    return this._order.filter((id) => this._hooks.get(id)!.gate());
  }
}

/** 단일 커밋 초크포인트(C5 MutationService)가 트리거로 감싸는 변경 연산. */
export type MutationOp = 'setData' | 'insertRow' | 'deleteRow' | 'writeCell';

/** 카탈로그(매니페스트) 엔트리 — R-3d "지원 확장점 카탈로그" 산출물. */
export interface ExtensionCatalogEntry {
  readonly name: string;
  readonly category: 'strategy' | 'renderHook' | 'lifecycle' | 'override' | 'escapeHatch';
  readonly signature: string;
}

export interface ExtensionRegistryDeps {
  /** 실행 엔진(불가침). 레지스트리는 소유·위임할 뿐 내부를 건드리지 않는다. */
  kernel: OverrideKernel;
  /** before/after 취소가능 훅을 부착할 커밋 초크포인트의 TriggerManager(늦은-null 견딤). */
  getTrigMgr: () => TriggerManager;
}

export class ExtensionPointRegistry<T = any> {
  private _deps: ExtensionRegistryDeps;
  private _renderHooks = new RenderHookRegistry();

  constructor(deps: ExtensionRegistryDeps) {
    this._deps = deps;
  }

  // ── (b) 컴포넌트 registry — 렌더훅(§4.2) ────────────────────
  get renderHooks(): RenderHookRegistry {
    return this._renderHooks;
  }

  /** 렌더훅 등록(코어 편집 없이 렌더층 참여 지점 추가 — OCP). */
  registerRenderHook(hook: RenderHook<any>): void {
    this._renderHooks.register(hook);
  }

  /** 렌더층이 매 셀 호출 — 미등록/게이트닫힘이면 제로코스트 null. */
  resolveRenderHook(id: string, rowIndex: number, field: string): any {
    return this._renderHooks.resolve(id, rowIndex, field);
  }

  // ── (a) strategy 슬롯 — 값·계산(§4.1) ──────────────────────
  /** 타입드 슬롯 등록(SemVer 보증 카탈로그). 런타임은 커널 문자열 기반(하위호환). */
  strategy<K extends StrategySlot>(slot: K, fn: StrategyMap[K]): void;
  strategy(slot: string, fn: Function): void;
  strategy(slot: string, fn: Function): void {
    this._deps.kernel.strategy(slot, fn);
  }

  /** 슬롯 조회(미등록 시 fallback — 매니저 read API, 제로코스트 철학 보존). */
  getStrategy<F extends Function>(slot: string, fallback: F): F {
    return this._deps.kernel.getStrategy(slot, fallback);
  }

  hasStrategy(slot: string): boolean {
    return this._deps.kernel.hasStrategy(slot);
  }

  // ── override — 타입드 카탈로그 + 탈출구(§4.3, T-ζ) ──────────
  /** 타입드 오버로드: 좁은 "지원됨" 카탈로그(IDE 발견). */
  override<K extends keyof OverridePoints<T>>(name: K, fn: OverrideLayerFn, opts?: OverrideCallOptions): void;
  /** 탈출구(UC-11): 임의 메서드 best-effort 인터셉트 — 넓은 문은 닫지 않는다. */
  override(name: string, fn: OverrideLayerFn, opts?: OverrideCallOptions): void;
  override(name: string, fn: OverrideLayerFn, opts: OverrideCallOptions = {}): void {
    this._deps.kernel.override(name, fn as any, opts);
  }

  // ── (c) lifecycle hook — MutationHook before/after(§4.1, UC-10) ──
  /**
   * 취소가능 before 훅. 단일 커밋 초크포인트(C5 MutationService)가 이미 제공하는 `before:{op}`
   * 트리거를 **타입드로 표면화**할 뿐 메커니즘을 재배선하지 않는다. 핸들러가 `ctx.cancel()` 하면 변경 취소.
   */
  beforeMutation(op: MutationOp, handler: TriggerHandler): void {
    this._deps.getTrigMgr().add(`before:${op}`, handler);
  }

  /** 관찰(취소불가) after 훅 — 커밋 완료 후 `after:{op}` 트리거를 타입드로 표면화. */
  afterMutation(op: MutationOp, handler: TriggerHandler): void {
    this._deps.getTrigMgr().add(`after:${op}`, handler);
  }

  /** 등록한 MutationHook 해제. */
  offMutation(when: 'before' | 'after', op: MutationOp, handler: TriggerHandler): void {
    this._deps.getTrigMgr().remove(`${when}:${op}`, handler);
  }

  // ── 매니페스트(§4.3 R-3d) — 지원 확장점 카탈로그 산출물 ──────
  /**
   * 타입드 확장점 카탈로그. render 훅 항목은 실제 등록분(`renderHooks.ids()`)에서 유도 —
   * 유령 확장점(등록 없는 카탈로그 엔트리) 금지(DeMarco M9b).
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
