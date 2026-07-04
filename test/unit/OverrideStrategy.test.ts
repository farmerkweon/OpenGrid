import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';
import { DataLayer } from '../../src/core/DataLayer';
import { buildGroups } from '../../src/core/GroupEngine';
import { FooterManager } from '../../src/core/FooterManager';
import { ExportManager } from '../../src/core/ExportManager';
import { formatNumber, formatDate, NumberRenderer, DateRenderer, type RenderContext } from '../../src/core/renderers/CellRenderer';
import type { FilterItem, SortItem } from '../../src/core/types';

// ── xlsx-js-style mock: aoa_to_sheet 로 들어온 rows 를 캡처해 cellSerializer 검증 ──
let _capturedRows: any[][] = [];
vi.mock('xlsx-js-style', () => {
  return {
    utils: {
      aoa_to_sheet: (rows: any[][]) => { _capturedRows = rows; return {} as any; },
      encode_cell: () => 'A1',
      book_new: () => ({}),
      book_append_sheet: () => {},
      decode_range: () => ({}),
    },
    writeFile: () => {},
  };
});

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function makeGrid(container = document.createElement('div')) {
  container.style.width = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  return new OpenGrid(container, {
    columns: [
      { field: 'name', header: '이름', width: 120 },
      { field: 'dept', header: '부서', width: 100 },
      { field: 'salary', header: '급여', width: 100, type: 'number' },
    ],
    height: 400,
  });
}

const sample = [
  { name: '홍길동', dept: '개발팀', salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '개발팀', salary: 3800000 },
];

afterEach(() => {
  // R1: 렌더러측 displayFormatter 모듈전역 제거됨(per-instance 경로) — 리셋 불필요.
  _capturedRows = [];
});

// ─── 슬롯 #1: sortComparator ─────────────────────────────
describe('strategy: sortComparator', () => {
  function loaded() {
    const dl = new DataLayer();
    dl.setData(sample.map(r => ({ ...r })));
    return dl;
  }

  it('default 동치성: 미등록 시 기존 인라인 정렬 결과와 동일', () => {
    const dl = loaded();
    dl.applySort([{ field: 'salary', dir: 'asc' } as SortItem]);
    expect(dl.getData().map(r => r.salary)).toEqual([3800000, 4200000, 5000000]);

    dl.applySort([{ field: 'name', dir: 'desc' } as SortItem]);
    expect(dl.getData().map(r => r.name)).toEqual(['홍길동', '이영희', '김철수']);
  });

  it('커스텀: 역순 비교자 등록 시 정렬 반전', () => {
    const dl = loaded();
    // 단일키 비교자(역순). dir 부호는 호출자가 적용하므로 비교 자체를 뒤집음.
    dl.setStrategyResolver(<F extends Function>(slot: string, fb: F): F => {
      if (slot === 'sortComparator') {
        return ((a: any, b: any) => (a < b ? 1 : a > b ? -1 : 0)) as unknown as F;
      }
      return fb;
    });
    dl.applySort([{ field: 'salary', dir: 'asc' } as SortItem]);
    // 비교자 반전 → asc 인데 결과는 내림차순.
    expect(dl.getData().map(r => r.salary)).toEqual([5000000, 4200000, 3800000]);
  });

  it('sort 후 표시인덱스 정합: rowCount/getData 길이 일치', () => {
    const dl = loaded();
    dl.applySort([{ field: 'dept', dir: 'asc' } as SortItem]);
    expect(dl.getData().length).toBe(3);
    expect(dl.rowCount).toBe(3);
  });
});

// ─── 슬롯 #2: filterPredicate ────────────────────────────
describe('strategy: filterPredicate', () => {
  function loaded() {
    const dl = new DataLayer();
    dl.setData(sample.map(r => ({ ...r })));
    return dl;
  }

  it('default 동치성: 미등록 시 기존 operator switch 결과와 동일', () => {
    const dl = loaded();
    dl.applyFilter({ dept: [{ operator: '=', value: '개발팀' } as FilterItem] });
    expect(dl.getData().map(r => r.name)).toEqual(['홍길동', '이영희']);
  });

  it('커스텀: 술어 반전(OR 효과) 등록 시 동작', () => {
    const dl = loaded();
    dl.setStrategyResolver(<F extends Function>(slot: string, fb: F): F => {
      if (slot === 'filterPredicate') {
        // 항상 true → 필터 무력화(모든 행 통과)
        return (() => true) as unknown as F;
      }
      return fb;
    });
    dl.applyFilter({ dept: [{ operator: '=', value: '없는부서' } as FilterItem] });
    expect(dl.getData().length).toBe(3);
  });
});

