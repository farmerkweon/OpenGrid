/**
 * OPEN_GRID 헤더 축 플러그인 — `open-grid/header`.
 *
 * 제6축(표의 머리 = 헤더의 형태)의 **런타임 진입점**이다. 코어(`open-grid`)와 별도 엔트리로 갈라 두었기
 * 때문에, 이 모듈을 import 하지 않는 사용자에게는 단 1바이트도 배송되지 않는다.
 *
 * 왜 별도 플러그인인가: `OpenGrid.ts` 에 정적 import 를 한 줄이라도 넣으면 축 코드 전체가 코어
 * 청크로 끌려 들어간다. 헤더 취향 기능 때문에 모든 사용자의 번들을 늘리지 않겠다는 결정이다
 * (타이포 축이 같은 이유로 같은 구조를 택했다 — `src/typography/index.ts`).
 *
 * **이 축은 CSS 없이는 거의 아무 일도 하지 않는다.** 프리셋의 본체(셀렉터 규칙·색 유도·`pill`
 * `::before`)는 `open-grid/header.css` 가 소유하고, 이 모듈은 그 CSS 를 켜는 **스위치**
 * (`data-og-header` 속성)와 형태 토큰 8개의 **소유권**만 갖는다. 그 사실을 숨기지 않고
 * `applyHeader()` 의 반환 경고로 알린다.
 *
 * OPEN_GRID header-axis plugin — `open-grid/header`.
 *
 * The runtime entry point for the 6th (header-form) axis. It is a separate build entry from the
 * core, so users who never import it are shipped exactly zero bytes of it.
 *
 * **This axis does almost nothing without its CSS.** The presets themselves live in
 * `open-grid/header.css`; this module owns only the switch that turns them on (the
 * `data-og-header` attribute) and the ownership of the 8 shape tokens.
 *
 * OPEN_GRID ヘッダー軸プラグイン — `open-grid/header`。
 *
 * 第6軸(表の頭 = ヘッダーの形状)の**ランタイムエントリーポイント**です。コア(`open-grid`)とは
 * 別のエントリーに分けてあるため、このモジュールを import しない利用者には1バイトも配信されません。
 *
 * なぜ別プラグインなのか: `OpenGrid.ts` に静的 import を一行でも入れると、軸のコード全体がコア
 * チャンクへ引き込まれます。ヘッダーの好みの機能のために、すべての利用者のバンドルを増やさないと
 * いう判断です(タイポグラフィ軸も同じ理由で同じ構造を選びました — `src/typography/index.ts`)。
 *
 * **この軸は CSS なしではほとんど何もしません。** プリセットの本体(セレクター規則・色の導出・
 * `pill` の `::before`)は `open-grid/header.css` が所有し、このモジュールが持つのは、その CSS を
 * 入れる**スイッチ**(`data-og-header` 属性)と形状トークン8個の**所有権**だけです。その事実は
 * 隠さず、`applyHeader()` が返す警告で知らせます。
 *
 * OPEN_GRID 表头轴插件 — `open-grid/header`。
 *
 * 第6轴(表的头部 = 表头形状)的**运行时入口点**。它与核心(`open-grid`)拆成了各自独立的构建入口，
 * 因此从不 import 这个模块的用户，一个字节也收不到。
 *
 * 为什么做成独立插件: 只要在 `OpenGrid.ts` 里写一行静态 import，整个轴的代码就会被拖进核心块。
 * 不能为了一个表头偏好的功能，让所有用户的包变大(排版轴出于同样理由选了同样的结构 —
 * `src/typography/index.ts`)。
 *
 * **这个轴没有 CSS 就几乎什么都不做。** 预设的主体(选择器规则、颜色推导、`pill` 的 `::before`)
 * 由 `open-grid/header.css` 所有，这个模块只拿到打开那些 CSS 的**开关**(`data-og-header` 属性)
 * 和8个形状令牌的**所有权**。这个事实不隐瞒，通过 `applyHeader()` 返回的警告告知。
 *
 * @packageDocumentation
 */

import {
  HEADER_ATTR,
  HEADER_TOKENS,
  headerRegistry,
  BUILTIN_HEADERS,
  type HeaderPresetMeta,
} from '../core/appearance/HeaderRegistry.js';
import type { TokenDelta, AxisDefineResult } from '../core/appearance/AppearanceAxis.js';
import type { RegisterOptions, RegisterResult } from '../core/extension/Registry.js';

