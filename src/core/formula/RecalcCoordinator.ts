// ============================================================
// RecalcCoordinator — F3 오케스트레이션: 파싱→정규화→저장→그래프→배치 재계산
// 레이어: Algorithm (헤드리스 — 렌더 프레임과 비결합, §5.5/F3-R23)
// 계약 참조: 11_design_F3_v2.md §5.3(배치 진입점)·§5.6(증분/전체)·§8.2(공개 API 형태,
//           실제 OpenGrid 배선은 후속 태스크)·§8.5(배선 포인트 목록)
//           15_cross_contracts.md C2(배치 1회 재계산, setComputedValue per-cell dataChange
//           미발화)·C3(offsetFormula)·C7(셀>컬럼 우선순위는 이 모듈이 아니라 렌더 경로 몫)
//
// 이 클래스는 DOM/OpenGrid 를 전혀 모른다. 그리드는 다음을 주입해야 한다:
//   - FormulaGridAccessor(visibleFields/rowIdAtFlat/flatIndexOfRowId/displayedRowIds/
//     getCellValue/hasRow/hasField) — FlatRowModel·ColumnLayout·DataLayer 경유 구현은 후속 배선.
//   - setComputedValue(rowId, field, value) 콜백 — DataLayer.setComputedValue 상당(§4.2,
//     per-cell dataChange 미발화·edited 미오염 준수는 "콜백 내부"에서 그리드가 보장해야 함).
//   - (선택) onFormulaError(rowId, field, error) 콜백 — §8.3 formulaError 이벤트 재료.
// ============================================================

import type {
  CanonicalRef, CellKey, CellValue, FormulaCell, FormulaErrorCode, FormulaGridAccessor, RefMode,
} from './types.js';
import { cellKey, parseCellKey } from './types.js';
import { parseFormula } from './FormulaParser.js';
import { normalizeAst, computeHasRangeRef, indexToColLetters } from './normalizeRefs.js';
import { evaluate } from './FormulaEvaluator.js';
import { FormulaStore } from './FormulaStore.js';
import { FormulaGraph } from './FormulaGraph.js';
import { astToSource } from './serializeFormula.js';

export interface RecalcSummary {
  changed: CellKey[];
  cycles: number;
  ms: number;
}

export interface RecalcCoordinatorOptions {
  accessor: FormulaGridAccessor;
  setComputedValue: (rowId: string, field: string, value: CellValue) => void;
  onFormulaError?: (rowId: string, field: string, error: FormulaErrorCode) => void;
  refMode?: RefMode;              // §8.1 formula.refMode, 기본 'stable'(§3.2)
  divisionPrecision?: number;     // §8.1 formula.divisionPrecision, 기본 30
}

export class RecalcCoordinator {
  readonly store = new FormulaStore();
  readonly graph = new FormulaGraph();

  private readonly _accessor: FormulaGridAccessor;
  private readonly _setComputedValue: (rowId: string, field: string, value: CellValue) => void;
  private readonly _onFormulaError: ((rowId: string, field: string, error: FormulaErrorCode) => void) | undefined;
  private readonly _refMode: RefMode;
  private readonly _prec: number;

  constructor(opts: RecalcCoordinatorOptions) {
    this._accessor = opts.accessor;
    this._setComputedValue = opts.setComputedValue;
    this._onFormulaError = opts.onFormulaError;
    this._refMode = opts.refMode ?? 'stable';
    this._prec = opts.divisionPrecision ?? 30;
  }

  // ── 컴파일(파싱+정규화) — setCellFormula 내부 및 단독 검증용 ──

  /** src("=...")를 파싱+정규화한다. 파싱 자체가 실패하면 #ERR/#NAME 을 담은 error AST로 폴백. */
  compile(src: string, host: { rowId: string; field: string }): { ast: FormulaCell['ast']; hasRangeRef: boolean } {
    let ast;
    try {
      ast = parseFormula(src);
    } catch {
      ast = { t: 'error' as const, code: '#ERR' as const };
    }
    const normalized = normalizeAst(ast, host, this._accessor, this._refMode);
    return { ast: normalized, hasRangeRef: computeHasRangeRef(normalized) };
  }

