// DD-03 §2.4/§3 CellPipeline — 4레인 순서·OCP 단계삽입·결정론(스트랭글러)·물질화
import { describe, it, expect } from 'vitest';
import {
  CellPipeline, CellStageRegistry, RenderBudget, CellApplier, OverlayCompositor,
  CellErrorBoundary, StageCircuitBreaker, createDefaultPipeline,
} from '../../../src/core/render/index.js';
import { makeReq, makeStage } from './_helpers.js';

function bareParts() {
  const registry = new CellStageRegistry();
  const budget = new RenderBudget({ frameMs: 16, perCellMs: 2 });
  const applier = new CellApplier();
  const compositor = new OverlayCompositor();
  const boundary = new CellErrorBoundary();
  const breaker = new StageCircuitBreaker();
  const pipeline = new CellPipeline(registry, budget, applier, compositor, boundary, breaker);
  return { registry, budget, applier, compositor, boundary, breaker, pipeline };
}

describe('CellPipeline — 4레인 순서(배경→값→데코→오버레이)', () => {
  it('레인 순서대로 contribute 호출', () => {
    const { registry, pipeline } = bareParts();
    const order: string[] = [];
    // 등록 순서를 일부러 뒤섞어도 레인 계약 순서로 순회돼야 한다.
    registry.register(makeStage('ovl', 'overlay', () => { order.push('overlay'); return null; }));
    registry.register(makeStage('val', 'value', () => { order.push('value'); return null; }));
    registry.register(makeStage('deco', 'decorator', () => { order.push('decorator'); return null; }));
    registry.register(makeStage('bg', 'background', () => { order.push('background'); return null; }));
    pipeline.compose(makeReq());
    expect(order).toEqual(['background', 'value', 'decorator', 'overlay']);
  });

  it('trace 가 순회 순서·기여 여부를 기록', () => {
    const { registry, pipeline } = bareParts();
    registry.register(makeStage('bg', 'background', () => ({ background: '#fff' })));
    registry.register(makeStage('val', 'value', () => null)); // 무기여
    const acc = pipeline.compose(makeReq());
    const t = acc.trace;
    expect(t.map(e => e.stageId)).toEqual(['bg', 'val']);
    expect(t[0]!.contributed).toBe(true);
    expect(t[1]!.contributed).toBe(false);
  });
});

describe('CellPipeline — OCP 단계 삽입(코어 편집 없이)', () => {
  it('레지스트리에 커스텀 오버레이 단계 삽입 → 합성에 반영', () => {
    const { registry, pipeline } = bareParts();
    registry.register(makeStage('ext.watermark', 'overlay', () => ({
      overlays: [{ role: 'annotation', ownsHit: false, build: () => document.createElement('span') }],
    })));
    const acc = pipeline.compose(makeReq());
    expect(acc.overlays).toHaveLength(1);
    expect(acc.overlays[0]!.role).toBe('annotation');
  });

  it('배경 단계 다중 등록 → last-wins 병합 + bgLayers 누적', () => {
    const { registry, pipeline } = bareParts();
    registry.register(makeStage('base', 'background', () => ({ background: '#111', bgLayers: [{ fill: '#aaa', z: 1, role: 'databar' }] }), 10));
    registry.register(makeStage('over', 'background', () => ({ background: '#222' }), 20));
    const acc = pipeline.compose(makeReq());
    expect(acc.background).toBe('#222');     // 나중 order 승
    expect(acc.bgLayers).toHaveLength(1);    // 레이어는 누적
  });
});

describe('CellPipeline — 결정론(회귀 0 스트랭글러 토대)', () => {
  it('동일 요청·동일 등록 → 동일 페인트(배경/힌트/클래스)', () => {
    const { pipeline } = (() => {
      const p = createDefaultPipeline();
      return { pipeline: p.pipeline };
    })();
    const a = pipeline.compose(makeReq({ ri: 3 }));
    const b = pipeline.compose(makeReq({ ri: 3 }));
    expect(a.background).toBe(b.background);
    expect(a.contentColorHint).toBe(b.contentColorHint);
    expect([...a.classes]).toEqual([...b.classes]);
  });

  it('부트스트랩 배경: 리터럴 아닌 var() 배경 → 텍스트색 힌트 없음(기존 색 유지)', () => {
    const { pipeline } = createDefaultPipeline();
    const acc = pipeline.compose(makeReq());
    expect(acc.background).toMatch(/^var\(/);
    expect(acc.contentColorHint).toBeUndefined();
  });
});

describe('CellPipeline — 물질화(renderCell → DOM)', () => {
  it('값 노드·배경 인라인 적용', () => {
    const { pipeline } = createDefaultPipeline();
    const el = document.createElement('div');
    pipeline.renderCell(makeReq({ value: 'A1', ri: 1 }), el);
    expect(el.textContent).toContain('A1');
    expect(el.style.background).not.toBe('');
  });

  it('AA 텍스트색: 리터럴 어두운 배경 단계 → 값 노드에 흰색 힌트 적용', () => {
    const { registry, pipeline } = bareParts();
    registry.register(makeStage('bg', 'background', () => ({ background: '#101010' })));
    registry.register(makeStage('val', 'value', () => ({
      content: () => { const s = document.createElement('span'); s.textContent = 'x'; return s; },
    })));
    const el = document.createElement('div');
    pipeline.renderCell(makeReq(), el);
    const span = el.querySelector('span')!;
    expect(span.style.color).toBe('rgb(255, 255, 255)'); // #fff
  });
});
