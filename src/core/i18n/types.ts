// ============================================================
// i18n 타입 — 로케일 메시지 카탈로그 계약 / i18n types — locale message catalog contract
// ------------------------------------------------------------
// 설계 근거(Why): I18N_DESIGN.md §3.4. 리소스는 2단 중첩 객체로 저장(섹션=소비 서브시스템),
//   조회는 dot-key 문자열(`t('filter.apply')`)로 통합한다(§2-D2). 리터럴 키 유니온
//   `LocaleMessageKey` 로 오타를 컴파일 에러화하고, 내장 ko/en 은 `satisfies LocaleMessages`
//   로 키 완전성을 강제한다(인덱스 시그니처 금지 — 누락 검출 보존).
// / Design: I18N_DESIGN.md §3.4. Resources are stored as a 2-level nested object (section =
//   consuming subsystem) and queried by a dot-key string (`t('filter.apply')`, §2-D2). The
//   literal-key union `LocaleMessageKey` turns typos into compile errors, and the built-in ko/en
//   catalogs use `satisfies LocaleMessages` to enforce key completeness (no index signature).
// ============================================================

/**
 * 보간 파라미터. 명명 파라미터만(위치 파라미터 금지 — 어순이 언어마다 다름).
 *
 * Interpolation params. Named only (positional forbidden — word order differs per language).
 *
 * 補間パラメーター。名前付きパラメーターのみ（位置パラメーターは禁止 — 語順が言語ごとに異なるため）。
 *
 * 插值参数。仅限命名参数（禁止位置参数 — 语序因语言而异）。
 */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * 메시지 값: 평문 문자열('{name}' 보간) 또는 함수(복수형·조사 등 "문법이 데이터인" 케이스의 탈출구).
 * 왜 함수까지 허용하나: "사과 1개/사과 2개"처럼 복수형 규칙이 언어마다 다른데, ICU/CLDR 같은
 * 범용 복수형 엔진을 넣으면 zero-dependency 원칙이 깨진다. 그래서 그 규칙 자체를 로케일 파일
 * 안의 함수로 옮겨, 각 언어가 자기 문법을 직접 결정하게 한다.
 *
 * A message value: a plain string ('{name}' interpolation) or a function (escape hatch for
 * plurals/particles where "grammar is data"). Why allow a function at all: plural rules differ
 * per language, and pulling in a general ICU/CLDR plural engine would break the
 * zero-dependency principle — so the rule itself moves into a function inside the locale file,
 * letting each language own its own grammar.
 *
 * メッセージ値: プレーン文字列（'{name}' 補間）または関数（複数形・助詞など「文法がデータである」
 * ケースの逃げ道）。なぜ関数まで許すのか: 「りんご1個/りんご2個」のように複数形の規則は言語ごとに
 * 異なりますが、ICU/CLDR のような汎用の複数形エンジンを入れると zero-dependency の原則が崩れます。
 * そこでその規則自体をロケールファイル内の関数に移し、各言語が自分の文法を直接決められるようにします。
 *
 * 消息值: 纯字符串（'{name}' 插值）或函数（复数、助词等「语法即数据」场景的逃生口）。为什么连函数
 * 也允许: 像「苹果1个/苹果2个」这样，复数规则因语言而异，但引入 ICU/CLDR 这类通用复数引擎会破坏
 * zero-dependency 原则。于是把规则本身移入区域设置文件里的函数，让每种语言直接决定自己的语法。
 *
 * @example
 * const countBadge: MessageValue = (p) => `${p.n}건`; // Korean has no plural form
 */
export type MessageValue = string | ((params: MessageParams) => string);

