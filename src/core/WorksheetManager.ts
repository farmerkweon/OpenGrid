// ============================================================
// WorksheetManager — 그리드 다중 워크시트(탭) 관리자
// 레이어: Orchestration (시트 상태 관리 + 탭 UI 조율)
// 설계 근거(Why): OpenGrid 내부에 _wsManager로 보유.
//   시트별로 독립적인 columns + data를 Map으로 관리하고,
//   탭 클릭 시 OpenGrid.setData/applyColumns로 화면 전환.
//   탭 UI는 그리드 컨테이너 하단에 .og-sheet-tabs 영역으로 삽입.
// ============================================================

import type { ColumnDef, WorksheetDef, WorksheetState } from './types.js';
import { t as _globalT } from './i18n/LocaleRegistry.js';

/** 시트 전환 시 호출되는 콜백. / Callback invoked when the active sheet switches. */
export type SwitchCallback<T> = (name: string, state: WorksheetState<T>) => void;
/** i18n: 탭 UI aria 해석기(주입 없으면 전역 t). / i18n: tab-UI aria resolver (global t when not injected). */
export type WorksheetT = (key: string, params?: Record<string, string | number>) => string;

/**
 * 그리드 다중 워크시트(탭) 관리자. / Manages the grid's multiple worksheets (tabs).
 *
 * 시트별로 독립적인 `columns`/`data` 를 `Map` 으로 보유하고, 탭 클릭 시
 * `onSwitch` 콜백을 통해 `OpenGrid.setData`/`applyColumns` 로 화면을 전환시킨다.
 * 탭 UI는 그리드 컨테이너 하단에 `.og-sheet-tabs` 영역으로 삽입된다.
 * / Holds independent `columns`/`data` per sheet in a `Map`; a tab click drives the
 * `onSwitch` callback, which the caller uses to run `OpenGrid.setData`/`applyColumns`.
 * The tab UI is inserted as a `.og-sheet-tabs` region at the bottom of the grid container.
 */
export class WorksheetManager<T extends Record<string, any> = any> {
  private _sheets: Map<string, WorksheetState<T>> = new Map();
  private _active: string = '';
  private _tabBar: HTMLElement;
  private _onSwitch: SwitchCallback<T>;
  private _t: WorksheetT;

  constructor(container: HTMLElement, onSwitch: SwitchCallback<T>, t?: WorksheetT) {
    this._onSwitch = onSwitch;
    this._t        = t ?? _globalT;
    this._tabBar   = this._buildTabBar(container);
  }

  // ── 시트 CRUD ────────────────────────────────────────────

  /**
   * 새 시트를 추가한다. / Add a new sheet.
   *
   * 첫 번째로 추가되는 시트는 자동으로 활성화된다. / The first sheet ever added is auto-activated.
   *
   * @param name - 시트 이름(고유해야 함) / Sheet name (must be unique)
   * @param columns - 시트 컬럼 정의(기본 빈 배열) / Sheet column definitions (default empty array)
   * @param data - 시트 초기 데이터(기본 빈 배열) / Initial sheet data (default empty array)
   */
  add(name: string, columns: ColumnDef<T>[] = [], data: T[] = []): void {
    if (this._sheets.has(name)) {
      throw new Error(`WorksheetManager: 시트 '${name}'이 이미 존재합니다`);
    }
    this._sheets.set(name, { name, columns, data });
    this._renderTabs();

    // 첫 시트는 자동 활성
    if (this._sheets.size === 1) this.switch(name);
  }

  /**
   * 시트를 제거한다. / Remove a sheet.
   *
   * 마지막 남은 시트는 제거할 수 없다(예외 발생). 활성 시트를 제거하면 남은 시트 중
   * 첫 번째로 자동 전환한다. / The last remaining sheet cannot be removed (throws).
   * Removing the active sheet auto-switches to the first remaining sheet.
   *
   * @param name - 제거할 시트 이름 / Name of the sheet to remove
   */
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

  /**
   * 시트 이름을 변경한다. / Rename a sheet.
   *
   * 삽입 순서(`Map` 순회 순서) 유지를 위해 내부적으로 시트 맵을 재구성한다.
   * / Internally rebuilds the sheet map to preserve insertion order (`Map` iteration order).
   *
   * @param oldName - 기존 시트 이름 / Current sheet name
   * @param newName - 새 시트 이름(고유해야 함) / New sheet name (must be unique)
   */
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

  /**
   * 지정 시트를 활성화하고 `onSwitch` 콜백을 실행한다. / Activate the given sheet and invoke the `onSwitch` callback.
   *
   * @param name - 활성화할 시트 이름 / Name of the sheet to activate
   */
  switch(name: string): void {
    const state = this._sheets.get(name);
    if (!state) throw new Error(`WorksheetManager: 시트 '${name}'을 찾을 수 없습니다`);
    this._active = name;
    this._renderTabs();
    this._onSwitch(name, state);
  }

  /**
   * 시트 상태를 조회한다. / Look up a sheet's state.
   *
   * @param name - 조회할 시트 이름 / Name of the sheet to look up
   * @returns 시트 상태, 없으면 `undefined` / The sheet state, or `undefined`
   */
  get(name: string): WorksheetState<T> | undefined {
    return this._sheets.get(name);
  }

  /** 등록된 모든 시트 이름 목록(삽입 순서). / Names of all registered sheets, in insertion order. */
  getNames(): string[] {
    return Array.from(this._sheets.keys());
  }

  /** 현재 활성 시트 이름. / Name of the currently active sheet. */
  getActive(): string { return this._active; }

  /**
   * 지정 시트의 데이터를 갱신한다(그리드 편집 동기화용). / Update a sheet's data (for syncing grid edits back).
   *
   * @param name - 갱신할 시트 이름 / Name of the sheet to update
   * @param data - 새 데이터 배열 / New data array
   */
  syncData(name: string, data: T[]): void {
    const state = this._sheets.get(name);
    if (state) state.data = data;
  }

  /** 탭 바 DOM 을 제거한다. / Remove the tab-bar DOM. */
  destroy(): void {
    this._tabBar.remove();
  }

  // ── 탭 UI ────────────────────────────────────────────────

  /** @internal 탭 바 컨테이너를 생성해 그리드 컨테이너에 삽입한다. / Creates the tab-bar container and appends it to the grid container. */
  private _buildTabBar(container: HTMLElement): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'og-sheet-tabs';
    container.appendChild(bar);
    return bar;
  }

  /** @internal 탭 바를 전체 재렌더한다(시트 목록 + '+' 버튼). / Fully re-renders the tab bar (sheet list + '+' button). */
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
    addBtn.setAttribute('aria-label', this._t('worksheet.addAria'));
    addBtn.addEventListener('click', () => {
      const n = `Sheet${this._sheets.size + 1}`;
      this.add(n, [], []);
      this.switch(n);
    });
    this._tabBar.appendChild(addBtn);
  }

  /** @internal 탭 더블클릭 → input으로 전환해 이름 변경. / Double-click on a tab switches it to an input for inline rename. */
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
