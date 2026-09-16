import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostBinding,
  Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild,
} from '@angular/core';
import { OpenGrid } from 'open-grid';
import type { ColumnDef, GridOptions, OpenGridInstance } from 'open-grid';

/** 바뀌면 그리드를 새로 만들어야 하는 입력값. data·theme 는 인스턴스 메서드로 그 자리에서 반영한다. */
const STRUCTURAL_INPUTS = [
  'columns', 'editable', 'sortable', 'filterable', 'rowNumber', 'checkColumn',
  'stateColumn', 'draggable', 'frozenColumns', 'options',
] as const;

/**
 * OPEN_GRID 코어를 감싸는 Angular 컴포넌트(`open-grid/angular`, Angular 17 이상).
 * React·Vue 래퍼와 같은 입력값을 받는다. `data` 는 `setData`, `theme` 는 `setTheme` 로 그 자리에서 반영하고,
 * 컬럼·편집 여부 같은 구조 입력값이 바뀌면 그리드를 새로 만든다. 코어 인스턴스는 `(ready)` 이벤트나 `grid` 속성으로 받는다.
 * 그리드 안의 스크롤·마우스 처리는 Angular 변경 감지 밖에서 돌고, 출력 이벤트는 구독했을 때만 Angular 안으로 들어온다.
 * 스타일시트는 컴포넌트가 불러오지 않는다. `angular.json` 의 `styles` 에 `node_modules/open-grid/dist/open-grid-base.css` 를 넣는다.
 *
 * Angular component wrapping the OPEN_GRID core (`open-grid/angular`, Angular 17+).
 * Takes the same inputs as the React and Vue wrappers. `data` and `theme` are applied in place via `setData` / `setTheme`;
 * structural inputs (columns, editable, …) recreate the grid. Get the core instance from `(ready)` or the `grid` property.
 * Grid scroll and pointer handling runs outside Angular change detection; outputs re-enter the zone only when subscribed.
 * The component does not load CSS — add `node_modules/open-grid/dist/open-grid-base.css` to `styles` in `angular.json`.
 *
 * OPEN_GRID のコアを包む Angular コンポーネントです(`open-grid/angular`、Angular 17 以上)。
 * React・Vue ラッパーと同じ入力を受け取ります。`data` は `setData`、`theme` は `setTheme` でその場に反映し、
 * 列や編集可否などの構造に関わる入力が変わるとグリッドを作り直します。コアのインスタンスは `(ready)` イベントか `grid` プロパティで受け取ります。
 * スタイルシートは読み込みません。`angular.json` の `styles` に `node_modules/open-grid/dist/open-grid-base.css` を追加してください。
 *
 * 包装 OPEN_GRID 核心的 Angular 组件(`open-grid/angular`,Angular 17 及以上)。
 * 接收与 React、Vue 包装器相同的输入。`data` 通过 `setData`、`theme` 通过 `setTheme` 就地生效;
 * 列、是否可编辑等结构性输入变化时会重新创建表格。核心实例可通过 `(ready)` 事件或 `grid` 属性获取。
 * 组件不会加载样式表,请把 `node_modules/open-grid/dist/open-grid-base.css` 加到 `angular.json` 的 `styles` 中。
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 * @example
 * <open-grid [columns]="columns" [data]="rows" [height]="400" (ready)="grid = $event" (cellClick)="onCell($event)"></open-grid>
 */
