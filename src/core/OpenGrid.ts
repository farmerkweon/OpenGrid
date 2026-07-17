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
 * `setRealtimeSource` 에 넘기는 실시간 배선 옵션. 전부 선택 항목이며, 생략하면 안전한 기본값이 쓰인다.
 *
 * Options passed to `setRealtimeSource` for wiring a realtime source; all optional, with safe defaults.
 *
 * `setRealtimeSource` に渡すリアルタイム配線オプション。すべて任意項目で、省略すると安全な既定値が使われます。
 *
 * 传给 `setRealtimeSource` 的实时配线选项。全部为可选项,省略时采用安全的默认值。
 */
export interface RealtimeWireOptions {
  /**
   * 프레임당 최대 적용 셀 수(백프레셔).
   *
   * Max cells applied per frame (backpressure).
   *
   * フレームあたりの最大適用セル数(バックプレッシャー)。
   *
   * 每帧最多应用的单元格数(背压)。
   */
  maxBatchPerFrame?: number;
  /**
   * 프레임 스케줄러 주입(헤드리스/테스트 결정론). 기본=rAF/폴백.
   *
   * Injected frame scheduler; default rAF/fallback.
   *
   * フレームスケジューラの注入(ヘッドレス/テストの決定性)。既定=rAF/フォールバック。
   *
   * 注入帧调度器(无头/测试的确定性)。默认=rAF/回退。
   */
  scheduleFrame?: FrameScheduler;
  /**
   * stale 판정 임계(ms). 기본 5000.
   *
   * Stale threshold(ms); default 5000.
   *
   * stale 判定のしきい値(ms)。既定 5000。
   *
   * stale 判定的阈值(ms)。默认 5000。
   */
  staleAfterMs?: number;
  /**
   * 실시간 갱신 규모를 스크린리더에 알릴 요약 콜백(aria-live 연동). 미지정 시 아무 것도 알리지 않는다.
   *
   * Callback that hands a summary of realtime updates to a screen reader (aria-live). Announces nothing when omitted.
   *
   * リアルタイム更新の規模をスクリーンリーダーに伝える要約コールバック(aria-live 連携)。未指定の場合は何も通知しません。
   *
   * 向屏幕阅读器通知实时更新规模的摘要回调(aria-live 联动)。未指定时不通知任何内容。
   */
  announce?: (summary: RtAnnounceSummary) => void;
  /**
   * SR 디바운스 윈도우(ms). 기본 500.
   *
   * SR debounce window(ms); default 500.
   *
   * SR のデバウンスウィンドウ(ms)。既定 500。
   *
   * SR 防抖窗口(ms)。默认 500。
   */
  debounceMs?: number;
}

