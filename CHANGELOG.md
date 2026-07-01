# Changelog

All notable changes to OPEN_GRID will be documented in this file.

## [1.0.8] - 2026-07-01

### Fixed
- **`grid.override('getDisplayValue')` 커스터마이징이 셀 화면에 반영되지 않던 버그 수정** —
  텍스트·불리언 등 셀 렌더 경로가 내부적으로 `getDisplayValue()`를 거치지 않아,
  `getDisplayValue`를 오버라이드해도 셀에 표시되는 값이 바뀌지 않던 문제를 고쳤다.
  이제 렌더러가 인스턴스 콜백을 통해 `getDisplayValue()` 결과를 표시값으로 사용한다.
  오버라이드·전략이 등록되지 않은 경우 기존 렌더 경로로 폴백하므로 기존 동작은
  100% 보존된다(출력 바이트 동일, 회귀 없음). 단위 테스트 408건 통과.

## [1.0.7] - 2026-06-27

### Fixed
- **워크시트(다중 시트) 데이터 미표시 버그 수정** — `addWorksheet()`로 시트를 추가하거나 탭을
  전환할 때 헤더·탭은 그려지지만 **데이터 행이 렌더되지 않던** 문제를 고쳤다. 원인은 시트 전환
  콜백이 내부 데이터만 갱신하고 가상 스크롤(virtual scroll)의 총 행수를 갱신하지 않아 보이는
  행 범위가 비어 있었던 것. 시트 전환 시 `setData`와 동일한 경로(총 행수·aria·컬럼 폭 재계산)를
  거치도록 통합해 시트마다 컬럼 구성이 달라도 올바르게 표시된다.

## [1.0.6] - 2026-06-26

### Changed
- 메타데이터·문서 정리(기능·동작 변경 없음). 발행 패키지를 경량화(소스맵 제외)했다.

## [1.0.5] - 2026-06-24

### Changed
- **런타임 의존성 0 (zero runtime dependencies)** — Excel 내보내기에 쓰이는 `xlsx`·`xlsx-js-style`을
  `dependencies` → `devDependencies`로 옮겼다. 이들은 **빌드 시 `dist/`에 번들로 포함**되므로
  (`src`의 `import('xlsx-js-style')`가 빌드 과정에서 `dist/xlsx.min-*.js` 청크로 변환됨),
  설치하는 쪽에서 별도로 받을 필요가 없다 — `npm install open-grid`는 외부 런타임 의존성을
  하나도 끌어오지 않는다. **Excel 내보내기는 번들된 SheetJS로 그대로 동작**한다(설치 불필요).
  코드·동작 변경 없음(의존성 분류만 정정). 번들된 SheetJS는 Apache-2.0이며 `NOTICE`/`THIRD_PARTY_LICENSES.txt`로 귀속 표기됨.

## [1.0.4] - 2026-06-24

### Changed
- **소개 문구(intro) 추가** — README 상단과 npm `description`에 제품 소개 문구를 추가하고
  npm 배지 버전 표기를 현행화했다. 코드·기능 변경 없음(문서/메타데이터만).
  ("zero-dependency **core**" — Excel 내보내기는 SheetJS를 번들하므로 "코어 무의존"으로 정확히 표기.)

## [1.0.3] - 2026-06-24

### Changed
- **라이선스 준수 내역을 배포 패키지에 명시** — 발행 tarball에 `CHANGELOG.md`를 포함하고,
  README·변경 이력에 1.0.2의 라이선스 컴플라이언스 조치(아래)를 명확히 기재했다.
  코드·기능 변경 없음(문서/배포 메타데이터만).

## [1.0.2] - 2026-06-24

### Fixed — 라이선스 컴플라이언스 (잠재적 라이선스 위반 소지 해소)
- **문제** — Excel 내보내기 기능에 쓰이는 `xlsx`(SheetJS Community Edition)와
  `xlsx-js-style`는 **Apache License 2.0** 라이선스이며 빌드 결과물(`dist/`)에 번들되어
  함께 배포된다. 그런데 1.0.1까지의 배포 패키지에는 OPEN_GRID 자체의 **MIT LICENSE만**
  들어 있고, Apache-2.0가 재배포 시 요구하는 **라이선스 사본과 저작권 귀속 고지가 누락**
  되어 있었다(Apache-2.0 §4(a)·§4(c) 미충족 → **잠재적 라이선스 위반 소지**).
