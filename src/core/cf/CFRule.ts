// ============================================================
// DD-05 §2.1·§2.2 조건부서식(CF) 선언 스키마 — Rule 애그리게이트(직렬화 SSOT)
// / DD-05 §2.1·§2.2 conditional-formatting declarative schema — Rule aggregate (serialization SSOT).
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-05_conditional-formatting.md
// REQ: T5-001 · T5-808 · T5-042 · T5-007 · T5-010 · T5-012 · T5-013 · T5-019
// ------------------------------------------------------------
// CFRule 은 함수를 담지 않는 순수 데이터 값객체다(직렬화 SSOT). 콜백 커스텀은 when.type:'custom'
// + 레지스트리 등록 술어 id 참조로 표현한다(코드가 아니라 참조를 직렬화). style 은 hex 직접보다
// named style 참조 우선(색조정자 단일관리). 헤드리스·DOM 미참조.
// ============================================================

/**
 * 규칙이 걸리는 조건. `type` 으로 종류를 고른다: 값 비교(compare)·글자 포함(textContains)·날짜(dateOccurring)·상위 N(topN·topNpct)·평균 위아래(aboveAvg)·표준편차 띠(stdBand)·중복(duplicate)·등록한 술어(custom).
 *
 * The condition that fires a rule. Pick the kind with `type`: value comparison (compare), text contains (textContains), date (dateOccurring), top N (topN, topNpct), above/below average (aboveAvg), standard-deviation band (stdBand), duplicates (duplicate) or a registered predicate (custom).
 *
 * 規則が掛かる条件。`type` で種類を選びます: 値の比較(compare)・文字を含む(textContains)・日付(dateOccurring)・上位 N(topN・topNpct)・平均の上下(aboveAvg)・標準偏差の帯(stdBand)・重複(duplicate)・登録した述語(custom)。
 *
 * 触发规则的条件。用 `type` 选择种类:数值比较(compare)、包含文字(textContains)、日期(dateOccurring)、前 N 名(topN、topNpct)、高于/低于平均(aboveAvg)、标准差区间(stdBand)、重复(duplicate)、已注册的谓词(custom)。
 */
export type CFCondition =
  | { readonly type: 'compare'; readonly op: '>' | '>=' | '<' | '<=' | '=' | '!=' | 'between'; readonly a: number; readonly b?: number }
  | { readonly type: 'textContains'; readonly text: string; readonly ci?: boolean }
  | { readonly type: 'dateOccurring'; readonly rel: 'today' | 'yesterday' | 'tomorrow' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'next7d' | 'last7d' }
  | { readonly type: 'topN'; readonly n: number; readonly bottom?: boolean }
  | { readonly type: 'topNpct'; readonly pct: number; readonly bottom?: boolean }
  | { readonly type: 'aboveAvg'; readonly below?: boolean }
  | { readonly type: 'stdBand'; readonly k: 1 | 2 | 3; readonly outside?: boolean }
  | { readonly type: 'duplicate'; readonly unique?: boolean }
  | { readonly type: 'custom'; readonly predicateId: string; readonly params?: Readonly<Record<string, unknown>> };

/**
 * 조건에 맞는 칸을 어떻게 보여 줄지. `kind` 로 고른다: 막대(bar)·색 단계(scale)·아이콘(icon)·작은 추세선(sparkline).
 *
 * How matching cells are shown. Pick with `kind`: bar, color scale (scale), icon or a small trend line (sparkline).
 *
 * 条件に合うセルをどう見せるか。`kind` で選びます: バー(bar)・色の段階(scale)・アイコン(icon)・小さな推移線(sparkline)。
 *
 * 如何显示符合条件的单元格。用 `kind` 选择:条形(bar)、色阶(scale)、图标(icon)、小型趋势线(sparkline)。
 */
export type CFEncodeSpec =
  | { readonly kind: 'bar'; readonly axis?: 'zero' | 'min'; readonly negative?: 'bidirectional' | 'none'; readonly clamp?: boolean; readonly log?: boolean; readonly fill?: 'solid' | 'gradient'; readonly seed?: 'primary' | 'graphite' }
  | { readonly kind: 'scale'; readonly mode?: 'discrete' | 'continuous'; readonly bands?: number; readonly ramp?: string; readonly diverging?: boolean; readonly midpoint?: 'zero' | 'mean' | number; readonly seed?: 'primary' | 'graphite' }
  | { readonly kind: 'icon'; readonly setId: string; readonly steps?: 3 | 4 | 5; readonly reverse?: boolean; readonly iconOnly?: boolean }
  | { readonly kind: 'sparkline'; readonly chart?: 'bar' | 'line' | 'area'; readonly normalize?: 'row' | 'column' };

/**
 * 규칙을 걸 칸의 범위 — 컬럼 하나(필수)와, 필요하면 행 범위·행 상태.
 *
 * Which cells the rule applies to — one column (required) and optionally a row range or row state.
 *
 * 規則を掛けるセルの範囲 — 列 1 つ(必須)と、必要なら行の範囲・行の状態。
 *
 * 规则作用的单元格范围 — 一列(必需),需要时再加行范围或行状态。
 */
export interface CFScope {
  readonly columnId: string;
  /**
   * 행 범위 [startRow, endRow) — 끝은 포함하지 않는다. 없으면 컬럼 전체.
   *
   * Row range [startRow, endRow) — end excluded. Absent means the whole column.
   *
   * 行の範囲 [startRow, endRow) — 終わりは含みません。なければ列全体。
   *
   * 行范围 [startRow, endRow) — 不含末尾。没有则为整列。
   */
  readonly range?: { readonly startRow: number; readonly endRow: number };
  /**
   * 이 상태의 행에만 건다(추가·수정·삭제된 행).
   *
   * Apply only to rows in this state (added, edited or removed).
   *
   * この状態の行にだけ掛けます(追加・修正・削除された行)。
   *
   * 只作用于该状态的行(新增、修改、删除的行)。
   */
  readonly rowState?: 'added' | 'edited' | 'removed';
}

