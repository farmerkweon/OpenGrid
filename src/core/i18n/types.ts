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

/** 보간 파라미터. 명명 파라미터만(위치 파라미터 금지 — 어순이 언어마다 다름). / Interpolation params. Named only (positional forbidden — word order differs per language). */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * 메시지 값: 평문 문자열('{name}' 보간) 또는 함수(복수형·조사 등 "문법이 데이터인" 케이스의 탈출구).
 * ICU/CLDR 복수 엔진은 zero-dependency 정체성 때문에 도입하지 않는다(규칙은 로케일 파일에 둔다).
 * / A message value: a plain string ('{name}' interpolation) or a function (escape hatch for
 *   plurals/particles where "grammar is data"). No ICU/CLDR plural engine (zero-dependency).
 */
export type MessageValue = string | ((params: MessageParams) => string);

/**
 * 로케일 메시지 카탈로그(2단 중첩, 최상위 섹션 = 소비 UI 표면). 파라미터를 받는 값만 `MessageValue`
 * (함수형 복수 허용), 정적 라벨은 `string`. 내장 ko 가 SSOT 이며 en 은 동일 키 집합을 갖는다.
 * / The locale message catalog (2-level nested, top-level section = consuming UI surface). Only
 *   parameterized entries are `MessageValue` (allowing plural functions); static labels are
 *   `string`. Built-in ko is the SSOT; en carries the same key set.
 */
