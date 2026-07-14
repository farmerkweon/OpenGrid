// DD-13 §2.1 SPS 데이터모델·예산 assert (REQ-TX-801·802·808)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERF_SPEC, LatencyClass, LATENCY_MS, metricId, findBudget, assertP95, assertFps,
  type Operation, type Scale,
} from '../../../src/core/quality/PerfSpec.js';

describe('PerfSpec — SPS 원장 완결성(21셀 전수)', () => {
  it('7조작×3규모=21 예산 셀 전수 존재', () => {
    expect(DEFAULT_PERF_SPEC.operations.length).toBe(21);
    const ops: Operation[] = ['initialRender', 'verticalScroll', 'sort', 'filter', 'cellEditCommit', 'cfRecalc', 'themeSwitch'];
    const scales: Scale[] = ['10k', '100k', '1m'];
    for (const op of ops) for (const scale of scales) {
      expect(findBudget(DEFAULT_PERF_SPEC, op, scale), `${op}.${scale}`).toBeDefined();
    }
  });

  it('브리프 대표 예산값과 바이트 정합(1M)', () => {
    expect(findBudget(DEFAULT_PERF_SPEC, 'initialRender', '1m')!.p95Ms).toBe(500);
    expect(findBudget(DEFAULT_PERF_SPEC, 'sort', '1m')!.p95Ms).toBe(600);
    expect(findBudget(DEFAULT_PERF_SPEC, 'filter', '1m')!.p95Ms).toBe(600);
    expect(findBudget(DEFAULT_PERF_SPEC, 'verticalScroll', '1m')!.minFps).toBe(55);
    // DOM 상한(DD-02 소유 상한 대조)
    expect(findBudget(DEFAULT_PERF_SPEC, 'initialRender', '1m')!.maxDomNodes).toBe(5000);
    // 메모리·페인트
    expect(DEFAULT_PERF_SPEC.memory.find(m => m.scale === '1m')!.maxResidentMb).toBe(400);
    expect(DEFAULT_PERF_SPEC.paint.find(p => p.scale === '1m')!.ttiMs).toBe(1000);
    expect(DEFAULT_PERF_SPEC.paint.find(p => p.scale === '1m')!.cls).toBe(0);
  });

  it('LatencyClass SSOT 수치 못박음(TX-802)', () => {
    expect(LATENCY_MS[LatencyClass.Instant]).toBe(16.7);
    expect(LATENCY_MS[LatencyClass.Immediate]).toBe(100);
    expect(LATENCY_MS[LatencyClass.Responsive]).toBe(200);
    expect(LATENCY_MS[LatencyClass.Heavy]).toBe(300);
  });

  it('coveredFeatures = features 키(예산없이 머지금지 계약)', () => {
    expect([...DEFAULT_PERF_SPEC.coveredFeatures].sort()).toEqual(
      ['cf', 'chart', 'databar', 'heatmap', 'sparkline', 'widgetCell'],
    );
  });
});

describe('PerfSpec — 예산 assert(상한/하한)', () => {
  it('assertP95: 상한 이하 통과·초과 실패', () => {
    const ok = assertP95(DEFAULT_PERF_SPEC, 'sort', '1m', 590);
    expect(ok.withinBudget).toBe(true);
    expect(ok.budget).toBe(600);
    expect(ok.metricId).toBe(metricId('sort', '1m', 'p95'));

    const bad = assertP95(DEFAULT_PERF_SPEC, 'sort', '1m', 650);
    expect(bad.withinBudget).toBe(false);
    expect(bad.isFloor).toBe(false);
  });

  it('assertFps: 하한 이상 통과·미만 실패(스크롤 하한)', () => {
    const ok = assertFps(DEFAULT_PERF_SPEC, 'verticalScroll', '1m', 58);
    expect(ok.withinBudget).toBe(true);
    expect(ok.isFloor).toBe(true);
    expect(ok.budget).toBe(55);

    const bad = assertFps(DEFAULT_PERF_SPEC, 'verticalScroll', '1m', 50);
    expect(bad.withinBudget).toBe(false);
  });

  it('경계값(=상한)은 통과(≤)', () => {
    expect(assertP95(DEFAULT_PERF_SPEC, 'initialRender', '1m', 500).withinBudget).toBe(true);
    expect(assertFps(DEFAULT_PERF_SPEC, 'verticalScroll', '1m', 55).withinBudget).toBe(true);
  });
});