export {
  HeaderAxis,
  HeaderRegistry,
  headerRegistry,
  HEADER_TOKENS,
  HEADER_ATTR,
  assertHeaderOnly,
} from '../core/appearance/HeaderRegistry.js';
export type { HeaderPresetMeta } from '../core/appearance/HeaderRegistry.js';
export type { TokenDelta, AxisDefineResult } from '../core/appearance/AppearanceAxis.js';
export type { RegisterOptions, RegisterResult, RegistryEntry } from '../core/extension/Registry.js';

/**
 * 내장 프리셋 4종 — id → 형태 토큰 델타.
 *
 * 값의 정본은 `src/styles/header.css` 의 프리셋 블록 폴백과 같다. 요소 경로에서는 CSS 가,
 * 그리드 경로에서는 이 델타가 같은 형태로 수렴한다.
 *
 * The four built-in presets — id → shape-token delta.
 *
 * These mirror the fallbacks in the preset blocks of `src/styles/header.css`.
 *
 * 組み込みプリセット4種 — id → 形状トークンのデルタ。
 *
 * 値の正本は `src/styles/header.css` のプリセットブロックのフォールバックと同じです。要素の経路では
 * CSS が、グリッドの経路ではこのデルタが、同じ形状に収束します。
 *
 * 内置预设4种 — id → 形状令牌增量。
 *
 * 值的正本与 `src/styles/header.css` 预设块的回退值相同。元素路径由 CSS，表格路径由这份增量，
 * 收敛到同一个形状。
 */
export const HEADER_PRESETS: Readonly<Record<string, TokenDelta>> = Object.freeze(
  Object.fromEntries(BUILTIN_HEADERS.map(([id, delta]) => [id, delta])),
);

/**
 * `applyHeader` 가 어느 경로로 적용했는지.
 *
 * Which path `applyHeader` took.
 *
 * - `'element'` — 컨테이너 요소에 `data-og-header` 를 붙였다. CSS 프리셋이 전부 작동한다(완전 적용).
 * - `'grid-vars'` — 그리드 공개 API 로 형태 토큰만 주입했다. 속성이 없어 **프리셋 규칙은 비활성**이다.
 *
 * `applyHeader` がどちらの経路で適用したか。
 *
 * - `'element'` — コンテナ要素に `data-og-header` を付けました。CSS プリセットがすべて働きます(完全適用)。
 * - `'grid-vars'` — グリッドの公開 API で形状トークンだけを注入しました。属性がないので**プリセット規則は無効**です。
 *
 * `applyHeader` 走了哪条路径。
 *
 * - `'element'` — 给容器元素加上了 `data-og-header`。CSS 预设全部生效(完全应用)。
 * - `'grid-vars'` — 通过表格公开 API 只注入了形状令牌。没有属性，因此**预设规则不生效**。
 */
export type HeaderApplyMode = 'element' | 'grid-vars';

/**
 * `applyHeader` 결과.
 *
 * Result of `applyHeader`.
 *
 * `applyHeader` の結果。
 *
 * `applyHeader` 的结果。
 */
export interface HeaderApplyResult {
  /**
   * 적용 경로.
   *
   * The path taken.
   *
   * 適用した経路。
   *
   * 采用的路径。
   */
  readonly mode: HeaderApplyMode;
  /**
   * 정직 고지(경로 제약·미등록 id 등). 빈 배열이면 완전 적용.
   *
   * Honest notices; empty means fully applied.
   *
   * 正直な注意書き(経路の制約・未登録 id など)。空配列なら完全適用。
   *
   * 如实告知(路径限制、未注册 id 等)。空数组表示完全应用。
   */
  readonly warnings: string[];
}

/**
 * 그리드 경로가 요구하는 최소 구조 — `OpenGrid` 가 구조적으로 만족한다.
 *
 * `OpenGrid` 를 타입으로 import 하지 않는 이유는 플러그인 번들이 코어 타입 그래프에 묶이지 않게
 * 하기 위함이다. `setThemeVar(k, v)` 는 컨테이너 인라인 CSS 변수를 세팅하는 공개 메서드다.
 *
 * The minimal shape the grid path needs — `OpenGrid` satisfies it structurally.
 *
 * グリッドの経路が要求する最小構造 — `OpenGrid` が構造的に満たします。
 *
 * `OpenGrid` を型として import しないのは、プラグインのバンドルがコアの型グラフに縛られないように
 * するためです。`setThemeVar(k, v)` はコンテナのインライン CSS 変数を設定する公開メソッドです。
 *
 * 表格路径所要求的最小结构 — `OpenGrid` 在结构上满足它。
 *
 * 不把 `OpenGrid` 作为类型 import，是为了让插件的包不被绑进核心的类型图。`setThemeVar(k, v)` 是
 * 在容器上设置内联 CSS 变量的公开方法。
 */
