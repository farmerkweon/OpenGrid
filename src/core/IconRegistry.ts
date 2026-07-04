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
//     variant 선택(filled vs outline role key)은 레지스트리 등록 층에서 다룬다(정직한 결합).
//
// 행동 보존:
//   `render('mask.reveal', { size: 13 })` 는 기존 마스킹 셀의 커스텀 눈 SVG 와 **시각적으로 동일**
//   (동일 viewBox·동일 두 path·흰 동공·fill=currentColor). stroke 를 쓰지 않는 글리프라
//   추가된 `stroke-linejoin` 은 no-op.
// ============================================================

import { BOOTSTRAP_ICONS, ICON_VIEWBOX } from './icons/bootstrap-icons.js';

/** render() 옵션. size 미지정 시 svg 는 viewBox/CSS 로 크기를 상속(width/height 속성 생략). */
export interface IconRenderOptions {
  /** px 정사각 크기(width=height). 미지정 시 속성 생략(CSS/컨테이너가 결정). */
  size?: number;
  /** 접근성 제목. 지정 시 <title> + role="img" 추가(스크린리더). 미지정 시 장식용(부모가 aria 담당). */
  title?: string;
  /** true → SVGElement(DOMParser) 반환. 기본 false → SVG 마크업 문자열. */
  el?: boolean;
}

/**
 * 시맨틱 ROLE → 아이콘 key(`BOOTSTRAP_ICONS` 의 symbolId) 기본 매핑.
 * 렌더 코드는 이 역할 이름만 참조한다. key 교체는 이 표(혹은 register/setIcon)만 고치면 된다.
 * 참고 스왑: `row.delete`→`trash3`(Bootstrap 의 표준 휴지통, task 의 'trash' 동족), `chart.line`→`graph-up`.
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

/** 미지원 role 폴백: 빈(투명) svg — never throw. viewBox 는 유지해 레이아웃 안정. */
const FALLBACK_BODY = '';

function _escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * IconRegistry — role → 글리프 본문(inner SVG markup) 해석 + svg 래핑.
 *
 * 저장 단위는 **글리프 본문 문자열**(<path>/<g> 마크업). register(role, svgOrKey) 는
 *   - svgOrKey 가 `BOOTSTRAP_ICONS` 의 알려진 key 면 그 본문으로,
 *   - 아니면 **원시 SVG 본문**(사용자 커스텀 <path…>)으로 저장한다.
 * 부모 체인(_parent)으로 per-instance 오버라이드 레지스트리를 전역 위에 얹는다(멀티그리드 격리).
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
   */
  register(role: string, svgOrKey: string): this {
    const body = Object.prototype.hasOwnProperty.call(BOOTSTRAP_ICONS, svgOrKey)
      ? BOOTSTRAP_ICONS[svgOrKey]!
      : svgOrKey;
    this._roles.set(role, body);
    return this;
  }

  /** role 이 (자신 또는 부모 체인에) 등록돼 있는가. */
  has(role: string): boolean {
    return this._roles.has(role) || (this._parent?.has(role) ?? false);
  }

  /** role → 글리프 본문(inner markup). 미등록이면 null(부모 체인까지 조회). */
  resolveBody(role: string): string | null {
    const own = this._roles.get(role);
    if (own !== undefined) return own;
    return this._parent ? this._parent.resolveBody(role) : null;
  }

  /** 이 레지스트리를 부모로 하는 자식(per-instance 오버라이드용) 생성. */
  child(): IconRegistry {
    return new IconRegistry(undefined, this);
  }

  /**
   * role 을 `<svg viewBox=ICON_VIEWBOX>` 로 렌더. 기본 반환은 SVG 마크업 문자열(innerHTML 용);
   * opts.el 이면 SVGElement. 미지원 role 은 빈 svg 폴백(never throw).
   * 스킨 토큰: fill=currentColor(presentation attr) + stroke-linejoin=var(--og-icon-corner,miter).
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

  /** 등록된 role 목록(자신만, 디버깅/테스트용). */
  roles(): string[] {
    return [...this._roles.keys()];
  }
}

/**
 * 프로세스 공유 기본 아이콘 레지스트리(시맨틱 role 시드 완료).
 * CellRenderer 등 팩토리 생성 렌더러(인스턴스 컨텍스트 없음)가 이 초크포인트로 아이콘을 얻는다.
 * per-instance 교체는 `grid.setIcon()`(이 레지스트리의 child) 로, 전역 확장은 `defineIconSet()` 로.
 */
export const iconRegistry = new IconRegistry(DEFAULT_ICON_ROLES);

/** 편의 정적 render — 공유 기본 레지스트리로 위임(`IconRegistry.render(role, opts)`). */
export function renderIcon(role: string, opts?: IconRenderOptions): string | SVGElement {
  return iconRegistry.render(role, opts);
}
