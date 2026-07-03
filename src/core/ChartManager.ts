/**
 * F4 — 그리드 데이터 통합 차트 오케스트레이터(§5 라이프사이클·§C 배지·§7 F1 seam).
 *
 * 계약 근거: 11_design_F4_v2.md §5(컨테이너/배치·라이브·테마·격리)·§6(공개 API)·§C(상시 배지)·
 * §7(F1 range 스냅샷/폴백), 15_cross_contracts.md C0.3(FlatRowModel)·C0.4/C0.5(CellRange/스냅샷)·
 * C2.2(dataChange+formulaRecalc 디바운스)·C5(chart:{} 옵션·이벤트 4종)·C8.1(aria-live).
 *
 * 본 매니저는 헤드리스 코어(chart/DataExtractor·downsample·CanvasAdapter)를 "소비"만 하며
 * 그리드 상태는 전부 주입 클로저로 읽는다(기존 매니저 배선 패턴, CN-3 본문 무수정). OpenGrid 는
 * 생성자에서 deps 를 주입하고 createChart/getCharts/destroyCharts 를 이 매니저로 위임한다.
 */

import type { CellRange } from './types.js';
import type { FlatRowModel } from './FlatRowModel.js';
import type {
  ChartAdapter, ChartConfig, ChartDataModel, ChartInstance, ChartPoint,
  ChartRenderSpec, ChartTheme, ChartType,
} from './chart/types.js';
import {
  extractChartData, type ChartColumnRef, type ChartExtractDeps,
} from './chart/DataExtractor.js';
import { downsampleModel } from './chart/downsample.js';
import { OKABE_ITO } from './chart/palette.js';
import { CanvasAdapter } from './chart/CanvasAdapter.js';

const DEFAULT_MAX_POINTS = 500;
const DEFAULT_DEBOUNCE_MS = 50;
const DEFAULT_RESIZE_DEBOUNCE_MS = 100;
const DEFAULT_SIZE = { width: 480, height: 300 };

export interface ChartManagerDeps {
  getContainer(): HTMLElement;
  getOptions(): any;
  getAllRows(): Array<Record<string, any>>;
  getSelectedRows(): Array<Record<string, any>>;
  getCheckedRows(): Array<Record<string, any>>;
  /** ColumnLayout.visibleLeaves 투영(숨김 제외, C0.4). */
  getVisibleColumns(): ChartColumnRef[];
  getFlatModel(): FlatRowModel;
  getRowById(rowId: string): Record<string, any> | undefined;
  /** F1 seam(C4). 없으면 range 소스는 selection 으로 강등(§7). */
  getActiveRange?(): CellRange | null;
  /** 그리드 이벤트 구독/해제(EventEmitter). */
  on(ev: string, cb: (...a: any[]) => void): void;
  off(ev: string, cb: (...a: any[]) => void): void;
  emit(ev: string, ...args: any[]): void;
  announce(msg: string): void;
}

export type { ChartInstance } from './chart/types.js';

interface RangeSnapshot { rowIds: string[]; fields: string[] }

interface ChartRecord {
  id: string;
  config: ChartConfig;
  adapter: ChartAdapter;
  panel: HTMLElement;
  badgeBox: HTMLElement;
  host: HTMLElement;
  backdrop: HTMLElement | null;
  model: ChartDataModel;
  spec: ChartRenderSpec;
  snapshot: RangeSnapshot | null;
  liveHandler: (() => void) | null;
  debounceTimer: any;
  /** host 리사이즈 관찰자(코드리뷰 MAJOR: 부재 시 컨테이너 리사이즈에 재도색 안 됨). */
  resizeObserver: ResizeObserver | null;
  resizeDebounceTimer: any;
  /** 렌더 버퍼에 실제 적용된 크기(§ CRITICAL: adapter._w/_h 와 동기화 기준값). */
  renderSize: { width: number; height: number };
  localEvents: Map<string, Array<(...a: any[]) => void>>;
  destroyed: boolean;
  /** 인스턴스 핸들 캐시(코드리뷰 Minor: 매번 새 객체를 만들면 === 식별이 불안정해짐). */
  instance: ChartInstance | null;
}

