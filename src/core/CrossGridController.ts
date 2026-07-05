import type { DataLayer } from './DataLayer.js';
import type { ColumnLayout } from './ColumnLayout.js';
import {
  openCrossGridMapper, buildTransform, buildMappingScript, sameSchema,
  type FieldInfo,
} from './CrossGridMapper.js';
import { crossGridRegistry } from './CrossGridRegistry.js';
import type {
  GridOptions, OpenGridInstance, Position,
  GridDropEvent, GridMappingEvent,
} from './types.js';

const ROW_ID_FIELD = '_ogRowId';

/**
 * R7(§3.1 C8, §6-R7): 그리드 간 이동·매핑·drop 표면(`moveRowsTo`/`moveCheckedTo`/크로스변환 해석/
 * 3단계 드롭 이벤트 발화)을 `OpenGrid` God object 에서 **동작 불변**으로 옮긴 것. `OpenGrid` 는
 * 얇은 위임 공개 메서드만 남긴다(공개 API 불변 — R0 `public_api_surface.txt` 동결).
 *
 * 스트랭글러 원칙(A2): `crossGridRegistry`(프로세스 스코프 싱글턴, `CrossGridRegistry.ts`)는 지금은
 * **AS-IS 유지**한다 — 주입 `GridRegistry` 로의 승격(C8, R-6c)은 R8 컴포지션 루트로 이연한다.
 *
 * cross-grid 이동은 **두 그리드**(source=this, target)를 동시에 다룬다. 각 `OpenGrid` 는 자신의
 * CrossGridController 를 소유하므로, target 측 연산(insert/rowCount/컬럼/3단계 발화)은
 * `getPeerController(target)` 로 얻은 상대 컨트롤러의 동명 메서드로 수행한다 — `this`(source) 와
 * peer(target) 로 갈라 원본의 `this._x` / `targetGrid._x` 접근을 1:1 재현한다(회귀 0).
 * **3단계 drop emit 순서(before→후 이동→after→complete, 각 source→target)는 정확히 보존한다.**
 * / Dependency contract that moves the cross-grid move/mapping/drop surface (`moveRowsTo`/
 * `moveCheckedTo`/cross-transform resolution/the 3-phase drop event firing) out of the
 * `OpenGrid` God object with **behavior unchanged** (R7, §3.1 C8, §6-R7). `OpenGrid` retains
 * only thin delegating public methods (public API unchanged — the R0 `public_api_surface.txt`
 * is frozen).
 *
 * Strangler principle (A2): `crossGridRegistry` (a process-scoped singleton in
 * `CrossGridRegistry.ts`) is kept **AS-IS** for now — promoting it to an injected
 * `GridRegistry` (C8, R-6c) is deferred to the R8 composition root.
 *
 * A cross-grid move involves **two grids** (source = `this`, target) at once. Since each
 * `OpenGrid` owns its own `CrossGridController`, target-side operations (insert/rowCount/
 * columns/3-phase firing) are carried out via the same-named methods on the peer controller
 * obtained through `getPeerController(target)` — splitting into `this` (source) and `peer`
 * (target) reproduces the original's `this._x` / `targetGrid._x` access 1:1 (zero regression).
 * **The 3-phase drop emit order (before → move → after → complete, each source → target) is
 * preserved exactly.**
 */
export interface CrossGridControllerDeps<T extends Record<string, any> = any> {
  /** GridDropEvent 의 sourceGrid/targetGrid 식별자 + 자기동일성 비교에 쓰는 소유 그리드.
   * / The owning grid, used both as the GridDropEvent's sourceGrid/targetGrid identifier and
   * for self-identity comparison. */
  getSelf: () => OpenGridInstance<T>;
  getData: () => DataLayer<T>;
  getColLayout: () => ColumnLayout<T>;
  getOptions: () => Required<GridOptions<T>>;
  /** EventEmitter fan(this.emit) — 'gridDropBefore/After/Complete'/'gridDropMapping'.
   * / EventEmitter fan-out (this.emit) for 'gridDropBefore/After/Complete'/'gridDropMapping'. */
  emit: (event: string, payload?: any) => void;
  /** 공개 insertRow 위임(MutationService 경유) — target 삽입에 쓰인다.
   * / Delegates to the public insertRow (via MutationService) — used for target-side insertion. */
  insertRow: (item: Partial<T>, position?: Position) => void;
  /** 공개 deleteRow 위임(MutationService 경유) — source 제거에 쓰인다.
   * / Delegates to the public deleteRow (via MutationService) — used for source-side removal. */
  deleteRow: (rowIndex: number | number[]) => void;
  /** rowMgr.getChecked() — moveCheckedTo. / rowMgr.getChecked() — used by moveCheckedTo. */
  getChecked: () => Array<{ rowIndex: number }>;
  /** rowMgr.uncheckAll()(+재렌더) 공개 위임 — moveCheckedTo.
   * / Delegates to the public rowMgr.uncheckAll() (+ re-render) — used by moveCheckedTo. */
  uncheckAll: () => void;
  /** 드래그 선택 집합 해석(_dragRowSet). OpenGrid 가 소유(RowDragDrop 배선과 공유).
   * / Resolves the drag selection set (_dragRowSet). Owned by OpenGrid (shared with the
   * RowDragDrop wiring). */
  dragRowSet: (fromIndex: number) => number[];
  /** 상대 그리드의 CrossGridController 획득(피어 연산 위임). 비 OpenGrid 대상은 undefined.
   * / Obtains the peer grid's CrossGridController for delegated peer operations. `undefined`
   * for non-OpenGrid targets. */
  getPeerController: (grid: OpenGridInstance<T>) => CrossGridController<T> | undefined;
}

