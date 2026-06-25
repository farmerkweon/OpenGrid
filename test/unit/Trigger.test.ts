import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid';

// jsdom 환경에 없는 ResizeObserver mock
beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe()   {}
    unobserve() {}
    disconnect(){}
  };
});

function makeGrid(container = document.createElement('div')) {
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
  });
}

const sampleData = [
  { name: '홍길동', dept: '개발팀', salary: 5000000 },
  { name: '김철수', dept: '마케팅팀', salary: 4200000 },
  { name: '이영희', dept: '인사팀', salary: 3800000 },
];

// ── 1. before 트리거 — 작업 중단 ─────────────────────────────
describe('before 트리거 — cancel()로 작업 중단', () => {
  it('before:setData 에서 cancel() 시 데이터가 변경되지 않는다', () => {
    const grid = makeGrid();
    grid.setData(sampleData);

    grid.addTrigger('before:setData', ctx => {
      ctx.cancel(); // 항상 차단
    });

    grid.setData([{ name: '차단된데이터', dept: 'X', salary: 0 }]);
    expect(grid.getData()).toHaveLength(3); // 원본 유지
  });

  it('before:insertRow 에서 조건부 cancel() — 필수 필드 검증', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    grid.addTrigger('before:insertRow', ctx => {
      const item = ctx.args[0] as any;
      if (!item?.name || item.name.trim() === '') ctx.cancel();
    });

    grid.insertRow({ name: '', dept: '개발팀', salary: 0 }); // 취소
    expect(grid.getData()).toHaveLength(3);

    grid.insertRow({ name: '박민수', dept: '개발팀', salary: 3500000 }); // 통과
    expect(grid.getData()).toHaveLength(4);
  });

  it('before:deleteRow 에서 cancel() 시 행이 삭제되지 않는다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    grid.addTrigger('before:deleteRow', ctx => {
      ctx.cancel(); // 삭제 차단
    });

    grid.deleteRow(0);
    expect(grid.getData()).toHaveLength(3); // 삭제되지 않음
  });

  it('before:writeCell 에서 조건부 cancel() — 읽기전용 필드 보호', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    // dept 필드는 변경 불가
    grid.addTrigger('before:writeCell', ctx => {
      if (ctx.args[1] === 'dept') ctx.cancel();
    });

    const original = grid.getData()[0]!.dept;
    grid.writeCell(0, 'dept', '변경시도');
    expect(grid.getData()[0]!.dept).toBe(original); // 변경되지 않음

    grid.writeCell(0, 'name', '변경된이름'); // name은 허용
    expect(grid.getData()[0]!.name).toBe('변경된이름');
  });

  it('before:orderBy 에서 cancel() 시 정렬이 적용되지 않는다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    grid.addTrigger('before:orderBy', ctx => ctx.cancel());

    grid.orderBy('name', 'asc');
    // 정렬이 적용되지 않았으므로 첫 번째 행은 '홍길동' 그대로
    expect(grid.getData()[0]!.name).toBe('홍길동');
  });
});

// ── 2. after 트리거 — 결과 수신 ──────────────────────────────
describe('after 트리거 — 작업 완료 후 결과 수신', () => {
  it('after:setData 에서 ctx.result에 행 수가 담긴다', () => {
    const grid = makeGrid();
    let capturedResult: any;

    grid.addTrigger('after:setData', ctx => {
      capturedResult = ctx.result;
    });

    grid.setData(sampleData);
    expect(capturedResult).toBe(3);
  });

  it('after:insertRow 에서 ctx.result에 삽입 정보가 담긴다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    let capturedResult: any;

    grid.addTrigger('after:insertRow', ctx => {
      capturedResult = ctx.result;
    });

    grid.insertRow({ name: '신규', dept: '개발팀', salary: 3000000 });
    expect(capturedResult?.rowCount).toBe(4);
    expect(capturedResult?.item?.name).toBe('신규');
  });

  it('after:deleteRow 에서 ctx.result에 삭제 정보가 담긴다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    let capturedResult: any;

    grid.addTrigger('after:deleteRow', ctx => {
      capturedResult = ctx.result;
    });

    grid.deleteRow(0);
    expect(capturedResult?.deleted).toBe(1);
    expect(capturedResult?.rowCount).toBe(2);
  });

  it('after:writeCell 에서 oldValue/newValue가 담긴다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    let capturedResult: any;

    grid.addTrigger('after:writeCell', ctx => {
      capturedResult = ctx.result;
    });

    grid.writeCell(0, 'name', '변경된이름');
    expect(capturedResult?.oldValue).toBe('홍길동');
    expect(capturedResult?.newValue).toBe('변경된이름');
    expect(capturedResult?.field).toBe('name');
  });
});