let _seq = 0;

export class ChartManager {
  private _d: ChartManagerDeps;
  private _charts = new Map<string, ChartRecord>();

  constructor(deps: ChartManagerDeps) {
    this._d = deps;
  }

  createChart(config: ChartConfig): ChartInstance {
    const id = `chart-${++_seq}`;
    const container = this._d.getContainer();

    // ── 범위 스냅샷(INT-05): 생성 시 (rowId,field) 로 못박아 정렬/필터에도 유지 ──
    const snapshot = this._snapshotRange(config);

    // ── 어댑터 결정(§3.1): builtin(default)·미지원 lazy 는 배지+builtin 폴백 ──
    const { adapter, engineFallback } = this._resolveAdapter(config);

    // ── 패널 구성(§5.1 배치 모드) — 위치/크기/보더 전부 inline(CN-2) ──
    const { panel, host, badgeBox, backdrop } = this._buildPanel(config, container);

    const rec: ChartRecord = {
      id, config, adapter, panel, badgeBox, host, backdrop,
      model: null as any, spec: null as any, snapshot,
      liveHandler: null, debounceTimer: null,
      resizeObserver: null, resizeDebounceTimer: null,
      renderSize: { ...DEFAULT_SIZE },
      localEvents: new Map(), destroyed: false, instance: null,
    };

    // 초기화 도중 실패하면 부분 생성된 DOM/구독을 정리하고 재throw한다(코드리뷰 Minor:
    // 예외 시 rec 가 map 에 반쪽 상태로 누수되던 문제).
    try {
      this._charts.set(id, rec);

      // ── 추출 → 다운샘플 → 스펙 ──
      const { model, rangeFallback } = this._extract(rec);
      rec.model = model;
      rec.spec = this._buildSpec(config, model);

      // ── 렌더 크기 확정(§ CRITICAL): config.size 우선, 없으면 host 실측(clientWidth) 폴백,
      // jsdom(clientWidth=0)에서는 480×300 기본값으로 기존 동작 유지 ──
      rec.renderSize = this._resolveRenderSize(config, host);

      // ── 어댑터 부팅(builtin=동기). Phase3 async 어댑터는 init 프로미스 경로 필요(TODO). ──
      void adapter.init(host, rec.spec);
      // adapter 내부 좌표계(_w/_h)를 실제 렌더 크기로 동기화 — CSS 확대/축소로 인한
      // 히트테스트·툴팁 좌표 어긋남을 막는다(코드리뷰 CRITICAL).
      adapter.resize(rec.renderSize.width, rec.renderSize.height);
      adapter.render(model, rec.spec);
      adapter.onPointClick?.(p => this._onPointClick(rec, p));

      // ── 배지(§C 상시 가시) + aria-live 1회 공지 ──
      this._renderBadges(rec, rangeFallback, engineFallback);

      // ── 라이브 구독(C2.2: dataChange + formulaRecalc, 디바운스) ──
      if (config.live !== false) this._subscribeLive(rec);

      // ── 컨테이너 리사이즈 관찰(코드리뷰 MAJOR: 부재 시 리사이즈에 재도색 안 됨) ──
      this._attachResizeObserver(rec);

      // ── 이벤트(C5): chartCreate + options.chart.on* 바인딩 ──
      const inst = this._makeInstance(rec);
      this._bindOptionCallbacks(rec);
      this._emit(rec, 'chartCreate', inst);
      this._d.emit('chartCreate', inst);
      return inst;
    } catch (err) {
      try { this._destroy(rec); } catch { /* isolate cleanup failure — original err wins */ }
      throw err;
    }
  }

