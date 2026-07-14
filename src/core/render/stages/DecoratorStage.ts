// ============================================================
// DD-03 §5 부트스트랩 단계 — DecoratorStage (데코 레인, FORM 축)
// 검증 마커·delta 방향 화살표 같은 데코 노드를 절대배치 팩토리로 기여한다. 상류 판정(verdicts)이
// 없으면 appliesTo=false(제로코스트, 고스트 재질 §9.3). 순수(DOM 접근 0 — 팩토리만 반환).
// delta 는 부호(색)+방향(형태) 이중 부호화(§9.4, 색맹 환경 판독).
// ============================================================

import type { ICellStage, CellRenderRequest, StagePaint, PaintNode } from '../CellRenderRequest.js';

/** 데코 z 기저(값 baseline 위 절대배치, 오버레이보다 아래). / Decorator z base. */
const DECO_Z = 5;

/**
 * 데코 레인 부트스트랩 단계. 검증 실패 마커 + delta 화살표를 기여한다(있을 때만).
 * / Decorator lane bootstrap stage. Contributes a validation-fail marker and a delta arrow when present.
 */
export class DecoratorStage implements ICellStage {
  readonly id = 'core.decorator';
  readonly kind = 'decorator' as const;
  readonly order = 100;

  appliesTo(req: CellRenderRequest): boolean {
    const v = req.verdicts;
    if (!v) return false;
    const validationFail = v.validation != null && v.validation.ok === false;
    const hasDelta = v.delta != null;
    return validationFail || hasDelta;
  }

  contribute(req: CellRenderRequest): StagePaint | null {
    const v = req.verdicts;
    if (!v) return null;
    const decorations: PaintNode[] = [];
    const aria: Record<string, string> = {};

    // 검증 실패 마커(모서리 세이프존, §9.4 값 영역 침범 금지).
    if (v.validation != null && v.validation.ok === false) {
      const msg = v.validation.message ?? req.t('cell.validationFail');
      decorations.push({
        role: 'validation-marker',
        z: DECO_Z,
        build: () => {
          const m = document.createElement('span');
          m.className = 'og-cell-validation-marker';
          m.setAttribute('role', 'img');
          m.setAttribute('aria-label', msg);
          m.style.cssText = 'position:absolute;top:1px;right:1px;width:6px;height:6px;border-radius:50%;background:var(--og-error,#d32f2f);pointer-events:none;';
          return m;
        },
      });
      aria['aria-invalid'] = 'true';
    }

    // delta 화살표 — 부호(색)+방향(형태) 이중 부호화(§9.4).
    const delta = v.delta;
    if (delta != null) {
      const glyph = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—';
      const color = delta.direction === 'up' ? 'var(--og-delta-up,#2e7d32)'
        : delta.direction === 'down' ? 'var(--og-delta-down,#c62828)'
        : 'var(--og-delta-flat,#9e9e9e)';
      const label = delta.textEquivalent(undefined);
      decorations.push({
        role: 'delta-arrow',
        z: DECO_Z,
        build: () => {
          const a = document.createElement('span');
          a.className = 'og-cell-delta';
          a.textContent = glyph;
          a.setAttribute('aria-label', label);
          a.style.cssText = `position:absolute;left:2px;top:50%;transform:translateY(-50%);font-size:9px;line-height:1;color:${color};pointer-events:none;`;
          return a;
        },
      });
    }

    const paint: StagePaint = Object.keys(aria).length > 0
      ? { decorations, aria }
      : { decorations };
    return paint;
  }
}
