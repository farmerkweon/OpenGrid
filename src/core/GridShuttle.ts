// ============================================================
// 그리드 셔틀 — 두 그리드 사이에 화살표 버튼을 두고
// "체크된 행"을 드래그 없이 버튼으로 이동(move)시킨다.
// 이동 자체는 grid.moveCheckedTo() 를 호출 → crossGridMapping(필드 매핑)과
// 3단계 이벤트가 드래그 이동과 동일하게 적용된다.
// ============================================================
import type { OpenGridInstance } from './types.js';

/**
 * 그리드 셔틀 생성 옵션.
 *
 * Grid shuttle construction options.
 *
 * グリッドシャトルの生成オプション。
 *
 * 表格穿梭框的构造选项。
 */
export interface GridShuttleOptions {
  /**
   * 버튼 배치 방향. 두 그리드가 가로로 나란히 있으면 'vertical'(위아래 버튼), 세로로 쌓여 있으면
   * 'horizontal'을 쓴다. 기본 'vertical'.
   *
   * Button layout direction. Use 'vertical' (stacked buttons) when the two grids sit side by side,
   * or 'horizontal' when they're stacked vertically. Default 'vertical'.
   *
   * ボタンの配置方向。2つのグリッドが横に並んでいる場合は 'vertical'(上下のボタン)、縦に積まれて
   * いる場合は 'horizontal' を使います。既定は 'vertical'。
   *
   * 按钮的排列方向。两个表格左右并排时用 'vertical'(上下排列的按钮),上下堆叠时用
   * 'horizontal'。默认 'vertical'。
   *
   * @defaultValue 'vertical'
   */
  layout?: 'vertical' | 'horizontal';
  /**
   * 전체 이동(≫ ≪) 버튼도 표시. "전체 선택 후 이동"을 한 번의 클릭으로 줄이고 싶을 때 켠다.
   * 기본 false(개별 이동 버튼만 표시).
   *
   * Also show move-all (≫ ≪) buttons, so a full transfer takes one click instead of
   * "select all, then move". Default false (only the per-check move buttons are shown).
   *
   * 全件移動(≫ ≪)ボタンも表示します。「全選択してから移動」を1回のクリックに縮めたいときに
   * 有効にします。既定は false(個別移動ボタンのみ表示)。
   *
   * 同时显示全部移动(≫ ≪)按钮,把「全选后再移动」缩短为一次点击。默认 false(仅显示单项
   * 移动按钮)。
   *
   * @defaultValue false
   */
  includeAll?: boolean;
  /**
   * 버튼 라벨 커스터마이즈(다국어 문구를 직접 넣고 싶을 때). 생략 시 그리드 로케일의 기본
   * 문구(▶ ◀ ⏩ ⏪)를 사용한다.
   *
   * Customize button labels (e.g. to hardcode a specific phrase). Falls back to the grid's
   * locale defaults (▶ ◀ ⏩ ⏪) when omitted.
   *
   * ボタンラベルのカスタマイズ(多言語の文言を直接入れたいとき)。省略した場合はグリッドロケールの
   * 既定の文言(▶ ◀ ⏩ ⏪)を使います。
   *
   * 自定义按钮标签(需要直接写入多语言文案时)。省略时回退到表格区域设置的默认文案
   * (▶ ◀ ⏩ ⏪)。
   */
  labels?: { toRight?: string; toLeft?: string; allRight?: string; allLeft?: string };
}

