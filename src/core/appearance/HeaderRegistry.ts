// ============================================================
// HeaderRegistry — 헤더 축(제6축, "머리글은 표의 문장부호다")
// / HeaderRegistry — the header axis (6th), "the header row is the table's punctuation".
// ------------------------------------------------------------
// 설계 근거(Why · SE_APPLY.md §0.2~§0.6 · SE_PLAN.md §0.3):
//   색·형태·밀도·질감·타이포 다섯 축 위에 **머리글의 「형태」** 를 여섯 번째 축으로 세운다.
//   프리셋 4종(rule·quiet·band·pill)은 머리글을 채울지(band) 규칙선으로 그을지(rule) 지울지(quiet)
//   알약으로 띄울지(pill) 를 고른다. default 는 규칙을 **한 줄도 쓰지 않는다**(byte-identical).
//
//   ★ 이 축이 다른 축과 결정적으로 다른 점 — **색을 소유하지 않는다.**
//   시안(`proto/header-new.css`)이 쓰는 `--og-header-*` 이름은 실제로 **세 축의 것이 섞여 있다**:
//     · 색 10개(`--og-header-bg`·`-color`·`-hover-bg`·`-sort-color` …) → **theme 축 소유**
//     · 조판 3개(`--og-header-font-family`·`-font-weight`·`-letter-spacing`) → **typography 축 소유**
//       (`TYPOGRAPHY_TOKENS` 에 이미 등록돼 있다 — 접두사가 같다고 같은 축이 아니다)
//     · 형태 8개(폭·여백·불투명도) → **무주공산 = 이 축이 가져간다**
//   그래서 `HEADER_TOKENS` 는 **형태 8개뿐**이다. 색·조판을 이름공간에 넣으면 사용자 프리셋이
//   `--og-header-bg: red` 를 통과시키고, 그 순간 **형태 축이 색을 칠한다** — 이 코드베이스가 지키는
//   유일한 불변식(축 오염 금지, 불변식 1)의 파괴다. 색은 CSS 가 테마 토큰에서 `var()` 로 **유도**한다
//   (그래서 새 hex 가 한 개도 안 들어온다 = 「기존 hex 불변」이 구조적으로 보장된다).
//
//   ⚠ 정직 고지: `--og-header-` 접두사가 **세 축에 걸친다**. `assertNamespace` 가 접두사가 아니라
//   **정확 집합 조회**라 기계는 깨지지 않지만, "접두사 = 축" 이라는 독법은 이 축에서 성립하지 않는다.
//   접두사를 `--og-hdr-*` 로 새로 파는 대안이 있었으나, 시안 CSS 357행이 전부 `--og-header-*` 로
//   실렌더 검증됐으므로 **검증된 이름을 지켰다**(이름을 바꾸면 검증된 값과 실물이 갈린다).
//
//   프리셋의 **본체는 CSS 다**(`src/styles/header.css`). 프리셋은 `[data-og-header="pill"]
//   .og-header-cell::before` 처럼 **DOM 계층별 셀렉터**를 요구하는데, 평평한 `Record<string,string>`
//   델타로는 표현 자체가 불가능하기 때문이다. 이 축 객체가 소유하는 것은 두 가지뿐이다:
//     ① 형태 8개 토큰의 **소유권과 검증**(사용자 확장의 등록 게이트)
//     ② 컨테이너 **속성 부착**(`data-og-header`) — CSS 를 켜는 스위치
//   **헤드리스·순수.** DOM 을 만지지 않는다(DOM 반영은 `src/header/` 플러그인 경계 소유).
//   arch:check 의 HEADLESS_DIRS(`src/core/appearance/`) 대상.
// ============================================================

import { TokenAxis, type TokenDelta, type AxisDefineResult } from './AppearanceAxis.js';
import { TypedRegistry, type RegisterOptions, type RegisterResult, type RegistryEntry } from '../extension/Registry.js';

