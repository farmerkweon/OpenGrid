/**
 * F4 — 내장 zero-dep canvas 어댑터 (§3/§4/§B). ChartAdapter 구현체(id='builtin-canvas').
 *
 * 계약 근거: 11_design_F4_v2.md §3.1(ChartAdapter)·§4(bar/line·축·범례·툴팁)·§B(a11y 하드
 * 게이트: 시각숨김 table·role=img·실 button 범례·키보드 순회)·§8.1(nice-number)·§8.3(hit-test).
 * 실코드 선례: SparklineRenderer(CellRenderer.ts:519-579, 유일 canvas 선례).
 *
 * ⚠️ jsdom 은 `canvas.getContext('2d')` 가 null 이다. 따라서 **그리기(ctx)와 기하(PointGeom)를
 * 분리**한다 — 기하·DOM(테이블/범례/툴팁/aria)은 ctx 없이도 완전히 계산·구성되고, ctx 는
 * 실제 픽셀 그리기에만 쓰며 null 이면 조용히 건너뛴다. 단위테스트는 기하·DOM 만 assert 한다.
 */

import type {
  ChartAdapter, ChartDataModel, ChartPoint, ChartRenderSpec, ChartSeries,
} from './types.js';
import { niceScale } from './scales.js';
import { hitTest, type PointGeom } from './hittest.js';
import { resolveSeriesStyles } from './palette.js';

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;padding:0;margin:-1px;';

const PAD = { top: 26, right: 14, bottom: 34, left: 52 };
const MARKER_R = 3.5;

/** a11y 테이블 id 발급용 모듈 스코프 단조 카운터(ChartManager._seq 와 동일 패턴, Date/Math.random 회피). */
let _a11yIdSeq = 0;

function fmt(v: number | null, spec: ChartRenderSpec, axis: 'x' | 'y' | 'tooltip' | 'legend'): string {
  if (v == null || Number.isNaN(v)) return '';
  return spec.numberFormat ? spec.numberFormat(v, { axis }) : String(v);
}

export class CanvasAdapter implements ChartAdapter {
  readonly id = 'builtin-canvas';

  private _host: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _a11yTable: HTMLTableElement | null = null;
  private _legend: HTMLElement | null = null;
  private _tooltip: HTMLElement | null = null;
  private _live: HTMLElement | null = null;
  private _spec!: ChartRenderSpec;
  private _model: ChartDataModel | null = null;

  private _w = 480;
  private _h = 300;
  private _geoms: PointGeom[] = [];
  private _hidden = new Set<number>();      // 범례 토글로 숨긴 series 인덱스
  private _cursor = { cat: 0, series: 0 };  // 키보드 커서
  private _onPoint: ((p: ChartPoint) => void) | null = null;

  // ── 라이프사이클 ────────────────────────────────────────────────────────
  async init(host: HTMLElement, spec: ChartRenderSpec): Promise<void> {
    this._host = host;
    this._spec = spec;
    host.classList.add('og-chart');
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    // canvas(role=img) — 픽셀 렌더 타겟 + 키보드 진입점
    const canvas = document.createElement('canvas');
    canvas.className = 'og-chart-canvas';
    canvas.style.cssText = 'display:block;';
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', spec.title ?? '차트');
    this._canvas = canvas;

    // 시각숨김 a11y 테이블(§B.1) — canvas 와 형제, aria-describedby 로 연결
    const table = document.createElement('table');
    table.className = 'og-chart-a11y';
    table.style.cssText = VISUALLY_HIDDEN;
    const tableId = `og-chart-a11y-${++_a11yIdSeq}`;
    table.id = tableId;
    canvas.setAttribute('aria-describedby', tableId);
    this._a11yTable = table;

    // 실 <button> 범례(§B.2)
    const legend = document.createElement('div');
    legend.className = 'og-chart-legend';
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;';
    this._legend = legend;

    // 툴팁 오버레이(§4)
    const tip = document.createElement('div');
    tip.className = 'og-chart-tooltip';
    tip.style.cssText =
      'position:absolute;pointer-events:none;display:none;z-index:5;padding:4px 8px;' +
      'font-size:12px;border-radius:4px;background:#333;color:#fff;white-space:nowrap;';
    this._tooltip = tip;

    // 로컬 aria-live(C8.1 공용 리전과 별개로 패널 내 폴백 — 키보드 순회 공지 e2e 안정화)
    const live = document.createElement('div');
    live.className = 'og-chart-live';
    live.setAttribute('aria-live', 'polite');
    live.style.cssText = VISUALLY_HIDDEN;
    this._live = live;

    host.appendChild(canvas);
    host.appendChild(table);
    host.appendChild(legend);
    host.appendChild(tip);
    host.appendChild(live);

    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
    canvas.addEventListener('click', this._onClick);
    canvas.addEventListener('keydown', this._onKeyDown);
  }

