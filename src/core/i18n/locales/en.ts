// ============================================================
// en 로케일 카탈로그 / en locale catalog
// ------------------------------------------------------------
// 설계 근거(Why): I18N_DESIGN.md §C9/§3.4. ko 전 키에 대응하는 자연스러운 UI 영어(접근성 문구 포함).
//   복수형이 어색한 소수 항목은 함수형 MessageValue 로 로케일 파일 안에서 해결한다(엔진 미도입, §C6).
//   키 완전성은 `satisfies LocaleMessages` 로 컴파일 강제(ko 와 동일 키 집합).
// / Design: I18N_DESIGN.md §C9/§3.4. Natural UI English for every ko key (incl. a11y strings). A
//   few plural-sensitive entries use a function MessageValue resolved in-file (no plural engine, §C6).
//   Key completeness is compiler-enforced via `satisfies LocaleMessages` (same key set as ko).
// ============================================================

import type { LocaleMessages, LocaleMeta } from '../types.js';

/** en 메시지 카탈로그. / en message catalog. */
export const EN_MESSAGES = {
  contextMenu: {
    sortAsc: 'Sort ascending',
    sortDesc: 'Sort descending',
    find: 'Find',
    exportExcel: 'Save as Excel',
    exportCsv: 'Save as CSV',
    print: 'Print',
  },
  filter: {
    title: 'Filter',
    opContains: 'Contains',
    opEq: 'Equals',
    opNe: 'Not equal',
    opStartsWith: 'Starts with',
    opEndsWith: 'Ends with',
    opGt: 'Greater than',
    opLt: 'Less than',
    opGte: 'At least',
    opLte: 'At most',
    valuePlaceholder: 'Enter filter value...',
    clear: 'Reset',
    apply: 'Apply',
    legend: 'Filter',
    clearAria: 'Reset filter',
    all: 'All',
  },
  findBar: {
    label: 'Find',
    placeholder: 'Enter search term...',
    searchAria: 'Search within grid',
    closeAria: 'Close find',
    countBadge: (p) => (p.n === 1 ? '1 match' : `${p.n} matches`),
  },
  pagination: {
    rowsPerPage: 'Rows per page:',
    rangeBadge: '{from}–{to} of {total}',
    empty: '0 rows',
  },
  drag: {
    rowCount: (p) => (p.count === 1 ? 'Move 1 row' : `Move ${p.count} rows`),
  },
  crossGrid: {
    overlayAria: 'Grid field mapping',
    title: 'Field mapping',
    desc1: 'The two grids have different field structures. For each <b>target field</b>, choose which <b>source field</b> to pull its value from. ',
    desc2: 'Copy the script below and bake it into <code>crossGridMapping</code> to convert automatically without this dialog next time.',
    emptyOption: '(none)',
    scriptTitle: 'Generated conversion script',
    copy: 'Copy',
    copied: 'Copied!',
    copyFailed: 'Copy failed',
    cancel: 'Cancel',
    applyMove: 'Apply and move',
    scriptComment: '// Assign this function to the crossGridMapping option as-is.',
  },
  shuttle: {
    toRight: 'Move checked rows to the right grid',
    toLeft: 'Move checked rows to the left grid',
    allRight: 'Move all from left to right',
    allLeft: 'Move all from right to left',
  },
  tree: {
    collapse: 'Collapse',
    expand: 'Expand',
  },
  detail: {
    glyphLabel: '▤ Detail',
    glyphTooltip: 'View detail',
    expandAria: 'Expand detail panel',
    collapseAria: 'Collapse detail panel',
    expandedAnnounce: 'Row detail panel expanded.',
    collapsedAnnounce: 'Row detail panel collapsed.',
    collapsedAllAnnounce: 'All detail panels collapsed.',
    depthLimitOpen: 'Nesting depth limit ({max}) reached — cannot open the detail panel.',
    depthLimitSubgrid: 'Nesting depth limit ({max}) reached — subgrid will not be created.',
  },
  worksheet: {
    addAria: 'Add new worksheet',
  },
  editor: {
    datePick: 'Pick a date',
    select: 'Select',
    cellPositionAnnounce: 'Row {row}, column {col}, {header}: {value}',
  },
  cell: {
    emptyValue: 'empty',
    revealTooltip: 'Click to reveal the original',
    revealAria: 'Reveal masked value',
    radioAria: 'Select',
    barcodeAria: 'Barcode: {value}',
  },
  row: {
    selectAllAria: 'Select all rows',
    selectAria: 'Select row {n}',
    moveAnnounce: 'Move row {from} to position {to}',
  },
  group: {
    badge: '{label}  ({count})',
    nullLabel: '(none)',
  },
  pivot: {
    totalLabel: 'Total',
  },
  data: {
    loadedAnnounce: (p) => (p.count === 1 ? '1 row loaded' : `${p.count} rows loaded`),
    skippedCellsAnnounce: (p) => (p.count === 1 ? 'Skipped 1 non-writable cell' : `Skipped ${p.count} non-writable cells`),
  },
  range: {
    selectionAnnounce: 'Selected {n} cells from row {r1} column {c1} to row {r2} column {c2}',
    formulaPreserved: (p) => (p.count === 1 ? '1 formula cell preserved' : `${p.count} formula cells preserved`),
    fillSkipped: (p) => (p.count === 1 ? 'Skipped 1 non-fillable cell' : `Skipped ${p.count} non-fillable cells`),
    fillHandleAria: 'Fill handle',
  },
  sort: {
    asc: 'ascending',
    desc: 'descending',
    none: 'unsorted',
    announce: '{field} sorted {dir}',
  },
  chart: {
    defaultTitle: 'Chart',
    badgeSampled: 'Sampled {to}/{from} rows',
    badgeAggregated: 'Category aggregated ({op})',
    badgePieFirstSeries: 'Pie: first series only',
    badgeNegativesAbs: 'Negatives shown as absolute · bar recommended',
    badgeRangeFallback: 'No range source · using selected rows',
    badgeEngineFallback: '{engine} not installed · using built-in chart',
    announcePrefix: 'Chart notice: {badges}',
    a11ySummary: '{title}: {categories} categories, series {series}',
    a11ySummaryNoTitle: '{categories} categories, series {series}',
    a11yAltText: '{title}: {series} across {categories} categories — see the table below for detailed values',
    a11yNoData: 'No data',
    tooltipEmpty: 'none',
    canvasDefault: 'Chart',
  },
  formulaError: {
    err: 'Formula error',
    ref: 'Reference was deleted',
    cycle: 'Circular reference',
    div0: 'Division by zero',
    name: 'Unknown function/name',
    value: 'Arithmetic on a non-numeric value',
    num: 'Numeric domain error',
    fallback: 'Formula error',
  },
  formula: {
    cellErrorAnnounce: '{field} cell error: {message}',
    ariaError: 'Formula {src}, error: {message}',
    ariaValue: 'Formula {src}, value {value}{approx}',
    approxSuffix: ' (approx.)',
  },
  grid: {
    containerAria: 'OPEN_GRID data grid',
    emptyMessage: 'No data.',
    filterTooltip: 'Filter',
    detailRegion: 'Detail',
  },
  export: {
    printSummary: '{rows} rows × {cols} cols · {date}',
  },
} satisfies LocaleMessages;

/** en 포맷 메타. / en format meta. */
export const EN_META: LocaleMeta = { intlLocale: 'en-US', dir: 'ltr', exportFont: 'Calibri' };
