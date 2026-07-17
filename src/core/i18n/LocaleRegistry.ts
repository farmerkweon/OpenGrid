// ============================================================
// LocaleRegistry — 로케일 카탈로그 등록소 + per-instance child 체인 (I18N_DESIGN.md §3.3)
// ------------------------------------------------------------
// 설계 근거(Why): IconRegistry 와 동형(isomorphic) — "전역 싱글턴 + parent-chain child +
//   never-throw 폴백". 새 패턴을 발명하지 않는다. 폴백 체인(§2-D1):
//     1) 인스턴스 child 의 오버라이드(options.messages / setMessage)
//     2) 활성 로케일(전역 등록 사용자 로케일 포함)
//     3) 기본 로케일 ko (완전 카탈로그 = SSOT 종단)
//     4) 키 문자열 원문 반환(+ dev console.warn 1회/키)
//   dot-key→중첩값 해소는 활성 로케일 기준 캐시(핫패스 재탐색 금지, §7).
// / Design: isomorphic to IconRegistry — "global singleton + parent-chain child + never-throw
//   fallback". Fallback chain (§2-D1): instance override → active locale → base ko (SSOT terminal)
//   → key string. dot-key resolution is cached per active locale (hot path, §7).
// ============================================================

import { interpolate } from './interpolate.js';
import type {
  LocaleMessages, PartialLocaleMessages, LocaleMessageKey,
  MessageValue, MessageParams, LocaleMeta, LocaleRegisterResult,
} from './types.js';
import { KO_MESSAGES, KO_META } from './locales/ko.js';
import { EN_MESSAGES, EN_META } from './locales/en.js';

/**
 * 2단 dot-key 를 [section, key] 로 분리(첫 '.' 기준).
 *
 * Split a 2-level dot-key into [section, key] at the first '.'.
 *
 * 2段の dot-key を [section, key] に分割(最初の '.' が基準)。
 *
 * 以第一个 '.' 为界，将 2 段 dot-key 拆分为 [section, key]。
 */
function splitDot(dotKey: string): [string, string] {
  const i = dotKey.indexOf('.');
  return i < 0 ? [dotKey, ''] : [dotKey.slice(0, i), dotKey.slice(i + 1)];
}

/**
 * 저장 계층에서 dot-key 값을 얕게(2단) 조회.
 *
 * Shallow (2-level) lookup of a dot-key in one storage layer.
 *
 * 保存レイヤーから dot-key の値を浅く(2段)参照。
 *
 * 在存储层中浅层(2 段)查找 dot-key 的值。
 */
function ownLookup(store: PartialLocaleMessages | undefined, dotKey: string): MessageValue | undefined {
  if (!store) return undefined;
  const [section, key] = splitDot(dotKey);
  const sec = (store as any)[section];
  return sec ? (sec[key] as MessageValue | undefined) : undefined;
}

/**
 * 정확히 2단 딥머지(leaf 승리, 함수·배열은 통째 교체). 원본 불변(새 객체 생성).
 *
 * Exactly 2-level deep-merge (leaf wins; functions/arrays replaced wholesale). Non-mutating.
 *
 * 正確に2段のディープマージ(leaf が勝ち、関数・配列は丸ごと置換)。元のオブジェクトは不変(新しいオブジェクトを生成)。
 *
 * 严格 2 段深合并(leaf 优先，函数与数组整体替换)。不修改原对象(生成新对象)。
 */
function deepMerge2(base: PartialLocaleMessages, patch: PartialLocaleMessages): PartialLocaleMessages {
  const out: any = {};
  for (const s of Object.keys(base)) out[s] = { ...(base as any)[s] };
  for (const s of Object.keys(patch)) out[s] = { ...(out[s] ?? {}), ...(patch as any)[s] };
  return out;
}