  render(model: ChartDataModel, spec: ChartRenderSpec): void {
    this._model = model;
    this._spec = spec;
    // 라이브 갱신으로 categories/series 수가 줄면 다음 키 입력 전에도 커서를 즉시 클램프한다.
    this._cursor.cat = model.categories.length
      ? Math.min(Math.max(this._cursor.cat, 0), model.categories.length - 1)
      : 0;
    this._cursor.series = model.series.length
      ? Math.min(Math.max(this._cursor.series, 0), model.series.length - 1)
      : 0;
    if (this._canvas) {
      this._canvas.setAttribute('aria-label', spec.a11y?.caption ?? spec.title ?? '차트');
    }
    this._renderA11yTable(model, spec);
    this._renderLegend(model, spec);
    this._computeGeometry(model, spec);
    this._paint(model, spec);
    // 라이브 재렌더 후 stale 툴팁이 남지 않도록 닫는다(다음 mousemove/키보드 공지가 재도색).
    this._hideTooltip();
  }

  resize(width: number, height: number): void {
    this._w = Math.max(80, Math.floor(width));
    this._h = Math.max(60, Math.floor(height));
    if (this._model) this.render(this._model, this._spec);
  }

  onPointClick(cb: (p: ChartPoint) => void): void {
    this._onPoint = cb;
  }

  destroy(): void {
    const c = this._canvas;
    if (c) {
      c.removeEventListener('mousemove', this._onMouseMove);
      c.removeEventListener('mouseleave', this._onMouseLeave);
      c.removeEventListener('click', this._onClick);
      c.removeEventListener('keydown', this._onKeyDown);
    }
    this._a11yTable?.remove();
    this._canvas?.remove();
    this._legend?.remove();
    this._tooltip?.remove();
    this._live?.remove();
    this._host?.classList.remove('og-chart');
    this._host = this._canvas = this._a11yTable = this._legend = this._tooltip = this._live = null;
    this._geoms = [];
    this._onPoint = null;
  }

  // ── 테스트/디버그 접근자 ────────────────────────────────────────────────
  /** 렌더된 포인트 기하(hittest.spec/adapter.spec 검증용). */
  getGeometry(): readonly PointGeom[] { return this._geoms; }

