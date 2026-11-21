// ============================================================
// 그리기 계획 / Render planner
// 요청(무엇이 바뀌었나) + 지금 그려 둔 상태 + 다음 상태 → 이번 프레임에 할 최소 일. 다시 그리기 판단을 이곳 한 곳에 모아,
// 상태를 바꾸는 쪽이 저마다 「통째로 다시」를 부르지 않게 한다. 판단 규칙은 조건문 사다리가 아니라 아래 표(데이터)이고,
// 표는 내보내지 않는다 — 바깥은 계획 결과만 본다.
//
// Request + drawn state + next state → the minimal work for this frame. The rules live in a data table
// (not exported); callers only see the resulting plan.
// ============================================================
import { Change, type ChangeMask, type CellKey, type DrawnState, type FooterWork, type HeaderWork,
  type IRenderPlan, type IRenderPlanner, type IRenderRequest, type NextState, type PlannerFeatures, type RowWork } from './ports.js';
import type { RowSpan } from '../../coordinate/geometryPorts.js';

// ── 표의 낱말 ─────────────────────────────────────────────────────
/** 그 줄이 걸리는 조건. */
type When = 'always' | 'rowsSame' | 'rowsChanged' | 'colsSame' | 'colsChanged' | 'explicitClear' | 'explicitRange';
/** 행 축 일을 정하는 법. */
type RowRule = 'none' | 'rebuild' | 'clear' | 'diffOrRebuild' | 'viewportRows' | 'cellsOrRebuild';
/** 창 축 일을 정하는 법. */
type ColRule = 'none' | 'shiftIfChanged';
/** 작은 갱신 몫. */
type Extra = 'none' | 'refill' | 'cells' | 'rowState' | 'focus';

interface PlanRow {
  /** 걸리는 비트. 0 = 비어 있지 않은 모든 요청. All 줄은 요청이 정확히 All 일 때만 걸리고, 그때는 낱개 비트 줄이 안 걸린다. */
  readonly bit: ChangeMask;
  readonly when: When;
  /** 이 줄의 빠른 길을 켜는 규칙 묶음. 꺼져 있으면 통째(rows:'rebuild')로 떨어진다. null = 늘 켜짐. */
  readonly feature: keyof PlannerFeatures | null;
  readonly rows: RowRule;
  readonly cols: ColRule;
  readonly header: HeaderWork;
  readonly footer: FooterWork;
  readonly geometry: boolean;
  readonly overlay: boolean;
  readonly extra: Extra;
  /** 규칙 묶음이 꺼져 통째로 떨어질 때의 머리글·푸터 일(지금 동작). */
  readonly offHeader: HeaderWork;
  readonly offFooter: FooterWork;
}

/**
 * 계획 규칙 표. 위에서 아래로 걸리는 줄의 일을 모두 모으고(합집합), 마지막에 「통째가 작은 일을 덮는다」로 정리한다.
 * 줄마다 설계서의 계획 규칙 표 한 줄과 같다(빈 요청과 덮음 정리는 표 밖 plan() 앞뒤).
 *
 * Rule table: every matching row contributes its work (union), then a full rebuild absorbs the small updates.
 */
