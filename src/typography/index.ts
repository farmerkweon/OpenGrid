/**
 * OPEN_GRID 타이포그래피 축 플러그인 — `open-grid/typography`.
 *
 * 제5축(타이포그래피)의 **런타임 진입점**이다. 코어(`open-grid`)와 별도 엔트리로 갈라 두었기
 * 때문에, 이 모듈을 import 하지 않는 사용자에게는 단 1바이트도 배송되지 않는다(SPEC §0 D-3).
 *
 * 왜 별도 플러그인인가: `OpenGrid.ts` 에 정적 import 를 한 줄이라도 넣으면 축 코드 전체가 코어
 * 청크로 끌려 들어간다. 서체 취향 기능 때문에 모든 사용자의 번들을 늘리지 않겠다는 결정이다.
 *
 * OPEN_GRID typography-axis plugin — `open-grid/typography`.
 *
 * The runtime entry point for the 5th (typography) axis. It is a separate build entry from the
 * core, so users who never import it are shipped exactly zero bytes of it (SPEC §0 D-3).
 *
 * Why a plugin: a single static import in `OpenGrid.ts` would drag the whole axis into the core
 * chunk. A font-preference feature must not grow everyone else's bundle.
 *
 * OPEN_GRID タイポグラフィ軸プラグイン — `open-grid/typography`。
 *
 * 第5軸(タイポグラフィ)の**ランタイムエントリーポイント**です。コア(`open-grid`)とは別のエントリーに
 * 分けてあるため、このモジュールを import しない利用者には1バイトも配信されません(SPEC §0 D-3)。
 *
 * なぜ別プラグインなのか: `OpenGrid.ts` に静的 import を一行でも入れると、軸のコード全体がコア
 * チャンクへ引き込まれます。書体の好みの機能のために、すべての利用者のバンドルを増やさないという
 * 判断です。
 *
 * OPEN_GRID 排版轴插件 — `open-grid/typography`。
 *
 * 第5轴(排版)的**运行时入口点**。它与核心(`open-grid`)拆成了各自独立的构建入口，因此从不 import
 * 这个模块的用户，一个字节也收不到(SPEC §0 D-3)。
 *
 * 为什么做成独立插件: 只要在 `OpenGrid.ts` 里写一行静态 import，整个轴的代码就会被拖进核心块。
 * 不能为了一个字体偏好的功能，让所有用户的包变大。
 *
 * @packageDocumentation
 */

import {
  TYPOGRAPHY_ATTR,
  TYPOGRAPHY_TOKENS,
  typographyRegistry,
  BUILTIN_TYPOGRAPHIES,
} from '../core/appearance/TypographyRegistry.js';
import type { TokenDelta } from '../core/appearance/AppearanceAxis.js';

export {
  TypographyRegistry,
  typographyRegistry,
  TYPOGRAPHY_TOKENS,
  TYPOGRAPHY_ATTR,
  assertTypographyOnly,
} from '../core/appearance/TypographyRegistry.js';
export type { TokenDelta } from '../core/appearance/AppearanceAxis.js';

/**
 * 내장 프리셋 7종 — id → 토큰 델타.
 *
 * 값의 정본은 `src/styles/typography.css` 의 프리셋 블록과 같다. 요소 경로에서는 CSS 가,
 * 그리드 경로에서는 이 델타가 같은 결과를 낸다(§'두 경로' 참조).
 *
 * The seven built-in presets — id → token delta.
 *
 * These values mirror the preset blocks in `src/styles/typography.css`: the element path is
 * driven by CSS, the grid path by this delta, and both land on the same tokens.
 *
 * 組み込みプリセット7種 — id → トークンのデルタ。
 *
 * 値の正本は `src/styles/typography.css` のプリセットブロックと同じです。要素の経路では CSS が、
 * グリッドの経路ではこのデルタが、同じ結果を出します(§「2つの経路」参照)。
 *
 * 内置预设7种 — id → 令牌增量。
 *
 * 值的正本与 `src/styles/typography.css` 的预设块相同。元素路径由 CSS 驱动，表格路径由这份增量
 * 驱动，两条路径落到同一个结果(参见§「两条路径」)。
 */
