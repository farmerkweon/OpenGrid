// ============================================================
// DD-10 §2.1·§2.2·§2.3 단일 제네릭 계약 + 정책 엔진 / single generic contract + policy engine
// ------------------------------------------------------------
// 전 확장점(셀타입·포맷터·검증기·CF규칙·차트·함수·커맨드·데이터소스·슬롯…)이 상속하는
// 단일 계약 `IRegistry<V,K>` 와 그 구현 `TypedRegistry<V>`. "N개 애드혹 맵" 을
// "1개 추상 + N개 인스턴스" 로 수렴(REQ-T4-801). 충돌·순서·수명을 데이터(RegisterOptions)로
// 표현하고 커널은 그 결정을 실행만 한다. 헤드리스·순수(Map·함수, DOM 미참조).
//
// 불변식:
//   I1. get/require/has 는 절대 throw 하지 않는다(never-throw, REQ-T4-803).
//   I2. 같은 key 재등록 결과는 로드 순서가 아니라 정책+메타로 결정된다(결정론, REQ-T4-802).
//   I3. dispose() 후 get 은 undefined, register 는 rejected('disposed').
// ============================================================

import { isReserved } from './reserved.js';

/** 등록 출처 — 충돌 정책의 1차 판별자. og 코어 보호의 근거. / Entry origin — primary discriminator of conflict policy. */
export type EntryOrigin = 'builtin' | 'plugin' | 'user';

/** 폐기 정보 — 예고 없는 제거 금지의 데이터화(§2.8). / Deprecation info — data form of "no removal without notice". */
export interface DeprecationInfo {
  /** 폐기 표시 버전. / Version where deprecation was marked. */
  readonly since: string;
  /** 제거 예정 버전(게이트가 이전 제거를 차단). / Planned removal version (gate blocks earlier removal). */
  readonly removeIn: string;
  /** 대체 API/키. / Replacement API/key. */
  readonly replacement?: string;
  /** 부가 설명. / Extra note. */
  readonly note?: string;
}

/** 등록 시 선언하는 정책 메타(데이터로서의 정책). / Policy metadata declared at registration (policy as data). */
export interface RegisterOptions {
  /** 기본 'user'. 'builtin' 은 코어 부트스트랩만. / Default 'user'; 'builtin' is core bootstrap only. */
  origin?: EntryOrigin;
  /** 보호 키를 이기려는 명시 의사. 기본 false. / Explicit intent to override a protected key. Default false. */
  override?: boolean;
  /** og:* 예약 검사·매니페스트 추적·일괄 dispose 키. / Reserved-check, manifest tracking, batch-dispose key. */
  pluginId?: string;
  /** 다중 적용 순서(작을수록 먼저). 기본 0. / Multi-apply order (smaller first). Default 0. */
  priority?: number;
  /** 이 값이 구현하는 SPI 버전(peer 검증용). / SPI version this value implements (for peer verification). */
  spiVersion?: string;
  /** 이 키가 폐기 예정이면 동반. / Present when this key is deprecated. */
  deprecated?: DeprecationInfo;
}

/** 등록 1건의 정규화된 기록(불변). seq 는 로드순 tiebreak 의 안정 기준. / A normalized registration record (immutable). */
export interface RegistryEntry<V> {
  readonly key: string;
  readonly value: V;
  readonly origin: EntryOrigin;
  readonly priority: number;
  /** 모노톤 등록 순번(레지스트리 로컬). / Monotonic registration sequence (registry-local). */
  readonly seq: number;
  readonly pluginId?: string;
  readonly spiVersion?: string;
  readonly deprecated?: DeprecationInfo;
}

/** 등록 결과의 행동 분류. / Action classification of a registration result. */
export type RegisterAction = 'added' | 'replaced' | 'kept' | 'rejected';

/** 거부/유지 사유. / Reason for rejection/keep. */
export type RegisterReason =
  | 'reserved-namespace'
  | 'protected-builtin'
  | 'invalid-key'
  | 'spi-mismatch'
  | 'disposed'
  | 'adapter-error';

/** 등록 결과 — never-throw. 거부/경고를 값으로 반환(조용한 실패 금지). / Registration result — never-throw; rejections/warnings returned as values. */
export interface RegisterResult {
  /** 제공한 값이 지금 등록되었는가(added/replaced=true). / Whether the provided value is now registered (added/replaced=true). */
  readonly ok: boolean;
  readonly action: RegisterAction;
  readonly reason?: RegisterReason;
  /** [OpenGrid] 프리픽스로 방출된 경고 원문. / Emitted warning text ([OpenGrid]-prefixed). */
  readonly warning?: string;
}

/** 중복 키 재등록 정책. / Duplicate-key re-registration policy. */
export type DuplicatePolicy = 'last-wins' | 'explicit-override' | 'protect-builtin';

/**
 * 전 확장점이 상속하는 단일 계약. K=키 타입(기본 string), V=등록 값 타입.
 * / The single contract inherited by every extension point.
 */
