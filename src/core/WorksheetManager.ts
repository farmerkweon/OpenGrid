// ============================================================
// WorksheetManager — 그리드 다중 워크시트(탭) 관리자
// 레이어: Orchestration (시트 상태 관리 + 탭 UI 조율)
// 설계 근거(Why): OpenGrid 내부에 _wsManager로 보유.
//   시트별로 독립적인 columns + data를 Map으로 관리하고,
//   탭 클릭 시 OpenGrid.setData/applyColumns로 화면 전환.
//   탭 UI는 그리드 컨테이너 하단에 .og-sheet-tabs 영역으로 삽입.
// ============================================================

import type { ColumnDef, WorksheetDef, WorksheetState } from './types.js';

export type SwitchCallback<T> = (name: string, state: WorksheetState<T>) => void;

export class WorksheetManager<T extends Record<string, any> = any> {
  private _sheets: Map<string, WorksheetState<T>> = new Map();
  private _active: string = '';
  private _tabBar: HTMLElement;
  private _onSwitch: SwitchCallback<T>;

  constructor(container: HTMLElement, onSwitch: SwitchCallback<T>) {
    this._onSwitch = onSwitch;
    this._tabBar   = this._buildTabBar(container);
  }

  // ── 시트 CRUD ────────────────────────────────────────────

  add(name: string, columns: ColumnDef<T>[] = [], data: T[] = []): void {
    if (this._sheets.has(name)) {
      throw new Error(`WorksheetManager: 시트 '${name}'이 이미 존재합니다`);
    }
    this._sheets.set(name, { name, columns, data });
    this._renderTabs();

    // 첫 시트는 자동 활성
    if (this._sheets.size === 1) this.switch(name);
  }

  remove(name: string): void {
    if (!this._sheets.has(name)) return;
    if (this._sheets.size === 1) {
      throw new Error('WorksheetManager: 마지막 시트는 삭제할 수 없습니다');
    }
    const wasActive = this._active === name;
    this._sheets.delete(name);
    this._renderTabs();

    if (wasActive) {
      // 삭제 후 첫 번째 남은 시트로 전환
      this.switch(this._sheets.keys().next().value!);
    }
  }

  rename(oldName: string, newName: string): void {
    if (!this._sheets.has(oldName)) return;
    if (this._sheets.has(newName)) {
      throw new Error(`WorksheetManager: 시트 '${newName}'이 이미 존재합니다`);
    }
    const state = this._sheets.get(oldName)!;
    // Map 순서 유지를 위해 재삽입
    const entries = Array.from(this._sheets.entries()).map(([k, v]) =>
      k === oldName ? [newName, { ...v, name: newName }] as [string, WorksheetState<T>] : [k, v] as [string, WorksheetState<T>]
    );
    this._sheets = new Map(entries);
    if (this._active === oldName) this._active = newName;
    this._renderTabs();
  }

  switch(name: string): void {
    const state = this._sheets.get(name);
    if (!state) throw new Error(`WorksheetManager: 시트 '${name}'을 찾을 수 없습니다`);
    this._active = name;
    this._renderTabs();
    this._onSwitch(name, state);
  }

  get(name: string): WorksheetState<T> | undefined {
    return this._sheets.get(name);
  }

  getNames(): string[] {
    return Array.from(this._sheets.keys());
  }

  getActive(): string { return this._active; }

  /** 현재 활성 시트의 data를 갱신 (그리드 편집 동기화용) */
  syncData(name: string, data: T[]): void {
    const state = this._sheets.get(name);
    if (state) state.data = data;
  }

  destroy(): void {
    this._tabBar.remove();
  }

  // ── 탭 UI ────────────────────────────────────────────────

  private _buildTabBar(container: HTMLElement): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'og-sheet-tabs';
    container.appendChild(bar);
    return bar;
  }

  private _renderTabs(): void {
    this._tabBar.innerHTML = '';

    for (const name of this._sheets.keys()) {
      const tab = document.createElement('button');
      tab.className   = 'og-sheet-tab';
      tab.textContent = name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', name === this._active ? 'true' : 'false');
      if (name === this._active) tab.classList.add('og-sheet-tab--active');

      // 단순 클릭: 시트 전환
      tab.addEventListener('click', () => {
        if (name !== this._active) this.switch(name);
      });

      // 더블클릭: 인라인 이름 변경
      tab.addEventListener('dblclick', () => this._startRename(tab, name));

      this._tabBar.appendChild(tab);
    }

    // '+' 새 시트 버튼
    const addBtn = document.createElement('button');
    addBtn.className   = 'og-sheet-add';
    addBtn.textContent = '+';
    addBtn.setAttribute('aria-label', '새 워크시트 추가');
    addBtn.addEventListener('click', () => {
      const n = `Sheet${this._sheets.size + 1}`;
      this.add(n, [], []);
      this.switch(n);
    });
    this._tabBar.appendChild(addBtn);
  }

  /** 탭 더블클릭 → input으로 전환해 이름 변경 */
  private _startRename(tab: HTMLButtonElement, oldName: string): void {
    const input = document.createElement('input');
    input.className = 'og-sheet-tab-rename';
    input.value     = oldName;
    tab.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim() || oldName;
      try {
        if (newName !== oldName) this.rename(oldName, newName);
        else this._renderTabs();
      } catch {
        this._renderTabs();
      }
    };

    input.addEventListener('blur',   commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
  }
}
