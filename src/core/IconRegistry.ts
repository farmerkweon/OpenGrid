// ============================================================
// IconRegistry — 시맨틱 ROLE → 아이콘 글리프 해석 (item3 §5.1 / R12c, 계약 C13)
// ------------------------------------------------------------
// 설계 근거(Why):
//   현상맵/`90_skin_system_design.md` §5.1 — 그리드 UI 의 아이콘이 렌더러/컨트롤 곳곳에
//   **하드코딩 인라인 SVG** 로 흩어져 있어, 스킨(FORM 축)이나 호스트가 아이콘을 교체할
//   단일 지점이 없다(정렬 화살표·필터 깔때기·마스킹 눈·확장 화살표 등).
//   R12c 는 그 해소책으로 **시맨틱 ROLE 레지스트리**를 둔다: 렌더 코드는 `'sort.asc'` 같은
//   역할만 물어보고, 실제 글리프(Bootstrap Icons v1.13.1, MIT — `icons/bootstrap-icons.ts`)와
//   스킨 토큰(`--og-icon-*`) 결합은 이 한 곳이 책임진다. 확대의 부담이 "코어 편집" 에서
//   "레지스트리 등록(register/setIcon/defineIconSet)" 으로 이동한다(R11 확장점 철학과 동형).
//
// 스킨 토큰 결합(R12b `AppearanceResolver`/`skins.css` 의 `--og-icon-*`):
//   * `--og-icon-corner`  → svg 인라인 `stroke-linejoin`(기본 miter = SVG 기본값이라 무변경).
//   * `--og-icon-fill`    → 채움/윤곽 **변형 선택 힌트**(0=outline/1=filled). 이 토큰은 색이 아니라
//     0/1 이라 CSS `fill` 프로퍼티에 바인딩하면 자식 path 의 presentation `fill="#fff"` 를
//     CSS 캐스케이드가 덮어써 렌더가 깨진다(마스킹 눈의 흰 동공). 따라서 `fill` 은 **presentation
//     attribute** `fill="currentColor"` 로 두어 오늘의 렌더와 byte-identical 을 보존하고,
//     variant 선택(filled vs outline role key)은 레지스트리 등록 층에서 다룬다(명시적 결합).
//
// 행동 보존:
//   `render('mask.reveal', { size: 13 })` 는 기존 마스킹 셀의 커스텀 눈 SVG 와 **시각적으로 동일**
//   (동일 viewBox·동일 두 path·흰 동공·fill=currentColor). stroke 를 쓰지 않는 글리프라
//   추가된 `stroke-linejoin` 은 no-op.
// ============================================================

import { BOOTSTRAP_ICONS, ICON_VIEWBOX } from './icons/bootstrap-icons.js';

/**
 * render() 옵션. size 미지정 시 svg 는 viewBox/CSS 로 크기를 상속(width/height 속성 생략).
 *
 * render() options. When size is omitted, the svg inherits its size from viewBox/CSS (width/height attrs skipped).
 *
 * render() のオプション。size を指定しない場合、svg は viewBox/CSS からサイズを継承します(width/height 属性は省略)。
 *
 * render() 选项。未指定 size 时，svg 从 viewBox/CSS 继承尺寸(省略 width/height 属性)。
 */
export interface IconRenderOptions {
  /**
   * px 정사각 크기(width=height). 미지정 시 속성 생략(CSS/컨테이너가 결정).
   *
   * Square size in px (width=height); omitted when unset (CSS/container decides).
   *
   * px 単位の正方形サイズ(width=height)。未指定時は属性を省略(CSS/コンテナが決定)。
   *
   * 以 px 为单位的正方形尺寸(width=height)。未指定时省略该属性(由 CSS/容器决定)。
   */
  size?: number;
  /**
   * 접근성 제목. 지정 시 <title> + role="img" 추가(스크린리더). 미지정 시 장식용(부모가 aria 담당).
   *
   * Accessible title; adds <title> + role="img" when set (screen readers). Decorative otherwise (parent owns aria).
   *
   * アクセシビリティ用のタイトル。指定時は <title> と role="img" を追加(スクリーンリーダー)。未指定時は装飾用(aria は親が担当)。
   *
   * 无障碍标题。指定时添加 <title> 和 role="img"(供屏幕阅读器)。未指定时为装饰性图标(aria 由父元素负责)。
   */
  title?: string;
  /**
   * true → SVGElement(DOMParser) 반환. 기본 false → SVG 마크업 문자열.
   *
   * true → return an SVGElement (DOMParser). Default false → SVG markup string.
   *
   * true → SVGElement(DOMParser)を返します。既定の false → SVG マークアップ文字列。
   *
   * true → 返回 SVGElement(DOMParser)。默认 false → 返回 SVG 标记字符串。
   *
   * @defaultValue false
   */
  el?: boolean;
}

