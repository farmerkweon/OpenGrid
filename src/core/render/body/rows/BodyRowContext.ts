// ============================================================
// 본문 행 그리개가 받는 문맥과 행 그리개 포트 / Context handed to body row painters, and the row painter port
// 한 번 그릴 때 하나만 만든다(행·칸마다 만들지 않음). 행마다 바뀌는 몇 값(행 상태·배경·끌기 관리자)은
// 자료 행 그리개가 이 객체에 덮어써 여분 칸 그리개들과 나눠 쓴다 — 칸마다 새 객체를 만들지 않으려는 것.
//
// Built once per paint (never per row or cell). The few per-row values (row state, background, drag manager)
// are overwritten here by the data-row painter and shared with the extra-cell painters, so no per-cell objects.
// ============================================================
import type { RowDragDrop } from '../../../RowDragDrop.js';
import type { DataLayer } from '../../../DataLayer.js';
import type { MergeEngine } from '../../../MergeEngine.js';
import type { RenderOptions, DetailRenderContext } from '../../../GridRenderer.js';
import type { IColumnGeometry, ExtraColumnId, IColumnWindow } from '../../../coordinate/geometryPorts.js';
import type { WindowLayout } from './WindowLayout.js';
import type { RowKind, IGeometryApplier } from '../../ports.js';
import type { ColumnPaintPlan } from '../ColumnPaintPlan.js';

/**
 * 본문 한 번 그리기 동안의 값. 앞쪽 읽기 전용 칸은 그리기 하나 동안 그대로이고, 뒤쪽 「행마다」 칸은 자료 행 그리개가 행을 시작할 때 채운다.
 *
 * Values for one body paint. Read-only fields stay fixed for the paint; the "per row" fields are filled by the
 * data-row painter when it starts a row.
 */
