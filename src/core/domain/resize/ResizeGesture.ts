// ============================================================
// 컬럼 너비 조절 한 번의 상태 기계 / Column resize gesture state machine
// 누름 → 끌기 → 놓기(또는 취소·잃음) → 따라오는 click 삼키기 → 쉼. 상태와 폭 계산만 여기 두고,
// 포인터 이벤트 듣기·DOM 쓰기는 그리기 쪽이 맡는다 — 그래서 이 상태 기계는 DOM·시계 없이 시험된다.
// 상태마다 사건을 받는 객체를 하나씩 두어, 「지금 상태가 무엇이냐」로 갈래를 치는 조건문을 없앴다.
// 폭 = 시작 폭 + (지금 x − 누른 x) 를 매번 처음부터 계산하고 한계로 자른다 — 한계에 닿았다 돌아와도 오차가 쌓이지 않는다.
//
// Idle → pressed → dragging → (release | cancel | lose) → swallowing → idle. Only state and width
// math live here; pointer handling and DOM writes belong to the DOM-side binder, so this is testable
// without a DOM or a clock. Each phase is a small handler object instead of a branch on the phase.
// Width is always start + (x − pressX), clamped, so hitting a bound never accumulates error.
// ============================================================
import type { IResizeGesture, ResizeBounds, ResizePhase, ResizeResult } from './ports.js';

/** 한 제스처의 값. 상태 객체들이 이것을 읽고 쓴다. */
interface GestureData {
  ci: number;
  startWidth: number;
  pressX: number;
  min: number;
  max: number;
  /** 지금 폭(마지막으로 내보낸 폭). 누를 때는 시작 폭. */
  width: number;
}

/** 상태 하나가 사건을 받는 법. 다음 상태는 돌려주는 대신 to() 로 넘긴다. */
interface PhaseHandler {
  readonly phase: ResizePhase;
  press(m: Machine, ci: number, startWidth: number, clientX: number, bounds: ResizeBounds): void;
  move(m: Machine, clientX: number): number | null;
  release(m: Machine, clientX: number): ResizeResult | null;
  cancel(m: Machine): ResizeResult | null;
  lose(m: Machine): ResizeResult | null;
  consumeClick(m: Machine): boolean;
  expireSwallow(m: Machine): void;
}

/** 상태 객체가 기계에 닿는 좁은 창구. */
interface Machine {
  readonly d: GestureData;
  to(next: PhaseHandler): void;
  begin(ci: number, startWidth: number, clientX: number, bounds: ResizeBounds): void;
}

function clamp(w: number, d: GestureData): number {
  return Math.min(d.max, Math.max(d.min, w));
}

/**
 * x 에서의 폭(시작 폭 기준, 한계로 자름). x 가 유한수가 아니면 지금 폭 그대로 —
 * `Math.max(min, NaN)` 은 NaN 이라 한계를 뚫고 사용자 폭 저장소까지 흘러가기 때문이다.
 */
function widthAt(d: GestureData, clientX: number): number {
  if (!Number.isFinite(clientX)) return d.width;
  return clamp(d.startWidth + (clientX - d.pressX), d);
}

/** 놓을 때 확정할 결과 — 시작 폭과 같으면 확정할 것이 없다(null). */
function commitOf(d: GestureData, width: number): ResizeResult | null {
  return width === d.startWidth ? null : { ci: d.ci, width };
}

const nothing = (): null => null;
const ignore = (): void => {};

const IDLE: PhaseHandler = {
  phase: 'idle',
  press: (m, ci, w, x, b) => m.begin(ci, w, x, b),
  move: nothing,
  release: nothing,
  cancel: nothing,
  lose: nothing,
  consumeClick: () => false,
  expireSwallow: ignore,
};

const PRESSED: PhaseHandler = {
  phase: 'pressed',
  // 이미 누른 상태의 두 번째 누름(다른 손가락·단추)은 무시 — 끄는 컬럼이 바뀌지 않게.
  press: ignore,
  move: (m, x) => {
    // 제자리 move 는 누름에 머문다(문턱은 두지 않음 — 1px 이라도 움직이면 끄는 중). 유한수 아닌 x 는 없던 사건.
    if (x === m.d.pressX || !Number.isFinite(x)) return null;
    m.to(DRAGGING);
    return DRAGGING.move(m, x);
  },
  // 같은 x 에서 놓음 → 폭 변화 없음, 그래도 따라오는 click 은 삼킨다(손잡이 click 은 정렬이 아님).
  // 움직임 이벤트 없이 다른 x 에서 놓음(합성 이벤트·빠른 터치) → 놓는 x 로 폭을 정한다 — 지금 mouseup 의 x 로 폭을 정하는 것과 같다.
  release: (m, x) => {
    if (x === m.d.pressX || !Number.isFinite(x)) { m.to(SWALLOWING); return null; }
    m.to(DRAGGING);
    return DRAGGING.release(m, x);
  },
  // 끌기 전 취소·잃음 → 되돌릴 폭도 삼킬 click 도 없다.
  cancel: (m) => { m.to(IDLE); return null; },
  lose: (m) => { m.to(IDLE); return null; },
  consumeClick: (m) => { m.to(IDLE); return true; },
  expireSwallow: ignore,
};

