// ============================================================
// DD-08 §2.5 — 구조편집 참조 재작성 (REQ-T8-804/805)
// 레이어: Algorithm (헤드리스, 순수·결정론 — 그리드 렌더 무의존)
// 설계 SSOT: DD-08 §2.5, §3.3 — 현 RecalcCoordinator._shiftAst(fill 전용·private)를 공개
//   순수 `ReferenceRewriter` 로 승격. StructuralEdit 6종 수용. 대상 소멸 참조 → #REF 정직 전환.
//
// ⚠️ stable-id 모델 주(설계 §5): 이 코어의 단일 참조는 rowId 앵커(abs)라 **다른 행의 삽입/삭제/
//   이동으로는 흔들리지 않는다**(stable-id 앵커의 목적). 따라서 rewriter 의 실질 역할은
//   ①삭제된 행/열에 걸린 참조 → #REF 정직 전환, ②상대(rel) 참조의 dRow 시프트(삽입/삭제가
//   host↔target 사이에 낄 때) 다. abs 참조는 대상이 삭제되지 않는 한 불변(rowId 유효 유지).
// additive: 신설. 기존 코어 무수정. host 는 **편집 전(pre-edit)** 좌표 매핑을 반영해야 한다.
// ============================================================

import type { AstNode, CanonicalRef, FormulaGridAccessor } from './types.js';

/** 구조편집 종류(행/열 삽입·삭제·이동, §2.5). / Structural edit kinds (row/col insert/delete/move, §2.5). */
export type StructuralEdit =
  | { op: 'insertRows'; at: number; count: number }
  | { op: 'deleteRows'; at: number; count: number }
  | { op: 'moveRows'; from: number; to: number; count: number }
  | { op: 'insertCols'; at: number; count: number }
  | { op: 'deleteCols'; at: number; count: number }
  | { op: 'moveCols'; from: number; to: number; count: number };

/** #REF 전환된 참조 1건(원문·사유, §2.5). / One reference turned into #REF (source + reason, §2.5). */
export interface BrokenRef {
  /** 사유(삭제된 행/열). / Reason (deleted row/col). */
  readonly reason: 'row-deleted' | 'col-deleted';
  /** 사람이 읽을 참조 요약(rowId/field). / Human-readable ref summary. */
  readonly ref: string;
}

/** 재작성 리포트(§2.5). / Rewrite report (§2.5). */
export interface RewriteReport {
  /** 시프트된(dRow 변경) 참조 수. / Count of shifted (dRow-changed) references. */
  readonly rewritten: number;
  /** #REF 전환된 참조. / References turned into #REF. */
  readonly broken: BrokenRef[];
  /** 변경 없는 참조 수. / Count of unchanged references. */
  readonly unchanged: number;
}

/** AST 순수 변환기(§2.5). / Pure AST transformer (§2.5). */
export interface ReferenceRewriter {
  /** 단일 AST 재작성. 대상 소멸 참조는 { t:'error', code:'#REF' } 로 전환(REQ-T8-805). / Rewrite a single AST; dead refs → #REF. */
  rewrite(ast: AstNode, host: { rowId: string; field: string }, edit: StructuralEdit): AstNode;
  /** 직전 rewrite 의 리포트(undo·사유 표기용). / Report of the most recent rewrite (for undo/reason surfacing). */
  lastReport(): RewriteReport;
}

/** 위치 시프트 결과: 새 인덱스 또는 삭제됨. / Position shift result: new index, or deleted. */
type Shifted = number | 'deleted';

/** 행/열 편집에 따른 인덱스 p 의 시프트(삽입/삭제만; 이동은 abs 안정이라 불변 취급). */
function shiftLinearIndex(p: number, at: number, count: number, kind: 'insert' | 'delete'): Shifted {
  if (kind === 'insert') {
    return p >= at ? p + count : p;
  }
  // delete
  if (p >= at && p < at + count) return 'deleted';
  return p >= at + count ? p - count : p;
}

/**
 * `ReferenceRewriter` 기본 구현. host 좌표(pre-edit)로 참조를 해소해 삭제/시프트를 판정한다.
 * / Default `ReferenceRewriter`. Resolves refs against pre-edit host coordinates to decide
 *   deletion/shift.
 *
 * @example
 * const rw = new AstReferenceRewriter(accessor);
 * const ast2 = rw.rewrite(ast, { rowId: 'r5', field: 'total' }, { op: 'deleteRows', at: 2, count: 1 });
 * rw.lastReport(); // { rewritten, broken: [{reason:'row-deleted',…}], unchanged }
 */
export class AstReferenceRewriter implements ReferenceRewriter {
  private _rewritten = 0;
  private _broken: BrokenRef[] = [];
  private _unchanged = 0;

