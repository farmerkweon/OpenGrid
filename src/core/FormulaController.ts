import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { FlatRowModel } from './FlatRowModel.js';
import type { GridOptions } from './types.js';
import { RecalcCoordinator, type RecalcSummary } from './formula/RecalcCoordinator.js';
import { cellKey, parseCellKey, type FormulaErrorCode, type FormulaGridAccessor } from './formula/types.js';

/** formulaRecalc 이벤트의 large 플래그 임계(Spike-A §8 교훈 — 누적체인 폐포 폭증 신호). */
const FORMULA_LARGE_RECALC_THRESHOLD = 500;

/**
 * R7(§3.1 C9, §6-R7): F3 수식 표면(accessor 조립·recalc flush·에러 표현 + 공개 수식 API)을
 * `OpenGrid` God object 에서 **동작 불변**으로 옮긴 것. `OpenGrid` 는 얇은 위임 공개 메서드만
 * 남긴다(공개 API 불변 — R0 `public_api_surface.txt` 동결).
 *
 * 스트랭글러 원칙(A2): `RecalcCoordinator`(`formula/` 헤드리스 코어)는 여전히 `OpenGrid` 가
 * 소유·재생성(setData 시 rowId 재발급 대응)하며, 이 컨트롤러에는 `*Deps` 클로저 역전 패턴으로
 * **주입**만 된다 — `getRecalc()` 는 재할당(resetFormulaState)을 견디는 지연 getter 다.
 * `RecalcCoordinator`/`FormulaGraph`/`FormulaEvaluator` 자체는 한 줄도 수정하지 않는다(불변 보존).
 *
 * ⚠️ 네이밍: root `src/core/FormulaEngine.ts` 와 `src/core/formula/` 패키지는 별개다. 이 컨트롤러는
 * `formula/` 패키지(RecalcCoordinator)에만 배선하며 root `FormulaEngine.ts` 와는 무관하다(병합 금지).
 */
export interface FormulaControllerDeps<T extends Record<string, any> = any> {
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getFlatModel: () => FlatRowModel;
  /** OpenGrid 가 소유하는 RecalcCoordinator. setData 시 재생성되므로 지연 getter 로 읽는다. */
  getRecalc: () => RecalcCoordinator;
  /** writeCell 이 적립한 dirty seed 집합(OpenGrid 소유). flushRecalc 가 소비·clear 한다. */
  getDirtySeeds: () => Set<string>;
  getOptions: () => Required<GridOptions<T>>;
  /** EventEmitter fan(this.emit) — 'formulaRecalc'/'formulaError'/'formulaChange'. */
  emit: (event: string, payload?: any) => void;
  /** aria-live announce(C8.1 공용 인프라). */
  announce: (msg: string) => void;
  /** 현재 가시 범위 렌더(this._doRender(...this._visRange())). afterRecalc 가 !skipRender 시 유발. */
  doRenderWindow: () => void;
}

export class FormulaController<T extends Record<string, any> = any> {
  private _deps: FormulaControllerDeps<T>;

  constructor(deps: FormulaControllerDeps<T>) {
    this._deps = deps;
  }

  // ── F3: 재계산 배치 소비 + formulaRecalc 표면화(§C2.2, §5.3) ────────────
  /** writeCell 이 적립한 dirty seed 를 1회 onValuesChanged 로 소비하고 formulaRecalc 를 emit. */
  flushRecalc(): void {
    const seeds = this._deps.getDirtySeeds();
    if (seeds.size === 0) return;
    const list = [...seeds];
    seeds.clear();
    this.afterRecalc(this._deps.getRecalc().onValuesChanged(list), { skipRender: true });
  }

  /**
   * RecalcCoordinator 호출 결과를 표면화: formulaError 는 onFormulaError 콜백에서 이미 개별
   * emit 되므로 여기선 배치당 1회 formulaRecalc 만 emit(C2.2 개명, `recalc`→`formulaRecalc`).
   * Spike-A §8 교훈: 폐포가 큰 재계산은 large 플래그로 표시(가이드 문서화/모니터링용).
   */
  afterRecalc(summary: RecalcSummary, opts: { skipRender?: boolean } = {}): void {
    if (summary.changed.length > 0 || summary.cycles > 0) {
      const evt = {
        changed: summary.changed,
        cycles: summary.cycles,
        ms: summary.ms,
        large: summary.changed.length > FORMULA_LARGE_RECALC_THRESHOLD,
      };
      this._deps.emit('formulaRecalc', evt);
      this._deps.getOptions().formula?.onFormulaRecalc?.(evt);
    }
    if (!opts.skipRender) this._deps.doRenderWindow();
  }

  handleFormulaError(rowId: string, field: string, error: FormulaErrorCode): void {
    const rowIndex = this._deps.getFlatModel().flatIndexOfRowId(rowId);
    const evt = { rowIndex, field, error };
    this._deps.emit('formulaError', evt);
    this._deps.getOptions().formula?.onFormulaError?.(evt);
    this._deps.announce(`${field} 셀 오류: ${this._formulaErrorMessageKo(error)}`);
  }

