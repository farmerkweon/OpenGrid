# OPEN_GRID 사용 가이드 (for Claude / AI 세션)

> **이 문서의 목적**: 다른 Claude Code 세션(또는 사람 개발자)이 이 저장소를 처음 열었을 때
> OPEN_GRID를 빠르고 정확하게 사용·통합할 수 있도록 만든 **단일 진입점 가이드**입니다.
> 추측하지 말고 이 문서의 임포트 경로·API 시그니처를 그대로 사용하세요.

- **패키지명**: `open-grid`
- **현재 버전**: `0.3.0` (`package.json` 기준)
- **정체성**: Vue 3 / React 18 / Vanilla 어디서나 동작하는 프레임워크 비종속 고성능 데이터 그리드
- **코어 의존성**: 0개 (Excel export 시에만 `xlsx` 동적 import)
- **저장소 루트**: `E:\SETLLM\XGRID`

---

## 0. AI 세션이 가장 먼저 알아야 할 것 (TL;DR)

| 항목 | 값 |
|---|---|
| 메인 클래스 | `OpenGrid` (`import { OpenGrid } from 'open-grid'`) |
| 스타일 | `import 'open-grid/style.css'` **필수** (안 하면 레이아웃 깨짐) |
| Vue 컴포넌트 | `import { OpenGrid } from 'open-grid/vue'` (named, default 아님) |
| React 컴포넌트 | `import { OpenGrid } from 'open-grid/react'` (named, `OpenGridReact` 아님) |
| 생성 | `new OpenGrid(container, options)` — container는 셀렉터 문자열 또는 HTMLElement |
| 데이터 주입 | `onReady` 콜백 안에서 `grid.setData(rows)` (생성 직후 동기 호출도 가능) |
| 빌드 산출물 | `dist/` (배포본) · `open-grid-0.3.0.tgz` (설치용 패키지) |
| 타입 정의 | `dist/types/index.d.ts` — 모든 타입의 단일 진실 소스 |

> **핵심 주의 1**: `setData()`는 보통 `onReady` 안에서 호출합니다. 생성자에서 DOM 측정 후 ready가 emit됩니다.
> **핵심 주의 2**: 이 라이브러리는 **고유한 메서드명**을 씁니다. 셀 읽기는 `readCell`, 정렬은 `orderBy`, 스크롤은 `jumpToRow` 입니다. 다른 그리드의 API명(`getCellValue`, `sort`, `scrollToRow` 등)을 추측해서 쓰지 말고 이 가이드의 이름을 사용하세요.

---

## 1. 설치

### A. 이 저장소 안에서 개발할 때
이미 빌드되어 있다면 `dist/`를 그대로 쓰면 됩니다. 소스 변경 후에는:

```bash
npm install        # 최초 1회
npm run build      # tsc + vite build → dist/ 갱신
npm run test       # vitest 단위 테스트
npm run test:e2e   # playwright E2E
npm run dev        # vite 개발 서버 (예제 확인용)
```

### B. 다른 프로젝트에서 라이브러리로 소비할 때
배포 tgz를 직접 설치하는 것이 가장 확실합니다:

```bash
npm install /path/to/open-grid-0.3.0.tgz
# 또는 npm 레지스트리에 게시되어 있다면
npm install open-grid
```

`peerDependencies`는 모두 **optional**입니다. Vue/React를 안 쓰면 설치할 필요 없습니다.
- `react >= 18`, `react-dom >= 18`, `vue >= 3` (해당 프레임워크 래퍼를 쓸 때만)

---

## 2. 임포트 경로 (서브패스 export)

`package.json`의 `exports` 필드 기준 — 이 경로들만 유효합니다.

```ts
import { OpenGrid, OrgChart, XmlConverter } from 'open-grid';   // 코어
import 'open-grid/style.css';                                   // 스타일 (필수)

import { OpenGrid } from 'open-grid/vue';                       // Vue 3 컴포넌트 (named export)
import { OpenGrid } from 'open-grid/react';                     // React 18 컴포넌트 (named export)
```

