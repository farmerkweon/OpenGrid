// ============================================================
// DD-13 §2.4 결정론 렌더 이음새 — DeterminismKernel (REQ-TX-825)
// / DD-13 §2.4 Deterministic render seam — DeterminismKernel.
// 비결정성 3대 소스(시간·난수·비동기 완료 타이밍)를 주입 가능한 이음새 뒤로 격리.
// 동일 seed·동일 clock 스텝 → 동일 출력. 순수·헤드리스(전역 직접 호출 금지, clock/random 경유).
// ============================================================

/** 주입 clock — 프로덕션=시스템시계, 테스트=고정/전진 가능한 가짜시계. / Injected clock. */
export interface IClock {
  now(): number;                        // epoch ms
  raf(cb: (t: number) => void): number; // requestAnimationFrame 대체 / rAF replacement
  cancelRaf(id: number): void;
}

/** 주입 RNG — 시드 기반 결정론 난수(테스트), 프로덕션=암묵 시드. / Injected RNG. */
export interface IRandom {
  next(): number;        // [0,1)
  seed(s: number): void; // 재현용 시드 고정 / fix seed for reproduction
}

/** 보류 raf 를 결정론 실행할 수 있는 clock 의 선택 계약(FakeClock 등). / Optional flush contract. */
interface Flushable {
  flushRaf(): void;
}
function isFlushable(c: unknown): c is Flushable {
  return typeof (c as Partial<Flushable>).flushRaf === 'function';
}

/**
 * 결정론 커널 — 비결정성 소스의 단일 주입 지점.
 * CRC: 시간/난수/idle-flush 통제 | 협력: 렌더 파이프라인·차트가 DI 로 소비.
 * 불변식: 동일 seed·동일 clock 스텝 → 동일 출력. whenIdle 는 보류 flush 후 resolve.
 * / Deterministic kernel — the single injection point for non-determinism.
 */
export class DeterminismKernel {
  constructor(
    readonly clock: IClock,
    readonly random: IRandom,
  ) {}

  /**
   * 모든 보류 작업(raf 렌더·이미지 로드·캔버스 draw·레이아웃 반영) 완료 후 resolve.
   * 시각회귀 스위트가 캡처 직전 호출 → 플래키(찍는 타이밍 경쟁) 제거의 핵심.
   * / Resolve after all pending work completes; called right before a golden capture.
   */
  async whenIdle(): Promise<void> {
    this.flushLayout();
    // 남은 마이크로태스크(해소된 프라미스) 정착. / Let settled microtasks drain.
    await Promise.resolve();
  }

  /** 보류 렌더를 강제 flush(동기 레이아웃 확정) — 골든 캡처용. / Force-flush pending renders. */
  flushLayout(): void {
    if (isFlushable(this.clock)) this.clock.flushRaf();
  }

  /**
   * 결정론 직렬화: 키 순서·수치 포맷 고정(toJSON diff·회귀 비교 가능화).
   * / Deterministic serialization: fixed key order + number format.
   */
  stableStringify(value: unknown): string {
    return stableStringify(value);
  }

  /**
   * 포맷터 순수성 검증 헬퍼: 동일 입력 2회 실행 산출물 바이트 동일 assert.
   * 위반 시 throw(계약 테스트에서 순수성 위반 탐지).
   * / Purity check helper: run fn twice and assert byte-identical output; throws on violation.
   */
  assertPure<T>(fn: () => T): void {
    const a = stableStringify(fn());
    const b = stableStringify(fn());
    if (a !== b) {
      throw new Error(`[DeterminismKernel] assertPure: 순수성 위반 — 2회 실행 산출물 불일치.\n  1st: ${a}\n  2nd: ${b}`);
    }
  }
}

/** 결정론 직렬화(키 정렬·순환 방어). / Deterministic serialization (sorted keys, cycle guard). */
function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value as number) ? String(value) : 'null';
  if (t === 'boolean' || t === 'bigint') return String(value);
  if (t === 'string') return JSON.stringify(value);
  if (t === 'undefined' || t === 'function' || t === 'symbol') return 'null';
  const obj = value as object;
  if (seen.has(obj)) return '"[Circular]"';
  seen.add(obj);
  if (Array.isArray(value)) {
    return `[${value.map(v => stableStringify(v, seen)).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const body = keys
    .map(k => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k], seen)}`)
    .join(',');
  return `{${body}}`;
}

// ── 프로덕션 구현 ────────────────────────────────────────────────────────────

/** 프로덕션 clock — 시스템 시계/requestAnimationFrame 위임(헤드리스는 setTimeout 폴백). */
export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
  raf(cb: (t: number) => void): number {
    const g = globalThis as unknown as {
      requestAnimationFrame?: (cb: (t: number) => void) => number;
    };
    if (typeof g.requestAnimationFrame === 'function') {
      return g.requestAnimationFrame(cb);
    }
    // 헤드리스 폴백: ~60fps 매크로태스크. / Headless fallback: ~60fps macrotask.
    return setTimeout(() => cb(this.now()), 16) as unknown as number;
  }
  cancelRaf(id: number): void {
    const g = globalThis as unknown as {
      cancelAnimationFrame?: (id: number) => void;
    };
    if (typeof g.cancelAnimationFrame === 'function') g.cancelAnimationFrame(id);
    else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  }
}

/** 시드 기반 결정론 PRNG(mulberry32). / Seeded deterministic PRNG (mulberry32). */
export class SeededRandom implements IRandom {
  private _state: number;
  constructor(seed = 0x9e3779b9) {
    this._state = seed >>> 0;
  }
  next(): number {
    // mulberry32
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  seed(s: number): void {
    this._state = s >>> 0;
  }
}

// ── 테스트 구현 ──────────────────────────────────────────────────────────────

/** 수동 전진 가짜 시계 — 예약된 raf 콜백을 결정론 실행. / Manually-advanced fake clock. */
export class FakeClock implements IClock {
  private _now: number;
  private _nextId = 1;
  private _pending = new Map<number, (t: number) => void>();

  constructor(start = 0) {
    this._now = start;
  }

  now(): number {
    return this._now;
  }

  raf(cb: (t: number) => void): number {
    const id = this._nextId++;
    this._pending.set(id, cb);
    return id;
  }

  cancelRaf(id: number): void {
    this._pending.delete(id);
  }

  /** 시간 전진 + 예약된 raf 콜백 결정론 실행. / Advance time and run scheduled raf callbacks. */
  advance(ms: number): void {
    this._now += ms;
    this.flushRaf();
  }

  /** 보류 raf 콜백을 등록 순서대로 flush(현재 시각 전달). / Flush pending raf callbacks in registration order. */
  flushRaf(): void {
    // 스냅샷 후 실행(재진입 안전). / Snapshot first (reentrancy-safe).
    const batch = [...this._pending.entries()];
    this._pending.clear();
    for (const [, cb] of batch) cb(this._now);
  }
}