  // ── 렌더 크기 확정(§ CRITICAL) ──────────────────────────────────────────
  /**
   * config.size 가 명시되면 그대로 쓴다. 없으면 host 의 실측 clientWidth(실브라우저에서
   * max-width:100% 로 축소된 실제 폭)를 우선하고, 측정 불가(jsdom=0)면 480×300 기본값으로
   * 폴백해 기존 유닛 테스트 동작을 보존한다. height 는 host 콘텐츠에 따라 달라지는 값이 아니라
   * 패널 배치 시점에 확정되는 값이라 clientWidth 처럼 실측하지 않는다.
   */
  private _resolveRenderSize(config: ChartConfig, host: HTMLElement): { width: number; height: number } {
    const configured = config.size ?? DEFAULT_SIZE;
    const measuredW = host.clientWidth;
    const width = config.size?.width ?? (measuredW > 0 ? measuredW : configured.width);
    return { width, height: configured.height };
  }

  // ── 컨테이너 리사이즈 관찰(MAJOR) ───────────────────────────────────────
  private _attachResizeObserver(rec: ChartRecord): void {
    if (typeof ResizeObserver === 'undefined') return; // jsdom 미구현 환경 방어
    const wait = DEFAULT_RESIZE_DEBOUNCE_MS;
    const ro = new ResizeObserver(() => {
      if (rec.destroyed) return;
      clearTimeout(rec.resizeDebounceTimer);
      rec.resizeDebounceTimer = setTimeout(() => {
        if (rec.destroyed) return;
        const w = rec.host.clientWidth;
        if (w > 0 && w !== rec.renderSize.width) {
          rec.renderSize = { width: w, height: rec.renderSize.height };
          rec.adapter.resize(rec.renderSize.width, rec.renderSize.height);
        }
      }, wait);
    });
    ro.observe(rec.host);
    rec.resizeObserver = ro;
  }

  getCharts(): ChartInstance[] {
    return [...this._charts.values()].filter(r => !r.destroyed).map(r => this._makeInstance(r));
  }

  destroyCharts(): void {
    for (const rec of [...this._charts.values()]) this._destroy(rec);
  }

  // ── 스냅샷(§2.1.1 / INT-05) ─────────────────────────────────────────────
  private _snapshotRange(config: ChartConfig): RangeSnapshot | null {
    if (config.source.kind !== 'range') return null;
    const range = config.source.range ?? this._d.getActiveRange?.() ?? null;
    if (!range) return null;
    const flat = this._d.getFlatModel();
    const cols = this._d.getVisibleColumns();
    const rowIds: string[] = [];
    for (let r = range.startRow; r <= range.endRow; r++) {
      const rid = flat.rowIdOfFlat(r); // kind data/tree 만 rowId(그 외 pseudo-row=null, C0.3)
      if (rid != null) rowIds.push(rid);
    }
    const fields: string[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      const col = cols[c];
      if (col) fields.push(col.field);
    }
    return { rowIds, fields };
  }

  // ── 추출(§2) + 다운샘플(§8.2) ───────────────────────────────────────────
  private _extract(rec: ChartRecord): { model: ChartDataModel; rangeFallback: boolean } {
    const cfg = rec.config;
    const opts = this._d.getOptions()?.chart ?? {};
    const numberFormat = cfg.numberFormat ?? opts.numberFormat;
    const deps = this._extractDeps(rec);
    const res = extractChartData(cfg.source, deps, {
      category: cfg.category,
      series: cfg.series ?? (cfg.source.kind === 'columns' ? cfg.source.series : undefined),
      aggregate: cfg.aggregate,
      title: cfg.title,
      numberFormat,
    });
    const maxPoints = cfg.maxPoints ?? opts.maxPoints ?? DEFAULT_MAX_POINTS;
    const down = downsampleModel(res.model, maxPoints, cfg.type, { title: cfg.title, numberFormat });
    return { model: down.model, rangeFallback: res.rangeFallback };
  }