> ⚠️ **export 이름 주의 (타입 정의 `dist/types/**`로 검증됨)**:
> - `open-grid/react`는 `OpenGridReact`를 `OpenGrid`라는 **이름으로 재export**합니다. 즉 `import { OpenGrid } from 'open-grid/react'`가 맞고, `import { OpenGridReact }`나 default import는 동작하지 않습니다.
> - `open-grid/vue`도 컴포넌트를 `OpenGrid`라는 **named export**로 내보냅니다. `import OpenGrid from 'open-grid/vue'`(default) 형태가 아니라 `import { OpenGrid }`(중괄호)를 사용하세요.
> - (코어 클래스 `OpenGrid`와 이름이 같지만 import 경로가 다르므로 혼동하지 마세요.)

타입도 코어에서 함께 export됩니다:

```ts
import type {
  GridOptions, ColumnDef, OpenGridInstance,
  CellEvent, EditEvent, RowEvent, SortItem, FilterItem,
  ExportOptions, FooterDef, SummaryOptions,
  TriggerContext, TriggerHandler, TriggerEvent,
} from 'open-grid';
```

---

## 3. Quick Start

### 3.1 Vanilla JS/TS

```ts
import { OpenGrid } from 'open-grid';
import 'open-grid/style.css';

const grid = new OpenGrid('#container', {
  columns: [
    { field: 'name',  header: '이름', width: 120 },
    { field: 'price', header: '금액', width: 100, type: 'number', align: 'right', format: '#,##0' },
    { field: 'date',  header: '날짜', width: 110, type: 'date' },
  ],
  editable: true,
  sortable: true,
  rowNumber: true,
  height: 500,

  onReady:     (g) => g.setData(myData),
  onCellClick: (e) => console.log(e.field, e.value),
  onEditEnd:   (e) => console.log(e.oldValue, '→', e.newValue),
});
```

### 3.2 Vue 3

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
import { OpenGrid } from 'open-grid/vue';   // named export (default 아님)
import 'open-grid/style.css';

const columns = [
  { field: 'name',  header: '이름', width: 120 },
  { field: 'price', header: '금액', width: 100, type: 'number', align: 'right' },
];
const rows = ref(myData);
</script>
```

> Vue 래퍼는 `data` / `columns`를 watch하여 반응형으로 갱신하고, 내부 `grid` 인스턴스를 `defineExpose`로 노출합니다.

### 3.3 React 18

```tsx
import { useState, useRef } from 'react';
import { OpenGrid } from 'open-grid/react';   // named export (OpenGridReact가 OpenGrid로 재export됨)
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

> 구현 컴포넌트의 원래 이름은 `OpenGridReact`이며, `open-grid/react` 진입점에서 `OpenGrid`라는 이름으로 재export됩니다.
> `forwardRef` 버전 `OpenGridWithRef`는 소스(`src/react/OpenGrid.tsx`)에 있으나 `open-grid/react` 서브패스에서는 재export되지 않습니다 — 필요하면 직접 경로로 가져오거나 index에 export를 추가하세요.

---

## 4. GridOptions (생성자 옵션)

```ts
interface GridOptions {
  columns: ColumnDef[];            // 필수
  height?: number | string;        // 기본 '100%'
  width?: number | string;         // 기본 '100%'
  editable?: boolean;
  editMode?: 'click' | 'dblclick';
  sortable?: boolean;
  multiSort?: boolean;             // Shift+클릭 멀티소트
  filterable?: boolean;
  rowNumber?: boolean;             // 행 번호 컬럼
  checkColumn?: boolean;           // 체크박스 컬럼
  stateColumn?: boolean;           // 상태 표시 컬럼 (✚ 추가 / ✎ 수정 / ✖ 삭제)
  frozenColumns?: number;          // 좌측 고정 컬럼 수
  selection?: 'single' | 'multiple' | 'row';
  clipboard?: boolean;             // Ctrl+C / Ctrl+V
  draggable?: boolean;             // 행 드래그앤드롭
  pagination?: boolean;
  pageSize?: number;
  treeId?: string;                 // 기본 'id'
  treeParentId?: string;           // 기본 'parentId'
  expandOnLoad?: boolean;
  summary?: SummaryOptions;        // 그룹 소계
  theme?: 'default' | 'dark';
  defaultSort?: SortItem[];
  columnReorder?: boolean;         // 헤더 드래그 컬럼 순서 변경 (v0.1.1+)
  footer?: FooterDef[];            // 초기 푸터 (v0.1.2+)
  tooltips?: boolean;              // 모든 셀에 native title(값) 자동 노출 (v0.3.1+). col.tooltip 이 우선

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
  onColumnReorder?: (e: { fromIndex: number; toIndex: number; field: string }) => void;
}
```

