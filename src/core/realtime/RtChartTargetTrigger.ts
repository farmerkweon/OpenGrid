// ============================================================
// DD-07 §2.6 RT 차트 타깃 트리거 — 셀렉션 신호 + 라이브 dirty 만. / DD-07 §2.6 chart-target trigger.
// REQ: REQ-RT-803 (서버 헤드리스 렌더) · REQ-RT-804 (client↔server 이중지원)
// ------------------------------------------------------------
// R.1(교차리뷰 §1.C): 렌더 타깃 추상화·서버 진입점·장면·파리티는 전부 DD-06 소유. RT 는 재선언 0 —
// "언제/어느 타깃으로 라이브 재렌더할지"의 셀렉션 트리거·수명주기 신호만. 실제 렌더는 DD-06 위임.
// 통합 TODO: RenderTargetKind/renderChartServer 는 DD-06 chart/scene·chart/server 에서 import.
// ============================================================

/** DD-06 소유(재선언 금지) — 통합 시 '../chart/scene' 에서 import. / Owned by DD-06. */
export type RenderTargetKind = 'canvas' | 'svg' | 'server';

/**
 * RT 차트 타깃 트리거. target=서버면 DD-06 renderChartServer 로 위임(RT 재구현 0).
 * markDirty 로 영향 시리즈(rowIds)만 재렌더 신호. 실제 scene 조립·paint·직렬화·파리티는 DD-06.
 * / RT chart trigger: selection signal + live dirty only; actual render delegated to DD-06.
 */
export interface RtChartTargetTrigger {
  /** 공개 옵션(REQ-RT-804). 미지정=client 현행(하위호환). / Public option; default client. */
  readonly target: RenderTargetKind;
  /** 영향 시리즈만 재렌더 신호. 실제 렌더 실행은 DD-06 위임. / Mark impacted series dirty. */
  markDirty(rowIds: readonly string[]): void;
}

/**
 * 기본 트리거 — dirty rowId 를 누적하고 drain 으로 배출(DD-06 배선 전 수집만).
 * / Default trigger: accumulates dirty rowIds and drains them (collect-only until DD-06 wired).
 */
export class DefaultRtChartTargetTrigger implements RtChartTargetTrigger {
  readonly target: RenderTargetKind;
  private readonly _dirty = new Set<string>();
  private readonly _onDirty?: (rowIds: readonly string[]) => void;

  constructor(target: RenderTargetKind = 'canvas', onDirty?: (rowIds: readonly string[]) => void) {
    this.target = target;
    if (onDirty) this._onDirty = onDirty;
  }

  markDirty(rowIds: readonly string[]): void {
    for (const id of rowIds) this._dirty.add(id);
    this._onDirty?.(rowIds);
  }

  /** 누적 dirty rowId 배출(테스트/DD-06 배선용). / Drain accumulated dirty rowIds. */
  drain(): string[] {
    const out = [...this._dirty];
    this._dirty.clear();
    return out;
  }
}