/**
 * 헤더 축 이름공간(자기 소유 **형태** 토큰 8개 — 축 섞임 검증용).
 *
 * 색(`--og-header-bg`·`--og-header-color` …)과 타이포그래피(`--og-header-font-weight` …)는
 * **의도적으로 빠져 있다.** 각각 theme 축·typography 축 소유다. 접두사가 같다고 같은 축이 아니다.
 *
 * The header axis namespace — the 8 own **shape** tokens (used for the axis-pollution check).
 *
 * Color and typography `--og-header-*` tokens are deliberately absent: they belong to the theme
 * and typography axes respectively. A shared prefix does not mean a shared axis.
 *
 * ヘッダー軸の名前空間(自分が所有する**形状**トークン8個 — 軸の混在を検査するために使います)。
 *
 * 色(`--og-header-bg`・`--og-header-color` …)とタイポグラフィ(`--og-header-font-weight` …)は
 * **意図的に外してあります。** それぞれテーマ軸・タイポグラフィ軸の所有です。接頭辞が同じでも
 * 同じ軸ではありません。
 *
 * 表头轴的命名空间(自己所有的**形状**令牌8个 — 用于轴混用检查)。
 *
 * 颜色(`--og-header-bg`、`--og-header-color` …)和排版(`--og-header-font-weight` …)是**有意排除的**，
 * 它们分别归主题轴和排版轴所有。前缀相同并不等于同一个轴。
 */
export const HEADER_TOKENS: ReadonlySet<string> = new Set<string>([
  '--og-header-rule-width',
  '--og-header-sorted-rule-width',
  '--og-header-divider-width',
  '--og-header-pill-inset',
  '--og-header-pill-ring-width',
  '--og-header-hint-inset',
  '--og-header-hint-opacity',
  '--og-header-grip-opacity',
]);

/**
 * 컨테이너에 붙는 축 속성명.
 *
 * The container attribute name for this axis.
 *
 * コンテナに付く軸の属性名。
 *
 * 加在容器上的轴属性名。
 */
export const HEADER_ATTR = 'data-og-header';

/** 불투명도 토큰(0~1 클램프 대상). / Opacity tokens (clamped to 0..1). */
const OPACITY_TOKENS = ['--og-header-hint-opacity', '--og-header-grip-opacity'] as const;

/** 길이 토큰(음수 거부 대상). / Length tokens (negative values rejected). */
const LENGTH_TOKENS = [
  '--og-header-rule-width',
  '--og-header-sorted-rule-width',
  '--og-header-divider-width',
  '--og-header-pill-inset',
  '--og-header-pill-ring-width',
  '--og-header-hint-inset',
] as const;

/**
 * 이름공간 밖 토큰의 소유 축을 추정한다(오류 메시지 품질 전용).
 *
 * 판정 자체는 `HEADER_TOKENS` 정확 조회가 하고, 이 함수는 "그럼 누구 거냐" 를 알려줄 뿐이라
 * 오탐이 계약을 흔들지 않는다. 다른 축 모듈을 import 하지 않는 이유는 플러그인 엔트리
 * (`src/header/`)가 타이포/스킨/밀도/질감 모듈을 통째로 끌어오지 않게 하기 위함이다.
 *
 * Guess the owning axis of an out-of-namespace token — for error-message quality only.
 *
 * The verdict comes from the exact `HEADER_TOKENS` lookup; this only answers "then whose is it?",
 * so a mis-guess cannot weaken the contract. Other axis modules are deliberately not imported so
 * the plugin entry does not drag them into its bundle.
 */
function guessOwnerAxis(key: string): string {
  if (/^--og-header-(font-family|font-weight|letter-spacing)$/.test(key)) {
    return (
      '타이포그래피(data-og-typography) — 접두사가 --og-header- 라도 서체·웨이트·자간은 타이포그래피 축 소유입니다' +
      '(TYPOGRAPHY_TOKENS 에 등록돼 있습니다)'
    );
  }
  if (/^--og-header-.*(bg|color)$/.test(key)) {
    return (
      '색(data-og-theme) — 헤더 배경·글자색은 테마가 소유합니다. ' +
      '헤더 축은 색을 칠하지 않고 CSS 가 var() 로 테마 토큰에서 유도합니다(축 섞임 금지)'
    );
  }
  if (key === '--og-font-size' || key === '--og-line-height' || key.startsWith('--og-density-')) {
    return '밀도(data-og-density)';
  }
  if (key.startsWith('--og-texture-')) return '질감(data-og-texture)';
  if (/^--og-(radius|border|elevation|focus|cell-padding|divider|scrollbar|icon|transition)/.test(key)) {
    return '형태(data-og-skin)';
  }
  return '색(data-og-theme) 또는 미등록 토큰';
}

