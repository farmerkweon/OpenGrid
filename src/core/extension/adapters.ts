// ============================================================
// DD-10 §5.2·§4.5 기존 레지스트리 → IRegistry 어댑터 / adapters for existing registries
// ------------------------------------------------------------
// 기존 *Registry(SkinRegistry·IconRegistry·format/FormatterRegistry…) 를 파괴적 재작성 없이
// IRegistry<V> 계약으로 감싼다(§5.2 Adapter 패턴, 하위호환). 저장은 원본에 위임하고, 어댑터는
// 예약 가드·충돌 정책·never-throw·origin/priority 메타만 그 위에 얹는다. 원본 API 표면은 불변.
// 헤드리스·순수.
// ============================================================

import { isReserved } from './reserved.js';
import type {
  IRegistry,
  RegisterOptions,
  RegisterResult,
  RegistryEntry,
  EntryOrigin,
  DeprecationInfo,
} from './Registry.js';
import type { FormatterRegistry } from '../format/FormatterRegistry.js';
import type { IFormatter } from '../format/types.js';
import type { SkinRegistry } from '../SkinRegistry.js';
import type { SkinTokenDelta } from '../types.js';

/** 어댑터가 원본 저장소와 소통하는 최소 브리지(원본을 건드리지 않고 위임). / Minimal bridge to the underlying store. */
export interface RegistryBridge<V, K extends string = string> {
  get(key: K): V | undefined;
  has(key: K): boolean;
  list(): K[];
  /** 값 저장(원본 register/define 위임). throw 하면 어댑터가 격리해 rejected 로 값화. / Persist; throws are isolated into a rejected result. */
  set(key: K, value: V): void;
  /** 삭제(선택 — 미지원 원본은 생략). / Delete (optional). */
  delete?(key: K): boolean;
}

/**
 * 임의 브리지를 IRegistry<V> 계약으로 어댑트. 예약 가드·충돌 정책·never-throw·메타를 얹되
 * 저장은 브리지에 위임(원본 무교란). / Adapt an arbitrary bridge to the IRegistry<V> contract.
 *
 * @param bridge - 원본 저장소 브리지 / The underlying-store bridge
 * @param cfg - 정책(중복·경고 싱크) / Policy (duplicate, warning sink)
 * @returns IRegistry<V> 어댑터 / An IRegistry<V> adapter
 */
