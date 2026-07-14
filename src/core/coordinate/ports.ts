// ============================================================
// DD-02 §2.4/2.7/4.3 포트·SPI·슬라이스 소유권 / DD-02 ports, SPI, slice ownership
// 커널이 의존하는 seam 계약. 헤드리스 — DOM 접근은 전부 shell 주입.
// ============================================================
import type { Px, ViewIndex, LeafColIndex, IndexRange } from './types.js';

/** 세로/가로 공통 윈도잉 포트(REQ-T3-817). / Common vertical/horizontal windowing port. */
export interface IWindowingPort {
  verticalWindow(scrollTop: Px, viewportH: Px): IndexRange;
  horizontalWindow(scrollLeft: Px, viewportW: Px): { start: LeafColIndex; end: LeafColIndex };
}

/** DOM 측정 이음새(humble shell 구현) — 커널은 촉발하지 않음. / DOM measurement seam (shell-implemented). */
export interface IMeasurementSeam {
  /** view 행들의 실제 렌더 높이 읽기(reflow 는 shell 책임). / Read rendered heights of rows. */
  measureRows(views: readonly ViewIndex[]): ReadonlyMap<ViewIndex, Px>;
  /** 컨테이너 clientHeight/Width 읽기(언바운드/0 감지 원천). / Read container box. */
  readViewportBox(): { height: number; width: number };
}

/** 병합 스팬 조회 어댑터 — MergeEngine.getInfo 를 커널 계약으로 래핑. 순수. / Merge span source. */
export interface IMergeSource {
  getInfo(view: ViewIndex, col: LeafColIndex): { rowSpan: number; colSpan: number; hidden: boolean } | null;
  readonly isEmpty: boolean;
}

/**
 * 슬라이스별 단일 소유자 규정(REQ-TX-841) — 비소유 모듈 직접 변이 차단(lint/런타임 가드 근거).
 * 좌표 커널은 아래 슬라이스를 읽기 전용 입력으로만 받는다.
 * / Single-owner map for state slices; the kernel takes these as read-only inputs only.
 */
export const SLICE_OWNERSHIP = {
  totalRows: 'DataLayer',
  viewOrder: 'SortFilterManager',
  scroll: 'ViewportController',
  frozen: 'ViewportController',
  viewport: 'ViewportController',
  rowHeight: 'AppearanceResolver',
  measured: 'MeasurementSeam',
  selection: 'SelectionModel',
} as const;

/** 슬라이스 키. / Slice key. */
export type SliceKey = keyof typeof SLICE_OWNERSHIP;