export interface HeaderGridTarget {
  setThemeVar(name: string, value: string): void;
}

/** DOM 요소 판정 — DOM 전역(HTMLElement)을 참조하지 않는 덕 타이핑(SSR/노드 안전). */
function isElementTarget(t: unknown): t is HTMLElement {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    typeof el === 'object' &&
    typeof el.setAttribute === 'function' &&
    typeof el.removeAttribute === 'function' &&
    el.style != null
  );
}

/**
 * 헤더 프리셋을 적용한다. 코어 무수정 경로.
 *
 * **두 경로가 있고, 능력 차이가 타이포 축보다 훨씬 크다. 정직하게 밝힌다.**
 *
 * 1. `target` 이 **HTMLElement**(그리드 컨테이너 = `.og-container`)이면 `data-og-header` 속성을
 *    붙인다. `header.css` 의 프리셋 블록이 전부 살아난다. **이 경로가 완전판이며
 *    `open-grid/header.css` 로드가 전제다.** 값을 인라인하지 않는 이유는 인라인 스타일이
 *    프리셋의 T1(토큰 재정의) 규칙보다 강해 프리셋을 덮어버리기 때문이다.
 * 2. `target` 이 **그리드 인스턴스**이면 공개 `setThemeVar()` 로 형태 토큰 8개만 인라인 주입한다.
 *    `OpenGrid` 는 컨테이너 요소를 반환하는 공개 접근자를 제공하지 않으므로(`_container` 는
 *    private) **속성을 붙일 방법이 없다.** 헤더 축은 프리셋의 거의 전부가 속성 조건부 셀렉터라
 *    **이 경로로는 사실상 아무 변화가 없다** — 타이포 축과 달리 "반쪽" 이 아니라 "거의 무동작" 이다.
 *    그 사실을 경고로 반환한다.
 *
 * 완전 적용이 필요하면 컨테이너 요소를 직접 넘겨라(`document.querySelector('.og-container')`).
 *
 * Apply a header preset. Requires no core modification.
 *
 * **There are two paths and the capability gap is much wider than the typography axis's.**
 *
 * 1. An **HTMLElement** target gets the `data-og-header` attribute and every CSS preset rule works.
 * 2. A **grid instance** target gets only the 8 shape tokens injected inline. Because virtually all
 *    preset rules are attribute-conditional, this path produces almost no visible change — this is
 *    returned as a warning rather than failing silently.
 *
 * ヘッダープリセットを適用します。コアの修正は要りません。
 *
 * **経路は2つあり、その能力差はタイポグラフィ軸よりずっと大きいです。正直に明かします。**
 *
 * 1. `target` が **HTMLElement**(グリッドのコンテナ = `.og-container`)なら `data-og-header` 属性を
 *    付けます。`header.css` のプリセットブロックがすべて生きます。**この経路が完全版であり、
 *    `open-grid/header.css` の読み込みが前提です。** 値をインライン化しないのは、インラインスタイルが
 *    プリセットの T1(トークン再定義)規則より強く、プリセットを上書きしてしまうからです。
 * 2. `target` が **グリッドインスタンス**なら、公開 API の `setThemeVar()` で形状トークン8個だけを
 *    インライン注入します。`OpenGrid` はコンテナ要素を返す公開アクセサーを提供しないため
 *    (`_container` は private)、**属性を付ける手段がありません。** ヘッダー軸はプリセットのほとんどが
 *    属性条件付きセレクターなので、**この経路では事実上まったく変化がありません** — タイポグラフィ軸と
 *    違って「半分」ではなく「ほぼ無動作」です。その事実を警告として返します。
 *
 * 完全に適用したいときは、コンテナ要素を直接渡してください(`document.querySelector('.og-container')`)。
 *
 * 应用表头预设。不需要修改核心。
 *
 * **有两条路径，能力差距比排版轴大得多。这里如实说明。**
 *
 * 1. `target` 是 **HTMLElement**(表格容器 = `.og-container`)时，加上 `data-og-header` 属性。
 *    `header.css` 的预设块全部生效。**这条路径才是完整版，前提是加载了 `open-grid/header.css`。**
 *    不把值内联的理由是: 内联样式比预设的 T1(令牌重定义)规则更强，会把预设覆盖掉。
 * 2. `target` 是**表格实例**时，通过公开的 `setThemeVar()` 只内联注入8个形状令牌。`OpenGrid` 不提供
 *    返回容器元素的公开访问器(`_container` 是 private)，因此**没有办法加上属性**。表头轴的预设几乎
 *    全是属性条件选择器，所以**这条路径实际上什么也不会变** — 与排版轴不同，不是「一半」而是
 *    「几乎不动」。这个事实会作为警告返回。
 *
 * 需要完全应用时，请直接传入容器元素(`document.querySelector('.og-container')`)。
 *
 * @param target - 그리드 컨테이너 요소 또는 그리드 인스턴스
 *
 * The grid container element, or a grid instance
 *
 * グリッドのコンテナ要素、またはグリッドインスタンス
 *
 * 表格容器元素，或表格实例
 * @param id - 프리셋 id(`'default'` 는 축 해제 = 오늘의 헤더)
 *
 * Preset id (`'default'` clears the axis)
 *
 * プリセット id(`'default'` は軸の解除 = 今のヘッダーそのまま)
 *
 * 预设 id(`'default'` 为解除该轴 = 保持现在的表头)
 * @returns 적용 경로 + 정직 고지
 *
 * The path taken plus honest notices
 *
 * 適用した経路 + 正直な注意書き
 *
 * 采用的路径 + 如实告知
 * @throws target 이 요소도 그리드도 아니면 Error
 *
 * Throws when the target is neither an element nor a grid
 *
 * target が要素でもグリッドでもなければ Error
 *
 * target 既不是元素也不是表格时抛出 Error
 * @example
 * import { applyHeader } from 'open-grid/header';
 * import 'open-grid/header.css';
 *
 * applyHeader(document.querySelector('.og-container')!, 'rule'); // 완전 적용
 * applyHeader(grid, 'rule'); // 토큰만 — 경고 1건 반환(사실상 무동작)
 */
