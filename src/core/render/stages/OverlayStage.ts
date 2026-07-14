// ============================================================
// DD-03 §5 부트스트랩 단계 — OverlayStage (오버레이 레인, FORM + 상태색)
// 선택·포커스·편집보더 오버레이를 절대배치 팩토리로 기여한다(z 는 compositor 가 role→rank 배정).
// 미선택·비포커스 셀은 appliesTo=false(제로코스트, 고스트 재질 §9.3 — 상태는 additive).
// 포커스 링은 §9.5 비협상 하드룰(≥2px solid) — AppearanceResolver.focusRing() 경유. 순수(팩토리만).
// ============================================================

import type { ICellStage, CellRenderRequest, StagePaint, OverlayLayer } from '../CellRenderRequest.js';

/**
 * 오버레이 레인 부트스트랩 단계. 포커스·선택·편집보더 오버레이를 기여한다(있을 때만).
 * / Overlay lane bootstrap stage. Contributes focus/selection/edit-border overlays when applicable.
 */
export class OverlayStage implements ICellStage {
  readonly id = 'core.overlay';
  readonly kind = 'overlay' as const;
  readonly order = 100;

  appliesTo(req: CellRenderRequest): boolean {
    return req.isFocused || req.isSelected;
  }

  contribute(req: CellRenderRequest): StagePaint | null {
    const overlays: OverlayLayer[] = [];

    // 포커스 링 — §9.5 비협상: focusRing() 이 <2px/none 을 solid ≥2px 로 클램프.
    if (req.isFocused) {
      const ring = req.appearance.focusRing();
      overlays.push({
        role: 'edit-border',
        ownsHit: false,
        build: () => {
          const f = document.createElement('div');
          f.className = 'og-cell-focus-ring';
          f.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
          f.style.outline = ring;
          f.style.outlineOffset = '-2px';
          return f;
        },
      });
    }

    // 선택 보더 — G-ST2: 상태 신호는 스킨 무관 항상 solid(border({state:true})).
    if (req.isSelected) {
      const selBorder = req.appearance.border({ state: true });
      overlays.push({
        role: 'selection',
        ownsHit: false,
        build: () => {
          const s = document.createElement('div');
          s.className = 'og-cell-selection';
          s.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
          s.style.border = selBorder;
          return s;
        },
      });
    }

    return overlays.length > 0 ? { overlays } : null;
  }
}
