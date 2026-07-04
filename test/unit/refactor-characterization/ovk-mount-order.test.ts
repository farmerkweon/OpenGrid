/**
 * R0 CHARACTERIZATION — construction-order crash class (OverrideKernel before _mount).
 *
 * Locks the crash-class documented by the scar comment at OpenGrid.ts:340-343:
 *   "이전엔 mount 이후 생성하여 summary 푸터가 있는 그리드가 초기화 중
 *    'Cannot read properties of undefined (reading getStrategy)' 로 깨졌다."
 *
 * The guard is present TODAY (_ovk is created before _mount), so these tests PASS.
 * They exist so that the later refactor increments (R2 composition root / Phased Builder,
 * R8 event wiring) cannot silently reintroduce the ordering crash: any regression that
 * moves override-kernel construction back after mount will flip these to a hard throw.
 *
 * Design refs: 90_final_design.md §2.3 R-2a, §3.3; 00_current_architecture.md §2.4-2, §6 P0-3.
 * This is the "early minimal seal" (T-γ ⓐ) of the ordering invariant.
 *
 * NOTE: this deliberately overlaps with test/unit/init-order-getStrategy.test.ts. That file
 * is the historical regression net; this file is the refactor-scoped characterization anchor
 * (same invariant, refactor-increment framing) — both must stay green through every increment.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { OpenGrid } from '../../../src/core/OpenGrid';

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

const GETSTRATEGY_CRASH = /Cannot read properties of undefined \(reading '?getStrategy'?\)/;

describe('R0: _ovk-before-_mount ordering — summary footer construction does not crash', () => {
  it('constructing a summary-footer grid does NOT throw the getStrategy crash', () => {
    // The footer path (FooterManager.computeValues → getStrategy('summaryOp')) dereferences
    // this._ovk during the initial mount/render. With the guard present, no throw.
    let thrown: unknown;
    try {
      new OpenGrid(makeContainer(), {
        columns,
        height: 400,
        footer: [{ field: 'salary', op: 'SUM' }],
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeUndefined();
    // Belt-and-braces: even if some other error appears later, it must not be the crash class.
    if (thrown instanceof Error) expect(thrown.message).not.toMatch(GETSTRATEGY_CRASH);
  });

  it('summary-footer grid computes footer aggregate after setData (kernel wired pre-mount)', () => {
    const grid = new OpenGrid(makeContainer(), {
      columns,
      height: 400,
      footer: [{ field: 'salary', op: 'SUM' }],
    });
    grid.setData([...sampleData]);
    expect(grid.getFooterValue('salary')).toBe(5000000 + 4200000 + 3800000);
    grid.destroy();
  });

  it('groupBy + summary footer combination constructs without the getStrategy crash', () => {
    // GroupTreeManager's getStrategy closure also captures this._ovk — same crash class.
    let thrown: unknown;
    try {
      const grid = new OpenGrid(makeContainer(), {
        columns,
        height: 400,
        groupBy: ['dept'],
        footer: [{ field: 'salary', op: 'SUM' }],
      });
      grid.setData([...sampleData]);
      grid.destroy();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeUndefined();
    if (thrown instanceof Error) expect(thrown.message).not.toMatch(GETSTRATEGY_CRASH);
  });

  it('defaultSort grid (sortComparator slot) constructs without the getStrategy crash', () => {
    // initSort → sortComparator strategy lookup also reads this._ovk during construction.
    let thrown: unknown;
    try {
      const grid = new OpenGrid(makeContainer(), {
        columns,
        height: 400,
        defaultSort: [{ field: 'salary', dir: 'asc' }],
      });
      grid.setData([...sampleData]);
      grid.destroy();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeUndefined();
    if (thrown instanceof Error) expect(thrown.message).not.toMatch(GETSTRATEGY_CRASH);
  });
});
