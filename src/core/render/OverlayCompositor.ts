// ============================================================
// DD-03 §2.4 OverlayCompositor — 오버레이 z-순서 단일 계약 (REQ-T5-806)
// z-index 하드코딩 0 — role→rank→z 로 배정한다. 히트테스트 소유(ownsHit)를 role 로 질의.
// ★DOM 접촉 허용 2파일 중 하나(다른 하나는 CellApplier). 나머지 파이프라인은 순수·헤드리스.
// ============================================================

import type { OverlayLayer, OverlayRole } from './CellRenderRequest.js';

/**
 * 기본 role→rank 테이블(작을수록 아래). 최악 6중첩(§8 R2)에서도 결정론적 z 순서 보장.
 * 데이터바→히트맵→검증마커→range→선택→편집보더→마칭앤츠→주석→플로팅 순으로 위로.
 * / Default role→rank table (lower = below). Guarantees deterministic z-order even under the worst
 * 6-layer overlap (§8 R2).
 */
const DEFAULT_RANKS: Record<OverlayRole, number> = {
  'databar-fill': 10,
  'heatmap': 20,
  'validation-marker': 30,
  'range': 40,
  'selection': 50,
  'edit-border': 60,
  'marching-ants': 70,
  'annotation': 80,
  'floating': 90,
};

/** z-index 기저(rank 를 얹어 실제 z 산출). / z-index base (ranks are added on top). */
const Z_BASE = 1;

/**
 * 오버레이 합성기. role→rank→z 를 단일 소유하고, compose 시 rank 순으로 z-index 를 부여한다.
 * z-index 하드코딩을 어디에서도 하지 않는다(REQ-T5-806).
 * / Overlay compositor. Single owner of role→rank→z; assigns z-index by rank on compose. No z-index
 * is hardcoded anywhere (REQ-T5-806).
 */
export class OverlayCompositor {
  private _ranks: Record<string, number>;

  constructor() {
    this._ranks = { ...DEFAULT_RANKS };
  }

  /**
   * role 의 z 랭크 설정(코어 편집 없이 스택 위치 조정 — §4.2 seam). / Set a role's z-rank (OCP seam).
   *
   * @param role - 오버레이 role / Overlay role
   * @param rank - 랭크(클수록 위) / Rank (higher = above)
   */
  setRoleRank(role: OverlayRole, rank: number): void {
    this._ranks[role] = rank;
  }

  /** role 의 현재 랭크 조회. / Current rank for a role. */
  rankOf(role: OverlayRole): number {
    return this._ranks[role] ?? 100;
  }

  /**
   * 오버레이 레이어를 rank 순으로 cellEl 에 합성(z-index 부여). 각 레이어는 자체 z-context 로 격리
   * (position 이 미지정이면 absolute 로 승격 — 오버레이는 값 baseline 위 절대배치, §9.4).
   * / Compose overlay layers onto cellEl in rank order (assigns z-index). Each layer is isolated in
   * its own z-context (position promoted to absolute if unset).
   *
   * @param cellEl - 대상 셀 엘리먼트 / Target cell element
   * @param layers - 오버레이 레이어들 / Overlay layers
   */
  compose(cellEl: HTMLElement, layers: readonly OverlayLayer[]): void {
    if (layers.length === 0) return;
    // rank 오름차순(아래→위). 동률은 입력 순서 안정.
    const ordered = layers
      .map((l, i) => ({ l, i }))
      .sort((a, b) => this.rankOf(a.l.role) - this.rankOf(b.l.role) || a.i - b.i);
    for (const { l } of ordered) {
      const node = l.build();
      if (node instanceof HTMLElement) {
        if (!node.style.position) node.style.position = 'absolute';
        node.style.zIndex = String(Z_BASE + this.rankOf(l.role));
        // 히트테스트 소유하지 않는 오버레이는 포인터 이벤트 투과(값·셀 클릭 보존).
        if (!l.ownsHit && !node.style.pointerEvents) node.style.pointerEvents = 'none';
      }
      cellEl.appendChild(node);
    }
  }

  /**
   * 해당 role 의 오버레이가 히트테스트를 소유하는가(포인터 이벤트 수신). / Whether a role owns hit-testing.
   * 기본: edit-border·marching-ants·annotation·floating 은 소유 안 함(값 클릭 투과).
   *
   * @param role - 오버레이 role / Overlay role
   * @returns 히트 소유 여부 / Whether it owns hit-testing
   */
  hitOwner(role: OverlayRole): boolean {
    // 선택/범위/편집보더 등 시각 신호는 클릭을 값 셀로 투과시킨다(기본 비소유).
    // 상호작용 오버레이(플로팅 위젯)만 소유 — 확장은 레이어의 ownsHit 로 지정.
    return role === 'floating';
  }
}