export interface IRegistry<V, K extends string = string> {
  /** 등록(정책 적용, never-throw). / Register (policy-applied, never-throw). */
  register(key: K, value: V, opts?: RegisterOptions): RegisterResult;
  /** 미등록 → undefined (I1). / Unregistered → undefined (I1). */
  get(key: K): V | undefined;
  /** 미등록 → fallback/dev 플레이스홀더 (I1, REQ-T4-803). / Unregistered → fallback/dev placeholder (I1). */
  require(key: K, fallback?: V): V;
  has(key: K): boolean;
  /** 등록된 키 목록. / Registered keys. */
  list(): K[];
  /** 정규화 기록(카탈로그·진단·다중적용 순서용). / Normalized records (catalog/diagnostics/ordered-apply). */
  entries(): ReadonlyArray<RegistryEntry<V>>;
  unregister(key: K): boolean;
  /** 플러그인 단위 일괄 해제(대칭 teardown). 해제 수 반환. / Batch dispose by plugin (symmetric teardown). Returns count. */
  disposePlugin(pluginId: string): number;
  /** 전체 해제(자원 대칭). / Dispose everything (resource symmetry). */
  dispose(): void;
}

/** SPI 버전 태그에서 major 추출. 'ICellRenderer@2' | '2.4.0' | '2' 모두 수용. / Extract SPI major from a version tag. */
function spiMajor(v: string): string {
  const at = v.lastIndexOf('@');
  const ver = at >= 0 ? v.slice(at + 1) : v;
  return ver.split('.')[0] ?? ver;
}

/** 선언 SPI 버전이 코어 SPI major 와 호환되는가(major 일치). / Whether a declared SPI version is major-compatible with the core SPI. */
export function spiCompatible(coreVersion: string, declared: string): boolean {
  return spiMajor(coreVersion) === spiMajor(declared);
}

/** TypedRegistry 구성. / TypedRegistry configuration. */
export interface TypedRegistryConfig<V, K extends string = string> {
  /** 미등록 시 dev 플레이스홀더 값 생성자(레지스트리별 상이: 물음표·—포맷터…). / Dev placeholder factory for unregistered keys. */
  placeholder?: (key: K) => V;
  /** 중복 정책. 기본 'protect-builtin'. / Duplicate policy. Default 'protect-builtin'. */
  duplicatePolicy?: DuplicatePolicy;
  /** 이 레지스트리가 소유하는 SPI 이름·현재 버전(peer 검증용). / SPI name/version this registry owns (for peer checks). */
  spi?: { name: string; version: string };
  /** dev 경고 싱크(테스트 주입 가능, 기본 console.warn). / Dev warning sink (test-injectable; defaults to console.warn). */
  onWarn?: (msg: string) => void;
}

function buildEntry<V, K extends string>(
  key: K,
  value: V,
  origin: EntryOrigin,
  opts: RegisterOptions,
  seq: number,
): RegistryEntry<V> {
  // exactOptionalPropertyTypes: undefined 를 명시 대입하지 않고 존재 시에만 키를 넣는다.
  const e: {
    key: string;
    value: V;
    origin: EntryOrigin;
    priority: number;
    seq: number;
    pluginId?: string;
    spiVersion?: string;
    deprecated?: DeprecationInfo;
  } = { key, value, origin, priority: opts.priority ?? 0, seq };
  if (opts.pluginId !== undefined) e.pluginId = opts.pluginId;
  if (opts.spiVersion !== undefined) e.spiVersion = opts.spiVersion;
  if (opts.deprecated !== undefined) e.deprecated = opts.deprecated;
  return e;
}

/**
 * 단일 값 슬롯형(포맷터·차트타입: 키당 1값)과 다중 적용형(CF규칙·데코: 한 대상 N값)을
 * 하나의 저장·정책 엔진으로 처리하고, 조회 관점만 분리한다(§2.2).
 * / One storage+policy engine for both single-slot and multi-apply extension points; only the
 * read perspective differs (§2.2).
 *
 * @example
 * const reg = new TypedRegistry<IFormatter>({ spi: { name: 'IFormatter', version: '1' } });
 * reg.register('currency', myFmt, { origin: 'builtin' });
 * reg.register('currency', mine); // kept — built-in protected
 */
export class TypedRegistry<V, K extends string = string> implements IRegistry<V, K> {
  private _map = new Map<K, RegistryEntry<V>>();
  private _seq = 0;
  private _disposed = false;
  private _warned = new Set<string>();
  private readonly _cfg: TypedRegistryConfig<V, K>;

  constructor(cfg: TypedRegistryConfig<V, K> = {}) {
    this._cfg = cfg;
  }

  private _warn(key: string, msg: string): string {
    const full = `[OpenGrid] ${msg}`;
    const dedupKey = `${key}::${msg}`;
    if (!this._warned.has(dedupKey)) {
      this._warned.add(dedupKey);
      const sink =
        this._cfg.onWarn ??
        ((m: string) => {
          if (typeof console !== 'undefined') console.warn(m);
        });
      sink(full);
    }
    return full;
  }

