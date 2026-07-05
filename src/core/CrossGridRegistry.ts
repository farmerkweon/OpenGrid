// ============================================================
// 크로스그리드 레지스트리
// 그리드 바디(.og-body-wrapper) 엘리먼트 → 그리드 인스턴스 매핑.
// 드래그(좌표→타깃 그리드)와 화살표 셔틀이 공유한다.
// ============================================================
import type { OpenGrid } from './OpenGrid.js';   // 타입 전용 (런타임 순환 없음)

/**
 * 크로스그리드 레지스트리. / Cross-grid registry.
 *
 * 그리드 바디(`.og-body-wrapper`) 엘리먼트를 그리드 인스턴스에 매핑한다.
 * 그리드↔그리드 드래그(좌표 → 타깃 그리드)와 화살표 셔틀이 공유하는 전역 조회처다.
 * / Maps each grid body (`.og-body-wrapper`) element to its grid instance. Shared by
 * grid-to-grid drag (coordinate → target grid) and the arrow-key shuttle as the
 * global lookup point.
 */
export class CrossGridRegistry {
  private _map = new Map<HTMLElement, OpenGrid<any>>();

  /**
   * 바디 엘리먼트 → 그리드 매핑을 등록한다. / Register a body element → grid mapping.
   *
   * @param bodyEl - 그리드 바디 래퍼 엘리먼트 / The grid body wrapper element
   * @param grid - 대응 그리드 인스턴스 / The corresponding grid instance
   */
  register(bodyEl: HTMLElement, grid: OpenGrid<any>): void { this._map.set(bodyEl, grid); }

  /**
   * 등록을 해제한다. / Remove a registration.
   *
   * @param bodyEl - 해제할 바디 엘리먼트 / The body element to unregister
   */
  unregister(bodyEl: HTMLElement): void { this._map.delete(bodyEl); }

  /**
   * 바디 엘리먼트로 그리드를 조회한다. / Look up a grid by its body element.
   *
   * @param bodyEl - 그리드 바디 래퍼 엘리먼트 / The grid body wrapper element
   * @returns 매핑된 그리드, 없으면 `undefined` / The mapped grid, or `undefined`
   */
  get(bodyEl: HTMLElement): OpenGrid<any> | undefined { return this._map.get(bodyEl); }

  /** 등록된 그리드 수. / Number of registered grids. */
  get size(): number { return this._map.size; }

  /**
   * 커서 좌표 아래의 다른(crossGrid 허용) 그리드를 반환한다. / Resolve another (crossGrid-enabled) grid under the cursor.
   *
   * @param clientX - 커서 X 좌표(뷰포트 기준) / Cursor X in viewport coordinates
   * @param clientY - 커서 Y 좌표(뷰포트 기준) / Cursor Y in viewport coordinates
   * @param exclude - 제외할 그리드(보통 드래그 원본) / Grid to exclude (usually the drag source)
   * @returns 좌표 아래의 대상 그리드, 없으면 `null` / The target grid under the point, or `null`
   */
  resolveAt(clientX: number, clientY: number, exclude: OpenGrid<any>): OpenGrid<any> | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const body = el?.closest('.og-body-wrapper') as HTMLElement | null;
    if (!body) return null;
    const g = this._map.get(body);
    if (!g || g === exclude) return null;
    return g;
  }
}

/** 전역 단일 레지스트리. / Global singleton registry. */
export const crossGridRegistry = new CrossGridRegistry();