/**
 * assertHeaderOnly — 헤더 델타가 색/타이포그래피/밀도/질감 토큰을 담지 않는지 검사(축 대칭).
 *
 * `assertColorOnly`(ThemeMetaRegistry)·`assertFormOnly`(SkinRegistry)·
 * `assertTypographyOnly`(TypographyRegistry)의 네 번째 대칭항이다. 불변식 1(각 축은 자기
 * 이름공간만 낸다)을 헤더 방향으로도 기계강제한다.
 *
 * assertHeaderOnly — rejects color/typography/density/texture tokens in a header delta.
 *
 * The fourth symmetric counterpart to `assertColorOnly`, `assertFormOnly` and
 * `assertTypographyOnly`, enforcing invariant 1 in the header direction.
 *
 * assertHeaderOnly — ヘッダーのデルタが色/タイポグラフィ/密度/質感のトークンを含まないかを検査します
 * (軸の対称)。
 *
 * `assertColorOnly`(ThemeMetaRegistry)・`assertFormOnly`(SkinRegistry)・
 * `assertTypographyOnly`(TypographyRegistry)に続く4つめの対称項です。不変条件1(各軸は自分の
 * 名前空間だけを出す)をヘッダーの方向でも機械的に強制します。
 *
 * assertHeaderOnly — 检查表头增量是否含有颜色/排版/密度/质感的令牌(轴的对称)。
 *
 * 它是 `assertColorOnly`(ThemeMetaRegistry)、`assertFormOnly`(SkinRegistry)、
 * `assertTypographyOnly`(TypographyRegistry)之后的第四个对称项。把不变式1(每个轴只发出自己的
 * 命名空间)在表头方向上也机械强制。
 *
 * @param id - 헤더 프리셋 id
 *
 * Header preset id
 *
 * ヘッダープリセット id
 *
 * 表头预设 id
 * @param delta - 검사할 헤더 델타
 *
 * Header delta to validate
 *
 * 検査するヘッダーのデルタ
 *
 * 要检查的表头增量
 * @throws 이름공간 밖 토큰이 있으면 Error
 *
 * Throws if a token outside the namespace is present
 *
 * 名前空間の外のトークンがあれば Error
 *
 * 有命名空间之外的令牌时抛出 Error
 * @example
 * assertHeaderOnly('my-header', { '--og-header-bg': 'red' }); // throws — 색은 theme 축 소유
 */
export function assertHeaderOnly(id: string, delta: TokenDelta): void {
  for (const key of Object.keys(delta)) {
    if (HEADER_TOKENS.has(key)) continue;
    throw new Error(
      `[HeaderRegistry] 헤더 "${id}" 의 토큰 "${key}" 은 헤더 축 이름공간이 아닙니다. ` +
      `이 토큰은 ${guessOwnerAxis(key)} 소유입니다. ` +
      `헤더 형태 델타는 규칙선 폭·구분선·pill 여백·힌트 불투명도만 담을 수 있습니다` +
      `(축 섞임 금지, 불변식 1).`,
    );
  }
}

/**
 * 프리셋 1건의 등록 메타 — `TypedRegistry` 에 실리는 값.
 *
 * 델타 자체는 `TokenAxis` 가 갖는다. 여기 담기는 것은 **정책·진단에 쓰는 정보**뿐이라
 * 두 저장소가 같은 것을 두 벌 갖지 않는다.
 *
 * Registration metadata for one preset — the value stored in the `TypedRegistry`.
 *
 * The delta itself lives in `TokenAxis`; this carries only policy/diagnostic information, so the
 * two stores never hold duplicate copies of the same thing.
 *
 * プリセット1件の登録メタ情報 — `TypedRegistry` に載る値です。
 *
 * デルタそのものは `TokenAxis` が持ちます。ここに入るのは**ポリシーと診断に使う情報**だけなので、
 * 2つの保管先が同じものを二重に持つことはありません。
 *
 * 单个预设的注册元信息 — 存进 `TypedRegistry` 的值。
 *
 * 增量本身归 `TokenAxis` 所有。这里装的只有**策略与诊断用的信息**，因此两个存储不会重复持有同一
 * 份东西。
 */
export interface HeaderPresetMeta {
  /**
   * 이 프리셋이 CSS 규칙을 요구하는가. 내장 5종 중 `default` 만 false.
   *
   * Does this preset need CSS rules? Only `default` is false.
   *
   * このプリセットが CSS 規則を必要とするか。組み込み5種のうち `default` だけが false。
   *
   * 这个预设是否需要 CSS 规则。内置5种里只有 `default` 为 false。
   */
  readonly needsCss: boolean;
  /**
   * 사람이 읽는 한 줄 설명(피커 UI·인스펙터용).
   *
   * One-line human label (for picker UIs and inspectors).
   *
   * 人が読む一行の説明(ピッカー UI・インスペクター用)。
   *
   * 人读的一行说明(供预设选择 UI 与检查器使用)。
   */
  readonly label?: string;
}

/** 헤더 축 SPI 이름·버전(등록 값의 호환성 검사용). / Header-axis SPI name and version. */
const HEADER_SPI = { name: 'IHeaderPreset', version: '1' } as const;

