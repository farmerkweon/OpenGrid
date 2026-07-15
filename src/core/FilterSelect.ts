import type { FilterItem } from './types.js';
import { t as _globalT } from './i18n/LocaleRegistry.js';

/** i18n: 필터 셀렉트 라벨 해석기(주입 없으면 전역 t). / i18n: filter-select label resolver (global t when not injected). */
export type FilterSelectT = (key: string, params?: Record<string, string | number>) => string;

// ─── 공개 타입 ────────────────────────────────────────────

/** 필터 셀렉트 옵션(값/표시 텍스트). / Filter-select option (value/display text). */
export interface FilterSelectOption {
  /** 필터·선택에 사용할 값. / Value used for filtering/selection. */
  value: string;
  /** 화면에 표시할 텍스트. / Text shown on screen. */
  text:  string;
}

/**
 * 캐스케이딩 필터 셀렉트 컬럼 정의. / Cascading filter-select column definition.
 *
 * ### 데이터 공급 방식 (택 1) / Data supply (pick one)
 *
 * **A. JSON 배열 바인딩** (권장)
 * ```ts
 * {
 *   field: 'brand',
 *   label: '브랜드',
 *   data: brandList,          // any[]  ← JSON 배열
 *   valueKey: 'brandCode',    // 필터·선택값으로 사용할 키
 *   textKey:  'brandName',    // 화면에 표시할 텍스트 키
 *   filterKey: 'brand',       // 그리드 행 데이터의 필터 기준 키 (기본: field)
 *   dependsOn:    'category', // 부모 컬럼 field
 *   dependsOnKey: 'catCode',  // 자식 data[]에서 부모값과 매칭할 키
 * }
 * ```
 *
 * **B. 정적 옵션 배열**
 * ```ts
 * { field: 'status', options: [{ value: 'Y', text: '활성' }] }
 * ```
 */
export interface FilterSelectColumn {
  /** 캐스케이딩 식별자 / 기본 필터 키. / Cascading identifier / default filter key. */
  field:    string;
  /** 화면 표시 라벨. / Display label. */
  label:    string;

  // ── A. JSON 배열 바인딩 ──────────────────────────────
  /** 바인딩할 JSON 배열. / JSON array to bind. */
  data?: any[];
  /** data[] 에서 option value 로 사용할 키. / Key in data[] used as the option value. */
  valueKey?: string;
  /** data[] 에서 화면 표시 text 로 사용할 키(미지정 시 valueKey 사용). / Key in data[] used as display text (falls back to valueKey). */
  textKey?: string;
  /**
   * 그리드 행 데이터에서 실제 필터링할 키. 미지정 시 `field` 값 그대로 사용.
   * / Key actually filtered against grid row data; falls back to `field`.
   *
   * @example
   * // 그리드 row.category === selectedValue 로 필터링 / filter where row.category === selectedValue
   * filterKey: 'category'
   */
  filterKey?: string;

  // ── B. 정적 옵션 (data 대신 사용) ───────────────────
  /** 정적 옵션 배열(data 대신 사용). / Static option array (used instead of data). */
  options?: FilterSelectOption[];

  // ── 캐스케이딩 ────────────────────────────────────────
  /** 부모 컬럼의 field 명. / Parent column's field name. */
  dependsOn?: string;
  /**
   * 자식 data[] 에서 부모 선택값과 비교할 키. / Key in the child data[] compared against the parent's selected value.
   *
   * @example
   * // brandList.filter(b => b.catCode === parentSelectedValue)
   * dependsOnKey: 'catCode'
   */
  dependsOnKey?: string;
}

/** 필터 셀렉트 패널 구성. / Filter-select panel configuration. */
export interface FilterSelectConfig {
  /** 캐스케이딩 컬럼 정의 배열. / Cascading column definitions. */
  columns: FilterSelectColumn[];
  /** fieldset 제목(기본: 로케일 'filter.legend'). / fieldset legend (default: locale 'filter.legend'). */
  legend?: string;
}

type FilterFn = (field: string, items: FilterItem[]) => void;
type ResetFn  = (field?: string) => void;

