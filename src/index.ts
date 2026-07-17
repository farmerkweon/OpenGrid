/**
 * OPEN_GRID 공개 API 배럴(진입점).
 *
 * npm 패키지 `open-grid` 의 루트 export 표면. 여기서 export 되지 않은 심볼은 공개 계약이 아니다.
 *
 * OPEN_GRID public API barrel (entry point).
 *
 * Root export surface of the npm package `open-grid`. Anything not exported here is not a
 * public contract.
 *
 * OPEN_GRIDの公開APIバレル(エントリーポイント)。
 *
 * npmパッケージ `open-grid` のルートexport表面です。ここでexportされていないシンボルは公開契約ではありません。
 *
 * OPEN_GRID 公共 API 桶文件(入口点)。
 *
 * npm 包 `open-grid` 的根 export 表面。此处未 export 的符号均非公开契约。
 *
 * @packageDocumentation
 */
import './styles/base.css';
/**
 * 그리드 코어 클래스.
 *
 * The core grid class.
 *
 * グリッドのコアクラス。
 *
 * 表格核心类。
 */
export { OpenGrid } from './core/OpenGrid.js';
/**
 * 두 그리드 사이 행 이동 셔틀(화살표 버튼 UI).
 *
 * Row shuttle between two grids (arrow-button UI).
 *
 * 2つのグリッド間の行移動シャトル(矢印ボタンUI)。
 *
 * 两个表格之间的行移动穿梭框(箭头按钮 UI)。
 */
export { GridShuttle, createGridShuttle } from './core/GridShuttle.js';
/**
 * GridShuttle 생성 옵션.
 *
 * Construction options for GridShuttle.
 *
 * GridShuttle の生成オプション。
 *
 * GridShuttle 的构造选项。
 */
export type { GridShuttleOptions } from './core/GridShuttle.js';
/**
 * 조직도(트리) 차트 위젯.
 *
 * Organization (tree) chart widget.
 *
 * 組織図(ツリー)チャートウィジェット。
 *
 * 组织架构(树形)图表组件。
 */
export { OrgChart } from './core/OrgChart.js';
/**
 * XML ↔ 행 데이터 변환기(SAP 계열 응답 포함).
 *
 * XML ↔ row-data converter (incl. SAP-style payloads).
 *
 * XML ↔ 行データ変換器(SAP系レスポンスを含む)。
 *
 * XML ↔ 行数据转换器(含 SAP 系响应)。
 */
export { XmlConverter } from './core/XmlConverter.js';
// item3(R12): 외관 스킨(FORM 축) + 아이콘 공개 API
// / item3(R12): appearance skin (FORM axis) + icon public API
/**
 * 시맨틱 아이콘 role 레지스트리·렌더 헬퍼.
 *
 * Semantic icon role registry & render helpers.
 *
 * セマンティックアイコンロールレジストリ・レンダーヘルパー。
 *
 * 语义图标角色注册表与渲染辅助函数。
 */
export { IconRegistry, iconRegistry, renderIcon, DEFAULT_ICON_ROLES } from './core/IconRegistry.js';
/**
 * renderIcon 옵션(size/title/element 반환 여부).
 *
 * Options for renderIcon (size/title/element output).
 *
 * renderIcon のオプション(size/title/element の出力可否)。
 *
 * renderIcon 的选项(size/title/element 输出)。
 */
export type { IconRenderOptions } from './core/IconRegistry.js';
/**
 * 스킨(FORM 축) 정의 레지스트리.
 *
 * Skin (FORM-axis) definition registry.
 *
 * スキン(FORM軸)定義レジストリ。
 *
 * 皮肤(FORM 轴)定义注册表。
 */
export { SkinRegistry, skinRegistry } from './core/SkinRegistry.js';
/**
 * FORM 전용 스킨 토큰 델타(색 리터럴 금지).
 *
 * FORM-only skin token delta (color literals rejected).
 *
 * FORM専用スキントークンデルタ(色リテラル禁止)。
 *
 * FORM 专用皮肤令牌增量(拒绝颜色字面量)。
 */
export type { SkinTokenDelta } from './core/types.js';
// i18n: 다국어 로케일 메시지 카탈로그 + 레지스트리(IconRegistry 동형)
// / i18n: multilingual locale message catalog + registry (isomorphic to IconRegistry)
/**
 * 로케일 메시지 레지스트리·전역 싱글턴·편의 t().
 *
 * Locale message registry, global singleton & convenience t().
 *
 * ロケールメッセージレジストリ・グローバルシングルトン・便利な t()。
 *
 * 语言环境消息注册表、全局单例及便捷函数 t()。
 */