/**
 * 로케일 메시지 카탈로그 전체 형태(2단 중첩, 최상위 섹션 = 소비하는 UI 표면 — 필터 패널, 찾기
 * 바 등). 새 언어를 추가하거나 커스텀 로케일을 만들 때 이 타입에 맞춰 객체를 작성하면 된다.
 * 파라미터를 받는 값만 `MessageValue`(함수형 복수 허용), 정적 라벨은 `string`. 내장 ko 가
 * 단일 진실 공급원(SSOT)이며 en 은 동일 키 집합을 갖는다 — 새 언어도 이 키 집합을 채우면(또는
 * 부분만 채우고 `register()` 의 `missingKeys` 로 진행률을 보면) 된다.
 *
 * Shape of a full locale message catalog (2-level nested; the top-level section is the
 * consuming UI surface — filter panel, find bar, etc.). When adding a new language or building a
 * custom locale, shape your object to satisfy this type. Only parameterized entries are
 * `MessageValue` (allowing plural functions); static labels are `string`. Built-in ko is the
 * single source of truth (SSOT), and en carries the same key set — fill the same keys for a new
 * language (or fill partially and track progress via `register()`'s `missingKeys`).
 *
 * ロケールメッセージカタログ全体の形（2段ネスト、最上位セクション = 消費する UI 表面 —
 * フィルターパネル、検索バーなど）。新しい言語を追加したりカスタムロケールを作ったりするときは、
 * この型に合わせてオブジェクトを書けば大丈夫です。パラメーターを受け取る値だけが `MessageValue`
 * （関数形の複数形を許可）で、静的なラベルは `string` です。組み込みの ko が単一の信頼できる情報源
 * （SSOT）であり、en は同じキー集合を持ちます — 新しい言語もこのキー集合を埋めれば（あるいは一部
 * だけ埋めて `register()` の `missingKeys` で進捗を見れば）よいのです。
 *
 * 完整区域设置消息目录的形态（2 层嵌套，最上层小节 = 消费它的 UI 界面 — 筛选面板、查找栏等）。
 * 添加新语言或制作自定义区域设置时，按此类型编写对象即可。只有接收参数的值才是 `MessageValue`
 * （允许函数形式的复数），静态标签是 `string`。内置的 ko 是单一可信来源（SSOT），en 拥有相同的
 * 键集 — 新语言也只要填满这个键集即可（或只填一部分，用 `register()` 的 `missingKeys` 查看进度）。
 */
