// ============================================================
// 푸터 막대 DOM / Footer bar view
// 합계 값은 셈하지 않는다 — 값은 FooterValues(헤드리스)에 묻고, 이 객체는 그 값을 막대 요소로 그리기만 한다.
// 칸 폭과 여분 칸 폭은 그리드의 컬럼 기하에 묻는다(폭을 아는 곳은 하나) — 여분 칸은 머리글·본문과 같은 여분 폭
// (디테일 펼침 칸 포함)이라 푸터 칸이 본문 칸과 같은 세로 선 위에 놓인다. 폭 배열에 값이 없는 잎은 100px(지금 동작).
// 가로 따라가기 객체를 받으면 그린 막대를 맡기고, 막대를 바꾸거나 없앨 때 풀어 준다.
//
// Draws the footer bar. Values come from FooterValues (headless); this object only builds the DOM.
// Cell and spacer widths come from the grid's column geometry; the spacer uses the same extra width as header and body
// (detail expander included) so footer cells line up with body cells. A leaf with no stored width is 100px.
// An optional scroll follower is given the bar and released when the bar is replaced or destroyed.
// ============================================================
import type { IFooterView, IGeometryApplier, IScrollFollower } from './ports.js';
import type { FooterResultLike } from '../domain/footer/ports.js';
import type { FooterDef } from '../domain/footer/FooterValues.js';
import type { IColumnGeometry } from '../coordinate/geometryPorts.js';
import type { LeafColIndex } from '../coordinate/types.js';

/** 폭 배열에 값이 없는 잎의 폭(지금 동작). / Width of a leaf with no stored width (current behaviour). */
const MISSING_WIDTH = 100;

/** 그리기에 쓰는 옵션 몫(그리드 옵션 객체를 그대로 넘김). / The grid options the footer reads. */
export interface FooterViewOptions {
  footer?: readonly FooterDef[] | null;
  footerHeight?: number;
  footerPosition?: string;
}

export interface FooterViewDeps {
  /** 막대를 넣을 컨테이너 — 그릴 때마다 묻는다(지금 동작). / Container, asked on every paint. */
  container(): HTMLElement;
  options(): FooterViewOptions;
  /** 보이는 잎 컬럼(정렬 기본값에 형을 봄). / Visible leaf columns. */
  leaves(): readonly { readonly type?: string; readonly width?: number }[];
  /** 컬럼 기하 — 그릴 때마다 한 번 묻는다. / Column geometry, asked once per paint. */
  geometry(): IColumnGeometry;
  /**
   * 저장된 폭 배열. 폭 값은 기하에 묻고, 이 배열은 「그 잎에 폭이 저장돼 있나」만 본다(없으면 100px, 배열 자체가 없으면 잎의 width).
   *
   * Stored width array; only used to tell whether a leaf has a stored width — the value itself comes from the geometry.
   */
  widths(): readonly number[] | null | undefined;
  /**
   * 정의마다의 합계 결과를 주는 곳. 값 계산은 FooterValues 가 하고 이 객체는 결과만 받는다(어떤 정의·행으로
   * 셈할지는 주는 쪽이 안다). 그릴 때마다 한 번 부른다.
   *
   * Supplies the per-definition results; FooterValues computes them and the supplier knows which
   * definitions and rows. Called once per paint.
   */
  values(): readonly FooterResultLike[];
  /** 가로 스크롤 따라가기(선택). / Optional horizontal scroll follower. */
  follower?: IScrollFollower;
}

/**
 * 푸터 막대 DOM 의 주인. 값은 deps.values(), 정의는 deps.options().footer 에서.
 *
 * Owner of the footer bar DOM.
 */
export class FooterView implements IFooterView {
  private readonly _d: FooterViewDeps;
  /** 마지막으로 그린 막대(따라가기 풀기·값만 고치기용). / Last painted bar. */
  private _bar: HTMLElement | null = null;
  /** 그 막대를 그린 정의 배열(같은 배열이어야 값만 고칠 수 있다). / Definitions the bar was painted from. */
  private _defs: readonly FooterDef[] | null = null;
  /** 정의마다의 칸(정의 순서). / One cell per definition. */
  private _cells: HTMLElement[] = [];
  /** 정의마다 값 칸으로 그렸나(라벨만인 칸과 갈래가 바뀌면 통째로 다시). / Whether each cell was painted as a value cell. */
  private _valued: boolean[] = [];
  /** 그 막대를 그릴 때의 기하 판·높이·위치(바뀌면 값만 고칠 수 없다 — 칸 폭·막대 모양이 달라짐). / Shape inputs at paint time. */
  private _geoVersion = -1;
  private _height: unknown = undefined;
  private _position: unknown = undefined;
  private _follower: IScrollFollower | null;
  private _applier: IGeometryApplier | null = null;
  /** 막대 끝 여백 px(본문 세로 스크롤바 폭)와 그 자리 요소(0 이면 없음). / End gutter px and its element (none when 0). */
  private _gutter = 0;
  private _gutterEl: HTMLElement | null = null;

