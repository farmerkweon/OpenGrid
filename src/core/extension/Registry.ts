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

/**
 * 등록 출처. 같은 키가 겹칠 때 어느 쪽을 남길지 정하는 1차 기준이며, og 코어를 보호하는 근거가 된다.
 *
 * Entry origin. The primary factor in deciding which registration wins on a key collision, and the basis for protecting the og core.
 *
 * 登録元。同じキーが重複したときにどちらを残すかを決める第一の基準であり、ogコアを保護する根拠にもなります。
 *
 * 注册来源。是判定同一键发生冲突时保留哪一方的首要依据，也是保护og内核的根据。
 */
export type EntryOrigin = 'builtin' | 'plugin' | 'user';

// 폐기 정보는 "예고 없는 제거 금지" 원칙을 데이터로 표현한 것이다(§2.8).
/**
 * 폐기 정보. API를 없애기 전에 미리 알리기 위한 값으로, 버전·대체값·안내문을 담는다.
 *
 * Deprecation info. Carries the version, replacement, and note used to warn callers before an API is removed.
 *
 * 廃止情報。APIを削除する前にあらかじめ知らせるための値で、バージョン・代替値・案内文を保持します。
 *
 * 废弃信息。用于在移除API之前提前告知调用方，包含版本、替代方案及说明。
 */
export interface DeprecationInfo {
  /**
   * 폐기가 시작된 버전.
   *
   * Version where the deprecation was marked.
   *
   * 廃止が開始されたバージョン。
   *
   * 标记为废弃的版本。
   */
  readonly since: string;
  /**
   * 제거 예정 버전. 이 버전이 되기 전에는 실제로 제거되지 않도록 게이트가 막는다.
   *
   * Planned removal version. A gate blocks removal before this version is reached.
   *
   * 削除予定バージョン。このバージョンに達する前は実際には削除されないよう、ゲートが防ぎます。
   *
   * 计划移除的版本。在到达该版本之前，有关卡阻止实际移除。
   */
  readonly removeIn: string;
  /**
   * 대체할 API 또는 키.
   *
   * Replacement API or key.
   *
   * 代替となるAPIまたはキー。
   *
   * 替代的API或键。
   */
  readonly replacement?: string;
  /**
   * 추가 설명.
   *
   * Extra note.
   *
   * 補足説明。
   *
   * 补充说明。
   */
  readonly note?: string;
}

/**
 * 등록할 때 함께 선언하는 정책 정보. 충돌·순서·폐기 같은 규칙을 코드가 아니라 데이터로 표현한다.
 *
 * Policy metadata declared at registration time. Rules like conflict handling, ordering, and deprecation are expressed as data rather than code.
 *
 * 登録時に併せて宣言するポリシー情報です。衝突・順序・廃止といったルールをコードではなくデータとして表現します。
 *
 * 注册时一并声明的策略信息。冲突、顺序、废弃等规则以数据而非代码的形式表达。
 */