/**
 * HeaderAxis — 헤더 제6축. **상속으로 SPI 를, 합성으로 등록 정책을** 얻는다.
 *
 * ```
 *   IAppearanceAxis  (5축 공통 SPI)
 *         ▲ implements
 *     TokenAxis      (기존 — 한 글자도 안 고쳤다)
 *         ▲ extends           ← ① 축 불변식은 상속으로. 형제 축과 리스코프 치환 가능
 *     HeaderAxis
 *         │ has-a             ← ② 등록 정책은 합성으로. is-a 가 아니다
 *         ▼
 *   TypedRegistry<HeaderPresetMeta>   (v1.4.0 공개 확장점)
 * ```
 *
 * **왜 `extends TokenAxis` 인가(상속을 쓰는 자리).** `assertNamespace` · `resolve` 의 never-throw
 * 폴백 · `default` → 빈 델타(byte-identical) · `attr` 생략 규칙 — 이 넷은 **여섯 축이 똑같아야 하는
 * 불변식**이다. 베끼면 여섯 벌이 갈라진다. 상속이 정확한 도구다.
 *
 * **왜 `TypedRegistry` 를 상속하지 않고 안에 두는가(합성을 쓰는 자리).** `TypedRegistry<V>` 는
 * **키→값 저장소**고 `HeaderAxis` 는 **축**이다. is-a 가 아니다. 그리고 `TokenAxis` 를 고쳐
 * 저장소를 갈아끼우면 **기존 5축의 코드 경로가 바뀐다** — 「기본값 불변」 금지선에 직접 닿는다.
 * 합성이면 **헤더 축만** 새 정책을 갖고 나머지 다섯은 한 바이트도 안 변한다(개방-폐쇄 원칙).
 *
 * **이 축이 형제 축보다 더 갖는 것** — 기존 축들은 생 `Map` 이라 아래가 전부 없다:
 * 내장 보호(`protect-builtin`) · 출처(`origin`) · 플러그인 수명(`disposePlugin`) ·
 * SPI 버전 검증 · `og:*` 예약 대역 보호 · never-throw 등록 결과.
 * 그래서 이 축에서는 사용자가 `define('rule', …)` 해도 **내장 프리셋이 조용히 사라지지 않는다.**
 *
 * HeaderAxis — the 6th (header) axis: **SPI conformance by inheritance, registration policy by
 * composition.** `TokenAxis` supplies the six-axis invariants; a composed `TypedRegistry` supplies
 * built-in protection, origin tracking, plugin lifecycle and SPI checks that the sibling axes lack.
 * Composition (not inheritance) is used because a registry is not a kind of axis, and because
 * swapping `TokenAxis`'s store would change the code path of the five existing axes.
 *
 * HeaderAxis — ヘッダー第6軸。**SPI は継承で、登録ポリシーはコンポジションで**得ます。
 *
 * **なぜ `extends TokenAxis` なのか(継承を使う場所)。** `assertNamespace`・`resolve` の never-throw
 * フォールバック・`default` → 空デルタ(byte-identical)・`attr` の省略規則 — この4つは**6つの軸が
 * 同じでなければならない不変条件**です。写し取れば6つに分かれてしまいます。ここは継承が正確な道具です。
 *
 * **なぜ `TypedRegistry` を継承せず中に持つのか(コンポジションを使う場所)。** `TypedRegistry<V>` は
 * **キー→値の保管庫**で、`HeaderAxis` は**軸**です。is-a ではありません。そして `TokenAxis` を直して
 * 保管庫を差し替えると、**既存5軸のコード経路が変わります** — 「既定値は変えない」という禁止線に直接
 * 触れます。コンポジションなら**ヘッダー軸だけ**が新しいポリシーを持ち、残りの5軸は1バイトも変わりません
 * (開放閉鎖の原則)。
 *
 * **この軸が兄弟軸より多く持つもの** — 既存の軸は素の `Map` なので、以下がすべてありません:
 * 組み込み保護(`protect-builtin`)・登録元(`origin`)・プラグインの寿命管理(`disposePlugin`)・
 * SPI バージョン検証・`og:*` 予約領域の保護・never-throw の登録結果。
 * そのためこの軸では、利用者が `define('rule', …)` しても**組み込みプリセットが黙って消えることは
 * ありません。**
 *
 * HeaderAxis — 表头第6轴。**用继承拿到 SPI，用组合拿到注册策略。**
 *
 * **为什么 `extends TokenAxis`(用继承的地方)。** `assertNamespace`、`resolve` 的 never-throw 回退、
 * `default` → 空增量(byte-identical)、`attr` 的省略规则 — 这4条是**6个轴必须一致的不变式**。抄一遍
 * 就会分成6份。这里继承才是准确的工具。
 *
 * **为什么不继承 `TypedRegistry` 而是放在里面(用组合的地方)。** `TypedRegistry<V>` 是**键→值的存储**，
 * 而 `HeaderAxis` 是**轴**。不是 is-a。而且改 `TokenAxis` 去换掉存储，**现有5个轴的代码路径就会变** —
 * 直接碰到「默认值不变」这条禁止线。用组合的话，**只有表头轴**拿到新策略，其余5个轴一个字节也不变
 * (开闭原则)。
 *
 * **这个轴比兄弟轴多出来的东西** — 现有的轴是裸 `Map`，所以下面这些一个都没有:
 * 内置保护(`protect-builtin`)、注册来源(`origin`)、插件生命周期(`disposePlugin`)、SPI 版本校验、
 * `og:*` 保留区段的保护、never-throw 的注册结果。
 * 因此在这个轴上，即使用户调用 `define('rule', …)`，**内置预设也不会静默消失。**
 *
 * @example
 * headerRegistry.resolve('rule');    // { tokens:{'--og-header-rule-width':'2px',…}, attr:{name:'data-og-header',value:'rule'} }
 * headerRegistry.resolve('default'); // { tokens:{} } — 속성 미부착, byte-identical
 * headerRegistry.define('rule', {}); // kept — 내장 보호. registration.ok === false
 */
