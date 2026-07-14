/**
 * F4 — 데이터 추출기(추출 ≠ 렌더링의 관심사 분리). 헤드리스, 그리드/DOM 비의존.
 * / F4 — data extractor (extraction is a separate concern from rendering). Headless, grid/DOM-agnostic.
 *
 * 계약 근거: 11_design_F4_v2.md §2(데이터 추출 모델)·§2.2(축 추론)·§2.3(집계)·§8.4(엣지 케이스),
 * 15_cross_contracts.md C0.3(FlatRowModel 경유)·C0.4(CellRange 의미).
 * / Contract basis: §2 (data extraction model)·§2.2 (axis inference)·§2.3 (aggregation)·§8.4
 * (edge cases); cross-contracts C0.3 (via FlatRowModel)·C0.4 (CellRange semantics).
 *
 * 이 모듈은 `OpenGrid`/`FlatRowModel`을 직접 import 하지 않는다. 그리드 상태 접근은 전부
 * `ChartExtractDeps` 주입 함수로 이뤄지므로 F1(범위선택)이 없어도(§7 graceful fallback),
 * 실제 그리드 인스턴스 없이도(단위테스트) 동작한다. range 소스의 pseudo-row 제외·rowId 해소는
 * 호출측(향후 ChartManager)이 FlatRowModel(C0.3)로 이미 걸러 넣어준 행 배열을 받는다는 전제다.
 * / This module never imports `OpenGrid`/`FlatRowModel` directly. All grid-state access goes
 * through injected `ChartExtractDeps` functions, so it works even without F1 (range selection)
 * (§7 graceful fallback) and without a real grid instance (unit tests). For the range source,
 * pseudo-row exclusion and rowId resolution are assumed already done by the caller (future
 * ChartManager) via FlatRowModel (C0.3), which passes in the pre-filtered row array.
 */

import type { CellRange } from '../types.js';
import type {
  ChartAggregate,
  ChartDataModel,
  ChartSeries,
  ChartSeriesSpec,
  ChartSource,
} from './types.js';
import { buildA11yTable, type ChartNumberFormat } from './a11y.js';
import { OGDecimal } from '../OGDecimal.js';

/**
 * ColumnLayout.visibleLeaves 의 최소 투영(field/header/type 만 필요, C0.4).
 * / Minimal projection of ColumnLayout.visibleLeaves (only field/header/type are needed, C0.4).
 */
export interface ChartColumnRef {
  /** 컬럼 field 키. / Column field key. */
  field: string;
  /** 컬럼 헤더 라벨(시리즈 이름 폴백). / Column header label (series-name fallback). */
  header?: string | undefined;
  /** 컬럼 데이터 타입(수치 판별 힌트). / Column data type (numeric-detection hint). */
  type?: string | undefined;
}

/**
 * 추출기가 그리드 상태에 접근하는 주입 함수 묶음. 실 그리드 없이도(단위테스트) 채울 수 있다.
 * / Injected accessor bundle through which the extractor reads grid state. Can be supplied
 * without a real grid (unit tests).
 */
export interface ChartExtractDeps {
  /** getData() 전체(display 순서) — kind='all'|'columns'. / Full getData() rows (display order) — kind='all'|'columns'. */
  getAllRows(): Array<Record<string, any>>;
  /** getSelections() — kind='selection'. / getSelections() rows — kind='selection'. */
  getSelectedRows(): Array<Record<string, any>>;
  /** getChecked() 의 row 부분 — kind='checked'. / The row part of getChecked() — kind='checked'. */
  getCheckedRows(): Array<Record<string, any>>;
  /** ColumnLayout.visibleLeaves 투영(숨김 제외, C0.4). / Projection of ColumnLayout.visibleLeaves (hidden excluded, C0.4). */
  getVisibleColumns(): ChartColumnRef[];
  /**
   * kind='range' 전용: 스냅샷/현재 range 에 대응하는 행 배열(FlatRowModel 로 이미
   * pseudo-row 를 제외한 상태, C0.3). 부재 시 range 소스는 selection 으로 강등한다(§7).
   * / kind='range' only: rows matching the snapshot/current range (already pseudo-row-filtered
   * via FlatRowModel, C0.3). When absent, the range source is downgraded to selection (§7).
   */
  getRangeRows?: ((range: CellRange) => Array<Record<string, any>>) | undefined;
  /**
   * kind='range' 전용: range.startCol..endCol 에 대응하는 visibleLeaves 서브셋(C0.4).
   * / kind='range' only: the visibleLeaves subset matching range.startCol..endCol (C0.4).
   */
  getRangeColumns?: ((range: CellRange) => ChartColumnRef[]) | undefined;
  /**
   * range 생략 시 초기값 취득(C4). 없거나 null 이면 selection 으로 강등(§7).
   * / Obtain the initial range when omitted (C4). Absent or null downgrades to selection (§7).
   */
  getActiveRange?: (() => CellRange | null) | undefined;
}

/**
 * 추출 동작 설정(override·집계·포맷). / Extraction behavior config (overrides, aggregation, format).
 */