/**
 * OPEN_GRID 코어 그리드 클래스.
 *
 * The OPEN_GRID core grid class.
 *
 * OPEN_GRID のコアグリッドクラス。
 *
 * OPEN_GRID 的核心表格类。
 *
 * 컨테이너 요소에 마운트되어 가상 스크롤로 대량 행을 렌더하는 초경량 데이터 그리드. 수천~수십만 행을
 * 표로 다루면서 정렬·필터·그룹/트리·병합·범위 선택과 채우기·마스터/디테일·셀 수식·그리드 데이터 통합
 * 차트가 필요할 때 쓴다. 코어를 고치지 않고 동작을 바꾸는 override/strategy 확장 커널을 함께 제공한다.
 *
 * An ultra-light data grid that mounts into a container element and renders large row sets through
 * virtual scrolling. Use it to present thousands to hundreds of thousands of rows with sorting,
 * filtering, group/tree, merging, range selection & fill, master/detail, cell formulas, and integrated
 * charts backed by the grid data. It also ships the override/strategy extension kernel for changing
 * behavior without editing the core.
 *
 * コンテナ要素にマウントされ、仮想スクロールで大量の行をレンダリングする超軽量データグリッドです。数千~数十万行を
 * 表として扱いながら、ソート・フィルター・グループ/ツリー・結合・範囲選択と塗りつぶし・マスター/ディテール・セル数式・
 * グリッドデータ統合チャートが必要なときに使います。コアを修正せずに動作を変える override/strategy 拡張カーネルも
 * 併せて提供します。
 *
 * 挂载到容器元素、以虚拟滚动渲染大量行的超轻量数据表格。需要把数千至数十万行当作表格处理,同时使用排序、
 * 筛选、分组/树、合并、范围选择与填充、主从明细、单元格公式、基于表格数据的集成图表时使用。还一并提供
 * 无需修改核心即可改变行为的 override/strategy 扩展内核。
 *
 * @typeParam T - 행 데이터 타입
 *
 * Row data type
 *
 * 行データの型
 *
 * 行数据的类型
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
  /**
   * R12c: per-instance 아이콘 오버라이드 레지스트리(전역 iconRegistry 의 child). 첫 setIcon 때 지연 생성.
   *
   * R12c: per-instance icon override registry (a child of the global iconRegistry); lazily created on the first setIcon.
   *
   * R12c: インスタンスごとのアイコンオーバーライドレジストリ(グローバル iconRegistry の child)。最初の setIcon 時に遅延生成。
   *
   * R12c: 按实例的图标覆盖注册表(全局 iconRegistry 的 child)。首次 setIcon 时延迟创建。
   */
  private _icons: IconRegistry | null = null;
  /**
   * i18n: per-instance 로케일 오버라이드 레지스트리(전역 localeRegistry 의 child). locale/messages 옵션 또는 첫 setLocale/setMessage 때 지연 생성.
   *
   * i18n: per-instance locale override registry (a child of the global localeRegistry); lazily created from the locale/messages options or on the first setLocale/setMessage.
   *
   * i18n: インスタンスごとのロケールオーバーライドレジストリ(グローバル localeRegistry の child)。locale/messages オプション、または最初の setLocale/setMessage 時に遅延生成。
   *
   * i18n: 按实例的区域设置覆盖注册表(全局 localeRegistry 的 child)。由 locale/messages 选项,或首次 setLocale/setMessage 时延迟创建。
   */
  private _locales: LocaleRegistry | null = null;
  private _sfMgr!: SortFilterManager<T>;
  private _rowMgr!: RowManager<T>;
  private _editMgr!: CellEditManager<T>;
  private _trigMgr = new TriggerManager();
  private _destroyed = false;
  /**
   * R5(§3.1 C4): 렌더 루프 컨트롤러. `_mount` 에서 renderer/vs 배선 초입에 생성.
   *
   * R5 (§3.1 C4): the render-loop controller; created in `_mount` at the start of the renderer/vs wiring.
   *
   * R5(§3.1 C4): レンダーループのコントローラ。`_mount` で renderer/vs 配線の冒頭に生成。
   *
   * R5(§3.1 C4): 渲染循环的控制器。在 `_mount` 中于 renderer/vs 配线的开头生成。
   */
  private _render!: RenderController<T>;
  /**
   * R6(§3.1 C5): 데이터 변경 서비스(setData/insert/push/delete/writeCell/writeCells + batch + commit).
   *
   * R6 (§3.1 C5): the data mutation service (setData/insert/push/delete/writeCell/writeCells + batch + commit).
   *
   * R6(§3.1 C5): データ変更サービス(setData/insert/push/delete/writeCell/writeCells + batch + commit)。
   *
   * R6(§3.1 C5): 数据变更服务(setData/insert/push/delete/writeCell/writeCells + batch + commit)。
   */
  private _mutation!: MutationService<T>;
  /**
   * R7(§3.1 C9): F3 수식 컨트롤러(accessor 조립·recalc flush·에러 표현 + 공개 수식 API).
   *
   * R7 (§3.1 C9): the F3 formula controller (accessor assembly, recalc flush, error surfacing + the public formula API).
   *
   * R7(§3.1 C9): F3 数式コントローラ(accessor の組み立て・recalc の flush・エラー表現 + 公開数式 API)。
   *
   * R7(§3.1 C9): F3 公式控制器(accessor 的组装、recalc 的 flush、错误呈现 + 公开公式 API)。
   */
  private _formula!: FormulaController<T>;
  /**
   * R7(§3.1 C8): 크로스그리드 컨트롤러(moveRowsTo/매핑/3단계 드롭 발화).
   *
   * R7 (§3.1 C8): the cross-grid controller (moveRowsTo / mapping / three-phase drop emission).
   *
   * R7(§3.1 C8): クロスグリッドのコントローラ(moveRowsTo/マッピング/3 段階ドロップの発火)。
   *
   * R7(§3.1 C8): 跨表格控制器(moveRowsTo/映射/3 阶段拖放的触发)。
   */
  private _cross!: CrossGridController<T>;
  private _colWidths: number[] = [];
  /**
   * 사용자가 헤더 드래그로 직접 조절한 컬럼 폭 (field 기준). _recalcWidths 가 덮어쓰지 않도록 보존
   *
   * Column widths the user adjusted by dragging the header (keyed by field); preserved so that _recalcWidths does not overwrite them.
   *
   * ユーザーがヘッダーのドラッグで直接調整した列幅(field 基準)。_recalcWidths が上書きしないよう保存します。
   *
   * 用户通过拖动表头直接调整的列宽(以 field 为准)。为防止 _recalcWidths 覆盖而保留。
   */
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
  /**
   * F1: 범위 선택 + 채우기 핸들 배선 관리자(11_design_F1_v2.md).
   *
   * F1: the manager wiring range selection + the fill handle (11_design_F1_v2.md).
   *
   * F1: 範囲選択 + 塗りつぶしハンドルの配線マネージャ(11_design_F1_v2.md)。
   *
   * F1: 范围选择 + 填充手柄的配线管理器(11_design_F1_v2.md)。
   */
  private _rangeMgr!: RangeSelectionManager<T>;
  /**
   * F2: 마스터/디테일 배선(11_design_F2_v2.md). 헤드리스 코어(core/detail/*)를 소비.
   *
   * F2: master/detail wiring (11_design_F2_v2.md); consumes the headless core (core/detail/*).
   *
   * F2: マスター/ディテールの配線(11_design_F2_v2.md)。ヘッドレスコア(core/detail/*)を利用。
   *
   * F2: 主从明细的配线(11_design_F2_v2.md)。使用无头核心(core/detail/*)。
   */
  private _detailMgr!: DetailManager<T>;
  /**
   * F4: 그리드 데이터 통합 차트 오케스트레이터(11_design_F4_v2.md). 헤드리스 chart/* 소비.
   *
   * F4: the grid-data integrated chart orchestrator (11_design_F4_v2.md); consumes the headless chart/*.
   *
   * F4: グリッドデータ統合チャートのオーケストレータ(11_design_F4_v2.md)。ヘッドレスな chart/* を利用。
   *
   * F4: 表格数据集成图表的编排器(11_design_F4_v2.md)。使用无头的 chart/*。
   */
  private _chartMgr!: ChartManager;
  /**
   * Phase 0(C0.3): flat/visual index ↔ data 리졸버. 어떤 기능도 켜지지 않아도 항상 존재.
   *
   * Phase 0 (C0.3): the flat/visual index ↔ data resolver; always present even when no feature is enabled.
   *
   * Phase 0(C0.3): flat/visual index ↔ data のリゾルバ。どの機能も有効でなくても常に存在します。
   *
   * Phase 0(C0.3): flat/visual index ↔ data 的解析器。即使未启用任何功能也始终存在。
   */
  private _flatModel!: FlatRowModel;
  /**
   * F3: 셀 수식 헤드리스 오케스트레이터(core/formula/* 소비, 재구현 아님). 항상 존재(헤드리스라 유휴 비용 0).
   *
   * F3: the headless cell-formula orchestrator (consumes core/formula/*, not a re-implementation); always present (headless, so zero idle cost).
   *
   * F3: セル数式のヘッドレスオーケストレータ(core/formula/* を利用し、再実装ではありません)。常に存在します(ヘッドレスなのでアイドルコストは 0)。
   *
   * F3: 单元格公式的无头编排器(使用 core/formula/*,并非重新实现)。始终存在(无头,空闲成本为 0)。
   */
  private _recalc!: RecalcCoordinator;
  /**
   * F3(C2): writeCell 단건 쓰기가 쌓아두는 dirty seed. endBatch/즉시 flush 시 onValuesChanged 1회로 소비.
   *
   * F3 (C2): dirty seeds accumulated by single writeCell writes; consumed by one onValuesChanged at endBatch/immediate flush.
   *
   * F3(C2): writeCell の単件書き込みが積み上げる dirty seed。endBatch/即時 flush の際に onValuesChanged 1 回で消費します。
   *
   * F3(C2): writeCell 的单件写入所积累的 dirty seed。endBatch/即时 flush 时以 1 次 onValuesChanged 消费。
   */
  private _formulaDirtySeeds: Set<string> = new Set();

  // ── DD-05 S2c-1(CF): 조건부서식 배선 상태(opt-in, 첫 setConditionalFormat 때 지연 조립) ──
  /**
   * CF 엔진(동적 import 로 조립). 미설정=null → applyCF 콜백 즉시 return(byte-identical).
   *
   * CF engine (lazily assembled).
   *
   * CF エンジン(動的 import で組み立て)。未設定=null → applyCF コールバックは即座に return(byte-identical)。
   *
   * CF 引擎(以动态 import 组装)。未设置=null → applyCF 回调立即 return(byte-identical)。
   */
  private _cf: CFEngine | null = null;
  /**
   * 컬럼별 통계 캐시(per-render 재계산 금지 — setConditionalFormat/데이터변경 시에만 갱신).
   *
   * Per-column stats cache.
   *
   * 列ごとの統計キャッシュ(レンダーごとの再計算は禁止 — setConditionalFormat/データ変更時のみ更新)。
   *
   * 按列的统计缓存(禁止每次渲染重算 — 仅在 setConditionalFormat/数据变更时更新)。
   */
  private _cfStats: Map<string, ColumnStats> = new Map();
  /**
   * 현재 적용된 CF 규칙(데이터 변경 시 통계 재계산에 재사용).
   *
   * Currently applied CF rules.
   *
   * 現在適用されている CF ルール(データ変更時の統計再計算に再利用)。
   *
   * 当前已应用的 CF 规则(数据变更时的统计重算中复用)。
   */
  private _cfRules: CFRule[] = [];
  /**
   * CF 색 시드 읽기 포트(동적 import 후 보관 — cf/ 정적 참조 회피로 별 청크 유지).
   *
   * CF appearance read port.
   *
   * CF の色シード読み取りポート(動的 import 後に保持 — cf/ の静的参照を避けて別チャンクを維持)。
   *
   * CF 的颜色种子读取端口(动态 import 后保留 — 避开对 cf/ 的静态引用以维持独立分块)。
   */
  private _cfAppearance: AppearanceView | null = null;
  /**
   * CF 통계 계산기(cf/ 동적 청크에서 보관 — 동기 재계산용, cf/ 정적 참조 회피).
   *
   * CF stats computer captured from the dynamic chunk.
   *
   * CF の統計計算機(cf/ の動的チャンクから保持 — 同期再計算用、cf/ の静的参照を回避)。
   *
   * CF 的统计计算器(从 cf/ 的动态分块中保留 — 用于同步重算,避开对 cf/ 的静态引用)。
   */
  private _cfComputeStats: ((values: readonly unknown[]) => ColumnStats) | null = null;

  // ── DD-07(RT): 실시간 배선 상태(opt-in, 첫 setRealtimeSource 때 지연 조립) ──
  /**
   * RT 컨트롤러(동적 import 로 조립). 미설정=null → 실시간 미배선(byte-identical).
   *
   * Realtime controller (lazily assembled).
   *
   * RT コントローラ(動的 import で組み立て)。未設定=null → リアルタイムは未配線(byte-identical)。
   *
   * RT 控制器(以动态 import 组装)。未设置=null → 实时未配线(byte-identical)。
   */
  private _rt: RealtimeController<T> | null = null;

  // ── Phase 0(C2.1): 배치 쓰기 상태(_batchDepth/_batchDirty)는 R6 에서 MutationService 로 이관 ──

  // grid.override() 확장 커널 (생성자 말미에 초기화)
  private _ovk!: OverrideKernel;
  /**
   * 이 인스턴스의 공개 메서드 동작을 코어를 고치지 않고 감싸 바꾸는 진입점. 호출하면 원본 메서드를 감싸는
   * 레이어를 얹고(`grid.override(name, (orig, ...args) => ...)`), `.strategy(slot, fn)` 으로는 코어가
   * 미리 열어 둔 확장 슬롯(예: 표시 텍스트 포맷터)에 함수를 꽂는다. 특정 그리드의 표시·계산·검증 로직만
   * 살짝 바꾸고 싶을 때 상속·포크 없이 쓰는 훅. destroy 시 모든 레이어가 자동 복구된다.
   *
   * Entry point to wrap and change this instance's public-method behavior without editing the core.
   * Calling it layers a wrapper over the original (`grid.override(name, (orig, ...args) => ...)`);
   * `.strategy(slot, fn)` plugs a function into a slot the core opened in advance (e.g. the display
   * formatter). Use it as a hook when you want to tweak one grid's display/compute/validation logic
   * without subclassing or forking. All layers are restored automatically on destroy.
   *
   * このインスタンスの公開メソッドの動作を、コアを修正せずにラップして変える入口です。呼び出すと元のメソッドを包む
   * レイヤーを重ね(`grid.override(name, (orig, ...args) => ...)`)、`.strategy(slot, fn)` ではコアがあらかじめ
   * 開いておいた拡張スロット(例: 表示テキストのフォーマッタ)に関数を差し込みます。特定のグリッドの表示・計算・検証
   * ロジックだけを少し変えたいときに、継承やフォークなしで使うフックです。destroy 時にすべてのレイヤーが自動的に
   * 復元されます。
   *
   * 把这个实例的公开方法行为包起来、无需修改核心即可改变的入口。调用后会在原方法之上叠加一层包装
   * (`grid.override(name, (orig, ...args) => ...)`),`.strategy(slot, fn)` 则把函数插入核心事先开放的
   * 扩展槽(例如显示文本的格式化器)。想只稍微改动某个表格的显示、计算、校验逻辑时,可以不用继承或 fork 而使用的
   * 钩子。destroy 时所有层都会自动恢复。
   *
   * @example
   * grid.override('getDisplayValue', (orig, ri, field) => orig(ri, field).toUpperCase());
   * grid.override.strategy('displayFormatter', (v) => v == null ? '-' : String(v));
   */
  override!: OverrideApi<T>;
  /**
   * R11(§3.1 C7): 커널 위 타입드 확장점 레지스트리. _mount 초입에 생성(커널 준비 후).
   *
   * R11 (§3.1 C7): the typed extension-point registry on top of the kernel; created at the start of _mount (after the kernel is ready).
   *
   * R11(§3.1 C7): カーネル上の型付き拡張点レジストリ。_mount の冒頭で生成(カーネル準備後)。
   *
   * R11(§3.1 C7): 内核之上的类型化扩展点注册表。在 _mount 的开头生成(内核准备完成后)。
   */
  private _extensions!: ExtensionPointRegistry<T>;
  /**
   * 확장점 레지스트리 정면 — 렌더훅 등록, strategy/override 타입드 카탈로그, 커밋 전후 훅(MutationHook)을
   * 한곳에서 발견·등록한다. 코어를 고치지 않고 셀 클래스·aria 라벨·표시 텍스트 같은 렌더 파이프라인 지점에
   * 끼어들고 싶을 때 진입점으로 쓴다. 반환값으로 훅을 등록하면 다음 렌더부터 반영된다.
   *
   * Facade for the extension-point registry — discover and register render hooks, the typed
   * strategy/override catalog, and before/after commit hooks (MutationHook) in one place. Use it as
   * the entry point when you want to hook into the render pipeline (cell class, aria label, display
   * text) without editing the core; hooks you register apply from the next render on.
   *
   * 拡張点レジストリのファサード — レンダーフックの登録、strategy/override の型付きカタログ、コミット前後のフック
   * (MutationHook)を一箇所で発見・登録します。コアを修正せずに、セルクラス・aria ラベル・表示テキストといった
   * レンダーパイプラインの地点に割り込みたいときの入口として使います。戻り値でフックを登録すると、次のレンダーから
   * 反映されます。
   *
   * 扩展点注册表的门面 — 在一处发现并注册渲染钩子、strategy/override 的类型化目录、提交前后的钩子
   * (MutationHook)。想在不修改核心的前提下,介入单元格类名、aria 标签、显示文本这类渲染管线的地点时,
   * 用它作为入口。用返回值注册钩子后,从下一次渲染开始生效。
   *
   * @returns 확장점 레지스트리
   *
   * The extension-point registry
   *
   * 拡張点レジストリ
   *
   * 扩展点注册表
   */
  // R11(§3.1 C7): 커널 위 타입드 확장점 레지스트리 정면(렌더훅·strategy/override 카탈로그·MutationHook·catalog).
  get extensions(): ExtensionPointRegistry<T> { return this._extensions; }

  // ── grid.override() 정적 전역 레지스트리 / static global override registry ──────────────────
  /**
   * 정적 전역 override 레이어 (모든 신규 인스턴스에 생성자 말미 적용).
   *
   * Static global override layers (applied at the end of the constructor to every new instance).
   *
   * 静的グローバルな override レイヤー(すべての新規インスタンスにコンストラクタ末尾で適用)。
   *
   * 静态全局的 override 层(在构造函数末尾应用到所有新实例)。
   */
  private static _defaultOverrides: Array<[string, OverrideLayer, OverrideCallOptions]> = [];
  /**
   * 정적 전역 strategy 슬롯.
   *
   * Static global strategy slots.
   *
   * 静的グローバルな strategy スロット。
   *
   * 静态全局的 strategy 槽。
   */
  private static _defaultStrategies: Array<[string, Function]> = [];

  /**
   * 정적: 모든 신규 그리드에 적용될 override 레이어 등록.
   *
   * Static: register an override layer applied to every newly created grid.
   *
   * 静的: すべての新規グリッドに適用される override レイヤーを登録。
   *
   * 静态: 注册应用到所有新建表格的 override 层。
   *
   * @param name - 대상 공개 메서드 이름
   *
   * Target public method name
   *
   * 対象となる公開メソッド名
   *
   * 目标公开方法名
   *
   * @param fn - override 레이어 함수(첫 인자 orig)
   *
   * Override layer function (first arg = orig)
   *
   * override レイヤー関数(第 1 引数が orig)
   *
   * override 层函数(第 1 个参数为 orig)
   *
   * @param opts - 재진입/에러 정책
   *
   * Reentrancy & error policy
   *
   * 再入/エラーのポリシー
   *
   * 重入/错误的策略
   *
   * @returns 체이닝용 OpenGrid 클래스
   *
   * The OpenGrid class for chaining
   *
   * チェーン用の OpenGrid クラス
   *
   * 用于链式调用的 OpenGrid 类
   *
   * @example
   * OpenGrid.defaultOverride('getDisplayValue', (orig, ri, field) => orig(ri, field).toUpperCase());
   */
  static defaultOverride(name: string, fn: OverrideLayer, opts: OverrideCallOptions = {}): typeof OpenGrid {
    OpenGrid._defaultOverrides.push([name, fn, opts]);
    return OpenGrid;
  }

  /**
   * 정적 전역 defaults 네임스페이스 (strategy 슬롯).
   *
   * Static global defaults namespace (strategy slots).
   *
   * 静的グローバルな defaults 名前空間(strategy スロット)。
   *
   * 静态全局的 defaults 命名空间(strategy 槽)。
   */
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
   *
   * Register a custom cell renderer type without editing the core. When `col.type`/`col.renderer`
   * (string or `{type}`) matches `typeName`, the registered factory creates the renderer.
   * Process-global (shared by all grid instances).
   *
   * カスタムセルレンダラーの型を、コアを修正せずに登録します。`col.type`/`col.renderer`(文字列または `{type}`)が
   * `typeName` と一致すると、登録したファクトリがレンダラーを生成します。プロセスグローバル(すべてのグリッド
   * インスタンスで共有)。
   *
   * 注册自定义单元格渲染器的类型,无需修改核心。`col.type`/`col.renderer`(字符串或 `{type}`)与
   * `typeName` 一致时,注册的工厂会生成渲染器。进程全局(所有表格实例共享)。
   *
   * @param typeName - 렌더러 타입 이름
   *
   * Renderer type name
   *
   * レンダラーの型名
   *
   * 渲染器的类型名
   *
   * @param factory - 렌더러 팩토리
   *
   * Renderer factory
   *
   * レンダラーのファクトリ
   *
   * 渲染器的工厂
   *
   * @returns 체이닝용 OpenGrid 클래스
   *
   * The OpenGrid class for chaining
   *
   * チェーン用の OpenGrid クラス
   *
   * 用于链式调用的 OpenGrid 类
   *
   * @example
   * OpenGrid.registerRenderer('stars', () => ({ render: (ctx) => '★'.repeat(ctx.value) }));
   */
  static registerRenderer(typeName: string, factory: RendererFactory): typeof OpenGrid {
    registerRenderer(typeName, factory);
    return OpenGrid;
  }

  /**
   * 커스텀 셀 에디터 타입을 코어 편집 없이 등록한다. 셀을 편집 상태로 열 때 `col.editor` 가 `typeName`
   * 과 일치하면 등록한 팩토리가 에디터를 만든다. 기본 제공 에디터(text/number/date 등)로 부족한 입력 UI가
   * 필요할 때 쓴다. 프로세스 전역이라 한 번 등록하면 모든 그리드 인스턴스가 공유한다.
   *
   * Register a custom cell editor type without editing the core. When a cell opens for editing and
   * `col.editor` matches `typeName`, the registered factory creates the editor. Use it when the
   * built-in editors (text/number/date, …) are not enough. Process-global (shared by all instances).
   *
   * カスタムセルエディタの型を、コアを修正せずに登録します。セルを編集状態で開くとき `col.editor` が `typeName`
   * と一致すると、登録したファクトリがエディタを生成します。標準提供のエディタ(text/number/date など)では足りない
   * 入力 UI が必要なときに使います。プロセスグローバルなので、一度登録すればすべてのグリッドインスタンスで共有されます。
   *
   * 注册自定义单元格编辑器的类型,无需修改核心。打开单元格进入编辑状态时,若 `col.editor` 与 `typeName`
   * 一致,注册的工厂会创建编辑器。内置编辑器(text/number/date 等)不够用时使用。进程全局,注册一次后所有
   * 表格实例共享。
   *
   * @param typeName - 에디터 타입 이름
   *
   * Editor type name
   *
   * エディタの型名
   *
   * 编辑器的类型名
   *
   * @param factory - 에디터 팩토리
   *
   * Editor factory
   *
   * エディタのファクトリ
   *
   * 编辑器的工厂
   *
   * @returns 체이닝용 OpenGrid 클래스
   *
   * The OpenGrid class for chaining
   *
   * チェーン用の OpenGrid クラス
   *
   * 用于链式调用的 OpenGrid 类
   *
   * @example
   * OpenGrid.registerEditor('slider', () => {
   *   let input: HTMLInputElement;
   *   return {
   *     mount(container, ctx, onCommit) {
   *       input = document.createElement('input');
   *       input.type = 'range';
   *       input.value = String(ctx.value ?? 0);
   *       input.addEventListener('change', () => onCommit(Number(input.value)));
   *       container.appendChild(input);
   *     },
   *     getValue: () => Number(input.value),
   *     focus: () => input.focus(),
   *     destroy: () => input.remove(),
   *   };
   * });
   */
  static registerEditor(typeName: string, factory: EditorFactory): typeof OpenGrid {
    registerEditor(typeName, factory);
    return OpenGrid;
  }

  /**
   * 커스텀 스킨(형태·외곽선·모서리 같은 FORM 축)을 코어 편집 없이 전역 등록한다. 색 테마와는 별개로
   * 그리드의 "생김새"만 바꾸고 싶을 때 쓴다 — 한 번 등록하면 어떤 인스턴스든 `grid.setSkin(name)` 으로
   * 골라 쓴다. 내부 동작: 델타를 FORM 전용으로 검증(색 리터럴이 섞이면 색⊥형태 직교성을 깨므로 **throw**)하고
   * 포커스 링 접근성 가드레일을 적용한 뒤, 런타임 `<style>` 로 `.og-container[data-og-skin="name"]` 블록을 주입한다.
   *
   * Register a custom skin (the FORM axis — shape/border/radius) globally without editing the core.
   * Use it when you want to restyle only the grid's "look" independently of the color theme; once
   * registered, any instance can pick it via `grid.setSkin(name)`. It validates the delta as
   * FORM-only (**throws** if a color literal is present, to keep color⊥form orthogonal), applies the
   * focus-ring accessibility guardrail, then injects a runtime `<style>` block for
   * `.og-container[data-og-skin="name"]`.
   *
   * カスタムスキン(形状・輪郭線・角丸といった FORM 軸)を、コアを修正せずにグローバル登録します。カラーテーマとは
   * 別に、グリッドの「見た目」だけを変えたいときに使います — 一度登録すれば、どのインスタンスでも
   * `grid.setSkin(name)` で選んで使えます。内部動作: デルタを FORM 専用として検証し(色リテラルが混ざると
   * 色⊥形状の直交性が崩れるため **throw**)、フォーカスリングのアクセシビリティガードレールを適用したうえで、
   * ランタイムの `<style>` で `.og-container[data-og-skin="name"]` ブロックを注入します。
   *
   * 把自定义皮肤(形状、轮廓线、圆角这类 FORM 轴)在不修改核心的前提下全局注册。想与颜色主题分开、只改表格的
   * 「外观」时使用 — 一旦注册,任何实例都能用 `grid.setSkin(name)` 选用。内部动作: 把 delta 作为 FORM 专用
   * 校验(混入颜色字面量会破坏色⊥形的正交性,故 **throw**),应用焦点环的无障碍护栏,再以运行时 `<style>` 注入
   * `.og-container[data-og-skin="name"]` 块。
   *
   * @param name - 스킨 id
   *
   * Skin id
   *
   * スキン id
   *
   * 皮肤 id
   *
   * @param delta - FORM 전용 토큰 델타(색값 넣으면 throw)
   *
   * FORM-only token delta (throws on color values)
   *
   * FORM 専用のトークンデルタ(色値を入れると throw)
   *
   * FORM 专用的 token delta(放入颜色值则 throw)
   *
   * @returns 체이닝용 OpenGrid 클래스
   *
   * The OpenGrid class for chaining
   *
   * チェーン用の OpenGrid クラス
   *
   * 用于链式调用的 OpenGrid 类
   *
   * @example
   * // Adjusts only form tokens, never color.
   * OpenGrid.defineSkin('round', { '--og-radius-md': '14px' });
   * grid.setSkin('round');
   */
  // R12b(item3 §6.2): defaultOverride 와 동형의 프로세스 전역 스킨 등록 정책. HANMS §1.3 접근성 가드레일(포커스 <2px/none 클램프) 포함.
  static defineSkin(name: string, delta: SkinTokenDelta): typeof OpenGrid {
    skinRegistry.define(name, delta);
    return OpenGrid;
  }

  /**
   * 시맨틱 아이콘 role 세트(정렬 화살표·행 삭제 아이콘 등)를 코어 편집 없이 **전역** 교체한다. 기본
   * 아이콘 대신 자사 아이콘 팩을 쓰고 싶을 때 role → 아이콘을 통째로 매핑한다 — 이후 모든 인스턴스의
   * 아이콘 해석에 반영된다. 값은 알려진 아이콘 key 이거나 원시 SVG 본문 마크업. 한 인스턴스만 바꾸려면
   * `grid.setIcon(role, svg)` 를 쓴다.
   *
   * Register/replace semantic icon role sets (sort arrows, row-delete icon, …) **globally** without
   * editing the core — map role → icon in one shot to swap in your own icon pack; it then affects icon
   * resolution across all instances. Values are known icon keys or raw SVG body markup. To change a
   * single instance only, use `grid.setIcon(role, svg)`.
   *
   * セマンティックなアイコン role のセット(ソート矢印・行削除アイコンなど)を、コアを修正せずに **グローバル** に
   * 差し替えます。標準アイコンの代わりに自社のアイコンパックを使いたいとき、role → アイコンをまとめてマッピング
   * します — 以降、すべてのインスタンスのアイコン解決に反映されます。値は既知のアイコン key、または生の SVG 本体
   * マークアップです。1 つのインスタンスだけを変えるには `grid.setIcon(role, svg)` を使います。
   *
   * 把语义图标 role 集合(排序箭头、行删除图标等)在不修改核心的前提下 **全局** 替换。想用自家图标包代替
   * 默认图标时,把 role → 图标整体映射 — 此后所有实例的图标解析都会反映。值为已知的图标 key,或原始 SVG
   * 主体标记。只想改一个实例时,使用 `grid.setIcon(role, svg)`。
   *
   * @param map - role → 아이콘 key 또는 원시 SVG
   *
   * role → icon key or raw SVG
   *
   * role → アイコン key または生の SVG
   *
   * role → 图标 key 或原始 SVG
   *
   * @returns 체이닝용 OpenGrid 클래스
   *
   * The OpenGrid class for chaining
   *
   * チェーン用の OpenGrid クラス
   *
   * 用于链式调用的 OpenGrid 类
   *
   * @example
   * OpenGrid.defineIconSet({ 'sort.asc': 'arrow-up', 'sort.desc': 'arrow-down' });
   */
  // R12c(item3 §5.1, 계약 C13): defineSkin/registerRenderer 와 동형의 프로세스 전역 아이콘 등록 정책(값=BOOTSTRAP_ICONS key 또는 원시 SVG).
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
   * i18n: register/replace a UI-string locale **globally** without editing the core (thin
   * delegation façade isomorphic to defineSkin/defineIconSet — the canonical entry is
   * `localeRegistry.register`). Partial catalogs are allowed (ko fills the gaps via fallback).
   * Any instance can then call `grid.setLocale(id)`. For per-instance overrides see `grid.setMessage`.
   *
   * i18n: UI 文字列のロケールを、コアを修正せずに **グローバル** に登録/差し替えします(defineSkin/defineIconSet と
   * 同型の薄い委譲ファサード — 正本は `localeRegistry.register`)。部分カタログを許容します(不足分はフォールバックで
   * ko が埋めます)。以降、すべてのインスタンスが `grid.setLocale(id)` で使用できます。インスタンスごとの
   * オーバーライドは `grid.setMessage` を参照してください。
   *
   * i18n: 把 UI 字符串的区域设置在不修改核心的前提下 **全局** 注册/替换(与 defineSkin/defineIconSet 同型的
   * 薄委托门面 — 正本是 `localeRegistry.register`)。允许部分目录(缺失部分由回退的 ko 填补)。此后所有实例
   * 都能用 `grid.setLocale(id)` 使用。按实例的覆盖请参阅 `grid.setMessage`。
   *   例) OpenGrid.defineLocale('ja', { contextMenu: { find: '検索' } })
   *
   * @param id - 로케일 id(예 'ja')
   *
   * Locale id (e.g. 'ja')
   *
   * ロケール id(例 'ja')
   *
   * 区域设置 id(例 'ja')
   *
   * @param messages - 메시지 부분/전체 카탈로그
   *
   * Partial or full message catalog
   *
   * メッセージの部分/全体カタログ
   *
   * 消息的部分/全体目录
   *
   * @param opts - `extends`: ko 이전에 시도할 폴백 로케일
   *
   * `extends`: fallback locale tried before ko
   *
   * `extends`: ko より前に試すフォールバックロケール
   *
   * `extends`: 比 ko 更先尝试的回退区域设置
   *
   * @returns 체이닝용 OpenGrid 클래스
   *
   * The OpenGrid class for chaining
   *
   * チェーン用の OpenGrid クラス
   *
   * 用于链式调用的 OpenGrid 类
   */
  static defineLocale(id: string, messages: PartialLocaleMessages, opts?: { extends?: string }): typeof OpenGrid {
    localeRegistry.register(id, messages, opts);
    return OpenGrid;
  }

  /**
   * 그리드를 생성해 컨테이너에 마운트한다.
   *
   * Create the grid and mount it into the container.
   *
   * グリッドを生成してコンテナにマウントします。
   *
   * 生成表格并挂载到容器。
   *
   * @param container - CSS 셀렉터 또는 호스트 요소
   *
   * CSS selector or host element
   *
   * CSS セレクタまたはホスト要素
   *
   * CSS 选择器或宿主元素
   *
   * @param options - 그리드 옵션(columns 필수)
   *
   * Grid options (columns required)
   *
   * グリッドオプション(columns は必須)
   *
   * 表格选项(columns 必填)
   *
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
  /**
   * 특정 메서드에 얹은 override 하나만 벗겨 원본 동작으로 되돌린다(다른 override 는 유지).
   *
   * Peel off one method's override, restoring its original behavior (others stay).
   *
   * 特定のメソッドに重ねた override を 1 つだけ剥がし、元の動作に戻します(ほかの override は維持)。
   *
   * 只剥掉某个方法上叠加的一层 override,恢复原本动作(其他 override 保持不变)。
   */
  restore(name: string): this { this._ovk.restore(name); return this; }
  /**
   * 얹어 둔 모든 override·strategy 를 한 번에 걷어 낸다. destroy 가 자동으로 호출하므로 보통 직접 부를 일은 없다.
   *
   * Remove every override & strategy at once; destroy calls it automatically, so you rarely need it directly.
   *
   * 重ねてあるすべての override・strategy を一度に取り除きます。destroy が自動的に呼ぶため、通常は直接呼ぶ必要はありません。
   *
   * 把叠加的所有 override、strategy 一次性撤除。destroy 会自动调用,通常无需直接调用。
   */
  restoreAll(): this { this._ovk.restoreAll(); return this; }
  /**
   * 해당 메서드가 지금 override 로 감싸여 있는지 확인한다(조건부로 override 를 얹기 전 점검용).
   *
   * Check whether the method is currently wrapped by an override (handy before layering conditionally).
   *
   * そのメソッドが現在 override で包まれているかを確認します(条件付きで override を重ねる前の点検用)。
   *
   * 确认该方法当前是否被 override 包裹(便于在有条件地叠加 override 之前检查)。
   */
  hasOverride(name: string): boolean { return this._ovk.hasOverride(name); }
  /**
   * 현재 override 가 걸린 메서드 이름들을 돌려준다(무엇을 손댔는지 감사·디버깅용).
   *
   * Names of currently overridden methods — for auditing/debugging what you have touched.
   *
   * 現在 override が掛かっているメソッド名を返します(何に手を入れたかの監査・デバッグ用)。
   *
   * 返回当前被 override 的方法名(用于审计、调试改动了什么)。
   */
  getOverrideNames(): string[] { return this._ovk.getOverrideNames(); }
  /**
   * strategy 슬롯에 꽂힌 함수를 읽는다. 미등록이면 넘긴 fallback 을 그대로 돌려주므로 호출부는 항상 함수를 얻는다.
   *
   * Read the function plugged into a strategy slot; returns your fallback when unset, so callers always get a function.
   *
   * strategy スロットに差し込まれた関数を読み取ります。未登録の場合は渡した fallback をそのまま返すため、呼び出し側は常に関数を得られます。
   *
   * 读取插入 strategy 槽的函数。未注册时原样返回传入的 fallback,因此调用方总能得到一个函数。
   */
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
   * 컨텍스트 메뉴를 지정 좌표에 연다.
   *
   * Open the context menu at the event position.
   *
   * コンテキストメニューを指定座標に開きます。
   *
   * 在指定坐标打开上下文菜单。
   *
   * @param e - 좌표를 제공할 마우스 이벤트
   *
   * Mouse event providing coordinates
   *
   * 座標を提供するマウスイベント
   *
   * 提供坐标的鼠标事件
   *
   * @param items - 커스텀 메뉴 항목(생략 시 기본 메뉴)
   *
   * Custom items (default menu when omitted)
   *
   * カスタムメニュー項目(省略時は既定メニュー)
   *
   * 自定义菜单项(省略时为默认菜单)
   */
  openContextMenu(e: MouseEvent, items?: import('./types').ContextMenuItem[]): void {
    this._ctxMenu?.open(e, items);
  }
  /**
   * 컨텍스트 메뉴를 닫는다.
   *
   * Close the context menu.
   *
   * コンテキストメニューを閉じます。
   *
   * 关闭上下文菜单。
   */
  closeContextMenu(): void {
    this._ctxMenu?.close();
  }
  /**
   * 상위 선택이 하위 선택지를 좁히는 연동(캐스케이딩) 필터 셀렉트 패널을 붙이거나 뗀다. 예를 들어 "국가 →
   * 도시"처럼 앞 컬럼 값에 따라 뒷 컬럼 후보가 달라지는 상단 필터 UI가 필요할 때 config 로 설정하고,
   * `null` 을 넘기면 패널을 제거한다.
   *
   * Attach or detach a cascading filter-select panel where each choice narrows the next (e.g.
   * "country → city", so a later column's options depend on the earlier value). Pass a config to set
   * it up, or `null` to remove the panel.
   *
   * 上位の選択が下位の選択肢を絞り込む連動(カスケーディング)フィルターセレクトパネルを取り付け、または取り外します。
   * たとえば「国 → 都市」のように、前の列の値によって後ろの列の候補が変わる上部フィルター UI が必要なときに config で
   * 設定し、`null` を渡すとパネルを削除します。
   *
   * 装上或卸下上位选择收窄下位选项的联动(级联)筛选选择面板。例如需要「国家 → 城市」这类、后一列的候选
   * 随前一列的值而变化的顶部筛选 UI 时,用 config 设置;传入 `null` 则移除面板。
   *
   * @param config - 패널 구성 또는 제거용 null
   *
   * Panel config, or null to remove
   *
   * パネル構成、または削除用の null
   *
   * 面板配置,或用于移除的 null
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
   * 생성 후에 그리드 옵션 일부만 바꿔 끼운다. 그리드를 다시 만들지 않고 컨텍스트 메뉴 구성이나 그룹핑
   * 기준 같은 설정을 바꾸고 싶을 때 쓴다 — 넘긴 옵션만 덮어쓴 뒤, 영향받는 부분(contextMenu 재초기화·
   * groupBy 재구성 등)만 골라 갱신하고 다시 그린다.
   *
   * Swap in part of the grid options after construction. Use it to change settings like the context
   * menu or grouping keys without recreating the grid — only the passed options are overwritten, then
   * just the affected parts (re-init contextMenu, rebuild groupBy, …) are refreshed and re-rendered.
   *
   * 生成後にグリッドオプションの一部だけを差し替えます。グリッドを作り直さずに、コンテキストメニューの構成や
   * グループ化の基準といった設定を変えたいときに使います — 渡したオプションだけを上書きしたあと、影響を受ける部分
   * (contextMenu の再初期化・groupBy の再構成など)だけを選んで更新し、描画し直します。
   *
   * 生成后只替换表格选项的一部分。想在不重建表格的情况下,改动上下文菜单的构成或分组基准这类设置时使用 —
   * 只覆盖传入的选项,然后仅挑出受影响的部分(contextMenu 的重新初始化、groupBy 的重新构建等)更新并重新绘制。
   *
   * @param opts - 갱신할 옵션 부분집합
   *
   * Subset of options to update
   *
   * 更新するオプションの部分集合
   *
   * 要更新的选项子集
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
   * 컬럼 마스킹 ON/OFF 전환.
   * enabled=true  → 마스킹 적용 (기본 상태)
   * enabled=false → 컬럼 전체 마스킹 해제 (원문 표시)
   *
   * Toggle column masking on/off.
   * enabled=true  → apply masking (default state)
   * enabled=false → reveal the whole column (show raw values)
   *
   * 列マスキングの ON/OFF 切り替え。
   * enabled=true  → マスキングを適用(既定の状態)
   * enabled=false → 列全体のマスキングを解除(原文を表示)
   *
   * 列掩码的 ON/OFF 切换。
   * enabled=true  → 应用掩码(默认状态)
   * enabled=false → 解除整列的掩码(显示原文)
   *
   * @param field - 대상 컬럼 field
   *
   * Target column field
   *
   * 対象となる列の field
   *
   * 目标列的 field
   *
   * @param enabled - 마스킹 활성 여부
   *
   * Whether masking is active
   *
   * マスキングを有効にするかどうか
   *
   * 是否启用掩码
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

  /**
   * 현재 컬럼 마스킹 활성 여부 반환. true=마스킹 중, false=해제됨
   *
   * Return whether masking is active for the column (true = masked, false = revealed).
   *
   * 現在の列マスキングが有効かどうかを返します。true=マスキング中、false=解除済み。
   *
   * 返回当前列的掩码是否启用。true=掩码中,false=已解除。
   */
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
   * 워크시트(탭)를 추가한다.
   *
   * Add a worksheet (tab).
   *
   * ワークシート(タブ)を追加します。
   *
   * 添加工作表(标签页)。
   *
   * @param name - 시트 이름
   *
   * Sheet name
   *
   * シート名
   *
   * 工作表名
   *
   * @param columns - 시트 전용 컬럼(생략 시 그리드 columns)
   *
   * Sheet columns (grid columns when omitted)
   *
   * シート専用の列(省略時はグリッドの columns)
   *
   * 工作表专用的列(省略时为表格的 columns)
   *
   * @param data - 시트 데이터
   *
   * Sheet data
   *
   * シートのデータ
   *
   * 工作表的数据
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

  /**
   * 워크시트를 제거한다.
   *
   * Remove a worksheet.
   *
   * ワークシートを削除します。
   *
   * 删除工作表。
   */
  removeWorksheet(name: string): void {
    this._wsManager?.remove(name);
  }

  /**
   * 지정 워크시트로 전환한다.
   *
   * Switch to the given worksheet.
   *
   * 指定したワークシートに切り替えます。
   *
   * 切换到指定的工作表。
   */
  switchWorksheet(name: string): void {
    this._wsManager?.switch(name);
  }

  /**
   * 워크시트 이름을 변경한다.
   *
   * Rename a worksheet.
   *
   * ワークシート名を変更します。
   *
   * 修改工作表名。
   */
  renameWorksheet(oldName: string, newName: string): void {
    this._wsManager?.rename(oldName, newName);
  }

  /**
   * 워크시트 상태 스냅샷 조회(없으면 undefined).
   *
   * Get a worksheet state snapshot (undefined when absent).
   *
   * ワークシート状態のスナップショットを取得(存在しない場合は undefined)。
   *
   * 获取工作表状态的快照(不存在时为 undefined)。
   */
  getWorksheet(name: string): import('./types').WorksheetState<T> | undefined {
    return this._wsManager?.get(name);
  }

  /**
   * 워크시트 이름 목록.
   *
   * List of worksheet names.
   *
   * ワークシート名の一覧。
   *
   * 工作表名的列表。
   */
  getWorksheetNames(): string[] {
    return this._wsManager?.getNames() ?? [];
  }

  /**
   * 모든 워크시트를 다중 시트 엑셀로 내보낸다.
   *
   * Export all worksheets as a multi-sheet Excel file.
   *
   * すべてのワークシートを複数シートの Excel として書き出します。
   *
   * 把所有工作表导出为多工作表的 Excel。
   */
  exportSheetsExcel(filename?: string): void { this._exportMgr.exportSheetsExcel(filename); }

  // R5(§3.1 C4): 렌더 루프는 RenderController 로 이관. 아래는 동일 시그니처의 얇은 위임 —
  // 다수 내부 호출부(및 테스트의 `(grid as any)._doRender` 몽키패치)를 그대로 유지하기 위함.
  private _onResize(): void { this._render.onResize(); }
  private _recalcWidths(totalWidth: number): void { this._render.recalcWidths(totalWidth); }
  // 헤더(컬럼 제목 행)를 다시 그린다
  private _renderHeader(): void { this._render.renderHeader(); }
  private _syncHeaderLayout(): void { this._render.syncHeaderLayout(); }
  private _doRender(startIndex: number, endIndex: number): void { this._render.doRender(startIndex, endIndex); }

  /**
   * F2(§4.5/§6.1): masterDetail.enabled 아니면 undefined(GridRenderer 는 기존 경로 그대로).
   *
   * F2 (§4.5/§6.1): undefined unless masterDetail.enabled (GridRenderer keeps its existing path).
   *
   * F2(§4.5/§6.1): masterDetail.enabled でなければ undefined(GridRenderer は既存の経路のまま)。
   *
   * F2(§4.5/§6.1): 若非 masterDetail.enabled 则为 undefined(GridRenderer 保持既有路径不变)。
   */
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
  /**
   * @internal 드래그/셔틀이 참조하는 바디 엘리먼트 (레지스트리 해석용)
   *
   * Body element referenced by drag/shuttle (registry resolution).
   *
   * ドラッグ/シャトルが参照するボディ要素(レジストリ解決用)。
   *
   * 拖拽/穿梭所引用的 body 元素(用于注册表解析)。
   */
  _crossBodyEl(): HTMLElement { return this._renderer!.bodyWrapper; }
  /**
   * fromIndex 를 잡고 드래그할 때 함께 이동할 행 집합 (다중선택에 포함되면 선택 전체)
   *
   * The set of rows that move together when dragging by fromIndex (the whole selection when fromIndex is part of a multi-selection).
   *
   * fromIndex をつかんでドラッグするときに一緒に移動する行の集合(複数選択に含まれる場合は選択全体)。
   *
   * 抓住 fromIndex 拖拽时一起移动的行集合(若包含在多选中则为整个选择)。
   */
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
   *
   * Move rows from this grid to another grid (shared path for drag and arrow shuttle).
   * Applies the three-phase events (before→after→complete) and crossGridMapping (field mapping).
   *
   * このグリッドの行を別のグリッドへ移動(move)します。ドラッグ・矢印シャトル共通の経路です。
   * 3 段階イベント(before→after→complete)と crossGridMapping(フィールドマッピング)を適用します。
   *
   * 把这个表格的行移动(move)到另一个表格。拖拽与箭头穿梭的公共路径。
   * 应用 3 阶段事件(before→after→complete)与 crossGridMapping(字段映射)。
   *
   * @param target - 대상 그리드
   *
   * Target grid
   *
   * 対象グリッド
   *
   * 目标表格
   *
   * @param sourceIndexes - 이동할 소스 행 인덱스들
   *
   * Source row indexes to move
   *
   * 移動するソース行のインデックス
   *
   * 要移动的源行索引
   *
   * @param targetIndex - 삽입 시작 인덱스(생략 시 끝)
   *
   * Insertion start index (end when omitted)
   *
   * 挿入開始インデックス(省略時は末尾)
   *
   * 插入的起始索引(省略时为末尾)
   *
   * @returns 이동 성공 여부
   *
   * Whether the move succeeded
   *
   * 移動が成功したかどうか
   *
   * 移动是否成功
   */
  moveRowsTo(target: OpenGridInstance<T>, sourceIndexes: number[], targetIndex?: number): Promise<boolean> {
    return this._cross.moveRowsTo(target, sourceIndexes, targetIndex);
  }

  /**
   * 체크된 행을 다른 그리드로 이동 (화살표 셔틀용). 체크 없으면 무시.
   *
   * Move checked rows to another grid (arrow-shuttle use). No-op when nothing is checked.
   *
   * チェックされた行を別のグリッドへ移動(矢印シャトル用)。チェックがなければ何もしません。
   *
   * 把勾选的行移动到另一个表格(用于箭头穿梭)。没有勾选则不做任何事。
   */
  moveCheckedTo(target: OpenGridInstance<T>): Promise<boolean> {
    return this._cross.moveCheckedTo(target);
  }

  /**
   * 행 위치 이동(드롭 경로에서 실행).
   *
   * Move a row to a new position (executed on the drop path).
   *
   * 行の位置を移動(ドロップ経路で実行)。
   *
   * 移动行的位置(在拖放路径中执行)。
   */
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
   * 그리드의 데이터 전체를 새 배열로 갈아끼운다. 서버에서 목록을 새로 받아오는 등 데이터를 통째로 바꿀 때
   * 쓴다. 행 식별자(id)를 새로 발급하므로 기존 행에 걸려 있던 셀 수식 상태는 이때 초기화된다 — 일부만 바꿀
   * 때는 `writeCell`/`insertRow`/`deleteRow` 쪽이 상태를 보존한다.
   *
   * Replace the whole data set with a new array. Use it when the data changes entirely (e.g. a fresh
   * list from the server). It reissues row ids, so any existing cell-formula state is reset here — for
   * partial changes prefer `writeCell`/`insertRow`/`deleteRow`, which preserve state.
   *
   * グリッドのデータ全体を新しい配列に差し替えます。サーバーから一覧を取り直すなど、データをまるごと入れ替えるときに
   * 使います。行識別子(id)を発行し直すため、既存の行に掛かっていたセル数式の状態はこのとき初期化されます — 一部だけを
   * 変えるときは `writeCell`/`insertRow`/`deleteRow` のほうが状態を保持します。
   *
   * 把表格的全部数据换成新数组。从服务器重新取回列表等、要整体替换数据时使用。因为会重新签发行标识符(id),
   * 挂在既有行上的单元格公式状态会在此时初始化 — 只改一部分时,`writeCell`/`insertRow`/`deleteRow`
   * 这一侧会保留状态。
   *
   * @param data - 새 행 배열
   *
   * New array of rows
   *
   * 新しい行の配列
   *
   * 新的行数组
   *
   * @example
   * grid.setData([{ name: 'Kim' }, { name: 'Lee' }]);
   */
  setData(data: T[]): void {
    this._mutation.setData(data);
    // DD-05 S2c-1(CF): 데이터 전량 교체 → 컬럼 통계 무효화·재계산(캐시 갱신). CF 미설정이면 무비용.
    // / CF: full data replace → invalidate & recompute column stats (cache refresh). No-op when CF is unset.
    if (this._cf) { this._recomputeCFStats(); this._doRender(...this._visRange()); }
  }

  /**
   * 지금 화면에 보이는 순서·범위 그대로의 데이터 배열을 돌려준다(정렬·필터가 반영된 결과). 사용자가 보고 있는 그대로를 내보내거나 집계할 때 쓴다.
   *
   * Return the data array as currently shown (sort/filter applied) — use it to export or aggregate exactly what the user sees.
   *
   * いま画面に見えている順序・範囲そのままのデータ配列を返します(ソート・フィルターが反映された結果)。ユーザーが見ているままを書き出したり集計したりするときに使います。
   *
   * 返回当前画面上所见的顺序、范围原样的数据数组(已反映排序、筛选的结果)。想把用户所见的内容原样导出或聚合时使用。
   */
  getData(): T[] { return this._data.getData(); }
  /**
   * 정렬·필터를 걷어 낸 원본 데이터 배열을 돌려준다. "원래 넣었던 전체 데이터"가 필요할 때 getData() 대신 쓴다.
   *
   * Return the original data array before sort/filter — use it instead of getData() when you need the full, unfiltered set.
   *
   * ソート・フィルターを取り除いた元のデータ配列を返します。「もともと入れた全データ」が必要なときに getData() の代わりに使います。
   *
   * 返回去掉排序、筛选的原始数据数组。需要「原本放入的全部数据」时,代替 getData() 使用。
   */
  getSourceRows(): T[] { return this._data.getOriginalData(); }

  /**
   * 기존 데이터 뒤에 행들을 이어 붙인다. 전체를 setData 로 갈아끼우지 않고 뒤에만 덧붙일 때 쓴다(무한 스크롤·추가 로드 등).
   *
   * Append rows after the existing data — for adding to the tail without replacing everything via setData (infinite scroll, load-more, …).
   *
   * 既存データの後ろに行を継ぎ足します。全体を setData で差し替えずに末尾だけ追加するときに使います(無限スクロール・追加ロードなど)。
   *
   * 在既有数据后面接上行。不用 setData 替换整体、只在末尾追加时使用(无限滚动、追加加载等)。
   */
  pushData(data: T[]): void {
    const combined = [...this._data.getAllData(), ...data];
    this._data.setData(combined);
    const n = this._data.rowCount;
    this._vs?.setTotalRows(this._flatModel.count());
    this._pagination?.setTotalRows(n);
  }

  /**
   * 기존 데이터 앞에 행들을 끼워 넣는다(최신 항목을 맨 위로 올릴 때 등).
   *
   * Prepend rows before the existing data (e.g. to push newest items to the top).
   *
   * 既存データの前に行を挿し込みます(最新の項目を先頭に上げるときなど)。
   *
   * 在既有数据前面插入行(例如把最新的项目提到最前时)。
   */
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
   *
   * Set conditional-formatting rules — wires data-bars/heatmaps/icon-sets into the render path.
   * CF is opt-in; the CF engine (cf/**) is assembled via **dynamic import** on first call (no base-bundle
   * growth, separate chunk). Column stats are cached once per rule-bearing column (never re-computed
   * per render), then a re-render paints them. Passing `rules=[]` clears CF (engine/cache reset + residue-stripping re-render).
   *
   * 条件付き書式(CF)のルールを設定します — データバー・ヒートマップ・アイコンセットをレンダー経路に配線します。
   * CF は opt-in のため、初回呼び出し時に CF エンジン(cf/**)を **動的 import** で組み立てます(ベースバンドルは
   * 増えず、別チャンク)。ルールが掛かった列ごとに列統計を 1 回だけキャッシュ計算し(レンダーごとの再計算は禁止)、
   * そのうえで再レンダーします。`rules=[]` を渡すと CF を解除します(エンジン・統計キャッシュを clear + 残滓を
   * 取り除く再レンダー)。
   *
   * 设置条件格式(CF)的规则 — 把数据条、热力图、图标集配线到渲染路径。
   * CF 为 opt-in,首次调用时以 **动态 import** 组装 CF 引擎(cf/**)(基础包不增加,独立分块)。
   * 对每个挂有规则的列只缓存计算 1 次列统计(禁止每次渲染重算),然后重新渲染。
   * 传入 `rules=[]` 则解除 CF(clear 引擎与统计缓存 + 去除残留的重新渲染)。
   *
   * @param rules - CF 규칙 배열(빈 배열이면 해제)
   *
   * CF rule array (empty array clears CF)
   *
   * CF ルールの配列(空配列なら解除)
   *
   * CF 规则的数组(空数组则解除)
   *
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
   *
   * Recompute & cache per-column CF stats using the computer captured from the cf/ dynamic chunk.
   *
   * CF ルールが掛かった列ごとに、現在のデータで列統計を計算してキャッシュします(レンダーごとの再計算を禁止できる根拠)。
   * 統計計算機は、setConditionalFormat で cf/ の動的チャンクから保持した参照を同期的に使います。
   *
   * 对每个挂有 CF 规则的列,用当前数据计算列统计并缓存(禁止每次渲染重算的依据)。
   * 统计计算器同步使用 setConditionalFormat 中从 cf/ 动态分块保留下来的引用。
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
   *
   * Wire a realtime source (polling/streaming/custom — any `IRealtimeSource` via DI). Like CF, the
   * realtime/ chunk is dynamically imported only on first call (separate chunk; base bundle unchanged).
   * Deltas reuse the existing single write path (MutationService), inheriting the incremental=full
   * invariant, formula recompute, and live chart refresh (dataChange subscription). Re-calling
   * detaches and replaces the previous source.
   *
   * リアルタイムデータソースをグリッドに配線します(ポーリング/ストリーミング/カスタム — `IRealtimeSource` の実装で
   * あれば何でも DI 可能)。CF と同じく、初回呼び出し時にのみ realtime/ を動的 import します(別チャンク・ベース
   * バンドルは増えません)。デルタは既存の単一書き込み経路(MutationService)を再利用して適用されるため、増分=全体の
   * 不変条件・数式の再計算・チャートのライブ更新(dataChange の購読)を自然に継承します。再度呼び出すと、以前の
   * ソースは detach してから差し替えられます。
   *
   * 把实时数据源配线到表格(轮询/流式/自定义 — 只要是 `IRealtimeSource` 的实现都可以 DI)。
   * 与 CF 相同,仅在首次调用时动态 import realtime/(独立分块、基础包不增加)。增量复用既有的单一写入路径
   * (MutationService)来应用,因此自然继承增量=整体的不变条件、公式的重算、图表的实时更新(dataChange 的订阅)。
   * 再次调用时,先 detach 之前的源再替换。
   *
   * @param source - 실시간 소스(예: `new PollingSource({...})`)
   *
   * Realtime source (e.g. `new PollingSource({...})`)
   *
   * リアルタイムソース(例: `new PollingSource({...})`)
   *
   * 实时源(例: `new PollingSource({...})`)
   *
   * @param opts - 백프레셔·신선도·SR 옵션(전부 옵션)
   *
   * Backpressure/freshness/SR options (all optional)
   *
   * バックプレッシャー・鮮度・SR のオプション(すべて任意)
   *
   * 背压、新鲜度、SR 的选项(全部可选)
   *
   * @returns 배선된 컨트롤러(`.connection`·`.backpressureStats`·`.onConnection`·`.detach()`)
   *
   * The wired controller
   *
   * 配線されたコントローラ(`.connection`・`.backpressureStats`・`.onConnection`・`.detach()`)
   *
   * 配线好的控制器(`.connection`、`.backpressureStats`、`.onConnection`、`.detach()`)
   *
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

  /**
   * 실시간 소스 배선을 해제한다(구독·타이머·소켓 정리, 멱등).
   *
   * Disconnect the realtime source (teardown; idempotent).
   *
   * リアルタイムソースの配線を解除します(購読・タイマー・ソケットの後片付け、冪等)。
   *
   * 解除实时源的配线(清理订阅、定时器、套接字,幂等)。
   */
  disconnectRealtime(): void {
    this._rt?.detach();
    this._rt = null;
  }

  /**
   * 데이터만 전부 비운다 — 컬럼 정의와 옵션은 그대로 두고 행만 0건으로 만든다. 같은 표 구조를 유지한 채 내용만 갈아엎기 전에 쓴다.
   *
   * Empty just the data — keep column defs and options, drop all rows to zero. Use it before reloading content into the same table shape.
   *
   * データだけをすべて空にします — 列定義とオプションはそのままに、行だけを 0 件にします。同じ表の構造を保ったまま中身だけを入れ替える前に使います。
   *
   * 只把数据全部清空 — 列定义与选项保持原样,只把行变成 0 件。想保持同样的表结构、只替换内容之前使用。
   */
  clearData(): void {
    this._rowMgr.reset();
    this._data.clearData();
    // R4: totals=0 → full 렌더 → emit([]) (onDataChange bound listener 로 ONCE, 명시 재호출 없음).
    this._mutation.commit({ totals: 'zero', renderMode: 'full', emitPayload: () => [] });
  }

  // R6(§3.1 C5): 얇은 위임 — 실제 구현은 MutationService.
  // / R6 (§3.1 C5): thin delegation — actual implementation lives in MutationService.
  /**
   * 행 1건을 원하는 위치에 끼워 넣고 화면을 갱신한다. "추가" 버튼으로 빈 행이나 새 레코드를 넣을 때 쓰며,
   * 일부 필드만 담은 부분 객체를 넘겨도 된다(나머지는 비어 있는 채로 삽입). 삽입 후 변경 추적에 "추가된 행"으로
   * 잡히고, `before:insertRow` 트리거로 취소·검증할 수 있다.
   *
   * Insert one row at a chosen position and refresh the view. Use it for an "add" button that inserts a
   * blank row or a new record; a partial object is fine (missing fields stay empty). The row is tracked as
   * "added", and a `before:insertRow` trigger can cancel/validate it.
   *
   * 行を 1 件、任意の位置に挿し込んで画面を更新します。「追加」ボタンで空行や新しいレコードを入れるときに使い、
   * 一部のフィールドだけを持つ部分オブジェクトを渡しても構いません(残りは空のまま挿入されます)。挿入後は変更追跡に
   * 「追加された行」として捕捉され、`before:insertRow` トリガーでキャンセル・検証できます。
   *
   * 把 1 行插入到任意位置并刷新画面。用「添加」按钮放入空行或新记录时使用,
   * 传入只含部分字段的部分对象也可以(其余字段以空值插入)。插入后会被变更追踪捕捉为「添加的行」,
   * 并可用 `before:insertRow` 触发器取消、校验。
   *
   * @param item - 행 데이터(부분 객체 허용)
   *
   * Row data (partial object allowed)
   *
   * 行データ(部分オブジェクト可)
   *
   * 行数据(允许部分对象)
   *
   * @param position - 삽입 위치(기본 'last')
   *
   * Insertion position (default 'last')
   *
   * 挿入位置(既定 'last')
   *
   * 插入位置(默认 'last')
   *
   * @example
   * grid.insertRow({ name: 'New' }, 'first');
   */
  insertRow(item: Partial<T>, position: Position = 'last'): void { this._mutation.insertRow(item, position); }

  /**
   * 행(들)을 끝에 추가한다.
   *
   * Append row(s) at the end.
   *
   * 行を末尾に追加します。
   *
   * 把行追加到末尾。
   */
  pushRow(items: Partial<T> | Partial<T>[]): void { this._mutation.pushRow(items); }

  /**
   * @deprecated 하위호환 alias → pushRow
   *
   * Backward-compat alias → pushRow
   *
   * 後方互換のエイリアス → pushRow
   *
   * 后方兼容的别名 → pushRow
   */
  appendRows(items: Partial<T> | Partial<T>[]): void { this.pushRow(items); }

  /**
   * 행(들)을 맨 앞에 추가한다.
   *
   * Prepend row(s) at the beginning.
   *
   * 行を先頭に追加します。
   *
   * 把行追加到最前。
   */
  unshiftRow(items: Partial<T> | Partial<T>[]): void {
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(it => this._data.addRow(it, 'first'));
    // R4: unshiftRow 도 트리거 브래킷 없음 — pushRow 와 동형 커밋.
    this._mutation.commit({
      totals: 'count', renderMode: 'sync-window',
      emitPayload: () => this._data.getData(), fireOnDataChangeExplicitly: true,
    });
  }

  /**
   * @deprecated 하위호환 alias → unshiftRow
   *
   * Backward-compat alias → unshiftRow
   *
   * 後方互換のエイリアス → unshiftRow
   *
   * 后方兼容的别名 → unshiftRow
   */
  prependRows(items: Partial<T> | Partial<T>[]): void { this.unshiftRow(items); }

  /**
   * 행을 인덱스로 삭제하고 화면을 갱신한다. 하나만 지우려면 숫자를, 여러 개를 한 번에 지우려면 인덱스 배열을
   * 넘긴다(배열로 넘기면 배치로 한 번에 처리되어 개별 호출보다 빠르다). 삭제된 행은 변경 추적의 "삭제된 행"으로
   * 남아 `getRemovedRows()` 로 확인할 수 있다.
   *
   * Delete row(s) by index and refresh. Pass a number for one row, or an array to remove several at once
   * (an array is handled in a single batch, faster than one-by-one). Removed rows stay in change tracking
   * as "removed" and can be read via `getRemovedRows()`.
   *
   * 行をインデックスで削除して画面を更新します。1 件だけ消すなら数値を、複数をまとめて消すならインデックスの配列を
   * 渡します(配列で渡すとバッチで一括処理され、個別呼び出しより高速です)。削除された行は変更追跡の「削除された行」と
   * して残り、`getRemovedRows()` で確認できます。
   *
   * 按索引删除行并刷新画面。只删 1 件传数值,要一次删多件则传索引的数组
   * (以数组传入会按批一次性处理,比逐个调用更快)。被删除的行会作为变更追踪的「删除的行」保留,
   * 可用 `getRemovedRows()` 确认。
   *
   * @param rowIndex - 삭제할 행 인덱스(단건 또는 배열)
   *
   * Row index to delete (single or array)
   *
   * 削除する行のインデックス(単件または配列)
   *
   * 要删除的行索引(单件或数组)
   */
  deleteRow(rowIndex: number | number[]): void { this._mutation.deleteRow(rowIndex); }

  /**
   * @deprecated no-op stub — id 기반 삭제는 미구현(본문 없음). 인덱스로 지우려면 `deleteRow(rowIndex)`
   *   를, id→인덱스 변환은 `getFlatRowModel()`/`getData()` 조회 후 `deleteRow` 를 사용.
   *
   *   no-op stub — id-based deletion is not implemented (empty body). Use `deleteRow(rowIndex)`;
   *   resolve id→index via `getFlatRowModel()`/`getData()` first.
   *
   *   no-op スタブ — id ベースの削除は未実装です(本体なし)。インデックスで消すには `deleteRow(rowIndex)` を、
   *   id→インデックスの変換は `getFlatRowModel()`/`getData()` で引いたうえで `deleteRow` を使ってください。
   *
   *   no-op 桩 — 基于 id 的删除未实现(无主体)。要按索引删除请用 `deleteRow(rowIndex)`;
   *   id→索引的转换请先用 `getFlatRowModel()`/`getData()` 查出,再使用 `deleteRow`。
   */
  deleteById(_ids: string[]): void { /* 異뷀썑 援ы쁽 */ }

  /**
   * 셀에 저장된 가공 전 원시 값을 그대로 읽는다(포맷·마스킹을 거치지 않은 실제 데이터). 계산·비교에 쓸 원값이 필요할 때 getDisplayValue 대신 쓴다.
   *
   * Read the raw stored cell value (no formatting/masking) — use it instead of getDisplayValue when you need the real value for compute/compare.
   *
   * セルに保存された加工前の生の値をそのまま読み取ります(フォーマットやマスキングを経ていない実データ)。計算・比較に使う元の値が必要なときに getDisplayValue の代わりに使います。
   *
   * 原样读取单元格中保存的、加工前的原始值(未经过格式化或掩码的实际数据)。需要用于计算、比较的原值时,代替 getDisplayValue 使用。
   */
  readCell(rowIndex: number, field: string): any {
    return this._data.getCellValue(rowIndex, field);
  }
  /**
   * 화면에 실제로 보이는 셀 텍스트를 돌려준다 — 원시 값에 displayFormatter 전략(숫자·날짜 포맷 등)을 적용한
   * 결과다. 표에 표시되는 문자열 그대로를 복사·검색·툴팁에 쓰고 싶을 때 readCell(원값) 대신 쓴다.
   *
   * Return the cell text as actually displayed — the raw value with the displayFormatter strategy
   * (number/date formatting, …) applied. Use it instead of readCell (raw) when you want the exact shown
   * string for copy/search/tooltip.
   *
   * 画面に実際に見えているセルのテキストを返します — 生の値に displayFormatter 戦略(数値・日付のフォーマットなど)を
   * 適用した結果です。表に表示される文字列そのものをコピー・検索・ツールチップに使いたいときに、readCell(生の値)の
   * 代わりに使います。
   *
   * 返回画面上实际可见的单元格文本 — 是对原始值应用 displayFormatter 策略(数值、日期格式化等)后的结果。
   * 想把表格中显示的字符串原样用于复制、搜索、提示框时,代替 readCell(原值)使用。
   *
   * @param rowIndex - 화면 기준 행 위치(flat index)
   *
   * On-screen row position (flat index)
   *
   * 画面基準の行位置(flat index)
   *
   * 以画面为准的行位置(flat index)
   *
   * @param field - 컬럼 field
   *
   * Column field
   *
   * 列の field
   *
   * 列的 field
   *
   * @returns 표시용 문자열
   *
   * The display string
   *
   * 表示用の文字列
   *
   * 显示用的字符串
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

  /**
   * 셀 하나의 값을 코드로 바꾼다(사용자 편집이 아니라 프로그램 갱신 경로). 값을 쓰면서 변경 추적에 기록하고,
   * 이 셀을 참조하는 수식들을 다시 계산하도록 표시한 뒤 화면을 다시 그린다. 낱개로 여러 셀을 바꿀 때는 렌더가
   * 매번 일어나니, 대량이면 `writeCells()` 나 `beginBatch()`/`endBatch()` 로 묶는 편이 빠르다.
   *
   * Change one cell's value from code (the programmatic path, not user editing). It records the change in
   * change tracking, marks formulas that reference this cell for recompute, then re-renders. For many cells,
   * prefer `writeCells()` or `beginBatch()`/`endBatch()` since each call re-renders.
   *
   * セル 1 つの値をコードから変えます(ユーザー編集ではなくプログラムからの更新経路)。値を書きながら変更追跡に記録し、
   * このセルを参照する数式を再計算対象として印を付けたうえで、画面を描画し直します。ばらばらに複数のセルを変えると
   * そのつどレンダーが走るため、大量の場合は `writeCells()` や `beginBatch()`/`endBatch()` でまとめたほうが高速です。
   *
   * 用代码改变单个单元格的值(不是用户编辑,而是程序的更新路径)。写值的同时记录到变更追踪,
   * 并把引用该单元格的公式标记为重算对象,然后重新绘制画面。零散地改多个单元格会每次都触发渲染,
   * 数量大时用 `writeCells()` 或 `beginBatch()`/`endBatch()` 打包更快。
   *
   * @param rowIndex - 화면 기준 행 위치(flat index)
   *
   * On-screen row position (flat index)
   *
   * 画面基準の行位置(flat index)
   *
   * 以画面为准的行位置(flat index)
   *
   * @param field - 컬럼 field
   *
   * Column field
   *
   * 列の field
   *
   * 列的 field
   *
   * @param value - 기록할 값
   *
   * Value to write
   *
   * 書き込む値
   *
   * 要写入的值
   */
  writeCell(rowIndex: number, field: string, value: any): void { this._mutation.writeCell(rowIndex, field, value); }

  /**
   * 지정 인덱스의 행 객체를 돌려준다(단건 조회용).
   *
   * Return the row object at the given index (single-row lookup).
   *
   * 指定インデックスの行オブジェクトを返します(単件照会用)。
   *
   * 返回指定索引的行对象(单件查询用)。
   */
  getRowAt(rowIndex: number): T { return this._data.getRowByIndex(rowIndex) as T; }

  // ── Phase 0 인프라 / Phase 0 infrastructure ──────────────────────────────────────

  /**
   * 화면상의 행 위치(flat/visual index)와 실제 데이터 행을 서로 변환해 주는 리졸버를 돌려준다. 그룹 머리글·
   * 트리 자식·상세 패널 같은 의사(pseudo) 행이 섞여 index 와 데이터가 어긋날 때, "이 index 가 진짜 데이터 행인가,
   * 몇 번 rowId 인가"를 물어보는 단일 창구다. 범위 선택+채우기·수식·차트 기능이 좌표를 해석할 때 모두 이 모델을 거친다.
   *
   * Return the resolver that maps between an on-screen row position (flat/visual index) and the actual
   * data row. When pseudo rows (group headers, tree children, detail panels) are interleaved and the
   * index no longer lines up with the data, this is the single place to ask "is this index a real data
   * row, and which rowId is it?". Range-fill, formulas, and charts all resolve coordinates through it.
   *
   * 画面上の行位置(flat/visual index)と実際のデータ行を相互に変換するリゾルバを返します。グループ見出し・ツリーの
   * 子・詳細パネルといった擬似(pseudo)行が混ざって index とデータがずれるとき、「この index は本当のデータ行なのか、
   * どの rowId なのか」を尋ねる唯一の窓口です。範囲選択+塗りつぶし・数式・チャートの各機能は、座標を解釈する際に
   * すべてこのモデルを経由します。
   *
   * 返回在画面上的行位置(flat/visual index)与实际数据行之间相互转换的解析器。当分组标题、树的子项、
   * 明细面板这类伪(pseudo)行混入,index 与数据对不上时,它是询问「这个 index 是不是真正的数据行,是哪个 rowId」
   * 的唯一窗口。范围选择+填充、公式、图表各功能在解释坐标时,都要经由这个模型。
   *
   * @returns flat/visual index ↔ data 리졸버
   *
   * The flat/visual index ↔ data resolver
   *
   * flat/visual index ↔ data のリゾルバ
   *
   * flat/visual index ↔ data 的解析器
   */
  // C0.3: 범위선택+채우기·수식·통합차트 기능은 좌표 해석 시 반드시 이 모델만 경유(직접 index 산술 금지).
  getFlatRowModel(): FlatRowModel { return this._flatModel; }

  // R6(§3.1 C5): 배치 API 도 MutationService 로 이관. 얇은 위임(공개 API 불변).
  /**
   * 배치 쓰기를 연다. 이 뒤로 이어지는 writeCell 들은 그때그때 다시 그리지 않고 모아 두었다가 endBatch 에서 한 번에 반영된다. 수많은 셀을 갱신할 때 endBatch 와 짝지어 감싼다.
   *
   * Open a write batch — subsequent writeCell calls are collected instead of re-rendering each time, and flushed together at endBatch. Wrap bulk updates with a matching endBatch.
   *
   * バッチ書き込みを開きます。これ以降に続く writeCell は、そのつど描画し直さずに溜め込まれ、endBatch でまとめて反映されます。多数のセルを更新するときは endBatch と対にして囲みます。
   *
   * 打开批量写入。此后接续的 writeCell 不会每次重绘,而是先攒起来,在 endBatch 一次性反映。更新大量单元格时,与 endBatch 成对包住。
   */
  beginBatch(): void { this._mutation.beginBatch(); }

  /**
   * 배치를 닫고 모아 둔 쓰기를 한 번에 반영한다 — 그 사이 변경이 있었으면 렌더 1회 + dataChange 이벤트 1회만 발생한다. beginBatch 와 반드시 짝을 맞춘다.
   *
   * Close the batch and flush collected writes at once — if anything changed, exactly one render + one dataChange event fires. Always pair it with beginBatch.
   *
   * バッチを閉じ、溜め込んだ書き込みを一度に反映します — その間に変更があれば、レンダー 1 回 + dataChange イベント 1 回だけが発生します。必ず beginBatch と対にしてください。
   *
   * 关闭批量并把攒下的写入一次性反映 — 其间若有变更,只发生 1 次渲染 + 1 次 dataChange 事件。务必与 beginBatch 成对使用。
   */
  endBatch(): void { this._mutation.endBatch(); }

  // R7(§3.1 C9): F3 수식 표면은 FormulaController 로 이관. 아래는 얇은 위임(공개 API 불변).
  // accessor 조립/에러 표현/flush/afterRecalc/getFormulaMeta 등 내부 훅은 _formula 를 통해 배선됨.

  // ── F3: 공개 API(§8.2) — rowIndex 는 flat(C0), 내부 즉시 stable rowId 로 정규화 ──────
  // ── F3: public API (§8.2) — rowIndex is flat (C0), normalized to stable rowId internally ──
  /**
   * 셀에 스프레드시트 스타일 수식을 건다("=A1+B2" 형태). 셀 값을 고정 숫자가 아니라 다른 셀에서
   * 계산되게 만들고 싶을 때 쓴다 — 참조한 셀이 바뀌면 이 셀도 자동으로 다시 계산되고, 순환 참조·에러는
   * `getCellError()` 로 표면화된다.
   *
   * Attach a spreadsheet-style formula to a cell (e.g. "=A1+B2"). Use it when a cell's value should
   * be computed from other cells rather than a fixed number — the cell recomputes automatically when
   * a referenced cell changes, and cycles/errors surface via `getCellError()`.
   *
   * セルにスプレッドシート形式の数式を掛けます(「=A1+B2」の形)。セルの値を固定の数値ではなく、ほかのセルから
   * 計算させたいときに使います — 参照したセルが変われば、このセルも自動的に再計算され、循環参照やエラーは
   * `getCellError()` で表面化します。
   *
   * 给单元格挂上电子表格式的公式(「=A1+B2」的形式)。想让单元格的值不是固定数值、而是由其他单元格
   * 计算得出时使用 — 被引用的单元格一变,这个单元格也会自动重算,循环引用与错误则通过 `getCellError()` 表面化。
   *
   * @param rowIndex - 화면 기준 행 위치(flat index)
   *
   * On-screen row position (flat index)
   *
   * 画面基準の行位置(flat index)
   *
   * 以画面为准的行位置(flat index)
   *
   * @param field - 컬럼 field
   *
   * Column field
   *
   * 列の field
   *
   * 列的 field
   *
   * @param formula - '=' 로 시작하는 수식 원문
   *
   * Formula source starting with '='
   *
   * '=' で始まる数式の原文
   *
   * 以 '=' 开头的公式原文
   *
   * @example
   * grid.setCellFormula(2, 'total', '=A1+B1');
   */
  setCellFormula(rowIndex: number, field: string, formula: string): void {
    this._formula.setCellFormula(rowIndex, field, formula);
  }

  /**
   * 셀 수식 원문(없으면 null).
   *
   * Formula source of the cell (null when absent).
   *
   * セル数式の原文(なければ null)。
   *
   * 单元格公式的原文(没有则为 null)。
   */
  getCellFormula(rowIndex: number, field: string): string | null {
    return this._formula.getCellFormula(rowIndex, field);
  }

  /**
   * 셀에 수식이 있는지.
   *
   * Whether the cell has a formula.
   *
   * セルに数式があるかどうか。
   *
   * 单元格是否有公式。
   */
  hasCellFormula(rowIndex: number, field: string): boolean {
    return this._formula.hasCellFormula(rowIndex, field);
  }

  /**
   * 수식 제거(마지막 계산값은 유지).
   *
   * Remove the formula (last computed value kept).
   *
   * 数式の削除(最後の計算値は維持)。
   *
   * 删除公式(最后的计算值保留)。
   */
  clearCellFormula(rowIndex: number, field: string): void {
    this._formula.clearCellFormula(rowIndex, field);
  }

  /**
   * 셀 수식 에러 코드(없으면 null).
   *
   * Formula error code of the cell (null when none).
   *
   * セル数式のエラーコード(なければ null)。
   *
   * 单元格公式的错误码(没有则为 null)。
   */
  getCellError(rowIndex: number, field: string): FormulaErrorCode | null {
    return this._formula.getCellError(rowIndex, field);
  }

  /**
   * 디버깅용 — 이 셀을 참조하는(종속) 셀들.
   *
   * Debugging — cells that depend on this cell.
   *
   * デバッグ用 — このセルを参照する(従属)セル群。
   *
   * 调试用 — 引用该单元格的(从属)单元格。
   */
  getDependents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    return this._formula.getDependents(rowIndex, field);
  }

  /**
   * 디버깅용 — 이 셀이 참조하는(선행) 셀들.
   *
   * Debugging — cells this cell references (precedents).
   *
   * デバッグ用 — このセルが参照する(先行)セル群。
   *
   * 调试用 — 该单元格引用的(先行)单元格。
   */
  getPrecedents(rowIndex: number, field: string): Array<{ rowIndex: number; field: string }> {
    return this._formula.getPrecedents(rowIndex, field);
  }

  /**
   * 전체 수식 위상 재계산.
   *
   * Recalculate all formulas in topological order.
   *
   * 全数式のトポロジカル再計算。
   *
   * 全部公式的拓扑重算。
   */
  recalculate(): void { this._formula.recalculate(); }

  /**
   * 단일 셀 + 종속 폐포만 재계산.
   *
   * Recalculate one cell plus its dependent closure.
   *
   * 単一セル + その従属閉包のみを再計算。
   *
   * 只重算单个单元格 + 其从属闭包。
   */
  recalculateCell(rowIndex: number, field: string): void {
    this._formula.recalculateCell(rowIndex, field);
  }

  /**
   * 원본 셀 수식을 dRow/dCol 만큼 옮겨 새 위치에 맞게 상대 참조를 조정한 수식 원문을 만든다. 범위 선택+채우기
   * 로 수식을 아래·옆으로 끌어 복사할 때, 절대 참조(`$` 고정)는 그대로 두고 상대 참조만 이동량만큼 밀어 주는
   * 저수준 도우미다(엑셀에서 수식을 드래그 복사하면 참조가 따라 움직이는 것과 같은 규칙).
   *
   * Produce a formula source with relative references shifted by dRow/dCol so it fits a new location.
   * A low-level helper used when range-fill drags a formula down/across: absolute (`$`-locked) refs stay
   * put while relative refs move by the offset — the same rule as drag-copying a formula in a spreadsheet.
   *
   * 元のセル数式を dRow/dCol の分だけずらし、新しい位置に合わせて相対参照を調整した数式の原文を作ります。範囲選択+
   * 塗りつぶしで数式を下・横へ引いてコピーするとき、絶対参照(`$` で固定)はそのままに、相対参照だけを移動量の分だけ
   * ずらす低レベルのヘルパーです(スプレッドシートで数式をドラッグコピーすると参照が付いて動くのと同じ規則)。
   *
   * 把原单元格公式按 dRow/dCol 平移,生成一份按新位置调整了相对引用的公式原文。用范围选择+填充把公式
   * 向下、向旁拖拽复制时,绝对引用(用 `$` 固定)保持不动,只把相对引用按位移量推移的低层辅助函数
   * (与在 Excel 中拖拽复制公式时引用会跟着移动的规则相同)。
   *
   * @param srcRowId - 원본 셀의 rowId
   *
   * rowId of the source cell
   *
   * 元のセルの rowId
   *
   * 原单元格的 rowId
   *
   * @param srcField - 원본 셀의 field
   *
   * field of the source cell
   *
   * 元のセルの field
   *
   * 原单元格的 field
   *
   * @param dRow - 행 오프셋
   *
   * Row offset
   *
   * 行のオフセット
   *
   * 行的偏移量
   *
   * @param dCol - 열 오프셋
   *
   * Column offset
   *
   * 列のオフセット
   *
   * 列的偏移量
   *
   * @returns 이동 반영된 새 수식 원문
   *
   * New formula source with the offset applied
   *
   * 移動が反映された新しい数式の原文
   *
   * 反映了平移的新公式原文
   */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    return this._formula.offsetFormula(srcRowId, srcField, dRow, dCol);
  }

  /**
   * 여러 셀을 한 번에 쓴다. 내부에서 배치로 묶어 처리하므로 렌더·이벤트가 셀마다 터지지 않고 끝에서 한 번만
   * 일어나, 수백 셀을 갱신할 때 낱개 `writeCell` 반복보다 훨씬 빠르다. 각 rowIndex 는 화면 기준 위치(flat
   * index)이며, 대상이 실제 데이터 행이 아니라 그룹 머리글·트리·상세 같은 의사(pseudo) 행이면 데이터 훼손을
   * 막기 위해 그 셀은 조용히 건너뛴다. 건너뛴 셀 수를 돌려주고, 1건이라도 있으면 스크린리더 안내와
   * 'writeCellsSkip' 이벤트로 알린다.
   *
   * Write many cells at once. They are wrapped in one batch, so render/events fire once at the end
   * instead of per cell — much faster than looping single `writeCell` calls for hundreds of cells. Each
   * rowIndex is an on-screen position (flat index); if a target is not a real data row but a pseudo row
   * (group header, tree, detail), that cell is skipped to avoid corrupting data. Returns the number of
   * skipped cells and, when non-zero, surfaces it via a screen-reader announce + a 'writeCellsSkip' event.
   *
   * 複数のセルを一度に書き込みます。内部でバッチにまとめて処理するため、レンダーやイベントがセルごとに走らず最後に
   * 1 回だけ起こり、数百セルを更新するときに `writeCell` を 1 件ずつ繰り返すよりはるかに高速です。各 rowIndex は
   * 画面基準の位置(flat index)であり、対象が実際のデータ行ではなくグループ見出し・ツリー・詳細といった擬似(pseudo)
   * 行の場合は、データの破損を防ぐためそのセルを黙ってスキップします。スキップしたセル数を返し、1 件でもあれば
   * スクリーンリーダーへの通知と 'writeCellsSkip' イベントで知らせます。
   *
   * 一次写入多个单元格。内部打包成批处理,因此渲染与事件不会每个单元格都触发,而是最后只发生 1 次,
   * 更新数百个单元格时比逐个重复 `writeCell` 快得多。各 rowIndex 是以画面为准的位置(flat index),
   * 若目标不是实际的数据行,而是分组标题、树、明细这类伪(pseudo)行,为防止数据损坏会静默跳过该单元格。
   * 返回跳过的单元格数,只要有 1 件就通过屏幕阅读器通知和 'writeCellsSkip' 事件告知。
   *
   * @param patches - 쓰기 목록
   *
   * List of writes
   *
   * 書き込みの一覧
   *
   * 写入的列表
   *
   * @returns 건너뛴 셀 수
   *
   * Number of skipped cells
   *
   * スキップしたセル数
   *
   * 跳过的单元格数
   *
   * @example
   * const skipped = grid.writeCells([
   *   { rowIndex: 0, field: 'qty', value: 10 },
   *   { rowIndex: 1, field: 'qty', value: 20 },
   * ]);
   */
  // C2.1: beginBatch+루프+endBatch 래퍼. C0.3: resolveFlatRow 로 kind!=='data'(group/tree/detail 의사행)는 쓰기 전 skip(filler 에 writeCell 금지).
  writeCells(patches: Array<{ rowIndex: number; field: string; value: any }>): number {
    return this._mutation.writeCells(patches);
  }

  // ── F1: 범위 선택 + 채우기 핸들(11_design_F1_v2.md §6.2, C4) ────────────
  // ── F1: range selection + fill handle (11_design_F1_v2.md §6.2, C4) ────────────
  /**
   * 사용자가 드래그로 선택한 셀 사각형(범위)들을 정규화해 돌려준다. 선택이 없으면 빈 배열. 현재 버전은 한 번에 하나의 범위만 다루므로 길이는 최대 1이다.
   *
   * Return the user's drag-selected cell rectangles, normalized; empty when nothing is selected. This version handles one range at a time, so length is at most 1.
   *
   * ユーザーがドラッグで選択したセルの矩形(範囲)を正規化して返します。選択がなければ空配列です。現在のバージョンは一度に 1 つの範囲しか扱わないため、長さは最大 1 です。
   *
   * 把用户拖拽选中的单元格矩形(范围)规范化后返回。没有选择则为空数组。当前版本一次只处理 1 个范围,因此长度最大为 1。
   */
  getRangeSelection(): CellRange[] { return this._rangeMgr.getRangeSelection(); }
  /**
   * 지금 활성인 선택 범위 하나를 바로 꺼내는 지름길(선택이 없으면 null). 선택 여부만 확인하거나 그 범위로 값을 읽을 때 쓴다.
   *
   * Shortcut to the single active selection range (null when none) — handy to check selection or read values from it.
   *
   * いま有効な選択範囲を 1 つだけ直接取り出す近道(選択がなければ null)。選択の有無を確認したり、その範囲から値を読んだりするときに使います。
   *
   * 直接取出当前有效的 1 个选择范围的近道(没有选择则为 null)。用于确认是否有选择,或从该范围读取值。
   */
  getActiveRange(): CellRange | null { return this._rangeMgr.getActiveRange(); }
  /**
   * 마우스 드래그 없이 코드로 셀 범위를 선택 상태로 만든다. 검색 결과나 계산으로 특정 영역을 하이라이트하고 싶을 때 쓴다.
   *
   * Select a cell range from code (no mouse drag) — use it to highlight a region from a search result or computation.
   *
   * マウスのドラッグなしに、コードからセル範囲を選択状態にします。検索結果や計算によって特定の領域をハイライトしたいときに使います。
   *
   * 不用鼠标拖拽,而从代码把单元格范围置为选中状态。想根据搜索结果或计算高亮特定区域时使用。
   */
  setRangeSelection(range: CellRange | CellRange[]): void { this._rangeMgr.setRangeSelection(range); }
  /**
   * 현재 범위 선택을 모두 해제해 하이라이트를 지운다.
   *
   * Clear the range selection, removing the highlight.
   *
   * 現在の範囲選択をすべて解除し、ハイライトを消します。
   *
   * 解除当前的全部范围选择,清除高亮。
   */
  clearRangeSelection(): void { this._rangeMgr.clearRangeSelection(); }
  /**
   * 활성 범위 안의 셀 값들을 행×열 2차원 배열로 추출한다. 선택 영역을 복사하거나 외부로 넘길 때 쓴다.
   *
   * Extract the active range's cell values as a row×column 2D array — for copying or exporting the selection.
   *
   * 有効な範囲内のセル値を、行×列の 2 次元配列として取り出します。選択領域をコピーしたり外部へ渡したりするときに使います。
   *
   * 把有效范围内的单元格值,以行×列的二维数组取出。用于复制选择区域或传给外部。
   */
  getRangeValues(): any[][] { return this._rangeMgr.getRangeValues(); }
  /**
   * 활성 범위의 숫자 셀들만 모아 합계·평균 등 요약값을 계산한다(정밀 십진 연산 기반, 선택 없으면 null). 상태바에 "선택 합계"를 띄우는 용도.
   *
   * Compute sum/avg… over just the numeric cells in the active range (exact-decimal math; null when no selection) — e.g. to show a "sum of selection" in a status bar.
   *
   * 有効な範囲の数値セルだけを集めて、合計・平均などの要約値を計算します(高精度な十進演算に基づき、選択がなければ null)。ステータスバーに「選択範囲の合計」を出す用途です。
   *
   * 只收集有效范围内的数值单元格,计算合计、平均等汇总值(基于高精度十进制运算,没有选择则为 null)。用途是在状态栏显示「选择范围的合计」。
   */
  getRangeStats(): RangeStats | null { return this._rangeMgr.getRangeStats(); }
  /**
   * 원본 범위의 값을 대상 범위로 채워 넣는다 — 엑셀에서 채우기 핸들을 아래·옆으로 끌어 값을 복사하거나
   * 연속값을 만드는 동작을 프로그램으로 실행하는 API다. 채우는 방향(가로/세로)은 두 범위의 상대 위치로
   * 자동 추론하며, 내부적으로 배치로 묶어 한 번에 반영한다.
   *
   * Fill the target range from the source range — the programmatic form of dragging Excel's fill
   * handle down/across to copy values or extend a series. The direction (horizontal/vertical) is
   * inferred from the two ranges' relative position, and the writes are applied in one batch.
   *
   * 元の範囲の値を対象範囲へ流し込みます — スプレッドシートで塗りつぶしハンドルを下・横へ引いて値をコピーしたり、
   * 連続値を作ったりする動作をプログラムから実行する API です。塗りつぶす方向(横/縦)は 2 つの範囲の相対位置から
   * 自動的に推論し、内部ではバッチにまとめて一度に反映します。
   *
   * 把源范围的值灌入目标范围 — 是把在 Excel 中把填充手柄向下、向旁拖拽以复制值或生成连续值的动作,
   * 用程序执行的 API。填充的方向(横/纵)由两个范围的相对位置自动推断,内部打包成批一次性反映。
   *
   * @param source - 원본 범위
   *
   * Source range
   *
   * 元の範囲
   *
   * 源范围
   *
   * @param target - 대상 범위
   *
   * Target range
   *
   * 対象範囲
   *
   * 目标范围
   *
   * @param mode - 'copy'(같은 값 복사, 기본) 또는 'series'(연속값 생성)
   *
   * 'copy' (repeat values, default) or 'series' (extend a sequence)
   *
   * 'copy'(同じ値をコピー、既定)または 'series'(連続値を生成)
   *
   * 'copy'(复制相同的值,默认)或 'series'(生成连续值)
   */
  fillRange(source: CellRange, target: CellRange, mode: 'copy' | 'series' = 'copy'): void {
    this._rangeMgr.fillRange(source, target, mode);
  }

  // ── F4: 그리드 데이터 통합 차트(11_design_F4_v2.md §6, C5) ──────────────
  // ── F4: grid-data integrated chart (11_design_F4_v2.md §6, C5) ──────────────
  /**
   * 그리드에 들어 있는 데이터를 그대로 원천으로 삼아 차트를 만든다. 별도로 데이터를 넘길 필요 없이
   * "어떤 컬럼을(source/series) 어떤 모양으로(type) 그릴지"만 지정하면 된다. `live: true` 로 만들면
   * 그리드 데이터가 바뀔 때 차트도 자동으로 다시 그려져, 표와 그래프가 항상 같은 값을 가리킨다.
   *
   * Create a chart that uses the grid's own data as its source. You don't pass data separately — just
   * declare which columns to draw (source/series) and how (type). With `live: true` the chart re-renders
   * whenever the grid data changes, so table and chart always show the same numbers.
   *
   * グリッドに入っているデータをそのまま源としてチャートを作ります。データを別途渡す必要はなく、「どの列を
   * (source/series)どの形で(type)描くか」だけを指定します。`live: true` で作ると、グリッドのデータが変わったとき
   * チャートも自動的に描画し直され、表とグラフが常に同じ値を指します。
   *
   * 把表格中的数据直接当作源来制作图表。无需另外传入数据,只要指定「把哪些列(source/series)
   * 以什么形状(type)绘制」即可。用 `live: true` 创建时,表格数据一变,图表也会自动重新绘制,
   * 使表与图始终指向相同的值。
   *
   * @param config - 차트 구성(소스·타입·배치 등)
   *
   * Chart config (source, type, placement, …)
   *
   * チャートの構成(ソース・タイプ・配置など)
   *
   * 图表的构成(源、类型、放置等)
   *
   * @returns 생성된 차트 인스턴스
   *
   * The created chart instance
   *
   * 生成されたチャートインスタンス
   *
   * 生成的图表实例
   *
   * @example
   * const chart = grid.createChart({
   *   type: 'bar',
   *   source: { kind: 'columns', category: 'month', series: ['sales'] },
   *   live: true,
   * });
   */
  createChart(config: ChartConfig): ChartInstance { return this._chartMgr.createChart(config); }
  /**
   * 이 그리드가 만들어 아직 살아 있는 차트 인스턴스들을 돌려준다(일괄 갱신·조회용).
   *
   * Return the still-alive chart instances this grid created — for bulk refresh/inspection.
   *
   * このグリッドが作り、まだ生きているチャートインスタンスを返します(一括更新・照会用)。
   *
   * 返回这个表格创建且仍然存活的图表实例(用于批量更新、查询)。
   */
  getCharts(): ChartInstance[] { return this._chartMgr.getCharts(); }
  /**
   * 이 그리드가 만든 모든 차트를 파괴한다. 데이터 변경 구독까지 함께 끊어 메모리 누수를 막으므로, 차트를 정리할 때 반드시 호출한다.
   *
   * Destroy every chart this grid made, cutting their data-change subscriptions too to prevent leaks — call it when tearing charts down.
   *
   * このグリッドが作ったすべてのチャートを破棄します。データ変更の購読も併せて切ってメモリリークを防ぐため、チャートを片付けるときは必ず呼び出してください。
   *
   * 销毁这个表格创建的所有图表。会一并切断数据变更的订阅以防止内存泄漏,因此清理图表时务必调用。
   */
  destroyCharts(): void { this._chartMgr.destroyCharts(); }

  /**
   * 마지막 저장 이후 무엇이 바뀌었는지를 추가·수정·삭제 세 묶음으로 돌려준다. "변경분만 서버로 보내기"처럼 저장 시 델타를 만들 때 쓴다.
   *
   * Return what changed since the last save, grouped as added/edited/removed — for building a save delta ("send only changes to the server").
   *
   * 最後の保存以降に何が変わったかを、追加・修正・削除の 3 つの束にして返します。「変更分だけをサーバーへ送る」のように、保存時のデルタを作るときに使います。
   *
   * 把最后一次保存之后发生的变化,按添加、修改、删除三组返回。像「只把变更部分发往服务器」那样,制作保存时的增量时使用。
   */
  getChanges(): { added: T[]; edited: T[]; removed: T[] } { return this._data.getChanges(); }
  /**
   * 수정된 행 목록.
   *
   * Edited rows.
   *
   * 修正された行の一覧。
   *
   * 修改过的行的列表。
   */
  getEditedRows(): T[] { return this._data.getEditedRows(); }
  /**
   * @deprecated 하위 호환 — getEditedRows() 권장.
   *
   * Backward compat — prefer getEditedRows().
   *
   * 後方互換 — getEditedRows() を推奨。
   *
   * 后方兼容 — 推荐 getEditedRows()。
   */
  getChangedRows(): T[] { return this._data.getChangedRows(); }
  /**
   * 행별 변경 필드·old/new 값 상세.
   *
   * Per-row changed fields with old/new values.
   *
   * 行ごとの変更フィールドと old/new 値の詳細。
   *
   * 每行的变更字段与 old/new 值的详情。
   */
  getChangedColumns(): Array<{ row: T; fields: string[]; diff: Array<{ field: string; oldValue: any; newValue: any }> }> {
    return this._data.getChangedColumns();
  }
  /**
   * 추가된 행 목록.
   *
   * Added rows.
   *
   * 追加された行の一覧。
   *
   * 添加的行的列表。
   */
  getAddedRows(): T[] { return this._data.getAddedRows(); }
  /**
   * 삭제된 행 목록.
   *
   * Removed rows.
   *
   * 削除された行の一覧。
   *
   * 删除的行的列表。
   */
  getRemovedRows(): T[] { return this._data.getRemovedRows(); }
  /**
   * 행의 원본(수정 전) 스냅샷.
   *
   * Original (pre-edit) snapshot of the row.
   *
   * 行の元(修正前)のスナップショット。
   *
   * 行的原始(修改前)快照。
   */
  getOriginalRow(rowIndex: number): T | undefined { return this._data.getOriginalRow(rowIndex); }
  /**
   * stateField 값이 있는 행 목록.
   *
   * Rows having a value in stateField.
   *
   * stateField に値がある行の一覧。
   *
   * stateField 中有值的行的列表。
   */
  getRowsWithState(stateField: string): T[] { return this._data.getRowsWithState(stateField); }
  // ── R13(§2.8 R-7a, M8): 빈 no-op 스텁 명시 표기 ──────────────────────
  //   아래 메서드들은 공개 API 표면에 존재하지만 본문이 비어 아무 동작도 하지 않는다(하위호환 계약상
  //   삭제 불가 → @deprecated 로 명시). 각 태그에 "무엇을 안 하는지 + 대안"을 1줄로 명확히 기재한다.
  //   목록: undo/redo/clearHistory · deleteById · checkById/addCheckById/uncheckById ·
  //         setColWidths/calcColWidths · freezeRows · addTreeRow · jumpToCol.
  /**
   * @deprecated no-op stub — undo/redo 히스토리는 미구현. 변이 가드는 TriggerManager `before:*` 훅,
   *   변경 추적은 `getChanges()`/`getOriginalRow()` 를 사용.
   *
   *   no-op stub — undo/redo history is not implemented. Use TriggerManager `before:*` hooks
   *   for mutation guards and `getChanges()`/`getOriginalRow()` for change tracking.
   *
   *   no-op スタブ — undo/redo の履歴は未実装です。変更のガードには TriggerManager の `before:*` フックを、
   *   変更追跡には `getChanges()`/`getOriginalRow()` を使ってください。
   *
   *   no-op 桩 — undo/redo 的历史未实现。变更的守卫请用 TriggerManager 的 `before:*` 钩子,
   *   变更追踪请用 `getChanges()`/`getOriginalRow()`。
   */
  undo(): void {}
  /**
   * @deprecated no-op stub — undo/redo 히스토리 미구현(위 `undo()` 참조).
   *
   * no-op stub — see `undo()` above.
   *
   * no-op スタブ — undo/redo の履歴は未実装(上の `undo()` を参照)。
   *
   * no-op 桩 — undo/redo 的历史未实现(参见上面的 `undo()`)。
   */
  redo(): void {}
  /**
   * @deprecated no-op stub — undo/redo 히스토리 자체가 없어 비울 것도 없음(위 `undo()` 참조).
   *
   * no-op stub — there is no history to clear (see `undo()`).
   *
   * no-op スタブ — undo/redo の履歴自体がないため、消すものもありません(上の `undo()` を参照)。
   *
   * no-op 桩 — 本来就没有 undo/redo 的历史,因此也没有可清空的东西(参见上面的 `undo()`)。
   */
  clearHistory(): void {}
  /**
   * 보이는 리프 컬럼 정의 목록.
   *
   * Visible leaf column definitions.
   *
   * 表示されているリーフ列の定義一覧。
   *
   * 显示中的叶子列的定义列表。
   */
  getColumnDefs(): ColumnDef<T>[] { return this._colLayout.visibleLeaves; }
  /**
   * 숨김 포함 전체 리프 컬럼 정의.
   *
   * All leaf column definitions including hidden.
   *
   * 非表示を含む全リーフ列の定義。
   *
   * 包含隐藏列的全部叶子列的定义。
   */
  getAllColumnDefs(): ColumnDef<T>[] { return this._colLayout.leaves; }
  /**
   * 보이는 컬럼 수.
   *
   * Number of visible columns.
   *
   * 表示されている列の数。
   *
   * 显示中的列数。
   */
  getColumnCount(): number { return this._colLayout.visibleLeaves.length; }
  /**
   * 컬럼 구성 전체를 새 정의로 갈아끼우고 다시 그린다. 화면 모드에 따라 보여줄 열 세트를 통째로 바꿀 때 쓴다(개별 추가/삭제는 insertColumn/deleteColumn).
   *
   * Replace the entire column set with new definitions and re-render — for swapping the whole column layout by view mode (use insertColumn/deleteColumn for single changes).
   *
   * 列構成の全体を新しい定義に差し替えて描画し直します。画面モードに応じて見せる列のセットをまるごと変えるときに使います(個別の追加/削除は insertColumn/deleteColumn)。
   *
   * 把列构成的整体换成新定义并重新绘制。按画面模式整体更换要展示的列集合时使用(单个的添加/删除用 insertColumn/deleteColumn)。
   */
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
  /**
   * 컬럼 1개를 삽입한다.
   *
   * Insert one column.
   *
   * 列を 1 つ挿入します。
   *
   * 插入 1 个列。
   */
  insertColumn(colDef: ColumnDef<T>, position?: Position): void {
    this._colLayout.addColumn(colDef, position as any);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  /**
   * 컬럼을 삭제한다(해당 field 참조 수식은 #REF 처리).
   *
   * Delete a column (formulas referencing the field become #REF).
   *
   * 列を削除します(その field を参照する数式は #REF になります)。
   *
   * 删除列(引用该 field 的公式会变成 #REF)。
   */
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
  /**
   * 컬럼(들)을 숨긴다.
   *
   * Hide column(s).
   *
   * 列を非表示にします。
   *
   * 隐藏列。
   */
  hideColumn(field: string | string[]): void {
    this._colLayout.hideColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  /**
   * 숨긴 컬럼(들)을 다시 표시한다.
   *
   * Show hidden column(s).
   *
   * 非表示にした列を再び表示します。
   *
   * 把隐藏的列重新显示。
   */
  showColumn(field: string | string[]): void {
    this._colLayout.showColumn(field);
    this._recalcWidths(this._container.getBoundingClientRect().width);
    this._renderHeader(); this._doRender(...this._visRange());
  }
  /**
   * field 의 보이는 컬럼 인덱스(-1 = 없음).
   *
   * Visible column index of the field (-1 when absent).
   *
   * field の表示列インデックス(-1 = なし)。
   *
   * field 的显示列索引(-1 = 没有)。
   */
  getColumnIndex(field: string): number { return this._colLayout.getColumnIndex(field); }
  /**
   * 인덱스 위치의 field 명(없으면 '').
   *
   * Field name at the index ('' when absent).
   *
   * インデックス位置の field 名(なければ '')。
   *
   * 索引位置的 field 名(没有则为 '')。
   */
  getFieldAt(idx: number): string { return this._colLayout.getColumnByIndex(idx)?.field ?? ''; }
  /**
   * 해당 컬럼의 값 배열.
   *
   * Values of the column.
   *
   * その列の値の配列。
   *
   * 该列的值的数组。
   */
  getColValues(field: string, _all = false): any[] { return this._data.getData().map(r => r[field]); }
  /**
   * 해당 컬럼의 고유 값 배열.
   *
   * Unique values of the column.
   *
   * その列の一意な値の配列。
   *
   * 该列的唯一值的数组。
   */
  getUniqueValues(field: string, all = false): any[] { return [...new Set(this.getColValues(field, all))]; }
  /**
   * @deprecated no-op stub — 컬럼 폭 일괄 설정은 구현돼 있지 않다(본문 없음). 폭은 `ColumnDef.width` 로
   *   지정하거나 헤더 경계를 드래그해 조절하며, 남는 공간은 그리드가 자동 배분한다.
   *
   *   no-op stub — bulk width setting is not implemented (empty body). Set widths via `ColumnDef.width`
   *   or by dragging header borders; the grid auto-distributes remaining space.
   *
   *   no-op スタブ — 列幅の一括設定は実装されていません(本体なし)。幅は `ColumnDef.width` で指定するか、
   *   ヘッダーの境界をドラッグして調整し、余った空間はグリッドが自動的に配分します。
   *
   *   no-op 桩 — 列宽的批量设置未实现(无主体)。宽度请用 `ColumnDef.width` 指定,或拖拽表头的边界调整,
   *   剩余空间由表格自动分配。
   */
  setColWidths(_widths: number[]): void {}
  /**
   * @deprecated no-op stub — 폭 계산 미구현으로 항상 빈 배열을 돌려준다(본문 없음). 폭 배분은 그리드가 자동 처리한다.
   *
   * no-op stub — width calculation is not implemented; always returns [] (empty body). The grid distributes widths automatically.
   *
   * no-op スタブ — 幅の計算は未実装のため、常に空配列を返します(本体なし)。幅の配分はグリッドが自動的に処理します。
   *
   * no-op 桩 — 宽度计算未实现,因此总是返回空数组(无主体)。宽度的分配由表格自动处理。
   */
  calcColWidths(_fitToGrid = false): number[] { return []; }
  /**
   * 선택된 행 데이터 목록.
   *
   * Selected row data.
   *
   * 選択された行データの一覧。
   *
   * 选中的行数据的列表。
   */
  getSelections(): T[] { return this._rowMgr.getSelections(); }
  /**
   * 활성 행 인덱스(-1 = 없음).
   *
   * Active row index (-1 when none).
   *
   * アクティブ行のインデックス(-1 = なし)。
   *
   * 活动行的索引(-1 = 没有)。
   */
  getActiveRow(): number { return this._rowMgr.getActiveRow(); }
  /**
   * 지정 행을 활성/선택한다.
   *
   * Activate (select) the given row.
   *
   * 指定した行をアクティブ化(選択)します。
   *
   * 把指定的行激活(选中)。
   */
  activate(index: number): void { this._rowMgr.activate(index); this._doRender(...this._visRange()); }
  /**
   * 선택 해제.
   *
   * Clear the selection.
   *
   * 選択の解除。
   *
   * 解除选择。
   */
  deselect(): void { this._rowMgr.deselect(); this._doRender(...this._visRange()); }
  /**
   * 체크된 행 목록({row, rowIndex}).
   *
   * Checked rows ({row, rowIndex}).
   *
   * チェックされた行の一覧({row, rowIndex})。
   *
   * 勾选的行的列表({row, rowIndex})。
   */
  getChecked(): Array<{ row: T; rowIndex: number }> { return this._rowMgr.getChecked(); }
  /**
   * 체크된 행 데이터만 배열로.
   *
   * Checked row data only.
   *
   * チェックされた行データのみを配列で。
   *
   * 仅以数组返回勾选的行数据。
   */
  getAllChecked(): T[] { return this._rowMgr.getAllChecked(); }
  /**
   * @deprecated no-op stub — id 기반 체크 미구현. 값 기준 체크는 `checkByValue(field, values)` 사용.
   *
   * no-op stub — id-based checking not implemented; use `checkByValue(field, values)`.
   *
   * no-op スタブ — id ベースのチェックは未実装。値基準のチェックは `checkByValue(field, values)` を使ってください。
   *
   * no-op 桩 — 基于 id 的勾选未实现。按值勾选请用 `checkByValue(field, values)`。
   */
  checkById(_ids: string[]): void {}
  /**
   * @deprecated no-op stub — id 기반 체크 추가 미구현(위 `checkById()` 참조). `checkByValue` 사용.
   *
   * no-op stub — see `checkById()`; use `checkByValue`.
   *
   * no-op スタブ — id ベースのチェック追加は未実装(上の `checkById()` を参照)。`checkByValue` を使ってください。
   *
   * no-op 桩 — 基于 id 的追加勾选未实现(参见上面的 `checkById()`)。请用 `checkByValue`。
   */
  addCheckById(_ids: string[]): void {}
  /**
   * field 값이 values 에 포함되는 행을 체크한다.
   *
   * Check rows whose field value is in values.
   *
   * field の値が values に含まれる行をチェックします。
   *
   * 勾选 field 的值包含在 values 中的行。
   */
  checkByValue(field: string, values: any[]): void {
    this._rowMgr.checkByValue(field, values);
    this._doRender(...this._visRange());
  }
  /**
   * @deprecated no-op stub — id 기반 체크 해제 미구현. 전체 해제는 `uncheckAll()` 사용.
   *
   * no-op stub — id-based unchecking not implemented; use `uncheckAll()`.
   *
   * no-op スタブ — id ベースのチェック解除は未実装。全解除は `uncheckAll()` を使ってください。
   *
   * no-op 桩 — 基于 id 的取消勾选未实现。全部解除请用 `uncheckAll()`。
   */
  uncheckById(_ids: string[]): void {}
  /**
   * 전체 체크 해제.
   *
   * Uncheck all rows.
   *
   * すべてのチェックを解除。
   *
   * 解除所有勾选。
   */
  uncheckAll(): void { this._rowMgr.uncheckAll(); this._doRender(...this._visRange()); }
  /**
   * 데이터를 정렬한다 — 헤더 클릭 없이 코드로 정렬을 걸 때 쓴다. 한 컬럼만 정렬하려면 field 와 방향을,
   * 여러 컬럼을 우선순위대로 정렬하려면 SortItem 배열을 넘긴다. 정렬 전후로 `before/after:orderBy` 트리거가
   * 돌고, 취소 가능한 `before:orderBy` 로 정렬을 막을 수도 있다.
   *
   * Sort the data from code without a header click. Pass a field + direction for a single column, or a
   * SortItem array to sort by several columns in priority order. `before/after:orderBy` triggers run
   * around it, and a cancelable `before:orderBy` can veto the sort.
   *
   * データを並べ替えます — ヘッダーをクリックせず、コードからソートを掛けるときに使います。1 列だけ並べ替えるなら
   * field と方向を、複数の列を優先順位どおりに並べ替えるなら SortItem の配列を渡します。ソートの前後で
   * `before/after:orderBy` トリガーが走り、キャンセル可能な `before:orderBy` でソートを止めることもできます。
   *
   * 对数据排序 — 不点击表头、而从代码施加排序时使用。只排 1 列就传 field 与方向,
   * 要按优先顺序排多列则传 SortItem 的数组。排序前后会跑 `before/after:orderBy` 触发器,
   * 也能用可取消的 `before:orderBy` 阻止排序。
   *
   * @param fieldOrList - field 명 또는 정렬 목록
   *
   * Field name or sort list
   *
   * field 名またはソートの一覧
   *
   * field 名或排序的列表
   *
   * @param dir - 단일 field 일 때 방향(기본 'asc')
   *
   * Direction for single-field form (default 'asc')
   *
   * 単一 field のときの方向(既定 'asc')
   *
   * 单一 field 时的方向(默认 'asc')
   */
  orderBy(fieldOrList: string | SortItem[], dir: 'asc' | 'desc' = 'asc'): void {
    const ctx = this._trigMgr.mkCtx('orderBy', [fieldOrList, dir]);
    if (!this._trigMgr.exec('before:orderBy', ctx)) return;
    this._sfMgr.sort(fieldOrList, dir);
    this._recalcRangeBearingFormulas();
    ctx.result = { sortList: this._sfMgr.sortList };
    this._trigMgr.exec('after:orderBy', ctx);
  }
  /**
   * 정렬을 초기 상태로 되돌린다.
   *
   * Reset sorting to the initial state.
   *
   * ソートを初期状態に戻します。
   *
   * 把排序恢复到初始状态。
   */
  resetOrder(): void { this._sfMgr.resetSort(); this._recalcRangeBearingFormulas(); }
  /**
   * 한 컬럼에 필터 조건을 걸어 조건에 맞는 행만 남긴다 — 필터 UI를 열지 않고 코드로 필터링할 때 쓴다.
   * 같은 컬럼에 다시 호출하면 그 컬럼 필터가 교체되고, 전체 해제는 `resetFilter()` 를 쓴다. 정렬과 마찬가지로
   * `before/after:setFilter` 트리거가 함께 돈다.
   *
   * Filter a column so only matching rows remain — for filtering from code without opening the filter UI.
   * Calling it again on the same column replaces that column's filter; clear everything via `resetFilter()`.
   * Like sorting, `before/after:setFilter` triggers run around it.
   *
   * 1 つの列にフィルター条件を掛け、条件に合う行だけを残します — フィルター UI を開かずにコードから絞り込むときに
   * 使います。同じ列に再度呼び出すとその列のフィルターが差し替わり、全解除は `resetFilter()` を使います。ソートと
   * 同じく `before/after:setFilter` トリガーが併せて走ります。
   *
   * 对 1 个列施加筛选条件,只留下符合条件的行 — 不打开筛选 UI、而从代码筛选时使用。
   * 对同一列再次调用会替换该列的筛选,全部解除请用 `resetFilter()`。与排序一样,
   * `before/after:setFilter` 触发器也会一并运行。
   *
   * @param field - 대상 컬럼 field
   *
   * Target column field
   *
   * 対象となる列の field
   *
   * 目标列的 field
   *
   * @param filterItems - 필터 조건 목록
   *
   * Filter conditions
   *
   * フィルター条件の一覧
   *
   * 筛选条件的列表
   */
  setFilter(field: string, filterItems: FilterItem[]): void {
    const ctx = this._trigMgr.mkCtx('setFilter', [field, filterItems]);
    if (!this._trigMgr.exec('before:setFilter', ctx)) return;
    this._sfMgr.setFilter(field, filterItems);
    this._recalcRangeBearingFormulas();
    ctx.result = { field, filteredCount: this._data.rowCount };
    this._trigMgr.exec('after:setFilter', ctx);
  }
  /**
   * 필터 해제(field 생략 시 전체).
   *
   * Clear filters (all when field omitted).
   *
   * フィルターの解除(field を省略すると全体)。
   *
   * 解除筛选(省略 field 则为全体)。
   */
  resetFilter(field?: string): void { this._sfMgr.resetFilter(field); this._recalcRangeBearingFormulas(); }

  /**
   * F3-R13/MCCONNELL-03(P0): 정렬/필터 후 범위-보유(hasRangeRef) 수식 전부 dirty(§3.5).
   *
   * F3-R13/MCCONNELL-03 (P0): after sort/filter, mark every range-bearing (hasRangeRef) formula dirty (§3.5).
   *
   * F3-R13/MCCONNELL-03(P0): ソート/フィルター後、範囲を保持する(hasRangeRef)数式をすべて dirty にします(§3.5)。
   *
   * F3-R13/MCCONNELL-03(P0): 排序/筛选后,把持有范围的(hasRangeRef)公式全部置为 dirty(§3.5)。
   */
  private _recalcRangeBearingFormulas(): void {
    this._formula.recalcRangeBearingFormulas();
  }
  /**
   * 현재 필터 상태 스냅샷.
   *
   * Snapshot of the current filter state.
   *
   * 現在のフィルター状態のスナップショット。
   *
   * 当前筛选状态的快照。
   */
  getFilterState(): Record<string, FilterItem[]> { return this._sfMgr.getFilterState(); }
  /**
   * 필터 상태를 복원한다.
   *
   * Restore a saved filter state.
   *
   * フィルター状態を復元します。
   *
   * 恢复筛选状态。
   */
  restoreFilter(state: Record<string, FilterItem[]>): void { this._sfMgr.restoreFilter(state); }
  private _applyFilters(): void { this._sfMgr.applyFilters(); }
  /**
   * 왼쪽 n개 컬럼을 가로 스크롤에도 고정한다. 이름·id 같은 식별 컬럼을 항상 보이게 두고 나머지만 좌우로 훑을 때 쓴다(n=0 이면 고정 해제).
   *
   * Freeze the leftmost n columns against horizontal scroll — keep identity columns (name/id) always visible while scrolling the rest (n=0 unfreezes).
   *
   * 左から n 列を横スクロールに対しても固定します。名前・id といった識別用の列を常に見えるようにし、残りだけを左右に見ていくときに使います(n=0 なら固定を解除)。
   *
   * 把左起 n 列对横向滚动也固定。想让名称、id 这类识别用的列始终可见,只把其余部分左右浏览时使用(n=0 则解除固定)。
   */
  freeze(n: number): void { this._colLayout.setFrozen(n); this._renderHeader(); this._doRender(...this._visRange()); }
  /**
   * 수동 병합: [{row, col, rowSpan?, colSpan?}]
   *
   * Manual merge: [{row, col, rowSpan?, colSpan?}]
   *
   * 手動結合: [{row, col, rowSpan?, colSpan?}]
   *
   * 手动合并: [{row, col, rowSpan?, colSpan?}]
   */
  mergeCells(cells: MergeCell[]): void {
    this._mergeEngine.applyMergeCells(cells);
    this._doRender(...this._visRange());
  }
  /**
   * 자동 병합: 지정 필드 컬럼에서 연속 같은 값을 rowSpan으로 묶는다.
   *
   * Auto merge: consecutive equal values in the given field columns are merged via rowSpan.
   *
   * 自動結合: 指定した field の列で、連続する同じ値を rowSpan でまとめます。
   *
   * 自动合并: 在指定 field 的列中,把连续相同的值用 rowSpan 归并。
   */
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

  /**
   * 병합 해제.
   *
   * Clear all merges.
   *
   * 結合の解除。
   *
   * 解除合并。
   */
  clearMerge(): void {
    this._mergeEngine.clear();
    this._doRender(...this._visRange());
  }
  /**
   * @deprecated no-op stub — 행 고정(freeze rows) 미구현. 컬럼 고정만 지원하며 `freeze(n)` 사용.
   *
   * no-op stub — frozen rows are not implemented; only column freezing via `freeze(n)`.
   *
   * no-op スタブ — 行の固定(freeze rows)は未実装です。列の固定のみ対応しており、`freeze(n)` を使ってください。
   *
   * no-op 桩 — 行的固定(freeze rows)未实现。仅支持列的固定,请用 `freeze(n)`。
   */
  freezeRows(_n: number): void {}
  /**
   * 지정한 필드 값이 같은 행끼리 접었다 펼 수 있는 그룹으로 묶는다(다중 필드면 계층 그룹). "부서별 → 팀별"처럼 데이터를 범주로 요약해 보여 줄 때 쓴다. 해제는 `clearGroup()`.
   *
   * Group rows sharing the given field values into collapsible groups (multiple fields → nested groups) — for summarizing data by category ("by dept → by team"). Undo with `clearGroup()`.
   *
   * 指定した field の値が同じ行どうしを、折りたたみ・展開できるグループにまとめます(複数 field なら階層グループ)。「部署別 → チーム別」のようにデータをカテゴリで要約して見せるときに使います。解除は `clearGroup()`。
   *
   * 把指定 field 的值相同的行,归并成可折叠、展开的组(多个 field 则为层级组)。想像「按部门 → 按团队」那样把数据按类别汇总展示时使用。解除用 `clearGroup()`。
   */
  groupBy(fields: string[]): void {
    const ctx = this._trigMgr.mkCtx('groupBy', [fields]);
    if (!this._trigMgr.exec('before:groupBy', ctx)) return;
    this._grpMgr.groupBy(fields);
    ctx.result = { fields };
    this._trigMgr.exec('after:groupBy', ctx);
  }
  /**
   * 그룹핑 해제.
   *
   * Clear grouping.
   *
   * グループ化の解除。
   *
   * 解除分组。
   */
  clearGroup(): void { this._grpMgr.clearGroup(); }
  /**
   * 모든 그룹 펼침.
   *
   * Expand all groups.
   *
   * すべてのグループを展開。
   *
   * 展开所有的组。
   */
  expandAll(): void { this._grpMgr.expandAll(); }
  /**
   * 모든 그룹 접힘.
   *
   * Collapse all groups.
   *
   * すべてのグループを折りたたみ。
   *
   * 折叠所有的组。
   */
  collapseAll(): void { this._grpMgr.collapseAll(); }
  /**
   * 트리 모드 활성화.
   *
   * Enable tree mode.
   *
   * ツリーモードの有効化。
   *
   * 启用树模式。
   */
  enableTree(): void { this._grpMgr.enableTree(); }
  /**
   * 트리 모드 비활성화.
   *
   * Disable tree mode.
   *
   * ツリーモードの無効化。
   *
   * 停用树模式。
   */
  disableTree(): void { this._grpMgr.disableTree(); }
  /**
   * 지정 트리 노드 펼침/접힘.
   *
   * Expand/collapse the given tree nodes.
   *
   * 指定したツリーノードの展開/折りたたみ。
   *
   * 指定的树节点的展开/折叠。
   */
  expandNodes(ids: any | any[], open = true): void { this._grpMgr.expandNodes(ids, open); }
  /**
   * 모든 트리 노드 펼침.
   *
   * Expand all tree nodes.
   *
   * すべてのツリーノードを展開。
   *
   * 展开所有的树节点。
   */
  expandAllNodes(): void { this._grpMgr.expandAllNodes(); }
  /**
   * 모든 트리 노드 접힘.
   *
   * Collapse all tree nodes.
   *
   * すべてのツリーノードを折りたたみ。
   *
   * 折叠所有的树节点。
   */
  collapseAllNodes(): void { this._grpMgr.collapseAllNodes(); }

  // ── F2: 마스터/디테일(11_design_F2_v2.md §6.2) / F2: master/detail ────────────────────────
  /**
   * 행 아래에 상세(마스터/디테일) 패널을 펼쳐 그 행의 하위 정보나 서브그리드를 보여 준다. 목록 행을 눌러 세부를 펼치는 UI를 코드로 여는 API다. rowRef 는 화면 위치(flat index)나 행 id({id})로 지정한다.
   *
   * Expand the master/detail panel under a row to reveal its sub-info or a subgrid — the code path for a click-to-expand row UI. Reference the row by on-screen position (flat index) or id ({id}).
   *
   * 行の下に詳細(マスター/ディテール)パネルを展開し、その行の下位情報やサブグリッドを見せます。一覧の行を押して詳細を開く UI を、コードから開く API です。rowRef は画面位置(flat index)または行 id({id})で指定します。
   *
   * 在行的下方展开明细(主从)面板,展示该行的下级信息或子表格。是把点击列表行以展开详情的 UI 从代码打开的 API。rowRef 用画面位置(flat index)或行 id({id})指定。
   */
  expandRow(rowRef: number | { id: string }): void { this._detailMgr.expandRow(rowRef); }
  /**
   * 행 상세 패널 접힘.
   *
   * Collapse the detail panel.
   *
   * 行の詳細パネルの折りたたみ。
   *
   * 折叠行的明细面板。
   */
  collapseRow(rowRef: number | { id: string }): void { this._detailMgr.collapseRow(rowRef); }
  /**
   * 행 상세 패널 토글.
   *
   * Toggle the detail panel.
   *
   * 行の詳細パネルのトグル。
   *
   * 切换行的明细面板。
   */
  toggleRow(rowRef: number | { id: string }): void { this._detailMgr.toggleRow(rowRef); }
  /**
   * 행 상세 패널 펼침 여부.
   *
   * Whether the detail panel is expanded.
   *
   * 行の詳細パネルが展開されているかどうか。
   *
   * 行的明细面板是否已展开。
   */
  isRowExpanded(rowRef: number | { id: string }): boolean { return this._detailMgr.isRowExpanded(rowRef); }
  /**
   * 모든 상세 패널 접힘.
   *
   * Collapse all detail panels.
   *
   * すべての詳細パネルの折りたたみ。
   *
   * 折叠所有的明细面板。
   */
  collapseAllDetails(): void { this._detailMgr.collapseAllDetails(); }
  /**
   * 상세 인스턴스(renderer 반환값 또는 자동 서브그리드; 펼친 적 없으면 undefined).
   *
   * Detail instance (renderer result or auto subgrid; undefined if never expanded).
   *
   * 詳細インスタンス(renderer の戻り値または自動サブグリッド。一度も展開していなければ undefined)。
   *
   * 明细实例(renderer 的返回值或自动子表格。一次都没展开过则为 undefined)。
   */
  getDetailInstance<D = any>(rowRef: number | { id: string }): D | undefined { return this._detailMgr.getDetailInstance<D>(rowRef); }
  /**
   * 열려 있는 상세 패널의 폭을 부모 그리드 컬럼 폭에 다시 맞춘다. 컬럼 크기를 바꾼 뒤 상세 패널 정렬이 어긋나 보일 때 수동으로 재동기한다(보통은 자동 처리됨).
   *
   * Re-sync open detail panels' widths to the parent column widths. Call it when panel alignment drifts after resizing columns (usually handled automatically).
   *
   * 開いている詳細パネルの幅を、親グリッドの列幅に合わせ直します。列のサイズを変えたあとに詳細パネルの位置がずれて見えるとき、手動で同期させます(通常は自動的に処理されます)。
   *
   * 把打开着的明细面板的宽度,重新对齐到父表格的列宽。改变列的尺寸后明细面板的对齐看起来错位时,手动同步(通常会自动处理)。
   */
  resyncPanelWidths(): void { this._detailMgr.resyncPanelWidths(); }
  /**
   * @deprecated no-op stub — 부모 지정 트리행 삽입 미구현. 평면 삽입은 `insertRow(item, pos)`,
   *   트리 구성은 `enableTree()`/`groupBy(fields)` 사용.
   *
   *   no-op stub — parented tree-row insertion is not implemented. Use `insertRow(item, pos)`
   *   for flat insertion and `enableTree()`/`groupBy(fields)` for tree structure.
   *
   *   no-op スタブ — 親を指定したツリー行の挿入は未実装です。平坦な挿入は `insertRow(item, pos)` を、
   *   ツリーの構成は `enableTree()`/`groupBy(fields)` を使ってください。
   *
   *   no-op 桩 — 指定父节点的树行插入未实现。平坦的插入请用 `insertRow(item, pos)`,
   *   树的构成请用 `enableTree()`/`groupBy(fields)`。
   */
  addTreeRow(_item: Partial<T>, _pid: string, _pos?: Position): void {}
  /**
   * 현재 그리드 내용을 엑셀(xlsx) 파일로 내려받게 한다. 문자열을 넘기면 파일명으로, 옵션 객체로는 컬럼·범위 등을 세밀 지정한다(기본은 보이는 데이터 전부).
   *
   * Download the current grid as an Excel (xlsx) file. A string is used as the filename; an options object fine-tunes columns/scope (defaults to all visible data).
   *
   * 現在のグリッドの内容を Excel(xlsx)ファイルとしてダウンロードさせます。文字列を渡すとファイル名として、オプションオブジェクトでは列・範囲などを細かく指定します(既定は見えているデータ全部)。
   *
   * 把当前表格的内容作为 Excel(xlsx)文件下载。传入字符串则作为文件名,用选项对象可细致指定列、范围等(默认是可见数据的全部)。
   */
  exportExcel(options?: ExportOptions | string): void { this._exportMgr.exportExcel(options); }
  /**
   * 현재 그리드 내용을 CSV 파일로 내려받게 한다(가벼운 텍스트 교환용). 옵션은 exportExcel 과 동일.
   *
   * Download the current grid as a CSV file (lightweight text interchange); same options as exportExcel.
   *
   * 現在のグリッドの内容を CSV ファイルとしてダウンロードさせます(軽量なテキスト交換用)。オプションは exportExcel と同じです。
   *
   * 把当前表格的内容作为 CSV 文件下载(用于轻量的文本交换)。选项与 exportExcel 相同。
   */
  exportCsv(options?: ExportOptions | string): void { this._exportMgr.exportCsv(options); }
  /**
   * 현재 그리드 내용을 JSON 파일로 내려받게 한다(원본 객체 구조 보존). 옵션은 exportExcel 과 동일.
   *
   * Download the current grid as a JSON file (preserves the object structure); same options as exportExcel.
   *
   * 現在のグリッドの内容を JSON ファイルとしてダウンロードさせます(元のオブジェクト構造を保持)。オプションは exportExcel と同じです。
   *
   * 把当前表格的内容作为 JSON 文件下载(保留原始的对象结构)。选项与 exportExcel 相同。
   */
  exportJson(options?: ExportOptions | string): void { this._exportMgr.exportJson(options); }
  /**
   * 인쇄용 창을 연다.
   *
   * Open the print view.
   *
   * 印刷用のウィンドウを開きます。
   *
   * 打开打印用的窗口。
   */
  print(options?: { title?: string; excludeFields?: string[] }): void { this._exportMgr.print(options); }

  /**
   * 데이터 배열 변환.
   *
   * Convert the data set.
   *
   * データ配列の変換。
   *
   * 数据数组的转换。
   *
   * @param keyValue - true = 객체 배열(기본), false = 값 2D 배열
   *
   * true = object array (default), false = 2D value array
   *
   * true = オブジェクト配列(既定)、false = 値の 2 次元配列
   *
   * true = 对象数组(默认),false = 值的二维数组
   */
  toArray(keyValue = true): any[] {
    const data = this._data.getData();
    if (keyValue) return data;
    const cols = this._colLayout.visibleLeaves;
    return data.map(row => cols.map(c => row[c.field]));
  }
  /**
   * 사용자가 검색 결과나 차트 클릭으로 특정 행을 가리켰을 때, 그 행이 화면에 보이도록 스크롤하고 선택 표시까지
   * 해 준다. 큰 데이터에서 "어디였더라"를 없애는 이동 도우미다.
   *
   * When a search result or chart click points at a specific row, scroll it into view and select it.
   * A navigation helper that removes the "where was it again?" problem in large data.
   *
   * ユーザーが検索結果やチャートのクリックで特定の行を指し示したとき、その行が画面に見えるようスクロールし、選択表示
   * までを行います。大きなデータで「どこだったか」をなくす移動のヘルパーです。
   *
   * 当用户通过搜索结果或点击图表指向特定的行时,滚动到该行在画面上可见的位置,并做出选中标示。
   * 是在大数据中消除「刚才在哪来着」的移动辅助函数。
   *
   * @param rowIndex - 이동할 행의 위치(flat index)
   *
   * Position (flat index) of the row to jump to
   *
   * 移動先の行の位置(flat index)
   *
   * 要移动到的行的位置(flat index)
   */
  jumpToRow(rowIndex: number): void {
    this._rowMgr.selectSingle(rowIndex);
    this._vs?.scrollToRow(rowIndex);
    this._doRender(...this._visRange());
  }
  /**
   * @deprecated no-op stub — 특정 컬럼으로 가로 스크롤 이동 미구현. 행 이동은 `jumpToRow(rowIndex)` 사용.
   *
   * no-op stub — horizontal jump-to-column is not implemented; use `jumpToRow(rowIndex)`.
   *
   * no-op スタブ — 特定の列への横スクロール移動は未実装です。行の移動は `jumpToRow(rowIndex)` を使ってください。
   *
   * no-op 桩 — 向特定列的横向滚动移动未实现。行的移动请用 `jumpToRow(rowIndex)`。
   */
  jumpToCol(_field: string): void {}
  /**
   * 현재 스크롤 좌표.
   *
   * Current scroll position.
   *
   * 現在のスクロール座標。
   *
   * 当前的滚动坐标。
   */
  getScrollPos(): { x: number; y: number } {
    return { x: this._renderer?.bodyWrapper.scrollLeft ?? 0, y: this._renderer?.bodyWrapper.scrollTop ?? 0 };
  }
  /**
   * 푸터 정의를 교체하고 다시 그린다.
   *
   * Replace footer definitions and re-render the footer.
   *
   * フッター定義を差し替えて描画し直します。
   *
   * 替换页脚定义并重新绘制。
   */
  setFooter(fd: any[]): void {
    this._options.footer = fd as any;
    this._renderFooterEl();
  }
  /**
   * 푸터 집계값 목록.
   *
   * Computed footer values.
   *
   * フッターの集計値の一覧。
   *
   * 页脚的汇总值的列表。
   */
  getFooterData(): any[] { return this._footerMgr.computeValues(); }
  /**
   * 특정 field 의 푸터 집계값(없으면 null).
   *
   * Footer value of the field (null when absent).
   *
   * 特定の field のフッター集計値(なければ null)。
   *
   * 特定 field 的页脚汇总值(没有则为 null)。
   */
  getFooterValue(field: string): any {
    return this._footerMgr.computeValues().find((r: any) => r._field === field)?._value ?? null;
  }
  private _renderFooterEl(): void { this._footerMgr.render(); }

  /**
   * 그리드 크기를 변경하고 재배치한다.
   *
   * Resize the grid and relayout.
   *
   * グリッドのサイズを変更して再配置します。
   *
   * 变更表格的尺寸并重新布局。
   */
  resize(w?: number, h?: number): void {
    if (w) this._container.style.width = `${w}px`;
    if (h) this._container.style.height = `${h}px`;
    this._onResize();
  }
  /**
   * 색 테마(data-og-theme)를 전환한다.
   *
   * Switch the color theme (data-og-theme).
   *
   * カラーテーマ(data-og-theme)を切り替えます。
   *
   * 切换颜色主题(data-og-theme)。
   */
  setTheme(theme: string): void { this._container.setAttribute('data-og-theme', theme); }
  /**
   * 색 축 CSS 변수 1개를 런타임 설정한다.
   *
   * Set one color-axis CSS variable at runtime.
   *
   * 色軸の CSS 変数を 1 つ、ランタイムで設定します。
   *
   * 在运行时设置 1 个颜色轴的 CSS 变量。
   */
  setThemeVar(k: string, v: string): void { this._container.style.setProperty(k, v); }

  /**
   * 이 그리드의 스킨(형태 축)을 런타임에 바꾼다 — `defineSkin` 으로 등록해 둔 스킨 id 를 골라 적용한다.
   * 색 테마와는 완전히 별개라 색은 하나도 건드리지 않고 모서리·외곽선 같은 "생김새"만 바뀐다. 전환하면
   * 형태 토큰을 다시 해석해야 하므로 헤더와 본문을 한 번 다시 그린다(스킨을 쓸 때만 드는 비용).
   *
   * Switch this grid's skin (the form axis) at runtime — pick a skin id registered via `defineSkin`.
   * Fully separate from color themes, so no color changes; only the "look" (radius, border, …) changes.
   * Switching re-resolves form tokens, so the header and body are re-rendered once (a cost paid only when
   * you use skins).
   *
   * このグリッドのスキン(形状軸)をランタイムで変えます — `defineSkin` で登録しておいたスキン id を選んで適用します。
   * カラーテーマとは完全に別なので、色にはいっさい触れず、角丸・輪郭線といった「見た目」だけが変わります。切り替えると
   * 形状トークンを解決し直す必要があるため、ヘッダーと本文を 1 回描画し直します(スキンを使うときだけ掛かるコスト)。
   *
   * 在运行时改变这个表格的皮肤(形状轴)— 挑选用 `defineSkin` 注册好的皮肤 id 应用。
   * 与颜色主题完全无关,因此完全不碰颜色,只改变圆角、轮廓线这类「外观」。切换时需要重新解析
   * 形状 token,因此把表头与主体重新绘制 1 次(只有使用皮肤时才付出的成本)。
   *
   * @param skin - 적용할 스킨 id('default' = 기본 형태)
   *
   * Skin id to apply ('default' = stock form)
   *
   * 適用するスキン id('default' = 標準の形状)
   *
   * 要应用的皮肤 id('default' = 默认形状)
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
  /**
   * 지금 적용된 스킨 id 를 돌려준다('default' = 기본 형태). 어떤 스킨이 걸려 있는지 확인하거나 토글할 때 쓴다.
   *
   * Return the currently applied skin id ('default' = stock form) — to check or toggle which skin is active.
   *
   * いま適用されているスキン id を返します('default' = 標準の形状)。どのスキンが掛かっているかを確認したり、トグルしたりするときに使います。
   *
   * 返回当前已应用的皮肤 id('default' = 默认形状)。用于确认挂着哪个皮肤,或做切换。
   */
  getSkin(): string { return this._options.skin ?? 'default'; }

  /**
   * 이 그리드 인스턴스에서만 특정 아이콘 role(정렬 화살표·삭제 아이콘 등) 하나를 다른 아이콘으로 바꾼다.
   * 전역 `defineIconSet` 과 달리 다른 그리드에는 영향을 주지 않는다(인스턴스별 격리) — 한 화면에서만 아이콘을
   * 커스터마이즈하고 싶을 때 쓴다. svgOrKey 는 알려진 아이콘 key 이거나 원시 SVG 본문이며, 없는 role/글리프를
   * 넘겨도 안전하게 폴백한다(throw 하지 않음). 체이닝용 this 를 돌려준다.
   *
   * Replace a single icon role (sort arrow, delete icon, …) for this grid instance only. Unlike the
   * global `defineIconSet`, it does not affect other grids (per-instance isolation) — use it to customize
   * icons on one screen. svgOrKey is a known icon key or raw SVG body; unknown roles/glyphs fall back
   * safely (never throws). Returns this for chaining.
   *
   * このグリッドインスタンスでのみ、特定のアイコン role(ソート矢印・削除アイコンなど)を 1 つ別のアイコンに差し替え
   * ます。グローバルな `defineIconSet` と違い、ほかのグリッドには影響しません(インスタンスごとの分離) — 1 つの画面
   * だけでアイコンをカスタマイズしたいときに使います。svgOrKey は既知のアイコン key、または生の SVG 本体で、存在しない
   * role/グリフを渡しても安全にフォールバックします(throw しません)。チェーン用に this を返します。
   *
   * 只在这个表格实例上,把特定的图标 role(排序箭头、删除图标等)换成别的图标。
   * 与全局的 `defineIconSet` 不同,不会影响其他表格(按实例隔离)— 想只在一个画面上自定义图标时使用。
   * svgOrKey 是已知的图标 key,或原始 SVG 主体;传入不存在的 role/字形也会安全回退(不会 throw)。
   * 返回用于链式调用的 this。
   *
   * @param role - 시맨틱 아이콘 role
   *
   * Semantic icon role
   *
   * セマンティックなアイコン role
   *
   * 语义图标 role
   *
   * @param svgOrKey - 아이콘 key 또는 원시 SVG
   *
   * Icon key or raw SVG
   *
   * アイコン key または生の SVG
   *
   * 图标 key 或原始 SVG
   *
   * @returns 체이닝용 this
   *
   * this for chaining
   *
   * チェーン用の this
   *
   * 用于链式调用的 this
   */
  // R12c(계약 C13): per-instance 아이콘 오버라이드는 전역 iconRegistry 의 child 에만 기록(멀티그리드 격리). R11 iconResolver 슬롯으로도 표면화.
  setIcon(role: string, svgOrKey: string): this {
    if (!this._icons) this._icons = iconRegistry.child();
    this._icons.register(role, svgOrKey);
    // R11 iconResolver 슬롯(있으면)으로 표면화 — role → 렌더 마크업 해석기(발견/디버깅용).
    try {
      this._extensions?.strategy('iconResolver', (r: string, opts?: any) => this._icons!.render(r, opts));
    } catch { /* 커널 미준비 등 — best-effort */ }
    return this;
  }

  /**
   * 아이콘 role 을 실제 렌더용 마크업(또는 SVGElement)으로 해석한다. 인스턴스 오버라이드(setIcon)가 있으면 그것을, 없으면 전역 아이콘을 쓴다. 커스텀 셀·버튼에 그리드와 같은 아이콘을 직접 그려 넣을 때 쓴다.
   *
   * Resolve an icon role to render markup (or an SVGElement), using this instance's override (setIcon) first, then the global icon — for drawing grid-consistent icons into custom cells/buttons.
   *
   * アイコン role を実際のレンダリング用マークアップ(または SVGElement)へ解決します。インスタンスのオーバーライド(setIcon)があればそれを、なければグローバルのアイコンを使います。カスタムセルやボタンに、グリッドと同じアイコンを自分で描き込むときに使います。
   *
   * 把图标 role 解析为实际渲染用的标记(或 SVGElement)。有实例的覆盖(setIcon)就用它,没有则用全局的图标。想在自定义单元格或按钮上亲手画入与表格相同的图标时使用。
   */
  renderIcon(role: string, opts?: { size?: number; title?: string; el?: boolean }): string | SVGElement {
    return (this._icons ?? iconRegistry).render(role, opts);
  }

  /**
   * i18n: 이 인스턴스의 UI 로케일을 전환한다. setSkin 진영 — 데이터 불변 + 크롬/가시창 부분 재렌더.
   * `lang` 속성을 로케일 Intl 태그로 갱신(스크린리더 발음 전환), 상주 크롬(페이지네이션/찾기)의
   * 라벨을 새로 그리고, 캐시된 필터 패널을 무효화한 뒤 헤더+가시창을 1회 재렌더한다.
   * 미등록 로케일은 throw 하지 않고 폴백 유지(never-throw). 전환 후 `localeChange` 이벤트 발화.
   *
   * i18n: switch this instance's UI locale. setSkin camp — data-immutable + partial chrome/viewport
   * re-render. Updates `lang` to the locale's Intl tag (screen-reader pronunciation), refreshes
   * resident chrome labels (pagination/find), invalidates the cached filter panel, then re-renders
   * the header + visible window once. Unknown locales never throw. Emits `localeChange` afterwards.
   *
   * i18n: このインスタンスの UI ロケールを切り替えます。setSkin の陣営 — データは不変 + クロム/可視領域の部分再
   * レンダーです。`lang` 属性をロケールの Intl タグに更新し(スクリーンリーダーの発音を切り替え)、常駐クロム
   * (ページネーション/検索)のラベルを描き直し、キャッシュされたフィルターパネルを無効化したうえで、ヘッダー+可視
   * 領域を 1 回再レンダーします。未登録のロケールは throw せずフォールバックを維持します(never-throw)。切り替え後に
   * `localeChange` イベントを発火します。
   *
   * i18n: 切换这个实例的 UI 区域设置。属于 setSkin 阵营 — 数据不变 + 外壳/可视区的部分重新渲染。
   * 把 `lang` 属性更新为区域设置的 Intl 标签(切换屏幕阅读器的发音),重绘常驻外壳
   * (分页/查找)的标签,使缓存的筛选面板失效,然后把表头 + 可视区重新渲染 1 次。
   * 未注册的区域设置不会 throw,而是保持回退(never-throw)。切换后触发 `localeChange` 事件。
   *
   * @param locale - 로케일 id(예 'en')
   *
   * Locale id (e.g. 'en')
   *
   * ロケール id(例 'en')
   *
   * 区域设置 id(例 'en')
   *
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

  /**
   * i18n: 현재 인스턴스 로케일 id('ko' = 기본).
   *
   * i18n: current instance locale id ('ko' = default).
   *
   * i18n: 現在のインスタンスのロケール id('ko' = 既定)。
   *
   * i18n: 当前实例的区域设置 id('ko' = 默认)。
   */
  getLocale(): string { return (this._locales ?? localeRegistry).active(); }

  /**
   * i18n: 이 인스턴스만 단일 메시지를 오버라이드(setIcon 동형 — 첫 호출 때 child 지연 생성, 멀티그리드 격리).
   * 자동 재렌더는 하지 않는다(다음 렌더/setLocale 때 반영).
   *
   * i18n: override a single message for this instance only (isomorphic to setIcon — lazy child on first
   * call, multi-grid isolation). No auto re-render (applied on the next render/setLocale).
   *
   * i18n: このインスタンスだけで単一のメッセージをオーバーライドします(setIcon と同型 — 初回呼び出し時に child を
   * 遅延生成、マルチグリッドで分離)。自動の再レンダーは行いません(次のレンダー/setLocale 時に反映)。
   *
   * i18n: 只在这个实例上覆盖单条消息(与 setIcon 同型 — 首次调用时延迟生成 child,多表格隔离)。
   * 不做自动的重新渲染(在下一次渲染/setLocale 时反映)。
   *
   * @param key - dot-key 메시지 키(예 'filter.apply')
   *
   * dot-key message key (e.g. 'filter.apply')
   *
   * dot-key 形式のメッセージキー(例 'filter.apply')
   *
   * dot-key 形式的消息键(例 'filter.apply')
   *
   * @param value - 문자열('{name}' 보간) 또는 함수
   *
   * string ('{name}' interpolation) or a function
   *
   * 文字列('{name}' の補間)または関数
   *
   * 字符串('{name}' 插值)或函数
   *
   * @returns 체이닝용 this
   *
   * this for chaining
   *
   * チェーン用の this
   *
   * 用于链式调用的 this
   */
  setMessage(key: LocaleMessageKey | string, value: MessageValue): this {
    (this._locales ??= localeRegistry.child()).setOverride(key, value);
    return this;
  }

  /**
   * i18n: 메시지를 해석한다(인스턴스 오버라이드 우선 → 활성 로케일 → ko → 키 원문). throw 하지 않음 —
   * 렌더 루프(셀 aria) 소비자용.
   *
   * i18n: resolve a message (instance override → active locale → ko → the key itself). Never throws —
   * for render-loop consumers (cell aria).
   *
   * i18n: メッセージを解決します(インスタンスのオーバーライド優先 → 有効なロケール → ko → キーの原文)。throw しま
   * せん — レンダーループ(セルの aria)の利用者向けです。
   *
   * i18n: 解析消息(实例的覆盖优先 → 有效的区域设置 → ko → 键的原文)。不会 throw —
   * 面向渲染循环(单元格的 aria)的使用者。
   *
   * @param key - dot-key 메시지 키
   *
   * dot-key message key
   *
   * dot-key 形式のメッセージキー
   *
   * dot-key 形式的消息键
   *
   * @param params - `{name}` 보간 파라미터
   *
   * `{name}` interpolation params
   *
   * `{name}` の補間パラメータ
   *
   * `{name}` 的插值参数
   *
   * @returns 해석된 문자열(미등록 키면 키 원문)
   *
   * Resolved string (the key itself when unknown)
   *
   * 解決された文字列(未登録のキーならキーの原文)
   *
   * 解析后的字符串(未注册的键则为键的原文)
   */
  t(key: LocaleMessageKey | string, params?: Record<string, string | number>): string {
    return (this._locales ?? localeRegistry).t(key, params);
  }
  /**
   * 형태(FORM 축) CSS 변수 하나를 런타임에 덮어쓴다 — 색 변수를 바꾸는 `setThemeVar` 의 형태 축 짝이다.
   * 스킨 하나를 통째로 만들 필요 없이 모서리 반경 하나만 살짝 조정하고 싶을 때 쓴다. 값은 컨테이너 인라인
   * 스타일로 들어가 스타일시트를 항상 이긴다. 색·형태를 섞지 않도록 색 값을 넣으면 **throw** 한다.
   *
   * Override a single form-axis CSS variable at runtime — the form-axis sibling of `setThemeVar`
   * (which changes color variables). Use it to nudge one token (e.g. a radius) without defining a whole
   * skin. The value goes in as container-inline style, so it always beats stylesheets. To keep color and
   * form separate, passing a color value **throws**.
   *
   * 形状(FORM 軸)の CSS 変数を 1 つ、ランタイムで上書きします — 色の変数を変える `setThemeVar` の、形状軸における
   * 対です。スキンを 1 つまるごと作らなくても、角丸の半径だけを少し調整したいときに使います。値はコンテナのインライン
   * スタイルとして入るため、常にスタイルシートに勝ちます。色と形状を混ぜないよう、色の値を入れると **throw** します。
   *
   * 在运行时覆盖 1 个形状(FORM 轴)的 CSS 变量 — 是改变颜色变量的 `setThemeVar` 在形状轴上的
   * 对应物。无需整个做出一个皮肤,只想稍微调整圆角半径时使用。值以容器的内联样式进入,
   * 因此总能胜过样式表。为了不把颜色与形状混在一起,放入颜色值会 **throw**。
   *
   * @param k - CSS 변수 이름(예 '--og-radius-md')
   *
   * CSS variable name (e.g. '--og-radius-md')
   *
   * CSS 変数名(例 '--og-radius-md')
   *
   * CSS 变量名(例 '--og-radius-md')
   *
   * @param v - 형태 값(색값 넣으면 throw)
   *
   * Form value (throws on a color value)
   *
   * 形状の値(色値を入れると throw)
   *
   * 形状的值(放入颜色值则 throw)
   */
  setSkinVar(k: string, v: string): void {
    if (/#[0-9a-fA-F]{3,8}\b/.test(v) || /\b(?:rgba?|hsla?)\(\s*\d/.test(v)) {
      throw new Error(`[OpenGrid.setSkinVar] "${k}: ${v}" 에 색 리터럴 — 색은 setThemeVar 축입니다(색⊥형태).`);
    }
    this._container.style.setProperty(k, v);
  }

  /**
   * 행 간격의 촘촘함(밀도)을 바꾼다 — 같은 데이터를 화면에 더 빽빽하게('compact') 또는 여유 있게
   * ('comfortable') 보여 줄 때 쓴다. 행 높이·안쪽 여백 토큰만 조정하는 순수 가산적 변경이라 색·형태·질감은
   * 전혀 건드리지 않는다. 밀도는 행 높이를 바꾸므로 좌표를 다시 계산해야 할 때 창 크기 변경과 똑같은 경로로
   * 재배치한다. 없는 이름을 넘겨도 안전하게 기본값으로 되돌아간다(throw 안 함).
   *
   * Change how tightly rows are packed (density) — show the same data more compactly ('compact') or with
   * more breathing room ('comfortable'). It adjusts only row-height/padding tokens (purely additive), never
   * touching color/form/texture. Because density changes row height, it relayouts via the same path as a
   * window resize when needed. An unknown name safely falls back to the default (never throws).
   *
   * 行間の詰まり具合(密度)を変えます — 同じデータを画面によりぎっしり('compact')、またはゆったり('comfortable')
   * 見せるときに使います。行の高さ・内側の余白のトークンだけを調整する純粋に加算的な変更なので、色・形状・質感には
   * いっさい触れません。密度は行の高さを変えるため、座標を計算し直す必要があるときはウィンドウのサイズ変更と同じ経路で
   * 再配置します。存在しない名前を渡しても安全に既定値へ戻ります(throw しません)。
   *
   * 改变行间的紧密程度(密度)— 想把同样的数据在画面上显示得更密('compact')或更宽松('comfortable')
   * 时使用。它只调整行高、内侧留白的 token,是纯粹加算式的变更,完全不碰颜色、形状、质感。
   * 因为密度会改变行高,需要重新计算坐标时,以与窗口尺寸变更相同的路径重新布局。
   * 传入不存在的名称也会安全地回到默认值(不会 throw)。
   *
   * @param name - 밀도 값 id(예 'compact', 'comfortable')
   *
   * Density value id (e.g. 'compact')
   *
   * 密度の値 id(例 'compact'、'comfortable')
   *
   * 密度的值 id(例 'compact'、'comfortable')
   */
  // DD-11 S2b: DENSITY(제4 외관축) — data-og-density + --og-density-* 토큰. 색⊥형태⊥밀도⊥질감 직교. ⚠️ 대용량 relayout 실측은 도커 검증 이연.
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
   * 배경 질감을 바꾼다 — 밋밋한 배경 대신 리넨('linen')·종이결('paper-grain')·모눈('graph') 같은 결을 깔고
   * 싶을 때 쓴다. 배경 페인트만 바꾸는 순수 가산적 변경이라 행 위치는 그대로다(재배치 없음). 색·형태·밀도 축과
   * 따로 논다. 없는 이름을 넘겨도 안전하게 기본(질감 없음)으로 되돌아간다(throw 안 함).
   *
   * Change the background texture — lay a grain like linen ('linen'), paper ('paper-grain'), or a grid
   * ('graph') over the plain background. It only repaints the background (purely additive), so row positions
   * stay put (no relayout). Independent of the color/form/density axes. An unknown name safely falls back to
   * none (never throws).
   *
   * 背景の質感を変えます — のっぺりした背景の代わりに、リネン('linen')・紙目('paper-grain')・方眼('graph')といった
   * 風合いを敷きたいときに使います。背景のペイントだけを変える純粋に加算的な変更なので、行の位置はそのままです
   * (再配置なし)。色・形状・密度の各軸とは独立しています。存在しない名前を渡しても安全に既定(質感なし)へ戻ります
   * (throw しません)。
   *
   * 改变背景的质感 — 想在平淡的背景上铺一层亚麻('linen')、纸纹('paper-grain')、方格('graph')这类
   * 纹理时使用。它只改变背景的绘制,是纯粹加算式的变更,因此行的位置保持不变(无需重新布局)。
   * 与颜色、形状、密度各轴互不相干。传入不存在的名称也会安全地回到默认(无质感)(不会 throw)。
   *
   * @param name - 질감 값 id(예 'linen', 'paper-grain', 'graph')
   *
   * Texture value id (e.g. 'linen')
   *
   * 質感の値 id(例 'linen'、'paper-grain'、'graph')
   *
   * 质感的值 id(例 'linen'、'paper-grain'、'graph')
   */
  // DD-11 S2b: TEXTURE(제3 외관축) — data-og-texture + --og-texture-* 토큰. 배경 페인트만이라 relayout 없음. ⚠️ 실렌더 육안 확인은 도커 검증 이연.
  setTexture(name: string): void {
    const res = textureRegistry.resolve(name);
    if (res.attr) this._container.setAttribute(res.attr.name, res.attr.value);
    else this._container.removeAttribute('data-og-texture');
    for (const k of TEXTURE_TOKENS) this._container.style.removeProperty(k);
    for (const [k, v] of Object.entries(res.tokens)) this._container.style.setProperty(k, v);
  }
  /**
   * 트리거 등록('before:{op}' 취소 가능, 'after:{op}' 결과 수신).
   *
   * Register a trigger ('before:{op}' can cancel, 'after:{op}' receives the result).
   *
   * トリガーの登録('before:{op}' はキャンセル可能、'after:{op}' は結果を受け取ります)。
   *
   * 注册触发器('before:{op}' 可取消,'after:{op}' 接收结果)。
   *
   * @param event - 트리거 이벤트명
   *
   * Trigger event name
   *
   * トリガーのイベント名
   *
   * 触发器的事件名
   *
   * @param handler - 핸들러(ctx.cancel() 지원)
   *
   * Handler (supports ctx.cancel())
   *
   * ハンドラ(ctx.cancel() に対応)
   *
   * 处理函数(支持 ctx.cancel())
   *
   * @returns 체이닝용 this
   *
   * this for chaining
   *
   * チェーン用の this
   *
   * 用于链式调用的 this
   *
   * @example
   * grid.addTrigger('before:insertRow', ctx => { if (!ctx.args[0]?.name) ctx.cancel(); });
   */
  addTrigger(event: TriggerEvent | string, handler: TriggerHandler): this {
    this._trigMgr.add(event, handler); return this;
  }
  /**
   * 트리거 제거.
   *
   * Remove a trigger.
   *
   * トリガーの削除。
   *
   * 删除触发器。
   */
  removeTrigger(event: TriggerEvent | string, handler: TriggerHandler): this {
    this._trigMgr.remove(event, handler); return this;
  }
  /**
   * 트리거 전체 또는 특정 이벤트 클리어.
   *
   * Clear all triggers or those of one event.
   *
   * トリガー全体、または特定イベントのトリガーのクリア。
   *
   * 清除触发器的全体,或特定事件的触发器。
   */
  clearTriggers(event?: TriggerEvent | string): this {
    this._trigMgr.clear(event); return this;
  }
  private _mkCtx(operation: string, args: any[]): TriggerContext { return this._trigMgr.mkCtx(operation, args); }
  private _trig(event: string, ctx: TriggerContext): boolean { return this._trigMgr.exec(event, ctx); }

  /**
   * 그리드를 파괴한다(옵저버/이벤트/차트/패널 해제, DOM 정리, override 전체 복구).
   *
   * Destroy the grid (detach observers/events/charts/panels, clean the DOM, restore all overrides).
   *
   * グリッドを破棄します(オブザーバ/イベント/チャート/パネルの解除、DOM の後片付け、override の全復元)。
   *
   * 销毁表格(解除观察器/事件/图表/面板,清理 DOM,恢复全部 override)。
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


