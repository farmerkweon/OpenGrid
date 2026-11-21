// ============================================================
// 넓은 그리드 성능(2026-11) — 기하·창·글자·높이 계약(헤드리스) / Geometry, window, text & height contracts (headless)
// 복사 위치 / copy to: src/core/coordinate/geometryPorts.ts   (S0 걸음, 구조 레인이 그대로 복사)
// 구현 없음 — 타입만. DOM 전역 참조 금지(arch:check headless + rev2 K8 규칙: 헤드리스 → render/ import 금지, DOM 형 낱말 금지). 정본: design/DESIGN.md §3. rev2.
// ============================================================
import type { Px, LeafColIndex, ViewIndex } from './types.js';

// ── 여분 컬럼(상태·끌기·행번호·체크·디테일 토글) ─────────────────────
/** 여분 컬럼 종류. 그리는 순서는 이 나열 순서와 같다(state→drag→rowNumber→check→detail). */
export type ExtraColumnId = 'state' | 'drag' | 'rowNumber' | 'check' | 'detail';

/** 여분 컬럼의 켜짐·순서·폭을 아는 유일한 곳(불변 값). / Sole owner of extra-column on/off, order, width. */
export interface IExtraColumns {
  readonly ids: readonly ExtraColumnId[];
  widthOf(id: ExtraColumnId): Px;
  /** 고정(sticky) 때 left. leftOf(ids[0]) = 0. */
  leftOf(id: ExtraColumnId): Px;
  /** Σ 켜진 여분 컬럼 폭. */
  width(): Px;
  // 계약 변경 v5 extra(C15): 디테일 28px 를 뺀 합 legacyWidthWithoutDetail 삭제 — 여분 폭의 답은 width() 하나.
}

// ── 컬럼 기하 ───────────────────────────────────────────────────
/** 기하가 바뀐 몫. 값을 바꾸는 메서드가 돌려준다. / What changed in geometry. */
export interface GeometryChange {
  /** 아무것도 안 바뀜(같은 폭을 다시 넣은 경우 등). */
  readonly none: boolean;
  /** 폭이 바뀐 표시 잎 컬럼 번호(오름차순). */
  readonly widthCols: readonly LeafColIndex[];
  /** 이 컬럼부터 left 가 바뀜(없으면 count). */
  readonly leftFrom: LeafColIndex;
  readonly totalChanged: boolean;
  /** 컬럼 수·순서·여분 컬럼·고정 수가 바뀜 → 투영을 처음부터 다시 깔아야 함. */
  readonly structural: boolean;
  /** 바뀐 뒤 기하 판 번호. */
  readonly version: number;
}

/**
 * 컬럼 기하 읽기 포트 — 그리기 객체·창 정책·범위 계산은 이것만 안다.
 * 불변: leftOf(0) = extra.width(); leftOf(i+1) − leftOf(i) = widthOf(i); totalWidth() = leftOf(count).
 * / Read port of column geometry. left includes extra columns.
 */
export interface IColumnGeometry {
  readonly version: number;
  /** 표시 잎 컬럼 수. */
  readonly count: number;
  /** 왼쪽 고정 잎 컬럼 수. 늘 [0, count] 로 잘려 있다(옵션 값이 컬럼 수보다 커도 count 를 넘지 않음). */
  readonly frozenCount: number;
  readonly extra: IExtraColumns;
  widthOf(ci: LeafColIndex): Px;
  /** 여분 컬럼 폭을 포함한 내용 좌표의 왼쪽. */
  leftOf(ci: LeafColIndex): Px;
  /** [ci, ci+span) 폭의 합(가로 병합·푸터 colspan). */
  spanWidth(ci: LeafColIndex, span: number): Px;
  totalWidth(): Px;
  /** 고정 구역 오른쪽 끝(= leftOf(frozenCount)). */
  frozenRight(): Px;
  /** 내용 x → 그 x 를 담는 잎 컬럼(이분 탐색). x 가 여분 구역이면 0. */
  colAt(x: Px): LeafColIndex;
  /** 읽기 전용(얼린) 폭 배열 — 바뀔 때마다 새 배열. RenderController 가 머리글·본문에 넘기는 폭이 이것이다(deps getColWidths() 는 계산 결과 날 배열을 그대로 줌 — 내보내기·푸터의 빈 폭 규칙 때문). */
  widths(): readonly number[];
  /**
   * rev2 K3: 그 판 이후 바뀐 몫을 합쳐 돌려준다(스케줄러가 「마지막으로 DOM 에 반영한 판」을 들고 프레임마다 묻는다).
   * 같은 판이면 change.none. 구조 변경이 끼면 structural.
   */
  changesSince(version: number): GeometryChange;
}