/**
 * 로케일 메시지 등록소 — 화면에 뿌리는 문자열("정렬", "필터 적용" 등)을 코드에 박아 넣지 않고
 * 로케일별 카탈로그로 분리해 관리한다. 왜 분리하나: 문자열을 하드코딩하면 언어를 추가하거나
 * 문구 하나를 바꿀 때마다 소스를 고쳐야 한다 — 이 레지스트리는 그 교체 지점을 "카탈로그 등록"
 * 하나로 좁힌다. 전역 싱글턴 `localeRegistry`(ko·en 시드, active='ko') + per-instance `child()`
 * 체인으로 그리드마다 다른 문구를 얹을 수 있다(IconRegistry 와 동일 구조).
 *
 * Locale message registry — keeps UI strings ("sort", "apply filter", …) out of source code by
 * moving them into per-locale catalogs. Why: hardcoded strings mean editing source for every new
 * language or every wording tweak; this registry narrows that down to "register a catalog".
 * Global singleton `localeRegistry` (ko·en seeded, active='ko') plus a per-instance `child()`
 * chain lets each grid instance layer its own overrides (same structure as IconRegistry).
 *
 * ロケールメッセージのレジストリ — 画面に表示する文字列(「並び替え」「フィルター適用」など)を
 * コードに埋め込まず、ロケールごとのカタログに分離して管理します。なぜ分離するのか: 文字列を
 * ハードコードすると、言語を追加したり文言を一つ変えたりするたびにソースを直す必要があります —
 * このレジストリはその差し替え地点を「カタログ登録」一つに狭めます。グローバルシングルトン
 * `localeRegistry`(ko・en をシード、active='ko')と per-instance の `child()` チェーンにより、
 * グリッドごとに異なる文言を重ねられます(IconRegistry と同じ構造)。
 *
 * 区域设置消息注册表 — 把界面字符串(「排序」「应用筛选」等)从源码中移出，按区域设置分入各自的
 * 目录来管理。为什么要分离: 字符串一旦硬编码，每加一种语言、每改一处文案都要动源码 —
 * 本注册表把这个改动点收窄为「注册一份目录」。全局单例 `localeRegistry`(以 ko·en 作为种子、
 * active='ko')加上 per-instance 的 `child()` 链，让每个表格实例都能叠加自己的覆盖
 * (与 IconRegistry 结构相同)。
 *
 * @example
 * // Override a single message for one grid instance
 * const locales = localeRegistry.child();
 * locales.setOverride('filter.apply', '적용하기');
 * locales.t('filter.apply'); // → '적용하기'
 */
export class LocaleRegistry {
  private _locales = new Map<string, PartialLocaleMessages>();
  private _meta = new Map<string, LocaleMeta>();
  private _extends = new Map<string, string>();
  /**
   * 인스턴스 한정 오버라이드(로케일 무관, 최우선).
   *
   * Instance-scoped overrides (locale-agnostic, top priority).
   *
   * インスタンス限定のオーバーライド(ロケール非依存、最優先)。
   *
   * 实例级覆盖(与区域设置无关，优先级最高)。
   */
  private _overrides: PartialLocaleMessages = {};
  private _parent: LocaleRegistry | undefined;
  private _active: string;
  /**
   * dot-key 해소 캐시(키 = `${active} ${dotKey}`). 변이 시 clear.
   *
   * dot-key resolution cache (key = `${active} ${dotKey}`). Cleared on mutation.
   *
   * dot-key 解決キャッシュ(キー = `${active} ${dotKey}`)。変更時に clear。
   *
   * dot-key 解析缓存(键 = `${active} ${dotKey}`)。变更时 clear。
   */
  private _cache = new Map<string, MessageValue | null>();
  private _warned = new Set<string>();

  constructor(parent?: LocaleRegistry) {
    this._parent = parent;
    this._active = parent ? parent._active : 'ko';
  }

