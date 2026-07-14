// ============================================================
// DD-04 커스텀 포맷터 레지스트리 / DD-04 custom formatter registry
// 설계: DD-04 §2.4·§R.2 · REQ-T9-002
// IFormatter 등록소 — IconRegistry/LocaleRegistry 동형(전역 싱글턴 + parent-chain child +
// never-throw 폴백). DD-10 IRegistry<IFormatter> 동형(어댑터). 멀티그리드 격리(child).
// ============================================================

import type { IFormatter } from './types.js';

/**
 * 커스텀 포맷터 등록소. register/resolve/child 는 DD-10 TypedRegistry<IFormatter> 매핑.
 * / Custom formatter registry (isomorphic to DD-10 TypedRegistry<IFormatter>).
 */
export class FormatterRegistry {
  private _map = new Map<string, IFormatter>();
  private _parent: FormatterRegistry | undefined;

  constructor(parent?: FormatterRegistry) {
    this._parent = parent;
  }

  /** 포맷터 등록(additive, 동일 이름 last-wins). / Register a formatter (last-wins on same name). */
  register(f: IFormatter): this {
    this._map.set(f.name, f);
    return this;
  }

  /** 이름으로 해석(미해석 → undefined, 파이프 기본 폴백). parent-chain 탐색. / Resolve by name; unknown → undefined. */
  resolve(name: string): IFormatter | undefined {
    for (let reg: FormatterRegistry | undefined = this; reg; reg = reg._parent) {
      const f = reg._map.get(name);
      if (f) return f;
    }
    return undefined;
  }

  /** 등록 여부(parent-chain 합집합). / Whether a formatter name is registered. */
  has(name: string): boolean {
    for (let reg: FormatterRegistry | undefined = this; reg; reg = reg._parent) {
      if (reg._map.has(name)) return true;
    }
    return false;
  }

  /** 이 레지스트리를 부모로 하는 자식(per-instance 격리, 멀티그리드 오염 0). / A child registry (per-instance isolation). */
  child(): FormatterRegistry {
    return new FormatterRegistry(this);
  }

  /** 등록된 포맷터 이름 목록(능력 매니페스트, parent-chain 합집합). / Registered formatter names (capability manifest). */
  list(): string[] {
    const names = new Set<string>(this._map.keys());
    if (this._parent) for (const n of this._parent.list()) names.add(n);
    return [...names];
  }
}

/** 프로세스 전역 기본 포맷터 레지스트리. / Process-global default formatter registry. */
export const formatterRegistry = new FormatterRegistry();