const PLAN_TABLE: readonly PlanRow[] = [
  { bit: Change.All, when: 'always', feature: null, rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'values', geometry: true, overlay: true, extra: 'none', offHeader: 'rebuild', offFooter: 'values' },
  { bit: 0, when: 'explicitClear', feature: null, rows: 'clear', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: false, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: 0, when: 'explicitRange', feature: null, rows: 'rebuild', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: true, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: Change.Columns, when: 'always', feature: null, rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'rebuild', geometry: true, overlay: true, extra: 'none', offHeader: 'rebuild', offFooter: 'rebuild' },
  { bit: Change.Appearance, when: 'always', feature: null, rows: 'rebuild', cols: 'none', header: 'rebuild', footer: 'rebuild', geometry: true, overlay: true, extra: 'none', offHeader: 'rebuild', offFooter: 'rebuild' },
  { bit: Change.Viewport, when: 'always', feature: 'columnWindow', rows: 'viewportRows', cols: 'shiftIfChanged', header: 'none', footer: 'none', geometry: true, overlay: true, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: Change.RowSet, when: 'always', feature: null, rows: 'rebuild', cols: 'none', header: 'none', footer: 'values', geometry: false, overlay: true, extra: 'none', offHeader: 'none', offFooter: 'values' },
  { bit: Change.RowOrder, when: 'always', feature: 'sortIndicatorOnly', rows: 'rebuild', cols: 'none', header: 'sortIndicator', footer: 'none', geometry: false, overlay: true, extra: 'none', offHeader: 'rebuild', offFooter: 'values' },
  { bit: Change.SortIndicator, when: 'always', feature: 'sortIndicatorOnly', rows: 'none', cols: 'none', header: 'sortIndicator', footer: 'none', geometry: false, overlay: false, extra: 'none', offHeader: 'rebuild', offFooter: 'none' },
  { bit: Change.RowsScrolled, when: 'rowsSame', feature: 'scrollSkip', rows: 'none', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: false, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: Change.RowsScrolled, when: 'rowsChanged', feature: 'rowDiff', rows: 'diffOrRebuild', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: true, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: Change.ColsScrolled, when: 'colsSame', feature: 'scrollSkip', rows: 'none', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: false, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: Change.ColsScrolled, when: 'colsChanged', feature: 'columnWindow', rows: 'none', cols: 'shiftIfChanged', header: 'none', footer: 'none', geometry: false, overlay: true, extra: 'none', offHeader: 'none', offFooter: 'none' },
  { bit: Change.ColWidth, when: 'always', feature: 'geometryOnly', rows: 'none', cols: 'shiftIfChanged', header: 'none', footer: 'none', geometry: true, overlay: true, extra: 'refill', offHeader: 'none', offFooter: 'none' },
  { bit: Change.CellValue, when: 'always', feature: 'smallUpdates', rows: 'cellsOrRebuild', cols: 'none', header: 'none', footer: 'values', geometry: false, overlay: false, extra: 'cells', offHeader: 'none', offFooter: 'values' },
  { bit: Change.RowState, when: 'always', feature: 'smallUpdates', rows: 'none', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: false, extra: 'rowState', offHeader: 'none', offFooter: 'none' },
  { bit: Change.Focus, when: 'always', feature: 'smallUpdates', rows: 'none', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: false, extra: 'focus', offHeader: 'none', offFooter: 'none' },
  { bit: Change.Range, when: 'always', feature: 'smallUpdates', rows: 'none', cols: 'none', header: 'none', footer: 'none', geometry: false, overlay: true, extra: 'none', offHeader: 'none', offFooter: 'none' },
];

// ── 표의 낱말을 읽는 법(표 밖 — 표에는 함수를 두지 않는다) ─────────────
/** 포커스 칸 갱신 몫(옛 칸 → 새 칸, 새 칸이 null 이면 옛 칸 표시만 지움). */
type FocusWork = IRenderPlan['focus'];

/** 한 번의 plan() 동안 낱말 해석에 쓰는 입력(읽기 전용) + 줄마다 모으는 일(고칠 수 있는 누적기, plan() 밖으로 안 나감). */
interface Ctx {
  readonly req: IRenderRequest;
  readonly drawn: DrawnState;
  readonly next: NextState;
  readonly f: PlannerFeatures;
  readonly ratio: number;
  rows: number;
  shift: boolean;
  header: number;
  footer: number;
  geometry: boolean;
  overlay: boolean;
  refill: readonly number[];
  stateRows: readonly number[];
  focus: FocusWork;
  cells: readonly CellKey[];
}

const isSpan = (r: RowSpan | 'clear' | null): r is RowSpan => r !== null && r !== 'clear';

function rowsSame(c: Ctx): boolean {
  const d = c.drawn.rows;
  const n = c.next.rows;
  return isSpan(d) && isSpan(n) && d.start === n.start && d.end === n.end;
}

function colsSame(c: Ctx): boolean {
  const d = c.drawn.columns;
  return d !== null && d.equals(c.next.columns);
}

/** 행 차분이 되나: 차분 묶음이 켜짐 · 막힌 행 종류 없음 · 바뀐 행 수가 그려 둔 행 수 × 문턱보다 작음. */
function diffOrRebuild(c: Ctx): RowWork {
  const d = c.drawn.rows;
  const n = c.next.rows;
  if (!c.f.rowDiff || c.drawn.diffBlocked || !isSpan(d) || !isSpan(n)) return 'rebuild';
  const drawnCount = d.end - d.start;
  if (drawnCount <= 0) return 'rebuild';
  const overlap = Math.max(0, Math.min(d.end, n.end) - Math.max(d.start, n.start));
  if (overlap === 0) return 'rebuild';
  const changed = Math.max(n.end - n.start - overlap, drawnCount - overlap);
  return changed < drawnCount * c.ratio ? 'diff' : 'rebuild';
}