  /**
   * 새 언어 카탈로그를 통째로(또는 일부만) 등록한다. 예: 프랑스어 지원을 추가할 때 전체 키를
   * 다 채우지 못했더라도 일단 등록해 두면, 미채운 키는 기본 로케일 ko 로 자동 대체된다
   * (never-throw 폴백, `t()` 참고). 반환하는 `{ missingKeys }` 는 ko(단일 진실 공급원) 대비
   * 빠진 키 목록으로, 등록을 막지 않고 누락만 알리는 신호다 — 번역 진행률 체크에 쓴다.
   *
   * Register a whole (or partial) locale catalog. e.g. when adding French support, you can
   * register an incomplete catalog and missing keys silently fall back to the base locale ko
   * (never-throw, see `t()`). The returned `{ missingKeys }` lists keys still missing versus ko
   * (the single source of truth) — a non-blocking signal you can use to track
   * translation progress.
   *
   * 新しい言語カタログを丸ごと(または一部だけ)登録します。例: フランス語対応を追加するとき、
   * 全キーを埋めきれていなくてもひとまず登録しておけば、埋めていないキーは既定ロケール ko に
   * 自動で差し替わります(never-throw フォールバック、`t()` を参照)。返却する `{ missingKeys }` は
   * ko(信頼できる唯一の情報源)に対して欠けているキーの一覧で、登録を妨げずに漏れだけを知らせる
   * シグナルです — 翻訳の進捗チェックに使います。
   *
   * 注册整份(或部分)语言目录。例: 添加法语支持时，即使没有填完全部键也可以先注册，未填的键会
   * 自动回退到默认区域设置 ko(never-throw 回退，参见 `t()`)。返回的 `{ missingKeys }` 是相对
   * ko(唯一可信信息源)仍缺失的键的列表，是一个不阻断注册、只提示遗漏的信号 — 用于检查翻译进度。
   *
   * @param id - 로케일 id(예: 'fr')
   *
   * Locale id (e.g. 'fr')
   *
   * ロケール id(例: 'fr')
   *
   * 区域设置 id(例: 'fr')
   *
   * @param messages - 등록할 메시지(부분 허용)
   *
   * Messages to register (partial allowed)
   *
   * 登録するメッセージ(部分指定可)
   *
   * 要注册的消息(允许部分指定)
   *
   * @param opts.extends - 이 로케일이 먼저 상속할 다른 로케일 id
   *
   * Locale id this one should inherit from first
   *
   * このロケールが先に継承する別のロケールの id
   *
   * 该区域设置优先继承的另一个区域设置 id
   *
   * @returns 누락 키 목록 `{ missingKeys }`
   *
   * `{ missingKeys }` — keys still missing vs ko
   *
   * 欠落キーの一覧 `{ missingKeys }`
   *
   * 缺失键的列表 `{ missingKeys }`
   *
   * @example
   * localeRegistry.register('fr', { filter: { apply: 'Appliquer' } });
   * // remaining filter.* keys fall back to ko
   */
  register(id: string, messages: PartialLocaleMessages, opts?: { extends?: string }): LocaleRegisterResult {
    this._locales.set(id, messages);
    if (opts?.extends) this._extends.set(id, opts.extends);
    this._cache.clear();
    const baseKeys = this._allDotKeys();
    const missingKeys = baseKeys.filter(k => ownLookup(messages, k) === undefined);
    return { missingKeys };
  }

  /**
   * 기존 로케일 위에 일부 키만 겹쳐 쓴다(2단 딥머지). 예: en 카탈로그는 그대로 두고 버튼 문구
   * 하나만 다른 톤으로 바꾸고 싶을 때, 로케일 전체를 다시 등록할 필요 없이 이 메서드로 충분하다.
   * 미존재 id 면 새로 생성하고, 원본(ko 등)은 건드리지 않는다.
   *
   * Overlay a few keys onto an existing locale (2-level deep-merge). e.g. keep the en catalog
   * as-is and just re-word one button label — no need to re-register the whole locale. Creates
   * the id if it doesn't exist yet; the base locale (ko, …) is left untouched.
   *
   * 既存のロケールの上に一部のキーだけを重ねて書きます(2段ディープマージ)。例: en カタログは
   * そのままにして、ボタンの文言一つだけを違うトーンに変えたいとき、ロケール全体を登録し直す
   * 必要はなく、このメソッドで十分です。存在しない id なら新規に作成し、元(ko など)には
   * 手を触れません。
   *
   * 在已有区域设置之上只覆盖一部分键(2 段深合并)。例: 想保持 en 目录不变，只把一个按钮文案
   * 换成别的语气时，无需重新注册整个区域设置，用本方法就够了。id 不存在则新建，原本(ko 等)
   * 不受影响。
   */
  extend(id: string, partial: PartialLocaleMessages): this {
    const cur = this._locales.get(id) ?? {};
    this._locales.set(id, deepMerge2(cur, partial));
    this._cache.clear();
    return this;
  }

