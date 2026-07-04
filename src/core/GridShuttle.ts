// ============================================================
// 그리드 셔틀 — 두 그리드 사이에 화살표 버튼을 두고
// "체크된 행"을 드래그 없이 버튼으로 이동(move)시킨다.
// 이동 자체는 grid.moveCheckedTo() 를 호출 → crossGridMapping(필드 매핑)과
// 3단계 이벤트가 드래그 이동과 100% 동일하게 적용된다.
// ============================================================
import type { OpenGridInstance } from './types.js';

export interface GridShuttleOptions {
  /** 버튼 배치 방향 (기본 'vertical') */
  layout?: 'vertical' | 'horizontal';
  /** 전체 이동(≫ ≪) 버튼도 표시 (기본 false) */
  includeAll?: boolean;
  /** 버튼 라벨 커스터마이즈 */
  labels?: { toRight?: string; toLeft?: string; allRight?: string; allLeft?: string };
}

export class GridShuttle {
  private _el: HTMLElement;

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

  destroy(): void { this._el.remove(); }
}

/** 두 그리드 사이에 셔틀(화살표 이동) 버튼을 만든다 */
export function createGridShuttle(
  left: OpenGridInstance,
  right: OpenGridInstance,
  mount: HTMLElement,
  opts?: GridShuttleOptions,
): GridShuttle {
  return new GridShuttle(left, right, mount, opts);
}