const WHEN: Readonly<Record<When, (c: Ctx) => boolean>> = {
  always: () => true,
  rowsSame,
  rowsChanged: (c) => !rowsSame(c),
  colsSame,
  colsChanged: (c) => !colsSame(c),
  explicitClear: (c) => c.req.detail.rows === 'clear',
  explicitRange: (c) => isSpan(c.req.detail.rows),
};

const ROWS: Readonly<Record<RowRule, (c: Ctx) => RowWork>> = {
  none: () => 'none',
  rebuild: () => 'rebuild',
  clear: () => 'clear',
  diffOrRebuild,
  viewportRows: (c) => (rowsSame(c) ? 'none' : diffOrRebuild(c)),
  cellsOrRebuild: (c) => (c.req.detail.cells.length === 0 ? 'rebuild' : 'none'),
};

/** 작은 갱신 몫을 모으는 법. 포커스는 새 칸이 있으면 옛 칸→새 칸, 없으면(지우기) 그려 둔 옛 칸만 지움. */
const EXTRA: Readonly<Record<Extra, (c: Ctx) => void>> = {
  none: () => undefined,
  refill: (c) => { c.refill = refillColumns(c.drawn, c.next); },
  cells: (c) => { c.cells = c.req.detail.cells; },
  rowState: (c) => { c.stateRows = drawnRows(c.drawn); },
  focus: (c) => {
    const from = c.drawn.focus;
    const to = c.req.detail.focusTo;
    if (to !== null || from !== null) c.focus = Object.freeze({ from, to });
  },
};

// 겹친 일은 큰 쪽이 이긴다(덮음 정리): 행 clear > rebuild > diff > none · 머리글 rebuild > sortIndicator > none · 푸터 rebuild > values > none.
const ROW_RANK: Readonly<Record<RowWork, number>> = { none: 0, diff: 1, rebuild: 2, clear: 3 };
const HEADER_RANK: Readonly<Record<HeaderWork, number>> = { none: 0, sortIndicator: 1, rebuild: 2 };
const FOOTER_RANK: Readonly<Record<FooterWork, number>> = { none: 0, values: 1, rebuild: 2 };
const ROW_BY_RANK: readonly RowWork[] = ['none', 'diff', 'rebuild', 'clear'];
const HEADER_BY_RANK: readonly HeaderWork[] = ['none', 'sortIndicator', 'rebuild'];
const FOOTER_BY_RANK: readonly FooterWork[] = ['none', 'values', 'rebuild'];

const NO_NUMBERS: readonly number[] = Object.freeze([]);
const NO_CELLS: readonly CellKey[] = Object.freeze([]);

const ALL_OFF: PlannerFeatures = Object.freeze({
  sortIndicatorOnly: false, footerGating: false, scrollSkip: false, geometryOnly: false,
  columnWindow: false, rowDiff: false, smallUpdates: false,
});

/**
 * 계획을 내는 유일한 곳. 상태를 들지 않는다 — 같은 입력이면 늘 같은 계획(입력은 고치지 않음).
 * 규칙 묶음(`features`)을 하나씩 켜서 빠른 길을 연다. 기본값은 전부 꺼짐 = 모든 요청이 통째(지금 그리는 횟수 그대로).
 * 실행 순서는 계획 계약대로 기하 → 행 → 창 → 다시 채우기 → 나머지.
 *
 * Stateless planner. Features open fast paths one by one; the default (all off) answers every request with a full rebuild.
 */
export class RenderPlanner implements IRenderPlanner {
  private readonly _ratio: number;
  private readonly _features: PlannerFeatures;

  constructor(opts?: { diffMaxRatio?: number; features?: Partial<PlannerFeatures> }) {
    const r = opts?.diffMaxRatio;
    this._ratio = r !== undefined && Number.isFinite(r) && r > 0 ? r : 0.5;
    this._features = Object.freeze({ ...ALL_OFF, ...opts?.features });
  }