export interface ChartExtractConfig {
  /** 축 카테고리 컬럼 override(FR-2). 미지정 시 §2.2 자동 추론. / Category column override (FR-2). Auto-inferred (§2.2) if unset. */
  category?: string | undefined;
  /** 시리즈 컬럼 override(FR-2). 'columns' 소스는 필수(source.series 로도 지정 가능). / Series column override (FR-2). Required for the 'columns' source (source.series also works). */
  series?: Array<string | ChartSeriesSpec> | undefined;
  /** 동일 category 중복 시 축약(FR-3). 미지정 시 중복 category 를 그대로 유지(비집계). / Aggregate duplicate categories (FR-3). Unset keeps duplicates as-is (no aggregation). */
  aggregate?: ChartAggregate | undefined;
  /** a11y 캡션/제목. / a11y caption/title. */
  title?: string | undefined;
  /** 축·툴팁 값 포맷터. / Axis/tooltip value formatter. */
  numberFormat?: ChartNumberFormat | undefined;
}

/**
 * 추출 결과 — 모델 + 실제로 사용된 소스 반영(§7 fallback, 배지 판단용).
 * / Extraction result — the model plus the source actually used (§7 fallback, for badge decisions).
 */
export interface ChartExtractResult {
  /** 산출된 차트 데이터 모델. / The produced chart data model. */
  model: ChartDataModel;
  /** true 면 kind='range' 요청이 selection 으로 강등됐다(F1 부재/range 미해소, §7 HANMS-04). / true when a kind='range' request was downgraded to selection (F1 absent/range unresolved, §7). */
  rangeFallback: boolean;
}

const NUMERIC_SAMPLE_MIN_RATIO = 0.8;
const NUMERIC_SAMPLE_MAX = 50;

function coerceNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** col.type==='number' 우선, 아니면 표본검사(≥80% 유한수) — §2.2. */
function isNumericColumn(col: ChartColumnRef | undefined, rows: Array<Record<string, any>>, field: string): boolean {
  if (col?.type === 'number') return true;
  if (col?.type) return false; // 명시된 비수치 타입(date/string/boolean 등)
  let sampled = 0;
  let numeric = 0;
  for (const row of rows) {
    if (sampled >= NUMERIC_SAMPLE_MAX) break;
    const v = row[field];
    if (v === null || v === undefined || v === '') continue;
    sampled++;
    if (coerceNumber(v) !== null) numeric++;
  }
  if (sampled === 0) return false;
  return numeric / sampled >= NUMERIC_SAMPLE_MIN_RATIO;
}

function seriesSpecField(s: string | ChartSeriesSpec): string {
  return typeof s === 'string' ? s : s.field;
}
function seriesSpecName(s: string | ChartSeriesSpec, fallback: string): string {
  if (typeof s === 'string') return fallback;
  return s.name ?? fallback;
}

/** 자동 추론(§2.2): 첫 비수치 visibleColumn = category, 나머지 수치 열 = series. */
function inferCategoryAndSeries(
  rows: Array<Record<string, any>>,
  columns: ChartColumnRef[]
): { categoryField: string | null; seriesCols: ChartColumnRef[] } {
  let categoryCol: ChartColumnRef | null = null;
  for (const col of columns) {
    if (!isNumericColumn(col, rows, col.field)) {
      categoryCol = col;
      break;
    }
  }
  const seriesCols = columns.filter(
    col => col !== categoryCol && isNumericColumn(col, rows, col.field)
  );
  return { categoryField: categoryCol?.field ?? null, seriesCols };
}

/** OGDecimal 기반 집계(FR-3) — sum/avg/min/max 는 OGDecimal.ts:179-199 그대로 재사용. */
function aggregateValues(values: number[], category: string, op: ChartAggregate): number {
  if (typeof op === 'function') return op(values, category);
  if (!values.length) return op === 'count' ? 0 : 0;
  switch (op) {
    case 'sum': return OGDecimal.sum(values).toNumber();
    case 'avg': return OGDecimal.avg(values).toNumber();
    case 'min': return OGDecimal.min(values).toNumber();
    case 'max': return OGDecimal.max(values).toNumber();
    case 'count': return values.length;
    default: return OGDecimal.sum(values).toNumber();
  }
}

function resolveRows(source: ChartSource, deps: ChartExtractDeps): {
  rows: Array<Record<string, any>>;
  effectiveKind: ChartSource['kind'];
  rangeFallback: boolean;
} {
  switch (source.kind) {
    case 'all':
    case 'columns':
      return { rows: deps.getAllRows(), effectiveKind: source.kind, rangeFallback: false };
    case 'selection':
      return { rows: deps.getSelectedRows(), effectiveKind: 'selection', rangeFallback: false };
    case 'checked':
      return { rows: deps.getCheckedRows(), effectiveKind: 'checked', rangeFallback: false };
    case 'range': {
      const range = source.range ?? deps.getActiveRange?.() ?? null;
      if (!range || !deps.getRangeRows) {
        // §7 graceful fallback: F1 부재/range 미해소 → selection 강등(하드에러 금지, HANMS-04).
        return { rows: deps.getSelectedRows(), effectiveKind: 'selection', rangeFallback: true };
      }
      return { rows: deps.getRangeRows(range), effectiveKind: 'range', rangeFallback: false };
    }
  }
}