- **해결** — 배포 패키지에 다음을 추가하고 `files`에 포함해 함께 배포한다:
  - `THIRD_PARTY_LICENSES.txt` — Apache License 2.0 **전문** + 번들 구성요소 식별·저작권 고지
  - `NOTICE` — SheetJS LLC(`xlsx`) 및 SheetJS LLC·Brent Ely(`xlsx-js-style`) 저작권 귀속
  - README에 "Third-party licenses" 안내 추가
- **영향 범위** — OPEN_GRID 본체 라이선스(MIT)와 코드는 **변경 없음**. MIT와 Apache-2.0는
  서로 호환되어 **라이선스 충돌은 없으며**, 누락돼 있던 Apache-2.0 **귀속 의무만 충족**시킨
  조치다.

## [1.0.1] - 2026-06-24

### Fixed
- **그리드 초기화 크래시 수정** — `summary` 푸터를 사용하는 그리드를 생성할 때
  `Cannot read properties of undefined (reading 'getStrategy')` 로 초기화가 실패하던 문제.
  생성자에서 OverrideKernel 부착(및 strategy resolver 배선)을 최초 마운트 **이전**으로
  옮겨, 초기 푸터/그룹 렌더가 strategy 슬롯을 조회할 때 커널이 항상 준비되도록 했다.
  (피벗·집계 푸터·그룹 합계 등 `summary`/`footer` 옵션을 쓰는 모든 구성에 영향.)

## [1.0.0] - 2026-06-23

첫 정식 메이저 릴리스. 본문(코어) 코드 무수정으로 동작을 확장하는 `grid.override()` API와 헤더 줄바꿈을 추가.

### Added
- **`grid.override()` — 본문 무수정 동작 확장 API** (신규 `src/core/OverrideKernel.ts`)
  - `grid.override(name, (orig, ...args) => result)` — 메서드 래핑. `orig()`는 `super`처럼 항상 호출 가능.
    합성 순서는 FIFO 좌측폴드(나중에 건 것이 가장 바깥), 재진입 깊이 32 + 사이클 가드.
  - `grid.override.strategy(slot, fn)` — 6개 알고리즘 슬롯 교체: 정렬 비교(sortComparator),
    필터 술어(filterPredicate), 표시 포맷터(displayFormatter), 엑셀 직렬화(cellSerializer),
    그룹 키(groupKeyFn), 집계 연산(summaryOp).
  - `grid.restore(name)` / `grid.restoreAll()` — 원복. `destroy()` 시 자동 전체 복원.
  - `OpenGrid.defaultOverride(name, fn)` / `OpenGrid.defaults.strategy(slot, fn)` — 전역(앞으로 생성될 모든 그리드) 기본 오버라이드.
  - 오류는 기본(strict) 그대로 전파. 기존 메서드 본문은 한 줄도 수정하지 않음(C1 원칙 준수).
- **헤더 줄바꿈** — `ColumnDef.headerWrap?: boolean` + 헤더 문자열 `\n` 줄바꿈 + 헤더 높이 자동 확장.
- **override 데모 32종 × 5 프레임워크**(Vanilla/React/Vue/jQuery/Angular) — `examples/override/`, 허브 포함.
- **그리드 튜닝 참고자료 페이지** — 아키텍처/시퀀스 UML 다이어그램 기반 내부 동작 설명.
- **AI 에이전트용 override 가이드**(KO/EN) + 개발 가이드 override 챕터.

### Tests
- override 코어 + 헤더 줄바꿈 단위 테스트 추가. 전체 테스트 통과(회귀 0).

## [0.3.2] - 2026-06-18