export class HeaderAxis extends TokenAxis {
  /**
   * 등록 정책·출처·수명을 소유하는 합성 레지스트리.
   *
   * 값(`HeaderPresetMeta`)은 정책 판정에 필요한 것만 담는다 — 토큰 델타는 `TokenAxis` 소유다.
   */
  private readonly _policy = new TypedRegistry<HeaderPresetMeta>({
    duplicatePolicy: 'protect-builtin',
    spi: HEADER_SPI,
  });

  constructor() {
    super({ id: 'header', attrName: HEADER_ATTR, namespace: HEADER_TOKENS });
  }

  /**
   * 등록 게이트에 축 섞임 검사를 선행시킨다(`assertTypographyOnly` 와 동형 배선).
   *
   * 登録ゲートの手前で軸の混在を検査します(`assertTypographyOnly` と同じ形の配線)。
   *
   * 在注册关卡之前先做轴混用检查(与 `assertTypographyOnly` 同形的接线)。
   */
  override registerBuiltin(id: string, delta: TokenDelta): void {
    assertHeaderOnly(id, delta);
    super.registerBuiltin(id, delta);
    this._policy.register(id, { needsCss: true }, { origin: 'builtin', spiVersion: HEADER_SPI.version });
  }

  /**
   * 내장 `default` 를 정책 레지스트리에만 올린다(델타는 등록하지 않는다).
   *
   * `resolve('default')` 는 `TokenAxis` 가 `_values` 를 보기 **전에** 빈 델타로 되돌리므로
   * 델타를 넣을 필요가 없고, 넣으면 `list()` 에 default 가 섞여 카탈로그가 흐려진다.
   * 그런데 **보호는 필요하다** — 사용자가 `define('default', …)` 로 축 해제 경로를 점유하면
   * "축을 껐는데 안 꺼진다" 가 된다. 그래서 정책 층에만 자리를 잡아 둔다.
   *
   * Reserves `default` in the policy registry only (no delta). `resolve('default')` short-circuits
   * to an empty delta before consulting `_values`, so no delta is needed — but the id still must be
   * protected, or a user could hijack the axis-off path.
   */
  protected _reserveDefault(): void {
    this._policy.register(
      'default',
      { needsCss: false, label: '축 해제 — 오늘의 헤더 그대로' },
      { origin: 'builtin', spiVersion: HEADER_SPI.version },
    );
  }

