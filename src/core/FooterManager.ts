import { ColumnLayout } from './ColumnLayout.js';
import { OGDecimal } from './OGDecimal.js';

export interface FooterDeps<T extends Record<string, any>> {
  getData: () => T[];
  getColLayout: () => ColumnLayout<T>;
  getColWidths: () => number[];
  getOptions: () => any;
  getContainer: () => HTMLElement;
  /** Phase 2: OverrideKernel.getStrategy 주입(슬롯 summaryOp 도달용). */
  getStrategy?: <F extends Function>(slot: string, fallback: F) => F;
}

export class FooterManager<T extends Record<string, any> = any> {
  private _d: FooterDeps<T>;

  constructor(deps: FooterDeps<T>) {
    this._d = deps;
  }

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

  computeValues(): any[] {
    const footerDefs = this._d.getOptions().footer;
    if (!footerDefs || footerDefs.length === 0) return [];

    const allData = this._d.getData();

    return footerDefs
      .filter((d: any) => d.field && d.op)
      .map((def: any) => {
        const field  = def.field!;
        const op     = def.op!;
        const nums   = allData
          .map((r: any) => r[field])
          .filter((v: any) => v !== null && v !== undefined && v !== '');

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
