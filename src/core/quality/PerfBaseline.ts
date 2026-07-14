// ============================================================
// DD-13 §2.3 기준선 모델 (REQ-TX-801 회귀 차단·TX-871)
// / DD-13 §2.3 Baseline model.
// 회귀 판정의 유일한 진실원. 버전 관리되는 골든 파일의 데이터 모델. 순수·헤드리스.
// ============================================================

/** 지표 단위. / Metric unit. */
export type MetricUnit = 'ms' | 'fps' | 'kb' | 'mb' | 'ratio' | 'nodes' | 'percent';

/** 단일 지표의 기준값 — 골든 파일(버전 관리)의 한 항목. / A single baseline entry (golden file). */
export interface BaselineEntry {
  readonly metricId: string;     // 예: 'initialRender.1m.p95' | 'bundle.core.gzipKb'
  readonly value: number;        // 승인된 기준 실측치 / approved baseline measurement
  readonly unit: MetricUnit;
  readonly capturedAt: string;   // ISO — 언제 이 기준이 승인됐나 / when this baseline was approved
  readonly commit: string;       // 어느 커밋의 실측인가(재현성) / which commit produced it
}

/** 기준선 SSOT — 회귀 판정의 유일한 진실원. / Baseline SSOT — the single source of regression truth. */
export interface PerfBaseline {
  readonly version: string;
  readonly entries: Readonly<Record<string, BaselineEntry>>;
  /** 지표별 허용 회귀율 오버라이드(기본 5%). fps는 하한이라 부호 반전. / per-metric tolerance overrides. */
  readonly toleranceOverrides?: Readonly<Record<string, number>>;
}

/** 기본 허용 회귀율(%). / Default allowed regression (%). */
export const DEFAULT_REGRESSION_TOLERANCE_PCT = 5;

/** 빈 기준선(신규 지표 전부 status='new'). / An empty baseline (all metrics become 'new'). */
export const EMPTY_BASELINE: PerfBaseline = Object.freeze({
  version: '0.0.0',
  entries: Object.freeze({}),
});

/** 항목 배열로 기준선을 조립(편의). / Build a baseline from an entry array (convenience). */
export function makeBaseline(
  version: string,
  entries: readonly BaselineEntry[],
  toleranceOverrides?: Readonly<Record<string, number>>,
): PerfBaseline {
  const map: Record<string, BaselineEntry> = {};
  for (const e of entries) map[e.metricId] = e;
  return Object.freeze({
    version,
    entries: Object.freeze(map),
    ...(toleranceOverrides ? { toleranceOverrides: Object.freeze({ ...toleranceOverrides }) } : {}),
  });
}
