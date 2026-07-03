// ============================================================
// normalizeRefs — A1 원시 참조 → Canonical Ref 정규화 파이프라인
// 레이어: Algorithm
// 계약 참조: 11_design_F3_v2.md §3.1(visibleLeaves 열 매핑, C1)·§3.3(정규화 파이프라인)·
//           §3.2(stable-id 기본 앵커, refMode)·§9 E6(범위 역순 정규화)
//           15_cross_contracts.md C0.3(FlatRowModel 경유, kind!=='data'→#REF)·C1
//
// 커밋 시점(setCellFormula) 1회 수행. 이후 저장은 rowId/field 기반이라 정렬/필터에
// 흔들리지 않는다(단일 참조). 범위 멤버십만 evaluate-time(§FormulaEvaluator)에 다시 해소.
// ============================================================

import type { AstNode, CanonicalRef, FormulaGridAccessor, RawCellRefNode, RefMode } from './types.js';

/** 열문자(A,B,...,Z,AA,...) → 0-based visibleLeaves 인덱스. */
export function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64); // 'A'=1
  }
  return n - 1;
}

/** 0-based visibleLeaves 인덱스 → 열문자(A,B,...,Z,AA,...). offsetFormula/serializeFormula 재사용. */
export function indexToColLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || 'A';
}

interface NormalizeCtx {
  host: { rowId: string; field: string };
  accessor: FormulaGridAccessor;
  refMode: RefMode;
}

function normalizeSingleRef(raw: RawCellRefNode, ctx: NormalizeCtx): CanonicalRef | null {
  const { accessor, host, refMode } = ctx;
  const colIdx = colLettersToIndex(raw.colLetters);
  const visibleFields = accessor.visibleFields();
  const field = visibleFields[colIdx];
  if (field === undefined) return null; // 존재하지 않는 열 → 호출부에서 #REF 처리

  const flatIndex = raw.row - 1; // rowNumber(1-based) → flat index(0-based, §3.1)
  const rowId = accessor.rowIdAtFlat(flatIndex);
  if (rowId === null) return null; // non-data kind 또는 범위 밖 → #REF (C0.3)

  // 정규화 정책(§3.2): 기본(stable)은 바레 A1 도 abs 로 정규화. relative 모드에서 '$' 없는
  // 축만 상대(dRow)로 저장한다(행만 상대 오프셋 대상 — 열은 field 로 이미 안정적 앵커됨).
  if (refMode === 'relative' && !raw.dollarRow) {
    const hostFlat = accessor.flatIndexOfRowId(host.rowId);
    const dRow = hostFlat === -1 ? 0 : flatIndex - hostFlat;
    return { kind: 'rel', dRow, field, dollarRow: raw.dollarRow, dollarCol: raw.dollarCol };
  }

  return { kind: 'abs', rowId, field, dollarRow: raw.dollarRow, dollarCol: raw.dollarCol };
}

/**
 * 파서가 만든 원시 AST(rawRef/rawRange 포함)를 정규화해 ref/range/error 노드로 치환한다.
 * host = 이 수식이 저장된 셀(현재 행 컨텍스트, FieldRef·상대참조 기준점).
 */
export function normalizeAst(ast: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor, refMode: RefMode = 'stable'): AstNode {
  const ctx: NormalizeCtx = { host, accessor, refMode };

  function walk(node: AstNode): AstNode {
    switch (node.t) {
      case 'rawRef': {
        const ref = normalizeSingleRef(node, ctx);
        if (!ref) return { t: 'error', code: '#REF' };
        return { t: 'ref', ref };
      }
      case 'rawRange': {
        const a = normalizeSingleRef(node.a, ctx);
        const b = normalizeSingleRef(node.b, ctx);
        if (!a || !b) return { t: 'error', code: '#REF' };
        return { t: 'range', ref: { a, b } };
      }
      case 'call':
        return { t: 'call', name: node.name, args: node.args.map(walk) };
      case 'unary':
        return { t: 'unary', op: node.op, arg: walk(node.arg) };
      case 'bin':
        return { t: 'bin', op: node.op, left: walk(node.left), right: walk(node.right) };
      default:
        return node; // num/str/bool/field/error/ref/range — 이미 정규화 완료 또는 리프
    }
  }

  return walk(ast);
}

/** 이 AST가 범위 참조를 포함하는지(§3.5 hasRangeRef, applySort/applyFilter dirty 대상). */
export function computeHasRangeRef(ast: AstNode): boolean {
  switch (ast.t) {
    case 'range':
      return true;
    case 'call':
      return ast.args.some(computeHasRangeRef);
    case 'unary':
      return computeHasRangeRef(ast.arg);
    case 'bin':
      return computeHasRangeRef(ast.left) || computeHasRangeRef(ast.right);
    default:
      return false;
  }
}
