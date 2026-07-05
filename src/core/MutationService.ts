import type { DataLayer } from './DataLayer.js';
import type { FlatRowModel, FlatRowRef } from './FlatRowModel.js';
import type { VirtualScroll } from './VirtualScroll.js';
import type { Pagination } from './Pagination.js';
import type { ColumnLayout } from './ColumnLayout.js';
import type { RowManager } from './RowManager.js';
import type { GroupTreeManager } from './GroupTreeManager.js';
import type { TriggerManager } from './TriggerManager.js';
import type { GridOptions, EditEvent, Position } from './types.js';

/**
 * R4(§3.4, R-9a/R-9b): 모든 데이터 변경의 mutate→render→emit 꼬리를 단일 초크포인트
 * `commit(spec)` 로 수렴시키기 위한 명시 데이터계약(CommitSpec DTO). 각 mutator 의
 * **관측 가능한 발화 순서 차이는 정규화 대상이 아니라 이 필드들로 인코딩**한다
 * (R-9c 회귀0: R0 골든 `mutation-event-sequence.test.ts` 순서 보존).
 * / Explicit data contract (CommitSpec DTO) that converges every mutator's mutate→render→emit
 * tail into the single choke point `commit(spec)` (R4, §3.4, R-9a/R-9b). Each mutator's
 * **observable firing-order differences are not normalized away but encoded into these
 * fields** (R-9c, zero regression: order preserved by the R0 golden test
 * `mutation-event-sequence.test.ts`).
 *
 * - `totals`  : VS/Pagination 행수 갱신. 'count'=현재 행수(insert/delete/push/unshift),
 *               'zero'=0(clearData). 생략=미갱신(writeCell/setData — 행수 불변 or 인라인 처리).
 *               / Updates the VS/Pagination row count. `'count'` = current row count
 *               (insert/delete/push/unshift), `'zero'` = 0 (clearData). Omitted = no update
 *               (writeCell/setData — row count unchanged, or handled inline).
 * - `renderMode` : 'sync-window'=`_doRender(...visRange)`(insert/delete/write/endBatch),
 *               'full'=`_doRender(0,-1)`(clearData),
 *               'async-vs'=명령형 렌더 없음. setData 는 setTotalRows/rebuild 로 VS 가
 *               rAF 스케줄(비동기)하므로 `commit` 은 동기 `_doRender` 를 **하지 않는다**.
 *               / `'sync-window'` = `_doRender(...visRange)` (insert/delete/write/endBatch),
 *               `'full'` = `_doRender(0,-1)` (clearData), `'async-vs'` = no imperative render.
 *               For setData, VS schedules via rAF through setTotalRows/rebuild, so `commit`
 *               **does not** invoke a synchronous `_doRender`.
 * - `emitBeforeRender` : true=emit 을 render 앞에(writeCell/endBatch — 현행 순서), 기본 false=render 먼저(insert/delete).
 *               / `true` = emit before render (writeCell/endBatch — current order); default
 *               `false` = render first (insert/delete).
 * - `emitPayload` : `emit('dataChange', …)` 페이로드 지연 평가(thunk). getData() 시점을
 *               현행과 동일(render 뒤 or 앞)하게 유지 + 명시 onDataChange 재호출 시 2회 평가 보존.
 *               / Lazily-evaluated (thunk) payload for `emit('dataChange', …)`. Keeps the
 *               `getData()` evaluation point identical to current behavior (before or after
 *               render) and preserves double evaluation when `onDataChange` is explicitly
 *               re-invoked.
 * - `fireOnDataChangeExplicitly` : true=`_options.onDataChange?.()` 를 **명시 재호출**(bound listener 와 합쳐 DOUBLE-fire).
 *               row mutator=true, setData/clearData=false(bound listener 로 ONCE).
 *               / `true` = **explicitly re-invokes** `_options.onDataChange?.()` (combined with
 *               the bound listener, this DOUBLE-fires). Row mutators = `true`;
 *               setData/clearData = `false` (bound listener fires ONCE).
 * - `flushFormula` : true=emit 전에 `_flushFormulaRecalc()`(writeCell/endBatch).
 *               / `true` = calls `_flushFormulaRecalc()` right before emit (writeCell/endBatch).
 * - `preRender` : render 직전 훅(deleteRow 의 removedRowId invalidate 루프).
 *               / Hook that runs immediately before render (deleteRow's removedRowId
 *               invalidation loop).
 * - `coalescable` : true 인 커밋만 배치 개구 중 render/emit 을 no-op 하고 `_batchDirty` 를 세운다.
 *               **writeCell 만 원래 배치를 감지**했으므로 나머지 mutator(coalescable 생략)는
 *               배치 안에서도 즉시 렌더(현행 보존 — 배치 게이트를 전 mutator 로 확대하지 않는다).
 *               / Only commits with `true` no-op render/emit while a batch is open and instead
 *               set `_batchDirty`. **Only writeCell originally detected batches**, so the
 *               remaining mutators (which omit `coalescable`) still render immediately even
 *               inside a batch (current behavior preserved — the batch gate is not widened to
 *               every mutator).
 */
