// ============================================================
// F3 수식 셀 — 공통 타입 (헤드리스, DOM/OpenGrid 비의존)
// 레이어: Algorithm
// 계약 참조: docs/design/grid-features-2026-07/11_design_F3_v2.md §2~§6, §3.4
//           docs/design/grid-features-2026-07/15_cross_contracts.md C0(FlatRowModel 경유)·
//           C0.5(stable-id 앵커)·C1(A1=visibleLeaves)·C2(배치 재계산)·C3(offsetFormula)·
//           C7(셀>컬럼 우선순위)·C10 R-NONNUMERIC(#VALUE)·C11(에러 집계 제외·근사·로케일)
//
// ⚠️ 이 모듈은 신규(src/core/formula/) 이며 기존 OpenGrid.ts/types.ts/DataLayer.ts 등은
//    수정하지 않는다. 그리드/DataLayer 와의 배선은 후속 태스크가 담당하며, 이 모듈은
//    아래 FormulaGridAccessor 인터페이스로만 "외부 세계"(grid)를 본다(의존성 역전).
// ============================================================

import type { OGDecimal } from '../OGDecimal.js';

// ── Cell Key (§2.1 "Cell Key") ──────────────────────────────
// ⚠️ 표기 결정: 설계서 §2.1 은 `${rowId} ${field}`(공백 구분)를 예시로 들지만,
//    이 태스크 지시는 Spike-A(spikes/spike-a-recalc/recalc-bench.mjs)와 동일한
//    자료구조 철학을 명시적으로 요구하며 키 포맷을 `${rowId}:${field}`(콜론)로 지정했다.
//    내부 전용 키 포맷이라 의미상 동등하고 충돌 없음 — 콜론 포맷을 채택한다.
/** 셀 키 문자열 `${rowId}:${field}`(내부 전용 포맷). / Cell key string `${rowId}:${field}` (internal format). */
export type CellKey = string; // `${rowId}:${field}`

/**
 * rowId·field 로 셀 키를 만든다. / Build a cell key from rowId and field.
 *
 * @param rowId - 행 stable id / Row stable id
 * @param field - 컬럼 field 명 / Column field name
 * @returns `${rowId}:${field}` 형태의 키 / A `${rowId}:${field}` key
 */
export function cellKey(rowId: string, field: string): CellKey {
  return `${rowId}:${field}`;
}

/**
 * 셀 키를 rowId·field 로 분해한다. / Split a cell key back into rowId and field.
 *
 * @param key - 셀 키 문자열 / Cell key string
 * @returns { rowId, field }
 */
export function parseCellKey(key: CellKey): { rowId: string; field: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { rowId: key, field: '' };
  return { rowId: key.slice(0, idx), field: key.slice(idx + 1) };
}

// ── 에러 분류 (§6, C10 R-NONNUMERIC) ────────────────────────
/**
 * 수식 에러 코드. / Formula error code.
 *
 * `#ERR`(일반), `#REF`(참조 무효), `#CYCLE`(순환), `#DIV0`(0 나눗셈), `#NAME`(미정의 이름),
 * `#VALUE`(비수치), `#NUM`(수치 범위).
 * / `#ERR` (general), `#REF` (invalid ref), `#CYCLE` (cyclic), `#DIV0` (divide by zero),
 * `#NAME` (undefined name), `#VALUE` (non-numeric), `#NUM` (numeric range).
 */
export type FormulaErrorCode = '#ERR' | '#REF' | '#CYCLE' | '#DIV0' | '#NAME' | '#VALUE' | '#NUM';

/** 전체 에러 코드 집합(런타임 판별용). / Set of all error codes (for runtime checks). */
export const FORMULA_ERROR_CODES: ReadonlySet<string> = new Set([
  '#ERR', '#REF', '#CYCLE', '#DIV0', '#NAME', '#VALUE', '#NUM',
]);

/**
 * 값이 이미 다른 수식의 에러 결과(문자열)인지 판별 — 에러 전파용. / Detect whether a value is already another formula's error result (string) — for error propagation.
 *
 * @param v - 검사할 값 / Value to inspect
 * @returns 에러 코드 또는 null / The error code, or null
 */
