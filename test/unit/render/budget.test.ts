// DD-03 §2.4 RenderBudget — 인터셉터 before/after + 예산 계측·경고 (REQ-TX-889)
import { describe, it, expect, vi } from 'vitest';
import {
  RenderBudget, CellPipeline, CellStageRegistry, CellApplier, OverlayCompositor,
  CellErrorBoundary, StageCircuitBreaker,
} from '../../../src/core/render/index.js';
import { makeReq } from './_helpers.js';

describe('RenderBudget — 인터셉터 등록·실행', () => {
  it('addInterceptor → beforeCell/afterCell 훅 실행', () => {
    const budget = new RenderBudget({ frameMs: 16, perCellMs: 2 });
    const before = vi.fn();
    const after = vi.fn();
    budget.addInterceptor({ id: 'i1', beforeCell: before, afterCell: after });
    const req = makeReq();
    const el = document.createElement('div');
    budget.runBeforeCell(req);
    budget.runAfterCell(req, el);
    expect(before).toHaveBeenCalledWith(req);
    expect(after).toHaveBeenCalledWith(req, el);
  });

  it('dispose → 인터셉터 제거', () => {
    const budget = new RenderBudget({ frameMs: 16, perCellMs: 2 });
    const before = vi.fn();
    const d = budget.addInterceptor({ id: 'i1', beforeCell: before });
    d.dispose();
    budget.runBeforeCell(makeReq());
    expect(before).not.toHaveBeenCalled();
    expect(budget.interceptorCount).toBe(0);
  });

  it('예산 초과 → report() 에 계측(주입 시간원)', () => {
    let clock = 0;
    const budget = new RenderBudget({ frameMs: 16, perCellMs: 2, now: () => clock });
    // beforeCell 이 10ms 소모(>perCellMs 2) → 초과 계측.
    budget.addInterceptor({ id: 'heavy', beforeCell: () => { clock += 10; } });
    budget.runBeforeCell(makeReq());
    const rep = budget.report();
    expect(rep.overBudget).toHaveLength(1);
    expect(rep.overBudget[0]).toEqual({ id: 'heavy', ms: 10 });
  });

  it('예산 내 인터셉터는 report 에 미포함', () => {
    let clock = 0;
    const budget = new RenderBudget({ frameMs: 16, perCellMs: 5, now: () => clock });
    budget.addInterceptor({ id: 'light', beforeCell: () => { clock += 1; } });
    budget.runBeforeCell(makeReq());
    expect(budget.report().overBudget).toHaveLength(0);
  });
});

describe('CellPipeline — 인터셉터 배선(가시셀 렌더 경로)', () => {
  it('renderCell 이 before/after 인터셉터를 예산 경유로 실행', () => {
    const registry = new CellStageRegistry();
    const budget = new RenderBudget({ frameMs: 16, perCellMs: 2 });
    const pipeline = new CellPipeline(
      registry, budget, new CellApplier(), new OverlayCompositor(),
      new CellErrorBoundary(), new StageCircuitBreaker(),
    );
    const calls: string[] = [];
    budget.addInterceptor({
      id: 'trace',
      beforeCell: () => calls.push('before'),
      afterCell: () => calls.push('after'),
    });
    pipeline.renderCell(makeReq(), document.createElement('div'));
    expect(calls).toEqual(['before', 'after']);
  });

  it('인터셉터 throw 는 셀 격리(never throw to host)', () => {
    const registry = new CellStageRegistry();
    const budget = new RenderBudget({ frameMs: 16, perCellMs: 2 });
    const pipeline = new CellPipeline(
      registry, budget, new CellApplier(), new OverlayCompositor(),
      new CellErrorBoundary(), new StageCircuitBreaker(),
    );
    budget.addInterceptor({ id: 'bad', beforeCell: () => { throw new Error('boom'); } });
    expect(() => pipeline.renderCell(makeReq(), document.createElement('div'))).not.toThrow();
  });
});