export function applyHeader(
  target: HTMLElement | HeaderGridTarget,
  id: string,
): HeaderApplyResult {
  const res = headerRegistry.resolve(id);
  const warnings: string[] = [];

  // 미등록 id 는 never-throw 폴백(density·texture·typography 계약과 동형)이라 조용히 default 가 된다.
  // 조용한 무동작은 "적용했는데 안 변함" 오진을 부르므로 정직하게 알린다.
  if (id !== 'default' && !headerRegistry.has(id)) {
    warnings.push(
      `헤더 프리셋 "${id}" 는 등록되어 있지 않습니다 — default(축 해제)로 처리했습니다. ` +
      `등록된 id: ${headerRegistry.list().join(', ')} (사용자 정의는 defineHeader()).`,
    );
  }

  if (isElementTarget(target)) {
    // 속성만 붙이고 토큰은 인라인하지 않는다 — 인라인 스타일은 어떤 셀렉터보다 강해서
    // 프리셋의 T1(토큰 재정의) 3단 규칙을 덮어버린다. 값은 header.css 가 낸다
    // (그래서 이 경로는 CSS 로드가 전제다).
    for (const k of HEADER_TOKENS) target.style.removeProperty(k);
    if (res.attr) target.setAttribute(res.attr.name, res.attr.value);
    else target.removeAttribute(HEADER_ATTR);
    return { mode: 'element', warnings };
  }

  const grid = target as HeaderGridTarget | null;
  if (!grid || typeof grid.setThemeVar !== 'function') {
    throw new Error(
      '[header] applyHeader(target, id): target 은 그리드 컨테이너 요소(HTMLElement) 또는 ' +
      'setThemeVar() 를 가진 그리드 인스턴스여야 합니다.',
    );
  }
  // 빈 문자열 세팅은 CSSOM 계약상 removeProperty 와 같다 — 이전 프리셋 잔재를 지운다.
  for (const k of HEADER_TOKENS) grid.setThemeVar(k, '');
  for (const [k, v] of Object.entries(res.tokens)) grid.setThemeVar(k, v);
  if (res.attr) {
    warnings.push(
      `그리드 인스턴스 경로는 형태 토큰만 주입합니다 — ${HEADER_ATTR} 속성은 붙지 않습니다. ` +
      `OpenGrid 가 컨테이너 요소를 돌려주는 공개 접근자를 제공하지 않기 때문입니다. ` +
      `헤더 프리셋은 거의 전부가 속성 조건부 셀렉터라 이 경로로는 화면이 사실상 바뀌지 않습니다. ` +
      `적용하려면 컨테이너 요소(.og-container)를 직접 넘기세요.`,
    );
  }
  return { mode: 'grid-vars', warnings };
}