export interface CommitSpec {
  totals?: 'count' | 'zero';
  renderMode: 'sync-window' | 'full' | 'async-vs';
  emitBeforeRender?: boolean;
  emitPayload: () => any;
  fireOnDataChangeExplicitly?: boolean;
  flushFormula?: boolean;
  preRender?: () => void;
  coalescable?: boolean;
}

/**
 * R6(§3.1 C5, §6-R6): 데이터 변경 표면(setData/insert/push/delete/writeCell/writeCells + 배치 API)
 * 와 R4 가 도입한 단일 커밋 초크포인트 `commit(CommitSpec)` 를 `OpenGrid` God object 에서
 * **동작 불변**으로 옮긴 것. `OpenGrid` 는 얇은 위임 공개 메서드만 남긴다(공개 API 불변).
 *
 * 스트랭글러 원칙(A2): DataLayer 는 여전히 `OpenGrid` 가 소유하며, 여기에는 `*Deps`
 * 클로저 역전 패턴으로 **주입**만 된다. **서비스는 렌더를 직접 모른다**(Yourdon I/O 분리):
 * render 는 주입된 `doRenderWindow`/`doRenderFull` 콜백으로만 유발한다. 값(vs/pagination/recalc
 * 등)은 늦은-null / 재할당(worksheet 전환)을 견디도록 전부 getter 클로저로 읽는다.
 * 배치 코얼레싱(`_batchDepth`/`_batchDirty`) 시맨틱은 R4 와 1:1 동일하다(회귀 0).
 * / Dependency contract that moves the data-mutation surface (setData/insert/push/delete/
 * writeCell/writeCells + batch API) and the single commit choke point `commit(CommitSpec)`
 * introduced by R4 out of the `OpenGrid` God object with **behavior unchanged** (R6, §3.1 C5,
 * §6-R6). `OpenGrid` retains only thin delegating public methods (public API unchanged).
 *
 * Strangler principle (A2): `DataLayer` is still owned by `OpenGrid`; it is only **injected**
 * here via the `*Deps` closure-inversion pattern. **The service has no direct knowledge of
 * rendering** (Yourdon I/O separation): render is only triggered through the injected
 * `doRenderWindow`/`doRenderFull` callbacks. Values (vs/pagination/recalc, etc.) are all read
 * through getter closures so they tolerate late-null / reassignment (worksheet switching).
 * Batch coalescing semantics (`_batchDepth`/`_batchDirty`) are 1:1 identical to R4 (zero
 * regression).
 */
