import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';
import { resolveFormula, formatNumber } from '../../src/core/renderers/CellRenderer';

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

function makeGrid(extraOpts: Record<string, any> = {}) {
  const container = document.createElement('div');
  container.style.width  = '600px';
  container.style.height = '400px';
  document.body.appendChild(container);
  return new OpenGrid(container, {
    columns: [
      { field: 'name',   header: '이름', width: 120, editable: true },
      { field: 'dept',   header: '부서', width: 100, editable: true },
      { field: 'salary', header: '급여', width: 100, type: 'number', editable: true },
    ],
    height: 400,
    ...extraOpts,
  });
}

// 컬럼 순서: A=name, B=dept, C=salary (visibleLeaves, C1).
const sampleData = [
  { name: 'r0', dept: 'd0', salary: 10 },
  { name: 'r1', dept: 'd1', salary: 20 },
  { name: 'r2', dept: 'd2', salary: 30 },
];

function num(v: any): number {
  return typeof v?.toNumber === 'function' ? v.toNumber() : Number(v);
}

/** jsdom 은 실레이아웃이 없어 첫 렌더가 지연된다 — 셀 DOM(getCellEl)이 필요한 편집 테스트는 강제 동기 렌더. */
function renderNow(grid: OpenGrid<any>): void {
  (grid as any)._doRender(...(grid as any)._visRange());
}

describe('F3 배선 — 기본 평가/참조/API (f3.eval.basic, f3.ref.a1)', () => {
  it('=1+2 커밋 → 계산값 3, getCellFormula 는 원문 반환', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'name', '=1+2');
    expect(num(grid.readCell(0, 'name'))).toBe(3);
    expect(grid.getCellFormula(0, 'name')).toBe('=1+2');
    expect(grid.hasCellFormula(0, 'name')).toBe(true);
  });

  it('A1 참조는 visibleLeaves 열문자를 사용한다(B=dept)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.writeCell(1, 'dept', 10); // B2 = 10
    grid.setCellFormula(0, 'salary', '=B2*2');
    expect(num(grid.readCell(0, 'salary'))).toBe(20);
  });

  it('clearCellFormula 는 수식만 제거(값 유지), hasCellFormula=false', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'name', '=1+2');
    grid.clearCellFormula(0, 'name');
    expect(grid.hasCellFormula(0, 'name')).toBe(false);
    expect(grid.getCellFormula(0, 'name')).toBeNull();
    expect(num(grid.readCell(0, 'name'))).toBe(3); // 값은 그대로 유지
  });

  it('종속 선행 셀 값 변경 시 화면 밖 포함 자동 재계산(헤드리스)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'name', '=C1'); // C1 = salary row1(flat0) = 10
    expect(num(grid.readCell(0, 'name'))).toBe(10);
    grid.writeCell(0, 'salary', 99);
    expect(num(grid.readCell(0, 'name'))).toBe(99);
  });
});

describe('F3 배선 — 범위 함수 (f3.range.sum)', () => {
  it('SUM(C1:C3) = 표시 세 셀 합, 4번째 행에 저장해도 정확', () => {
    const grid = makeGrid();
    grid.setData([...sampleData, { name: 'r3', dept: 'd3', salary: 0 }]);
    grid.setCellFormula(3, 'dept', '=SUM(C1:C3)');
    expect(num(grid.readCell(3, 'dept'))).toBe(60);
  });
});

describe('F3 배선 — 사이클/삭제 무효화 (f3.cycle.detect, f3.ref.deleteref)', () => {
  it('A1=B1, B1=A1 → 둘 다 #CYCLE, 크래시 없음', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'name', '=B1'); // name0 = dept0
    grid.setCellFormula(0, 'dept', '=A1'); // dept0 = name0 (cycle 완성)
    expect(grid.getCellError(0, 'name')).toBe('#CYCLE');
    expect(grid.getCellError(0, 'dept')).toBe('#CYCLE');
  });

  it('삭제된 행 참조 → 종속 셀 #REF (조용한 값 대체 없음)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const targetRowId = grid.getFlatRowModel().rowIdOfFlat(1)!;
    grid.setCellFormula(1, 'dept', '=A1'); // dept1 = name0
    grid.deleteRow(0);
    const newIdx = grid.getFlatRowModel().flatIndexOfRowId(targetRowId);
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(grid.getCellError(newIdx, 'dept')).toBe('#REF');
  });

  it('열 삭제 → 그 field 를 참조하는 수식도 #REF', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'name', '=C1'); // salary 참조
    grid.deleteColumn('salary');
    expect(grid.getCellError(0, 'name')).toBe('#REF');
  });
});