  plan(req: IRenderRequest, drawn: DrawnState, next: NextState): IRenderPlan {
    const changes = req.changes;
    if (changes === 0) return makePlan('none', 'none', 'none', 'none', false, NO_NUMBERS, NO_NUMBERS, null, NO_CELLS, false, next);

    const c: Ctx = {
      req, drawn, next, f: this._features, ratio: this._ratio,
      rows: 0, shift: false, header: 0, footer: 0, geometry: false, overlay: false,
      refill: NO_NUMBERS, stateRows: NO_NUMBERS, focus: null, cells: NO_CELLS,
    };
    const isAll = changes === Change.All;

    for (let i = 0; i < PLAN_TABLE.length; i++) {
      const row = PLAN_TABLE[i]!;
      const hit = row.bit === 0 ? true : row.bit === Change.All ? isAll : !isAll && (changes & row.bit) !== 0;
      if (!hit || !WHEN[row.when](c)) continue;
      c.geometry = c.geometry || row.geometry;
      if (row.feature !== null && !c.f[row.feature]) {
        // 꺼진 규칙 묶음 → 통째(안전한 쪽). 머리글·푸터는 지금 동작 값.
        c.rows = Math.max(c.rows, ROW_RANK.rebuild);
        c.header = Math.max(c.header, HEADER_RANK[row.offHeader]);
        c.footer = Math.max(c.footer, FOOTER_RANK[row.offFooter]);
        c.overlay = true;
        continue;
      }
      let rowWork = ROWS[row.rows](c);
      if (row.cols === 'shiftIfChanged' && !colsSame(c)) {
        // 그려 둔 창이 없거나 창 묶음이 꺼져 있으면 옮길 수 없다 → 통째.
        if (drawn.columns !== null && c.f.columnWindow) c.shift = true;
        else rowWork = 'rebuild';
      }
      c.rows = Math.max(c.rows, ROW_RANK[rowWork]);
      c.header = Math.max(c.header, HEADER_RANK[row.header]);
      c.footer = Math.max(c.footer, FOOTER_RANK[row.footer]);
      c.overlay = c.overlay || row.overlay;
      EXTRA[row.extra](c);
    }

    const rowWork = ROW_BY_RANK[c.rows]!;
    let footer = c.footer;
    if (!c.f.footerGating && rowWork !== 'none') footer = Math.max(footer, FOOTER_RANK.values); // 지금처럼 그릴 때마다 푸터 계산
    const full = rowWork === 'rebuild' || rowWork === 'clear';
    const refill = c.refill;
    return makePlan(
      rowWork,
      !full && c.shift ? 'shift' : 'none',
      HEADER_BY_RANK[c.header]!,
      FOOTER_BY_RANK[footer]!,
      c.geometry && next.geometryVersion !== next.appliedGeometryVersion,
      full ? NO_NUMBERS : refill,
      full ? NO_NUMBERS : c.stateRows,
      full ? null : c.focus,
      full ? NO_CELLS : c.cells,
      c.overlay,
      next,
    );
  }
}

/** 다시 채울 컬럼 = 다음 창 안에서 새 폭이 그려 둔 「말줄임을 지켜 주는 폭」을 넘는 컬럼. */
function refillColumns(drawn: DrawnState, next: NextState): readonly number[] {
  const cover = drawn.coverWidths;
  const widths = next.columnWidths;
  const segs = next.columns.segments;
  const out: number[] = [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    for (let ci = seg.from; ci <= seg.to; ci++) {
      const limit = cover[ci];
      if (limit !== undefined && widths[ci]! > limit) out.push(ci);
    }
  }
  return out.length === 0 ? NO_NUMBERS : Object.freeze(out);
}

/** 그려 둔 행 전부(선택·체크 속성은 몇 개라 싸다). */
function drawnRows(drawn: DrawnState): readonly number[] {
  const r = drawn.rows;
  if (!isSpan(r) || r.end <= r.start) return NO_NUMBERS;
  const out: number[] = new Array(r.end - r.start);
  for (let i = 0; i < out.length; i++) out[i] = r.start + i;
  return Object.freeze(out);
}

function makePlan(
  rows: RowWork, cols: 'none' | 'shift', header: HeaderWork, footer: FooterWork, geometry: boolean,
  refillColumns: readonly number[], rowStateRows: readonly number[],
  focus: FocusWork, cells: readonly CellKey[], overlay: boolean, next: NextState,
): IRenderPlan {
  const empty = rows === 'none' && cols === 'none' && header === 'none' && footer === 'none' && !geometry && !overlay
    && refillColumns.length === 0 && rowStateRows.length === 0 && focus === null && cells.length === 0;
  return Object.freeze({ rows, cols, header, footer, geometry, refillColumns, rowStateRows, focus, cells, overlay, next, empty });
}
