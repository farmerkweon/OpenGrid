// ============================================================
// 넓은 그리드 성능(2026-11) — 그리기 요청·계획 계약(헤드리스) / Render request & plan contracts (headless)
// 복사 위치 / copy to: src/core/domain/render/ports.ts
// 구현 없음(단 Change 는 런타임 상수 하나). 정본: design/DESIGN.md §3 (D13 「그리기 요청 → 최소 작업」). rev2.
// ============================================================
import type { IColumnWindow, RowSpan } from '../../coordinate/geometryPorts.js';

/**
 * 「무엇이 바뀌었나」 비트. 내는 쪽은 자기가 바꾼 것만 말한다. 무엇을 다시 그릴지는 RenderPlanner 혼자 정한다.
 * 처음(R7 걸음)에는 모든 호출처가 All 로 시작하고 원인별로 하나씩 좁힌다.
 */
export const Change = {
  /** 세로 위치만(행 집합·내용 그대로). */
  RowsScrolled: 1 << 0,
  /** 가로 위치만. */
  ColsScrolled: 1 << 1,
  /** 컬럼 폭(끄는 중·놓음·API). 끄는 동안의 쓰기도 이 요청으로 스케줄러를 거친다(rev2 K3). */
  ColWidth: 1 << 2,
  /** 보이는 행의 「무엇」이 바뀜: setData·필터·행 추가/삭제/이동·묶음 펼침. */
  RowSet: 1 << 3,
  /** 행 집합은 같고 순서만(정렬). 푸터 합계는 안 바뀐다. */
  RowOrder: 1 << 4,
  /** 선택·체크·행 상태 — 내용 그대로. */
  RowState: 1 << 5,
  /** 포커스 칸 이동. */
  Focus: 1 << 6,
  /** 칸 몇 개의 값. */
  CellValue: 1 << 7,
  /** 범위 선택 면. */
  Range: 1 << 8,
  /** 컬럼 구성: 숨김·보임·고정·순서·시트 전환·병합 지정. */
  Columns: 1 << 9,
  /** 컨테이너 크기. */
  Viewport: 1 << 10,
  /** 테마·스킨·밀도·로케일·마스킹 토글. */
  Appearance: 1 << 11,
  /** 정렬 표시만(머리글 화살표·aria-sort·눌림/진행). */
  SortIndicator: 1 << 12,
  /** 지금처럼 통째로(R7 의 출발점, 원인을 모를 때). */
  All: (1 << 13) - 1,
} as const;
export type ChangeMask = number;

export interface CellPos { readonly ri: number; readonly ci: number }
export interface CellKey { readonly ri: number; readonly field: string }

/**
 * 명시 행 범위(rev2 K1). 지금 코드의 세 갈래를 그대로 표현한다:
 *  - null      : 보이는 범위(VirtualScroll.getVisibleRange — 지금의 `_doRender(...this._visRange())`)
 *  - RowSpan   : 그 범위 그대로(지금의 묶음·나무·디테일 `doRenderFull(n) => _doRender(0, n−1)` — 전 행)
 *  - 'clear'   : 본문을 비우고 끝냄(지금의 MutationService `doRenderFull: () => _doRender(0, −1)`)
 * R7(빼내기)은 이 뜻을 바꾸지 않는다 — 「.og-row 수 = 지금」이 증거.
 */
export type ExplicitRows = RowSpan | 'clear' | null;

export interface RequestDetail {
  /** CellValue 일 때. */
  readonly cells: readonly CellKey[];
  /**
   * Focus 일 때 새 포커스 칸만(rev3.1 Q-15). 옛 칸은 요청에 싣지 않는다 — 플래너가 DrawnState.focus(그려 둔 포커스 칸)에서 얻는다.
   * 그래서 여러 Focus 요청을 합쳐도 「마지막 칸」 하나면 된다.
   */
  readonly focusTo: CellPos | null;
  /** ColWidth 일 때 바뀐 가장 왼쪽 잎. 진단용 — 계획·반영은 기하의 변화 몫(changesSince)을 쓴다. */
  readonly widthChangedFrom: number | null;
  /** 명시 행 범위(위). 여러 요청을 합치면 null 이 아닌 쪽, 둘 다면 뒤 요청. */
  readonly rows: ExplicitRows;
  /** true = 이 호출이 끝날 때 DOM 이 맞아 있어야 함(공개 API 의 동기 계약 — 그 자리에서 flush). */
  readonly sync: boolean;
}

/**
 * 불변 값 객체. changes === 0 이면 할 일 없음.
 * merge 규칙(rev3.1 Q-15 · rev3 N6): **교환·결합** = changes(OR) · cells(합집합) · widthChangedFrom(작은 쪽) · sync(OR).
 * **나중 요청이 이김**(순서 있음 — 스케줄러는 제출 순서대로 합침) = rows(단 null 은 상대를 이기지 못함) · focusTo(null 은 상대를 이기지 못함).
 * 시험은 두 갈래로 가른다(U-REQ).
 */
export interface IRenderRequest {
  readonly changes: ChangeMask;
  readonly detail: Readonly<RequestDetail>;
  has(mask: ChangeMask): boolean;
  merge(other: IRenderRequest): IRenderRequest;
}

