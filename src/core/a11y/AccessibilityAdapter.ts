// ============================================================
// DD-12 §2.2 단일 접근성 어댑터 — 모델→aria 투영기 / the single model→aria projector
// ------------------------------------------------------------
// 설계 근거(Why): Observer. 모델(DD-02 선택·DD-05 정렬/필터·DD-09 커맨드·DD-07 실시간)의 변경
//   통지를 받아 영향 노드의 `AriaIntent` 를 (재)계산해 렌더 포트로 밀어낸다. 위젯은 aria 를 직접
//   만지지 않는다(불변식 1). aria-label 은 DD-04 `FormatResult.aria`(마스킹 후 display)에서만
//   파생한다 → 접근성 트리에 raw 미노출(불변식 2). 어댑터는 모델을 읽기만(단방향, 불변식 5).
// / Design: Observer. On model change, recompute affected nodes' AriaIntent and push to the render
//   port. Widgets never touch aria (invariant 1). aria-label derives only from DD-04
//   `FormatResult.aria` (masked display) — raw never reaches the a11y tree (invariant 2). One-way.
// ============================================================

import type { FormatResult } from '../format/types.js';
import type { MessageParams } from '../i18n/types.js';
import type { A11yNodeKey, AriaIntent, AriaAttrs } from './AriaIntent.js';
import { makeAriaIntent } from './AriaIntent.js';
import type { FocusRequest, IAriaRenderPort } from './ports.js';
import type { Announcement } from './LiveRegionController.js';
import { LiveRegionController } from './LiveRegionController.js';

/** 사각 선택 영역(행/열 1-based inclusive 아님 — 모델 0-based 좌표). / A rectangular selection (0-based model coords). */
export interface A11ySelectionRect {
  readonly r1: number; readonly c1: number; readonly r2: number; readonly c2: number;
}

/**
 * 모델 상태 스냅샷(어댑터가 읽는 읽기전용 뷰). DD-02 선택·DD-09 상태·DD-05 정렬/필터에서 투영.
 * / A read-only snapshot of model state consumed by the adapter (projected from DD-02/09/05).
 */
export interface A11yModelView {
  /** 논리 전체 행/열 수(가상화 무관, aria-rowcount/colcount). / Logical row/col counts. */
  readonly rows: number;
  readonly cols: number;
  /** 그리드 컨테이너 라벨(선택). / Grid container label (optional). */
  readonly label?: string;
  readonly activeCell?: { row: number; col: number };
  readonly selection: ReadonlyArray<A11ySelectionRect>;
  readonly sort?: { field: string; dir: 'asc' | 'desc' | 'none'; colKey?: A11yNodeKey };
  /** 검증 실패 셀(aria-invalid). / Cells that failed validation (aria-invalid). */
  readonly invalidCells: ReadonlySet<A11yNodeKey>;
}

/** 문화·메시지 컨텍스트 포트(느슨 결합 — i18n/LocaleContext 구현). / Culture/message context port (loose coupling). */
export interface ILocaleContextPort {
  /** i18n 메시지 해석. / i18n message resolution. */
  t(key: string, params?: MessageParams): string;
}

/** `AccessibilityAdapter` 의존성. / AccessibilityAdapter dependencies. */
export interface AccessibilityAdapterDeps {
  /** DOM 물질화 포트(DD-03/14 역주입). / DOM materialization port. */
  readonly render: IAriaRenderPort;
  /** 공지 병합 파이프. / Announcement-merge pipe. */
  readonly live: LiveRegionController;
  /** 문화·메시지 컨텍스트(선택 — 미주입 시 공지 messageKey 를 컨트롤러가 해석). / Culture/message context (optional). */
  readonly locale?: ILocaleContextPort;
}

/** `'cell:<row>:<col>'` 노드 키 조립. / Build a `'cell:<row>:<col>'` node key. */
export function cellKey(row: number, col: number): A11yNodeKey {
  return `cell:${row}:${col}`;
}