// ─── 슬롯 #3: displayFormatter ───────────────────────────
describe('strategy: displayFormatter', () => {
  it('default 동치성: getDisplayValue 미등록 시 String 변환', () => {
    const g = makeGrid();
    g.setData(sample.map(r => ({ ...r })));
    expect(g.getDisplayValue(0, 'salary')).toBe('5000000');
    expect(g.getDisplayValue(1, 'name')).toBe('김철수');
    g.destroy();
  });

  it('커스텀: 통화 포맷 등록 시 getDisplayValue 반영', () => {
    const g = makeGrid();
    g.setData(sample.map(r => ({ ...r })));
    g.override.strategy('displayFormatter', (v: any, f: string) =>
      f === 'salary' && v != null ? `₩${Number(v).toLocaleString('ko-KR')}` : v == null ? '' : String(v),
    );
    expect(g.getDisplayValue(0, 'salary')).toBe('₩5,000,000');
    expect(g.getDisplayValue(0, 'name')).toBe('홍길동');
    g.destroy();
  });

  it('formatNumber/formatDate 는 순수 포맷 함수(R1: 렌더러측 모듈전역 제거 후 전역상태 0)', () => {
    expect(formatNumber(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatDate('2024-01-02', 'yyyy-MM-dd')).toBe('2024-01-02');
  });

  it('커스텀(렌더러측, R1b per-instance): Number/Date 렌더러가 ctx.displayFormatter 전략을 ctx.value 위에 적용', () => {
    const mkCtx = (value: any, df: ((v: any, f: string, r: any) => string | null) | null, format?: string): RenderContext => ({
      value, row: {}, rowIndex: 0,
      column: { field: 'x', header: 'x', ...(format ? { format } : {}) } as any,
      colIndex: 0, isSelected: false, rowState: 'none', displayFormatter: df,
    });
    // 전략 주입 시 그 값 우선(ctx.value 기반)
    expect(new NumberRenderer().render(mkCtx(10, (v) => `[${v}]`, '#,##0')).textContent).toBe('[10]');
    expect(new DateRenderer().render(mkCtx('2024-01-02', (v) => `[${v}]`)).textContent).toBe('[2024-01-02]');
    // 전략이 null 반환 → 기본 포맷 폴백
    expect(new NumberRenderer().render(mkCtx(1234.5, () => null, '#,##0.00')).textContent).toBe('1,234.50');
    // 전략 미설정(null) → 기본 포맷
    expect(new NumberRenderer().render(mkCtx(10, null, '#,##0')).textContent).toBe('10');
  });

  it('R1b 회귀방지(H1): getDisplayValue override 가 채운 무포맷 ctx.displayValue 를 Number/Date 는 무시하고 기본 포맷 유지', () => {
    // getDisplayValue override 가 미처리 필드를 orig 로 위임하면 ctx.displayValue = String(v)(무포맷)이 된다.
    // Number/Date 렌더러는 이를 소비하지 않으므로(전략 채널만 사용) 천단위·정밀도가 유지돼야 한다.
    const ctxH1: RenderContext = {
      value: 50000, row: {}, rowIndex: 0,
      column: { field: 'salary', header: 's', format: '#,##0' } as any,
      colIndex: 0, isSelected: false, rowState: 'none',
      displayValue: '50000', displayFormatter: null,
    };
    expect(new NumberRenderer().render(ctxH1).textContent).toBe('50,000');
    const ctxH1d: RenderContext = {
      value: '2024-01-02', row: {}, rowIndex: 0,
      column: { field: 'd', header: 'd' } as any,
      colIndex: 0, isSelected: false, rowState: 'none',
      displayValue: '2024-01-02T00:00:00.000Z', displayFormatter: null,
    };
    expect(new DateRenderer().render(ctxH1d).textContent).toBe('2024-01-02');
  });
});

// ─── 슬롯 #4: cellSerializer ─────────────────────────────
describe('strategy: cellSerializer', () => {
  function makeExportMgr(getStrategy?: <F extends Function>(s: string, fb: F) => F) {
    const cols = [
      { field: 'name', header: '이름' },
      { field: 'flag', header: '플래그', type: 'boolean' },
      { field: 'num', header: '수', type: 'number' },
    ];
    return new ExportManager<any>({
      getData: () => [{ name: 'a', flag: true, num: 5 }, { name: 'b', flag: false, num: 0 }],
      getColLayout: () => ({ visibleLeaves: cols, getColumnIndex: () => 0 } as any),
      getColWidths: () => [100, 100, 100],
      getOptions: () => ({ ariaLabel: 'X' }),
      getContainer: () => document.createElement('div'),
      getMaskEnabled: () => false,
      getWsManager: () => null,
      ...(getStrategy ? { getStrategy } : {}),
    });
  }

  it('default 동치성: boolean→✓, number→raw, 미등록 시 기존 직렬화', async () => {
    const mgr = makeExportMgr();
    mgr.exportExcel('t');
    await new Promise(r => setTimeout(r, 0));
    // rows[0]=header, rows[1]=첫행
    expect(_capturedRows[1]).toEqual(['a', '✓', 5]);
    // flag=false→'', num=0 은 v==null/=='' 모두 아님 → serialize → number 분기 → 0 (기존 인라인과 동일).
    expect(_capturedRows[2]).toEqual(['b', '', 0]);
  });

  it('커스텀: cellSerializer 등록 시 직렬화 치환', async () => {
    const custom = <F extends Function>(slot: string, fb: F): F => {
      if (slot === 'cellSerializer') {
        return ((v: any) => (typeof v === 'boolean' ? (v ? 'YES' : 'NO') : v)) as unknown as F;
      }
      return fb;
    };
    const mgr = makeExportMgr(custom);
    mgr.exportExcel('t');
    await new Promise(r => setTimeout(r, 0));
    expect(_capturedRows[1]).toEqual(['a', 'YES', 5]);
  });
});

// ─── 슬롯 #5: groupKeyFn ─────────────────────────────────
describe('strategy: groupKeyFn', () => {
  const data = [
    { name: 'apple', dept: '개발팀' },
    { name: 'avocado', dept: '개발팀' },
    { name: 'banana', dept: '인사팀' },
  ];

  it('default 동치성: getKey 미지정 시 row[field] 그룹', () => {
    const groups = buildGroups(data, ['dept']);
    expect(groups.map(g => g._groupValue).sort()).toEqual(['개발팀', '인사팀']);
    const dev = groups.find(g => g._groupValue === '개발팀')!;
    expect(dev._childCount).toBe(2);
  });

  it('커스텀: name 첫 글자로 그룹', () => {
    const groups = buildGroups(
      data, ['name'], [], new Set(), undefined,
      (row: any) => row.name[0],
    );
    expect(groups.map(g => g._groupValue).sort()).toEqual(['a', 'b']);
    const a = groups.find(g => g._groupValue === 'a')!;
    expect(a._childCount).toBe(2); // apple, avocado
  });
});

// ─── 슬롯 #6: summaryOp ──────────────────────────────────
describe('strategy: summaryOp', () => {
  function makeFooter(op: string, getStrategy?: <F extends Function>(s: string, fb: F) => F) {
    return new FooterManager<any>({
      getData: () => [{ v: 10 }, { v: 20 }, { v: 30 }],
      getColLayout: () => ({ visibleLeaves: [] } as any),
      getColWidths: () => [],
      getOptions: () => ({ footer: [{ field: 'v', op }] }),
      getContainer: () => document.createElement('div'),
      ...(getStrategy ? { getStrategy } : {}),
    });
  }

  it('default 동치성: SUM/AVG/COUNT/MAX/MIN 미등록 시 기존 분기', () => {
    expect(makeFooter('SUM').computeValues()[0]._value).toBe(60);
    expect(makeFooter('AVG').computeValues()[0]._value).toBe(20);
    expect(makeFooter('COUNT').computeValues()[0]._value).toBe(3);
    expect(makeFooter('MAX').computeValues()[0]._value).toBe(30);
    expect(makeFooter('MIN').computeValues()[0]._value).toBe(10);
  });

  it('커스텀: MEDIAN 가로채기, 기본 op 은 폴백', () => {
    const custom = <F extends Function>(slot: string, fb: F): F => {
      if (slot === 'summaryOp') {
        return ((op: string, nums: any[]) => {
          if (op === 'MEDIAN') {
            const s = [...nums].map(Number).sort((a, b) => a - b);
            return s[Math.floor(s.length / 2)];
          }
          return null; // 기본 분기 폴백
        }) as unknown as F;
      }
      return fb;
    };
    expect(makeFooter('MEDIAN', custom).computeValues()[0]._value).toBe(20);
    // 기본 op 은 슬롯이 null 반환 → 기존 SUM 동작 유지
    expect(makeFooter('SUM', custom).computeValues()[0]._value).toBe(60);
  });
});

// ─── 통합: 그리드 전체 경로 default 동치성 ───────────────
describe('grid 통합 default 동치성', () => {
  it('슬롯 미등록 시 sort/filter 출력 = baseline', () => {
    const g = makeGrid();
    g.setData(sample.map(r => ({ ...r })));
    g.orderBy('salary', 'asc');
    expect(g.getData().map(r => r.salary)).toEqual([3800000, 4200000, 5000000]);
    g.setFilter('dept', [{ operator: '=', value: '개발팀' } as FilterItem]);
    expect(g.getData().map(r => r.name).sort()).toEqual(['이영희', '홍길동']);
    g.destroy();
  });
});