  // ── CRUD (§8.2 상당) ─────────────────────────────────────

  /**
   * setCellFormula(§8.2) — 저장 후 즉시 평가하고, 기존 dependents 가 있으면 함께 dirty 처리.
   *
   * ⚠️ 순서가 중요하다(사이클 탐지 정합성): 새 수식을 등록하는 바로 그 순간에 사이클이
   * "완성"될 수 있다(예: A1=B1 이미 있고 지금 B1=A1 을 등록). onValuesChanged 의
   * topoOrder 는 "그래프에 현재 등록된 엣지"만으로 사이클을 판정하므로, 이 새 수식의
   * deps 를 그래프에 등록하기 *전에* 배치를 돌리면 방금 완성된 사이클을 놓친다.
   * 그래서 여기서 먼저 1회 "탐색 평가"(probe)로 실제 deps 를 얻어 그래프 엣지를 확정한
   * 뒤에야 onValuesChanged(공식 배치, 사이클이면 evaluate 재호출 없이 #CYCLE 로 귀결)를
   * 호출한다. 신규 수식 등록 1회당 evaluate 호출이 최대 2회(probe+공식)로 늘지만, 이는
   * "정의 시점" 1회성 비용이며 F3-R21 이 요구하는 "값 편집에 따른 증분 재계산"(steady
   * state)과는 무관하다(§13 f3.perf.closure 는 신규 등록이 아니라 leaf 값 변경 시나리오).
   */
  setCellFormula(rowId: string, field: string, src: string): RecalcSummary {
    const host = { rowId, field };
    const { ast, hasRangeRef } = this.compile(src, host);
    const cell: FormulaCell = { src, ast, hasRangeRef, value: null, error: null };
    this.store.setFormula(rowId, field, cell);
    const key = cellKey(rowId, field);

    const probe = evaluate(ast, host, this._accessor, { divisionPrecision: this._prec });
    this.graph.addFormula(key, probe.touched);

    return this.onValuesChanged([key]);
  }

  getCellFormula(rowId: string, field: string): string | null {
    return this.store.getFormula(rowId, field)?.src ?? null;
  }

  hasCellFormula(rowId: string, field: string): boolean {
    return this.store.hasFormula(rowId, field);
  }

  /** clearCellFormula(§8.2) — 사이드카+그래프에서 제거. 값(row[field])은 그리드 쪽 책임(값 유지). */
  clearCellFormula(rowId: string, field: string): CellKey[] {
    const key = cellKey(rowId, field);
    const dependents = this.graph.getDependents(key);
    this.store.clearFormula(rowId, field);
    this.graph.removeFormula(key);
    return dependents;
  }

  getCellError(rowId: string, field: string): FormulaErrorCode | null {
    return this.store.getFormula(rowId, field)?.error ?? null;
  }

  /** 디버깅용(§8.2 getDependents) — flat 좌표가 아닌 (rowId,field) 그대로 반환(헤드리스 계층). */
  getDependents(rowId: string, field: string): Array<{ rowId: string; field: string }> {
    return this.graph.getDependents(cellKey(rowId, field)).map(parseCellKey);
  }

  // ── 재계산 (§5.3 배치 진입점, C2) ────────────────────────