/**
 * 두 그리드 사이의 셔틀 UI.
 *
 * Shuttle UI between two grids.
 *
 * 2つのグリッドの間に置くシャトルUI。
 *
 * 两个表格之间的穿梭框 UI。
 *
 * "가용 항목 그리드"와 "선택된 항목 그리드"를 나란히 두고, 그 사이에서 체크한 행을 화살표
 * 버튼으로 옮기고 싶을 때 쓴다(권한 배정, 컬럼 표시 여부 선택 같은 화면에 흔한 UI 패턴).
 * 동작 순서는 이렇다: 사용자가 왼쪽 그리드에서 행을 체크하고 ▶ 버튼을 클릭하면, 내부적으로
 * `grid.moveCheckedTo()` 가 호출되어 오른쪽 그리드로 행이 옮겨진다 — 이때 crossGridMapping
 * (필드 매핑)과 3단계 이벤트가 드래그로 옮길 때와 동일하게 적용되므로, 버튼 이동과 드래그
 * 이동을 섞어 써도 동작이 갈리지 않는다.
 *
 * Places arrow buttons between an "available items" grid and a "selected items" grid so
 * checked rows can be moved between them without dragging (a common pattern for permission
 * assignment, column visibility pickers, etc.). Operation order: the user checks rows in the
 * left grid and clicks ▶, which internally calls `grid.moveCheckedTo()` to move those rows into
 * the right grid — crossGridMapping (field mapping) and the 3-stage events apply identically to
 * drag-based moves, so mixing button moves with drag moves never behaves differently.
 *
 * 「利用可能な項目のグリッド」と「選択された項目のグリッド」を並べて置き、その間でチェックした行を
 * 矢印ボタンで移したいときに使います(権限の割り当てや、列の表示可否の選択といった画面によくあるUI
 * パターンです)。動作の順序は次のとおりです。ユーザーが左のグリッドで行をチェックして ▶ ボタンを
 * クリックすると、内部で `grid.moveCheckedTo()` が呼ばれ、右のグリッドへ行が移されます — このとき
 * crossGridMapping(フィールドマッピング)と3段階のイベントがドラッグで移すときと同じように適用
 * されるため、ボタン移動とドラッグ移動を混ぜて使っても動作が食い違うことはありません。
 *
 * 在「可用项目表格」和「已选项目表格」之间放置箭头按钮,无需拖拽即可移动勾选的行(权限分配、
 * 列显示与否的选择等界面中常见的 UI 模式)。动作顺序如下:用户在左侧表格勾选行并点击 ▶,内部
 * 就会调用 `grid.moveCheckedTo()` 把这些行移入右侧表格 — 此时 crossGridMapping(字段映射)
 * 和 3 阶段事件与拖拽移动完全相同地生效,因此混用按钮移动和拖拽移动也不会出现动作分歧。
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
   * @param _left - 왼쪽 그리드 인스턴스
   *
   * Left grid instance.
   *
   * 左のグリッドインスタンス。
   *
   * 左侧表格实例。
   *
   * @param _right - 오른쪽 그리드 인스턴스
   *
   * Right grid instance.
   *
   * 右のグリッドインスタンス。
   *
   * 右侧表格实例。
   *
   * @param mount - 셔틀 버튼을 붙일 마운트 엘리먼트
   *
   * Mount element to attach the shuttle buttons.
   *
   * シャトルボタンを取り付けるマウント要素。
   *
   * 用于挂载穿梭框按钮的元素。
   *
   * @param opts - 셔틀 옵션
   *
   * Shuttle options.
   *
   * シャトルのオプション。
   *
   * 穿梭框选项。
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

  /**
   * 셔틀 UI 를 DOM 에서 제거한다.
   *
   * Remove the shuttle UI from the DOM.
   *
   * シャトルUIをDOMから取り除きます。
   *
   * 从 DOM 中移除穿梭框 UI。
   */
  destroy(): void { this._el.remove(); }
}

/**
 * 두 그리드 사이에 셔틀(화살표 이동) 버튼을 만든다.
 *
 * Create shuttle (arrow-move) buttons between two grids.
 *
 * 2つのグリッドの間にシャトル(矢印移動)ボタンを作ります。
 *
 * 在两个表格之间创建穿梭框(箭头移动)按钮。
 *
 * `new GridShuttle(...)` 과 동일하되, `new` 없이 함수 호출 한 줄로 끝내고 싶을 때 쓰는 편의 팩토리.
 *
 * Same as `new GridShuttle(...)`, but a convenience factory for callers who'd rather skip `new`.
 *
 * `new GridShuttle(...)` と同じですが、`new` なしで関数呼び出し1行で済ませたいときに使う便利
 * ファクトリです。
 *
 * 与 `new GridShuttle(...)` 相同,只是为不想写 `new` 的调用方提供的便捷工厂。
 *
 * @param left - 왼쪽 그리드 인스턴스
 *
 * Left grid instance.
 *
 * 左のグリッドインスタンス。
 *
 * 左侧表格实例。
 *
 * @param right - 오른쪽 그리드 인스턴스
 *
 * Right grid instance.
 *
 * 右のグリッドインスタンス。
 *
 * 右侧表格实例。
 *
 * @param mount - 셔틀 버튼을 붙일 마운트 엘리먼트
 *
 * Mount element to attach the shuttle buttons.
 *
 * シャトルボタンを取り付けるマウント要素。
 *
 * 用于挂载穿梭框按钮的元素。
 *
 * @param opts - 셔틀 옵션
 *
 * Shuttle options.
 *
 * シャトルのオプション。
 *
 * 穿梭框选项。
 *
 * @returns 생성된 GridShuttle 인스턴스
 *
 * The created GridShuttle instance.
 *
 * 生成された GridShuttle インスタンス。
 *
 * 创建的 GridShuttle 实例。
 *
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