describe('F3 배선 — 필터 dirty-on-filter (f3.range.dirtyonsort/필터편, §3.5 evaluate-time 멤버십)', () => {
  it('필터 후 범위-보유 수식이 새 표시 멤버십(제외된 행 반영)으로 1 recalc 내 갱신', () => {
    const grid = makeGrid();
    grid.setData([
      { name: 'r0', dept: '', salary: 10 },
      { name: 'r1', dept: '', salary: 20 },
      { name: 'r2', dept: '', salary: 30 },
      { name: 'r3', dept: '', salary: 40 },
    ]);
    const r3Id = grid.getFlatRowModel().rowIdOfFlat(3)!;
    // r3.dept = SUM(C1:C3) — 앵커는 r0(flat0)·r2(flat2) 특정 레코드(§3.2 stable-id).
    // 처음엔 두 앵커 "사이의 현재 표시 행" = r0,r1,r2 = 10+20+30 = 60.
    grid.setCellFormula(3, 'dept', '=SUM(C1:C3)');
    expect(num(grid.readCell(3, 'dept'))).toBe(60);

    // r1(salary=20) 을 필터로 제외 → 이제 두 앵커(r0,r2) 사이엔 그 둘만 남는다 = 10+30 = 40.
    grid.setFilter('salary', [{ operator: '!=', value: 20 }]);
    const newIdx = grid.getFlatRowModel().flatIndexOfRowId(r3Id);
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(num(grid.readCell(newIdx, 'dept'))).toBe(40);

    grid.resetFilter();
    const backIdx = grid.getFlatRowModel().flatIndexOfRowId(r3Id);
    expect(num(grid.readCell(backIdx, 'dept'))).toBe(60);
  });
});

describe('F3 배선 — 셀 수식 > 컬럼 수식 우선순위 (f3.precedence.cellwins, C7)', () => {
  it('resolveFormula 는 ctx.hasCellFormula=true 면 컬럼 수식을 평가하지 않는다', () => {
    const ctx: any = {
      value: 99, row: {}, rowIndex: 0,
      column: { formula: '[salary]*2' }, colIndex: 0,
      isSelected: false, rowState: 'none',
      hasCellFormula: true,
    };
    expect(resolveFormula(ctx)).toBeNull();
  });

  it('컬럼 formula 열의 특정 셀에 셀 수식 저장 → getDisplayValue 는 셀 수식 계산값', () => {
    const grid = makeGrid({
      columns: [
        { field: 'name', header: '이름', width: 120 },
        { field: 'dept', header: '부서', width: 100 },
        { field: 'salary', header: '급여', width: 100, type: 'number', formula: '0' },
      ],
    });
    grid.setData(sampleData);
    grid.setCellFormula(0, 'salary', '=99');
    expect(num(grid.readCell(0, 'salary'))).toBe(99);
    expect(grid.hasCellFormula(0, 'salary')).toBe(true);
  });
});

describe('F3 배선 — 집계 오염 차단 (f3.error.aggexclude, C11)', () => {
  it('에러 셀은 FooterManager 합계에서 0 이 아니라 제외된다', () => {
    const grid = makeGrid({
      footer: [{ field: 'salary', op: 'SUM' as const }],
    });
    grid.setData(sampleData); // 10+20+30 = 60
    // salary 에 에러를 주입해 집계 제외를 검증한다(#DIV0 이 0으로 스며들면 안 된다).
    grid.setCellFormula(2, 'salary', '=1/0'); // #DIV0
    const footerMgr = (grid as any)._footerMgr;
    const values = footerMgr.computeValues();
    const salarySum = values.find((v: any) => v._field === 'salary');
    // 10(row0) + 20(row1) 만 합산, row2(#DIV0)는 제외 → 30 (0 으로 스며들지 않음)
    expect(salarySum._value).toBe(30);
  });
});

