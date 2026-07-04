import { ColumnLayout } from './ColumnLayout.js';
import { _downloadText } from './GridRenderer.js';
import { applyMask } from './MaskingEngine.js';
import type { WorksheetManager } from './WorksheetManager.js';
import type { ExportOptions } from './types.js';

export interface ExportDeps<T extends Record<string, any>> {
  getData: () => T[];
  getColLayout: () => ColumnLayout<T>;
  getColWidths: () => number[];
  getOptions: () => any;
  getContainer: () => HTMLElement;
  getMaskEnabled: (field: string) => boolean;
  getWsManager: () => WorksheetManager<T> | null;
  /** Phase 2: OverrideKernel.getStrategy 주입(슬롯 cellSerializer 도달용). */
  getStrategy?: <F extends Function>(slot: string, fallback: F) => F;
  /** i18n: 인쇄 요약행 해석(미주입 시 ko 폴백). / i18n: resolve print summary row (ko fallback when absent). */
  t?: (key: string, params?: Record<string, string | number>) => string;
  /** i18n: 로케일 포맷 메타(인쇄 lang·날짜 로케일·Excel 폰트). / i18n: locale format meta (print lang, date locale, Excel font). */
  getMeta?: () => { intlLocale: string; exportFont?: string };
}

export class ExportManager<T extends Record<string, any> = any> {
  private _d: ExportDeps<T>;

  constructor(deps: ExportDeps<T>) {
    this._d = deps;
  }

  private _readCssVar(name: string): string {
    return getComputedStyle(this._d.getContainer()).getPropertyValue(name).trim();
  }

