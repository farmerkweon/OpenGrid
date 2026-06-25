// ============================================================
// 크로스그리드 레지스트리
// 그리드 바디(.og-body-wrapper) 엘리먼트 → 그리드 인스턴스 매핑.
// 드래그(좌표→타깃 그리드)와 화살표 셔틀이 공유한다.
// ============================================================
import type { OpenGrid } from './OpenGrid.js';   // 타입 전용 (런타임 순환 없음)

export class CrossGridRegistry {
  private _map = new Map<HTMLElement, OpenGrid<any>>();

  register(bodyEl: HTMLElement, grid: OpenGrid<any>): void { this._map.set(bodyEl, grid); }
  unregister(bodyEl: HTMLElement): void { this._map.delete(bodyEl); }
  get(bodyEl: HTMLElement): OpenGrid<any> | undefined { return this._map.get(bodyEl); }
  get size(): number { return this._map.size; }

  /** 커서 좌표 아래의 다른(crossGrid 허용) 그리드 반환. 없으면 null */
  resolveAt(clientX: number, clientY: number, exclude: OpenGrid<any>): OpenGrid<any> | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const body = el?.closest('.og-body-wrapper') as HTMLElement | null;
    if (!body) return null;
    const g = this._map.get(body);
    if (!g || g === exclude) return null;
    return g;
  }
}

/** 전역 단일 레지스트리 */
export const crossGridRegistry = new CrossGridRegistry();