/**
 * 이름 붙여 등록한 스타일을 가리킨다(여러 규칙이 같은 색을 나눠 쓸 때).
 *
 * Refers to a style registered by name (when several rules share the same colors).
 *
 * 名前を付けて登録したスタイルを指します(複数の規則が同じ色を共有するとき)。
 *
 * 引用按名称注册的样式(多个规则共用同一套颜色时)。
 */
export interface CFStyleRef {
  readonly ref: string;
}

/**
 * 규칙 안에 바로 적는 스타일(글자색·배경·굵게·기울임·밑줄).
 *
 * A style written directly in the rule (text color, background, bold, italic, underline).
 *
 * 規則の中に直接書くスタイル(文字色・背景・太字・斜体・下線)。
 *
 * 直接写在规则里的样式(文字颜色、背景、粗体、斜体、下划线)。
 */
export interface CFInlineStyle {
  readonly color?: string;
  readonly background?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

/** style 슬롯이 참조형인지 판별(직렬화·해석 분기). / Discriminate a style ref from an inline style. */
export function isStyleRef(s: CFStyleRef | CFInlineStyle | undefined): s is CFStyleRef {
  return !!s && typeof (s as CFStyleRef).ref === 'string';
}

/**
 * 조건부 서식 규칙 하나. 함수를 담지 않는 데이터라 JSON 으로 저장했다가 그대로 되살릴 수 있다. `grid.setConditionalFormat([규칙…])` 에 넘긴다.
 *
 * One conditional-formatting rule. It holds no functions, so it can be saved as JSON and restored as is. Pass it to `grid.setConditionalFormat([rules…])`.
 *
 * 条件付き書式の規則 1 つ。関数を持たないデータなので JSON で保存してそのまま復元できます。`grid.setConditionalFormat([規則…])` に渡します。
 *
 * 一条条件格式规则。它不包含函数,可以保存为 JSON 后原样还原。传给 `grid.setConditionalFormat([规则…])`。
 *
 * @example
 * const rule: CFRule = {
 *   id: 'high-sales', when: { type: 'compare', op: '>', a: 100 }, encode: { kind: 'bar' },
 *   scope: { columnId: 'sales' }, priority: 1,
 * };
 * await grid.setConditionalFormat([rule]);
 */
export interface CFRule {
  /**
   * 규칙 이름(겹치지 않게). 우선순위가 같을 때 순서를 정하는 데도 쓴다.
   *
   * The rule's id (unique). Also breaks ties between equal priorities.
   *
   * 規則の名前(重ならないように)。優先度が同じときの順番決めにも使います。
   *
   * 规则名称(不重复)。优先级相同时也用它决定顺序。
   */
  readonly id: string;
  /**
   * 걸리는 조건.
   *
   * The condition.
   *
   * 掛かる条件。
   *
   * 触发条件。
   */
  readonly when: CFCondition;
  /**
   * 보여 주는 방식.
   *
   * How it is shown.
   *
   * 見せ方。
   *
   * 显示方式。
   */
  readonly encode: CFEncodeSpec;
  /**
   * 등록한 스타일 이름 또는 바로 적은 스타일.
   *
   * A registered style name or an inline style.
   *
   * 登録したスタイル名、または直接書いたスタイル。
   *
   * 已注册的样式名或直接写的样式。
   */
  readonly style?: CFStyleRef | CFInlineStyle;
  /**
   * 거는 범위.
   *
   * Where it applies.
   *
   * 掛ける範囲。
   *
   * 作用范围。
   */
  readonly scope: CFScope;
  /**
   * 우선순위. 작을수록 먼저 본다. 같으면 `id` 순.
   *
   * Priority; smaller is evaluated first. Ties go by `id`.
   *
   * 優先度。小さいほど先に見ます。同じなら `id` の順。
   *
   * 优先级。数值越小越先判断。相同则按 `id` 排序。
   */
  readonly priority: number;
  /**
   * `true` 면 이 규칙이 걸린 칸에는 뒤 규칙을 보지 않는다(엑셀의 「True 이면 중지」). 기본 `false`.
   *
   * When `true`, later rules are skipped for cells this rule matched (Excel's Stop If True). Default `false`.
   *
   * `true` ならこの規則が掛かったセルには後の規則を見ません(Excel の「条件を満たす場合は停止」)。既定 `false`。
   *
   * 为 `true` 时,本规则命中的单元格不再判断后面的规则(Excel 的「如果为真则停止」)。默认 `false`。
   */
  readonly stopIfTrue?: boolean;
  /**
   * 저장 형식 판 번호(옛 판을 읽을 때 쓴다).
   *
   * Saved-format version (used when reading older versions).
   *
   * 保存形式の版番号(古い版を読むときに使います)。
   *
   * 保存格式的版本号(读取旧版本时使用)。
   */
  readonly v?: number;
}

/** 현재 직렬화 스키마 버전. 로더가 미래(더 큰) 버전 규칙을 안전 skip 하는 기준. / Current schema version. */
export const CF_SCHEMA_VERSION = 1;

/**
 * 규칙 값객체 동일성(직렬화 SSOT 비교) — 얕은 구조 비교. 계보·통계는 파생물이라 제외.
 * / Rule value-object equality (serialization SSOT) — structural compare; derived data excluded.
 */
export function cfRuleEquals(a: CFRule, b: CFRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
