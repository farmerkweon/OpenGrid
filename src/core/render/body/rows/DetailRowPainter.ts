// ============================================================
// 디테일(마스터/디테일) 행 그리개 — 머리와 채움 / Detail row painters — head and filler
// 디테일 머리 행 자리에 본문 전체 폭 패널 하나를 본문 기준 absolute 로 놓는다(병합 마스터 칸과 같은 방식 — flex 흐름 밖).
// 패널 안 host 는 디테일 관리자가 들고 있는 오래 사는 요소라, 여기서는 새 패널 껍데기에 옮겨 붙이기만 한다
// (옮기기라 파괴가 아니므로 다시 그리거나 스크롤로 오가도 그 안 상태가 산다). 채움 행은 패널이 덮으므로 그리지 않는다.
//
// The detail head draws one full-width, body-absolute panel; its host is a long-lived element owned by the detail
// manager and is only moved into a fresh wrapper (a move, not a teardown), so its state survives repaints and
// scrolling. Filler rows are covered by the panel and draw nothing.
// ============================================================
import type { AppearanceResolver } from '../../../AppearanceResolver.js';
import { _el } from '../../dom.js';
import type { BodyRowContext, BodyRowPainter } from './BodyRowContext.js';

/**
 * 디테일 머리 행 → 전체 폭 패널. 디테일 배선이 없으면 아무것도 안 그린다(패널 없이 건너뜀).
 * 보이는 구간 위에서 시작해 구간을 덮는 패널도 이 그리개로 그린다(ri 가 시작 행보다 작으면 top 이 음수 쪽).
 *
 * Detail head → full-width panel; nothing without detail wiring. Also used for a panel that starts above the
 * visible range and covers it (ri below the start index gives a top above the offset).
 */
export class DetailRowPainter implements BodyRowPainter {
  readonly kind = 'detail-head' as const;

  constructor(private readonly _ap: AppearanceResolver) {}

  paint(ri: number, head: any, ctx: BodyRowContext): HTMLElement | null {
    const detailApi = ctx.detailApi;
    if (!detailApi) return null;
    const { opts, offsetY, startIndex } = ctx;
    const top = offsetY + (ri - startIndex) * opts.rowHeight;
    const rowId: string = head._rowId;
    const height = head._span * opts.rowHeight;
    const panel = _el('div', 'og-detail-panel og-detail-panel-intro');
    panel.dataset.ogRowId = rowId;
    panel.id = `og-detail-${rowId}`;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', detailApi.ariaLabel);
    // host isolation(NFR-3): load-bearing 속성 전부 인라인. z-index 는 계약 변수(C6).
    panel.style.cssText = [
      'position:absolute;left:0;',
      `top:${top}px;width:${ctx.totalColWidth}px;height:${height}px;`,
      'box-sizing:border-box;',
      'overflow-y:auto;overflow-x:auto;',
      'overscroll-behavior:contain;', // UX-REVIEW-07: 중첩 스크롤 체이닝 차단
      'background:var(--og-detail-bg,#fff);',
      `border:0;border-bottom:${this._ap.divider()};`,
      'z-index:var(--og-z-detail,2);',
    ].join('');
    ctx.applier?.trackTotal(panel, 'width', 'body');
    const host = detailApi.getPanelHost(rowId);
    panel.appendChild(host);
    return panel;
  }
}

/**
 * 디테일 채움 행 — 머리의 패널이 이 띠를 덮으므로 그릴 것이 없다.
 *
 * Detail filler row — covered by the head's panel, so nothing to draw.
 */
export class DetailFillerRowPainter implements BodyRowPainter {
  readonly kind = 'detail-filler' as const;

  paint(): HTMLElement | null {
    return null;
  }
}
