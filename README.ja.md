# OPEN_GRID

**Meet Open Grid** — **依存ゼロのコア**を持つ超軽量データグリッド。どんな技術スタックにも
すんなり収まります。React、Vue、Angular、jQuery、素の JavaScript — どれでもそのまま動きます。
MIT ライセンスなので商用利用も自由、カスタマイズに際限はなく、AI フレンドリーな override ガイドで
グリッドをこれまで以上に押し広げられます。

仮想スクロール・インライン編集・グルーピング・ツリービュー・ドラッグ＆ドロップ・変更追跡・フッター集計・列の並べ替えを備えた、高速でフレームワーク非依存のデータグリッド。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/badge/npm-1.4.0-orange)](https://www.npmjs.com/package/open-grid)

[English](README.md) · **日本語** · [中文](README.zh.md)

📖 **[開発ガイド](https://foxnail.kr/open-grid/demo/v2/guide/index.php)** — インストールから高度な API まで、段階を追って解説
🔗 **[デモ／ホームページ](https://foxnail.kr/open-grid/demo/v2/index.php)**
📚 **[API ドキュメント](https://foxnail.kr/open-grid/demo/v2/api-docs/)** — 韓国語・英語・日本語・中国語の 4 言語 JSDoc

## 機能

### コア

| 機能 | 状態 |
|---|---|
| 仮想スクロール（100 万行以上） | ✅ |
| インライン編集（クリック／ダブルクリック／F2） | ✅ |
| セルレンダラー（text、number、date、checkbox、button、badge、link、template、sparkline、…） | ✅ |
| 5 種のセルエディター（text、number、select、date、checkbox） | ✅ |
| マルチソート（Shift+クリック） | ✅ |
| 列フィルター UI（9 種の演算子） | ✅ |
| 列幅リサイズ（ドラッグ） | ✅ |
| 列の並べ替え（ヘッダーをドラッグ、`columnReorder: true`） | ✅ |
| 列の固定 | ✅ |
| 行／列グループ（ヘッダー結合） | ✅ |
| グルーピング＋集計（SUM／AVG／MIN／MAX／COUNT） | ✅ |
| ツリーグリッド（フラット → 階層、展開／折りたたみ） | ✅ |
| OrgChart（テーマ対応の組織図） | ✅ |
| セル結合（手動＋自動 rowSpan／colSpan） | ✅ |
| 行のドラッグ＆ドロップ | ✅ |
| 変更追跡（`getChanges` ／ `getChangedColumns` ／ `getOriginalRow`） | ✅ |
| フッター集計（`setFooter`、`getFooterValue`、OGDecimal による精度保証） | ✅ |
| データマスキング（10 種類、セル／列単位の切り替え） | ✅ |
| ページネーション | ✅ |
| Excel ／ CSS テーマのエクスポート | ✅ |
| CSV ／ JSON エクスポート | ✅ |
| クリップボード（Ctrl+C ／ Ctrl+V） | ✅ |
| キーボード操作（矢印／Tab／F2／Esc） | ✅ |
| コアの依存ゼロ | ✅ |

### スプレッドシート級（v1.1）

| 機能 | 状態 |
|---|---|
| 範囲選択＋フィル — セル範囲のドラッグ、連続データのフィル、TSV クリップボード、Ctrl+D/R（`rangeSelection`） | ✅ |
| マスター／ディテール — 行を展開して HTML パネルまたはサブグリッドを表示（`masterDetail`、`expandRow`） | ✅ |
| 数式セル — `=B1*C1`、`=SUM(C1:C10)`、19 個の関数、`[field]`／A1 参照、`#REF`／`#CYCLE` エラー（`formula`） | ✅ |
| 統合チャート — グリッドのデータから棒／折れ線を描画、LTTB ダウンサンプリング＋サンプリングバッジ、組み込みの canvas レンダラー（`chart`） | ✅ |

### 書式とデータ（v1.3）

| 機能 | 状態 |
|---|---|
| 条件付き書式 — データバー、ヒートマップ、アイコンセット、ルールの優先順位 | ✅ |
| リアルタイムデータ — バックプレッシャー対応のストリーミング／ポーリングソース | ✅ |
| 外観の軸 — density と texture のセッター | ✅ |

### 見た目

| 機能 | 状態 |
|---|---|
| 15 種の組み込みテーマ（dark、ocean、forest、crimson、stitch、…） | ✅ |
| 6 種のスキン（色とは直交する形の軸）— sharp ／ rounded ／ stitch ／ flat ／ high-contrast ／ material | ✅ |
| 64 個のロールアイコン（Bootstrap Icons、MIT）— `renderIcon`、`grid.setIcon`、`OpenGrid.defineIconSet` | ✅ |
| ローカライズ／i18n（組み込みの `ko`・`en`、`setLocale`、カスタムロケール） | ✅ |

### 拡張性

| 機能 | 状態 |
|---|---|
| `grid.override(...)` — コアに手を入れずに挙動をカスタマイズ（AI フレンドリーなガイド付き） | ✅ |
| 拡張レジストリ — `added`／`replaced`／`kept`／`rejected` の結果を返す `TypedRegistry`、予約済み `og:` のガード、`protect-builtin` | ✅ |
| Vue 3 コンポーネント | ✅ |
| React 18 コンポーネント | ✅ |

## インストール

```bash
npm install open-grid
```

## クイックスタート

### Vanilla JavaScript ／ TypeScript

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

## API リファレンス

### コンストラクター

```typescript
new OpenGrid(container: string | HTMLElement, options: GridOptions)
```

### データ API

| メソッド | 説明 |
|---|---|
| `setData(data)` | データの設定。 |
| `getData()` | 現在表示中のデータを返す。 |
| `insertRow(item, position?)` | 行の追加（`'first'` ／ `'last'` ／ インデックス）。 |
| `deleteRow(rowIndex)` | 行の削除（ソフトデリート）。 |
| `pushRow(items)` | 末尾に行を追加。 |
| `unshiftRow(items)` | 先頭に行を追加。 |
| `readCell(rowIndex, field)` | セル値の読み取り。 |
| `writeCell(rowIndex, field, value)` | セル値の書き込み。 |
| `reorderRow(from, to)` | 行の順序を移動。 |

### 変更追跡 API（v0.1.2）

| メソッド | 説明 |
|---|---|
| `getChanges()` | `{ added, edited, removed }` をまとめて返す。edited の行には `_changedFields` を含む。 |
| `getEditedRows()` | 修正された行のみを返す。 |
| `getAddedRows()` | 追加された行を返す。 |
| `getRemovedRows()` | 削除された行を返す。 |
| `getChangedColumns()` | `{ row, fields, diff[] }` — 列単位の diff（oldValue／newValue）。 |
| `getOriginalRow(rowIndex)` | 修正前の元の行データを返す。 |

### フッター／小計 API（v0.1.2）

| メソッド | 説明 |
|---|---|
| `setFooter(FooterDef[])` | フッター集計の設定（SUM／AVG／MIN／MAX／COUNT、colspan、format）。 |
| `getFooterValue(field)` | 特定フィールドの集計結果を取得。 |
| `getFooterData()` | フッター集計データ全体を配列で返す。 |

```typescript
grid.setFooter([
  { label: '합계', colspan: 2, align: 'left' },
  { field: 'salary', op: 'SUM', format: '#,##0',   align: 'right' },
  { field: 'rate',   op: 'SUM', format: '#,##0.00', align: 'right' }, // OGDecimal 정밀계산
  { field: 'score',  op: 'AVG', format: '#,##0.0',  align: 'right' },
]);

const total = grid.getFooterValue('salary'); // 숫자 반환
```

### 列並べ替え API（v0.1.1）

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

### ソート／フィルター

| メソッド | 説明 |
|---|---|
| `orderBy(field, dir?)` | ソート。 |
| `resetOrder()` | ソートの初期化。 |
| `setFilter(field, items)` | フィルターの設定。 |
| `resetFilter(field?)` | フィルターの初期化。 |

### グルーピング

| メソッド | 説明 |
|---|---|
| `groupBy(fields[])` | グループの設定。 |
| `clearGroup()` | グループの解除。 |
| `expandAll()` | すべて展開。 |
| `collapseAll()` | すべて折りたたみ。 |

### ツリーグリッド

| メソッド | 説明 |
|---|---|
| `enableTree()` | ツリーモードの有効化。 |
| `disableTree()` | ツリーモードの無効化。 |
| `expandNodes(ids, open?)` | 特定ノードの展開／折りたたみ。 |
| `expandAllNodes()` | すべて展開。 |
| `collapseAllNodes()` | すべて折りたたみ。 |

### セル結合

| メソッド | 説明 |
|---|---|
| `mergeCells(cells)` | 手動結合 `[{row, col, rowSpan?, colSpan?}]`。 |
| `autoMerge(fields[])` | 連続する同じ値を自動で rowSpan。 |
| `clearMerge()` | 結合の解除。 |

### エクスポート

| メソッド | 説明 |
|---|---|
| `exportExcel(options?)` | Excel（.xlsx）の書き出し。 |
| `exportCsv(options?)` | CSV の書き出し。 |
| `exportJson(options?)` | JSON の書き出し。 |

### UI

| メソッド | 説明 |
|---|---|
| `jumpToRow(rowIndex)` | 特定の行までスクロール。 |
| `setTheme(theme)` | テーマの変更（`'default'` ／ `'dark'`）。 |
| `resize(w?, h?)` | サイズの調整。 |
| `destroy()` | インスタンスの破棄。 |

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

## パフォーマンス

10 万行を対象としたベンチマーク結果です。

| 処理 | 時間 |
|---|---|
| データ生成 | ~65ms |
| setData() | ~30ms |
| applySort（単一） | ~38ms |
| applySort（マルチ） | ~40ms |
| applyFilter | ~17ms |
| buildGroups | ~3ms |
| buildTree | ~25ms |

## CSS カスタマイズ

CSS 変数でテーマを完全にカスタマイズできます。

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

## ローカライズ（i18n）

組み込み UI の文字列 — ラベル、`aria-label`、ライブリージョンのアナウンス、ツールチップ、
プレースホルダー — はすべて、コアから切り離した差し替え可能なロケールカタログに置いています。
**`ko`（既定）と `en`** を同梱します。既存アプリへの影響はありません。`locale`／`messages` オプションを
指定しなければ、出力は従来とバイト単位で同一です。

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

フォールバックの流れ: インスタンスの上書き → 有効なロケール → `ko`（完全なカタログ） → 生のキー。
数値・日付の書式と開発者向けのエラーメッセージは、意図的に対象外としています
（書式は `Intl` を使い、ログは grep で追える形のまま保ちます）。キーの全リファレンスは
[ローカライズガイド](https://foxnail.kr/open-grid/demo/v2/guide/index.php) をご覧ください。

## 変更履歴

リリースの全履歴は [`CHANGELOG.md`](CHANGELOG.md) をご覧ください。

最近の主なトピック:

- **1.4.0** — 拡張レジストリを公開（`TypedRegistry`、予約ネームスペースのガード）。
  公開 API の JSDoc を韓国語・英語・日本語・中国語の 4 言語に。
- **1.3.1** — 公開 API の JSDoc を人が読んで分かる形に書き直し（コメントのみ、ロジックの変更なし）。
- **1.3.0** — 条件付き書式、統合チャートのサブシステム、リアルタイムデータソース、
  外観の軸（density／texture）。
- **1.2.0** — ロケールリソースを分離した国際化対応（`LocaleRegistry`）。
- **1.1.0** — 範囲選択＋フィル、マスター／ディテール、数式セル、統合チャート。
- **1.0.0** — `grid.override()` によるカスタマイズ面。

## ライセンス

MIT © OPEN_GRID Contributors

### ランタイム依存ゼロ（Excel 出力はそのまま動きます）

`npm install open-grid` が引き込む**外部ランタイム依存はありません**。グリッドのコアは
完全に自己完結しています。

**Excel エクスポートは追加インストールなしで、そのまま動きます。** これは SheetJS
（`xlsx-js-style`）を使っており、**パッケージの中（`dist/` 配下）にバンドル済み**で、実際に
エクスポートするときだけオンデマンドで読み込まれます。`xlsx`／`xlsx-js-style` をプロジェクトに
追加する必要は**ありません** — OPEN_GRID の中に同梱されています。（`devDependencies` に載っているのは、
バンドルを*ビルドする*ために必要だからであって、*使う*ために必要だからではありません。）

### サードパーティライセンス

同梱の Excel エクスポートは **SheetJS Community Edition（`xlsx`）** と
**`xlsx-js-style`** を使用しており、いずれも **Apache License, Version 2.0** の下で
ライセンスされています（© SheetJS LLC、およびスタイル版フォークについては Brent Ely）。
これらの attribution notice とライセンス全文は [`NOTICE`](NOTICE) と
[`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt) に収録しています。

> **1.0.2 以降**、この `NOTICE` と `THIRD_PARTY_LICENSES.txt` は、同梱コンポーネントに対する
> Apache-2.0 の attribution 要件を満たすため、公開パッケージの中に同梱して配布しています。
> これにより、以前のリリース（1.0.1 以下）にあったライセンスコンプライアンス上の潜在的な
> 不備 — MIT ライセンスのみを同梱し、必要な Apache-2.0 の notice を欠いていた点 — を解消しました。
> OPEN_GRID 自身の MIT ライセンスに変更はありません。MIT と Apache-2.0 は互換性があるため、
> これは attribution の修正のみです。詳細は [`CHANGELOG.md`](CHANGELOG.md) をご覧ください。
