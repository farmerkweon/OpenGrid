// ============================================================
// DD-10 §2.7 뷰 슬롯 provider 통일 계약 / unified view-slot provider contract
// ------------------------------------------------------------
// 헤더·셀·푸터·빈상태·컨텍스트뷰·마스터디테일의 렌더 교체를 하나의 provider 계약으로
// (생명주기·폴백·격리 공유, REQ-T8-826/TX-901). 슬롯 레지스트리는 IRegistry<ISlotProvider>
// 동형(슬롯당 1 provider, protect-builtin). mount/update/unmount 대칭 + never-blank fallback.
// ============================================================

import { TypedRegistry } from './Registry.js';
import type { IRegistry } from './Registry.js';
import type { IExtension } from './IExtension.js';

/** 슬롯 이름(빌트인 + 임의 확장). / Slot name (built-ins + arbitrary extension). */
export type SlotName =
  | 'header'
  | 'cell'
  | 'footer'
  | 'empty'
  | 'contextView'
  | 'masterDetail'
  | (string & {});

/** 슬롯 산출물이 마운트되는 호스트(host CSS isolation 경계 안). / Host where slot output mounts (inside host CSS isolation). */
export interface SlotHost {
  [k: string]: unknown;
}

/** mount 가 반환하는 핸들 — update/unmount 의 대상. / Handle returned by mount — target of update/unmount. */
export interface SlotHandle {
  [k: string]: unknown;
}

/**
 * 슬롯 렌더 provider(§2.7). host CSS isolation 경계 안에서 동작(외부 스타일 침투 차단).
 * / Slot render provider. Operates inside the host CSS isolation boundary.
 */
export interface ISlotProvider<Ctx = unknown> extends IExtension {
  /** 최초 부착 — DOM/문자열 산출물 마운트. 반환 핸들은 update/unmount 의 대상. / Initial attach; returns a handle. */
  mount(host: SlotHost, ctx: Ctx): SlotHandle;
  /** 데이터/상태 변화 시 갱신(가상화 재사용 — 새 mount 대신 update). / Update on data/state change (virtualization reuse). */
  update?(handle: SlotHandle, ctx: Ctx): void;
  /** 대칭 해제(mount 자원 회수). / Symmetric teardown (reclaim mount resources). */
  unmount?(handle: SlotHandle): void;
  /** 산출 실패/미구현 시 코어가 쓸 기본 슬롯(never-blank). / Default slot on failure/unimplemented (never-blank). */
  fallback?: ISlotProvider<Ctx>;
}

/** 슬롯 레지스트리 — IRegistry 동형(슬롯당 1 provider). / Slot registry — isomorphic to IRegistry (1 provider per slot). */
export type SlotRegistry = IRegistry<ISlotProvider>;

/**
 * 슬롯 레지스트리 생성(protect-builtin 정책 — 빌트인 슬롯 보호).
 * / Create a slot registry (protect-builtin — built-in slots are protected).
 *
 * @returns 슬롯 provider 레지스트리 / A slot-provider registry
 */
export function createSlotRegistry(): TypedRegistry<ISlotProvider> {
  return new TypedRegistry<ISlotProvider>({ duplicatePolicy: 'protect-builtin' });
}

/**
 * 슬롯 provider 를 fallback 사슬을 따라 안전 마운트(never-blank, UC-9). provider.mount 가 throw 하면
 * fallback 으로 폴백하고, fallback 도 없으면 null 반환(코어는 계속 동작).
 * / Safely mount a slot provider following its fallback chain (never-blank). Falls back on throw.
 *
 * @param provider - 마운트할 슬롯 provider / The slot provider to mount
 * @param host - 마운트 호스트 / The mount host
 * @param ctx - 슬롯 컨텍스트 / Slot context
 * @returns 핸들, 전 사슬 실패 시 null / A handle, or null if the whole chain fails
 */
export function safeMount<Ctx>(
  provider: ISlotProvider<Ctx> | undefined,
  host: SlotHost,
  ctx: Ctx,
): SlotHandle | null {
  let p: ISlotProvider<Ctx> | undefined = provider;
  while (p) {
    try {
      return p.mount(host, ctx);
    } catch {
      p = p.fallback;
    }
  }
  return null;
}