  constructor(deps: FooterViewDeps) {
    this._d = deps;
    this._follower = deps.follower ?? null;
  }

  /**
   * 가로 따라가기 객체를 넘겨 받는다(그리드가 렌더러를 만든 뒤 한 번). 이미 그린 막대가 있으면 옛 객체에서 풀고 새 객체에 맡긴다.
   *
   * Receives the horizontal scroll follower; an existing bar moves from the old follower to the new one.
   */
  setFollower(f: IScrollFollower | null): void {
    if (this._bar) this._follower?.unfollow(this._bar);
    this._follower = f;
    if (this._bar) f?.follow(this._bar);
  }

  /**
   * 폭 등록기를 넘겨 받는다(그리드가 기하·등록기를 만든 뒤). 막대를 그릴 때마다 폭 자리를 'footer' 범위로 등록해 두면
   * 컬럼 폭을 끄는 동안 등록기가 머리글·본문과 같은 프레임에 푸터 칸 폭도 고친다(막대를 다시 만들지 않음).
   * 이미 그린 막대가 있으면 한 번 다시 그려 등록을 맞춘다.
   *
   * Receives the geometry applier; each paint registers the footer's width spots under the 'footer' scope so a column
   * drag updates footer cells in the same frame as header and body. An existing bar is repainted once to register.
   */
  /**
   * 막대 끝 여백을 정한다(본문 세로 스크롤바 폭). 본문은 스크롤바 때문에 보이는 폭이 그만큼 좁아 가로로 그만큼 더 옮겨지는데,
   * 막대는 스크롤바가 없어 끝까지 긁으면 그만큼 덜 간다 — 그 차이를 막대 끝 빈 칸으로 메운다. 0 이면 아무것도 쓰지 않는다
   * (스크롤바가 없는 화면의 막대 글자는 지금과 같다). 이미 그린 막대는 다시 만들지 않고 그 칸만 고친다.
   *
   * Sets the bar's end gutter (the body's vertical scrollbar width) so the bar can scroll as far as the body. Zero
   * writes nothing (markup unchanged when no scrollbar shows). An existing bar is patched, not rebuilt.
   */
  setEndGutter(px: number): void {
    const w = px > 0 ? px : 0;
    if (w === this._gutter) return;
    this._gutter = w;
    const bar = this._bar;
    if (!bar) return;
    if (w === 0) { this._gutterEl?.remove(); this._gutterEl = null; return; }
    if (!this._gutterEl) { this._gutterEl = this._makeGutter(w); bar.appendChild(this._gutterEl); return; }
    this._gutterEl.style.width = `${w}px`;
  }

  private _makeGutter(w: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'og-footer-gutter';
    el.style.cssText = `width:${w}px;flex-shrink:0;`;
    return el;
  }

  setApplier(a: IGeometryApplier | null): void {
    this._applier?.release('footer');
    this._applier = a;
    if (this._bar) this.paint();
  }

