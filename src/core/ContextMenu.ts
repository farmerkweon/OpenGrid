// ============================================================
// ContextMenu — 우클릭 팝업 컨텍스트 메뉴 관리자
// 레이어: Orchestration (UI 생성 + 이벤트 조율)
// 설계 근거(Why): 메뉴를 document.body가 아닌 그리드 컨테이너(_anchor)의
//   자식으로 추가한다. position:fixed로 뷰포트 기준 배치를 유지하면서
//   CSS 변수(--og-*)를 컨테이너에서 자동 상속 → 테마 즉시 반영.
// ============================================================

import type { ContextMenuItem } from './types.js';

export type { ContextMenuItem };

export interface ContextMenuActions {
  onSortAsc:  () => void;
  onSortDesc: () => void;
  onFind:     () => void;
  onExcel:    () => void;
  onCsv:      () => void;
  onPrint:    () => void;
}

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

export class ContextMenuManager {
  private _el: HTMLElement | null = null;
  private _docClick:     ((e: MouseEvent)    => void) | null = null;
  private _docKey:       ((e: KeyboardEvent) => void) | null = null;
  private _docScroll:    (() => void)                 | null = null;
  private _docMouseMove: ((e: MouseEvent)    => void) | null = null;
  private _focusIdx = -1;

  /**
   * @param _anchor  그리드 컨테이너 엘리먼트 — CSS 변수 상속 기준점
   * @param _actions 기본 액션 핸들러 (OpenGrid에서 주입)
   */
  constructor(
    private readonly _anchor: HTMLElement,
    private readonly _actions: ContextMenuActions,
  ) {}

  open(e: MouseEvent, customItems?: ContextMenuItem[]): void {
    this.close();

    const items = customItems ?? DEFAULT_CONTEXT_ITEMS;
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

  destroy(): void { this.close(); }

  // ── 위치 결정 ─────────────────────────────────────────────

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
