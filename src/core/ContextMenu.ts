// ============================================================
// ContextMenu — 우클릭 팝업 컨텍스트 메뉴 관리자
// 레이어: Orchestration (UI 생성 + 이벤트 조율)
// 설계 근거(Why): 메뉴를 document.body가 아닌 그리드 컨테이너(_anchor)의
//   자식으로 추가한다. position:fixed로 뷰포트 기준 배치를 유지하면서
//   CSS 변수(--og-*)를 컨테이너에서 자동 상속 → 테마 즉시 반영.
// ============================================================

import type { ContextMenuItem } from './types.js';

export type { ContextMenuItem };

/**
 * 기본 컨텍스트 메뉴 항목이 위임하는 액션 핸들러 모음. / Action handlers that the default context-menu items delegate to.
 *
 * `OpenGrid` 가 생성 시 주입하며, 커스텀 메뉴 항목이 `action: 'sortAsc'` 등
 * 문자열 액션을 쓸 때 실제 동작을 제공한다. / Injected by `OpenGrid` at construction time;
 * provides the real behavior when a custom menu item uses a string `action` like `'sortAsc'`.
 */
export interface ContextMenuActions {
  /** 오름차순 정렬 실행. / Runs ascending sort. */
  onSortAsc:  () => void;
  /** 내림차순 정렬 실행. / Runs descending sort. */
  onSortDesc: () => void;
  /** 찾기 바 열기. / Opens the find bar. */
  onFind:     () => void;
  /** Excel 내보내기 실행. / Runs the Excel export. */
  onExcel:    () => void;
  /** CSV 내보내기 실행. / Runs the CSV export. */
  onCsv:      () => void;
  /** 인쇄 실행. / Runs print. */
  onPrint:    () => void;
}

/** i18n: 메시지 해석기 시그니처. / i18n: message resolver signature. */
export type ContextMenuT = (key: string, params?: Record<string, string | number>) => string;

// i18n: 기본 메뉴 라벨을 상수에서 dot-key 로 분리 — 열 때 t() 로 지연 평가(활성 로케일 반영).
// / i18n: default menu labels moved from constants to dot-keys — resolved lazily via t() at open time.
const _DEFAULT_ITEM_TEMPLATE: ReadonlyArray<
  { type: 'divider' } | { id: string; labelKey: string; icon: string; action: string }
> = [
  { id: 'sort-asc',  labelKey: 'contextMenu.sortAsc',     icon: '↑', action: 'sortAsc'  },
  { id: 'sort-desc', labelKey: 'contextMenu.sortDesc',    icon: '↓', action: 'sortDesc' },
  { type: 'divider' },
  { id: 'find',  labelKey: 'contextMenu.find',        icon: '🔍', action: 'find'  },
  { type: 'divider' },
  { id: 'excel', labelKey: 'contextMenu.exportExcel', icon: '📊', action: 'excel' },
  { id: 'csv',   labelKey: 'contextMenu.exportCsv',   icon: '📄', action: 'csv'   },
  { id: 'print', labelKey: 'contextMenu.print',       icon: '🖨', action: 'print' },
];

/** 기본 메뉴 항목(ko 라벨) — i18n 미주입 폴백 + 구조 계약(테스트/공개 표면). / Default items (ko labels) — i18n fallback + structural contract. */
export const DEFAULT_CONTEXT_ITEMS: ContextMenuItem[] = [
  { id: 'sort-asc',  label: '오름차순 정렬', icon: '↑', action: 'sortAsc'  },
  { id: 'sort-desc', label: '내림차순 정렬', icon: '↓', action: 'sortDesc' },
  { type: 'divider' },
  { id: 'find',  label: '찾기',         icon: '🔍', action: 'find'  },
  { type: 'divider' },
  { id: 'excel', label: 'Excel로 저장', icon: '📊', action: 'excel' },
  { id: 'csv',   label: 'CSV로 저장',   icon: '📄', action: 'csv'   },
  { id: 'print', label: '인쇄',         icon: '🖨', action: 'print' },
];

/** 활성 로케일로 기본 메뉴 항목을 생성(열 때 호출). / Build default menu items in the active locale (called at open time). */
function _buildDefaultItems(t: ContextMenuT | undefined): ContextMenuItem[] {
  if (!t) return DEFAULT_CONTEXT_ITEMS;
  return _DEFAULT_ITEM_TEMPLATE.map(it =>
    'type' in it
      ? { type: 'divider' as const }
      : { id: it.id, label: t(it.labelKey), icon: it.icon, action: it.action },
  );
}

/**
 * 우클릭 팝업 컨텍스트 메뉴 관리자. / Manages the right-click popup context menu.
 *
 * 메뉴는 `document.body` 자식으로 추가한다(그리드 컨테이너의 조상에 transform/filter
 * 가 있어도 `position:fixed` 기준점이 뷰포트에 고정되도록). 테마(`data-og-theme`)와
 * 스킨(`data-og-skin`) 속성은 앵커 엘리먼트에서 복사해 CSS 변수 상속을 보존한다.
 * / The menu is appended as a child of `document.body` (so its `position:fixed`
 * reference stays the viewport even when an ancestor of the grid container has a
 * transform/filter). The theme (`data-og-theme`) and skin (`data-og-skin`) attributes
 * are copied from the anchor element to preserve CSS-variable inheritance.
 */