  /**
   * C2 배치 진입점: keys(값이 바뀐 leaf 셀 또는 재평가가 필요한 수식 셀)로부터 dependents
   * 폐포를 구해 Kahn 위상 1패스로 재계산한다. 삭제 무효화(F3-R28)는 별도 특수 로직 없이,
   * 호출부가 "삭제된 rowId/field 를 이미 grid 에서 제거한 뒤" 그 dependents 를 keys 로
   * 넘기면 evaluate 과정에서 accessor.hasRow/hasField 가 false → 자연스럽게 #REF.
   */
  onValuesChanged(keys: CellKey[]): RecalcSummary {
    const t0 = _now();
    const dirty = this.graph.getDependentsClosure(keys);
    const { order, cycles } = this.graph.topoOrder(dirty);

    for (const key of cycles) {
      const { rowId, field } = parseCellKey(key);
      const cell = this.store.getFormula(rowId, field);
      if (cell) { cell.value = '#CYCLE'; cell.error = '#CYCLE'; }
      this._setComputedValue(rowId, field, '#CYCLE');
      this._onFormulaError?.(rowId, field, '#CYCLE');
    }

    for (const key of order) {
      this._evaluateOne(key);
    }

    return { changed: [...order, ...cycles], cycles: cycles.length, ms: _now() - t0 };
  }

  private _evaluateOne(key: CellKey): void {
    const { rowId, field } = parseCellKey(key);
    const cell = this.store.getFormula(rowId, field);
    if (!cell) return; // 방어적: dirty 집합엔 수식 키만 있어야 하지만 방어적으로 skip.

    const outcome = evaluate(cell.ast, { rowId, field }, this._accessor, { divisionPrecision: this._prec });
    // 동적 의존성 재등록(모듈 상단 주석 참조) — 범위 멤버십 변화도 다음 평가에 반영.
    this.graph.addFormula(key, outcome.touched);

    cell.value = outcome.value;
    cell.error = outcome.error;
    cell.approx = outcome.approx;

    this._setComputedValue(rowId, field, outcome.value);
    if (outcome.error) this._onFormulaError?.(rowId, field, outcome.error);
  }

  /** recalculate()(§8.2) — 전체 수식 노드 위상정렬 후 평가(setData/컬럼 변경 등). */
  recalculateAll(): RecalcSummary {
    const t0 = _now();
    const all = this.graph.allFormulaKeys();
    const { order, cycles } = this.graph.topoOrder(all);
    for (const key of cycles) {
      const { rowId, field } = parseCellKey(key);
      const cell = this.store.getFormula(rowId, field);
      if (cell) { cell.value = '#CYCLE'; cell.error = '#CYCLE'; }
      this._setComputedValue(rowId, field, '#CYCLE');
      this._onFormulaError?.(rowId, field, '#CYCLE');
    }
    for (const key of order) this._evaluateOne(key);
    return { changed: [...order, ...cycles], cycles: cycles.length, ms: _now() - t0 };
  }

  /** applySort/applyFilter 후크가 호출할 편의 메서드 — range 보유 수식 전부 dirty(§3.5 P0). */
  recalcRangeBearing(): RecalcSummary {
    return this.onValuesChanged(this.store.getRangeBearingKeys());
  }

  /** removeRow 후크 편의 메서드 — 이 rowId 를 deps 로 가진 수식들을 재계산(자연 #REF, §5.1). */
  invalidateRow(rowId: string): RecalcSummary {
    return this.onValuesChanged(this.graph.formulasReferencing(rowId));
  }

  /** removeColumn 후크 편의 메서드 — 이 field 를 deps 로 가진 수식들을 재계산(자연 #REF). */
  invalidateField(field: string): RecalcSummary {
    return this.onValuesChanged(this.graph.formulasReferencingField(field));
  }

  // ── offsetFormula (§8.2/C3, F1 fill 전용) ───────────────

  /**
   * srcRowId/srcField 의 저장된 수식에서 "상대(비-$) 축만" dRow/dCol 만큼 오프셋한 새
   * 수식 원문을 만든다. 절대($) 축은 불변(C3). 대상 위치가 범위를 벗어나면 해당 참조는
   * "#REF!" 텍스트로 대체된다(Excel 관례, 이 문자열은 재파싱 시 #NAME 이 아니라 명시적
   * 깨짐을 사용자가 알아볼 수 있게 하기 위한 것 — 실제 파서가 #REF! 토큰 자체를 정식
   * 문법으로 지원하진 않으므로, F1 배선 시 이 반환값을 그대로 setCellFormula 에 넘기면
   * 파싱 실패 → #ERR 로 귀결한다는 점을 후속 배선 태스크가 인지해야 한다).
   */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    const src = this.store.getFormula(srcRowId, srcField);
    if (!src) return '';