export interface BodyRowContext {
  readonly opts: RenderOptions;
  readonly data: DataLayer<any>;
  readonly leaves: any[];
  readonly startIndex: number;
  readonly endIndex: number;
  readonly offsetY: number;
  readonly selectedRows: Set<number>;
  readonly checkedRows: Set<number>;
  /**
   * 묶음·나무·디테일 합성 행 배열(없으면 null — 자료 행은 DataLayer 에서 읽는다).
   *
   * Composed group/tree/detail rows (null when absent — data rows are then read from the DataLayer).
   */
  readonly groupFlatRows: Array<any> | null;
  readonly mergeEngine: MergeEngine | undefined;
  readonly detailApi: DetailRenderContext | undefined;
  /**
   * 디테일 펼침 전용 칸을 그리나(디테일 켜짐 + 펼침 단추가 전용 칸 모드).
   *
   * Whether the dedicated detail-expander cell is drawn (detail on and the expander in its own column).
   */
  readonly detailColOn: boolean;
  readonly auto: boolean;
  readonly frozenCount: number;
  readonly geometry: IColumnGeometry;
  readonly totalColWidth: number;
  /**
   * 그릴 컬럼 창과 그 그리기 차례(구간·빈칸). 창 옮김 때 본문 뷰가 새 창으로 갈아 끼운다.
   *
   * The column window to paint and its order (runs and gaps); the body view swaps them on a window shift.
   */
  columns: IColumnWindow;
  layout: WindowLayout;
  /**
   * 켜진 여분 컬럼과 그 고정 left·폭 — 그리기당 한 번 기하에서 읽어 둔다. 보이는 행마다 여분 칸이 같은 값을 쓰므로
   * 행마다 기하에 다시 묻지 않으려는 것.
   *
   * Enabled extra columns and their sticky lefts/widths, read from the geometry once per paint so the same
   * values are not re-asked for every visible row.
   */
  readonly extraIds: readonly ExtraColumnId[];
  readonly extraLeft: Readonly<Record<ExtraColumnId, number>>;
  /** 여분 컬럼 폭 합. / Sum of extra-column widths. */
  readonly extraWidth: number;
  readonly dragWidth: number;
  readonly detailWidth: number;
  /**
   * 세로 병합 마스터 칸처럼 행 밖(본문 바로 아래)에 붙는 요소를 받는 곳.
   *
   * Receives elements placed outside the row (directly under the body), such as row-spanning master cells.
   */
  readonly frag: DocumentFragment;
  /**
   * 컬럼마다 그리기 준비물(그리기당 컬럼 하나씩 — 칸마다 렌더러를 만들지 않으려고).
   *
   * Per-column paint preparation (one per column per paint, so renderers are not built per cell).
   */
  readonly plans: readonly ColumnPaintPlan[];
  /**
   * 행 밖에 붙는 세로 병합 마스터 칸 → 행 번호. 이벤트 위임이 칸을 찾을 때 읽는다(DOM 에 속성을 더하지 않으려고).
   *
   * Row-spanning master cell → row index, read by event delegation to locate it (so no DOM attribute is added).
   */
  readonly masters: Map<HTMLElement, number>;
  /**
   * 묶음 행 요소 → 묶음 열쇠. 묶음 행 click 을 위임에서 받아 펴고 접을 때 읽는다.
   *
   * Group row element → group key, read when the delegated click toggles the group.
   */
  readonly groupKeys: Map<HTMLElement, string>;
  /**
   * 나무 펼침 아이콘 → 노드 번호. 아이콘 누르기·Enter/Space 를 위임에서 받아 펴고 접을 때 읽는다.
   *
   * Tree toggle icon → node id, read when the delegated click/Enter/Space toggles the node.
   */
  readonly treeIcons: Map<Element, unknown>;
  /**
   * 칸이 아닌 폭 자리(병합 칸·자리채움·묶음 칸·디테일 패널·막대)를 기억시킬 곳. 아직 없으면(뷰를 따로 만든 시험) 등록을 건너뛴다.
   * 등록은 그려진 DOM 을 바꾸지 않는다 — 나중에 컬럼 폭이 바뀔 때 그 자리만 다시 쓰려고 기억시키는 것.
   *
   * Where non-cell width spots (merged cells, placeholders, group cells, detail panels, bars) are registered;
   * skipped when absent (a view built alone in a test). Registering never changes the DOM — it only lets those
   * spots be rewritten later when a column width changes.
   */
  readonly applier: IGeometryApplier | undefined;
  /**
   * 조건부 서식 막대 알림(그리기당 하나 — 칸마다 함수를 만들지 않으려고 지금 칸 번호·병합 폭을 아래 두 칸에서 읽는다).
   *
   * Conditional-format bar callback (one per paint; reads the current cell index/span from the two fields below
   * instead of creating a function per cell).
   */
  trackBar: ((bar: HTMLElement, ratio: number) => void) | undefined;
  // ── 행마다(자료 행 그리개가 채움) / per row (filled by the data-row painter) ──
  rowState: string;
  /**
   * 고정 칸 배경(상태·선택 색을 반영).
   *
   * Background for sticky cells (reflects row-state and selection colours).
   */
  bg: string;
  dnd: RowDragDrop | null;
  /**
   * 끌기 옵션은 켜졌는데 손잡이를 못 그리는 행에서 뒤 여분 칸을 당기는 폭(그 밖엔 0).
   *
   * How far later extra cells shift left when draggable is on but no handle can be drawn (0 otherwise).
   */
  dragGap: number;
  /** 행 자료와 나무 노드(나무 행이 아니면 null). / Row data and tree node (null when not a tree row). */
  rowData: any;
  treeNode: any;
  /** 자료 행 앞머리 여분 칸 수(한 그리기 안에서는 모든 자료 행이 같다). / Number of leading extra cells in a data row. */
  extraCount: number;
  // ── 칸마다(자료 칸을 그릴 때 채움 — 막대 알림이 읽음) / per cell (filled while painting data cells; read by the bar callback) ──
  cellCi: number;
  cellSpan: number;
}

/**
 * 행 종류 하나를 그린다(종류마다 BodyView 당 하나). 그린 행 요소를 돌려주고, 그릴 것이 없으면 null.
 *
 * Paints one row kind (one instance per kind per BodyView). Returns the row element, or null when nothing is drawn.
 */
export interface BodyRowPainter {
  readonly kind: RowKind;
  paint(ri: number, item: any, ctx: BodyRowContext): HTMLElement | null;
}
