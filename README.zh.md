# OPEN_GRID

**认识 Open Grid** —— 核心零依赖的超轻量数据表格，可以毫不费力地融入任何技术栈。React、Vue、
Angular、jQuery，或纯 JavaScript，装上就能用。采用 MIT 许可，商用毫无拘束；定制没有上限，
还配有面向 AI 的 override 指南，让你把表格做得比以往更远。

高性能、不绑定框架的数据表格，支持虚拟滚动、行内编辑、分组、树形视图、拖放、变更追踪、页脚聚合与列重排。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/badge/npm-1.4.0-orange)](https://www.npmjs.com/package/open-grid)

[English](README.md) · [日本語](README.ja.md) · **中文**

📖 **[开发指南](https://foxnail.kr/open-grid/demo/v2/guide/index.php)** —— 从安装到高级 API 的分步指南
🔗 **[演示 / 主页](https://foxnail.kr/open-grid/demo/v2/index.php)**
📚 **[API 文档](https://foxnail.kr/open-grid/demo/v2/api-docs/)** —— 韩、英、日、中四种语言的 JSDoc

## 功能

### 核心

| 功能 | 状态 |
|---|---|
| 虚拟滚动（100 万行以上） | ✅ |
| 行内编辑（click / dblclick / F2） | ✅ |
| 单元格渲染器（text、number、date、checkbox、button、badge、link、template、sparkline 等） | ✅ |
| 5 种单元格编辑器（text、number、select、date、checkbox） | ✅ |
| 多列排序（Shift+点击） | ✅ |
| 列筛选界面（9 种运算符） | ✅ |
| 列宽调整（拖拽） | ✅ |
| 列重排（拖拽表头，`columnReorder: true`） | ✅ |
| 冻结列 | ✅ |
| 行 / 列分组（表头合并） | ✅ |
| 分组 + 汇总（SUM/AVG/MIN/MAX/COUNT） | ✅ |
| 树形表格（扁平数据 → 层级，展开 / 折叠） | ✅ |
| 组织结构图（OrgChart，带主题） | ✅ |
| 单元格合并（手动 + 自动 rowSpan/colSpan） | ✅ |
| 行拖放 | ✅ |
| 变更追踪（`getChanges` / `getChangedColumns` / `getOriginalRow`） | ✅ |
| 页脚聚合（`setFooter`、`getFooterValue`，OGDecimal 精度） | ✅ |
| 数据脱敏（10 种类型，可按单元格 / 列开关） | ✅ |
| 分页 | ✅ |
| Excel / CSS 主题导出 | ✅ |
| CSV / JSON 导出 | ✅ |
| 剪贴板（Ctrl+C / Ctrl+V） | ✅ |
| 键盘导航（方向键 / Tab / F2 / Esc） | ✅ |
| 核心零依赖 | ✅ |

### 电子表格级（v1.1）

| 功能 | 状态 |
|---|---|
| 区域选择 + 填充 —— 拖选单元格区域、序列填充、TSV 剪贴板、Ctrl+D/R（`rangeSelection`） | ✅ |
| 主从视图 —— 把一行展开为 HTML 面板或子表格（`masterDetail`、`expandRow`） | ✅ |
| 公式单元格 —— `=B1*C1`、`=SUM(C1:C10)`，19 个函数，`[field]`/A1 引用，`#REF`/`#CYCLE` 错误（`formula`） | ✅ |
| 集成图表 —— 用表格数据绘制柱状图 / 折线图，LTTB 降采样 + 采样标记，内置 canvas 渲染器（`chart`） | ✅ |

### 格式与数据（v1.3）

| 功能 | 状态 |
|---|---|
| 条件格式 —— 数据条、热力图、图标集、规则优先级 | ✅ |
| 实时数据 —— 带背压的流式 / 轮询数据源 | ✅ |
| 外观双轴 —— 密度与质感设置方法 | ✅ |

### 外观风格

| 功能 | 状态 |
|---|---|
| 15 款内置主题（dark、ocean、forest、crimson、stitch 等） | ✅ |
| 6 款皮肤（形态轴，与颜色正交）—— sharp / rounded / stitch / flat / high-contrast / material | ✅ |
| 64 个语义图标（Bootstrap Icons，MIT）—— `renderIcon`、`grid.setIcon`、`OpenGrid.defineIconSet` | ✅ |
| 本地化 / i18n（内置 `ko`·`en`，`setLocale`，自定义语言包） | ✅ |

### 扩展性

| 功能 | 状态 |
|---|---|
| `grid.override(...)` —— 不碰核心即可定制行为（配面向 AI 的指南） | ✅ |
| 扩展注册表 —— `TypedRegistry`，返回 `added`/`replaced`/`kept`/`rejected` 处理结果，保留前缀 `og:` 防护，`protect-builtin` | ✅ |
| Vue 3 组件 | ✅ |
| React 18 组件 | ✅ |

## 安装

```bash
npm install open-grid
```

## 快速上手

### 原生 JavaScript / TypeScript

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

## API 参考

### 构造函数

```typescript
new OpenGrid(container: string | HTMLElement, options: GridOptions)
```

### 数据 API

| 方法 | 说明 |
|---|---|
| `setData(data)` | 设置数据 |
| `getData()` | 返回当前显示的数据 |
| `insertRow(item, position?)` | 插入行（`'first'` / `'last'` / 索引） |
| `deleteRow(rowIndex)` | 删除行（软删除） |
| `pushRow(items)` | 在末尾追加行 |
| `unshiftRow(items)` | 在开头插入行 |
| `readCell(rowIndex, field)` | 读取单元格值 |
| `writeCell(rowIndex, field, value)` | 写入单元格值 |
| `reorderRow(from, to)` | 移动行顺序 |

### 变更追踪 API（v0.1.2）

| 方法 | 说明 |
|---|---|
| `getChanges()` | 一次性返回 `{ added, edited, removed }`。edited 行中带 `_changedFields` |
| `getEditedRows()` | 只返回修改过的行 |
| `getAddedRows()` | 返回新增的行 |
| `getRemovedRows()` | 返回删除的行 |
| `getChangedColumns()` | `{ row, fields, diff[] }` 列级差异（oldValue/newValue） |
| `getOriginalRow(rowIndex)` | 返回修改前的原始行数据 |

### 页脚 / 小计 API（v0.1.2）

| 方法 | 说明 |
|---|---|
| `setFooter(FooterDef[])` | 设置页脚聚合（SUM/AVG/MIN/MAX/COUNT、colspan、format） |
| `getFooterValue(field)` | 查询指定字段的聚合结果 |
| `getFooterData()` | 返回全部页脚聚合数据的数组 |

```typescript
grid.setFooter([
  { label: '합계', colspan: 2, align: 'left' },
  { field: 'salary', op: 'SUM', format: '#,##0',   align: 'right' },
  { field: 'rate',   op: 'SUM', format: '#,##0.00', align: 'right' }, // OGDecimal 정밀계산
  { field: 'score',  op: 'AVG', format: '#,##0.0',  align: 'right' },
]);

const total = grid.getFooterValue('salary'); // 숫자 반환
```

### 列重排 API（v0.1.1）

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

### 排序 / 筛选

| 方法 | 说明 |
|---|---|
| `orderBy(field, dir?)` | 排序 |
| `resetOrder()` | 重置排序 |
| `setFilter(field, items)` | 设置筛选 |
| `resetFilter(field?)` | 重置筛选 |

### 分组

| 方法 | 说明 |
|---|---|
| `groupBy(fields[])` | 设置分组 |
| `clearGroup()` | 取消分组 |
| `expandAll()` | 全部展开 |
| `collapseAll()` | 全部折叠 |

### 树形表格

| 方法 | 说明 |
|---|---|
| `enableTree()` | 启用树形模式 |
| `disableTree()` | 关闭树形模式 |
| `expandNodes(ids, open?)` | 展开 / 折叠指定节点 |
| `expandAllNodes()` | 全部展开 |
| `collapseAllNodes()` | 全部折叠 |

### 单元格合并

| 方法 | 说明 |
|---|---|
| `mergeCells(cells)` | 手动合并 `[{row, col, rowSpan?, colSpan?}]` |
| `autoMerge(fields[])` | 对连续相同的值自动 rowSpan |
| `clearMerge()` | 取消合并 |

### 导出

| 方法 | 说明 |
|---|---|
| `exportExcel(options?)` | 导出 Excel (.xlsx) |
| `exportCsv(options?)` | 导出 CSV |
| `exportJson(options?)` | 导出 JSON |

### UI

| 方法 | 说明 |
|---|---|
| `jumpToRow(rowIndex)` | 滚动到指定行 |
| `setTheme(theme)` | 切换主题（`'default'` / `'dark'`） |
| `resize(w?, h?)` | 调整尺寸 |
| `destroy()` | 销毁实例 |

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

## 性能

10 万行数据的基准测试结果：

| 操作 | 耗时 |
|---|---|
| 生成数据 | ~65ms |
| setData() | ~30ms |
| applySort（单列） | ~38ms |
| applySort（多列） | ~40ms |
| applyFilter | ~17ms |
| buildGroups | ~3ms |
| buildTree | ~25ms |

## CSS 定制

用 CSS 变量就能完全定制主题：

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

## 本地化（i18n）

所有内置界面文案 —— 标签、`aria-label`、live region 播报、提示气泡、占位符 —— 都放在可替换的语言包里，
与核心分离。内置 **`ko`（默认）和 `en`**。现有应用不受影响：不传 `locale`/`messages` 选项时，
输出与此前逐字节一致。

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

回退链：实例级覆盖 → 当前语言 → `ko`（完整语言包）→ 原始 key。
数字与日期格式化、面向开发者的错误信息有意不在覆盖范围内
（前者请用 `Intl`，后者保持日志可 grep）。完整 key 列表见
[本地化指南](https://foxnail.kr/open-grid/demo/v2/guide/index.php)。

## 更新日志

完整发布历史见 [`CHANGELOG.md`](CHANGELOG.md)。

近期要点：

- **1.4.0** —— 公开扩展注册表（`TypedRegistry`、保留命名空间守卫）；
  公开 API 的 JSDoc 提供韩语、英语、日语、中文四种语言。
- **1.3.1** —— 重写公开 API 的 JSDoc，让人读得懂（仅改注释，逻辑未动）。
- **1.3.0** —— 条件格式、集成图表子系统、实时数据源、外观双轴（密度 / 质感）。
- **1.2.0** —— 国际化，语言资源独立（`LocaleRegistry`）。
- **1.1.0** —— 区域选择 + 填充、主从视图、公式单元格、集成图表。
- **1.0.0** —— `grid.override()` 定制接口。

## 许可

MIT © OPEN_GRID Contributors

### 零运行时依赖（Excel 导出照样开箱即用）

`npm install open-grid` **不会拉取任何外部运行时依赖** —— 表格核心完全自包含。

**Excel 导出开箱即用，无需另装任何东西。** 它使用 SheetJS（`xlsx-js-style`），该库**已打包在本包内**
（位于 `dist/`），只有在真正执行导出时才按需加载。你**不需要**往自己的项目里添加
`xlsx`/`xlsx-js-style` —— 它们随 OPEN_GRID 一起发布。（它们列在 `devDependencies` 下，
是因为*构建*产物时需要，而*使用*时不需要。）

### 第三方许可

内置的 Excel 导出使用 **SheetJS Community Edition (`xlsx`)** 与 **`xlsx-js-style`**，
两者均以 **Apache License, Version 2.0** 授权（© SheetJS LLC；样式分支为 Brent Ely）。
其署名声明与完整许可证文本收录在 [`NOTICE`](NOTICE) 和
[`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt) 中。

> **自 1.0.2 起**，`NOTICE` 与 `THIRD_PARTY_LICENSES.txt` 这两个文件随发布包一同分发，
> 以满足内置组件的 Apache-2.0 署名要求 —— 由此修复了早期版本（≤ 1.0.1）中潜在的
> 许可合规缺口：那些版本只附带了 MIT 许可证，缺少必需的 Apache-2.0 声明。
> OPEN_GRID 自身的 MIT 许可证未变；MIT 与 Apache-2.0 相互兼容，因此这仅是一次署名修正。
> 详情见 [`CHANGELOG.md`](CHANGELOG.md)。