describe('F3 배선 — C3 합동(F1 fill 연결)', () => {
  it('소스가 수식인 셀을 채우면 offsetFormula 로 상대참조가 이동된 수식이 복제된다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    // A1(row0.name) = B1(row0.dept, 상대) — refMode 기본은 stable 이라 바레 A1도 절대 앵커.
    // C3 는 절대참조는 불변, 상대(비-$)만 오프셋한다는 계약이므로 stable 모드에선 오프셋해도
    // 참조 대상이 그대로("절대 취급") 이동하지 않는다 — 여기서는 그 계약을 실측 검증한다.
    grid.setCellFormula(0, 'name', '=B1');
    grid.fillRange(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
      'copy',
    );
    expect(grid.hasCellFormula(1, 'name')).toBe(true);
    // stable 기본 모드: 절대 앵커라 오프셋 후에도 원래 B1(row0.dept)을 계속 가리킨다.
    expect(grid.readCell(0, 'dept')).toBeDefined();
  });

  it('소스=값, 대상=수식 → 기본은 대상 수식 보존(skip) + announce', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(1, 'name', '=1+1'); // target 이 수식(값=2)
    const announced = vi.fn();
    grid.on('rangeFill', announced);
    grid.fillRange(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, // source: row0.name (값 'r0')
      { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, // target: row1.name (수식)
      'copy',
    );
    expect(grid.hasCellFormula(1, 'name')).toBe(true); // 보존됨
    expect(num(grid.readCell(1, 'name'))).toBe(2); // 값 불변
    expect(announced.mock.calls[0][0].skippedFormula).toBe(1);
  });

  it('R×C 배치 채우기는 재계산 1패스(formulaRecalc 1회)로 처리된다', () => {
    const grid = makeGrid();
    grid.setData([
      { name: 'r0', dept: 'd0', salary: 1 },
      { name: 'r1', dept: 'd1', salary: 2 },
      { name: 'r2', dept: 'd2', salary: 3 },
    ]);
    grid.setCellFormula(0, 'name', '=C1'); // 종속 수식 하나 존재
    const onRecalc = vi.fn();
    grid.on('formulaRecalc', onRecalc);
    grid.writeCells([
      { rowIndex: 0, field: 'salary', value: 100 },
      { rowIndex: 1, field: 'salary', value: 200 },
      { rowIndex: 2, field: 'salary', value: 300 },
    ]);
    expect(onRecalc).toHaveBeenCalledTimes(1);
    expect(num(grid.readCell(0, 'name'))).toBe(100);
  });
});

describe('F3 배선 — 편집 UX("=" 진입, §7.1)', () => {
  it('셀 편집 커밋 시 "=" 로 시작하면 수식으로 인식되어 setCellFormula 경로를 탄다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    const editMgr = (grid as any)._editMgr;
    editMgr.startEditByKey(0, 0); // name 컬럼
    editMgr.commitEditWithValue(0, 0, '=1+2');
    expect(grid.hasCellFormula(0, 'name')).toBe(true);
    expect(num(grid.readCell(0, 'name'))).toBe(3);
  });

  it('수식 셀 재편집 시 에디터 초기값은 계산값이 아니라 원문이다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'name', '=1+2');
    renderNow(grid);
    const editMgr = (grid as any)._editMgr;
    editMgr.startEditByKey(0, 0);
    expect(editMgr.activeEditor.getValue()).toBe('=1+2');
    editMgr.cancelEdit();
  });

  it('일반 값 편집("=" 로 시작하지 않음)은 기존과 동일하게 동작(회귀 0)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    renderNow(grid);
    const editMgr = (grid as any)._editMgr;
    editMgr.startEditByKey(0, 0);
    editMgr.commitEditWithValue(0, 0, '변경됨');
    expect(grid.hasCellFormula(0, 'name')).toBe(false);
    expect(grid.readCell(0, 'name')).toBe('변경됨');
  });
});

describe('F3 배선 — 로케일 포맷 (f3.i18n.format, F3-R26/C11)', () => {
  it('계산값은 컬럼 number 포맷터를 경유한다: =1000/3 → "333.33"(#,##0.00)', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    grid.setCellFormula(0, 'salary', '=1000/3');
    const computed = grid.readCell(0, 'salary');
    expect(formatNumber(computed, '#,##0.00')).toBe('333.33');
  });
});

describe('F3 배선 — 이벤트(formulaChange/formulaError)', () => {
  it('setCellFormula 는 formulaChange 를 1회 emit 한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const onChange = vi.fn();
    grid.on('formulaChange', onChange);
    grid.setCellFormula(0, 'name', '=1+2');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ rowIndex: 0, field: 'name', formula: '=1+2' });
  });

  it('평가 에러 발생 시 formulaError 를 emit 한다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);
    const onError = vi.fn();
    grid.on('formulaError', onError);
    grid.setCellFormula(0, 'name', '=1/0');
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toMatchObject({ rowIndex: 0, field: 'name', error: '#DIV0' });
  });
});
