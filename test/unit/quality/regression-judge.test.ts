// DD-13 §2.3 회귀 판정기 — 예산+기준선 2중게이트 (REQ-TX-801·871)
import { describe, it, expect } from 'vitest';
import { DEFAULT_PERF_SPEC, metricId } from '../../../src/core/quality/PerfSpec.js';
import { makeBaseline, EMPTY_BASELINE } from '../../../src/core/quality/PerfBaseline.js';
import { RegressionJudge } from '../../../src/core/quality/RegressionJudge.js';

const iso = '2026-07-12T00:00:00Z';
const P95_SORT_1M = metricId('sort', '1m', 'p95'); // 'sort.1m.p95'

describe('RegressionJudge — 절대 예산 게이트(1급)', () => {
  it('예산 초과 → fail-budget', () => {
    const judge = new RegressionJudge(DEFAULT_PERF_SPEC, EMPTY_BASELINE);
    const [v] = judge.judge({ [P95_SORT_1M]: 700 }); // 상한 600 초과
    expect(v!.status).toBe('fail-budget');
    expect(v!.budget).toBe(600);
    expect(v!.reqIds).toContain('REQ-TX-801');
  });

  it('예산 내 + 기준선 없음 → new(회귀율 null, NaN 금지)', () => {
    const judge = new RegressionJudge(DEFAULT_PERF_SPEC, EMPTY_BASELINE);
    const [v] = judge.judge({ [P95_SORT_1M]: 500 });
    expect(v!.status).toBe('new');
    expect(v!.baseline).toBeNull();
    expect(v!.regressionPct).toBeNull();
  });
});

describe('RegressionJudge — 기준선 회귀 게이트(+5%)', () => {
  const baseline = makeBaseline('1.0.0', [
    { metricId: P95_SORT_1M, value: 500, unit: 'ms', capturedAt: iso, commit: 'abc' },
  ]);
  const judge = new RegressionJudge(DEFAULT_PERF_SPEC, baseline);

  it('기준 대비 +5% 이내 → pass', () => {
    const [v] = judge.judge({ [P95_SORT_1M]: 525 }); // +5% 정확히
    expect(v!.status).toBe('pass');
    expect(v!.regressionPct).toBeCloseTo(5, 6);
  });

  it('기준 대비 +5% 초과 → fail-regression(예산 내라도)', () => {
    const [v] = judge.judge({ [P95_SORT_1M]: 540 }); // +8%, 예산 600 이내
    expect(v!.status).toBe('fail-regression');
    expect(v!.regressionPct).toBeCloseTo(8, 6);
    expect(v!.baseline).toBe(500);
  });

  it('개선(음수 회귀) → pass', () => {
    const [v] = judge.judge({ [P95_SORT_1M]: 450 });
    expect(v!.status).toBe('pass');
    expect(v!.regressionPct).toBeCloseTo(-10, 6);
  });
});

describe('RegressionJudge — fps 하한 지표 부호 반전', () => {
  const fpsId = metricId('verticalScroll', '1m', 'fps');
  const baseline = makeBaseline('1.0.0', [
    { metricId: fpsId, value: 60, unit: 'fps', capturedAt: iso, commit: 'abc' },
  ]);
  const judge = new RegressionJudge(DEFAULT_PERF_SPEC, baseline);

  it('하한 미만 → fail-budget', () => {
    const [v] = judge.judge({ [fpsId]: 50 }); // minFps 55 미만
    expect(v!.status).toBe('fail-budget');
  });

  it('예산 내지만 기준 대비 -5% 초과 하락 → fail-regression', () => {
    const [v] = judge.judge({ [fpsId]: 56 }); // 예산 55 이상이나 기준 60 대비 -6.7%
    expect(v!.status).toBe('fail-regression');
    expect(v!.regressionPct!).toBeLessThan(-5);
  });

  it('기준 대비 -5% 이내 → pass', () => {
    const [v] = judge.judge({ [fpsId]: 58 }); // -3.3%
    expect(v!.status).toBe('pass');
  });
});

describe('RegressionJudge — per-feature 예산 게이트(TX-808)', () => {
  const judge = new RegressionJudge(DEFAULT_PERF_SPEC, EMPTY_BASELINE);

  it('cf.1m.frameMs 상한(18) 초과 → fail-budget', () => {
    const [v] = judge.judge({ 'cf.1m.frameMs': 20 }); // frameMs 상한 18 초과
    expect(v!.status).toBe('fail-budget');
    expect(v!.budget).toBe(18);
    expect(v!.reqIds).toContain('REQ-TX-808');
  });

  it('databar.1m.nodesPerVisibleRow 상한(2) 초과 → fail-budget', () => {
    const [v] = judge.judge({ 'databar.1m.nodesPerVisibleRow': 3 }); // 상한 2 초과
    expect(v!.status).toBe('fail-budget');
    expect(v!.budget).toBe(2);
  });

  it('예산 내 feature 지표 → new(기준선 없음)', () => {
    const [v] = judge.judge({ 'sparkline.1m.frameMs': 15 }); // 상한 18 이내
    expect(v!.status).toBe('new');
    expect(v!.budget).toBe(18);
  });
});

describe('RegressionJudge — 허용율 override·커버리지', () => {
  it('toleranceOverrides 로 지표별 완화/강화', () => {
    const baseline = makeBaseline('1.0.0',
      [{ metricId: P95_SORT_1M, value: 500, unit: 'ms', capturedAt: iso, commit: 'abc' }],
      { [P95_SORT_1M]: 10 }, // 10% 허용
    );
    const judge = new RegressionJudge(DEFAULT_PERF_SPEC, baseline);
    const [v] = judge.judge({ [P95_SORT_1M]: 540 }); // +8% → 10% 이내 pass
    expect(v!.status).toBe('pass');
  });

  it('coverageGaps: 예산 있는 기능 중 실측 없는 것 지목(머지금지 강제)', () => {
    const judge = new RegressionJudge(DEFAULT_PERF_SPEC, EMPTY_BASELINE);
    const gaps = judge.coverageGaps({ 'cf.1m.frameMs': 15 }); // cf 만 측정
    expect(gaps).not.toContain('cf');
    expect(gaps).toContain('sparkline');
    expect(gaps).toContain('chart');
  });
});