export interface MutationServiceDeps<T extends Record<string, any> = any> {
  getData: () => DataLayer<T>;
  getVs: () => VirtualScroll | null;
  getPagination: () => Pagination | null;
  getFlatModel: () => FlatRowModel;
  getColLayout: () => ColumnLayout<T>;
  getContainer: () => HTMLElement;
  getTrigMgr: () => TriggerManager;
  getRowMgr: () => RowManager<T>;
  getGrpMgr: () => GroupTreeManager<T>;
  getOptions: () => Required<GridOptions<T>>;
  /** EventEmitter fan(this.emit) — 'dataChange'/'editEnd'/'writeCellsSkip'. / EventEmitter fan-out (this.emit) for 'dataChange'/'editEnd'/'writeCellsSkip'. */
  emit: (event: string, payload?: any) => void;
  /** aria-live announce(C8.1 공용 인프라). / aria-live announce (C8.1 shared infrastructure). */
  announce: (msg: string) => void;
  /** i18n: 데이터 로드/스킵 announce 해석. / i18n: resolve data load/skip announces. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** sort/filter 재적용(setData). / Re-apply sort/filter (setData). */
  applyFilters: () => void;
  /** writeCell/endBatch 커밋 emit 직전 수식 dirty seed 소비. / Consume formula dirty seeds right before the writeCell/endBatch commit emit. */
  flushFormula: () => void;
  /** 현재 가시 범위 렌더(this._doRender(...this._visRange())). 서비스는 렌더 내부를 모른다. / Render the current visible range (this._doRender(...this._visRange())). The service has no knowledge of render internals. */
  doRenderWindow: () => void;
  /** 전체 렌더(this._doRender(0, -1)) — clearData full 모드. / Full render (this._doRender(0, -1)) — clearData's full mode. */
  doRenderFull: () => void;
  /** setData: 수식 dirty seed clear + RecalcCoordinator 재생성(rowId 재발급 대응). / setData: clears formula dirty seeds and recreates the RecalcCoordinator (to cope with rowId reissuance). */
  resetFormulaState: () => void;
  /** writeCell: 값이 바뀐 셀을 수식 dirty seed 로 적립(kind==='data' 일 때만). / writeCell: accumulates a changed cell as a formula dirty seed (only when kind === 'data'). */
  seedFormulaDirty: (rowIndex: number, field: string) => void;
  /** deleteRow: 제거된 rowId 를 deps 로 갖는 수식들을 #REF 로 무효화(preRender). / deleteRow: invalidates formulas that depend on a removed rowId to #REF (preRender). */
  invalidateRemovedRows: (rowIds: string[]) => void;
  /** deleteRow: 제거 전 flat index 의 안정 rowId 확보. / deleteRow: captures the stable rowId at a flat index before removal. */
  getRowIdAt: (rowIndex: number) => string | undefined;
}

/**
 * 모든 데이터 변경(mutation)의 단일 초크포인트. / Single chokepoint for all data mutations.
 *
 * setData/insertRow/pushRow/deleteRow/writeCell/writeCells + 배치 API를 소유하며, 각 연산의
 * mutate→render→emit 꼬리를 {@link CommitSpec} 을 통해 `commit()` 하나로 수렴시킨다(R4/R6).
 * / Owns setData/insertRow/pushRow/deleteRow/writeCell/writeCells plus the batch API, and
 * converges every operation's mutate→render→emit tail into a single `commit()` call driven
 * by a {@link CommitSpec} (R4/R6).
 */
export class MutationService<T extends Record<string, any> = any> {
  private _deps: MutationServiceDeps<T>;

  // ── Phase 0(C2.1): 배치 쓰기 — beginBatch/endBatch 로 render·dataChange 를 coalesce ──
  /** reentrant 카운터. 0 초과면 배치 중(writeCell 이 render/dataChange 를 지연). */
  private _batchDepth = 0;
  /** 배치 구간 중 실제 쓰기가 1건이라도 있었는지(빈 배치는 endBatch 에서 아무 것도 안 함). */
  private _batchDirty = false;

  constructor(deps: MutationServiceDeps<T>) {
    this._deps = deps;
  }

  /**
   * R4(§3.4, R-9a): 단일 커밋 초크포인트. mutate 완료 후의 totals→(preRender)→flush→render/emit
   * 꼬리를 여기로 수렴. **관측 순서는 spec 필드로 인코딩**(정규화 아님 — R0 골든 diff=0).
   * 배치 코얼레싱을 내재화: `coalescable` 커밋은 배치 개구 중 render/emit 을 지연하고
   * `_batchDirty` 만 세운다(가장 바깥 endBatch 에서 1회 flush).
   * / Single commit chokepoint (R4, §3.4, R-9a). Converges the post-mutate
   * totals→(preRender)→flush→render/emit tail here. **Observable order is encoded via the
   * spec fields** (not normalized — R0 golden diff = 0). Internalizes batch coalescing:
   * commits marked `coalescable` defer render/emit while a batch is open and only set
   * `_batchDirty` (flushed once by the outermost endBatch).
   *
   * @param spec - 커밋 데이터계약 / The commit data contract
   */
  commit(spec: CommitSpec): void {
    // 배치 코얼레싱(writeCell 만 coalescable) — 나머지 mutator 는 배치 중에도 즉시 커밋(현행 보존).
    if (spec.coalescable && this._batchDepth > 0) {
      this._batchDirty = true;
      return;
    }
    const data = this._deps.getData();
    if (spec.totals === 'count') {
      this._deps.getVs()?.setTotalRows(this._deps.getFlatModel().count());
      this._deps.getPagination()?.setTotalRows(data.rowCount);
    } else if (spec.totals === 'zero') {
      this._deps.getVs()?.setTotalRows(0);
      this._deps.getPagination()?.setTotalRows(0);
    }
    spec.preRender?.();
    if (spec.flushFormula) this._deps.flushFormula();

    const doRender = (): void => {
      if (spec.renderMode === 'sync-window') this._deps.doRenderWindow();
      else if (spec.renderMode === 'full') this._deps.doRenderFull();
      // 'async-vs' → 명령형 렌더 없음(setData: VS setTotalRows/rebuild 가 rAF 로 스케줄).
    };
    const doEmit = (): void => {
      this._deps.emit('dataChange', spec.emitPayload());
      if (spec.fireOnDataChangeExplicitly) this._deps.getOptions().onDataChange?.(spec.emitPayload());
    };

    if (spec.emitBeforeRender) { doEmit(); doRender(); }
    else { doRender(); doEmit(); }
  }

