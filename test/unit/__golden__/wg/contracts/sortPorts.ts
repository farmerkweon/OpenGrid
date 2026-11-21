// ============================================================
// 넓은 그리드 성능(2026-11) — 정렬 계약(헤드리스) / Sort contracts (headless)
// v4(C2, DESIGN §17-4·17-7): 출발 순서를 인자 start 로(keyColumnFor·sortNow·sortInteractive) · SortComparator 넷째 인자 SortDir | undefined.
// v4(C3): ISortKeyStore.noteSorted?(key, sorted, dir) — 정렬 결과로 다음 정렬의 등수를 매김(선택 메서드라 기존 가짜 저장소 그대로).
// 복사 위치 / copy to: src/core/domain/sort/ports.ts
// 구현 없음. 정본: design/DESIGN.md §2 D7·§3. rev2.
// 세 전략을 가른다: ① 키 뽑기(ISortKeyColumn) ② 순서 매기기(ISortOrderer) ③ 실행 방식(ISortRunner).
// 알고리즘 조사 반영: ② 에 LcpMergeOrderer(긴 공통 머리말), ③ 에 WindowFirstSortRunner(화면 구간 먼저, 조건부 C13b)를 더한다 — 나머지 무수정.
// ============================================================

/** DataLayer 가 구현. 정렬 출발점 = 지금 표시 순서(삭제 행 제외) — 안정 정렬의 「직전 순서」 보존(S-11). */
export interface IRowSource<T = unknown> {
  /** 원 자료(읽기 전용 뷰 — 복사 아님). */
  readonly rows: readonly T[];
  displayOrder(): readonly number[];
}

export type SortDir = 'asc' | 'desc';
export interface SortSpec { readonly field: string; readonly dir: SortDir }

/** 지금 applySort 의 비교자 꼴(OverrideKernel 'sortComparator' 슬롯과 같은 서명). */
/** 정렬 목록에 방향이 빠지면 dir 은 undefined 로 온다(채우지 않는다 — 옛 고리와 같음). */
export type SortComparator = (a: unknown, b: unknown, field: string, dir: SortDir | undefined) => number;

/** 시간 자르기 포트(rAF/MessageChannel 은 구현, 시험은 가짜 시계). */
export interface ITaskScheduler {
  now(): number;
  next(cb: () => void): number;
  cancel(id: number): void;
}

/**
 * ① 키 뽑기 — 한 컬럼의 값을 비교 가능한 키로 한 번 뽑아 둔다.
 * 구현: NumberKeyColumn(Float64Array + null 표지) / StringKeyColumn(String() 한 번) / GeneralKeyColumn(지금 비교자 그대로).
 * 불변: compare 의 부호는 DEFAULT_SORT_COMPARATOR(오름차순, null/undefined 먼저)와 같다.
 * rev3.1 Q-27: 옛 비교자가 일관되지 않는 값(NaN 이 섞인 숫자 열 등 — 비교 결과가 NaN)이 있으면 Number/String 키 열을 만들지 않고
 * GeneralKeyColumn 으로 떨어지며, ComparisonOrderer 는 그 경우 **같은 출발 배열에 옛 비교자를 그대로 넘겨 Array.prototype.sort** 를 부른다
 * → 같은 엔진·같은 입력·같은 비교자라 순서가 지금과 바이트까지 같다(대조 시험이 그대로 성립).
 */
export interface ISortKeyColumn {
  readonly field: string;
  readonly kind: 'number' | 'string' | 'general' | 'ranked';
  /** 원시값만 보관 가능(Date 등 객체 값은 false — 제자리 수정이 === 를 통과하므로). */
  readonly cacheable: boolean;
  /** 모델 행 번호 i, j 의 오름차순 비교. */
  compare(i: number, j: number): number;
  /** 문자열 키면 그 키(순서 매기기 전략이 머리말 기억·기수 정렬에 쓴다), 아니면 null. */
  stringKeyAt(i: number): string | null;
}

/** 등수 보관(값 객체). 같은 값 = 같은 등수. */
export interface IRankIndex {
  readonly field: string;
  compare(i: number, j: number): number;
  /** O(n) 낡음 검사: 같은 자리의 원시값이 보관값과 === 인가. */
  isFreshFor(rows: readonly unknown[]): boolean;
}

/**
 * 등수 보관의 유일한 주인. 무효화 호출을 변경 지점에 흩지 않는다(낡음은 값 검사로).
 * rev2(검토 §4): 등수가 순서 매기기에 들어가는 길 — 저장소는 비교 함수가 아니라 **키 열**을 준다.
 * 등수가 있으면 `RankedKeyColumn`(ISortKeyColumn 의 한 구현, 정수 비교·stringKeyAt=null), 없으면 새로 뽑은 Number/String/General 키 열.
 * 그래서 ISortOrderer 는 등수가 있든 없든 같은 입력(ISortKeyColumn[])을 받는다. 같은 값 = 같은 등수라 순서 결과는 같다.
 */
export interface ISortKeyStore {
  /** 낡았으면 다시 만들고, cacheable 이 아니면 보관하지 않는다. */
  /** start = 이번 정렬의 출발 순서(원 자료 색인). 이 행들의 값만 읽는다. */
  keyColumnFor(spec: SortSpec, cmp: SortComparator, start: readonly number[]): ISortKeyColumn;
  /**
   * 정렬이 끝났다는 알림(선택). key 가 이 저장소가 내준 키 열이면 결과 순서를 기억해 두었다가, 같은 컬럼을 다시 정렬할 때
   * 그 순서에서 등수를 매긴다(이웃 비교 n 번). 첫 키에 대해서만 부른다.
   */
  noteSorted?(key: ISortKeyColumn, sorted: ArrayLike<number>, dir: SortDir | undefined): void;
  /** setData·clearData 때 메모리만 푼다. */
  clear(): void;
}

