/**
 * OverrideKernel — `grid.override()` 확장 커널 (94 최종 종합본 반영)
 *
 * 핵심 원칙(94 §1 F1~F4):
 *  - F2: FIFO 합성 = `reduce` 좌측폴드. 먼저 등록 = 안쪽(원본 근접), 나중 등록 = 바깥.
 *        `[fn1,fn2,fn3]` → 실행 시 fn3(최후등록)이 최외곽, orig() 호출이 안쪽으로 전파.
 *  - F3: 재진입 가드 = 깊이 제한(maxDepth 기본 32) + 호출경로 사이클 감지(_callPath, 동일 name
 *        재출현 시 차단) + 명시적 { reentrant:true } 옵트인. 정당한 cascade는 깊이 내 허용.
 *  - F4: 에러 격리 = 기본 strict=true(예외 전파). { onError:'fallback' } 옵트인 시에만
 *        경고 후 orig fallback(멱등 가정, 롤백 불가).
 *
 * 본 커널은 단독 클래스로, OpenGrid 인스턴스를 host 로 받아 프로토타입 메서드를
 * 인스턴스 프로퍼티로 shadowing(순수 런타임 래핑, C1-clean) 한다. 소스 본문 0줄 수정.
 */

export interface OverrideKernelHost {
  [name: string]: any;
}

/** override() 호출 시 레이어가 받는 함수 시그니처: 첫 인자는 안쪽(원본 근접) 함수. */
export type OverrideLayer = (orig: (...args: any[]) => any, ...args: any[]) => any;

export interface OverrideOptions {
  /** 동일 name 재진입을 허용(정당한 재귀). 기본 false. */
  reentrant?: boolean;
  /** 'fallback' → 레이어 예외 시 경고 후 orig 실행(멱등 가정). 미지정 시 strict(전파). */
  onError?: 'fallback';
}

interface LayerEntry {
  fn: OverrideLayer;
  opts: OverrideOptions;
}

export class OverrideKernel {
  private _host: OverrideKernelHost;
  /** name → this-bound 원본 함수 (최초 1회 보존) */
  private _originals = new Map<string, (...args: any[]) => any>();
  /** name → 최초 override 직전 host 가 own 프로퍼티로 메서드를 가졌는지(복구 방식 결정) */
  private _hadOwn = new Map<string, boolean>();
  /** name → 레이어 목록(등록순, FIFO) */
  private _stack = new Map<string, LayerEntry[]>();
  /** slot → strategy 함수 */
  private _strategies = new Map<string, Function>();
  /** F3: 현재 호출 경로(메서드 name 스택) — 사이클 감지용 */
  private _callPath: string[] = [];
  /** F4: 기본 strict (예외 전파) */
  private _strict: boolean;
  /** F3: 재귀 깊이 제한 */
  private _maxDepth: number;

  constructor(host: OverrideKernelHost, opts?: { strict?: boolean; maxDepth?: number }) {
    this._host = host;
    this._strict = opts?.strict ?? true;
    this._maxDepth = opts?.maxDepth ?? 32;
  }

  /**
   * 메서드 override 등록.
   * 1. 최초 1회 원본을 this-bound 로 보존.
   * 2. 레이어 push (FIFO 등록순).
   * 3. reduce 좌측폴드로 합성(나중 등록 = 최외곽).
   * 4. 재진입 가드 + 에러 격리로 감싼 dispatcher 를 host[name] 인스턴스 프로퍼티에 할당.
   */
  override(name: string, fn: OverrideLayer, opts: OverrideOptions = {}): OverrideKernelHost {
    if (typeof fn !== 'function') {
      throw new TypeError(`OverrideKernel.override: fn for "${name}" must be a function`);
    }
    if (!this._originals.has(name)) {
      const orig = this._host[name];
      if (typeof orig !== 'function') {
        throw new TypeError(`OverrideKernel.override: host["${name}"] is not a function`);
      }
      // 복구 방식 결정: own 프로퍼티였으면 원본 값을 되돌리고, 프로토타입 메서드면
      // 인스턴스 shadow 만 delete 하여 프로토타입을 재노출(순수 래핑 가역성).
      this._hadOwn.set(name, Object.prototype.hasOwnProperty.call(this._host, name));
      this._originals.set(name, orig.bind(this._host));
    }

    const layers = this._stack.get(name) ?? [];
    layers.push({ fn, opts });
    this._stack.set(name, layers);

    this._host[name] = this._buildDispatcher(name);
    return this._host;
  }

