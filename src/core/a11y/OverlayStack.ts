// ============================================================
// DD-12 §2.5 오버레이 스택 — Esc·포커스 복귀 계층 / overlay stack — Esc & focus-return layering
// ------------------------------------------------------------
// 설계 근거(Why): 다이얼로그 위 드롭다운 위 툴팁처럼 겹친 오버레이에서 Esc 는 최상위 1개만 닫고
//   포커스를 직전 층으로 복귀시킨다(REQ-T9-830). 나머지 스택은 유지(한 번에 하나만). 헤드리스 —
//   실제 el.focus() 는 렌더/호스트가 FocusRequest 로 수행. 복귀 대상이 고아면 폴백 대상으로.
// / Design: with stacked overlays, Esc closes only the topmost one and returns focus to the layer
//   beneath (REQ-T9-830); the rest of the stack persists. Headless — el.focus() is done by the host.
// ============================================================

import type { A11yNodeKey, AriaRole } from './AriaIntent.js';
import type { FocusRequest } from './ports.js';

/** 오버레이 스택 프레임 — Esc/포커스복귀 계층. / An overlay stack frame — Esc / focus-return layer. */
export interface OverlayFrame {
  /** 'dropdown' | 'contextmenu' | 'dialog' | 'tooltip' … / Overlay id. */
  readonly id: A11yNodeKey;
  /** 닫힘 시 포커스 복귀 대상(직전 층). / Focus-return target on close (the layer beneath). */
  readonly returnFocusTo: A11yNodeKey;
  /** dialog/menu/listbox… / Overlay role. */
  readonly role: AriaRole;
  /** 모달=포커스 트랩. / Modal = focus trap. */
  readonly modal?: boolean;
}

/**
 * 오버레이 스택 매니저 — Esc 는 최상위 1개만 닫고 포커스 직전 층 복귀. 복귀 대상 고아 시 폴백.
 * / Overlay stack — Esc closes the topmost one and returns focus to the prior layer.
 */
export class OverlayStack {
  private _stack: OverlayFrame[] = [];
  private readonly _fallback: A11yNodeKey;

  /** @param fallbackFocus 복귀 대상이 고아(스택에 부재)일 때 폴백(보통 그리드 컨테이너). / Fallback focus target. */
  constructor(fallbackFocus: A11yNodeKey = 'grid') {
    this._fallback = fallbackFocus;
  }

  push(f: OverlayFrame): void {
    this._stack.push(f);
  }

  /**
   * Esc 처리 — 최상위 1개 pop + returnFocusTo 로 FocusRequest. 나머지 스택 유지(REQ-T9-830 AC).
   * 빈 스택이면 null(무동작 — 그리드가 Esc 를 선택 해제로 소비).
   * / Esc — pop the topmost one, return a FocusRequest to returnFocusTo; keep the rest.
   */
  handleEsc(): FocusRequest | null {
    const top = this._stack.pop();
    if (!top) return null;
    // 복귀 대상이 비어있으면(고아·삭제) 폴백(보통 그리드 컨테이너)으로. / empty return target (orphan) → fallback.
    const target = top.returnFocusTo && top.returnFocusTo.length > 0 ? top.returnFocusTo : this._fallback;
    return { target, reason: 'overlayClose' };
  }

  /** 최상위 프레임(없으면 undefined). / Topmost frame (undefined when empty). */
  top(): OverlayFrame | undefined {
    return this._stack[this._stack.length - 1];
  }

  /** 스택 깊이. / Stack depth. */
  size(): number { return this._stack.length; }

  /** 전체 해제. / Clear the stack. */
  dispose(): void { this._stack = []; }
}