export interface LocaleMessages {
  /**
   * 우클릭 컨텍스트 메뉴 라벨.
   *
   * Right-click context-menu labels.
   *
   * 右クリックのコンテキストメニューのラベル。
   *
   * 右键上下文菜单的标签。
   */
  contextMenu: {
    sortAsc: string; sortDesc: string; find: string;
    exportExcel: string; exportCsv: string; print: string;
  };
  /**
   * 필터 패널·필터 셀렉트 라벨.
   *
   * Filter panel & filter-select labels.
   *
   * フィルターパネル・フィルターセレクトのラベル。
   *
   * 筛选面板与筛选下拉的标签。
   */
  filter: {
    title: string;
    opContains: string; opEq: string; opNe: string; opStartsWith: string; opEndsWith: string;
    opGt: string; opLt: string; opGte: string; opLte: string;
    valuePlaceholder: string; clear: string; apply: string;
    legend: string; clearAria: string; all: string;
  };
  /**
   * 찾기 바 라벨/placeholder/aria/카운트 배지.
   *
   * Find-bar label/placeholder/aria/count badge.
   *
   * 検索バーのラベル/placeholder/aria/件数バッジ。
   *
   * 查找栏的标签/占位符/aria/计数徽标。
   */
  findBar: {
    label: string; placeholder: string; searchAria: string; closeAria: string;
    /**
     * 결과 개수 배지. 파라미터 {n}.
     *
     * Result count badge. Param {n}.
     *
     * 結果件数バッジ。パラメーター {n}。
     *
     * 结果数量徽标。参数 {n}。
     */
    countBadge: MessageValue;
  };
  /**
   * 페이지네이션 라벨/범위 배지/빈 상태.
   *
   * Pagination labels/range badge/empty state.
   *
   * ページネーションのラベル/範囲バッジ/空の状態。
   *
   * 分页的标签/范围徽标/空状态。
   */
  pagination: {
    rowsPerPage: string;
    /**
     * 현재 범위 배지. 파라미터 {from} {to} {total}.
     *
     * Current range badge. Params {from} {to} {total}.
     *
     * 現在の範囲バッジ。パラメーター {from} {to} {total}。
     *
     * 当前范围徽标。参数 {from} {to} {total}。
     */
    rangeBadge: MessageValue;
    empty: string;
  };
  /**
   * 행 드래그 고스트 라벨.
   *
   * Row-drag ghost label.
   *
   * 行ドラッグのゴーストラベル。
   *
   * 行拖拽虚影的标签。
   */
  drag: {
    /**
     * 드래그 중 행 개수. 파라미터 {count}.
     *
     * Rows being dragged. Param {count}.
     *
     * ドラッグ中の行数。パラメーター {count}。
     *
     * 拖拽中的行数。参数 {count}。
     */
    rowCount: MessageValue;
  };
  /**
   * 크로스그리드 매핑 다이얼로그(디자인타임 헬퍼).
   *
   * Cross-grid mapping dialog (design-time helper).
   *
   * クロスグリッドのマッピングダイアログ（デザインタイムのヘルパー）。
   *
   * 跨表格映射对话框（设计时的辅助工具）。
   */
  crossGrid: {
    overlayAria: string; title: string; desc1: string; desc2: string; emptyOption: string;
    scriptTitle: string; copy: string; copied: string; copyFailed: string;
    cancel: string; applyMove: string; scriptComment: string;
  };
  /**
   * 그리드↔그리드 셔틀 버튼 aria/tooltip.
   *
   * Grid-to-grid shuttle button aria/tooltip.
   *
   * グリッド↔グリッドのシャトルボタンの aria/tooltip。
   *
   * 表格↔表格穿梭按钮的 aria/tooltip。
   */
  shuttle: {
    toRight: string; toLeft: string; allRight: string; allLeft: string;
  };
  /**
   * 트리 노드 확장/접기 aria.
   *
   * Tree node expand/collapse aria.
   *
   * ツリーノードの展開/折りたたみの aria。
   *
   * 树节点展开/折叠的 aria。
   */
  tree: {
    collapse: string; expand: string;
  };
  /**
   * 마스터/디테일 글리프·announce.
   *
   * Master/detail glyph & announce.
   *
   * マスター/ディテールのグリフ・announce。
   *
   * 主/明细的字形与 announce。
   */
  detail: {
    glyphLabel: string; glyphTooltip: string; expandAria: string; collapseAria: string;
    expandedAnnounce: string; collapsedAnnounce: string; collapsedAllAnnounce: string;
    /**
     * 상세 패널 깊이 한계. 파라미터 {max}.
     *
     * Detail depth limit. Param {max}.
     *
     * 詳細パネルの深さ制限。パラメーター {max}。
     *
     * 明细面板的深度上限。参数 {max}。
     */
    depthLimitOpen: MessageValue;
    /**
     * 서브그리드 깊이 한계. 파라미터 {max}.
     *
     * Subgrid depth limit. Param {max}.
     *
     * サブグリッドの深さ制限。パラメーター {max}。
     *
     * 子表格的深度上限。参数 {max}。
     */
    depthLimitSubgrid: MessageValue;
  };
  /**
   * 워크시트 탭 UI.
   *
   * Worksheet tab UI.
   *
   * ワークシートのタブ UI。
   *
   * 工作表标签页 UI。
   */
  worksheet: {
    addAria: string;
  };
  /**
   * 인라인 에디터 aria/announce.
   *
   * Inline editor aria/announce.
   *
   * インラインエディターの aria/announce。
   *
   * 内联编辑器的 aria/announce。
   */
  editor: {
    datePick: string; select: string;
    /**
     * 편집 셀 위치 announce. 파라미터 {row} {col} {header} {value}.
     *
     * Edited-cell position announce. Params {row} {col} {header} {value}.
     *
     * 編集セルの位置の announce。パラメーター {row} {col} {header} {value}。
     *
     * 编辑单元格位置的 announce。参数 {row} {col} {header} {value}。
     */
    cellPositionAnnounce: MessageValue;
  };
  /**
   * 셀 렌더러(마스킹·라디오·바코드·수식 빈값).
   *
   * Cell renderer (masking/radio/barcode/formula empty).
   *
   * セルレンダラー（マスキング・ラジオ・バーコード・数式の空値）。
   *
   * 单元格渲染器（掩码·单选·条形码·公式空值）。
   */
  cell: {
    emptyValue: string; revealTooltip: string; revealAria: string; radioAria: string;
    /**
     * 바코드 셀 aria. 파라미터 {value}.
     *
     * Barcode cell aria. Param {value}.
     *
     * バーコードセルの aria。パラメーター {value}。
     *
     * 条形码单元格的 aria。参数 {value}。
     */
    barcodeAria: MessageValue;
  };
  /**
   * 행 선택 aria + 행 이동 announce.
   *
   * Row selection aria + row-move announce.
   *
   * 行選択の aria + 行移動の announce。
   *
   * 行选择的 aria + 行移动的 announce。
   */
  row: {
    selectAllAria: string;
    /**
     * 행 체크박스 aria. 파라미터 {n}.
     *
     * Row checkbox aria. Param {n}.
     *
     * 行チェックボックスの aria。パラメーター {n}。
     *
     * 行复选框的 aria。参数 {n}。
     */
    selectAria: MessageValue;
    /**
     * 행 이동 announce. 파라미터 {from} {to}.
     *
     * Row-move announce. Params {from} {to}.
     *
     * 行移動の announce。パラメーター {from} {to}。
     *
     * 行移动的 announce。参数 {from} {to}。
     */
    moveAnnounce: MessageValue;
  };
  /**
   * 그룹 행 배지/null 라벨.
   *
   * Group-row badge / null label.
   *
   * グループ行のバッジ/null ラベル。
   *
   * 分组行的徽标/null 标签。
   */
  group: {
    /**
     * 그룹 배지. 파라미터 {label} {count}.
     *
     * Group badge. Params {label} {count}.
     *
     * グループバッジ。パラメーター {label} {count}。
     *
     * 分组徽标。参数 {label} {count}。
     */
    badge: MessageValue;
    nullLabel: string;
  };
  /**
   * 피벗 총계 행.
   *
   * Pivot total row.
   *
   * ピボットの総計行。
   *
   * 透视表的总计行。
   */
  pivot: {
    totalLabel: string;
  };
  /**
   * 데이터 로드/스킵 announce.
   *
   * Data load/skip announce.
   *
   * データのロード/スキップの announce。
   *
   * 数据加载/跳过的 announce。
   */
  data: {
    /**
     * 데이터 로드 announce. 파라미터 {count}.
     *
     * Data-loaded announce. Param {count}.
     *
     * データロードの announce。パラメーター {count}。
     *
     * 数据加载完成的 announce。参数 {count}。
     */
    loadedAnnounce: MessageValue;
    /**
     * 쓰기 대상 아닌 셀 스킵 announce. 파라미터 {count}.
     *
     * Non-writable cells skipped announce. Param {count}.
     *
     * 書き込み対象でないセルをスキップした announce。パラメーター {count}。
     *
     * 跳过非写入目标单元格的 announce。参数 {count}。
     */
    skippedCellsAnnounce: MessageValue;
  };
  /**
   * 범위 선택 + 채우기 announce/aria.
   *
   * Range selection + fill announce/aria.
   *
   * 範囲選択 + フィルの announce/aria。
   *
   * 范围选择 + 填充的 announce/aria。
   */
  range: {
    /**
     * 범위 선택 announce. 파라미터 {r1} {c1} {r2} {c2} {n}.
     *
     * Range selection announce. Params {r1} {c1} {r2} {c2} {n}.
     *
     * 範囲選択の announce。パラメーター {r1} {c1} {r2} {c2} {n}。
     *
     * 范围选择的 announce。参数 {r1} {c1} {r2} {c2} {n}。
     */
    selectionAnnounce: MessageValue;
    /**
     * 수식 셀 보존 announce. 파라미터 {count}.
     *
     * Formula cells preserved announce. Param {count}.
     *
     * 数式セルを保持した announce。パラメーター {count}。
     *
     * 保留公式单元格的 announce。参数 {count}。
     */
    formulaPreserved: MessageValue;
    /**
     * 채우기 스킵 announce. 파라미터 {count}.
     *
     * Fill-skipped announce. Param {count}.
     *
     * フィルをスキップした announce。パラメーター {count}。
     *
     * 跳过填充的 announce。参数 {count}。
     */
    fillSkipped: MessageValue;
    fillHandleAria: string;
  };
  /**
   * 정렬 상태어 + announce.
   *
   * Sort state words + announce.
   *
   * ソートの状態語 + announce。
   *
   * 排序的状态词 + announce。
   */
  sort: {
    asc: string; desc: string; none: string;
    /**
     * 정렬 announce. 파라미터 {field} {dir}.
     *
     * Sort announce. Params {field} {dir}.
     *
     * ソートの announce。パラメーター {field} {dir}。
     *
     * 排序的 announce。参数 {field} {dir}。
     */
    announce: MessageValue;
  };
  /**
   * F4 차트 배지·announce·접근성 요약.
   *
   * F4 chart badges/announce/a11y summary.
   *
   * F4 チャートのバッジ・announce・アクセシビリティ要約。
   *
   * F4 图表的徽标·announce·无障碍摘要。
   */
  chart: {
    defaultTitle: string;
    /**
     * 샘플링 배지. 파라미터 {to} {from}.
     *
     * Sampled badge. Params {to} {from}.
     *
     * サンプリングバッジ。パラメーター {to} {from}。
     *
     * 采样徽标。参数 {to} {from}。
     */
    badgeSampled: MessageValue;
    /**
     * 집계 배지. 파라미터 {op}.
     *
     * Aggregated badge. Param {op}.
     *
     * 集計バッジ。パラメーター {op}。
     *
     * 聚合徽标。参数 {op}。
     */
    badgeAggregated: MessageValue;
    badgePieFirstSeries: string; badgeNegativesAbs: string; badgeRangeFallback: string;
    /**
     * 엔진 폴백 배지. 파라미터 {engine}.
     *
     * Engine-fallback badge. Param {engine}.
     *
     * エンジンフォールバックバッジ。パラメーター {engine}。
     *
     * 引擎回退徽标。参数 {engine}。
     */
    badgeEngineFallback: MessageValue;
    /**
     * 배지 announce 접두. 파라미터 {badges}.
     *
     * Badge announce prefix. Param {badges}.
     *
     * バッジ announce の接頭辞。パラメーター {badges}。
     *
     * 徽标 announce 的前缀。参数 {badges}。
     */
    announcePrefix: MessageValue;
    /**
     * 접근성 요약. 파라미터 {title} {categories} {series}.
     *
     * A11y summary. Params {title} {categories} {series}.
     *
     * アクセシビリティ要約。パラメーター {title} {categories} {series}。
     *
     * 无障碍摘要。参数 {title} {categories} {series}。
     */
    a11ySummary: MessageValue;
    /**
     * 무제목 접근성 요약. 파라미터 {categories} {series}.
     *
     * Titleless a11y summary. Params {categories} {series}.
     *
     * 無題のアクセシビリティ要約。パラメーター {categories} {series}。
     *
     * 无标题的无障碍摘要。参数 {categories} {series}。
     */
    a11ySummaryNoTitle: MessageValue;
    /**
     * 캔버스 대체 텍스트. 파라미터 {title} {categories} {series}.
     *
     * Canvas alt text. Params {title} {categories} {series}.
     *
     * キャンバスの代替テキスト。パラメーター {title} {categories} {series}。
     *
     * 画布的替代文本。参数 {title} {categories} {series}。
     */
    a11yAltText: MessageValue;
    a11yNoData: string; tooltipEmpty: string; canvasDefault: string;
  };
  /**
   * 사용자 노출 수식 오류 셀 라벨.
   *
   * User-facing formula error cell labels.
   *
   * ユーザーに見える数式エラーセルのラベル。
   *
   * 面向用户的公式错误单元格标签。
   */
  formulaError: {
    err: string; ref: string; cycle: string; div0: string; name: string; value: string; num: string;
    fallback: string;
  };
  /**
   * 수식 셀 announce/aria(파라미터형).
   *
   * Formula cell announce/aria (parameterized).
   *
   * 数式セルの announce/aria（パラメーター形）。
   *
   * 公式单元格的 announce/aria（参数形式）。
   */
  formula: {
    /**
     * 셀 오류 announce. 파라미터 {field} {message}.
     *
     * Cell error announce. Params {field} {message}.
     *
     * セルエラーの announce。パラメーター {field} {message}。
     *
     * 单元格错误的 announce。参数 {field} {message}。
     */
    cellErrorAnnounce: MessageValue;
    /**
     * 수식 오류 셀 aria. 파라미터 {src} {message}.
     *
     * Formula error cell aria. Params {src} {message}.
     *
     * 数式エラーセルの aria。パラメーター {src} {message}。
     *
     * 公式错误单元格的 aria。参数 {src} {message}。
     */
    ariaError: MessageValue;
    /**
     * 수식 값 셀 aria. 파라미터 {src} {value} {approx}.
     *
     * Formula value cell aria. Params {src} {value} {approx}.
     *
     * 数式値セルの aria。パラメーター {src} {value} {approx}。
     *
     * 公式值单元格的 aria。参数 {src} {value} {approx}。
     */
    ariaValue: MessageValue;
    approxSuffix: string;
  };
  /**
   * 컨테이너·빈 상태·헤더 필터 아이콘·디테일 영역 aria/tooltip.
   *
   * Container/empty/header-filter/detail-region aria & tooltip.
   *
   * コンテナー・空の状態・ヘッダーフィルターアイコン・ディテール領域の aria/tooltip。
   *
   * 容器·空状态·表头筛选图标·明细区域的 aria/tooltip。
   */
  grid: {
    containerAria: string; emptyMessage: string; filterTooltip: string; detailRegion: string;
  };
  /**
   * 인쇄/내보내기 문서 문구(포맷 파라미터형).
   *
   * Print/export document strings (parameterized).
   *
   * 印刷/エクスポート文書の文言（フォーマットパラメーター形）。
   *
   * 打印/导出文档的文案（格式参数形式）。
   */
  export: {
    /**
     * 인쇄 요약행. 파라미터 {rows} {cols} {date}.
     *
     * Print summary row. Params {rows} {cols} {date}.
     *
     * 印刷の要約行。パラメーター {rows} {cols} {date}。
     *
     * 打印的摘要行。参数 {rows} {cols} {date}。
     */
    printSummary: MessageValue;
  };
}