export { LocaleRegistry, localeRegistry, t } from './core/i18n/LocaleRegistry.js';
/**
 * 로케일 메시지 카탈로그·부분 오버라이드·dot-key·값·등록결과·메타 타입.
 *
 * Locale catalog, partial override, dot-key, value, register-result & meta types.
 *
 * ロケールメッセージカタログ・部分オーバーライド・dot-key・値・登録結果・メタ型。
 *
 * 语言环境消息目录、部分覆盖、dot-key、值、注册结果与元信息类型。
 */
export type {
  LocaleMessages, PartialLocaleMessages, LocaleMessageKey,
  MessageValue, LocaleRegisterResult, LocaleMeta,
} from './core/i18n/types.js';
/**
 * OrgChart 옵션·컬럼 정의.
 *
 * OrgChart options & column definition.
 *
 * OrgChart のオプション・カラム定義。
 *
 * OrgChart 的选项与列定义。
 */
export type { OrgChartOptions, OrgChartColumnDef } from './core/OrgChart.js';
/**
 * 트리 노드 아이콘 정의.
 *
 * Tree node icon definition.
 *
 * ツリーノードアイコン定義。
 *
 * 树节点图标定义。
 */
export type { TreeNodeIconDef } from './core/types.js';
/**
 * 캐스케이딩 필터 셀렉트 설정.
 *
 * Cascading filter-select configuration.
 *
 * カスケーディングフィルターセレクト設定。
 *
 * 级联筛选下拉框配置。
 */
export type { FilterSelectConfig, FilterSelectColumn } from './core/FilterSelect.js';
/**
 * 그리드 코어 공개 타입 모음(옵션·컬럼·이벤트·트리거·Phase 0 인프라).
 *
 * Core public types (options, columns, events, triggers, Phase 0 infrastructure).
 *
 * グリッドコアの公開型一覧(オプション・カラム・イベント・トリガー・Phase 0インフラ)。
 *
 * 表格核心公开类型集合(选项、列、事件、触发器、Phase 0 基础设施)。
 */
export type {
  GridOptions,
  ColumnDef,
  OpenGridInstance,
  CellEvent,
  CellKeyEvent,
  EditEvent,
  RowEvent,
  SortItem,
  FilterItem,
  ExportOptions,
  FooterDef,
  SummaryOptions,
  RendererDef,
  EditorDef,
  DataType,
  SelectionMode,
  SortDir,
  Position,
  // 트리거 시스템 / trigger system
  TriggerContext,
  TriggerHandler,
  TriggerEvent,
  // Phase 0 인프라(C0.3/C0.4) / Phase 0 infrastructure (C0.3/C0.4)
  CellRange,
  FlatRowRef,
} from './core/types.js';
/**
 * XmlConverter 파싱/직렬화 옵션·결과.
 *
 * XmlConverter parse/stringify options & results.
 *
 * XmlConverter のパース/直列化オプション・結果。
 *
 * XmlConverter 的解析/序列化选项与结果。
 */
export type {
  XmlParseOptions,
  XmlStringifyOptions,
  SapParseResult,
} from './core/XmlConverter.js';
// F4: 그리드 데이터 통합 차트(11_design_F4_v2.md §6)
// / F4: grid-data integrated chart (11_design_F4_v2.md §6)
/**
 * F4 통합 차트 공개 타입.
 *
 * Public types of the F4 integrated chart.
 *
 * F4統合チャートの公開型。
 *
 * F4 集成图表的公开类型。
 */