  private _extractDeps(rec: ChartRecord): ChartExtractDeps {
    const snapshot = rec.snapshot;
    return {
      getAllRows: () => this._d.getAllRows(),
      getSelectedRows: () => this._d.getSelectedRows(),
      getCheckedRows: () => this._d.getCheckedRows(),
      getVisibleColumns: () => this._d.getVisibleColumns(),
      getActiveRange: this._d.getActiveRange ? () => this._d.getActiveRange!() : undefined,
      getRangeRows: snapshot
        ? () => snapshot.rowIds.map(rid => this._d.getRowById(rid)).filter((r): r is Record<string, any> => !!r)
        : undefined,
      getRangeColumns: snapshot
        ? () => {
            const all = this._d.getVisibleColumns();
            const set = new Set(snapshot.fields);
            const subset = all.filter(c => set.has(c.field));
            return subset.length ? subset : all;
          }
        : undefined,
    };
  }

  // ── 스펙(§3.1) + 테마 스냅샷(§5.3) ──────────────────────────────────────
  private _buildSpec(config: ChartConfig, model: ChartDataModel): ChartRenderSpec {
    const opts = this._d.getOptions()?.chart ?? {};
    const theme = this._snapshotTheme();
    const spec: ChartRenderSpec = {
      type: config.type,
      theme,
      a11y: model.meta.a11yTable,
      palette: config.palette ?? opts.palette ?? theme.palette,
    };
    if (config.title !== undefined) spec.title = config.title;
    if (config.legend !== undefined) spec.legend = config.legend;
    if (config.tooltip !== undefined) spec.tooltip = config.tooltip;
    if (config.axis !== undefined) spec.axis = config.axis;
    const nf = config.numberFormat ?? opts.numberFormat;
    if (nf) spec.numberFormat = nf;
    return spec;
  }

  private _readVar(container: HTMLElement, name: string, fb: string): string {
    const v = getComputedStyle(container).getPropertyValue(name).trim();
    return v || fb;
  }

  private _snapshotTheme(): ChartTheme {
    const c = this._d.getContainer();
    const opts = this._d.getOptions()?.chart ?? {};
    const primary = this._readVar(c, '--og-primary', '#1976d2');
    const fontSizeRaw = this._readVar(c, '--og-font-size', '13px');
    const fontSize = parseInt(fontSizeRaw, 10) || 13;
    return {
      primary,
      border: this._readVar(c, '--og-border-color', '#e0e0e0'),
      text: this._readVar(c, '--og-row-color', '#212121'),
      bg: this._readVar(c, '--og-row-bg', '#ffffff'),
      gridLine: this._readVar(c, '--og-border-color', '#e0e0e0'),
      fontFamily: getComputedStyle(c).fontFamily || 'sans-serif',
      fontSize,
      palette: (opts.palette && opts.palette.length ? opts.palette : OKABE_ITO).slice(),
    };
  }

  // ── 패널(§5.1) ──────────────────────────────────────────────────────────
  private _buildPanel(config: ChartConfig, container: HTMLElement) {
    const placement = config.placement ?? this._d.getOptions()?.chart?.placement ?? 'docked';
    const size = config.size ?? DEFAULT_SIZE;

    const panel = document.createElement('div');
    panel.className = 'og-chart-panel';
    panel.setAttribute('data-placement', placement);
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', config.title ?? '차트');

    const badgeBox = document.createElement('div');
    badgeBox.className = 'og-chart-badges';
    badgeBox.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;';

    const host = document.createElement('div');
    host.className = 'og-chart-host';
    host.style.cssText = `position:relative;width:${size.width}px;max-width:100%;`;

    let backdrop: HTMLElement | null = null;

    const bg = this._readVar(container, '--og-row-bg', '#ffffff');
    const border = this._readVar(container, '--og-border-color', '#e0e0e0');
    const basePanel =
      `box-sizing:border-box;padding:10px;background:${bg};` +
      `border:1px solid ${border};border-radius:6px;`;

    if (placement === 'modal') {
      backdrop = document.createElement('div');
      backdrop.className = 'og-chart-backdrop';
      backdrop.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;' +
        'display:flex;align-items:center;justify-content:center;';
      panel.style.cssText = basePanel + 'max-width:90vw;max-height:90vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,0.3);';
      backdrop.appendChild(panel);
      backdrop.addEventListener('click', e => { if (e.target === backdrop) this._destroyById(panel); });
      document.body.appendChild(backdrop);
    } else if (placement === 'inline') {
      panel.style.cssText = basePanel + 'width:100%;';
      (config.mount ?? container).appendChild(panel);
    } else if (placement === 'floating') {
      // opt-in만. drag/resize 는 Phase2(§5.1) — 여기선 고정 절대배치.
      panel.style.cssText = basePanel + 'position:absolute;top:12px;right:12px;z-index:20;box-shadow:0 4px 16px rgba(0,0,0,0.18);';
      container.appendChild(panel);
    } else {
      // docked(default): 그리드 컨테이너 하단에 형제로 append(HANMS-12).
      panel.style.cssText = basePanel + 'width:100%;margin-top:8px;';
      container.appendChild(panel);
    }

    panel.appendChild(badgeBox);
    panel.appendChild(host);
    return { panel, host, badgeBox, backdrop };
  }

