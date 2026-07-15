// ============================================================
// 그리드 셔틀 — 두 그리드 사이에 화살표 버튼을 두고
// "체크된 행"을 드래그 없이 버튼으로 이동(move)시킨다.
// 이동 자체는 grid.moveCheckedTo() 를 호출 → crossGridMapping(필드 매핑)과
// 3단계 이벤트가 드래그 이동과 동일하게 적용된다.
// ============================================================
import type { OpenGridInstance } from './types.js';

/**
 * 그리드 셔틀 생성 옵션. / Grid shuttle construction options.
 */
export interface GridShuttleOptions {
  /** 버튼 배치 방향. 두 그리드가 가로로 나란히 있으면 'vertical'(위아래 버튼), 세로로 쌓여 있으면
   * 'horizontal'을 쓴다. 기본 'vertical'.
   * / Button layout direction. Use 'vertical' (stacked buttons) when the two grids sit side by side,
   * or 'horizontal' when they're stacked vertically. Default 'vertical'.
   *  @defaultValue 'vertical' */
  layout?: 'vertical' | 'horizontal';
  /** 전체 이동(≫ ≪) 버튼도 표시. "전체 선택 후 이동"을 한 번의 클릭으로 줄이고 싶을 때 켠다.
   * 기본 false(개별 이동 버튼만 표시).
   * / Also show move-all (≫ ≪) buttons, so a full transfer takes one click instead of
   * "select all, then move". Default false (only the per-check move buttons are shown).
   *  @defaultValue false */
  includeAll?: boolean;
  /** 버튼 라벨 커스터마이즈(다국어 문구를 직접 넣고 싶을 때). 생략 시 그리드 로케일의 기본
   * 문구(▶ ◀ ⏩ ⏪)를 사용한다.
   * / Customize button labels (e.g. to hardcode a specific phrase). Falls back to the grid's
   * locale defaults (▶ ◀ ⏩ ⏪) when omitted. */
  labels?: { toRight?: string; toLeft?: string; allRight?: string; allLeft?: string };
}

/**
 * 두 그리드 사이의 셔틀 UI. / Shuttle UI between two grids.
 *
 * "가용 항목 그리드"와 "선택된 항목 그리드"를 나란히 두고, 그 사이에서 체크한 행을 화살표
 * 버튼으로 옮기고 싶을 때 쓴다(권한 배정, 컬럼 표시 여부 선택 같은 화면에 흔한 UI 패턴).
 * 동작 순서는 이렇다: 사용자가 왼쪽 그리드에서 행을 체크하고 ▶ 버튼을 클릭하면, 내부적으로
 * `grid.moveCheckedTo()` 가 호출되어 오른쪽 그리드로 행이 옮겨진다 — 이때 crossGridMapping
 * (필드 매핑)과 3단계 이벤트가 드래그로 옮길 때와 동일하게 적용되므로, 버튼 이동과 드래그
 * 이동을 섞어 써도 동작이 갈리지 않는다.
 * / Places arrow buttons between an "available items" grid and a "selected items" grid so
 * checked rows can be moved between them without dragging (a common pattern for permission
 * assignment, column visibility pickers, etc.). Operation order: the user checks rows in the
 * left grid and clicks ▶, which internally calls `grid.moveCheckedTo()` to move those rows into
 * the right grid — crossGridMapping (field mapping) and the 3-stage events apply identically to
 * drag-based moves, so mixing button moves with drag moves never behaves differently.
 *
 * @example
 * const shuttle = new GridShuttle(leftGrid, rightGrid, document.querySelector('#mid')!, {
 *   layout: 'vertical',
 *   includeAll: true,
 * });
 */
export class GridShuttle {
  private _el: HTMLElement;