  /**
   * 막대를 통째로 다시 그린다. 있던 `.og-footer-bar` 를 떼고, 정의가 있으면 새로 만들어
   * `footerPosition` 에 따라 컨테이너 맨 앞이나 맨 뒤에 넣는다.
   *
   * Rebuilds the bar: removes the existing `.og-footer-bar` and, when definitions exist, inserts a new
   * one at the top or bottom of the container per `footerPosition`.
   */
  paint(): void {
    const container = this._d.container();
    const old = container.querySelector('.og-footer-bar');
    old?.remove();
    this._release();

    const opts = this._d.options();
    const footerDefs = opts.footer;
    if (!footerDefs || footerDefs.length === 0) return;

    const leaves = this._d.leaves();
    const geometry = this._d.geometry();
    const stored = this._d.widths();
    const valMap = new Map(
      this._d.values().map((v) => [v._field, v])
    );

    const bar = document.createElement('div');
    bar.className = 'og-footer-bar';
    bar.style.cssText = [
      'display:flex;align-items:stretch;',
      `min-height:${opts.footerHeight}px;`,
      'border-top:2px solid var(--og-primary,#1976d2);',
      'background:var(--og-header-bg,#f5f5f5);',
      'overflow:hidden;flex-shrink:0;font-size:13px;font-weight:600;',
    ].join('');

    // 여분 칸 폭 — 머리글·본문과 같은 여분 컬럼 폭의 합. / Spacer width: the same extra-column width as header and body.
    const extraW = geometry.extra.width();
    if (extraW > 0) {
      const spacer = document.createElement('div');
      spacer.style.cssText = `width:${extraW}px;flex-shrink:0;border-right:1px solid var(--og-border-color,#e0e0e0);`;
      bar.appendChild(spacer);
    }

    let leafCursor = 0;
    let used: number = extraW;
    // 지금까지 그린 칸이 모두 기하 폭을 썼나(채움 칸을 등록할 수 있나). / Whether every cell so far used geometry widths.
    let allGeo = true;
    const cells: HTMLElement[] = [];
    const valued: boolean[] = [];

    for (const def of footerDefs) {
      const colspan = Math.max(1, def.colspan ?? 1);

      let cellW = 0;
      let cellGeo = true;
      for (let c = 0; c < colspan; c++) {
        cellW += this._widthAt(leafCursor + c, geometry, stored, leaves);
        cellGeo = cellGeo && this._fromGeometry(leafCursor + c, geometry, stored);
      }
      const first = leafCursor;
      allGeo = allGeo && cellGeo;
      const targetLeaf = leaves[leafCursor];
      leafCursor += colspan;
      used += cellW;

      const cell = document.createElement('div');
      cell.style.cssText = [
        `width:${cellW}px;min-width:${cellW}px;flex-shrink:0;`,
        'padding:4px 8px;box-sizing:border-box;overflow:hidden;',
        'border-right:1px solid var(--og-border-color,#e0e0e0);',
        'white-space:nowrap;text-overflow:ellipsis;',
      ].join('');

      const field = def.field;
      const val   = field ? valMap.get(field) : null;

      if (val) {
        this._writeValue(cell, def, val);
        cell.style.color = 'var(--og-primary,#1976d2)';
        cell.style.textAlign = def.align ?? (targetLeaf?.type === 'number' ? 'right' : 'right');
      } else if (def.label) {
        cell.textContent = def.label;
        cell.style.textAlign = def.align ?? 'left';
        cell.style.color = 'var(--og-row-color,#212121)';
      }

      bar.appendChild(cell);
      // 기하 폭만으로 된 칸만 등록한다 — 저장 폭이 없어 100px 를 쓰는 잎이 섞이면 그 칸 폭은 기하를 따르지 않는다.
      // Only cells made purely of geometry widths are registered; a 100px fallback leaf does not follow the geometry.
      if (cellGeo) this._applier?.trackSpan(cell, first, colspan, 'wm', 'footer');
      cells.push(cell);
      valued.push(!!val);
    }

    // 채움 칸: 푸터 정의가 컬럼보다 적으면 막대 내용이 본문보다 짧아 본문 끝쪽까지 옮길 때 푸터가 따라가다 멈춘다.
    // 본문 전체 폭(기하)까지 빈 칸으로 채워 같은 거리만큼 옮겨질 수 있게 한다. 넉넉하면 넣지 않는다.
    // Filler: with fewer footer definitions than columns the bar is shorter than the body and stops following near the
    // end; pad it to the body's total width (from the geometry) so it can scroll as far. Omitted when not needed.
    const fill = geometry.totalWidth() - used;
    if (fill > 0) {
      const filler = document.createElement('div');
      filler.className = 'og-footer-fill';
      filler.style.cssText = `width:${fill}px;flex-shrink:0;`;
      bar.appendChild(filler);
      // 채움 칸 = 남은 잎 폭의 합. 앞 칸이 모두 기하 폭일 때 등록한다. / Filler = remaining leaves' span; registered when
      // every earlier cell used geometry widths.
      if (allGeo && leafCursor < geometry.count) {
        this._applier?.trackGap(filler, leafCursor, geometry.count - 1, 'footer');
      }
    }

    this._gutterEl = this._gutter > 0 ? this._makeGutter(this._gutter) : null;
    if (this._gutterEl) bar.appendChild(this._gutterEl);

    if (opts.footerPosition === 'top') {
      container.insertBefore(bar, container.firstChild);
    } else {
      container.appendChild(bar);
    }
    this._bar = bar;
    this._defs = footerDefs;
    this._cells = cells;
    this._valued = valued;
    this._geoVersion = geometry.version;
    this._height = opts.footerHeight;
    this._position = opts.footerPosition;
    this._follower?.follow(bar);
  }