// ── 3. complete 트리거 — 공통 핸들러 ─────────────────────────
describe('complete 트리거 — 모든 작업 후 공통 발화', () => {
  it('setData 완료 후 complete가 발화된다', () => {
    const grid = makeGrid();
    const handler = vi.fn();
    grid.addTrigger('complete', handler);
    grid.setData(sampleData);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].operation).toBe('setData');
  });

  it('insertRow, deleteRow, writeCell 모두 complete를 발화한다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    const ops: string[] = [];
    grid.addTrigger('complete', ctx => ops.push(ctx.operation));

    grid.insertRow({ name: '신규', dept: '개발팀' });
    grid.writeCell(0, 'name', '수정');
    grid.deleteRow(1);

    expect(ops).toEqual(['insertRow', 'writeCell', 'deleteRow']);
  });

  it('before 취소 시 complete가 발화되지 않는다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    const complete = vi.fn();
    grid.addTrigger('complete', complete);
    grid.addTrigger('before:insertRow', ctx => ctx.cancel());

    grid.insertRow({ name: '차단', dept: 'X' });
    expect(complete).not.toHaveBeenCalled();
  });
});

// ── 4. 트리거 관리 API ────────────────────────────────────────
describe('addTrigger / removeTrigger / clearTriggers', () => {
  it('removeTrigger로 특정 핸들러를 제거한다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    let callCount = 0;
    const handler = () => { callCount++; };

    grid.addTrigger('after:insertRow', handler);
    grid.insertRow({ name: 'A' });
    expect(callCount).toBe(1);

    grid.removeTrigger('after:insertRow', handler);
    grid.insertRow({ name: 'B' });
    expect(callCount).toBe(1); // 제거 후 발화 안 됨
  });

  it('clearTriggers()로 모든 트리거를 초기화한다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    let blocked = false;
    grid.addTrigger('before:insertRow', ctx => { blocked = true; ctx.cancel(); });
    grid.clearTriggers();

    grid.insertRow({ name: '통과' });
    expect(blocked).toBe(false);
    expect(grid.getData()).toHaveLength(4);
  });

  it('clearTriggers(event)로 특정 이벤트만 초기화한다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);

    let afterFired  = false;
    let beforeFired = false;

    grid.addTrigger('before:insertRow', () => { beforeFired = true; });
    grid.addTrigger('after:insertRow',  () => { afterFired  = true; });

    grid.clearTriggers('before:insertRow');
    grid.insertRow({ name: '테스트' });

    expect(beforeFired).toBe(false); // 제거됨
    expect(afterFired).toBe(true);   // 유지됨
  });

  it('addTrigger는 체이닝이 가능하다', () => {
    const grid = makeGrid();
    const result = grid
      .addTrigger('before:setData', () => {})
      .addTrigger('after:setData',  () => {})
      .clearTriggers();
    expect(result).toBe(grid);
  });
});

// ── 5. before 취소 시 ctx 상태 ───────────────────────────────
describe('TriggerContext 상태', () => {
  it('before 트리거에서 삭제 대상 행 데이터가 ctx.extra에 담긴다', () => {
    const grid = makeGrid();
    grid.setData([...sampleData]);
    let capturedExtra: any;

    grid.addTrigger('before:deleteRow', ctx => {
      capturedExtra = ctx.extra;
    });

    grid.deleteRow(0);
    expect(capturedExtra?.rows[0]?.name).toBe('홍길동');
  });

  it('ctx.timestamp는 숫자다', () => {
    const grid = makeGrid();
    let ts: number | undefined;
    grid.addTrigger('before:setData', ctx => { ts = ctx.timestamp; });
    grid.setData(sampleData);
    expect(typeof ts).toBe('number');
    expect(ts!).toBeGreaterThan(0);
  });
});
