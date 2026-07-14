import type { AriaIntent, A11yNodeKey } from '../../../src/core/a11y/AriaIntent';
import type { FocusRequest, IAriaRenderPort, LiveChannel } from '../../../src/core/a11y/ports';

/** apply/requestFocus/announce 호출을 기록하는 테스트용 렌더 포트. / A recording render port for tests. */
export class FakeRenderPort implements IAriaRenderPort {
  applied: Array<{ key: A11yNodeKey; intent: AriaIntent }> = [];
  focused: FocusRequest[] = [];
  spoken: Array<{ channel: LiveChannel; text: string }> = [];

  apply(key: A11yNodeKey, intent: AriaIntent): void {
    this.applied.push({ key, intent });
  }
  requestFocus(req: FocusRequest): void {
    this.focused.push(req);
  }
  announce(channel: LiveChannel, text: string): void {
    this.spoken.push({ channel, text });
  }
  /** 가장 최근 특정 키의 intent 조회. / Latest intent for a key. */
  last(key: A11yNodeKey): AriaIntent | undefined {
    for (let i = this.applied.length - 1; i >= 0; i--) if (this.applied[i]!.key === key) return this.applied[i]!.intent;
    return undefined;
  }
}

/** 결정론적 수동 스케줄러(디바운스 타이머를 테스트가 구동). / Deterministic manual scheduler. */
export function manualScheduler() {
  let pending: (() => void) | null = null;
  return {
    schedule: (fn: () => void, _ms: number): unknown => { pending = fn; return {}; },
    cancel: (_h: unknown): void => { pending = null; },
    /** 예약된 flush 를 즉시 실행. / Run the pending flush now. */
    flush: (): void => { const f = pending; pending = null; if (f) f(); },
    pending: (): boolean => pending != null,
  };
}