/**
 * 컬럼 폭 쓰기 포트 — 너비 조절(끄는 동안·놓을 때·Esc)이 폭을 바꾸는 유일한 길. 구현은 폭 입력의 주인(RenderController.setUserWidth):
 * 폭을 정수로 만든 뒤 계산 결과 배열과 기하에 같은 값을 쓰고, 기하의 바뀐 몫을 돌려준다. 기하 쓰기 포트(IColumnGeometryWriter)는 넘기지 않는다.
 *
 * Column width write port — the only way width resizing (drag, release, Esc) changes a width. Implemented by the width owner
 * (RenderController.setUserWidth): rounds to an integer, writes the same value to the computed-width array and the geometry,
 * and returns the geometry change. The geometry writer port itself is never handed out.
 */
export interface IColumnWidthWriter {
  setWidth(ci: LeafColIndex, width: number): GeometryChange;
}

/** 기하 쓰기 포트 — 넘겨받는 레인 없음: RenderController 안(syncGeometry 의 reset, setUserWidth 의 resize)에서만 쓴다(계약 v4, 17-1). */
export interface IColumnGeometryWriter extends IColumnGeometry {
  /**
   * 폭 배열·여분·고정 수를 통째로 갈아 넣음(recalcWidths·컬럼 구성 변경). 다시 계산된 폭이라 **0 이상 유한한 폭은 그대로** 든다
   * (0·소수 포함, 반올림·하한 없음 — 폭 0 컬럼도 지금처럼 0px). 음수·NaN·무한대는 0, 아주 큰 값은 상한으로 자른다(누적 합이 단조·유한하게).
   */
  reset(widths: readonly number[], extra: IExtraColumns, frozenCount: number): GeometryChange;
  /**
   * 컬럼 하나의 폭. 입력 이벤트마다 불려도 된다(헤드리스·50컬럼 부분합 다시 셈 — 무해). DOM 쓰기는 스케줄러가 프레임당 한 번.
   * rev2 S3: 안쪽 ColumnMetrics 는 불변 값이라 부를 때마다 새로 만든다. 받은 폭은 정수 px 로 반올림하고 1 이상으로 든다(끄는 x 가 소수여도 칸 폭은 정수 — 최소 폭은 사용자 끌기 길에만) — v3 X-3.
   */
  resize(ci: LeafColIndex, width: number): GeometryChange;
}

// ── 보이는 가로 상자 ──────────────────────────────────────────────
/** 본문 상자의 가로 상태. 그리는 길에서 DOM 을 읽지 않으려고 값으로 넘긴다. width 0 = 모름. */
export interface ViewportBox {
  readonly scrollLeft: number;
  readonly width: number;
}

// ── 컬럼 창 ─────────────────────────────────────────────────────
/** 닫힌 구간 [from, to] (표시 잎 번호, 둘 다 포함). 폭은 spanWidth(from, to − from + 1). */
export interface WindowSegment {
  readonly from: LeafColIndex;
  readonly to: LeafColIndex;
}

/**
 * DOM 으로 둘 컬럼 집합(불변 값). 이번 판 정책은 「고정 구간 + 연속 구간 하나」만 내지만
 * 소비자는 반드시 segments/gaps 로 순회한다(다음 판에 구간 여럿을 내도 소비자 무수정).
 * 불변: 고정 컬럼 [0, F-1] 은 늘 포함 · 구간은 겹치지 않고 오름차순 · full 이면 빈칸 없음(지금 DOM 과 같음).
 */