// ─── FilterSelectPanel ────────────────────────────────────
/**
 * 캐스케이딩 필터 셀렉트 패널. / Cascading filter-select panel.
 *
 * "카테고리를 고르면 브랜드 목록이 그 카테고리에 맞게 좁혀지는" 것처럼, 상위 셀렉트의 선택에
 * 따라 하위 셀렉트의 옵션이 자동으로 걸러지는 드롭다운 필터 묶음이 필요할 때 쓴다. 그리드
 * 헤더 앞에 fieldset 형태로 삽입된다. 동작 순서: 사용자가 셀렉트를 바꾸면 → 내부에서 그리드
 * 필터 콜백(onFilter/onReset)을 호출해 그리드를 걸러내고 → 종속된 자식 셀렉트의 옵션 목록을
 * 새 부모값 기준으로 다시 계산해 넣는다(재귀적으로 손자 셀렉트까지 전파).
 * 보통 직접 생성자를 호출하기보다 `grid.setFilterSelect(config)`를 통해 그리드에 붙인다.
 * / Use this when you need a group of dropdown filters where picking a value in a parent select
 * narrows the options in a child select — e.g. picking a category narrows the brand list. It's
 * inserted as a fieldset ahead of the grid header. Operation order: the user changes a select →
 * internally the grid filter callbacks (onFilter/onReset) run to filter the grid → then the
 * dependent child select's options are recomputed against the new parent value (recursing down
 * to grandchild selects). Usually attached via `grid.setFilterSelect(config)` rather than by
 * calling the constructor directly.
 *
 * @example
 * // 보통 이렇게 그리드를 통해 사용한다 / Typically wired through the grid like this:
 * grid.setFilterSelect({
 *   columns: [
 *     { field: 'category', label: '카테고리', data: categoryList, valueKey: 'code', textKey: 'name' },
 *     { field: 'brand', label: '브랜드', data: brandList, valueKey: 'code', textKey: 'name',
 *       dependsOn: 'category', dependsOnKey: 'categoryCode' },
 *   ],
 * });
 */
export class FilterSelectPanel {
  private _el:       HTMLFieldSetElement;
  private _selects   = new Map<string, HTMLSelectElement>();
  /** 현재 선택 상태 { field → selectedValue } */
  private _selected: Record<string, string> = {};
  private _config:   FilterSelectConfig;
  private _onFilter: FilterFn;
  private _onReset:  ResetFn;
  private _t:        FilterSelectT;

  /**
   * @param container - 패널을 삽입할 컨테이너(그리드 헤더 앞에 prepend) / Container to insert the panel into (prepended before the grid header)
   * @param config - 패널 구성 / Panel configuration
   * @param onFilter - 필터 적용 콜백(field, items) / Filter-apply callback (field, items)
   * @param onReset - 필터 해제 콜백(field?) / Filter-reset callback (field?)
   * @param gridId - aria-controls 로 연결할 그리드 id(선택) / Grid id to link via aria-controls (optional)
   * @param t - 로케일 해석기(미주입 시 전역 t) / Locale resolver (global t when not injected)
   */
  constructor(
    container: HTMLElement,
    config:    FilterSelectConfig,
    onFilter:  FilterFn,
    onReset:   ResetFn,
    gridId?:   string,
    t?:        FilterSelectT,
  ) {
    this._config   = config;
    this._onFilter = onFilter;
    this._onReset  = onReset;
    this._t        = t ?? _globalT;

    /* fieldset */
    this._el = document.createElement('fieldset');
    this._el.className = 'og-filter-select';

    const legend = document.createElement('legend');
    legend.className   = 'og-filter-select-legend';
    legend.textContent = config.legend ?? this._t('filter.legend');
    this._el.appendChild(legend);

    const row = document.createElement('div');
    row.className = 'og-filter-select-row';

    for (const col of config.columns) {
      const uid = `og-fsel-${col.field}`;

      const wrap = document.createElement('div');
      wrap.className = 'og-filter-select-group';

      const label = document.createElement('label');
      label.htmlFor     = uid;
      label.textContent = col.label;
      label.className   = 'og-filter-select-label';

      const select = document.createElement('select');
      select.id        = uid;
      select.className = 'og-filter-select-sel';
      select.setAttribute('aria-label', col.label);
      if (gridId) select.setAttribute('aria-controls', gridId);

      if (!col.dependsOn) {
        /* 루트 컬럼 — 즉시 전체 옵션 로드 */
        this._fill(select, this._resolve(col, ''), true);
      } else {
        /* 종속 컬럼 — 부모 선택 전까지 비활성 */
        this._fill(select, [], false);
      }

      select.addEventListener('change', () => this._onChange(col.field, select.value));

      wrap.appendChild(label);
      wrap.appendChild(select);
      row.appendChild(wrap);
      this._selects.set(col.field, select);
    }

    /* 초기화 버튼 */
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.textContent = this._t('filter.clear');
    btn.className   = 'og-filter-select-reset';
    btn.setAttribute('aria-label', this._t('filter.clearAria'));
    btn.addEventListener('click', () => this._reset());

    this._el.appendChild(row);
    this._el.appendChild(btn);

    /* 그리드 헤더 앞에 삽입 */
    container.insertBefore(this._el, container.firstChild);
  }