export interface RegisterOptions {
  /**
   * 등록 출처. 기본값은 'user'이며, 'builtin'은 코어 부트스트랩에서만 사용한다.
   *
   * Entry origin. Defaults to 'user'; 'builtin' is reserved for core bootstrap.
   *
   * 登録元。デフォルトは'user'で、'builtin'はコアのブートストラップでのみ使用します。
   *
   * 注册来源。默认值为'user'，'builtin'仅供内核启动阶段使用。
   */
  origin?: EntryOrigin;
  /**
   * 보호된(내장) 키를 의도적으로 덮어쓰겠다는 명시적 표시. 기본값은 false.
   *
   * Explicit intent to override a protected (built-in) key. Defaults to false.
   *
   * 保護された(組み込みの)キーを意図的に上書きするという明示的な表示です。デフォルトはfalse。
   *
   * 明确表示有意覆盖受保护的(内置)键。默认值为false。
   */
  override?: boolean;
  /**
   * 이 등록을 소유한 플러그인 ID. og:* 예약 네임스페이스 검사, 매니페스트 추적, 일괄 해제(dispose)에 쓰인다.
   *
   * Plugin ID that owns this registration. Used for og:* reserved-namespace checks, manifest tracking, and batch dispose.
   *
   * この登録を所有するプラグインID。og:*予約名前空間の検査、マニフェスト追跡、一括解除(dispose)に使われます。
   *
   * 拥有此注册的插件ID。用于og:*保留命名空间检查、清单追踪及批量解除(dispose)。
   */
  pluginId?: string;
  /**
   * 한 대상에 여러 값이 겹쳐 적용될 때의 순서. 값이 작을수록 먼저 적용된다. 기본값은 0.
   *
   * Order used when multiple values apply to the same target; smaller runs first. Defaults to 0.
   *
   * 1つの対象に複数の値が重ねて適用されるときの順序。値が小さいほど先に適用されます。デフォルトは0。
   *
   * 多个值重叠应用于同一目标时的顺序。数值越小越先应用。默认值为0。
   */
  priority?: number;
  /**
   * 이 값이 구현하는 SPI 버전. 레지스트리가 기대하는 버전과 맞는지 검증하는 데 쓰인다.
   *
   * SPI version this value implements. Used to verify compatibility with the registry's expected version.
   *
   * この値が実装するSPIバージョン。レジストリが期待するバージョンと一致するかを検証するために使われます。
   *
   * 此值所实现的SPI版本，用于校验是否与注册表所期望的版本兼容。
   */
  spiVersion?: string;
  /**
   * 이 키가 폐기 예정일 때만 채워지는 정보.
   *
   * Present only when this key is deprecated.
   *
   * このキーが廃止予定のときにのみ設定される情報。
   *
   * 仅当此键计划废弃时才会填充的信息。
   */
  deprecated?: DeprecationInfo;
}

/**
 * 등록 1건을 정규화해 저장한 불변 기록. seq는 우선순위가 같을 때 등록 순서로 동점을 가르는 안정적인 기준이다.
 *
 * A normalized, immutable record of one registration. seq is the stable tiebreaker used when priorities are equal.
 *
 * 1件の登録を正規化して保存した不変のレコードです。seqは優先度が同じときに登録順で同点を分ける安定した基準です。
 *
 * 将一次注册规范化后保存的不可变记录。seq是优先级相同时按注册顺序判定胜负的稳定依据。
 */
export interface RegistryEntry<V> {
  readonly key: string;
  readonly value: V;
  readonly origin: EntryOrigin;
  readonly priority: number;
  /**
   * 이 레지스트리 안에서만 유효한, 계속 증가하는 등록 순번.
   *
   * Monotonically increasing registration sequence, local to this registry.
   *
   * このレジストリ内でのみ有効な、単調増加する登録連番。
   *
   * 仅在此注册表内有效的单调递增注册序号。
   */
  readonly seq: number;
  readonly pluginId?: string;
  readonly spiVersion?: string;
  readonly deprecated?: DeprecationInfo;
}

/**
 * 등록 결과가 실제로 어떤 동작이었는지 나타내는 분류.
 *
 * Classifies what actually happened as a result of a registration attempt.
 *
 * 登録結果が実際にはどの動作だったかを表す分類。
 *
 * 对注册结果实际发生的动作进行分类。
 */
export type RegisterAction = 'added' | 'replaced' | 'kept' | 'rejected';

/**
 * 등록이 거부되거나 기존 값이 유지된 이유.
 *
 * Reason a registration was rejected or the existing value was kept.
 *
 * 登録が拒否された、または既存の値が維持された理由。
 *
 * 注册被拒绝或保留现有值的原因。
 */
export type RegisterReason =
  | 'reserved-namespace'
  | 'protected-builtin'
  | 'invalid-key'
  | 'spi-mismatch'
  | 'disposed'
  | 'adapter-error';