export interface IColumnWindow {
  /** 이 창을 계산한 표시 잎 컬럼 수(구간·빈칸은 [0, count − 1] 안). */
  readonly count: number;
  readonly full: boolean;
  readonly segments: readonly WindowSegment[];
  contains(ci: LeafColIndex): boolean;
  forEachColumn(fn: (ci: LeafColIndex) => void): void;
  /** 빈칸이 덮을 구간(구간 사이·창 오른쪽 끝 뒤). full 이면 []. */
  gaps(): readonly WindowSegment[];
  equals(other: IColumnWindow): boolean;
}

/** 창 계산 입력. */
export interface WindowQuery {
  readonly box: ViewportBox;
  /** 화면 밖이어도 그릴 컬럼(편집 중·키보드 포커스 직후). */
  readonly pinned: readonly LeafColIndex[];
}

/** 이 그리드 상태의 모양(규칙 판정 입력). */
export interface GridShape {
  readonly autoHeight: boolean;
  readonly viewportWidth: number;
  /** 병합이 하나도 없나 — 창 규칙이 「병합이 있나」를 묻는 유일한 원천(규칙·정책에 병합 원천을 따로 넘기지 않는다). */
  readonly mergeEmpty: boolean;
  readonly virtualColumns: boolean;
}

/**
 * 「창을 써도 되나」 규칙 하나. 규칙끼리 서로 모른다. 하나라도 false 면 전 컬럼.
 * rev2 S7: 클래스가 아니라 객체 리터럴(id + 함수) 목록 — 조건식이지 종류 가르기가 아니다. id 는 진단용.
 */
export interface WindowRule {
  readonly id: 'autoHeight' | 'unknownWidth' | 'mergeActive' | 'optOut' | (string & {});
  readonly allowsWindow: (shape: GridShape) => boolean;
}

/** 지금 어느 컬럼을 DOM 으로 둘지 정하는 유일한 곳. / Sole owner of the horizontal column window. */
export interface IColumnWindowPolicy {
  compute(q: WindowQuery, shape: GridShape): IColumnWindow;
  /** 이력: 그려 둔 창이 「보이는 범위 + 여유의 절반」을 아직 덮나. */
  covers(drawn: IColumnWindow, q: WindowQuery): boolean;
}

// ── 글자 상한 ───────────────────────────────────────────────────
/**
 * 글꼴 지표 — 원천은 기존 `appearance/ResolvedAppearanceSnapshot.ts`(유일한 getComputedStyle 접점, arch BOUNDARY).
 * rev2 K5-2: 그 스냅숏은 지금 font{family,size,lineHeight:1.4} 만 준다 → BODY 레인이 같은 파일에서 `--og-cell-padding`
 * 을 읽어 padX/padY 를 함께 내놓게 더한다(새 getComputedStyle 접점을 만들지 않음). wrap 칸 줄 높이는 1.4 가 아니라 base.css 의 1.35 × fontPx.
 */
export interface TypeMetrics {
  readonly fontPx: number;
  /**
   * 줄 높이 px. rev3.1 Q-11: 여러 줄 칸 줄 수 식은 **이 값**을 쓰고, 제공자(BODY)가 base.css 의 wrap 칸 값 1.35 × fontPx 로 채운다
   * (ResolvedAppearanceSnapshot 의 lineHeight 1.4 는 머리글·한 줄 칸 몫이라 쓰지 않음).
   */
  readonly lineHeightPx: number;
  /** 칸 좌우 안쪽 여백 합(px). */
  readonly padX: number;
  /** 칸 위아래 안쪽 여백 합(px). */
  readonly padY: number;
}

export interface TextSpec {
  readonly columnWidth: number;
  /** 본문 보이는 폭(한 줄 칸 덮는 폭의 하한). rev3.1 Q-10: 0(모름 — jsdom·숨은 컨테이너)이면 limit = Infinity(자르지 않음, UnknownWidthRule 과 같은 뜻). */
  readonly viewportWidth: number;
  /** wrap + 고정 행 높이 칸이면 rowHeight, 아니면 null(한 줄). */
  readonly wrapRowHeight: number | null;
  readonly metrics: TypeMetrics;
  /** autoHeight·상한 끔·template 렌더러 → true(전문). */
  readonly unlimited: boolean;
}