  /**
   * 전체 데이터를 교체한다. rowId 를 재발급하므로 기존 stable-id 앵커 수식은 전량 무효화된다.
   * / Replace the entire dataset. Reissues rowIds, so any existing stable-id-anchored formulas
   * are fully invalidated.
   *
   * @param data - 새 행 데이터 배열 / New array of row data
   */
  setData(data: T[]): void {
    const trigMgr = this._deps.getTrigMgr();
    const ctx = trigMgr.mkCtx('setData', [data]);
    if (!trigMgr.exec('before:setData', ctx)) return;
    this._deps.getRowMgr().reset();
    const dl = this._deps.getData();
    dl.setData(data);
    // F3(§9 E11): setData 는 rowId 를 재발급하므로 stable-id 앵커에 묶인 기존 수식은 전량
    // 무효(MVP, rowId 재바인딩은 P2) — 오케스트레이터를 새로 만들어 사이드카/그래프를 비운다.
    this._deps.resetFormulaState();
    this._deps.applyFilters();
    const grpMgr = this._deps.getGrpMgr();
    if (grpMgr.isTreeMode) {
      grpMgr.rebuildTree();
    } else if (grpMgr.isGroupMode) {
      grpMgr.rebuildGroups();
    } else {
      this._deps.getVs()?.setTotalRows(this._deps.getFlatModel().count());
    }
    const container = this._deps.getContainer();
    container.setAttribute('aria-rowcount', String(dl.rowCount));
    container.setAttribute('aria-colcount', String(this._deps.getColLayout().visibleLeaves.length));
    this._deps.announce(this._deps.t('data.loadedAnnounce', { count: dl.rowCount }));
    // R4: setData 는 렌더를 setTotalRows/rebuild(VS rAF, 비동기)로 이미 처리 → 커밋은 emit 만.
    // onDataChange 는 bound listener 로 ONCE(명시 재호출 없음).
    this.commit({ renderMode: 'async-vs', emitPayload: () => dl.getData() });
    ctx.result = data.length;
    trigMgr.exec('after:setData', ctx);
  }

  /**
   * 행 하나를 삽입한다. / Insert a single row.
   *
   * @param item - 삽입할 행 데이터(부분) / Row data to insert (partial)
   * @param position - 삽입 위치. 기본 'last' / Insert position. Default `'last'`
   */
  insertRow(item: Partial<T>, position: Position = 'last'): void {
    const trigMgr = this._deps.getTrigMgr();
    const ctx = trigMgr.mkCtx('insertRow', [item, position]);
    if (!trigMgr.exec('before:insertRow', ctx)) return;
    const dl = this._deps.getData();
    const pos = position === 'before' ? 0
      : position === 'after' ? dl.rowCount
      : position as any;
    dl.addRow(item, pos);
    const n = dl.rowCount;
    // R4: totals → sync-window 렌더 → emit → 명시 onDataChange(DOUBLE-fire).
    this.commit({
      totals: 'count', renderMode: 'sync-window',
      emitPayload: () => dl.getData(), fireOnDataChangeExplicitly: true,
    });
    ctx.result = { rowCount: n, item };
    trigMgr.exec('after:insertRow', ctx);
  }