/**
 * register() 호출의 결과. 예외를 던지지 않고, 거부되거나 경고가 발생해도 항상 값으로 알려준다(조용히 실패하지 않는다).
 *
 * Result of a register() call. Never throws — rejections and warnings are always reported as a returned value, never a silent failure.
 *
 * register()呼び出しの結果です。例外を投げることはなく、拒否や警告が発生しても常に戻り値として知らせます(サイレント失敗しません)。
 *
 * register()调用的结果。不抛出异常——即使发生拒绝或警告，也始终以返回值告知(不会静默失败)。
 */
export interface RegisterResult {
  /**
   * 지금 넘긴 값이 실제로 등록되었는지 여부(added/replaced일 때만 true).
   *
   * Whether the value just passed in is now registered (true only for added/replaced).
   *
   * 今渡した値が実際に登録されたかどうか(added/replacedのときのみtrue)。
   *
   * 刚传入的值是否已实际注册(仅added/replaced时为true)。
   */
  readonly ok: boolean;
  readonly action: RegisterAction;
  readonly reason?: RegisterReason;
  /**
   * 실제로 출력된 경고 메시지 원문. `[OpenGrid]` 접두사가 붙는다.
   *
   * The exact warning text that was emitted, prefixed with `[OpenGrid]`.
   *
   * 実際に出力された警告メッセージの原文。`[OpenGrid]`という接頭辞が付きます。
   *
   * 实际输出的警告消息原文，带有`[OpenGrid]`前缀。
   */
  readonly warning?: string;
}

/**
 * 같은 키를 다시 등록할 때 적용할 정책.
 *
 * Policy applied when the same key is registered again.
 *
 * 同じキーを再登録するときに適用するポリシー。
 *
 * 重新注册同一键时应用的策略。
 */
export type DuplicatePolicy = 'last-wins' | 'explicit-override' | 'protect-builtin';

/**
 * 셀타입·포맷터·검증기·조건부 서식 규칙·차트 등 모든 확장 지점이 공유하는 단일 계약.
 * K는 키 타입(기본 string), V는 등록되는 값의 타입이다.
 *
 * The single contract shared by every extension point (cell types, formatters, validators,
 * conditional-formatting rules, charts, and more). K is the key type (default string), V is the
 * type of the registered value.
 *
 * セルタイプ・フォーマッタ・バリデータ・条件付き書式ルール・チャートなど、すべての拡張ポイントが共有する単一の契約です。Kはキーの型(デフォルトはstring)、Vは登録される値の型です。
 *
 * 单元格类型、格式化器、验证器、条件格式规则、图表等所有扩展点共享的单一契约。K为键类型(默认string)，V为注册值的类型。
 */
