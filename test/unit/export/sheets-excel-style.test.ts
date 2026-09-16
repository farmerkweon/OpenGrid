import { describe, it, expect, vi, beforeEach } from 'vitest';

// xlsx-js-style 의 실제 utils 는 쓰고, 파일 쓰기만 가로채 워크북을 검사한다.
const written: any[] = [];
vi.mock('xlsx-js-style', async (orig) => {
  const real: any = await orig();
  return { ...real, utils: real.utils, writeFile: (wb: any) => { written.push(wb); } };
});

import { ExportManager } from '../../../src/core/ExportManager';

const salesCols = [
  { field: 'name', header: '이름', width: 100 },
  { field: 'sales', header: '매출', width: 120, type: 'number', format: '#,##0' },
];

function makeManager(sheets: Record<string, any[]>, active: string, liveData: any[]) {
  const names = Object.keys(sheets);
  const ws = {
    getNames: () => names,
    getActive: () => active,
    get: (n: string) => ({ name: n, columns: salesCols, data: sheets[n] }),
  };
  const container = document.createElement('div');
  container.style.setProperty('--og-header-bg', '#123456');
  document.body.appendChild(container);
  return new ExportManager<any>({
    getData: () => liveData,
    getColLayout: () => ({ visibleLeaves: salesCols, getColumnIndex: () => 0 }) as any,
    getColWidths: () => [],
    getOptions: () => ({ columns: salesCols }),
    getContainer: () => container,
    getMaskEnabled: () => false,
    getWsManager: () => ws as any,
  });
}


describe('exportSheetsExcel — 시트마다 스타일', () => {
  beforeEach(() => { written.length = 0; });

  it('모든 시트의 헤더·데이터 셀에 스타일(s)이 붙는다', async () => {
    const m = makeManager({ Sheet1: [{ name: 'A', sales: 4200000 }], Sheet2: [{ name: 'B', sales: 1 }] }, 'Sheet1', [{ name: 'A', sales: 4200000 }]);
    m.exportSheetsExcel('t');
    await vi.waitFor(() => expect(written.length).toBe(1));
    const wb = written[0];
    expect(wb.SheetNames).toEqual(['Sheet1', 'Sheet2']);
    for (const n of wb.SheetNames) {
      const sh = wb.Sheets[n];
      expect(sh.A1.s?.font?.bold).toBe(true);
      expect(sh.A1.s?.fill?.fgColor?.rgb).toBe('123456');
      expect(sh.B2.s?.border?.top?.style).toBe('thin');
      expect(sh.B2.s?.alignment?.horizontal).toBe('right');
      expect(sh.B2.z).toBe('#,##0');
    }
    expect(wb.Sheets.Sheet1['!cols'][1].wpx).toBe(120);
  });

  it('활성 시트는 화면의 최신 데이터(편집 반영)로 나간다', async () => {
    const m = makeManager({ Sheet1: [{ name: 'A', sales: 1 }], Sheet2: [{ name: 'B', sales: 2 }] }, 'Sheet1', [{ name: '편집됨', sales: 9 }]);
    m.exportSheetsExcel('t');
    await vi.waitFor(() => expect(written.length).toBe(1));
    expect(written[0].Sheets.Sheet1.A2.v).toBe('편집됨');
    expect(written[0].Sheets.Sheet2.A2.v).toBe('B');
  });

  it('안전하지 않은 서식 문자열은 엑셀 서식으로 옮기지 않는다', async () => {
    const m = makeManager({ S: [{ name: 'A', sales: 1 }] }, 'S', [{ name: 'A', sales: 1 }]);
    (salesCols[1] as any).format = '₩#,##0원';
    try {
      m.exportSheetsExcel('t');
      await vi.waitFor(() => expect(written.length).toBe(1));
      expect(written[0].Sheets.S.B2.z).toBeUndefined();
    } finally { (salesCols[1] as any).format = '#,##0'; }
  });
});
