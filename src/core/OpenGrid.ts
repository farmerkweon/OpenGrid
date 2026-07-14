import { EventEmitter } from './EventEmitter.js';
import { DataLayer } from './DataLayer.js';
import { VirtualScroll } from './VirtualScroll.js';
import { ColumnLayout } from './ColumnLayout.js';
import { FilterPanel } from './FilterPanel.js';
import { GridRenderer } from './GridRenderer.js';
import type { RendererCallbacks, DetailRenderContext } from './GridRenderer.js';
import { AppearanceResolver, ThemeContext } from './AppearanceResolver.js';
import { skinRegistry } from './SkinRegistry.js';
import { densityRegistry, DENSITY_TOKENS } from './appearance/DensityRegistry.js';
import { textureRegistry, TEXTURE_TOKENS } from './appearance/TextureRegistry.js';
import { iconRegistry, IconRegistry } from './IconRegistry.js';
import { localeRegistry, LocaleRegistry } from './i18n/LocaleRegistry.js';
import type { PartialLocaleMessages, LocaleMessageKey, MessageValue } from './i18n/types.js';
import type { SkinTokenDelta } from './types.js';
import { RenderController } from './RenderController.js';
import { GridComposer } from './GridComposer.js';
import type { ComposerHost } from './GridComposer.js';
import { MutationService } from './MutationService.js';
import { FormulaController } from './FormulaController.js';
import { CrossGridController } from './CrossGridController.js';
import { DetailManager } from './DetailManager.js';
import { getDetailGlyph } from './detail/DetailGlyph.js';
import { RowManager } from './RowManager.js';
import { CellEditManager } from './CellEditManager.js';
import { isToggleCol } from './CellTypeRegistry.js';
import { FilterSelectPanel } from './FilterSelect.js';
import type { FilterSelectConfig } from './FilterSelect.js';
import { Pagination } from './Pagination.js';
import { RowDragDrop } from './RowDragDrop.js';
import { MergeEngine, type MergeCell } from './MergeEngine.js';
import { createRenderer, registerRenderer, type RendererFactory } from './renderers/CellRenderer.js';
import { registerEditor, type EditorFactory } from './editors/CellEditor.js';
import { ContextMenuManager, DEFAULT_CONTEXT_ITEMS } from './ContextMenu.js';
import { WorksheetManager } from './WorksheetManager.js';
import { ExportManager } from './ExportManager.js';
import { FooterManager } from './FooterManager.js';
import { KeyboardManager } from './KeyboardManager.js';
import { FindBarManager } from './FindBarManager.js';
import { GroupTreeManager } from './GroupTreeManager.js';
import { FlatRowModel } from './FlatRowModel.js';
import type { FlatRowRef } from './FlatRowModel.js';
import { SortFilterManager } from './SortFilterManager.js';
import { CellEventHandler } from './CellEventHandler.js';
import { RangeSelectionManager } from './RangeSelectionManager.js';
import { ChartManager } from './ChartManager.js';
import type { ChartInstance } from './ChartManager.js';
import type { ChartConfig } from './chart/types.js';
import { TriggerManager } from './TriggerManager.js';
import { crossGridRegistry } from './CrossGridRegistry.js';
import { OverrideKernel } from './OverrideKernel.js';
import type { OverrideLayer } from './OverrideKernel.js';
import { ExtensionPointRegistry } from './ExtensionPointRegistry.js';
import { RecalcCoordinator } from './formula/RecalcCoordinator.js';
import { cellKey, type FormulaErrorCode } from './formula/types.js';
// DD-05 S2c-1(CF): 렌더 브리지(top-level core, DOM 적용기)는 정적 import(경량). CF 엔진(cf/**)은
// setConditionalFormat 첫 호출 시에만 동적 import → 별 청크(베이스 번들 무증가). 타입은 전부 type-only(런타임 의존0).
// / CF render bridge is a light static import; the cf/** engine is dynamically imported on first use (separate chunk). Types are type-only.
import { applyVisualSpecs } from './CFRenderBridge.js';
import { makeRect } from './coordinate/index.js';
import type { CFRule } from './cf/CFRule.js';
import type { CFEngine } from './cf/CFEngine.js';
import type { ColumnStats } from './cf/eval-types.js';
import type { AppearanceView } from './cf/appearance.js';
// DD-07(RT): 실시간 서브시스템 배선. CF 와 동일 패턴 — 타입은 전부 type-only(런타임 의존0), 어댑터·컨트롤러
// (realtime/**)는 setRealtimeSource 첫 호출 시에만 동적 import → 별 청크(베이스 번들 무증가). 미배선=byte-identical.
// / RT wiring mirrors CF: type-only imports (no runtime dep); the realtime/** adapters & controller are
//   dynamically imported on first setRealtimeSource call (separate chunk). Unwired = byte-identical.
import type {
  IRealtimeSource, RealtimeController, RealtimeControllerDeps,
  RtAnnounceSummary, FrameScheduler, RtCommandSink, LiveStateSource, RtCoords,
} from './realtime/index.js';
import type { ICommandCtx } from './command/ICommand.js';
import type {
  GridOptions, OpenGridInstance, ColumnDef,
  SortItem, FilterItem, ExportOptions,
  EditEvent, Position,
  TriggerContext, TriggerHandler, TriggerEvent,
  OverrideApi, OverrideCallOptions,
  CellRange, RangeStats, MasterDetailOptions,
} from './types.js';

const ROW_ID_FIELD = '_ogRowId';

/**
 * `setRealtimeSource` 옵션(DD-07). 전부 옵션 — 미지정 시 안전 기본값. / Options for `setRealtimeSource`; all optional.
 */
export interface RealtimeWireOptions {
  /** 프레임당 최대 적용 셀 수(백프레셔). / Max cells applied per frame (backpressure). */
  maxBatchPerFrame?: number;
  /** 프레임 스케줄러 주입(헤드리스/테스트 결정론). 기본=rAF/폴백. / Injected frame scheduler; default rAF/fallback. */
  scheduleFrame?: FrameScheduler;
  /** stale 판정 임계(ms). 기본 5000. / Stale threshold(ms); default 5000. */
  staleAfterMs?: number;
  /** SR 규모요약 핸드오프(DD-12 aria-live). 미지정=no-op(경계 준수). / SR summary handoff; default no-op. */
  announce?: (summary: RtAnnounceSummary) => void;
  /** SR 디바운스 윈도우(ms). 기본 500. / SR debounce window(ms); default 500. */
  debounceMs?: number;
}

/**
 * OPEN_GRID 코어 그리드 클래스. / The OPEN_GRID core grid class.
 *
 * 컨테이너 요소에 마운트되어 가상 스크롤로 대량 행을 렌더하는 초경량 데이터 그리드.
 * 정렬·필터·그룹/트리·병합·범위선택(F1)·마스터/디테일(F2)·셀 수식(F3)·통합 차트(F4)·
 * override/strategy 확장 커널을 제공한다.
 * / An ultra-light data grid that mounts into a container element and renders large row sets
 * through virtual scrolling. Provides sorting, filtering, group/tree, merging, range selection
 * (F1), master/detail (F2), cell formulas (F3), integrated charts (F4), and the
 * override/strategy extension kernel.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * const grid = new OpenGrid('#host', {
 *   columns: [
 *     { field: 'name', header: '이름' },
 *     { field: 'qty', header: '수량', type: 'number' },
 *   ],
 *   height: 400,
 * });
 * grid.setData([{ name: 'Kim', qty: 3 }]);
 */