  // ── a11y 테이블(§B.1) ───────────────────────────────────────────────────
  private _renderA11yTable(model: ChartDataModel, _spec: ChartRenderSpec): void {
    const table = this._a11yTable;
    if (!table) return;
    const a11y = model.meta.a11yTable;
    table.innerHTML = '';
    const caption = document.createElement('caption');
    caption.textContent = a11y.caption;
    table.appendChild(caption);
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    for (const h of a11y.colHeaders) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const row of a11y.rows) {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const el = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) (el as HTMLTableCellElement).scope = 'row';
        el.textContent = cell;
        tr.appendChild(el);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  // ── 범례(§B.2 실 button) ────────────────────────────────────────────────
  /**
   * diff 렌더: series 수/이름이 이전과 동일하면 기존 버튼 DOM 을 재사용해 aria-pressed·색·
   * 라벨만 갱신한다(포커스 보존). series 구성 자체가 바뀔 때만 통째로 재생성하되, 재생성 직전
   * activeElement 가 범례 내부 버튼이면 재생성 후 동일 index 버튼에 포커스를 복원한다
   * (코드리뷰 MAJOR: 라이브 재렌더가 범례 innerHTML='' 로 키보드 포커스를 유실하던 문제).
   */
  private _renderLegend(model: ChartDataModel, spec: ChartRenderSpec): void {
    const legend = this._legend;
    if (!legend) return;
    if (spec.legend === false) { legend.style.display = 'none'; return; }
    legend.style.display = 'flex';
    const styles = this._styles(model, spec);
    const existing = Array.from(legend.querySelectorAll<HTMLButtonElement>('button.og-chart-legend-item'));
    const canReuse =
      existing.length === model.series.length &&
      existing.every((btn, i) => btn.dataset['seriesName'] === model.series[i]!.name);

    if (canReuse) {
      model.series.forEach((_s, i) => {
        const btn = existing[i]!;
        const pressed = !this._hidden.has(i);
        this._updateLegendButton(btn, model.series[i]!, styles[i]!, pressed);
      });
      return;
    }

    // series 구성 변경 — 재생성 전 포커스 위치(범례 내부 버튼 index)를 기억해둔다.
    const active = document.activeElement;
    const focusIndex = active instanceof HTMLButtonElement ? existing.indexOf(active) : -1;

    legend.innerHTML = '';
    model.series.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'og-chart-legend-item';
      btn.dataset['seriesName'] = s.name;
      btn.style.cssText =
        'display:inline-flex;align-items:center;gap:5px;min-height:24px;padding:2px 6px;' +
        'font-size:12px;cursor:pointer;background:none;border:1px solid transparent;border-radius:4px;';
      const swatch = document.createElement('span');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;';
      const label = document.createElement('span');
      btn.appendChild(swatch);
      btn.appendChild(label);
      this._updateLegendButton(btn, s, styles[i]!, !this._hidden.has(i));
      btn.addEventListener('click', () => {
        const nowHidden = !this._hidden.has(i);
        if (nowHidden) this._hidden.add(i); else this._hidden.delete(i);
        // 범례 DOM 은 유지(키보드 포커스 보존) — 버튼 상태만 갱신하고 캔버스만 재계산·재도색.
        this._updateLegendButton(btn, s, styles[i]!, !nowHidden);
        this._computeGeometry(this._model!, this._spec);
        this._paint(this._model!, this._spec);
      });
      legend.appendChild(btn);
    });

    if (focusIndex >= 0) {
      const buttons = legend.querySelectorAll<HTMLButtonElement>('button.og-chart-legend-item');
      const target = buttons[focusIndex] ?? buttons[buttons.length - 1];
      target?.focus();
    }
  }

  /** 범례 버튼의 aria-pressed/색상 스와치/라벨(패턴 병기)을 현재 상태로 갱신(DOM 은 그대로). */
  private _updateLegendButton(
    btn: HTMLButtonElement,
    s: ChartSeries,
    style: ReturnType<typeof resolveSeriesStyles>[number],
    pressed: boolean
  ): void {
    btn.setAttribute('aria-pressed', String(pressed));
    btn.style.opacity = pressed ? '1' : '0.45';
    const swatch = btn.querySelector('span[aria-hidden]') as HTMLElement | null;
    if (swatch) swatch.style.background = style.color;
    const label = btn.querySelector('span:not([aria-hidden])') as HTMLElement | null;
    // 색 외 구분(§D): 패턴명을 범례 텍스트에 병기
    if (label) label.textContent = `${s.name} (${style.pattern})`;
  }

  private _styles(model: ChartDataModel, spec: ChartRenderSpec) {
    return resolveSeriesStyles(
      model.series.map(s => ({ color: s.color, pattern: s.pattern })),
      { palette: spec.palette ?? spec.theme?.palette, primary: spec.theme?.primary }
    );
  }

  // ── 기하 계산(ctx 무관, §8.3 hit-test 대상) ─────────────────────────────
  private _plotRect() {
    return {
      x: PAD.left,
      y: PAD.top,
      w: Math.max(1, this._w - PAD.left - PAD.right),
      h: Math.max(1, this._h - PAD.top - PAD.bottom),
    };
  }

  private _valueExtent(model: ChartDataModel): { min: number; max: number } {
    let min = Infinity, max = -Infinity;
    model.series.forEach((s, si) => {
      if (this._hidden.has(si)) return;
      for (const v of s.data) {
        if (v == null || Number.isNaN(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    // bar 는 0 기준선 포함
    if (this._spec.type === 'bar' || this._spec.type === 'bar-stacked' || this._spec.type === 'bar-grouped') {
      min = Math.min(0, min); max = Math.max(0, max);
    }
    return { min, max };
  }

  private _computeGeometry(model: ChartDataModel, spec: ChartRenderSpec): void {
    const geoms: PointGeom[] = [];
    const plot = this._plotRect();
    const cats = model.categories;
    const n = cats.length || 1;
    const { min, max } = this._valueExtent(model);
    const scale = niceScale(min, max, 6);
    const yOf = (v: number): number => {
      const t = (v - scale.min) / (scale.max - scale.min || 1);
      return plot.y + plot.h - t * plot.h;
    };
    const baseY = yOf(0 < scale.min ? scale.min : 0 > scale.max ? scale.max : 0);
    const slot = plot.w / n;
    const isLine = spec.type === 'line' || spec.type === 'area';
    const visibleSeries = model.series
      .map((s, si) => ({ s, si }))
      .filter(({ si }) => !this._hidden.has(si));

    if (isLine) {
      for (const { s, si } of visibleSeries) {
        s.data.forEach((v, ci) => {
          const cx = plot.x + slot * ci + slot / 2;
          const cy = v == null ? NaN : yOf(v);
          if (Number.isNaN(cy)) return;
          geoms.push({
            seriesIndex: si, categoryIndex: ci,
            x: cx - MARKER_R, y: cy - MARKER_R, w: MARKER_R * 2, h: MARKER_R * 2,
            cx, cy,
          });
        });
      }
    } else {
      // bar/bar-stacked/bar-grouped 전부 그룹형(side-by-side)으로 배치한다. bar-stacked 는
      // Phase2 예약 타입(§4)이며 스택 누적은 미구현 — 지정해도 여기서 그룹형으로 폴백한다.
      // 공개 타입에서 제거하면 하위호환이 깨지므로 유지하고 문서로만 한계를 명시한다(코드리뷰 Minor).
      const groupCount = visibleSeries.length || 1;
      const bandW = slot * 0.72;
      const barW = bandW / groupCount;
      visibleSeries.forEach(({ s, si }, gi) => {
        s.data.forEach((v, ci) => {
          if (v == null || Number.isNaN(v)) return;
          const bandX = plot.x + slot * ci + (slot - bandW) / 2;
          const x = bandX + barW * gi;
          const vy = yOf(v);
          const y = Math.min(vy, baseY);
          const h = Math.abs(baseY - vy);
          geoms.push({
            seriesIndex: si, categoryIndex: ci,
            x, y, w: barW, h,
            cx: x + barW / 2, cy: y + h / 2,
          });
        });
      });
    }
    this._geoms = geoms;
  }

  // ── 픽셀 그리기(ctx null 이면 no-op) ────────────────────────────────────
  private _paint(model: ChartDataModel, spec: ChartRenderSpec): void {
    const canvas = this._canvas;
    if (!canvas) return;
    const dpr = deviceRatio();
    canvas.width = Math.floor(this._w * dpr);
    canvas.height = Math.floor(this._h * dpr);
    // 표시 픽셀 크기를 내부 버퍼/geom 좌표계(this._w/_h)와 정확히 일치시킨다(CSS %/auto 확대 금지 —
    // 그렇지 않으면 _localXY 히트테스트·툴팁 좌표가 어긋난다, 코드리뷰 CRITICAL).
    canvas.style.width = `${this._w}px`;
    canvas.style.height = `${this._h}px`;
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return; // jsdom — 기하/DOM 은 이미 준비됨
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._w, this._h);

    const theme = spec.theme;
    const plot = this._plotRect();
    const { min, max } = this._valueExtent(model);
    const scale = niceScale(min, max, 6);
    const yOf = (v: number): number => {
      const t = (v - scale.min) / (scale.max - scale.min || 1);
      return plot.y + plot.h - t * plot.h;
    };

    // 축·그리드선·눈금 라벨(§8.1)
    ctx.strokeStyle = theme?.gridLine || theme?.border || '#e0e0e0';
    ctx.fillStyle = theme?.text || '#212121';
    ctx.lineWidth = 1;
    ctx.font = `${theme?.fontSize || 12}px ${theme?.fontFamily || 'sans-serif'}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of scale.ticks) {
      const y = yOf(t);
      ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
      ctx.fillText(fmt(t, spec, 'y'), plot.x - 6, y);
    }
    // x 축 카테고리 라벨
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const slot = plot.w / (model.categories.length || 1);
    model.categories.forEach((cat, ci) => {
      const cx = plot.x + slot * ci + slot / 2;
      ctx.fillText(String(cat), cx, plot.y + plot.h + 6);
    });

    // 데이터: 미리 계산된 geom 을 그대로 그린다(단일 진실원 — hit-test 정합).
    const styles = this._styles(model, spec);
    const isLine = spec.type === 'line' || spec.type === 'area';
    if (isLine) {
      // series 별로 geom 을 모아 선/마커
      const bySeries = new Map<number, PointGeom[]>();
      for (const g of this._geoms) {
        let arr = bySeries.get(g.seriesIndex);
        if (!arr) { arr = []; bySeries.set(g.seriesIndex, arr); }
        arr.push(g);
      }
      for (const [si, gs] of bySeries) {
        gs.sort((a, b) => a.categoryIndex - b.categoryIndex);
        ctx.strokeStyle = styles[si]!.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dashFor(styles[si]!.pattern));
        ctx.beginPath();
        gs.forEach((g, i) => (i === 0 ? ctx.moveTo(g.cx, g.cy) : ctx.lineTo(g.cx, g.cy)));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = styles[si]!.color;
        for (const g of gs) { ctx.beginPath(); ctx.arc(g.cx, g.cy, MARKER_R, 0, Math.PI * 2); ctx.fill(); }
      }
    } else {
      for (const g of this._geoms) {
        ctx.fillStyle = styles[g.seriesIndex]!.color;
        ctx.fillRect(g.x, g.y, g.w, g.h);
        paintPattern(ctx, g, styles[g.seriesIndex]!.pattern);
      }
    }
  }

  // ── 상호작용 ────────────────────────────────────────────────────────────
  private _localXY(e: MouseEvent): { x: number; y: number } {
    const rect = this._canvas?.getBoundingClientRect();
    // jsdom 은 rect 가 0 — offsetX/Y 폴백
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return { x: (e as any).offsetX ?? 0, y: (e as any).offsetY ?? 0 };
    }
    // 방어적 역보정: canvas.style.width/height 는 this._w/_h 와 동기화되지만, 외부 CSS(줌·상위
    // transform·전환 중 잔여 스케일)로 표시폭이 그와 달라질 가능성에 대비해 rect 대비 스케일을
    // 되돌려 _geoms 좌표계(0..this._w/0..this._h)로 정규화한다(코드리뷰 CRITICAL 파급 방어).
    const scaleX = rect.width > 0 ? this._w / rect.width : 1;
    const scaleY = rect.height > 0 ? this._h / rect.height : 1;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  private _onMouseMove = (e: MouseEvent): void => {
    if (this._spec.tooltip === false) return;
    const { x, y } = this._localXY(e);
    const hit = hitTest(this._geoms, x, y, this._spec.type);
    if (hit) this._showTooltip(hit, x, y); else this._hideTooltip();
  };

  private _onMouseLeave = (): void => this._hideTooltip();

  private _onClick = (e: MouseEvent): void => {
    const { x, y } = this._localXY(e);
    const hit = hitTest(this._geoms, x, y, this._spec.type);
    if (hit) this._emitPoint(hit);
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    const model = this._model;
    if (!model) return;
    const nCat = model.categories.length;
    const nSer = model.series.length;
    let handled = true;
    switch (e.key) {
      case 'ArrowRight': this._cursor.cat = Math.min(nCat - 1, this._cursor.cat + 1); break;
      case 'ArrowLeft':  this._cursor.cat = Math.max(0, this._cursor.cat - 1); break;
      case 'ArrowDown':  this._cursor.series = Math.min(nSer - 1, this._cursor.series + 1); break;
      case 'ArrowUp':    this._cursor.series = Math.max(0, this._cursor.series - 1); break;
      case 'Enter':
      case ' ': {
        const p = this._cursorPoint();
        if (p) this._emitPoint(p);
        break;
      }
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    this._announceCursor();
  };

  private _cursorPoint(): PointGeom | null {
    return this._geoms.find(
      g => g.categoryIndex === this._cursor.cat && g.seriesIndex === this._cursor.series
    ) ?? null;
  }

  private _announceCursor(): void {
    const model = this._model;
    if (!model) return;
    const s = model.series[this._cursor.series];
    const cat = model.categories[this._cursor.cat];
    const v = s?.data[this._cursor.cat] ?? null;
    const msg = `${s?.name ?? ''}, ${cat ?? ''}: ${fmt(v, this._spec, 'tooltip') || '없음'}`;
    if (this._live) this._live.textContent = msg;
    const g = this._cursorPoint();
    if (g) this._showTooltip(g, g.cx, g.cy);
  }

  private _pointOf(g: PointGeom): ChartPoint {
    const model = this._model!;
    return {
      seriesName: model.series[g.seriesIndex]?.name ?? '',
      category: model.categories[g.categoryIndex] ?? '',
      value: model.series[g.seriesIndex]?.data[g.categoryIndex] ?? null,
      index: g.categoryIndex,
    };
  }

  private _emitPoint(g: PointGeom): void {
    this._onPoint?.(this._pointOf(g));
  }

  private _showTooltip(g: PointGeom, x: number, y: number): void {
    const tip = this._tooltip;
    if (!tip || this._spec.tooltip === false) return;
    const p = this._pointOf(g);
    tip.textContent = `${p.seriesName} · ${p.category}: ${fmt(p.value, this._spec, 'tooltip')}`;
    tip.style.display = 'block';
    tip.style.left = `${x + 10}px`;
    tip.style.top = `${y + 10}px`;
  }

  private _hideTooltip(): void {
    if (this._tooltip) this._tooltip.style.display = 'none';
  }
}

// ── 순수 헬퍼 ──────────────────────────────────────────────────────────────
function dashFor(pattern: ChartSeries['pattern']): number[] {
  switch (pattern) {
    case 'hatch': return [6, 3];
    case 'dot':   return [2, 3];
    case 'cross': return [8, 3, 2, 3];
    default:      return [];
  }
}

/** bar 텍스처(§D 색 외 구분). ctx 확정 상태에서만 호출. */
function paintPattern(ctx: CanvasRenderingContext2D, g: PointGeom, pattern: ChartSeries['pattern']): void {
  if (pattern === 'solid' || !pattern) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x, g.y, g.w, g.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  const step = 5;
  if (pattern === 'hatch' || pattern === 'cross') {
    for (let d = -g.h; d < g.w; d += step) {
      ctx.beginPath(); ctx.moveTo(g.x + d, g.y + g.h); ctx.lineTo(g.x + d + g.h, g.y); ctx.stroke();
    }
  }
  if (pattern === 'cross') {
    for (let d = 0; d < g.w + g.h; d += step) {
      ctx.beginPath(); ctx.moveTo(g.x + d, g.y); ctx.lineTo(g.x + d - g.h, g.y + g.h); ctx.stroke();
    }
  }
  if (pattern === 'dot') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let yy = g.y + step; yy < g.y + g.h; yy += step) {
      for (let xx = g.x + step; xx < g.x + g.w; xx += step) {
        ctx.beginPath(); ctx.arc(xx, yy, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function deviceRatio(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
}
