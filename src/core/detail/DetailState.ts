/**
 * DetailState — F2 마스터/디테일 펼침 상태 (헤드리스).
 * / DetailState — F2 master/detail expansion state (headless).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §3.1(DetailManager 상태 부분),
 *    §6.1(masterDetail.maxDepth/expandMultiple 기본값), §6.3(rowExpand/rowCollapse payload)
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C0.5(범위/선택 정체성 = stable-id 앵커 —
 *    F2 펼침도 동일 원칙), C5.2(이벤트명 `<subject><Verb>` camelCase)
 * / Contract basis:
 *  - 11_design_F2_v2.md §3.1 (the state portion of DetailManager), §6.1 (masterDetail.maxDepth/expandMultiple
 *    defaults), §6.3 (rowExpand/rowCollapse payload)
 *  - 15_cross_contracts.md C0.5 (range/selection identity = stable-id anchors — F2 expansion follows the same
 *    principle), C5.2 (event names `<subject><Verb>` camelCase)
 *
 * 책임 경계: 이 파일은 **펼침 상태(Set<rowId>)와 규칙**만 다룬다. DOM/서브그리드 생명주기는
 * SubgridCache, flat 배열 스플라이스는 DetailSplice 가 담당한다(관심사 분리, Booch 경계).
 * / Responsibility boundary: this file handles **only the expansion state (Set<rowId>) and its rules**. DOM /
 * subgrid lifecycle belongs to SubgridCache; flat-array splicing belongs to DetailSplice (separation of concerns).
 *
 * ⚠️ FlatRowModel(src/core/FlatRowModel.ts)은 착륙 중인 별도 파일이라 여기서 직접 import 하지 않는다.
 * rowIndex→rowId 해소는 배선 단계(OpenGrid/DetailManager)에서 FlatRowModel 경유로 수행하고,
 * 이 클래스는 이미 해소된 stable rowId(string)만 입력받는다.
 * / FlatRowModel (src/core/FlatRowModel.ts) is a separate file still landing, so it is not imported here directly.
 * rowIndex→rowId resolution is done at the wiring stage (OpenGrid/DetailManager) via FlatRowModel; this class only
 * takes already-resolved stable rowIds (string).
 */

/** FR-6 rowExpand/rowCollapse 이벤트 payload 재료. rowIndex/host 는 배선 단계에서 채운다(§6.3). / Material for the FR-6 rowExpand/rowCollapse event payload. rowIndex/host are filled at the wiring stage (§6.3). */
export interface RowExpandEventPayload {
  /** 대상 행의 flat index. / Flat index of the target row. */
  rowIndex: number;
  /** 대상 행의 stable rowId. / Stable rowId of the target row. */
  rowId: string;
  /** 대상 행 데이터. / Target row data. */
  row: any;
  /** 디테일 패널 host 요소(없으면 null). / Detail panel host element (null if none). */
  host: HTMLElement | null;
}

/** DetailState 생성 옵션. / DetailState construction options. */
export interface DetailStateOptions {
  /** masterDetail.maxDepth, 기본 2 (CON-4/FR-10). / masterDetail.maxDepth, default 2 (CON-4/FR-10). */
  maxDepth?: number;
  /** masterDetail.expandMultiple, 기본 true. false=아코디언(펼침 1개만 허용). / masterDetail.expandMultiple, default true. false = accordion (only one expansion allowed). */
  expandMultiple?: boolean;
  /** 이 그리드 인스턴스의 현재 중첩 깊이(부모가 자식 생성 시 depth+1 주입, CON-4). 기본 0(최상위). / Current nesting depth of this grid instance (parent injects depth+1 when creating a child, CON-4). Default 0 (top level). */
  depth?: number;
}

/** toggle() 결과: 펼침/접힘/거부. / Result of toggle(): expanded / collapsed / rejected. */
export type DetailToggleResult = 'expanded' | 'collapsed' | 'rejected';

/**
 * 펼침 상태 보관소. rowId 는 DataLayer stable id(`_ogRowId` 등) — 정렬/필터로 flat 인덱스가
 * 바뀌어도 이 Set 의 멤버십은 그대로 보존된다(FR-4, C0.5).
 * / Expansion-state store. rowId is a DataLayer stable id (`_ogRowId`, etc.) — even if the flat index changes due
 * to sort/filter, this Set's membership is preserved (FR-4, C0.5).
 *
 * @example
 * const state = new DetailState({ expandMultiple: false });
 * state.toggle('row-7'); // 'expanded'
 * state.isExpanded('row-7'); // true
 */
export class DetailState {
  private _expanded = new Set<string>();
  private _maxDepth: number;
  private _expandMultiple: boolean;
  private _depth: number;

  /**
   * @param opts - maxDepth/expandMultiple/depth 옵션(모두 기본값 있음) / maxDepth/expandMultiple/depth options (all defaulted)
   */
  constructor(opts: DetailStateOptions = {}) {
    this._maxDepth = opts.maxDepth ?? 2;
    this._expandMultiple = opts.expandMultiple ?? true;
    this._depth = opts.depth ?? 0;
  }