/** 지금 그려져 있는 상태(BodyView 가 유일하게 앎 — 읽기 전용 스냅숏). */
export interface DrawnState {
  /** null = 아직 안 그림. 'clear' = 비워 둔 상태. */
  readonly rows: RowSpan | 'clear' | null;
  readonly columns: IColumnWindow | null;
  readonly pinned: { readonly editRow: number | null; readonly editCol: number | null; readonly focusRow: number | null };
  /** 지금 그려 둔 포커스 칸(없으면 null) — Focus 계획의 from(rev3.1 Q-15). */
  readonly focus: CellPos | null;
  /** 그려진 행 종류에 세로 병합·묶음·나무·디테일·autoHeight 가 있나(행 차분 불가). */
  readonly diffBlocked: boolean;
  /**
   * 컬럼별 「잘린 칸 글자가 말줄임을 지켜 주는 최대 폭」(잘린 칸이 없으면 Infinity). rev2 K3:
   * 다시 채우기를 정하는 곳은 RenderPlanner 하나 — binder 는 묻지 않는다.
   */
  readonly coverWidths: readonly number[];
}

/** 이번 프레임에 그려야 할 상태 — RenderScheduler 가 VirtualScroll·ColumnWindowPolicy·ColumnGeometry 에 물어 만든다. */
export interface NextState {
  readonly rows: RowSpan | 'clear';
  readonly columns: IColumnWindow;
  /** 기하 폭(읽기 전용 뷰 — 사본 아님). 다시 채우기 판정용. */
  readonly columnWidths: readonly number[];
  /** 이 기하 판 이후 바뀐 것을 반영해야 함(스케줄러가 마지막으로 반영한 판). */
  readonly geometryVersion: number;
  readonly appliedGeometryVersion: number;
}

/** 행 축 일. */
export type RowWork = 'none' | 'diff' | 'rebuild' | 'clear';
/** 창(가로) 축 일. 대각선 스크롤(가로+세로 같은 프레임)은 rows:'diff' + cols:'shift' 둘 다(rev2 K2). */
export type ColWork = 'none' | 'shift';
export type HeaderWork = 'none' | 'sortIndicator' | 'rebuild';
/** 푸터: 캐시하지 않는다(rev2 K4). 부르는 때를 계획 표가 줄인다 — RowSet·CellValue·All 에서만 'values'. */
export type FooterWork = 'none' | 'values' | 'rebuild';

/**
 * 한 프레임에 할 최소 일(불변 값). 실행 순서: geometry → rows → cols → refill → 나머지.
 * rows:'rebuild'|'clear' 면 cols 는 'none'(새로 그릴 때 이미 새 창으로).
 * 불변: 실행 결과 화면 = 같은 자료로 통째로 다시 그린 화면(대조 시험 — 대각선 걸음 포함).
 */
export interface IRenderPlan {
  readonly rows: RowWork;
  readonly cols: ColWork;
  readonly header: HeaderWork;
  readonly footer: FooterWork;
  /** 기하 투영 반영(GeometryApplier.applyChange(geometry.changesSince(applied))). */
  readonly geometry: boolean;
  /** 잘린 칸 글자 다시 채우기가 필요한 컬럼 = next.columnWidths[ci] > drawn.coverWidths[ci] 인 창 안 컬럼. */
  readonly refillColumns: readonly number[];
  /** 선택·체크 배경만 다시 칠할 행. */
  readonly rowStateRows: readonly number[];
  /** 포커스 옮김. to 가 null 이면 지울 칸(from)만 있다(새 포커스 칸 없음). */
  readonly focus: { readonly from: CellPos | null; readonly to: CellPos | null } | null;
  readonly cells: readonly CellKey[];
  /** 범위 덧그림(좌표 계산) 다시. */
  readonly overlay: boolean;
  readonly next: NextState;
  /** 할 일이 하나도 없으면 true(프레임을 그냥 넘김). */
  readonly empty: boolean;
}

/**
 * rev3.1 Q-18·Q-17: 걸음마다 켜는 규칙 묶음. 꺼진 규칙의 요청은 「통째(rows:'rebuild')」로 떨어진다(안전한 쪽).
 * R7 에서는 전부 false(= 지금처럼 통째), 각 걸음이 자기 것을 켠다(STR 이 배선에서 생성자 인자로). 정본 표는 DESIGN.md §14-2.
 */
export interface PlannerFeatures {
  /** C1: SortIndicator·RowOrder 를 머리글 정렬 표시만·창 다시 1번으로(머리글 다시 만들기 0). */
  readonly sortIndicatorOnly: boolean;
  /** C5: 푸터 값을 RowSet·CellValue·All 에서만. */
  readonly footerGating: boolean;
  /** C7: 스크롤 요청에서 그려 둔 범위가 그대로면 할 일 0. */
  readonly scrollSkip: boolean;
  /** C8: ColWidth 를 기하 반영만(+다시 채우기). */
  readonly geometryOnly: boolean;
  /** C9: 가로 창(cols:'shift'). */
  readonly columnWindow: boolean;
  /** C11: 세로 행 차분(rows:'diff'). C11 관문 전에는 false. */
  readonly rowDiff: boolean;
  /** C12: RowState·Focus·CellValue·Range 를 작은 갱신으로. */
  readonly smallUpdates: boolean;
}

/** 요청 + 그려 둔 상태 + 다음 상태 → 최소 계획. 규칙은 표(데이터, DESIGN.md §14-2 가 정본). DOM 없음. */
export interface IRenderPlanner {
  plan(req: IRenderRequest, drawn: DrawnState, next: NextState): IRenderPlan;
}
