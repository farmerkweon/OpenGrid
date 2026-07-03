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
export type CellKey = string; // `${rowId}:${field}`

export function cellKey(rowId: string, field: string): CellKey {
  return `${rowId}:${field}`;
}

export function parseCellKey(key: CellKey): { rowId: string; field: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { rowId: key, field: '' };
  return { rowId: key.slice(0, idx), field: key.slice(idx + 1) };
}

// ── 에러 분류 (§6, C10 R-NONNUMERIC) ────────────────────────
export type FormulaErrorCode = '#ERR' | '#REF' | '#CYCLE' | '#DIV0' | '#NAME' | '#VALUE' | '#NUM';

export const FORMULA_ERROR_CODES: ReadonlySet<string> = new Set([
  '#ERR', '#REF', '#CYCLE', '#DIV0', '#NAME', '#VALUE', '#NUM',
]);

/** 값이 이미 다른 수식의 에러 결과(문자열)인지 판별 — 에러 전파(§6 EVANS/DEMARCO 규칙)용. */
export function isErrorToken(v: unknown): FormulaErrorCode | null {
  if (typeof v === 'string' && FORMULA_ERROR_CODES.has(v)) return v as FormulaErrorCode;
  return null;
}

// ── 계산값 (§3.4 FormulaCell.value) ─────────────────────────
export type CellValue = OGDecimal | string | boolean | null;

// ── 참조 정규화 정책 (§2.3, §8.1 formula.refMode) ───────────
export type RefMode = 'stable' | 'relative';

// ── Canonical Ref (§3.4, v1 보존 + dollarRow/dollarCol 플래그 확장) ──
// dollarRow/dollarCol 은 offsetFormula(C3)가 "상대 ref만 오프셋"하기 위한 근거다.
// kind:'abs' 라도 원문에 '$'가 없었으면(기본 refMode='stable'이 바레 A1도 abs로
// 정규화하므로) dollarRow/dollarCol=false 로 남겨, fill 오프셋 시 이동 대상임을 구분한다.
export interface CanonicalAbsRef {
  kind: 'abs';
  rowId: string;
  field: string;
  dollarRow: boolean;
  dollarCol: boolean;
}
export interface CanonicalRelRef {
  kind: 'rel';
  dRow: number;      // 현재 셀 기준 행 오프셋 (refMode:'relative' 전용, §2.3)
  field: string;
  dollarRow: boolean; // rel 인데 dollarRow=true 인 경우는 없음(구조상 dollarRow=true 면 abs)
  dollarCol: boolean;
}
export type CanonicalRef = CanonicalAbsRef | CanonicalRelRef;

export interface CanonicalRangeRef {
  a: CanonicalRef; // 코너1 (원문 좌측/상단 그대로, 정렬은 evaluate-time §3.5)
  b: CanonicalRef; // 코너2
}

// ── AST (파서 원시 노드 + 정규화 후 노드를 한 유니온에 공존) ──
// 원시(raw) 참조 노드는 파서가 만들고, normalizeRefs()가 'ref'/'range'/'error' 로 치환한다.
export interface RawCellRefNode {
  t: 'rawRef';
  colLetters: string;
  row: number;          // 1-based
  dollarCol: boolean;
  dollarRow: boolean;
}
export interface RawRangeRefNode {
  t: 'rawRange';
  a: RawCellRefNode;
  b: RawCellRefNode;
}

export type BinOp = '+' | '-' | '*' | '/' | '%' | '^' | '&' | '=' | '<>' | '<' | '<=' | '>' | '>=';

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
export interface FormulaCell {
  src: string;                 // 원문 "=A1+B2" (편집 표시용, §4.3)
  ast: AstNode;                 // 정규화된 AST
  hasRangeRef: boolean;         // 범위 참조 포함 여부 → applySort/applyFilter dirty 대상(§3.5 P0)
  value: CellValue;             // 캐시된 계산 결과
  error: FormulaErrorCode | null;
  approx?: boolean;             // 근사(SQRT 등) 포함 여부 → ≈ 표식(C11/HANMS-17)
}

// ── 그리드 접근 인터페이스 (주입, C0/C0.3/C1 준수) ──────────
// F3는 이 인터페이스로만 "화면/데이터"를 본다. 실제 구현(FlatRowModel/ColumnLayout/
// DataLayer 경유)은 후속 배선 태스크가 제공한다. 여기서는 계약만 정의한다.
export interface FormulaGridAccessor {
  /** A1 열문자 매핑 기준 — visibleLeaves(숨김 제외) 순서의 field 배열(§3.1/C1). */
  visibleFields(): string[];
  /** flat index(0-based) → rowId. kind!=='data' 이거나 범위 밖이면 null(§C0.3). */
  rowIdAtFlat(flatIndex: number): string | null;
  /** rowId → 현재 flat index(0-based). 없음/필터아웃/접힘이면 -1. */
  flatIndexOfRowId(rowId: string): number;
  /** 현재 표시(필터 통과) 순서의 rowId 배열 — 범위 evaluate-time 멤버십 해소용(§3.5). */
  displayedRowIds(): string[];
  /** (rowId, field) 셀의 원시 값(비수식, 이미 계산된 값 포함) 조회. */
  getCellValue(rowId: string, field: string): unknown;
  /** rowId 존재 여부(행 삭제 감지, F3-R28). */
  hasRow(rowId: string): boolean;
  /** field 존재 여부(열 삭제 감지, F3-R28). */
  hasField(field: string): boolean;
}