  /** 읽기 전용 뷰. 소유권은 이 클래스가 유지(외부에서 mutate 금지). / Read-only view. Ownership stays with this class (do not mutate externally). */
  get expandedRowIds(): ReadonlySet<string> { return this._expanded; }
  /** 현재 펼쳐진 행 수. / Number of currently expanded rows. */
  get size(): number { return this._expanded.size; }
  /** 이 그리드 인스턴스의 중첩 깊이. / Nesting depth of this grid instance. */
  get depth(): number { return this._depth; }
  /** 허용 최대 중첩 깊이. / Maximum allowed nesting depth. */
  get maxDepth(): number { return this._maxDepth; }
  /** 다중 펼침 허용 여부(false=아코디언). / Whether multiple expansions are allowed (false = accordion). */
  get expandMultiple(): boolean { return this._expandMultiple; }

  /**
   * rowId 가 펼쳐져 있는지 여부. / Whether the given rowId is expanded.
   * @param rowId - stable rowId / stable rowId
   * @returns 펼침 여부 / Whether expanded
   */
  isExpanded(rowId: string): boolean { return this._expanded.has(rowId); }

  /**
   * CON-4/FR-10: depth >= maxDepth 면 이 그리드에서는 더 이상 펼칠 수 없다(중첩 깊이 경계).
   * / CON-4/FR-10: if depth >= maxDepth this grid can no longer expand (nesting-depth boundary).
   * @returns 이 깊이에서 펼침 가능 여부 / Whether expansion is possible at this depth
   */
  canExpand(): boolean { return this._depth < this._maxDepth; }

  /**
   * rowId 를 펼침 상태로 표시. / Mark a rowId as expanded.
   * - depth 초과(EC-6/FR-10)면 false 반환(거부) — 호출자가 announce() 등 경고를 낸다.
   * - 이미 펼쳐져 있으면 멱등(true, 재적용 없음 — EC-7 빠른 토글 연타 방어).
   * - expandMultiple:false(아코디언)면 기존 펼침을 전부 접고 이 rowId 만 남긴다.
   * / - Over depth (EC-6/FR-10) returns false (rejected) — the caller emits a warning such as announce().
   * / - If already expanded it is idempotent (true, no re-application — EC-7 defends against rapid toggle spamming).
   * / - When expandMultiple:false (accordion), collapses all existing expansions and keeps only this rowId.
   *
   * @param rowId - stable rowId / stable rowId
   * @returns 펼침 성공 여부(거부 시 false) / Whether expansion succeeded (false when rejected)
   */
  expand(rowId: string): boolean {
    if (this._expanded.has(rowId)) return true;
    if (!this.canExpand()) return false;
    if (!this._expandMultiple) this._expanded.clear();
    this._expanded.add(rowId);
    return true;
  }

  /**
   * rowId 를 접음. 이미 접혀 있었으면 false(no-op 신호, 호출자가 이벤트 emit 여부 판단).
   * / Collapse a rowId. Returns false if it was already collapsed (a no-op signal; the caller decides whether to emit).
   * @param rowId - stable rowId / stable rowId
   * @returns 실제로 접혔는지 여부 / Whether it was actually collapsed
   */
  collapse(rowId: string): boolean {
    return this._expanded.delete(rowId);
  }

  /**
   * 토글 1회 = 정확히 하나의 결과(FR-6 "emit 정확히 1회"의 기반).
   * / One toggle = exactly one result (the basis of FR-6 "emit exactly once").
   * @param rowId - stable rowId / stable rowId
   * @returns 'expanded' | 'collapsed' | 'rejected'
   */
  toggle(rowId: string): DetailToggleResult {
    if (this._expanded.has(rowId)) {
      this.collapse(rowId);
      return 'collapsed';
    }
    return this.expand(rowId) ? 'expanded' : 'rejected';
  }

  /**
   * collapseAllDetails() 배선용. 접힌 rowId 목록을 반환(호출자가 각각 rowCollapse emit 판단).
   * / For wiring collapseAllDetails(). Returns the list of collapsed rowIds (the caller decides whether to emit
   * rowCollapse for each).
   * @returns 접힌 rowId 배열 / Array of collapsed rowIds
   */
  collapseAll(): string[] {
    const ids = Array.from(this._expanded);
    this._expanded.clear();
    return ids;
  }

  /**
   * FR-6 payload 조립 헬퍼(순수 데이터 조립, emit 자체는 배선 단계 EventEmitter 몫).
   * / FR-6 payload assembly helper (pure data assembly; the emit itself belongs to the wiring-stage EventEmitter).
   * @param rowId - stable rowId / stable rowId
   * @param rowIndex - 대상 행 flat index / Target row flat index
   * @param row - 대상 행 데이터 / Target row data
   * @param host - 디테일 패널 host(없으면 null) / Detail panel host (null if none)
   * @returns rowExpand/rowCollapse 이벤트 payload / rowExpand/rowCollapse event payload
   */
  buildEventPayload(rowId: string, rowIndex: number, row: any, host: HTMLElement | null): RowExpandEventPayload {
    return { rowIndex, rowId, row, host };
  }
}
