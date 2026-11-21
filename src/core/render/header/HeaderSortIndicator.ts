// ============================================================
// 머리글 정렬 표시 / Header sort indicator
//
// 정렬이 바뀌면 머리글 전체를 다시 만들지 않고, 정렬 표시(og-sorted 클래스 · 화살표 · aria-sort)만
// 바뀐 머리글 칸에서 고친다. 머리글을 다시 만들면 칸 요소가 새로 생겨(손잡이·듣개·초점이 다시 붙음)
// 칸 수만큼 스타일 계산이 다시 돌고, 높이도 다시 재야 한다 — 정렬은 표시 몇 개만 바꾸면 되는 일이다.
// 고친 결과는 머리글을 처음부터 그린 것과 같은 속성·자식이다(같은 클래스 차례·같은 화살표 글자·같은 자리).
// 눌림 표시(og-sorting)와 진행 중 표시(aria-busy)도 이 객체가 맡는다.
//
// When the sort changes, only the sort marks (og-sorted class, arrow, aria-sort) of the header cells that
// changed are patched, instead of rebuilding the header (which recreates every cell, re-attaches handles and
// listeners, restyles all cells and re-measures the height). The patched cells carry exactly the attributes and
// children a fresh header paint produces. The pressed (og-sorting) and busy (aria-busy) marks live here too.
// ============================================================
import type { IHeaderSortIndicator } from '../ports.js';
import { _el } from '../dom.js';

type Dir = 'asc' | 'desc';

/** 묶어 둔 머리글 칸 하나와 지금 그 칸에 그려진 방향. / One bound header cell and the direction it shows. */
interface Bound {
  readonly th: HTMLElement;
  readonly field: string;
  readonly sortable: boolean;
  dir: Dir | null;
}

const ICON_CLASS = 'og-sort-icon';
const ARROW: Readonly<Record<Dir, string>> = { asc: ' ↑', desc: ' ↓' };
const ARIA: Readonly<Record<Dir, string>> = { asc: 'ascending', desc: 'descending' };

/**
 * 머리글 칸들의 정렬 표시를 고치는 유일한 곳. 머리글을 그린 쪽이 칸마다 bind 하고, 정렬이 끝나면 update 한 번.
 *
 * The single place that patches sort marks on header cells; the header painter binds each cell, and update()
 * runs once when a sort finishes.
 */
export class HeaderSortIndicator implements IHeaderSortIndicator {
  private _bound: Bound[] = [];
  private _pressed: string | null = null;

  /**
   * 머리글 칸 하나를 묶는다. 지금 그 칸에 그려진 방향은 칸에서 읽는다(머리글을 그린 쪽이 이미 그렸으므로).
   * Binds one header cell; its current direction is read from the cell (the painter already drew it).
   */
  bind(th: HTMLElement, field: string, sortable: boolean): void {
    const icon = this._icon(th);
    const dir: Dir | null = !th.classList.contains('og-sorted') ? null : icon?.textContent === ARROW.desc ? 'desc' : 'asc';
    this._bound.push({ th, field, sortable, dir });
  }

  /** 끝나는 프레임에 한 번 — 방향이 바뀐 칸만 쓴다(안 바뀐 칸은 읽기·쓰기 0). */
  update(sortList: readonly { readonly field: string; readonly dir: Dir }[]): void {
    for (const b of this._bound) {
      const want = sortList.find(s => s.field === b.field)?.dir ?? null;
      if (want !== b.dir) this._paint(b, want);
    }
  }

  /** 누른 칸에 눌림 표시(og-sorting). null 이면 지운다. / Pressed mark on the field's cells; null clears it. */
  setPressed(field: string | null): void {
    if (this._pressed === field) return;
    for (const b of this._bound) {
      if (b.field === this._pressed) b.th.classList.remove('og-sorting');
      if (b.field === field) b.th.classList.add('og-sorting');
    }
    this._pressed = field;
  }

  /**
   * 오래 걸리는 정렬이 진행 중인 칸에 aria-busy. 진행 막대·다음 방향 표시는 조각 정렬이 들어올 때 이 메서드 안에서 더한다.
   * aria-busy on the cells of a long-running sort; the progress bar and next-direction hint belong here when sliced sorting lands.
   */
  setBusy(field: string, busy: boolean, _nextDir?: Dir): void {
    for (const b of this._bound) {
      if (b.field !== field) continue;
      if (busy) b.th.setAttribute('aria-busy', 'true');
      else b.th.removeAttribute('aria-busy');
    }
  }

  /** 묶음을 모두 푼다(머리글을 통째로 다시 그리기 전). 칸은 건드리지 않는다. / Drops all bindings without touching cells. */
  release(): void {
    this._bound = [];
    this._pressed = null;
  }

  /**
   * 머리글을 처음 그릴 때와 같은 모양으로 고친다: og-sorted 는 클래스 끝에, 화살표는 제목 글자 바로 뒤에,
   * aria-sort 는 정렬 가능한 칸에만.
   * Patches to the fresh-paint shape: og-sorted appended, the arrow right after the label, aria-sort only when sortable.
   */
  private _paint(b: Bound, dir: Dir | null): void {
    const th = b.th;
    let icon = this._icon(th);
    if (dir) {
      th.classList.add('og-sorted');
      if (!icon) {
        icon = _el('span', ICON_CLASS);
        const label = th.firstElementChild;
        th.insertBefore(icon, label ? label.nextSibling : th.firstChild);
      }
      icon.textContent = ARROW[dir];
    } else {
      th.classList.remove('og-sorted');
      icon?.remove();
    }
    if (b.sortable) th.setAttribute('aria-sort', dir ? ARIA[dir] : 'none');
    b.dir = dir;
  }

  private _icon(th: HTMLElement): HTMLElement | null {
    for (let c = th.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains(ICON_CLASS)) return c as HTMLElement;
    return null;
  }
}
