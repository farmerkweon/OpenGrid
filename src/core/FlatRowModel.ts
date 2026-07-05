/**
 * FlatRowModel — flat/visual index ↔ data 리졸버 (baseline 공통 인프라, Phase 0).
 *
 * 계약: docs/design/grid-features-2026-07/15_cross_contracts.md §C0.3
 *  - "F2 산출물"이 아니라 baseline 공통 인프라다. 어떤 기능도 켜지지 않아도 존재하며,
 *    OpenGrid 가 항상 소유·수명 관리하고 grid.getFlatRowModel() 로 공개된다.
 *  - 기본 backing = plain rows(DataLayer 표시 순서). group/tree 활성 시 GroupTreeManager
 *    가 자기 flat 배열(`_groupFlatRows`/`_treeFlatRows`)을 setBacking() 으로 등록해
 *    backing 을 통째로 교체한다. F2 활성 시 DetailManager 가 registerSplice() 로 합성
 *    후단에 detail head/filler 의사행을 끼워 넣는다(Phase 0 시점엔 소비자 없음 = inert).
 *  - 합성 체인은 단방향: plain → group/tree(backing 교체) → detail splice.
 *  - F1/F3/F4 는 반드시 이 모델을 경유하고 DataLayer._displayIndexes/getRowByIndex 를
 *    직접 만지지 않는다(C0.3 "쓰기 안전" 포함).
 */

import type { DataLayer } from './DataLayer.js';
import { _isGroup } from './GroupEngine.js';
import { isTreeNode } from './TreeEngine.js';

/**
 * flat 한 행이 무엇을 가리키는지 판별하는 참조 정보(C0.3).
 * / Reference info identifying what a flat row points to (C0.3).
 */
export interface FlatRowRef {
  /** 행 종류(데이터/그룹/트리/디테일 헤드·필러). / Row kind (data/group/tree/detail head·filler). */
  kind: 'data' | 'group' | 'tree' | 'detailHead' | 'detailFiller';
  /** kind==='data'|'tree' 일 때 stable id(DataLayer 가 부여한 rowId 필드값). / Stable id when kind is 'data'|'tree' (the rowId field value assigned by DataLayer). */
  rowId?: string;
  /** kind==='data' 일 때 DataLayer 원본(_data) 인덱스. / DataLayer source (_data) index when kind is 'data'. */
  dataIndex?: number;
  /** 정렬/필터 반영된 논리 순서. plain 모드(backing 미교체)에서만 flatIndex 와 1:1 대응. / Logical order after sort/filter; equals flatIndex 1:1 only in plain mode (backing not replaced). */
  displayIndex?: number;
}

/** flat 배열을 구성하는 원소(실데이터 행 T, GroupRow, 또는 TreeNode) — 내부 전용. */
type FlatItem = any;

/** group/tree 등이 baseline backing 을 통째로 교체할 때 쓰는 provider. null = plain 으로 복귀. / Provider used by group/tree to replace the baseline backing wholesale; null = revert to plain. */
export type FlatBackingProvider = (() => FlatItem[]) | null;

/** 합성 후단에서 flat 배열을 변형하는 훅 — F2 detail splice 용. / Hook that transforms the flat array at the tail of composition — for F2 detail splice. */
export type FlatSpliceFn = (flat: FlatItem[]) => FlatItem[];

// 참고: FlatRowRef 는 전부 원시 타입(string|number|undefined)만 노출하므로 FlatRowModel 은
// 행 데이터 타입 T 에 의존하지 않는다(비제네릭). OpenGridInstance<T> 는 언바운드 제네릭이라
// DataLayer<T extends Record<string, any>> 제약과 직접 맞물리면 타입 에러가 나므로 의도적으로
// DataLayer<any> 를 받는다 — 실제 사용처(OpenGrid)는 항상 구체 T 의 DataLayer 를 넘긴다.
/** FlatRowModel 의존성 주입. / FlatRowModel dependency injection. */
export interface FlatRowModelDeps {
  /** 현재 DataLayer 를 반환하는 getter. / Getter returning the current DataLayer. */
  getDataLayer: () => DataLayer<any>;
  /** DataLayer 가 각 행에 부여하는 안정 rowId 필드명(OpenGrid 의 ROW_ID_FIELD, 기본 '_ogRowId'). / Stable rowId field name assigned by DataLayer (OpenGrid's ROW_ID_FIELD, default '_ogRowId'). */
  rowIdField: string;
}

