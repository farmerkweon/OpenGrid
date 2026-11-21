import { ColumnLayout } from './ColumnLayout.js';
import { FooterValues } from './domain/footer/FooterValues.js';
import { FooterView } from './render/FooterView.js';
import type { FooterSource } from './domain/footer/ports.js';
import type { IColumnGeometry } from './coordinate/geometryPorts.js';
import type { IFooterView, IGeometryApplier, IScrollFollower } from './render/ports.js';

/**
 * FooterManager 의존성 주입 인터페이스. / Dependency-injection interface for FooterManager.
 */
export interface FooterDeps<T extends Record<string, any>> {
  /** 요약 대상 전체 행 데이터. / Full row data to summarize. */
  getData: () => T[];
  /** 현재 컬럼 레이아웃(가시 리프 컬럼 조회용). / Current column layout (for resolving visible leaf columns). */
  getColLayout: () => ColumnLayout<T>;
  /** 컬럼별 현재 폭(px) 배열. / Current per-column widths (px). */
  getColWidths: () => number[];
  /** 그리드 옵션 스냅샷(`footer`/`footerHeight`/`footerPosition` 등 포함). / Snapshot of grid options (includes `footer`, `footerHeight`, `footerPosition`, etc.). */
  getOptions: () => any;
  /** 푸터 바를 삽입할 그리드 컨테이너 엘리먼트. / Grid container element into which the footer bar is inserted. */
  getContainer: () => HTMLElement;
  /** Phase 2: OverrideKernel.getStrategy 주입(슬롯 summaryOp 도달용). / Phase 2: injected via OverrideKernel.getStrategy (reaches the `summaryOp` slot). */
  getStrategy?: <F extends Function>(slot: string, fallback: F) => F;
  /**
   * 그리드의 컬럼 기하(폭·여분 컬럼). 막대를 그릴 때마다 한 번 묻는다(맞춘 뒤 돌려줌). 값 계산(computeValues·fmtNum)은 이것을 부르지 않는다.
   * / The grid's column geometry, asked once per paint; value computation never calls it.
   */
  getGeometry: () => IColumnGeometry;
}

/**
 * 그리드 하단 요약 푸터(합계/평균/개수 등) 관리자. / Manages the grid's summary footer bar (sum/avg/count/…).
 *
 * `options.footer` 정의를 읽어 각 컬럼 집계값을 계산하고, 컬럼 폭에 맞춘 셀로
 * 렌더한다. `summaryOp` override 슬롯으로 MEDIAN/STDEV 등 커스텀 집계를 가로챌 수 있다.
 * / Reads the `options.footer` definitions to compute per-column aggregates and renders
 * them as cells aligned to column widths. The `summaryOp` override slot lets custom
 * aggregates (MEDIAN/STDEV/…) intercept the default SUM/AVG/COUNT/MAX/MIN switch.
 */
export class FooterManager<T extends Record<string, any> = any> implements IFooterView {
  private _d: FooterDeps<T>;
  /** 값 계산(헤드리스). / Value computation (headless). */
  private readonly _values: FooterValues;
  /** 막대 DOM. / Bar DOM. */
  private readonly _view: FooterView;
  /** 합계 대상 행 원천 — 부를 때마다 deps.getData 를 읽는다. / Row source; reads deps.getData on every call. */
  private readonly _source: FooterSource;

  constructor(deps: FooterDeps<T>) {
    this._d = deps;
    // 계산은 FooterValues, 막대 DOM 은 FooterView 에 맡긴다. 이 클래스는 공개 이름(computeValues·render·fmtNum)과
    // 생성자 deps 를 그대로 지키는 앞면이다. 전략 조회는 부를 때마다 deps 에서 다시 읽는다(지금 동작).
    // Computation goes to FooterValues and the bar DOM to FooterView; this class keeps the public names and deps.
    this._values = new FooterValues({
      getStrategy: (slot, fb) => (this._d.getStrategy ?? ((_s: string, f: any) => f))(slot, fb),
    });
    this._source = { rows: () => this._d.getData() };
    this._view = new FooterView({
      container: () => this._d.getContainer(),
      options: () => this._d.getOptions(),
      leaves: () => this._d.getColLayout().visibleLeaves,
      geometry: () => this._d.getGeometry(),
      widths: () => this._d.getColWidths(),
      // 막대는 결과만 받는다. 결과는 지금처럼 이 클래스의 computeValues() 를 거친다(그 이름이 지킬 이음새라 길을 하나로) —
      // 어떤 정의·행으로 셈할지는 이 앞면이 알고, 막대는 계산 계약을 흉내 내지 않는다.
      // The bar only receives results, which go through computeValues() (the kept seam); the facade owns defs and rows.
      values: () => this.computeValues(),
    });
  }

