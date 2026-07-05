import { ColumnLayout } from './ColumnLayout.js';
import { _downloadText } from './GridRenderer.js';
import { applyMask } from './MaskingEngine.js';
import type { WorksheetManager } from './WorksheetManager.js';
import type { ExportOptions } from './types.js';

/**
 * ExportManager 의존성 주입 인터페이스. / Dependency-injection interface for ExportManager.
 *
 * OpenGrid 내부 상태(데이터·컬럼·옵션 등)를 export 로직에서 직접 참조하지 않고
 * 콜백으로만 받도록 분리한다. / Decouples export logic from OpenGrid's internals —
 * everything is read back through callbacks instead of direct references.
 */
export interface ExportDeps<T extends Record<string, any>> {
  /** 내보낼 전체 행 데이터. / Full row data to export. */
  getData: () => T[];
  /** 현재 컬럼 레이아웃(가시 리프 컬럼 조회용). / Current column layout (for resolving visible leaf columns). */
  getColLayout: () => ColumnLayout<T>;
  /** 컬럼별 현재 폭(px) 배열. / Current per-column widths (px). */
  getColWidths: () => number[];
  /** 그리드 옵션 스냅샷. / Snapshot of grid options. */
  getOptions: () => any;
  /** 그리드 컨테이너 엘리먼트(테마 CSS 변수 조회용). / Grid container element (for reading theme CSS variables). */
  getContainer: () => HTMLElement;
  /** 필드별 마스킹 활성 여부. / Whether masking is enabled for a given field. */
  getMaskEnabled: (field: string) => boolean;
  /** 워크시트 매니저(다중 시트 내보내기용). 없으면 `null`. / Worksheet manager (for multi-sheet export); `null` if absent. */
  getWsManager: () => WorksheetManager<T> | null;
  /** Phase 2: OverrideKernel.getStrategy 주입(슬롯 cellSerializer 도달용). / Phase 2: injected via OverrideKernel.getStrategy (reaches the `cellSerializer` slot). */
  getStrategy?: <F extends Function>(slot: string, fallback: F) => F;
  /** i18n: 인쇄 요약행 해석(미주입 시 ko 폴백). / i18n: resolve print summary row (ko fallback when absent). */
  t?: (key: string, params?: Record<string, string | number>) => string;
  /** i18n: 로케일 포맷 메타(인쇄 lang·날짜 로케일·Excel 폰트). / i18n: locale format meta (print lang, date locale, Excel font). */
  getMeta?: () => { intlLocale: string; exportFont?: string };
}

/**
 * 그리드 데이터 내보내기(Excel/CSV/JSON/인쇄) 관리자. / Manages exporting grid data (Excel/CSV/JSON/print).
 *
 * OpenGrid 상태를 {@link ExportDeps} 콜백으로만 읽으며, Excel 계열은 `xlsx-js-style` 을
 * 동적 import 하여 필요할 때만 로드한다. / Reads OpenGrid state only through {@link ExportDeps}
 * callbacks; Excel exports dynamically `import()` `xlsx-js-style` so it loads only on demand.
 */
export class ExportManager<T extends Record<string, any> = any> {
  private _d: ExportDeps<T>;

  constructor(deps: ExportDeps<T>) {
    this._d = deps;
  }

  /** @internal 컨테이너의 CSS 커스텀 프로퍼티 값을 읽는다. / Reads a CSS custom property value from the container. */
  private _readCssVar(name: string): string {
    return getComputedStyle(this._d.getContainer()).getPropertyValue(name).trim();
  }

  /** @internal HEX/RGB 색상 문자열을 xlsx-js-style 이 요구하는 6자리 RGB 헥스로 변환. / Converts a HEX/RGB color string into the 6-digit RGB hex xlsx-js-style expects. */
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

  /**
   * 현재 그리드 데이터를 스타일이 적용된 `.xlsx` 로 내보낸다. / Export the current grid data as a styled `.xlsx` file.
   *
   * 헤더/데이터 배색은 `styleMode: 'theme'`(기본) 시 그리드 테마 CSS 변수(`--og-*`)에서
   * 읽어 반영하고, `cellSerializer` override 슬롯이 있으면 셀 값 직렬화를 위임한다.
   * / When `styleMode: 'theme'` (default), header/data colors are read from the grid's
   * theme CSS variables (`--og-*`); if an `cellSerializer` override slot is registered,
   * cell-value serialization is delegated to it.
   *
   * @param options - 파일명 문자열 또는 {@link ExportOptions} / A filename string, or {@link ExportOptions}
   * @example
   * grid.exportExcel({ filename: 'orders', maskOnExport: true });
   */
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

  /**
   * 현재 그리드 데이터를 UTF-8 BOM 포함 CSV 로 내보낸다. / Export the current grid data as a UTF-8 (BOM) CSV file.
   *
   * @param options - 파일명 문자열 또는 {@link ExportOptions} / A filename string, or {@link ExportOptions}
   */
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

  /**
   * 현재 그리드 데이터를 JSON 파일로 내보낸다. / Export the current grid data as a JSON file.
   *
   * @param options - 파일명 문자열 또는 `filename` 을 담은 옵션 / A filename string, or an options object with `filename`
   */
  exportJson(options?: ExportOptions | string): void {
    const fname = typeof options === 'string' ? options : (options?.filename ?? 'export.json');
    _downloadText(JSON.stringify(this._d.getData(), null, 2), fname, 'application/json');
  }

  /**
   * 새 창을 열어 현재 그리드 데이터를 인쇄용 HTML 표로 렌더하고 인쇄 대화상자를 띄운다.
   * / Opens a new window, renders the current grid data as a print-ready HTML table, and triggers the print dialog.
   *
   * 인쇄 문서의 `lang`·날짜 로케일·요약행 문구는 활성 로케일(`getMeta`/`t`)을 따른다
   * (미주입 시 ko 폴백, byte-identical). / The document `lang`, date locale, and summary
   * line follow the active locale (`getMeta`/`t`); falls back to ko when not injected (byte-identical).
   *
   * @param options - 제목·제외 필드·인쇄 푸터 텍스트 / Title, excluded fields, and print-footer text
   */
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

  /**
   * 워크시트 매니저의 모든 시트를 시트별 탭으로 갖는 단일 `.xlsx` 로 내보낸다.
   * / Export every sheet from the worksheet manager into a single `.xlsx` file, one tab per sheet.
   *
   * 워크시트 매니저가 없으면 {@link exportExcel} 로 폴백한다.
   * / Falls back to {@link exportExcel} when no worksheet manager is present.
   *
   * @param filename - 파일명(확장자 생략 가능) / Output filename (extension optional)
   */
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