/**
 * 시맨틱 role → 아이콘 key(`BOOTSTRAP_ICONS` 의 symbolId) 기본 매핑. 이 표 자체를 고치는 것은
 * 라이브러리 소스에 손대는 것과 같으므로, 앱에서 아이콘을 바꾸고 싶으면 이 표 대신
 * `grid.setIcon(role, key)`(인스턴스 한정) 또는 `defineIconSet()`(전역)으로 등록하는 것이 정석이다.
 *
 * Default map of semantic role → icon key (a `BOOTSTRAP_ICONS` symbolId). Editing this table
 * means touching library source, so apps that want a different icon should instead register one
 * via `grid.setIcon(role, key)` (per instance) or `defineIconSet()` (globally).
 *
 * セマンティックな role → アイコン key(`BOOTSTRAP_ICONS` の symbolId)の既定マッピング。この表そのものを直すことは
 * ライブラリのソースに手を入れるのと同じなので、アプリでアイコンを変えたい場合はこの表ではなく
 * `grid.setIcon(role, key)`(インスタンス限定)または `defineIconSet()`(グローバル)で登録するのが定石です。
 *
 * 语义 role → 图标 key(`BOOTSTRAP_ICONS` 中的 symbolId)的默认映射。改这张表等于改动库的源码，
 * 所以应用要换图标时，不要动这张表，而应通过 `grid.setIcon(role, key)`(限当前实例)
 * 或 `defineIconSet()`(全局)注册。
 *
 * 렌더 코드는 이 역할 이름만 참조한다.
 * 참고 스왑: `row.delete`→`trash3`(Bootstrap 의 표준 휴지통), `chart.line`→`graph-up`.
 *
 * Render code references only these role names.
 * Example swap: `row.delete`→`trash3` (Bootstrap's standard trash-can icon), `chart.line`→`graph-up`.
 *
 * レンダーコードはこの役割名だけを参照します。
 * 参考スワップ: `row.delete`→`trash3`(Bootstrap の標準ゴミ箱), `chart.line`→`graph-up`。
 *
 * 渲染代码只引用这些角色名。
 * 替换示例: `row.delete`→`trash3`(Bootstrap 的标准垃圾桶图标), `chart.line`→`graph-up`。
 */
