// ============================================================
// DD-12 §2.2 역주입 포트 — 헤드리스 코어 → DOM 물질화 / inverted ports (headless core → DOM)
// ------------------------------------------------------------
// 설계 근거(Why): Port & Adapter(Hexagonal). 코어는 DOM 을 미참조하고, `AriaIntent`/공지/포커스
//   이관을 포트로 밀어낸다. 실제 `setAttribute`·`el.focus`·라이브영역 `textContent` 는 렌더(DD-03)/
//   호스트(DD-14) 가 이 포트를 구현해 수행한다.
// / Design: Hexagonal ports. The core references no DOM; it pushes AriaIntent/announcements/focus
//   through a port. The renderer/host implements it (setAttribute, el.focus, live-region textContent).
// ============================================================

import type { AriaIntent, A11yNodeKey } from './AriaIntent.js';

/** 포커스 이관 요청(헤드리스 — 실제 `el.focus()` 는 렌더/호스트). / Focus-transfer request (headless). */
export interface FocusRequest {
  /** 포커스를 받을 노드. / Node to receive focus. */
  readonly target: A11yNodeKey;
  /** 이관 사유. / Transfer reason. */
  readonly reason: 'error' | 'overlayClose' | 'restore';
  /** 에디터 재진입 시 텍스트 선택 여부. / Whether to select text on editor re-entry. */
  readonly selectText?: boolean;
}

/** 라이브영역 채널. polite=대기열 합류, assertive=즉시(오류). / Live-region channel. */
export type LiveChannel = 'polite' | 'assertive';

/**
 * 헤드리스 코어가 aria/공지/포커스를 밀어내는 포트(DD-03/14 구현). 코어는 DOM 미참조.
 * / The port the headless core pushes aria/announcements/focus through (implemented by DD-03/14).
 */
export interface IAriaRenderPort {
  /** 요소 해소 후 `AriaIntent` 를 setAttribute 로 물질화. / Resolve the element and materialize the intent. */
  apply(key: A11yNodeKey, intent: AriaIntent): void;
  /** 포커스 이관(오류/오버레이 복귀). / Transfer focus (error / overlay close / restore). */
  requestFocus(req: FocusRequest): void;
  /** 라이브영역에 해석된 공지 문자열 1건 물질화(`LiveRegionController` flush 전용). / Materialize one resolved announcement. */
  announce(channel: LiveChannel, text: string): void;
}
