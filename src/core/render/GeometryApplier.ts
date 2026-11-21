// ============================================================
// 기하 → DOM px 를 쓰는 유일한 객체 / Sole writer of geometry-derived px into the DOM
// 폭을 품은 자리(머리글 칸·표 전체 폭·고정 칸 left·병합 칸·빈칸·데이터 막대)가 그리개마다 흩어져 있으면,
// 컬럼 하나의 폭이 바뀔 때 전부 다시 만들어야 맞는 화면이 된다. 그 자리들을 여기에 등록해 두면
// 바뀐 몫(GeometryChange)만 받아 해당 자리만 고쳐 쓸 수 있다.
// 칸 요소는 따로 등록하지 않는다 — 칸 지도(ICellRegistry)가 이미 알고 있으므로 쓸 때 묻는다(칸마다 기록 0).
// 등록은 범위(머리글·본문·푸터)별 저장소에 따로 두고, 그 범위를 통째로 다시 그리기 직전에 release 로 비워
// 사라진 요소를 붙잡지 않는다 — 한 범위를 비울 때 다른 범위는 훑지 않는다.
// 칸 지도 밖 칸이 컬럼마다 있는 행(묶음 행 등)은 칸마다가 아니라 행 하나로 등록한다.
//
// Geometry-dependent DOM spots register here so a width change can rewrite only the affected spots.
// Cells are never registered: the cell registry already knows them. Each scope has its own store, emptied
// right before that scope is fully repainted, so detached elements are never retained and releasing one
// scope never walks the others. Rows with a cell per column register once per row.
// ============================================================
import { leafColIndex } from '../coordinate/types.js';
import type { GeometryChange, IColumnGeometry } from '../coordinate/geometryPorts.js';
import type { ICellRegistry, IGeometryApplier, ProjectionScope, WidthProps } from './ports.js';

type StyleProp = 'width' | 'minWidth' | 'maxWidth' | 'left';

/** 등록 하나. 종류별 계산은 KINDS 표가 맡는다(종류로 갈래 치는 조건문 없이). */
interface Spot {
  readonly el: HTMLElement;
  readonly kind: Kind;
  readonly ci: number;
  /** span·gap·row 의 끝(닫힌 구간 끝 컬럼). 한 컬럼 자리면 ci. */
  readonly last: number;
  readonly props: readonly StyleProp[];
  readonly ratio: number;
  /** row: 컬럼 ci 의 칸이 el 의 몇 번째 자식인가. */
  readonly child: number;
  /** span·gap: 기하 폭 합에 더할 px(기하가 모르는 몫 — 마지막 컬럼을 넘는 병합·디테일 켠 푸터 채움 칸). */
  readonly extra: number;
}

type Kind = 'cell' | 'span' | 'left' | 'total' | 'extra' | 'gap' | 'bar' | 'row';

/** 값을 받을 자리 하나(요소 + 그 요소에 쓸 px). */
type Emit = (el: HTMLElement, v: number) => void;

/**
 * 종류 하나의 뜻: 어떤 변화에 닿는지, 기하에서 어느 요소에 몇 px 를 내는지.
 * ch 가 null 이면 「모든 자리」(구조 변화·진단).
 */
interface KindRule {
  touched(ch: GeometryChange, s: Spot): boolean;
  emit(g: IColumnGeometry, s: Spot, ch: GeometryChange | null, out: Emit): void;
}

function spanOf(g: IColumnGeometry, from: number, last: number): number {
  return g.spanWidth(leafColIndex(from), last - from + 1);
}

/** 폭이 바뀐 컬럼 가운데 [from, last] 에 드는 것이 있나. widthCols 는 오름차순. */
function hits(ch: GeometryChange, from: number, last: number): boolean {
  for (const c of ch.widthCols) {
    if (c > last) return false;
    if (c >= from) return true;
  }
  return false;
}

/** 요소 하나에 값 하나를 내는 종류. */
function single(value: (g: IColumnGeometry, s: Spot) => number, touched: KindRule['touched']): KindRule {
  return { touched, emit: (g, s, _ch, out) => out(s.el, value(g, s)) };
}
const spanTouched: KindRule['touched'] = (ch, s) => hits(ch, s.ci, s.last);

