// ============================================================
// DD-07 DI 포트 — RT 가 타 DD(09 CommandBus·02 좌표 SSOT·11/12 UI)에 기대는 seam 계약.
// / DD-07 DI ports — the seams RT expects from other DDs (09 CommandBus, 02 coords, 11/12 UI).
// ------------------------------------------------------------
// 병렬 개발 규율: RT 는 이 포트만 의존한다(공유 파일 미수정). 실배선(어댑터)은 통합 단계에서.
//  - RtCommandSink  → DD-09 CommandBus.dispatchSilent/beginBatch/endBatch (통합 TODO: 현 CommandBus 미보유)
//  - RtCoords       → DD-02 좌표 SSOT / DD-09 CoordResolver(indexOf/rowIdAt) 얇은 어댑터
//  - LiveStateSource→ 선택/스크롤/편집 서브시스템 읽기·쓰기 포트
// 헤드리스: 실제 타이머/rAF/소켓은 전부 주입(코어는 전역 미참조).
// ============================================================

import type { ICommand } from '../command/ICommand.js';

/**
 * 단일 쓰기 이음새(DD-09) 중 RT 가 쓰는 부분집합. RT 델타는 **비-undoable 백그라운드 커맨드**로
 * 접어 dispatchSilent → undo 스택 미오염(userInitiated=false). beginBatch/endBatch 는 다중 델타를
 * 한 프레임 브래킷으로 묶되 undo 컴포지트를 만들지 않는다(=매크로와 구별).
 * / Subset of DD-09's sole write seam used by RT; silent = no undo-stack pollution.
 */
export interface RtCommandSink<T = unknown> {
  /** undo 스택 미적재로 커맨드 실행(do 만). / Execute a command without pushing to the undo stack. */
  dispatchSilent(cmd: ICommand<T>): void;
  /** 프레임 배치 시작(undo 컴포지트 아님). / Begin a (non-undoable) frame batch. */
  beginBatch(): void;
  /** 프레임 배치 종료. / End the frame batch. */
  endBatch(): void;
}

/**
 * 좌표 권위(DD-02 SSOT) 중 RT 가 쓰는 부분집합. RT 재구현 0 — rowId(안정키)↔flat index 만.
 * DD-09 CoordResolver 는 indexOf/rowIdAt 을 제공하므로 얇은 이름 어댑터로 연결(통합 TODO).
 * / Coordinate authority subset (DD-02 SSOT); RT never re-implements coordinate math.
 */
export interface RtCoords {
  /** rowId → flat index. 미존재 = -1. / rowId → flat index; absent = -1. */
  rowIdToIndex(rowId: string): number;
  /** flat index → rowId. 범위 밖 = undefined. / flat index → rowId; out of range = undefined. */
  indexToRowId(index: number): string | undefined;
}

/** 미커밋 편집 상태(rowId 앵커). / Uncommitted edit (rowId-anchored). */
export interface EditingState {
  readonly rowId: string;
  readonly field: string;
  readonly draftValue: unknown;
}

/** 선택 앵커(rowId 기준 — 인덱스 아님). / Selection anchor (rowId, not index). */
export interface SelectionAnchor {
  readonly rowId: string;
  readonly field?: string;
}

/** 스크롤 앵커(rowId + 행 내부 픽셀 오프셋). / Scroll anchor (rowId + within-row pixel offset). */
export interface ScrollAnchor {
  readonly anchorRowId?: string;
  readonly pixelWithinRow: number;
  readonly scrollLeft: number;
}

/** 적용 전 캡처되는 사용자 상태(rowId 앵커). / User state captured before applying (rowId-anchored). */
export interface LiveUserState {
  readonly selection: readonly SelectionAnchor[];
  readonly scroll: ScrollAnchor;
  readonly editing?: EditingState;
  /** 정렬/필터 상태 서명(무효화 감지). / Sort/filter state signature. */
  readonly sortFilterSig: string;
}

/**
 * 선택/스크롤/편집 상태 읽기·쓰기 포트(전환 보존 계약). LiveStateGuard 가 이 위에서 캡처/복원.
 * 실배선은 SelectionModel·ViewportController·CellEditManager 에 연결(통합 TODO).
 * / Read/write port for selection/scroll/edit; the transition-preservation contract.
 */
export interface LiveStateSource {
  readSelection(): readonly SelectionAnchor[];
  readScroll(): ScrollAnchor;
  readEditing(): EditingState | undefined;
  readSortFilterSig(): string;
  writeSelection(sel: readonly SelectionAnchor[]): void;
  writeScroll(scroll: ScrollAnchor): void;
  writeEditing(editing: EditingState | undefined): void;
}

/** 타이머 핸들(취소 가능). / Cancelable timer handle. */
export interface TimerHandle {
  cancel(): void;
}

/** 지연 실행 주입(폴링 간격·backoff). 기본 어댑터가 setTimeout 을 감싸되 테스트는 수동 시계. */
export type TimerScheduler = (cb: () => void, delayMs: number) => TimerHandle;

/** 프레임 경계 주입(백프레셔 flush). 기본 어댑터가 rAF 를 감싸되 서버/테스트는 결정론 시계. */
export type FrameScheduler = (cb: () => void) => TimerHandle;

/** 실 setTimeout 기반 기본 타이머(비테스트 기본). / Default setTimeout-based timer. */
export const defaultTimerScheduler: TimerScheduler = (cb, delayMs) => {
  const id = setTimeout(cb, delayMs);
  return { cancel: () => clearTimeout(id) };
};

/**
 * 기본 프레임 스케줄러 — 브라우저면 rAF, 아니면 setTimeout(~16ms) 폴백(헤드리스 안전).
 * / Default frame scheduler — rAF in browser, setTimeout fallback headless.
 */
export const defaultFrameScheduler: FrameScheduler = (cb) => {
  const raf = (globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number })
    .requestAnimationFrame;
  if (typeof raf === 'function') {
    const id = raf(() => cb());
    const caf = (globalThis as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame;
    return { cancel: () => caf?.(id) };
  }
  const id = setTimeout(cb, 16);
  return { cancel: () => clearTimeout(id) };
};
