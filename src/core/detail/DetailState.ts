/**
 * DetailState — F2 마스터/디테일 펼침 상태 (헤드리스).
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §3.1(DetailManager 상태 부분),
 *    §6.1(masterDetail.maxDepth/expandMultiple 기본값), §6.3(rowExpand/rowCollapse payload)
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C0.5(범위/선택 정체성 = stable-id 앵커 —
 *    F2 펼침도 동일 원칙), C5.2(이벤트명 `<subject><Verb>` camelCase)
 *
 * 책임 경계: 이 파일은 **펼침 상태(Set<rowId>)와 규칙**만 다룬다. DOM/서브그리드 생명주기는
 * SubgridCache, flat 배열 스플라이스는 DetailSplice 가 담당한다(관심사 분리, Booch 경계).
 *
 * ⚠️ FlatRowModel(src/core/FlatRowModel.ts)은 착륙 중인 별도 파일이라 여기서 직접 import 하지 않는다.
 * rowIndex→rowId 해소는 배선 단계(OpenGrid/DetailManager)에서 FlatRowModel 경유로 수행하고,
 * 이 클래스는 이미 해소된 stable rowId(string)만 입력받는다.
 */

/** FR-6 rowExpand/rowCollapse 이벤트 payload 재료. rowIndex/host 는 배선 단계에서 채운다(§6.3). */
export interface RowExpandEventPayload {
  rowIndex: number;
  rowId: string;
  row: any;
  host: HTMLElement | null;
}

export interface DetailStateOptions {
  /** masterDetail.maxDepth, 기본 2 (CON-4/FR-10). */
  maxDepth?: number;
  /** masterDetail.expandMultiple, 기본 true. false=아코디언(펼침 1개만 허용). */
  expandMultiple?: boolean;
  /** 이 그리드 인스턴스의 현재 중첩 깊이(부모가 자식 생성 시 depth+1 주입, CON-4). 기본 0(최상위). */
  depth?: number;
}

export type DetailToggleResult = 'expanded' | 'collapsed' | 'rejected';

/**
 * 펼침 상태 보관소. rowId 는 DataLayer stable id(`_ogRowId` 등) — 정렬/필터로 flat 인덱스가
 * 바뀌어도 이 Set 의 멤버십은 그대로 보존된다(FR-4, C0.5).
 */
export class DetailState {
  private _expanded = new Set<string>();
  private _maxDepth: number;
  private _expandMultiple: boolean;
  private _depth: number;

  constructor(opts: DetailStateOptions = {}) {
    this._maxDepth = opts.maxDepth ?? 2;
    this._expandMultiple = opts.expandMultiple ?? true;
    this._depth = opts.depth ?? 0;
  }

  /** 읽기 전용 뷰. 소유권은 이 클래스가 유지(외부에서 mutate 금지). */
  get expandedRowIds(): ReadonlySet<string> { return this._expanded; }
  get size(): number { return this._expanded.size; }
  get depth(): number { return this._depth; }
  get maxDepth(): number { return this._maxDepth; }
  get expandMultiple(): boolean { return this._expandMultiple; }

  isExpanded(rowId: string): boolean { return this._expanded.has(rowId); }

  /** CON-4/FR-10: depth >= maxDepth 면 이 그리드에서는 더 이상 펼칠 수 없다(중첩 깊이 경계). */
  canExpand(): boolean { return this._depth < this._maxDepth; }

  /**
   * rowId 를 펼침 상태로 표시.
   * - depth 초과(EC-6/FR-10)면 false 반환(거부) — 호출자가 announce() 등 경고를 낸다.
   * - 이미 펼쳐져 있으면 멱등(true, 재적용 없음 — EC-7 빠른 토글 연타 방어).
   * - expandMultiple:false(아코디언)면 기존 펼침을 전부 접고 이 rowId 만 남긴다.
   */
  expand(rowId: string): boolean {
    if (this._expanded.has(rowId)) return true;
    if (!this.canExpand()) return false;
    if (!this._expandMultiple) this._expanded.clear();
    this._expanded.add(rowId);
    return true;
  }

  /** rowId 를 접음. 이미 접혀 있었으면 false(no-op 신호, 호출자가 이벤트 emit 여부 판단). */
  collapse(rowId: string): boolean {
    return this._expanded.delete(rowId);
  }

  /** 토글 1회 = 정확히 하나의 결과(FR-6 "emit 정확히 1회"의 기반). */
  toggle(rowId: string): DetailToggleResult {
    if (this._expanded.has(rowId)) {
      this.collapse(rowId);
      return 'collapsed';
    }
    return this.expand(rowId) ? 'expanded' : 'rejected';
  }

  /** collapseAllDetails() 배선용. 접힌 rowId 목록을 반환(호출자가 각각 rowCollapse emit 판단). */
  collapseAll(): string[] {
    const ids = Array.from(this._expanded);
    this._expanded.clear();
    return ids;
  }

  /** FR-6 payload 조립 헬퍼(순수 데이터 조립, emit 자체는 배선 단계 EventEmitter 몫). */
  buildEventPayload(rowId: string, rowIndex: number, row: any, host: HTMLElement | null): RowExpandEventPayload {
    return { rowIndex, rowId, row, host };
  }
}