export interface IRegistry<V, K extends string = string> {
  /**
   * 값을 등록한다. 정책(RegisterOptions)에 따라 충돌을 해소하며, 예외를 던지지 않는다.
   *
   * Registers a value. Conflicts are resolved according to policy (RegisterOptions); never throws.
   *
   * 値を登録します。ポリシー(RegisterOptions)に従って衝突を解消し、例外は投げません。
   *
   * 注册一个值。按照策略(RegisterOptions)解决冲突，不抛出异常。
   */
  register(key: K, value: V, opts?: RegisterOptions): RegisterResult;
  // 미등록 시 undefined 반환은 불변식 I1(never-throw)의 구체 사례다.
  /**
   * 키로 값을 조회한다. 등록되어 있지 않으면 undefined를 반환한다(예외를 던지지 않는다).
   *
   * Looks up a value by key. Returns undefined if unregistered — never throws.
   *
   * キーで値を検索します。未登録の場合はundefinedを返します(例外は投げません)。
   *
   * 按键查找值。未注册时返回undefined(不抛出异常)。
   */
  get(key: K): V | undefined;
  // 미등록 시에도 예외를 던지지 않는 불변식 I1을 따른다(REQ-T4-803).
  /**
   * 키로 값을 조회하되, 등록되어 있지 않으면 fallback 값이나 개발용 플레이스홀더를 대신 반환한다.
   *
   * Looks up a value by key; if unregistered, returns the given fallback or a dev placeholder instead.
   *
   * キーで値を検索しますが、未登録の場合はfallback値、または開発用のプレースホルダーを代わりに返します。
   *
   * 按键查找值；未注册时改为返回给定的fallback值或开发用占位符。
   */
  require(key: K, fallback?: V): V;
  has(key: K): boolean;
  /**
   * 등록된 키 전체 목록.
   *
   * All registered keys.
   *
   * 登録済みキーの一覧。
   *
   * 所有已注册的键。
   */
  list(): K[];
  /**
   * 정규화된 등록 기록 전체. 카탈로그 표시, 진단, 다중 적용 순서 계산 등에 쓴다.
   *
   * All normalized registration records. Used for catalogs, diagnostics, and computing multi-apply order.
   *
   * 正規化された登録レコードすべて。カタログ表示、診断、多重適用順序の算出などに使います。
   *
   * 所有规范化的注册记录，用于目录展示、诊断及计算多重应用顺序。
   */
  entries(): ReadonlyArray<RegistryEntry<V>>;
  unregister(key: K): boolean;
  /**
   * 지정한 플러그인이 등록한 항목을 한번에 모두 해제한다(등록의 대칭적인 해제). 해제된 개수를 반환한다.
   *
   * Disposes all entries registered by the given plugin in one call (the symmetric counterpart to registration). Returns the number disposed.
   *
   * 指定したプラグインが登録した項目を一度にすべて解除します(登録に対応する対称的な解除)。解除した件数を返します。
   *
   * 一次性解除指定插件注册的所有项(与注册对称的解除操作)。返回解除的数量。
   */
  disposePlugin(pluginId: string): number;
  /**
   * 이 레지스트리에 등록된 모든 항목을 해제한다.
   *
   * Disposes everything registered in this registry.
   *
   * このレジストリに登録されたすべての項目を解除します。
   *
   * 解除此注册表中注册的所有项。
   */
  dispose(): void;
}

/**
 * 버전 문자열에서 major 버전만 뽑아낸다. 'ICellRenderer@2', '2.4.0', '2' 형식을 모두 받아들인다.
 *
 * Extracts the major version from a version tag. Accepts formats like 'ICellRenderer@2', '2.4.0', and '2'.
 *
 * バージョン文字列からmajorバージョンだけを取り出します。'ICellRenderer@2'、'2.4.0'、'2'のいずれの形式も受け付けます。
 *
 * 从版本字符串中提取major版本号。可接受'ICellRenderer@2'、'2.4.0'、'2'等各种格式。
 */
function spiMajor(v: string): string {
  const at = v.lastIndexOf('@');
  const ver = at >= 0 ? v.slice(at + 1) : v;
  return ver.split('.')[0] ?? ver;
}

/**
 * 선언된 SPI 버전이 코어 SPI와 호환되는지 확인한다(major 버전이 같으면 호환).
 *
 * Checks whether a declared SPI version is compatible with the core SPI (compatible when the major version matches).
 *
 * 宣言されたSPIバージョンがコアSPIと互換性があるかを確認します(majorバージョンが一致すれば互換)。
 *
 * 检查声明的SPI版本是否与内核SPI兼容(major版本相同即兼容)。
 */
export function spiCompatible(coreVersion: string, declared: string): boolean {
  return spiMajor(coreVersion) === spiMajor(declared);
}

/**
 * TypedRegistry 생성 시 넘기는 설정.
 *
 * Configuration passed when constructing a TypedRegistry.
 *
 * TypedRegistry生成時に渡す設定。
 *
 * 构造TypedRegistry时传入的配置。
 */
