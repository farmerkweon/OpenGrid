/**
 * F1 범위 선택 + 채우기 — 공유 타입.
 * 계약 근거: docs/design/grid-features-2026-07/11_design_F1_v2.md §2.2
 *            docs/design/grid-features-2026-07/15_cross_contracts.md C0/C0.3/C0.4/C0.5
 *
 * ⚠️ 병렬 작업 경계: 이 파일은 신규 디렉터리 src/core/range/ 소속.
 * `CellRange`는 기존 `core/types.ts:125`(F1 소유, 의미=C0.4)를 재사용만 하고 재정의하지 않는다.
 * `FlatRowModel`(C0.3, src/core/FlatRowModel.ts)은 다른 태스크가 신설 중이므로,
 * 여기서는 실제 구현을 import하지 않고 "계약 모양"만 인터페이스로 선언해 주입받는다
 * (RangeModelHost). 배선 단계에서 실제 FlatRowModel 인스턴스를 이 계약에 맞춰 넘기면 된다.
 */
import type { CellRange } from '../types.js';

export type { CellRange };

/** 방향성 원시 좌표. ri=flat/visual index(C0.2), ci=visibleLeaves index(C0.4). */
export interface CellCoord {
  ri: number;
  ci: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';
export type FillAxis = Direction;
export type FillMode = 'copy' | 'series';

/** 범위 정체성(C0.5) — display-index가 아니라 stable 집합으로 저장. */
export interface RangeIdentity {
  /** 선택된 data 행의 stable _ogRowId 집합 (정렬/필터를 넘어 보존) */
  rowIds: string[];
  /** 선택된 열의 field 집합 (visibleLeaves.field) */
  fields: string[];
}

/** FlatRowModel.resolveFlatRow가 반환하는 참조(C0.3). */
export interface FlatRowRefLike {
  kind: 'data' | 'group' | 'tree' | 'detailHead' | 'detailFiller';
  rowId?: string;
  dataIndex?: number;
  displayIndex?: number;
}

/**
 * F1이 좌표 해소·재투영을 위해 필요로 하는 최소 계약 모양(C0.3 FlatRowModel + visibleLeaves).
 * 실제 구현(baseline FlatRowModel/ColumnLayout)은 이 형태를 만족하는 어댑터를 배선 단계에서 주입한다.
 */
export interface RangeModelHost {
  /** flat/visual 행 총수 */
  count(): number;
  /** flat index → 참조(kind/rowId 등). 없으면 kind 판별 불가 상태를 반환해야 함(C0.3) */
  resolveFlatRow(flatIndex: number): FlatRowRefLike;
  /** stable rowId → 현재 flat index. 없으면(접힘/필터아웃) -1 */
  flatIndexOfRowId(rowId: string): number;
  /** flat index → stable rowId (data/tree만, 그 외 null) */
  rowIdOfFlat(flatIndex: number): string | null;
  /** 현재 visibleLeaves의 field 목록(순서=ci) */
  visibleFields(): string[];
}

/** 채우기 프리뷰(핸들 드래그 중) — 커밋 전 임시 상태 자료(§2.2 FillPreview). */
export interface FillPreview {
  source: CellRange;
  target: CellRange;
  axis: FillAxis;
  mode: FillMode;
}
