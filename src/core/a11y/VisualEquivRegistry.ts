// ============================================================
// 그림 셀을 말로 바꾸는 등록소 / picture-to-text registry
// ------------------------------------------------------------
// 무엇을 하나: 스파크라인·데이터바·증감 화살표처럼 그림으로 그린 값을 낭독할 글로 바꾸는 방법을
//   종류별로 모아 둔다. 등록 안 된 종류를 읽으려 하면 빈 글을 돌려주고 경고로 알린다 — 그림 셀이
//   낭독에서 빠지는 것을 조용히 넘기지 않기 위해서다.
// 왜 이렇게: 등록 규칙(같은 이름 보호·출처·플러그인 단위 해제)은 코어의 `TypedRegistry` 를 그대로
//   쓰고, 여기서는 그 위에 이 용도의 이름(register/describe)만 얹는다(규칙을 두 벌 만들지 않는다).
// / What: collects, per kind, how to turn a drawn value (sparkline, data bar, arrow) into spoken text;
//   an unregistered kind returns empty text with a warning so gaps are not silent.
//   Why: registration rules come from the core `TypedRegistry`; this only adds purpose-named methods on top.
// ============================================================

import { TypedRegistry } from '../extension/Registry.js';
import type { RegisterOptions, RegisterResult } from '../extension/Registry.js';

/**
 * 그림(스파크라인·데이터바·증감 화살표 등) 한 종류를 말로 바꾸는 방법. `describe` 가 그림의 값을 받아 낭독할 글을 돌려준다.
 *
 * How to put one kind of picture (sparkline, data bar, up/down arrow, …) into words. `describe` takes the picture's values and returns the text to read.
 *
 * 絵(スパークライン・データバー・増減の矢印など)一種類を言葉に変える方法。`describe` が絵の値を受け取り、読み上げる文を返します。
 *
 * 把一种图形(迷你折线、数据条、增减箭头等)转换成文字的方法。`describe` 接收图形的值并返回要朗读的文字。
 */
export interface VisualEquivProvider<M = unknown> {
  /**
   * 그림 종류 이름(예: 'sparkline'·'delta').
   *
   * The picture kind (e.g. 'sparkline', 'delta').
   *
   * 絵の種類の名前(例: 'sparkline'・'delta')。
   *
   * 图形种类名称(例如 'sparkline'、'delta')。
   */
  readonly kind: string;
  /**
   * 그림의 값을 받아 낭독할 글을 돌려준다.
   *
   * Takes the picture's values and returns the text to read.
   *
   * 絵の値を受け取り、読み上げる文を返します。
   *
   * 接收图形的值并返回要朗读的文字。
   */
  describe(model: M): string;
}

/** 등록소 계약 이름·판(TypedRegistry 가 서로 다른 등록소를 구별하는 표식). / Contract name/version tag that TypedRegistry uses to tell registries apart. */
const VISUAL_EQUIV_SPI = { name: 'IVisualEquivProvider', version: '1' } as const;

/**
 * 그림을 말로 바꾸는 방법(`VisualEquivProvider`)을 종류별로 모아 둔다. 등록 안 된 종류를 읽으려 하면 빈 글을 돌려주고 경고로 알려 준다 — 그림 셀이 낭독에서 빠지는 것을 조용히 넘기지 않게.
 * 셀에 붙이려면 컬럼의 `ariaLabel` 에서 `describe` 를 부른다.
 *
 * Collects, per kind, the ways to put pictures into words (`VisualEquivProvider`). Reading a kind that is not registered returns empty text and raises a warning, so a picture cell missing from speech is not passed over silently.
 * To attach it to cells, call `describe` from the column's `ariaLabel`.
 *
 * 絵を言葉に変える方法(`VisualEquivProvider`)を種類ごとにまとめておきます。登録されていない種類を読もうとすると空の文を返し、警告で知らせます — 絵のセルが読み上げから抜けるのを黙って見過ごさないように。
 * セルに付けるには、列の `ariaLabel` から `describe` を呼びます。
 *
 * 按种类收集把图形转换成文字的方法(`VisualEquivProvider`)。试图朗读未注册的种类时返回空文字并发出警告 — 以免图形单元格从朗读中漏掉却无人察觉。
 * 要用到单元格上,请在列的 `ariaLabel` 中调用 `describe`。
 *
 * @example
 * const equiv = new VisualEquivRegistry(console.warn);
 * equiv.register({ kind: 'sparkline', describe: (s: number[]) => `최근 ${s.length}개월, 마지막 값 ${s[s.length - 1]}` });
 * columns: [{ field: 'trend', header: '추세', ariaLabel: (v) => equiv.describe('sparkline', v) }]
 */
export class VisualEquivRegistry {
  private readonly _reg: TypedRegistry<VisualEquivProvider>;
  private readonly _onWarn: ((msg: string) => void) | undefined;