  private _hexToXlsxRgb(hex: string): string {
    const s = hex.trim();
    const rgbMatch = s.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0'))
        .join('').toUpperCase();
    }
    const h = s.replace('#', '').toUpperCase();
    if (h.length === 3) return h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return h.length === 6 ? h : '';
  }

  exportExcel(options?: ExportOptions | string): void {
    const opts = typeof options === 'string' ? { filename: options } : (options ?? {});
    let fname = opts.filename ?? 'export';
    if (!fname.toLowerCase().endsWith('.xlsx')) fname += '.xlsx';
    const sheetName = opts.sheetName ?? (this._d.getOptions().ariaLabel || 'Sheet1');
    const data  = this._d.getData();
    const cols  = this._d.getColLayout().visibleLeaves.filter(c => !opts.exceptFields?.includes(c.field));
    const includeHeader = opts.includeHeader !== false;

    // Phase 2 슬롯 #4: cellSerializer. default = 현행 인라인(number→v, boolean→✓, object→'', else String).
    const serialize = (this._d.getStrategy ?? ((_s: string, fb: any) => fb))(
      'cellSerializer',
      (v: any, col: any, _row: any): any => {
        if (col.type === 'number' && typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? '✓' : '';
        if (typeof v === 'object') return '';
        return String(v);
      },
    );

    import('xlsx-js-style').then(({ utils, writeFile }) => {
      const rows: any[][] = [];
      if (includeHeader) rows.push(cols.map(c => c.header));
      for (const row of data) {
        rows.push(cols.map(c => {
          const raw = (row as any)[c.field];
          if (opts.maskOnExport && c.mask && this._d.getMaskEnabled(c.field)) {
            return applyMask(raw == null ? '' : String(raw), c.mask);
          }
          const v = raw;
          if (v == null || v === '') return '';
          return serialize(v, c, row);
        }));
      }

      const ws = utils.aoa_to_sheet(rows);

      const colWidths = this._d.getColWidths();
      const colLayout = this._d.getColLayout();
      ws['!cols'] = cols.map(c => ({
        wpx: colWidths[colLayout.getColumnIndex(c.field)] ?? 100,
      }));
      ws['!rows'] = rows.map((_, ri) => ({ hpx: ri === 0 && includeHeader ? 22 : 19 }));

      const styleMode = opts.styleMode ?? 'theme';
      let hdrBgRgb  = '1565C0', hdrFgRgb  = 'FFFFFF';
      let rowBgRgb  = 'FFFFFF', rowAltRgb = 'EEF2FF';
      let rowFgRgb  = '212121', borderRgb = 'BDBDBD';
      let fontSize  = 10;

      if (styleMode === 'theme') {
        const toRgb = (v: string) => this._hexToXlsxRgb(v);
        hdrBgRgb  = toRgb(this._readCssVar('--og-header-bg'))    || hdrBgRgb;
        hdrFgRgb  = toRgb(this._readCssVar('--og-header-color'))  || hdrFgRgb;
        rowBgRgb  = toRgb(this._readCssVar('--og-row-bg'))        || rowBgRgb;
        rowAltRgb = toRgb(this._readCssVar('--og-row-alt-bg'))    || rowAltRgb;
        rowFgRgb  = toRgb(this._readCssVar('--og-row-color'))     || rowFgRgb;
        borderRgb = toRgb(this._readCssVar('--og-border-color'))  || borderRgb;
        const fsStr = this._readCssVar('--og-font-size');
        if (fsStr) fontSize = Math.max(8, Math.round(parseFloat(fsStr) * 0.75));
      }

      const noStyle = styleMode === 'none';
      // i18n: Excel 헤더/데이터 폰트를 활성 로케일 meta.exportFont 로(ko='맑은 고딕', byte-identical).
      const exportFont = this._d.getMeta?.().exportFont ?? '맑은 고딕';
      const S = {
        hdrFont:   noStyle ? {} : { bold: true, color: { rgb: hdrFgRgb }, sz: fontSize, name: exportFont },
        dataFont:  noStyle ? {} : { sz: fontSize, color: { rgb: rowFgRgb }, name: exportFont },
        hdrFill:   noStyle ? {} : { patternType: 'solid' as const, fgColor: { rgb: hdrBgRgb } },
        evenFill:  noStyle ? {} : { patternType: 'solid' as const, fgColor: { rgb: rowBgRgb } },
        oddFill:   noStyle ? {} : { patternType: 'solid' as const, fgColor: { rgb: rowAltRgb } },
        hdrBorder: noStyle ? {} : {
          top:    { style: 'medium', color: { rgb: hdrBgRgb } },
          bottom: { style: 'medium', color: { rgb: hdrBgRgb } },
          left:   { style: 'thin',   color: { rgb: hdrBgRgb } },
          right:  { style: 'thin',   color: { rgb: hdrBgRgb } },
        },
        dataBorder: noStyle ? {} : {
          top:    { style: 'thin', color: { rgb: borderRgb } },
          bottom: { style: 'thin', color: { rgb: borderRgb } },
          left:   { style: 'thin', color: { rgb: borderRgb } },
          right:  { style: 'thin', color: { rgb: borderRgb } },
        },
      };

      rows.forEach((row, ri) => {
        const isHdr  = includeHeader && ri === 0;
        const dataRi = includeHeader ? ri - 1 : ri;
        const isEven = dataRi % 2 === 0;

        row.forEach((_v, ci) => {
          const addr = utils.encode_cell({ r: ri, c: ci });
          if (!ws[addr]) ws[addr] = { t: 's', v: '' };

          const col = cols[ci]!;
          const isNum  = col.type === 'number' || col.align === 'right';
          const hAlign = isHdr ? 'center' : isNum ? 'right' : (col.align ?? 'left');

          ws[addr].s = {
            font:      isHdr ? S.hdrFont : S.dataFont,
            fill:      isHdr ? S.hdrFill : (isEven ? S.evenFill : S.oddFill),
            border:    isHdr ? S.hdrBorder : S.dataBorder,
            alignment: { horizontal: hAlign, vertical: 'center', wrapText: false },
          };
        });
      });

      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, sheetName);
      writeFile(wb, fname, { cellStyles: true } as any);
      opts.onAfter?.(new Blob([]));
    }).catch(() => {
      console.error('Excel 내보내기 실패: xlsx 패키지를 확인하세요.');
    });
  }

  exportCsv(options?: ExportOptions | string): void {
    const opts = typeof options === 'string' ? { filename: options } : (options ?? {});
    const data = this._d.getData();
    const cols = this._d.getColLayout().visibleLeaves;
    const hdr = cols.map(c => `"${c.header}"`).join(',');
    const rows = data.map(row => cols.map(c => {
      const raw = row[c.field] ?? '';
      if (opts.maskOnExport && c.mask && this._d.getMaskEnabled(c.field)) {
        return applyMask(String(raw), c.mask);
      }
      const v = raw;
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));
    const fname = opts.filename ?? 'export.csv';
    _downloadText('﻿' + [hdr, ...rows].join('\n'), fname);
  }

  exportJson(options?: ExportOptions | string): void {
    const fname = typeof options === 'string' ? options : (options?.filename ?? 'export.json');
    _downloadText(JSON.stringify(this._d.getData(), null, 2), fname, 'application/json');
  }

  print(options?: { title?: string; excludeFields?: string[]; footerText?: string }): void {
    const title      = options?.title      ?? 'OPEN_GRID';
    const footerText = options?.footerText ?? '';
    const data = this._d.getData();
    const cols = this._d.getColLayout().visibleLeaves
      .filter(c => !options?.excludeFields?.includes(c.field));

    const headerRow  = cols.map(c => `<th>${c.header ?? c.field}</th>`).join('');
    const bodyRows   = data.map(row =>
      `<tr>${cols.map(c => `<td>${String(row[c.field] ?? '')}</td>`).join('')}</tr>`
    ).join('');
    const footerHtml = footerText
      ? `<div class="og-print-footer">${footerText}</div>`
      : '';

    // i18n: 인쇄 문서 lang·날짜 로케일·요약행을 활성 로케일 meta/카탈로그로(ko=ko-KR·byte-identical 요약).
    const meta = this._d.getMeta?.() ?? { intlLocale: 'ko-KR' };
    const lang = meta.intlLocale;
    const summary = this._d.t
      ? this._d.t('export.printSummary', { rows: data.length, cols: cols.length, date: new Date().toLocaleString(lang) })
      : `${data.length}행 × ${cols.length}열 · ${new Date().toLocaleString(lang)}`;

    const html = `<!DOCTYPE html>
<html lang="${lang}"><head>
<meta charset="UTF-8"><title>${title}</title>
<style>
  @page{margin:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;margin:0;padding:1cm;}
  h2{margin:0 0 10px;font-size:14px;color:#333;}
  p{margin:0 0 8px;font-size:11px;color:#999;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;white-space:nowrap;}
  th{background:#f5f5f5;font-weight:600;color:#333;}
  tr:nth-child(even) td{background:#fafafa;}
  .og-print-footer{position:fixed;bottom:0;left:0;right:0;padding:6px 1cm;font-size:10px;color:#888;border-top:1px solid #e5e7eb;background:#fff;text-align:center;}
</style>
</head><body>
<h2>${title}</h2>
<p>${summary}</p>
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
${footerHtml}
<script>window.addEventListener('load',()=>{window.print();window.addEventListener('afterprint',()=>window.close());});<\/script>
</body></html>`;

    const win = window.open('', '_blank', 'width=960,height=640');
    if (win) { win.document.write(html); win.document.close(); }
  }

  exportSheetsExcel(filename?: string): void {
    const wsManager = this._d.getWsManager();
    if (!wsManager) { this.exportExcel(filename ?? 'workbook'); return; }
    const fname = filename ?? 'workbook.xlsx';

    // Phase 2 슬롯 #4: cellSerializer(시트 직렬화 지점). default = 현행 인라인.
    const serialize = (this._d.getStrategy ?? ((_s: string, fb: any) => fb))(
      'cellSerializer',
      (v: any, col: any, _row: any): any => {
        if (typeof v === 'boolean') return v ? '✓' : '';
        return col.type === 'number' && typeof v === 'number' ? v : String(v);
      },
    );

    import('xlsx-js-style').then(({ utils, writeFile }) => {
      const wb = utils.book_new();
      const opts = this._d.getOptions();
      for (const name of wsManager.getNames()) {
        const state = wsManager.get(name)!;
        const cols  = state.columns.length ? state.columns : opts.columns;
        const rows: any[][] = [cols.map((c: any) => c.header)];
        for (const row of state.data) {
          rows.push(cols.map((c: any) => {
            const v = (row as any)[c.field];
            if (v == null) return '';
            return serialize(v, c, row);
          }));
        }
        const ws = utils.aoa_to_sheet(rows);
        ws['!cols'] = cols.map(() => ({ wpx: 100 }));
        utils.book_append_sheet(wb, ws, name);
      }
      writeFile(wb, fname.endsWith('.xlsx') ? fname : fname + '.xlsx', { cellStyles: true } as any);
    }).catch(() => console.error('exportSheetsExcel: xlsx 패키지를 확인하세요.'));
  }
}
