// ============================================================
// DD-03 §5 부트스트랩 단계 배럴 — 4레인 기본 단계 + 등록 헬퍼
// 부트스트랩 4단계(배경→값→데코→오버레이)는 현 renderBody 동작을 담는 기본 기여자다.
// 이들만 등록되고 커스텀 단계 등록이 0 이면 산출은 현 셀과 정합(회귀 0 스트랭글러, §1.4).
// ============================================================

import type { CellStageRegistry } from '../CellStageRegistry.js';
import type { Disposable } from '../CellRenderRequest.js';
import { BackgroundStage } from './BackgroundStage.js';
import { ValueRendererStage } from './ValueRendererStage.js';
import { DecoratorStage } from './DecoratorStage.js';
import { OverlayStage } from './OverlayStage.js';

export { BackgroundStage } from './BackgroundStage.js';
export { ValueRendererStage } from './ValueRendererStage.js';
export { DecoratorStage } from './DecoratorStage.js';
export { OverlayStage } from './OverlayStage.js';

/**
 * 부트스트랩 4단계를 레지스트리에 등록(배경·값·데코·오버레이). 각 해제 토큰을 반환한다.
 * / Register the 4 bootstrap stages onto a registry. Returns their disposal tokens.
 *
 * @param registry - 대상 레지스트리 / Target registry
 * @returns 등록 해제 토큰 배열 / Disposal tokens
 */
export function registerBootstrapStages(registry: CellStageRegistry): Disposable[] {
  return [
    registry.register(new BackgroundStage()),
    registry.register(new ValueRendererStage()),
    registry.register(new DecoratorStage()),
    registry.register(new OverlayStage()),
  ];
}
