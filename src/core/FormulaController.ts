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
 * / R7 (§3.1 C9, §6-R7): F3's formula surface (accessor assembly, recalc flush, error surfacing,
 * plus the public formula API) moved out of the `OpenGrid` God object with **behavior unchanged**.
 * `OpenGrid` retains only thin delegating public methods (public API frozen — R0
 * `public_api_surface.txt`).
 *
 * 스트랭글러 원칙(A2): `RecalcCoordinator`(`formula/` 헤드리스 코어)는 여전히 `OpenGrid` 가
 * 소유·재생성(setData 시 rowId 재발급 대응)하며, 이 컨트롤러에는 `*Deps` 클로저 역전 패턴으로
 * **주입**만 된다 — `getRecalc()` 는 재할당(resetFormulaState)을 견디는 지연 getter 다.
 * `RecalcCoordinator`/`FormulaGraph`/`FormulaEvaluator` 자체는 한 줄도 수정하지 않는다(불변 보존).
 * / Strangler-fig principle (A2): `RecalcCoordinator` (the `formula/` headless core) is still
 * owned and re-created by `OpenGrid` (to handle rowId reassignment on setData), and is only
 * **injected** into this controller via the `*Deps` closure-inversion pattern — `getRecalc()` is a
 * lazy getter that survives reassignment (resetFormulaState). `RecalcCoordinator`/`FormulaGraph`/
 * `FormulaEvaluator` themselves are never modified (preserved as-is).
 *
 * ⚠️ 네이밍: root `src/core/FormulaEngine.ts` 와 `src/core/formula/` 패키지는 별개다. 이 컨트롤러는
 * `formula/` 패키지(RecalcCoordinator)에만 배선하며 root `FormulaEngine.ts` 와는 무관하다(병합 금지).
 * / ⚠️ Naming: root `src/core/FormulaEngine.ts` and the `src/core/formula/` package are distinct.
 * This controller only wires to the `formula/` package (RecalcCoordinator) and is unrelated to
 * root `FormulaEngine.ts` (never merge them).
 */
/**
 * FormulaController 가 OpenGrid 서브시스템을 읽고 쓰기 위해 주입받는 클로저 묶음.
 * / Closures injected into FormulaController so it can read and write OpenGrid subsystem state
 * without owning it directly.
 */
export interface FormulaControllerDeps<T extends Record<string, any> = any> {
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getFlatModel: () => FlatRowModel;
  /** OpenGrid 가 소유하는 RecalcCoordinator. setData 시 재생성되므로 지연 getter 로 읽는다.
   * / The RecalcCoordinator owned by OpenGrid. Read via a lazy getter since it is re-created on setData. */
  getRecalc: () => RecalcCoordinator;
  /** writeCell 이 적립한 dirty seed 집합(OpenGrid 소유). flushRecalc 가 소비·clear 한다.
   * / The dirty-seed set accumulated by writeCell (owned by OpenGrid). Consumed and cleared by flushRecalc. */
  getDirtySeeds: () => Set<string>;
  getOptions: () => Required<GridOptions<T>>;
  /** EventEmitter fan(this.emit) — 'formulaRecalc'/'formulaError'/'formulaChange'.
   * / EventEmitter fan-out (this.emit) for 'formulaRecalc'/'formulaError'/'formulaChange'. */
  emit: (event: string, payload?: any) => void;
  /** aria-live announce(C8.1 공용 인프라). / aria-live announce (C8.1 shared infrastructure). */
  announce: (msg: string) => void;
  /** i18n: 수식 오류 announce/셀 라벨 해석(formulaError.* 통합 키). / i18n: resolve formula error announce/labels. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 현재 가시 범위 렌더(this._doRender(...this._visRange())). afterRecalc 가 !skipRender 시 유발.
   * / Renders the currently visible range (this._doRender(...this._visRange())). Triggered by
   * afterRecalc when !skipRender. */
  doRenderWindow: () => void;
}

/** F3: 에러코드 → 카탈로그 키(GridRenderer 와 동일 formulaError.* 통합, 중복 맵 해소).
 * / F3: error code → catalog key (shares the same formulaError.* keys as GridRenderer;
 * removes a duplicate map). */
const _FORMULA_ERROR_KEY: Record<string, string> = {
  '#REF': 'formulaError.ref',
  '#CYCLE': 'formulaError.cycle',
  '#VALUE': 'formulaError.value',
  '#DIV0': 'formulaError.div0',
  '#NAME': 'formulaError.name',
  '#NUM': 'formulaError.num',
};