  /**
   * 사용자 정의 프리셋 등록.
   *
   * `TokenAxis.define` 과 달리 **조용히 안 덮는다.** 내장 5종(`default`·`rule`·`quiet`·`band`·`pill`)은
   * `origin:'builtin'` 으로 등록돼 있어 `{ override: true }` 없이는 교체되지 않고, 거부 사유가
   * `registration` 으로 돌아온다(never-throw).
   *
   * 축 섞임(색·타이포그래피 토큰)은 **상속받은 검사가 throw** 한다 — 정책보다 먼저 걸린다.
   * 순서가 중요하다: 오염된 델타는 애초에 등록 후보가 아니므로 정책 판정까지 갈 이유가 없다.
   *
   * Registers a user-defined preset. Unlike `TokenAxis.define`, built-ins are **not silently
   * replaced**: without `{ override: true }` the registration is rejected and the reason is
   * returned in `registration` (never throws). Axis pollution throws first, before policy runs.
   *
   * ユーザー定義プリセットの登録。
   *
   * `TokenAxis.define` と違い、**黙って上書きしません。** 組み込み5種
   * (`default`・`rule`・`quiet`・`band`・`pill`)は `origin:'builtin'` で登録されているため、
   * `{ override: true }` なしでは置き換わらず、拒否の理由が `registration` で返ります(never-throw)。
   *
   * 軸の混在(色・タイポグラフィのトークン)は**継承した検査が throw** します — ポリシーより先に
   * 引っかかります。順序が大事です: 混ざったデルタはそもそも登録の候補ではないので、ポリシーの判定まで
   * 進む理由がありません。
   *
   * 注册用户自定义预设。
   *
   * 与 `TokenAxis.define` 不同，**不会静默覆盖**。内置5种(`default`、`rule`、`quiet`、`band`、`pill`)
   * 以 `origin:'builtin'` 注册，不带 `{ override: true }` 就不会被替换，拒绝的理由通过 `registration`
   * 返回(never-throw)。
   *
   * 轴混用(颜色、排版的令牌)由**继承来的检查 throw** — 比策略更先拦下。顺序很重要: 混了的增量本来
   * 就不是注册的候选，没有理由走到策略判定。
   *
   * @param id - 프리셋 id
   *
   * Preset id
   *
   * プリセット id
   *
   * 预设 id
   * @param delta - 헤더 형태 토큰 델타
   *
   * Header shape-token delta
   *
   * ヘッダー形状トークンのデルタ
   *
   * 表头形状令牌增量
   * @param opts - 등록 정책 옵션(+ 프리셋 메타)
   *
   * Registration policy options (plus preset meta)
   *
   * 登録ポリシーのオプション(+ プリセットのメタ情報)
   *
   * 注册策略选项(+ 预设元信息)
   * @returns 클램프 반영 델타 + 경고 + 등록 판정
   *
   * Clamped delta, warnings, and the registration verdict
   *
   * クランプを反映したデルタ + 警告 + 登録の判定
   *
   * 钳制后的增量 + 警告 + 注册判定
   * @throws 색·타이포그래피 등 이름공간 밖 토큰이 있으면 Error
   *
   * Throws on out-of-namespace tokens
   *
   * 色・タイポグラフィなど名前空間の外のトークンがあれば Error
   *
   * 有颜色、排版等命名空间之外的令牌时抛出 Error
   */
  override define(
    id: string,
    delta: TokenDelta,
    opts: RegisterOptions & { meta?: HeaderPresetMeta } = {},
  ): AxisDefineResult & { registration: RegisterResult } {
    assertHeaderOnly(id, delta);

    const { meta, ...registerOpts } = opts;
    const registration = this._policy.register(
      id,
      meta ?? { needsCss: true },
      { spiVersion: HEADER_SPI.version, ...registerOpts },
    );

    // 정책이 거부하면 델타도 넣지 않는다 — 두 저장소가 갈리면 진단이 거짓말을 한다.
    // (거부는 throw 가 아니라 결과로 돌아온다. 호출자가 registration.ok 로 판단한다.)
    if (!registration.ok) {
      const kept = this.resolve(id).tokens;
      return {
        delta: kept,
        warnings: registration.warning ? [registration.warning] : [],
        registration,
      };
    }

    const result = super.define(id, delta);
    return { ...result, registration };
  }

  /**
   * 등록 기록(출처·플러그인·우선순위·SPI 버전). 진단·카탈로그용.
   *
   * Registration records (origin, plugin, priority, SPI version) — for diagnostics and catalogs.
   *
   * 登録の記録(登録元・プラグイン・優先度・SPI バージョン)。診断とカタログ用。
   *
   * 注册记录(注册来源、插件、优先级、SPI 版本)。供诊断与目录使用。
   */
  entries(): ReadonlyArray<RegistryEntry<HeaderPresetMeta>> {
    return this._policy.entries();
  }

