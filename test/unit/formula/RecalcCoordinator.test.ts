// ============================================================
// RecalcCoordinator 통합 유닛테스트 — §5.3 배치 진입점 C2, §3.5 삭제/정렬/필터 dirty(P0),
// §8.2 offsetFormula(C3), §5.6 증분 재계산 정확성(F3-R21 재작성 AC), §5.5 헤드리스 정확성
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { OGDecimal } from '../../../src/core/OGDecimal.js';
import { RecalcCoordinator } from '../../../src/core/formula/RecalcCoordinator.js';
import { cellKey, type CellValue, type FormulaErrorCode } from '../../../src/core/formula/types.js';
import { MockGridAccessor } from './testAccessor.js';

function makeCoordinator(g: MockGridAccessor) {
  const computed = new Map<string, CellValue>();
  const errors: Array<{ rowId: string; field: string; error: FormulaErrorCode }> = [];
  const coord = new RecalcCoordinator({
    accessor: g,
    setComputedValue: (rowId, field, value) => {
      computed.set(cellKey(rowId, field), value);
      g.setValue(rowId, field, value); // 계산값도 grid 에 반영(다음 참조가 최신값 읽도록)
    },
    onFormulaError: (rowId, field, error) => errors.push({ rowId, field, error }),
  });
  return { coord, computed, errors };
}

function num(v: CellValue): string {
  return v instanceof OGDecimal ? v.toString() : String(v);
}

// ── f3.eval.basic 통합 + getCellFormula(F3-R01/R09) ─────────
describe('RecalcCoordinator — setCellFormula/getCellFormula(F3-R01/R09/R11)', () => {
  it('=1+2 저장→즉시 계산, 원문 보존', () => {
    const g = new MockGridAccessor();
    g.addColumn('x'); g.addRow('r1', {});
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r1', 'x', '=1+2');
    expect(num(computed.get(cellKey('r1', 'x')))).toBe('3');
    expect(coord.getCellFormula('r1', 'x')).toBe('=1+2');
    expect(coord.hasCellFormula('r1', 'x')).toBe(true);
  });

  it('clearCellFormula 는 사이드카/그래프에서 제거하고 dependents 를 반환한다', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('c');
    g.addRow('r1', { a: 5 });
    const { coord } = makeCoordinator(g);
    coord.setCellFormula('r1', 'b', '=[a]*2');   // b 는 a 에 의존
    coord.setCellFormula('r1', 'c', '=[b]+1');   // c 는 b 에 의존 → clearCellFormula('b') 의 dependents 대상
    expect(coord.hasCellFormula('r1', 'b')).toBe(true);

    const depsOfB = coord.clearCellFormula('r1', 'b'); // b 를 참조하는 수식(c)이 반환되어야 함
    expect(depsOfB).toEqual([cellKey('r1', 'c')]);
    expect(coord.hasCellFormula('r1', 'b')).toBe(false);

    const depsOfC = coord.clearCellFormula('r1', 'c'); // c 를 참조하는 수식은 없음
    expect(depsOfC).toEqual([]);
    expect(coord.hasCellFormula('r1', 'c')).toBe(false);
  });
});

// ── f3.cycle.detect (F3-R12) ─────────────────────────────────
describe('RecalcCoordinator — 사이클(F3-R12)', () => {
  it('A1=B1, B1=A1 → 둘 다 #CYCLE, 크래시 없음', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b');
    g.addRow('r1', {});
    const { coord, computed, errors } = makeCoordinator(g);
    coord.setCellFormula('r1', 'a', '=B1');
    coord.setCellFormula('r1', 'b', '=A1');
    expect(computed.get(cellKey('r1', 'a'))).toBe('#CYCLE');
    expect(computed.get(cellKey('r1', 'b'))).toBe('#CYCLE');
    expect(errors.some((e) => e.error === '#CYCLE')).toBe(true);
  });
});

// ── f3.ref.deleteref (F3-R13/R28 P0) — 전체 파이프라인 ───────
describe('RecalcCoordinator — 삭제 무효화 #REF(F3-R13/R28 P0)', () => {
  it('참조 대상 행 삭제 → 종속 수식 #REF (조용한 값 대체 없음)', () => {
    const g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', { a: 10 });
    g.addRow('r2', {});
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r2', 'total', '=A1'); // A1 → flat0 → r1
    expect(num(computed.get(cellKey('r2', 'total')))).toBe('10');

    g.deleteRow('r1'); // 그리드에서 먼저 제거(실제 배선에서 removeRow 가 하는 일)
    const summary = coord.invalidateRow('r1');

    expect(coord.getCellError('r2', 'total')).toBe('#REF');
    expect(computed.get(cellKey('r2', 'total'))).toBe('#REF');
    expect(summary.changed).toContain(cellKey('r2', 'total'));
  });

  it('참조 대상 열 삭제 → 종속 수식 #REF', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b');
    g.addRow('r1', { a: 10 });
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r1', 'b', '=[a]*2');
    expect(num(computed.get(cellKey('r1', 'b')))).toBe('20');

    g.removeColumn('a');
    coord.invalidateField('a');

    expect(coord.getCellError('r1', 'b')).toBe('#REF');
  });
});

