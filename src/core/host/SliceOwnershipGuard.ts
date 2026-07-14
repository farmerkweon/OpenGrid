// ============================================================
// DD-14 §7 / REQ-TX-841 강제 등록 — 좌표 슬라이스 직접변이 차단(런타임 가드)
// DD-02 는 SLICE_OWNERSHIP 맵(단일소유자 규정)을 '선언'만 했고, 강제(dev throw)는 DD-14 로 이연되었다.
// (DD-02_log.md R1: "비소유자 직접 변이 시 dev 빌드 throw ... DD-14 arch:check 로 이연").
// 본 모듈이 그 이연분을 실제 런타임 가드로 집행한다. 헤드리스(DOM/전역 미참조).
// ============================================================
import { SLICE_OWNERSHIP, type SliceKey } from '../coordinate/ports.js';

/** REQ-TX-841 위반 — 비소유 모듈이 좌표 슬라이스를 직접 변이하려 함. / Slice-ownership violation. */
export class SliceOwnershipViolation extends Error {
  constructor(
    public readonly slice: SliceKey,
    public readonly owner: string,
    public readonly detail: string,
  ) {
    super(
      `[REQ-TX-841] coordinate slice "${slice}" is owned solely by "${owner}"; ` +
        `direct mutation by a non-owner is forbidden (${detail}).`,
    );
    this.name = 'SliceOwnershipViolation';
  }
}

/** 소유자 조회. / Look up the declared owner of a slice. */
export function ownerOf(slice: SliceKey): string {
  return SLICE_OWNERSHIP[slice];
}

/**
 * 소유권 assert — 비소유 액터가 슬라이스를 변이하려 하면 throw.
 * 소유 모듈이 변이 진입점에서 스스로를 신고하는 저비용 가드.
 * / Assert ownership; throws if a non-owner actor attempts to mutate the slice.
 */
export function assertSliceOwner(slice: SliceKey, actor: string): void {
  const owner = SLICE_OWNERSHIP[slice];
  if (actor !== owner) {
    throw new SliceOwnershipViolation(slice, owner, `actor="${actor}"`);
  }
}

const MUTATING_ARRAY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

/**
 * 좌표 슬라이스를 읽기전용으로 봉인 — 커널은 슬라이스를 read-only 입력으로만 받으므로,
 * 소비 경로에서 어떤 직접 쓰기(프로퍼티 대입·delete·배열 변이 메서드)든 즉시 SliceOwnershipViolation.
 * 비소유 모듈의 우발적 변이를 런타임에서 결정론적으로 탐지한다(dev throw, REQ-TX-841).
 *
 * `owner` 인자가 주어지면 소유자 자신은 변이를 허용(신뢰 경계) — 그 외 전부 차단.
 * / Seal a coordinate slice as read-only. Any direct write throws a SliceOwnershipViolation.
 */
export function sealSlice<V extends object>(slice: SliceKey, value: V, owner?: string): V {
  const declaredOwner = SLICE_OWNERSHIP[slice];
  const ownerBypass = owner !== undefined && owner === declaredOwner;
  if (ownerBypass) return value;

  const handler: ProxyHandler<any> = {
    set(_t, prop) {
      throw new SliceOwnershipViolation(slice, declaredOwner, `set "${String(prop)}"`);
    },
    deleteProperty(_t, prop) {
      throw new SliceOwnershipViolation(slice, declaredOwner, `delete "${String(prop)}"`);
    },
    defineProperty(_t, prop) {
      throw new SliceOwnershipViolation(slice, declaredOwner, `defineProperty "${String(prop)}"`);
    },
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (Array.isArray(target) && typeof prop === 'string' && MUTATING_ARRAY_METHODS.has(prop)) {
        return () => {
          throw new SliceOwnershipViolation(slice, declaredOwner, `array.${prop}()`);
        };
      }
      return v;
    },
  };
  return new Proxy(value, handler) as V;
}

/** 전체 슬라이스 키 목록(테스트·게이트 열거용). / All slice keys. */
export const SLICE_KEYS = Object.keys(SLICE_OWNERSHIP) as SliceKey[];
