/**
 * 회귀 테스트: OpenGrid 생성자 초기화 순서 버그
 *
 * 버그: this._ovk = new OverrideKernel(...) 생성이 this._mount() 뒤에 있었음.
 * FooterManager deps의 getStrategy 클로저가 `(slot, fb) => this._ovk.getStrategy(slot, fb)`를
 * 참조하는데, _mount() 내부 또는 그 이후 setData() → _doRender() → _renderFooterEl() →
 * FooterManager.computeValues() → getStrategy('summaryOp', ...) 경로에서
 * this._ovk 가 undefined 이므로 "Cannot read properties of undefined (reading 'getStrategy')" 발생.
 * 수정: _ovk 생성 + resolver 배선을 _mount() 앞으로 이동.
 * 이 테스트들은 수정 전이라면 throw 로 실패했을 것이다.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

// jsdom 환경에 없는 ResizeObserver mock (기존 테스트들과 동일 패턴)
beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── 공통 컬럼 정의 ───────────────────────────────────────────
const columns = [
  { field: 'name',   header: '이름', width: 120 },
  { field: 'dept',   header: '부서', width: 100 },
  { field: 'salary', header: '급여', width: 100, type: 'number' as const },
];

const sampleData = [
  { name: '홍길동', dept: '개발팀', salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '개발팀', salary: 3800000 },
];

function makeContainer() {
  const el = document.createElement('div');
  el.style.width  = '600px';
  el.style.height = '400px';
  document.body.appendChild(el);
  return el;
}

// ─── (a) footer 옵션이 있는 그리드 생성 시 throw 없음 ────────
describe('초기화 순서 회귀: footer(summaryOp 경로)', () => {
  it('footer SUM 정의 그리드를 생성해도 throw 하지 않는다', () => {
    // 수정 전: _ovk undefined → getStrategy 호출 시 TypeError
    expect(() => {
      new OpenGrid(makeContainer(), {
        columns,
        height: 400,
        footer: [{ field: 'salary', op: 'SUM' }],
      });
    }).not.toThrow();
  });

  it('footer 정의 그리드에 setData 후 getFooterValue 가 합산값을 반환한다', () => {
    const grid = new OpenGrid(makeContainer(), {
      columns,
      height: 400,
      footer: [{ field: 'salary', op: 'SUM' }],
    });
    grid.setData([...sampleData]);
    // 5000000 + 4200000 + 3800000 = 13000000
    expect(grid.getFooterValue('salary')).toBe(13000000);
    grid.destroy();
  });

  it('footer AVG 정의 그리드 생성 + getFooterValue 평균값 반환', () => {
    const grid = new OpenGrid(makeContainer(), {
      columns,
      height: 400,
      footer: [{ field: 'salary', op: 'AVG' }],
    });
    grid.setData([...sampleData]);
    const expected = (5000000 + 4200000 + 3800000) / 3;
    expect(grid.getFooterValue('salary')).toBeCloseTo(expected);
    grid.destroy();
  });
});

// ─── (b) groupBy + footer 조합 그리드 생성 시 throw 없음 ─────
describe('초기화 순서 회귀: groupBy + footer 조합', () => {
  it('groupBy + footer SUM 조합 그리드를 생성해도 throw 하지 않는다', () => {
    // 수정 전: GroupTreeManager.getStrategy 클로저도 _ovk 참조 → 동일하게 깨짐
    expect(() => {
      new OpenGrid(makeContainer(), {
        columns,
        height: 400,
        groupBy: ['dept'],
        footer: [{ field: 'salary', op: 'SUM' }],
      });
    }).not.toThrow();
  });

  it('groupBy + footer 그리드에 setData 후 그룹 행 포함 getData 동작', () => {
    const grid = new OpenGrid(makeContainer(), {
      columns,
      height: 400,
      groupBy: ['dept'],
      footer: [{ field: 'salary', op: 'SUM' }],
    });
    grid.setData([...sampleData]);
    // getData()가 비어있지 않으면 그룹+데이터 정상 로드
    expect(grid.getData().length).toBeGreaterThan(0);
    grid.destroy();
  });
});

// ─── (c) defaultSort가 있는 그리드 생성 시 throw 없음 ────────
describe('초기화 순서 회귀: defaultSort(sortComparator 경로)', () => {
  it('defaultSort 정의 그리드를 생성해도 throw 하지 않는다', () => {
    // sortComparator strategy 슬롯도 _ovk.getStrategy 경로를 사용
    expect(() => {
      new OpenGrid(makeContainer(), {
        columns,
        height: 400,
        defaultSort: [{ field: 'salary', dir: 'asc' }],
      });
    }).not.toThrow();
  });

  it('defaultSort 그리드에 setData 해도 throw 없이 데이터가 보존된다', () => {
    // 이 fix(=_ovk 를 _mount/initSort 앞에 생성) 전이라면 initSort 의
    // sortComparator strategy 조회가 undefined _ovk 를 건드려 깨졌다.
    // getData()는 원본 삽입순을 반환한다(정렬은 표시 인덱스 경유) — 순서 단언 대신
    // "throw 없이 전체 데이터가 보존됨"만 확인한다(정렬 정확성은 기존 sort 테스트가 담당).
    const grid = new OpenGrid(makeContainer(), {
      columns,
      height: 400,
      defaultSort: [{ field: 'salary', dir: 'asc' }],
    });
    expect(() => grid.setData([...sampleData])).not.toThrow();
    const salaries = grid.getData().map((r: any) => r.salary).sort((a: number, b: number) => a - b);
    expect(salaries).toEqual([3800000, 4200000, 5000000]);
    grid.destroy();
  });
});