export function adaptRegistry<V, K extends string = string>(
  bridge: RegistryBridge<V, K>,
  cfg: {
    duplicatePolicy?: 'last-wins' | 'explicit-override' | 'protect-builtin';
    onWarn?: (msg: string) => void;
  } = {},
): IRegistry<V, K> {
  // 어댑터가 소유하는 메타(origin/priority/seq/pluginId) — 원본은 값만 안다.
  const meta = new Map<K, { origin: EntryOrigin; priority: number; seq: number; pluginId?: string; spiVersion?: string; deprecated?: DeprecationInfo }>();
  let seq = 0;
  let disposed = false;
  const warned = new Set<string>();
  const sink =
    cfg.onWarn ??
    ((m: string) => {
      if (typeof console !== 'undefined') console.warn(m);
    });
  const warn = (key: string, msg: string): string => {
    const full = `[OpenGrid] ${msg}`;
    const dk = `${key}::${msg}`;
    if (!warned.has(dk)) {
      warned.add(dk);
      sink(full);
    }
    return full;
  };

  const resolveConflict = (prevOrigin: EntryOrigin, opts: RegisterOptions): boolean => {
    if (prevOrigin === 'builtin' && opts.override !== true) return false;
    if (cfg.duplicatePolicy === 'explicit-override') return opts.override === true;
    return true;
  };

  return {
    register(key: K, value: V, opts: RegisterOptions = {}): RegisterResult {
      if (disposed) return { ok: false, action: 'rejected', reason: 'disposed' };
      if (typeof key !== 'string' || key.length === 0) {
        return { ok: false, action: 'rejected', reason: 'invalid-key' };
      }
      const origin: EntryOrigin = opts.origin ?? 'user';
      if (isReserved(key) && origin !== 'builtin') {
        const warning = warn(key, `reserved namespace: '${key}' 는 og:* 코어 예약 대역입니다.`);
        return { ok: false, action: 'rejected', reason: 'reserved-namespace', warning };
      }
      const prevMeta = meta.get(key);
      const bridgeHas = bridge.has(key);
      const existed = prevMeta !== undefined || bridgeHas;
      // 유효 이전 origin: 어댑터 메타가 있으면 그 origin, 없이 원본에만 존재하면(부트스트랩 직등록분)
      // 내장으로 간주 — entries() 의 origin 부여와 정합하며 코어 보호를 register 경로에서도 일관 적용.
      // / Effective prior origin: adapter meta wins; a bridge-only key (direct bootstrap) counts as
      // 'builtin', matching entries() so core protection holds on the register path too.
      const prevOrigin: EntryOrigin | undefined = prevMeta
        ? prevMeta.origin
        : bridgeHas
          ? 'builtin'
          : undefined;
      if (prevOrigin !== undefined && !resolveConflict(prevOrigin, opts)) {
        const warning = warn(
          key,
          `'${key}' 는 ${prevOrigin === 'builtin' ? '내장(built-in) 보호' : 'override 미지정'} — 덮으려면 { override:true }.`,
        );
        return { ok: false, action: 'kept', reason: 'protected-builtin', warning };
      }
      // 저장 위임 — 원본이 throw(예: 스킨 색 리터럴 거부)하면 격리해 값으로 반환(never-throw).
      try {
        bridge.set(key, value);
      } catch (e) {
        const warning = warn(key, `adapter set '${key}' 실패: ${String(e)}`);
        return { ok: false, action: 'rejected', reason: 'adapter-error', warning };
      }
      const m: { origin: EntryOrigin; priority: number; seq: number; pluginId?: string; spiVersion?: string; deprecated?: DeprecationInfo } = {
        origin,
        priority: opts.priority ?? 0,
        seq: seq++,
      };
      if (opts.pluginId !== undefined) m.pluginId = opts.pluginId;
      if (opts.spiVersion !== undefined) m.spiVersion = opts.spiVersion;
      if (opts.deprecated !== undefined) m.deprecated = opts.deprecated;
      meta.set(key, m);
      return { ok: true, action: existed ? 'replaced' : 'added' };
    },
    get: (key: K) => bridge.get(key),
    require(key: K, fallback?: V): V {
      const v = bridge.get(key);
      if (v !== undefined) return v;
      return fallback as V;
    },
    has: (key: K) => bridge.has(key),
    list: () => bridge.list(),
    entries(): ReadonlyArray<RegistryEntry<V>> {
      const out: RegistryEntry<V>[] = [];
      for (const key of bridge.list()) {
        const v = bridge.get(key);
        if (v === undefined) continue;
        const m = meta.get(key);
        const e: {
          key: string; value: V; origin: EntryOrigin; priority: number; seq: number;
          pluginId?: string; spiVersion?: string; deprecated?: DeprecationInfo;
        } = {
          key,
          value: v,
          origin: m?.origin ?? 'builtin', // 어댑터 밖(원본 부트스트랩) 등록분은 내장으로 간주
          priority: m?.priority ?? 0,
          seq: m?.seq ?? -1,
        };
        if (m?.pluginId !== undefined) e.pluginId = m.pluginId;
        if (m?.spiVersion !== undefined) e.spiVersion = m.spiVersion;
        if (m?.deprecated !== undefined) e.deprecated = m.deprecated;
        out.push(e);
      }
      return out;
    },
    unregister(key: K): boolean {
      meta.delete(key);
      return bridge.delete ? bridge.delete(key) : false;
    },
    disposePlugin(pluginId: string): number {
      let n = 0;
      for (const [k, m] of meta) {
        if (m.pluginId === pluginId) {
          meta.delete(k);
          if (bridge.delete) bridge.delete(k);
          n++;
        }
      }
      return n;
    },
    dispose(): void {
      meta.clear();
      warned.clear();
      disposed = true;
    },
  };
}

/**
 * 기존 format/FormatterRegistry(register(f)/resolve/has/list, 키=f.name)를 IRegistry<IFormatter>
 * 로 어댑트. 원본 API 표면 불변(§5.2). / Adapt the existing FormatterRegistry to IRegistry<IFormatter>.
 *
 * @param reg - 기존 FormatterRegistry / The existing FormatterRegistry
 * @returns IRegistry<IFormatter> 어댑터 / An IRegistry<IFormatter> adapter
 */
export function adaptFormatterRegistry(reg: FormatterRegistry): IRegistry<IFormatter> {
  return adaptRegistry<IFormatter>({
    get: (k) => reg.resolve(k),
    has: (k) => reg.has(k),
    list: () => reg.list(),
    set: (_k, v) => {
      reg.register(v); // FormatterRegistry 는 f.name 을 키로 저장
    },
  });
}

/**
 * 기존 SkinRegistry(define/has/get/list, FORM-only 검증·가드레일)를 IRegistry<SkinTokenDelta> 로
 * 어댑트. define 의 색 리터럴 거부 throw 는 어댑터가 격리해 rejected('adapter-error')로 값화(never-throw).
 * / Adapt the existing SkinRegistry to IRegistry<SkinTokenDelta>; define()'s throw is isolated.
 *
 * @param reg - 기존 SkinRegistry / The existing SkinRegistry
 * @returns IRegistry<SkinTokenDelta> 어댑터 / An IRegistry<SkinTokenDelta> adapter
 */
export function adaptSkinRegistry(reg: SkinRegistry): IRegistry<SkinTokenDelta> {
  return adaptRegistry<SkinTokenDelta>({
    get: (k) => reg.get(k),
    has: (k) => reg.has(k),
    list: () => reg.list(),
    set: (k, v) => {
      reg.define(k, v);
    },
  });
}
