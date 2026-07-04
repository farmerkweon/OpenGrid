# OPEN_GRID

**Meet Open Grid** — the ultra-light data grid with a **zero-dependency core** that fits
effortlessly into any tech stack. React, Vue, Angular, jQuery, or pure JavaScript — it just
works. MIT-licensed for full commercial freedom, endlessly customizable, and enhanced with an
AI-friendly override guide so you can push your grid further than ever.

High-performance, framework-agnostic data grid with virtual scrolling, inline editing, grouping, tree view, drag-and-drop, change tracking, footer aggregation, and column reorder.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/badge/npm-1.2.0-orange)](https://www.npmjs.com/package/open-grid)

📖 **[개발 가이드](https://foxnail.kr/open-grid/demo/v2/guide/index.php)** — 설치부터 고급 API까지 단계별 가이드
🔗 **[데모/홈페이지](https://foxnail.kr/open-grid/demo/v2/index.php)**

## Features

| Feature | Status |
|---|---|
| Virtual Scroll (100k+ rows) | ✅ |
| Inline Editing (click / dblclick / F2) | ✅ |
| 8 Cell Renderers (text, number, date, checkbox, button, badge, link, template) | ✅ |
| 5 Cell Editors (text, number, select, date, checkbox) | ✅ |
| Multi-sort (Shift+click) | ✅ |
| Column Filter UI (9 operators) | ✅ |
| Column Resize (drag) | ✅ |
| Column Reorder (drag header, `columnReorder: true`) | ✅ |
| Frozen Columns | ✅ |
| Row/Column Groups (header merge) | ✅ |
| Localization / i18n (built-in `ko`·`en`, `setLocale`, custom locales) | ✅ |
| Grouping + Summary (SUM/AVG/MIN/MAX/COUNT) | ✅ |
| Tree Grid (flat → hierarchy, expand/collapse) | ✅ |
| OrgChart (organization chart with theme) | ✅ |
| Cell Merge (manual + auto rowSpan/colSpan) | ✅ |
| Row Drag & Drop | ✅ |
| Change Tracking (`getChanges` / `getChangedColumns` / `getOriginalRow`) | ✅ |
| Footer Aggregation (`setFooter`, `getFooterValue`, OGDecimal precision) | ✅ |
| Data Masking (10 types, cell/column toggle) | ✅ |
| Pagination | ✅ |
| Excel / CSS Theme Export | ✅ |
| CSV / JSON Export | ✅ |
| Clipboard (Ctrl+C / Ctrl+V) | ✅ |
| Keyboard Navigation (Arrow / Tab / F2 / Esc) | ✅ |
| 12 Built-in Themes (dark, ocean, forest, …) | ✅ |
| Vue 3 Component | ✅ |
| React 18 Component | ✅ |
| Zero core dependencies | ✅ |

## Installation

```bash
npm install open-grid
```

## Quick Start

### Vanilla JavaScript / TypeScript

```typescript
import { OpenGrid } from 'open-grid';
import 'open-grid/style.css';

const grid = new OpenGrid('#container', {
  columns: [
    { field: 'name',  header: '이름',  width: 120 },
    { field: 'price', header: '금액',  width: 100, type: 'number', align: 'right' },
    { field: 'date',  header: '날짜',  width: 110, type: 'date' },
  ],
  editable: true,
  sortable: true,
  rowNumber: true,
  height: 500,

  onReady: (g) => g.setData(myData),
  onCellClick: (e) => console.log(e.field, e.value),
  onEditEnd: (e) => console.log(e.oldValue, '→', e.newValue),
});
```

### Vue 3

```vue
<template>
  <OpenGrid
    :columns="columns"
    :data="rows"
    :editable="true"
    :sortable="true"
    :height="500"
    @cell-click="onCellClick"
    @edit-end="onEditEnd"
    @update:data="rows = $event"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { OpenGrid } from 'open-grid/vue';
import 'open-grid/style.css';

const columns = [
  { field: 'name',  header: '이름', width: 120 },
  { field: 'price', header: '금액', width: 100, type: 'number', align: 'right' },
];
const rows = ref(myData);
</script>
```

### React 18

```tsx
import { OpenGrid } from 'open-grid/react';
import 'open-grid/style.css';

function App() {
  const [data, setData] = useState(myData);
  const gridRef = useRef(null);

  return (
    <OpenGrid
      columns={columns}
      data={data}
      editable sortable
      height={500}
      onReady={(g) => { gridRef.current = g; }}
      onDataChange={setData}
    />
  );
}
```

## API Reference

### Constructor

```typescript
new OpenGrid(container: string | HTMLElement, options: GridOptions)
```

### Data API

| Method | Description |
|---|---|
| `setData(data)` | 데이터 설정 |
| `getData()` | 현재 표시 데이터 반환 |
| `insertRow(item, position?)` | 행 추가 (`'first'` / `'last'` / index) |
| `deleteRow(rowIndex)` | 행 삭제 (soft delete) |
| `pushRow(items)` | 끝에 행 추가 |
| `unshiftRow(items)` | 앞에 행 추가 |
| `readCell(rowIndex, field)` | 셀 값 읽기 |
| `writeCell(rowIndex, field, value)` | 셀 값 쓰기 |
| `reorderRow(from, to)` | 행 순서 이동 |

### Change Tracking API (v0.1.2)

| Method | Description |
|---|---|
| `getChanges()` | `{ added, edited, removed }` 한 번에 반환. edited 행에 `_changedFields` 포함 |
| `getEditedRows()` | 수정된 행만 반환 |
| `getAddedRows()` | 추가된 행 반환 |
| `getRemovedRows()` | 삭제된 행 반환 |
| `getChangedColumns()` | `{ row, fields, diff[] }` 컬럼 단위 diff (oldValue/newValue) |
| `getOriginalRow(rowIndex)` | 수정 전 원본 행 데이터 반환 |

### Footer / Subtotal API (v0.1.2)

| Method | Description |
|---|---|
| `setFooter(FooterDef[])` | 푸터 집계 설정 (SUM/AVG/MIN/MAX/COUNT, colspan, format) |
| `getFooterValue(field)` | 특정 필드 집계 결과 조회 |
| `getFooterData()` | 전체 푸터 집계 데이터 배열 반환 |

```typescript
grid.setFooter([
  { label: '합계', colspan: 2, align: 'left' },
  { field: 'salary', op: 'SUM', format: '#,##0',   align: 'right' },
  { field: 'rate',   op: 'SUM', format: '#,##0.00', align: 'right' }, // OGDecimal 정밀계산
  { field: 'score',  op: 'AVG', format: '#,##0.0',  align: 'right' },
]);

const total = grid.getFooterValue('salary'); // 숫자 반환
```

### Column Reorder API (v0.1.1)

```typescript
const grid = new OpenGrid('#container', {
  columns,
  columnReorder: true,                              // 헤더 드래그 활성화
  onColumnReorder: ({ fromIndex, toIndex, field }) => {
    console.log(`컬럼 이동: ${fromIndex} → ${toIndex} (${field})`);
  },
});

grid.applyColumns([...originalColumns]);  // 원래 순서로 복원
```

### Sort / Filter

| Method | Description |
|---|---|
| `orderBy(field, dir?)` | 정렬 |
| `resetOrder()` | 정렬 초기화 |
| `setFilter(field, items)` | 필터 설정 |
| `resetFilter(field?)` | 필터 초기화 |

### Grouping

| Method | Description |
|---|---|
| `groupBy(fields[])` | 그룹 설정 |
| `clearGroup()` | 그룹 해제 |
| `expandAll()` | 모두 펼치기 |
| `collapseAll()` | 모두 접기 |

### Tree Grid

| Method | Description |
|---|---|
| `enableTree()` | 트리 모드 활성화 |
| `disableTree()` | 트리 모드 비활성화 |
| `expandNodes(ids, open?)` | 특정 노드 펼치기/접기 |
| `expandAllNodes()` | 모두 펼치기 |
| `collapseAllNodes()` | 모두 접기 |

### Cell Merge

| Method | Description |
|---|---|
| `mergeCells(cells)` | 수동 병합 `[{row, col, rowSpan?, colSpan?}]` |
| `autoMerge(fields[])` | 연속 같은 값 자동 rowSpan |
| `clearMerge()` | 병합 해제 |

### Export

| Method | Description |
|---|---|
| `exportExcel(options?)` | Excel (.xlsx) 내보내기 |
| `exportCsv(options?)` | CSV 내보내기 |
| `exportJson(options?)` | JSON 내보내기 |

### UI

| Method | Description |
|---|---|
| `jumpToRow(rowIndex)` | 특정 행으로 스크롤 |
| `setTheme(theme)` | 테마 변경 (`'default'` / `'dark'`) |
| `resize(w?, h?)` | 크기 조정 |
| `destroy()` | 인스턴스 소멸 |

## GridOptions

```typescript
interface GridOptions {
  columns: ColumnDef[];      // 컬럼 정의 (필수)
  height?: number | string;  // 그리드 높이 (기본: '100%')
  width?: number | string;   // 그리드 너비 (기본: '100%')
  editable?: boolean;        // 인라인 편집 활성화
  editMode?: 'click' | 'dblclick'; // 편집 진입 방식
  sortable?: boolean;        // 정렬 활성화
  multiSort?: boolean;       // 멀티소트 (Shift+클릭)
  filterable?: boolean;      // 필터 UI 활성화
  rowNumber?: boolean;       // 행 번호 컬럼
  checkColumn?: boolean;     // 체크박스 컬럼
  stateColumn?: boolean;     // 상태 표시 컬럼 (✚/✎/✖)
  frozenColumns?: number;    // 고정 컬럼 수
  selection?: 'single' | 'multiple' | 'row';
  clipboard?: boolean;       // Ctrl+C/V 클립보드
  draggable?: boolean;       // 행 드래그앤드롭
  pagination?: boolean;      // 페이징 UI
  pageSize?: number;         // 페이지당 행 수
  treeId?: string;           // 트리 id 필드명 (기본: 'id')
  treeParentId?: string;     // 트리 parentId 필드명 (기본: 'parentId')
  expandOnLoad?: boolean;    // 트리 초기 전체 펼침
  summary?: SummaryOptions;  // 그룹 소계 설정
  theme?: 'default' | 'dark';
  defaultSort?: SortItem[];  // 초기 정렬

  // 이벤트 콜백
  onReady?: (grid: OpenGridInstance) => void;
  onCellClick?: (e: CellEvent) => void;
  onCellDblClick?: (e: CellEvent) => void;
  onRowClick?: (e: RowEvent) => void;
  onEditStart?: (e: EditEvent) => void;
  onEditEnd?: (e: EditEvent) => void;
  onSortChange?: (e: SortEvent) => void;
  onFilterChange?: (e: FilterEvent) => void;
  onDataChange?: (data: any[]) => void;
  onSelectionChange?: (e: SelectionEvent) => void;
  onRowDrop?: (e: { fromIndex: number; toIndex: number }) => void;
  onPageChange?: (e: PageEvent) => void;
  // v0.1.1+
  columnReorder?: boolean;                          // 헤더 드래그 컬럼 순서 변경
  onColumnReorder?: (e: { fromIndex: number; toIndex: number; field: string }) => void;
  // v0.1.2+
  footer?: FooterDef[];                             // 초기 푸터 설정
}
```

## ColumnDef

```typescript
interface ColumnDef {
  field: string;          // 데이터 필드명 (필수)
  header?: string;        // 헤더 텍스트
  width?: number;         // 컬럼 너비 (px)
  type?: 'text' | 'number' | 'date' | 'checkbox' | 'button' | 'badge' | 'link' | 'template';
  align?: 'left' | 'center' | 'right';
  editable?: boolean | ((row, rowIndex) => boolean);
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  hidden?: boolean;
  format?: string;        // 숫자 포맷 (예: '#,##0')
  children?: ColumnDef[]; // 그룹 헤더
  cellStyle?: CSSProperties | ((value, row, rowIndex) => CSSProperties);
  renderer?: (ctx: RenderContext) => HTMLElement;
}
```

## Performance

10만 행 기준 벤치마크 결과:

| 작업 | 시간 |
|---|---|
| 데이터 생성 | ~65ms |
| setData() | ~30ms |
| applySort (단일) | ~38ms |
| applySort (멀티) | ~40ms |
| applyFilter | ~17ms |
| buildGroups | ~3ms |
| buildTree | ~25ms |

## CSS Customization

CSS 변수로 완전한 테마 커스터마이즈 가능:

```css
.og-container {
  --og-primary: #1976d2;
  --og-header-bg: #f5f5f5;
  --og-row-bg: #ffffff;
  --og-row-alt-bg: #fafafa;
  --og-row-selected-bg: #bbdefb;
  --og-border-color: #e0e0e0;
  --og-font-size: 13px;
  --og-group-bg: #e8eaf6;
  --og-tree-toggle-color: #1976d2;
}
```

## Localization (i18n)

All built-in UI strings — labels, `aria-label`s, live-region announcements, tooltips, placeholders —
are kept in swappable locale catalogs, separated from the core. Ships with **`ko` (default) and `en`**.
Existing apps are unaffected: without a `locale`/`messages` option, output is byte-identical to before.

```ts
import { OpenGrid, localeRegistry } from 'open-grid';

// 1) Pick a built-in locale per instance
const grid = new OpenGrid(el, { columns, locale: 'en' });

// 2) Switch at runtime (re-labels chrome, updates the `lang` attribute, emits `localeChange`)
grid.setLocale('ko');

// 3) Override just a few messages for one instance
new OpenGrid(el, { locale: 'en', messages: { contextMenu: { sortAsc: 'Sort A→Z' } } });

// 4) Register a custom locale globally (partial dictionaries are fine — missing keys fall back)
localeRegistry.register('ja', { contextMenu: { find: '検索' }, pagination: { rowsPerPage: '行/ページ:' } });
new OpenGrid(el, { locale: 'ja' });
```

Fallback chain: instance override → active locale → `ko` (complete catalog) → raw key.
Number/date formatting and developer-facing error messages are intentionally out of scope
(use `Intl` and keep logs grep-stable). See the
[Localization guide](https://foxnail.kr/open-grid/demo/v2/guide/index.php) for the full key reference.

## Changelog

### v0.1.2 (2026-05-30)
- 변경 추적 API: `getChanges()` / `getEditedRows()` / `getChangedColumns()` / `getOriginalRow()`
- 합계/소계 푸터: `setFooter()` / `getFooterValue()` / `getFooterData()` — OGDecimal 정밀계산 (0.1×10=1.00)
- 개발 가이드 28챕터 완성 (Ch26 변경 추적, Ch27 합계/소계, Ch28 컬럼 리오더)
- 5프레임워크 예제(Vanilla/Vue/React/jQuery/Angular)에 변경 추적 + 합계/소계 섹션 추가
- E2E 테스트 `sprint30.spec.ts` 18개 추가

### v0.1.1 (2026-05-27)
- 컬럼 드래그 리오더: `columnReorder: true` / `onColumnReorder` 이벤트
- 개발 가이드 24챕터 → 27챕터 확장 (Ch22 마스킹, Ch23 조직도, Ch24 페이지네이션, Ch25 키보드)
- Sprint 29 E2E 25개 추가

### v0.1.0 (2026-05-24)
- 최초 공개 릴리즈

## License

MIT © OPEN_GRID Contributors

### Zero runtime dependencies (Excel still works out of the box)

`npm install open-grid` pulls **no external runtime dependencies** — the core grid is fully
self-contained.

**Excel export works out of the box, with nothing extra to install.** It uses SheetJS
(`xlsx-js-style`), which is **bundled inside the package** (in `dist/`) and loaded on demand
only when you actually export. You do **not** need to add `xlsx`/`xlsx-js-style` to your
project — they ship inside OPEN_GRID. (They are listed under `devDependencies` because they are
needed to *build* the bundle, not to *use* it.)

### Third-party licenses

The bundled Excel export uses **SheetJS Community Edition (`xlsx`)** and
**`xlsx-js-style`**, both licensed under the **Apache License, Version 2.0**
(© SheetJS LLC, and Brent Ely for the style fork). Their attribution notices
and the full license text are included in [`NOTICE`](NOTICE) and
[`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt).

> **As of 1.0.2**, these `NOTICE` and `THIRD_PARTY_LICENSES.txt` files are shipped
> inside the published package to satisfy the Apache-2.0 attribution requirements
> for the bundled components — resolving a potential license-compliance gap in
> earlier releases (≤ 1.0.1), which shipped only the MIT license without the
> required Apache-2.0 notices. OPEN_GRID's own MIT license is unchanged; MIT and
> Apache-2.0 are compatible, so this was an attribution fix only. See
> [`CHANGELOG.md`](CHANGELOG.md) for details.