/**
 * `register()`/`extend()` 에 일부 섹션·키만 넘길 때 쓰는 타입(2단 딥머지로 카탈로그 위에 얹힌다).
 * 전체 언어를 다 채우지 않아도 로케일을 등록할 수 있게 해 준다.
 *
 * Type used when passing only some sections/keys to `register()`/`extend()` (layered onto the
 * catalog via 2-level deep-merge) — lets you register a locale before every key is translated.
 *
 * `register()`/`extend()` に一部のセクション・キーだけを渡すときに使う型です（2段のディープマージで
 * カタログの上に重なります）。全言語を埋めきらなくてもロケールを登録できるようにしてくれます。
 *
 * 向 `register()`/`extend()` 只传部分小节或键时使用的类型（通过 2 层深合并叠加到目录之上）。
 * 不必填满全部语言也能注册区域设置。
 */
export type PartialLocaleMessages = { [S in keyof LocaleMessages]?: Partial<LocaleMessages[S]> };

/**
 * `t()` 에 넘길 수 있는 모든 유효 키의 유니온 타입(예: `'filter.apply'`). 왜 필요한가:
 * `t('filter.aply')` 처럼 오타가 나면 이 타입이 없을 때는 런타임에야 "키 없음" 경고로 드러난다 —
 * 유니온으로 묶어 두면 컴파일 타임에 바로 에러가 난다.
 *
 * Union of every key valid for `t()` (e.g. `'filter.apply'`). Why this exists: without it, a typo
 * like `t('filter.aply')` only surfaces as a runtime "unknown key" warning; unioning the keys
 * turns it into a compile-time error instead.
 *
 * `t()` に渡せるすべての有効なキーのユニオン型です（例: `'filter.apply'`）。なぜ必要なのか:
 * `t('filter.aply')` のようなタイプミスは、この型がないと実行時になってようやく「キーがありません」
 * という警告として現れます — ユニオンにまとめておけば、コンパイル時にすぐエラーになります。
 *
 * 可传给 `t()` 的所有有效键的联合类型（例如 `'filter.apply'`）。为什么需要它: 没有这个类型时，
 * `t('filter.aply')` 这样的拼写错误要到运行时才会以「找不到键」的警告暴露出来 — 把键收拢成联合类型，
 * 编译时就直接报错。
 */
