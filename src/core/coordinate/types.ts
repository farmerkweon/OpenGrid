// ============================================================
// DD-02 좌표 타입 정본(SSOT) / DD-02 coordinate type source of truth
// 설계: DD-02 §2.0 · REQ-TX-841 · REQ-T8-807
// 좌표 공간을 브랜드 타입으로 구분해 model↔view↔pixel 혼용을 컴파일 타임에 차단한다.
// 값 객체(CellRect·IndexRange·CellPlacement)의 대표 소유 = DD-02.
// DD-03(렌더)·DD-05(CF)는 재선언하지 말고 본 파일에서 import 한다.
// ============================================================

/** 원본 데이터 행 인덱스(0-base). / Original data row index (0-based). */
export type ModelIndex = number & { readonly __brand: 'ModelIndex' };
/** filter/sort/group 후 가시 순번(0-base). / Visible order index after filter/sort/group. */
export type ViewIndex = number & { readonly __brand: 'ViewIndex' };
/** 표시 리프 컬럼 순번(0-base). / Visible leaf column index. */
export type LeafColIndex = number & { readonly __brand: 'LeafColIndex' };
/** 콘텐츠 절대 픽셀. / Content-absolute pixel. */
export type Px = number & { readonly __brand: 'Px' };

// ── 브랜드 생성자(커널 내부 전용) ──────────────────────────
// 소비처는 `as ViewIndex`/`as Px` 산발 캐스팅 금지(§4.4 lint). 반드시 커널 변환을 경유.
/** number → Px. / Brand a number as Px. */
export const px = (n: number): Px => n as Px;
/** number → ModelIndex. */
export const modelIndex = (n: number): ModelIndex => n as ModelIndex;
/** number → ViewIndex. */
export const viewIndex = (n: number): ViewIndex => n as ViewIndex;
/** number → LeafColIndex. */
export const leafColIndex = (n: number): LeafColIndex => n as LeafColIndex;

/** 반열림 index 범위 [start, end). 불변. / Half-open index range [start, end). Immutable. */
export interface IndexRange {
  readonly start: ViewIndex;
  readonly end: ViewIndex;
}

/**
 * 콘텐츠 좌표계 사각형(스크롤 절대·frozen 반영 전). 불변.
 * ★대표 소유(SSOT) = DD-02.
 * / Content-coordinate rectangle (scroll-absolute, pre-frozen). Immutable. Owned by DD-02.
 */
export interface CellRect {
  readonly x: Px;
  readonly y: Px;
  readonly w: Px;
  readonly h: Px;
}

/** 어느 팬(pane)에 속하는지 — 좌표 소비처의 컨테이너 선택 키. / Which pane a cell belongs to. */
export type PaneId = 'body' | 'frozen-left' | 'frozen-top' | 'frozen-corner';

/** 셀 하나의 완전 배치 — 소비처가 자체 산술 없이 그대로 쓴다. / Full placement of a single cell. */
export interface CellPlacement {
  readonly view: ViewIndex;
  readonly col: LeafColIndex;
  /** 콘텐츠 좌표 사각형(merge 반영). / Content-coordinate rect (merge-applied). */
  readonly rect: CellRect;
  /** 소속 팬(고정/본문). / Owning pane (frozen/body). */
  readonly pane: PaneId;
  /** merge 반영 세로 스팬. / Row span (merge). */
  readonly rowSpan: number;
  /** merge 반영 가로 스팬. / Column span (merge). */
  readonly colSpan: number;
  /** merge 에 삼켜진 셀(렌더 생략). / Cell swallowed by a merge (render-skipped). */
  readonly hidden: boolean;
}

/**
 * 반열림 index 범위 생성(불변식 start ≤ end 보증). / Build an IndexRange (guarantees start ≤ end).
 */
export function makeRange(start: number, end: number): IndexRange {
  const s = Math.max(0, Math.floor(start));
  const e = Math.max(s, Math.floor(end));
  return { start: viewIndex(s), end: viewIndex(e) };
}

/**
 * 콘텐츠 사각형 생성(불변식 w,h ≥ 0 클램프). / Build a CellRect (clamps w,h ≥ 0).
 */
export function makeRect(x: number, y: number, w: number, h: number): CellRect {
  return { x: px(x), y: px(y), w: px(Math.max(0, w)), h: px(Math.max(0, h)) };
}

/**
 * 경계 1회 언브랜드(§2.0 계약) — 소비처(DD-03 렌더)는 커널 출력 수령 지점에서 1회만 언브랜드하고
 * 내부는 순수 number 로 흐르되 좌표 재산술은 금지한다.
 * / Single unbrand at the boundary; consumers flow plain numbers inward without re-deriving coords.
 */
export function unbrandPx(rect: CellRect): { x: number; y: number; w: number; h: number } {
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}