export const DEFAULT_ICON_ROLES: Readonly<Record<string, string>> = {
  // 정렬
  'sort.asc': 'sort-up',
  'sort.desc': 'sort-down',
  'sort.none': 'chevron-expand',
  // 필터 / 검색
  'filter': 'funnel',
  'filter.active': 'funnel-fill',
  'search': 'search',
  // 행 조작
  'row.add': 'plus-lg',
  'row.delete': 'trash3',
  'delete': 'trash3',
  'row.drag': 'grip-vertical',
  'column.drag': 'grip-horizontal',
  // 트리 / 마스터-디테일 확장
  'expand': 'chevron-right',
  'collapse': 'chevron-down',
  'tree.expand': 'chevron-right',
  'tree.collapse': 'chevron-down',
  // 마스킹(F5)
  'mask.reveal': 'eye-reveal',
  'mask.show': 'eye',
  'mask.hide': 'eye-slash',
  // 내보내기 / 입출력
  'export.excel': 'filetype-xlsx',
  'export.csv': 'filetype-csv',
  'export.pdf': 'filetype-pdf',
  'export.json': 'filetype-json',
  'export': 'download',
  'import': 'upload',
  'print': 'printer',
  'table': 'table',
  // 편집
  'edit': 'pencil',
  'copy': 'clipboard',
  'paste': 'clipboard-check',
  'clear': 'eraser',
  'check': 'check-lg',
  'close': 'x-lg',
  'add': 'plus',
  'remove': 'dash',
  // 선택(범위/체크)
  'select.all': 'check-all',
  'select.none': 'square',
  'select.check': 'check-square',
  'select.indeterminate': 'dash-square',
  // 핀 / 고정
  'pin': 'pin-angle',
  'pin.active': 'pin-angle-fill',
  // 상태 / 신호
  'status.error': 'x-circle-fill',
  'status.warning': 'exclamation-triangle-fill',
  'status.success': 'check-circle-fill',
  'status.info': 'info-circle',
  'status.lock': 'lock-fill',
  'status.unlock': 'unlock',
  'required': 'asterisk',
  // 차트(F4)
  'chart': 'bar-chart',
  'chart.bar': 'bar-chart',
  'chart.line': 'graph-up',
  'chart.pie': 'pie-chart',
  // 수식(F3)
  'formula': 'calculator',
  // 네비게이션
  'nav.first': 'chevron-double-left',
  'nav.prev': 'chevron-left',
  'nav.next': 'chevron-right',
  'nav.last': 'chevron-double-right',
  'nav.up': 'arrow-up',
  'nav.down': 'arrow-down',
  'refresh': 'arrow-clockwise',
  // 일반 UI
  'menu': 'list',
  'more': 'three-dots-vertical',
  'more.horizontal': 'three-dots',
  'settings': 'gear',
  'help': 'question-circle',
};

/**
 * 미지원 role 폴백: 빈(투명) svg — never throw. viewBox 는 유지해 레이아웃 안정.
 *
 * 未対応の role のフォールバック: 空(透明)の svg — never throw。viewBox は維持してレイアウトを安定させます。
 *
 * 不支持的 role 的回退: 空(透明)svg — never throw。保留 viewBox 以稳定布局。
 */
const FALLBACK_BODY = '';

