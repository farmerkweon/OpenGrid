/**
 * DetailSplice — 상류 flat 배열에 F2 디테일 head/filler 의사행을 끼워 넣는 순수 함수.
 *
 * 계약 근거:
 *  - docs/design/grid-features-2026-07/11_design_F2_v2.md §2.2/§3.2(단방향 합성 체인의 마지막 단계:
 *    plain → group/tree(GroupTreeManager 소유) → **detail splice(이 파일)** → FlatRowModel.updateFlatModel),
 *    §4.1(DetailHeadRow/DetailFillerRow 형태), §7(그룹 헤더엔 미부착·트리 데이터 행엔 허용)
 *  - docs/design/grid-features-2026-07/15_cross_contracts.md C0.3(FlatRowRef.kind
 *    'detailHead'/'detailFiller' — filler 에 writeCell 절대 금지의 판별 재료)
 *
 * MVP는 (b) 정수-슬롯: 디테일 높이 = span(=ceil(height/rowHeight)) × rowHeight 개의 **정수 rowHeight
 * 슬롯**으로 표현한다. 1개 head(span 보유) + (span-1)개 filler. VirtualScroll 은 이 슬롯들도 여느
 * 인덱스와 동일한 rowHeight 로 보고 무변경(CON-1)으로 남는다.
 *
 * ⚠️ 이 함수는 실제 GroupTreeManager/FlatRowModel(둘 다 이 작업과 동시에 변경 중)을 import 하지
 * 않는다. 대신 GridRenderer.ts 가 이미 소비하는 런타임 관례(`_isGroup`/`_isTree` 플래그, 트리 노드의
 * `.data`)를 로컬 타입 가드로만 재선언해 상류 flat 항목을 분류한다 — 배선 단계에서 실제 등록
 * 어댑터가 이 함수를 호출한다.
 */

/** GroupTreeManager 산출물(GroupRow)과 동형의 최소 구조 — 로컬 판별용(실제 타입 import 안 함). */
interface GroupLikeItem {
  _isGroup: true;
}

/** TreeEngine TreeNode 와 동형의 최소 구조 — 로컬 판별용(실제 타입 import 안 함). */
interface TreeLikeItem<T = any> {
  _isTree: true;
  data: T;
}

/** F2 디테일 head 의사행(§4.1). span 개의 rowHeight 슬롯 중 첫 슬롯 — 실제 패널이 여기 그려진다. */
export interface DetailHeadItem<T = any> {
  _isDetailHead: true;
  _rowId: string;
  /** 마스터 원본 flat 항목(트리/그룹 컨텍스트 유지용, optional — §4.1). */
  _masterFlatBase?: T | GroupLikeItem | TreeLikeItem<T>;
  /** k = ceil(height/rowHeight). 슬롯 총 개수(head 포함). */
  _span: number;
}

/** F2 디테일 filler 의사행(§4.1). span-1 개. renderBody 는 이 인덱스를 만나면 continue(패널이 덮음). */
export interface DetailFillerItem {
  _isDetailFiller: true;
  _rowId: string;
}

export type DetailSplicedItem<T = any> = T | GroupLikeItem | TreeLikeItem<T> | DetailHeadItem<T> | DetailFillerItem;

/** 행별 슬롯수 콜백(옵션) — 지정 시 고정 height 대신 이 값을 사용(반올림 후 ceil 없이 그대로 슬롯수로 채택). */
export type SlotCountFn<T = any> = (row: T, rowId: string) => number;

export interface DetailSpliceOptions<T = any> {
  /** DetailState.expandedRowIds — stable rowId 앵커(정렬/필터 넘어 보존, FR-4/C0.5). */
  expandedRowIds: ReadonlySet<string>;
  /** 마스터 후보 row(T)에서 stable rowId 를 뽑는다. undefined/null 이면 해당 항목은 detail 부착 대상에서 제외. */
  getRowId: (row: T) => string | undefined | null;
  rowHeight: number;
  /** masterDetail.height(px). 기본 200. getSlotCount 미지정 시 이 값으로 ceil(height/rowHeight) 계산(EC-10 양자화). */
  height?: number;
  /** 지정 시 height 대신 이 콜백으로 슬롯수(정수, 최소 1) 결정 — masterDetail.detailRowCount 류 확장 지점. */
  getSlotCount?: SlotCountFn<T>;
}