/** 셀이 임의의 선택 사각형 안에 있는지. / Whether a cell is inside any selection rectangle. */
function isSelected(row: number, col: number, selection: ReadonlyArray<A11ySelectionRect>): boolean {
  for (const s of selection) {
    const rlo = Math.min(s.r1, s.r2), rhi = Math.max(s.r1, s.r2);
    const clo = Math.min(s.c1, s.c2), chi = Math.max(s.c1, s.c2);
    if (row >= rlo && row <= rhi && col >= clo && col <= chi) return true;
  }
  return false;
}

/** 선택 사각형들의 셀 총수(중첩 무시 — 합산). / Total cell count across selection rectangles (naive sum). */
function selectionCount(selection: ReadonlyArray<A11ySelectionRect>): number {
  let n = 0;
  for (const s of selection) {
    n += (Math.abs(s.r2 - s.r1) + 1) * (Math.abs(s.c2 - s.c1) + 1);
  }
  return n;
}

const ARIA_SORT: Record<'asc' | 'desc' | 'none', string | undefined> = {
  asc: 'ascending', desc: 'descending', none: undefined,
};

/**
 * 모델→aria 투영의 단일 소유자(불변식 1). 위젯은 이 어댑터 외의 aria 산출 경로를 갖지 않는다.
 * / Sole owner of model→aria projection (invariant 1). No aria path exists outside this adapter.
 */
export class AccessibilityAdapter {
  private readonly _render: IAriaRenderPort;
  private readonly _live: LiveRegionController;
  private readonly _locale: ILocaleContextPort | undefined;
  private readonly _reprojectors = new Set<() => void>();
  private _localeEpoch = 0;

  constructor(deps: AccessibilityAdapterDeps) {
    this._render = deps.render;
    this._live = deps.live;
    this._locale = deps.locale;
  }

  /** 그리드 컨테이너 골격 투영(role=grid·rowcount·colcount·label). 초기/구조변경 시. / Project the grid skeleton. */
  projectGrid(view: A11yModelView): AriaIntent {
    const attrs: AriaAttrs = {
      'aria-rowcount': String(view.rows),
      'aria-colcount': String(view.cols),
      'aria-label': view.label,
    };
    const intent = makeAriaIntent(attrs, { role: 'grid' });
    this._render.apply('grid', intent);
    return intent;
  }

  /**
   * 셀 1개 aria 투영(gridcell·rowindex·colindex·selected·invalid·label=display). 핫패스.
   * aria-label 은 `display.aria ?? display.text`(마스킹 후) — raw 미참조(불변식 2).
   * / Project one cell. aria-label = `display.aria ?? display.text` (masked); raw never referenced.
   */
  projectCell(key: A11yNodeKey, view: A11yModelView, display: FormatResult): AriaIntent {
    const parsed = parseCellKey(key);
    const attrs: AriaAttrs = {
      'aria-label': display.aria ?? display.text,
    };
    if (parsed) {
      attrs['aria-rowindex'] = String(parsed.row + 1); // aria 는 1-based. / aria is 1-based.
      attrs['aria-colindex'] = String(parsed.col + 1);
      attrs['aria-selected'] = isSelected(parsed.row, parsed.col, view.selection) ? 'true' : undefined;
    }
    if (view.invalidCells.has(key)) attrs['aria-invalid'] = 'true';
    const intent = makeAriaIntent(attrs, { role: 'gridcell', labelFromDisplay: true });
    this._render.apply(key, intent);
    return intent;
  }

  /** 정렬 헤더 aria-sort 투영 + "정렬" 공지(병합·중복억제는 컨트롤러). / Project aria-sort + enqueue a 'sort' announcement. */
  projectSort(view: A11yModelView): void {
    if (!view.sort) return;
    const { field, dir, colKey } = view.sort;
    if (colKey) {
      const intent = makeAriaIntent({ 'aria-sort': ARIA_SORT[dir] }, { role: 'columnheader' });
      this._render.apply(colKey, intent);
    }
    this._live.enqueue({
      channel: 'polite', priority: 5, mergeKey: 'sort',
      messageKey: 'sort.announce', params: { field, dir },
    });
  }