    const targetHostRowId = (() => {
      const flat = this._accessor.flatIndexOfRowId(srcRowId);
      if (flat === -1) return srcRowId;
      return this._accessor.rowIdAtFlat(flat + dRow) ?? srcRowId;
    })();
    const targetHostField = (() => {
      const fields = this._accessor.visibleFields();
      const idx = fields.indexOf(srcField);
      if (idx === -1) return srcField;
      return fields[idx + dCol] ?? srcField;
    })();

    const shifted = this._shiftAst(src.ast, dRow, dCol);
    return astToSource(shifted, { rowId: targetHostRowId, field: targetHostField }, this._accessor);
  }

  private _shiftAst(ast: FormulaCell['ast'], dRow: number, dCol: number): FormulaCell['ast'] {
    const shiftRef = (ref: CanonicalRef): CanonicalRef => {
      if (ref.kind === 'rel') {
        // rel 참조는 이미 상대(§2.3 refMode:'relative' 전용) — dRow 만 추가 이동.
        // 열 축은 이 모드에서 field 로 고정 앵커되므로 dCol 이동은 MVP 범위 밖(문서화된 한계).
        return { ...ref, dRow: ref.dollarRow ? ref.dRow : ref.dRow + dRow };
      }
      let field = ref.field;
      if (!ref.dollarCol && dCol !== 0) {
        const fields = this._accessor.visibleFields();
        const idx = fields.indexOf(ref.field);
        const newField = idx === -1 ? undefined : fields[idx + dCol];
        if (!newField) return { kind: 'abs', rowId: '__dead__', field: '__dead__', dollarRow: ref.dollarRow, dollarCol: ref.dollarCol };
        field = newField;
      }
      let rowId = ref.rowId;
      if (!ref.dollarRow && dRow !== 0) {
        const flat = this._accessor.flatIndexOfRowId(ref.rowId);
        const newRowId = flat === -1 ? null : this._accessor.rowIdAtFlat(flat + dRow);
        if (newRowId === null) return { kind: 'abs', rowId: '__dead__', field: '__dead__', dollarRow: ref.dollarRow, dollarCol: ref.dollarCol };
        rowId = newRowId;
      }
      return { kind: 'abs', rowId, field, dollarRow: ref.dollarRow, dollarCol: ref.dollarCol };
    };

    const walk = (node: FormulaCell['ast']): FormulaCell['ast'] => {
      switch (node.t) {
        case 'ref': {
          const ref = shiftRef(node.ref);
          if (ref.kind === 'abs' && ref.rowId === '__dead__') return { t: 'error', code: '#REF' };
          return { t: 'ref', ref };
        }
        case 'range': {
          const a = shiftRef(node.ref.a);
          const b = shiftRef(node.ref.b);
          if ((a.kind === 'abs' && a.rowId === '__dead__') || (b.kind === 'abs' && b.rowId === '__dead__')) {
            return { t: 'error', code: '#REF' };
          }
          return { t: 'range', ref: { a, b } };
        }
        case 'call':
          return { t: 'call', name: node.name, args: node.args.map(walk) };
        case 'unary':
          return { t: 'unary', op: node.op, arg: walk(node.arg) };
        case 'bin':
          return { t: 'bin', op: node.op, left: walk(node.left), right: walk(node.right) };
        default:
          return node;
      }
    };

    return walk(ast);
  }
}

function _now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// 재수출(후속 배선/테스트 편의) — A1 열문자 변환은 offsetFormula/serializeFormula 가 공유.
export { indexToColLetters };
