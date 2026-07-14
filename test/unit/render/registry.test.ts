// DD-03 §2.4 CellStageRegistry — 중복거부·order 정렬·kind 버킷·해제 토큰
import { describe, it, expect } from 'vitest';
import { CellStageRegistry } from '../../../src/core/render/index.js';
import { makeStage } from './_helpers.js';

describe('CellStageRegistry — 등록·정렬·중복거부', () => {
  it('kind 버킷으로 분리 조회', () => {
    const reg = new CellStageRegistry();
    reg.register(makeStage('bg', 'background', () => ({ background: '#fff' })));
    reg.register(makeStage('ov', 'overlay', () => null));
    expect(reg.stagesFor('background').map(s => s.id)).toEqual(['bg']);
    expect(reg.stagesFor('overlay').map(s => s.id)).toEqual(['ov']);
    expect(reg.stagesFor('value')).toEqual([]);
  });

  it('order 오름차순 정렬(동률은 등록순 안정)', () => {
    const reg = new CellStageRegistry();
    reg.register(makeStage('c', 'background', () => null, 30));
    reg.register(makeStage('a', 'background', () => null, 10));
    reg.register(makeStage('b1', 'background', () => null, 20));
    reg.register(makeStage('b2', 'background', () => null, 20));
    expect(reg.stagesFor('background').map(s => s.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('order 미지정은 기본 100', () => {
    const reg = new CellStageRegistry();
    reg.register(makeStage('def', 'background', () => null));       // 100
    reg.register(makeStage('early', 'background', () => null, 5));
    expect(reg.stagesFor('background').map(s => s.id)).toEqual(['early', 'def']);
  });

  it('중복 id 등록 거부(REQ-T6-823 단일 디스패치)', () => {
    const reg = new CellStageRegistry();
    reg.register(makeStage('dup', 'value', () => null));
    expect(() => reg.register(makeStage('dup', 'value', () => null))).toThrow(/duplicate stage id/);
  });

  it('해제 토큰 dispose → 재등록 가능', () => {
    const reg = new CellStageRegistry();
    const d = reg.register(makeStage('x', 'value', () => null));
    expect(reg.has('x')).toBe(true);
    d.dispose();
    expect(reg.has('x')).toBe(false);
    // 재등록이 중복거부에 걸리지 않는다.
    expect(() => reg.register(makeStage('x', 'value', () => null))).not.toThrow();
  });

  it('dispose 는 멱등(두 번 호출해도 안전)', () => {
    const reg = new CellStageRegistry();
    const d = reg.register(makeStage('y', 'value', () => null));
    d.dispose();
    reg.register(makeStage('y', 'value', () => null)); // 다시 등록
    d.dispose();                                        // 오래된 토큰 재호출 — 새 등록을 지우면 안 됨? 멱등 가드로 no-op
    expect(reg.has('y')).toBe(true);
  });
});
