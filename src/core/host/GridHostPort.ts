// ============================================================
// DD-14 §2.1 GridHostPort — 코어측 안정 경계 계약(DIP) / core-side stable boundary contract
// 헤드리스: 이 파일 어디에도 React/Vue/jQuery 심볼이 등장하지 않는다(불변식1).
// 어댑터는 이 포트에만 의존하고 GridHostDriver·OpenGrid 를 직접 import 하지 않는다(팩토리 경유).
// ============================================================
import type { GridOptions, ColumnDef } from '../types.js';
import type { CapabilitySnapshot } from './CapabilityRegistry.js';

/**
 * 프레임워크가 그리드에 반영을 요청하는 최소 옵션 델타(구조/데이터/외관).
 * / Minimal option delta a framework can request the grid to apply.
 */
export interface GridPropsPatch<T = any> {
  readonly data?: readonly T[];
  readonly columns?: readonly ColumnDef<T>[];
  readonly theme?: string;
  readonly skin?: string;
  /** props 로 못 덮는 나머지 코어 옵션(부분). 구조 옵션 변경은 재생성 유발(reconcile). */
  readonly options?: Partial<GridOptions<T>>;
}

/** subscribe 해지자. 프레임워크 unmount 시 반드시 호출(누수 방지). / Unsubscribe handle. */
export type Unsubscribe = () => void;

/** 포트 이벤트 핸들러(프레임워크 무관). / Framework-agnostic event handler. */
export type HostEventHandler = (payload: any) => void;

/**
 * 코어↔호스트의 유일한 안정 경계(semver 공개 계약).
 * 어떤 멤버도 React/Vue/jQuery 타입을 참조하지 않는다(DIP 근인 제거, REQ-TX-848).
 * / The single stable seam between core and host. No member references any framework type.
 */
export interface GridHostPort<T extends Record<string, any> = any> {
  /** 컨테이너에 그리드를 마운트. 이미 마운트면 no-op+dev 경고. 멱등 계약. */
  mount(container: HTMLElement, options: GridOptions<T>): void;
  /** 마운트 해제 + 모든 리스너 정리(파사드 destroy 위임). 멱등. */
  unmount(): void;
  /** 얕은 diff 로 최소 변이 적용(reconcile 정책). 미마운트 시 dev 경고. */
  updateProps(patch: GridPropsPatch<T>): void;
  /** 코어 이벤트 구독. 반환 해지자를 어댑터가 생명주기에 묶어 반드시 해제. */
  subscribe(event: string, handler: HostEventHandler): Unsubscribe;
  /** (읽기 전용) 능력 프로브 — 패리티 매트릭스가 질의. 도메인 상태 노출 아님. */
  readonly capabilities: CapabilitySnapshot;
  /** 마운트 여부(테스트·어댑터 방어용, 읽기 전용). */
  readonly mounted: boolean;
}