  // ── 배지(§C 상시 가시) ──────────────────────────────────────────────────
  private _renderBadges(rec: ChartRecord, rangeFallback: boolean, engineFallback: string | null): void {
    const box = rec.badgeBox;
    box.innerHTML = '';
    const meta = rec.model.meta;
    const badges: string[] = [];
    if (meta.sampled && meta.sampledFrom) {
      badges.push(`샘플링됨 ${meta.sampledTo?.toLocaleString()}/${meta.sampledFrom.toLocaleString()}행`);
    }
    if (meta.aggregatedOp) badges.push(`category 집계됨 (${meta.aggregatedOp})`);
    if (meta.pieReducedToFirst) badges.push('파이: 첫 시리즈만 표시');
    if (meta.negativesAbsInPie) badges.push('음수→절대값 표시 · bar 권장');
    if (rangeFallback) badges.push('범위 소스 없음 · 선택 행으로 대체');
    if (engineFallback) badges.push(`${engineFallback} 미설치 · 내장 차트로 대체`);

    for (const text of badges) {
      const span = document.createElement('span');
      span.className = 'og-chart-badge';
      span.style.cssText =
        'display:inline-block;padding:2px 8px;font-size:11px;border-radius:10px;' +
        'background:#fff3cd;color:#8a6d3b;border:1px solid #ffe08a;';
      span.textContent = text;
      box.appendChild(span);
    }
    box.style.display = badges.length ? 'flex' : 'none';
    if (badges.length) this._d.announce(`차트 안내: ${badges.join(', ')}`);
  }

  // ── 라이브 구독(C2.2) ───────────────────────────────────────────────────
  private _subscribeLive(rec: ChartRecord): void {
    const opts = this._d.getOptions()?.chart ?? {};
    const wait = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS; // REQ-20: 정착 후 1회 render(50ms 기본)
    const handler = () => {
      if (rec.destroyed) return;
      clearTimeout(rec.debounceTimer);
      rec.debounceTimer = setTimeout(() => {
        if (!rec.destroyed) this._refresh(rec);
      }, wait);
    };
    rec.liveHandler = handler;
    this._d.on('dataChange', handler);
    this._d.on('formulaRecalc', handler);
  }

  // ── refresh: 재추출(스냅샷 rowId 재조회) → 재렌더 ──────────────────────
  private _refresh(rec: ChartRecord): void {
    if (rec.destroyed) return;
    const { model, rangeFallback } = this._extract(rec);
    rec.model = model;
    rec.spec = this._buildSpec(rec.config, model);
    rec.adapter.render(model, rec.spec);
    this._renderBadges(rec, rangeFallback, null);
    this._emit(rec, 'chartRender', { id: rec.id, model });
    this._d.emit('chartRender', { id: rec.id, model });
  }

  // ── 어댑터 결정(§3.1) ───────────────────────────────────────────────────
  private _resolveAdapter(config: ChartConfig): { adapter: ChartAdapter; engineFallback: string | null } {
    const engine = config.engine ?? this._d.getOptions()?.chart?.defaultEngine ?? 'builtin';
    if (engine && typeof engine === 'object') return { adapter: engine, engineFallback: null };
    if (engine === 'chartjs' || engine === 'echarts') {
      // Phase3 lazy 어댑터 미구현 → 배지 + builtin 폴백(§3.1).
      return { adapter: new CanvasAdapter(), engineFallback: engine };
    }
    return { adapter: new CanvasAdapter(), engineFallback: null };
  }