  /**
   * 로케일(자기 계층)이 등록돼 있는가.
   *
   * Whether the locale is registered (own layer).
   *
   * ロケール(自身のレイヤー)が登録されているか。
   *
   * 区域设置(自身层)是否已注册。
   */
  has(id: string): boolean {
    return this._locales.has(id) || (this._parent?.has(id) ?? false);
  }

  /**
   * 로케일 원본(자기 계층). 병합·부모체인 해석 뷰가 아님.
   *
   * Raw locale (own layer) — not a merged/chain-resolved view.
   *
   * ロケールの原本(自身のレイヤー)。マージ・親チェーン解決後のビューではありません。
   *
   * 区域设置的原本(自身层)。不是合并、父链解析后的视图。
   */
  get(id: string): LocaleMessages | undefined {
    return this._locales.get(id) as LocaleMessages | undefined;
  }

  /**
   * 등록된 로케일 id 목록(부모체인 합집합).
   *
   * Registered locale ids (union across the parent chain).
   *
   * 登録済みロケール id の一覧(親チェーンの和集合)。
   *
   * 已注册的区域设置 id 的列表(父链的并集)。
   */
  list(): string[] {
    const ids = new Set<string>(this._locales.keys());
    if (this._parent) for (const id of this._parent.list()) ids.add(id);
    return [...ids];
  }

  /**
   * 사용자가 화면에서 언어 설정을 바꿨을 때 호출해 활성 로케일을 전환한다. 렌더 루프 도중
   * 불려도 안전하도록, 미등록 id 는 throw 하지 않고 console.warn 후 현재 로케일을 유지한다
   * (never-throw).
   *
   * Call when the user switches their language setting to change the active locale. Safe to
   * call mid-render: unknown ids warn (never throw) and keep the current locale.
   *
   * ユーザーが画面で言語設定を変えたときに呼び出して、アクティブロケールを切り替えます。
   * レンダーループの途中で呼ばれても安全なように、未登録の id は throw せず console.warn した
   * うえで現在のロケールを維持します(never-throw)。
   *
   * 用户在界面上改变语言设置时调用，用于切换活动区域设置。为了在渲染循环中途被调用也安全，
   * 未注册的 id 不会 throw，而是 console.warn 之后保持当前区域设置(never-throw)。
   */
  setActive(id: string): void {
    if (!this.has(id) && id !== 'ko') {
      if (typeof console !== 'undefined') console.warn(`[LocaleRegistry] 미등록 로케일 "${id}" — 무시하고 현재 로케일 유지. / unknown locale, keeping current.`);
      return;
    }
    this._active = id;
  }

  /**
   * 현재 활성 로케일 id.
   *
   * Current active locale id.
   *
   * 現在のアクティブロケール id。
   *
   * 当前活动区域设置 id。
   */
  active(): string { return this._active; }

  /**
   * 한 페이지에 그리드가 여러 개 있을 때, 그리드마다 다른 문구를 쓰고 싶으면 이 자식 레지스트리로
   * 전역 카탈로그는 그대로 두고 인스턴스 하나만 격리해 오버라이드한다.
   *
   * When a page hosts multiple grids that each need different wording, use this child registry
   * to isolate overrides to one instance while the global catalog stays untouched.
   *
   * 1ページにグリッドが複数あるとき、グリッドごとに違う文言を使いたければ、この子レジストリで
   * グローバルカタログはそのままにして、インスタンス一つだけを隔離してオーバーライドします。
   *
   * 一个页面上有多个表格、想让每个表格用不同文案时，用这个子注册表保持全局目录不变，
   * 只隔离一个实例来覆盖。
   */
  child(): LocaleRegistry { return new LocaleRegistry(this); }

