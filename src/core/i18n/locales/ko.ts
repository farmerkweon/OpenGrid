// ============================================================
// ko 로케일 카탈로그 (SSOT) / ko locale catalog (SSOT)
// ------------------------------------------------------------
// 설계 근거(Why): I18N_DESIGN.md §2-D1/§3.4. 현행 하드코딩된 한국어 UI 원문이 곧 ko 카탈로그이며
//   폴백 체인의 종단(항상-완전한 SSOT)이다. 각 값은 실제 소스 파일에서 직접 복사한 byte-identical
//   원문이고, `{n}`·`{count}` 등 동적 조각만 `{token}` 보간으로 치환했다(문안 무변경).
// / Design: I18N_DESIGN.md §2-D1/§3.4. The current hardcoded Korean UI strings ARE the ko catalog
//   and the terminal of the fallback chain (always-complete SSOT). Every value is copied
//   byte-identically from source; only dynamic fragments became `{token}` params.
// ============================================================

import type { LocaleMessages, LocaleMeta } from '../types.js';

/** ko 메시지 카탈로그. `satisfies` 로 키 완전성 컴파일 강제. / ko message catalog. `satisfies` enforces key completeness at compile time. */
export const KO_MESSAGES = {
  contextMenu: {
    sortAsc: '오름차순 정렬',
    sortDesc: '내림차순 정렬',
    find: '찾기',
    exportExcel: 'Excel로 저장',
    exportCsv: 'CSV로 저장',
    print: '인쇄',
  },
  filter: {
    title: '필터',
    opContains: '포함',
    opEq: '같음',
    opNe: '같지 않음',
    opStartsWith: '시작',
    opEndsWith: '끝남',
    opGt: '보다 큼',
    opLt: '보다 작음',
    opGte: '이상',
    opLte: '이하',
    valuePlaceholder: '필터 값 입력...',
    clear: '초기화',
    apply: '적용',
    legend: '필터',
    clearAria: '필터 초기화',
    all: '전체',
  },
  findBar: {
    label: '찾기',
    placeholder: '검색어 입력...',
    searchAria: '그리드 내 검색',
    closeAria: '찾기 닫기',
    countBadge: '{n}건',
  },
  pagination: {
    rowsPerPage: '행/페이지:',
    rangeBadge: '{from}–{to} / {total}건',
    empty: '0건',
  },
  drag: {
    rowCount: '{count}개 행 이동',
  },
  crossGrid: {
    overlayAria: '그리드 필드 매핑',
    title: '필드 매핑',
    desc1: '두 그리드의 필드 구조가 다릅니다. <b>타깃 필드</b>마다 어떤 <b>소스 필드</b>의 값을 가져올지 지정하세요. ',
    desc2: '아래 스크립트를 복사해 <code>crossGridMapping</code> 에 baking 하면 다음부터는 이 창 없이 자동 변환됩니다.',
    emptyOption: '(비움)',
    scriptTitle: '생성된 변환 스크립트',
    copy: '복사',
    copied: '복사됨!',
    copyFailed: '복사 실패',
    cancel: '취소',
    applyMove: '적용 후 이동',
    scriptComment: '// crossGridMapping 옵션에 이 함수를 그대로 지정하세요.',
  },
  shuttle: {
    toRight: '체크한 행을 오른쪽 그리드로 이동',
    toLeft: '체크한 행을 왼쪽 그리드로 이동',
    allRight: '왼쪽 전체를 오른쪽으로 이동',
    allLeft: '오른쪽 전체를 왼쪽으로 이동',
  },
  tree: {
    collapse: '접기',
    expand: '펼치기',
  },
  detail: {
    glyphLabel: '▤ 상세',
    glyphTooltip: '상세 보기',
    expandAria: '상세 패널 펼치기',
    collapseAria: '상세 패널 접기',
    expandedAnnounce: '행 상세 패널을 펼쳤습니다.',
    collapsedAnnounce: '행 상세 패널을 접었습니다.',
    collapsedAllAnnounce: '모든 상세 패널을 접었습니다.',
    depthLimitOpen: '중첩 깊이 한계({max})로 상세 패널을 열 수 없습니다.',
    depthLimitSubgrid: '중첩 깊이 한계({max})로 서브 그리드를 생성하지 않습니다.',
  },
  worksheet: {
    addAria: '새 워크시트 추가',
  },
  editor: {
    datePick: '날짜 선택',
    select: '선택',
    cellPositionAnnounce: '{row}행 {col}열, {header}: {value}',
  },
  cell: {
    emptyValue: '빈 값',
    revealTooltip: '클릭하면 원문 표시',
    revealAria: '마스킹 해제',
    radioAria: '선택',
    barcodeAria: '바코드: {value}',
  },
  row: {
    selectAllAria: '전체 행 선택',
    selectAria: '{n}행 선택',
    moveAnnounce: '행 {from}을(를) {to}번째 위치로 이동',
  },
  group: {
    badge: '{label}  ({count}건)',
    nullLabel: '(없음)',
  },
  pivot: {
    totalLabel: '합계',
  },
  data: {
    loadedAnnounce: '{count}행 데이터 로드됨',
    skippedCellsAnnounce: '쓰기 대상이 아닌 셀 {count}개를 건너뛰었습니다',
  },
  range: {
    selectionAnnounce: '{r1}행 {c1}열 ~ {r2}행 {c2}열, {n}개 셀 선택',
    formulaPreserved: '수식 셀 {count}개 보존',
    fillSkipped: '채우기 대상이 아닌 셀 {count}개를 건너뛰었습니다',
    fillHandleAria: '채우기 핸들',
  },
  sort: {
    asc: '오름차순',
    desc: '내림차순',
    none: '정렬 해제',
    announce: '{field} {dir} 정렬',
  },
  chart: {
    defaultTitle: '차트',
    badgeSampled: '샘플링됨 {to}/{from}행',
    badgeAggregated: 'category 집계됨 ({op})',
    badgePieFirstSeries: '파이: 첫 시리즈만 표시',
    badgeNegativesAbs: '음수→절대값 표시 · bar 권장',
    badgeRangeFallback: '범위 소스 없음 · 선택 행으로 대체',
    badgeEngineFallback: '{engine} 미설치 · 내장 차트로 대체',
    announcePrefix: '차트 안내: {badges}',
    a11ySummary: '{title}: 카테고리 {categories}개, 시리즈 {series}',
    a11ySummaryNoTitle: '카테고리 {categories}개, 시리즈 {series}',
    a11yAltText: '{title}: {categories}개 카테고리별 {series} — 상세 값은 아래 표를 참고하세요',
    a11yNoData: '데이터 없음',
    tooltipEmpty: '없음',
    canvasDefault: '차트',
  },
  formulaError: {
    err: '수식 오류',
    ref: '참조 대상이 삭제됨',
    cycle: '순환 참조',
    div0: '0으로 나눔',
    name: '알 수 없는 함수/이름',
    value: '숫자가 아닌 값에 산술 연산',
    num: '수치 도메인 오류',
    fallback: '수식 오류',
  },
  formula: {
    cellErrorAnnounce: '{field} 셀 오류: {message}',
    ariaError: '수식 {src}, 오류: {message}',
    ariaValue: '수식 {src}, 값 {value}{approx}',
    approxSuffix: ' (근사값)',
  },
  grid: {
    containerAria: 'OPEN_GRID 데이터 그리드',
    emptyMessage: '데이터가 없습니다.',
    filterTooltip: '필터',
    detailRegion: '상세 내용',
  },
  export: {
    printSummary: '{rows}행 × {cols}열 · {date}',
  },
} satisfies LocaleMessages;

/** ko 포맷 메타(Intl 태그·방향·수출 폰트). / ko format meta (Intl tag, direction, export font). */
export const KO_META: LocaleMeta = { intlLocale: 'ko-KR', dir: 'ltr', exportFont: '맑은 고딕' };