### ColumnDef

```ts
interface ColumnDef {
  field: string;                   // 필수
  header?: string;
  width?: number;                  // px
  type?: 'text' | 'number' | 'date' | 'checkbox' | 'button' | 'badge' | 'link' | 'template';
  align?: 'left' | 'center' | 'right';
  editable?: boolean | ((row, rowIndex) => boolean);
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  hidden?: boolean;
  wrap?: boolean;                  // 셀 줄바꿈 (v0.3.1+). nowrap+ellipsis 대신 여러 줄. rowHeight 확대와 함께 사용
  headerWrap?: boolean;            // 헤더(컬럼 제목) 줄바꿈. true 면 긴 제목이 잘리지 않고 여러 줄로. 헤더 높이 자동 확장
                                   // header 문자열에 '\n' 을 넣어도 동일하게 줄바꿈됨(headerWrap 생략 가능)
  tooltip?: string | ((value, row) => string);  // 셀 툴팁 (v0.3.1+). native title 노출
  format?: string;                 // 예: '#,##0', '#,##0.00'
  children?: ColumnDef[];          // 그룹 헤더 (헤더 병합)
  cellStyle?: CSSProperties | ((value, row, rowIndex) => CSSProperties);
  renderer?: (ctx: RenderContext) => HTMLElement;  // 커스텀 셀 렌더러
}
```

#### 헤더 줄바꿈 — `headerWrap` / `\n`

컬럼 제목(머리글)이 길어서 한 줄에 다 표시되지 않을 때 `headerWrap: true`를 설정하면, 제목이 잘리지 않고 여러 줄로 꺾여 표시됩니다. 줄바꿈이 일어난 만큼 헤더 높이가 자동으로 늘어나며, 늘어난 높이는 즉시 측정되어 본문(스크롤 영역)을 그만큼 줄여 주므로 헤더가 본문을 덮는 일은 생기지 않습니다. 셀 본문의 `wrap` 옵션과 독립적으로 동작하기 때문에, 가상 스크롤 그리드에서도 `rowHeight`를 변경하지 않고 그대로 사용할 수 있습니다.

원하는 위치에서 직접 줄을 바꾸고 싶을 때는 `header` 문자열 안에 줄바꿈 문자 `\n`을 넣으세요. `headerWrap` 옵션 없이도 그 자리에서 바로 줄이 바뀝니다.

```js
const grid = new OpenGrid(el, {
  columns: [
    { field: 'name',   header: '판매 담당자 전체 이름', width: 90, headerWrap: true }, // 길면 자동 줄바꿈
    { field: 'qty',    header: '판매\n수량',  width: 80,  type: 'number' },            // '판매' / '수량' 두 줄
    { field: 'amount', header: '월간\n매출액', width: 110, type: 'number' },
  ],
});
```

> **주의(MIN-3):** `headerHeight` 옵션은 헤더 높이의 **하한**이다 — 줄바꿈으로 더 필요하면 자동으로 늘지만, 실제 헤더보다 큰 값을 주면 그만큼 빈 공간이 생긴다.

설정하지 않은 컬럼은 기존과 동일하게 한 줄 + 말줄임(`...`)으로 표시됩니다.

> **임베드 격리 (v0.3.1+)** — 그리드를 WordPress 글 등 임의 호스트에 임베드할 때, 호스트 테마의
> `table/th/td` 스타일이 헤더로 침범하던 문제를 코어에서 차단한다(헤더 시각 속성 인라인 고정).
> 컨텍스트 메뉴는 `document.body` 에 부착되어 transform 조상 아래에서도 마우스 좌표에 정확히 표시된다.