### Fixed
- **셀 줄바꿈(col.wrap)이 실제로 꺾이지 않던 문제** — `.og-cell--wrap` 는 셀에 적용됐지만, 내부 텍스트
  span(`.og-cell-text`)을 렌더러가 인라인 `white-space:nowrap` 으로 렌더해 클래스만으로는 못 이겼다.
  `.og-cell--wrap .og-cell-text/.og-cell-date { white-space: normal !important; text-overflow: clip !important }`
  로 인라인을 무력화. e2e 도 셀이 아닌 **내부 span + 실제 줄 수**를 검증하도록 강화.
  (npm `open-grid@0.3.1` 은 이 수정 직전에 발행되어 wrap 미동작 → **0.3.2 로 재발행**, npm latest = 0.3.2.)

## [0.3.1] - 2026-06-17

### Fixed
- **Host CSS isolation — 임베드 시 호스트 테마 CSS inbound 상속으로 레이아웃/색상 깨짐** (foxnail.kr/WordPress 통합에서 발견)
  - 원인: 헤더가 실제 `<table>`/`<th>` 라서, 임베드 호스트(WordPress 등)의 element/높은 특이도 셀렉터
    (`th,td`, `.entry-content th`, `.fn-post-content th` 등)가 그리드 헤더로 침범 — `line-height`, `border`,
    `background`, `color`, `table{margin}` 등이 새어들어와 헤더가 깨지거나 호스트 색(navy/white)으로 칠해짐.
    바디는 `<div>` 라 안전. (헤더 `<th>` 는 element 셀렉터라 그리드의 클래스/상속값을 이김)
  - `src/core/GridRenderer.ts` — 헤더 `<th>` 의 모든 시각 속성을 **인라인으로 고정**(인라인이 호스트 셀렉터를 이김):
    `background`/`color`/`line-height`/`font-size`/`vertical-align`/`border-top·left` (data + extra/rownumber/check 컬럼 전부).
    헤더 `<table>` 에 `og-header-table` 클래스 부여 + 인라인 `margin:0;border-spacing:0`.
  - `src/styles/base.css` — `.og-container { line-height: normal }` (바디 셀 메트릭 격리) 및 헤더 클래스 기본 방어.
  - **WordPress 전역 스타일 `:where([style*="border-color"]){border-style:solid}` 대응** — 그리드 인라인 보더가
    `var(--og-border-color)` 를 참조해 "border-color" 문자열에 매칭되면, 폭 미지정 변에 `medium`(3px) 보더가
    강제돼 헤더(`.og-header`)·그룹행·병합셀의 좌/우/상에 굵은 선이 생기고 바디 컬럼선과 어긋나던 문제 수정.
    `GridRenderer.ts` 의 단일변 인라인 보더에 `border:0` 선행(미지정 변 폭 0 명시). 테마 무관(전 테마 동일 적용).
- **컨텍스트메뉴 위치 — 임베드 호스트의 transform 조상 아래에서 마우스 좌표를 벗어남** (그리드 너비 확대 시 두드러짐)
  - `src/core/ContextMenu.ts` — 메뉴를 그리드 컨테이너 대신 `document.body` 에 부착 → `position:fixed` 가
    항상 뷰포트 기준으로 동작. 테마 변수 보존을 위해 `data-og-theme` 복사 + `.og-context-menu` 에 `--og-cm-*` 정의 확장.

### Added
- **셀 툴팁** — `column.tooltip`(문자열|함수) 또는 그리드 옵션 `tooltips: true`(모든 셀에 값 자동 노출).
  헤더 셀도 `title` 노출(잘린 헤더 가독성).
- **셀 줄바꿈(wrap)** — `column.wrap: true` 시 nowrap+ellipsis 대신 여러 줄 표시(`white-space:normal`).
  가상 스크롤 고정 행 높이와 함께 `rowHeight` 확대 권장.
- 회귀 테스트: `test/e2e/host-isolation.spec.ts` + 적대적 호스트 픽스처 `examples/host-isolation/`
  (line-height/border/margin/색상 격리 + 컨텍스트메뉴 transform 조상 + 툴팁/wrap, before/after 변별 — 10 케이스).

## [0.3.0] - 2026-06-05