/**
 * F3 셀 수식 컨트롤러. / F3 cell formula controller.
 *
 * `RecalcCoordinator`(헤드리스 의존성 그래프+평가기)를 그리드 서브시스템(FlatRowModel/ColumnLayout/
 * DataLayer)에 배선하고, 재계산 결과를 `formulaRecalc`/`formulaError`/`formulaChange` 이벤트로
 * 표면화하며, `setCellFormula` 등 공개 수식 API 를 제공한다. / Wires `RecalcCoordinator` (the
 * headless dependency graph + evaluator) into the grid subsystems (FlatRowModel/ColumnLayout/
 * DataLayer), surfaces recalculation results as `formulaRecalc`/`formulaError`/`formulaChange`
 * events, and exposes the public formula API (`setCellFormula`, etc.).
 */
export class FormulaController<T extends Record<string, any> = any> {
  private _deps: FormulaControllerDeps<T>;

  constructor(deps: FormulaControllerDeps<T>) {
    this._deps = deps;
  }

  // ── F3: 재계산 배치 소비 + formulaRecalc 표면화(§C2.2, §5.3) ────────────
  /** writeCell 이 적립한 dirty seed 를 1회 onValuesChanged 로 소비하고 formulaRecalc 를 emit.
   * / Consumes the dirty seeds accumulated by writeCell in a single onValuesChanged call and
   * emits formulaRecalc. */
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
   * / Surfaces a RecalcCoordinator call result: `formulaError` is already emitted individually
   * from the onFormulaError callback, so this only emits one `formulaRecalc` per batch (C2.2
   * rename, `recalc` → `formulaRecalc`). Spike-A §8 lesson: recalculations with a large
   * dependency closure are flagged via `large` (for docs/monitoring).
   *
   * @param summary - RecalcCoordinator 가 반환한 재계산 결과 요약 / Recalculation result summary returned by RecalcCoordinator
   * @param opts - `skipRender` 지정 시 재렌더를 생략(호출측이 배치 처리 중) / When `skipRender` is set, skips the re-render (caller is batching)
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

  /** 수식 평가 오류를 표면화: `formulaError` emit + aria-live 공지. / Surface a formula evaluation
   * error: emits `formulaError` and announces it via aria-live.
   *
   * @param rowId - 오류가 발생한 셀의 행 stable id / Stable id of the row where the error occurred
   * @param field - 오류가 발생한 컬럼 field / Column field where the error occurred
   * @param error - 수식 오류 코드(`#REF`/`#CYCLE` 등) / Formula error code (`#REF`, `#CYCLE`, etc.)
   */
  handleFormulaError(rowId: string, field: string, error: FormulaErrorCode): void {
    const rowIndex = this._deps.getFlatModel().flatIndexOfRowId(rowId);
    const evt = { rowIndex, field, error };
    this._deps.emit('formulaError', evt);
    this._deps.getOptions().formula?.onFormulaError?.(evt);
    this._deps.announce(this._deps.t('formula.cellErrorAnnounce', { field, message: this._formulaErrorMessageKo(error) }));
  }

  private _formulaErrorMessageKo(error: FormulaErrorCode): string {
    const key = _FORMULA_ERROR_KEY[error] ?? 'formulaError.fallback';
    return this._deps.t(key);
  }

  /** F3 accessor(C0/C0.5/C1) — FlatRowModel + ColumnLayout.visibleLeaves + DataLayer(rowId 기반)만 본다.
   * / F3 accessor (C0/C0.5/C1) — reads only through FlatRowModel, ColumnLayout.visibleLeaves, and
   * DataLayer (rowId-based).
   *
   * @returns RecalcCoordinator 가 그리드를 읽는 데 쓰는 accessor / Accessor RecalcCoordinator uses to read the grid
   */
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
  /**
   * 셀에 수식을 설정한다(flat rowIndex 기준). / Set a formula on a cell (keyed by flat rowIndex).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @param formula - 설정할 수식 원문(예: `=A1+B1`) / Formula source to set (e.g. `=A1+B1`)
   * @example
   * grid.setCellFormula(0, 'total', '=price*qty');
   */
  setCellFormula(rowIndex: number, field: string, formula: string): void {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    this.setCellFormulaByRowId(ref.rowId, field, formula, rowIndex);
  }

  /** stable rowId 기준으로 셀 수식을 설정한다(F1 fill 등 rowId 를 이미 아는 호출자용).
   * / Set a cell formula keyed by stable rowId (for callers — e.g. F1 fill — that already know the rowId).
   *
   * @param rowId - 대상 행의 stable id / Stable id of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @param formula - 설정할 수식 원문 / Formula source to set
   * @param rowIndexHint - 이미 알고 있는 flat index(이벤트 payload 용, 생략 시 재조회) / Known flat index for the event payload (re-resolved if omitted)
   */
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

  /** 셀에 설정된 수식 원문을 조회한다(없으면 `null`). / Get the formula source set on a cell (or `null` if none).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @returns 수식 원문, 없으면 `null` / Formula source, or `null`
   */
  getCellFormula(rowIndex: number, field: string): string | null {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    return this._deps.getRecalc().getCellFormula(ref.rowId, field);
  }