export type LocaleMessageKey =
  { [S in keyof LocaleMessages]: `${S & string}.${keyof LocaleMessages[S] & string}` }[keyof LocaleMessages];

// 계약 추적: REQ-T9-816, DD-12 §2.4. 대표 소유=DD-12(DD-04 FormatContext.locale·DD-15
// ExportRunCtx.locale 은 이 타입을 재선언 없이 import). / Contract refs: REQ-T9-816, DD-12 §2.4.
// Canonical owner: DD-12 (DD-04/DD-15 import this type without re-declaring).
/**
 * 문화(지역) 규칙을 담는 단일 컨텍스트 타입. 통화·날짜·정렬·검색 등 "문화마다 다른 규칙"을
 * 여러 군데서 각자 조회하게 두면, 그리드와 내보내기(export) 가 서로 다른 로케일을 참조하는
 * 불일치가 생길 수 있다 — 그래서 값객체·포맷터·정렬·검색이 문화 정보를 **오직 이 타입을
 * 통해서만** 조회하도록 강제한다(단일 진실 공급원). 아래 확장 필드는 전부 추가·옵셔널이라
 * 기존 3필드를 쓰던 코드는 그대로 동작한다(semver 하위 호환).
 *
 * A single context type carrying culture (locale) rules. Letting currency/date/sort/search each
 * look up their own culture rules independently could let the grid and the export path silently
 * disagree on locale — so value objects, formatters, sort, and search look up culture
 * information **only through this type** (single source of truth). The extension fields below
 * are all additive and optional, so code written against the original 3 fields keeps working
 * unchanged (semver-compatible).
 *
 * 文化（地域）の規則を持つ単一のコンテキスト型です。通貨・日付・ソート・検索など「文化ごとに
 * 異なる規則」を複数の箇所でそれぞれ調べさせておくと、グリッドとエクスポートが互いに違うロケールを
 * 参照する不一致が起こりえます — そこで値オブジェクト・フォーマッター・ソート・検索が文化情報を
 * **この型を通してのみ**調べるように強制します（単一の信頼できる情報源）。以下の拡張フィールドは
 * すべて追加・オプショナルなので、既存の3フィールドを使っていたコードはそのまま動作します
 * （semver 後方互換）。
 *
 * 承载文化（地区）规则的单一上下文类型。货币、日期、排序、搜索等「因文化而异的规则」如果任由多处
 * 各自查询，表格与导出就可能参照不同的区域设置而出现不一致 — 因此强制值对象、格式化器、排序、搜索
 * **只通过此类型**查询文化信息（单一可信来源）。下面的扩展字段全部是追加且可选的，因此使用原有
 * 3 个字段的代码照常运行（semver 向后兼容）。
 */