### Added
- **개발 가이드 DB화 완성** — 39개 섹션 전체 SQLite DB화 (G1~G6)
  - G1: 시작하기 (npm 설치, 퀵스타트, 기본 설정)
  - G2: 데이터/옵션 (컬럼 정의, 데이터 옵션, 선택/체크박스/DnD/상태 관리)
  - G3: 편집/이벤트 (셀 편집, 셀 타입, 마스킹, 병합, 이벤트, 트리거)
  - G4: 그룹/페이징 (그룹, 트리, 푸터, 페이지네이션, 파인드바, 키보드)
  - G5: 고급/내보내기 (피벗, 워크시트, SAP, XML, 수식, 조직도, Excel/CSV/인쇄)
  - G6: 스타일/API (테마, 커스텀, 폰트, 사이징, 접근성, 그리드/컬럼/이벤트 API)
- **전 프레임워크 데모 완성** — React / Vue / jQuery / Angular / Vanilla 각 49개 섹션
  - Angular A~H: AngularJS 1.x CDN 기반, `$scope.$apply` 없이 ng-show/ng-hide 패턴
- **Guide 렌더러** — `lang='html'` 감지 시 innerHTML 직접 주입 방식으로 전환 (pre/code 래핑 없음)

## [0.2.0] - 2026-06-04

### Fixed
- **Formula 셀 클릭 버그** — `CellEventHandler.ts`: formula 컬럼 cellClick 시 `e.value`가 `undefined`이던 문제 수정
  - `row[col.field]` 대신 `evaluateFormula()`로 직접 계산 후 주입

### Added
- **React 데모** — `demo-react/index.php` 신규 (React 18 CDN, `useRef+useEffect+createRoot` 패턴)
- React 프레임워크 전 섹션(A~H, 49개) DB 삽입 완료
- 선택/필터셀렉트 API 버그 수정 (`getSelections()`, `valueMap` 기반 표시)

## [0.1.2] - 2026-05-30

### Added (Sprint 29 추가분)
- **변경 추적 API 보강**
  - `getChanges()` — `{ added, edited, removed }` 한 번에 반환. edited 행에 `_changedFields` 포함
  - `getEditedRows()` — 수정된 행만 반환 (기존 `getChangedRows()` 개선판)
  - `getChangedColumns()` — `{ row, fields, diff[] }` 형태로 컬럼 단위 diff 반환 (oldValue/newValue 포함)
  - `getOriginalRow(rowIndex)` — 수정 전 원본 행 데이터 반환
- **합계 / 소계 (Footer)**
  - `setFooter(FooterDef[])` — 런타임 푸터 설정 (SUM/AVG/MIN/MAX/COUNT)
  - `getFooterValue(field)` — 특정 필드 집계 결과 조회
  - `getFooterData()` — 전체 집계 데이터 배열 조회
  - OGDecimal 기반 정밀 계산 — 소수점 누적 오류 없음 (0.1 × 10 = 정확히 1.00)
  - 데이터 수정/추가/삭제 시 푸터 자동 재계산
- **Guide** — Ch26(변경 추적), Ch27(합계/소계) 추가 → 총 27챕터
- **Vanilla 데모** — '변경 추적' 섹션, '합계/소계' 섹션 추가

## [0.1.1] - 2026-05-30

### Added (Sprint 29)
- **columnReorder** — `columnReorder: true` 옵션으로 헤더 드래그 컬럼 순서 변경 지원
  - `onColumnReorder` 이벤트 콜백 (`{ fromIndex, toIndex, field }`)
  - 드래그 중 시각 피드백 (`og-col-dragging` / `og-col-drop-over` CSS 클래스)
- **Guide** — 개발 가이드 4개 챕터 신규 추가 (Ch22~Ch25)
  - Ch22: 데이터 마스킹 (10종 타입, 셀/컬럼 단위 해제, maskOnExport)
  - Ch23: 조직도 (OrgChart API, setData, expandAll/collapseAll, 테마 연동)
  - Ch24: 페이지네이션 (API, 서버사이드, React/Vue 예제)
  - Ch25: 키보드 단축키 (WCAG 2.2 준수 표, aria-label 설정)
- **E2E Tests** — sprint29.spec.ts 25개 시나리오 추가
  - checkColumn 선택/해제, 컨텍스트 메뉴 렌더링/닫힘, 테마 전환(data-og-theme), 키보드 네비게이션, 셀 편집, 정렬(aria-sort)