  // ── 포인트 클릭(§5.4) ───────────────────────────────────────────────────
  private _onPointClick(rec: ChartRecord, point: ChartPoint): void {
    this._emit(rec, 'chartPointClick', { id: rec.id, point });
    this._d.emit('chartPointClick', { id: rec.id, point });
  }

  // ── 인스턴스 핸들(§6) ───────────────────────────────────────────────────
  /** rec 당 1회만 생성해 캐시한다(코드리뷰 Minor: 매번 새 객체면 === 식별이 불안정). */
  private _makeInstance(rec: ChartRecord): ChartInstance {
    if (rec.instance) return rec.instance;
    const inst: ChartInstance = {
      id: rec.id,
      update: (patch?: Partial<ChartConfig>) => {
        if (rec.destroyed) return;
        if (patch) rec.config = { ...rec.config, ...patch };
        if (patch && (patch.source || patch.category || patch.series)) rec.snapshot = this._snapshotRange(rec.config);
        this._refresh(rec);
      },
      refresh: () => this._refresh(rec),
      setType: (type: ChartType) => {
        if (rec.destroyed) return;
        rec.config = { ...rec.config, type };
        this._refresh(rec);
      },
      destroy: () => this._destroy(rec),
      toBlob: (mime?: string) => rec.adapter.toBlob ? rec.adapter.toBlob(mime) : Promise.resolve(null),
      getModel: () => rec.model,
      on: (ev, cb) => this._on(rec, ev, cb),
    };
    rec.instance = inst;
    return inst;
  }

  private _bindOptionCallbacks(rec: ChartRecord): void {
    const opts = this._d.getOptions()?.chart ?? {};
    const inst = this._makeInstance(rec);
    if (typeof opts.onChartCreate === 'function') opts.onChartCreate(inst);
    if (typeof opts.onChartRender === 'function') this._on(rec, 'chartRender', opts.onChartRender);
    if (typeof opts.onChartPointClick === 'function') this._on(rec, 'chartPointClick', opts.onChartPointClick);
    if (typeof opts.onChartDestroy === 'function') this._on(rec, 'chartDestroy', opts.onChartDestroy);
  }

  // ── 로컬 이벤트 버스(인스턴스 on) ───────────────────────────────────────
  private _on(rec: ChartRecord, ev: string, cb: (...a: any[]) => void): void {
    const list = rec.localEvents.get(ev) ?? [];
    list.push(cb);
    rec.localEvents.set(ev, list);
  }
  private _emit(rec: ChartRecord, ev: string, ...args: any[]): void {
    for (const cb of rec.localEvents.get(ev) ?? []) { try { cb(...args); } catch { /* isolate */ } }
  }

  // ── 파괴(§5.2 누수 방지) ────────────────────────────────────────────────
  private _destroyById(panel: HTMLElement): void {
    for (const rec of this._charts.values()) if (rec.panel === panel) { this._destroy(rec); return; }
  }
  private _destroy(rec: ChartRecord): void {
    if (rec.destroyed) return;
    rec.destroyed = true;
    if (rec.liveHandler) {
      this._d.off('dataChange', rec.liveHandler);
      this._d.off('formulaRecalc', rec.liveHandler);
    }
    clearTimeout(rec.debounceTimer);
    clearTimeout(rec.resizeDebounceTimer);
    try { rec.resizeObserver?.disconnect(); } catch { /* isolate */ }
    try { rec.adapter.destroy(); } catch { /* isolate */ }
    (rec.backdrop ?? rec.panel).remove();
    this._emit(rec, 'chartDestroy', { id: rec.id });
    this._d.emit('chartDestroy', { id: rec.id });
    rec.localEvents.clear();
    this._charts.delete(rec.id);
  }
}