---

## 5. 메서드 API 요약

### 데이터
| 메서드 | 설명 |
|---|---|
| `setData(data)` | 데이터 설정 |
| `getData()` | 현재 표시 데이터 |
| `insertRow(item, position?)` | 행 추가 (`'first'` / `'last'` / index) |
| `deleteRow(rowIndex)` | 행 삭제 (soft delete — 상태만 removed로 표시) |
| `pushRow(items)` / `unshiftRow(items)` | 끝/앞에 추가 |
| `readCell(rowIndex, field)` | 셀 값 읽기 |
| `writeCell(rowIndex, field, value)` | 셀 값 쓰기 |
| `reorderRow(from, to)` | 행 순서 이동 |

### 변경 추적 (v0.1.2+) — 폼/저장 로직에 핵심
| 메서드 | 설명 |
|---|---|
| `getChanges()` | `{ added, edited, removed }` 한 번에. edited 행엔 `_changedFields` 포함 |
| `getEditedRows()` / `getAddedRows()` / `getRemovedRows()` | 상태별 행 |
| `getChangedColumns()` | `{ row, fields, diff[] }` 컬럼 단위 diff (oldValue/newValue) |
| `getOriginalRow(rowIndex)` | 수정 전 원본 행 |

### 푸터/소계 (v0.1.2+, OGDecimal 정밀계산)
| 메서드 | 설명 |
|---|---|
| `setFooter(FooterDef[])` | 푸터 집계 설정 (SUM/AVG/MIN/MAX/COUNT, colspan, format) |
| `getFooterValue(field)` | 특정 필드 집계값 |
| `getFooterData()` | 전체 집계 배열 |

```ts
grid.setFooter([
  { label: '합계', colspan: 2, align: 'left' },
  { field: 'salary', op: 'SUM', format: '#,##0',   align: 'right' },
  { field: 'rate',   op: 'SUM', format: '#,##0.00', align: 'right' }, // 0.1×10 = 정확히 1.00
]);
const total = grid.getFooterValue('salary');
```

### 정렬 / 필터
| 메서드 | 설명 |
|---|---|
| `orderBy(field, dir?)` / `resetOrder()` | 정렬 / 초기화 |
| `setFilter(field, items)` / `resetFilter(field?)` | 필터 / 초기화 |

### 그룹 / 트리
| 메서드 | 설명 |
|---|---|
| `groupBy(fields[])` / `clearGroup()` | 그룹 설정 / 해제 |
| `expandAll()` / `collapseAll()` | 그룹 펼침/접기 |
| `enableTree()` / `disableTree()` | 트리 모드 |
| `expandNodes(ids, open?)` / `expandAllNodes()` / `collapseAllNodes()` | 트리 노드 제어 |

### 셀 병합
| 메서드 | 설명 |
|---|---|
| `mergeCells([{row, col, rowSpan?, colSpan?}])` | 수동 병합 |
| `autoMerge(fields[])` | 연속 동일값 자동 rowSpan |
| `clearMerge()` | 병합 해제 |

### 선택 / 컬럼
| 메서드 | 설명 |
|---|---|
| `getSelections()` | 선택된 행 배열 |
| `applyColumns(columns[])` | 컬럼 재적용 (리오더 복원 등) |

### 내보내기 / UI
| 메서드 | 설명 |
|---|---|
| `exportExcel(options?)` / `exportCsv(options?)` / `exportJson(options?)` | 내보내기 |
| `jumpToRow(rowIndex)` | 특정 행으로 스크롤 |
| `setTheme(theme)` / `setThemeVar(key, value)` | 테마 / CSS 변수 |
| `resize(w?, h?)` | 크기 조정 |
| `destroy()` | 인스턴스 소멸 (메모리 해제 — SPA 언마운트 시 호출 권장) |