export function isErrorToken(v: unknown): FormulaErrorCode | null {
  if (typeof v === 'string' && FORMULA_ERROR_CODES.has(v)) return v as FormulaErrorCode;
  return null;
}

// ── 계산값 (§3.4 FormulaCell.value) ─────────────────────────
/** 수식 셀의 계산 결과 값 타입. / Computed result value type of a formula cell. */
export type CellValue = OGDecimal | string | boolean | null;

// ── 참조 정규화 정책 (§2.3, §8.1 formula.refMode) ───────────
/** 참조 정규화 모드: 'stable'(rowId 앵커) | 'relative'(행 오프셋). / Reference normalization mode: 'stable' (rowId anchor) | 'relative' (row offset). */
export type RefMode = 'stable' | 'relative';

// ── Canonical Ref (§3.4, v1 보존 + dollarRow/dollarCol 플래그 확장) ──
// dollarRow/dollarCol 은 offsetFormula(C3)가 "상대 ref만 오프셋"하기 위한 근거다.
// kind:'abs' 라도 원문에 '$'가 없었으면(기본 refMode='stable'이 바레 A1도 abs로
// 정규화하므로) dollarRow/dollarCol=false 로 남겨, fill 오프셋 시 이동 대상임을 구분한다.
/** 정규화된 절대 참조(rowId 앵커). / Normalized absolute reference (rowId anchor). */
export interface CanonicalAbsRef {
  kind: 'abs';
  /** 앵커 행 stable id. / Anchor row stable id. */
  rowId: string;
  /** 컬럼 field 명. / Column field name. */
  field: string;
  /** 원문에 '$' 행 고정이 있었는지. / Whether the source had a '$' row lock. */
  dollarRow: boolean;
  /** 원문에 '$' 열 고정이 있었는지. / Whether the source had a '$' column lock. */
  dollarCol: boolean;
}
/** 정규화된 상대 참조(행 오프셋). / Normalized relative reference (row offset). */
export interface CanonicalRelRef {
  kind: 'rel';
  /** 현재 셀 기준 행 오프셋 (refMode:'relative' 전용, §2.3). / Row offset from the current cell (refMode:'relative' only, §2.3). */
  dRow: number;
  /** 컬럼 field 명. / Column field name. */
  field: string;
  /** rel 인데 dollarRow=true 인 경우는 없음(구조상 dollarRow=true 면 abs). / Never true for rel (a '$' row lock structurally implies abs). */
  dollarRow: boolean;
  /** 열 고정 여부. / Whether the column is locked. */
  dollarCol: boolean;
}
/** 정규화된 단일 참조(절대 | 상대). / Normalized single reference (absolute | relative). */
export type CanonicalRef = CanonicalAbsRef | CanonicalRelRef;

/** 정규화된 범위 참조(두 코너). / Normalized range reference (two corners). */
export interface CanonicalRangeRef {
  /** 코너1 (원문 좌측/상단 그대로, 정렬은 evaluate-time §3.5). / Corner 1 (kept as source left/top; ordering happens at evaluate-time §3.5). */
  a: CanonicalRef;
  /** 코너2. / Corner 2. */
  b: CanonicalRef;
}

// ── AST (파서 원시 노드 + 정규화 후 노드를 한 유니온에 공존) ──
// 원시(raw) 참조 노드는 파서가 만들고, normalizeRefs()가 'ref'/'range'/'error' 로 치환한다.
/** 파서 원시 셀 참조 노드(정규화 전). / Raw parser cell-reference node (pre-normalization). */
export interface RawCellRefNode {
  t: 'rawRef';
  /** A1 열문자. / A1 column letters. */
  colLetters: string;
  /** 1-based 행 번호. / 1-based row number. */
  row: number;
  /** 열 '$' 고정. / Column '$' lock. */
  dollarCol: boolean;
  /** 행 '$' 고정. / Row '$' lock. */
  dollarRow: boolean;
}
/** 파서 원시 범위 참조 노드(정규화 전). / Raw parser range-reference node (pre-normalization). */
export interface RawRangeRefNode {
  t: 'rawRange';
  a: RawCellRefNode;
  b: RawCellRefNode;
}

/** 수식 이항 연산자. / Formula binary operator. */
export type BinOp = '+' | '-' | '*' | '/' | '%' | '^' | '&' | '=' | '<>' | '<' | '<=' | '>' | '>=';