### Changed
- `GridRenderer` 내부 콜백에 `onColDragStart` / `onColDrop` / `getColDragIdx` 추가

## [0.1.0] - 2026-05-24

### Added
- **Core Engine**
  - `OpenGrid` class — main grid instance with `new OpenGrid(container, options)` API
  - `DataLayer` — CRUD, state tracking (added/edited/removed), sort, filter
  - `VirtualScroll` — rAF-based rendering with row pooling (100k+ rows)
  - `ColumnLayout` — group headers, frozen columns, flex widths
  - `EventEmitter` — on/once/off/emit event system

- **Cell Renderers** (8 types)
  - text, number (format), date, checkbox, button, badge, link, template

- **Cell Editors** (5 types)
  - text, number, select, date, checkbox
  - Inline editing: click / dblclick / F2 entry, Enter/Tab/Esc exit

- **Grouping + Summary**
  - `groupBy(fields[])` — multi-level hierarchical grouping
  - `summary` option — SUM / AVG / MIN / MAX / COUNT per column
  - `expandAll()` / `collapseAll()` / `clearGroup()`

- **Tree Grid**
  - `enableTree()` / `disableTree()` — flat-to-tree via `treeId` / `treeParentId`
  - `expandNodes(ids)` / `expandAllNodes()` / `collapseAllNodes()`
  - Indent + toggle arrow rendering per depth level

- **Cell Merge**
  - `mergeCells([{row, col, rowSpan?, colSpan?}])` — manual merge
  - `autoMerge(fields[])` — auto rowSpan for consecutive identical values
  - `clearMerge()` — remove all merges

- **Row Drag & Drop**
  - `draggable: true` option
  - Ghost row + drop indicator
  - `reorderRow(from, to)` public API
  - `onRowDrop` callback

- **Filter UI**
  - Column header filter icon
  - 9 operators: `=`, `!=`, `contains`, `startsWith`, `endsWith`, `>`, `<`, `>=`, `<=`

- **Export**
  - `exportExcel(options?)` — SheetJS xlsx (dynamic import, code-split)
  - `exportCsv(options?)` — BOM-aware CSV
  - `exportJson(options?)` — JSON download

- **Pagination**
  - `pagination: true` + `pageSize` option
  - Page size selector (10/20/50/100/200)
  - First/Prev/Next/Last navigation

- **Keyboard Navigation**
  - Arrow keys — cell navigation
  - Tab / Shift+Tab — next/prev cell
  - F2 / Enter — start edit
  - Escape — cancel edit / clear focus
  - Ctrl+C / Ctrl+V — clipboard

- **UI**
  - Column resize (drag)
  - Multi-sort (Shift+click)
  - Dark theme (`theme: 'dark'`)
  - CSS Variables — full theme customization
  - `setTheme(theme)` / `setThemeVar(key, value)`

- **Vue 3 Component** (`open-grid/vue`)
  - Composition API, `defineProps` / `defineEmits`
  - Reactive `data` / `columns` watchers
  - `grid` instance exposed via `defineExpose`

- **React 18 Component** (`open-grid/react`)
  - Hooks-based (`useRef`, `useEffect`)
  - `OpenGridReact` + `OpenGridWithRef` (forwardRef)
  - `stateColumn`, `draggable`, `onRowDrop` props

- **API Naming** — distinctive, self-consistent method names
  - `readCell`, `writeCell` for cell access
  - `orderBy` for sorting
  - `jumpToRow` for scrolling
  - `getSelections` for selection
  - (40+ purpose-built method names)

### Performance
- Multi-sort 100k rows: 1789ms → **40ms** (44× improvement via Schwartzian transform)
- Single sort 100k rows: ~38ms
- Filter 100k rows: ~17ms
- Group build 100k rows: ~3ms (5 groups)
- Tree build 100k rows: ~25ms

### Tests
- 124 unit tests across 7 test files
- EventEmitter (7), DataLayer (14), GroupEngine (18), TreeEngine (20),
  MergeEngine (16), CellEditor (23), CellRenderer (26)