/**
 * 칸에 넣을 글자 수 상한과 그 상한이 말줄임을 지켜 주는 최대 폭을 정하는 유일한 곳.
 * 불변: 결과는 원문의 앞부분 · 서로게이트 쌍·결합 문자를 가르지 않음 · 폭 없는 글자가 자를 자리 앞에 있으면 전문.
 */
export interface ICellTextPolicy {
  /** Infinity = 자르지 않음. */
  limit(spec: TextSpec): number;
  /** 이 상한으로 채운 칸이 말줄임을 유지하는 최대 컬럼 폭(넘으면 다시 채움). */
  coverWidth(limit: number, spec: TextSpec): number;
  /** text 를 limit 에 맞춰 안전하게 자른다(앞부분). */
  fit(text: string, limit: number): string;
}

// ── 범위 테두리 좌표 ───────────────────────────────────────────────
export interface CellRangeLike {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: LeafColIndex;
  readonly endCol: LeafColIndex;
}
/** 범위 선택 테두리를 칸 DOM 이 아니라 기하·행 번호로 계산(창 밖 모서리·강제 배치 제거). */
export interface IRangeRectCalculator {
  rect(
    range: CellRangeLike,
    scroll: { readonly top: number; readonly left: number },
    rowHeight: number,
    headerHeight: number,
  ): { left: number; top: number; width: number; height: number };
}

// ── 세로 보이는 높이 판정(D8) ──────────────────────────────────────
export interface ViewportSample {
  readonly containerH: number;
  /**
   * 머리글 + 페이지 나누기(푸터는 넣지 않는다). 높이가 정해진 경우의 보이는 높이는 지금 식 그대로 containerH − chromeH.
   */
  readonly chromeH: number;
  /** 푸터 높이(없으면 0). 「내용이 높이를 정함」 등식 containerH == chromeH + footerH + contentH + hScrollbarH 에만 든다. */
  readonly footerH: number;
  /** 전체 행 × rowHeight. */
  readonly contentH: number;
  /** 본문 상자 배치 높이(jsdom = 0). */
  readonly bodyLayoutH: number;
  /** 본문 상자의 화면 좌표 top. */
  readonly bodyTop: number;
  /** 창·잘라 보이게 하는 조상들로 깎은 화면 구간(화면 좌표). */
  readonly visibleTop: number;
  readonly visibleBottom: number;
  /** bodyWrap.scrollHeight > clientHeight + 1 */
  readonly bodyScrollable: boolean;
  /**
   * rev2 K7: 본문 상자의 가로 스크롤바 높이 = bodyWrap.offsetHeight − clientHeight − 위아래 테두리(윈도 기본 약 17px, 헤드리스 측정은 0 —
   * Playwright 헤드리스 크로미움은 `--hide-scrollbars` 로 뜬다 [읽음 playwright-core coreBundle.js]). contentDriven 조건에 더한다.
   */
  readonly hScrollbarH: number;
  /** 옵트인 fallbackViewportHeight(준 경우만). */
  readonly fallbackViewportHeight?: number;
  /** 사용자가 끈 경우(pageVirtualization:false — 이름은 §8-d). */
  readonly pageVirtualization: boolean;
}

export type ViewportVerdict =
  | { readonly kind: 'bounded'; readonly viewportH: number }
  | { readonly kind: 'legacyClamp'; readonly viewportH: number }
  /** clip 은 본문 좌표(px). 이 구간 밖 행은 화면에 안 보인다. */
  | { readonly kind: 'contentDriven'; readonly viewportH: number; readonly clipTop: number; readonly clipBottom: number };

/** 컨테이너 높이가 정해진 상태인지, 내용이 높이를 정하는 상태인지 판정하는 유일한 곳. */
export interface IViewportHeightJudge {
  judge(sample: ViewportSample): ViewportVerdict;
}

/** 세로 창에 페이지 쪽 잘림을 알려 주는 포트(VirtualScroll 이 구현). */
export interface IVerticalClipTarget {
  setClip(clip: { readonly top: number; readonly bottom: number } | null): void;
}

/** 행 범위(반열림). */
export interface RowSpan {
  readonly start: ViewIndex;
  readonly end: ViewIndex;
}