/** 수식 AST 노드(원시 참조 + 정규화 후 노드 공존 유니온). / Formula AST node (union of raw refs and normalized nodes). */
export type AstNode =
  | { t: 'num'; v: string }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'field'; field: string }
  | RawCellRefNode
  | RawRangeRefNode
  | { t: 'ref'; ref: CanonicalRef }            // 정규화 후 단일 참조
  | { t: 'range'; ref: CanonicalRangeRef }      // 정규화 후 범위 참조
  | { t: 'error'; code: FormulaErrorCode }      // 정규화 시점에 이미 확정된 에러(예: 존재하지 않는 열/행)
  | { t: 'call'; name: string; args: AstNode[] }
  | { t: 'unary'; op: '+' | '-'; arg: AstNode }
  | { t: 'bin'; op: BinOp; left: AstNode; right: AstNode };

// ── FormulaCell (사이드카 저장 단위, §3.4/§4.1) ─────────────
/** 수식 셀 사이드카 저장 단위(§3.4/§4.1). / Formula-cell sidecar storage unit (§3.4/§4.1). */
export interface FormulaCell {
  /** 원문 "=A1+B2"(편집 표시용, §4.3). / Source text "=A1+B2" (for edit display, §4.3). */
  src: string;
  /** 정규화된 AST. / Normalized AST. */
  ast: AstNode;
  /** 범위 참조 포함 여부 → applySort/applyFilter dirty 대상(§3.5 P0). / Whether a range ref is present → dirtied by applySort/applyFilter (§3.5 P0). */
  hasRangeRef: boolean;
  /** 캐시된 계산 결과. / Cached computed result. */
  value: CellValue;
  /** 에러 코드(없으면 null). / Error code (null if none). */
  error: FormulaErrorCode | null;
  /** 근사(SQRT 등) 포함 여부 → ≈ 표식(C11). / Whether approximation (e.g. SQRT) is involved → ≈ marker (C11). */
  approx?: boolean;
}

// ── 그리드 접근 인터페이스 (주입, C0/C0.3/C1 준수) ──────────
// F3는 이 인터페이스로만 "화면/데이터"를 본다. 실제 구현(FlatRowModel/ColumnLayout/
// DataLayer 경유)은 후속 배선 태스크가 제공한다. 여기서는 계약만 정의한다.
/**
 * 수식 엔진이 그리드/데이터를 보는 유일한 인터페이스(주입, 의존성 역전 C0/C0.3/C1).
 * / The sole interface through which the formula engine views the grid/data (injected, dependency inversion C0/C0.3/C1).
 */
export interface FormulaGridAccessor {
  /** A1 열문자 매핑 기준 — visibleLeaves(숨김 제외) 순서의 field 배열(§3.1/C1). / A1 column-letter basis — field array in visibleLeaves order (hidden excluded) (§3.1/C1). */
  visibleFields(): string[];
  /** flat index(0-based) → rowId. kind!=='data' 이거나 범위 밖이면 null(§C0.3). / flat index (0-based) → rowId; null when kind!=='data' or out of range (§C0.3). */
  rowIdAtFlat(flatIndex: number): string | null;
  /** rowId → 현재 flat index(0-based). 없음/필터아웃/접힘이면 -1. / rowId → current flat index (0-based); -1 when absent/filtered-out/collapsed. */
  flatIndexOfRowId(rowId: string): number;
  /** 현재 표시(필터 통과) 순서의 rowId 배열 — 범위 evaluate-time 멤버십 해소용(§3.5). / rowId array in current display (filtered) order — for evaluate-time range membership (§3.5). */
  displayedRowIds(): string[];
  /** (rowId, field) 셀의 원시 값(비수식, 이미 계산된 값 포함) 조회. / Read the raw value at (rowId, field) (non-formula; includes already-computed values). */
  getCellValue(rowId: string, field: string): unknown;
  /** rowId 존재 여부(행 삭제 감지, F3-R28). / Whether a rowId exists (row-deletion detection, F3-R28). */
  hasRow(rowId: string): boolean;
  /** field 존재 여부(열 삭제 감지, F3-R28). / Whether a field exists (column-deletion detection, F3-R28). */
  hasField(field: string): boolean;
}