  /**
   * 하나 이상의 행을 끝에 추가한다(트리거 브래킷 없음). / Append one or more rows to the end (no trigger bracket).
   *
   * @param items - 추가할 행(단일 또는 배열) / Row(s) to append (single or array)
   */
  pushRow(items: Partial<T> | Partial<T>[]): void {
    const arr = Array.isArray(items) ? items : [items];
    const dl = this._deps.getData();
    arr.forEach(it => dl.addRow(it, 'last'));
    // R4: pushRow 는 트리거 브래킷 없음 — 커밋만(totals→render→emit→명시 onDataChange DOUBLE-fire).
    this.commit({
      totals: 'count', renderMode: 'sync-window',
      emitPayload: () => dl.getData(), fireOnDataChangeExplicitly: true,
    });
  }

  /**
   * 하나 이상의 행을 제거한다. 제거된 rowId 에 의존하던 수식은 #REF 로 무효화된다.
   * / Remove one or more rows. Formulas depending on a removed rowId are invalidated to #REF.
   *
   * @param rowIndex - 제거할 행의 (표시) 인덱스, 단일 또는 배열 / (Displayed) index of the row(s) to remove, single or array
   */
  deleteRow(rowIndex: number | number[]): void {
    const trigMgr = this._deps.getTrigMgr();
    const dl = this._deps.getData();
    const ctx = trigMgr.mkCtx('deleteRow', [rowIndex]);
    const idxArr = Array.isArray(rowIndex) ? [...rowIndex] : [rowIndex];
    ctx.extra = { rows: idxArr.map(i => dl.getRowByIndex(i)) };
    if (!trigMgr.exec('before:deleteRow', ctx)) return;
    const idxs = idxArr.sort((a, b) => b - a);
    // F3-R28/MCCONNELL-02(P0): 삭제되는 rowId 를 먼저 확보(제거 후엔 flat index 로 되짚을 수 없다) →
    // 삭제 완료 후 그 rowId 를 deps 로 가진 수식들을 #REF 로 무효화(자연 귀결, invalidateRow).
    const removedRowIds = idxs
      .map(i => this._deps.getRowIdAt(i))
      .filter((id): id is string => id != null);
    idxs.forEach(i => dl.removeRow(i));
    const n = dl.rowCount;
    // R4: totals → (preRender=삭제 rowId invalidate, skipRender) → sync-window 렌더 → emit → 명시 onDataChange.
    this.commit({
      totals: 'count', renderMode: 'sync-window',
      preRender: () => this._deps.invalidateRemovedRows(removedRowIds),
      emitPayload: () => dl.getData(), fireOnDataChangeExplicitly: true,
    });
    ctx.result = { deleted: idxs.length, rowCount: n };
    trigMgr.exec('after:deleteRow', ctx);
  }

  /**
   * 셀 하나에 값을 쓴다. 배치 개구 중이면 render/emit 을 coalesce 한다.
   * / Write a value to a single cell. Coalesces render/emit while a batch is open.
   *
   * @param rowIndex - 대상 행의 flat index / Flat index of the target row
   * @param field - 컬럼 field 명 / Column field name
   * @param value - 기록할 값 / Value to write
   */
  writeCell(rowIndex: number, field: string, value: any): void {
    const dl = this._deps.getData();
    const old = dl.getCellValue(rowIndex, field);
    const trigMgr = this._deps.getTrigMgr();
    const ctx = trigMgr.mkCtx('writeCell', [rowIndex, field, value]);
    ctx.extra = { oldValue: old, rowIndex, field };
    if (!trigMgr.exec('before:writeCell', ctx)) return;
    dl.updateCell(rowIndex, field, value);
    const row = dl.getRowByIndex(rowIndex);
    const colLayout = this._deps.getColLayout();
    const col = colLayout.getColumnByField(field);
    const ci = colLayout.getColumnIndex(field);
    const evt: EditEvent<T> = { type: 'editEnd', rowIndex, columnIndex: ci, field, oldValue: old, newValue: value, row: row as T, column: col as any };
    this._deps.emit('editEnd', evt);
    this._deps.getOptions().onEditEnd?.(evt);
    // F3(C2/§8.5): 값이 바뀐 셀을 dirty seed 로 적립 — 배치 중이면 endBatch 에서, 아니면
    // 아래에서 즉시 onValuesChanged([key]) 1회로 소비한다(수식 셀 자신의 값 직접 덮어쓰기 포함).
    this._deps.seedFormulaDirty(rowIndex, field);
    // R4(C2.1): 커밋이 배치 코얼레싱을 내재화(coalescable) — 배치 중이면 _batchDirty 만 세우고
    // endBatch 가 1회 flush. 비배치 시 flush→emit→명시 onDataChange→render(emit 이 render 앞).
    this.commit({
      renderMode: 'sync-window', flushFormula: true, emitBeforeRender: true,
      emitPayload: () => dl.getData(), fireOnDataChangeExplicitly: true,
      coalescable: true,
    });
    ctx.result = { rowIndex, field, oldValue: old, newValue: value };
    trigMgr.exec('after:writeCell', ctx);
  }

