/**
 * F4 — 접근성 테이블/aria-label 생성기 (헤드리스, 순수 함수).
 * / F4 — accessibility table / aria-label generator (headless, pure functions).
 *
 * 계약: 11_design_F4_v2.md §B(NORMATIVE 하드 게이트)·§2.4(A11yTableModel).
 * `ChartDataModel`을 미러링한 시각숨김 `<table>` 데이터 + `<canvas role="img" aria-label>` 문자열을
 * 렌더러와 무관하게 생성한다("생성비용 0" — categories×series 를 그대로 투영).
 * / Contract: §B (NORMATIVE hard gate)·§2.4 (A11yTableModel). Produces, renderer-agnostically,
 * the visually-hidden `<table>` data that mirrors a `ChartDataModel` plus the
 * `<canvas role="img" aria-label>` string ("zero-cost" — a direct projection of categories×series).
 *
 * DOM 조립(실제 <table>/<canvas> 엘리먼트 생성)은 어댑터/패널 레이어(후속 배선 태스크) 책임이다.
 * 이 모듈은 데이터 모델과 문자열만 산출한다.
 * / DOM assembly (creating the actual <table>/<canvas> elements) is the adapter/panel layer's
 * responsibility. This module produces only the data model and strings.
 */

import type { ChartDataModel, A11yTableModel } from './types.js';
// i18n: a11y 문자열 생성기는 순수 함수 체인(DataExtractor/downsample)이 깊게 호출하는 헤드리스
//   모듈이라 per-instance 로케일 주입 경로가 없다 → 전역 t 로 해석(설계 §3 헬퍼 예외).
import { t } from '../i18n/LocaleRegistry.js';

/**
 * 축/툴팁/범례 값 포맷터. 값과 문맥(축 종류·field)을 받아 표시 문자열을 반환한다.
 * / Axis/tooltip/legend value formatter. Takes a value and context (axis kind, field) and
 * returns the display string.
 */
export type ChartNumberFormat = (
  v: number,
  ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }
) => string;

/** a11y 테이블 생성 옵션. / Options for building the a11y table. */
export interface BuildA11yTableOptions {
  /** 캡션 요약에 넣을 제목. / Title to embed in the caption summary. */
  title?: string | undefined;
  /** 셀 값 포맷터(미지정 시 String()). / Cell value formatter (String() if unset). */
  numberFormat?: ChartNumberFormat | undefined;
}

function formatCell(v: number | null, numberFormat?: ChartNumberFormat): string {
  if (v == null || Number.isNaN(v)) return '';
  return numberFormat ? numberFormat(v, { axis: 'tooltip' }) : String(v);
}

/**
 * `ChartDataModel`(categories/series 부분)을 시각숨김 `<table>` 미러 데이터로 변환한다(§B.1).
 * - colHeaders: ['category', ...series names]
 * - rows: [category, v1, v2, ...] (locale 포맷 문자열, 결측=빈 문자열)
 * - caption: 요약 — 카테고리 수·시리즈명 나열(스크린리더가 표 진입 전 듣는 개요).
 * / Convert a `ChartDataModel` (categories/series part) into visually-hidden `<table>` mirror
 * data (§B.1). colHeaders = ['category', ...series names]; rows = [category, v1, v2, …]
 * (locale-formatted strings, missing = empty string); caption = a summary listing the category
 * count and series names (the overview a screen reader hears before entering the table).
 *
 * @param model - categories/series 를 담은 모델 조각 / Model slice carrying categories/series
 * @param opts - 제목·값 포맷터(선택) / Title and value formatter (optional)
 * @returns 캡션·컬럼헤더·행으로 이뤄진 A11yTableModel / An A11yTableModel of caption, column headers, and rows
 */
export function buildA11yTable(
  model: Pick<ChartDataModel, 'categories' | 'series'>,
  opts: BuildA11yTableOptions = {}
): A11yTableModel {
  const { categories, series } = model;
  const colHeaders = ['category', ...series.map(s => s.name)];
  const rows = categories.map((cat, i) => [
    cat,
    ...series.map(s => formatCell(s.data[i] ?? null, opts.numberFormat)),
  ]);
  const seriesNames = series.map(s => s.name).join(', ');
  const seriesLabel = seriesNames || t('chart.tooltipEmpty');
  const caption = opts.title
    ? t('chart.a11ySummary', { title: opts.title, categories: categories.length, series: seriesLabel })
    : t('chart.a11ySummaryNoTitle', { categories: categories.length, series: seriesLabel });
  return { caption, colHeaders, rows };
}

/**
 * `<canvas role="img" aria-label="...">` 에 쓸 요약 문자열(§B.1).
 * "{title}: {category}별 {series} — {요약}" 형태. 상세 값은 형제 `<table>`(aria-describedby)로.
 * / The summary string for `<canvas role="img" aria-label="...">` (§B.1). Detailed values live
 * in the sibling `<table>` (via aria-describedby).
 *
 * @param model - categories/series 를 담은 모델 조각 / Model slice carrying categories/series
 * @param title - 차트 제목(미지정 시 기본 제목) / Chart title (default title if unset)
 * @returns aria-label 문자열 / The aria-label string
 */
export function chartAriaLabel(
  model: Pick<ChartDataModel, 'categories' | 'series'>,
  title?: string
): string {
  const { categories, series } = model;
  const ttl = title ?? t('chart.defaultTitle');
  const seriesNames = series.map(s => s.name).join(', ') || t('chart.a11yNoData');
  return t('chart.a11yAltText', { title: ttl, categories: categories.length, series: seriesNames });
}