function _escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * IconRegistry — 시맨틱 role(예: 'sort.asc') 을 실제 아이콘 SVG 로 바꿔주는 등록소.
 * 정렬 화살표·필터 깔때기 같은 아이콘을 코드 곳곳에 인라인 SVG 로 박아 두면, 아이콘 하나를
 * 바꾸려 해도 렌더러 파일들을 찾아 고쳐야 한다 — 대신 렌더 코드는 "sort.asc 를 그려줘"라고만
 * 요청하고, 실제 어떤 글리프인지는 이 레지스트리가 결정한다. 동작 순서: ① `register(role,
 * svgOrKey)` 로 role↔글리프 매핑을 등록해 두면 → ② 렌더 시점에 `render(role)` 가 호출되어
 * → ③ 등록된 본문을 `<svg>` 로 감싸 문자열(또는 SVGElement)로 돌려준다. 저장 단위는
 * **글리프 본문 문자열**(<path>/<g> 마크업)뿐이라, register(role, svgOrKey) 는
 *   - svgOrKey 가 `BOOTSTRAP_ICONS` 의 알려진 key 면 그 본문으로,
 *   - 아니면 **원시 SVG 본문**(사용자 커스텀 <path…>)으로 저장한다.
 * 부모 체인(_parent)으로 per-instance 오버라이드 레지스트리를 전역 위에 얹는다(멀티그리드 격리).
 *
 * IconRegistry — a registry that turns a semantic role (e.g. 'sort.asc') into an actual icon
 * SVG. Hardcoding inline SVG for every sort arrow or filter funnel across render code means
 * hunting down every renderer file just to swap one icon — instead render code simply asks "draw
 * sort.asc", and this registry decides which glyph that is. Flow: ① `register(role, svgOrKey)`
 * records a role↔glyph mapping → ② at render time `render(role)` is called → ③ it wraps the
 * registered body in an `<svg>` and returns a string (or SVGElement). The storage unit is only
 * the glyph body string (<path>/<g> markup), so register(role, svgOrKey) stores either the body
 * of a known `BOOTSTRAP_ICONS` key, or the raw SVG body otherwise. A parent chain (_parent)
 * layers a per-instance override registry on top of the global one (multi-grid isolation).
 *
 * IconRegistry — セマンティックな role(例: 'sort.asc')を実際のアイコン SVG に変えてくれるレジストリ。
 * ソート矢印やフィルターの漏斗のようなアイコンをコードのあちこちにインライン SVG で埋め込んでおくと、
 * アイコン一つを変えるだけでもレンダラーのファイルを探して直さなければなりません — 代わりにレンダーコードは
 * 「sort.asc を描いて」と頼むだけで、実際にどのグリフなのかはこのレジストリが決めます。動作の順序:
 * ① `register(role, svgOrKey)` で role↔グリフのマッピングを登録しておくと → ② レンダー時点で `render(role)`
 * が呼ばれ → ③ 登録された本文を `<svg>` で包んで文字列(または SVGElement)として返します。保存の単位は
 * **グリフ本文の文字列**(<path>/<g> マークアップ)だけなので、register(role, svgOrKey) は
 *   - svgOrKey が `BOOTSTRAP_ICONS` の既知の key であればその本文として、
 *   - そうでなければ **生の SVG 本文**(ユーザーのカスタム <path…>)として保存します。
 * 親チェーン(_parent)で per-instance のオーバーライドレジストリをグローバルの上に重ねます(マルチグリッドの分離)。
 *
 * IconRegistry — 把语义 role(例: 'sort.asc')换成实际图标 SVG 的注册表。
 * 若把排序箭头、筛选漏斗这类图标以内联 SVG 硬编码在渲染代码各处，只换一个图标也得翻遍渲染器文件逐一修改 —
 * 改由渲染代码只提出「画出 sort.asc」的请求，具体是哪个字形则交给这个注册表决定。执行顺序:
 * ① 用 `register(role, svgOrKey)` 登记 role↔字形的映射 → ② 渲染时调用 `render(role)`
 * → ③ 把登记的主体包进 `<svg>`，返回字符串(或 SVGElement)。存储单位只有
 * **字形主体字符串**(<path>/<g> 标记)，因此 register(role, svgOrKey) 的存储方式为:
 *   - svgOrKey 是 `BOOTSTRAP_ICONS` 的已知 key 时，存其主体;
 *   - 否则存为 **原始 SVG 主体**(用户自定义的 <path…>)。
 * 通过父链(_parent)把 per-instance 的覆盖注册表叠加在全局之上(多表格隔离)。
 *
 * @example
 * const reg = iconRegistry.child();
 * reg.register('sort.asc', 'arrow-up'); // swap the arrow for this grid instance only
 * const svg = reg.render('sort.asc', { size: 16 }) as string;
 */
export class IconRegistry {
  private _roles = new Map<string, string>(); // role → glyph body
  private _parent: IconRegistry | undefined;

  constructor(seed?: Readonly<Record<string, string>>, parent?: IconRegistry) {
    this._parent = parent;
    if (seed) for (const [role, key] of Object.entries(seed)) this.register(role, key);
  }

  /**
   * role 에 글리프를 등록/교체. svgOrKey 가 알려진 아이콘 key 면 그 본문을, 아니면 원시 SVG
   * 본문 마크업으로 간주한다(코어 편집 없이 아이콘 교체 — OCP).
   *
   * Register/replace a glyph for a role. A known icon key resolves to its body; otherwise svgOrKey is
   * treated as raw SVG body markup (swap icons without editing core — OCP).
   *
   * role にグリフを登録/差し替え。svgOrKey が既知のアイコン key であればその本文を、そうでなければ生の SVG
   * 本文マークアップとみなします(コアを編集せずにアイコンを差し替え — OCP)。
   *
   * 为 role 注册/替换字形。svgOrKey 是已知图标 key 时取其主体，否则视为原始 SVG 主体标记
   * (无需编辑核心即可替换图标 — OCP)。
   *
   * @param role - 시맨틱 역할 키(예: 'sort.asc')
   *
   * Semantic role key (e.g. 'sort.asc')
   *
   * セマンティックな役割キー(例: 'sort.asc')
   *
   * 语义角色键(例: 'sort.asc')
   *
   * @param svgOrKey - 알려진 아이콘 key 또는 원시 SVG 본문
   *
   * A known icon key or raw SVG body
   *
   * 既知のアイコン key または生の SVG 本文
   *
   * 已知的图标 key 或原始 SVG 主体
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
   * // Swap to a different Bootstrap icon key
   * iconRegistry.register('row.delete', 'x-circle');
   * // Replace entirely with a custom raw SVG body
   * iconRegistry.register('menu', '<path d="M2 4h12v2H2z"/>');
   */
  register(role: string, svgOrKey: string): this {
    const body = Object.prototype.hasOwnProperty.call(BOOTSTRAP_ICONS, svgOrKey)
      ? BOOTSTRAP_ICONS[svgOrKey]!
      : svgOrKey;
    this._roles.set(role, body);
    return this;
  }