  private _formulaErrorMessageKo(error: FormulaErrorCode): string {
    switch (error) {
      case '#REF': return '참조 대상이 삭제됨';
      case '#CYCLE': return '순환 참조';
      case '#VALUE': return '숫자가 아닌 값에 산술 연산';
      case '#DIV0': return '0으로 나눔';
      case '#NAME': return '알 수 없는 함수/이름';
      case '#NUM': return '수치 도메인 오류';
      default: return '수식 오류';
    }
  }

  /** F3 accessor(C0/C0.5/C1) — FlatRowModel + ColumnLayout.visibleLeaves + DataLayer(rowId 기반)만 본다. */
  buildAccessor(): FormulaGridAccessor {
    return {
      visibleFields: () => this._deps.getColLayout().visibleLeaves.map(c => c.field as string),
      rowIdAtFlat: (flatIndex) => {
        const ref = this._deps.getFlatModel().resolveFlatRow(flatIndex);
        return ref.kind === 'data' ? (ref.rowId ?? null) : null;
      },
      flatIndexOfRowId: (rowId) => this._deps.getFlatModel().flatIndexOfRowId(rowId),
      displayedRowIds: () => {
        const out: string[] = [];
        const flatModel = this._deps.getFlatModel();
        const n = flatModel.count();
        for (let i = 0; i < n; i++) {
          const ref = flatModel.resolveFlatRow(i);
          if (ref.kind === 'data' && ref.rowId) out.push(ref.rowId);
        }
        return out;
      },
      getCellValue: (rowId, field) => this._deps.getData().getCellValueByRowId(rowId, field),
      hasRow: (rowId) => this._deps.getData().hasRow(rowId),
      hasField: (field) => this._deps.getColLayout().getColumnByField(field) != null,
    };
  }

  // ── F3: 공개 API(§8.2) — rowIndex 는 flat(C0), 내부 즉시 stable rowId 로 정규화 ──────
  setCellFormula(rowIndex: number, field: string, formula: string): void {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    this.setCellFormulaByRowId(ref.rowId, field, formula, rowIndex);
  }

  setCellFormulaByRowId(rowId: string, field: string, formula: string, rowIndexHint?: number): void {
    const rowIndex = rowIndexHint ?? this._deps.getFlatModel().flatIndexOfRowId(rowId);
    const recalc = this._deps.getRecalc();
    const oldFormula = recalc.getCellFormula(rowId, field);
    const summary = recalc.setCellFormula(rowId, field, formula);
    const evt = { rowIndex, field, formula, oldFormula };
    this._deps.emit('formulaChange', evt);
    this._deps.getOptions().formula?.onFormulaChange?.(evt);
    this.afterRecalc(summary);
  }

  getCellFormula(rowIndex: number, field: string): string | null {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    return this._deps.getRecalc().getCellFormula(ref.rowId, field);
  }

  hasCellFormula(rowIndex: number, field: string): boolean {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    return ref.kind === 'data' && !!ref.rowId && this._deps.getRecalc().hasCellFormula(ref.rowId, field);
  }

  clearCellFormula(rowIndex: number, field: string): void {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    const recalc = this._deps.getRecalc();
    const dependents = recalc.clearCellFormula(ref.rowId, field);
    if (dependents.length) this.afterRecalc(recalc.onValuesChanged(dependents));
    else this._deps.doRenderWindow();
  }

  getCellError(rowIndex: number, field: string): FormulaErrorCode | null {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    return this._deps.getRecalc().getCellError(ref.rowId, field);
  }

  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return [];
    const flatModel = this._deps.getFlatModel();
    return this._deps.getRecalc().getDependents(ref.rowId, field)
      .map(({ rowId, field: f }) => ({ rowIndex: flatModel.flatIndexOfRowId(rowId), field: f }));
  }

  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return [];
    const flatModel = this._deps.getFlatModel();
    return this._deps.getRecalc().graph.getPrecedents(cellKey(ref.rowId, field))
      .map(parseCellKey)
      .map(({ rowId, field: f }) => ({ rowIndex: flatModel.flatIndexOfRowId(rowId), field: f }));
  }

  recalculate(): void { this.afterRecalc(this._deps.getRecalc().recalculateAll()); }

  recalculateCell(rowIndex: number, field: string): void {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    this.afterRecalc(this._deps.getRecalc().onValuesChanged([cellKey(ref.rowId, field)]));
  }

  /** C3(F1 fill 전용): srcRowId/srcField 수식의 상대축만 dRow/dCol 오프셋한 새 수식 원문. */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    return this._deps.getRecalc().offsetFormula(srcRowId, srcField, dRow, dCol);
  }

  /** F3 렌더 배선(§4.4/C7, §7.4/§7.5/§7.6) — 셀 수식 메타(없으면 null). */
  getFormulaMeta(rowIndex: number, field: string): { src: string; error: FormulaErrorCode | null; approx: boolean } | null {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    const cell = this._deps.getRecalc().store.getFormula(ref.rowId, field);
    if (!cell) return null;
    return { src: cell.src, error: cell.error, approx: !!cell.approx };
  }

  /** F3-R13/MCCONNELL-03(P0): 정렬/필터 후 범위-보유(hasRangeRef) 수식 전부 dirty(§3.5). */
  recalcRangeBearingFormulas(): void {
    this.afterRecalc(this._deps.getRecalc().recalcRangeBearing());
  }
}