const KINDS: Readonly<Record<Kind, KindRule>> = {
  cell: single((g, s) => spanOf(g, s.ci, s.last), spanTouched),
  span: single((g, s) => spanOf(g, s.ci, s.last) + s.extra, spanTouched),
  gap: single((g, s) => spanOf(g, s.ci, s.last) + s.extra, spanTouched),
  left: single((g, s) => g.leftOf(leafColIndex(s.ci)), (ch, s) => s.ci >= ch.leftFrom),
  total: single((g) => g.totalWidth(), (ch) => ch.totalChanged),
  extra: single((g) => g.extra.width(), () => false),
  // 지금 데이터 막대 식과 같다: clamp(ratio, 0, 1) × 칸 폭.
  bar: single((g, s) => Math.max(0, Math.min(1, s.ratio)) * spanOf(g, s.ci, s.last), spanTouched),
  // 행 하나 = 칸 여럿: 자식 [child, child + (last − ci)] 가 컬럼 [ci, last] 의 칸. 바뀐 컬럼의 칸에만 낸다.
  row: {
    touched: spanTouched,
    emit: (g, s, ch, out) => {
      const kids = s.el.children;
      for (let c = s.ci; c <= s.last; c++) {
        if (ch && !hits(ch, c, c)) continue;
        const cell = kids[s.child + (c - s.ci)] as HTMLElement | undefined;
        if (cell) out(cell, g.widthOf(leafColIndex(c)));
      }
    },
  },
};

const PROPS: Readonly<Record<WidthProps, readonly StyleProp[]>> = {
  w: ['width'],
  wm: ['width', 'minWidth'],
  wmm: ['width', 'minWidth', 'maxWidth'],
};
const WIDTH_ONLY: readonly StyleProp[] = PROPS.w;
const MIN_ONLY: readonly StyleProp[] = ['minWidth'];
const LEFT_ONLY: readonly StyleProp[] = ['left'];
/** 본문 칸이 지금 쓰는 폭 조합. */
const CELL_PROPS: readonly StyleProp[] = PROPS.wmm;

const px = (n: number): string => `${n}px`;

/** 한 범위의 등록 저장소: 요소 → 그 요소의 등록들(고정 머리글 th 는 폭과 left 둘). */
type Store = Map<HTMLElement, Spot[]>;

/**
 * 기하에서 나온 px 를 DOM 에 쓰는 유일한 객체.
 * 불변: applyChange 뒤 등록된(살아 있는) 모든 폭 자리의 px == 기하 값 · 칸은 지도에 묻고 등록하지 않음 ·
 *       release(scope) 뒤 그 범위 등록 0(다른 범위는 건드리지 않음).
 *
 * Sole writer of geometry-derived px. Cells come from the registry; other spots are registered per scope.
 */
export class GeometryApplier implements IGeometryApplier {
  private readonly _geometry: IColumnGeometry;
  private readonly _cells: ICellRegistry;
  private readonly _stores: Readonly<Record<ProjectionScope, Store>> = { header: new Map(), body: new Map(), footer: new Map() };

  constructor(geometry: IColumnGeometry, cells: ICellRegistry) {
    this._geometry = geometry;
    this._cells = cells;
  }

  /** 칸 폭을 쓴다(칸은 등록하지 않음 — 지도가 안다). */
  writeCellWidth(el: HTMLElement, ci: number, p: WidthProps): void {
    const v = px(this._geometry.widthOf(leafColIndex(ci)));
    for (const prop of PROPS[p]) el.style[prop] = v;
  }

  // 등록만 — 값은 그리는 쪽이 이미 썼다(cssText 의 선언 순서를 지금 그대로 두려고 여기서는 쓰지 않는다).
  trackHeaderCell(th: HTMLElement, ci: number, p: WidthProps): void {
    this._add('header', th, 'cell', ci, ci, PROPS[p], 0, 0);
  }

  /** extraPx — 기하가 모르는 몫(마지막 컬럼을 넘는 병합의 넘은 컬럼 × 기본 폭 등). / px the geometry does not know. */
  trackSpan(el: HTMLElement, ci: number, span: number, p: WidthProps, s: ProjectionScope, extraPx = 0): void {
    this._add(s, el, 'span', ci, ci + Math.max(1, span) - 1, PROPS[p], 0, 0, extraPx);
  }

  /**
   * 행 하나로 칸 여럿을 등록한다: row 의 자식 [firstChild, firstChild + (to − from)] 가 컬럼 [from, to] 의 칸 폭 자리.
   * 칸 지도 밖 칸이 컬럼마다 있는 행(묶음 행 등)을 칸마다 등록하면 뜨거운 길에 기록이 칸 수만큼 생기므로 행 하나로 묶는다.
   *
   * Registers one row for many cells: row children [firstChild, firstChild + (to − from)] are the cells of columns
   * [from, to]. Rows with an off-registry cell per column would otherwise create one record per cell on a hot path.
   */
  trackRowCells(row: HTMLElement, firstChild: number, from: number, to: number, p: WidthProps, s: ProjectionScope): void {
    if (to < from) return;
    this._add(s, row, 'row', from, to, PROPS[p], 0, firstChild);
  }

  trackLeft(el: HTMLElement, ci: number, s: ProjectionScope): void {
    this._add(s, el, 'left', ci, ci, LEFT_ONLY, 0, 0);
  }

  trackTotal(el: HTMLElement, prop: 'width' | 'minWidth', s: ProjectionScope): void {
    this._add(s, el, 'total', 0, 0, prop === 'width' ? WIDTH_ONLY : MIN_ONLY, 0, 0);
  }