export class OpenGrid<T extends Record<string, any> = any>
  extends EventEmitter
  implements OpenGridInstance<T>
{
  // R8: 아래 4개 필드는 GridComposer.compose() 가 대입한다(컴파일러가 캐스트 너머 대입을 추적
  //     못하므로 definite-assignment `!` 부여 — 나머지 협력자 필드와 동일 패턴).
  private _container!: HTMLElement;
  private _options!: Required<GridOptions<T>>;
  private _data!: DataLayer<T>;
  private _colLayout!: ColumnLayout<T>;
  private _vs: VirtualScroll | null = null;
  private _ro: ResizeObserver | null = null;
  private _renderer: GridRenderer | null = null;
  // R12a(C10): 스타일 해결 단일 초크포인트. 컴포지션 루트에서 생성해 렌더러에 주입.
  private _appearance: AppearanceResolver | null = null;
  /** R12c: per-instance 아이콘 오버라이드 레지스트리(전역 iconRegistry 의 child). 첫 setIcon 때 지연 생성. */
  private _icons: IconRegistry | null = null;
  /** i18n: per-instance 로케일 오버라이드 레지스트리(전역 localeRegistry 의 child). locale/messages 옵션 또는 첫 setLocale/setMessage 때 지연 생성. */
  private _locales: LocaleRegistry | null = null;
  private _sfMgr!: SortFilterManager<T>;
  private _rowMgr!: RowManager<T>;
  private _editMgr!: CellEditManager<T>;
  private _trigMgr = new TriggerManager();
  private _destroyed = false;
  /** R5(§3.1 C4): 렌더 루프 컨트롤러. `_mount` 에서 renderer/vs 배선 초입에 생성. */
  private _render!: RenderController<T>;
  /** R6(§3.1 C5): 데이터 변경 서비스(setData/insert/push/delete/writeCell/writeCells + batch + commit). */
  private _mutation!: MutationService<T>;
  /** R7(§3.1 C9): F3 수식 컨트롤러(accessor 조립·recalc flush·에러 표현 + 공개 수식 API). */
  private _formula!: FormulaController<T>;
  /** R7(§3.1 C8): 크로스그리드 컨트롤러(moveRowsTo/매핑/3단계 드롭 발화). */
  private _cross!: CrossGridController<T>;
  private _colWidths: number[] = [];
  /** 사용자가 헤더 드래그로 직접 조절한 컬럼 폭 (field 기준). _recalcWidths 가 덮어쓰지 않도록 보존 */
  private _userWidths = new Map<string, number>();
  private _filterPanel: FilterPanel | null = null;
  private _filterSelect: FilterSelectPanel | null = null;
  private _pagination: Pagination | null = null;
  private _dnd: RowDragDrop | null = null;
  private _mergeEngine: MergeEngine = new MergeEngine();
  private _liveRegion: HTMLElement | null = null;
  private _ctxMenu: ContextMenuManager | null = null;
  private _cmHandler:    ((e: MouseEvent)    => void) | null = null;
  private _cmKbdHandler: ((e: KeyboardEvent) => void) | null = null;
  private _wsManager: WorksheetManager<T> | null = null;
  // 분리된 매니저들
  private _exportMgr!: ExportManager<T>;
  private _footerMgr!: FooterManager<T>;
  private _kbdMgr!: KeyboardManager<T>;
  private _findMgr!: FindBarManager<T>;
  private _grpMgr!: GroupTreeManager<T>;
  private _cellEvt!: CellEventHandler<T>;
  /** F1: 범위 선택 + 채우기 핸들 배선 관리자(11_design_F1_v2.md). */
  private _rangeMgr!: RangeSelectionManager<T>;
  /** F2: 마스터/디테일 배선(11_design_F2_v2.md). 헤드리스 코어(core/detail/*)를 소비. */
  private _detailMgr!: DetailManager<T>;
  /** F4: 그리드 데이터 통합 차트 오케스트레이터(11_design_F4_v2.md). 헤드리스 chart/* 소비. */
  private _chartMgr!: ChartManager;
  /** Phase 0(C0.3): flat/visual index ↔ data 리졸버. 어떤 기능도 켜지지 않아도 항상 존재. */
  private _flatModel!: FlatRowModel;
  /** F3: 셀 수식 헤드리스 오케스트레이터(core/formula/* 소비, 재구현 아님). 항상 존재(헤드리스라 유휴 비용 0). */
  private _recalc!: RecalcCoordinator;
  /** F3(C2): writeCell 단건 쓰기가 쌓아두는 dirty seed. endBatch/즉시 flush 시 onValuesChanged 1회로 소비. */
  private _formulaDirtySeeds: Set<string> = new Set();

  // ── DD-05 S2c-1(CF): 조건부서식 배선 상태(opt-in, 첫 setConditionalFormat 때 지연 조립) ──
  /** CF 엔진(동적 import 로 조립). 미설정=null → applyCF 콜백 즉시 return(byte-identical). / CF engine (lazily assembled). */
  private _cf: CFEngine | null = null;
  /** 컬럼별 통계 캐시(per-render 재계산 금지 — setConditionalFormat/데이터변경 시에만 갱신). / Per-column stats cache. */
  private _cfStats: Map<string, ColumnStats> = new Map();
  /** 현재 적용된 CF 규칙(데이터 변경 시 통계 재계산에 재사용). / Currently applied CF rules. */
  private _cfRules: CFRule[] = [];
  /** CF 색 시드 읽기 포트(동적 import 후 보관 — cf/ 정적 참조 회피로 별 청크 유지). / CF appearance read port. */
  private _cfAppearance: AppearanceView | null = null;
  /** CF 통계 계산기(cf/ 동적 청크에서 보관 — 동기 재계산용, cf/ 정적 참조 회피). / CF stats computer captured from the dynamic chunk. */
  private _cfComputeStats: ((values: readonly unknown[]) => ColumnStats) | null = null;

  // ── DD-07(RT): 실시간 배선 상태(opt-in, 첫 setRealtimeSource 때 지연 조립) ──
  /** RT 컨트롤러(동적 import 로 조립). 미설정=null → 실시간 미배선(byte-identical). / Realtime controller (lazily assembled). */
  private _rt: RealtimeController<T> | null = null;

  // ── Phase 0(C2.1): 배치 쓰기 상태(_batchDepth/_batchDirty)는 R6 에서 MutationService 로 이관 ──

  // grid.override() 확장 커널 (생성자 말미에 초기화)
  private _ovk!: OverrideKernel;
  /** 공개 override API (호출가능 + .strategy). 생성자 말미에 부착. / Public override API (callable + .strategy). Attached at the end of the constructor. */
  override!: OverrideApi<T>;
  /** R11(§3.1 C7): 커널 위 타입드 확장점 레지스트리. _mount 초입에 생성(커널 준비 후). */
  private _extensions!: ExtensionPointRegistry<T>;
  /** R11: 타입드 확장점 레지스트리 정면(렌더훅 등록·strategy/override 타입드 카탈로그·MutationHook·catalog). / R11: typed extension-point registry facade (render-hook registration, typed strategy/override catalog, MutationHook, catalog). */
  get extensions(): ExtensionPointRegistry<T> { return this._extensions; }

  // ── grid.override() 정적 전역 레지스트리 / static global override registry ──────────────────
  /** 정적 전역 override 레이어 (모든 신규 인스턴스에 생성자 말미 적용). */
  private static _defaultOverrides: Array<[string, OverrideLayer, OverrideCallOptions]> = [];
  /** 정적 전역 strategy 슬롯. */
  private static _defaultStrategies: Array<[string, Function]> = [];

  /**
   * 정적: 모든 신규 그리드에 적용될 override 레이어 등록. / Static: register an override layer
   * applied to every newly created grid.
   *
   * @param name - 대상 공개 메서드 이름 / Target public method name
   * @param fn - override 레이어 함수(첫 인자 orig) / Override layer function (first arg = orig)
   * @param opts - 재진입/에러 정책 / Reentrancy & error policy
   * @returns 체이닝용 OpenGrid 클래스 / The OpenGrid class for chaining
   * @example
   * OpenGrid.defaultOverride('getDisplayValue', (orig, ri, field) => orig(ri, field).toUpperCase());
   */
  static defaultOverride(name: string, fn: OverrideLayer, opts: OverrideCallOptions = {}): typeof OpenGrid {
    OpenGrid._defaultOverrides.push([name, fn, opts]);
    return OpenGrid;
  }

  /** 정적 전역 defaults 네임스페이스 (strategy 슬롯). / Static global defaults namespace (strategy slots). */
  static defaults = {
    strategy(slot: string, fn: Function): typeof OpenGrid {
      OpenGrid._defaultStrategies.push([slot, fn]);
      return OpenGrid;
    },
  };

  // ── R10(OCP): 렌더러/에디터 개방 등록소 (프로세스 전역, defaultOverride 와 동형) ──
  // ── R10(OCP): open renderer/editor registry (process-global, same shape as defaultOverride) ──
  /**
   * 커스텀 셀 렌더러 타입을 코어 편집 없이 등록. `col.type`/`col.renderer`(문자열 또는 `{type}`)가
   * `typeName` 과 일치하면 등록 팩토리가 렌더러를 생성한다. 프로세스 전역(모든 그리드 인스턴스 공유).
   * / Register a custom cell renderer type without editing the core. When `col.type`/`col.renderer`
   * (string or `{type}`) matches `typeName`, the registered factory creates the renderer.
   * Process-global (shared by all grid instances).
   *
   * @param typeName - 렌더러 타입 이름 / Renderer type name
   * @param factory - 렌더러 팩토리 / Renderer factory
   * @returns 체이닝용 OpenGrid 클래스 / The OpenGrid class for chaining
   * @example
   * OpenGrid.registerRenderer('stars', () => ({ render: (ctx) => '★'.repeat(ctx.value) }));
   */
  static registerRenderer(typeName: string, factory: RendererFactory): typeof OpenGrid {
    registerRenderer(typeName, factory);
    return OpenGrid;
  }

  /**
   * 커스텀 셀 에디터 타입을 코어 편집 없이 등록(OCP). 프로세스 전역.
   * / Register a custom cell editor type without editing the core (OCP). Process-global.
   *
   * @param typeName - 에디터 타입 이름 / Editor type name
   * @param factory - 에디터 팩토리 / Editor factory
   * @returns 체이닝용 OpenGrid 클래스 / The OpenGrid class for chaining
   */
  static registerEditor(typeName: string, factory: EditorFactory): typeof OpenGrid {
    registerEditor(typeName, factory);
    return OpenGrid;
  }

  /**
   * R12b(item3 §6.2): 커스텀 스킨을 코어 편집 없이 등록(defaultOverride 와 동형의 전역 정책).
   * FORM-only 검증(색 리터럴 거부 = 색⊥형태 직교성) + HANMS 접근성 가드레일(포커스 <2px/none 클램프)
   * 적용 후, 런타임 `<style>` 로 `.og-container[data-og-skin="name"]` 블록을 주입한다. 이후 어떤
   * 인스턴스도 `grid.setSkin(name)` 으로 사용. 색값이 델타에 있으면 **throw**.
   *
   * 예) Neumorph 는 기본 카탈로그에서 컷(HANMS §1.3)됐으나 여기서 레시피로 재현 가능:
   *   OpenGrid.defineSkin('neumorph', { '--og-radius-md':'14px', '--og-elevation-inset':'inset -4px -4px 8px', … })
   *
   * / R12b (item3 §6.2): register a custom skin without editing the core (global policy, same
   * shape as defaultOverride). After FORM-only validation (color literals rejected = color⊥form
   * orthogonality) plus accessibility guardrails (focus <2px/none clamped), a runtime `<style>`
   * block for `.og-container[data-og-skin="name"]` is injected. Any instance can then call
   * `grid.setSkin(name)`. **Throws** when the delta contains color values.
   *
   * @param name - 스킨 id / Skin id
   * @param delta - FORM 전용 토큰 델타 / FORM-only token delta
   * @returns 체이닝용 OpenGrid 클래스 / The OpenGrid class for chaining
   */
  static defineSkin(name: string, delta: SkinTokenDelta): typeof OpenGrid {
    skinRegistry.define(name, delta);
    return OpenGrid;
  }

  /**
   * R12c(item3 §5.1, 계약 C13): 시맨틱 아이콘 role 세트를 코어 편집 없이 **전역** 등록/교체
   * (defineSkin/registerRenderer 와 동형의 프로세스 전역 정책). 값은 알려진 아이콘 key(`BOOTSTRAP_ICONS`)
   * 이거나 원시 SVG 본문 마크업. 이후 모든 인스턴스의 아이콘 해석에 반영된다. per-instance 교체는
   * `grid.setIcon(role, svg)` 참조.
   *   예) OpenGrid.defineIconSet({ 'sort.asc': 'arrow-up', 'row.delete': '<path d="…"/>' })
   *
   * / R12c (item3 §5.1, contract C13): register/replace semantic icon role sets **globally**
   * without editing the core (process-global policy, same shape as defineSkin/registerRenderer).
   * Values are either known icon keys (`BOOTSTRAP_ICONS`) or raw SVG body markup. Affects icon
   * resolution of all instances. For per-instance replacement see `grid.setIcon(role, svg)`.
   *
   * @param map - role → 아이콘 key 또는 원시 SVG / role → icon key or raw SVG
   * @returns 체이닝용 OpenGrid 클래스 / The OpenGrid class for chaining
   */
  static defineIconSet(map: Record<string, string>): typeof OpenGrid {
    for (const [role, svgOrKey] of Object.entries(map)) iconRegistry.register(role, svgOrKey);
    return OpenGrid;
  }

  /**
   * i18n: UI 문자열 로케일을 코어 편집 없이 **전역** 등록/교체(defineSkin/defineIconSet 와 동형의
   * 얇은 위임 파사드 — 정본은 `localeRegistry.register`). 부분 카탈로그 허용(폴백이 ko 로 메움).
   * 이후 모든 인스턴스가 `grid.setLocale(id)` 로 사용. per-instance 오버라이드는 `grid.setMessage` 참조.
   *   예) OpenGrid.defineLocale('ja', { contextMenu: { find: '検索' } })
   *
   * / i18n: register/replace a UI-string locale **globally** without editing the core (thin
   * delegation façade isomorphic to defineSkin/defineIconSet — the canonical entry is
   * `localeRegistry.register`). Partial catalogs are allowed (ko fills the gaps via fallback).
   * Any instance can then call `grid.setLocale(id)`. For per-instance overrides see `grid.setMessage`.
   *
   * @param id - 로케일 id(예 'ja') / Locale id (e.g. 'ja')
   * @param messages - 메시지 부분/전체 카탈로그 / Partial or full message catalog
   * @param opts - `extends`: ko 이전에 시도할 폴백 로케일 / `extends`: fallback locale tried before ko
   * @returns 체이닝용 OpenGrid 클래스 / The OpenGrid class for chaining
   */
  static defineLocale(id: string, messages: PartialLocaleMessages, opts?: { extends?: string }): typeof OpenGrid {
    localeRegistry.register(id, messages, opts);
    return OpenGrid;
  }

  /**
   * 그리드를 생성해 컨테이너에 마운트한다. / Create the grid and mount it into the container.
   *
   * @param container - CSS 셀렉터 또는 호스트 요소 / CSS selector or host element
   * @param options - 그리드 옵션(columns 필수) / Grid options (columns required)
   * @example
   * const grid = new OpenGrid('#host', { columns: [{ field: 'id', header: 'ID' }] });
   */
  constructor(container: string | HTMLElement, options: GridOptions<T>) {
    super();
    // R8(§3.1 C2, §3.3): 객체그래프 조립(구 생성자 ~235줄 + _ovk 선생성 + mount)을 GridComposer 로
    // 외재화한다. compose() 는 core → formula → 매니저 → override 커널 → mount 를 Phased Builder 로
    // 조립하며, mount 단계가 override-커널 단계의 산출 토큰을 매개변수로 요구하므로 _ovk-before-_mount
    // 불변식이 함수 시그니처의 위상정렬로 구조적으로 강제된다(R2 상처주석의 완성). 협력자는 전부 이
    // 인스턴스(this) 필드에 대입되며, _mount 본체(DOM/observer 배선)는 여전히 OpenGrid 가 소유한다.
    // 서브그리드 재귀(F2 DetailManager)는 컴포저가 OpenGrid 를 역-import 하지 않도록 hooks 로 주입한다.
    GridComposer.compose(
      this as unknown as ComposerHost<T>,
      container,
      options,
      {
        createSubgrid: (host, subgridOptions, depth) =>
          new OpenGrid(host, { ...subgridOptions, _detailDepth: depth } as any),
      },
    );
    this._bindOptionEvents();

    if (this._options.defaultSort?.length) {
      this._sfMgr.initSort(this._options.defaultSort);
    }

    this.override = Object.assign(
      (name: string, fn: OverrideLayer, opts?: OverrideCallOptions) => this._ovk.override(name, fn, opts) as any,
      { strategy: (slot: string, fn: Function) => this._ovk.strategy(slot, fn) as any },
    ) as OverrideApi<T>;

    // destroy 순수 래핑(94 §2.2 채택안2): 원본 본문 0줄 수정, 최외곽에서 restoreAll 보장.
    const _origDestroy = this.destroy.bind(this);
    this.destroy = () => { try { _origDestroy(); } finally { this._ovk.restoreAll(); } };

    // 정적 전역 defaults 1회 적용(첫 렌더 후, 깜빡임 방지).
    for (const [slot, fn] of OpenGrid._defaultStrategies) this._ovk.strategy(slot, fn);
    for (const [name, fn, opts] of OpenGrid._defaultOverrides) this._ovk.override(name, fn, opts);

    requestAnimationFrame(() => {
      this.emit('ready', this);
      this._options.onReady?.(this);
    });
  }

  // ── grid.override() 위임 메서드 / grid.override() delegation methods ──────────────────────────
  /** 단일 메서드의 override 를 원본으로 복구. / Restore a single overridden method to the original. */
  restore(name: string): this { this._ovk.restore(name); return this; }
  /** 모든 override·strategy 를 복구(destroy 시 자동 수행). / Restore all overrides & strategies (run automatically on destroy). */
  restoreAll(): this { this._ovk.restoreAll(); return this; }
  /** 해당 메서드가 override 되어 있는지 확인. / Whether the method is currently overridden. */
  hasOverride(name: string): boolean { return this._ovk.hasOverride(name); }
  /** override 등록된 메서드 이름 목록. / Names of currently overridden methods. */
  getOverrideNames(): string[] { return this._ovk.getOverrideNames(); }
  /** strategy 슬롯 조회(미등록 시 fallback 반환). / Read a strategy slot (returns fallback when unset). */
  getStrategy<F extends Function>(slot: string, fallback: F): F { return this._ovk.getStrategy(slot, fallback); }
  private _mount(): void {
    // R11(§3.1 C7, §4): 커널 위 타입드 확장점 레지스트리 생성(커널은 이미 준비됨 — _ovk-before-_mount).
    // TriggerManager 는 늦은-null 견디도록 getter 로 주입(단일 커밋 초크포인트의 before/after 훅 표면).
    this._extensions = new ExtensionPointRegistry<T>({
      kernel: this._ovk,
      getTrigMgr: () => this._trigMgr,
    });
    // 첫 렌더훅 = 기존 getDisplayValue 표시텍스트 동작(동일 출력 → 회귀0). 게이트 = override|strategy(제로코스트 보존).
    this._extensions.registerRenderHook({
      id: 'displayText',
      gate: () => this.hasOverride('getDisplayValue') || this._ovk.hasStrategy('displayFormatter'),
      resolve: (ri, field) => this.getDisplayValue(ri, field),
    });
    // R11(§4.2): 표시텍스트 너머의 NEW 렌더훅 — 셀 클래스/aria. strategy 슬롯 미설정 시 제로코스트.
    this._extensions.registerRenderHook({
      id: 'cellClass',
      gate: () => this._ovk.hasStrategy('cellClassResolver'),
      resolve: (ri, field) => {
        const fn = this._ovk.getStrategy('cellClassResolver', null as any);
        return fn ? fn(this.readCell(ri, field), field, this._data.getRowByIndex(ri)) : null;
      },
    });
    this._extensions.registerRenderHook({
      id: 'ariaLabel',
      gate: () => this._ovk.hasStrategy('ariaLabelResolver'),
      resolve: (ri, field) => {
        const fn = this._ovk.getStrategy('ariaLabelResolver', null as any);
        return fn ? fn(this.readCell(ri, field), field, this._data.getRowByIndex(ri)) : null;
      },
    });
    this._container.classList.add('og-container');
    const h = this._options.height;
    const w = this._options.width;
    this._container.style.height = typeof h === 'number' ? `${h}px` : String(h);
    this._container.style.width  = typeof w === 'number' ? `${w}px` : String(w);
    this._container.style.display = 'flex';
    this._container.style.flexDirection = 'column';
    this._container.style.overflow = 'hidden';
    this._container.style.boxSizing = 'border-box';
    // R12a(C10): 컨테이너 크롬 보더. 이 사이트만 폴백에 공백(`, #e0e0e0`)이 있는 레거시 표기라
    //   byte-identical 보존을 위해 resolver.border()(무공백)로 통일하지 않고 원문 그대로 둔다
    //   (R12b 스킨 토큰화 시 흡수). resolver 는 아래에서 렌더러에 주입된다.
    this._container.style.border = '1px solid var(--og-border-color, #e0e0e0)';
    this._container.style.fontFamily = 'var(--og-font-family, -apple-system, sans-serif)';
    this._container.style.fontSize = 'var(--og-font-size, 13px)';
    this._container.setAttribute('data-og-theme', this._options.theme);
    // R12b: FORM(스킨) 축. default 는 CSS 블록이 없어 토큰 미정의 → 폴백 = byte-identical.
    this._container.setAttribute('data-og-skin', this._options.skin ?? 'default');

    for (const [k, v] of Object.entries(this._options.cssVars))
      this._container.style.setProperty(k, v);

    this._appearance = new AppearanceResolver(new ThemeContext(this._options.theme, this._options.skin ?? 'default'));
    this._renderer = new GridRenderer(this._container, this._options, {
      onHeaderClick:     (field, shiftKey) => this._handleSortClick(field, shiftKey),
      onCellClick:       (ri, ci, e) => this._handleCellClick(ri, ci, e),
      onCellDblClick:    (ri, ci, e) => this._handleCellDblClick(ri, ci, e),
      onCellMouseOver:   (ri, ci, e) => this._handleCellMouseOver(ri, ci, e),
      onCellMouseOut:    (ri, ci, e) => this._handleCellMouseOut(ri, ci, e),
      onCellMouseDown:   (ri, ci, e) => this._handleCellMouseDown(ri, ci, e),
      onCellMouseUp:     (ri, ci, e) => this._handleCellMouseUp(ri, ci, e),
      onCellMouseMove:   (ri, ci, e) => this._handleCellMouseMove(ri, ci, e),
      onRowCheck:        (ri, checked) => this._handleRowCheck(ri, checked),
      onAllCheck:        (checked) => this._handleAllCheck(checked),
      onColResize:       (ci, w) => this._handleColResize(ci, w),
      onFilterIconClick: (field, anchorEl) => this._handleFilterIconClick(field, anchorEl),
      getDndManager:     () => this._dnd,
      onColDragStart:    (ci) => { this._editMgr.dragColIdx = ci; },
      onColDrop:         (toIdx) => {
        if (this._editMgr.dragColIdx !== null && this._editMgr.dragColIdx !== toIdx) {
          this._reorderColumn(this._editMgr.dragColIdx, toIdx);
        }
        this._editMgr.dragColIdx = null;
      },
      getColDragIdx:     () => this._editMgr.dragColIdx,
      // R11(§4.2): 하드코딩 게이트를 렌더훅 레지스트리로 일반화 — 게이트·해석이 등록 데이터(displayText
      // 훅)로 이동. 렌더층은 이름을 하드코딩하지 않고 채널로 순회 참조한다(동작 동일 → 회귀0).
      resolveRenderHook: (channel, ri, field) => this._extensions.resolveRenderHook(channel, ri, field),
      // R1b: 렌더러측 Number/Date 가 ctx.value 위에 적용할 per-instance displayFormatter 전략.
      //      전역 없이 이 그리드의 _ovk 슬롯만 읽는다(멀티그리드 격리). 미설정 시 null → 기본 포맷.
      getDisplayFormatter: () => this._ovk.getStrategy('displayFormatter', null as any) ?? null,
      // F3(§7.4/C7/C8.3): 마커·에러 툴팁·aria-label 을 위한 셀별 수식 메타(없으면 null).
      getFormulaMeta: (ri, field) => this._formula.getFormulaMeta(ri, field),
      // i18n: 렌더 컨텍스트 로케일 해석기 — 인스턴스 로케일이 전역보다 우선(그룹배지/셀 aria/빈상태/수식 라벨).
      t: (key, params) => this.t(key, params),
      // DD-05 S2c-1(CF): 조건부서식 셀 적용 훅. CF 미설정(_cf=null)이거나 컬럼 통계 미캐시면 즉시 return
      //   → 셀 DOM 변화0(제로코스트·byte-identical). 설정 시 순수 파이프(paintFor)로 VisualSpec[] 산출 후
      //   렌더 브리지가 DOM 물질화. now 는 Date.now() 허용(OpenGrid 는 헤드리스 아님).
      applyCF: (cellEl, ri, field, value, w, h) => {
        if (!this._cf || !this._cfAppearance) return;
        const stats = this._cfStats.get(field);
        if (!stats) return;
        const specs = this._cf.paintFor(
          { value, rowIndex: ri, columnId: field, rowState: 'none' },
          stats,
          this._cfAppearance,
          makeRect(0, 0, w, h),
          { now: Date.now() },
        );
        applyVisualSpecs(cellEl, specs, w, h);
      },
    }, this._appearance);
    // R5(§3.1 C4): 렌더 루프 컨트롤러 배선. 협력자(renderer/vs/pagination)는 여전히
    // 이 _mount 가 소유·생성하며, 값·협력자는 전부 getter 클로저로 주입(늦은-null / colLayout
    // 재할당 견딤). vs 는 아래에서 생성되지만 getVs 는 지연 평가라 순서 무관 — 다만 어떤
    // doRender/onResize 호출보다 먼저 존재해야 하므로 renderer 직후에 생성한다.
    this._render = new RenderController<T>({
      getContainer: () => this._container,
      getOptions: () => this._options,
      getRenderer: () => this._renderer,
      getVs: () => this._vs,
      getPagination: () => this._pagination,
      getData: () => this._data,
      getColLayout: () => this._colLayout,
      getFlatModel: () => this._flatModel,
      getMergeEngine: () => this._mergeEngine,
      getColWidths: () => this._colWidths,
      setColWidths: (widths) => { this._colWidths = widths; },
      getUserWidths: () => this._userWidths,
      getSfMgr: () => this._sfMgr,
      getRowMgr: () => this._rowMgr,
      getEditMgr: () => this._editMgr,
      getGrpMgr: () => this._grpMgr,
      getDetailMgr: () => this._detailMgr,
      getRangeMgr: () => this._rangeMgr,
      buildDetailRenderContext: () => this._buildDetailRenderContext(),
      renderFooterEl: () => this._renderFooterEl(),
    });
    // R6(§3.1 C5): 데이터 변경 서비스 배선. DataLayer(유일 writer)·협력자는 모두 getter 클로저로
    // 지연 주입되며, 서비스는 렌더 내부를 모른 채 doRenderWindow/doRenderFull 콜백으로만 렌더를 유발한다.
    this._mutation = new MutationService<T>({
      getData: () => this._data,
      getVs: () => this._vs,
      getPagination: () => this._pagination,
      getFlatModel: () => this._flatModel,
      getColLayout: () => this._colLayout,
      getContainer: () => this._container,
      getTrigMgr: () => this._trigMgr,
      getRowMgr: () => this._rowMgr,
      getGrpMgr: () => this._grpMgr,
      getOptions: () => this._options,
      emit: (event, payload) => { this.emit(event, payload); },
      announce: (msg) => this._announce(msg),
      t: (key, params) => this.t(key, params),
      applyFilters: () => this._applyFilters(),
      flushFormula: () => this._formula.flushRecalc(),
      doRenderWindow: () => this._doRender(...this._visRange()),
      doRenderFull: () => this._doRender(0, -1),
      resetFormulaState: () => {
        // F3(§9 E11): setData 는 rowId 를 재발급하므로 stable-id 앵커에 묶인 기존 수식은 전량
        // 무효(MVP, rowId 재바인딩은 P2) — 오케스트레이터를 새로 만들어 사이드카/그래프를 비운다.
        this._formulaDirtySeeds.clear();
        this._recalc = new RecalcCoordinator({
          accessor: this._formula.buildAccessor(),
          setComputedValue: (rowId, field, value) => this._data.setComputedValueByRowId(rowId, field, value),
          onFormulaError: (rowId, field, error) => this._formula.handleFormulaError(rowId, field, error),
          refMode: this._options.formula?.refMode ?? 'stable',
          divisionPrecision: this._options.formula?.divisionPrecision ?? 30,
        });
      },
      seedFormulaDirty: (rowIndex, field) => {
        // F3(C2/§8.5): 값이 바뀐 셀을 dirty seed 로 적립(kind==='data' 일 때만).
        const ref = this._flatModel.resolveFlatRow(rowIndex);
        if (ref.kind === 'data' && ref.rowId) this._formulaDirtySeeds.add(cellKey(ref.rowId, field));
      },
      invalidateRemovedRows: (rowIds) => {
        for (const rowId of rowIds) this._formula.afterRecalc(this._recalc.invalidateRow(rowId), { skipRender: true });
      },
      getRowIdAt: (rowIndex) => this._data.getRowByIndex(rowIndex)?.[ROW_ID_FIELD] as string | undefined,
    });
    // F1(§4.3, C6): bodyWrap 자식으로 범위선택 오버레이 1회 부착(renderBody 파괴 회피).
    this._rangeMgr.mount(this._renderer.bodyWrapper);

    this._filterPanel = new FilterPanel(
      this._container,
      (field, items) => this.setFilter(field, items),
      (field) => this.resetFilter(field),
      (key, params) => this.t(key, params)
    );
    // 웹 접근성 속성 설정 (role, aria 레이블, 행/열 수 알림)
    // ?묎렐?? role, aria-label, aria-rowcount, aria-colcount
    this._container.setAttribute('role', 'grid');
    this._container.setAttribute('aria-label', this._options.ariaLabel ?? this._options.cssVars?.['aria-label'] ?? this.t('grid.containerAria'));
    this._container.setAttribute('aria-rowcount', '0');
    this._container.setAttribute('aria-colcount', String(this._options.columns.filter(c => !c.hidden).length));
    // aria-live 영역(C8.1 공용 announce 인프라): 스크린리더에게 상태 변화를 알린다.
    // ⚠️ 호스트 CSS 격리 하드 제약(baseline §Q5): 시각 숨김은 클래스에 기대지 않고
    // 인라인 스타일로 강제한다(호스트 페이지 전역 CSS가 .og-live-region 을 깨뜨려도 안전).
    // 클래스는 하위호환/테마 목적으로 유지하되 실제 은닉은 인라인 스타일이 담당한다.
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('aria-live', 'polite');
    this._liveRegion.setAttribute('aria-atomic', 'true');
    this._liveRegion.className = 'og-live-region';
    Object.assign(this._liveRegion.style, {
      position: 'absolute', width: '1px', height: '1px', margin: '-1px',
      padding: '0', overflow: 'hidden', clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap', border: '0',
    });
    // 그리드 루트(container) 내부에 부착 — F1~F4 announce() 가 공유하는 단일 리전(C8.1).
    this._container.appendChild(this._liveRegion);
    // 키보드로 그리드를 조작할 수 있도록 tabIndex 설정
    this._container.tabIndex = 0;
    this._container.addEventListener('keydown',  (e) => this._handleKeyDown(e));
    this._container.addEventListener('keyup',    (e) => this._handleCellKeyEvt('cellKeyUp', e));
    this._container.addEventListener('keypress', (e) => this._handleCellKeyEvt('cellKeyPress', e));

    this._vs = new VirtualScroll(this._renderer.bodyWrapper, {
      rowHeight: this._options.rowHeight,
      onRender: (s, e) => this._doRender(s, e),
    });

    // 그리드↔그리드 드래그용 레지스트리 등록 (bodyWrapper 기준)
    crossGridRegistry.register(this._renderer.bodyWrapper, this);

    // R7(§3.1 C8): 크로스그리드 컨트롤러 배선. crossGridRegistry 싱글턴은 AS-IS 유지(R8 에서 승격).
    // target 측 연산은 getPeerController 로 얻은 상대 컨트롤러로 위임한다(원본의 targetGrid._x 재현).
    this._cross = new CrossGridController<T>({
      getSelf: () => this,
      getData: () => this._data,
      getColLayout: () => this._colLayout,
      getOptions: () => this._options,
      emit: (event, payload) => { this.emit(event, payload); },
      insertRow: (item, position) => this.insertRow(item, position),
      deleteRow: (rowIndex) => this.deleteRow(rowIndex),
      getChecked: () => this._rowMgr.getChecked(),
      uncheckAll: () => this._rowMgr.uncheckAll(),
      dragRowSet: (fromIndex) => this._dragRowSet(fromIndex),
      getPeerController: (grid) => (grid as OpenGrid<T>)._cross,
    });

    if (this._options.draggable) {
      this._dnd = new RowDragDrop(
        this._renderer.bodyWrapper,
        this._options.rowHeight,
        (from, to) => this._handleRowDrop(from, to),
        this._options.crossGrid ? {
          resolveTarget: (x, y) => {
            const g = crossGridRegistry.resolveAt(x, y, this);
            if (!g || !g._options.crossGrid) return null;
            return { bodyEl: g._crossBodyEl(), rowHeight: g._options.rowHeight, totalRows: g._data.rowCount };
          },
          onCrossDrop: (fromIndex, targetBodyEl, targetIndex) =>
            this._cross.handleCrossGridDrop(fromIndex, targetBodyEl, targetIndex),
        } : undefined,
        (fromIndex) => this._dragRowSet(fromIndex).length,
      );
    }
    // 스크롤 영역, 페이징 바 등 하단 UI 초기화
    // ?섏씠吏?UI (?듭뀡?먯꽌 pagination:true???뚮쭔)
    if (this._options.pagination) {
      this._pagination = new Pagination(
        this._container,
        this._options.pageSize,
        (e) => {
          this.emit('pageChange', e);
          this._doRender(...this._visRange());
        },
        (key, params) => this.t(key, params),
      );
    }
    // 찾기 바 초기화 (헤더 위에 삽입)
    this._findMgr.init(this._container);
    // 오른쪽 클릭 메뉴 초기화
    this._initContextMenu();
    // 워크시트(탭) 초기화
    if (this._options.worksheets?.length) {
      this._initWorksheets();
    }

    // DD-11 S2b: 외관 신규축(밀도·질감) additive 적용 — 옵션 지정 시에만(미지정=byte-identical).
    // / DD-11 S2b: apply the new appearance axes (density·texture) — only when opted in (else byte-identical).
    if (this._options.density != null) this.setDensity(this._options.density);
    if (this._options.texture != null) this.setTexture(this._options.texture);

    // DD-05 S2c-1(CF): 조건부서식 규칙이 옵션에 있으면 배선(동적 import → 첫 렌더 후 채색). additive·기본 undefined=byte-identical.
    // / DD-05 S2c-1 (CF): if conditional-format rules are supplied, wire them (dynamic import → paint after first render). additive.
    if (this._options.conditionalFormat?.length) {
      void this.setConditionalFormat(this._options.conditionalFormat);
    }

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this._container);
    this._onResize();
  }

  private _initContextMenu(): void {
    const opt = this._options.contextMenu;
    if (opt === false) return;

    // 기존 핸들러 제거 — setOptions 재호출 시 중복 등록 방지
    if (this._cmHandler)    this._container.removeEventListener('contextmenu', this._cmHandler);
    if (this._cmKbdHandler) this._container.removeEventListener('keydown',     this._cmKbdHandler);
    this._cmHandler = this._cmKbdHandler = null;

    this._ctxMenu = new ContextMenuManager(this._container, {
      onSortAsc:  () => {
        const active = this._colLayout.visibleLeaves[0];
        if (active) this.orderBy(active.field, 'asc');
      },
      onSortDesc: () => {
        const active = this._colLayout.visibleLeaves[0];
        if (active) this.orderBy(active.field, 'desc');
      },
      onFind:    () => this._findMgr.open(),
      onExcel:   () => this.exportExcel(),
      onCsv:     () => this.exportCsv(),
      onPrint:   () => this.print(),
    }, (key, params) => this.t(key, params));

    this._cmHandler = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.og-cell');
      if (!cell) return;
      e.preventDefault();

      const colIdx = Number(cell.dataset.colIndex ?? -1);
      const col = this._colLayout.visibleLeaves[colIdx];

      if (col && this._ctxMenu) {
        this._ctxMenu['_actions'].onSortAsc  = () => this.orderBy(col.field, 'asc');
        this._ctxMenu['_actions'].onSortDesc = () => this.orderBy(col.field, 'desc');
      }

      // 사용자 정의 메뉴는 단독 표시 (기본 메뉴와 합치지 않음)
      const customItems = Array.isArray(opt) ? opt : undefined;
      this._ctxMenu?.open(e, customItems);
    };
    this._container.addEventListener('contextmenu', this._cmHandler);

    this._cmKbdHandler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        const rect = this._container.getBoundingClientRect();
        const fakeEvent = { clientX: rect.left + 80, clientY: rect.top + 40 } as MouseEvent;
        this._ctxMenu?.open(fakeEvent);
      }
    };
    this._container.addEventListener('keydown', this._cmKbdHandler);
  }
  // openContextMenu / closeContextMenu 공개 API / public context-menu API
  /**
   * 컨텍스트 메뉴를 지정 좌표에 연다. / Open the context menu at the event position.
   *
   * @param e - 좌표를 제공할 마우스 이벤트 / Mouse event providing coordinates
   * @param items - 커스텀 메뉴 항목(생략 시 기본 메뉴) / Custom items (default menu when omitted)
   */
  openContextMenu(e: MouseEvent, items?: import('./types').ContextMenuItem[]): void {
    this._ctxMenu?.open(e, items);
  }
  /** 컨텍스트 메뉴를 닫는다. / Close the context menu. */
  closeContextMenu(): void {
    this._ctxMenu?.close();
  }
  /**
   * 캐스케이딩 필터 셀렉트 패널 설정(null = 제거). / Configure the cascading filter-select panel
   * (null removes it).
   */
  setFilterSelect(config: FilterSelectConfig | null): void {
    this._filterSelect?.destroy();
    this._filterSelect = null;
    if (!config) return;
    if (!this._container.id) {
      this._container.id = `og-${Math.random().toString(36).slice(2, 7)}`;
    }
    this._filterSelect = new FilterSelectPanel(
      this._container, config,
      (field, items) => this.setFilter(field, items),
      (field?)       => this.resetFilter(field),
      this._container.id,
      (key, params) => this.t(key, params)
    );
  }
  /**
   * 옵션을 런타임에 부분 갱신한다 (contextMenu 재초기화, groupBy 재구성 등).
   * / Partially update options at runtime (re-inits contextMenu, rebuilds groupBy, etc.).
   *
   * @param opts - 갱신할 옵션 부분집합 / Subset of options to update
   */
  setOptions(opts: Partial<GridOptions<T>>): void {
    Object.assign(this._options, opts);
    if ('contextMenu' in opts) {
      this._ctxMenu?.destroy();
      this._ctxMenu = null;
      this._initContextMenu();
    }
    // groupBy / summary 변경 시 그룹 재구성
    if ('groupBy' in opts || 'summary' in opts) {
      const fields = (opts.groupBy ?? []) as string[];
      if (fields.length > 0) {
        this._grpMgr.groupBy(fields);
      } else {
        this.clearGroup();
      }
      return;
    }
    this._renderHeader();
    this._doRender(...this._visRange());
  }

  /**
   * 컬럼 마스킹 ON/OFF 전환. / Toggle column masking on/off.
   * enabled=true  → 마스킹 적용 (기본 상태) / apply masking (default state)
   * enabled=false → 컬럼 전체 마스킹 해제 (원문 표시) / reveal the whole column (show raw values)
   *
   * @param field - 대상 컬럼 field / Target column field
   * @param enabled - 마스킹 활성 여부 / Whether masking is active
   */
  setMaskEnabled(field: string, enabled: boolean): void {
    const col = this._colLayout.getColumnByField(field) as any;
    if (!col) return;
    if (enabled) {
      // 마스킹 재활성화: 해제 상태 초기화
      col._maskRevealed = false;
      (col._maskRevealedRows as Set<number> | undefined)?.clear();
    } else {
      // 전체 해제
      col._maskRevealed = true;
    }
    this._doRender(...this._visRange());
  }

  /** 현재 컬럼 마스킹 활성 여부 반환. true=마스킹 중, false=해제됨 / Return whether masking is active for the column (true = masked, false = revealed). */
  getMaskEnabled(field: string): boolean {
    const col = this._colLayout.getColumnByField(field) as any;
    if (!col) return false;
    return col._maskRevealed !== true;
  }
  private _initWorksheets(): void {
    const sheets = this._options.worksheets!;
    this._wsManager = new WorksheetManager<T>(
      this._container,
      (_name, state) => this._loadWorksheetState(state),
      (key, params) => this.t(key, params),
    );
    for (const sheet of sheets) {
      this._wsManager.add(sheet.name, sheet.columns ?? this._options.columns, sheet.data ?? []);
    }
  }

  // 탭(워크시트) 전환 시 데이터·컬럼을 화면에 반영한다.
  // 핵심(Why): _data.setData 만으로는 가상 스크롤(_vs)의 총 행수가 갱신되지 않아
  //   _visRange 가 빈 범위를 돌려줘 행이 렌더되지 않는다(데이터 미표시 버그).
  //   공개 setData 와 동일하게 _vs.setTotalRows + aria + 컬럼폭 재계산까지 수행한다.
  private _loadWorksheetState(state: import('./types').WorksheetState<T>): void {
    this._rowMgr.reset();
    this._data.setData(state.data);
    this._colLayout = new ColumnLayout<T>(
      state.columns.length ? state.columns : this._options.columns,
      this._options.frozenColumns,
    );
    this._vs?.setTotalRows(this._data.rowCount);
    this._pagination?.setTotalRows(this._data.rowCount);
    this._container.setAttribute('aria-rowcount', String(this._data.rowCount));
    this._container.setAttribute('aria-colcount', String(this._colLayout.visibleLeaves.length));
    // 시트마다 컬럼 구성이 다를 수 있으므로 폭을 재계산한 뒤 헤더·본문을 다시 그린다
    const { width } = this._container.getBoundingClientRect();
    if (width) this._recalcWidths(width);
    this._renderHeader();
    this._doRender(...this._visRange());
  }

  /**
   * 워크시트(탭)를 추가한다. / Add a worksheet (tab).
   *
   * @param name - 시트 이름 / Sheet name
   * @param columns - 시트 전용 컬럼(생략 시 그리드 columns) / Sheet columns (grid columns when omitted)
   * @param data - 시트 데이터 / Sheet data
   */
  addWorksheet(name: string, columns?: import('./types').ColumnDef<T>[], data?: T[]): void {
    if (!this._wsManager) {
      this._wsManager = new WorksheetManager<T>(
        this._container,
        (_n, state) => this._loadWorksheetState(state),
        (key, params) => this.t(key, params),
      );
    }
    this._wsManager.add(name, columns ?? this._options.columns, data ?? []);
  }

  /** 워크시트를 제거한다. / Remove a worksheet. */
  removeWorksheet(name: string): void {
    this._wsManager?.remove(name);
  }

  /** 지정 워크시트로 전환한다. / Switch to the given worksheet. */
  switchWorksheet(name: string): void {
    this._wsManager?.switch(name);
  }

  /** 워크시트 이름을 변경한다. / Rename a worksheet. */
  renameWorksheet(oldName: string, newName: string): void {
    this._wsManager?.rename(oldName, newName);
  }

  /** 워크시트 상태 스냅샷 조회(없으면 undefined). / Get a worksheet state snapshot (undefined when absent). */
  getWorksheet(name: string): import('./types').WorksheetState<T> | undefined {
    return this._wsManager?.get(name);
  }

  /** 워크시트 이름 목록. / List of worksheet names. */
  getWorksheetNames(): string[] {
    return this._wsManager?.getNames() ?? [];
  }

  /** 모든 워크시트를 다중 시트 엑셀로 내보낸다. / Export all worksheets as a multi-sheet Excel file. */
  exportSheetsExcel(filename?: string): void { this._exportMgr.exportSheetsExcel(filename); }

  // R5(§3.1 C4): 렌더 루프는 RenderController 로 이관. 아래는 동일 시그니처의 얇은 위임 —
  // 다수 내부 호출부(및 테스트의 `(grid as any)._doRender` 몽키패치)를 그대로 유지하기 위함.
  private _onResize(): void { this._render.onResize(); }
  private _recalcWidths(totalWidth: number): void { this._render.recalcWidths(totalWidth); }
  // 헤더(컬럼 제목 행)를 다시 그린다
  private _renderHeader(): void { this._render.renderHeader(); }
  private _syncHeaderLayout(): void { this._render.syncHeaderLayout(); }
  private _doRender(startIndex: number, endIndex: number): void { this._render.doRender(startIndex, endIndex); }

  /** F2(§4.5/§6.1): masterDetail.enabled 아니면 undefined(GridRenderer 는 기존 경로 그대로). */
  private _buildDetailRenderContext(): DetailRenderContext | undefined {
    if (!this._detailMgr.enabled) return undefined;
    const opts: MasterDetailOptions<T> = this._options.masterDetail ?? {};
    return {
      toggleMode: opts.toggle ?? 'expander-col',
      ariaLabel: opts.ariaLabel ?? this.t('grid.detailRegion'),
      getRowId: (row: any) => row?.[ROW_ID_FIELD],
      isExpanded: (rowId: string) => this._detailMgr.isExpandedId(rowId),
      onToggle: (_rowIndex: number, rowId: string) => this._detailMgr.toggleRow({ id: rowId }),
      getGlyph: (expanded: boolean) => getDetailGlyph(expanded, (key, params) => this.t(key, params)),
      getPanelHost: (rowId: string) => this._detailMgr.getPanelHost(rowId),
      onBeforeTeardown: () => this._detailMgr.onBeforeTeardown(),
    };
  }

  private _handleGroupToggle(groupKey: string): void { this._grpMgr.handleGroupToggle(groupKey); }

  // 현재 화면에 보이는 행 범위를 반환한다 (R5: RenderController 위임)
  private _visRange(): [number, number] { return this._render.visRange(); }

  private _handleSortClick(field: string, shiftKey: boolean): void { this._sfMgr.handleSortClick(field, shiftKey); }

  private _isToggleCol(col: ColumnDef<T>): boolean { return isToggleCol(col); }
  private _handleCellClick(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellClick(ri, ci, e); }
  private _handleCellDblClick(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellDblClick(ri, ci, e); }
  private _handleCellMouseOver(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseOver(ri, ci, e); }
  private _handleCellMouseOut(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseOut(ri, ci, e); }
  private _handleCellMouseDown(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseDown(ri, ci, e); }
  private _handleCellMouseUp(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseUp(ri, ci, e); }
  private _handleCellMouseMove(ri: number, ci: number, e: MouseEvent): void { this._cellEvt.handleCellMouseMove(ri, ci, e); }
  private _handleCellKeyEvt(name: 'cellKeyDown' | 'cellKeyUp' | 'cellKeyPress', e: KeyboardEvent): void { this._cellEvt.handleCellKeyEvt(name, e); }

  private _handleRowCheck(rowIndex: number, checked: boolean): void {
    this._rowMgr.check(rowIndex, checked);
    this._doRender(...this._visRange());
    this.emit('rowCheck', { rowIndex, checked, row: this._data.getRowByIndex(rowIndex) });
  }

  private _handleFilterIconClick(field: string, anchorEl: HTMLElement): void {
    if (this._filterPanel?.isOpen) {
      this._filterPanel.close();
      return;
    }
    const current = this._sfMgr.filters[field] ?? [];
    this._filterPanel?.open(field, anchorEl, current);
  }

  private _handleAllCheck(checked: boolean): void {
    this._rowMgr.checkAll(checked, this._data.rowCount);
    this._doRender(...this._visRange());
    this.emit('allCheck', { checked });
  }
  private _handleRowDrop(fromIndex: number, toIndex: number): void {
    this._data.moveRow(fromIndex, toIndex);
    this._doRender(...this._visRange());
    this.emit('rowDrop', { fromIndex, toIndex });
    this._options.onRowDrop?.({ fromIndex, toIndex });
  }

  // ── 크로스그리드 내부 헬퍼 / cross-grid internal helpers ──
  /** @internal 드래그/셔틀이 참조하는 바디 엘리먼트 (레지스트리 해석용) / Body element referenced by drag/shuttle (registry resolution). */
  _crossBodyEl(): HTMLElement { return this._renderer!.bodyWrapper; }
  /** fromIndex 를 잡고 드래그할 때 함께 이동할 행 집합 (다중선택에 포함되면 선택 전체) */
  private _dragRowSet(fromIndex: number): number[] {
    const sel = [...this._rowMgr.selectedRows];
    return (sel.length > 1 && sel.includes(fromIndex))
      ? sel.sort((a, b) => a - b)
      : [fromIndex];
  }

  // R7(§3.1 C8): 크로스그리드 이동·매핑·3단계 드롭 발화는 CrossGridController 로 이관.
  // 아래는 얇은 위임(공개 API 불변). 드롭 어댑터(onCrossDrop)는 _cross.handleCrossGridDrop 로 배선됨.

  /**
   * 이 그리드의 행들을 다른 그리드로 이동(move)한다. 드래그·화살표 셔틀 공통 경로.
   * 3단계 이벤트(before→after→complete)와 crossGridMapping(필드 매핑)을 적용한다.
   * / Move rows from this grid to another grid (shared path for drag and arrow shuttle).
   * Applies the three-phase events (before→after→complete) and crossGridMapping (field mapping).
   *
   * @param target - 대상 그리드 / Target grid
   * @param sourceIndexes - 이동할 소스 행 인덱스들 / Source row indexes to move
   * @param targetIndex - 삽입 시작 인덱스(생략 시 끝) / Insertion start index (end when omitted)
   * @returns 이동 성공 여부 / Whether the move succeeded
   */
  moveRowsTo(target: OpenGridInstance<T>, sourceIndexes: number[], targetIndex?: number): Promise<boolean> {
    return this._cross.moveRowsTo(target, sourceIndexes, targetIndex);
  }

  /** 체크된 행을 다른 그리드로 이동 (화살표 셔틀용). 체크 없으면 무시. / Move checked rows to another grid (arrow-shuttle use). No-op when nothing is checked. */
  moveCheckedTo(target: OpenGridInstance<T>): Promise<boolean> {
    return this._cross.moveCheckedTo(target);
  }

  /** 행 위치 이동(드롭 경로에서 실행). / Move a row to a new position (executed on the drop path). */
  reorderRow(fromIndex: number, toIndex: number): void {
    this._data.moveRow(fromIndex, toIndex);
    this._doRender(...this._visRange());
  }
  private _handleColResize(colIndex: number, newWidth: number): void {
    if (this._colWidths[colIndex] !== undefined) {
      this._colWidths[colIndex] = newWidth;
    }
    // 사용자가 조절한 폭을 field 기준으로 기억 → 이후 재계산(_recalcWidths)에서 보존
    const leaf = this._colLayout.visibleLeaves[colIndex];
    if (leaf) this._userWidths.set(leaf.field, newWidth);
    this._renderHeader();                 // 헤더 폭도 즉시 동기화
    this._doRender(...this._visRange());
  }
  private _handleKeyDown(e: KeyboardEvent): void { this._kbdMgr.handleKeyDown(e); }

  private _setFocusCell(ri: number, ci: number): void {
    this._rowMgr.selectSingle(ri);
    this._editMgr.setFocusCell(ri, ci);
  }
  // 스크린리더에게 텍스트를 읽어준다 (aria-live)
  private _announce(msg: string): void {
    if (!this._liveRegion) return;
    this._liveRegion.textContent = '';
    setTimeout(() => { if (this._liveRegion) this._liveRegion.textContent = msg; }, 50);
  }

  private _bindOptionEvents(): void {
    if (this._options.onCellClick) this.on('cellClick', this._options.onCellClick);
    if (this._options.onCellDblClick) this.on('cellDblClick', this._options.onCellDblClick);
    if (this._options.onRowClick) this.on('rowClick', this._options.onRowClick);
    if (this._options.onEditStart) this.on('editStart', this._options.onEditStart);
    if (this._options.onEditEnd) this.on('editEnd', this._options.onEditEnd);
    if (this._options.onSortChange) this.on('sortChange', this._options.onSortChange);
    if (this._options.onFilterChange) this.on('filterChange', this._options.onFilterChange);
    if (this._options.onScroll) this.on('scroll', this._options.onScroll);
    if (this._options.onDataChange) this.on('dataChange', this._options.onDataChange);
    if (this._options.onSelectionChange) this.on('selectionChange', this._options.onSelectionChange);
    // Sprint 35 ?좉퇋
    if (this._options.onRowDblClick)    this.on('rowDblClick',    this._options.onRowDblClick);
    if (this._options.onRowMouseOver)   this.on('rowMouseOver',   this._options.onRowMouseOver);
    if (this._options.onRowMouseOut)    this.on('rowMouseOut',    this._options.onRowMouseOut);
    if (this._options.onRowMouseDown)   this.on('rowMouseDown',   this._options.onRowMouseDown);
    if (this._options.onRowMouseUp)     this.on('rowMouseUp',     this._options.onRowMouseUp);
    if (this._options.onRowMouseMove)   this.on('rowMouseMove',   this._options.onRowMouseMove);
    if (this._options.onCellMouseOver)  this.on('cellMouseOver',  this._options.onCellMouseOver);
    if (this._options.onCellMouseOut)   this.on('cellMouseOut',   this._options.onCellMouseOut);
    if (this._options.onCellMouseDown)  this.on('cellMouseDown',  this._options.onCellMouseDown);
    if (this._options.onCellMouseUp)    this.on('cellMouseUp',    this._options.onCellMouseUp);
    if (this._options.onCellMouseMove)  this.on('cellMouseMove',  this._options.onCellMouseMove);
    if (this._options.onCellKeyDown)    this.on('cellKeyDown',    this._options.onCellKeyDown);
    if (this._options.onCellKeyUp)      this.on('cellKeyUp',      this._options.onCellKeyUp);
    if (this._options.onCellKeyPress)   this.on('cellKeyPress',   this._options.onCellKeyPress);
    // F2(C5.1 on* 버킷)
    if (this._options.onRowExpand)      this.on('rowExpand',      this._options.onRowExpand);
    if (this._options.onRowCollapse)    this.on('rowCollapse',    this._options.onRowCollapse);
  }
  // R6(§3.1 C5): 데이터 변경 표면은 MutationService 로 이관. 아래는 얇은 위임(공개 API 불변).
  // / R6 (§3.1 C5): the mutation surface moved to MutationService; below are thin delegations (public API unchanged).
  /**
   * 그리드 데이터를 통째로 교체한다(행 id 재발급, F3 수식 상태 초기화).
   * / Replace the entire data set (row ids reissued; F3 formula state reset).
   *
   * @param data - 새 행 배열 / New array of rows
   * @example
   * grid.setData([{ name: 'Kim' }, { name: 'Lee' }]);
   */
  setData(data: T[]): void {
    this._mutation.setData(data);
    // DD-05 S2c-1(CF): 데이터 전량 교체 → 컬럼 통계 무효화·재계산(캐시 갱신). CF 미설정이면 무비용.
    // / CF: full data replace → invalidate & recompute column stats (cache refresh). No-op when CF is unset.
    if (this._cf) { this._recomputeCFStats(); this._doRender(...this._visRange()); }
  }

  /** 현재(정렬/필터 반영) 데이터 배열. / Current data array (sort/filter applied). */
  getData(): T[] { return this._data.getData(); }
  /** 원본(정렬/필터 미반영) 데이터 배열. / Original data array (before sort/filter). */
  getSourceRows(): T[] { return this._data.getOriginalData(); }

  /** 데이터 뒤에 행들을 추가한다. / Append rows after the existing data. */
  pushData(data: T[]): void {
    const combined = [...this._data.getAllData(), ...data];
    this._data.setData(combined);
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
  }

  /** 데이터 앞에 행들을 추가한다. / Prepend rows before the existing data. */
  prefixData(data: T[]): void {
    const combined = [...data, ...this._data.getAllData()];
    this._data.setData(combined);
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
  }

  /**
   * 조건부서식(CF) 규칙을 설정한다 — 데이터바·히트맵·아이콘셋을 렌더 경로에 배선한다.
   * CF 는 opt-in 이라 첫 호출 때 CF 엔진(cf/**)을 **동적 import** 로 조립한다(베이스 번들 무증가, 별 청크).
   * 규칙이 걸린 컬럼마다 컬럼 통계를 1회 캐시 계산(per-render 재계산 금지)한 뒤 재렌더한다.
   * `rules=[]` 를 넘기면 CF 를 해제한다(엔진·통계 캐시 clear + 잔재 제거 재렌더).
   * / Set conditional-formatting rules — wires data-bars/heatmaps/icon-sets into the render path.
   * CF is opt-in; the CF engine (cf/**) is assembled via **dynamic import** on first call (no base-bundle
   * growth, separate chunk). Column stats are cached once per rule-bearing column (never re-computed
   * per render), then a re-render paints them. Passing `rules=[]` clears CF (engine/cache reset + residue-stripping re-render).
   *
   * @param rules - CF 규칙 배열(빈 배열이면 해제) / CF rule array (empty array clears CF)
   * @example
   * await grid.setConditionalFormat([
   *   { id: 'bar', when: { type: 'compare', op: '>=', a: 0 }, encode: { kind: 'bar', axis: 'zero' }, scope: { columnId: 'amount' }, priority: 0 },
   * ]);
   */
  async setConditionalFormat(rules: CFRule[]): Promise<void> {
    this._cfRules = rules;
    if (!rules.length) {
      // 해제: 엔진·통계 캐시 clear 후 재렌더(브리지가 이전 CF 잔재 제거).
      this._cf = null;
      this._cfStats.clear();
      this._doRender(...this._visRange());
      return;
    }
    // 동적 import — cf/ 는 별 청크. 로드 후 엔진 조립 + 색 시드 읽기 포트·통계 계산기 보관(cf/ 정적 참조 회피).
    const cf = await import('./cf/index.js');
    this._cf = new cf.CFEngine(new cf.CFRuleStore(rules));
    this._cfAppearance = cf.staticAppearanceView();
    this._cfComputeStats = cf.computeColumnStats;
    this._recomputeCFStats();
    this._doRender(...this._visRange());
  }

  /**
   * CF 규칙이 걸린 컬럼마다 현재 데이터로 컬럼 통계를 계산해 캐시한다(per-render 재계산 금지의 근거).
   * 통계 계산기는 setConditionalFormat 에서 cf/ 동적 청크로부터 보관한 참조를 동기 사용한다.
   * / Recompute & cache per-column CF stats using the computer captured from the cf/ dynamic chunk.
   */
  private _recomputeCFStats(): void {
    const compute = this._cfComputeStats;
    if (!this._cfRules.length || !compute) { this._cfStats.clear(); return; }
    const fields = new Set(this._cfRules.map(r => r.scope.columnId));
    const rows = this._data.getData();
    const next = new Map<string, ColumnStats>();
    for (const field of fields) {
      next.set(field, compute(rows.map(r => (r as any)[field])));
    }
    this._cfStats = next;
  }

  // ── DD-07(RT): 실시간 데이터 소스 배선(11 detailed-design/DD-07_realtime.md §2.3) ──────────
  // ── DD-07(RT): realtime data-source wiring ──────────
  /**
   * 실시간 데이터 소스를 그리드에 배선한다(폴링/스트리밍/커스텀 — `IRealtimeSource` 구현 아무거나 DI).
   * CF 와 동일하게 첫 호출 시에만 realtime/ 를 동적 import(별 청크·베이스 번들 무증가). 델타는 기존
   * 단일 쓰기 경로(MutationService)를 재사용해 적용되므로 증분=전체 불변식·수식 재계산·차트 라이브
   * 갱신(dataChange 구독)을 자연 상속한다. 재호출 시 이전 소스는 detach 후 교체.
   * / Wire a realtime source (polling/streaming/custom — any `IRealtimeSource` via DI). Like CF, the
   *   realtime/ chunk is dynamically imported only on first call (separate chunk; base bundle unchanged).
   *   Deltas reuse the existing single write path (MutationService), inheriting the incremental=full
   *   invariant, formula recompute, and live chart refresh (dataChange subscription). Re-calling
   *   detaches and replaces the previous source.
   *
   * @param source - 실시간 소스(예: `new PollingSource({...})`) / Realtime source (e.g. `new PollingSource({...})`)
   * @param opts - 백프레셔·신선도·SR 옵션(전부 옵션) / Backpressure/freshness/SR options (all optional)
   * @returns 배선된 컨트롤러(`.connection`·`.backpressureStats`·`.onConnection`·`.detach()`) / The wired controller
   * @example
   * const src = new PollingSource({ intervalMs: 1000, fetcher: async () => ({ kind: 'delta', seq, cells }) });
   * const rt = await grid.setRealtimeSource(src);
   * rt.onConnection((s) => console.log(s.status));
   */
  async setRealtimeSource(source: IRealtimeSource<T>, opts?: RealtimeWireOptions): Promise<RealtimeController<T>> {
    // 재호출 = 소스 교체: 이전 컨트롤러 detach(멱등). / Re-call = swap source: detach the previous controller.
    this._rt?.detach();
    this._rt = null;

    const rt = await import('./realtime/index.js');

    // ── 좌표 이음새: rowId↔flat index 는 프로젝트 SSOT(FlatRowModel)로 해소(FormulaController 와 동일 규약). ──
    // / Coordinate seam: rowId↔flat index resolved via the project SSOT (FlatRowModel), same convention as FormulaController.
    const coords: ICommandCtx<T>['coords'] = {
      rowCount: () => this._flatModel.count(),
      rowIdAt: (i) => this._flatModel.rowIdOfFlat(i) ?? undefined,
      indexOf: (rowId) => this._flatModel.flatIndexOfRowId(rowId),
      getCellValue: (rowId, field) => this._data.getCellValueByRowId(rowId, field),
      getRowSnapshot: (rowId) => {
        const r = this._data.getRowById(rowId);
        return r ? ({ ...(r as Record<string, unknown>) }) : undefined;
      },
    };

    // ── 쓰기 이음새: RtApplyCommand 가 만지는 유일한 표면 = 기존 MutationService 초크포인트(우회 없음). ──
    // / Write seam: the only surface RtApplyCommand touches = the existing MutationService chokepoint (no bypass).
    const ctx: ICommandCtx<T> = {
      mutation: {
        writeCell: (ri, field, value) => this._mutation.writeCell(ri, field, value),
        writeCells: (patches) => this._mutation.writeCells(patches.map((p) => ({ ...p }))),
        insertRow: (item, position) => this._mutation.insertRow(item, (position as any) ?? 'last'),
        deleteRows: (indices) => this._mutation.deleteRow([...indices]),
        beginBatch: () => this._mutation.beginBatch(),
        endBatch: () => this._mutation.endBatch(),
      },
      coords,
      values: { equals: (a, b) => Object.is(a, b) },
      clock: { now: () => Date.now() },
    };

    // ── 단일 쓰기 sink: dispatchSilent = do 만(undo 스택 미적재). 프레임 배치는 mutation 배치로 coalesce. ──
    // / Silent sink: dispatchSilent = do only (no undo push); frame batch coalesces via the mutation batch.
    const sink: RtCommandSink<T> = {
      dispatchSilent: (cmd) => cmd.do(ctx),
      beginBatch: () => this._mutation.beginBatch(),
      endBatch: () => this._mutation.endBatch(),
    };

    // ── 상태 보존: 선택/스크롤은 그리드가 이미 rowId 기준 재정합(RangeSelectionManager·VirtualScroll). ──
    //     따라서 최소 안전 어댑터(비방해). 편집충돌(S-1) 심화 정책은 DD-07 스파이크로 이관.
    // / State preservation: selection/scroll are already reconciled by rowId (RangeSelectionManager/VirtualScroll),
    //   so a minimal non-intrusive adapter suffices; deep edit-conflict policy (S-1) is deferred to the DD-07 spike.
    const rtCoords: RtCoords = {
      rowIdToIndex: (rowId) => this._flatModel.flatIndexOfRowId(rowId),
      indexToRowId: (i) => this._flatModel.rowIdOfFlat(i) ?? undefined,
    };
    const liveState: LiveStateSource = {
      readSelection: () => [],
      readScroll: () => ({ pixelWithinRow: 0, scrollLeft: this._renderer?.bodyWrapper.scrollLeft ?? 0 }),
      readEditing: () => undefined,
      readSortFilterSig: () => '',
      writeSelection: () => {},
      writeScroll: () => {},
      writeEditing: () => {},
    };

    const deps: RealtimeControllerDeps<T> = {
      sink,
      stateGuard: new rt.LiveStateGuard(liveState, rtCoords),
      freshness: new rt.FreshnessClock({ staleAfterMs: opts?.staleAfterMs ?? 5000 }),
      announce: new rt.RtAnnouncePolicy({
        announce: opts?.announce ?? (() => {}),
        ...(opts?.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
      }),
      ...(opts?.scheduleFrame ? { scheduleFrame: opts.scheduleFrame } : {}),
      ...(opts?.maxBatchPerFrame !== undefined ? { maxBatchPerFrame: opts.maxBatchPerFrame } : {}),
      // UC-3 전체 스냅샷 = 기존 setData 경로 재사용(_vs 총행수·aria·컬럼폭 재계산 포함). / Full snapshot via existing setData.
      applySnapshot: (rows) => this.setData(rows as T[]),
    };

    const controller = new rt.RealtimeController<T>(source, deps);
    this._rt = controller;
    controller.attach();
    return controller;
  }

  /** 실시간 소스 배선을 해제한다(구독·타이머·소켓 정리, 멱등). / Disconnect the realtime source (teardown; idempotent). */
  disconnectRealtime(): void {
    this._rt?.detach();
    this._rt = null;
  }

  /** 모든 행을 제거한다(컬럼·옵션 유지). / Remove all rows (columns & options kept). */
  clearData(): void {
    this._rowMgr.reset();
    this._data.clearData();
    // R4: totals=0 → full 렌더 → emit([]) (onDataChange bound listener 로 ONCE, 명시 재호출 없음).
    this._mutation.commit({ totals: 'zero', renderMode: 'full', emitPayload: () => [] });
  }

  // R6(§3.1 C5): 얇은 위임 — 실제 구현은 MutationService.
  // / R6 (§3.1 C5): thin delegation — actual implementation lives in MutationService.
  /**
   * 지정 위치에 행 1건을 삽입한다. / Insert one row at the given position.
   *
   * @param item - 행 데이터(부분 객체 허용) / Row data (partial object allowed)
   * @param position - 삽입 위치(기본 'last') / Insertion position (default 'last')
   */
  insertRow(item: Partial<T>, position: Position = 'last'): void { this._mutation.insertRow(item, position); }

  /** 행(들)을 끝에 추가한다. / Append row(s) at the end. */
  pushRow(items: Partial<T> | Partial<T>[]): void { this._mutation.pushRow(items); }

  /** @deprecated 하위호환 alias → pushRow / Backward-compat alias → pushRow */
  appendRows(items: Partial<T> | Partial<T>[]): void { this.pushRow(items); }

  /** 행(들)을 맨 앞에 추가한다. / Prepend row(s) at the beginning. */
  unshiftRow(items: Partial<T> | Partial<T>[]): void {
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(it => this._data.addRow(it, 'first'));
    // R4: unshiftRow 도 트리거 브래킷 없음 — pushRow 와 동형 커밋.
    this._mutation.commit({
      totals: 'count', renderMode: 'sync-window',
      emitPayload: () => this._data.getData(), fireOnDataChangeExplicitly: true,
    });
  }

  /** @deprecated 하위호환 alias → unshiftRow / Backward-compat alias → unshiftRow */
  prependRows(items: Partial<T> | Partial<T>[]): void { this.unshiftRow(items); }

  /** 행(단건 또는 복수 인덱스)을 삭제한다. / Delete row(s) by index (single or array). */
  deleteRow(rowIndex: number | number[]): void { this._mutation.deleteRow(rowIndex); }

  /**
   * @deprecated no-op stub — id 기반 삭제는 미구현(본문 없음). 인덱스로 지우려면 `deleteRow(rowIndex)`
   *   를, id→인덱스 변환은 `getFlatRowModel()`/`getData()` 조회 후 `deleteRow` 를 사용.
   *   / no-op stub — id-based deletion is not implemented (empty body). Use `deleteRow(rowIndex)`;
   *   resolve id→index via `getFlatRowModel()`/`getData()` first.
   */
  deleteById(_ids: string[]): void { /* 異뷀썑 援ы쁽 */ }

  /** 원시 셀 값을 읽는다. / Read the raw cell value. */
  readCell(rowIndex: number, field: string): any {
    return this._data.getCellValue(rowIndex, field);
  }
  /**
   * 셀 표시 텍스트를 해석한다(displayFormatter strategy 반영). / Resolve the cell display text
   * (honors the displayFormatter strategy).
   */
  getDisplayValue(rowIndex: number, field: string): string {
    const val = this.readCell(rowIndex, field);
    // Phase 2 슬롯 #3: displayFormatter(본문 1줄 — C1 최소 침습 예외). default = 현행(null→'', else String).
    const fmt = this._ovk.getStrategy(
      'displayFormatter',
      (v: any, _f: string, _row: any): string => (v == null ? '' : String(v)),
    );
    return fmt(val, field, this._data.getRowByIndex(rowIndex));
  }

  /** 셀 값을 쓰고 변경 추적·수식 dirty 적립·재렌더한다. / Write a cell value (change tracking, formula dirty seeding, re-render). */
  writeCell(rowIndex: number, field: string, value: any): void { this._mutation.writeCell(rowIndex, field, value); }

  /** 지정 인덱스의 행 객체. / Row object at the given index. */
  getRowAt(rowIndex: number): T { return this._data.getRowByIndex(rowIndex) as T; }

  // ── Phase 0 인프라 / Phase 0 infrastructure ──────────────────────────────────────

  /** flat/visual index ↔ data 리졸버(C0.3). F1/F3/F4 는 이 모델만 경유해야 한다. / flat/visual index ↔ data resolver (C0.3). F1/F3/F4 must go through this model. */
  getFlatRowModel(): FlatRowModel { return this._flatModel; }

  // R6(§3.1 C5): 배치 API 도 MutationService 로 이관. 얇은 위임(공개 API 불변).
  /** 배치 쓰기 시작 — 이후 writeCell 의 렌더/이벤트를 지연·병합. / Begin a write batch — subsequent writeCell renders/events are deferred & coalesced. */
  beginBatch(): void { this._mutation.beginBatch(); }

  /** 배치 종료 — 쓰기가 있었으면 1회 렌더 + 1회 dataChange. / End the batch — one render + one coalesced dataChange if anything was written. */
  endBatch(): void { this._mutation.endBatch(); }

  // R7(§3.1 C9): F3 수식 표면은 FormulaController 로 이관. 아래는 얇은 위임(공개 API 불변).
  // accessor 조립/에러 표현/flush/afterRecalc/getFormulaMeta 등 내부 훅은 _formula 를 통해 배선됨.

  // ── F3: 공개 API(§8.2) — rowIndex 는 flat(C0), 내부 즉시 stable rowId 로 정규화 ──────
  // ── F3: public API (§8.2) — rowIndex is flat (C0), normalized to stable rowId internally ──
  /**
   * 셀에 수식을 설정한다("=A1+B2" 형태). / Set a cell formula (e.g. "=A1+B2").
   *
   * @param rowIndex - flat index(C0) / flat index (C0)
   * @param field - 컬럼 field / Column field
   * @param formula - '=' 로 시작하는 수식 원문 / Formula source starting with '='
   * @example
   * grid.setCellFormula(2, 'total', '=A1+B1');
   */
  setCellFormula(rowIndex: number, field: string, formula: string): void {
    this._formula.setCellFormula(rowIndex, field, formula);
  }

  /** 셀 수식 원문(없으면 null). / Formula source of the cell (null when absent). */
  getCellFormula(rowIndex: number, field: string): string | null {
    return this._formula.getCellFormula(rowIndex, field);
  }

  /** 셀에 수식이 있는지. / Whether the cell has a formula. */
  hasCellFormula(rowIndex: number, field: string): boolean {
    return this._formula.hasCellFormula(rowIndex, field);
  }

  /** 수식 제거(마지막 계산값은 유지). / Remove the formula (last computed value kept). */
  clearCellFormula(rowIndex: number, field: string): void {
    this._formula.clearCellFormula(rowIndex, field);
  }

  /** 셀 수식 에러 코드(없으면 null). / Formula error code of the cell (null when none). */
  getCellError(rowIndex: number, field: string): FormulaErrorCode | null {
    return this._formula.getCellError(rowIndex, field);
  }

  /** 디버깅용 — 이 셀을 참조하는(종속) 셀들. / Debugging — cells that depend on this cell. */
  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    return this._formula.getDependents(rowIndex, field);
  }

  /** 디버깅용 — 이 셀이 참조하는(선행) 셀들. / Debugging — cells this cell references (precedents). */
  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    return this._formula.getPrecedents(rowIndex, field);
  }

  /** 전체 수식 위상 재계산. / Recalculate all formulas in topological order. */
  recalculate(): void { this._formula.recalculate(); }

  /** 단일 셀 + 종속 폐포만 재계산. / Recalculate one cell plus its dependent closure. */
  recalculateCell(rowIndex: number, field: string): void {
    this._formula.recalculateCell(rowIndex, field);
  }

  /** C3(F1 fill 전용): srcRowId/srcField 수식의 상대축만 dRow/dCol 오프셋한 새 수식 원문. / C3 (F1 fill only): new formula source with only the relative axes of the srcRowId/srcField formula offset by dRow/dCol. */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    return this._formula.offsetFormula(srcRowId, srcField, dRow, dCol);
  }

  /**
   * beginBatch+루프+endBatch 래퍼(C2.1). patches 의 rowIndex 는 flat index — 대상이
   * FlatRowModel.resolveFlatRow 로 해소해 kind!=='data' (group/tree/detail 의사행)이면
   * 쓰기 전에 skip 한다(C0.3 쓰기 안전, filler 에 writeCell 절대 금지).
   * 건너뛴 셀 수를 반환하고, 1건이라도 있으면 announce + 'writeCellsSkip' 이벤트로 표면화한다.
   * / beginBatch+loop+endBatch wrapper (C2.1). Each patch rowIndex is a flat index — targets
   * resolving to kind!=='data' (group/tree/detail pseudo-rows) are skipped before writing
   * (C0.3 write safety). Returns the skipped-cell count and surfaces it via announce +
   * a 'writeCellsSkip' event when non-zero.
   *
   * @param patches - 쓰기 목록 / List of writes
   * @returns 건너뛴 셀 수 / Number of skipped cells
   */
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number {
    return this._mutation.writeCells(patches);
  }

  // ── F1: 범위 선택 + 채우기 핸들(11_design_F1_v2.md §6.2, C4) ────────────
  // ── F1: range selection + fill handle (11_design_F1_v2.md §6.2, C4) ────────────
  /** 정규화된 선택 범위 rects(없으면 []). MVP 는 길이 ≤1. / Normalized selection rects ([] when none). Length ≤1 in MVP. */
  getRangeSelection(): CellRange[] { return this._rangeMgr.getRangeSelection(); }
  /** 활성 범위(= getRangeSelection()[0] ?? null). / Active range (= getRangeSelection()[0] ?? null). */
  getActiveRange(): CellRange | null { return this._rangeMgr.getActiveRange(); }
  /** 범위 선택을 프로그램적으로 설정. / Set the range selection programmatically. */
  setRangeSelection(range: CellRange | CellRange[]): void { this._rangeMgr.setRangeSelection(range); }
  /** 범위 선택 해제. / Clear the range selection. */
  clearRangeSelection(): void { this._rangeMgr.clearRangeSelection(); }
  /** 활성 범위의 값 2D 배열. / 2D value array of the active range. */
  getRangeValues(): any[][] { return this._rangeMgr.getRangeValues(); }
  /** 활성 범위 숫자 셀의 통계(합계/평균 등, OGDecimal 기반). / Stats of numeric cells in the active range (sum/avg…, OGDecimal-based). */
  getRangeStats(): RangeStats | null { return this._rangeMgr.getRangeStats(); }
  /**
   * source→target 채우기(배치 경유, C2). axis 는 두 rect 상대 위치로 추론.
   * / Fill from source into target (batched, C2). The axis is inferred from the two rects.
   *
   * @param source - 원본 범위 / Source range
   * @param target - 대상 범위 / Target range
   * @param mode - 'copy'(기본) 또는 'series' / 'copy' (default) or 'series'
   */
  fillRange(source: CellRange, target: CellRange, mode: 'copy' | 'series' = 'copy'): void {
    this._rangeMgr.fillRange(source, target, mode);
  }

  // ── F4: 그리드 데이터 통합 차트(11_design_F4_v2.md §6, C5) ──────────────
  // ── F4: grid-data integrated chart (11_design_F4_v2.md §6, C5) ──────────────
  /** 그리드 데이터 소스 차트를 생성한다. / Create a chart backed by grid data. */
  createChart(config: ChartConfig): ChartInstance { return this._chartMgr.createChart(config); }
  /** 살아있는 차트 인스턴스 목록. / Live chart instances. */
  getCharts(): ChartInstance[] { return this._chartMgr.getCharts(); }
  /** 모든 차트 파괴(구독 해제 포함). / Destroy all charts (including subscriptions). */
  destroyCharts(): void { this._chartMgr.destroyCharts(); }

  /** 변경 추적 요약(추가/수정/삭제 행). / Change-tracking summary (added/edited/removed rows). */
  getChanges(): { added: T[]; edited: T[]; removed: T[] } { return this._data.getChanges(); }
  /** 수정된 행 목록. / Edited rows. */
  getEditedRows(): T[] { return this._data.getEditedRows(); }
  /** @deprecated 하위 호환 — getEditedRows() 권장. / Backward compat — prefer getEditedRows(). */
  getChangedRows(): T[] { return this._data.getChangedRows(); }
  /** 행별 변경 필드·old/new 값 상세. / Per-row changed fields with old/new values. */
  getChangedColumns(): Array<{ row: T; fields: string[]; diff: Array<{ field: string; oldValue: any; newValue: any }> }> {
    return this._data.getChangedColumns();
  }
  /** 추가된 행 목록. / Added rows. */
  getAddedRows(): T[] { return this._data.getAddedRows(); }
  /** 삭제된 행 목록. / Removed rows. */
  getRemovedRows(): T[] { return this._data.getRemovedRows(); }
  /** 행의 원본(수정 전) 스냅샷. / Original (pre-edit) snapshot of the row. */
  getOriginalRow(rowIndex: number): T | undefined { return this._data.getOriginalRow(rowIndex); }
  /** stateField 값이 있는 행 목록. / Rows having a value in stateField. */
  getRowsWithState(stateField: string): T[] { return this._data.getRowsWithState(stateField); }
  // ── R13(§2.8 R-7a, M8): 죽은 no-op 스텁 정직성 표기 ──────────────────────
  //   아래 메서드들은 공개 API 표면에 존재하지만 본문이 비어 아무 동작도 하지 않는다(하위호환 계약상
  //   삭제 불가 → @deprecated 로 명시). 각 태그에 "무엇을 안 하는지 + 대안"을 1줄로 정직 기재한다.
  //   목록: undo/redo/clearHistory · deleteById · checkById/addCheckById/uncheckById ·
  //         setColWidths/calcColWidths · freezeRows · addTreeRow · jumpToCol.
  /** @deprecated no-op stub — undo/redo 히스토리는 미구현. 변이 가드는 TriggerManager `before:*` 훅,
   *   변경 추적은 `getChanges()`/`getOriginalRow()` 를 사용.
   *   / no-op stub — undo/redo history is not implemented. Use TriggerManager `before:*` hooks
   *   for mutation guards and `getChanges()`/`getOriginalRow()` for change tracking. */
  undo(): void {}
  /** @deprecated no-op stub — undo/redo 히스토리 미구현(위 `undo()` 참조). / no-op stub — see `undo()` above. */
  redo(): void {}
  /** @deprecated no-op stub — undo/redo 히스토리 자체가 없어 비울 것도 없음(위 `undo()` 참조). / no-op stub — there is no history to clear (see `undo()`). */
  clearHistory(): void {}
  /** 보이는 리프 컬럼 정의 목록. / Visible leaf column definitions. */
  getColumnDefs(): ColumnDef<T>[] { return this._colLayout.visibleLeaves; }
  /** 숨김 포함 전체 리프 컬럼 정의. / All leaf column definitions including hidden. */
  getAllColumnDefs(): ColumnDef<T>[] { return this._colLayout.leaves; }
  /** 보이는 컬럼 수. / Number of visible columns. */
  getColumnCount(): number { return this._colLayout.visibleLeaves.length; }
  /** 컬럼 구성을 통째로 교체하고 재렌더한다. / Replace the whole column set and re-render. */
  applyColumns(columns: ColumnDef<T>[]): void {
    const ctx = this._trigMgr.mkCtx('applyColumns', [columns]);
    if (!this._trigMgr.exec('before:applyColumns', ctx)) return;
    this._colLayout.setColumns(columns);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader();
    this._doRender(...this._visRange());
    ctx.result = { columnCount: columns.length };
    this._trigMgr.exec('after:applyColumns', ctx);
  }
  /** 컬럼 1개를 삽입한다. / Insert one column. */
  insertColumn(colDef: ColumnDef<T>, position?: Position): void {
    this._colLayout.addColumn(colDef, position as any);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  /** 컬럼을 삭제한다(해당 field 참조 수식은 #REF 처리). / Delete a column (formulas referencing the field become #REF). */
  deleteColumn(field: string): void {
    this._colLayout.removeColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    // F3-R28(P0): 열 삭제 → 그 field 를 deps 로 가진 수식들이 자연 #REF 귀결(accessor.hasField=false).
    this._formula.afterRecalc(this._recalc.invalidateField(field), { skipRender: true });
    this._renderHeader(); this._doRender(...this._visRange());
  }

  private _reorderColumn(fromIdx: number, toIdx: number): void {
    const leaves = this._colLayout.visibleLeaves.map(l => l as ColumnDef<T>);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= leaves.length || toIdx >= leaves.length) return;
    const reordered = [...this._options.columns];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    this._options.columns = reordered;
    this.applyColumns(reordered);
    this._options.onColumnReorder?.({ fromIndex: fromIdx, toIndex: toIdx, field: moved.field ?? '' });
  }
  /** 컬럼(들)을 숨긴다. / Hide column(s). */
  hideColumn(field: string | string[]): void {
    this._colLayout.hideColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  /** 숨긴 컬럼(들)을 다시 표시한다. / Show hidden column(s). */
  showColumn(field: string | string[]): void {
    this._colLayout.showColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  /** field 의 보이는 컬럼 인덱스(-1 = 없음). / Visible column index of the field (-1 when absent). */
  getColumnIndex(field: string): number { return this._colLayout.getColumnIndex(field); }
  /** 인덱스 위치의 field 명(없으면 ''). / Field name at the index ('' when absent). */
  getFieldAt(idx: number): string { return this._colLayout.getColumnByIndex(idx)?.field ?? ''; }
  /** 해당 컬럼의 값 배열. / Values of the column. */
  getColValues(field: string, _all = false): any[] { return this._data.getData().map(r => r[field]); }
  /** 해당 컬럼의 고유 값 배열. / Unique values of the column. */
  getUniqueValues(field: string, all = false): any[] { return [...new Set(this.getColValues(field, all))]; }
  /** @deprecated no-op stub — 컬럼 폭 일괄 설정 미구현. 폭은 `ColumnDef.width` 또는 헤더 드래그로
   *   지정하며 내부 `_recalcWidths` 가 자동 배분한다.
   *   / no-op stub — bulk width setting is not implemented. Set widths via `ColumnDef.width`
   *   or header drag; internal `_recalcWidths` distributes automatically. */
  setColWidths(_widths: number[]): void {}
  /** @deprecated no-op stub — 항상 빈 배열 반환(폭 계산 미구현). 자동 배분은 내부 `_recalcWidths` 담당. / no-op stub — always returns [] (width calculation not implemented). */
  calcColWidths(_fitToGrid = false): number[] { return []; }
  /** 선택된 행 데이터 목록. / Selected row data. */
  getSelections(): T[] { return this._rowMgr.getSelections(); }
  /** 활성 행 인덱스(-1 = 없음). / Active row index (-1 when none). */
  getActiveRow(): number { return this._rowMgr.getActiveRow(); }
  /** 지정 행을 활성/선택한다. / Activate (select) the given row. */
  activate(index: number): void { this._rowMgr.activate(index); this._doRender(...this._visRange()); }
  /** 선택 해제. / Clear the selection. */
  deselect(): void { this._rowMgr.deselect(); this._doRender(...this._visRange()); }
  /** 체크된 행 목록({row, rowIndex}). / Checked rows ({row, rowIndex}). */
  getChecked(): Array<{ row: T; rowIndex: number }> { return this._rowMgr.getChecked(); }
  /** 체크된 행 데이터만 배열로. / Checked row data only. */
  getAllChecked(): T[] { return this._rowMgr.getAllChecked(); }
  /** @deprecated no-op stub — id 기반 체크 미구현. 값 기준 체크는 `checkByValue(field, values)` 사용. / no-op stub — id-based checking not implemented; use `checkByValue(field, values)`. */
  checkById(_ids: string[]): void {}
  /** @deprecated no-op stub — id 기반 체크 추가 미구현(위 `checkById()` 참조). `checkByValue` 사용. / no-op stub — see `checkById()`; use `checkByValue`. */
  addCheckById(_ids: string[]): void {}
  /** field 값이 values 에 포함되는 행을 체크한다. / Check rows whose field value is in values. */
  checkByValue(field: string, values: any[]): void {
    this._rowMgr.checkByValue(field, values);
    this._doRender(...this._visRange());
  }
  /** @deprecated no-op stub — id 기반 체크 해제 미구현. 전체 해제는 `uncheckAll()` 사용. / no-op stub — id-based unchecking not implemented; use `uncheckAll()`. */
  uncheckById(_ids: string[]): void {}
  /** 전체 체크 해제. / Uncheck all rows. */
  uncheckAll(): void { this._rowMgr.uncheckAll(); this._doRender(...this._visRange()); }
  /**
   * 정렬을 적용한다(단일 field+dir 또는 SortItem 배열). / Apply sorting (single field+dir or a
   * SortItem list).
   *
   * @param fieldOrList - field 명 또는 정렬 목록 / Field name or sort list
   * @param dir - 단일 field 일 때 방향(기본 'asc') / Direction for single-field form (default 'asc')
   */
  orderBy(fieldOrList: string | SortItem[], dir: 'asc' | 'desc' = 'asc'): void {
    const ctx = this._trigMgr.mkCtx('orderBy', [fieldOrList, dir]);
    if (!this._trigMgr.exec('before:orderBy', ctx)) return;
    this._sfMgr.sort(fieldOrList, dir);
    this._recalcRangeBearingFormulas();
    ctx.result = { sortList: this._sfMgr.sortList };
    this._trigMgr.exec('after:orderBy', ctx);
  }
  /** 정렬을 초기 상태로 되돌린다. / Reset sorting to the initial state. */
  resetOrder(): void { this._sfMgr.resetSort(); this._recalcRangeBearingFormulas(); }
  /** 컬럼 필터를 설정한다. / Set filters for a column. */
  setFilter(field: string, filterItems: FilterItem[]): void {
    const ctx = this._trigMgr.mkCtx('setFilter', [field, filterItems]);
    if (!this._trigMgr.exec('before:setFilter', ctx)) return;
    this._sfMgr.setFilter(field, filterItems);
    this._recalcRangeBearingFormulas();
    ctx.result = { field, filteredCount: this._data.rowCount };
    this._trigMgr.exec('after:setFilter', ctx);
  }
  /** 필터 해제(field 생략 시 전체). / Clear filters (all when field omitted). */
  resetFilter(field?: string): void { this._sfMgr.resetFilter(field); this._recalcRangeBearingFormulas(); }

  /** F3-R13/MCCONNELL-03(P0): 정렬/필터 후 범위-보유(hasRangeRef) 수식 전부 dirty(§3.5). */
  private _recalcRangeBearingFormulas(): void {
    this._formula.recalcRangeBearingFormulas();
  }
  /** 현재 필터 상태 스냅샷. / Snapshot of the current filter state. */
  getFilterState(): Record<string, FilterItem[]> { return this._sfMgr.getFilterState(); }
  /** 필터 상태를 복원한다. / Restore a saved filter state. */
  restoreFilter(state: Record<string, FilterItem[]>): void { this._sfMgr.restoreFilter(state); }
  private _applyFilters(): void { this._sfMgr.applyFilters(); }
  /** 왼쪽 n개 컬럼을 고정한다. / Freeze the leftmost n columns. */
  freeze(n: number): void { this._colLayout.setFrozen(n); this._renderHeader(); this._doRender(...this._visRange()); }
  /** 수동 병합: [{row, col, rowSpan?, colSpan?}] / Manual merge: [{row, col, rowSpan?, colSpan?}] */
  mergeCells(cells: MergeCell[]): void {
    this._mergeEngine.applyMergeCells(cells);
    this._doRender(...this._visRange());
  }
  /** 자동 병합: 지정 필드 컬럼에서 연속 같은 값을 rowSpan으로 묶는다. / Auto merge: consecutive equal values in the given field columns are merged via rowSpan. */
  autoMerge(fields: string[]): void {
    const leaves = this._colLayout.visibleLeaves;
    const colIndexes: number[] = [];
    const fieldNames: string[] = [];
    for (const f of fields) {
      const ci = leaves.findIndex(l => l.field === f);
      if (ci >= 0) { colIndexes.push(ci); fieldNames.push(f); }
    }
    this._mergeEngine.applyAutoMerge(this._data.getData(), colIndexes, fieldNames);
    this._doRender(...this._visRange());
  }

  /** 병합 해제. / Clear all merges. */
  clearMerge(): void {
    this._mergeEngine.clear();
    this._doRender(...this._visRange());
  }
  /** @deprecated no-op stub — 행 고정(freeze rows) 미구현. 컬럼 고정만 지원하며 `freeze(n)` 사용. / no-op stub — frozen rows are not implemented; only column freezing via `freeze(n)`. */
  freezeRows(_n: number): void {}
  /** 지정 필드들로 그룹핑한다. / Group rows by the given fields. */
  groupBy(fields: string[]): void {
    const ctx = this._trigMgr.mkCtx('groupBy', [fields]);
    if (!this._trigMgr.exec('before:groupBy', ctx)) return;
    this._grpMgr.groupBy(fields);
    ctx.result = { fields };
    this._trigMgr.exec('after:groupBy', ctx);
  }
  /** 그룹핑 해제. / Clear grouping. */
  clearGroup(): void { this._grpMgr.clearGroup(); }
  /** 모든 그룹 펼침. / Expand all groups. */
  expandAll(): void { this._grpMgr.expandAll(); }
  /** 모든 그룹 접힘. / Collapse all groups. */
  collapseAll(): void { this._grpMgr.collapseAll(); }
  /** 트리 모드 활성화. / Enable tree mode. */
  enableTree(): void { this._grpMgr.enableTree(); }
  /** 트리 모드 비활성화. / Disable tree mode. */
  disableTree(): void { this._grpMgr.disableTree(); }
  /** 지정 트리 노드 펼침/접힘. / Expand/collapse the given tree nodes. */
  expandNodes(ids: any | any[], open = true): void { this._grpMgr.expandNodes(ids, open); }
  /** 모든 트리 노드 펼침. / Expand all tree nodes. */
  expandAllNodes(): void { this._grpMgr.expandAllNodes(); }
  /** 모든 트리 노드 접힘. / Collapse all tree nodes. */
  collapseAllNodes(): void { this._grpMgr.collapseAllNodes(); }

  // ── F2: 마스터/디테일(11_design_F2_v2.md §6.2) / F2: master/detail ────────────────────────
  /** 행 상세 패널 펼침(rowRef = flat index 또는 {id}). / Expand the detail panel (rowRef = flat index or {id}). */
  expandRow(rowRef: number | { id: string }): void { this._detailMgr.expandRow(rowRef); }
  /** 행 상세 패널 접힘. / Collapse the detail panel. */
  collapseRow(rowRef: number | { id: string }): void { this._detailMgr.collapseRow(rowRef); }
  /** 행 상세 패널 토글. / Toggle the detail panel. */
  toggleRow(rowRef: number | { id: string }): void { this._detailMgr.toggleRow(rowRef); }
  /** 행 상세 패널 펼침 여부. / Whether the detail panel is expanded. */
  isRowExpanded(rowRef: number | { id: string }): boolean { return this._detailMgr.isRowExpanded(rowRef); }
  /** 모든 상세 패널 접힘. / Collapse all detail panels. */
  collapseAllDetails(): void { this._detailMgr.collapseAllDetails(); }
  /** 상세 인스턴스(renderer 반환값 또는 자동 서브그리드; 펼친 적 없으면 undefined). / Detail instance (renderer result or auto subgrid; undefined if never expanded). */
  getDetailInstance<D = any>(rowRef: number | { id: string }): D | undefined { return this._detailMgr.getDetailInstance<D>(rowRef); }
  /** 열린 상세 패널 폭 강제 재동기(FR-11). / Force re-sync of open detail panel widths (FR-11). */
  resyncPanelWidths(): void { this._detailMgr.resyncPanelWidths(); }
  /** @deprecated no-op stub — 부모 지정 트리행 삽입 미구현. 평면 삽입은 `insertRow(item, pos)`,
   *   트리 구성은 `enableTree()`/`groupBy(fields)` 사용.
   *   / no-op stub — parented tree-row insertion is not implemented. Use `insertRow(item, pos)`
   *   for flat insertion and `enableTree()`/`groupBy(fields)` for tree structure. */
  addTreeRow(_item: Partial<T>, _pid: string, _pos?: Position): void {}
  /** 엑셀(xlsx)로 내보낸다. / Export as Excel (xlsx). */
  exportExcel(options?: ExportOptions | string): void { this._exportMgr.exportExcel(options); }
  /** CSV 로 내보낸다. / Export as CSV. */
  exportCsv(options?: ExportOptions | string): void { this._exportMgr.exportCsv(options); }
  /** JSON 으로 내보낸다. / Export as JSON. */
  exportJson(options?: ExportOptions | string): void { this._exportMgr.exportJson(options); }
  /** 인쇄용 창을 연다. / Open the print view. */
  print(options?: { title?: string; excludeFields?: string[] }): void { this._exportMgr.print(options); }

  /**
   * 데이터 배열 변환. / Convert the data set.
   *
   * @param keyValue - true = 객체 배열(기본), false = 값 2D 배열 / true = object array (default), false = 2D value array
   */
  toArray(keyValue = true): any[] {
    const data = this._data.getData();
    if (keyValue) return data;
    const cols = this._colLayout.visibleLeaves;
    return data.map(row => cols.map(c => row[c.field]));
  }
  /** 지정 행으로 스크롤·선택한다. / Scroll to and select the given row. */
  jumpToRow(rowIndex: number): void {
    this._rowMgr.selectSingle(rowIndex);
    this._vs?.scrollToRow(rowIndex);
    this._doRender(...this._visRange());
  }
  /** @deprecated no-op stub — 특정 컬럼으로 가로 스크롤 이동 미구현. 행 이동은 `jumpToRow(rowIndex)` 사용. / no-op stub — horizontal jump-to-column is not implemented; use `jumpToRow(rowIndex)`. */
  jumpToCol(_field: string): void {}
  /** 현재 스크롤 좌표. / Current scroll position. */
  getScrollPos(): { x: number; y: number } {
    return { x: this._renderer?.bodyWrapper.scrollLeft ?? 0, y: this._renderer?.bodyWrapper.scrollTop ?? 0 };
  }
  /** 푸터 정의를 교체하고 다시 그린다. / Replace footer definitions and re-render the footer. */
  setFooter(fd: any[]): void {
    this._options.footer = fd as any;
    this._renderFooterEl();
  }
  /** 푸터 집계값 목록. / Computed footer values. */
  getFooterData(): any[] { return this._footerMgr.computeValues(); }
  /** 특정 field 의 푸터 집계값(없으면 null). / Footer value of the field (null when absent). */
  getFooterValue(field: string): any {
    return this._footerMgr.computeValues().find((r: any) => r._field === field)?._value ?? null;
  }
  private _renderFooterEl(): void { this._footerMgr.render(); }

  /** 그리드 크기를 변경하고 재배치한다. / Resize the grid and relayout. */
  resize(w?: number, h?: number): void {
    if (w) this._container.style.width = `${w}px`;
    if (h) this._container.style.height = `${h}px`;
    this._onResize();
  }
  /** 색 테마(data-og-theme)를 전환한다. / Switch the color theme (data-og-theme). */
  setTheme(theme: string): void { this._container.setAttribute('data-og-theme', theme); }
  /** 색 축 CSS 변수 1개를 런타임 설정한다. / Set one color-axis CSS variable at runtime. */
  setThemeVar(k: string, v: string): void { this._container.style.setProperty(k, v); }

  /**
   * R12b: 스킨(FORM 축) 전환. data-og-skin 설정 + resolver 컨텍스트 교체 + 인라인 form 사이트 재해석.
   * 색 테마와 직교(색 토큰 무변경). default→named 전환 시 인라인 보더가 리터럴→var() 로 승격되므로
   * 헤더/본문을 한 번 재렌더한다(opt-in 비용). named→named/…→default 도 동일 경로로 안전.
   * / R12b: switch the skin (FORM axis). Sets data-og-skin, swaps the resolver context and
   * re-resolves inline form sites. Orthogonal to color themes (no color tokens touched).
   */
  setSkin(skin: string): void {
    this._options.skin = skin;
    this._container.setAttribute('data-og-skin', skin);
    this._appearance?.setSkin(skin);
    // 컨테이너 크롬 보더도 스킨 width/style 을 반영(default 는 오늘의 레거시 문자열 복원 → byte-identical).
    this._container.style.border = (skin === 'default')
      ? '1px solid var(--og-border-color, #e0e0e0)'
      : (this._appearance ? this._appearance.border() : '1px solid var(--og-border-color, #e0e0e0)');
    this._renderHeader();
    this._doRender(...this._visRange());
  }
  /** R12b: 현재 스킨 id('default' = 오늘). / R12b: current skin id ('default' = stock look). */
  getSkin(): string { return this._options.skin ?? 'default'; }

  /**
   * R12c(계약 C13): 이 그리드 인스턴스에 한해 시맨틱 아이콘 role 을 교체(멀티그리드 격리 —
   * 전역 iconRegistry 를 부모로 하는 child 에만 기록). svgOrKey 는 알려진 아이콘 key 또는 원시 SVG 본문.
   * R11 확장점과의 연결: 오버라이드를 `extensions.iconResolver` strategy 슬롯으로도 표면화해 발견가능하게 한다.
   * 반환은 this(체이닝). 미지정 role/글리프는 안전 폴백(never throw).
   * / R12c (contract C13): replace a semantic icon role for this instance only (multi-grid
   * isolation — written to a child of the global iconRegistry). svgOrKey is a known icon key or
   * raw SVG body. Returns this for chaining. Unknown roles/glyphs fall back safely (never throw).
   *
   * @param role - 시맨틱 아이콘 role / Semantic icon role
   * @param svgOrKey - 아이콘 key 또는 원시 SVG / Icon key or raw SVG
   * @returns 체이닝용 this / this for chaining
   */
  setIcon(role: string, svgOrKey: string): this {
    if (!this._icons) this._icons = iconRegistry.child();
    this._icons.register(role, svgOrKey);
    // R11 iconResolver 슬롯(있으면)으로 표면화 — role → 렌더 마크업 해석기(발견/디버깅용).
    try {
      this._extensions?.strategy('iconResolver', (r: string, opts?: any) => this._icons!.render(r, opts));
    } catch { /* 커널 미준비 등 — best-effort */ }
    return this;
  }

  /** R12c: 이 인스턴스의 아이콘 role 해석(오버라이드 우선, 없으면 전역). 렌더 마크업/SVGElement. / R12c: resolve an icon role for this instance (override first, then global). Returns render markup or an SVGElement. */
  renderIcon(role: string, opts?: { size?: number; title?: string; el?: boolean }): string | SVGElement {
    return (this._icons ?? iconRegistry).render(role, opts);
  }

  /**
   * i18n: 이 인스턴스의 UI 로케일을 전환한다. setSkin 진영 — 데이터 불변 + 크롬/가시창 부분 재렌더.
   * `lang` 속성을 로케일 Intl 태그로 갱신(스크린리더 발음 전환), 상주 크롬(페이지네이션/찾기)의
   * 라벨을 새로 그리고, 캐시된 필터 패널을 무효화한 뒤 헤더+가시창을 1회 재렌더한다.
   * 미등록 로케일은 throw 하지 않고 폴백 유지(never-throw). 전환 후 `localeChange` 이벤트 발화.
   * / i18n: switch this instance's UI locale. setSkin camp — data-immutable + partial chrome/viewport
   * re-render. Updates `lang` to the locale's Intl tag (screen-reader pronunciation), refreshes
   * resident chrome labels (pagination/find), invalidates the cached filter panel, then re-renders
   * the header + visible window once. Unknown locales never throw. Emits `localeChange` afterwards.
   *
   * @param locale - 로케일 id(예 'en') / Locale id (e.g. 'en')
   * @example
   * grid.setLocale('en');
   */
  setLocale(locale: string): void {
    const prev = this.getLocale();
    (this._locales ??= localeRegistry.child()).setActive(locale);
    this._options.locale = locale;
    this._container.setAttribute('lang', (this._locales ?? localeRegistry).meta().intlLocale);
    this._pagination?.refreshLabels();
    this._findMgr?.refreshLabels();
    this._filterPanel = null; // 다음 open 때 새 로케일로 재구축 / rebuilt with the new locale on next open
    this._renderHeader();
    this._doRender(...this._visRange());
    this.emit('localeChange', { locale, prev });
  }

  /** i18n: 현재 인스턴스 로케일 id('ko' = 기본). / i18n: current instance locale id ('ko' = default). */
  getLocale(): string { return (this._locales ?? localeRegistry).active(); }

  /**
   * i18n: 이 인스턴스만 단일 메시지를 오버라이드(setIcon 동형 — 첫 호출 때 child 지연 생성, 멀티그리드 격리).
   * 자동 재렌더는 하지 않는다(다음 렌더/setLocale 때 반영). / i18n: override a single message for this
   * instance only (isomorphic to setIcon — lazy child on first call, multi-grid isolation). No auto
   * re-render (applied on the next render/setLocale).
   *
   * @param key - dot-key 메시지 키(예 'filter.apply') / dot-key message key (e.g. 'filter.apply')
   * @param value - 문자열('{name}' 보간) 또는 함수 / string ('{name}' interpolation) or a function
   * @returns 체이닝용 this / this for chaining
   */
  setMessage(key: LocaleMessageKey | string, value: MessageValue): this {
    (this._locales ??= localeRegistry.child()).setOverride(key, value);
    return this;
  }

  /**
   * i18n: 메시지를 해석한다(인스턴스 오버라이드 우선 → 활성 로케일 → ko → 키 원문). 절대 throw 안 함 —
   * 렌더 루프(셀 aria) 소비자용. / i18n: resolve a message (instance override → active locale → ko →
   * the key itself). Never throws — for render-loop consumers (cell aria).
   *
   * @param key - dot-key 메시지 키 / dot-key message key
   * @param params - `{name}` 보간 파라미터 / `{name}` interpolation params
   * @returns 해석된 문자열(미등록 키면 키 원문) / Resolved string (the key itself when unknown)
   */
  t(key: LocaleMessageKey | string, params?: Record<string, string | number>): string {
    return (this._locales ?? localeRegistry).t(key, params);
  }
  /**
   * R12b: FORM 축 단일 토큰 런타임 오버라이드(setThemeVar 의 형태-축 형제). 컨테이너 인라인이라
   * 스타일시트를 항상 이긴다. 색⊥형태 직교성 보호를 위해 색 값은 거부한다.
   * / R12b: runtime override of a single FORM-axis token (form-axis sibling of setThemeVar).
   * Container-inline, so it always beats stylesheets. Color values are rejected to protect
   * color⊥form orthogonality (throws).
   */
  setSkinVar(k: string, v: string): void {
    if (/#[0-9a-fA-F]{3,8}\b/.test(v) || /\b(?:rgba?|hsla?)\(\s*\d/.test(v)) {
      throw new Error(`[OpenGrid.setSkinVar] "${k}: ${v}" 에 색 리터럴 — 색은 setThemeVar 축입니다(색⊥형태).`);
    }
    this._container.style.setProperty(k, v);
  }

  /**
   * DD-11 S2b: 밀도(DENSITY 축, 제4 외관축) 전환 — data-og-density + `--og-density-*` 토큰(순수 additive).
   * `densityRegistry.resolve(name)` 로 델타를 얻어 ①attr(named=설정, default/미등록=속성 제거로 byte-identical)
   * ②밀도 이름공간 토큰을 컨테이너 인라인 CSS 변수로 ③행높이 브리지(`--og-density-row-height` → base.css 가
   * 소비하는 `--og-row-height` 로 미러) ④`requiresRelayout` 이면 **리사이즈와 동일 경로**(`_onResize`)로 좌표
   * 재파생(신규 relayout 로직 없음). 색⊥형태⊥밀도⊥질감 직교라 theme/skin attr·토큰을 건드리지 않는다.
   * 미등록 name 은 never-throw(빈 델타 폴백 = default 취급). ⚠️ 밀도 10만행 relayout 실측은 S3 도커 이연.
   * / DD-11 S2b: switch the density axis (4th appearance axis) — additive `data-og-density` + `--og-density-*`
   * tokens. Named → set attr/tokens (+ mirror row-height, + relayout via the resize path); default/unknown →
   * remove attr and reset the density namespace (byte-identical). Orthogonal to theme/skin. Never throws.
   *
   * @param name - 밀도 값 id(예 'compact', 'comfortable') / Density value id (e.g. 'compact')
   */
  setDensity(name: string): void {
    const res = densityRegistry.resolve(name);
    // ① attr: named → 설정, default/미등록(빈 델타) → 제거(byte-identical).
    if (res.attr) this._container.setAttribute(res.attr.name, res.attr.value);
    else this._container.removeAttribute('data-og-density');
    // ② 밀도 이름공간 토큰 리셋(default 복귀 시 이전 델타 잔존 방지) — 밀도는 행높이 authority.
    for (const k of DENSITY_TOKENS) this._container.style.removeProperty(k);
    this._container.style.removeProperty('--og-row-height'); // 행높이 미러도 리셋
    for (const [k, v] of Object.entries(res.tokens)) this._container.style.setProperty(k, v);
    // ③ 행높이 브리지: --og-density-row-height 를 base.css 소비 토큰 --og-row-height 로 미러.
    const rowHeight = res.tokens['--og-density-row-height'];
    if (rowHeight != null) this._container.style.setProperty('--og-row-height', rowHeight);
    // ④ relayout: 밀도만 좌표 재파생 요구 → 리사이즈와 동일 경로 재사용(신규 로직 없음).
    if (res.requiresRelayout) this._onResize();
  }

  /**
   * DD-11 S2b: 질감(TEXTURE 축, 제3 외관축) 전환 — data-og-texture + `--og-texture-*` 토큰(순수 additive).
   * `textureRegistry.resolve(name)` 로 델타를 얻어 attr(named=설정, default/미등록=제거) + 질감 이름공간
   * CSS 변수만 적용한다. 질감은 배경 페인트만이라 relayout 없음(좌표 불변). 색·형태·밀도 축과 직교.
   * 미등록 name 은 never-throw(빈 델타 폴백). ⚠️ 질감 실렌더 육안 확인은 S3 도커 이연.
   * / DD-11 S2b: switch the texture axis (3rd appearance axis) — additive `data-og-texture` + `--og-texture-*`
   * tokens only. Background paint only → no relayout. Orthogonal to color/form/density. Never throws.
   *
   * @param name - 질감 값 id(예 'linen', 'paper-grain', 'graph') / Texture value id (e.g. 'linen')
   */
  setTexture(name: string): void {
    const res = textureRegistry.resolve(name);
    if (res.attr) this._container.setAttribute(res.attr.name, res.attr.value);
    else this._container.removeAttribute('data-og-texture');
    for (const k of TEXTURE_TOKENS) this._container.style.removeProperty(k);
    for (const [k, v] of Object.entries(res.tokens)) this._container.style.setProperty(k, v);
  }
  /**
   * 트리거 등록('before:{op}' 취소 가능, 'after:{op}' 결과 수신). / Register a trigger
   * ('before:{op}' can cancel, 'after:{op}' receives the result).
   *
   * @param event - 트리거 이벤트명 / Trigger event name
   * @param handler - 핸들러(ctx.cancel() 지원) / Handler (supports ctx.cancel())
   * @returns 체이닝용 this / this for chaining
   * @example
   * grid.addTrigger('before:insertRow', ctx => { if (!ctx.args[0]?.name) ctx.cancel(); });
   */
  addTrigger(event: TriggerEvent | string, handler: TriggerHandler): this {
    this._trigMgr.add(event, handler); return this;
  }
  /** 트리거 제거. / Remove a trigger. */
  removeTrigger(event: TriggerEvent | string, handler: TriggerHandler): this {
    this._trigMgr.remove(event, handler); return this;
  }
  /** 트리거 전체 또는 특정 이벤트 클리어. / Clear all triggers or those of one event. */
  clearTriggers(event?: TriggerEvent | string): this {
    this._trigMgr.clear(event); return this;
  }
  private _mkCtx(operation: string, args: any[]): TriggerContext { return this._trigMgr.mkCtx(operation, args); }
  private _trig(event: string, ctx: TriggerContext): boolean { return this._trigMgr.exec(event, ctx); }

  /**
   * 그리드를 파괴한다(옵저버/이벤트/차트/패널 해제, DOM 정리, override 전체 복구).
   * / Destroy the grid (detach observers/events/charts/panels, clean the DOM, restore all overrides).
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._renderer) crossGridRegistry.unregister(this._renderer.bodyWrapper);
    this._trigMgr.clear();
    this._ro?.disconnect();
    this._vs?.destroy();
    this._rt?.detach();                // DD-07: 실시간 구독·타이머·소켓 누수 방지. / Detach realtime subscriptions/timers/sockets.
    this._rt = null;
    this._chartMgr?.destroyCharts();   // F4: 열린 차트 패널·구독 누수 방지(§5.2)
    this._detailMgr?.destroy();
    this._filterPanel?.destroy();
    this._dnd?.destroy();
    if (this._cmHandler)    this._container.removeEventListener('contextmenu', this._cmHandler);
    if (this._cmKbdHandler) this._container.removeEventListener('keydown',     this._cmKbdHandler);
    this._cmHandler = this._cmKbdHandler = null;
    this._ctxMenu?.destroy();
    this._wsManager?.destroy();
    this._renderer?.destroy();
    this._liveRegion?.remove();
    this._liveRegion = null;
    this._container.innerHTML = '';
    this._container.classList.remove('og-container');
    this.removeAllListeners();
  }
}