@Component({
  selector: 'open-grid',
  standalone: true,
  // 코어는 그릇 요소의 인라인 height/width 를 '100%' 로 덮어쓴다. 그래서 호스트(<open-grid>)에 크기를 주고
  // 그리드는 안쪽 div 에 붙인다 — 호스트를 그릇으로 쓰면 지정한 높이가 사라져 행 수만큼 늘었다 줄었다 한다.
  template: '<div #gridEl style="height:100%;width:100%"></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenGridComponent<T extends Record<string, any> = any> implements AfterViewInit, OnChanges, OnDestroy {
  /** 표시할 행 데이터 배열. / Row data array to display. */
  @Input() data?: T[];
  /** 컬럼 정의 배열(필수). / Column definitions (required). */
  @Input() columns: ColumnDef<T>[] = [];
  /** 그리드 높이(숫자는 px). 기본 400. / Grid height (number = px). Default 400. */
  @Input() height: number | string = 400;
  /** 그리드 너비(숫자는 px). 기본 '100%'. / Grid width (number = px). Default '100%'. */
  @Input() width: number | string = '100%';
  /** 셀 편집 허용. 기본 false. / Allow cell editing. Default false. */
  @Input() editable = false;
  /** 정렬 허용. 기본 true. / Allow sorting. Default true. */
  @Input() sortable = true;
  /** 필터 허용. 기본 true. / Allow filtering. Default true. */
  @Input() filterable = true;
  /** 행 번호 컬럼 표시. 기본 false. / Show a row-number column. Default false. */
  @Input() rowNumber = false;
  /** 체크박스 선택 컬럼 표시. 기본 false. / Show a checkbox selection column. Default false. */
  @Input() checkColumn = false;
  /** 행 상태 컬럼 표시. 기본 false. / Show a row-state column. Default false. */
  @Input() stateColumn = false;
  /** 행 드래그앤드롭 허용. 기본 false. / Allow row drag-and-drop. Default false. */
  @Input() draggable = false;
  /** 왼쪽에서 고정할 컬럼 수. 기본 0. / Number of columns frozen from the left. Default 0. */
  @Input() frozenColumns = 0;
  /** 테마 id. 기본 'default'. / Theme id. Default 'default'. */
  @Input() theme = 'default';
  /** 위 입력값으로 못 덮는 나머지 코어 옵션. / Remaining core options not covered by the inputs above. */
  @Input() options?: Partial<GridOptions<T>>;

  /** 그리드 인스턴스 준비 완료. / The grid instance is ready. */
  @Output() readonly ready = new EventEmitter<OpenGridInstance<T>>();
  /** 데이터 변경. / Data changed. */
  @Output() readonly dataChange = new EventEmitter<T[]>();
  /** 셀 클릭. / Cell click. */
  @Output() readonly cellClick = new EventEmitter<any>();
  /** 행 클릭. / Row click. */
  @Output() readonly rowClick = new EventEmitter<any>();
  /** 편집 종료(커밋). / Editing ended (commit). */
  @Output() readonly editEnd = new EventEmitter<any>();
  /** 정렬 변경. / Sorting changed. */
  @Output() readonly sortChange = new EventEmitter<any>();
  /** 필터 변경. / Filtering changed. */
  @Output() readonly filterChange = new EventEmitter<any>();
  /** 행 드롭(재정렬). / Row drop (reorder). */
  @Output() readonly rowDrop = new EventEmitter<{ fromIndex: number; toIndex: number }>();

  @HostBinding('style.display') readonly hostDisplay = 'block';
  @HostBinding('style.box-sizing') readonly hostBoxSizing = 'border-box';
  @HostBinding('style.height') get hostHeight(): string { return toCssSize(this.height); }
  @HostBinding('style.width') get hostWidth(): string { return toCssSize(this.width); }

  @ViewChild('gridEl', { static: true }) private _gridEl!: ElementRef<HTMLDivElement>;

  private _grid: OpenGridInstance<T> | null = null;
  private _viewReady = false;

  constructor(private readonly _zone: NgZone) {}

  /** 코어 그리드 인스턴스. 뷰가 준비되기 전에는 `null`. / The core grid instance; `null` until the view is ready. */
  get grid(): OpenGridInstance<T> | null { return this._grid; }

  ngAfterViewInit(): void {
    this._viewReady = true;
    this._create();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this._viewReady) return;
    if (STRUCTURAL_INPUTS.some(k => changes[k])) {
      this._create();
      return;
    }
    if (changes['data'] && this._grid && this.data) this._grid.setData(this.data);
    if (changes['theme'] && this._grid) this._grid.setTheme(this.theme);
  }

  ngOnDestroy(): void {
    this._destroy();
  }

  private _create(): void {
    this._destroy();

    const opts: GridOptions<T> = {
      columns: this.columns,
      height: '100%',
      width: '100%',
      editable: this.editable,
      sortable: this.sortable,
      filterable: this.filterable,
      rowNumber: this.rowNumber,
      checkColumn: this.checkColumn,
      stateColumn: this.stateColumn,
      draggable: this.draggable,
      frozenColumns: this.frozenColumns,
      theme: this.theme,
      ...this.options,
    };

    const userReady = this.options?.onReady;
    opts.onReady = (grid) => {
      this._grid = grid;
      if (this.data?.length) grid.setData(this.data);
      userReady?.(grid);
      if (this.ready.observed) this._zone.run(() => this.ready.emit(grid));
    };

    // 코어 콜백 → Angular 출력. options 로 넘긴 같은 이름의 콜백도 함께 부른다.
    const outputs: Array<[string, EventEmitter<any>]> = [
      ['onDataChange', this.dataChange], ['onCellClick', this.cellClick], ['onRowClick', this.rowClick],
      ['onEditEnd', this.editEnd], ['onSortChange', this.sortChange], ['onFilterChange', this.filterChange],
      ['onRowDrop', this.rowDrop],
    ];
    const bag = opts as Record<string, any>;
    for (const [key, out] of outputs) {
      if (!out.observed) continue;
      const userFn = bag[key];
      bag[key] = (e: any) => {
        userFn?.(e);
        this._zone.run(() => out.emit(e));
      };
    }

    this._zone.runOutsideAngular(() => {
      this._grid = new OpenGrid<T>(this._gridEl.nativeElement, opts);
    });
  }

  private _destroy(): void {
    const grid = this._grid;
    this._grid = null;
    grid?.destroy();
  }
}

function toCssSize(v: number | string): string {
  return typeof v === 'number' ? `${v}px` : v;
}