/**
 * 사용자 정의 프리셋 등록.
 *
 * 색·타이포그래피·밀도·질감 토큰이 섞여 있으면 등록 게이트가 즉시 throw 한다(축 섞임 금지).
 * 특히 `--og-header-bg` 처럼 **접두사가 같아 헤더 것처럼 보이는 색 토큰**도 거부한다 —
 * 그것은 테마 축 소유다. 불투명도는 0~1 로, 음수 길이는 0 으로 클램프하고 경고한다.
 *
 * Register a user-defined preset.
 *
 * The registration gate throws on color/typography/density/texture tokens — including
 * `--og-header-*` color tokens, which merely share the prefix but belong to the theme axis.
 *
 * **내장 5종은 조용히 안 덮인다.** `{ override: true }` 없이 `'rule'` 을 다시 등록하면 거부되고
 * 사유가 `registration` 으로 돌아온다(throw 하지 않는다). 형제 축(밀도·질감·타이포)에는 이 보호가
 * 없어 내장값이 소리 없이 사라진다 — 헤더 축이 처음으로 갖는 안전장치다.
 *
 * Built-ins are protected: re-registering `'rule'` without `{ override: true }` is rejected and the
 * reason comes back in `registration` — it never throws. The sibling axes lack this protection.
 *
 * ユーザー定義プリセットの登録。
 *
 * 色・タイポグラフィ・密度・質感のトークンが混ざっていると、登録ゲートが即座に throw します
 * (軸の混在は禁止)。とくに `--og-header-bg` のように**接頭辞が同じでヘッダーのものに見える色トークン**も
 * 拒否します — それはテーマ軸の所有です。不透明度は 0~1 に、負の長さは 0 にクランプして警告します。
 *
 * **組み込み5種は黙って上書きされません。** `{ override: true }` なしで `'rule'` を再登録すると拒否され、
 * 理由が `registration` で返ります(throw はしません)。兄弟軸(密度・質感・タイポグラフィ)にはこの保護が
 * なく、組み込みの値が音もなく消えます — ヘッダー軸が初めて持つ安全装置です。
 *
 * 注册用户自定义预设。
 *
 * 混进颜色、排版、密度、质感的令牌时，注册关卡立即 throw(禁止轴混用)。尤其是像 `--og-header-bg`
 * 这种**前缀相同、看着像表头的颜色令牌**也会被拒绝 — 那归主题轴所有。不透明度钳制到 0~1，负长度
 * 钳制到 0，并给出警告。
 *
 * **内置5种不会被静默覆盖。** 不带 `{ override: true }` 重新注册 `'rule'` 会被拒绝，理由通过
 * `registration` 返回(不 throw)。兄弟轴(密度、质感、排版)没有这道保护，内置值会无声消失 — 这是
 * 表头轴第一次拥有的安全装置。
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
 * @param opts - 등록 정책 옵션(`override`·`pluginId`·`priority`) + 프리셋 메타
 *
 * Registration policy options plus preset metadata
 *
 * 登録ポリシーのオプション(`override`・`pluginId`・`priority`)+ プリセットのメタ情報
 *
 * 注册策略选项(`override`、`pluginId`、`priority`)+ 预设元信息
 * @returns 클램프 반영된 델타 + 경고 + 등록 판정
 *
 * The clamped delta, warnings, and the registration verdict
 *
 * クランプを反映したデルタ + 警告 + 登録の判定
 *
 * 钳制后的增量 + 警告 + 注册判定
 * @example
 * defineHeader('hairline', { '--og-header-rule-width': '1px', '--og-header-hint-opacity': '0.3' });
 *
 * // 내장 보호 — 덮으려면 명시해야 한다
 * defineHeader('rule', d).registration.ok;                    // false (kept)
 * defineHeader('rule', d, { override: true }).registration.ok; // true  (replaced)
 *
 * // 플러그인이 넣은 것만 골라 해제 — 등록의 대칭
 * defineHeader('mine', d, { pluginId: 'acme' });
 * headerRegistry.disposePlugin('acme'); // 1
 */
export function defineHeader(
  id: string,
  delta: TokenDelta,
  opts?: RegisterOptions & { meta?: HeaderPresetMeta },
): AxisDefineResult & { registration: RegisterResult } {
  return headerRegistry.define(id, delta, opts);
}

/**
 * 등록된 프리셋 id 목록(피커 UI·인스펙터용).
 *
 * Registered preset ids (for picker UIs and inspectors).
 *
 * 登録済みプリセット id の一覧(ピッカー UI・インスペクター用)。
 *
 * 已注册的预设 id 列表(供预设选择 UI 与检查器使用)。
 */
export function listHeader(): string[] {
  return headerRegistry.list();
}