  /**
   * 배치 쓰기 시작(C2.1). 이후 writeCell 호출들은 render/dataChange 를 지연·coalesce 한다.
   * 중첩 호출은 카운팅(reentrant) — 가장 바깥 endBatch 에서만 실제로 flush 된다.
   * / Begin batched writes (C2.1). Subsequent writeCell calls defer and coalesce
   * render/dataChange. Nested calls are counted (reentrant) — only the outermost endBatch
   * actually flushes.
   */
  beginBatch(): void { this._batchDepth++; }

  /**
   * 배치 종료(C2.1). 카운터가 0 이 되는 시점에 한해 배치 중 발생한 쓰기가 있으면
   * _doRender 1회 + dataChange 1회를 발생시킨다(둘 다 0회 또는 1회 — 폭주 차단).
   * / End the batch (C2.1). Only when the counter reaches 0 and a write occurred during the
   * batch does this fire one `_doRender` and one `dataChange` (each either 0 or 1 times — no
   * runaway firing).
   */
  endBatch(): void {
    if (this._batchDepth === 0) return; // 불균형 호출 방어
    this._batchDepth--;
    if (this._batchDepth === 0 && this._batchDirty) {
      this._batchDirty = false;
      // R4/F3(C2.1): 배치 중 쌓인 dirty seed 를 여기서 1회 소비 후 커밋(비배치 writeCell 과 동형:
      // flush→emit→명시 onDataChange→render). 이미 depth=0 이라 coalescable 불필요.
      this.commit({
        renderMode: 'sync-window', flushFormula: true, emitBeforeRender: true,
        emitPayload: () => this._deps.getData().getData(), fireOnDataChangeExplicitly: true,
      });
    }
  }

  /**
   * beginBatch+루프+endBatch 래퍼(C2.1). patches 의 rowIndex 는 flat index — 대상이
   * FlatRowModel.resolveFlatRow 로 해소해 kind!=='data' (group/tree/detail 의사행)이면
   * 쓰기 전에 skip 한다(C0.3 쓰기 안전, filler 에 writeCell 절대 금지).
   * 건너뛴 셀 수를 반환하고, 1건이라도 있으면 announce + 'writeCellsSkip' 이벤트로 표면화한다.
   * / A beginBatch+loop+endBatch wrapper (C2.1). `rowIndex` in each patch is a flat index —
   * if resolving it via `FlatRowModel.resolveFlatRow` yields `kind !== 'data'` (a group/tree/
   * detail pseudo-row), the write is skipped (C0.3 write safety — writeCell is never allowed
   * on fillers). Returns the number of skipped cells and, if any were skipped, surfaces it via
   * announce + a `'writeCellsSkip'` event.
   *
   * @param patches - 적용할 셀 패치 배열 / Array of cell patches to apply
   * @returns 건너뛴 셀 수 / Number of cells skipped
   */
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number {
    this.beginBatch();
    let skipped = 0;
    const flatModel = this._deps.getFlatModel();
    for (const p of patches) {
      const ref: FlatRowRef = flatModel.resolveFlatRow(p.rowIndex);
      if (ref.kind !== 'data') { skipped++; continue; }
      this.writeCell(p.rowIndex, p.field, p.value);
    }
    this.endBatch();
    if (skipped > 0) {
      this._deps.announce(this._deps.t('data.skippedCellsAnnounce', { count: skipped }));
      this._deps.emit('writeCellsSkip', { skipped, total: patches.length });
    }
    return skipped;
  }
}