/**
 * ② 순서 매기기 — 출발 순서 + 비교 → 안정 정렬 결과.
 * 이번 판 구현: ComparisonOrderer(안정 비교 정렬) · LcpMergeOrderer(문자열 키 전용, 표본을 정렬한 뒤 이웃 공통 머리말 평균으로 고름).
 * 불변: 결과 순서 = 출발 순서에서 안정 비교 정렬한 순서(어느 구현이든 같은 결과 — 대조 시험).
 */
export interface ISortOrderer {
  readonly id: string;
  /** 이 키·행 수에 쓸 수 있나(예: 문자열 키 전용 전략은 general 키면 false). */
  accepts(keys: readonly ISortKeyColumn[], rowCount: number): boolean;
  order(start: readonly number[], keys: readonly ISortKeyColumn[], dirs: readonly SortDir[]): Int32Array;
}

/** 진행 중 정렬 하나. onDone 은 많아야 한 번, cancel 뒤엔 안 불림. */
export interface SortJob {
  readonly done: boolean;
  cancel(): void;
  onDone(cb: (order: Int32Array) => void): void;
  /**
   * rev2 K12: 그 자리에서 동기로 끝내고 전체 순서를 돌려준다(이미 끝났으면 그대로).
   * rev3 P5: DataLayer 는 **모든 공개 메서드의 첫 줄**에서 미확정이면 이것을 먼저 부른다(예외: 순서와 무관한 14개 — DESIGN.md D7 보강 6).
   * 미확정 중 applySort·applyFilter·setFindFilter·setData·clearData 는 settle 이 아니라 cancel 후 진행.
   */
  settle(): Int32Array;
  /**
   * rev2 K12: 「화면 구간 먼저」 실행기만 — 최종 순서의 [start, end) 구간(확정된 값)을 돌려준다. 못 주면 null.
   * 이 구간은 최종 순서와 한 칸도 다르지 않다(대조 시험).
   */
  peekWindow(start: number, end: number): Int32Array | null;
}

/**
 * ③ 실행 방식 — 한 번에(SyncSortRunner) / 조각으로(SlicedSortRunner, 지연 청크, 조각 8ms) /
 * 화면 구간 먼저(WindowFirstSortRunner — 조건부 걸음 C13b: 구간 고르기(quickselect 두 번) + 구간 정렬 → 나머지는 조각으로).
 * 양보 수단: scheduler.yield() 가 있으면 쓰고 없으면 MessageChannel(ITaskScheduler 구현 안).
 * 구간 먼저 실행기에 넘기는 구간은 run 뒤 setWindow 로 준다.
 */
export interface ISortRunnerWindowed {
  setWindow(start: number, end: number): void;
}
/**
 * 불변: 같은 입력이면 어느 실행기든 같은 순서. 그리드당 진행 중 작업은 많아야 하나(새 작업이 앞 작업 취소).
 */
export interface ISortRunner {
  run(start: readonly number[], keys: readonly ISortKeyColumn[], dirs: readonly SortDir[], orderer: ISortOrderer): SortJob;
}

/** 「얼마나 걸릴까」의 주인. 틀려도 결과는 같고 늦게 끝날 뿐이라 정교할 필요 없다. */
export interface ISortCostEstimate {
  readonly expectedMs: number;
  prefersSlicing(thresholdMs?: number): boolean;
}

/** 조립 파사드 — DataLayer·SortFilterManager 가 아는 것은 이것뿐. */
export interface ISorter {
  /**
   * orderBy()·applySort 용 — 늘 동기. 사용자 비교자면 general 키로 지금 비교 그대로.
   * start = 출발 순서(표시 순서의 주인이 정렬을 시작할 때 한 번 뽑아 넘김 — 같은 값끼리는 이 순서를 지킨다).
   */
  sortNow(specs: readonly SortSpec[], cmp: SortComparator, start: readonly number[]): readonly number[];
  /** 머리글 누름 — 추정이 문턱(100ms)을 넘으면 나눠서. */
  sortInteractive(specs: readonly SortSpec[], cmp: SortComparator, start: readonly number[]): SortJob;
}

/**
 * rev3 P5: 그리기 전용 접근자(DataLayer 가 구현, 내부 — 공개 API 아님). 첫 화면을 settle 없이 그릴 수 있는 유일한 길.
 * 미확정이면 peekWindow 로 받은 [s, e) 안은 확정 구간에서, 밖은 settle 후. 쓰는 곳: BODY 그리개 · VP FlatRowModel.resolveForPaint 만.
 */
export interface IPaintRowSource<T = unknown> {
  paintRowAt(viewIndex: number): T | undefined;
  paintRowStateAt(viewIndex: number): string;
  /** 진단: 지금까지 settle 이 실제로 일어난 횟수(시험 「첫 프레임 settle 0」). */
  readonly settleCount: number;
  /** 진단(rev3.1 Q-39): 지금 미확정 정렬이 있나. */
  readonly pending: boolean;
}

/**
 * rev3.1 Q-39: 시험 이음새(내부) — Sorter 생성자 옵션. 실행기 고르기를 작은 자료에서도 강제한다. 기본 undefined(비용 추정으로 고름).
 */
export interface SorterTestOptions {
  readonly forceRunner?: 'sync' | 'sliced' | 'windowFirst';
}
