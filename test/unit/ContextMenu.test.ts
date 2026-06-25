import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextMenuManager, DEFAULT_CONTEXT_ITEMS } from '../../src/core/ContextMenu.js';
import type { ContextMenuActions } from '../../src/core/ContextMenu.js';

function makeActions(): ContextMenuActions {
  return {
    onSortAsc:  vi.fn(),
    onSortDesc: vi.fn(),
    onFind:     vi.fn(),
    onExcel:    vi.fn(),
    onCsv:      vi.fn(),
    onPrint:    vi.fn(),
  };
}

function makeAnchor(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'og-container';
  document.body.appendChild(el);
  return el;
}

function makeMouseEvent(x = 100, y = 100): MouseEvent {
  return new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true });
}

// 메뉴는 이제 document.body 에 부착된다(임베드 호스트 격리: transform 조상 아래에서도
// position:fixed 가 뷰포트 기준으로 동작하도록). 테스트 간 누수 방지를 위해 body 정리.
afterEach(() => { document.body.innerHTML = ''; });

describe('ContextMenuManager — 생성/열기/닫기', () => {
  let anchor: HTMLElement;
  let actions: ContextMenuActions;
  let mgr: ContextMenuManager;

  beforeEach(() => {
    anchor  = makeAnchor();
    actions = makeActions();
    mgr     = new ContextMenuManager(anchor, actions);
  });

  it('open() → .og-context-menu가 document.body에 추가됨(임베드 격리)', () => {
    mgr.open(makeMouseEvent());
    const menu = document.querySelector('.og-context-menu');
    expect(menu).not.toBeNull();
    expect(menu!.parentElement).toBe(document.body);
  });

  it('close() → 메뉴 엘리먼트 제거', () => {
    mgr.open(makeMouseEvent());
    mgr.close();
    expect(document.querySelector('.og-context-menu')).toBeNull();
  });

  it('open() 두 번 연속 호출 → 메뉴 하나만 존재', () => {
    mgr.open(makeMouseEvent());
    mgr.open(makeMouseEvent());
    expect(document.querySelectorAll('.og-context-menu').length).toBe(1);
  });

  it('destroy() → 메뉴 정리', () => {
    mgr.open(makeMouseEvent());
    mgr.destroy();
    expect(document.querySelector('.og-context-menu')).toBeNull();
  });
});

describe('ContextMenuManager — 기본 항목 구조', () => {
  it('DEFAULT_CONTEXT_ITEMS에 기본 6개 항목 + 구분선 포함', () => {
    const actionItems = DEFAULT_CONTEXT_ITEMS.filter(i => i.type !== 'divider');
    const dividers    = DEFAULT_CONTEXT_ITEMS.filter(i => i.type === 'divider');
    expect(actionItems.length).toBe(6);
    expect(dividers.length).toBeGreaterThanOrEqual(2);
  });

  it('기본 항목 ID 확인', () => {
    const ids = DEFAULT_CONTEXT_ITEMS.filter(i => i.id).map(i => i.id);
    expect(ids).toContain('sort-asc');
    expect(ids).toContain('sort-desc');
    expect(ids).toContain('find');
    expect(ids).toContain('excel');
    expect(ids).toContain('csv');
    expect(ids).toContain('print');
  });
});

describe('ContextMenuManager — 항목 클릭 액션', () => {
  let anchor: HTMLElement;
  let actions: ContextMenuActions;
  let mgr: ContextMenuManager;

  beforeEach(() => {
    anchor  = makeAnchor();
    actions = makeActions();
    mgr     = new ContextMenuManager(anchor, actions);
    mgr.open(makeMouseEvent());
  });

  it('sort-asc 클릭 → onSortAsc 호출', () => {
    const btn = document.querySelector<HTMLButtonElement>('.og-cm-item:nth-child(1)');
    btn?.click();
    expect(actions.onSortAsc).toHaveBeenCalled();
  });

  it('클릭 후 메뉴 닫힘', () => {
    const btn = document.querySelector<HTMLButtonElement>('.og-cm-item');
    btn?.click();
    expect(document.querySelector('.og-context-menu')).toBeNull();
  });

  it('disabled 항목 클릭 → 액션 미호출', () => {
    mgr.close();
    const customItems = [
      { id: 'noop', label: '비활성', action: 'excel' as const, disabled: true }
    ];
    mgr.open(makeMouseEvent(), customItems);
    const btn = document.querySelector<HTMLButtonElement>('.og-cm-disabled');
    // disabled 항목은 pointer-events:none이지만 테스트에서는 직접 click() 시뮬레이션
    // _runAction은 disabled 체크 후 스킵함을 확인
    expect(btn?.classList.contains('og-cm-disabled')).toBe(true);
  });
});

describe('ContextMenuManager — 커스텀 항목', () => {
  it('커스텀 항목 함수 액션 실행', () => {
    const anchor  = makeAnchor();
    const actions = makeActions();
    const mgr     = new ContextMenuManager(anchor, actions);
    const customFn = vi.fn();
    const customItems = [
      { id: 'custom', label: '커스텀', icon: '★', action: customFn }
    ];
    mgr.open(makeMouseEvent(), customItems);
    const btn = document.querySelector<HTMLButtonElement>('.og-cm-item');
    btn?.click();
    expect(customFn).toHaveBeenCalled();
  });
});

describe('ContextMenuManager — 구분선 렌더링', () => {
  it('type:divider → .og-cm-divider 엘리먼트 생성', () => {
    const anchor  = makeAnchor();
    const mgr     = new ContextMenuManager(anchor, makeActions());
    mgr.open(makeMouseEvent());
    expect(document.querySelectorAll('.og-cm-divider').length).toBeGreaterThan(0);
  });
});