// ── f3.range.dirtyonsort (MCCONNELL-03 P0) ──────────────────
describe('RecalcCoordinator — 정렬/필터 후 범위 재해소(F3-R13 범위/§3.5 P0)', () => {
  let g: MockGridAccessor;
  beforeEach(() => {
    g = new MockGridAccessor();
    g.addColumn('a');
    g.addRow('r1', { a: 10 });
    g.addRow('r2', { a: 20 });
    g.addRow('r3', { a: 30 });
  });

  it('필터로 멤버가 빠지면 SUM 이 표시행만 다시 합산(1 recalc)', () => {
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r1', 'total', '=SUM(A1:A3)');
    expect(num(computed.get(cellKey('r1', 'total')))).toBe('60');

    g.filterTo(new Set(['r1', 'r3'])); // r2 필터아웃
    const summary = coord.recalcRangeBearing();

    expect(num(computed.get(cellKey('r1', 'total')))).toBe('40'); // 10+30
    expect(summary.changed).toContain(cellKey('r1', 'total'));
  });

  it('정렬로 순서가 바뀌어도 멤버 집합이 같으면 SUM 값은 불변이나 재계산은 1회 수행된다', () => {
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r1', 'total', '=SUM(A1:A3)');
    g.setDisplayOrder(['r3', 'r2', 'r1']); // 역순 정렬
    const summary = coord.recalcRangeBearing();
    expect(num(computed.get(cellKey('r1', 'total')))).toBe('60');
    expect(summary.changed).toContain(cellKey('r1', 'total'));
  });

  it('단일 절대참조는 정렬로 값이 흔들리지 않는다(F3-R27 행동요구 — 동일 논리 레코드)', () => {
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r2', 'echo', '=$A$1'); // 커밋 시점 flat0=r1(a=10) 에 stable 앵커
    expect(num(computed.get(cellKey('r2', 'echo')))).toBe('10');
    g.setDisplayOrder(['r3', 'r1', 'r2']); // r1 이 자리를 옮겨도
    coord.onValuesChanged([cellKey('r2', 'echo')]); // 재계산해도(값 자체는 안 흔들림 확인용)
    expect(num(computed.get(cellKey('r2', 'echo')))).toBe('10'); // 여전히 r1(=10) 을 가리킴
  });
});

// ── f3.perf.closure (F3-R21 재작성 AC — 정확히 k개만 evaluate) ─
describe('RecalcCoordinator — 증분 재계산 정확성(F3-R21, f3.perf.closure)', () => {
  it('독립 수식 V개 중 1개 leaf 편집 → 정확히 그 1개 종속만 재계산(V-1 미변경)', () => {
    const g = new MockGridAccessor();
    g.addColumn('val'); g.addColumn('doubled');
    const V = 300;
    for (let i = 0; i < V; i++) g.addRow(`r${i}`, { val: i });
    const { coord, computed } = makeCoordinator(g);
    for (let i = 0; i < V; i++) coord.setCellFormula(`r${i}`, 'doubled', '=[val]*2');

    for (const [, v] of computed) expect(v).toBeDefined();
    computed.clear();

    // r150 의 leaf 'val' 이 바뀌었다고 통지 — 오직 r150.doubled 만 재계산되어야 함.
    g.setValue('r150', 'val', 999);
    const summary = coord.onValuesChanged([cellKey('r150', 'val')]);

    expect(summary.changed).toEqual([cellKey('r150', 'doubled')]); // 정확히 k=1
    expect(num(computed.get(cellKey('r150', 'doubled')))).toBe('1998');
    expect(computed.size).toBe(1); // 나머지 V-1 은 setComputedValue 호출조차 안 됨(미변경)
  });

  it('공통 leaf 를 N개 수식이 참조(worst-fanout) → 그 leaf 편집 시 N개 전부 재계산', () => {
    const g = new MockGridAccessor();
    g.addColumn('shared'); g.addColumn('out');
    g.addRow('root', { shared: 1 });
    const N = 200;
    for (let i = 0; i < N; i++) g.addRow(`r${i}`, {});
    const { coord, computed } = makeCoordinator(g);
    for (let i = 0; i < N; i++) coord.setCellFormula(`r${i}`, 'out', '=$A$1*2'); // root 는 flat0, A=shared
    computed.clear();

    g.setValue('root', 'shared', 5);
    const summary = coord.onValuesChanged([cellKey('root', 'shared')]);

    expect(summary.changed.length).toBe(N);
    expect(computed.size).toBe(N);
    expect(num(computed.get(cellKey('r0', 'out')))).toBe('10');
  });
});

