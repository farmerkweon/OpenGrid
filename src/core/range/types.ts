/**
 * F1 범위 선택 + 채우기 — 공유 타입. / F1 range selection + fill — shared types.
 *
 * 계약 근거: docs/design/grid-features-2026-07/11_design_F1_v2.md §2.2
 *            docs/design/grid-features-2026-07/15_cross_contracts.md C0/C0.3/C0.4/C0.5
 * / Contract basis: 11_design_F1_v2.md §2.2; 15_cross_contracts.md C0/C0.3/C0.4/C0.5.
 *
 * ⚠️ 병렬 작업 경계: 이 파일은 신규 디렉터리 src/core/range/ 소속.
 * `CellRange`는 기존 `core/types.ts:125`(F1 소유, 의미=C0.4)를 재사용만 하고 재정의하지 않는다.
 * `FlatRowModel`(C0.3, src/core/FlatRowModel.ts)은 다른 태스크가 신설 중이므로,
 * 여기서는 실제 구현을 import하지 않고 "계약 모양"만 인터페이스로 선언해 주입받는다
 * (RangeModelHost). 배선 단계에서 실제 FlatRowModel 인스턴스를 이 계약에 맞춰 넘기면 된다.
 * / Parallel-work boundary: this file lives in the new directory src/core/range/. `CellRange` only reuses the
 * existing `core/types.ts:125` (owned by F1, semantics = C0.4) and never redefines it. `FlatRowModel`
 * (C0.3, src/core/FlatRowModel.ts) is being newly created by another task, so here we do not import the real
 * implementation — we declare only its "contract shape" as an interface to be injected (RangeModelHost). At the
 * wiring stage a real FlatRowModel instance is passed to satisfy this contract.
 */
import type { CellRange } from '../types.js';

export type { CellRange };

/** 방향성 원시 좌표. ri=flat/visual index(C0.2), ci=visibleLeaves index(C0.4). / Directional raw coordinate. ri=flat/visual index (C0.2), ci=visibleLeaves index (C0.4). */
export interface CellCoord {
  /** 행 flat/visual 인덱스(C0.2). / Row flat/visual index (C0.2). */
  ri: number;
  /** 열 visibleLeaves 인덱스(C0.4). / Column visibleLeaves index (C0.4). */
  ci: number;
}

/** 이동/채우기 방향. / Move/fill direction. */
export type Direction = 'up' | 'down' | 'left' | 'right';
/** 채우기 축(방향과 동형). / Fill axis (isomorphic to Direction). */
export type FillAxis = Direction;
/** 채우기 모드: 복제 또는 시리즈 외삽. / Fill mode: copy or series extrapolation. */
export type FillMode = 'copy' | 'series';

/** 범위 정체성(C0.5) — display-index가 아니라 stable 집합으로 저장. / Range identity (C0.5) — stored as stable sets, not display-indexes. */
export interface RangeIdentity {
  /** 선택된 data 행의 stable _ogRowId 집합 (정렬/필터를 넘어 보존). / Stable _ogRowId set of selected data rows (preserved across sort/filter). */
  rowIds: string[];
  /** 선택된 열의 field 집합 (visibleLeaves.field). / Field set of selected columns (visibleLeaves.field). */
  fields: string[];
}

/** FlatRowModel.resolveFlatRow가 반환하는 참조(C0.3). / Reference returned by FlatRowModel.resolveFlatRow (C0.3). */
export interface FlatRowRefLike {
  /** 행 종류. filler엔 writeCell 금지 판별 재료(C0.3). / Row kind. Basis for forbidding writeCell on fillers (C0.3). */
  kind: 'data' | 'group' | 'tree' | 'detailHead' | 'detailFiller';
  /** stable rowId(data/tree 등). / Stable rowId (data/tree, etc.). */
  rowId?: string;
  /** 원본 데이터 배열 인덱스. / Index into the source data array. */
  dataIndex?: number;
  /** 현재 표시(flat) 인덱스. / Current display (flat) index. */
  displayIndex?: number;
}

/**
 * F1이 좌표 해소·재투영을 위해 필요로 하는 최소 계약 모양(C0.3 FlatRowModel + visibleLeaves).
 * 실제 구현(baseline FlatRowModel/ColumnLayout)은 이 형태를 만족하는 어댑터를 배선 단계에서 주입한다.
 * / Minimal contract shape F1 needs for coordinate resolution/reprojection (C0.3 FlatRowModel + visibleLeaves).
 * The real implementation (baseline FlatRowModel/ColumnLayout) injects an adapter satisfying this shape at the
 * wiring stage.
 */
export interface RangeModelHost {
  /** flat/visual 행 총수. / Total flat/visual row count. */
  count(): number;
  /** flat index → 참조(kind/rowId 등). 없으면 kind 판별 불가 상태를 반환해야 함(C0.3). / flat index → reference (kind/rowId, etc.); must return a kind-undeterminable state when absent (C0.3). */
  resolveFlatRow(flatIndex: number): FlatRowRefLike;
  /** stable rowId → 현재 flat index. 없으면(접힘/필터아웃) -1. / stable rowId → current flat index; -1 when absent (collapsed/filtered out). */
  flatIndexOfRowId(rowId: string): number;
  /** flat index → stable rowId (data/tree만, 그 외 null). / flat index → stable rowId (data/tree only, else null). */
  rowIdOfFlat(flatIndex: number): string | null;
  /** 현재 visibleLeaves의 field 목록(순서=ci). / Current visibleLeaves field list (order = ci). */
  visibleFields(): string[];
}

/** 채우기 프리뷰(핸들 드래그 중) — 커밋 전 임시 상태 자료(§2.2 FillPreview). / Fill preview (during handle drag) — transient pre-commit state (§2.2 FillPreview). */
export interface FillPreview {
  /** 소스 셀 범위. / Source cell range. */
  source: CellRange;
  /** 타깃 셀 범위. / Target cell range. */
  target: CellRange;
  /** 채우기 축/방향. / Fill axis/direction. */
  axis: FillAxis;
  /** 채우기 모드. / Fill mode. */
  mode: FillMode;
}
