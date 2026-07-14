// DD-13 §2.8 릴리스 게이트 정본 — 단일 blocking(AND) (REQ-TX-871)
import { describe, it, expect } from 'vitest';
import { DEFAULT_PERF_SPEC, metricId } from '../../../src/core/quality/PerfSpec.js';
import { EMPTY_BASELINE } from '../../../src/core/quality/PerfBaseline.js';
import { RegressionJudge } from '../../../src/core/quality/RegressionJudge.js';
import { ContrastAuditor, type AppearanceSnapshotLike } from '../../../src/core/quality/ContrastAuditor.js';
import {
  ReleaseGate, RegressionSubGate, ContrastSubGate, type GateContext, type ISubGate, type SubGateResult,
} from '../../../src/core/quality/ReleaseGate.js';

const judge = new RegressionJudge(DEFAULT_PERF_SPEC, EMPTY_BASELINE);
const perfGate = new RegressionSubGate('perf', judge, id => /\.(p95|p50|fps)$/.test(id) && !id.startsWith('memory'));
const memGate = new RegressionSubGate('memory', judge, id => id.startsWith('memory.'));
const contrastGate = new ContrastSubGate('contrast', new ContrastAuditor());

const P95_SORT_1M = metricId('sort', '1m', 'p95');

const passingContext: GateContext = {
  metrics: { [P95_SORT_1M]: 500, 'memory.1m.residentMb': 300 },
  snapshots: [{
    theme: 'light', skin: 'default', state: 'default',
    colors: { text: '#111', bg: '#fff' },
    pairs: [{ fgToken: 'text', bgToken: 'bg', kind: 'bodyText' }],
  }],
};

describe('ReleaseGate — 전원 통과 = pass', () => {
  it('5축 통과 → status pass, blockingReasons 빈 배열', async () => {
    const gate = new ReleaseGate([perfGate, memGate, contrastGate]);
    const v = await gate.evaluate(passingContext);
    expect(v.status).toBe('pass');
    expect(v.blockingReasons).toEqual([]);
    expect(v.subGates.every(g => g.status === 'pass')).toBe(true);
  });
});

describe('ReleaseGate — AND 게이트(하나라도 fail → blocked)', () => {
  it('perf 예산 초과 → blocked + 원인 지표·REQ 리포트', async () => {
    const gate = new ReleaseGate([perfGate, memGate, contrastGate]);
    const v = await gate.evaluate({
      ...passingContext,
      metrics: { [P95_SORT_1M]: 700, 'memory.1m.residentMb': 300 }, // sort 상한 600 초과
    });
    expect(v.status).toBe('blocked');
    expect(v.subGates.find(g => g.id === 'perf')!.status).toBe('fail');
    expect(v.blockingReasons.some(r => r.subGate === 'perf' && r.metricId === P95_SORT_1M)).toBe(true);
    expect(v.blockingReasons[0]!.reqIds).toContain('REQ-TX-801');
  });

  it('메모리 초과 → blocked(다른 축은 pass여도)', async () => {
    const gate = new ReleaseGate([perfGate, memGate, contrastGate]);
    const v = await gate.evaluate({
      ...passingContext,
      metrics: { [P95_SORT_1M]: 500, 'memory.1m.residentMb': 500 }, // 400 초과
    });
    expect(v.status).toBe('blocked');
    expect(v.subGates.find(g => g.id === 'memory')!.status).toBe('fail');
  });

  it('대비 미달 → blocked(a11y/contrast 축)', async () => {
    const gate = new ReleaseGate([perfGate, memGate, contrastGate]);
    const bad: AppearanceSnapshotLike = {
      theme: 'light', skin: 'default', state: 'default',
      colors: { text: '#999999', bg: '#ffffff' }, // ≈2.85:1 미달
      pairs: [{ fgToken: 'text', bgToken: 'bg', kind: 'bodyText' }],
    };
    const v = await gate.evaluate({ ...passingContext, snapshots: [bad] });
    expect(v.status).toBe('blocked');
    expect(v.subGates.find(g => g.id === 'contrast')!.status).toBe('fail');
    expect(v.blockingReasons.some(r => r.subGate === 'contrast')).toBe(true);
  });

  it('부분통과 개념 없음 — 4 pass·1 fail 여도 전체 blocked', async () => {
    const alwaysFail: ISubGate = {
      id: 'bundle',
      run: async (): Promise<SubGateResult> => ({
        id: 'bundle', status: 'fail',
        failures: [{ metricId: 'bundle.core.gzipKb', measured: 120, budget: 108, reqIds: ['REQ-TX-809'] }],
      }),
    };
    const gate = new ReleaseGate([perfGate, memGate, contrastGate, alwaysFail]);
    const v = await gate.evaluate(passingContext);
    expect(v.status).toBe('blocked');
    expect(v.subGates.filter(g => g.status === 'pass').length).toBe(3);
    expect(v.blockingReasons.some(r => r.subGate === 'bundle')).toBe(true);
  });
});

describe('ReleaseGate — 축 커버리지(미등록 축 침묵통과 방지)', () => {
  it('bundle·a11y 미등록 → coverageGaps 지목', () => {
    const gate = new ReleaseGate([perfGate, memGate, contrastGate]);
    expect(gate.coverageGaps().sort()).toEqual(['a11y', 'bundle']);
  });

  it('5축 전원 등록 → 갭 없음', () => {
    const noop = (id: 'bundle' | 'a11y'): ISubGate => ({
      id, run: async (): Promise<SubGateResult> => ({ id, status: 'pass', failures: [] }),
    });
    const gate = new ReleaseGate([perfGate, memGate, contrastGate, noop('bundle'), noop('a11y')]);
    expect(gate.coverageGaps()).toEqual([]);
  });
});

describe('ReleaseGate — 체크리스트 정본', () => {
  it('5축 자동 항목 렌더(OCP additive 조립)', () => {
    const gate = new ReleaseGate([perfGate, memGate, contrastGate]);
    const items = gate.checklist();
    const gates = items.map(i => i.subGate);
    expect(gates).toEqual(['perf', 'memory', 'bundle', 'contrast', 'a11y']);
    expect(items.every(i => i.automated)).toBe(true);
  });
});