export interface LocaleMessages {
  /** 우클릭 컨텍스트 메뉴 라벨. / Right-click context-menu labels. */
  contextMenu: {
    sortAsc: string; sortDesc: string; find: string;
    exportExcel: string; exportCsv: string; print: string;
  };
  /** 필터 패널·필터 셀렉트 라벨. / Filter panel & filter-select labels. */
  filter: {
    title: string;
    opContains: string; opEq: string; opNe: string; opStartsWith: string; opEndsWith: string;
    opGt: string; opLt: string; opGte: string; opLte: string;
    valuePlaceholder: string; clear: string; apply: string;
    legend: string; clearAria: string; all: string;
  };
  /** 찾기 바 라벨/placeholder/aria/카운트 배지. / Find-bar label/placeholder/aria/count badge. */
  findBar: {
    label: string; placeholder: string; searchAria: string; closeAria: string;
    /** 결과 개수 배지. 파라미터 {n}. / Result count badge. Param {n}. */
    countBadge: MessageValue;
  };
  /** 페이지네이션 라벨/범위 배지/빈 상태. / Pagination labels/range badge/empty state. */
  pagination: {
    rowsPerPage: string;
    /** 현재 범위 배지. 파라미터 {from} {to} {total}. / Current range badge. Params {from} {to} {total}. */
    rangeBadge: MessageValue;
    empty: string;
  };
  /** 행 드래그 고스트 라벨. / Row-drag ghost label. */
  drag: {
    /** 드래그 중 행 개수. 파라미터 {count}. / Rows being dragged. Param {count}. */
    rowCount: MessageValue;
  };
  /** 크로스그리드 매핑 다이얼로그(디자인타임 헬퍼). / Cross-grid mapping dialog (design-time helper). */
  crossGrid: {
    overlayAria: string; title: string; desc1: string; desc2: string; emptyOption: string;
    scriptTitle: string; copy: string; copied: string; copyFailed: string;
    cancel: string; applyMove: string; scriptComment: string;
  };
  /** 그리드↔그리드 셔틀 버튼 aria/tooltip. / Grid-to-grid shuttle button aria/tooltip. */
  shuttle: {
    toRight: string; toLeft: string; allRight: string; allLeft: string;
  };
  /** 트리 노드 확장/접기 aria. / Tree node expand/collapse aria. */
  tree: {
    collapse: string; expand: string;
  };
  /** 마스터/디테일 글리프·announce. / Master/detail glyph & announce. */
  detail: {
    glyphLabel: string; glyphTooltip: string; expandAria: string; collapseAria: string;
    expandedAnnounce: string; collapsedAnnounce: string; collapsedAllAnnounce: string;
    /** 상세 패널 깊이 한계. 파라미터 {max}. / Detail depth limit. Param {max}. */
    depthLimitOpen: MessageValue;
    /** 서브그리드 깊이 한계. 파라미터 {max}. / Subgrid depth limit. Param {max}. */
    depthLimitSubgrid: MessageValue;
  };
  /** 워크시트 탭 UI. / Worksheet tab UI. */
  worksheet: {
    addAria: string;
  };
  /** 인라인 에디터 aria/announce. / Inline editor aria/announce. */
  editor: {
    datePick: string; select: string;
    /** 편집 셀 위치 announce. 파라미터 {row} {col} {header} {value}. / Edited-cell position announce. Params {row} {col} {header} {value}. */
    cellPositionAnnounce: MessageValue;
  };
  /** 셀 렌더러(마스킹·라디오·바코드·수식 빈값). / Cell renderer (masking/radio/barcode/formula empty). */
  cell: {
    emptyValue: string; revealTooltip: string; revealAria: string; radioAria: string;
    /** 바코드 셀 aria. 파라미터 {value}. / Barcode cell aria. Param {value}. */
    barcodeAria: MessageValue;
  };
  /** 행 선택 aria + 행 이동 announce. / Row selection aria + row-move announce. */
  row: {
    selectAllAria: string;
    /** 행 체크박스 aria. 파라미터 {n}. / Row checkbox aria. Param {n}. */
    selectAria: MessageValue;
    /** 행 이동 announce. 파라미터 {from} {to}. / Row-move announce. Params {from} {to}. */
    moveAnnounce: MessageValue;
  };
  /** 그룹 행 배지/null 라벨. / Group-row badge / null label. */
  group: {
    /** 그룹 배지. 파라미터 {label} {count}. / Group badge. Params {label} {count}. */
    badge: MessageValue;
    nullLabel: string;
  };
  /** 피벗 총계 행. / Pivot total row. */
  pivot: {
    totalLabel: string;
  };
  /** 데이터 로드/스킵 announce. / Data load/skip announce. */
  data: {
    /** 데이터 로드 announce. 파라미터 {count}. / Data-loaded announce. Param {count}. */
    loadedAnnounce: MessageValue;
    /** 쓰기 대상 아닌 셀 스킵 announce. 파라미터 {count}. / Non-writable cells skipped announce. Param {count}. */
    skippedCellsAnnounce: MessageValue;
  };
  /** 범위 선택 + 채우기 announce/aria. / Range selection + fill announce/aria. */
  range: {
    /** 범위 선택 announce. 파라미터 {r1} {c1} {r2} {c2} {n}. / Range selection announce. Params {r1} {c1} {r2} {c2} {n}. */
    selectionAnnounce: MessageValue;
    /** 수식 셀 보존 announce. 파라미터 {count}. / Formula cells preserved announce. Param {count}. */
    formulaPreserved: MessageValue;
    /** 채우기 스킵 announce. 파라미터 {count}. / Fill-skipped announce. Param {count}. */
    fillSkipped: MessageValue;
    fillHandleAria: string;
  };
  /** 정렬 상태어 + announce. / Sort state words + announce. */
  sort: {
    asc: string; desc: string; none: string;
    /** 정렬 announce. 파라미터 {field} {dir}. / Sort announce. Params {field} {dir}. */
    announce: MessageValue;
  };
  /** F4 차트 배지·announce·접근성 요약. / F4 chart badges/announce/a11y summary. */
  chart: {
    defaultTitle: string;
    /** 샘플링 배지. 파라미터 {to} {from}. / Sampled badge. Params {to} {from}. */
    badgeSampled: MessageValue;
    /** 집계 배지. 파라미터 {op}. / Aggregated badge. Param {op}. */
    badgeAggregated: MessageValue;
    badgePieFirstSeries: string; badgeNegativesAbs: string; badgeRangeFallback: string;
    /** 엔진 폴백 배지. 파라미터 {engine}. / Engine-fallback badge. Param {engine}. */
    badgeEngineFallback: MessageValue;
    /** 배지 announce 접두. 파라미터 {badges}. / Badge announce prefix. Param {badges}. */
    announcePrefix: MessageValue;
    /** 접근성 요약. 파라미터 {title} {categories} {series}. / A11y summary. Params {title} {categories} {series}. */
    a11ySummary: MessageValue;
    /** 무제목 접근성 요약. 파라미터 {categories} {series}. / Titleless a11y summary. Params {categories} {series}. */
    a11ySummaryNoTitle: MessageValue;
    /** 캔버스 대체 텍스트. 파라미터 {title} {categories} {series}. / Canvas alt text. Params {title} {categories} {series}. */
    a11yAltText: MessageValue;
    a11yNoData: string; tooltipEmpty: string; canvasDefault: string;
  };
  /** 사용자 노출 수식 오류 셀 라벨. / User-facing formula error cell labels. */
  formulaError: {
    err: string; ref: string; cycle: string; div0: string; name: string; value: string; num: string;
    fallback: string;
  };
  /** 수식 셀 announce/aria(파라미터형). / Formula cell announce/aria (parameterized). */
  formula: {
    /** 셀 오류 announce. 파라미터 {field} {message}. / Cell error announce. Params {field} {message}. */
    cellErrorAnnounce: MessageValue;
    /** 수식 오류 셀 aria. 파라미터 {src} {message}. / Formula error cell aria. Params {src} {message}. */
    ariaError: MessageValue;
    /** 수식 값 셀 aria. 파라미터 {src} {value} {approx}. / Formula value cell aria. Params {src} {value} {approx}. */
    ariaValue: MessageValue;
    approxSuffix: string;
  };
  /** 컨테이너·빈 상태·헤더 필터 아이콘·디테일 영역 aria/tooltip. / Container/empty/header-filter/detail-region aria & tooltip. */
  grid: {
    containerAria: string; emptyMessage: string; filterTooltip: string; detailRegion: string;
  };
  /** 인쇄/내보내기 문서 문구(포맷 파라미터형). / Print/export document strings (parameterized). */
  export: {
    /** 인쇄 요약행. 파라미터 {rows} {cols} {date}. / Print summary row. Params {rows} {cols} {date}. */
    printSummary: MessageValue;
  };
}