/**
 * flat/visual index ↔ data 리졸버(baseline 공통 인프라). / flat/visual index ↔ data resolver (baseline shared infra).
 *
 * plain rows 를 기본 backing 으로 두고, group/tree 는 setBacking 으로 backing 을 교체하며,
 * F2 는 registerSplice 로 합성 후단에 detail 의사행을 끼워 넣는다(합성 체인은 단방향).
 * / Uses plain rows as the default backing; group/tree replace the backing via setBacking, and F2 inserts
 * detail pseudo-rows at the tail of composition via registerSplice (the composition chain is one-directional).
 */
export class FlatRowModel {
  private _d: FlatRowModelDeps;
  /** group/tree 가 등록한 backing override. null 이면 plain(DataLayer.getData()). */
  private _backing: FlatBackingProvider = null;
  /** F2 detail splice 등록 슬롯(Phase 0: 항상 비어 있음). */
  private _splices: FlatSpliceFn[] = [];

  // 지연 빌드 역인덱스(rowId → flatIndex). 마지막으로 인덱싱한 flat 배열 참조와 비교해 무효화한다.
  // plain 모드는 DataLayer.getData()가 매번 새 배열을 반환하므로 호출마다 자연 재빌드된다.
  // group/tree 모드는 backing 배열이 rebuild 시점에만 교체되므로 그 사이엔 O(1) 재사용된다.
  private _revIndex: Map<string, number> | null = null;
  private _revIndexSrc: FlatItem[] | null = null;

  constructor(deps: FlatRowModelDeps) {
    this._d = deps;
  }

  /**
   * group/tree 등 baseline backing 을 통째로 교체하는 등록점. provider=null 이면 plain(DataLayer 표시 순서)으로 복귀.
   * / Registration point that replaces the baseline backing wholesale (group/tree); provider=null reverts to plain (DataLayer display order).
   *
   * @param provider - backing 공급 함수 또는 null / Backing provider function or null
   */
  setBacking(provider: FlatBackingProvider): void {
    this._backing = provider;
    this._invalidate();
  }

  /**
   * F2 DetailManager 가 합성 후단에 detail head/filler pseudo-row 를 끼워 넣을 변환기를 등록한다. 등록 순서대로 순차 적용.
   * / Register a transformer that F2 DetailManager uses to insert detail head/filler pseudo-rows at the tail of composition; applied in registration order.
   *
   * @param fn - flat 배열 변환 함수 / Flat-array transform function
   */
  registerSplice(fn: FlatSpliceFn): void {
    this._splices.push(fn);
    this._invalidate();
  }

  /** 합성 완료된 flat 행 수. / Count of composed flat rows. */
  count(): number {
    return this._flat().length;
  }

  /**
   * 합성 완료된 flat 배열 원본을 노출한다(F2 렌더 배선 소비 — GridRenderer.renderBody 가 이 배열을
   * `groupFlatRows` 자리에 그대로 넘겨받아 detail head/filler 를 렌더한다). 호출측은 결과를
   * 변경하지 않는다(내부 backing/splice 산출물을 그대로 반환).
   * / Expose the composed flat array (consumed by F2 render wiring — GridRenderer.renderBody takes it in the
   * `groupFlatRows` slot to render detail head/filler). Callers must not mutate the result (it returns the
   * internal backing/splice output as-is).
   *
   * @returns 합성된 flat 배열(변경 금지) / The composed flat array (do not mutate)
   */
  getFlatArray(): FlatItem[] {
    return this._flat();
  }