export const TYPOGRAPHY_PRESETS: Readonly<Record<string, TokenDelta>> = Object.freeze(
  Object.fromEntries(BUILTIN_TYPOGRAPHIES.map(([id, delta]) => [id, delta])),
);

/**
 * `applyTypography` 가 어느 경로로 적용했는지.
 *
 * Which path `applyTypography` took.
 *
 * - `'element'` — 컨테이너 요소에 `data-og-typography` 를 붙였다. CSS 프리셋이 전부 작동한다(완전 적용).
 * - `'grid-vars'` — 그리드 공개 API 로 CSS 변수만 주입했다. 속성이 없어 **속성 조건부 규칙은 비활성**이다.
 *
 * `applyTypography` がどちらの経路で適用したか。
 *
 * - `'element'` — コンテナ要素に `data-og-typography` を付けました。CSS プリセットがすべて働きます(完全適用)。
 * - `'grid-vars'` — グリッドの公開 API で CSS 変数だけを注入しました。属性がないので**属性条件付き規則は無効**です。
 *
 * `applyTypography` 走了哪条路径。
 *
 * - `'element'` — 给容器元素加上了 `data-og-typography`。CSS 预设全部生效(完全应用)。
 * - `'grid-vars'` — 通过表格公开 API 只注入了 CSS 变量。没有属性，因此**属性条件规则不生效**。
 */
export type TypographyApplyMode = 'element' | 'grid-vars';

/**
 * `applyTypography` 결과.
 *
 * Result of `applyTypography`.
 *
 * `applyTypography` の結果。
 *
 * `applyTypography` 的结果。
 */