/**
 * 그리드↔그리드 이동·매핑·드롭 조정자. / Grid-to-grid move/mapping/drop coordinator.
 *
 * 드래그 또는 화살표 셔틀로 촉발되는 행 이동, 스키마가 다른 그리드 간 필드 매핑, 3단계
 * drop 이벤트(before→after→complete) 발화를 담당한다(R7).
 * / Handles row moves triggered by drag or the arrow-key shuttle, field mapping between
 * grids with different schemas, and firing the 3-phase drop event (before→after→complete) (R7).
 */
export class CrossGridController<T extends Record<string, any> = any> {
  private _deps: CrossGridControllerDeps<T>;

  constructor(deps: CrossGridControllerDeps<T>) {
    this._deps = deps;
  }

  // ── 피어(상대 그리드) 연산: moveRowsTo 가 target 측에서 호출한다 ──
  // / Peer (opposite grid) operations — called on the target side by moveRowsTo.
  /** 이 그리드의 소유 인스턴스(GridDropEvent 식별자). / This grid's owning instance (the GridDropEvent identifier). */
  getSelf(): OpenGridInstance<T> { return this._deps.getSelf(); }
  private _rowCount(): number { return this._deps.getData().rowCount; }
  private _insertRow(item: Partial<T>, position?: Position): void { this._deps.insertRow(item, position); }
  private _visibleLeafInfos(): FieldInfo[] {
    return this._deps.getColLayout().visibleLeaves.map(c => ({ field: c.field, header: c.header }));
  }

  /**
   * 드래그 드롭 어댑터 → 공개 moveRowsTo 로 위임. / Drag-drop adapter that delegates to the
   * public moveRowsTo.
   *
   * @param fromIndex - 드래그 원본 행 인덱스 / Source row index of the drag
   * @param targetBodyEl - 드롭 대상 그리드의 바디 엘리먼트(crossGridRegistry 조회 키) / Target grid's body element (lookup key into crossGridRegistry)
   * @param targetIndex - 대상 그리드에서 삽입할 인덱스 / Insert index in the target grid
   */
  handleCrossGridDrop(fromIndex: number, targetBodyEl: HTMLElement, targetIndex: number): void {
    const targetGrid = crossGridRegistry.get(targetBodyEl) as OpenGridInstance<T> | undefined;
    if (!targetGrid || targetGrid === this._deps.getSelf()) return;
    void this.moveRowsTo(targetGrid, this._deps.dragRowSet(fromIndex), targetIndex);
  }

  /**
   * 이 그리드의 행들을 다른 그리드로 이동(move)한다. 드래그·화살표 셔틀 공통 경로.
   * 3단계 이벤트(before→after→complete)와 crossGridMapping(필드 매핑)을 적용한다.
   * / Move this grid's rows into another grid. The shared path for drag and the arrow-key
   * shuttle. Applies the 3-phase event (before→after→complete) and crossGridMapping
   * (field mapping).
   *
   * @param target - 대상 그리드 / The target grid
   * @param sourceIndexes - 이동할 (표시)행 인덱스들 / (Displayed) row indexes to move
   * @param targetIndex - 대상에서 삽입 위치 (생략 시 맨 끝에 추가) / Insert position in the target (omit to append at the end)
   * @returns 이동 성공 true, 취소/무효 false / `true` if the move succeeded, `false` if cancelled/invalid
   */
  async moveRowsTo(
    target: OpenGridInstance<T>,
    sourceIndexes: number[],
    targetIndex?: number,
  ): Promise<boolean> {
    const self = this._deps.getSelf();
    if (!target || target === self || !sourceIndexes.length) return false;
    const targetCtrl = this._deps.getPeerController(target);
    if (!targetCtrl) return false;
    const idxAsc = [...new Set(sourceIndexes)].sort((a, b) => a - b);
    const at = targetIndex ?? targetCtrl._rowCount();

    // 행 데이터 복사 (내부 id 제거 → 타깃이 새 id 부여)
    let rows = idxAsc.map(i => {
      const r = { ...(this._deps.getData().getRowByIndex(i) as any) };
      delete r[ROW_ID_FIELD];
      return r as T;
    });

    // 필드 매핑 (스키마가 다른 그리드 간 이동)
    const transform = await this._resolveCrossTransform(targetCtrl);
    if (transform === false) return false;          // 매핑 모달 취소
    if (transform) rows = rows.map(r => transform(r) as T);

    const evt: GridDropEvent<T> = {
      sourceGrid: self, targetGrid: target, rows, sourceIndexes: idxAsc, targetIndex: at,
    };

    // ① 변경전 (양쪽). false 반환 또는 cancel=true 면 중단
    if (this.fireGridDropBefore(evt) === false || evt.cancel) return false;
    if (targetCtrl.fireGridDropBefore(evt) === false || evt.cancel) return false;

    // 이동: 타깃에 순서대로 삽입 → 소스에서 내림차순 제거
    rows.forEach((row, k) => targetCtrl._insertRow(row as Partial<T>, at + k));
    [...idxAsc].sort((a, b) => b - a).forEach(i => this._deps.deleteRow(i));

    // ② 변경후
    this.fireGridDropAfter(evt);
    targetCtrl.fireGridDropAfter(evt);
    // ③ 완료시 (insert/delete 가 이미 양쪽 재렌더)
    this.fireGridDropComplete(evt);
    targetCtrl.fireGridDropComplete(evt);
    return true;
  }

