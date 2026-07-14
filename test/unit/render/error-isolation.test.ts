// DD-03 §3 UC-3 셀단위 오류격리·회로차단·raw 폴백 (REQ-T3-819/T4-810/TX-840)
import { describe, it, expect, vi } from 'vitest';
import {
  CellPipeline, CellStageRegistry, RenderBudget, CellApplier, OverlayCompositor,
  CellErrorBoundary, StageCircuitBreaker,
} from '../../../src/core/render/index.js';
import { makeReq, makeStage } from './_helpers.js';

function parts(breakerThreshold?: number) {
  const registry = new CellStageRegistry();
  const budget = new RenderBudget({ frameMs: 16, perCellMs: 2 });
  const applier = new CellApplier();
  const compositor = new OverlayCompositor();
  const boundary = new CellErrorBoundary();
  const breaker = new StageCircuitBreaker(breakerThreshold);
  const pipeline = new CellPipeline(registry, budget, applier, compositor, boundary, breaker);
  return { registry, boundary, breaker, pipeline };
}

describe('오류격리 — 한 단계 throw 가 다른 단계·셀을 죽이지 않음', () => {
  it('배경 단계 throw → 다른 배경 단계는 정상 기여, never throw', () => {
    const { registry, pipeline } = parts();
    registry.register(makeStage('boom', 'background', () => { throw new Error('boom'); }, 10));
    registry.register(makeStage('ok', 'background', () => ({ background: '#0a0a0a' }), 20));
    let acc: ReturnType<typeof pipeline.compose>;
    expect(() => { acc = pipeline.compose(makeReq()); }).not.toThrow();
    expect(acc!.background).toBe('#0a0a0a');
    const boomTrace = acc!.trace.find(e => e.stageId === 'boom')!;
    expect(boomTrace.failed).toBe(true);
    expect(boomTrace.contributed).toBe(false);
  });

  it('onError 관측성 콜백 방출', () => {
    const { registry, boundary, pipeline } = parts();
    const seen: string[] = [];
    boundary.onError((scope) => seen.push(scope.stageId));
    registry.register(makeStage('bad', 'value', () => { throw new Error('x'); }));
    pipeline.compose(makeReq());
    expect(seen).toContain('bad');
  });

  it('값 렌더러 throw → renderCell 은 raw String(value) 폴백(TX-840)', () => {
    const { registry, pipeline } = parts();
    registry.register(makeStage('val', 'value', () => { throw new Error('render fail'); }));
    const el = document.createElement('div');
    expect(() => pipeline.renderCell(makeReq({ value: 42 }), el)).not.toThrow();
    expect(el.textContent).toBe('42');
  });

  it('content 팩토리 자체가 throw 해도 셀만 격리(applier 경계)', () => {
    const { registry, pipeline } = parts();
    registry.register(makeStage('val', 'value', () => ({ content: () => { throw new Error('build fail'); } })));
    const el = document.createElement('div');
    expect(() => pipeline.renderCell(makeReq(), el)).not.toThrow();
  });
});

describe('회로차단 — 반복 실패 provider open → skip', () => {
  it('임계(3)회 연속 실패 → isOpen, 이후 호출 skip', () => {
    const { registry, breaker, pipeline } = parts(3);
    registry.register(makeStage('flaky', 'background', () => { throw new Error('f'); }));
    for (let i = 0; i < 3; i++) pipeline.compose(makeReq());
    expect(breaker.isOpen('flaky')).toBe(true);
    // 4번째: 회로 open → contribute 호출 자체 skip(trace 는 failed·ms 0).
    const acc = pipeline.compose(makeReq());
    const tr = acc.trace.find(e => e.stageId === 'flaky')!;
    expect(tr.failed).toBe(true);
    expect(tr.ms).toBe(0);
  });

  it('onTrip 관측성 이벤트 방출(REQ-T3-819)', () => {
    const { registry, breaker, pipeline } = parts(2);
    const trip = vi.fn();
    breaker.onTrip(trip);
    registry.register(makeStage('flaky', 'value', () => { throw new Error('f'); }));
    pipeline.compose(makeReq());
    pipeline.compose(makeReq());
    expect(trip).toHaveBeenCalledWith('flaky');
  });

  it('성공 1회 → 실패 카운트 리셋(닫힘 유지)', () => {
    const { registry, breaker, pipeline } = parts(3);
    let fail = true;
    registry.register(makeStage('sometimes', 'value', () => {
      if (fail) throw new Error('f');
      return null;
    }));
    pipeline.compose(makeReq()); // fail 1
    pipeline.compose(makeReq()); // fail 2
    fail = false;
    pipeline.compose(makeReq()); // success → reset
    fail = true;
    pipeline.compose(makeReq()); // fail 1 (리셋되어 아직 open 아님)
    expect(breaker.isOpen('sometimes')).toBe(false);
  });
});