  /** 합성된 dispatcher 생성. override/restore 시점마다 재구성. */
  private _buildDispatcher(name: string): (...args: any[]) => any {
    const original = this._originals.get(name)!;
    const layers = this._stack.get(name) ?? [];

    // F2: reduce 좌측폴드. layers[0]=가장 안쪽(원본 근접), 마지막=최외곽.
    //   acc 시작값 = original, 각 layer 는 acc(=innerOrig)를 첫 인자로 받는다.
    const composed = layers.reduce<(...args: any[]) => any>(
      (innerOrig, layer) => (...a: any[]) => layer.fn(innerOrig, ...a),
      original,
    );

    // 최외곽 레이어의 옵션이 재진입/에러 정책을 결정.
    const outer = layers[layers.length - 1]?.opts ?? {};
    const reentrant = outer.reentrant === true;
    const fallback = outer.onError === 'fallback';

    const self = this;
    return function (this: unknown, ...args: any[]): any {
      // F3: 사이클 감지 — 동일 name 이 이미 호출 경로에 있고 reentrant 옵트인이 아니면 원본으로.
      if (!reentrant && self._callPath.indexOf(name) !== -1) {
        return original(...args);
      }
      // F3: 깊이 제한.
      if (self._callPath.length >= self._maxDepth) {
        if (self._strict && !fallback) {
          throw new Error(
            `OverrideKernel: max override depth (${self._maxDepth}) exceeded at "${name}"`,
          );
        }
        return original(...args);
      }

      self._callPath.push(name);
      try {
        return composed(...args);
      } catch (e) {
        // F4: 기본 strict 전파. onError:'fallback' 옵트인 시에만 경고 후 orig.
        if (fallback && !self._strict) {
          console.warn(`[og.override:${name}]`, e);
          return original(...args);
        }
        if (fallback && self._strict) {
          // strict 모드라도 명시적 fallback 옵트인은 존중(멱등 가정, 롤백 불가).
          console.warn(`[og.override:${name}]`, e);
          return original(...args);
        }
        throw e;
      } finally {
        self._callPath.pop();
      }
    };
  }

  /** strategy 슬롯 등록 (Phase 2 매니저 배선용 API). */
  strategy(slot: string, fn: Function): OverrideKernelHost {
    if (typeof fn !== 'function') {
      throw new TypeError(`OverrideKernel.strategy: fn for "${slot}" must be a function`);
    }
    this._strategies.set(slot, fn);
    return this._host;
  }

  /** strategy 슬롯 조회 — 미등록 시 fallback 반환 (매니저 read API). */
  getStrategy<F extends Function>(slot: string, fallback: F): F {
    return (this._strategies.get(slot) as F) ?? fallback;
  }

  /** 슬롯 등록 여부. */
  hasStrategy(slot: string): boolean {
    return this._strategies.has(slot);
  }

  /** 단일 메서드 원본 복구. 없으면 no-op. */
  restore(name: string): OverrideKernelHost {
    if (!this._originals.has(name)) return this._host;
    if (this._hadOwn.get(name)) {
      // 원래 own 프로퍼티였음 → 보존한 원본(this-bound)을 되돌린다.
      this._host[name] = this._originals.get(name)!;
    } else {
      // 프로토타입 메서드였음 → 인스턴스 shadow 삭제로 프로토타입 재노출.
      delete this._host[name];
    }
    this._originals.delete(name);
    this._hadOwn.delete(name);
    this._stack.delete(name);
    return this._host;
  }

  /** 전체 복구 + strategy clear. destroy 시 호출. */
  restoreAll(): OverrideKernelHost {
    for (const n of [...this._originals.keys()]) this.restore(n);
    this._strategies.clear();
    this._callPath = [];
    return this._host;
  }

  /** override 등록 여부. */
  hasOverride(name: string): boolean {
    return this._originals.has(name);
  }

  /** override 등록된 메서드 이름 목록. */
  getOverrideNames(): string[] {
    return [...this._originals.keys()];
  }
}
