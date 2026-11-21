// ============================================================
// 가로 창의 그리기 차례(칸 구간과 빈칸) / Paint order of a column window (cell runs and gaps)
// 창은 「고정 구간 + 보이는 구간」과 그 사이·뒤의 빈칸으로 나뉜다. 행 그리개가 행마다 같은 계산을 되풀이하지 않게
// 그리기(또는 창 옮김) 한 번에 한 번 차례를 만들어 문맥에 담는다. 빈칸은 칸 요소가 아니라 폭만 가진 자리다.
//
// A window splits into the frozen run, the visible run and the gaps between/after them. The order is computed once
// per paint (or shift) and shared by all rows. A gap is a width-only spot, not a cell element.
// ============================================================
import { _el } from '../../dom.js';
import { leafColIndex } from '../../../coordinate/types.js';
import type { IColumnWindow } from '../../../coordinate/geometryPorts.js';
import type { BodyRowContext } from './BodyRowContext.js';

/** 차례의 한 토막 — 칸 구간 또는 빈칸(둘 다 닫힌 구간 [from, to]). / One piece: a cell run or a gap (closed range). */
export interface WindowPiece {
  readonly gap: boolean;
  readonly from: number;
  readonly to: number;
}

/**
 * 창 하나의 그리기 차례.
 *
 * Paint order of one window.
 */
export interface WindowLayout {
  readonly pieces: readonly WindowPiece[];
  /** 오른쪽 빈칸 바로 앞 칸의 컬럼(오른쪽 빈칸이 없으면 -1 — 창이 전 컬럼이면 늘 -1). / Column just before the right gap, or -1. */
  readonly lastBeforeGap: number;
}

/**
 * 창의 구간과 빈칸을 컬럼 차례대로 섞는다(DOM 차례 = 컬럼 차례 — 고정 칸 뒤에 빈칸이 와야 sticky 가 산다).
 *
 * Interleaves runs and gaps in column order (DOM order = column order, gaps after the frozen cells).
 */
export function layoutOf(w: IColumnWindow): WindowLayout {
  const pieces: WindowPiece[] = [];
  const segs = w.segments;
  const gaps = w.gaps();
  let si = 0, gi = 0;
  while (si < segs.length || gi < gaps.length) {
    const s = segs[si], g = gaps[gi];
    if (s && (!g || s.from < g.from)) { pieces.push({ gap: false, from: s.from, to: s.to }); si++; }
    else { pieces.push({ gap: true, from: g!.from, to: g!.to }); gi++; }
  }
  const last = pieces[pieces.length - 1];
  const before = pieces[pieces.length - 2];
  return Object.freeze({ pieces: Object.freeze(pieces), lastBeforeGap: last?.gap && before && !before.gap ? before.to : -1 });
}

/**
 * 빈칸 하나 — 칸 요소가 아니다(`og-cell`·`role`·`aria-colindex` 없음 — 칸을 찾는 길이 빈칸을 칸으로 오인하지 않게).
 * 폭은 기하에서 읽고 폭 쓰는 객체에 기억시켜, 끄는 동안 창 밖 컬럼 폭이 바뀌면 같은 프레임에 따라온다.
 *
 * A gap: not a cell (no `og-cell`/`role`/`aria-colindex`). Its width comes from the geometry and is registered so it
 * follows column-width changes outside the window in the same frame.
 */
export function paintGap(from: number, to: number, ctx: BodyRowContext): HTMLElement {
  const el = _el('div', 'og-col-gap');
  el.style.cssText = `width:${ctx.geometry.spanWidth(leafColIndex(from), to - from + 1)}px;flex-shrink:0;`;
  el.setAttribute('aria-hidden', 'true');
  ctx.applier?.trackGap(el, from, to, 'body');
  return el;
}

/**
 * 이미 있는 빈칸 요소를 새 구간으로 다시 쓴다(창 옮김에서 행마다 빈칸을 새로 만들지 않으려고). 폭은 기하에서, 등록은 갈아 끼움.
 *
 * Reuses an existing gap element for a new range (no new gap per row on a shift); width from the geometry, registration replaced.
 */
export function reuseGap(el: HTMLElement, from: number, to: number, ctx: BodyRowContext): HTMLElement {
  el.style.width = `${ctx.geometry.spanWidth(leafColIndex(from), to - from + 1)}px`;
  ctx.applier?.trackGap(el, from, to, 'body');
  return el;
}
