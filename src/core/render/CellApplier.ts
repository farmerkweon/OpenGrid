// ============================================================
// DD-03 §2.4 CellApplier — 누적 페인트 → cellEl 인라인 물질화
// load-bearing 스타일은 인라인으로 써서 host CSS 를 이긴다(host-isolation 규약 유지).
// ★DOM 접촉 허용 2파일 중 하나(다른 하나는 OverlayCompositor). 오버레이 합성은 compositor 소관 —
//   여기서는 배경(bgLayers z순)→content()→decorations()→cellStyle/classes/aria 만 적용.
// 값 레인 content 가 없으면(값 단계 실패 포함) raw String(value) 텍스트 폴백(REQ-TX-840).
// ============================================================

import type { PaintAccumulator, CellRenderRequest } from './CellRenderRequest.js';

/**
 * 누적 페인트를 cellEl 에 인라인으로 적용하는 humble object(테스트는 compositor/applier 만 DOM 검증).
 * / Humble object that applies the accumulated paint to cellEl inline.
 */
export class CellApplier {
  /**
   * 누적 → cellEl 물질화. 순서: 배경(단일+bgLayers z순) → 값 content() → 데코(z순) →
   * cellStyle/classes/aria 병합. content 부재 시 raw 폴백.
   * / Materialize accumulator → cellEl. Order: background → value content() → decorations →
   * cellStyle/classes/aria. Raw fallback when content is absent.
   *
   * @param cellEl - 대상 셀 엘리먼트 / Target cell element
   * @param acc - 누적 페인트 / Accumulated paint
   * @param req - 원 요청(raw 폴백·힌트용) / The originating request (for raw fallback/hints)
   */
  apply(cellEl: HTMLElement, acc: PaintAccumulator, req: CellRenderRequest): void {
    // 1) 배경 단일값(base/zebra/state) — 인라인(host-isolation).
    if (acc.background != null) {
      cellEl.style.background = acc.background;
    }

    // 2) 다중 배경 레이어(데이터바/히트맵/텍스처) — z 오름차순으로 절대배치 자식.
    if (acc.bgLayers.length > 0) {
      const layers = acc.bgLayers
        .map((l, i) => ({ l, i }))
        .sort((a, b) => a.l.z - b.l.z || a.i - b.i);
      for (const { l } of layers) {
        const bg = document.createElement('div');
        bg.className = `og-bg-layer og-bg-${l.role}`;
        bg.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        bg.style.background = l.fill;
        bg.style.zIndex = String(l.z);
        cellEl.appendChild(bg);
      }
    }

    // 3) 값 노드(값 레인). 부재 시 raw 폴백(렌더러 셀단위 오류격리, REQ-TX-840).
    if (acc.content) {
      const node = acc.content();
      // AA-safe 텍스트 색 힌트가 있으면 값 노드에 인라인 적용(배경-위-텍스트 대비, REQ-T5-807).
      if (acc.contentColorHint && node instanceof HTMLElement && !node.style.color) {
        node.style.color = acc.contentColorHint;
      }
      cellEl.appendChild(node);
    } else {
      cellEl.appendChild(document.createTextNode(_rawText(req.value)));
    }

    // 4) 데코 노드(코너폴드/마커/스파크) — z 오름차순, 절대배치(값 baseline 침범 금지 §9.4).
    if (acc.decorations.length > 0) {
      const decos = acc.decorations
        .map((d, i) => ({ d, i }))
        .sort((a, b) => a.d.z - b.d.z || a.i - b.i);
      for (const { d } of decos) {
        const node = d.build();
        if (node instanceof HTMLElement) {
          if (!node.style.position) node.style.position = 'absolute';
          node.style.zIndex = String(d.z);
        }
        cellEl.appendChild(node);
      }
    }

    // 5) 컨테이너 스타일 기여(병합) — 인라인.
    for (const [k, v] of Object.entries(acc.cellStyle)) {
      cellEl.style.setProperty(_cssProp(k), v);
    }

    // 6) 클래스 기여(병합).
    for (const cls of acc.classes) {
      if (cls) cellEl.classList.add(cls);
    }

    // 7) aria 기여(병합, 접근성 쌍둥이).
    for (const [k, v] of Object.entries(acc.aria)) {
      cellEl.setAttribute(k, v);
    }
  }
}

/** raw 폴백 텍스트(null/undefined → 빈 문자열). / Raw fallback text. */
function _rawText(value: unknown): string {
  return value == null ? '' : String(value);
}

/** camelCase 스타일 키 → CSS 프로퍼티(kebab). 이미 kebab 이면 그대로. / camelCase → CSS kebab property. */
function _cssProp(key: string): string {
  return key.includes('-') ? key : key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}
