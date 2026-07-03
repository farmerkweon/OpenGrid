import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DETAIL_EXPANDER_MIN_HIT_TARGET_PX } from '../../src/core/detail/DetailGlyph.js';

/**
 * HV-02/LV-01(합동판정 Blocker) 해소 검증: `DetailGlyph.ts:24`가 선언하는
 * `DETAIL_EXPANDER_MIN_HIT_TARGET_PX=44` 상수가 실제 렌더 코드(GridRenderer.ts)+스타일(base.css)에
 * 배선돼 있는지를, 두 소스 파일을 직접 파싱해 계산으로 검증한다(jsdom은 실레이아웃이 없어
 * getBoundingClientRect 로는 검증 불가 — C8.4 관련 F1 채우기 핸들과 동일한 검증 방식 부재를 보완).
 */
const gridRendererSrc = readFileSync(resolve(__dirname, '../../src/core/GridRenderer.ts'), 'utf-8');
const baseCssSrc = readFileSync(resolve(__dirname, '../../src/styles/base.css'), 'utf-8');

function findCoarsePointerBlocks(css: string): string[] {
  const matches = css.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/g);
  return matches ?? [];
}

/** GridRenderer 가 og-detail-expander 버튼(F2 §4.5)에 거는 인라인 min-width/min-height(시각 크기). */
function findExpanderBaseSize(): { baseW: number; baseH: number } {
  expect(
    gridRendererSrc.includes("_el('span', 'og-detail-expander')"),
    'GridRenderer.ts 가 더 이상 og-detail-expander 버튼을 생성하지 않음(구조 변경?)'
  ).toBe(true);
  const m = gridRendererSrc.match(/min-width:(\d+)px;min-height:(\d+)px/);
  expect(m, 'GridRenderer.ts 의 og-detail-expander 버튼 인라인 크기를 찾지 못함').toBeTruthy();
  return { baseW: Number(m![1]), baseH: Number(m![2]) };
}

describe('F2 expander 터치 히트 타겟 배선 (C8.4, HV-02/LV-01 해소)', () => {
  it('og-detail-expander 버튼의 시각 크기(min-width/min-height)를 렌더 코드에서 추출한다', () => {
    const { baseW, baseH } = findExpanderBaseSize();
    expect(baseW).toBeGreaterThan(0);
    expect(baseH).toBeGreaterThan(0);
  });

  it('pointer:coarse 환경에서 padding 확대분을 더하면 히트박스가 44px 이상이 된다', () => {
    const { baseW, baseH } = findExpanderBaseSize();

    const coarseBlocks = findCoarsePointerBlocks(baseCssSrc);
    const expanderBlock = coarseBlocks.find((b) => b.includes('.og-detail-expander'));
    expect(
      expanderBlock,
      'pointer:coarse 블록에 .og-detail-expander 히트박스 확대 규칙이 없다(HV-02/LV-01 미해소)'
    ).toBeTruthy();

    const paddingMatch = expanderBlock!.match(/\.og-detail-expander\s*\{[^}]*padding:\s*(\d+)px/);
    expect(paddingMatch, 'og-detail-expander 에 히트박스 확대 padding 이 배선되지 않음').toBeTruthy();
    const padding = Number(paddingMatch![1]);

    const hitW = baseW + padding * 2;
    const hitH = baseH + padding * 2;
    expect(hitW).toBeGreaterThanOrEqual(DETAIL_EXPANDER_MIN_HIT_TARGET_PX);
    expect(hitH).toBeGreaterThanOrEqual(DETAIL_EXPANDER_MIN_HIT_TARGET_PX);
  });

  it('부모 셀(og-col-detail-toggle)의 overflow:hidden 이 pointer:coarse 에서 해제되어 확대된 히트영역이 잘리지 않는다', () => {
    const coarseBlocks = findCoarsePointerBlocks(baseCssSrc);
    const overflowBlock = coarseBlocks.find(
      (b) => b.includes('.og-col-detail-toggle') && /overflow:\s*visible/.test(b)
    );
    expect(
      overflowBlock,
      'og-col-detail-toggle 의 overflow:hidden 해제 규칙이 pointer:coarse 에 없다 — 부모 og-cell의 ' +
        'overflow:hidden 이 확대된 히트영역을 잘라낼 수 있다'
    ).toBeTruthy();
  });

  it('F1 채우기 핸들(og-range-fill-handle)은 이미 44px 히트박스가 배선돼 있다(회귀 확인)', () => {
    const coarseBlocks = findCoarsePointerBlocks(baseCssSrc);
    const handleBlock = coarseBlocks.find((b) => b.includes('.og-range-fill-handle'));
    expect(handleBlock).toBeTruthy();
    const wh = handleBlock!.match(/\.og-range-fill-handle\s*\{[^}]*width:\s*(\d+)px;\s*height:\s*(\d+)px/);
    expect(wh, 'og-range-fill-handle 의 pointer:coarse 확대 규칙 형식이 바뀜').toBeTruthy();
    expect(Number(wh![1])).toBeGreaterThanOrEqual(DETAIL_EXPANDER_MIN_HIT_TARGET_PX);
    expect(Number(wh![2])).toBeGreaterThanOrEqual(DETAIL_EXPANDER_MIN_HIT_TARGET_PX);
  });
});