export type {
  ChartType,
  ChartSource,
  ChartSeriesSpec,
  ChartSeries,
  ChartDataModel,
  ChartConfig,
  ChartInstance,
  ChartGlobalOptions,
  ChartPoint,
  ChartAdapter,
  ChartRenderSpec,
  ChartTheme,
  A11yTableModel,
} from './core/chart/types.js';
// 확장 레지스트리: 커스텀 등록소를 만들 때 쓰는 등록 정책 엔진
// / Extension registry: the registration-policy engine for building custom registries
/**
 * 이름표를 붙여 무언가를 등록해 두고 나중에 꺼내 쓰는 등록소입니다.
 * 셀 렌더러나 포맷터처럼 사용자가 직접 만든 것을 모아둘 때 씁니다.
 *
 * 그냥 `Map` 을 써도 되지만, 그러면 방금 등록이 새로 들어간 것인지 남의 것을
 * 덮어쓴 것인지 알 수 없습니다. 이 등록소는 매 등록마다 어떻게 처리됐는지를
 * 알려줍니다 — 새로 넣었으면 `added`, 덮어썼으면 `replaced`, 기존 것을 지켰으면
 * `kept`, 거절했으면 `rejected` 이고, 지키거나 거절한 경우엔 그 이유도 함께 옵니다.
 *
 * `og:` 나 `og-` 로 시작하는 이름은 그리드가 쓰려고 남겨둔 자리라 등록이 거절됩니다.
 * 내장 항목을 남이 덮어쓰지 못하게 막고 싶으면 `duplicatePolicy: 'protect-builtin'`
 * 을 주면 됩니다.
 *
 * A registry that stores values under a name so you can look them up later —
 * useful for collecting your own cell renderers or formatters.
 *
 * Unlike a plain `Map`, it tells you what each registration actually did:
 * `added`, `replaced`, `kept`, or `rejected` (the latter two come with a reason).
 * Names starting with `og:` or `og-` are reserved by the grid and get rejected,
 * and `duplicatePolicy: 'protect-builtin'` keeps built-in entries from being overwritten.
 *
 * 名前を付けて何かを登録しておき、後から取り出して使うレジストリです。
 * セルレンダラーやフォーマッターのように自分で作ったものをまとめておくときに使います。
 *
 * ただの `Map` を使うこともできますが、それでは今の登録が新規なのか他人のものを
 * 上書きしたのか分かりません。このレジストリは登録のたびにどう処理されたかを
 * 教えてくれます — 新規なら `added`、上書きなら `replaced`、既存を守ったなら
 * `kept`、拒否したなら `rejected` で、守った場合と拒否した場合にはその理由も付きます。
 *
 * `og:` や `og-` で始まる名前はグリッドが使うために予約されているため、登録は
 * 拒否されます。組み込み項目を他人に上書きされたくない場合は
 * `duplicatePolicy: 'protect-builtin'` を指定します。
 *
 * 按名称存储值、供之后查找取用的注册表，可用来收集自定义的单元格渲染器或格式化器。
 *
 * 普通 `Map` 也能用，但看不出这次注册是新增还是覆盖了别人的值。这个注册表会告知
 * 每次注册的处理结果：新增为 `added`、覆盖为 `replaced`、保留原值为 `kept`、拒绝为
 * `rejected`(后两者附带原因)。表格保留了以 `og:` 或 `og-` 开头的名称，这类注册
 * 会被拒绝；设置 `duplicatePolicy: 'protect-builtin'` 即可防止内置项被覆盖。
 *
 * @example
 * const reg = new TypedRegistry({ spi: { name: 'ICellRenderer', version: '1' } });
 * reg.register('rating', factory);   // → { action: 'added' }
 * reg.register('og:core', factory);  // → { action: 'rejected', reason: 'reserved-namespace' }
 * reg.get('rating');                 // returns the registered value
 */
export { TypedRegistry } from './core/extension/Registry.js';
/**
 * 등록소를 쓸 때 필요한 타입들 — 등록소가 지켜야 할 계약, 등록할 때 주는 옵션과
 * 돌아오는 결과, 등록된 항목의 정보, 중복됐을 때의 처리 방침, 생성 설정.
 *
 * Types for working with the registry — its contract, the options you pass in and the
 * result you get back, entry metadata, the duplicate-handling policy, and construction config.
 *
 * レジストリを使うときに必要な型です — レジストリが守るべき契約、登録時に渡すオプションと
 * 返ってくる結果、登録された項目の情報、重複時の処理方針、生成設定。
 *
 * 使用注册表所需的类型——注册表应遵守的契约、注册时传入的选项与返回的结果、
 * 已注册条目的信息、重复时的处理策略、构造配置。
 */
export type {
  IRegistry,
  RegisterOptions,
  RegisterResult,
  RegisterAction,
  RegisterReason,
  RegistryEntry,
  EntryOrigin,
  DuplicatePolicy,
  DeprecationInfo,
  TypedRegistryConfig,
} from './core/extension/Registry.js';
/**
 * 그리드가 자기 몫으로 남겨둔 이름 접두사(`og:` · `og-`)와, 어떤 이름이 거기 걸리는지
 * 미리 확인하는 함수입니다. 등록이 거절당하기 전에 먼저 물어볼 때 씁니다.
 *
 * The name prefixes the grid reserves for itself (`og:` / `og-`), plus a helper to check
 * a name against them before a registration gets rejected.
 *
 * グリッドが自分のために予約した名前プレフィックス(`og:` ・ `og-`)と、ある名前が
 * それに該当するかどうかを事前に確認する関数です。登録が拒否される前に問い合わせる
 * ときに使います。
 *
 * 表格为自身保留的名称前缀(`og:` / `og-`)，以及在注册被拒绝前预先检查某个名称
 * 是否命中这些前缀的辅助函数。
 */
export { RESERVED_PREFIXES, isReserved } from './core/extension/reserved.js';
