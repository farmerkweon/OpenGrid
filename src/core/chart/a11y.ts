/**
 * F4 — 접근성 테이블/aria-label 생성기 (헤드리스, 순수 함수).
 *
 * 계약: 11_design_F4_v2.md §B(NORMATIVE 하드 게이트)·§2.4(A11yTableModel).
 * `ChartDataModel`을 미러링한 시각숨김 `<table>` 데이터 + `<canvas role="img" aria-label>` 문자열을
 * 렌더러와 무관하게 생성한다("생성비용 0" — categories×series 를 그대로 투영).
 *
 * DOM 조립(실제 <table>/<canvas> 엘리먼트 생성)은 어댑터/패널 레이어(후속 배선 태스크) 책임이다.
 * 이 모듈은 데이터 모델과 문자열만 산출한다.
 */

import type { ChartDataModel, A11yTableModel } from './types.js';

export type ChartNumberFormat = (
  v: number,
  ctx: { axis: 'x' | 'y' | 'tooltip' | 'legend'; field?: string }
) => string;

export interface BuildA11yTableOptions {
  title?: string | undefined;
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
  const caption = opts.title
    ? `${opts.title}: 카테고리 ${categories.length}개, 시리즈 ${seriesNames || '없음'}`
    : `카테고리 ${categories.length}개, 시리즈 ${seriesNames || '없음'}`;
  return { caption, colHeaders, rows };
}

/**
 * `<canvas role="img" aria-label="...">` 에 쓸 요약 문자열(§B.1).
 * "{title}: {category}별 {series} — {요약}" 형태. 상세 값은 형제 `<table>`(aria-describedby)로.
 */
export function chartAriaLabel(
  model: Pick<ChartDataModel, 'categories' | 'series'>,
  title = '차트'
): string {
  const { categories, series } = model;
  const seriesNames = series.map(s => s.name).join(', ') || '데이터 없음';
  return `${title}: ${categories.length}개 카테고리별 ${seriesNames} — 상세 값은 아래 표를 참고하세요`;
}