function isGroupItem(item: any): item is GroupLikeItem {
  return !!item && item._isGroup === true;
}

function isTreeItem(item: any): item is TreeLikeItem {
  return !!item && item._isTree === true;
}

function isDetailPseudoRow(item: any): boolean {
  return !!item && (item._isDetailHead === true || item._isDetailFiller === true);
}

/**
 * §7: 디테일은 "leaf 데이터 행"에만 부착한다 — 그룹 헤더(FlatRowRef.kind==='group')는 대상에서
 * 제외, 트리 노드의 데이터 행은 허용, 이미 detail 의사행인 항목은 재적용하지 않는다(방어적 멱등).
 */
function isEligibleMaster(item: any): boolean {
  if (item == null) return false;
  if (isDetailPseudoRow(item)) return false;
  if (isGroupItem(item)) return false;
  return true; // 일반 데이터 행(T) 또는 트리 노드(TreeLikeItem) — 둘 다 허용
}

/** 트리 노드면 내부 데이터 행을, 아니면 항목 자체를 반환(§7 "트리 데이터 행에 detail 부착"). */
function extractRow<T>(item: T | TreeLikeItem<T>): T {
  return isTreeItem(item) ? (item as TreeLikeItem<T>).data : (item as T);
}

function computeSlotCount<T>(row: T, rowId: string, opts: DetailSpliceOptions<T>): number {
  if (opts.getSlotCount) {
    const n = Math.floor(opts.getSlotCount(row, rowId));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  const height = opts.height ?? 200;
  const rowHeight = opts.rowHeight > 0 ? opts.rowHeight : 1;
  return Math.max(1, Math.ceil(height / rowHeight)); // EC-10: 비배수 양자화
}

/**
 * baseFlat(plain rows 또는 GroupTreeManager 산출물)을 순회하며, 펼쳐진 stable rowId 를 만난
 * 마스터 행 **직후**에 `[head, ...filler×(span-1)]` 를 삽입한다(§4.1). 순수 함수 — baseFlat 은
 * 변경하지 않고 새 배열을 반환한다.
 *
 * expandedRowIds 가 비어 있으면(펼침 0/F2 비활성) 항등에 가깝게 동작하되, §3.2 v2 규범대로
 * "DetailManager는 항상 최종 flat 소유자"이므로 얕은 복사본을 반환한다(호출자가 항상 새 배열을
 * updateFlatModel 에 넘기는 계약을 일관되게 유지하기 위함 — 참조 동일성에 의존한 버그 예방).
 */
export function spliceDetails<T = any>(
  baseFlat: ReadonlyArray<DetailSplicedItem<T>>,
  opts: DetailSpliceOptions<T>
): DetailSplicedItem<T>[] {
  const out: DetailSplicedItem<T>[] = [];
  if (opts.expandedRowIds.size === 0) {
    for (const item of baseFlat) out.push(item);
    return out;
  }

  for (const item of baseFlat) {
    out.push(item);
    if (!isEligibleMaster(item)) continue;

    const row = extractRow(item as T | TreeLikeItem<T>);
    const rowId = row != null ? opts.getRowId(row) : null;
    if (rowId == null || !opts.expandedRowIds.has(rowId)) continue;

    const span = computeSlotCount(row, rowId, opts);
    const head: DetailHeadItem<T> = {
      _isDetailHead: true,
      _rowId: rowId,
      _masterFlatBase: item as T | GroupLikeItem | TreeLikeItem<T>,
      _span: span,
    };
    out.push(head);
    for (let i = 1; i < span; i++) {
      out.push({ _isDetailFiller: true, _rowId: rowId } as DetailFillerItem);
    }
  }
  return out;
}