/** 부분 오버라이드(2단 딥머지, 카탈로그 위). / Partial override (2-level deep-merge over the catalog). */
export type PartialLocaleMessages = { [S in keyof LocaleMessages]?: Partial<LocaleMessages[S]> };

/** dot-key 유니온(`'filter.apply'` 등) — 오타를 컴파일 에러화. / Dot-key union (e.g. `'filter.apply'`) — typos become compile errors. */
export type LocaleMessageKey =
  { [S in keyof LocaleMessages]: `${S & string}.${keyof LocaleMessages[S] & string}` }[keyof LocaleMessages];

/**
 * 문화 규칙 단일 컨텍스트(REQ-T9-816, DD-12 §2.4). 값객체·포맷터·정렬·검색이 문화를 **오직 여기서만**
 * 조회한다(불변식 3). 아래 확장 필드는 전부 additive·옵셔널 — 기존 3필드·소비처 불변(semver 하위호환).
 * ★대표 소유 = DD-12: DD-04 `FormatContext.locale`·DD-15 `ExportRunCtx.locale` 는 이 타입을 import(재선언 금지).
 * / Single culture context (REQ-T9-816, DD-12 §2.4). The only lawful culture-lookup path (invariant 3).
 *   The extension fields below are all additive & optional — original 3 fields/consumers unchanged.
 *   ★Canonical owner = DD-12; DD-04/DD-15 import this type (no re-declaration).
 */
export interface LocaleMeta {
  /** BCP-47 태그(toLocaleString/lang/인쇄 템플릿용). 예 'ko-KR'. / BCP-47 tag (for toLocaleString/lang/print template). e.g. 'ko-KR'. */
  readonly intlLocale: string;
  /** 텍스트 방향(현 코어는 ltr 검증). / Text direction (core validated for ltr). */
  readonly dir?: 'ltr' | 'rtl';
  /** Excel 내보내기 기본 폰트. / Default font for Excel export. */
  readonly exportFont?: string;
  // ── DD-12 §2.4 확장(additive·옵셔널) / DD-12 §2.4 extension (additive & optional) ──
  /** 기본 통화코드(ISO 4217) — Money 미지정 시 폴백. / Default currency (ISO 4217). */
  readonly currency?: string;
  /** 달력 체계(gregory/japanese/…) — Intl.DateTimeFormat 위임. / Calendar system. */
  readonly calendar?: string;
  /** 콜레이션 규칙(정렬 tie-break·대소문자·발음구별) — Intl.Collator 옵션. / Collation for sort/search. */
  readonly collation?: {
    readonly sensitivity?: 'base' | 'accent' | 'case' | 'variant';
    readonly numeric?: boolean;
    readonly caseFirst?: 'upper' | 'lower' | 'false';
  };
  /** 숫자 체계(latn/arab/…). / Numbering system. */
  readonly numbering?: string;
  /** 시간대. / Time zone. */
  readonly timeZone?: string;
  /** 주 시작요일(0=일·1=월·6=토). / First day of week. */
  readonly firstDayOfWeek?: 0 | 1 | 6;
  /** 텍스트팽창 계수(레이아웃 예산 힌트·의사로케일). 예 de≈1.35, 의사로케일=1.4(REQ-T9-817). / Text-expansion factor. */
  readonly textExpansion?: number;
}

/** register() 결과 — 누락 키 정직 신호(막지 않음). / register() result — honest missing-key signal (never blocks). */
export interface LocaleRegisterResult { readonly missingKeys: string[]; }