// ── f3.headless.offscreen (§5.5 렌더 비결합) ─────────────────
describe('RecalcCoordinator — 헤드리스 정확성(F3-R10/R23, 렌더 비결합)', () => {
  it('멀리 떨어진(먼 flat 인덱스) 종속 셀도 즉시 정확한 값을 가진다(뷰포트 개념 자체가 없음)', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('far');
    g.addRow('r0', { a: 1 });
    for (let i = 1; i < 500; i++) g.addRow(`r${i}`, {});
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r499', 'far', '=$A$1*100'); // 맨 끝 행이 맨 앞 행을 참조

    g.setValue('r0', 'a', 7);
    coord.onValuesChanged([cellKey('r0', 'a')]);

    expect(num(computed.get(cellKey('r499', 'far')))).toBe('700');
  });
});

// ── offsetFormula (C3/F1 fill, $ 고정 vs 상대 오프셋) ────────
describe('RecalcCoordinator — offsetFormula(C3, $ 고정/상대 오프셋)', () => {
  let g: MockGridAccessor;
  beforeEach(() => {
    g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('c');
    for (let i = 1; i <= 5; i++) g.addRow(`r${i}`, { a: i, b: i * 10, c: i * 100 });
  });

  it('행 오프셋 — $ 없는 참조만 이동, $A$1 은 불변', () => {
    const { coord } = makeCoordinator(g);
    coord.setCellFormula('r2', 'total', '=$A$1+B2'); // $A$1=r1.a 고정, B2=상대(현재는 r2.b)
    const offset = coord.offsetFormula('r2', 'total', 1, 0); // 아래로 1행 채우기
    expect(offset).toBe('=($A$1+B3)'); // B2→B3 로 이동, $A$1 불변
  });

  it('열 오프셋 — $ 없는 열만 이동', () => {
    const { coord } = makeCoordinator(g);
    coord.setCellFormula('r2', 'total', '=$A$1+B2');
    const offset = coord.offsetFormula('r2', 'total', 0, 1); // 오른쪽으로 1열
    expect(offset).toBe('=($A$1+C2)'); // B(비-$)→C 로 이동
  });

  it('범위를 벗어나는 오프셋은 #REF! 로 대체(깨진 참조 명시)', () => {
    const { coord } = makeCoordinator(g);
    coord.setCellFormula('r5', 'total', '=B5'); // 상대참조, 마지막 행
    const offset = coord.offsetFormula('r5', 'total', 1, 0); // 그리드 밖으로
    expect(offset).toBe('=#REF!');
  });

  it('완전 절대참조($A$1)만 있으면 오프셋해도 원문과 동일', () => {
    const { coord } = makeCoordinator(g);
    coord.setCellFormula('r2', 'total', '=$A$1');
    expect(coord.offsetFormula('r2', 'total', 3, 2)).toBe('=$A$1');
  });
});

// ── recalculateAll (전체 재계산, §5.6) ───────────────────────
describe('RecalcCoordinator — recalculateAll(전체 위상 재계산)', () => {
  it('등록된 모든 수식을 위상 순서대로 재계산', () => {
    const g = new MockGridAccessor();
    g.addColumn('a'); g.addColumn('b'); g.addColumn('c');
    g.addRow('r1', { a: 5 });
    const { coord, computed } = makeCoordinator(g);
    coord.setCellFormula('r1', 'b', '=[a]*2');
    coord.setCellFormula('r1', 'c', '=[b]+1'); // b 는 아직 grid 반영 안 됐을 수 있으나 setComputedValue 콜백이 grid 에 반영
    computed.clear();
    const summary = coord.recalculateAll();
    expect(summary.cycles).toBe(0);
    expect(num(computed.get(cellKey('r1', 'b')))).toBe('10');
    expect(num(computed.get(cellKey('r1', 'c')))).toBe('11');
  });
});
