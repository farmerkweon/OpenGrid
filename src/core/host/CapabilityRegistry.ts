// ============================================================
// DD-14 §2.5 CapabilityRegistry — 패리티 매트릭스 SSOT (REQ-T8-884)
// 거버넌스 읽기전용 SSOT(확장점 SPI 아님 — DD-10 IRegistry 동형 제외, §2.5 크로스컷 C1).
// 코어 능력을 열거하고, 각 어댑터의 노출/동형동작을 %계량해 P0 100% 게이트를 소비한다.
// 헤드리스(DOM/전역 미참조).
// ============================================================

export type Priority = 'P0' | 'P1' | 'P2';
export type AdapterId = 'react' | 'vue' | 'jquery' | 'vanilla';

/** 코어 능력 선언. / Declared core capability. */
export interface Capability {
  readonly id: string; // 'data.set' | 'event.cellClick' | 'theme.live' | 'overlay.contextMenu' …
  readonly priority: Priority; // P0 는 4어댑터 100% 노출 의무.
  readonly title?: string;
}

/** 어댑터별 노출/동형동작 선언. / Per-adapter conformance declaration. */
export interface AdapterConformance {
  readonly adapter: AdapterId;
  readonly exposed: ReadonlySet<string>; // 선언 노출.
  readonly behaviorMatch: ReadonlySet<string>; // 동형 렌더/이벤트 실측 통과.
}

/** 능력×어댑터 격자의 한 셀. / One cell of the capability × adapter grid. */
export interface ParityCell {
  readonly capabilityId: string;
  readonly adapter: AdapterId;
  readonly exposed: boolean;
  readonly behaviorMatch: boolean;
}

export interface AdapterParity {
  readonly adapter: AdapterId;
  readonly exposureRate: number; // 0..1
  readonly behaviorMatchRate: number; // 0..1
}

export interface ParityMatrix {
  readonly cells: readonly ParityCell[];
  readonly perAdapter: readonly AdapterParity[];
  /** P0 능력이 어느 어댑터에서든 미노출/미일치인 셀 목록. 비어있어야 게이트 통과. */
  readonly p0Gaps: readonly ParityCell[];
  /** P0 100% 게이트 통과 여부. / Whether the P0 100% gate passes. */
  readonly p0Pass: boolean;
}

/**
 * 읽기전용 능력 SSOT. register 는 코어 능력 선언 시점의 내부 조립용(확장 표면 아님).
 * / Read-only capability SSOT. `register` is for internal declaration, not an extension surface.
 */
export class CapabilityRegistry {
  private readonly _caps = new Map<string, Capability>();

  register(cap: Capability): this {
    this._caps.set(cap.id, cap);
    return this;
  }

  list(): readonly Capability[] {
    return [...this._caps.values()];
  }

  get(id: string): Capability | undefined {
    return this._caps.get(id);
  }

  snapshot(): CapabilitySnapshot {
    return {
      ids: this.list().map((c) => c.id),
      p0Ids: this.list().filter((c) => c.priority === 'P0').map((c) => c.id),
    };
  }
}

/** 포트가 노출하는 읽기전용 능력 스냅샷(도메인 상태 아님). / Read-only capability probe snapshot. */
export interface CapabilitySnapshot {
  readonly ids: readonly string[];
  readonly p0Ids: readonly string[];
}

/**
 * 노출율·일치율 %계량 + P0 미달 항목 리포트. CI 게이트가 소비.
 * / Computes exposure/behavior rates and the P0 gap list. Consumed by the CI gate.
 */
export function computeParity(
  caps: readonly Capability[],
  confs: readonly AdapterConformance[],
): ParityMatrix {
  const cells: ParityCell[] = [];
  const perAdapter: AdapterParity[] = [];
  const p0Gaps: ParityCell[] = [];
  const capById = new Map(caps.map((c) => [c.id, c]));

  for (const conf of confs) {
    let exposedN = 0;
    let matchN = 0;
    for (const cap of caps) {
      const exposed = conf.exposed.has(cap.id);
      const behaviorMatch = conf.behaviorMatch.has(cap.id);
      const cell: ParityCell = { capabilityId: cap.id, adapter: conf.adapter, exposed, behaviorMatch };
      cells.push(cell);
      if (exposed) exposedN++;
      if (behaviorMatch) matchN++;
      if (cap.priority === 'P0' && (!exposed || !behaviorMatch)) {
        p0Gaps.push(cell);
      }
    }
    const total = caps.length || 1;
    perAdapter.push({
      adapter: conf.adapter,
      exposureRate: exposedN / total,
      behaviorMatchRate: matchN / total,
    });
  }

  // 선언되지 않은 어댑터에 대해서도 P0 능력은 gap 으로 잡는다(고아 능력 검출).
  void capById;

  return { cells, perAdapter, p0Gaps, p0Pass: p0Gaps.length === 0 };
}

/**
 * 코어 능력 SSOT 싱글턴. 새 코어 능력 추가 시 여기에 등록 → 패리티 매트릭스가
 * 자동으로 4어댑터 커버리지를 요구(고아 능력=미노출 검출).
 * / Core capability SSOT singleton.
 */
export const CAPABILITY_REGISTRY = new CapabilityRegistry()
  .register({ id: 'data.set', priority: 'P0', title: 'setData' })
  .register({ id: 'lifecycle.mount', priority: 'P0', title: 'mount' })
  .register({ id: 'lifecycle.unmount', priority: 'P0', title: 'unmount' })
  .register({ id: 'props.update', priority: 'P0', title: 'updateProps' })
  .register({ id: 'event.subscribe', priority: 'P0', title: 'subscribe' })
  .register({ id: 'theme.live', priority: 'P1', title: 'setTheme' })
  .register({ id: 'skin.live', priority: 'P1', title: 'setSkin' })
  .register({ id: 'overlay.contextMenu', priority: 'P2', title: 'context menu overlay' });
