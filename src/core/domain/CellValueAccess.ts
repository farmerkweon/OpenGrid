// ============================================================
// DD-01 셀 값 3계층 계약 / DD-01 cell value 3-layer contract
// 설계: DD-01 §2.5 · REQ-T6-803
// raw(값객체)·display(파생 문자열)·editor(파생 편집 시드). 단방향 파생·역참조 금지.
// ※ 구현체(배선)는 OpenGrid 코어 소유. 여기선 계약(타입)만 정의한다.
// ============================================================

import type { DomainValue } from './DomainValue.js';

/** 행 참조(안정 rowId 또는 flat 인덱스). / Row reference (stable rowId or flat index). */
export type RowRef = string | number;

/** 편집기 진입 시드(raw 로부터 파생). / Editor seed derived from raw. */
export interface EditorSeed {
  /** 편집기 초기 문자열. / Initial editor string. */
  readonly text: string;
  /** 선택 힌트(select 등). / Optional choice hints. */
  readonly choices?: readonly string[];
}

/**
 * 셀 값 3계층 계약(REQ-T6-803). / Cell value 3-layer access contract.
 *
 * @invariant raw 는 항상 DomainValue. display/editor 는 raw 에서 단방향 파생(역참조 금지).
 *
 * ★역참조 금지 불변식:
 *  - getDisplay/getEditorSeed 의 반환(문자열/시드)을 다시 계산·집계로 흘리는 API 가 존재하지 않는다.
 *  - 계산/집계/차트/정렬/검증은 오직 getRawValue(값 객체)만 소비한다.
 */
export interface CellValueAccess {
  /** ── 정본(계산·차트·집계·정렬·검증이 소비) ── / Canonical raw value. */
  getRawValue(row: RowRef, field: string): DomainValue;

  /** ── 표시 파생(뷰 전용, DD-04 포맷터가 raw 로부터 산출) ── / Derived display string. */
  getDisplay(row: RowRef, field: string): string;

  /** ── 편집 시드(편집기 진입 값) ── / Editor seed. */
  getEditorSeed(row: RowRef, field: string): EditorSeed;

  /** 편집 커밋 — 원시 입력을 값 객체로 되돌리는 유일 경로(단방향 닫힘). / Commit an edit back into a value object. */
  commitEdit(row: RowRef, field: string, rawInput: unknown): DomainValue;
}