  /** 셀에 수식이 설정돼 있는지 여부. / Whether a cell has a formula set on it.
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @returns 수식이 있으면 true / True if the cell has a formula
   */
  hasCellFormula(rowIndex: number, field: string): boolean {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    return ref.kind === 'data' && !!ref.rowId && this._deps.getRecalc().hasCellFormula(ref.rowId, field);
  }

  /** 셀의 수식을 제거한다(값 셀로 되돌리며, 남은 의존 셀은 재계산). / Remove a cell's formula
   * (reverting it to a plain value cell; remaining dependents are recalculated).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   */
  clearCellFormula(rowIndex: number, field: string): void {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    const recalc = this._deps.getRecalc();
    const dependents = recalc.clearCellFormula(ref.rowId, field);
    if (dependents.length) this.afterRecalc(recalc.onValuesChanged(dependents));
    else this._deps.doRenderWindow();
  }

  /** 셀의 마지막 수식 평가 오류를 조회한다(정상이면 `null`). / Get a cell's last formula evaluation error (`null` if healthy).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @returns 오류 코드, 없으면 `null` / Error code, or `null`
   */
  getCellError(rowIndex: number, field: string): FormulaErrorCode | null {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    return this._deps.getRecalc().getCellError(ref.rowId, field);
  }

  /** 이 셀을 참조하는(값이 바뀌면 재계산되는) 셀 목록. / Cells that reference this cell (recalculated when it changes).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @returns 의존 셀들의 rowIndex/field 목록 / List of dependent cells' rowIndex/field
   */
  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return [];
    const flatModel = this._deps.getFlatModel();
    return this._deps.getRecalc().getDependents(ref.rowId, field)
      .map(({ rowId, field: f }) => ({ rowIndex: flatModel.flatIndexOfRowId(rowId), field: f }));
  }

  /** 이 셀의 수식이 참조하는 선행 셀 목록. / Cells that this cell's formula references (its precedents).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @returns 선행 셀들의 rowIndex/field 목록 / List of precedent cells' rowIndex/field
   */
  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return [];
    const flatModel = this._deps.getFlatModel();
    return this._deps.getRecalc().graph.getPrecedents(cellKey(ref.rowId, field))
      .map(parseCellKey)
      .map(({ rowId, field: f }) => ({ rowIndex: flatModel.flatIndexOfRowId(rowId), field: f }));
  }

  /** 그리드의 모든 수식을 강제 재계산한다. / Force-recalculate every formula in the grid. */
  recalculate(): void { this.afterRecalc(this._deps.getRecalc().recalculateAll()); }

  /** 단일 셀(과 그 의존 셀들)만 강제 재계산한다. / Force-recalculate a single cell (and its dependents).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   */
  recalculateCell(rowIndex: number, field: string): void {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return;
    this.afterRecalc(this._deps.getRecalc().onValuesChanged([cellKey(ref.rowId, field)]));
  }

  /** C3(F1 fill 전용): srcRowId/srcField 수식의 상대축만 dRow/dCol 오프셋한 새 수식 원문.
   * / C3 (F1 fill only): a new formula source with only the relative-axis references of the
   * srcRowId/srcField formula offset by dRow/dCol.
   *
   * @param srcRowId - 원본 수식이 있는 행의 stable id / Stable id of the row holding the source formula
   * @param srcField - 원본 수식이 있는 컬럼 field / Column field holding the source formula
   * @param dRow - 행 오프셋 / Row offset
   * @param dCol - 열 오프셋 / Column offset
   * @returns 오프셋 적용된 수식 원문 / The offset formula source
   */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    return this._deps.getRecalc().offsetFormula(srcRowId, srcField, dRow, dCol);
  }

  /** F3 렌더 배선(§4.4/C7, §7.4/§7.5/§7.6) — 셀 수식 메타(없으면 null).
   * / F3 render wiring (§4.4/C7, §7.4/§7.5/§7.6) — a cell's formula metadata (or null if none).
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 대상 컬럼 field / Target column field
   * @returns 수식 원문/오류/근사 여부, 없으면 `null` / Formula source, error, and approximation flag; or `null`
   */
  getFormulaMeta(rowIndex: number, field: string): { src: string; error: FormulaErrorCode | null; approx: boolean } | null {
    const ref = this._deps.getFlatModel().resolveFlatRow(rowIndex);
    if (ref.kind !== 'data' || !ref.rowId) return null;
    const cell = this._deps.getRecalc().store.getFormula(ref.rowId, field);
    if (!cell) return null;
    return { src: cell.src, error: cell.error, approx: !!cell.approx };
  }

  /** F3-R13/MCCONNELL-03(P0): 정렬/필터 후 범위-보유(hasRangeRef) 수식 전부 dirty(§3.5).
   * / F3-R13/MCCONNELL-03 (P0): after sort/filter, marks every range-referencing (hasRangeRef)
   * formula dirty (§3.5). */
  recalcRangeBearingFormulas(): void {
    this.afterRecalc(this._deps.getRecalc().recalcRangeBearing());
  }
}