  /**
   * 로케일과 무관하게 이 인스턴스에서만 문구 하나를 즉시 바꾼다(최우선 순위). 언어를 en 으로
   * 바꿔도 이 오버라이드는 유지된다 — "이 그리드에서만 이 라벨을 이렇게 부르고 싶다"는 요구에 쓴다.
   *
   * Overrides a single message for this instance only, regardless of the active locale (highest
   * priority). Switching to en keeps the override — use it for "just this grid should call this
   * label X".
   *
   * ロケールとは無関係に、このインスタンスでだけ文言一つを即座に変えます(最優先)。言語を en に
   * 変えてもこのオーバーライドは維持されます — 「このグリッドでだけこのラベルをこう呼びたい」と
   * いう要求に使います。
   *
   * 与区域设置无关，只在本实例上立即改变一条文案(优先级最高)。语言换成 en 后这个覆盖依然保留 —
   * 用于「只在这个表格里把这个标签这样叫」的需求。
   */
  setOverride(key: LocaleMessageKey | string, value: MessageValue): this {
    const [section, k] = splitDot(key);
    const sec = ((this._overrides as any)[section] ??= {});
    sec[k] = value;
    this._cache.clear();
    return this;
  }

  /**
   * 그리드 생성 시 `options.messages` 로 넘긴 문구를 인스턴스 오버라이드에 기록한다(내부 배선용;
   * 여러 문구를 한 번에 넣고 싶을 때 직접 호출해도 된다).
   *
   * Records the messages passed via `options.messages` at grid construction into instance
   * overrides (internal wiring; can also be called directly to set several overrides at once).
   *
   * グリッド生成時に `options.messages` で渡した文言をインスタンスのオーバーライドに記録します
   * (内部配線用; 複数の文言を一度に入れたいときは直接呼び出しても構いません)。
   *
   * 把表格创建时通过 `options.messages` 传入的文案记录到实例覆盖中(内部接线用；想一次放入
   * 多条文案时也可以直接调用)。
   */
  applyOverrides(partial: PartialLocaleMessages): this {
    this._overrides = deepMerge2(this._overrides, partial);
    this._cache.clear();
    return this;
  }

  /**
   * 키로 문구를 찾아 반환한다. 렌더 루프(매 프레임 호출될 수 있는 자리)에서 쓰는 소비자용 API라
   * **절대 throw 하지 않는다** — 순서대로 (1) 이 인스턴스의 오버라이드 → (2) 활성 로케일 →
   * (3) `extends` 로 지정한 상속 로케일 → (4) 기본 로케일 ko 를 찾고, 그래도 없으면 키 문자열
   * 자체를 돌려주며 콘솔에 경고를 1회만 남긴다("화면에 아무것도 안 뜨는 것"보다 "키 그대로
   * 보이는 것"이 디버깅에 낫다). params 를 주면 `{name}` 형태의 자리표시자를 채운다.
   *
   * Look up a message by key and return it. Because this is the consumer-facing API called from
   * the render loop (potentially every frame), it **never throws** — it walks (1) this
   * instance's overrides → (2) the active locale → (3) the locale named in `extends` →
   * (4) the base locale ko, and if still unresolved, returns the key string itself with a single
   * console warning (a raw key beats rendering nothing, for debugging). Pass `params` to fill
   * `{name}`-style placeholders.
   *
   * キーで文言を探して返します。レンダーループ(毎フレーム呼ばれうる場所)で使う消費者向けの API
   * なので、**絶対に throw しません** — 順に (1) このインスタンスのオーバーライド →
   * (2) アクティブロケール → (3) `extends` で指定した継承ロケール → (4) 既定ロケール ko を探し、
   * それでも見つからなければキー文字列そのものを返し、コンソールに警告を1回だけ残します
   * (「画面に何も出ないこと」より「キーがそのまま見えること」の方がデバッグに向くためです)。
   * params を渡すと `{name}` 形式のプレースホルダーを埋めます。
   *
   * 按键查找文案并返回。这是渲染循环(可能每帧被调用的位置)中使用的消费方 API，因此
   * **绝不 throw** — 依次查找 (1) 本实例的覆盖 → (2) 活动区域设置 → (3) `extends` 指定的
   * 继承区域设置 → (4) 默认区域设置 ko；仍然找不到就返回键字符串本身，并且只在控制台留一次警告
   * (比起「画面上什么都不显示」，「键原样可见」更利于调试)。传入 params 就会填充 `{name}` 形式的
   * 占位符。
   *
   * @param key - 메시지 dot-key(예: 'filter.apply')
   *
   * Message dot-key (e.g. 'filter.apply')
   *
   * メッセージの dot-key(例: 'filter.apply')
   *
   * 消息的 dot-key(例: 'filter.apply')
   *
   * @param params - 보간 파라미터
   *
   * Interpolation params
   *
   * 補間パラメーター
   *
   * 插值参数
   *
   * @returns 해석된 문구(항상 문자열, 미등록이어도 throw 없음)
   *
   * Resolved string (always a string; never throws even if unregistered)
   *
   * 解決された文言(常に文字列。未登録でも throw なし)
   *
   * 解析后的文案(始终是字符串，未注册也不会 throw)
   *
   * @example
   * localeRegistry.t('filter.apply'); // → '적용'
   * localeRegistry.t('findBar.countBadge', { n: 3 }); // → fills the {n} placeholder with 3
   */
  t(key: LocaleMessageKey | string, params?: MessageParams): string {
    const v = this._resolveCached(key);
    if (v === undefined) {
      if (!this._warned.has(key)) {
        this._warned.add(key);
        if (typeof console !== 'undefined') console.warn(`[LocaleRegistry] 미등록 메시지 키 "${key}" — 키 원문 반환. / unknown message key, returning the key.`);
      }
      return key;
    }
    if (typeof v === 'function') return v(params ?? {});
    return interpolate(v, params);
  }

