// ============================================================
// DD-03 §5 부트스트랩 단계 — BackgroundStage (배경 레인, COLOR 축)
// 현 renderBody 의 배경 결정(base/zebra/state/selection)을 배경 레인 단일 기여로 재편성.
// 색(COLOR/테마)만 배선한다(§9.1 직교 2축) — 형태는 데코 레인 소관. 순수(DOM 접근 0).
// ============================================================

import type { ICellStage, CellRenderRequest, StagePaint } from '../CellRenderRequest.js';

/** 상태별 배경 토큰(오늘의 var() 폴백 규약 유지). / State→background tokens. */
const STATE_BG: Record<'added' | 'edited' | 'removed', string> = {
  added: 'var(--og-added-state-bg,#e8f5e9)',
  edited: 'var(--og-edited-state-bg,#fff8e1)',
  removed: 'var(--og-removed-state-bg,#ffebee)',
};

/**
 * 배경 레인 부트스트랩 단계. 선택 > 상태 > zebra > base 우선순위로 배경색 1개를 기여한다.
 * COLOR 축(테마)만 질의 — 형태(스킨)는 만지지 않아 두 축이 간섭 없이 겹친다(§9.1).
 * / Background lane bootstrap stage. Contributes one background color (selection > state > zebra >
 * base). Touches only the COLOR axis so it stays orthogonal to the FORM axis.
 */
export class BackgroundStage implements ICellStage {
  readonly id = 'core.background';
  readonly kind = 'background' as const;
  readonly order = 10;

  appliesTo(): boolean {
    return true;
  }

  contribute(req: CellRenderRequest): StagePaint {
    let background: string;
    if (req.isSelected) {
      background = 'var(--og-row-selected-bg,#e3f2fd)';
    } else if (req.rowState !== 'none') {
      background = STATE_BG[req.rowState];
    } else if (req.ri % 2 === 1) {
      background = 'var(--og-row-alt-bg,#fafafa)';
    } else {
      background = 'var(--og-row-bg,#fff)';
    }
    return { background };
  }
}