  /**
   * 선택 변경 "r1행 c1열 ~ r2행 c2열, n셀 선택" 요약 공지(디바운스·병합).
   * `range.selectionAnnounce` 카탈로그는 5파라미터(r1/c1/r2/c2/n)를 요구하므로, 전 선택
   * 사각형의 **경계 상자**(1-based)를 산출해 함께 전달한다(누락 시 깨진 낭독 방지 — DD-12 QA).
   * 선택이 비면 요약 공지를 내지 않는다.
   * / Enqueue a debounced/coalesced "from r1c1 to r2c2, n cells" summary. Supplies the 1-based
   *   bounding box of all selection rects (the catalog key needs 5 params). No-op when empty.
   */
  projectSelection(view: A11yModelView): void {
    const sel = view.selection;
    if (sel.length === 0) return;
    const n = selectionCount(sel);
    let r1 = Infinity, c1 = Infinity, r2 = -Infinity, c2 = -Infinity;
    for (const s of sel) {
      r1 = Math.min(r1, s.r1, s.r2); c1 = Math.min(c1, s.c1, s.c2);
      r2 = Math.max(r2, s.r1, s.r2); c2 = Math.max(c2, s.c1, s.c2);
    }
    this._live.enqueue({
      channel: 'polite', priority: 3, mergeKey: 'selection',
      messageKey: 'range.selectionAnnounce',
      params: { r1: r1 + 1, c1: c1 + 1, r2: r2 + 1, c2: c2 + 1, n }, // 1-based
    });
  }

  /**
   * 오류 발생 시 aria-invalid + assertive 공지 + 포커스 이관 요청(REQ-T9-831).
   * / On error: aria-invalid + assertive announcement + focus-transfer request.
   */
  projectError(key: A11yNodeKey, messageKey: string, params?: MessageParams): FocusRequest {
    const intent = makeAriaIntent({ 'aria-invalid': 'true' }, { role: 'gridcell' });
    this._render.apply(key, intent);
    const ann: Announcement = params !== undefined
      ? { channel: 'assertive', priority: 100, mergeKey: `error:${key}`, messageKey, params }
      : { channel: 'assertive', priority: 100, mergeKey: `error:${key}`, messageKey };
    this._live.enqueue(ann);
    const req: FocusRequest = { target: key, reason: 'error', selectText: true };
    this._render.requestFocus(req);
    return req;
  }

  /** 위젯이 부르는 유일한 공지 진입점(직접 라이브영역 접근 대체, 불변식 4). / The sole announcement entry point for widgets. */
  announce(a: Announcement): void {
    this._live.enqueue(a);
  }

  /**
   * 로케일 전환 시 aria 재투영 훅 발화 + 캐시 무효화 에폭 증가(DD-09 오케스트레이션이 호출).
   * / On locale change: fire re-projection hooks and bump the invalidation epoch (called by DD-09).
   */
  onLocaleChange(): void {
    this._localeEpoch++;
    for (const fn of this._reprojectors) fn();
  }

  /** 로케일 전환 시 재투영할 콜백 등록(가시 표면 재산출 배선). 해제 함수 반환. / Register a re-projection callback. */
  onReproject(fn: () => void): () => void {
    this._reprojectors.add(fn);
    return () => { this._reprojectors.delete(fn); };
  }

  /** 로케일 무효화 에폭(관측·테스트용). / Locale-invalidation epoch (observability/tests). */
  localeEpoch(): number { return this._localeEpoch; }
}

/** `'cell:<row>:<col>'` 파싱. 형식 불일치 시 null(never-throw). / Parse `'cell:<row>:<col>'`; null on mismatch. */
export function parseCellKey(key: A11yNodeKey): { row: number; col: number } | null {
  const m = /^cell:(\d+):(\d+)$/.exec(key);
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}