  // ─── 옵션 해결 ────────────────────────────────────────
  /**
   * 컬럼의 옵션 목록을 계산한다.
   *
   * @param col         대상 컬럼 정의
   * @param parentValue 부모 선택값 (캐스케이딩 필터에 사용)
   */
  private _resolve(col: FilterSelectColumn, parentValue: string): FilterSelectOption[] {
    /* B. 정적 옵션 배열 */
    if (col.options) return col.options;

    /* A. JSON 배열 + 키 매핑 */
    let rows = col.data ?? [];

    /* 캐스케이딩: dependsOnKey 기준으로 부모 선택값과 매칭 */
    if (col.dependsOn && col.dependsOnKey && parentValue) {
      rows = rows.filter(
        item => String(item[col.dependsOnKey!] ?? '') === parentValue,
      );
    }

    const vk = col.valueKey ?? 'value';
    const tk = col.textKey  ?? vk;

    return rows.map(item => ({
      value: String(item[vk] ?? ''),
      text:  String(item[tk] ?? item[vk] ?? ''),
    }));
  }

  // ─── select DOM 채우기 ────────────────────────────────
  private _fill(
    select:  HTMLSelectElement,
    opts:    FilterSelectOption[],
    enabled: boolean,
  ): void {
    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = ''; all.textContent = this._t('filter.all');
    select.appendChild(all);
    for (const o of opts) {
      const el = document.createElement('option');
      el.value = o.value; el.textContent = o.text;
      select.appendChild(el);
    }
    select.disabled = !enabled;
  }

  // ─── 선택 변경 처리 ───────────────────────────────────
  private _onChange(field: string, value: string): void {
    const col = this._config.columns.find(c => c.field === field)!;
    const fk  = col.filterKey ?? col.field;  // 실제 그리드 필터 키

    if (value) {
      this._selected[field] = value;
      this._onFilter(fk, [{ operator: '=', value }]);
    } else {
      delete this._selected[field];
      this._onReset(fk);
    }
    this._cascade(field);
  }

  /**
   * 부모 컬럼 변경 후 자식 컬럼 옵션을 재계산한다 (재귀).
   */
  private _cascade(parentField: string): void {
    const parentValue = this._selected[parentField] ?? '';

    for (const col of this._config.columns) {
      if (col.dependsOn !== parentField) continue;
      const sel = this._selects.get(col.field);
      if (!sel) continue;
      const fk = col.filterKey ?? col.field;

      if (!parentValue) {
        /* 부모 초기화 → 자식 비활성 */
        this._fill(sel, [], false);
        delete this._selected[col.field];
        this._onReset(fk);
        this._cascade(col.field); // 하위로 재귀
      } else {
        /* 부모 값 있음 → 자식 옵션 재로드 */
        this._fill(sel, this._resolve(col, parentValue), true);
        sel.value = '';
        delete this._selected[col.field];
        this._onReset(fk);
      }
    }
  }

  // ─── 전체 초기화 ──────────────────────────────────────
  private _reset(): void {
    this._selected = {};
    for (const col of this._config.columns) {
      const sel = this._selects.get(col.field);
      const fk  = col.filterKey ?? col.field;
      if (!sel) continue;
      if (!col.dependsOn) {
        sel.value = ''; sel.disabled = false;
      } else {
        this._fill(sel, [], false);
      }
      this._onReset(fk);
    }
  }

  // ─── 공개 API ─────────────────────────────────────────
  /** 모든 필터 선택을 초기화한다("전체 초기화" 버튼과 동일 동작을 코드에서 트리거하고 싶을 때).
   * / Reset all filter selections (call this to trigger the same action as the "clear" button
   * from code). */
  reset():   void { this._reset(); }
  /** 패널을 DOM 에서 제거한다. / Remove the panel from the DOM. */
  destroy(): void { this._el.remove(); }
}
