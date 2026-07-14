// DD-02 노드예산 클램프·되먹임 차단(진동0)·언바운드 감지
import { describe, it, expect } from 'vitest';
import { NodeBudget } from '../../../src/core/coordinate/NodeBudget.js';
import { ResizeGovernor } from '../../../src/core/coordinate/ResizeGovernor.js';
import { px } from '../../../src/core/coordinate/types.js';

describe('NodeBudget — DOM≤5000 게이트(REQ-TX-803)', () => {
  const budget = new NodeBudget({ maxNodes: 5000 });

  it('예산 내 → withinBudget', () => {
    const r = budget.evaluate({ visibleRows: 40, visibleCols: 10, overscanRows: 5 });
    expect(r.estimatedNodes).toBe(450);
    expect(r.withinBudget).toBe(true);
    expect(r.clampedRows).toBeUndefined();
  });

  it('예산 초과 → clampedRows 로 세로 윈도 축소', () => {
    // 전행 폭주 시나리오: 100000행 × 10열
    const r = budget.evaluate({ visibleRows: 100_000, visibleCols: 10, overscanRows: 0 });
    expect(r.withinBudget).toBe(false);
    expect(r.clampedRows).toBe(500); // 5000/10
    // 클램프 후 노드수는 예산 이하
    expect(r.clampedRows! * 10).toBeLessThanOrEqual(5000);
  });

  it('클램프 최소 1행 보장', () => {
    const r = budget.evaluate({ visibleRows: 100_000, visibleCols: 10_000, overscanRows: 0 });
    expect(r.clampedRows).toBeGreaterThanOrEqual(1);
  });
});

describe('ResizeGovernor — 되먹임 3중 방벽(REQ-T8-871/T3-816)', () => {
  it('임계값 미만 변화 무시(자기 되먹임 흡수)', () => {
    const g = new ResizeGovernor({ minDeltaPx: px(2), fallbackViewportHeight: px(800) });
    g.beginFrame();
    expect(g.admit({ height: 600, width: 400 }).kind).toBe('apply');
    g.beginFrame();
    // 0.5px 변화 < 2px → 무시
    const d = g.admit({ height: 600.5, width: 400 });
    expect(d.kind).toBe('ignore');
    if (d.kind === 'ignore') expect(d.reason).toBe('below-threshold');
  });

  it('프레임 재진입 가드 — 같은 프레임 2회차 무시', () => {
    const g = new ResizeGovernor({ fallbackViewportHeight: px(800) });
    g.beginFrame();
    expect(g.admit({ height: 600, width: 400 }).kind).toBe('apply');
    const d = g.admit({ height: 700, width: 400 }); // 같은 프레임 2회차
    expect(d.kind).toBe('ignore');
    if (d.kind === 'ignore') expect(d.reason).toBe('reentrant');
    expect(g.stats().passesThisFrame).toBe(1);
  });

  it('A→B→A 진동 검출 → oscillation 무시·수렴 고정', () => {
    const g = new ResizeGovernor({ fallbackViewportHeight: px(800) });
    // A(600) apply
    g.beginFrame();
    expect(g.admit({ height: 600, width: 400 }).kind).toBe('apply');
    // B(650) apply
    g.beginFrame();
    expect(g.admit({ height: 650, width: 400 }).kind).toBe('apply');
    // A(600) again → 진동(2-back=600, last=650)
    g.beginFrame();
    const d = g.admit({ height: 600, width: 400 });
    expect(d.kind).toBe('ignore');
    if (d.kind === 'ignore') expect(d.reason).toBe('oscillation');
    expect(g.stats().oscillationDetected).toBe(true);
  });

  it('안정 수렴 시나리오 — 진동 0·프레임당 1패스', () => {
    const g = new ResizeGovernor({ fallbackViewportHeight: px(800) });
    let osc = false;
    for (const h of [600, 600, 600, 601, 601]) {
      g.beginFrame();
      g.admit({ height: h, width: 400 });
      if (g.stats().oscillationDetected) osc = true;
      expect(g.stats().passesThisFrame).toBeLessThanOrEqual(1);
    }
    expect(osc).toBe(false);
  });
});

describe('ResizeGovernor — 언바운드/0px 클램프(REQ-T8-872)', () => {
  it('height 0 → fallback 클램프(동작 계약)', () => {
    const g = new ResizeGovernor({ fallbackViewportHeight: px(800) });
    g.beginFrame();
    const d = g.admit({ height: 0, width: 400 });
    expect(d.kind).toBe('apply');
    if (d.kind === 'apply') {
      expect(d.clamped).toBe(true);
      expect(d.height).toBe(800);
    }
  });

  it('height Infinity/NaN → fallback 클램프', () => {
    const g = new ResizeGovernor({ fallbackViewportHeight: px(640) });
    g.beginFrame();
    const inf = g.admit({ height: Infinity, width: 400 });
    expect(inf.kind === 'apply' && inf.clamped && inf.height === 640).toBe(true);
    g.beginFrame();
    const nan = g.admit({ height: NaN, width: 400 });
    // NaN 은 640 으로 클램프되지만 직전(640)과 동일 → below-threshold 무시가 정상
    expect(nan.kind).toBe('ignore');
  });

  it('정상 height → 클램프 없음', () => {
    const g = new ResizeGovernor({ fallbackViewportHeight: px(800) });
    g.beginFrame();
    const d = g.admit({ height: 640, width: 400 });
    expect(d.kind === 'apply' && d.clamped === false).toBe(true);
  });
});
