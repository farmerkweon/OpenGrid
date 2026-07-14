// ============================================================
// DD-03 §2.4 / §4.1 부트스트랩 단계 — ValueRendererStage (값 레인, Adapter)
// 레거시 CellRenderer SPI(19종 + createRenderer·registerRenderer)를 값 레인 계약으로 흡수한다.
// 하위호환 100%: 값 노드는 기존 createRenderer(col).render(ctx) 그대로. contribute 는 순수 —
// DOM 은 만들지 않고 '팩토리'(()=>Node)만 반환하고, Applier 가 나중에 호출해 물질화한다.
// ============================================================

import type { ICellStage, CellRenderRequest, StagePaint } from '../CellRenderRequest.js';
import { createRenderer, type RenderContext } from '../../renderers/CellRenderer.js';

/**
 * req(읽기전용 투영) → 레거시 RenderContext 어댑트. displayFormatter/displayValue 는 상류 판정
 * (verdicts.display)에서 온다 — 값 레인 단일소스(DD-04 소비, §1.모름).
 * / Adapt req → legacy RenderContext. display comes from upstream verdicts (DD-04 single source).
 */
function toRenderContext(req: CellRenderRequest): RenderContext {
  return {
    value: req.value,
    row: req.row,
    rowIndex: req.ri,
    column: req.column,
    colIndex: req.ci,
    isSelected: req.isSelected,
    rowState: req.rowState,
    t: req.t,
    displayValue: req.verdicts?.display ?? null,
  };
}

/**
 * 값 레인 부트스트랩 단계(Adapter). createRenderer 로 컬럼의 값 렌더러를 해석하고, 그 render(ctx)
 * 호출을 지연 팩토리로 감싸 content 로 기여한다. 렌더러 예외는 파이프라인 오류경계가 셀단위로
 * 격리(REQ-TX-840) → content 미기여 시 Applier 가 raw 폴백.
 * / Value lane bootstrap stage (Adapter). Resolves the column's value renderer via createRenderer and
 * contributes its render(ctx) as a deferred content factory.
 */
export class ValueRendererStage implements ICellStage {
  readonly id = 'core.value';
  readonly kind = 'value' as const;
  readonly order = 100;

  appliesTo(): boolean {
    return true;
  }

  contribute(req: CellRenderRequest): StagePaint {
    const ctx = toRenderContext(req);
    // 지연 팩토리: 여기서 DOM 을 만들지 않는다(contribute 순수). Applier 가 호출 시 물질화.
    return { content: () => createRenderer(req.column).render(ctx) };
  }
}