  register(key: K, value: V, opts: RegisterOptions = {}): RegisterResult {
    if (this._disposed) return { ok: false, action: 'rejected', reason: 'disposed' };
    if (typeof key !== 'string' || key.length === 0) {
      return { ok: false, action: 'rejected', reason: 'invalid-key' };
    }
    const origin: EntryOrigin = opts.origin ?? 'user';

    // (1) og:* 예약 네임스페이스 — builtin 이 아닌 출처의 og: 등록은 거부(TX-883).
    if (isReserved(key) && origin !== 'builtin') {
      const warning = this._warn(
        key,
        `reserved namespace: '${key}' 는 og:* 코어 예약 대역입니다(origin:'builtin' 만 점유).`,
      );
      return { ok: false, action: 'rejected', reason: 'reserved-namespace', warning };
    }

    // (2) SPI peer 검증 — 선언 버전이 이 레지스트리 SPI major 와 불일치면 거부(TX-884).
    if (this._cfg.spi && opts.spiVersion !== undefined && !spiCompatible(this._cfg.spi.version, opts.spiVersion)) {
      const warning = this._warn(
        key,
        `SPI major 불일치: '${key}' 선언 ${opts.spiVersion}, 코어 ${this._cfg.spi.name}@${this._cfg.spi.version}.`,
      );
      return { ok: false, action: 'rejected', reason: 'spi-mismatch', warning };
    }

    // (3) 충돌 해소 — 기존 entry 존재 시 정책 적용(결정론, §4.2 진리표).
    const prev = this._map.get(key);
    if (prev && !this._resolveConflict(prev, opts)) {
      const warning = this._warn(
        key,
        `'${key}' 는 ${prev.origin === 'builtin' ? '내장(built-in) 보호' : 'override 미지정'} — 덮으려면 { override:true }.`,
      );
      return { ok: false, action: 'kept', reason: 'protected-builtin', warning };
    }

    // (4) 정규화 기록.
    this._map.set(key, buildEntry(key, value, origin, opts, this._seq++));
    return { ok: true, action: prev ? 'replaced' : 'added' };
  }

  /** 충돌 시 신규가 이기는가? — 정책 진리표(§4.2). true=교체 허용. / Does the newcomer win? (§4.2 truth table). */
  private _resolveConflict(prev: RegistryEntry<V>, opts: RegisterOptions): boolean {
    if (prev.origin === 'builtin' && opts.override !== true) return false; // 코어 보호(기본)
    if (this._cfg.duplicatePolicy === 'explicit-override') return opts.override === true;
    return true; // last-wins / protect-builtin(비-builtin) → 신규 승
  }

  get(key: K): V | undefined {
    return this._map.get(key)?.value;
  }

  require(key: K, fallback?: V): V {
    const v = this.get(key);
    if (v !== undefined) return v;
    if (fallback !== undefined) return fallback;
    if (this._cfg.placeholder) return this._cfg.placeholder(key);
    // never-throw 계약(I1) 유지: 폴백/플레이스홀더 미제공 시 undefined 를 V 로 반환.
    return undefined as unknown as V;
  }

  has(key: K): boolean {
    return this._map.has(key);
  }

  list(): K[] {
    return [...this._map.keys()];
  }

  entries(): ReadonlyArray<RegistryEntry<V>> {
    return [...this._map.values()];
  }

  unregister(key: K): boolean {
    return this._map.delete(key);
  }

  disposePlugin(pluginId: string): number {
    let n = 0;
    for (const [k, e] of this._map) {
      if (e.pluginId === pluginId) {
        this._map.delete(k);
        n++;
      }
    }
    return n;
  }

  dispose(): void {
    this._map.clear();
    this._warned.clear();
    this._disposed = true;
  }
}

/**
 * 결정론 정렬: priority 오름차순, 동률이면 등록 순번(seq) 오름차순(§2.3).
 * 한 대상에 여러 확장이 겹칠 때의 적용 순서. 저장 구조는 재사용, 조회 관점만 정렬.
 * / Deterministic ordering: ascending priority, ties broken by seq (§2.3).
 *
 * @param reg - 대상 레지스트리 / The registry
 * @returns priority→seq 정렬된 기록(불변) / Records sorted by priority then seq (immutable)
 */
export function orderedApply<V>(reg: IRegistry<V>): ReadonlyArray<RegistryEntry<V>> {
  return [...reg.entries()].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
}

/**
 * 순서 모호성 감지(§2.3 결정론 정직성): 동일 priority 를 가진 2건 이상의 겹침은 등록순(seq)에
 * 의존한다 — 순서 민감 확장은 priority 를 명시해야 한다. 모호한 priority 그룹을 반환.
 * / Detect order ambiguity: overlaps sharing the same priority depend on registration order (seq).
 *
 * @param entries - 검사할 기록(보통 한 대상에 적용될 부분집합) / Records to inspect
 * @returns 2건 이상 공유하는 priority 목록(빈 배열=모호성 없음) / Priorities shared by 2+ entries
 */
export function detectAmbiguousOrder<V>(entries: ReadonlyArray<RegistryEntry<V>>): number[] {
  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.priority, (counts.get(e.priority) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c > 1).map(([p]) => p);
}