### 동작 커스터마이즈 ({{OVERRIDE_SINCE}}+) — 상세는 §13
| 메서드 | 설명 |
|---|---|
| `override(name, fn)` | 공개 메서드 동작을 소스 수정 없이 한 겹 감싸 변경 (✅ 순수 래핑) |
| `override.strategy(slot, fn)` | 내부 알고리즘 슬롯 6종 교체 (🔧 매니저 훅 선행) |
| `restore(name)` / `restoreAll()` | 한 메서드 / 전부 복원 (`destroy()` 시 자동) |

---

## 6. 트리거 시스템 (작업 가로채기/후처리)

`addTrigger(event, handler)` — 작업 전/후에 끼어들거나 취소할 수 있습니다.

```ts
// before:* 핸들러에서 ctx.cancel() → 해당 작업 자체가 중단됨
grid.addTrigger('before:deleteRow', (ctx) => {
  if (!confirm('정말 삭제할까요?')) ctx.cancel();
});

// after:* / complete 에서는 ctx.result로 결과 확인
grid.addTrigger('after:writeCell', (ctx) => {
  console.log('변경 인자:', ctx.args, '결과:', ctx.result);
});
```

지원 이벤트 (`TriggerEvent`):
`before|after:setData`, `…:insertRow`, `…:deleteRow`, `…:writeCell`, `…:applyColumns`,
`…:orderBy`, `…:setFilter`, `…:groupBy`, 그리고 모든 작업 후 공통 호출되는 `complete`.

`TriggerContext` 주요 필드: `operation`, `args[]`, `result?`, `cancelled`, `extra?`, `timestamp`, `cancel()`.

---

## 7. 고급 기능 (코어에 포함)

`src/core/`에 구현된 추가 엔진들 — 필요 시 해당 API/타입을 직접 확인하세요.

| 기능 | 모듈 | 비고 |
|---|---|---|
| 데이터 마스킹 (10종) | `MaskingEngine.ts` | 셀/컬럼 단위 토글, `maskOnExport` |
| 조직도 | `OrgChart.ts` | `import { OrgChart } from 'open-grid'`, 테마 연동 |
| 수식 셀 | `FormulaEngine.ts` | formula 컬럼 (v0.2.0에서 cellClick 버그 수정) |
| 피벗 | `PivotEngine.ts` | 집계 피벗 |
| 워크시트 / SAP / XML | `WorksheetManager.ts`, `XmlConverter.ts` | `XmlConverter` export, SAP-core 파싱 |
| 정밀 소수 | `OGDecimal.ts` | 푸터/집계 누적오차 제거 |
| Find Bar | `FindBarManager.ts` | 인-그리드 검색 |
| 컨텍스트 메뉴 | `ContextMenu.ts` | 우클릭 메뉴 |

---

## 8. 키보드 단축키 (WCAG 2.2 준수)

| 키 | 동작 |
|---|---|
| 방향키 | 셀 이동 |
| Tab / Shift+Tab | 다음/이전 셀 |
| F2 / Enter | 편집 시작 |
| Esc | 편집 취소 / 포커스 해제 |
| Ctrl+C / Ctrl+V | 클립보드 복사/붙여넣기 (`clipboard: true`) |

---

## 9. 스타일 / 테마 커스터마이즈

CSS 변수로 완전 커스터마이즈 가능. 12개 내장 테마 (default, dark, ocean, forest …).

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

런타임 변경: `grid.setTheme('dark')` 또는 `grid.setThemeVar('--og-primary', '#e91e63')`.

---

## 10. 성능 (10만 행 기준)

| 작업 | 시간 |
|---|---|
| setData() | ~30ms |
| applySort (단일/멀티) | ~38–40ms |
| applyFilter | ~17ms |
| buildGroups | ~3ms |
| buildTree | ~25ms |

가상 스크롤(rAF + 행 풀링)로 100k+ 행을 부드럽게 렌더링합니다.

---

## 11. 참고 자료 (저장소 내부)