  constructor(private readonly _accessor: FormulaGridAccessor) {}

  rewrite(ast: AstNode, host: { rowId: string; field: string }, edit: StructuralEdit): AstNode {
    this._rewritten = 0;
    this._broken = [];
    this._unchanged = 0;
    return this._walk(ast, host, edit);
  }

  lastReport(): RewriteReport {
    return { rewritten: this._rewritten, broken: this._broken, unchanged: this._unchanged };
  }

  private _walk(node: AstNode, host: { rowId: string; field: string }, edit: StructuralEdit): AstNode {
    switch (node.t) {
      case 'ref': {
        const r = this._rewriteRef(node.ref, host, edit);
        if (r === 'deleted') return { t: 'error', code: '#REF' };
        return r === node.ref ? node : { t: 'ref', ref: r };
      }
      case 'range': {
        const a = this._rewriteRef(node.ref.a, host, edit);
        const b = this._rewriteRef(node.ref.b, host, edit);
        if (a === 'deleted' || b === 'deleted') return { t: 'error', code: '#REF' };
        if (a === node.ref.a && b === node.ref.b) return node;
        return { t: 'range', ref: { a, b } };
      }
      case 'call':
        return { t: 'call', name: node.name, args: node.args.map((x) => this._walk(x, host, edit)) };
      case 'unary':
        return { t: 'unary', op: node.op, arg: this._walk(node.arg, host, edit) };
      case 'bin':
        return { t: 'bin', op: node.op, left: this._walk(node.left, host, edit), right: this._walk(node.right, host, edit) };
      default:
        return node;
    }
  }

  /** 단일 참조 재작성. 'deleted' 반환 시 #REF. 불변이면 원 참조 객체를 그대로 반환(구조 공유). */
  private _rewriteRef(ref: CanonicalRef, host: { rowId: string; field: string }, edit: StructuralEdit): CanonicalRef | 'deleted' {
    // ── 열 편집 ──
    if (edit.op === 'deleteCols') {
      const colPos = this._accessor.visibleFields().indexOf(ref.field);
      if (colPos !== -1 && colPos >= edit.at && colPos < edit.at + edit.count) {
        this._broken.push({ reason: 'col-deleted', ref: this._refLabel(ref) });
        return 'deleted';
      }
      this._unchanged++;
      return ref;
    }
    if (edit.op === 'insertCols' || edit.op === 'moveCols') {
      // 명명 field 앵커 — 열 삽입/이동은 field 명을 바꾸지 않음(불변). / Named-field anchor — unchanged.
      this._unchanged++;
      return ref;
    }

    // ── 행 편집 ──
    if (edit.op === 'moveRows') {
      // abs 는 rowId 앵커라 이동해도 유효(불변). rel 시프트는 MVP 범위 밖(문서화된 한계). / abs stable; rel unchanged (documented limit).
      this._unchanged++;
      return ref;
    }

    const kind: 'insert' | 'delete' = edit.op === 'insertRows' ? 'insert' : 'delete';

    if (ref.kind === 'abs') {
      // rowId 앵커: 대상 행이 삭제 범위에 걸리면 #REF, 그 외에는 불변(삽입/시프트 무영향). / rowId anchor.
      const rowPos = this._accessor.flatIndexOfRowId(ref.rowId);
      if (rowPos === -1) { this._unchanged++; return ref; } // 이미 부재 → eval 시 자연 #REF(여기선 손대지 않음)
      const s = shiftLinearIndex(rowPos, edit.at, edit.count, kind);
      if (s === 'deleted') {
        this._broken.push({ reason: 'row-deleted', ref: this._refLabel(ref) });
        return 'deleted';
      }
      this._unchanged++;
      return ref;
    }

    // rel: host↔target 사이에 삽입/삭제가 끼면 dRow 시프트. 대상/호스트가 삭제되면 #REF.
    const hostFlat = this._accessor.flatIndexOfRowId(host.rowId);
    if (hostFlat === -1) { this._unchanged++; return ref; }
    const targetPos = hostFlat + ref.dRow;
    const st = shiftLinearIndex(targetPos, edit.at, edit.count, kind);
    const sh = shiftLinearIndex(hostFlat, edit.at, edit.count, kind);
    if (st === 'deleted' || sh === 'deleted') {
      this._broken.push({ reason: 'row-deleted', ref: this._refLabel(ref) });
      return 'deleted';
    }
    const newDRow = st - sh;
    if (newDRow === ref.dRow) { this._unchanged++; return ref; }
    this._rewritten++;
    return { ...ref, dRow: newDRow };
  }

  private _refLabel(ref: CanonicalRef): string {
    return ref.kind === 'abs' ? `${ref.rowId}:${ref.field}` : `rel(${ref.dRow}):${ref.field}`;
  }
}