  trackExtra(el: HTMLElement, s: ProjectionScope): void {
    this._add(s, el, 'extra', 0, 0, WIDTH_ONLY, 0, 0);
  }

  trackGap(el: HTMLElement, from: number, to: number, s: ProjectionScope, extraPx = 0): void {
    this._add(s, el, 'gap', from, to, WIDTH_ONLY, 0, 0, extraPx);
  }

  trackBar(el: HTMLElement, ci: number, span: number, ratio: number): void {
    this._add('body', el, 'bar', ci, ci + Math.max(1, span) - 1, WIDTH_ONLY, ratio, 0);
  }

  untrack(el: HTMLElement): void {
    this._stores.header.delete(el);
    this._stores.body.delete(el);
    this._stores.footer.delete(el);
  }

  /** 그 범위의 등록을 모두 푼다 — 그 범위를 통째로 다시 그리기 직전에 부른다(다른 범위는 훑지 않음). */
  release(s: ProjectionScope): void {
    this._stores[s].clear();
  }

  /**
   * 바뀐 몫만 다시 쓴다: 바뀐 컬럼의 칸(지도)·고정 칸 left → 등록 자리(병합 span 은 칸 쓰기 뒤라 span 값이 이김).
   * 값이 지금과 같으면 쓰지 않는다. DOM 에서 떨어진 요소는 건너뛰고 등록을 푼다.
   */
  applyChange(change: GeometryChange, opts?: { skipScope?: 'body' }): void {
    if (change.none) return;
    const g = this._geometry;
    const all = change.structural;
    // 본문을 건너뛰면 칸 지도(본문 칸)도 본문 등록 자리도 안 쓴다 — 그 프레임에 행을 통째로 다시 그린다.
    // Skipping the body skips the cell map (body cells) and body spots — the rows are rebuilt in that frame.
    const skipBody = opts?.skipScope === 'body';
    const n = skipBody ? 0 : g.count;
    const frozen = g.frozenCount;
    for (let ci = 0; ci < n; ci++) {
      const widthHit = all || hits(change, ci, ci);
      const leftHit = ci < frozen && (all || ci >= change.leftFrom);
      if (!widthHit && !leftHit) continue;
      const w = px(g.widthOf(leafColIndex(ci)));
      const l = px(g.leftOf(leafColIndex(ci)));
      for (const el of this._cells.cellsOfColumn(ci)) {
        if (widthHit) for (const prop of CELL_PROPS) setIfDiff(el, prop, w);
        if (leftHit) setIfDiff(el, 'left', l);
      }
    }
    const only = all ? null : change;
    for (const store of this._pick()) {
      if (skipBody && store === this._stores.body) continue;
      for (const [el, list] of store) {
        if (!el.isConnected) { store.delete(el); continue; }
        for (const spot of list) {
          const rule = KINDS[spot.kind];
          if (only && !rule.touched(only, spot)) continue;
          rule.emit(g, spot, only, (target, v) => {
            const text = px(v);
            for (const prop of spot.props) setIfDiff(target, prop, text);
          });
        }
      }
    }
  }

  /** 진단·시험용: 등록된 자리마다 기하가 정한 값(행 등록은 칸마다 펼침). */
  projections(scope?: ProjectionScope): readonly { el: HTMLElement; prop: StyleProp; value: string }[] {
    const out: { el: HTMLElement; prop: StyleProp; value: string }[] = [];
    for (const store of this._pick(scope)) {
      for (const list of store.values()) {
        for (const spot of list) {
          KINDS[spot.kind].emit(this._geometry, spot, null, (el, v) => {
            for (const prop of spot.props) out.push({ el, prop, value: px(v) });
          });
        }
      }
    }
    return out;
  }

  /** 진단·시험용: 등록 수(요소 하나에 등록이 둘이면 둘로, 행 등록은 하나로 셈). */
  trackedCount(scope?: ProjectionScope): number {
    let k = 0;
    for (const store of this._pick(scope)) for (const list of store.values()) k += list.length;
    return k;
  }

  private _pick(scope?: ProjectionScope): readonly Store[] {
    return scope ? [this._stores[scope]] : [this._stores.header, this._stores.body, this._stores.footer];
  }

  private _add(scope: ProjectionScope, el: HTMLElement, kind: Kind, ci: number, last: number, props: readonly StyleProp[], ratio: number, child: number, extra = 0): void {
    const store = this._stores[scope];
    const spot: Spot = { el, kind, ci, last, props, ratio, child, extra };
    const list = store.get(el);
    if (!list) { store.set(el, [spot]); return; }
    // 같은 종류를 다시 등록하면 갈아 끼운다(같은 자리를 두 번 세지 않게).
    const i = list.findIndex(x => x.kind === kind);
    if (i >= 0) list[i] = spot; else list.push(spot);
  }
}

function setIfDiff(el: HTMLElement, prop: StyleProp, v: string): void {
  if (el.style[prop] !== v) el.style[prop] = v;
}