  /**
   * role 이 (자신 또는 부모 체인에) 등록돼 있는가.
   *
   * Whether a role is registered (self or parent chain).
   *
   * role が(自身または親チェーンに)登録されているか。
   *
   * role 是否已注册(在自身或父链中)。
   */
  has(role: string): boolean {
    return this._roles.has(role) || (this._parent?.has(role) ?? false);
  }

  /**
   * role → 글리프 본문(inner markup). 미등록이면 null(부모 체인까지 조회).
   *
   * role → glyph body (inner markup); null if unregistered (searches up the parent chain).
   *
   * role → グリフ本文(inner markup)。未登録なら null(親チェーンまで照会)。
   *
   * role → 字形主体(inner markup)。未注册则返回 null(沿父链向上查找)。
   *
   * @param role - 조회할 역할 키
   *
   * Role key to resolve
   *
   * 照会する役割キー
   *
   * 要查找的角色键
   *
   * @returns 글리프 본문 또는 null
   *
   * Glyph body or null
   *
   * グリフ本文または null
   *
   * 字形主体或 null
   */
  resolveBody(role: string): string | null {
    const own = this._roles.get(role);
    if (own !== undefined) return own;
    return this._parent ? this._parent.resolveBody(role) : null;
  }

  /**
   * 이 레지스트리를 부모로 하는 자식(per-instance 오버라이드용) 생성.
   *
   * Create a child registry with this as parent (for per-instance overrides).
   *
   * このレジストリを親とする子(per-instance のオーバーライド用)を生成。
   *
   * 创建以本注册表为父的子注册表(用于 per-instance 覆盖)。
   */
  child(): IconRegistry {
    return new IconRegistry(undefined, this);
  }

  /**
   * role 을 `<svg viewBox=ICON_VIEWBOX>` 로 렌더. 기본 반환은 SVG 마크업 문자열(innerHTML 용);
   * opts.el 이면 SVGElement. 미지원 role 은 빈 svg 폴백(never throw).
   * 스킨 토큰: fill=currentColor(presentation attr) + stroke-linejoin=var(--og-icon-corner,miter).
   *
   * Render a role as `<svg viewBox=ICON_VIEWBOX>`. Returns SVG markup string by default (for innerHTML);
   * opts.el returns an SVGElement. Unknown roles fall back to an empty svg (never throws).
   *
   * role を `<svg viewBox=ICON_VIEWBOX>` としてレンダー。既定の戻り値は SVG マークアップ文字列(innerHTML 用)、
   * opts.el なら SVGElement。未対応の role は空の svg にフォールバック(never throw)。
   * スキントークン: fill=currentColor(presentation attr) + stroke-linejoin=var(--og-icon-corner,miter)。
   *
   * 把 role 渲染为 `<svg viewBox=ICON_VIEWBOX>`。默认返回 SVG 标记字符串(供 innerHTML 使用);
   * 指定 opts.el 则返回 SVGElement。不支持的 role 回退为空 svg(never throw)。
   * 皮肤令牌: fill=currentColor(presentation attr) + stroke-linejoin=var(--og-icon-corner,miter)。
   *
   * @param role - 렌더할 역할 키
   *
   * Role key to render
   *
   * レンダーする役割キー
   *
   * 要渲染的角色键
   *
   * @param opts - 렌더 옵션
   *
   * Render options
   *
   * レンダーオプション
   *
   * 渲染选项
   *
   * @returns SVG 마크업 문자열 또는 SVGElement(opts.el)
   *
   * SVG markup string, or SVGElement when opts.el
   *
   * SVG マークアップ文字列、または SVGElement(opts.el の場合)
   *
   * SVG 标记字符串，或指定 opts.el 时返回 SVGElement
   */
  render(role: string, opts?: IconRenderOptions): string | SVGElement {
    const body = this.resolveBody(role) ?? FALLBACK_BODY;
    const size = opts?.size;
    const sizeAttr = size != null ? ` width="${size}" height="${size}"` : '';
    const title = opts?.title;
    const titleEl = title ? `<title>${_escapeAttr(title)}</title>` : '';
    const roleAttr = title ? ' role="img"' : '';
    const markup =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}"${sizeAttr}` +
      ` fill="currentColor"${roleAttr}` +
      ` style="stroke-linejoin:var(--og-icon-corner, miter)">` +
      `${titleEl}${body}</svg>`;
    if (opts?.el) {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      return doc.documentElement as unknown as SVGElement;
    }
    return markup;
  }

  /**
   * 등록된 role 목록(자신만, 디버깅/테스트용).
   *
   * List of registered roles (self only; for debugging/tests).
   *
   * 登録された role の一覧(自身のみ、デバッグ/テスト用)。
   *
   * 已注册的 role 列表(仅自身，供调试/测试用)。
   */
  roles(): string[] {
    return [...this._roles.keys()];
  }
}