const DRAGGING: PhaseHandler = {
  phase: 'dragging',
  press: ignore,
  move: (m, x) => {
    const w = widthAt(m.d, x);
    if (w === m.d.width) return null;
    m.d.width = w;
    return w;
  },
  // 놓는 x 로 최종 폭을 정한다(마지막 move 뒤에 더 움직였을 수 있다).
  release: (m, x) => {
    const w = widthAt(m.d, x);
    m.d.width = w;
    m.to(SWALLOWING);
    return commitOf(m.d, w);
  },
  // Esc → 시작 폭으로 되돌릴 값. 손을 떼며 오는 click 은 삼킨다.
  cancel: (m) => {
    m.to(SWALLOWING);
    return { ci: m.d.ci, width: m.d.startWidth };
  },
  // 포인터 잃음·창 blur → 그 순간 폭으로 확정.
  lose: (m) => {
    m.to(SWALLOWING);
    return commitOf(m.d, m.d.width);
  },
  // 끄는 중에 온 click 은 정렬로 넘기지 않되, 끌기는 그대로 잇는다.
  consumeClick: () => true,
  expireSwallow: ignore,
};

const SWALLOWING: PhaseHandler = {
  phase: 'swallowing',
  // 놓자마자 다시 누르면 새 제스처가 이긴다(놓음도 끝난다).
  press: (m, ci, w, x, b) => m.begin(ci, w, x, b),
  move: nothing,
  release: nothing,
  cancel: nothing,   // 놓은 뒤 Esc 는 되돌리지 않는다
  lose: nothing,
  consumeClick: (m) => { m.to(IDLE); return true; },
  expireSwallow: (m) => m.to(IDLE),
};

/**
 * 너비 조절 한 번의 상태와 폭 계산의 유일한 주인. DOM·시계를 쓰지 않는다.
 * 불변: dragging 밖에서 move 는 null · move·release·lose 가 내는 폭은 [min, max] — cancel 은 시작 폭(되돌리기라
 *       한계 밖일 수 있음) · 한 제스처에 확정(release|lose)은 많아야 한 번 · 시작 폭은 부르는 쪽이 기하에서 받아 넘긴다 ·
 *       유한수가 아닌 x 는 폭을 바꾸지 않는다(유한수가 아닌 x·시작 폭의 press 는 받지 않음).
 *       폭은 소수 그대로 낸다 — 정수로 드는 일은 기하(ColumnGeometry.resize)가 맡는다.
 *
 * Sole owner of one resize gesture's state and width math; no DOM, no clock.
 */
export class ResizeGesture implements IResizeGesture {
  private _state: PhaseHandler = IDLE;
  private readonly _m: Machine;

  constructor() {
    const d: GestureData = { ci: -1, startWidth: 0, pressX: 0, min: 0, max: Infinity, width: 0 };
    this._m = {
      d,
      to: (next) => {
        this._state = next;
        if (next === IDLE) d.ci = -1;
      },
      begin: (ci, startWidth, clientX, bounds) => {
        // min > max 면 폭이 두 값 사이를 튄다 — 받지 않는다(상태도 그대로).
        if (!(bounds.min <= bounds.max)) throw new RangeError(`invalid resize bounds: min ${bounds.min} > max ${bounds.max}`);
        // 좌표·시작 폭이 숫자가 아니면 그 누름은 없던 것으로(뒤 계산 전부가 NaN 이 된다).
        if (!Number.isFinite(clientX) || !Number.isFinite(startWidth)) return;
        d.ci = ci;
        d.startWidth = startWidth;
        d.pressX = clientX;
        d.min = bounds.min;
        d.max = bounds.max;
        d.width = startWidth;
        this._state = PRESSED;
      },
    };
  }

  get phase(): ResizePhase { return this._state.phase; }

  /** 쉼 상태에서는 −1. / −1 while idle. */
  get column(): number { return this._m.d.ci; }

  press(ci: number, startWidth: number, clientX: number, bounds: ResizeBounds): void {
    this._state.press(this._m, ci, startWidth, clientX, bounds);
  }

  move(clientX: number): number | null {
    return this._state.move(this._m, clientX);
  }

  release(clientX: number): ResizeResult | null {
    return this._state.release(this._m, clientX);
  }

  cancel(): ResizeResult | null {
    return this._state.cancel(this._m);
  }

  lose(): ResizeResult | null {
    return this._state.lose(this._m);
  }

  consumeClick(): boolean {
    return this._state.consumeClick(this._m);
  }

  expireSwallow(): void {
    this._state.expireSwallow(this._m);
  }
}