export interface TypedRegistryConfig<V, K extends string = string> {
  /**
   * 미등록 키를 조회할 때 대신 돌려줄 개발용 플레이스홀더 값을 만드는 함수. 레지스트리마다 다르게
   * 줄 수 있다(예: 물음표 아이콘, "—" 포맷터).
   *
   * Factory that produces a dev-only placeholder value for unregistered keys. Can differ per
   * registry (e.g. a question-mark icon, a "—" formatter).
   *
   * 未登録のキーを検索したときに代わりに返す、開発用プレースホルダー値を作る関数です。レジストリごとに異なるものを与えられます(例: クエスチョンマークのアイコン、「—」フォーマッタ)。
   *
   * 生成开发用占位符值的工厂函数，用于查找未注册键时代替返回。每个注册表可给出不同的值(例如问号图标、"—"格式化器)。
   */
  placeholder?: (key: K) => V;
  /**
   * 중복 키 처리 정책. 기본값은 'protect-builtin'.
   *
   * Duplicate-key policy. Defaults to 'protect-builtin'.
   *
   * 重複キーの処理ポリシー。デフォルトは'protect-builtin'。
   *
   * 重复键处理策略。默认值为'protect-builtin'。
   */
  duplicatePolicy?: DuplicatePolicy;
  /**
   * 이 레지스트리가 관리하는 SPI의 이름과 현재 버전. 등록되는 값의 버전 호환성을 검사하는 데 쓰인다.
   *
   * Name and current version of the SPI this registry owns. Used to check version compatibility of registered values.
   *
   * このレジストリが管理するSPIの名前と現在のバージョン。登録される値のバージョン互換性を検査するために使われます。
   *
   * 此注册表所管理的SPI名称与当前版本，用于检查注册值的版本兼容性。
   */
  spi?: { name: string; version: string };
  /**
   * 개발용 경고를 받을 함수. 테스트에서 주입할 수 있으며, 기본값은 console.warn이다.
   *
   * Receiver for dev warnings. Injectable in tests; defaults to console.warn.
   *
   * 開発用警告を受け取る関数。テストで注入でき、デフォルトはconsole.warnです。
   *
   * 接收开发用警告的函数。可在测试中注入，默认值为console.warn。
   */
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

// 단일 슬롯형과 다중 적용형을 하나의 엔진으로 묶는 설계 근거는 §2.2 참고.
/**
 * 키 하나에 값 하나만 두는 경우(포맷터·차트 타입 등)와, 한 대상에 여러 값을 겹쳐 적용하는 경우
 * (조건부 서식 규칙 등)를 같은 저장소·정책 엔진으로 처리한다. 달라지는 것은 꺼내 쓰는 방식뿐이다.
 *
 * Handles both single-value-per-key extension points (formatters, chart types, ...) and
 * multi-apply extension points (conditional-formatting rules, decorations, ...) with one shared
 * storage-and-policy engine. Only how values are read back differs.
 *
 * キー1つに値1つだけを持つ場合(フォーマッタ・チャートタイプなど)と、1つの対象に複数の値を重ねて適用する場合(条件付き書式ルールなど)を、同じストレージ・ポリシーエンジンで処理します。異なるのは値を取り出す方法だけです。
 *
 * 将每个键只对应一个值的场景(格式化器、图表类型等)与一个目标可叠加应用多个值的场景(条件格式规则等)，用同一套存储与策略引擎处理。不同的只是取值的方式。
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

  // 충돌 시 판정 로직은 정책 진리표(§4.2)를 코드로 옮긴 것이다.
  /**
   * 충돌이 발생했을 때 새 등록이 기존 값을 이길 수 있는지 판정한다. true면 교체를 허용한다.
   *
   * Decides whether a new registration is allowed to win over an existing one on conflict. True permits replacement.
   *
   * 衝突が発生したとき、新しい登録が既存の値に勝てるかどうかを判定します。trueなら置き換えを許可します。
   *
   * 判定发生冲突时，新注册能否胜过现有值。true表示允许替换。
   */
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

// 여기서 쓰는 정렬 규칙(우선순위→등록순)의 설계 근거는 §2.3 참고.
/**
 * 한 대상에 여러 확장이 겹쳐 적용될 때의 순서를 결정론적으로 정렬한다: priority 오름차순,
 * 같으면 등록 순번(seq) 오름차순. 저장된 데이터는 그대로 두고 꺼내는 순서만 정렬한다.
 *
 * Deterministically orders the extensions applying to the same target: ascending priority, ties
 * broken by registration order (seq). The underlying storage is untouched — only the read order
 * is sorted.
 *
 * 1つの対象に複数の拡張が重ねて適用されるときの順序を決定論的に並べ替えます: priority昇順、同点なら登録順番(seq)の昇順。保存されているデータ自体はそのままにし、取り出す順序だけを並べ替えます。
 *
 * 对应用于同一目标的多个扩展的顺序进行确定性排序：按priority升序，相同则按注册序号(seq)升序。仅对取出的顺序排序，底层存储保持不变。
 *
 * @param reg - 대상 레지스트리.
 *
 * The registry to read from.
 *
 * 読み取り対象のレジストリ。
 *
 * 要读取的注册表。
 *
 * @returns priority, 이어서 seq 순으로 정렬된 기록(불변).
 *
 * Records sorted by priority then seq (immutable).
 *
 * priority、続いてseqの順に並べ替えられたレコード(不変)。
 *
 * 按priority、再按seq排序后的记录(不可变)。
 */
export function orderedApply<V>(reg: IRegistry<V>): ReadonlyArray<RegistryEntry<V>> {
  return [...reg.entries()].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
}

// 이 함수가 지키려는 원칙(순서는 명시적이어야 한다)의 근거는 §2.3 참고.
/**
 * 순서가 모호한 등록을 찾아낸다. 같은 priority를 가진 겹침이 2건 이상이면 실제 적용 순서는
 * 등록 순번(seq)에 의존하게 된다 — 순서가 중요한 확장이라면 priority를 명시적으로 지정해야
 * 한다. 이런 모호한 priority 그룹을 반환한다.
 *
 * Finds registrations whose order is ambiguous. When two or more overlapping registrations share
 * the same priority, the effective order falls back to registration order (seq) — extensions that
 * care about order should set priority explicitly. Returns the priority values shared by 2 or more
 * entries.
 *
 * 順序が曖昧な登録を見つけます。同じpriorityを持つ重なりが2件以上あると、実際の適用順序は登録順番(seq)に依存することになります — 順序が重要な拡張であれば、priorityを明示的に指定する必要があります。このような曖昧なpriorityのグループを返します。
 *
 * 查找顺序不明确的注册。当2条以上重叠注册共享同一priority时，实际应用顺序将依赖注册序号(seq)——若扩展在意顺序，应显式指定priority。返回被2条以上记录共享的priority列表。
 *
 * @param entries - 검사할 기록(보통 한 대상에 적용되는 부분집합).
 *
 * Records to inspect (typically the subset that applies to one target).
 *
 * 検査対象のレコード(通常は1つの対象に適用される部分集合)。
 *
 * 要检查的记录(通常是应用于同一目标的子集)。
 *
 * @returns 2건 이상이 공유하는 priority 목록. 빈 배열이면 모호성이 없다는 뜻.
 *
 * Priorities shared by 2 or more entries; an empty array means no ambiguity.
 *
 * 2件以上が共有するpriorityの一覧。空配列は曖昧さがないことを意味します。
 *
 * 被2条以上记录共享的priority列表；空数组表示没有歧义。
 */
export function detectAmbiguousOrder<V>(entries: ReadonlyArray<RegistryEntry<V>>): number[] {
  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.priority, (counts.get(e.priority) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c > 1).map(([p]) => p);
}
