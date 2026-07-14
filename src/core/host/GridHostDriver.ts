// ============================================================
// DD-14 §2.2 GridHostDriver — 코어측 험블 드라이버(포트 구현체) / core-side humble driver
// 포트 4동사를 기존 OpenGrid 파사드 호출로 번역만 한다. 프레임워크를 전혀 모른다.
// 이 클래스 덕에 4어댑터가 파사드 배선(생성/파괴/이벤트/재조정)을 중복 구현하지 않는다.
// ============================================================
import { OpenGrid } from '../OpenGrid.js';
import type { GridOptions } from '../types.js';
import type { GridHostPort, GridPropsPatch, Unsubscribe, HostEventHandler } from './GridHostPort.js';
import type { CapabilitySnapshot } from './CapabilityRegistry.js';
import { CAPABILITY_REGISTRY } from './CapabilityRegistry.js';
import { reconcile } from './reconcile.js';

function devWarn(msg: string): void {
  // 헤드리스: console 만 사용(DOM 미참조). 프로덕션 minify 에서 트리셰이킹 가능.
  if (typeof console !== 'undefined') console.warn(`[open-grid/host] ${msg}`);
}

/**
 * 포트를 OpenGrid 파사드로 구동하는 험블 드라이버.
 * CRC: 책임=파사드 생명주기·이벤트·재조정 번역 / 협력자=OpenGrid(파사드)·reconcile·CapabilityRegistry.
 */
export class GridHostDriver<T extends Record<string, any> = any> implements GridHostPort<T> {
  private _grid: OpenGrid<T> | null = null;
  private _container: HTMLElement | null = null;
  private _lastOptions: GridOptions<T> | null = null;
  private readonly _subs = new Set<Unsubscribe>();

  mount(container: HTMLElement, options: GridOptions<T>): void {
    if (this._grid) {
      devWarn('mount() on already-mounted driver');
      return;
    }
    this._container = container;
    this._lastOptions = options;
    this._grid = new OpenGrid<T>(container, options); // 유일한 파사드 진입점(컴포저 경유).
  }

  unmount(): void {
    for (const off of this._subs) off();
    this._subs.clear();
    this._grid?.destroy();
    this._grid = null;
    this._container = null;
    this._lastOptions = null;
  }

  updateProps(patch: GridPropsPatch<T>): void {
    if (!this._grid) {
      devWarn('updateProps() before mount');
      return;
    }
    const plan = reconcile(this._lastOptions!, patch);
    if (plan.recreate) {
      this._recreate(patch);
      return;
    }
    if (plan.data) this._grid.setData(patch.data as T[]);
    if (plan.theme) this._grid.setTheme(patch.theme!);
    if (plan.skin) this._grid.setSkin(patch.skin!);
    if (plan.options) {
      // 파사드 in-place 갱신 표면(setOptions). 부재 시(대체 드라이버 등) 재생성 폴백(패리티 보존).
      if (typeof this._grid.setOptions === 'function') {
        this._grid.setOptions(patch.options!);
        Object.assign(this._lastOptions!, patch.options!);
      } else {
        this._recreate(patch);
      }
    }
  }

  subscribe(event: string, handler: HostEventHandler): Unsubscribe {
    this._grid?.on(event, handler);
    const off: Unsubscribe = () => {
      this._grid?.off(event, handler);
    };
    this._subs.add(off);
    return () => {
      off();
      this._subs.delete(off);
    };
  }

  get capabilities(): CapabilitySnapshot {
    return CAPABILITY_REGISTRY.snapshot();
  }

  get mounted(): boolean {
    return this._grid !== null;
  }

  /** 구조 변경 시 원자적 재생성(이벤트 재구독 포함). / Atomic recreate on structural change. */
  private _recreate(patch: GridPropsPatch<T>): void {
    const container = this._container!;
    // 재구독 대상 보존(현 subscribe 재적용).
    const grid = this._grid;
    const nextOptions: GridOptions<T> = {
      ...(this._lastOptions as GridOptions<T>),
      ...(patch.options ?? {}),
    };
    if (patch.columns !== undefined) {
      (nextOptions as any).columns = patch.columns;
    }
    if (patch.data !== undefined) {
      (nextOptions as any).data = patch.data;
    }
    for (const off of this._subs) off();
    this._subs.clear();
    grid?.destroy();
    this._grid = new OpenGrid<T>(container, nextOptions);
    this._lastOptions = nextOptions;
    if (patch.theme !== undefined) this._grid.setTheme(patch.theme);
    if (patch.skin !== undefined) this._grid.setSkin(patch.skin);
  }
}

/**
 * 코어가 export 하는 유일한 팩토리 — 어댑터는 구현 클래스(GridHostDriver)를 모른다(캡슐화, Abstract Factory).
 * 서버/헤드리스 타깃용 대체 드라이버는 팩토리 뒤에서 교체 가능(REQ-TX-846).
 * / The single factory the core exports; adapters never see the concrete driver class.
 */
export function createGridHost<T extends Record<string, any> = any>(): GridHostPort<T> {
  return new GridHostDriver<T>();
}
