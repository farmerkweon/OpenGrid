// ============================================================
// 컬럼 너비 조절 상태 기계 계약(헤드리스) / Column resize gesture contracts (headless)
// 형만 둔다. 상태와 폭 계산(계산 쪽)과 포인터 이벤트 듣기(그리기 쪽 binder)를 갈라,
// 상태 기계를 DOM 없이 시험할 수 있게 한다.
//
// Types only. Separates the gesture state machine (headless) from pointer handling (DOM binder).
// ============================================================

/**
 * 상태: idle → pressed → dragging → (release|cancel|lose) → swallowing → idle.
 * swallowing: 놓은 뒤(또는 손잡이 구역에서 누른 뒤) 따라오는 click 한 번을 정렬로 넘기지 않는 상태.
 */
export type ResizePhase = 'idle' | 'pressed' | 'dragging' | 'swallowing';

/**
 * 지금은 {min: 40, max: Infinity} 고정 — 지금 너비 조절의 `Math.max(40, …)` 그대로(col.minWidth 를 안 읽음).
 * col.minWidth/maxWidth 반영은 동작을 바꾸는 일이라 따로 한다.
 */
export interface ResizeBounds { readonly min: number; readonly max: number }

export interface ResizeResult { readonly ci: number; readonly width: number }

/**
 * 너비 조절 한 번의 상태와 폭 계산의 유일한 주인. DOM·시계 없음(jsdom 없이 시험).
 * 불변: dragging 밖에서 move 는 null · move·release·lose 가 내는 폭은 늘 [min, max](cancel 은 시작 폭 — 한계 밖일 수 있음) · 한 제스처에 commit(release|lose) 은 많아야 한 번 ·
 *       시작 폭은 기하에서 받는다(DOM offsetWidth 안 읽음).
 * 입력은 「x 좌표」라 마우스·펜·터치가 같은 길을 쓰고, 나중에 키보드 조절도 같은 상태 기계에 들어온다.
 * 입력 규칙(DOM 쪽 ResizeHandleBinder 가 지킴): 포인터 이벤트가 있으면 포인터만 듣고,
 *   진행 중 pointerId 가 있으면 합성 mousedown/mousemove/mouseup 은 무시한다(누름 두 번 방지).
 *   포인터 이벤트가 없는 환경(jsdom)은 마우스 이벤트로 같은 상태 기계를 몬다. 손잡이에 touch-action 은 두지 않는다(터치 끌기는 발주자 결정 항목 — 기본 머리글 DOM 이 바뀜).
 * / Sole owner of one resize gesture's state and width math; no DOM, no clock.
 */
export interface IResizeGesture {
  readonly phase: ResizePhase;
  readonly column: number;
  press(ci: number, startWidth: number, clientX: number, bounds: ResizeBounds): void;
  /** 새 폭(바뀌었을 때만), 아니면 null. */
  move(clientX: number): number | null;
  /** 놓음 → 확정할 폭. 그 뒤 phase = swallowing. 폭이 안 바뀌었으면 null(정렬은 그래도 안 부름). */
  release(clientX: number): ResizeResult | null;
  /** Esc → 시작 폭으로 되돌릴 값(한계로 자르지 않음). */
  cancel(): ResizeResult | null;
  /** 포인터 잃음·창 blur → 그 순간 폭으로 확정(Esc 만 되돌린다). */
  lose(): ResizeResult | null;
  /** 머리글 click 처리기가 묻는다: 이 click 을 삼켜야 하나(삼키면 phase = idle — 단 끄는 중이면 끌기를 잇는다). */
  consumeClick(): boolean;
  /**
   * 「놓음」(swallowing)을 끝낸다 — click 이 끝내 안 오는 경우(창 밖에서 놓음·포인터 잃음)에 상태가 남지 않게.
   * binder 가 놓은 뒤 **다음 rAF** 에 부른다(click 은 pointerup/mouseup 과 같은 작업 안에서 그 전에 온다). 다음 press 도 swallowing 을 끝낸다.
   * pressed 에서 cancel/lose → null 을 돌려주고 idle(폭 변화 0, 삼킬 click 없음). dragging 에서 cancel/lose → 결과를 돌려주고 swallowing.
   */
  expireSwallow(): void;
}

/**
 * 놓을 때 바깥에 알리는 포트. 다시 그리기를 부르지 않는다.
 * 구현은 OpenGrid 가 아니라 GridComposer 가 만드는 작은 어댑터 `ResizeSinkAdapter` — OpenGrid 에 책임을 더 얹지 않는다.
 * / Port notified on release; never triggers a redraw.
 */
export interface IResizeSink {
  boundsOf(ci: number): ResizeBounds;
  /** 사용자 폭 기억(_userWidths 저장 — 지금 OpenGrid._handleColResize 의 저장부와 같은 뜻). */
  commit(ci: number, width: number): void;
  /**
   * 줄바꿈 머리글이 있을 때만 true → **놓을 때 한 번** remeasureHeader. 끄는 프레임마다의 머리글 높이 맞춤은
   * RenderScheduler 가 IHeaderView.height() 로 한다.
   */
  needsHeaderRemeasure(): boolean;
  remeasureHeader(): void;
}