  /**
   * flat index 가 가리키는 행의 참조 정보를 해소한다(C0.3 쓰기 안전).
   * / Resolve the reference info for the row at a flat index (C0.3 write-safety).
   *
   * @param flatIndex - 합성된 flat 배열의 인덱스 / Index into the composed flat array
   * @returns 행 참조 정보 / Row reference info
   */
  resolveFlatRow(flatIndex: number): FlatRowRef {
    const item = this._flat()[flatIndex];
    if (item == null) return { kind: 'data' };

    // F2(11_design_F2_v2.md §3.4/C0.3): DetailManager 가 registerSplice 로 끼워 넣는 detail
    // head/filler 의사행. 반드시 _isGroup/isTreeNode 판별보다 먼저 걸러야 한다 — 두 검사 모두
    // 이 항목엔 매칭되지 않아(플래그 없음) 이 체크 없이는 "plain data row" 폴백으로 새어
    // rowId=undefined 인 잘못된 kind:'data' 를 반환하게 된다(INT-01 쓰기 안전 위반).
    if ((item as any)._isDetailFiller === true) return { kind: 'detailFiller', rowId: (item as any)._rowId };
    if ((item as any)._isDetailHead === true) return { kind: 'detailHead', rowId: (item as any)._rowId };

    if (_isGroup(item)) return { kind: 'group' };

    if (isTreeNode(item)) {
      const row = (item as any).data;
      return { kind: 'tree', rowId: row?.[this._d.rowIdField] };
    }

    // plain data row(T)
    const rowId = item[this._d.rowIdField];
    const dataIndex = this._d.getDataLayer().getDataIndexByRowId(rowId);
    const ref: FlatRowRef = { kind: 'data', rowId };
    if (dataIndex !== undefined) ref.dataIndex = dataIndex;
    // backing 이 교체된(group/tree) 상태에선 flatIndex 가 더 이상 display 순서와 무관하므로 비운다.
    if (!this._backing) ref.displayIndex = flatIndex;
    return ref;
  }

  /**
   * rowId → 현재 flat index. 없으면 -1. / rowId → current flat index; -1 if absent.
   *
   * @param rowId - 조회할 stable rowId / Stable rowId to look up
   * @returns flat index 또는 -1 / Flat index or -1
   */
  flatIndexOfRowId(rowId: string): number {
    this._ensureRevIndex();
    return this._revIndex!.get(rowId) ?? -1;
  }

  /**
   * flat index → rowId(data/tree 행일 때만). 그 외 null. / flat index → rowId (only for data/tree rows); null otherwise.
   *
   * @param flatIndex - 합성된 flat 배열의 인덱스 / Index into the composed flat array
   * @returns rowId 또는 null / rowId or null
   */
  rowIdOfFlat(flatIndex: number): string | null {
    const ref = this.resolveFlatRow(flatIndex);
    return (ref.kind === 'data' || ref.kind === 'tree') ? (ref.rowId ?? null) : null;
  }

  // ─── 내부 ──────────────────────────────────────────────
  private _flat(): FlatItem[] {
    let flat = this._backing ? this._backing() : this._d.getDataLayer().getData();
    for (const splice of this._splices) flat = splice(flat);
    return flat;
  }

  private _invalidate(): void {
    this._revIndex = null;
    this._revIndexSrc = null;
  }

  private _ensureRevIndex(): void {
    const flat = this._flat();
    if (this._revIndex && this._revIndexSrc === flat) return;
    const idx = new Map<string, number>();
    for (let i = 0; i < flat.length; i++) {
      const item = flat[i];
      if (item == null || _isGroup(item)) continue;
      // F2: detail head/filler 는 고유 데이터 행이 아니므로 역인덱스에서 제외(마스터 행 자신은
      // 스플라이스 전 위치 그대로 별도 인덱싱된다 — head/filler 는 그 "뒤"에 삽입되는 의사행).
      if ((item as any)._isDetailHead === true || (item as any)._isDetailFiller === true) continue;
      const row = isTreeNode(item) ? (item as any).data : item;
      const rid = row?.[this._d.rowIdField];
      if (rid != null) idx.set(rid, i);
    }
    this._revIndex = idx;
    this._revIndexSrc = flat;
  }
}