export interface TypographyApplyResult {
  /**
   * 적용 경로.
   *
   * The path taken.
   *
   * 適用した経路。
   *
   * 采用的路径。
   */
  readonly mode: TypographyApplyMode;
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
 * `OpenGrid` is not imported as a type so the plugin bundle stays untangled from the core type
 * graph. `setThemeVar(k, v)` is the public method that sets an inline CSS variable on the container.
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
export interface TypographyGridTarget {
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
 * 프리셋을 적용한다. 코어 무수정 경로.
 *
 * **두 경로가 있고, 능력이 다르다. 정직하게 밝힌다.**
 *
 * 1. `target` 이 **HTMLElement**(그리드 컨테이너 = `.og-container`)이면 `data-og-typography`
 *    속성을 붙인다. `typography.css` 의 프리셋 블록·밀도 복합 셀렉터(광학 크기)·`:lang()` 한자
 *    분기까지 전부 살아난다. **이 경로가 완전판이며, `open-grid-typography.css` 로드가 전제다**
 *    (값을 인라인하지 않는 이유: 인라인은 복합 셀렉터 보정을 덮어버린다).
 * 2. `target` 이 **그리드 인스턴스**이면 공개 `setThemeVar()` 로 9개 토큰을 인라인 주입한다.
 *    `OpenGrid` 는 컨테이너 요소를 반환하는 공개 접근자를 제공하지 않으므로(2026-08 조사 결과:
 *    `_container` 는 private, 공개 표면에 getter 없음) **속성을 붙일 방법이 없다.** 따라서
 *    `[data-og-typography="dense-scan"][data-og-density="compact"]` 같은 속성 조건부 규칙과
 *    `cjk-doc` 의 `:lang()` 분기는 **작동하지 않는다.** 그 사실을 경고로 반환한다.
 *
 * 완전 적용이 필요하면 컨테이너 요소를 직접 넘겨라(`document.querySelector('#myGrid')`).
 *
 * Apply a preset. Requires no core modification.
 *
 * **There are two paths and they are not equally capable — stated plainly.**
 *
 * 1. An **HTMLElement** target (the grid container, `.og-container`) gets the
 *    `data-og-typography` attribute, so every CSS rule works, including density compound
 *    selectors (optical sizing) and the `:lang()` Han-unification split. **This is the full path.**
 * 2. A **grid instance** target gets the nine tokens injected inline via the public
 *    `setThemeVar()`. `OpenGrid` exposes no public accessor for its container element (verified
 *    2026-08: `_container` is private with no public getter), so the attribute cannot be set.
 *    Attribute-conditional rules therefore do not apply; this is returned as a warning.
 *
 * プリセットを適用します。コアの修正は要りません。
 *
 * **経路は2つあり、能力が違います。正直に明かします。**
 *
 * 1. `target` が **HTMLElement**(グリッドのコンテナ = `.og-container`)なら `data-og-typography`
 *    属性を付けます。`typography.css` のプリセットブロック・密度の複合セレクター(オプティカルサイズ)・
 *    `:lang()` の漢字の分岐まですべて生きます。**この経路が完全版であり、
 *    `open-grid-typography.css` の読み込みが前提です**(値をインライン化しない理由: インラインは
 *    複合セレクターの補正を上書きしてしまいます)。
 * 2. `target` が **グリッドインスタンス**なら、公開 API の `setThemeVar()` で9個のトークンを
 *    インライン注入します。`OpenGrid` はコンテナ要素を返す公開アクセサーを提供しないため
 *    (2026-08 の調査結果: `_container` は private で、公開表面に getter はありません)、
 *    **属性を付ける手段がありません。** したがって
 *    `[data-og-typography="dense-scan"][data-og-density="compact"]` のような属性条件付き規則と、
 *    `cjk-doc` の `:lang()` の分岐は**働きません。** その事実を警告として返します。
 *
 * 完全に適用したいときは、コンテナ要素を直接渡してください(`document.querySelector('#myGrid')`)。
 *
 * 应用预设。不需要修改核心。
 *
 * **有两条路径，能力并不相同。这里如实说明。**
 *
 * 1. `target` 是 **HTMLElement**(表格容器 = `.og-container`)时，加上 `data-og-typography` 属性。
 *    `typography.css` 的预设块、密度复合选择器(光学尺寸)、`:lang()` 的汉字分支全部生效。
 *    **这条路径才是完整版，前提是加载了 `open-grid-typography.css`**(不把值内联的理由: 内联会
 *    覆盖复合选择器的修正)。
 * 2. `target` 是**表格实例**时，通过公开的 `setThemeVar()` 内联注入9个令牌。`OpenGrid` 不提供返回
 *    容器元素的公开访问器(2026-08 核实: `_container` 是 private，公开表面上没有 getter)，因此
 *    **没有办法加上属性**。于是 `[data-og-typography="dense-scan"][data-og-density="compact"]` 这类
 *    属性条件规则，以及 `cjk-doc` 的 `:lang()` 分支**都不起作用**。这个事实会作为警告返回。
 *
 * 需要完全应用时，请直接传入容器元素(`document.querySelector('#myGrid')`)。
 *
 * @param target - 그리드 컨테이너 요소 또는 그리드 인스턴스
 *
 * The grid container element, or a grid instance
 *
 * グリッドのコンテナ要素、またはグリッドインスタンス
 *
 * 表格容器元素，或表格实例
 * @param id - 프리셋 id(`'default'` 는 축 해제)
 *
 * Preset id (`'default'` clears the axis)
 *
 * プリセット id(`'default'` は軸の解除)
 *
 * 预设 id(`'default'` 为解除该轴)
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
 * import { applyTypography } from 'open-grid/typography';
 * import 'open-grid/dist/open-grid-typography.css';
 *
 * applyTypography(document.querySelector('#grid .og-container')!, 'ledger'); // 완전 적용
 * applyTypography(grid, 'ledger'); // 변수만 — 경고 1건 반환
 */
export function applyTypography(
  target: HTMLElement | TypographyGridTarget,
  id: string,
): TypographyApplyResult {
  const res = typographyRegistry.resolve(id);
  const warnings: string[] = [];

  // 미등록 id 는 never-throw 폴백(density·texture 계약과 동형)이라 조용히 default 가 된다.
  // 조용한 무동작은 "적용했는데 안 변함" 오진을 부르므로 정직하게 알린다.
  if (id !== 'default' && !typographyRegistry.has(id)) {
    warnings.push(
      `타이포 프리셋 "${id}" 는 등록되어 있지 않습니다 — default(축 해제)로 처리했습니다. ` +
      `등록된 id: ${typographyRegistry.list().join(', ')} (사용자 정의는 defineTypography()).`,
    );
  }

  if (isElementTarget(target)) {
    // 속성만 붙이고 토큰은 인라인하지 않는다 — 인라인 스타일은 어떤 셀렉터보다 강해서
    // `[data-og-typography="dense-scan"][data-og-density="compact"]` 같은 광학 크기 보정을
    // 덮어버린다. 값은 typography.css 가 낸다(그래서 이 경로는 CSS 로드가 전제다).
    for (const k of TYPOGRAPHY_TOKENS) target.style.removeProperty(k);
    if (res.attr) target.setAttribute(res.attr.name, res.attr.value);
    else target.removeAttribute(TYPOGRAPHY_ATTR);
    return { mode: 'element', warnings };
  }

  const grid = target as TypographyGridTarget | null;
  if (!grid || typeof grid.setThemeVar !== 'function') {
    throw new Error(
      '[typography] applyTypography(target, id): target 은 그리드 컨테이너 요소(HTMLElement) 또는 ' +
      'setThemeVar() 를 가진 그리드 인스턴스여야 합니다.',
    );
  }
  // 빈 문자열 세팅은 CSSOM 계약상 removeProperty 와 같다 — 이전 프리셋 잔재를 지운다.
  for (const k of TYPOGRAPHY_TOKENS) grid.setThemeVar(k, '');
  for (const [k, v] of Object.entries(res.tokens)) grid.setThemeVar(k, v);
  if (res.attr) {
    warnings.push(
      `그리드 인스턴스 경로는 CSS 변수만 주입합니다 — ${TYPOGRAPHY_ATTR} 속성은 붙지 않습니다. ` +
      `OpenGrid 가 컨테이너 요소를 돌려주는 공개 접근자를 제공하지 않기 때문입니다. ` +
      `그래서 밀도 복합 셀렉터(광학 크기)와 cjk-doc 의 :lang() 한자 분기는 적용되지 않습니다. ` +
      `완전 적용하려면 컨테이너 요소(.og-container)를 직접 넘기세요.`,
    );
  }
  return { mode: 'grid-vars', warnings };
}

/**
 * 사용자 정의 프리셋 등록.
 *
 * 색·형태·밀도·질감 토큰이 섞여 있으면 등록 게이트가 즉시 throw 한다(축 섞임 금지). 웹폰트
 * 선언(`url(`/`@font-face`)도 throw. 음수 자간 × CJK 스택은 `normal` 로 클램프하고 경고한다.
 *
 * Register a user-defined preset.
 *
 * The registration gate throws immediately on color/form/density/texture tokens (axis pollution)
 * and on web-font declarations. A negative tracking value on a CJK stack is clamped to `normal`
 * with a warning.
 *
 * ユーザー定義プリセットの登録。
 *
 * 色・形状・密度・質感のトークンが混ざっていると、登録ゲートが即座に throw します(軸の混在は禁止)。
 * ウェブフォント宣言(`url(`/`@font-face`)も throw します。負の字間 × CJK スタックは `normal` に
 * クランプして警告します。
 *
 * 注册用户自定义预设。
 *
 * 混进颜色、形状、密度、质感的令牌时，注册关卡立即 throw(禁止轴混用)。网页字体声明
 * (`url(`/`@font-face`)同样 throw。负字距 × CJK 字体栈会被钳制为 `normal` 并给出警告。
 *
 * @param id - 프리셋 id
 *
 * Preset id
 *
 * プリセット id
 *
 * 预设 id
 * @param delta - 타이포 토큰 델타
 *
 * Typography token delta
 *
 * タイポグラフィトークンのデルタ
 *
 * 排版令牌增量
 * @returns 클램프 반영된 델타 + 경고
 *
 * The clamped delta plus warnings
 *
 * クランプを反映したデルタ + 警告
 *
 * 钳制后的增量 + 警告
 * @example
 * defineTypography('brand', { '--og-font-family': '"My Sans", sans-serif', '--og-font-weight': '450' });
 */
export function defineTypography(id: string, delta: TokenDelta): { delta: TokenDelta; warnings: string[] } {
  return typographyRegistry.define(id, delta);
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
export function listTypography(): string[] {
  return typographyRegistry.list();
}