  /**
   * 한 플러그인이 넣은 프리셋만 골라 해제한다 — **등록의 대칭**.
   *
   * 형제 축들에는 이 대칭이 없다(생 `Map` 이라 누가 넣었는지 모른다). 해제 건수를 반환한다.
   *
   * Disposes only the presets registered by one plugin — the symmetric counterpart to registration,
   * which the sibling axes lack. Returns the number of entries removed.
   *
   * あるプラグインが入れたプリセットだけを選んで解除します — **登録の対称**です。
   *
   * 兄弟軸にはこの対称がありません(素の `Map` なので、誰が入れたか分かりません)。解除した件数を返します。
   *
   * 只挑出某一个插件注册的预设并解除 — **与注册对称**。
   *
   * 兄弟轴没有这个对称(裸 `Map`，不知道是谁放进去的)。返回解除的数量。
   *
   * @param pluginId - 해제할 플러그인 id
   *
   * The plugin id to dispose
   *
   * 解除するプラグイン id
   *
   * 要解除的插件 id
   * @returns 해제된 건수
   *
   * Number of entries removed
   *
   * 解除した件数
   *
   * 解除的数量
   */
  disposePlugin(pluginId: string): number {
    const doomed = this._policy.entries().filter((e) => e.pluginId === pluginId).map((e) => e.key);
    const n = this._policy.disposePlugin(pluginId);
    // 정책과 델타 저장소를 함께 비운다 — 한쪽만 지우면 resolve 가 유령 값을 계속 낸다.
    for (const key of doomed) this._values.delete(key);
    return n;
  }

  /**
   * 형태 가드 2종.
   *
   * ① **불투명도 0~1 클램프 + 경고.** 힌트(정렬 화살표)·그립(리사이즈 손잡이)의 불투명도다.
   *    1 을 넘으면 CSS 가 조용히 1 로 자르고, 음수는 조용히 0 으로 잘라 **요소가 사라진다** —
   *    "안 보이는데 값은 들어갔다" 는 디버깅이 비싼 종류의 실패라 등록 시점에 잡는다.
   *    silent override 가 아니라 경고를 남긴다(TextureRegistry 의 opacity 클램프와 동형).
   * ② **음수 길이 거부(0 으로 클램프) + 경고.** 규칙선 폭·알약 여백에 음수가 들어가면
   *    브라우저가 선언 전체를 무효로 버려 **폴백조차 안 걸리고 프리셋의 그 줄만 죽는다.**
   *    0 은 "그리지 않음" 이라는 유효한 뜻이므로 0 으로 내린다.
   *
   * 단위 없는 숫자·`calc()`·`var()` 는 파싱 실패(NaN)로 통과시킨다 — CSS 가 최종 심판이고,
   * 등록 게이트가 표현식을 재구현하면 그게 더 큰 결함이다(정직한 한계).
   */
  protected override _guardrails(_id: string, delta: TokenDelta): { delta: TokenDelta; warnings: string[] } {
    const out: Record<string, string> = { ...delta };
    const warnings: string[] = [];

    // ① 불투명도 0~1.
    for (const key of OPACITY_TOKENS) {
      const raw = out[key];
      if (raw == null) continue;
      const a = parseFloat(String(raw));
      if (Number.isNaN(a)) continue;
      if (a > 1 || a < 0) {
        const clamped = a > 1 ? '1' : '0';
        out[key] = clamped;
        warnings.push(
          `${key} ${raw} → ${clamped} (불투명도는 0~1 입니다. ` +
          `범위를 벗어나면 CSS 가 조용히 잘라 요소가 사라진 것처럼 보입니다)`,
        );
      }
    }

    // ② 음수 길이 → 0.
    for (const key of LENGTH_TOKENS) {
      const raw = out[key];
      if (raw == null) continue;
      const n = parseFloat(String(raw));
      if (Number.isNaN(n) || n >= 0) continue;
      // 단위를 보존해 0 으로 내린다(0 은 단위 없이도 유효하지만 원 표기를 살려 읽기 쉽게 둔다).
      out[key] = '0';
      warnings.push(
        `${key} ${raw} → 0 (음수 길이는 브라우저가 선언 전체를 무효로 버려 그 줄만 조용히 죽습니다. ` +
        `"그리지 않음" 은 0 으로 표현하세요)`,
      );
    }

    return { delta: out, warnings };
  }
}

// ─── 내장 헤더 프리셋 4종 (값 SSOT = sessions/theme-typo-2026-08/proto/header-new.css) ───
// default 는 등록하지 않는다(빈 델타 = 오늘의 머리글 그대로, byte-identical).
// ⚠ 여기 담긴 것은 **형태 토큰뿐**이다. 각 프리셋의 본체(셀렉터 규칙·색 유도·::before 알약)는
//    `src/styles/header.css` 가 소유한다. 이 델타는 그 CSS 의 폴백값과 같은 값을 명시적으로
//    적어 둔 것이라, CSS 를 로드했든 안 했든 **같은 형태**로 수렴한다.