  /**
   * 숫자를 포맷 문자열에 따라 표시용 문자열로 변환한다. / Format a number into a display string according to a format string.
   *
   * `fmt` 미지정 시 반올림 후 `ko-KR` 로케일 구분기호로 표기한다. 지정 시 숫자 토큰
   * 앞뒤의 접두/접미(통화 기호 등)를 분리하고, `#`/`,` 포함 여부로 천단위 구분기호
   * 사용을, 소수부 자릿수로 반올림 정밀도를 결정한다.
   * / Without `fmt`, rounds and formats using `ko-KR` locale separators. With `fmt`,
   * splits off any prefix/suffix around the numeric token (e.g. a currency symbol),
   * uses `#`/`,` presence to decide thousands-separator use, and the decimal-token
   * length to decide rounding precision.
   *
   * @param value - 포맷할 값 / Value to format
   * @param fmt - 숫자 포맷 문자열(예: `'#,##0.00'`, 통화 접두/접미 포함 가능) / Number format string (e.g. `'#,##0.00'`, may include a currency prefix/suffix)
   * @returns 포맷된 표시 문자열 / The formatted display string
   */
  fmtNum(value: number, fmt?: string): string {
    return this._values.format(value, fmt);
  }

  /**
   * `options.footer` 정의별 집계값을 계산한다. / Compute the aggregate value for each `options.footer` definition.
   *
   * 수식 에러 셀(`#REF` 등)은 집계에서 제외한다(0 취급 아님 — 값 오염 차단, C11).
   * `summaryOp` override 슬롯이 숫자를 반환하면 그 값을 쓰고(예: MEDIAN/STDEV),
   * `null` 을 반환하면 기본 SUM/AVG/COUNT/MAX/MIN 분기로 폴백한다.
   * / Formula-error cells (`#REF`, …) are excluded from aggregation (not treated as 0 —
   * prevents value contamination, C11). If the `summaryOp` override slot returns a
   * number (e.g. for MEDIAN/STDEV), that value is used; returning `null` falls back to
   * the default SUM/AVG/COUNT/MAX/MIN branch.
   *
   * @returns 정의 순서대로 `{ _field, _value, _formatted }` 배열 / Array of `{ _field, _value, _formatted }`, in definition order
   */
  computeValues(): any[] {
    return this._values.compute(this._d.getOptions().footer, this._source);
  }

  /**
   * 요약 푸터 바를 (재)렌더한다. / (Re)render the summary footer bar.
   *
   * 기존 `.og-footer-bar` 를 제거 후 새로 그리며, `options.footerPosition` 에 따라
   * 컨테이너 상단 또는 하단에 삽입한다. / Removes any existing `.og-footer-bar` and
   * redraws it, inserting at the top or bottom of the container per `options.footerPosition`.
   */
  render(): void {
    this._view.paint();
  }

  /**
   * 그리기 계획이 「푸터 막대 다시」를 말할 때(컬럼 구성·겉모양이 바뀜). render 와 같다.
   * / Called when the render plan asks to rebuild the footer bar (columns or appearance changed). Same as render.
   */
  paint(): void {
    this._view.paint();
  }

  /**
   * 그리기 계획이 「푸터 값 다시」를 말할 때(행 집합·칸 값이 바뀜). 합계를 다시 셈하고 값 칸 글자만 고친다.
   * 스크롤·정렬·폭 조절·선택에는 계획이 이것을 부르지 않는다 — 그래서 그때는 합계를 셈하지 않는다.
   * / Called when the plan asks for new footer values (row set or cell values changed): recompute and rewrite
   * value text only. Scrolling, sorting, resizing and selection never ask for it.
   */
  updateValues(): void {
    this._view.updateValues();
  }

  /**
   * 본문 가로 위치를 따라가게 할 객체를 넘겨 받는다(그리드가 렌더러를 만든 뒤 한 번). 그린 막대가 그 객체를 따라간다.
   * / Receives the horizontal scroll follower; the painted bar follows the body's horizontal position.
   */
  setFollower(f: IScrollFollower | null): void {
    this._view.setFollower(f);
  }

  /**
   * 컬럼 폭 등록기를 넘겨 받는다(그리드가 기하·등록기를 만든 뒤). 푸터 칸 폭이 끄는 동안 머리글·본문과 같은 프레임에 따라간다.
   * / Receives the geometry applier so footer cell widths follow a column drag in the same frame as header and body.
   */
  setApplier(a: IGeometryApplier | null): void {
    this._view.setApplier(a);
  }

  /**
   * 막대 끝 여백(본문 세로 스크롤바 폭)을 넘겨 받는다 — 가로로 끝까지 긁어도 푸터가 본문과 같이 가게. 0 이면 아무것도 안 씀.
   * / Receives the end gutter (body vertical scrollbar width) so the footer scrolls as far as the body; 0 writes nothing.
   */
  setEndGutter(px: number): void {
    this._view.setEndGutter(px);
  }

  /** 따라가기를 푼다(그리드를 없앨 때). / Releases the follower when the grid is destroyed. */
  destroy(): void {
    this._view.destroy();
  }
}
