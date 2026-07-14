// ============================================================
// DD-10 §2.5 확장점 SPI 공통 수명 계약 + IValidator(정본 소유) + peer 검증
// ------------------------------------------------------------
// 각 확장 SPI 의 *내용(시그니처)* 은 소유 DD 가 정본(ICellRenderer=DD-03·IFormatter=DD-04·
// IChartRenderer=DD-06·CFPredicate=DD-05·FunctionDef=DD-08·ICommand=DD-09). DD-10 은 그 위에
// 얹는 공통 `IExtension` 수명 계약(spi/activate/dispose)·독립 버저닝·peer 검증만 소유하며
// 시그니처를 재선언하지 않는다(§2.5 교차리뷰 정정). `IValidator` 만 타 DD 미소유라 DD-10 소유.
// 헤드리스·순수.
// ============================================================

/**
 * 모든 확장 구현이 상속하는 최소 계약(생명주기·격리·직렬화 정합의 근원). DD-10 정본.
 * / The minimal contract inherited by every extension implementation. DD-10 canonical.
 *
 * 소유 DD 는 자기 정본 인터페이스가 `extends IExtension` 하도록 보강한다(재선언 아님, §2.5).
 */
export interface IExtension {
  /** SPI 식별·버전 태그. 예: 'ICellRenderer@2'. / SPI identity/version tag, e.g. 'ICellRenderer@2'. */
  readonly spi: string;
  /** 코어 자원 획득(옵션). 실패 격리 대상. / Acquire core resources (optional). Isolated on failure. */
  activate?(ctx?: unknown): void;
  /** register 로 획득한 자원의 대칭 해제. / Symmetric release of resources acquired at register. */
  dispose?(): void;
}

/** 검증 결과. / Validation result. */
export interface ValResult {
  readonly ok: boolean;
  /** 실패 사유(있으면). / Failure message (if any). */
  readonly message?: string;
}

/**
 * IValidator — 타 DD 미소유. DD-10 이 내용까지 소유하는 유일한 SPI(§2.5).
 * 수식 기반 검증은 DD-08 CalcService 재사용(중복 평가엔진 금지, §1.2).
 * / IValidator — not owned by any other DD; the sole SPI DD-10 owns in full.
 */
export interface IValidator extends IExtension {
  validate(value: unknown, ctx?: unknown): ValResult | Promise<ValResult>;
}

/**
 * 런타임 능력 질의(§2.8). 확장이 "이 빌드가 이걸 지원하나" 코드로 질의.
 * / Runtime capability queries. Extensions ask, in code, whether a build supports something.
 */
export interface CoreCapabilities {
  /** capability 토큰 보유 여부. / Whether a capability token is present. */
  has(token: string): boolean;
  /** SPI 이름 → 현재 버전(미제공 시 undefined). / SPI name → current version (undefined if absent). */
  spiVersion(spi: string): string | undefined;
  /** 코어 버전이 minCore 하한을 만족하는가. / Whether the core version satisfies a minCore floor. */
  satisfies(minCore: string): boolean;
}

/** 확장이 선언하는 peer 계약 — 로드 시 코어가 검증(부적합 안전 거부, §2.5). / Peer contract an extension declares. */
export interface ExtensionPeer {
  /** semver 하한. / semver floor. */
  readonly minCore: string;
  /** 대상 SPI@major. 예: 'IChartRenderer@3'. / Target SPI@major, e.g. 'IChartRenderer@3'. */
  readonly spi: string;
  /** 요구 capability 토큰. / Required capability tokens. */
  readonly requires?: string[];
}

/** peer 검증 판정. / Peer verification verdict. */
export interface PeerVerdict {
  readonly ok: boolean;
  /** 거부 사유(고지). / Rejection reason (disclosed). */
  readonly reason?: string;
}

/** 두 semver 문자열 비교: a<b→-1, a==b→0, a>b→1(수치 세그먼트). / Compare two semver strings by numeric segments. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0);
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * 확장 로드 시 peer 검증(안전 거부, UC-6). minCore 미달·SPI major 불일치·capability 미보유는
 * 모두 사유 고지 후 거부하며, 동일 SPI major 내 minor 차이는 통과.
 * / Verify an extension's peer contract at load time (safe reject, UC-6).
 *
 * @param peer - 확장이 선언한 peer 계약 / The peer contract the extension declares
 * @param core - 코어 능력 질의 인터페이스 / Core capability query interface
 * @returns ok | reject(사유 고지) / ok, or reject with a disclosed reason
 */
export function verifyPeer(peer: ExtensionPeer, core: CoreCapabilities): PeerVerdict {
  if (!core.satisfies(peer.minCore)) {
    return { ok: false, reason: `minCore 미달: 필요 ${peer.minCore}` };
  }
  const at = peer.spi.lastIndexOf('@');
  const name = at >= 0 ? peer.spi.slice(0, at) : peer.spi;
  const needMajor = at >= 0 ? peer.spi.slice(at + 1).split('.')[0] : undefined;
  if (needMajor !== undefined) {
    const have = core.spiVersion(name);
    if (have === undefined) return { ok: false, reason: `SPI 미제공: ${name}` };
    const haveMajor = have.split('.')[0];
    if (haveMajor !== needMajor) {
      return { ok: false, reason: `SPI major 불일치: 필요 @${needMajor}, 코어 @${haveMajor}` };
    }
  }
  for (const tok of peer.requires ?? []) {
    if (!core.has(tok)) return { ok: false, reason: `capability 미보유: ${tok}` };
  }
  return { ok: true };
}

/** CoreCapabilities 구성 스펙. / Spec to build CoreCapabilities. */
export interface CapabilitiesSpec {
  readonly core: string;
  readonly spi?: Readonly<Record<string, string>>;
  readonly tokens?: readonly string[];
}

/**
 * CoreCapabilities 의 구체 구현(생성 매니페스트 소비, §2.8 CapabilityService).
 * / Concrete CoreCapabilities implementation (consumes a generated manifest).
 *
 * @example
 * const caps = new Capabilities({ core: '2.4.0', spi: { IChartRenderer: '2' }, tokens: ['canvas2d'] });
 * verifyPeer({ minCore: '2.0.0', spi: 'IChartRenderer@3' }, caps).ok; // false
 */
export class Capabilities implements CoreCapabilities {
  private readonly _core: string;
  private readonly _spi: Map<string, string>;
  private readonly _tokens: Set<string>;

  constructor(spec: CapabilitiesSpec) {
    this._core = spec.core;
    this._spi = new Map(Object.entries(spec.spi ?? {}));
    this._tokens = new Set(spec.tokens ?? []);
  }

  has(token: string): boolean {
    return this._tokens.has(token);
  }

  spiVersion(spi: string): string | undefined {
    return this._spi.get(spi);
  }

  satisfies(minCore: string): boolean {
    return compareSemver(this._core, minCore) >= 0;
  }
}