/**
 * rule — 규칙선. 헤더의 배경을 지우고 아래로 굵은 선 하나만 남긴다.
 *
 * rule — a single heavy rule under a background-less header.
 */
export const HEADER_RULE: TokenDelta = {
  '--og-header-rule-width': '2px',
  '--og-header-sorted-rule-width': '3px',
  '--og-header-hint-opacity': '0.45',
};

/**
 * quiet — 조용한 헤더. 선도 배경도 거의 없애고 글자만 남긴다.
 *
 * quiet — nearly no rule and no fill; the label alone carries the header.
 */
export const HEADER_QUIET: TokenDelta = {
  '--og-header-rule-width': '1px',
  '--og-header-divider-width': '0px',
  '--og-header-hint-opacity': '0.35',
  '--og-header-grip-opacity': '0.12',
};

/**
 * band — 띠. 헤더를 채워 표의 머리가 어디인지 멀리서도 보이게 한다(오늘의 기본형에 가장 가깝다).
 *
 * band — a filled band; the closest of the four to today's default header.
 */
export const HEADER_BAND: TokenDelta = {
  '--og-header-rule-width': '0px',
  '--og-header-divider-width': '1px',
  '--og-header-hint-opacity': '0.55',
};

/**
 * pill — 둥근 배지. 각 헤더 칸을 떠 있는 배지로 만든다.
 *
 * pill — each header cell floats as a rounded pill.
 */
export const HEADER_PILL: TokenDelta = {
  '--og-header-pill-inset': '3px',
  '--og-header-pill-ring-width': '1px',
  '--og-header-hint-opacity': '0.5',
  '--og-header-hint-inset': '6px',
};

/**
 * 내장 헤더 카탈로그(default 제외 — default 는 빈 델타).
 *
 * Built-in header catalog (default excluded — default is an empty delta).
 */
export const BUILTIN_HEADERS: ReadonlyArray<readonly [string, TokenDelta]> = [
  ['rule', HEADER_RULE],
  ['quiet', HEADER_QUIET],
  ['band', HEADER_BAND],
  ['pill', HEADER_PILL],
];

class BootstrappedHeaderAxis extends HeaderAxis {
  constructor() {
    super();
    this._reserveDefault();
    for (const [id, delta] of BUILTIN_HEADERS) this.registerBuiltin(id, delta);
  }
}

/**
 * 프로세스 전역 기본 헤더 축(내장 부트스트랩).
 *
 * 타이포 실물(`typographyRegistry`)과 같은 꼴이다 — 모듈 전역 싱글턴 + 자유함수 경계.
 * `dispose()` 있는 인스턴스 핸들을 쓰지 않는 이유는 `OpenGrid` 가 컨테이너 요소를 돌려주는
 * 공개 접근자를 제공하지 않기 때문이다(`_container` 는 private). 그 전제 위에 세운 설계는
 * 컨테이너를 못 얻어 조용히 반쪽만 작동한다 — 타이포 트랙이 실측으로 확인한 것이다.
 *
 * Process-global default header axis (built-ins bootstrapped) — same shape as `typographyRegistry`.
 *
 * プロセス全体の既定ヘッダー軸(組み込みをブートストラップ済み)。
 *
 * タイポグラフィの実物(`typographyRegistry`)と同じ形です — モジュール全体のシングルトン + 自由関数の境界。
 * `dispose()` を持つインスタンスハンドルを使わないのは、`OpenGrid` がコンテナ要素を返す公開アクセサーを
 * 提供しないからです(`_container` は private)。その前提の上に立てた設計は、コンテナを得られず黙って
 * 半分しか働きません — タイポグラフィのトラックが実測で確かめたことです。
 *
 * 进程全局的默认表头轴(内置已完成引导)。
 *
 * 与排版的实物(`typographyRegistry`)形状相同 — 模块全局单例 + 自由函数边界。不用带 `dispose()` 的
 * 实例句柄，是因为 `OpenGrid` 不提供返回容器元素的公开访问器(`_container` 是 private)。建立在那个
 * 前提上的设计拿不到容器，只会静默地工作一半 — 这是排版那条线用实测确认过的。
 */
export const headerRegistry = new BootstrappedHeaderAxis();

/**
 * `HeaderAxis` 의 별칭 — 파일명·형제 축 이름(`TypographyRegistry`·`TextureRegistry`)과 맞춘다.
 *
 * Alias of `HeaderAxis`, matching the file name and the sibling axes' naming.
 */
export { HeaderAxis as HeaderRegistry };