  /**
   * 등록소를 만든다.
   *
   * Creates the registry.
   *
   * 登録所を作ります。
   *
   * 创建注册表。
   *
   * @param onWarn - 경고를 받을 함수(예: `console.warn`). 주지 않으면 경고를 버린다.
   *
   * Receives warnings (e.g. `console.warn`). Without it warnings are dropped.
   *
   * 警告を受け取る関数(例: `console.warn`)。渡さなければ警告は捨てます。
   *
   * 接收警告的函数(例如 `console.warn`)。不传则丢弃警告。
   */
  constructor(onWarn?: (msg: string) => void) {
    const cfg: { spi: typeof VISUAL_EQUIV_SPI; onWarn?: (msg: string) => void } = { spi: VISUAL_EQUIV_SPI };
    if (onWarn !== undefined) cfg.onWarn = onWarn;
    this._reg = new TypedRegistry<VisualEquivProvider>(cfg);
    this._onWarn = onWarn;
  }

  /**
   * 그림 한 종류를 말로 바꾸는 방법을 등록한다. 예외를 던지지 않고 결과로 알려 준다.
   *
   * Registers how to put one picture kind into words. It never throws; the outcome is in the result.
   *
   * 絵一種類を言葉に変える方法を登録します。例外は投げず、結果で知らせます。
   *
   * 注册把一种图形转换成文字的方法。不会抛出异常,结果通过返回值告知。
   *
   * @param provider - 등록할 방법
   *
   * The provider to register
   *
   * 登録する方法
   *
   * 要注册的方法
   *
   * @param opts - 등록 규칙(같은 종류가 있을 때 등)
   *
   * Registration rules (e.g. when the kind already exists)
   *
   * 登録の規則(同じ種類があるときなど)
   *
   * 注册规则(例如已存在同一种类时)
   *
   * @returns 등록 결과
   *
   * The registration result
   *
   * 登録の結果
   *
   * 注册结果
   */
  register(provider: VisualEquivProvider, opts?: RegisterOptions): RegisterResult {
    return this._reg.register(provider.kind, provider, opts);
  }

  /**
   * 그 종류가 등록돼 있는지.
   *
   * Whether the kind is registered.
   *
   * その種類が登録されているかどうか。
   *
   * 该种类是否已注册。
   *
   * @param kind - 그림 종류 이름
   *
   * Picture kind
   *
   * 絵の種類の名前
   *
   * 图形种类名称
   */
  has(kind: string): boolean { return this._reg.has(kind); }

  /**
   * 그 종류의 방법을 돌려준다(없으면 `undefined`).
   *
   * Returns the provider for the kind (`undefined` if none).
   *
   * その種類の方法を返します(なければ `undefined`)。
   *
   * 返回该种类的方法(没有则为 `undefined`)。
   *
   * @param kind - 그림 종류 이름
   *
   * Picture kind
   *
   * 絵の種類の名前
   *
   * 图形种类名称
   */
  get(kind: string): VisualEquivProvider | undefined { return this._reg.get(kind); }

  /**
   * 등록된 종류 이름들.
   *
   * Names of the registered kinds.
   *
   * 登録されている種類の名前。
   *
   * 已注册的种类名称。
   */
  list(): string[] { return this._reg.list(); }

  /**
   * 그림의 값을 낭독할 글로 바꾼다. 등록 안 된 종류면 빈 글을 돌려주고 `onWarn` 으로 알린다(예외는 던지지 않는다).
   *
   * Turns a picture's values into text to read. For an unregistered kind it returns empty text and reports through `onWarn` (it never throws).
   *
   * 絵の値を読み上げる文に変えます。登録されていない種類なら空の文を返し、`onWarn` で知らせます(例外は投げません)。
   *
   * 把图形的值转换成要朗读的文字。未注册的种类返回空文字并通过 `onWarn` 告知(不会抛出异常)。
   *
   * @param kind - 그림 종류 이름
   *
   * Picture kind
   *
   * 絵の種類の名前
   *
   * 图形种类名称
   *
   * @param model - 그림의 값
   *
   * The picture's values
   *
   * 絵の値
   *
   * 图形的值
   *
   * @returns 낭독할 글
   *
   * The text to read
   *
   * 読み上げる文
   *
   * 要朗读的文字
   */
  describe(kind: string, model: unknown): string {
    const p = this._reg.get(kind);
    if (!p) {
      // 조용히 넘기지 않는다 — 등록 안 된 그림은 낭독에서 빠진다는 뜻이다. / Not silent: an unregistered kind means a gap in speech.
      this._onWarn?.(`[VisualEquivRegistry] describe("${kind}"): no text-equivalent provider registered for this kind (returned an empty string).`);
      return '';
    }
    return p.describe(model);
  }

  /**
   * 한 플러그인이 등록한 것을 한꺼번에 뺀다.
   *
   * Removes everything one plugin registered.
   *
   * 一つのプラグインが登録したものをまとめて外します。
   *
   * 一次性移除某个插件注册的全部内容。
   *
   * @param pluginId - 플러그인 이름
   *
   * Plugin id
   *
   * プラグイン名
   *
   * 插件名
   *
   * @returns 뺀 수
   *
   * How many were removed
   *
   * 外した数
   *
   * 移除的数量
   */
  disposePlugin(pluginId: string): number { return this._reg.disposePlugin(pluginId); }

  /**
   * 등록소를 비우고 정리한다.
   *
   * Empties and cleans up the registry.
   *
   * 登録所を空にして後片付けします。
   *
   * 清空并清理注册表。
   */
  dispose(): void { this._reg.dispose(); }
}