export class ContextMenuManager {
  private _el: HTMLElement | null = null;
  private _docClick:     ((e: MouseEvent)    => void) | null = null;
  private _docKey:       ((e: KeyboardEvent) => void) | null = null;
  private _docScroll:    (() => void)                 | null = null;
  private _docMouseMove: ((e: MouseEvent)    => void) | null = null;
  private _focusIdx = -1;

  /**
   * @param _anchor - 그리드 컨테이너 엘리먼트 — CSS 변수 상속 기준점 / Grid container element — the reference point for CSS-variable inheritance
   * @param _actions - 기본 액션 핸들러(OpenGrid에서 주입) / Default action handlers (injected by OpenGrid)
   * @param _t - i18n 메시지 해석기(미주입 시 ko 기본 라벨) / i18n message resolver (falls back to ko default labels when absent)
   */
  constructor(
    private readonly _anchor: HTMLElement,
    private readonly _actions: ContextMenuActions,
    private readonly _t?: ContextMenuT,
  ) {}

  /**
   * 지정 좌표에 컨텍스트 메뉴를 연다. / Open the context menu at the given coordinates.
   *
   * 이전 메뉴가 열려 있으면 먼저 닫는다. 항목을 지정하지 않으면 활성 로케일로
   * 만든 기본 항목({@link DEFAULT_CONTEXT_ITEMS})을 사용한다.
   * / Closes any previously open menu first. When no items are given, uses the
   * default items ({@link DEFAULT_CONTEXT_ITEMS}) built in the active locale.
   *
   * @param e - 메뉴를 연 마우스 이벤트(좌표 기준) / Mouse event that opened the menu (used for positioning)
   * @param customItems - 커스텀 메뉴 항목(생략 시 기본 항목) / Custom menu items (defaults when omitted)
   */
  open(e: MouseEvent, customItems?: ContextMenuItem[]): void {
    this.close();

    const items = customItems ?? _buildDefaultItems(this._t);
    const menu  = document.createElement('div');
    menu.className  = 'og-context-menu';
    menu.setAttribute('role', 'menu');

    for (const item of items) {
      if (item.type === 'divider') {
        const hr = document.createElement('div');
        hr.className = 'og-cm-divider';
        hr.setAttribute('role', 'separator');
        menu.appendChild(hr);
        continue;
      }

      const btn = document.createElement('button');
      btn.className  = 'og-cm-item';
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('tabindex', '-1');
      if (item.disabled) {
        btn.classList.add('og-cm-disabled');
        btn.setAttribute('aria-disabled', 'true');
      }

      if (item.icon) {
        const ic = document.createElement('span');
        ic.className = 'og-cm-icon';
        // CSS 클래스명(예: 'bi bi-star', 'fa fa-home')이면 <i> 태그로 렌더링
        // 이모지·특수문자·단일 기호면 textContent로 처리
        if (/^[a-zA-Z][\w-]*(\s+[\w-]+)+$/.test(item.icon.trim())) {
          const i = document.createElement('i');
          i.className = item.icon;
          ic.appendChild(i);
        } else {
          ic.textContent = item.icon;
        }
        ic.setAttribute('aria-hidden', 'true');
        btn.appendChild(ic);
      }

      const lbl = document.createElement('span');
      lbl.className   = 'og-cm-label';
      lbl.textContent = item.label ?? '';
      btn.appendChild(lbl);

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!item.disabled) this._runAction(item);
        this.close();
      });
      menu.appendChild(btn);
    }

    // document.body 자식으로 추가 → position:fixed 가 항상 뷰포트 기준으로 동작.
    // Why: 그리드 컨테이너(_anchor)에 붙이면, 임베드 호스트(WordPress 글 등)의
    //   조상에 transform/filter 가 있을 때 fixed 기준점이 그 조상으로 바뀌어
    //   메뉴가 마우스 좌표에서 어긋난다(특히 그리드 너비를 넓힐 때). body 부착으로 회피.
    //   테마 CSS 변수(--og-cm-*, --og-*)는 menu 에 data-og-theme 를 복사해 보존한다.
    const themeEl = this._anchor.closest('[data-og-theme]') as HTMLElement | null;
    const theme = themeEl?.getAttribute('data-og-theme');
    if (theme) menu.setAttribute('data-og-theme', theme);
    // R12b: FORM(스킨) 축도 함께 복사 — 색 축만 복사하면 분리 UI 가 스킨만 안 먹는 조용한 사고(§6-9).
    const skinEl = this._anchor.closest('[data-og-skin]') as HTMLElement | null;
    const skin = skinEl?.getAttribute('data-og-skin');
    if (skin) menu.setAttribute('data-og-skin', skin);
    document.body.appendChild(menu);
    this._el = menu;

    // mousemove capture 단계로 등록 — 셀의 stopPropagation() 우회
    // Why: 그리드 셀이 mousemove에 stopPropagation()을 호출해 bubble 단계 document 리스너가 차단됨
    this._docMouseMove = (ev) => {
      if (!this._el) return;
      const r = this._el.getBoundingClientRect();
      if (ev.clientX < r.left - 4 || ev.clientX > r.right  + 4 ||
          ev.clientY < r.top  - 4 || ev.clientY > r.bottom + 4) {
        this.close();
      }
    };

    // position:fixed 기준 좌표 설정 → 포지셔닝 완료 후 올바른 bounds로 리스너 등록
    this._position(menu, e.clientX, e.clientY, () => {
      if (this._el === menu) {
        document.addEventListener('mousemove', this._docMouseMove!, { capture: true, passive: true });
      }
    });

    // 외부 클릭 닫기 (다음 틱 — 현재 contextmenu 이벤트 전파 완료 후)
    this._docClick = (ev) => {
      if (!menu.contains(ev.target as Node)) this.close();
    };
    // 키보드 접근성
    this._docKey = (ev) => {
      if (ev.key === 'Escape')    { this.close(); return; }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); this._moveFocus(1);  return; }
      if (ev.key === 'ArrowUp')   { ev.preventDefault(); this._moveFocus(-1); return; }
      if (ev.key === 'Enter') {
        const focused = menu.querySelector<HTMLButtonElement>('.og-cm-item:focus');
        focused?.click();
      }
    };
    this._docScroll = () => this.close();

    setTimeout(() => {
      document.addEventListener('click',   this._docClick!);
      document.addEventListener('keydown', this._docKey!);
      window.addEventListener('scroll',    this._docScroll!, { passive: true });
    }, 0);

    // 첫 활성 항목에 포커스
    this._focusIdx = -1;
    this._moveFocus(1);
  }

  /** 열려 있는 메뉴를 닫고 관련 리스너를 모두 해제한다. / Close the open menu and detach all related listeners. */
  close(): void {
    this._el?.remove();
    this._el = null;
    if (this._docClick)     document.removeEventListener('click',     this._docClick);
    if (this._docKey)       document.removeEventListener('keydown',   this._docKey);
    if (this._docScroll)    window.removeEventListener('scroll',      this._docScroll);
    if (this._docMouseMove) document.removeEventListener('mousemove', this._docMouseMove, { capture: true });
    this._docClick = this._docKey = this._docScroll = this._docMouseMove = null;
    this._focusIdx = -1;
  }

  /** 메뉴를 닫고 정리한다. / Close the menu and clean up. */
  destroy(): void { this.close(); }

  // ── 위치 결정 ─────────────────────────────────────────────

  /** @internal 뷰포트 경계를 벗어나지 않도록 메뉴 위치를 계산해 배치한다. / Computes and applies the menu position, keeping it within viewport bounds. */
  private _position(menu: HTMLElement, x: number, y: number, onPositioned?: () => void): void {
    menu.style.cssText = 'position:fixed;visibility:hidden;left:0;top:0;';

    requestAnimationFrame(() => {
      const { width, height } = menu.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const left = x + width  > vw ? Math.max(0, x - width)  : x;
      const top  = y + height > vh ? Math.max(0, y - height) : y;
      menu.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:9999;`;
      // 포지셔닝 완료 후 콜백 — mousemove 체크는 정확한 위치 기준으로만 동작
      onPositioned?.();
    });
  }

  // ── 키보드 포커스 이동 ────────────────────────────────────

  /** @internal 활성 항목 사이에서 키보드 포커스를 이동한다. / Moves keyboard focus between enabled items. */
  private _moveFocus(dir: 1 | -1): void {
    if (!this._el) return;
    const btns = Array.from(
      this._el.querySelectorAll<HTMLButtonElement>('.og-cm-item:not(.og-cm-disabled)')
    );
    if (!btns.length) return;
    this._focusIdx = (this._focusIdx + dir + btns.length) % btns.length;
    btns[this._focusIdx]?.focus();
  }

  // ── 액션 실행 ─────────────────────────────────────────────

  /** @internal 항목의 함수 액션 또는 문자열 액션(→ ContextMenuActions)을 실행한다. / Runs an item's function action, or its string action (dispatched to ContextMenuActions). */
  private _runAction(item: ContextMenuItem): void {
    if (typeof item.action === 'function') { item.action(); return; }
    switch (item.action) {
      case 'sortAsc':  this._actions.onSortAsc();  break;
      case 'sortDesc': this._actions.onSortDesc(); break;
      case 'find':     this._actions.onFind();     break;
      case 'excel':    this._actions.onExcel();    break;
      case 'csv':      this._actions.onCsv();      break;
      case 'print':    this._actions.onPrint();    break;
    }
  }
}