/**
 * 프로세스 공유 기본 아이콘 레지스트리(시맨틱 role 시드 완료).
 *
 * Process-shared default icon registry (seeded with semantic roles).
 *
 * プロセス共有の既定アイコンレジストリ(セマンティックな role のシード済み)。
 *
 * 进程共享的默认图标注册表(已用语义 role 完成种子填充)。
 *
 * CellRenderer 등 팩토리 생성 렌더러(인스턴스 컨텍스트 없음)가 이 초크포인트로 아이콘을 얻는다.
 * per-instance 교체는 `grid.setIcon()`(이 레지스트리의 child) 로, 전역 확장은 `defineIconSet()` 로.
 *
 * Factory-created renderers (e.g. CellRenderer, without instance context) obtain icons through this
 * chokepoint. Per-instance swaps go through `grid.setIcon()` (a child of this registry); global extension
 * through `defineIconSet()`.
 *
 * CellRenderer など、ファクトリが生成するレンダラー(インスタンスコンテキストなし)は、このチョークポイントから
 * アイコンを得ます。per-instance の差し替えは `grid.setIcon()`(このレジストリの child)で、グローバルな拡張は
 * `defineIconSet()` で行います。
 *
 * CellRenderer 等由工厂创建的渲染器(没有实例上下文)通过这个必经点获取图标。
 * per-instance 的替换走 `grid.setIcon()`(本注册表的 child)，全局扩展走 `defineIconSet()`。
 */
export const iconRegistry = new IconRegistry(DEFAULT_ICON_ROLES);

/**
 * 편의 정적 render — 공유 기본 레지스트리로 위임(`IconRegistry.render(role, opts)`).
 *
 * Convenience static render — delegates to the shared default registry (`IconRegistry.render(role, opts)`).
 *
 * 便利な静的 render — 共有の既定レジストリに委譲します(`IconRegistry.render(role, opts)`)。
 *
 * 便捷的静态 render — 委托给共享的默认注册表(`IconRegistry.render(role, opts)`)。
 *
 * @param role - 렌더할 역할 키
 *
 * Role key to render
 *
 * レンダーする役割キー
 *
 * 要渲染的角色键
 *
 * @param opts - 렌더 옵션
 *
 * Render options
 *
 * レンダーオプション
 *
 * 渲染选项
 *
 * @returns SVG 마크업 문자열 또는 SVGElement(opts.el)
 *
 * SVG markup string, or SVGElement when opts.el
 *
 * SVG マークアップ文字列、または SVGElement(opts.el の場合)
 *
 * SVG 标记字符串，或指定 opts.el 时返回 SVGElement
 *
 * @example
 * el.innerHTML = renderIcon('filter') as string;
 */
export function renderIcon(role: string, opts?: IconRenderOptions): string | SVGElement {
  return iconRegistry.render(role, opts);
}
