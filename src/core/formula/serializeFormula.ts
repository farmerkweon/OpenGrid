// ============================================================
// serializeFormula — 정규화된 AST → A1 표기 원문 문자열 (offsetFormula 전용 보조)
// 레이어: Algorithm
// 계약 참조: 11_design_F3_v2.md §4.3(편집 시 "원문" 표시는 src 필드가 담당 — 이 직렬화는
//           offsetFormula(§8.2/C3)가 "새 수식 원문"을 만들 때만 쓰는 내부 유틸이다).
// ============================================================

import type { AstNode, CanonicalRef, FormulaGridAccessor } from './types.js';
import { indexToColLetters } from './normalizeRefs.js';

function refToA1(ref: CanonicalRef, host: { rowId: string; field: string }, accessor: FormulaGridAccessor): string {
  let rowId: string | null;
  if (ref.kind === 'abs') {
    rowId = ref.rowId;
  } else {
    const hostFlat = accessor.flatIndexOfRowId(host.rowId);
    rowId = hostFlat === -1 ? null : accessor.rowIdAtFlat(hostFlat + ref.dRow);
  }
  if (rowId === null || !accessor.hasRow(rowId) || !accessor.hasField(ref.field)) return '#REF!';

  const flat = accessor.flatIndexOfRowId(rowId);
  const colIdx = accessor.visibleFields().indexOf(ref.field);
  if (flat === -1 || colIdx === -1) return '#REF!';

  const colTxt = (ref.dollarCol ? '$' : '') + indexToColLetters(colIdx);
  const rowTxt = (ref.dollarRow ? '$' : '') + (flat + 1);
  return colTxt + rowTxt;
}

function escapeStringLit(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

const BIN_TEXT: Record<string, string> = {
  '+': '+', '-': '-', '*': '*', '/': '/', '%': '%', '^': '^', '&': '&',
  '=': '=', '<>': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
};

/**
 * 정규화 AST를 다시 "=..." 형태의 A1 원문으로 직렬화한다(offsetFormula 결과물 조립용).
 * / Serialize a normalized AST back into "=..." A1 source text (used to assemble
 *   offsetFormula results; see §4.3 / §8.2 / C3).
 *
 * @param ast - 직렬화할 정규화 AST / Normalized AST to serialize
 * @param host - 상대참조 기준점이 되는 호스트 셀(rowId·field) / Host cell (rowId, field) anchoring relative refs
 * @param accessor - 그리드 좌표/값 접근자 / Grid coordinate/value accessor
 * @returns "=" 로 시작하는 A1 원문 문자열 / A1 source string prefixed with "="
 */
export function astToSource(ast: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor): string {
  return '=' + render(ast, host, accessor);
}

function render(node: AstNode, host: { rowId: string; field: string }, accessor: FormulaGridAccessor): string {
  switch (node.t) {
    case 'num': return node.v;
    case 'str': return escapeStringLit(node.v);
    case 'bool': return node.v ? 'TRUE' : 'FALSE';
    case 'field': return `[${node.field}]`;
    case 'error': return '#REF!';
    case 'ref': return refToA1(node.ref, host, accessor);
    case 'range':
      return `${refToA1(node.ref.a, host, accessor)}:${refToA1(node.ref.b, host, accessor)}`;
    case 'call':
      return `${node.name}(${node.args.map((a) => render(a, host, accessor)).join(',')})`;
    case 'unary':
      return `${node.op}${render(node.arg, host, accessor)}`;
    case 'bin':
      // MVP 단순화: 이항식은 항상 괄호로 감싼다(연산자 우선순위 유실 방지). 결과는 항상
      // 의미상 원문과 동일하게 재파싱 가능하며, 가독성만 약간 낮아진다(offsetFormula 전용
      // 내부 직렬화라 편집기 표시용 src 는 그대로 원문을 보존하므로 실사용 영향 없음).
      return `(${render(node.left, host, accessor)}${BIN_TEXT[node.op]}${render(node.right, host, accessor)})`;
    // rawRef/rawRange 는 정규화 이전 노드라 여기 도달하면 안 됨(방어적 처리).
    default:
      return '#REF!';
  }
}