| 위치 | 내용 |
|---|---|
| `README.md` | 공식 README (이 가이드의 원본) |
| `CHANGELOG.md` | 버전별 변경 이력 (현재 0.3.0) |
| `dist/types/index.d.ts` | **모든 타입의 정확한 정의** — 추측 대신 여기 확인 |
| `src/core/types.ts` | 소스 레벨 타입 정의 |
| `src/core/OpenGrid.ts` | 메인 클래스 구현 |
| 🔗 [라이브 데모](https://foxnail.kr/open-grid/demo/v2/index.php) | 프레임워크별 동작 예제 · override 데모 OV-01~OV-32 (foxnail.kr) |
| 🔗 [개발 가이드](https://foxnail.kr/open-grid/demo/v2/guide/index.php) | 40개 챕터 · 퀵스타트 · 고급 커스터마이즈(override/strategy, ch36~ch40) · AI override 레퍼런스 |

---

## 12. AI 세션이 흔히 하는 실수 (체크리스트)

- ❌ `import 'open-grid/style.css'` 빠뜨림 → 레이아웃 깨짐. **항상 import.**
- ❌ `grid.getCellValue()` / `grid.sort()` 등 다른 그리드 API 추측 사용 → 존재하지 않음. `readCell` / `orderBy` 사용.
- ❌ 생성 직후 ready 전에 DOM 접근 → `onReady` 콜백 안에서 작업.
- ❌ React/Vue에서 매 렌더마다 새 `columns`/`data` 객체로 의도치 않은 재생성 → 안정적 참조 유지.
- ❌ SPA에서 언마운트 시 `destroy()` 미호출 → 메모리/이벤트 누수.
- ❌ 삭제가 즉시 사라질 거라 가정 → `deleteRow`는 soft delete. 실제 제거 행은 `getRemovedRows()`로 수집해 서버에 반영.
- ✅ 타입이 모호하면 추측하지 말고 `dist/types/index.d.ts`를 읽을 것.
- ❌ `orig`(원본)를 안 부르고 override → 원래 동작이 통째로 사라짐. 결과만 바꿀 때도 `const r = orig(...args)` 후 가공 (§13).
- ❌ `setData`만 override하고 `pushData`로 증분 추가 → 포장이 안 먹음(비대칭). `pushData`도 따로 override (§13).
- ❌ 정렬 비교·필터 판정 같은 *알고리즘*을 일반 override로 바꾸려 함 → 안 됨. `override.strategy(slot, fn)` 사용 (§13).

---

## 13. 동작 커스터마이즈 — `override` / `strategy` ({{OVERRIDE_SINCE}}+)

> 이 절은 **인간 개발자용 압축 요약 + 길찾기**입니다.
> **AI 코딩 에이전트(LLM)는 반드시 `docs/design/v1.0/AI_OVERRIDE_GUIDE.md`를 정본(authoritative reference)으로 참조**하세요.
> 메서드 전수표·6슬롯 시그니처·anti-hallucination 규칙은 그 문서가 단일 진실 소스이며, 여기에는 중복하지 않습니다.
> 단계별 학습이 필요한 사람 개발자는 `guide/index.html`의 ch36~ch40(고급 커스터마이즈)을 보세요.

`override`는 그리드의 **공개 메서드 동작을 소스 수정 없이 런타임에 한 겹 감싸**(포장지) 바꾸는 기능입니다.
이벤트(`on`)는 *알림만*, 트리거(`addTrigger`, §6)는 *8개 작업의 취소/관찰만* 가능합니다 — **반환값이나 내부 알고리즘은 둘 다 못 바꿉니다.** `override`가 바로 그 빈틈을 메웁니다.

### 13.1 확정 API (이 6줄이 전부)

```ts
grid.override(name, (orig, ...args) => result)   // ✅ 공개 메서드 순수 래핑(소스 0줄, ~104개 메서드)
grid.override.strategy(slot, fn)                  // 🔧 내부 알고리즘 슬롯 교체(매니저 훅 1줄 선행, 6슬롯)
grid.restore(name)                                // 한 메서드 복원
grid.restoreAll()                                 // 전부 복원 (destroy() 시 자동 실행)
OpenGrid.defaultOverride(name, fn)                // 정적 전역 기본(생성자 말미 적용 — 앞으로 만들 모든 그리드)
OpenGrid.defaults.strategy(slot, fn)              // 정적 전역 슬롯 기본
```

- `orig`는 **`super`처럼** 동작합니다. 부르면 원래(다음 안쪽) 동작이 실행되고, 안 부르면 원래 동작은 일어나지 않습니다.
- 같은 메서드에 여러 번 override하면 **합성**됩니다(양파 껍질). **먼저 등록=안쪽, 나중 등록=바깥**. `[fn1,fn2,fn3]`이면 실행 모양은 `fn3(fn2(fn1(원본)))` — 나중에 건 fn3가 가장 바깥에서 제일 먼저 실행됩니다(FIFO `reduce` 좌측폴드).
- override 안에서 에러가 나면 **기본은 strict(그대로 전파)** — 조용히 넘기지 않습니다. 부분 부작용 후 원본 재실행은 이중 적용 위험이라 그렇습니다. (`{ onError: 'fallback' }`은 멱등 보장 시에만, 롤백 불가)
- 재진입 가드: `writeCell` 안에서 또 `writeCell`을 부르는 정당한 연쇄는 **깊이 제한(기본 32) 안에서 허용**, 진짜 사이클만 차단. 필요 시 `{ reentrant: true }`.
- `grid.destroy()`는 **자동으로 `restoreAll`**을 실행하므로(원본 destroy 보장), SPA 언마운트 시 destroy만 부르면 정리가 끝납니다.

### 13.2 트리거 vs override — 언제 무엇을 (결정표)

§6 트리거 시스템과 **역할이 다릅니다.** 아래 기준으로 고르세요.

| 하고 싶은 것 | 도구 |
|---|---|
| 작업 *알림만* 받기 | `on()` 이벤트 |
| 작업을 *취소*하거나 *입력 인자만* 바꾸기 (8개 작업: setData/insertRow/deleteRow/writeCell/applyColumns/orderBy/setFilter/groupBy) | `addTrigger`(§6) |
| **반환값을 바꾸기** / 트리거가 없는 메서드를 가로채기 / 빈 스텁 채우기 | `grid.override(name, fn)` |
| **내부 알고리즘 교체**(정렬 비교·필터 판정·표시 포맷·내보내기 직렬화·그룹 키·집계) | `grid.override.strategy(slot, fn)` 🔧 |

> 🔧 표시는 "매니저 본문에 훅포인트 1줄이 빌드에 선행돼야 동작"한다는 뜻입니다(✅ 순수 래핑과 구분). strategy 슬롯은 6종 고정: `sortComparator`, `filterPredicate`, `displayFormatter`, `cellSerializer`, `groupKeyFn`, `summaryOp`.

### 13.3 ⚠️ 비대칭 경고 (가장 흔한 조용한 실패)

`pushData` / `prefixData` / `pushRow` / `unshiftRow`는 내부에서 facade `setData()`를 **경유하지 않습니다**(증분 로더가 옆문으로 들어옴). 따라서:

- `grid.override('setData', …)`와 `before/after:setData` 트리거는 **증분 로드에 적용되지 않습니다.**
- 증분 로드에도 같은 정규화/검증을 적용하려면 `pushData`를 **따로 override**해야 합니다.

```ts
const normalize = (d) => d.map(r => ({ ...r, name: r.name?.trim() }));
grid.override('setData',  (o, d) => o(normalize(d)));
grid.override('pushData', (o, d) => o(normalize(d)));   // 증분 커버를 위해 필수
```

### 13.4 더 보기

- **사람용 단계별 학습 코스 · AI 정본 · 동작 데모**: [foxnail.kr 개발 가이드](https://foxnail.kr/open-grid/demo/v2/guide/index.php) ch36~ch40(override 개념·합성·복원·strategy 슬롯·inject·안전장치) 및 [라이브 데모](https://foxnail.kr/open-grid/demo/v2/index.php) OV-01~OV-32.

---

*문서 버전: OPEN_GRID v1.0.0 기준 · 최종 작성 2026-06-22 (override 섹션 추가)*