  /**
   * @param _left - 왼쪽 그리드 인스턴스 / Left grid instance
   * @param _right - 오른쪽 그리드 인스턴스 / Right grid instance
   * @param mount - 셔틀 버튼을 붙일 마운트 엘리먼트 / Mount element to attach the shuttle buttons
   * @param opts - 셔틀 옵션 / Shuttle options
   */
  constructor(
    private _left: OpenGridInstance,
    private _right: OpenGridInstance,
    mount: HTMLElement,
    opts: GridShuttleOptions = {},
  ) {
    const wrap = document.createElement('div');
    wrap.className = 'og-shuttle';
    wrap.style.cssText =
      `display:flex;gap:6px;align-items:center;justify-content:center;` +
      `flex-direction:${opts.layout === 'horizontal' ? 'row' : 'column'};`;

    const mk = (label: string, title: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'og-shuttle-btn';
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        'min-width:34px;height:30px;padding:0 8px;border:1px solid #bbb;border-radius:7px;' +
        'background:#fff;cursor:pointer;font-size:14px;color:#444;line-height:1;' +
        'box-shadow:0 1px 2px rgba(0,0,0,0.06);';
      b.addEventListener('mouseover', () => { b.style.background = '#f0f6ff'; b.style.borderColor = '#1976d2'; });
      b.addEventListener('mouseout',  () => { b.style.background = '#fff';     b.style.borderColor = '#bbb'; });
      b.addEventListener('click', fn);
      return b;
    };

    const L = opts.labels ?? {};
    // i18n: 버튼 title 은 왼쪽 그리드 인스턴스 로케일로 해석(라벨 옵션이 있으면 그 값이 우선).
    const t = (key: string) => this._left.t(key);
    wrap.appendChild(mk(L.toRight ?? '▶', t('shuttle.toRight'),
      () => { void this._left.moveCheckedTo(this._right); }));
    wrap.appendChild(mk(L.toLeft ?? '◀', t('shuttle.toLeft'),
      () => { void this._right.moveCheckedTo(this._left); }));

    if (opts.includeAll) {
      wrap.appendChild(mk(L.allRight ?? '⏩', t('shuttle.allRight'),
        () => { void this._moveAll(this._left, this._right); }));
      wrap.appendChild(mk(L.allLeft ?? '⏪', t('shuttle.allLeft'),
        () => { void this._moveAll(this._right, this._left); }));
    }

    mount.appendChild(wrap);
    this._el = wrap;
  }

  private _moveAll(from: OpenGridInstance, to: OpenGridInstance): void {
    const n = from.getData().length;
    if (n > 0) void from.moveRowsTo(to, Array.from({ length: n }, (_, i) => i));
  }

  /** 셔틀 UI 를 DOM 에서 제거한다. / Remove the shuttle UI from the DOM. */
  destroy(): void { this._el.remove(); }
}

/**
 * 두 그리드 사이에 셔틀(화살표 이동) 버튼을 만든다. / Create shuttle (arrow-move) buttons between two grids.
 *
 * `new GridShuttle(...)` 과 동일하되, `new` 없이 함수 호출 한 줄로 끝내고 싶을 때 쓰는 편의 팩토리.
 * / Same as `new GridShuttle(...)`, but a convenience factory for callers who'd rather skip `new`.
 *
 * @param left - 왼쪽 그리드 인스턴스 / Left grid instance
 * @param right - 오른쪽 그리드 인스턴스 / Right grid instance
 * @param mount - 셔틀 버튼을 붙일 마운트 엘리먼트 / Mount element to attach the shuttle buttons
 * @param opts - 셔틀 옵션 / Shuttle options
 * @returns 생성된 GridShuttle 인스턴스 / The created GridShuttle instance
 * @example
 * const shuttle = createGridShuttle(leftGrid, rightGrid, mountEl, { includeAll: true });
 */
export function createGridShuttle(
  left: OpenGridInstance,
  right: OpenGridInstance,
  mount: HTMLElement,
  opts?: GridShuttleOptions,
): GridShuttle {
  return new GridShuttle(left, right, mount, opts);
}