export interface LocaleMeta {
  /**
   * BCP-47 태그(toLocaleString/lang/인쇄 템플릿용). 예 'ko-KR'.
   *
   * BCP-47 tag (for toLocaleString/lang/print template). e.g. 'ko-KR'.
   *
   * BCP-47 タグ（toLocaleString/lang/印刷テンプレート用）。例 'ko-KR'。
   *
   * BCP-47 标记（用于 toLocaleString/lang/打印模板）。例如 'ko-KR'。
   */
  readonly intlLocale: string;
  /**
   * 텍스트 방향(현 코어는 ltr 검증).
   *
   * Text direction (core validated for ltr).
   *
   * テキストの方向（現在のコアは ltr を検証）。
   *
   * 文本方向（当前核心验证 ltr）。
   */
  readonly dir?: 'ltr' | 'rtl';
  /**
   * Excel 내보내기 기본 폰트.
   *
   * Default font for Excel export.
   *
   * Excel エクスポートの既定フォント。
   *
   * Excel 导出的默认字体。
   */
  readonly exportFont?: string;
  // ── DD-12 §2.4 확장(additive·옵셔널) / DD-12 §2.4 extension (additive & optional) ──
  /**
   * 기본 통화코드(ISO 4217) — Money 미지정 시 폴백.
   *
   * Default currency (ISO 4217).
   *
   * 既定の通貨コード（ISO 4217） — Money 未指定時のフォールバック。
   *
   * 默认货币代码（ISO 4217） — Money 未指定时的回退值。
   */
  readonly currency?: string;
  /**
   * 달력 체계(gregory/japanese/…) — Intl.DateTimeFormat 위임.
   *
   * Calendar system.
   *
   * 暦の体系（gregory/japanese/…） — Intl.DateTimeFormat に委譲。
   *
   * 历法体系（gregory/japanese/…） — 委托给 Intl.DateTimeFormat。
   */
  readonly calendar?: string;
  /**
   * 콜레이션 규칙(정렬 tie-break·대소문자·발음구별) — Intl.Collator 옵션.
   *
   * Collation for sort/search.
   *
   * コレーションの規則（ソートの tie-break・大文字小文字・発音区別） — Intl.Collator のオプション。
   *
   * 排序规则（排序的 tie-break·大小写·变音符号） — Intl.Collator 的选项。
   */
  readonly collation?: {
    readonly sensitivity?: 'base' | 'accent' | 'case' | 'variant';
    readonly numeric?: boolean;
    readonly caseFirst?: 'upper' | 'lower' | 'false';
  };
  /**
   * 숫자 체계(latn/arab/…).
   *
   * Numbering system.
   *
   * 数字の体系（latn/arab/…）。
   *
   * 数字体系（latn/arab/…）。
   */
  readonly numbering?: string;
  /**
   * 시간대.
   *
   * Time zone.
   *
   * タイムゾーン。
   *
   * 时区。
   */
  readonly timeZone?: string;
  /**
   * 주 시작요일(0=일·1=월·6=토).
   *
   * First day of week.
   *
   * 週の開始曜日（0=日・1=月・6=土）。
   *
   * 每周的起始日（0=周日·1=周一·6=周六）。
   */
  readonly firstDayOfWeek?: 0 | 1 | 6;
  // REQ-T9-817 (내부 추적용 — 공개 문서 미노출)
  /**
   * 번역하면 글자 수가 얼마나 늘어나는지를 나타내는 계수입니다. 레이아웃 폭을 잡을 때 참고합니다.
   * 예를 들어 독일어는 약 1.35배, 의사 로케일은 1.4배로 잡습니다.
   *
   * How much longer the text gets once translated — used as a hint when budgeting layout width.
   * German runs about 1.35×, and the pseudo-locale uses 1.4×.
   *
   * 翻訳すると文字数がどれだけ増えるかを表す係数です。レイアウト幅を決めるときの目安に使います。
   * 例えばドイツ語は約1.35倍、擬似ロケールは1.4倍とします。
   *
   * 表示文本翻译后长度增加的系数，用于估算布局宽度。例如德语约为 1.35 倍，伪区域设置取 1.4 倍。
   */
  readonly textExpansion?: number;
}

/**
 * register() 결과 — 누락 키 신호(막지 않음).
 *
 * register() result — missing-key signal (never blocks).
 *
 * register() の結果 — 不足キーのシグナル（ブロックしません）。
 *
 * register() 的结果 — 缺失键的信号（不阻断）。
 */
export interface LocaleRegisterResult { readonly missingKeys: string[]; }