  /**
   * 체크된 행을 다른 그리드로 이동 (화살표 셔틀용). 체크 없으면 무시.
   * / Move checked rows into another grid (for the arrow-key shuttle). No-op if none are checked.
   *
   * @param target - 대상 그리드 / The target grid
   * @returns 이동 성공 true, 취소/무효(체크 없음 포함) false / `true` if the move succeeded, `false` if cancelled/invalid (including no checked rows)
   */
  async moveCheckedTo(target: OpenGridInstance<T>): Promise<boolean> {
    const indexes = this._deps.getChecked().map(c => c.rowIndex);
    if (!indexes.length) return false;
    this._deps.uncheckAll();
    return this.moveRowsTo(target, indexes);
  }

  /**
   * 크로스그리드 이동의 행 변환 함수를 결정한다.
   * 반환: null=변환 불필요(그대로) / 함수=변환 적용 / false=매핑 모달 취소(이동 중단)
   */
  private async _resolveCrossTransform(targetCtrl: CrossGridController<T>): Promise<((src: any) => any) | null | false> {
    const mode = this._deps.getOptions().crossGridMapping;
    if (typeof mode === 'function') return mode as (src: any) => any;
    if (mode !== 'interactive') return null;     // 'auto' → 그대로 복사

    const srcInfos: FieldInfo[] = this._visibleLeafInfos();
    const tgtInfos: FieldInfo[] = targetCtrl._visibleLeafInfos();
    if (sameSchema(srcInfos.map(f => f.field), tgtInfos.map(f => f.field))) return null; // 스키마 동일 → 모달 불필요

    const result = await openCrossGridMapper(srcInfos, tgtInfos);
    if (!result) return false;                   // 취소
    const mapEvt: GridMappingEvent<T> = {
      sourceGrid: this._deps.getSelf(), targetGrid: targetCtrl.getSelf(),
      mapping: result.mapping, script: result.script,
    };
    this._deps.emit('gridDropMapping', mapEvt);
    this._deps.getOptions().onGridDropMapping?.(mapEvt);
    // 콘솔에도 출력 — 개발자가 바로 복사해 baking 하도록
    console.log('[OpenGrid] cross-grid mapping script:\n' + buildMappingScript(result.mapping));
    return buildTransform(result.mapping);
  }

  /**
   * 이동 전 이벤트를 발화한다. 핸들러가 `false` 를 반환하거나 `e.cancel` 을 세우면 이동이 중단된다.
   * / Fire the pre-move event. If a handler returns `false` or sets `e.cancel`, the move is aborted.
   *
   * @param e - drop 이벤트 페이로드 / The drop event payload
   * @returns 핸들러의 반환값(취소 판단에 쓰임) / The handler's return value (used to decide cancellation)
   */
  fireGridDropBefore(e: GridDropEvent<T>): boolean | void {
    this._deps.emit('gridDropBefore', e);
    return this._deps.getOptions().onGridDropBefore?.(e);
  }
  /**
   * 이동 후(삽입/삭제 반영 후) 이벤트를 발화한다. / Fire the post-move event (after insert/delete
   * have taken effect).
   *
   * @param e - drop 이벤트 페이로드 / The drop event payload
   */
  fireGridDropAfter(e: GridDropEvent<T>): void {
    this._deps.emit('gridDropAfter', e);
    this._deps.getOptions().onGridDropAfter?.(e);
  }
  /**
   * 이동 완료(양쪽 재렌더까지 반영) 이벤트를 발화한다. / Fire the completion event (after both
   * grids have re-rendered).
   *
   * @param e - drop 이벤트 페이로드 / The drop event payload
   */
  fireGridDropComplete(e: GridDropEvent<T>): void {
    this._deps.emit('gridDropComplete', e);
    this._deps.getOptions().onGridDropComplete?.(e);
  }
}
