// ============================================================
// DD-07 §2.3 전환 보존 계약(Memento) — 델타 적용 전 캡처, 후 복원. / DD-07 §2.3 live-state guard.
// REQ: REQ-RT-802 (상태보존) · REQ-T3-011 (전환 보존) · S-1 (편집충돌 정책) · S-2 (복원비용 국소화)
// ------------------------------------------------------------
// 절대 규칙: 미커밋 편집·선택·스크롤을 잃지 않는다. upsert/remove 로 인덱스가 바뀌어도 rowId 앵커로 복원.
// S-1 기본 정책(a): 편집 중 셀에 서버 델타 도착 → 사용자 draft 우선 + "서버값 변경됨" 힌트(비방해).
// S-2: 스크롤 앵커 1개·선택 집합만 재해소(전량 재계산 금지). 픽셀 재정합은 ViewportController 위임.
// ============================================================

import type { LiveStateSource, LiveUserState, RtCoords } from './ports.js';
import type { AppliedDelta } from './RtAnnouncePolicy.js';

/** S-1 편집충돌 힌트 — 편집 중 셀이 서버 델타로 바뀜(UI 신선도 힌트용). / Edit-conflict hint. */
export interface EditConflict {
  readonly rowId: string;
  readonly field: string;
}

/**
 * 상태 캡처/복원 어댑터. 실제 선택/스크롤/편집 서브시스템은 LiveStateSource 로 주입(신설 아님).
 * / Capture/restore adapter; the real selection/scroll/edit subsystems are injected via LiveStateSource.
 */
export class LiveStateGuard {
  private readonly _src: LiveStateSource;
  private readonly _coords: RtCoords;
  private _lastConflicts: EditConflict[] = [];

  constructor(src: LiveStateSource, coords: RtCoords) {
    this._src = src;
    this._coords = coords;
  }

  /** 마지막 restore 의 편집충돌(S-1 힌트). / Edit conflicts from the last restore. */
  get lastConflicts(): readonly EditConflict[] {
    return this._lastConflicts;
  }

  /** 적용 전 스냅샷(rowId 앵커). / Pre-apply snapshot (rowId-anchored). */
  capture(): LiveUserState {
    const editing = this._src.readEditing();
    return {
      selection: this._src.readSelection(),
      scroll: this._src.readScroll(),
      ...(editing ? { editing } : {}),
      sortFilterSig: this._src.readSortFilterSig(),
    };
  }

  /** 적용 후 오프셋 재정합. 인덱스가 아니라 rowId 로 복원. / Post-apply reconciliation, by rowId. */
  restore(s: LiveUserState, applied: AppliedDelta): void {
    this._lastConflicts = [];
    const removed = new Set(applied.removedRowIds);

    // ── 선택: 사라진 rowId 는 해제, 나머지는 유지. / Selection: drop removed, keep the rest.
    const selection = s.selection.filter(
      (a) => !removed.has(a.rowId) && this._coords.rowIdToIndex(a.rowId) >= 0,
    );
    this._src.writeSelection(selection);

    // ── 스크롤: 앵커 rowId 생존 시 유지(픽셀 재정합은 ViewportController). 제거 시 앵커만 해제.
    if (s.scroll.anchorRowId && (removed.has(s.scroll.anchorRowId) || this._coords.rowIdToIndex(s.scroll.anchorRowId) < 0)) {
      this._src.writeScroll({ pixelWithinRow: 0, scrollLeft: s.scroll.scrollLeft });
    } else {
      this._src.writeScroll(s.scroll);
    }

    // ── 편집: S-1 (a) draft 우선. 행 생존 시 draft 복원. 서버가 같은 셀을 바꿨으면 충돌 힌트만 기록.
    if (s.editing) {
      const alive = !removed.has(s.editing.rowId) && this._coords.rowIdToIndex(s.editing.rowId) >= 0;
      if (alive) {
        const changedByServer = applied.changedCells.some(
          (c) => c.rowId === s.editing!.rowId && c.field === s.editing!.field,
        );
        if (changedByServer) this._lastConflicts.push({ rowId: s.editing.rowId, field: s.editing.field });
        this._src.writeEditing(s.editing); // draft 우선(비방해). / Keep draft (non-blocking).
      } else {
        this._src.writeEditing(undefined); // 행 사라짐 → 편집 해제. / Row gone → drop edit.
      }
    }
  }
}
