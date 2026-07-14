// ============================================================
// DD-08 §2.4 — Generation 토큰 + CalcExecutor 유닛테스트
// 못박는 계약: 단조 증가·스테일 게이트(늦은 결과 폐기)·SyncCalcExecutor 폴백 동등(REQ-T8-806/843).
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  GenerationCounter, SyncCalcExecutor, applyIfCurrent, makeGeneration,
  type GenerationalResult,
} from '../../../src/core/formula/Generation.js';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import type { AstNode } from '../../../src/core/formula/types.js';
import { MockGridAccessor } from './testAccessor.js';

describe('GenerationCounter — 단조·스테일 게이트(§2.4)', () => {
  it('current 는 0 에서 시작, invalidate 는 단조 증가', () => {
    const gc = new GenerationCounter();
    expect(gc.current()).toBe(0);
    expect(gc.invalidate()).toBe(1);
    expect(gc.invalidate()).toBe(2);
    expect(gc.current()).toBe(2);
  });

  it('isCurrent 는 현재 세대만 true', () => {
    const gc = new GenerationCounter();
    const g0 = gc.current();
    gc.invalidate();
    expect(gc.isCurrent(g0)).toBe(false);
    expect(gc.isCurrent(gc.current())).toBe(true);
  });

  it('applyIfCurrent — 세대 일치 시에만 적용, 스테일은 폐기', () => {
    const gc = new GenerationCounter();
    const genAtRequest = gc.current();       // A 요청 발행
    gc.invalidate();                         // 사용자가 즉시 B 로 변경 → 세대 증가
    let applied: number | null = null;
    const staleA: GenerationalResult<number> = { gen: genAtRequest, value: 111 };
    expect(applyIfCurrent(gc, staleA, (v) => { applied = v; })).toBe(false);
    expect(applied).toBeNull();              // 늦게 온 A 결과 무시(setComputedValue 미호출)

    const freshB: GenerationalResult<number> = { gen: gc.current(), value: 222 };
    expect(applyIfCurrent(gc, freshB, (v) => { applied = v; })).toBe(true);
    expect(applied).toBe(222);               // 최종 상태 == 마지막 요청
  });

  it('makeGeneration 브랜드 태깅', () => {
    expect(makeGeneration(5)).toBe(5);
  });
});

describe('SyncCalcExecutor — evaluate 위임 폴백(§2.4, REQ-T8-843)', () => {
  it('supportsWorker=false, evalSync 는 evaluate 와 동일 결과', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addRow('r1', { a: 7 });
    const exec = new SyncCalcExecutor();
    expect(exec.supportsWorker).toBe(false);
    const ast: AstNode = { t: 'bin', op: '+', left: { t: 'num', v: '1' }, right: { t: 'num', v: '2' } };
    const out = exec.evalSync(ast, { rowId: 'r1', field: 'x' }, g);
    expect(out.error).toBeNull();
    expect((out.value as OGDecimal).toString()).toBe('3');
  });
});