  /**
   * 활성 로케일 meta(폴백 병합 후). ExportManager 등 포맷 소비자용.
   *
   * Active-locale meta (after fallback merge). For format consumers (e.g. ExportManager).
   *
   * アクティブロケールの meta(フォールバックのマージ後)。ExportManager などフォーマット消費者向け。
   *
   * 活动区域设置的 meta(回退合并之后)。供 ExportManager 等格式消费方使用。
   */
  meta(): LocaleMeta {
    return this._resolveMeta(this._active) ?? this._resolveMeta('ko') ?? { intlLocale: this._active };
  }

  // ── 내부 해석 ─────────────────────────────────────────────

  private _resolveCached(key: string): MessageValue | undefined {
    const ck = `${this._active} ${key}`;
    const hit = this._cache.get(ck);
    if (hit !== undefined) return hit === null ? undefined : hit;
    const v = this._resolve(key);
    this._cache.set(ck, v === undefined ? null : v);
    return v;
  }

  private _resolve(key: string): MessageValue | undefined {
    const active = this._active;
    // 1) 인스턴스/부모 체인 오버라이드 + 활성 로케일(폴백 체인 §2-D1) / instance & parent-chain overrides + active locale (fallback chain §2-D1)
    for (let reg: LocaleRegistry | undefined = this; reg; reg = reg._parent) {
      const ov = ownLookup(reg._overrides, key);
      if (ov !== undefined) return ov;
      const own = ownLookup(reg._locales.get(active), key);
      if (own !== undefined) return own;
    }
    // 2) extends 폴백(있으면) / extends fallback (if any)
    const ext = this._extendsOf(active);
    if (ext && ext !== active) {
      const v = this._resolveLocale(ext);
      if (v !== undefined) { const r = ownLookup2(this, ext, key); if (r !== undefined) return r; }
    }
    // 3) 기본 로케일 ko (SSOT 종단) / base locale ko (SSOT terminal)
    if (active !== 'ko') {
      const r = ownLookup2(this, 'ko', key);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  private _resolveLocale(id: string): PartialLocaleMessages | undefined {
    for (let reg: LocaleRegistry | undefined = this; reg; reg = reg._parent) {
      const m = reg._locales.get(id);
      if (m) return m;
    }
    return undefined;
  }

  private _extendsOf(id: string): string | undefined {
    for (let reg: LocaleRegistry | undefined = this; reg; reg = reg._parent) {
      const e = reg._extends.get(id);
      if (e) return e;
    }
    return undefined;
  }

  private _resolveMeta(id: string): LocaleMeta | undefined {
    for (let reg: LocaleRegistry | undefined = this; reg; reg = reg._parent) {
      const m = reg._meta.get(id);
      if (m) return m;
    }
    return undefined;
  }

  /**
   * ko(SSOT) 전 dot-key 목록(부모체인에서 ko 를 찾아 평탄화).
   *
   * All dot-keys of ko (SSOT), flattened from the parent chain.
   *
   * ko(SSOT)の全 dot-key の一覧(親チェーンから ko を探して平坦化)。
   *
   * ko(SSOT)的全部 dot-key 列表(从父链中找到 ko 并平坦化)。
   */
  private _allDotKeys(): string[] {
    const ko = this._resolveLocale('ko');
    if (!ko) return [];
    const keys: string[] = [];
    for (const section of Object.keys(ko)) {
      const sec = (ko as any)[section];
      if (sec) for (const k of Object.keys(sec)) keys.push(`${section}.${k}`);
    }
    return keys;
  }

  /**
   * @internal
   * 시드 전용 — 로케일 원본 + meta 직접 등록(캐시/누락검사 없이).
   *
   * Seed-only — register raw locale + meta directly.
   *
   * シード専用 — ロケールの原本 + meta を直接登録(キャッシュ・欠落検査なし)。
   *
   * 仅供播种 — 直接注册区域设置的原本 + meta(不做缓存与缺失检查)。
   */
  _seed(id: string, messages: LocaleMessages, meta: LocaleMeta): void {
    this._locales.set(id, messages);
    this._meta.set(id, meta);
  }
}

/**
 * 부모체인에서 특정 로케일의 dot-key 값을 조회.
 *
 * Look up a dot-key value of a specific locale across the parent chain.
 *
 * 親チェーンから特定ロケールの dot-key の値を参照。
 *
 * 从父链中查找特定区域设置的 dot-key 的值。
 */
function ownLookup2(start: LocaleRegistry, localeId: string, dotKey: string): MessageValue | undefined {
  for (let reg: any = start; reg; reg = reg._parent) {
    const v = ownLookup(reg._locales.get(localeId), dotKey);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * 프로세스 전역 기본 로케일 레지스트리(ko·en 시드, active='ko').
 * 팩토리 생성 렌더러(인스턴스 컨텍스트 없음)가 이 초크포인트로 메시지를 얻는다.
 *
 * Process-global default locale registry (ko·en seeded, active='ko'). Factory-created renderers
 * (no instance context) obtain messages from this chokepoint.
 *
 * プロセスグローバルな既定ロケールレジストリ(ko・en をシード、active='ko')。
 * ファクトリー生成のレンダラー(インスタンスコンテキストなし)は、このチョークポイントから
 * メッセージを取得します。
 *
 * 进程级全局的默认区域设置注册表(以 ko·en 作为种子、active='ko')。
 * 工厂生成的渲染器(没有实例上下文)从这个收口点获取消息。
 */
export const localeRegistry = new LocaleRegistry();
localeRegistry._seed('ko', KO_MESSAGES, KO_META);
localeRegistry._seed('en', EN_MESSAGES, EN_META);

/**
 * 그리드 인스턴스 컨텍스트가 없는 코드(순수 함수형 헬퍼 등)에서 전역 카탈로그로 바로 문구를
 * 얻을 때 쓰는 편의 함수(renderIcon 과 동일 패턴). 인스턴스별로 다른 문구가 필요하면 대신
 * `localeRegistry.child()` 를 쓴다.
 *
 * Convenience function for code with no grid-instance context (e.g. standalone helpers) that
 * needs a message straight from the global catalog (same pattern as renderIcon). If per-instance
 * wording is needed, use `localeRegistry.child()` instead.
 *
 * グリッドのインスタンスコンテキストがないコード(純粋関数型のヘルパーなど)から、グローバル
 * カタログで直接文言を得るときに使う便利関数(renderIcon と同じパターン)。インスタンスごとに
 * 違う文言が必要なら、代わりに `localeRegistry.child()` を使います。
 *
 * 在没有表格实例上下文的代码(纯函数式辅助函数等)中，直接从全局目录取得文案时使用的便捷函数
 * (与 renderIcon 同一模式)。如果每个实例需要不同的文案，请改用 `localeRegistry.child()`。
 *
 * @example
 * import { t } from './i18n/LocaleRegistry.js';
 * t('sort.asc'); // → '오름차순'
 */
export function t(key: LocaleMessageKey | string, params?: MessageParams): string {
  return localeRegistry.t(key, params);
}