function resolveColumns(
  source: ChartSource,
  effectiveKind: ChartSource['kind'],
  deps: ChartExtractDeps
): ChartColumnRef[] {
  if (source.kind === 'range' && effectiveKind === 'range' && source.range && deps.getRangeColumns) {
    return deps.getRangeColumns(source.range);
  }
  return deps.getVisibleColumns();
}

/**
 * 소스(§2.1)로부터 `ChartDataModel`을 산출한다(FR-1: 4소스 → 동형 모델).
 * `meta.a11yTable`은 항상 채운다(§B 하드 게이트, "생성비용 0" 미러).
 * / Produce a `ChartDataModel` from a source (§2.1) (FR-1: 4 sources → one isomorphic model).
 * `meta.a11yTable` is always populated (§B hard gate, a "zero-cost" mirror).
 *
 * @param source - 데이터 소스(all/columns/selection/checked/range, §2.1) / Data source (all/columns/selection/checked/range, §2.1)
 * @param deps - 그리드 상태 접근 주입 함수 묶음 / Injected grid-state accessor bundle
 * @param config - 축/시리즈 override·집계·포맷(선택) / Axis/series override, aggregation, format (optional)
 * @returns 모델 + range→selection 강등 여부 / The model plus whether range was downgraded to selection
 * @example
 * const { model, rangeFallback } = extractChartData(
 *   { kind: 'all' },
 *   { getAllRows: () => rows, getSelectedRows: () => [], getCheckedRows: () => [], getVisibleColumns: () => cols },
 *   { aggregate: 'sum' }
 * );
 */
export function extractChartData(
  source: ChartSource,
  deps: ChartExtractDeps,
  config: ChartExtractConfig = {}
): ChartExtractResult {
  const { rows, effectiveKind, rangeFallback } = resolveRows(source, deps);
  const columns = resolveColumns(source, effectiveKind, deps);

  // ── 카테고리/시리즈 컬럼 결정(FR-2) ──
  let categoryField: string | null = null;
  let seriesSpecs: Array<string | ChartSeriesSpec>;

  if (source.kind === 'columns') {
    categoryField = config.category ?? source.category ?? null;
    seriesSpecs = config.series ?? source.series;
  } else if (config.series) {
    categoryField = config.category ?? null;
    seriesSpecs = config.series;
  } else {
    const inferred = inferCategoryAndSeries(rows, columns);
    categoryField = config.category ?? inferred.categoryField;
    seriesSpecs = inferred.seriesCols.map(c => c.field);
  }

  const colByField = new Map(columns.map(c => [c.field, c]));

  // ── category 라벨(비수치 열 없으면 행 순번 1..n, §2.2/§8.4) ──
  const rawCategories: string[] = categoryField
    ? rows.map(r => String(r[categoryField as string] ?? ''))
    : rows.map((_, i) => String(i + 1));

  // ── series 원시값 추출(결측=null, §8.4) ──
  const rawSeries: ChartSeries[] = seriesSpecs.map(spec => {
    const field = seriesSpecField(spec);
    const col = colByField.get(field);
    const name = seriesSpecName(spec, col?.header ?? field);
    const data = rows.map(r => coerceNumber(r[field]));
    const pattern = typeof spec === 'string' ? undefined : spec.pattern;
    const color = typeof spec === 'string' ? undefined : spec.color;
    const series: ChartSeries = { name, data };
    if (pattern) series.pattern = pattern;
    if (color) series.color = color;
    return series;
  });

  const total = rows.length;
  let categories = rawCategories;
  let seriesOut = rawSeries;
  let aggregatedOp: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'custom' | undefined;
  let sampled = false;

  if (config.aggregate && rawCategories.length > 0) {
    const order: string[] = [];
    const bucket = new Map<string, number[]>();
    for (let i = 0; i < rawCategories.length; i++) {
      const cat = rawCategories[i] as string;
      if (!bucket.has(cat)) { bucket.set(cat, [i]); order.push(cat); }
      else (bucket.get(cat) as number[]).push(i);
    }
    if (order.length < rawCategories.length) {
      categories = order;
      seriesOut = rawSeries.map(s => ({
        ...s,
        data: order.map(cat => {
          const idxs = bucket.get(cat) as number[];
          const values = idxs.map(i => s.data[i]).filter((v): v is number => v !== null);
          if (!values.length) return null;
          return aggregateValues(values, cat, config.aggregate as ChartAggregate);
        }),
      }));
      aggregatedOp = typeof config.aggregate === 'function' ? 'custom' : config.aggregate;
      sampled = true;
    }
  }

  const model: ChartDataModel = {
    categories,
    series: seriesOut,
    meta: {
      sourceKind: effectiveKind,
      total,
      sampled,
      a11yTable: buildA11yTable(
        { categories, series: seriesOut },
        { title: config.title, numberFormat: config.numberFormat }
      ),
    },
  };
  if (aggregatedOp) model.meta.aggregatedOp = aggregatedOp;

  return { model, rangeFallback };
}
