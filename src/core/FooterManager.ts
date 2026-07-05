import { ColumnLayout } from './ColumnLayout.js';
import { OGDecimal } from './OGDecimal.js';
import { isErrorToken } from './formula/types.js';

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
export class FooterManager<T extends Record<string, any> = any> {
  private _d: FooterDeps<T>;

  constructor(deps: FooterDeps<T>) {
    this._d = deps;
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
    if (!fmt) {
      return Math.round(value).toLocaleString('ko-KR');
    }
    // 통화 기호 등 접두/접미 분리 (숫자 토큰: #,0,콤마,소수 또는 레거시 정수)
    const tok = fmt.match(/[#0][#0,]*(?:\.[#0]+)?|\d+/);
    const prefix  = tok ? fmt.slice(0, tok.index) : '';
    const suffix  = tok ? fmt.slice(tok.index! + tok[0].length) : '';
    const numFmt  = tok ? tok[0] : fmt;

    const useComma = numFmt.includes('#') || numFmt.includes(',');
    const dpMatch  = numFmt.match(/\.(\d+)$/);
    const dp = dpMatch
      ? parseInt(dpMatch[1]!, 10)
      : /^\d+$/.test(numFmt) ? parseInt(numFmt, 10) : 0;

    const fixed = Math.abs(value).toFixed(dp);
    const [intPart = '0', decPart] = fixed.split('.');
    const intStr = useComma
      ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : intPart;

    const body = decPart !== undefined ? `${intStr}.${decPart}` : intStr;
    const result = `${prefix}${body}${suffix}`;
    return value < 0 ? `-${result}` : result;
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
    const footerDefs = this._d.getOptions().footer;
    if (!footerDefs || footerDefs.length === 0) return [];

    const allData = this._d.getData();

    return footerDefs
      .filter((d: any) => d.field && d.op)
      .map((def: any) => {
        const field  = def.field!;
        const op     = def.op!;
        // C11/HANMS-10(P0): 수식 에러 셀(#REF 등)은 집계에서 '제외'(0 아님) — 오염 차단.
        const nums   = allData
          .map((r: any) => r[field])
          .filter((v: any) => v !== null && v !== undefined && v !== '' && !isErrorToken(v));

        let result: OGDecimal | null = null;
        const opUC = (op as string).toUpperCase();

        // Phase 2 슬롯 #6: summaryOp. default = null(미가로챔 → 기존 SUM/AVG/COUNT/MAX/MIN switch).
        //   슬롯이 number 반환 시 그 값을 사용(MEDIAN/STDEV 등만 가로챔), null 반환 시 기본 분기 폴백.
        const customOp = (this._d.getStrategy ?? ((_s: string, fb: any) => fb))(
          'summaryOp',
          null as ((op: string, nums: any[], field: string) => number | null) | null,
        );
        if (customOp) {
          const cv = customOp(opUC, nums, field);
          if (cv != null) {
            return { _field: field, _value: cv, _formatted: this.fmtNum(cv, def.format) };
          }
        }

        if (opUC === 'SUM') {
          result = nums.length > 0 ? OGDecimal.sum(nums.map((v: any) => String(v))) : null;
        } else if (opUC === 'AVG') {
          result = nums.length > 0
            ? OGDecimal.sum(nums.map((v: any) => String(v))).div(OGDecimal.from(String(nums.length)))
            : null;
        } else if (opUC === 'COUNT') {
          const cnt = nums.length;
          return { _field: field, _value: cnt, _formatted: cnt.toLocaleString('ko-KR') };
        } else if (opUC === 'MAX') {
          result = nums.length > 0 ? OGDecimal.max(nums.map((v: any) => String(v))) : null;
        } else if (opUC === 'MIN') {
          result = nums.length > 0 ? OGDecimal.min(nums.map((v: any) => String(v))) : null;
        }

        if (!result) return { _field: field, _value: null, _formatted: '' };

        const numVal    = result.toNumber();
        const formatted = this.fmtNum(numVal, def.format);
        return { _field: field, _value: numVal, _formatted: formatted };
      });
  }

  /**
   * 요약 푸터 바를 (재)렌더한다. / (Re)render the summary footer bar.
   *
   * 기존 `.og-footer-bar` 를 제거 후 새로 그리며, `options.footerPosition` 에 따라
   * 컨테이너 상단 또는 하단에 삽입한다. / Removes any existing `.og-footer-bar` and
   * redraws it, inserting at the top or bottom of the container per `options.footerPosition`.
   */
  render(): void {
    const container = this._d.getContainer();
    const old = container.querySelector('.og-footer-bar');
    old?.remove();

    const opts = this._d.getOptions();
    const footerDefs = opts.footer;
    if (!footerDefs || footerDefs.length === 0) return;

    const leaves = this._d.getColLayout().visibleLeaves;
    const widths = this._d.getColWidths() ?? leaves.map((l: any) => l.width ?? 100);
    const valMap = new Map(
      this.computeValues().map((v: any) => [v._field, v])
    );

    const bar = document.createElement('div');
    bar.className = 'og-footer-bar';
    bar.style.cssText = [
      'display:flex;align-items:stretch;',
      `min-height:${opts.footerHeight}px;`,
      'border-top:2px solid var(--og-primary,#1976d2);',
      'background:var(--og-header-bg,#f5f5f5);',
      'overflow:hidden;flex-shrink:0;font-size:13px;font-weight:600;',
    ].join('');

    let extraW = 0;
    if (opts.stateColumn) extraW += 24;
    if (opts.draggable)   extraW += 18;
    if (opts.rowNumber)   extraW += 44;
    if (opts.checkColumn) extraW += 36;
    if (extraW > 0) {
      const spacer = document.createElement('div');
      spacer.style.cssText = `width:${extraW}px;flex-shrink:0;border-right:1px solid var(--og-border-color,#e0e0e0);`;
      bar.appendChild(spacer);
    }

    let leafCursor = 0;

    for (const def of footerDefs) {
      const colspan = Math.max(1, def.colspan ?? 1);

      let cellW = 0;
      for (let c = 0; c < colspan; c++) {
        cellW += widths[leafCursor + c] ?? 100;
      }
      const targetLeaf = leaves[leafCursor];
      leafCursor += colspan;

      const cell = document.createElement('div');
      cell.style.cssText = [
        `width:${cellW}px;min-width:${cellW}px;flex-shrink:0;`,
        'padding:4px 8px;box-sizing:border-box;overflow:hidden;',
        'border-right:1px solid var(--og-border-color,#e0e0e0);',
        'white-space:nowrap;text-overflow:ellipsis;',
      ].join('');

      const field = def.field;
      const val   = field ? valMap.get(field) : null;

      if (val) {
        const displayVal = val._formatted ?? String(val._value ?? '');
        const prefix = def.label ? `${def.label}: ` : '';
        cell.textContent = prefix + displayVal;
        cell.title = `${(def.op as string)?.toUpperCase() ?? ''} = ${displayVal}`;
        cell.style.color = 'var(--og-primary,#1976d2)';
        cell.style.textAlign = def.align ?? (targetLeaf?.type === 'number' ? 'right' : 'right');
      } else if (def.label) {
        cell.textContent = def.label;
        cell.style.textAlign = def.align ?? 'left';
        cell.style.color = 'var(--og-row-color,#212121)';
      }

      bar.appendChild(cell);
    }

    if (opts.footerPosition === 'top') {
      container.insertBefore(bar, container.firstChild);
    } else {
      container.appendChild(bar);
    }
  }
}