  /**
   * 값만 다시: 같은 정의로 그린 막대가 아직 컨테이너에 붙어 있으면 값 칸의 글자와 title 만 고친다(요소는 그대로 — 따라가기·스크롤 위치도 그대로).
   * 막대가 없거나, 막대 모양을 정하는 입력(정의 배열·컬럼 기하 판·높이·위치)이 바뀌었거나, 어느 칸이 값 칸↔라벨 칸으로 갈래가
   * 바뀌면 통째로 다시 그린다(결과 글자는 통째와 같다).
   *
   * Values only: when the bar painted from the same definitions is attached, rewrite just the value cells' text
   * and title (elements kept). Otherwise repaint fully; the resulting markup equals a full paint.
   */
  updateValues(): void {
    const bar = this._bar;
    const defs = this._defs;
    const opts = this._d.options();
    if (!bar || bar.parentNode !== this._d.container() || !defs || opts.footer !== defs ||
        opts.footerHeight !== this._height || opts.footerPosition !== this._position ||
        this._d.geometry().version !== this._geoVersion) {
      this.paint();
      return;
    }
    const valMap = new Map(this._d.values().map((v) => [v._field, v]));
    for (let i = 0; i < defs.length; i++) {
      const field = defs[i]!.field;
      if (!!(field && valMap.get(field)) !== this._valued[i]) {
        this.paint();
        return;
      }
    }
    for (let i = 0; i < defs.length; i++) {
      if (!this._valued[i]) continue;
      const def = defs[i]!;
      this._writeValue(this._cells[i]!, def, valMap.get(def.field!)!);
    }
  }

  /** 값 칸의 글자와 title(그리기·값만 고치기가 함께 쓰는 한 곳). / Text and title of a value cell. */
  private _writeValue(cell: HTMLElement, def: FooterDef, val: FooterResultLike): void {
    const displayVal = val._formatted ?? String(val._value ?? '');
    const prefix = def.label ? `${def.label}: ` : '';
    cell.textContent = prefix + displayVal;
    cell.title = `${(def.op as string)?.toUpperCase() ?? ''} = ${displayVal}`;
  }

  /** 따라가기를 풀고 막대 참조를 놓는다(막대 요소는 컨테이너와 함께 사라진다). / Releases the follower and the bar reference. */
  destroy(): void {
    this._release();
  }

  /**
   * 잎 하나의 칸 폭. 폭이 저장된 잎은 기하에 묻고, 저장된 폭이 없으면 100px, 폭 배열 자체가 없으면 잎의 width(없으면 100) —
   * 모두 지금 동작. 기하 범위 밖(합쳐 그리기가 마지막 잎을 넘는 경우)은 저장된 값이나 100px.
   *
   * Width of one leaf: from the geometry when a width is stored, otherwise 100px (or the leaf's own width
   * when there is no array at all) — all current behaviour.
   */
  /** 그 잎의 칸 폭이 기하에서 오나(저장 폭이 있고 기하 범위 안). / Whether the leaf's width comes from the geometry. */
  private _fromGeometry(ci: number, geometry: IColumnGeometry, stored: readonly number[] | null | undefined): boolean {
    return stored != null && stored[ci] != null && ci < geometry.count;
  }

  private _widthAt(
    ci: number,
    geometry: IColumnGeometry,
    stored: readonly number[] | null | undefined,
    leaves: readonly { readonly width?: number }[],
  ): number {
    if (stored == null) return leaves[ci]?.width ?? MISSING_WIDTH;
    const v = stored[ci];
    if (v == null) return MISSING_WIDTH;
    return ci < geometry.count ? geometry.widthOf(ci as LeafColIndex) : v;
  }

  private _release(): void {
    this._applier?.release('footer');
    if (this._bar) {
      this._follower?.unfollow(this._bar);
      this._bar = null;
      this._defs = null;
      this._cells = [];
      this._valued = [];
    }
  }
}
